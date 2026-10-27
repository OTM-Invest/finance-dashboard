import { describe, expect, it, vi } from "vitest";

import { nameScore, suggestEmployee } from "./advisors";
import { fromRpc, revenueByAdvisor, revenueByArea, revenueTotals } from "./breakdown";
import {
  CrmError,
  fetchCommission,
  monthsBetween,
  rpcAll,
  type CrmConfig,
  type Fetch,
} from "./client";
import { checkReports, sumToCents, toCents, toScaled } from "./conference";
import { ContractError, parseLines, parseReports } from "./contract";
import { linesResponse, REPORT_IDS, reportsResponse } from "./fixtures";
import { suggestStatements, type MatchReport } from "./match";

describe("conferência em decimal exato", () => {
  it("lê o número pelo texto, sem multiplicar em ponto flutuante", () => {
    expect(toScaled(1.005)).toBe(10_050_000_000n);
    expect(toScaled("-0.335")).toBe(-3_350_000_000n);
    expect(toScaled(1e-7)).toBe(1000n);
    expect(toScaled("1.5e3")).toBe(15_000_000_000_000n);
  });

  it("arredonda meio centavo para longe do zero, como o round do Postgres", () => {
    expect(toCents(1.005)).toBe(101);
    expect(toCents(-1.005)).toBe(-101);
    expect(toCents(0.004)).toBe(0);
  });

  it("soma primeiro e arredonda no fim", () => {
    // Linha a linha daria 0,34 × 3 = 1,02; o total certo é 1,01.
    expect(sumToCents([0.335, 0.335, 0.335])).toBe(101);
  });

  it("confere cada relatório contra as linhas dele", () => {
    const { checks, orphanReportIds } = checkReports(
      parseReports(reportsResponse),
      parseLines(linesResponse),
    );
    expect(orphanReportIds).toEqual([]);
    expect(checks.map((c) => [c.fileKey, c.ok])).toEqual([
      ["pj1-conta-a", true],
      ["pj1-conta-b", true],
      ["finder-jul-ago", true],
    ]);
  });

  it("acusa relatório que não fecha e linha sem relatório", () => {
    const reports = parseReports(reportsResponse).map((r) =>
      r.id === REPORT_IDS.PJ1_B ? { ...r, totalCommission: 50.01 } : r,
    );
    const lines = parseLines([
      ...linesResponse,
      { ...linesResponse[0], report_id: "22222222-0000-4000-8000-000000000009" },
    ]);
    const { checks, orphanReportIds } = checkReports(reports, lines);
    expect(checks.find((c) => c.reportId === REPORT_IDS.PJ1_B)).toMatchObject({
      ok: false,
      totalCents: 5001,
      linesCents: 5000,
    });
    expect(orphanReportIds).toEqual(["22222222-0000-4000-8000-000000000009"]);
  });
});

describe("contrato do CRM", () => {
  it("lê relatórios e linhas no formato do PostgREST", () => {
    const reports = parseReports(reportsResponse);
    expect(reports[2]).toMatchObject({
      kind: "finder",
      referenceMonth: "2026-07-01",
      periodEnd: "2026-08-31",
      fileName: null,
    });
    const lines = parseLines(linesResponse);
    expect(lines[1]).toMatchObject({ advisorCode: "57253873", commission: -100.004 });
  });

  it("falha alto, com o caminho, quando o formato muda", () => {
    expect(() => parseReports([{ ...reportsResponse[0], kind: "pj3" }])).toThrow(ContractError);
    expect(() => parseReports([{ ...reportsResponse[0], reference_month: "2026-09-15" }])).toThrow(
      /reports\[0\]\.reference_month/,
    );
    expect(() => parseLines([{ ...linesResponse[0], commission: "NaN" }])).toThrow(
      /lines\[0\]\.commission/,
    );
    expect(() => parseLines({ lines: [] })).toThrow(/não é uma lista/);
  });

  it("aceita numeric como texto", () => {
    expect(parseLines([{ ...linesResponse[0], commission: "1200.004" }])[0].commission).toBe(
      1200.004,
    );
  });
});

const config: CrmConfig = {
  url: "https://crm.example",
  anonKey: "anon",
  email: "servico@crm",
  password: "segredo",
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
}

describe("meses da janela", () => {
  it("lista os meses inclusive, virando o ano", () => {
    expect(monthsBetween("2025-11-01", "2026-02-01")).toEqual([
      "2025-11-01",
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
    ]);
    expect(monthsBetween("2026-09-01", "2026-09-01")).toEqual(["2026-09-01"]);
    expect(monthsBetween("2026-10-01", "2026-09-01")).toEqual([]);
  });
});

describe("cliente do CRM", () => {
  it("pagina até o fim e confere o total anunciado", async () => {
    const all = Array.from({ length: 5 }, (_, i) => ({ i }));
    const fetchFn = vi.fn<Fetch>(async (url) => {
      const offset = Number(new URL(url).searchParams.get("offset"));
      const page = all.slice(offset, offset + 2);
      return jsonResponse(page, {
        headers: { "content-range": `${offset}-${offset + page.length - 1}/5` },
      });
    });
    const rows = await rpcAll(fetchFn, config, "jwt", "f", {}, "i", 2);
    expect(rows).toHaveLength(5);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    const [, init] = fetchFn.mock.calls[0];
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer jwt");
  });

  it("segue o total anunciado quando o max_rows devolve menos que a página", async () => {
    const all = Array.from({ length: 7 }, (_, i) => ({ i }));
    const fetchFn: Fetch = async (url) => {
      const offset = Number(new URL(url).searchParams.get("offset"));
      const page = all.slice(offset, offset + 3);
      return jsonResponse(page, { headers: { "content-range": `${offset}-${offset + 2}/7` } });
    };
    expect(await rpcAll(fetchFn, config, "jwt", "f", {}, "i", 1000)).toHaveLength(7);
  });

  it("recusa leitura que termina antes do total anunciado", async () => {
    const fetchFn: Fetch = async (url) => {
      const offset = Number(new URL(url).searchParams.get("offset"));
      return jsonResponse(offset === 0 ? [{ i: 1 }] : [], {
        headers: { "content-range": "0-0/3" },
      });
    };
    await expect(rpcAll(fetchFn, config, "jwt", "f", {}, "i", 2)).rejects.toThrow(
      /li 1 linhas, o CRM anunciou 3/,
    );
  });

  it("traduz o 42501 para a chave que falta no perfil", async () => {
    const fetchFn: Fetch = async () =>
      jsonResponse({ code: "42501", message: "permission denied" }, { status: 403 });
    await expect(rpcAll(fetchFn, config, "jwt", "f", {}, "i")).rejects.toThrow(
      /não tem a chave financeiro\.receita_btg/,
    );
  });

  /** CRM falso: o detalhe respeita o mês pedido, como a RPC de verdade. */
  function fakeCrm() {
    return vi.fn<Fetch>(async (url, init) => {
      if (url.includes("/auth/v1/token")) return jsonResponse({ access_token: "jwt-servico" });
      const args = JSON.parse(String(init?.body)) as { p_from: string; p_to: string };
      const body = url.includes("finance_commission_report_lines")
        ? linesResponse.filter(
            (l) => l.reference_month >= args.p_from && l.reference_month <= args.p_to,
          )
        : reportsResponse;
      return jsonResponse(body, {
        headers: { "content-range": `0-${body.length - 1}/${body.length}` },
      });
    });
  }

  it("faz login com o usuário de serviço e lê as duas RPCs", async () => {
    const fetchFn = fakeCrm();
    const { reports, lines } = await fetchCommission(fetchFn, config, "2026-07-01", "2026-09-01");
    expect(reports).toHaveLength(3);
    expect(lines).toHaveLength(8);
    const login = fetchFn.mock.calls[0];
    expect(JSON.parse(String(login[1]?.body))).toEqual({
      email: "servico@crm",
      password: "segredo",
    });
  });

  it("pede o detalhe um mês por chamada, e a lista de relatórios de uma vez", async () => {
    const fetchFn = fakeCrm();
    await fetchCommission(fetchFn, config, "2026-07-01", "2026-09-01");
    const calls = fetchFn.mock.calls
      .filter(([url]) => url.includes("/rest/v1/rpc/"))
      .map(([url, init]) => [
        new URL(url).pathname.split("/").pop(),
        JSON.parse(String(init?.body)),
      ]);
    expect(calls).toEqual([
      ["finance_commission_report", { p_from: "2026-07-01", p_to: "2026-09-01" }],
      ["finance_commission_report_lines", { p_from: "2026-07-01", p_to: "2026-07-01" }],
      ["finance_commission_report_lines", { p_from: "2026-08-01", p_to: "2026-08-01" }],
      ["finance_commission_report_lines", { p_from: "2026-09-01", p_to: "2026-09-01" }],
    ]);
  });

  it("um mês que falha derruba a leitura inteira", async () => {
    const ok = fakeCrm();
    const fetchFn: Fetch = async (url, init) => {
      const args = init?.body ? (JSON.parse(String(init.body)) as { p_from?: string }) : {};
      if (url.includes("_lines") && args.p_from === "2026-08-01") {
        return jsonResponse(
          { code: "57014", message: "canceling statement due to statement timeout" },
          { status: 500 },
        );
      }
      return ok(url, init);
    };
    await expect(fetchCommission(fetchFn, config, "2026-07-01", "2026-09-01")).rejects.toThrow(
      /statement timeout \(57014\)/,
    );
  });

  it("login recusado não ecoa a senha", async () => {
    const fetchFn: Fetch = async () =>
      jsonResponse({ error_description: "Invalid login credentials" }, { status: 400 });
    const error = await fetchCommission(fetchFn, config, "2026-07-01", "2026-09-01").catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(CrmError);
    expect(String((error as Error).message)).not.toContain("segredo");
  });
});

describe("sugestão de casamento lançamento ↔ relatórios", () => {
  const assessoria = "c-assessoria";
  const corretora = "c-corretora";
  const reports: MatchReport[] = [
    {
      id: "a",
      companyId: assessoria,
      kind: "pj1",
      referenceMonth: "2026-09-01",
      periodStart: null,
      periodEnd: null,
      totalCents: 110101,
    },
    {
      id: "b",
      companyId: assessoria,
      kind: "pj1",
      referenceMonth: "2026-09-01",
      periodStart: null,
      periodEnd: null,
      totalCents: 5000,
    },
    {
      id: "c",
      companyId: corretora,
      kind: "pj2",
      referenceMonth: "2026-09-01",
      periodStart: null,
      periodEnd: null,
      totalCents: 3284523,
    },
    {
      id: "d",
      companyId: corretora,
      kind: "finder",
      referenceMonth: "2026-07-01",
      periodStart: "2026-07-01",
      periodEnd: "2026-08-31",
      totalCents: 30050,
    },
  ];

  it("um mês de PJ1 em dois arquivos abre um lançamento só", () => {
    const [pj1] = suggestStatements(reports, [
      { id: "tx-pj1", companyId: assessoria, accrualDate: "2026-09-01", amountCents: 115101 },
    ]).filter((s) => s.kind === "pj1");
    expect(pj1.reportIds).toEqual(["a", "b"]);
    expect(pj1.suggestedTransactionId).toBe("tx-pj1");
    expect(pj1.candidates[0].differenceCents).toBe(0);
  });

  it("finder de dois meses casa com lançamento de qualquer mês coberto", () => {
    const finder = suggestStatements(reports, [
      { id: "tx-finder", companyId: corretora, accrualDate: "2026-08-01", amountCents: 30050 },
    ]).find((s) => s.kind === "finder");
    expect(finder?.suggestedTransactionId).toBe("tx-finder");
  });

  it("cada lançamento vai para o grupo que ele explica melhor", () => {
    const suggestions = suggestStatements(reports, [
      { id: "tx-pj2", companyId: corretora, accrualDate: "2026-09-01", amountCents: 3284523 },
      { id: "tx-outro", companyId: corretora, accrualDate: "2026-09-01", amountCents: 30000 },
    ]);
    expect(suggestions.find((s) => s.kind === "pj2")?.suggestedTransactionId).toBe("tx-pj2");
    // Mês do finder não é setembro: não sugere o lançamento de setembro.
    expect(suggestions.find((s) => s.kind === "finder")?.suggestedTransactionId).toBeNull();
  });

  it("não sugere lançamento de outra empresa nem de valor muito distante", () => {
    const [pj1] = suggestStatements(reports, [
      { id: "tx-corretora", companyId: corretora, accrualDate: "2026-09-01", amountCents: 115101 },
      { id: "tx-longe", companyId: assessoria, accrualDate: "2026-09-01", amountCents: 200000 },
    ]).filter((s) => s.kind === "pj1");
    expect(pj1.suggestedTransactionId).toBeNull();
  });

  it("resíduo pequeno ainda é sugerido, com a diferença à vista", () => {
    const [pj1] = suggestStatements(reports, [
      { id: "tx", companyId: assessoria, accrualDate: "2026-09-01", amountCents: 115101 - 1466 },
    ]).filter((s) => s.kind === "pj1");
    expect(pj1.candidates[0]).toEqual({ transactionId: "tx", differenceCents: -1466 });
  });
});

describe("assessor → colaborador pelo nome (só sugestão)", () => {
  const employees = [
    { id: "marcio", fullName: "Marcio San Juan" },
    { id: "kaio", fullName: "Kaio Vinicius Candido Alves de Oliveira" },
    { id: "humberto", fullName: "Humberto Atalião Vilas Boas Correa Do Prado" },
    { id: "rafael", fullName: "Rafael Guiraldini Otero" },
    { id: "leandro", fullName: "Leandro Ghiraldini Otero" },
  ];

  it("tolera acento, símbolo e uma letra trocada", () => {
    expect(suggestEmployee("Marcio Roberto San Juam", employees)?.id).toBe("marcio");
    expect(suggestEmployee("Kaio Vinicius Candido A|lves", employees)?.id).toBe("kaio");
    expect(suggestEmployee("Humberto Ataliao Prado", employees)?.id).toBe("humberto");
  });

  it("primeiro nome diferente não casa, mesmo com sobrenome igual", () => {
    expect(nameScore("Rafael Guiraldini Otero", "Leandro Ghiraldini Otero")).toBe(0);
    expect(suggestEmployee("Rafael Guiraldini Otero", employees)?.id).toBe("rafael");
  });

  it("sem sobrenome em comum, ou empate, não sugere", () => {
    expect(suggestEmployee("Marcio Pereira", employees)).toBeNull();
    expect(
      suggestEmployee("Ana Souza", [
        { id: "1", fullName: "Ana Souza" },
        { id: "2", fullName: "Ana Lima Souza" },
      ]),
    ).toBeNull();
    expect(suggestEmployee(null, employees)).toBeNull();
  });
});

describe("receita por área e assessor", () => {
  const rows = fromRpc([
    {
      company_id: "c",
      management_account_id: "bolsa",
      cost_center_id: "bankers",
      advisor_code: "1",
      advisor_name: "A",
      employee_id: "e1",
      employee_name: "A",
      line_kind: "detail",
      amount: "1000.00",
      revenue: "2000",
      months: ["2026-09-01"],
    },
    {
      company_id: "c",
      management_account_id: "deducoes",
      cost_center_id: "bankers",
      advisor_code: "1",
      advisor_name: "A",
      employee_id: "e1",
      employee_name: "A",
      line_kind: "detail",
      amount: -100,
      revenue: 0,
      months: ["2026-09-01"],
    },
    {
      company_id: "c",
      management_account_id: "seguros",
      cost_center_id: null,
      advisor_code: "1056306",
      advisor_name: "Leandro",
      employee_id: null,
      employee_name: null,
      line_kind: "detail",
      amount: 50,
      revenue: 50,
      months: null,
    },
    {
      company_id: "c",
      management_account_id: "bolsa",
      cost_center_id: null,
      advisor_code: "777",
      advisor_name: "Sem cadastro",
      employee_id: null,
      employee_name: null,
      line_kind: "detail",
      amount: 30,
      revenue: 30,
      months: null,
    },
    {
      company_id: "c",
      management_account_id: "diferenca",
      cost_center_id: null,
      advisor_code: null,
      advisor_name: null,
      employee_id: null,
      employee_name: null,
      line_kind: "difference",
      amount: 20,
      revenue: null,
      months: null,
    },
  ]);

  it("total é o líquido de tudo, e mostra o que está sem área", () => {
    expect(revenueTotals(rows)).toEqual({
      total: 1000,
      withoutArea: 80,
      bucket: 50,
      difference: 20,
      coverage: 0.9,
    });
  });

  it("por área separa a diferença de 'sem área'", () => {
    expect(revenueByArea(rows).map((s) => [s.key, s.amount])).toEqual([
      ["bankers", 900],
      [null, 80],
      ["difference", 20],
    ]);
  });

  it("por assessor soma o líquido e marca o balde", () => {
    const advisors = revenueByAdvisor(rows);
    expect(advisors.map((a) => [a.advisorCode, a.amount, a.isBucket])).toEqual([
      ["1", 900, false],
      ["1056306", 50, true],
      ["777", 30, false],
    ]);
  });
});

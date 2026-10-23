import { describe, expect, it } from "vitest";

import { fakeDataSource } from "./fixtures.ts";
import { callTool, isFailure, listTools } from "./registry.ts";
import type { McpDataSource } from "./types.ts";

const COMPANY = "11111111-2222-3333-4444-555555555555";

describe("listTools", () => {
  it("anuncia o catálogo com schema de entrada", () => {
    const tools = listTools();
    // A lista é fixada de propósito: acrescentar tool ao catálogo é decisão
    // revisada, e um import solto não deve conseguir expor dado por acidente.
    // A ORDEM também é parte do contrato — é o roteiro que o cliente MCP mostra
    // ao modelo: descoberta primeiro, SQL livre por último.
    expect(tools.map((t) => t.name)).toEqual([
      "list_companies",
      "list_dimensions",
      "monthly_briefing",
      "get_dre",
      "compare_periods",
      "get_kpis",
      "expense_breakdown",
      "management_breakdown",
      "get_cashflow",
      "get_bank_balances",
      "get_account_ledger",
      "forecast_cashflow",
      "get_aging",
      "list_open_bills",
      "cost_center_analysis",
      "counterparty_analysis",
      "get_sales",
      "get_receivables_schedule",
      "list_tax_obligations",
      "nfse_status",
      "payroll_summary",
      "search_transactions",
      "sql_query",
    ]);
    for (const t of tools) {
      expect(t.inputSchema).toHaveProperty("type", "object");
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.title.length).toBeGreaterThan(0);
    }
  });

  it("não tem nome repetido", () => {
    const nomes = listTools().map((t) => t.name);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it("o SQL exploratório é o último do catálogo", () => {
    // Ordem é sinal para o modelo: a saída de emergência não pode aparecer antes
    // das tools revisadas, ou ela vira o primeiro recurso em vez do último.
    const nomes = listTools().map((t) => t.name);
    expect(nomes[nomes.length - 1]).toBe("sql_query");
  });

  it("nenhuma tool tem nome de escrita — a invariante número um do servidor", () => {
    const proibido = /^(create|update|delete|insert|set|post|mark|emit|approve|cancel|write)_/;
    for (const t of listTools()) {
      expect(t.name).not.toMatch(proibido);
    }
  });

  it("toda tool com escopo por empresa aceita company_id ou organization_id", () => {
    // Guarda contra a regressão mais provável do catálogo: tool nova que aceita
    // período mas esquece o escopo, e responde sobre "a empresa" que a RLS
    // devolver primeiro.
    const semEscopoPorDesenho = new Set([
      "list_companies",
      "get_account_ledger", // escopo é a conta bancária
      "get_sales", // escopo é a conta do pagar.me
      "sql_query", // escopo vem no próprio SQL
    ]);
    for (const t of listTools()) {
      if (semEscopoPorDesenho.has(t.name)) continue;
      const props = (t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(
        "company_id" in props || "organization_id" in props,
        `${t.name} não aceita escopo por empresa`,
      ).toBe(true);
    }
  });
});

describe("callTool", () => {
  it("lista empresas com o id da organização junto", async () => {
    const ds = fakeDataSource({
      query: {
        companies: [
          {
            id: COMPANY,
            organization_id: "org-1",
            legal_name: "OTM Assessoria LTDA",
            trade_name: "OTM Assessoria",
            cnpj: "12345678000199",
            tax_regime: "simples",
            is_holding: false,
            is_active: true,
          },
        ],
      },
    });
    const r = await callTool("list_companies", {}, ds);
    if (isFailure(r)) throw new Error(r.erro);
    expect(r.dados).toMatchObject({
      empresas: [{ company_id: COMPANY, nome: "OTM Assessoria" }],
      organization_ids: ["org-1"],
    });
  });

  it("filtra empresas inativas por padrão", async () => {
    const ds = fakeDataSource({ query: { companies: [] } });
    await callTool("list_companies", {}, ds);
    expect(ds.queries[0].filters).toEqual([{ column: "is_active", op: "eq", value: true }]);
  });

  it("devolve erro recuperável para tool inexistente", async () => {
    const r = await callTool("get_lucro", {}, fakeDataSource());
    expect(isFailure(r) && r.recuperavel).toBe(true);
    expect(isFailure(r) && r.erro).toMatch(/Disponíveis: list_companies/);
  });

  it("transforma erro de parâmetro em orientação, não em stack trace", async () => {
    const r = await callTool("get_dre", { from: "2026-07-01", to: "2026-07-31" }, fakeDataSource());
    expect(isFailure(r) && r.recuperavel).toBe(true);
    expect(isFailure(r) && r.erro).toMatch(/list_companies/);
  });

  it("marca falha de banco como NÃO recuperável", async () => {
    const quebrado: McpDataSource = {
      rpc: () => Promise.reject(new Error("statement timeout")),
      query: () => Promise.reject(new Error("statement timeout")),
    };
    const r = await callTool(
      "get_dre",
      { company_id: COMPANY, from: "2026-07-01", to: "2026-07-31" },
      quebrado,
    );
    expect(isFailure(r) && r.recuperavel).toBe(false);
    expect(isFailure(r) && r.erro).toMatch(/statement timeout/);
  });

  it("nunca deixa exceção vazar para o transporte", async () => {
    const explode: McpDataSource = {
      rpc: () => {
        throw new Error("boom");
      },
      query: () => {
        throw new Error("boom");
      },
    };
    await expect(
      callTool(
        "get_cashflow",
        { company_id: COMPANY, from: "2026-07-01", to: "2026-07-31" },
        explode,
      ),
    ).resolves.toBeDefined();
  });
});

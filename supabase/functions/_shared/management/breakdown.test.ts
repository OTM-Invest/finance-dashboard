import { describe, expect, it } from "vitest";

import {
  buildAreaBreakdown,
  buildPanorama,
  buildSubscriptions,
  coverageOf,
  longestMonthStreak,
  parseBreakdownRow,
  previousPeriod,
  summarizeVendors,
  totalSpend,
  trailingYear,
  type BreakdownRow,
  type PlanAccount,
} from "./breakdown.ts";

const RCO = "co-rco";
const JIMMY = "co-jimmy";

function row(partial: Partial<BreakdownRow>): BreakdownRow {
  return {
    companyId: RCO,
    managementAccountId: "ia",
    managementGroupId: "tec",
    areaId: null,
    nature: "opex",
    source: "card",
    requiresDetail: false,
    vendorKey: null,
    vendorName: null,
    currency: "BRL",
    outflow: 0,
    inflow: 0,
    amountUsd: null,
    iofAmount: 0,
    lineCount: 1,
    months: ["2026-09-01"],
    ...partial,
  };
}

const PLAN: PlanAccount[] = [
  { id: "tec", code: "tecnologia", name: "Tecnologia", parentId: null, sortOrder: 400 },
  { id: "ia", code: "tecnologia.ia", name: "IA", parentId: "tec", sortOrder: 401 },
  { id: "infra", code: "tecnologia.infra", name: "Infra", parentId: "tec", sortOrder: 402 },
  { id: "pes", code: "pessoas", name: "Pessoas", parentId: null, sortOrder: 300 },
  { id: "sal", code: "pessoas.salario_fixo", name: "Salário", parentId: "pes", sortOrder: 301 },
];

describe("parseBreakdownRow", () => {
  it("converte numeric em string e mantém nulos", () => {
    const r = parseBreakdownRow({
      company_id: RCO,
      management_account_id: "ia",
      management_group_id: null,
      cost_center_id: null,
      nature: "capex",
      source: "card",
      requires_detail: true,
      vendor_key: null,
      vendor_name: null,
      currency: "USD",
      outflow: "112.82",
      inflow: null,
      amount_usd: "20.00",
      iof_amount: "3.82",
      line_count: 2,
      months: null,
    });
    expect(r).toMatchObject({
      nature: "capex",
      outflow: 112.82,
      inflow: 0,
      amountUsd: 20,
      iofAmount: 3.82,
      months: [],
    });
  });

  it("natureza desconhecida vira nula", () => {
    const r = parseBreakdownRow({
      ...({} as never),
      company_id: RCO,
      management_account_id: "x",
      nature: "outra",
      source: "ledger",
      currency: "BRL",
      line_count: 1,
    });
    expect(r.nature).toBeNull();
    expect(r.amountUsd).toBeNull();
  });
});

describe("gasto e cobertura", () => {
  it("gasto é saída menos entrada — estorno reduz", () => {
    expect(totalSpend([row({ outflow: 100 }), row({ outflow: 30, inflow: 10 })])).toBe(120);
  });

  it("cobertura separa o que ainda está a detalhar e quanto disso é cartão", () => {
    const c = coverageOf([
      row({ outflow: 600 }),
      row({ outflow: 300, requiresDetail: true }),
      row({ outflow: 100, requiresDetail: true, source: "ledger" }),
    ]);
    expect(c).toEqual({ total: 1000, pending: 400, pendingCard: 300, confirmedPct: 60 });
  });

  it("sem gasto a cobertura é indefinida, não 100%", () => {
    expect(coverageOf([]).confirmedPct).toBeNull();
  });
});

describe("períodos", () => {
  it("mês fechado anda em meses", () => {
    expect(previousPeriod("2026-03-01", "2026-03-31")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });

  it("trimestre fechado volta um trimestre, atravessando o ano", () => {
    expect(previousPeriod("2026-01-01", "2026-03-31")).toEqual({
      from: "2025-10-01",
      to: "2025-12-31",
    });
  });

  it("intervalo solto anda em dias", () => {
    expect(previousPeriod("2026-03-10", "2026-03-19")).toEqual({
      from: "2026-02-28",
      to: "2026-03-09",
    });
  });

  it("janela de 12 meses termina no mês do fim", () => {
    expect(trailingYear("2026-09-15")).toEqual({ from: "2025-10-01", to: "2026-09-30" });
  });
});

describe("buildPanorama", () => {
  it("agrupa item no grupo, com anterior, variação, média 12m e participação", () => {
    const groups = buildPanorama({
      accounts: PLAN,
      current: [
        row({ managementAccountId: "ia", outflow: 300 }),
        row({ managementAccountId: "sal", managementGroupId: "pes", outflow: 700 }),
      ],
      previous: [row({ managementAccountId: "ia", outflow: 200 })],
      last12: [row({ managementAccountId: "ia", outflow: 2400 })],
    });

    // Ordem do plano: Pessoas (300) antes de Tecnologia (400).
    expect(groups.map((g) => g.name)).toEqual(["Pessoas", "Tecnologia"]);
    const tec = groups[1];
    expect(tec).toMatchObject({ current: 300, previous: 200, deltaPct: 50, sharePct: 30 });
    expect(tec.items[0]).toMatchObject({ name: "IA", monthlyAvg12: 200 });
  });

  it("variação sem base é indefinida", () => {
    const [g] = buildPanorama({
      accounts: PLAN,
      current: [row({ outflow: 10 })],
      previous: [],
      last12: [],
    });
    expect(g.deltaPct).toBeNull();
  });

  it("item que só existiu no ano aparece com zero no período", () => {
    const [g] = buildPanorama({
      accounts: PLAN,
      current: [],
      previous: [],
      last12: [row({ managementAccountId: "infra", outflow: 120 })],
    });
    expect(g.items[0]).toMatchObject({ name: "Infra", current: 0, monthlyAvg12: 10 });
  });

  it("item fora do plano não some — vai para Sem grupo", () => {
    const [g] = buildPanorama({
      accounts: PLAN,
      current: [row({ managementAccountId: "fantasma", outflow: 5 })],
      previous: [],
      last12: [],
    });
    expect(g.name).toBe("Sem grupo");
    expect(g.current).toBe(5);
  });
});

describe("buildAreaBreakdown", () => {
  it("soma opex e capex por área, maior primeiro", () => {
    const areas = buildAreaBreakdown([
      row({ areaId: "a1", outflow: 100 }),
      row({ areaId: "a1", outflow: 50, nature: "capex", managementGroupId: "eq" }),
      row({ areaId: "a2", outflow: 500 }),
      row({ areaId: null, outflow: 10 }),
    ]);
    expect(areas.map((a) => a.areaId)).toEqual(["a2", "a1", null]);
    expect(areas[1]).toMatchObject({ total: 150, opex: 100, capex: 50 });
    expect(areas[1].byGroup).toEqual([
      { groupId: "tec", total: 100 },
      { groupId: "eq", total: 50 },
    ]);
  });
});

describe("fornecedores", () => {
  it("sequência de meses seguidos", () => {
    expect(longestMonthStreak(["2026-01-01", "2026-02-01", "2026-04-01"])).toBe(2);
    expect(longestMonthStreak(["2025-12-01", "2026-01-01", "2026-02-01"])).toBe(3);
    expect(longestMonthStreak([])).toBe(0);
  });

  it("casa o fornecedor entre empresas e junta meses, USD e IOF", () => {
    const [v] = summarizeVendors([
      row({
        vendorKey: "ANTHROPIC",
        vendorName: "Anthropic",
        outflow: 112.82,
        amountUsd: 20,
        iofAmount: 3.82,
        months: ["2026-08-01", "2026-09-01"],
      }),
      row({ companyId: JIMMY, vendorKey: "ANTHROPIC", vendorName: "Anthropic", outflow: 100 }),
    ]);
    expect(v).toMatchObject({
      name: "Anthropic",
      total: 212.82,
      companyIds: [JIMMY, RCO],
      months: ["2026-08-01", "2026-09-01"],
      longestStreak: 2,
      usd: 20,
      iof: 3.82,
    });
  });

  it("linha sem fornecedor fica fora do ranking", () => {
    expect(summarizeVendors([row({ outflow: 10 })])).toEqual([]);
  });
});

describe("buildSubscriptions", () => {
  const anthropic = (p: Partial<BreakdownRow>) =>
    row({ vendorKey: "ANTHROPIC", vendorName: "Anthropic", ...p });

  it("marca recorrente, ativa, duplicada e em dólar", () => {
    const [s] = buildSubscriptions({
      current: [
        anthropic({ outflow: 56, amountUsd: 10 }),
        anthropic({ companyId: JIMMY, outflow: 100 }),
      ],
      previous: [anthropic({ outflow: 56 })],
      window: [anthropic({ outflow: 300, months: ["2026-07-01", "2026-08-01", "2026-09-01"] })],
      windowEnd: "2026-09-30",
    });
    expect(s).toMatchObject({
      recurring: true,
      active: true,
      duplicated: true,
      inUsd: true,
      isNew: false,
      rose: true,
      previous: 56,
    });
  });

  it("nova é quem não tinha gasto no período anterior", () => {
    const [s] = buildSubscriptions({
      current: [anthropic({ outflow: 50 })],
      previous: [],
      window: [anthropic({ outflow: 50 })],
      windowEnd: "2026-09-30",
    });
    expect(s).toMatchObject({ isNew: true, rose: false, recurring: false });
  });

  it("oscilação até 10% não é alta", () => {
    const [s] = buildSubscriptions({
      current: [anthropic({ outflow: 105 })],
      previous: [anthropic({ outflow: 100 })],
      window: [],
      windowEnd: "2026-09-30",
    });
    expect(s.rose).toBe(false);
  });

  it("parada há mais de um mês não é ativa", () => {
    const [s] = buildSubscriptions({
      current: [anthropic({ outflow: 10, months: ["2026-06-01"] })],
      previous: [],
      window: [anthropic({ outflow: 10, months: ["2026-05-01", "2026-06-01"] })],
      windowEnd: "2026-09-30",
    });
    expect(s).toMatchObject({ active: false, recurring: true });
  });

  it("estorno total no período tira o fornecedor da lista", () => {
    expect(
      buildSubscriptions({
        current: [anthropic({ outflow: 10, inflow: 10 })],
        previous: [],
        window: [],
        windowEnd: "2026-09-30",
      }),
    ).toEqual([]);
  });
});

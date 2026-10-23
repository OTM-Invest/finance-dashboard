import { describe, expect, it } from "vitest";

import {
  analyzeModel,
  buildBalanceMatrix,
  clauseMatches,
  evaluationOrder,
  lineMatches,
  monthAxis,
  monthOverMonth,
  UNCLASSIFIED_LABEL,
  type MonthlySeriesRow,
  type SeriesKey,
} from "./compute";
import { emptyClause, type BalanceClause, type BalanceLine, type FilterLine } from "./schema";

/* ─── Modelo da planilha "Balanço OTM" ──────────────────────────────────
 * Ebitda       = Receita − Assessores − Opex − Áreas de Apoio
 * Lucro Líq.   = Ebitda − Impostos − Capex
 * Lucro+Bônus  = Lucro Líquido + Bônus
 * Margem Líq.  = Lucro Líquido ÷ Receita
 */
/** Um item gerencial por "conta" da planilha; o grupo só importa nos testes de cláusula. */
const CC = {
  receita: "11111111-1111-4111-8111-111111111111",
  bonus: "22222222-2222-4222-8222-222222222222",
  impostos: "33333333-3333-4333-8333-333333333333",
  assessores: "44444444-4444-4444-8444-444444444444",
  opex: "55555555-5555-4555-8555-555555555555",
  capex: "66666666-6666-4666-8666-666666666666",
  apoio: "77777777-7777-4777-8777-777777777777",
};

const GROUP = "99999999-9999-4999-8999-999999999999";

function item(
  id: string,
  label: string,
  managementId: string,
  measure: "revenue" | "expense",
): BalanceLine {
  return {
    id,
    label,
    kind: "filter",
    measure,
    clauses: [{ ...emptyClause(), managementAccountIds: [managementId] }],
    emphasis: false,
  };
}

/** Uma linha da série, só com o que importa ao caso. */
function row(
  partial: Partial<MonthlySeriesRow> & { revenue: number; expense: number },
): MonthlySeriesRow {
  return {
    month: "2024-01-01",
    managementAccountId: null,
    managementGroupId: GROUP,
    areaId: null,
    nature: null,
    ...partial,
  };
}

const SPREADSHEET_MODEL: BalanceLine[] = [
  item("receita", "Receita", CC.receita, "revenue"),
  item("bonus", "Bônus", CC.bonus, "revenue"),
  item("impostos", "Impostos", CC.impostos, "expense"),
  item("assessores", "Assessores", CC.assessores, "expense"),
  item("opex", "Opex", CC.opex, "expense"),
  item("capex", "Capex", CC.capex, "expense"),
  item("apoio", "Áreas de Apoio", CC.apoio, "expense"),
  {
    id: "ebitda",
    label: "Ebitda",
    kind: "formula",
    emphasis: true,
    terms: [
      { lineId: "receita", sign: 1 },
      { lineId: "assessores", sign: -1 },
      { lineId: "opex", sign: -1 },
      { lineId: "apoio", sign: -1 },
    ],
  },
  {
    id: "lucro",
    label: "Lucro Líquido",
    kind: "formula",
    emphasis: true,
    terms: [
      { lineId: "ebitda", sign: 1 },
      { lineId: "impostos", sign: -1 },
      { lineId: "capex", sign: -1 },
    ],
  },
  {
    id: "lucro_bonus",
    label: "Lucro + Bônus",
    kind: "formula",
    emphasis: false,
    terms: [
      { lineId: "lucro", sign: 1 },
      { lineId: "bonus", sign: 1 },
    ],
  },
  {
    id: "margem",
    label: "Margem Líquida",
    kind: "ratio",
    emphasis: false,
    numeratorLineId: "lucro",
    denominatorLineId: "receita",
  },
];

/** Uma linha de série por item, montada a partir dos valores da planilha. */
function monthRows(
  month: string,
  v: {
    receita: number;
    bonus: number;
    impostos: number;
    assessores: number;
    opex: number;
    capex: number;
    apoio: number;
  },
): MonthlySeriesRow[] {
  return [
    row({ month, managementAccountId: CC.receita, revenue: v.receita, expense: 0 }),
    row({ month, managementAccountId: CC.bonus, revenue: v.bonus, expense: 0 }),
    row({ month, managementAccountId: CC.impostos, revenue: 0, expense: v.impostos }),
    row({ month, managementAccountId: CC.assessores, revenue: 0, expense: v.assessores }),
    row({ month, managementAccountId: CC.opex, revenue: 0, expense: v.opex }),
    row({ month, managementAccountId: CC.capex, revenue: 0, expense: v.capex }),
    row({ month, managementAccountId: CC.apoio, revenue: 0, expense: v.apoio }),
  ];
}

const JAN = monthRows("2024-01-01", {
  receita: 290_534.75,
  bonus: 0,
  impostos: 128_932.74,
  assessores: 131_253.56,
  opex: 50_249.16,
  capex: 12_295.0,
  apoio: 0,
});

const JUN = monthRows("2024-06-01", {
  receita: 487_306.54,
  bonus: 3_940_000.0,
  impostos: 78_829.09,
  assessores: 188_711.73,
  opex: 9_753.64,
  capex: 0,
  apoio: 55_671.57,
});

const JUL = monthRows("2024-07-01", {
  receita: 401_497.63,
  bonus: 0,
  impostos: 920_922.27,
  assessores: 166_613.76,
  opex: 54_912.42,
  capex: 5_689.0,
  apoio: 37_642.75,
});

function lineByLabel(matrix: ReturnType<typeof buildBalanceMatrix>, label: string) {
  const found = matrix.lines.find((l) => l.label === label);
  if (!found) throw new Error(`linha "${label}" não encontrada`);
  return found;
}

describe("monthAxis", () => {
  it("cobre todos os meses do período, inclusive os sem movimento", () => {
    expect(monthAxis("2024-01-15", "2024-04-02")).toEqual([
      "2024-01-01",
      "2024-02-01",
      "2024-03-01",
      "2024-04-01",
    ]);
  });

  it("devolve vazio para período invertido ou incompleto", () => {
    expect(monthAxis("2024-05-01", "2024-01-01")).toEqual([]);
    expect(monthAxis("", "2024-01-01")).toEqual([]);
  });
});

describe("buildBalanceMatrix — fidelidade à planilha Balanço OTM", () => {
  const matrix = buildBalanceMatrix({
    from: "2024-01-01",
    to: "2024-07-31",
    series: [...JAN, ...JUN, ...JUL],
    lines: SPREADSHEET_MODEL,
  });

  const janIndex = 0;
  const junIndex = 5;
  const julIndex = 6;

  it("monta o eixo com os sete meses, mesmo com dado só em três", () => {
    expect(matrix.months).toHaveLength(7);
    expect(matrix.months[junIndex]).toBe("2024-06-01");
  });

  it("reproduz o Ebitda de cada mês", () => {
    const ebitda = lineByLabel(matrix, "Ebitda");
    expect(ebitda.values[janIndex]).toBeCloseTo(109_032.03, 2);
    expect(ebitda.values[junIndex]).toBeCloseTo(233_169.6, 2);
    expect(ebitda.values[julIndex]).toBeCloseTo(142_328.7, 2);
  });

  it("reproduz o Lucro Líquido de cada mês", () => {
    const lucro = lineByLabel(matrix, "Lucro Líquido");
    expect(lucro.values[janIndex]).toBeCloseTo(-32_195.71, 2);
    expect(lucro.values[junIndex]).toBeCloseTo(154_340.51, 2);
    expect(lucro.values[julIndex]).toBeCloseTo(-784_282.57, 2);
  });

  it("reproduz o Lucro + Bônus", () => {
    const lucroBonus = lineByLabel(matrix, "Lucro + Bônus");
    expect(lucroBonus.values[janIndex]).toBeCloseTo(-32_195.71, 2);
    expect(lucroBonus.values[junIndex]).toBeCloseTo(4_094_340.51, 2);
  });

  it("reproduz a Margem Líquida de cada mês", () => {
    const margem = lineByLabel(matrix, "Margem Líquida");
    expect(margem.values[janIndex]).toBeCloseTo(-11.08, 2);
    expect(margem.values[junIndex]).toBeCloseTo(31.67, 2);
    expect(margem.values[julIndex]).toBeCloseTo(-195.34, 2);
  });

  it("zera os meses sem movimento em vez de deixar buraco", () => {
    const receita = lineByLabel(matrix, "Receita");
    expect(receita.values[1]).toBe(0);
    expect(receita.values[2]).toBe(0);
  });

  it("não cria linha 'Não classificado' quando o modelo cobre tudo", () => {
    expect(matrix.lines.some((l) => l.label === UNCLASSIFIED_LABEL)).toBe(false);
  });
});

describe("buildBalanceMatrix — total do período", () => {
  const matrix = buildBalanceMatrix({
    from: "2024-01-01",
    to: "2024-07-31",
    series: [...JAN, ...JUN, ...JUL],
    lines: SPREADSHEET_MODEL,
  });

  it("soma as linhas de valor", () => {
    expect(lineByLabel(matrix, "Receita").total).toBeCloseTo(1_179_338.92, 2);
    expect(lineByLabel(matrix, "Lucro Líquido").total).toBeCloseTo(-662_137.77, 2);
  });

  it("recalcula o percentual sobre o agregado, e não como média das margens mensais", () => {
    const margem = lineByLabel(matrix, "Margem Líquida");
    const doAgregado = (-662_137.77 / 1_179_338.92) * 100;
    const mediaDosMeses = (-11.08 + 31.67 + -195.34) / 3;

    expect(margem.total).toBeCloseTo(doAgregado, 6);
    expect(margem.total).not.toBeCloseTo(mediaDosMeses, 1);
  });
});

describe("buildBalanceMatrix — linha 'Não classificado'", () => {
  const soReceita: BalanceLine[] = [item("receita", "Receita", CC.receita, "revenue")];

  it("captura item que nenhuma linha referencia", () => {
    const matrix = buildBalanceMatrix({
      from: "2024-01-01",
      to: "2024-01-31",
      series: JAN,
      lines: soReceita,
    });

    // Tudo menos a receita: as despesas dos itens fora do modelo, com sinal negativo.
    const despesas = 128_932.74 + 131_253.56 + 50_249.16 + 12_295.0;
    expect(lineByLabel(matrix, UNCLASSIFIED_LABEL).total).toBeCloseTo(-despesas, 2);
  });

  it("captura lançamento sem item gerencial (transferência, patrimonial)", () => {
    const matrix = buildBalanceMatrix({
      from: "2024-01-01",
      to: "2024-01-31",
      series: [
        row({ managementAccountId: null, managementGroupId: null, revenue: 900, expense: 400 }),
      ],
      lines: soReceita,
    });

    expect(lineByLabel(matrix, UNCLASSIFIED_LABEL).total).toBeCloseTo(500, 2);
  });

  it("captura a entrada de um item coberto só pelo lado da despesa", () => {
    // Opex com um estorno de 1.000: a linha 'expense' não enxerga essa entrada.
    const matrix = buildBalanceMatrix({
      from: "2024-01-01",
      to: "2024-01-31",
      series: [row({ managementAccountId: CC.opex, revenue: 1_000, expense: 4_000 })],
      lines: [item("opex", "Opex", CC.opex, "expense")],
    });

    expect(lineByLabel(matrix, "Opex").total).toBeCloseTo(4_000, 2);
    expect(lineByLabel(matrix, UNCLASSIFIED_LABEL).total).toBeCloseTo(1_000, 2);
  });
});

describe("buildBalanceMatrix — modelo malformado", () => {
  it("marca linha em ciclo como indefinida em vez de estourar", () => {
    const ciclo: BalanceLine[] = [
      { id: "a", label: "A", kind: "formula", emphasis: false, terms: [{ lineId: "b", sign: 1 }] },
      { id: "b", label: "B", kind: "formula", emphasis: false, terms: [{ lineId: "a", sign: 1 }] },
    ];

    const matrix = buildBalanceMatrix({
      from: "2024-01-01",
      to: "2024-01-31",
      series: [],
      lines: ciclo,
    });

    expect(lineByLabel(matrix, "A").values[0]).toBeNull();
    expect(lineByLabel(matrix, "B").total).toBeNull();
  });

  it("marca fórmula que aponta para linha inexistente como indefinida", () => {
    const matrix = buildBalanceMatrix({
      from: "2024-01-01",
      to: "2024-01-31",
      series: JAN,
      lines: [
        item("receita", "Receita", CC.receita, "revenue"),
        {
          id: "x",
          label: "Quebrada",
          kind: "formula",
          emphasis: false,
          terms: [
            { lineId: "receita", sign: 1 },
            { lineId: "fantasma", sign: -1 },
          ],
        },
      ],
    });

    expect(lineByLabel(matrix, "Receita").values[0]).toBeCloseTo(290_534.75, 2);
    expect(lineByLabel(matrix, "Quebrada").values[0]).toBeNull();
  });

  it("deixa a margem indefinida quando o denominador é zero", () => {
    const matrix = buildBalanceMatrix({
      from: "2024-01-01",
      to: "2024-01-31",
      series: [row({ managementAccountId: CC.opex, revenue: 0, expense: 500 })],
      lines: [
        item("receita", "Receita", CC.receita, "revenue"),
        item("opex", "Opex", CC.opex, "expense"),
        {
          id: "m",
          label: "Margem",
          kind: "ratio",
          emphasis: false,
          numeratorLineId: "opex",
          denominatorLineId: "receita",
        },
      ],
    });

    expect(lineByLabel(matrix, "Margem").values[0]).toBeNull();
  });
});

describe("evaluationOrder", () => {
  it("resolve dependência declarada depois da linha que a usa", () => {
    const { order, broken } = evaluationOrder([
      {
        id: "total",
        label: "Total",
        kind: "formula",
        emphasis: false,
        terms: [{ lineId: "base", sign: 1 }],
      },
      item("base", "Base", CC.receita, "revenue"),
    ]);

    expect(broken.size).toBe(0);
    expect(order.indexOf("base")).toBeLessThan(order.indexOf("total"));
  });
});

describe("analyzeModel", () => {
  const known = { managementAccountIds: [CC.opex, CC.receita, GROUP], areaIds: [] };

  it("aponta as linhas que somam o mesmo lançamento", () => {
    const issues = analyzeModel(
      [
        item("a", "A", CC.opex, "expense"),
        item("b", "B", GROUP, "expense"),
        item("c", "C", CC.receita, "revenue"),
      ],
      [row({ managementAccountId: CC.opex, revenue: 0, expense: 10 })],
      known,
    );

    expect(issues.overlappingLineIds.sort()).toEqual(["a", "b"]);
  });

  it("não avisa sobreposição que não soma nada no período", () => {
    const issues = analyzeModel(
      [item("a", "A", CC.opex, "expense"), item("b", "B", GROUP, "expense")],
      [],
      known,
    );

    expect(issues.overlappingLineIds).toEqual([]);
  });

  it("aponta item que não existe mais e linha quebrada", () => {
    const issues = analyzeModel(
      [
        item("a", "A", CC.capex, "expense"),
        {
          id: "b",
          label: "B",
          kind: "formula",
          emphasis: false,
          terms: [{ lineId: "?", sign: 1 }],
        },
      ],
      [],
      known,
    );

    expect(issues.unknownReferenceLineIds).toEqual(["a"]);
    expect(issues.brokenLineIds).toEqual(["b"]);
  });
});

/* ─── Cláusulas: item × área × natureza ─────────────────────────────── */

const AREA_TI = "abababab-abab-4bab-8bab-abababababab";
const AREA_APOIO = "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd";
const PESSOAS = "efefefef-efef-4fef-8fef-efefefefefef";
const SALARIO = "12121212-1212-4212-8212-121212121212";

function key(partial: Partial<SeriesKey>): SeriesKey {
  return {
    managementAccountId: SALARIO,
    managementGroupId: PESSOAS,
    areaId: null,
    nature: "opex",
    ...partial,
  };
}

function clause(partial: Partial<BalanceClause>): BalanceClause {
  return { ...emptyClause(), ...partial };
}

describe("clauseMatches", () => {
  it("casa pelo grupo ou pelo item", () => {
    expect(clauseMatches(clause({ managementAccountIds: [PESSOAS] }), key({}))).toBe(true);
    expect(clauseMatches(clause({ managementAccountIds: [SALARIO] }), key({}))).toBe(true);
    expect(clauseMatches(clause({ managementAccountIds: [CC.opex] }), key({}))).toBe(false);
  });

  it("nunca casa lançamento sem item gerencial, nem com cláusula vazia", () => {
    expect(clauseMatches(emptyClause(), key({ managementAccountId: null }))).toBe(false);
    expect(clauseMatches(emptyClause(), key({}))).toBe(true);
  });

  it("área nula na cláusula é qualquer área, inclusive nenhuma", () => {
    expect(clauseMatches(clause({ areaIds: null }), key({ areaId: null }))).toBe(true);
    expect(clauseMatches(clause({ areaIds: null }), key({ areaId: AREA_TI }))).toBe(true);
  });

  it("com áreas escolhidas, sem área só entra se a cláusula pedir", () => {
    const soTi = clause({ areaIds: [AREA_TI] });
    expect(clauseMatches(soTi, key({ areaId: AREA_TI }))).toBe(true);
    expect(clauseMatches(soTi, key({ areaId: AREA_APOIO }))).toBe(false);
    expect(clauseMatches(soTi, key({ areaId: null }))).toBe(false);
    expect(clauseMatches({ ...soTi, includeNoArea: true }, key({ areaId: null }))).toBe(true);
  });

  it("filtra pela natureza, e natureza nula pega também o que não tem natureza", () => {
    expect(clauseMatches(clause({ nature: "capex" }), key({ nature: "opex" }))).toBe(false);
    expect(clauseMatches(clause({ nature: "capex" }), key({ nature: "capex" }))).toBe(true);
    expect(clauseMatches(clause({ nature: null }), key({ nature: null }))).toBe(true);
  });
});

describe("linha de filtro com duas cláusulas (o OPEX da migração)", () => {
  // "Todo gasto opex fora de Pessoas" ou "Pessoas sem área".
  const opex: FilterLine = {
    id: "opex",
    label: "OPEX",
    kind: "filter",
    measure: "net",
    emphasis: false,
    clauses: [
      clause({ managementAccountIds: [GROUP], nature: "opex" }),
      clause({ managementAccountIds: [PESSOAS], areaIds: [], includeNoArea: true, nature: "opex" }),
    ],
  };

  it("pega Pessoas sem área e deixa Pessoas com área para a linha da área", () => {
    expect(lineMatches(opex, key({ areaId: null }))).toBe(true);
    expect(lineMatches(opex, key({ areaId: AREA_TI }))).toBe(false);
  });

  it("soma uma vez só o lançamento que casa com as duas cláusulas", () => {
    const amplo: FilterLine = {
      ...opex,
      clauses: [clause({ managementAccountIds: [PESSOAS] }), clause({ nature: "opex" })],
    };
    const matrix = buildBalanceMatrix({
      from: "2024-01-01",
      to: "2024-01-31",
      series: [
        row({
          managementAccountId: SALARIO,
          managementGroupId: PESSOAS,
          nature: "opex",
          revenue: 0,
          expense: 100,
        }),
      ],
      lines: [amplo],
    });

    expect(lineByLabel(matrix, "OPEX").total).toBeCloseTo(-100, 2);
  });
});

describe("buildBalanceMatrix — drilldown", () => {
  const lines: BalanceLine[] = [item("opex", "Opex", CC.opex, "expense")];
  const matrix = buildBalanceMatrix({
    from: "2024-01-01",
    to: "2024-02-29",
    series: [
      row({ managementAccountId: CC.opex, areaId: AREA_TI, revenue: 50, expense: 300 }),
      row({
        month: "2024-02-01",
        managementAccountId: CC.opex,
        areaId: AREA_TI,
        revenue: 0,
        expense: 200,
      }),
      row({ managementAccountId: CC.receita, revenue: 900, expense: 0 }),
    ],
    lines,
  });

  it("manda as chaves que a linha soma, uma vez por período, com o lado da medida", () => {
    expect(lineByLabel(matrix, "Opex").drilldown).toEqual({
      kind: "filter",
      measure: "expense",
      keys: [{ m: CC.opex, a: AREA_TI, n: null, d: "outflow" }],
    });
  });

  it("no 'Não classificado', manda só o lado que nenhuma linha cobre", () => {
    const unclassified = lineByLabel(matrix, UNCLASSIFIED_LABEL);
    expect(unclassified.drilldown?.keys).toEqual([
      { m: CC.opex, a: AREA_TI, n: null, d: "inflow" },
      { m: CC.receita, a: null, n: null, d: null },
    ]);
  });
});

describe("monthOverMonth", () => {
  it("deixa o primeiro mês sem variação", () => {
    expect(monthOverMonth([100, 200], "currency")[0]).toBeNull();
  });

  it("varia dinheiro em porcentagem sobre o mês anterior", () => {
    const deltas = monthOverMonth([100, 150, 75], "currency");
    expect(deltas[1]).toBeCloseTo(50, 6);
    expect(deltas[2]).toBeCloseTo(-50, 6);
  });

  it("usa o módulo do mês anterior para não inverter o sinal no negativo", () => {
    // Prejuízo de 100 que passa a 50: melhorou, então a variação é positiva.
    expect(monthOverMonth([-100, -50], "currency")[1]).toBeCloseTo(50, 6);
    expect(monthOverMonth([-100, -150], "currency")[1]).toBeCloseTo(-50, 6);
  });

  it("varia percentual em pontos percentuais, não em porcentagem de porcentagem", () => {
    // Margem de 10% para 20% é +10 p.p. — não +100%.
    expect(monthOverMonth([10, 20], "percent")[1]).toBeCloseTo(10, 6);
    expect(monthOverMonth([31.67, -195.34], "percent")[1]).toBeCloseTo(-227.01, 2);
  });

  it("não define variação a partir de zero", () => {
    expect(monthOverMonth([0, 5_689], "currency")[1]).toBeNull();
  });

  it("não define variação quando um dos lados é indefinido", () => {
    expect(monthOverMonth([100, null, 200], "currency")).toEqual([null, null, null]);
  });
});

describe("buildBalanceMatrix — variação mês a mês", () => {
  const matrix = buildBalanceMatrix({
    from: "2024-01-01",
    to: "2024-07-31",
    series: [...JAN, ...JUN, ...JUL],
    lines: SPREADSHEET_MODEL,
  });

  it("acompanha os valores da linha e marca a unidade certa", () => {
    const receita = lineByLabel(matrix, "Receita");
    expect(receita.deltaUnit).toBe("percent");
    expect(receita.deltas).toHaveLength(matrix.months.length);
    expect(receita.deltas[0]).toBeNull();

    const margem = lineByLabel(matrix, "Margem Líquida");
    expect(margem.deltaUnit).toBe("points");
  });

  it("calcula a variação de junho para julho da Receita", () => {
    const receita = lineByLabel(matrix, "Receita");
    // 487.306,54 → 401.497,63
    expect(receita.deltas[6]).toBeCloseTo(((401_497.63 - 487_306.54) / 487_306.54) * 100, 6);
  });

  it("dá a variação da margem em pontos percentuais", () => {
    const margem = lineByLabel(matrix, "Margem Líquida");
    const junho = margem.values[5] ?? 0;
    const julho = margem.values[6] ?? 0;
    expect(margem.deltas[6]).toBeCloseTo(julho - junho, 6);
  });
});

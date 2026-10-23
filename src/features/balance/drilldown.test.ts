import { describe, expect, it } from "vitest";

import {
  DATE_COLUMN_BY_BASIS,
  describeDrilldown,
  drilldownSpansAreas,
  STATUSES_BY_BASIS,
} from "./drilldown";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("describeDrilldown", () => {
  it("diz o lado que a linha soma", () => {
    expect(describeDrilldown({ kind: "filter", keys: [], measure: "expense" })).toBe(
      "Plano gerencial · só saídas",
    );
    expect(describeDrilldown({ kind: "filter", keys: [], measure: "net" })).toBe(
      "Plano gerencial · entradas e saídas",
    );
  });

  it("identifica o 'Não classificado'", () => {
    expect(describeDrilldown({ kind: "unclassified", keys: [], measure: null })).toMatch(
      /nenhum item/,
    );
  });
});

describe("drilldownSpansAreas", () => {
  it("só mostra a área por lançamento quando a linha cobre mais de uma", () => {
    const um = { m: A, a: B, n: null, d: null } as const;
    expect(drilldownSpansAreas({ kind: "filter", keys: [um], measure: "net" })).toBe(false);
    expect(
      drilldownSpansAreas({ kind: "filter", keys: [um, { ...um, a: null }], measure: "net" }),
    ).toBe(true);
    expect(drilldownSpansAreas({ kind: "unclassified", keys: [um], measure: null })).toBe(true);
  });
});

/*
 * Estes filtros precisam ser os mesmos da RPC `management_monthly_series_multi`. Se
 * divergirem, a gaveta deixa de somar o valor da célula clicada — e é isso, e não
 * a forma do filtro, que o usuário percebe como bug.
 */
describe("filtros por regime", () => {
  it("competência inclui pendente; caixa não", () => {
    expect(STATUSES_BY_BASIS.accrual).toContain("pending");
    expect(STATUSES_BY_BASIS.cash).not.toContain("pending");
  });

  it("nenhum regime inclui agendado — previsão não é fato", () => {
    expect(STATUSES_BY_BASIS.accrual).not.toContain("scheduled");
    expect(STATUSES_BY_BASIS.cash).not.toContain("scheduled");
  });

  it("cada regime data o lançamento pela sua própria coluna", () => {
    expect(DATE_COLUMN_BY_BASIS.accrual).toBe("accrual_date");
    expect(DATE_COLUMN_BY_BASIS.cash).toBe("cash_date");
  });
});

import { describe, expect, it } from "vitest";

import type { BalanceMatrixLine } from "./compute";
import { buildBalanceCsv } from "./csv";

function line(overrides: Partial<BalanceMatrixLine>): BalanceMatrixLine {
  return {
    id: "l",
    label: "Linha",
    kind: "filter",
    emphasis: false,
    format: "currency",
    values: [],
    deltas: [],
    deltaUnit: "percent",
    total: null,
    drilldown: null,
    ...overrides,
  };
}

const MONTHS = ["2024-01-01", "2024-02-01", "2024-03-01"];

describe("buildBalanceCsv", () => {
  it("põe um item por linha e um mês por coluna, com o total no fim", () => {
    const csv = buildBalanceCsv(MONTHS, [
      line({ id: "a", label: "Receita", values: [100, 200, 300], total: 600 }),
      line({ id: "b", label: "Opex", values: [10, 20, 30], total: 60 }),
    ]);

    const [header, first, second] = csv.split("\r\n");
    expect(header).toBe("Item,jan 2024,fev 2024,mar 2024,Total");
    expect(first).toBe("Receita,100.00,200.00,300.00,600.00");
    expect(second).toBe("Opex,10.00,20.00,30.00,60.00");
  });

  it("mantém o valor no mês certo quando um mês do meio não tem valor", () => {
    const csv = buildBalanceCsv(MONTHS, [
      line({ label: "Margem", format: "percent", values: [10, null, 30], total: 20 }),
    ]);

    expect(csv.split("\r\n")[1]).toBe("Margem,10.00,,30.00,20.00");
  });

  it("deixa a célula vazia quando a linha tem menos valores que meses", () => {
    const csv = buildBalanceCsv(MONTHS, [line({ label: "Curta", values: [5], total: 5 })]);

    expect(csv.split("\r\n")[1]).toBe("Curta,5.00,,,5.00");
  });

  it("intercala a coluna de variação com a unidade da linha quando ligada", () => {
    const csv = buildBalanceCsv(
      ["2024-01-01", "2024-02-01"],
      [
        line({ label: "Receita", values: [100, 150], deltas: [null, 50], total: 250 }),
        line({
          label: "Margem",
          format: "percent",
          deltaUnit: "points",
          values: [10, 20],
          deltas: [null, 10],
          total: 15,
        }),
      ],
      { includeVariation: true },
    );

    const [header, receita, margem] = csv.split("\r\n");
    expect(header).toBe("Item,jan 2024,Δ jan 2024,fev 2024,Δ fev 2024,Total");
    expect(receita).toBe("Receita,100.00,,150.00,50.00%,250.00");
    expect(margem).toBe("Margem,10.00,,20.00,10.00 p.p.,15.00");
  });

  it("escapa o nome do item com vírgula", () => {
    const csv = buildBalanceCsv([], [line({ label: "Opex, geral", total: 1 })]);

    expect(csv.split("\r\n")[1]).toBe('"Opex, geral",1.00');
  });
});

import { describe, expect, it } from "vitest";

import { inferYear, parseBrlCents, parseC6Statement, StatementParseError } from "./c6.ts";
import { C6_EMPRESA_A, C6_EMPRESA_B, C6_EMPRESA_C } from "./fixtures.c6.ts";
import { buildTextLines, hasTextLayer } from "./text-lines.ts";
import { lineTotalCents, validateStatement } from "./validate.ts";

describe("parseBrlCents", () => {
  it("lê milhar, centavos, sinal e R$", () => {
    expect(parseBrlCents("6.713,83")).toBe(671383);
    expect(parseBrlCents("R$ 53.193,47")).toBe(5319347);
    expect(parseBrlCents("0,56")).toBe(56);
    expect(parseBrlCents("-12,30")).toBe(-1230);
  });

  it("recusa o que não é valor", () => {
    expect(parseBrlCents("1,00%")).toBeNull();
    expect(parseBrlCents("24")).toBeNull();
  });
});

describe("inferYear", () => {
  it("usa o ano do fechamento para data até ele", () => {
    expect(inferYear(24, 9, "2026-09-24")).toBe(2026);
    expect(inferYear(28, 1, "2026-09-24")).toBe(2026);
  });

  it("joga para o ano anterior a data depois do fechamento", () => {
    expect(inferYear(8, 10, "2026-09-24")).toBe(2025);
    expect(inferYear(25, 9, "2026-09-24")).toBe(2025);
  });
});

describe("parseC6Statement — as três faturas fecham com o total impresso", () => {
  it.each([
    ["A", C6_EMPRESA_A, 671383],
    ["B", C6_EMPRESA_B, 1476077],
    ["C", C6_EMPRESA_C, 1842299],
  ])("empresa %s", (_, lines, total) => {
    const statement = parseC6Statement(lines);
    const validation = validateStatement(statement, total);

    expect(statement.totalCents).toBe(total);
    expect(validation.checks.filter((c) => !c.ok)).toEqual([]);
    expect(validation.ok).toBe(true);
    expect(statement.warnings).toEqual([]);
  });
});

describe("parseC6Statement — empresa A (texto do PDF)", () => {
  const statement = parseC6Statement(C6_EMPRESA_A);

  it("lê fechamento, vencimento e o cartão virtual", () => {
    expect(statement.closingDate).toBe("2026-09-24");
    expect(statement.dueDate).toBe("2026-10-01");
    expect(statement.cards).toEqual([
      { last4: "1111", holderName: "EMPRESA A LTDA", kind: "virtual", subtotalCents: 671383 },
    ]);
  });

  it("tira o pagamento da fatura anterior das linhas de gasto", () => {
    expect(statement.payments).toEqual([
      {
        cardLast4: "1111",
        date: "2026-09-01",
        description: "Pag Fatura Boleto",
        amountCents: 520216,
      },
    ]);
    expect(statement.lines.some((l) => /Pag Fatura/.test(l.description))).toBe(false);
  });

  it("anexa o IOF à compra internacional e guarda moeda e cotação", () => {
    const anthropic = statement.lines.find((l) => l.description === "ANTHROPIC* CLAUDE SUB SA");
    expect(anthropic).toMatchObject({
      currency: "USD",
      amountCents: 116112,
      amountOriginalCents: 21571,
      fxRate: 5.38,
      iofCents: 4064,
    });
    expect(lineTotalCents(anthropic!)).toBe(120176);
    expect(statement.lines.some((l) => l.description.startsWith("IOF "))).toBe(false);
  });

  it("lê a parcela", () => {
    expect(statement.lines.find((l) => l.description === "MP *7CLUBLTDA")).toMatchObject({
      installmentN: 1,
      installmentTotal: 6,
      amountCents: 5835,
    });
  });
});

describe("parseC6Statement — empresas B e C (cartões adicionais, parcelas)", () => {
  it("separa o cartão virtual do adicional, cada um com o seu subtotal", () => {
    const statement = parseC6Statement(C6_EMPRESA_B);
    expect(statement.cards.map((c) => [c.last4, c.kind, c.subtotalCents])).toEqual([
      ["2222", "virtual", 0],
      ["3333", "physical", 1476077],
    ]);
    expect(statement.lines.every((l) => l.cardLast4 === "3333")).toBe(true);
    expect(statement.payments.map((p) => p.description)).toEqual(["Inclusao de Pagamento"]);
  });

  it("lê a parcela escrita na mesma célula da descrição", () => {
    const statement = parseC6Statement(C6_EMPRESA_B);
    expect(statement.lines.find((l) => l.description === "MORADA MAD COMER DE P")).toMatchObject({
      installmentN: 1,
      installmentTotal: 3,
      purchaseDate: "2026-09-11",
    });
  });

  it("data a parcela 12/12 no ano da compra original", () => {
    const statement = parseC6Statement(C6_EMPRESA_C);
    expect(
      statement.lines.find((l) => l.description === "PG *SOMOS BIU SOMOSBIU")?.purchaseDate,
    ).toBe("2025-10-08");
  });

  it("dá um IOF para cada uma de quatro assinaturas iguais no mesmo dia", () => {
    const statement = parseC6Statement(C6_EMPRESA_C);
    const team = statement.lines.filter(
      (l) => l.description === "ANTHROPIC* CLAUDE TEAM SA" && l.purchaseDate === "2026-09-21",
    );
    expect(team.map((l) => [l.amountCents, l.iofCents])).toEqual([
      [4082, 143],
      [4082, 143],
      [4082, 143],
      [4082, 143],
    ]);
  });
});

describe("validateStatement — fatura que não fecha não passa", () => {
  it("acusa a linha lida errada no total, no cartão e no resumo", () => {
    const statement = parseC6Statement(C6_EMPRESA_A);
    const wrong = {
      ...statement,
      lines: statement.lines.map((l, i) =>
        i === 0 ? { ...l, amountCents: l.amountCents + 100 } : l,
      ),
    };

    const validation = validateStatement(wrong);
    expect(validation.ok).toBe(false);
    expect(validation.checks.filter((c) => !c.ok).map((c) => c.code)).toEqual([
      "total",
      "card:1111",
      "international",
    ]);
  });

  it("acusa fatura que não bate com o lançamento do financeiro", () => {
    const validation = validateStatement(parseC6Statement(C6_EMPRESA_A), 700000);
    expect(validation.checks.find((c) => c.code === "ledger")).toMatchObject({
      ok: false,
      expectedCents: 700000,
      gotCents: 671383,
    });
  });
});

describe("parseC6Statement — o que não é fatura C6 com texto", () => {
  it("recusa com mensagem clara em vez de devolver fatura vazia", () => {
    expect(() => parseC6Statement(["qualquer coisa"])).toThrow(StatementParseError);
  });
});

describe("buildTextLines", () => {
  it("junta trechos da mesma altura em ordem de leitura, separados por dois espaços", () => {
    const lines = buildTextLines([
      { page: 1, x: 536, y: 569, str: "2,05" },
      { page: 1, x: 100, y: 569, str: "OPENROUTER, INC" },
      { page: 1, x: 370, y: 570, str: "IOF Transações Exterior" },
      { page: 1, x: 60, y: 569, str: "27 ago" },
      { page: 1, x: 60, y: 544, str: "29 ago" },
      { page: 1, x: 518, y: 544, str: "1.000,00" },
    ]);
    expect(lines).toEqual([
      "27 ago  OPENROUTER, INC  IOF Transações Exterior  2,05",
      "29 ago  1.000,00",
    ]);
  });

  it("reconhece PDF sem camada de texto (impresso como imagem)", () => {
    expect(hasTextLayer([{ page: 1, x: 0, y: 0, str: " " }])).toBe(false);
  });
});

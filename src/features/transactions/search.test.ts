import { describe, expect, it } from "vitest";

import {
  COUNTERPARTY_MATCH_CAP,
  normalizeSearchTerm,
  searchHitCap,
  transactionSearchOr,
} from "./search";

describe("normalizeSearchTerm", () => {
  it("ignora termo curto demais para ser recorte", () => {
    expect(normalizeSearchTerm("a")).toBeNull();
    expect(normalizeSearchTerm(" ")).toBeNull();
    expect(normalizeSearchTerm(null)).toBeNull();
    expect(normalizeSearchTerm(undefined)).toBeNull();
  });

  it("remove o que quebraria a sintaxe do or do PostgREST", () => {
    // vírgula e parênteses separam termos no `or`; ponto separa campo de operador
    expect(normalizeSearchTerm("Wise, Contabilidade (Ltda).")).toBe("Wise Contabilidade Ltda");
  });

  it("remove curingas para o usuário não montar padrão sem querer", () => {
    expect(normalizeSearchTerm("%banco%")).toBe("banco");
    expect(normalizeSearchTerm("c6*")).toBe("c6");
  });

  it("preserva o termo útil e colapsa espaço", () => {
    expect(normalizeSearchTerm("  Banco   do  Brasil ")).toBe("Banco do Brasil");
  });
});

describe("transactionSearchOr", () => {
  it("sem fornecedor casado, busca só a descrição", () => {
    // nunca devolve filtro vazio: isso traria a tabela inteira
    expect(transactionSearchOr("internet", [])).toBe("description.ilike.%internet%");
  });

  it("com fornecedor casado, é descrição OU fornecedor", () => {
    expect(transactionSearchOr("c6", ["id-1", "id-2"])).toBe(
      "description.ilike.%c6%,counterparty_id.in.(id-1,id-2)",
    );
  });

  it("a descrição vem sempre primeiro — lançamento sem fornecedor segue achável", () => {
    // o motivo de não usar join com !inner: ele descartaria estas linhas
    const filtro = transactionSearchOr("internet", ["id-1"]);
    expect(filtro.startsWith("description.ilike.")).toBe(true);
  });
});

describe("searchHitCap", () => {
  it("avisa quando o teto de fornecedores é atingido", () => {
    expect(searchHitCap(new Array(COUNTERPARTY_MATCH_CAP).fill("id"))).toBe(true);
    expect(searchHitCap(["id"])).toBe(false);
  });
});

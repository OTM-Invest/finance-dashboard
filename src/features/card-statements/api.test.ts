import { describe, expect, it } from "vitest";

import { proposeRulePattern } from "./api";

describe("proposeRulePattern", () => {
  it("usa o começo da descrição, sem a pontuação", () => {
    expect(proposeRulePattern("FACEBK *WX5UF4JFL4")).toBe("FACEBK");
    expect(proposeRulePattern("LATITUDE.SH")).toBe("LATITUDE");
  });

  it("pula o prefixo de adquirente, que não identifica o fornecedor", () => {
    expect(proposeRulePattern("MP *7CLUB - Parcela 1/6")).toBe("7CLUB");
    expect(proposeRulePattern("PG *SOMOS BIU SOMOSBIU")).toBe("SOMOS BIU");
  });

  it("leva a segunda palavra quando a primeira é curta demais para identificar", () => {
    expect(proposeRulePattern("SER ACQUISITION, INC")).toBe("SER ACQUISITION");
  });
});

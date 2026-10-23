import { describe, expect, it } from "vitest";

import { counterpartyTransactionsHref } from "./links";

describe("counterpartyTransactionsHref", () => {
  it("leva o fornecedor e o período do relatório", () => {
    expect(counterpartyTransactionsHref("cp-1", "2026-01-01", "2026-10-31")).toBe(
      "/transactions?counterpartyId=cp-1&from=2026-01-01&to=2026-10-31",
    );
  });

  it("sem período, filtra só pelo fornecedor", () => {
    expect(counterpartyTransactionsHref("cp-1")).toBe("/transactions?counterpartyId=cp-1");
    expect(counterpartyTransactionsHref("cp-1", "", "")).toBe("/transactions?counterpartyId=cp-1");
  });

  it("escapa o que iria quebrar a query string", () => {
    expect(counterpartyTransactionsHref("a b&c=d")).toBe(
      "/transactions?counterpartyId=a+b%26c%3Dd",
    );
  });
});

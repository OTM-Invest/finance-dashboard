import { describe, expect, it } from "vitest";

import { DashExportError, isAuthorized, parsePeriod } from "./request.ts";

describe("isAuthorized", () => {
  it("aceita a chave certa no Bearer", async () => {
    expect(await isAuthorized("Bearer segredo-123", "segredo-123")).toBe(true);
  });

  it("recusa chave errada, sem Bearer ou vazia", async () => {
    expect(await isAuthorized("Bearer outra", "segredo-123")).toBe(false);
    expect(await isAuthorized("segredo-123", "segredo-123")).toBe(false);
    expect(await isAuthorized(null, "segredo-123")).toBe(false);
    expect(await isAuthorized("Bearer ", "segredo-123")).toBe(false);
  });

  it("sem chave configurada, ninguém passa", async () => {
    expect(await isAuthorized("Bearer ", "")).toBe(false);
    expect(await isAuthorized("Bearer qualquer", "")).toBe(false);
  });
});

describe("parsePeriod", () => {
  const p = (q: string) => parsePeriod(new URLSearchParams(q));

  it("devolve o período válido", () => {
    expect(p("from=2025-11-01&to=2026-10-31")).toEqual({ from: "2025-11-01", to: "2026-10-31" });
  });

  it("rejeita data ausente, mal formada ou inexistente", () => {
    expect(() => p("to=2026-10-31")).toThrow(DashExportError);
    expect(() => p("from=01/10/2026&to=2026-10-31")).toThrow(/invalid_from/);
    expect(() => p("from=2026-02-30&to=2026-03-31")).toThrow(/invalid_from/);
  });

  it("rejeita período invertido ou maior que 24 meses", () => {
    expect(() => p("from=2026-10-31&to=2026-10-01")).toThrow(/invalid_period/);
    expect(() => p("from=2024-01-01&to=2026-01-02")).toThrow(/period_too_long/);
    expect(p("from=2024-01-01&to=2026-01-01").to).toBe("2026-01-01");
  });
});

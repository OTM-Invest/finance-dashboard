import { describe, expect, it, vi } from "vitest";

import { fetchAllPages, type PageResult } from "./fetchAllPages";

/** Simula o PostgREST: devolve o recorte pedido, nunca mais que `pageSize`. */
function fakeTable(total: number) {
  const rows = Array.from({ length: total }, (_, i) => i);
  return vi.fn(
    (start: number, end: number): Promise<PageResult<number>> =>
      Promise.resolve({ data: rows.slice(start, end + 1), error: null }),
  );
}

describe("fetchAllPages", () => {
  it("lê além do teto de uma página quando o resultado passa de pageSize", async () => {
    const fetchPage = fakeTable(1074);

    const rows = await fetchAllPages(fetchPage, { pageSize: 1000 });

    expect(rows).toHaveLength(1074);
    expect(rows.at(-1)).toBe(1073);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 999);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it("para na primeira página quando ela vem incompleta", async () => {
    const fetchPage = fakeTable(400);

    const rows = await fetchAllPages(fetchPage, { pageSize: 1000 });

    expect(rows).toHaveLength(400);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("busca uma página extra vazia quando o total é múltiplo exato da página", async () => {
    const fetchPage = fakeTable(2000);

    const rows = await fetchAllPages(fetchPage, { pageSize: 1000 });

    expect(rows).toHaveLength(2000);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("propaga o erro do banco em vez de devolver resultado parcial", async () => {
    const failure = new Error("statement timeout");
    const fetchPage = vi
      .fn<(start: number, end: number) => Promise<PageResult<number>>>()
      .mockResolvedValueOnce({ data: Array.from({ length: 10 }, (_, i) => i), error: null })
      .mockResolvedValueOnce({ data: null, error: failure });

    await expect(fetchAllPages(fetchPage, { pageSize: 10 })).rejects.toBe(failure);
  });

  it("falha com mensagem clara ao estourar o limite de páginas", async () => {
    const fetchPage = fakeTable(100);

    await expect(
      fetchAllPages(fetchPage, { pageSize: 10, maxPages: 3, tooManyMessage: "demais" }),
    ).rejects.toThrow("demais");
  });
});

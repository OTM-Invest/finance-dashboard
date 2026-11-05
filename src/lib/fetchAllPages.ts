/**
 * Leitura completa de uma consulta paginada do PostgREST.
 *
 * O PostgREST corta toda resposta em `max_rows` (1000, ver supabase/config.toml) SEM
 * erro: a consulta "dá certo" e devolve só parte das linhas. Num agregado, isso some com
 * dinheiro em meses aleatórios. Quem chama precisa ordenar por uma chave TOTAL — sem ela
 * duas páginas podem repetir ou pular linhas.
 */

/** Teto de linhas por resposta do PostgREST (`max_rows` em supabase/config.toml). */
export const POSTGREST_PAGE_SIZE = 1000;

/** Freio contra laço infinito: 50 páginas = 50 mil linhas. */
const DEFAULT_MAX_PAGES = 50;

export interface PageResult<T> {
  data: T[] | null;
  error: Error | null;
}

/** Busca uma página: linhas `start` a `end`, inclusive (semântica de `.range`). */
export type PageFetcher<T> = (start: number, end: number) => PromiseLike<PageResult<T>>;

export async function fetchAllPages<T>(
  fetchPage: PageFetcher<T>,
  options: { pageSize?: number; maxPages?: number; tooManyMessage?: string } = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? POSTGREST_PAGE_SIZE;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  let rows: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const start = page * pageSize;
    const { data, error } = await fetchPage(start, start + pageSize - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows = rows.concat(batch);
    if (batch.length < pageSize) return rows;
  }
  throw new Error(
    options.tooManyMessage ?? "A consulta tem linhas demais. Reduza o período ou o escopo.",
  );
}

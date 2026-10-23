/**
 * Reconstrução de linhas a partir dos pedaços de texto posicionados de um PDF.
 *
 * O pdf.js entrega cada trecho com página e coordenadas, não linhas: "27 ago",
 * "OPENROUTER, INC", "IOF Transações Exterior" e "2,05" são quatro itens com o mesmo y
 * (±1, porque fontes diferentes assentam em alturas um pouco diferentes). Aqui eles
 * viram uma linha, na ordem de leitura, com os trechos separados por DOIS espaços —
 * o separador que o leitor usa para distinguir colunas de palavras.
 */

export interface PositionedText {
  page: number;
  x: number;
  y: number;
  str: string;
}

/** Diferença de altura até a qual dois trechos são a mesma linha. */
const SAME_LINE_TOLERANCE = 3;

export const CELL_SEPARATOR = "  ";

export function buildTextLines(items: readonly PositionedText[]): string[] {
  const usable = items
    .map((it) => ({ ...it, str: it.str.replace(/\s+/g, " ").trim() }))
    .filter((it) => it.str.length > 0);

  const pages = [...new Set(usable.map((it) => it.page))].sort((a, b) => a - b);
  const lines: string[] = [];

  for (const page of pages) {
    // PDF conta o y de baixo para cima: o topo da página é o maior y.
    const onPage = usable.filter((it) => it.page === page).sort((a, b) => b.y - a.y);
    const rows: { y: number; cells: PositionedText[] }[] = [];
    for (const item of onPage) {
      const row = rows.find((r) => Math.abs(r.y - item.y) <= SAME_LINE_TOLERANCE);
      if (row) row.cells.push(item);
      else rows.push({ y: item.y, cells: [item] });
    }
    for (const row of rows) {
      lines.push(
        [...row.cells]
          .sort((a, b) => a.x - b.x)
          .map((c) => c.str)
          .join(CELL_SEPARATOR),
      );
    }
  }

  return lines;
}

/** PDF "impresso" como imagem tem pouquíssimo texto — não adianta tentar ler. */
export function hasTextLayer(items: readonly PositionedText[]): boolean {
  return items.filter((it) => it.str.trim().length > 0).length >= 20;
}

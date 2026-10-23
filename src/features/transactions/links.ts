/**
 * Links que entram na tela de lançamentos já filtrada.
 *
 * O contrato dos parâmetros de URL mora aqui, junto da feature que os lê
 * (`useTransactionFilters`), e não espalhado por quem navega: quando o nome de
 * um filtro mudar, quebra a compilação de um arquivo só.
 *
 * Só o id vai na URL — nunca o nome do fornecedor. Nome é dado que envelhece:
 * renomear a contraparte deixaria o rótulo mentindo sobre o que está filtrado.
 */

/** Lançamentos de um fornecedor, opcionalmente no período do relatório. */
export function counterpartyTransactionsHref(
  counterpartyId: string,
  from?: string | null,
  to?: string | null,
): string {
  const params = new URLSearchParams({ counterpartyId });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return `/transactions?${params.toString()}`;
}

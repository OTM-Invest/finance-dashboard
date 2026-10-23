/**
 * Tradução do drilldown de uma linha para filtro de consulta — puro, para o
 * caso chato (o "Não classificado") ficar testável sem banco.
 */
import type { Enums } from "@/lib/supabase";

import type { BalanceDrilldown } from "./compute";

export type AccountingBasis = Enums["accounting_basis"];

export const BASIS_LABELS: Record<AccountingBasis, string> = {
  accrual: "Competência",
  cash: "Caixa",
};

/**
 * Os filtros de cada regime, iguais aos da RPC da série e aos da DRE. Se estes
 * conjuntos divergirem, a lista de lançamentos deixa de somar o valor da célula
 * que o usuário clicou — é a única coisa que essa gaveta promete.
 */
export const STATUSES_BY_BASIS: Record<AccountingBasis, readonly Enums["transaction_status"][]> = {
  // Competência: o fato ocorreu, receber ou pagar é outra questão.
  accrual: ["settled", "reconciled", "pending"],
  // Caixa: só o que transitou. `pending` não tem data de caixa e cai fora sozinho.
  cash: ["settled", "reconciled"],
};

/** A data que define em que mês o lançamento cai — muda com o regime. */
export const DATE_COLUMN_BY_BASIS: Record<AccountingBasis, "accrual_date" | "cash_date"> = {
  accrual: "accrual_date",
  cash: "cash_date",
};

/** Resumo em uma linha do que a lista está mostrando, para o cabeçalho da gaveta. */
export function describeDrilldown(drilldown: BalanceDrilldown): string {
  if (drilldown.kind === "unclassified") {
    return "Lançamentos que nenhum item do modelo captura";
  }
  const side =
    drilldown.measure === "revenue"
      ? "só entradas"
      : drilldown.measure === "expense"
        ? "só saídas"
        : "entradas e saídas";
  return `Plano gerencial · ${side}`;
}

/** Mais de uma área entre as chaves — aí vale mostrar a área em cada lançamento. */
export function drilldownSpansAreas(drilldown: BalanceDrilldown): boolean {
  if (drilldown.kind === "unclassified") return true;
  return new Set(drilldown.keys.map((k) => k.a)).size > 1;
}

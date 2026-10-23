import { useQuery } from "@tanstack/react-query";

import type { AccountingBasis } from "@/features/balance/drilldown";
import { scopeQueryKey } from "@/features/companies/scopeQueryKey";

import { fetchBreakdown, fetchCardSummary, fetchReconciliation, type BreakdownParams } from "./api";

/** Recorte vazio = nenhuma empresa, não todas (grupo ainda carregando). */
const scopeReady = (companyIds: string[] | null) => companyIds === null || companyIds.length > 0;

const periodReady = (from: string, to: string) => Boolean(from && to) && from <= to;

export function useSpendingBreakdown(params: BreakdownParams) {
  const { companyIds, from, to, basis, byVendor, codes } = params;
  return useQuery({
    queryKey: [
      "spending",
      "breakdown",
      scopeQueryKey(companyIds),
      from,
      to,
      basis,
      byVendor,
      codes?.join(",") ?? null,
    ] as const,
    queryFn: () => fetchBreakdown(params),
    enabled: scopeReady(companyIds) && periodReady(from, to),
  });
}

export function useCardSummary(
  companyIds: string[] | null,
  from: string,
  to: string,
  basis: AccountingBasis,
) {
  return useQuery({
    queryKey: ["spending", "cards", scopeQueryKey(companyIds), from, to, basis] as const,
    queryFn: () => fetchCardSummary({ companyIds, from, to, basis }),
    enabled: scopeReady(companyIds) && periodReady(from, to),
  });
}

export function useReconciliation(
  companyIds: string[] | null,
  from: string,
  to: string,
  basis: AccountingBasis,
) {
  return useQuery({
    queryKey: ["spending", "reconciliation", scopeQueryKey(companyIds), from, to, basis] as const,
    queryFn: () => fetchReconciliation({ companyIds, from, to, basis }),
    enabled: scopeReady(companyIds) && periodReady(from, to),
  });
}

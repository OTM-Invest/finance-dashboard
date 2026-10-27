import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AccountingBasis } from "@/features/balance/drilldown";
import { scopeQueryKey } from "@/features/companies/scopeQueryKey";

import {
  acceptRevenueDifference,
  createCategoryRule,
  deleteCategoryRule,
  deleteRevenueStatement,
  fetchAdvisorCodes,
  fetchAdvisorLinks,
  fetchCategoryRules,
  fetchCrmReports,
  fetchLinkableEmployees,
  fetchPendingRevenueTransactions,
  fetchReportRoutes,
  fetchRevenueBreakdown,
  fetchRevenueStatements,
  fetchSyncRuns,
  fetchUnmappedCombinations,
  requestSync,
  saveReportRoute,
  saveRevenueStatement,
  setEmployeeAdvisorCode,
  updateCategoryRule,
} from "./api";

/** Recorte vazio = nenhuma empresa, não todas (grupo ainda carregando). */
const scopeReady = (companyIds: string[] | null) => companyIds === null || companyIds.length > 0;
const periodReady = (from: string, to: string) => Boolean(from && to) && from <= to;

const ROOT = "revenue";

export function useRevenueBreakdown(
  companyIds: string[] | null,
  from: string,
  to: string,
  basis: AccountingBasis,
) {
  return useQuery({
    queryKey: [ROOT, "breakdown", scopeQueryKey(companyIds), from, to, basis] as const,
    queryFn: () => fetchRevenueBreakdown({ companyIds, from, to, basis }),
    enabled: scopeReady(companyIds) && periodReady(from, to),
  });
}

export function useCrmReports(companyIds: string[] | null, from: string) {
  return useQuery({
    queryKey: [ROOT, "reports", scopeQueryKey(companyIds), from] as const,
    queryFn: () => fetchCrmReports(companyIds, from),
    enabled: scopeReady(companyIds) && Boolean(from),
  });
}

export function useRevenueStatements(companyIds: string[] | null) {
  return useQuery({
    queryKey: [ROOT, "statements", scopeQueryKey(companyIds)] as const,
    queryFn: () => fetchRevenueStatements(companyIds),
    enabled: scopeReady(companyIds),
  });
}

export function usePendingRevenueTransactions(companyIds: string[] | null, from: string) {
  return useQuery({
    queryKey: [ROOT, "pending", scopeQueryKey(companyIds), from] as const,
    queryFn: () => fetchPendingRevenueTransactions(companyIds, from),
    enabled: scopeReady(companyIds) && Boolean(from),
  });
}

export function useAdvisorCodes(companyIds: string[] | null, from: string) {
  return useQuery({
    queryKey: [ROOT, "advisor-codes", scopeQueryKey(companyIds), from] as const,
    queryFn: () => fetchAdvisorCodes(companyIds, from),
    enabled: scopeReady(companyIds) && Boolean(from),
  });
}

export function useAdvisorLinks() {
  return useQuery({ queryKey: [ROOT, "advisor-links"] as const, queryFn: fetchAdvisorLinks });
}

export function useLinkableEmployees() {
  return useQuery({ queryKey: [ROOT, "employees"] as const, queryFn: fetchLinkableEmployees });
}

export function useCategoryRules() {
  return useQuery({ queryKey: [ROOT, "category-rules"] as const, queryFn: fetchCategoryRules });
}

export function useUnmappedCombinations(companyIds: string[] | null) {
  return useQuery({
    queryKey: [ROOT, "unmapped", scopeQueryKey(companyIds)] as const,
    queryFn: () => fetchUnmappedCombinations(companyIds),
    enabled: scopeReady(companyIds),
  });
}

export function useReportRoutes() {
  return useQuery({ queryKey: [ROOT, "routes"] as const, queryFn: fetchReportRoutes });
}

export function useSyncRuns() {
  return useQuery({
    queryKey: [ROOT, "sync-runs"] as const,
    queryFn: fetchSyncRuns,
    // Uma execução em andamento termina em segundos: acompanha até fechar.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => r.status === "running") ? 4000 : false,
  });
}

/**
 * Abrir, aceitar e desfazer mudam o que o Balanço e a Central somam: invalidam a
 * receita inteira e as leituras da camada gerencial.
 */
function invalidateRevenue(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: [ROOT] });
  void qc.invalidateQueries({ queryKey: ["balance"] });
  void qc.invalidateQueries({ queryKey: ["spending"] });
}

export function useSaveRevenueStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveRevenueStatement,
    onSuccess: () => invalidateRevenue(qc),
  });
}

export function useAcceptRevenueDifference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ statementId, note }: { statementId: string; note: string }) =>
      acceptRevenueDifference(statementId, note),
    onSuccess: () => invalidateRevenue(qc),
  });
}

export function useDeleteRevenueStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteRevenueStatement,
    onSuccess: () => invalidateRevenue(qc),
  });
}

export function useSetAdvisorCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, code }: { employeeId: string; code: string | null }) =>
      setEmployeeAdvisorCode(employeeId, code),
    onSuccess: () => {
      invalidateRevenue(qc);
      void qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

export function useSaveCategoryRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      rule:
        | { id: string; managementAccountId: string }
        | {
            organizationId: string;
            category: string;
            product: string | null;
            managementAccountId: string;
          },
    ) =>
      "id" in rule
        ? updateCategoryRule(rule.id, rule.managementAccountId)
        : createCategoryRule(rule),
    onSuccess: () => invalidateRevenue(qc),
  });
}

export function useDeleteCategoryRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteCategoryRule,
    onSuccess: () => invalidateRevenue(qc),
  });
}

export function useSaveReportRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveReportRoute,
    onSuccess: () => void qc.invalidateQueries({ queryKey: [ROOT] }),
  });
}

export function useRequestSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ from, to }: { from?: string; to?: string }) => requestSync(from, to),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [ROOT, "sync-runs"] }),
  });
}

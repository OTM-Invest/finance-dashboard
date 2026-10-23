import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { scopeQueryKey } from "@/features/companies/scopeQueryKey";

import {
  acceptSuggestions,
  applyClassificationRules,
  classifyCardLine,
  createClassificationRule,
  deleteCardStatement,
  deleteClassificationRule,
  fetchCardStatement,
  fetchCardStatements,
  fetchClassificationRules,
  fetchPendingInvoiceTransactions,
  requestAiSuggestions,
  saveCardStatement,
  setClassificationRuleActive,
} from "./api";

export const cardStatementKeys = {
  all: ["card-statements"] as const,
  list: (scope: string) => ["card-statements", "list", scope] as const,
  pending: (scope: string) => ["card-statements", "pending", scope] as const,
  detail: (id: string) => ["card-statements", "detail", id] as const,
  rules: ["card-statements", "rules"] as const,
};

/** Recorte vazio = nenhuma empresa, não todas (grupo ainda carregando). */
const scopeReady = (companyIds: string[] | null) => companyIds === null || companyIds.length > 0;

export function useCardStatements(companyIds: string[] | null) {
  return useQuery({
    queryKey: cardStatementKeys.list(scopeQueryKey(companyIds)),
    queryFn: () => fetchCardStatements(companyIds),
    enabled: scopeReady(companyIds),
  });
}

export function usePendingInvoiceTransactions(companyIds: string[] | null, enabled: boolean) {
  return useQuery({
    queryKey: cardStatementKeys.pending(scopeQueryKey(companyIds)),
    queryFn: () => fetchPendingInvoiceTransactions(companyIds),
    enabled: enabled && scopeReady(companyIds),
  });
}

export function useCardStatement(id: string | undefined) {
  return useQuery({
    queryKey: cardStatementKeys.detail(id ?? ""),
    queryFn: () => fetchCardStatement(id ?? ""),
    enabled: Boolean(id),
  });
}

/**
 * Gravar, classificar e apagar mudam o que a visão gerencial soma — o Balanço precisa
 * recalcular junto, senão mostra o número de antes.
 */
function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: cardStatementKeys.all });
  void qc.invalidateQueries({ queryKey: ["balance"] });
}

export function useSaveCardStatement() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: saveCardStatement, onSuccess: () => invalidateAll(qc) });
}

export function useClassifyCardLine() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: classifyCardLine, onSuccess: () => invalidateAll(qc) });
}

export function useDeleteCardStatement() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: deleteCardStatement, onSuccess: () => invalidateAll(qc) });
}

export function useRequestAiSuggestions() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: requestAiSuggestions, onSuccess: () => invalidateAll(qc) });
}

export function useAcceptSuggestions() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: acceptSuggestions, onSuccess: () => invalidateAll(qc) });
}

export function useApplyClassificationRules() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: applyClassificationRules, onSuccess: () => invalidateAll(qc) });
}

export function useClassificationRules() {
  return useQuery({ queryKey: cardStatementKeys.rules, queryFn: fetchClassificationRules });
}

export function useCreateClassificationRule() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: createClassificationRule, onSuccess: () => invalidateAll(qc) });
}

export function useSetClassificationRuleActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setClassificationRuleActive(id, isActive),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteClassificationRule() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: deleteClassificationRule, onSuccess: () => invalidateAll(qc) });
}

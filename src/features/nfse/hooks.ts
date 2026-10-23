import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Tables } from "@/lib/supabase";

import {
  approveInvoiceJob,
  approveInvoiceJobs,
  cancelBackfillRun,
  createBackfillRun,
  createConnection,
  createRecipient,
  createSandboxCharge,
  deleteBackfillRun,
  deleteRecipient,
  fetchBackfillRuns,
  fetchConnections,
  fetchFiscalSettings,
  fetchInvoiceJobs,
  fetchRecipients,
  fetchWebhookEvents,
  reemitAuthorizedToProducao,
  releaseInvoiceJobForEmission,
  requeueInvoiceJob,
  rotateWebhookSecret,
  saveTomadorReview,
  setFocusToken,
  setPagarmeAccountSecret,
  updateConnection,
  updateRecipient,
  upsertFiscalSettings,
  voidInvoiceJob,
  type CreateBackfillRunInput,
  type InvoiceJobFilters,
  type SandboxChargeInput,
  type WebhookFilters,
} from "./api";

export const nfseKeys = {
  connections: ["nfse", "connections"] as const,
  recipients: (accountId: string) => ["nfse", "recipients", accountId] as const,
  fiscalSettings: ["nfse", "fiscal-settings"] as const,
  jobs: (f: InvoiceJobFilters) => ["nfse", "jobs", f] as const,
  webhooks: (f: WebhookFilters) => ["nfse", "webhooks", f] as const,
  backfillRuns: ["nfse", "backfill-runs"] as const,
};

// --- Conexões ---------------------------------------------------------------
export function useConnections() {
  return useQuery({ queryKey: nfseKeys.connections, queryFn: fetchConnections });
}

export function useCreateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Tables["pagarme_accounts"]["Insert"]) => createConnection(payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: nfseKeys.connections }),
  });
}

export function useUpdateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Tables["pagarme_accounts"]["Update"] }) =>
      updateConnection(id, payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: nfseKeys.connections }),
  });
}

export function useRotateWebhookSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) => rotateWebhookSecret(accountId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: nfseKeys.connections }),
  });
}

export function useSetPagarmeAccountSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, secret }: { accountId: string; secret: string }) =>
      setPagarmeAccountSecret(accountId, secret),
    onSuccess: () => void qc.invalidateQueries({ queryKey: nfseKeys.connections }),
  });
}

// --- Cobrança de teste (sandbox) --------------------------------------------
export function useCreateSandboxCharge() {
  return useMutation({
    mutationFn: (input: SandboxChargeInput) => createSandboxCharge(input),
  });
}

// --- Recebedores ------------------------------------------------------------
export function useRecipients(accountId: string | null) {
  return useQuery({
    queryKey: nfseKeys.recipients(accountId ?? ""),
    queryFn: () => fetchRecipients(accountId ?? ""),
    enabled: Boolean(accountId),
  });
}

export function useCreateRecipient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Tables["pagarme_recipient_map"]["Insert"]) => createRecipient(payload),
    onSuccess: (row) =>
      void qc.invalidateQueries({ queryKey: nfseKeys.recipients(row.pagarme_account_id) }),
  });
}

export function useUpdateRecipient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Tables["pagarme_recipient_map"]["Update"];
    }) => updateRecipient(id, payload),
    onSuccess: (row) =>
      void qc.invalidateQueries({ queryKey: nfseKeys.recipients(row.pagarme_account_id) }),
  });
}

export function useDeleteRecipient(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRecipient(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: nfseKeys.recipients(accountId) }),
  });
}

// --- Configuração fiscal ----------------------------------------------------
export function useFiscalSettings() {
  return useQuery({ queryKey: nfseKeys.fiscalSettings, queryFn: fetchFiscalSettings });
}

export function useUpsertFiscalSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Tables["fiscal_company_settings"]["Insert"]) =>
      upsertFiscalSettings(payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: nfseKeys.fiscalSettings }),
  });
}

export function useSetFocusToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, token }: { companyId: string; token: string }) =>
      setFocusToken(companyId, token),
    onSuccess: () => void qc.invalidateQueries({ queryKey: nfseKeys.fiscalSettings }),
  });
}

// --- Fila de notas ----------------------------------------------------------
export function useInvoiceJobs(filters: InvoiceJobFilters, opts?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: nfseKeys.jobs(filters),
    queryFn: () => fetchInvoiceJobs(filters),
    refetchInterval: opts?.refetchInterval ?? false,
  });
}

export function useApproveInvoiceJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveInvoiceJob(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["nfse", "jobs"] }),
  });
}

export function useApproveInvoiceJobs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => approveInvoiceJobs(ids),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["nfse", "jobs"] }),
  });
}

/** Emitir mesmo com estorno (decisão humana registrada). */
export function useReleaseInvoiceJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      releaseInvoiceJobForEmission(id, motivo),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["nfse", "jobs"] }),
  });
}

/** Descartar a nota antes de ela existir na prefeitura. */
export function useVoidInvoiceJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) => voidInvoiceJob(id, motivo),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["nfse", "jobs"] }),
  });
}

export function useReemitToProducao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) => reemitAuthorizedToProducao(accountId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["nfse", "jobs"] }),
  });
}

export function useRequeueInvoiceJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => requeueInvoiceJob(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["nfse", "jobs"] }),
  });
}

/** Revisão manual do tomador (com ou sem reenvio para a fila). */
export function useSaveTomadorReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveTomadorReview,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["nfse", "jobs"] }),
  });
}

// --- Emissão retroativa (backfill) ------------------------------------------
export function useBackfillRuns() {
  return useQuery({
    queryKey: nfseKeys.backfillRuns,
    queryFn: fetchBackfillRuns,
    // enquanto há run em processamento, o cron avança o cursor -> atualiza sozinho
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => r.status === "running") ? 5_000 : false,
  });
}

export function useCreateBackfillRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBackfillRunInput) => createBackfillRun(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: nfseKeys.backfillRuns }),
  });
}

export function useCancelBackfillRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => cancelBackfillRun(runId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: nfseKeys.backfillRuns }),
  });
}

export function useDeleteBackfillRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => deleteBackfillRun(runId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: nfseKeys.backfillRuns });
      // a exclusão também remove notas pendentes da carga -> atualiza a lista
      void qc.invalidateQueries({ queryKey: ["nfse", "jobs"] });
    },
  });
}

// --- Webhooks recebidos -----------------------------------------------------
export function useWebhookEvents(filters: WebhookFilters) {
  return useQuery({
    queryKey: nfseKeys.webhooks(filters),
    queryFn: () => fetchWebhookEvents(filters),
    refetchInterval: 15_000, // log de debug: atualiza sozinho
  });
}

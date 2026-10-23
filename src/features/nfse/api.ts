import { dayEndIso, dayStartIso } from "@/lib/dates";
import { onlyDigits } from "@/lib/document";
import { supabase, type Enums, type Tables } from "@/lib/supabase";

import { jobSearchOr } from "./job-filters";
import type { TomadorReviewFormValues } from "./schema";
import { buildEnderecoOverride, changedEnderecoFields, type TomadorEndereco } from "./tomador";

/** Bucket de Storage dos XML/DANFSe (criado junto com a focus-webhook, Fase 5). */
const NFSE_FILES_BUCKET = "nfse-files";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export type NfseAmbiente = Enums["nfse_ambiente"];
export type NfseEmissionMode = Enums["nfse_emission_mode"];

interface CompanyRef {
  id: string;
  legal_name: string;
  trade_name: string | null;
}

export type PagarmeAccountRow = Tables["pagarme_accounts"]["Row"];
export type PagarmeAccount = PagarmeAccountRow & { owner: CompanyRef | null };

export type RecipientRow = Tables["pagarme_recipient_map"]["Row"];
export type Recipient = RecipientRow & { company: CompanyRef | null };

export type FiscalSettings = Tables["fiscal_company_settings"]["Row"];

export type InvoiceJobStatus = Enums["invoice_job_status"];
export type InvoiceJobRow = Tables["invoice_jobs"]["Row"];
export type InvoiceJob = InvoiceJobRow & {
  company: CompanyRef | null;
  account: { id: string; label: string; slug: string } | null;
};

/** Coluna de data usada pelo filtro de período (e pela ordenação da lista). */
export type InvoiceJobDateField = "paid_at" | "charge_created_at" | "created_at" | "emitida_em";

export interface InvoiceJobFilters {
  statuses: string[] | null; // null = todas
  accountId?: string | null;
  // null = sem recorte (todas as empresas visíveis pela RLS); array = só estas
  companyIds?: string[] | null;
  source?: string | null; // metadata.source exato (ex.: 'backfill')
  ambiente?: string | null; // 'homologacao' | 'producao'
  origin?: string | null; // 'webhook' (source nulo) | 'backfill' (source='backfill')
  dateField?: InvoiceJobDateField | null; // padrão 'paid_at' (data do pagamento)
  from?: string | null; // YYYY-MM-DD (dia local, inclusivo)
  to?: string | null; // YYYY-MM-DD (dia local, inclusivo)
  search?: string | null; // tomador (nome/documento), número/chave da nota, charge id
  page?: number | null; // 0-based; null/undefined = sem paginação (limit padrão)
  pageSize?: number | null;
}

/** Página de notas + total (para paginação server-side). */
export interface InvoiceJobPage {
  rows: InvoiceJob[];
  total: number;
}

export type WebhookProvider = "pagarme" | "focus";

/** Evento de webhook normalizado (sales_events ou focus_events) para o log de debug. */
export interface WebhookEvent {
  id: string;
  provider: WebhookProvider;
  ref: string; // event_id (pagar.me) | focus_ref (Focus)
  kind: string; // event_type (pagar.me) | status (Focus)
  resourceId: string | null;
  receivedAt: string;
  processedAt: string | null;
  processError: string | null;
  payload: unknown;
}

export interface WebhookFilters {
  provider: WebhookProvider;
  onlyErrors: boolean;
  onlyUnprocessed: boolean;
}

// ---------------------------------------------------------------------------
// Conexões pagar.me (pagarme_accounts)
// ---------------------------------------------------------------------------
export async function fetchConnections(): Promise<PagarmeAccount[]> {
  const { data, error } = await supabase
    .from("pagarme_accounts")
    .select("*, owner:companies!owner_company_id(id, legal_name, trade_name)")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createConnection(
  payload: Tables["pagarme_accounts"]["Insert"],
): Promise<PagarmeAccountRow> {
  const { data, error } = await supabase
    .from("pagarme_accounts")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateConnection(
  id: string,
  payload: Tables["pagarme_accounts"]["Update"],
): Promise<PagarmeAccountRow> {
  const { data, error } = await supabase
    .from("pagarme_accounts")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Recebedores do split (pagarme_recipient_map) — escopados por conta
// ---------------------------------------------------------------------------
export async function fetchRecipients(accountId: string): Promise<Recipient[]> {
  const { data, error } = await supabase
    .from("pagarme_recipient_map")
    .select("*, company:companies!company_id(id, legal_name, trade_name)")
    .eq("pagarme_account_id", accountId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createRecipient(
  payload: Tables["pagarme_recipient_map"]["Insert"],
): Promise<RecipientRow> {
  const { data, error } = await supabase
    .from("pagarme_recipient_map")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateRecipient(
  id: string,
  payload: Tables["pagarme_recipient_map"]["Update"],
): Promise<RecipientRow> {
  const { data, error } = await supabase
    .from("pagarme_recipient_map")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRecipient(id: string): Promise<void> {
  const { error } = await supabase.from("pagarme_recipient_map").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Configuração fiscal por empresa (fiscal_company_settings)
// ---------------------------------------------------------------------------
export async function fetchFiscalSettings(): Promise<FiscalSettings[]> {
  const { data, error } = await supabase.from("fiscal_company_settings").select("*");
  if (error) throw error;
  return data ?? [];
}

/** Upsert por company_id (1:1). Retorna a linha persistida. */
export async function upsertFiscalSettings(
  payload: Tables["fiscal_company_settings"]["Insert"],
): Promise<FiscalSettings> {
  const { data, error } = await supabase
    .from("fiscal_company_settings")
    .upsert(payload, { onConflict: "company_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Segredos (via RPC SECURITY DEFINER — o valor vai direto ao Vault)
// ---------------------------------------------------------------------------
/** Gera um novo segredo de webhook para a conta e o retorna UMA vez (para a URL). */
export async function rotateWebhookSecret(accountId: string): Promise<string> {
  const { data, error } = await supabase.rpc("rotate_account_webhook_secret", {
    p_account_id: accountId,
  });
  if (error) throw error;
  return data;
}

/** Salva o token do Focus de uma empresa no Vault (não retorna o valor). */
export async function setFocusToken(companyId: string, token: string): Promise<void> {
  const { error } = await supabase.rpc("set_company_focus_token", {
    p_company_id: companyId,
    p_token: token,
  });
  if (error) throw error;
}

/** Salva a secret key da API do pagar.me de uma conta no Vault (split via /payables). */
export async function setPagarmeAccountSecret(accountId: string, secret: string): Promise<void> {
  const { error } = await supabase.rpc("set_pagarme_account_secret", {
    p_account_id: accountId,
    p_secret: secret,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Cobrança de teste (sandbox) — Edge Function pagarme-sandbox
// Cria um POST /orders no sandbox do pagar.me; o charge.paid volta pelo webhook
// e percorre a esteira normal. Só funciona em contas de homologação (sk_test_).
// ---------------------------------------------------------------------------
export type SandboxMethod = "credit_card" | "pix" | "boleto";

export interface SandboxSplitEntry {
  recipientId: string;
  amount: number; // % (percentage) ou centavos (flat)
  type: "flat" | "percentage";
}

export interface SandboxChargeInput {
  accountId: string;
  method: SandboxMethod;
  scenario: string;
  amountCents: number;
  description?: string | null;
  customer: {
    name: string;
    email: string;
    document?: string | null;
    documentType?: "CPF" | "CNPJ";
    address?: {
      line_1: string;
      line_2?: string | null;
      zip_code: string;
      city: string;
      state: string;
      country?: string;
    } | null;
    phone?: { areaCode: string; number: string } | null;
  };
  split?: SandboxSplitEntry[];
}

export interface SandboxChargeCharge {
  id: string | null;
  status: string | null;
  paymentMethod: string | null;
  qrCode: string | null;
  qrCodeUrl: string | null;
  boletoUrl: string | null;
  boletoLine: string | null;
}

export interface SandboxChargeResult {
  status: string;
  order: {
    orderId: string | null;
    code: string | null;
    status: string | null;
    charges: SandboxChargeCharge[];
  };
}

/** Lê a mensagem útil do corpo de erro da Edge Function (422 traz `details`). */
async function readFunctionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string; details?: string[] };
      if (Array.isArray(body.details) && body.details.length > 0) return body.details.join(" · ");
      if (body.error) return body.error;
    } catch {
      /* corpo não-JSON: cai no message padrão */
    }
  }
  return error instanceof Error ? error.message : "Erro ao criar cobrança de teste";
}

export async function createSandboxCharge(input: SandboxChargeInput): Promise<SandboxChargeResult> {
  const result = await supabase.functions.invoke<SandboxChargeResult>("pagarme-sandbox", {
    body: input,
  });
  if (result.error) throw new Error(await readFunctionError(result.error));
  if (!result.data) throw new Error("Resposta vazia da função pagarme-sandbox");
  return result.data;
}

// ---------------------------------------------------------------------------
// Fila de notas (invoice_jobs)
// ---------------------------------------------------------------------------
const JOB_LIST_LIMIT = 300;

export async function fetchInvoiceJobs(filters: InvoiceJobFilters): Promise<InvoiceJobPage> {
  // o período e a ordenação seguem o mesmo campo (pagamento, compra, fila, emissão)
  const dateField = filters.dateField ?? "paid_at";

  let query = supabase
    .from("invoice_jobs")
    .select(
      "*, company:companies!company_id(id, legal_name, trade_name), account:pagarme_accounts!pagarme_account_id(id, label, slug)",
      { count: "exact" },
    )
    .order(dateField, { ascending: false, nullsFirst: false });

  if (filters.statuses && filters.statuses.length > 0) {
    query = query.in("status", filters.statuses as InvoiceJobStatus[]);
  }
  if (filters.accountId) {
    query = query.eq("pagarme_account_id", filters.accountId);
  }
  if (filters.companyIds) {
    query = query.in("company_id", filters.companyIds);
  }
  if (filters.source) {
    query = query.eq("metadata->>source", filters.source);
  }
  if (filters.ambiente) {
    query = query.eq("ambiente", filters.ambiente as NfseAmbiente);
  }
  // origem: backfill = source 'backfill'; webhook = sem source (tempo real)
  if (filters.origin === "backfill") {
    query = query.eq("metadata->>source", "backfill");
  } else if (filters.origin === "webhook") {
    query = query.is("metadata->>source", null);
  }
  // período: dia local inclusivo nas duas pontas (a tabela mostra data local)
  if (filters.from) {
    query = query.gte(dateField, dayStartIso(filters.from));
  }
  if (filters.to) {
    query = query.lte(dateField, dayEndIso(filters.to));
  }
  const searchOr = jobSearchOr(filters.search);
  if (searchOr) {
    query = query.or(searchOr);
  }

  const pageSize = filters.pageSize ?? JOB_LIST_LIMIT;
  if (filters.page != null) {
    const from = filters.page * pageSize;
    query = query.range(from, from + pageSize - 1);
  } else {
    query = query.limit(pageSize);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

/**
 * Busca TODAS as notas que casam com os filtros (para exportação), paginando em
 * lotes para não truncar silenciosamente num limite do servidor. Ignora page/
 * pageSize dos filtros (controla a paginação internamente).
 */
const EXPORT_BATCH = 1000;
const EXPORT_HARD_CAP = 50000;

export async function fetchAllInvoiceJobs(filters: InvoiceJobFilters): Promise<InvoiceJob[]> {
  const all: InvoiceJob[] = [];
  for (let page = 0; ; page += 1) {
    const { rows } = await fetchInvoiceJobs({ ...filters, page, pageSize: EXPORT_BATCH });
    all.push(...rows);
    if (rows.length < EXPORT_BATCH || all.length >= EXPORT_HARD_CAP) break;
  }
  return all;
}

/** Resultado da aprovação: o que foi para a fila e o que o guardrail reteve. */
export interface ApproveResult {
  approved: number;
  blocked: number;
}

/**
 * Aprova em lote por ids (seleção da tabela): pending_review -> queued.
 *
 * Passa por RPC e não por `update` direto porque a nota de venda estornada é
 * PULADA, não aprovada — e um update devolveria só "N linhas", sem distinguir
 * o que foi retido do que nem estava pendente. A RPC devolve os dois números
 * para a tela poder dizer quantas ficaram e por quê.
 */
export async function approveInvoiceJobs(ids: string[]): Promise<ApproveResult> {
  if (ids.length === 0) return { approved: 0, blocked: 0 };
  const { data, error } = await supabase.rpc("approve_invoice_jobs", { p_ids: ids });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { approved: row?.approved ?? 0, blocked: row?.blocked ?? 0 };
}

/**
 * "A venda teve estorno, mas a nota é devida mesmo assim" — o caso do
 * chargeback, em que o serviço foi prestado e o cliente contestou. Libera e
 * manda para a fila no mesmo ato; o motivo fica no metadata.
 */
export async function releaseInvoiceJobForEmission(id: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc("release_invoice_job_for_emission", {
    p_id: id,
    p_motivo: motivo,
  });
  if (error) throw error;
}

/**
 * Descarta uma nota que nunca deve existir. Só antes do Focus: nota autorizada
 * se cancela na prefeitura (`nfse-cancel`), não aqui.
 */
export async function voidInvoiceJob(id: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc("void_invoice_job", { p_id: id, p_motivo: motivo });
  if (error) throw error;
}

/**
 * Reemissão em produção: clona as notas AUTORIZADAS de homologação de uma
 * conexão em novos jobs `producao` + `pending_review` (nada é emitido). Retorna
 * quantas notas foram criadas. Idempotente — reexecutar não duplica.
 */
export async function reemitAuthorizedToProducao(accountId: string): Promise<number> {
  const { data, error } = await supabase.rpc("reemit_authorized_to_producao", {
    p_account_id: accountId,
  });
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}

/** Aprova um job em revisão manual: vai para a fila de emissão. */
export async function approveInvoiceJob(id: string): Promise<void> {
  const { blocked } = await approveInvoiceJobs([id]);
  if (blocked > 0) {
    throw new Error(
      "Esta nota está retida: a venda teve estorno. Libere explicitamente ou descarte a nota.",
    );
  }
}

/** Recoloca um job com erro (rejected/failed) na fila, zerando as tentativas. */
export async function requeueInvoiceJob(id: string): Promise<void> {
  const { error } = await supabase
    .from("invoice_jobs")
    .update({ status: "queued", attempts: 0, next_attempt_at: null })
    .eq("id", id)
    .in("status", ["rejected", "failed"]);
  if (error) throw error;
}

/**
 * Status em que a revisão manual do tomador é permitida: a nota ainda não saiu
 * (ou saiu e voltou). Mexer no tomador de uma nota AUTORIZADA seria falsear um
 * documento fiscal já emitido — para essa há cancelamento, não edição.
 */
export const TOMADOR_EDITABLE_STATUSES: InvoiceJobStatus[] = [
  "pending_review",
  "rejected",
  "failed",
];

export interface SaveTomadorReviewInput {
  id: string;
  userId: string;
  values: TomadorReviewFormValues;
  /** Recoloca a nota na fila no mesmo UPDATE (botão "Salvar e reemitir"). */
  requeue: boolean;
}

/**
 * Grava a correção manual do tomador de uma nota e, opcionalmente, devolve a
 * nota à fila — tudo num único UPDATE, para que nunca exista o estado "corrigi
 * mas não reenviou" por falha no meio do caminho.
 *
 * O endereço original do pagar.me é preservado: a correção entra em
 * `tomador_endereco.nfse_override`, que tem precedência na hora de emitir (ver
 * `supabase/functions/_shared/nfse/address.ts`). Quem revisou e o que mudou fica
 * em `metadata.tomadorRevisao` — além do `audit_log`, que já registra o UPDATE.
 */
export async function saveTomadorReview({
  id,
  userId,
  values,
  requeue,
}: SaveTomadorReviewInput): Promise<void> {
  const current = await supabase
    .from("invoice_jobs")
    .select("status, tomador_endereco, metadata")
    .eq("id", id)
    .single();
  if (current.error) throw current.error;

  const status = current.data.status;
  if (!TOMADOR_EDITABLE_STATUSES.includes(status)) {
    throw new Error(`Nota em "${status}" não aceita revisão do tomador.`);
  }

  const endereco = values as unknown as Record<keyof TomadorEndereco, string>;
  const documento = onlyDigits(values.documento ?? "");
  const metadata = (current.data.metadata ?? {}) as Record<string, unknown>;
  const text = (value: string | undefined): string | null => {
    const trimmed = value?.trim();
    return trimmed != null && trimmed.length > 0 ? trimmed : null;
  };

  const patch: Tables["invoice_jobs"]["Update"] = {
    tomador_documento: documento.length > 0 ? documento : null,
    tomador_nome: text(values.nome),
    tomador_email: text(values.email),
    tomador_endereco: buildEnderecoOverride(
      current.data.tomador_endereco,
      endereco,
    ) as Tables["invoice_jobs"]["Update"]["tomador_endereco"],
    metadata: {
      ...metadata,
      tomadorRevisao: {
        by: userId,
        at: new Date().toISOString(),
        campos: changedEnderecoFields(current.data.tomador_endereco, endereco),
      },
    },
  };

  if (requeue) {
    patch.status = "queued";
    patch.attempts = 0;
    patch.next_attempt_at = null;
    // sair de pending_review é uma aprovação — registra quem autorizou a emissão
    if (status === "pending_review") {
      patch.approved_by = userId;
      patch.approved_at = new Date().toISOString();
    }
  }

  // o guard de status vai no próprio UPDATE: entre o SELECT acima e aqui, o cron
  // pode ter movido a nota. `.select()` confirma que alguma linha casou — sem
  // isso, um 0-rows silencioso viraria um "salvo com sucesso" mentiroso.
  // Atenção: a RLS também nega escrita devolvendo 0 linhas (não erro), então a
  // mensagem cobre as duas causas possíveis — não dá para distingui-las aqui.
  const { data, error } = await supabase
    .from("invoice_jobs")
    .update(patch)
    .eq("id", id)
    .in("status", TOMADOR_EDITABLE_STATUSES)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      "Nada foi salvo: a nota mudou de status durante a edição ou você não tem permissão de escrita nesta empresa.",
    );
  }
}

/** URL assinada para baixar um arquivo (XML/DANFSe) do Storage. */
export async function nfseFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(NFSE_FILES_BUCKET).createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}

/** Baixa um arquivo do Storage como Blob (para empacotar no ZIP). null se falhar. */
export async function downloadNfseFile(path: string): Promise<Blob | null> {
  const { data, error } = await supabase.storage.from(NFSE_FILES_BUCKET).download(path);
  if (error || !data) return null;
  return data;
}

// ---------------------------------------------------------------------------
// Emissão retroativa em lote (invoice_backfill_runs)
// O run é criado pela UI; o pg_cron aciona a Edge Function nfse-backfill que o
// drena (enumera /charges -> hidrata -> cria invoice_jobs como pending_review).
// ---------------------------------------------------------------------------
export type BackfillRunRow = Tables["invoice_backfill_runs"]["Row"];
export type BackfillRun = BackfillRunRow & {
  account: { id: string; label: string; slug: string } | null;
};

/** Preview agregado (dry-run) gravado em `invoice_backfill_runs.preview`. */
export interface BackfillPreview {
  totalJobs: number;
  totalReais: number;
  incompleteAddress: number;
  byCompany: Record<string, { count: number; reais: number }>;
}

/** Diagnóstico do run (por que cada cobrança não virou nota). */
export interface BackfillDiagnostics {
  skipReasons: Record<string, number>;
  unmappedRecipients: Record<string, number>;
  duplicates?: number;
  pageErrors: string[];
}

/** Rótulos amigáveis dos motivos de skip do backfill. */
export const SKIP_REASON_LABELS: Record<string, string> = {
  recipient_not_mapped: "Recebedor não mapeado",
  not_paid: "Cobrança não paga",
  hydrate_failed: "Falha ao carregar detalhe",
  out_of_window: "Fora da janela de datas",
  charge_error: "Erro ao processar cobrança",
};

export interface CreateBackfillRunInput {
  accountId: string;
  organizationId: string;
  createdSince: string; // ISO 8601
  createdUntil: string; // ISO 8601
  dryRun: boolean;
  createdBy: string;
}

const BACKFILL_LIST_LIMIT = 100;

export async function fetchBackfillRuns(): Promise<BackfillRun[]> {
  const { data, error } = await supabase
    .from("invoice_backfill_runs")
    .select("*, account:pagarme_accounts!pagarme_account_id(id, label, slug)")
    .order("created_at", { ascending: false })
    .limit(BACKFILL_LIST_LIMIT);
  if (error) throw error;
  return data ?? [];
}

export async function createBackfillRun(input: CreateBackfillRunInput): Promise<BackfillRunRow> {
  const { data, error } = await supabase
    .from("invoice_backfill_runs")
    .insert({
      pagarme_account_id: input.accountId,
      organization_id: input.organizationId,
      created_since: input.createdSince,
      created_until: input.createdUntil,
      dry_run: input.dryRun,
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** Cancela um run em andamento (o cron para de drená-lo). */
export async function cancelBackfillRun(runId: string): Promise<void> {
  const { error } = await supabase
    .from("invoice_backfill_runs")
    .update({ status: "cancelled" })
    .eq("id", runId)
    .eq("status", "running");
  if (error) throw error;
}

/**
 * Exclui uma carga por completo. Antes de remover o registro, apaga as notas
 * ainda `pending_review` geradas por ela (metadata.backfillRunId) — notas já
 * enviadas para emissão (queued em diante) são PRESERVADAS. Assim dá para
 * re-testar a mesma janela sem colidir com a dedup. Retorna quantas notas
 * pendentes foram removidas.
 */
export async function deleteBackfillRun(runId: string): Promise<number> {
  const { data: removed, error: jobsErr } = await supabase
    .from("invoice_jobs")
    .delete()
    .eq("metadata->>backfillRunId", runId)
    .eq("status", "pending_review")
    .select("id");
  if (jobsErr) throw jobsErr;

  const { error } = await supabase.from("invoice_backfill_runs").delete().eq("id", runId);
  if (error) throw error;
  return removed?.length ?? 0;
}

// ---------------------------------------------------------------------------
// Webhooks recebidos (log de debug — sales_events / focus_events)
// Tabelas restritas a super admin via RLS.
// ---------------------------------------------------------------------------
const WEBHOOK_LIST_LIMIT = 200;

export async function fetchWebhookEvents(filters: WebhookFilters): Promise<WebhookEvent[]> {
  const table = filters.provider === "pagarme" ? "sales_events" : "focus_events";
  let query = supabase
    .from(table)
    .select("*")
    .order("received_at", { ascending: false })
    .limit(WEBHOOK_LIST_LIMIT);

  if (filters.onlyErrors) query = query.not("process_error", "is", null);
  if (filters.onlyUnprocessed) query = query.is("processed_at", null);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const isPagarme = filters.provider === "pagarme";
    return {
      id: r.id as string,
      provider: filters.provider,
      ref: (isPagarme ? r.event_id : r.focus_ref) as string,
      kind: ((isPagarme ? r.event_type : r.status) as string | null) ?? "—",
      resourceId: isPagarme ? ((r.resource_id as string | null) ?? null) : null,
      receivedAt: r.received_at as string,
      processedAt: (r.processed_at as string | null) ?? null,
      processError: (r.process_error as string | null) ?? null,
      payload: r.payload,
    };
  });
}

import type { InvoiceJobDateField, NfseAmbiente, NfseEmissionMode } from "./api";

/** Tons aceitos pelo componente Badge. */
export type BadgeTone = "default" | "accent" | "income" | "expense" | "warning" | "info";

export type FiscalDocumentType = "nfse" | "nfe";

export const DOCUMENT_TYPE_OPTIONS: { value: FiscalDocumentType; label: string }[] = [
  { value: "nfse", label: "NFS-e (serviço)" },
  { value: "nfe", label: "NF-e (produto)" },
];

export const DOCUMENT_TYPE_META: Record<FiscalDocumentType, { label: string; tone: BadgeTone }> = {
  nfse: { label: "NFS-e", tone: "info" },
  nfe: { label: "NF-e", tone: "accent" },
};

/** Regime tributário do emitente (NF-e). */
export const REGIME_TRIBUTARIO_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "1 — Simples Nacional" },
  { value: 2, label: "2 — Simples (excesso sublimite)" },
  { value: 3, label: "3 — Regime Normal" },
];

export const AMBIENTE_OPTIONS: { value: NfseAmbiente; label: string }[] = [
  { value: "homologacao", label: "Homologação" },
  { value: "producao", label: "Produção" },
];

export const EMISSION_MODE_OPTIONS: { value: NfseEmissionMode; label: string }[] = [
  { value: "manual", label: "Manual (revisão)" },
  { value: "automatic", label: "Automático" },
];

export const AMBIENTE_META: Record<NfseAmbiente, { label: string; tone: BadgeTone }> = {
  homologacao: { label: "Homologação", tone: "warning" },
  producao: { label: "Produção", tone: "income" },
};

/** Status dos invoice_jobs — rótulo + tom para a fila de notas. */
export const JOB_STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  pending_review: { label: "Revisão", tone: "warning" },
  approved: { label: "Aprovada", tone: "info" },
  queued: { label: "Na fila", tone: "info" },
  submitting: { label: "Enviando", tone: "info" },
  processing_authorization: { label: "Processando", tone: "info" },
  authorized: { label: "Autorizada", tone: "income" },
  rejected: { label: "Rejeitada", tone: "expense" },
  cancelling: { label: "Cancelando", tone: "warning" },
  cancelled: { label: "Cancelada", tone: "default" },
  voided: { label: "Descartada", tone: "default" },
  failed: { label: "Falhou", tone: "expense" },
};

/**
 * Estado do dinheiro da venda que originou a nota.
 *
 * "Descartada" (`voided`) e "Cancelada" (`cancelled`) são coisas diferentes e a
 * tela não pode borrá-las: a primeira nunca existiu na prefeitura, a segunda
 * existiu e foi cancelada — obrigação acessória, com reflexo na apuração do ISS.
 */
export const REFUND_STATE_META: Record<
  string,
  { label: string; tone: BadgeTone; descricao: string }
> = {
  partial: {
    label: "Estorno parcial",
    tone: "warning",
    descricao:
      "Parte do dinheiro voltou e a cobrança segue paga. A nota é devida, mas por valor menor que o desta fila — emitir o valor cheio documenta serviço que não houve.",
  },
  full: {
    label: "Venda estornada",
    tone: "expense",
    descricao:
      "O dinheiro voltou integralmente. Não há serviço a documentar: a nota foi descartada antes de ser emitida.",
  },
  chargeback: {
    label: "Chargeback",
    tone: "expense",
    descricao:
      "O cliente contestou a cobrança, mas o serviço foi prestado. Contabilmente é perda, não desfazimento da venda — a nota pode continuar devida.",
  },
};

/**
 * Nota RETIDA pelo guardrail: a venda teve estorno e ninguém decidiu o que fazer.
 * Não pode ser aprovada — nem em lote, nem no detalhe — até alguém liberar ou
 * descartar. O banco recusa de qualquer jeito (trigger + RPC); aqui é só para a
 * tela não oferecer um botão que vai falhar.
 */
export function isRefundHeld(job: {
  refund_state: string | null;
  refund_released_at: string | null;
}): boolean {
  return (job.refund_state ?? "none") !== "none" && job.refund_released_at === null;
}

/** Opções do filtro de ambiente na fila de notas. */
export const AMBIENTE_FILTER_VALUES = ["all", "homologacao", "producao"] as const;
export type AmbienteFilter = (typeof AMBIENTE_FILTER_VALUES)[number];

export const AMBIENTE_FILTER_OPTIONS: { value: AmbienteFilter; label: string }[] = [
  { value: "all", label: "Todos os ambientes" },
  { value: "homologacao", label: "Homologação" },
  { value: "producao", label: "Produção" },
];

/** Opções do filtro de origem: webhook (tempo real) vs. backfill (retroativa). */
export const ORIGIN_FILTER_VALUES = ["all", "webhook", "backfill"] as const;
export type OriginFilter = (typeof ORIGIN_FILTER_VALUES)[number];

export const ORIGIN_FILTER_OPTIONS: { value: OriginFilter; label: string }[] = [
  { value: "all", label: "Todas as origens" },
  { value: "webhook", label: "Webhook (tempo real)" },
  { value: "backfill", label: "Retroativa (backfill)" },
];

/** Agrupamentos de status para o filtro da fila de notas. `statuses: null` = todas. */
export const JOB_STATUS_FILTER_VALUES = [
  "review",
  "processing",
  "authorized",
  "problem",
  "discarded",
  "all",
] as const;
export type JobStatusFilter = (typeof JOB_STATUS_FILTER_VALUES)[number];

export const JOB_STATUS_FILTERS: {
  value: JobStatusFilter;
  label: string;
  statuses: string[] | null;
}[] = [
  { value: "review", label: "Aguardando revisão", statuses: ["pending_review"] },
  {
    value: "processing",
    label: "Em processamento",
    statuses: ["approved", "queued", "submitting", "processing_authorization"],
  },
  { value: "authorized", label: "Autorizadas", statuses: ["authorized"] },
  { value: "problem", label: "Com erro", statuses: ["rejected", "failed"] },
  { value: "discarded", label: "Descartadas", statuses: ["voided"] },
  { value: "all", label: "Todas", statuses: null },
];

/**
 * Campo de data do filtro de período, do fato econômico ao fiscal: pagamento da
 * cobrança (`paid_at` — o que gera a nota), criação da cobrança (`charge_created_at`
 * — a compra), entrada na fila (`created_at`) e autorização na prefeitura
 * (`emitida_em`). O campo escolhido também define a ordenação e a primeira coluna
 * da tabela. Em cartão compra e pagamento ficam a segundos; em boleto/pix, a dias.
 */
export const DATE_FIELD_VALUES = [
  "paid_at",
  "charge_created_at",
  "created_at",
  "emitida_em",
] as const;

export const DATE_FIELD_OPTIONS: { value: InvoiceJobDateField; label: string }[] = [
  { value: "paid_at", label: "Data do pagamento" },
  { value: "charge_created_at", label: "Data da compra" },
  { value: "created_at", label: "Entrada na fila" },
  { value: "emitida_em", label: "Data de emissão" },
];

/** Rótulo curto do campo de data para o cabeçalho da tabela. */
export const DATE_FIELD_COLUMN_LABEL: Record<InvoiceJobDateField, string> = {
  paid_at: "Pago em",
  charge_created_at: "Compra",
  created_at: "Na fila",
  emitida_em: "Emitida",
};

// ---------------------------------------------------------------------------
// Cobrança de teste (sandbox). Os cenários DEVEM espelhar SANDBOX_SCENARIOS do
// builder (`supabase/functions/_shared/nfse/sandbox.ts`).
// ---------------------------------------------------------------------------
export const SANDBOX_METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: "credit_card", label: "Cartão de crédito" },
  { value: "pix", label: "Pix" },
  { value: "boleto", label: "Boleto" },
];

export const SANDBOX_SCENARIO_OPTIONS: Record<string, { value: string; label: string }[]> = {
  credit_card: [
    { value: "paid", label: "Aprovada (paga)" },
    { value: "refused", label: "Recusada" },
    { value: "chargeback", label: "Paga → chargeback" },
    { value: "processing_canceled", label: "Processando → cancelada" },
  ],
  pix: [
    { value: "paid", label: "Paga (valor ≤ R$ 500)" },
    { value: "failed", label: "Falha (valor > R$ 500)" },
  ],
  boleto: [
    { value: "paid", label: "Pago integral" },
    { value: "underpaid", label: "Pago a menor" },
    { value: "overpaid", label: "Pago a maior" },
    { value: "unreconciled", label: "Não concilia" },
  ],
};

/** Teto (centavos) do cenário Pix pago no sandbox — espelha o builder. */
export const SANDBOX_PIX_PAID_MAX_CENTS = 50000;

/** URL pública da Edge Function de webhook para uma conta (slug + segredo opcional). */
export function webhookUrl(slug: string, secret?: string): string {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
  const url = `${base}/functions/v1/pagarme-webhook?account=${encodeURIComponent(slug)}`;
  return secret ? `${url}&secret=${encodeURIComponent(secret)}` : url;
}

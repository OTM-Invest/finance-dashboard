import * as React from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Download,
  Loader2,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/AuthProvider";
import { usePermissions } from "@/features/auth/usePermissions";
import { formatDate } from "@/lib/dates";
import { formatDocument } from "@/lib/document";
import { formatBRL } from "@/lib/format";

import { nfseFileUrl, TOMADOR_EDITABLE_STATUSES, type InvoiceJob } from "../api";
import { DOCUMENT_TYPE_META, isRefundHeld, JOB_STATUS_META, REFUND_STATE_META } from "../constants";
import {
  useApproveInvoiceJob,
  useReleaseInvoiceJob,
  useRequeueInvoiceJob,
  useVoidInvoiceJob,
} from "../hooks";
import { deriveTomadorEndereco, ENDERECO_FIELD_LABELS, hasEnderecoOverride } from "../tomador";
import { TomadorReviewForm } from "./TomadorReviewForm";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: InvoiceJob | null;
}

export function InvoiceJobDrawer({ open, onOpenChange, job }: Props) {
  const { user } = useAuth();
  const { canEdit } = usePermissions();
  const approve = useApproveInvoiceJob();
  const requeue = useRequeueInvoiceJob();
  const [editing, setEditing] = React.useState(false);

  // trocar de nota (ou fechar) sempre volta ao modo leitura
  const jobId = job?.id ?? null;
  React.useEffect(() => setEditing(false), [jobId, open]);

  if (!job) return null;

  const status = JOB_STATUS_META[job.status] ?? { label: job.status, tone: "default" as const };
  const docType = job.document_type ?? "nfse";
  const docMeta = DOCUMENT_TYPE_META[docType];
  const isNfe = docType === "nfe";
  const params = (job.parametros ?? {}) as Record<string, unknown>;
  const metadata = (job.metadata ?? {}) as Record<string, unknown>;
  const splitSource = metadata.splitSource as string | undefined;
  const payablesDivergence = metadata.payablesDivergence === true;
  // nota retida pelo guardrail de estorno: nem aprovar nem reenviar, até alguém
  // decidir. O banco recusaria de qualquer forma (trigger + RPC) — aqui a tela
  // deixa de oferecer o botão e mostra as duas saídas reais.
  const retida = isRefundHeld(job);
  const canApprove = job.status === "pending_review" && !retida;
  const canRequeue = (job.status === "rejected" || job.status === "failed") && !retida;
  const { endereco, missing: missingEndereco } = deriveTomadorEndereco(job.tomador_endereco);
  const docDigits = (job.tomador_documento ?? "").replace(/\D/gu, "").length;
  const missingTomador = [
    ...(docDigits === 11 || docDigits === 14 ? [] : ["CPF/CNPJ"]),
    ...missingEndereco.map((f) => ENDERECO_FIELD_LABELS[f]),
  ];
  const isEditable = TOMADOR_EDITABLE_STATUSES.includes(job.status);
  // "falta para emitir" só faz sentido enquanto a nota AINDA vai ser emitida: numa
  // nota já autorizada o aviso seria ruído (e nota velha pode não ter IBGE gravado)
  const needsTomadorFix = isEditable && missingTomador.length > 0;
  // segue o mesmo gate de escrita do resto do app; a RLS confirma no banco
  const canReview = canEdit && isEditable;
  const wasReviewed = hasEnderecoOverride(job.tomador_endereco);
  const hasFocusResult =
    job.numero_nfse != null ||
    job.chave_nfse != null ||
    job.mensagem_sefaz != null ||
    job.erros != null;
  const xmlPath = job.xml_path;
  const danfsePath = job.danfse_path;
  const hasFiles = xmlPath != null || danfsePath != null;

  const download = async (path: string, label: string) => {
    try {
      const url = await nfseFileUrl(path);
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast.error(`Erro ao baixar ${label}`, {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Nota <Badge tone={docMeta.tone}>{docMeta.label}</Badge>
            <Badge tone={status.tone}>{status.label}</Badge>
          </SheetTitle>
          <SheetDescription>
            {job.account?.label ?? "—"} · {formatDate(job.created_at)}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-5">
          <Section title="Resumo">
            <Row
              label="Empresa"
              value={job.company?.trade_name ?? job.company?.legal_name ?? "—"}
            />
            <Row label="Valor" value={formatBRL(job.valor_servicos)} mono />
            <Row label="Ambiente" value={job.ambiente} />
            <Row label="Cobrança" value={job.pagarme_charge_id ?? "—"} mono />
            <Row label="Recebedor" value={job.pagarme_recipient_id ?? "(sem split)"} mono />
            {splitSource && (
              <Row
                label="Origem do split"
                value={splitSource === "payables" ? "payables (validado)" : "webhook"}
              />
            )}
          </Section>

          {retida && (
            <RefundDecision job={job} canDecide={canEdit} onDone={() => onOpenChange(false)} />
          )}

          {payablesDivergence && (
            <p className="text-2xs rounded-[var(--radius-sm)] bg-warning-soft p-2 text-warning">
              Divergência entre o split do webhook e os payables — enviado para revisão. Confira o
              valor antes de aprovar.
            </p>
          )}

          <Section
            title="Tomador"
            action={
              canReview && !editing ? (
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                  <Pencil className="size-3.5" /> Revisar
                </Button>
              ) : undefined
            }
          >
            {editing ? (
              <TomadorReviewForm
                job={job}
                onCancel={() => setEditing(false)}
                onSaved={(requeued) => {
                  setEditing(false);
                  toast.success(
                    requeued ? "Dados salvos — nota reenviada para a fila" : "Dados salvos",
                  );
                  if (requeued) onOpenChange(false);
                }}
              />
            ) : (
              <>
                <Row label="Nome" value={job.tomador_nome ?? "—"} />
                <Row
                  label="Documento"
                  value={job.tomador_documento ? formatDocument(job.tomador_documento) : "—"}
                  mono
                />
                <Row label="E-mail" value={job.tomador_email ?? "—"} />
                <Row label="Logradouro" value={enderecoLinha(endereco)} />
                <Row label="Bairro" value={endereco.bairro ?? "—"} />
                <Row
                  label="Município"
                  value={[endereco.municipio, endereco.uf].filter(Boolean).join(" / ") || "—"}
                />
                <Row label="CEP" value={endereco.cep ?? "—"} mono />
                <Row label="Código IBGE" value={endereco.codigoMunicipio ?? "—"} mono />
                {wasReviewed && (
                  <p className="text-2xs pt-1 text-text-subtle">Endereço corrigido manualmente.</p>
                )}
              </>
            )}
          </Section>

          {!editing && needsTomadorFix && (
            <p className="text-2xs rounded-[var(--radius-sm)] bg-warning-soft p-2 text-warning">
              Faltando para emitir: <strong>{missingTomador.join(", ")}</strong>
              {canReview ? " — use Revisar para completar." : ""}
            </p>
          )}

          <Section title="Classificação fiscal">
            {isNfe ? (
              <>
                <Row label="Produto" value={(params.descricao as string) ?? "—"} />
                <Row label="NCM" value={(params.ncm as string) ?? "—"} mono />
                <Row
                  label="CFOP"
                  value={
                    [params.cfopInterno, params.cfopInterestadual].filter(Boolean).join(" / ") ||
                    "—"
                  }
                  mono
                />
                <Row label="CST ICMS" value={(params.cstIcms as string) ?? "—"} mono />
                <Row label="cBenef" value={(params.codigoBeneficioFiscal as string) ?? "—"} mono />
                <Row
                  label="PIS / COFINS"
                  value={pisCofinsLabel(params.pisAliquota, params.cofinsAliquota)}
                  mono
                />
              </>
            ) : (
              <>
                <Row label="Item LC116" value={job.item_lista_servico ?? "—"} mono />
                <Row label="Cód. tributário" value={job.codigo_tributario_municipio ?? "—"} mono />
                <Row
                  label="ISS"
                  value={job.aliquota_iss == null ? "—" : `${(job.aliquota_iss * 100).toFixed(2)}%`}
                  mono
                />
              </>
            )}
          </Section>

          {hasFocusResult && (
            <Section title="Resultado Focus">
              {job.numero_nfse && <Row label="Número" value={job.numero_nfse} mono />}
              {job.chave_nfse && <Row label="Chave" value={job.chave_nfse} mono />}
              {job.mensagem_sefaz && (
                <p className="text-2xs rounded-[var(--radius-sm)] bg-expense-soft p-2 text-expense">
                  {job.mensagem_sefaz}
                </p>
              )}
              {job.erros != null && (
                <pre className="text-2xs overflow-x-auto rounded-[var(--radius-sm)] bg-surface-2 p-2">
                  {JSON.stringify(job.erros, null, 2)}
                </pre>
              )}
            </Section>
          )}

          {job.attempts > 0 && (
            <p className="text-2xs text-text-subtle">
              {job.attempts} tentativa(s)
              {job.last_attempt_at ? ` · última em ${formatDate(job.last_attempt_at)}` : ""}
            </p>
          )}

          {hasFiles && (
            <div className="flex gap-2">
              {xmlPath && (
                <Button size="sm" variant="outline" onClick={() => void download(xmlPath, "XML")}>
                  <Download className="size-3.5" /> XML
                </Button>
              )}
              {danfsePath && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void download(danfsePath, "DANFSe")}
                >
                  <Download className="size-3.5" /> DANFSe
                </Button>
              )}
            </div>
          )}
        </SheetBody>

        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {canApprove && !editing && (
            <Button
              disabled={approve.isPending || !user}
              onClick={() => {
                approve.mutate(job.id, {
                  onSuccess: () => {
                    toast.success("Nota aprovada — enviada para a fila");
                    onOpenChange(false);
                  },
                  onError: (err) => toast.error("Erro ao aprovar", { description: err.message }),
                });
              }}
            >
              {approve.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Aprovar
            </Button>
          )}
          {canRequeue && !editing && (
            <Button
              disabled={requeue.isPending}
              onClick={() => {
                requeue.mutate(job.id, {
                  onSuccess: () => {
                    toast.success("Nota recolocada na fila");
                    onOpenChange(false);
                  },
                  onError: (err) => toast.error("Erro ao reemitir", { description: err.message }),
                });
              }}
            >
              {requeue.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Reemitir
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function pisCofinsLabel(pis: unknown, cofins: unknown): string {
  const fmt = (v: unknown) => (typeof v === "number" ? `${v}%` : "—");
  if (pis == null && cofins == null) return "—";
  return `${fmt(pis)} / ${fmt(cofins)}`;
}

/** Linha "Rua X, 100 - Sala 5" a partir do endereço derivado. */
function enderecoLinha(endereco: {
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
}): string {
  const rua = [endereco.logradouro, endereco.numero].filter(Boolean).join(", ");
  return [rua, endereco.complemento].filter(Boolean).join(" - ") || "—";
}

const MOTIVO_MIN = 10;

/**
 * As duas saídas de uma nota retida por estorno — e só elas.
 *
 * Não há "aprovar assim mesmo" silencioso: emitir uma nota cuja venda voltou é
 * documentar serviço que pode não ter existido, e descartar uma que era devida
 * apaga receita. Ambas pedem motivo escrito, que fica no metadata do job com
 * autor e horário, porque a pergunta do contador vem meses depois.
 *
 * O caso que justifica "emitir mesmo assim" é o chargeback: o serviço foi
 * prestado e o cliente contestou — a nota continua devida e a perda é
 * inadimplência, não desfazimento da venda.
 */
function RefundDecision({
  job,
  canDecide,
  onDone,
}: {
  job: InvoiceJob;
  canDecide: boolean;
  onDone: () => void;
}) {
  const release = useReleaseInvoiceJob();
  const voidJob = useVoidInvoiceJob();
  const [acao, setAcao] = React.useState<"release" | "void" | null>(null);
  const [motivo, setMotivo] = React.useState("");

  const meta = REFUND_STATE_META[job.refund_state];
  if (!meta) return null;

  const pendente = release.isPending || voidJob.isPending;
  const motivoOk = motivo.trim().length >= MOTIVO_MIN;

  function confirmar() {
    if (!acao || !motivoOk) return;
    const mutation = acao === "release" ? release : voidJob;
    const sucesso = acao === "release" ? "Nota liberada e enviada para a fila" : "Nota descartada";
    mutation.mutate(
      { id: job.id, motivo: motivo.trim() },
      {
        onSuccess: () => {
          toast.success(sucesso);
          onDone();
        },
        onError: (err) => toast.error("Não foi possível concluir", { description: err.message }),
      },
    );
  }

  return (
    <div className="space-y-3 rounded-[var(--radius-md)] border border-expense/40 bg-expense-soft p-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 shrink-0 text-expense" />
        <Badge tone={meta.tone}>{meta.label}</Badge>
        {job.refund_detected_at && (
          <span className="text-2xs text-text-muted">
            detectado em {formatDate(job.refund_detected_at)}
          </span>
        )}
      </div>
      <p className="text-xs text-text-muted">{meta.descricao}</p>

      {!canDecide ? (
        <p className="text-2xs text-text-subtle">
          Esta nota está retida. Você não tem permissão de escrita nesta empresa para decidir.
        </p>
      ) : acao === null ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setAcao("release")}>
            Emitir mesmo assim
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAcao("void")}>
            <Ban className="size-3.5" /> Descartar nota
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            rows={2}
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={
              acao === "release"
                ? "Por que esta nota é devida apesar do estorno?"
                : "Por que esta nota não deve existir?"
            }
          />
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={!motivoOk || pendente} onClick={confirmar}>
              {pendente ? <Loader2 className="size-4 animate-spin" /> : null}
              {acao === "release" ? "Confirmar emissão" : "Confirmar descarte"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pendente}
              onClick={() => {
                setAcao(null);
                setMotivo("");
              }}
            >
              Cancelar
            </Button>
            <span className="text-2xs text-text-subtle">
              mínimo {MOTIVO_MIN} caracteres — fica no histórico da nota
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <div className="text-2xs font-semibold tracking-wide text-text-subtle uppercase">
          {title}
        </div>
        {action}
      </div>
      <div className="space-y-1 rounded-[var(--radius-md)] border border-border bg-surface p-3">
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="shrink-0 text-text-subtle">{label}</span>
      <span className={mono ? "truncate text-right font-mono text-xs" : "truncate text-right"}>
        {value}
      </span>
    </div>
  );
}

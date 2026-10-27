/**
 * Conferência: que lançamento cada conjunto de relatórios do CRM abre.
 *
 * Em cima, os relatórios ainda sem lançamento, agrupados por empresa × tipo × mês, com o
 * lançamento sugerido (`suggestStatements`) — uma pessoa confirma, o banco refaz a conta.
 * Embaixo, o que já foi aberto: conferido, ou parado na diferença relatório × nota até
 * alguém aceitá-la por escrito (decisão D1).
 */
import * as React from "react";
import { CheckCircle2, RotateCcw, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Money, Tag } from "@/features/spending/components/ui";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

import type { CrmReportRow, PendingRevenueTransaction, RevenueStatementRow } from "../api";
import { KIND_LABELS, suggestStatements, toCents, type StatementSuggestion } from "../compute";
import {
  useAcceptRevenueDifference,
  useDeleteRevenueStatement,
  useSaveRevenueStatement,
} from "../hooks";

interface Props {
  reports: CrmReportRow[];
  pending: PendingRevenueTransaction[];
  statements: RevenueStatementRow[];
  companyName: (id: string) => string;
  canEdit: boolean;
}

function monthLabel(month: string): string {
  return formatDate(month, "MMM/yyyy");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Erro desconhecido";
}

export function StatementsSection({ reports, pending, statements, companyName, canEdit }: Props) {
  const open = reports.filter((r) => !r.statementId && !r.removedAt);
  const suggestions = React.useMemo(
    () =>
      suggestStatements(
        open.map((r) => ({
          id: r.id,
          companyId: r.companyId,
          kind: r.kind,
          referenceMonth: r.referenceMonth,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          totalCents: toCents(r.totalCommission),
        })),
        pending.map((t) => ({
          id: t.id,
          companyId: t.companyId,
          accrualDate: t.accrualDate,
          amountCents: toCents(t.amount),
        })),
      ),
    [open, pending],
  );
  const reportById = new Map(reports.map((r) => [r.id, r]));

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Relatórios do CRM ainda sem lançamento</h2>
        {suggestions.length === 0 ? (
          <EmptyState>Todo relatório sincronizado já abre um lançamento.</EmptyState>
        ) : (
          suggestions.map((s) => (
            <SuggestionCard
              key={s.key}
              suggestion={s}
              reports={s.reportIds.map((id) => reportById.get(id)).filter((r) => r != null)}
              pending={pending.filter((t) => t.companyId === s.companyId)}
              companyName={companyName}
              canEdit={canEdit}
            />
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Lançamentos abertos</h2>
        {statements.length === 0 ? (
          <EmptyState>Nenhum lançamento de receita aberto ainda.</EmptyState>
        ) : (
          statements.map((s) => (
            <StatementCard
              key={s.id}
              statement={s}
              reports={s.reportIds.map((id) => reportById.get(id)).filter((r) => r != null)}
              companyName={companyName}
              canEdit={canEdit}
            />
          ))
        )}
      </section>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  reports,
  pending,
  companyName,
  canEdit,
}: {
  suggestion: StatementSuggestion;
  reports: CrmReportRow[];
  pending: PendingRevenueTransaction[];
  companyName: (id: string) => string;
  canEdit: boolean;
}) {
  const [transactionId, setTransactionId] = React.useState(suggestion.suggestedTransactionId ?? "");
  const save = useSaveRevenueStatement();
  const chosen = pending.find((t) => t.id === transactionId);
  const differenceCents = chosen ? toCents(chosen.amount) - suggestion.totalCents : null;

  const submit = () => {
    save.mutate(
      { transactionId, reportIds: suggestion.reportIds },
      {
        onSuccess: (r) =>
          r.status === "reconciled"
            ? toast.success("Lançamento aberto e conferido — já está no Balanço")
            : toast.warning("Lançamento aberto com diferença relatório × nota", {
                description: "Ele só entra no Balanço depois que alguém aceitar a diferença.",
              }),
        onError: (e) => toast.error("Não foi possível abrir", { description: errorText(e) }),
      },
    );
  };

  return (
    <div className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm">
          <span className="font-semibold">
            {KIND_LABELS[suggestion.kind]} · {monthLabel(suggestion.referenceMonth)}
          </span>{" "}
          <span className="text-text-muted">· {companyName(suggestion.companyId)}</span>
        </div>
        <div className="font-semibold tabular-nums">{formatBRL(suggestion.totalCents / 100)}</div>
      </div>
      <ul className="text-xs text-text-muted">
        {reports.map((r) => (
          <li key={r.id}>
            {r.fileName ?? r.fileKey} — <Money value={r.totalCommission} />
            {r.periodStart && r.periodEnd && (
              <>
                {" "}
                · {formatDate(r.periodStart)} a {formatDate(r.periodEnd)}
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Select value={transactionId} onValueChange={setTransactionId} disabled={!canEdit}>
          <SelectTrigger size="sm" className="max-w-md">
            <SelectValue placeholder="Escolha o lançamento de receita" />
          </SelectTrigger>
          <SelectContent>
            {pending.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {formatDate(t.accrualDate)} · {formatBRL(t.amount)} · {t.description}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {differenceCents != null &&
          (differenceCents === 0 ? (
            <Tag tone="info">fecha ao centavo</Tag>
          ) : (
            <Tag tone="warning">diferença {formatBRL(differenceCents / 100)}</Tag>
          ))}
        <Button size="sm" disabled={!canEdit || !transactionId || save.isPending} onClick={submit}>
          Abrir lançamento
        </Button>
      </div>
      {suggestion.suggestedTransactionId == null && (
        <p className="text-xs text-text-muted">
          Nenhum lançamento do mês tem valor próximo. Escolha à mão — a diferença fica à vista e
          precisa ser aceita.
        </p>
      )}
    </div>
  );
}

function StatementCard({
  statement,
  reports,
  companyName,
  canEdit,
}: {
  statement: RevenueStatementRow;
  reports: CrmReportRow[];
  companyName: (id: string) => string;
  canEdit: boolean;
}) {
  const [note, setNote] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const accept = useAcceptRevenueDifference();
  const remove = useDeleteRevenueStatement();
  const save = useSaveRevenueStatement();

  const failing = statement.validation.filter((c) => !c.ok);
  const onlyDifference =
    statement.status === "needs_review" &&
    failing.length > 0 &&
    failing.every((c) => c.code === "ledger");
  const liveReportIds = reports.filter((r) => !r.removedAt).map((r) => r.id);
  const reconciled = statement.status === "reconciled";

  const rebuild = () =>
    save.mutate(
      { transactionId: statement.transactionId, reportIds: liveReportIds, replace: true },
      {
        onSuccess: () => toast.success("Lançamento montado de novo com o relatório atual"),
        onError: (e) =>
          toast.error("Não foi possível montar de novo", { description: errorText(e) }),
      },
    );

  return (
    <div className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {reconciled ? (
              <CheckCircle2 className="size-4 text-income" aria-label="Conferido" />
            ) : (
              <XCircle className="size-4 text-warning" aria-label="Para conferir" />
            )}
            {KIND_LABELS[statement.kind]} · {companyName(statement.companyId)}
            {reconciled ? (
              <Tag tone="info">no Balanço</Tag>
            ) : (
              <Tag tone="warning">fora do Balanço</Tag>
            )}
          </div>
          <div className="text-xs text-text-muted">
            {statement.transaction
              ? `${formatDate(statement.transaction.accrualDate)} · ${statement.transaction.description}`
              : "Lançamento apagado"}{" "}
            · {reports.map((r) => r.fileName ?? r.fileKey).join(", ")}
          </div>
        </div>
        <div className="text-right text-sm tabular-nums">
          <div>
            Lançamento <Money value={statement.ledgerAmount} />
          </div>
          <div className="text-text-muted">
            Relatórios <Money value={statement.reportTotal} muted />
          </div>
          {statement.difference !== 0 && (
            <div className={reconciled ? "text-text-muted" : "text-warning"}>
              Diferença <Money value={statement.difference} />
            </div>
          )}
        </div>
      </div>

      {failing.length > 0 && (
        <ul className="space-y-1 text-xs">
          {failing.map((c, i) => (
            <li key={`${c.code}-${i}`} className="text-expense">
              {c.label}
              {c.expectedCents != null && c.gotCents != null && (
                <span className="font-mono text-text-muted">
                  {" "}
                  — esperado {formatBRL(c.expectedCents / 100)}, relatórios{" "}
                  {formatBRL(c.gotCents / 100)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {reconciled && statement.differenceNote && (
        <p className="text-xs text-text-muted">
          Diferença aceita
          {statement.differenceAcceptedAt && ` em ${formatDate(statement.differenceAcceptedAt)}`}: “
          {statement.differenceNote}”
        </p>
      )}

      {canEdit && onlyDifference && (
        <div className="space-y-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Por que o relatório não bate com o que o BTG pagou? (vai para a auditoria)"
            rows={2}
          />
          <Button
            size="sm"
            disabled={note.trim().length < 10 || accept.isPending}
            onClick={() =>
              accept.mutate(
                { statementId: statement.id, note },
                {
                  onSuccess: () =>
                    toast.success("Diferença aceita — o lançamento entrou no Balanço"),
                  onError: (e) =>
                    toast.error("Não foi possível aceitar", { description: errorText(e) }),
                },
              )
            }
          >
            Aceitar a diferença como linha própria
          </Button>
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {!reconciled && !onlyDifference && liveReportIds.length > 0 && (
            <Button size="sm" variant="outline" disabled={save.isPending} onClick={rebuild}>
              <RotateCcw className="size-3.5" /> Montar de novo
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-3.5" /> Desfazer abertura
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Desfazer a abertura?"
        description="As linhas por assessor e produto saem; o lançamento volta inteiro para o Balanço. Os relatórios ficam disponíveis para abrir de novo."
        confirmLabel="Desfazer"
        tone="danger"
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(statement.id, {
            onSuccess: () => toast.success("Abertura desfeita"),
            onError: (e) => toast.error("Não foi possível desfazer", { description: errorText(e) }),
          })
        }
      />
    </div>
  );
}

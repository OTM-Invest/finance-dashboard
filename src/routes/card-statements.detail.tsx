import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Loader2, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/features/auth/usePermissions";
import type { CardStatementLineRow } from "@/features/card-statements/api";
import { CreateRuleSheet } from "@/features/card-statements/components/CreateRuleSheet";
import {
  StatementLinesTable,
  type ItemOptionGroup,
} from "@/features/card-statements/components/StatementLinesTable";
import { ValidationChecks } from "@/features/card-statements/components/ValidationChecks";
import {
  useAcceptSuggestions,
  useApplyClassificationRules,
  useCardStatement,
  useClassifyCardLine,
  useDeleteCardStatement,
  useRequestAiSuggestions,
} from "@/features/card-statements/hooks";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { useManagementAccounts } from "@/features/management-accounts/hooks";
import { buildManagementTree } from "@/features/management-accounts/tree";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

const UNCLASSIFIED = "A classificar";

function lineTotal(line: CardStatementLineRow): number {
  const gross = line.amount + line.iof_amount;
  return line.line_kind === "refund" ? -gross : gross;
}

/**
 * Uma fatura aberta: as conferências, a distribuição por grupo do plano gerencial e as
 * compras para classificar. Total de cada grupo + "A classificar" = total da fatura,
 * sempre.
 */
export default function CardStatementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { companies } = useCompanyScope();
  const { canEdit } = usePermissions();
  const statementQuery = useCardStatement(id);
  const managementQuery = useManagementAccounts();
  const classify = useClassifyCardLine();
  const remove = useDeleteCardStatement();
  const applyRules = useApplyClassificationRules();
  const suggest = useRequestAiSuggestions();
  const accept = useAcceptSuggestions();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [ruleLine, setRuleLine] = React.useState<CardStatementLineRow | null>(null);
  // Revisar começa pelo que falta e vale mais: os dez maiores pendentes cobrem quase todo
  // o dinheiro.
  const [pendingFirst, setPendingFirst] = React.useState(true);

  const groups = React.useMemo<ItemOptionGroup[]>(() => {
    const { groups: tree } = buildManagementTree(
      (managementQuery.data ?? []).filter(
        (a) => a.is_active && (a.kind === "expense" || a.kind === "financial"),
      ),
      [],
    );
    return tree
      .filter(({ group }) => !group.requires_detail)
      .map(({ group, items }) => ({
        id: group.id,
        name: group.name,
        items: items.map(({ account }) => ({ id: account.id, name: account.name })),
      }));
  }, [managementQuery.data]);

  const statement = statementQuery.data;

  const distribution = React.useMemo(() => {
    if (!statement) return [];
    const groupOf = new Map<string, string>();
    for (const g of groups) for (const item of g.items) groupOf.set(item.id, g.name);
    const totals = new Map<string, number>();
    for (const line of statement.lines) {
      const key =
        line.management_account_id && line.classification_status === "confirmed"
          ? (groupOf.get(line.management_account_id) ?? UNCLASSIFIED)
          : UNCLASSIFIED;
      totals.set(key, (totals.get(key) ?? 0) + lineTotal(line));
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [statement, groups]);

  if (statementQuery.isLoading) {
    return (
      <div className="mx-auto max-w-[var(--content-max-width)] space-y-3 p-6 lg:p-8">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (!statement) {
    return (
      <div className="mx-auto max-w-[var(--content-max-width)] p-6 lg:p-8">
        <p className="text-sm text-expense">
          {statementQuery.error?.message ?? "Fatura não encontrada."}
        </p>
      </div>
    );
  }

  const company = companies.find((c) => c.id === statement.company_id);
  const companyName = company?.trade_name ?? "—";
  const pendingCount = statement.lines.filter(
    (l) => l.classification_status !== "confirmed",
  ).length;
  const suggestedCount = statement.lines.filter(
    (l) => l.classification_status === "suggested",
  ).length;
  const unclassifiedCount = statement.lines.filter(
    (l) => l.classification_status === "unclassified",
  ).length;
  const statementId = statement.id;

  const orderedLines = pendingFirst
    ? [...statement.lines].sort((a, b) => {
        const pa = a.classification_status === "confirmed" ? 1 : 0;
        const pb = b.classification_status === "confirmed" ? 1 : 0;
        return pa - pb || lineTotal(b) - lineTotal(a);
      })
    : statement.lines;

  const itemLabel = (itemId: string | null) => {
    for (const g of groups) {
      const item = g.items.find((i) => i.id === itemId);
      if (item) return `${g.name} · ${item.name}`;
    }
    return "—";
  };

  const onError = (title: string) => (err: Error) =>
    toast.error(title, { description: err.message });

  function onClassify(
    line: CardStatementLineRow,
    change: { managementAccountId?: string | null; costCenterId?: string | null },
  ) {
    classify.mutate(
      {
        lineId: line.id,
        managementAccountId:
          change.managementAccountId === undefined
            ? line.management_account_id
            : change.managementAccountId,
        costCenterId: change.costCenterId === undefined ? line.cost_center_id : change.costCenterId,
      },
      {
        onError: (err) => toast.error("Não foi possível classificar", { description: err.message }),
      },
    );
  }

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <Link
        to="/faturas"
        className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text"
      >
        <ArrowLeft className="size-3.5" /> Faturas de cartão
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
            {companyName} · fecha {formatDate(statement.closing_date)} · vence{" "}
            {formatDate(statement.due_date)}
          </div>
          <h1 className="mt-1 flex items-center gap-3 font-display text-3xl font-semibold tracking-tight tabular-nums">
            {formatBRL(statement.total_amount)}
            {statement.status === "reconciled" ? (
              <Badge tone="income">Conferida</Badge>
            ) : (
              <Badge tone="expense">Não fecha</Badge>
            )}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {statement.lines.length} compras ·{" "}
            {pendingCount === 0 ? "todas classificadas" : `${pendingCount} a classificar`}
            {statement.status !== "reconciled" && " · fora da visão gerencial até a soma fechar"}
          </p>
        </div>
        {canEdit && (
          <Button variant="outline" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" /> Apagar detalhamento
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <section aria-labelledby="distribution-heading" className="space-y-2">
          <h2 id="distribution-heading" className="text-sm font-semibold">
            Para onde foi
          </h2>
          <ul className="space-y-1.5">
            {distribution.map(([name, value]) => (
              <li key={name} className="flex items-center gap-3 text-sm">
                <span className="w-44 shrink-0 truncate">{name}</span>
                <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className={
                      name === UNCLASSIFIED
                        ? "absolute inset-y-0 left-0 bg-warning"
                        : "absolute inset-y-0 left-0 bg-accent"
                    }
                    style={{
                      width: `${Math.max(0, Math.min(100, (value / statement.total_amount) * 100))}%`,
                    }}
                  />
                </span>
                <span className="w-28 shrink-0 text-right font-mono tabular-nums">
                  {formatBRL(value)}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="checks-heading" className="space-y-2">
          <h2 id="checks-heading" className="text-sm font-semibold">
            Conferência
          </h2>
          <ValidationChecks checks={statement.validation} />
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="mr-auto flex cursor-pointer items-center gap-2 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={pendingFirst}
            onChange={(e) => setPendingFirst(e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          A classificar primeiro, por valor
        </label>
        {canEdit && (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={applyRules.isPending}
              onClick={() =>
                applyRules.mutate(statementId, {
                  onSuccess: (n) =>
                    toast.success(
                      n > 0 ? `${n} compra(s) classificadas por regra` : "Nenhuma regra nova casou",
                    ),
                  onError: onError("Não foi possível aplicar as regras"),
                })
              }
            >
              {applyRules.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Wand2 className="size-3.5" />
              )}
              Aplicar regras
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={suggest.isPending || unclassifiedCount === 0}
              title="A IA sugere; nada conta no Balanço até você aceitar"
              onClick={() =>
                suggest.mutate(statementId, {
                  onSuccess: (n) =>
                    toast.success(
                      n > 0
                        ? `${n} sugestão(ões) — confira e aceite`
                        : "A IA não teve segurança para sugerir",
                    ),
                  onError: onError("Não foi possível pedir sugestões"),
                })
              }
            >
              {suggest.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              Sugerir com IA
            </Button>
            <Button
              size="sm"
              disabled={accept.isPending || suggestedCount === 0}
              onClick={() =>
                accept.mutate(
                  { statementId },
                  {
                    onSuccess: () => toast.success("Sugestões aceitas"),
                    onError: onError("Não foi possível aceitar"),
                  },
                )
              }
            >
              <Check className="size-3.5" /> Aceitar sugestões
              {suggestedCount > 0 && ` (${suggestedCount})`}
            </Button>
          </>
        )}
      </div>

      <StatementLinesTable
        lines={orderedLines}
        groups={groups}
        canEdit={canEdit}
        onClassify={onClassify}
        onAccept={(line) =>
          accept.mutate(
            { statementId, lineIds: [line.id] },
            { onError: onError("Não foi possível aceitar") },
          )
        }
        onCreateRule={setRuleLine}
      />

      {company && (
        <CreateRuleSheet
          line={ruleLine}
          statementId={statementId}
          companyId={company.id}
          organizationId={company.organization_id}
          itemLabel={itemLabel}
          onOpenChange={(open) => {
            if (!open) setRuleLine(null);
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Apagar o detalhamento desta fatura?"
        description={
          <>
            As compras e a classificação delas são apagadas. O lançamento da fatura fica intacto e
            volta a aparecer inteiro, como &quot;Fatura de cartão&quot;, na visão gerencial.
          </>
        }
        confirmLabel="Apagar"
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(statement.id, {
            onSuccess: () => {
              toast.success("Detalhamento apagado");
              void navigate("/faturas");
            },
            onError: (err) => toast.error("Não foi possível apagar", { description: err.message }),
          })
        }
      />
    </div>
  );
}

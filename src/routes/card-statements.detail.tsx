import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/features/auth/usePermissions";
import type { CardStatementLineRow } from "@/features/card-statements/api";
import {
  StatementLinesTable,
  type ItemOptionGroup,
} from "@/features/card-statements/components/StatementLinesTable";
import { ValidationChecks } from "@/features/card-statements/components/ValidationChecks";
import {
  useCardStatement,
  useClassifyCardLine,
  useDeleteCardStatement,
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
  const [confirmDelete, setConfirmDelete] = React.useState(false);

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

  const companyName = companies.find((c) => c.id === statement.company_id)?.trade_name ?? "—";
  const pendingCount = statement.lines.filter(
    (l) => l.classification_status !== "confirmed",
  ).length;

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

      <StatementLinesTable
        lines={statement.lines}
        groups={groups}
        canEdit={canEdit}
        onClassify={onClassify}
      />

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

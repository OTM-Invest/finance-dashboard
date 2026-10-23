/**
 * Lançamentos por trás de uma linha do balanço.
 *
 * A lista usa exatamente os mesmos filtros da série que alimenta a matriz
 * (competência, status e o lado do dinheiro que a medida da linha soma), para o
 * que aparece aqui somar o número que o usuário clicou.
 */
import { AlertTriangle } from "lucide-react";

import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { formatBRL, formatNumber, formatPercent } from "@/lib/format";

import { LINE_TRANSACTIONS_LIMIT, type LineTransaction } from "../api";
import type { BalanceMatrixLine } from "../compute";
import {
  BASIS_LABELS,
  describeDrilldown,
  drilldownSpansAreas,
  type AccountingBasis,
} from "../drilldown";
import { useLineTransactions } from "../hooks";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: BalanceMatrixLine | null;
  companyIds: string[] | null;
  from: string;
  to: string;
  basis: AccountingBasis;
  periodLabel: string;
}

/**
 * Título do lançamento: a contraparte é quem identifica a linha ("Giovanni
 * Pignoli Barcelini"). A descrição livre entra só como reserva, porque nem todo
 * lançamento tem contraparte e um card sem título é pior que um título feio.
 */
function titleOf(row: LineTransaction): string {
  const counterparty = row.counterparty?.name.trim();
  if (counterparty) return counterparty;
  const description = row.description.trim();
  return description || "Sem identificação";
}

const STATUS_LABELS: Record<string, string> = {
  settled: "Liquidado",
  reconciled: "Conciliado",
  pending: "Pendente",
  scheduled: "Agendado",
  canceled: "Cancelado",
};

export function BalanceLineTransactionsSheet({
  open,
  onOpenChange,
  line,
  companyIds,
  from,
  to,
  basis,
  periodLabel,
}: Props) {
  const drilldown = line?.drilldown ?? null;
  const query = useLineTransactions(companyIds, from, to, open ? drilldown : null, basis);

  const rows = query.data?.rows ?? [];
  const totalCount = query.data?.totalCount ?? 0;
  const truncated = totalCount > rows.length;

  // Com uma área só, repetir o nome em toda linha é ruído. Com várias (ou no "Não
  // classificado"), é informação.
  const showArea = drilldown != null && drilldownSpansAreas(drilldown);

  const total =
    line?.total == null
      ? "—"
      : line.format === "percent"
        ? formatPercent(line.total, { fromHundred: true })
        : formatBRL(line.total);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="lg" className="flex flex-col p-0">
        <SheetHeader>
          <SheetTitle>{line?.label ?? "—"}</SheetTitle>
          <SheetDescription>
            {drilldown
              ? `${describeDrilldown(drilldown)} · ${periodLabel} · ${BASIS_LABELS[basis]}`
              : `${periodLabel} · ${BASIS_LABELS[basis]}`}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Summary label="Total do período" value={total} />
            <Summary label="Lançamentos" value={query.isLoading ? "…" : formatNumber(totalCount)} />
          </div>

          {truncated && (
            <p className="text-2xs flex items-start gap-1.5 rounded-[var(--radius-md)] border border-border bg-surface-2/60 p-2.5 text-text-muted">
              <AlertTriangle className="mt-px size-3 shrink-0" />
              Mostrando os {LINE_TRANSACTIONS_LIMIT} mais recentes de {formatNumber(totalCount)}. O
              total acima considera todos.
            </p>
          )}

          {query.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : query.isError ? (
            <p className="rounded-[var(--radius-md)] border border-expense/40 bg-expense/5 p-3 text-sm text-expense">
              Não foi possível carregar os lançamentos.
            </p>
          ) : rows.length === 0 ? (
            <p className="rounded-[var(--radius-md)] border border-dashed border-border p-8 text-center text-sm text-text-muted">
              Nenhum lançamento nesta linha no período.
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-md)] border border-border">
              {rows.map((row) => (
                <li key={row.id} className="px-3 py-2.5 hover:bg-surface-2/50">
                  {/* Linha 1 — só o título, com a largura inteira do card. */}
                  <div className="truncate text-sm" title={titleOf(row)}>
                    {titleOf(row)}
                  </div>

                  {/* Linha 2 — data, conta e valor. Só a conta encolhe: data e
                      valor têm `shrink-0`, então o valor nunca é cortado. */}
                  <div className="text-2xs mt-1 flex items-baseline gap-2 text-text-muted">
                    <span className="shrink-0 font-mono">{formatDate(row.accrual_date)}</span>
                    {showArea && (
                      <span className="shrink-0 text-text-subtle">
                        {row.area?.name ?? "Sem área"}
                      </span>
                    )}
                    {/* `min-w-0` é o que permite encolher: filho de flex tem
                        `min-width: auto` por padrão e não trunca sem isso — foi o
                        que empurrava o valor para fora do card. */}
                    <span
                      className="min-w-0 truncate"
                      title={row.account ? `${row.account.code} ${row.account.name}` : undefined}
                    >
                      {row.account ? `${row.account.code} ${row.account.name}` : "—"}
                    </span>
                    {row.status !== "settled" && row.status !== "reconciled" && (
                      <span className="shrink-0 text-text-subtle">
                        {STATUS_LABELS[row.status] ?? row.status}
                      </span>
                    )}
                    <span
                      className={cn(
                        "ml-auto shrink-0 font-mono text-xs font-medium",
                        row.direction === "inflow" ? "text-income" : "text-expense",
                      )}
                    >
                      {row.direction === "inflow" ? "+" : "−"}
                      {formatBRL(row.amount)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface-2/50 px-3 py-2">
      <div className="text-2xs tracking-wide text-text-subtle uppercase">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold">{value}</div>
    </div>
  );
}

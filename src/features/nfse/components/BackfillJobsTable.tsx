import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

import type { InvoiceJob, InvoiceJobFilters } from "../api";
import {
  AMBIENTE_META,
  isRefundHeld,
  JOB_STATUS_FILTERS,
  JOB_STATUS_META,
  REFUND_STATE_META,
} from "../constants";
import { useApproveInvoiceJobs, useConnections, useInvoiceJobs } from "../hooks";
import { useJobSelection } from "../useJobSelection";
import { InvoiceJobDrawer } from "./InvoiceJobDrawer";

const PAGE_SIZE = 20;

interface Props {
  /** enquanto uma carga está rodando, novas notas chegam -> atualiza sozinho. */
  polling: boolean;
}

/** Notas retroativas (source=backfill) com filtros, paginação e emissão em lote. */
export function BackfillJobsTable({ polling }: Props) {
  const { data: connections = [] } = useConnections();
  const approveJobs = useApproveInvoiceJobs();

  const [statusFilter, setStatusFilter] = React.useState<string>("review");
  const [accountId, setAccountId] = React.useState<string>("all");
  const [page, setPage] = React.useState(0);
  const [detail, setDetail] = React.useState<InvoiceJob | null>(null);

  // mesma regra da fila principal: segue o switcher global de empresa
  const { companyIds } = useCompanyScope();

  const filters = React.useMemo<InvoiceJobFilters>(() => {
    const group = JOB_STATUS_FILTERS.find((f) => f.value === statusFilter);
    return {
      statuses: group?.statuses ?? null,
      source: "backfill",
      accountId: accountId === "all" ? null : accountId,
      companyIds,
      page,
      pageSize: PAGE_SIZE,
    };
  }, [statusFilter, accountId, companyIds, page]);

  const { data, isLoading } = useInvoiceJobs(
    filters,
    polling ? { refetchInterval: 5000 } : undefined,
  );
  const jobs = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { selected, toggle, toggleAll, headerChecked, pendingIds, clear } = useJobSelection(jobs);

  // filtro mudou -> volta para a primeira página e zera a seleção (evita contagem órfã)
  React.useEffect(() => {
    setPage(0);
    clear();
  }, [statusFilter, accountId, companyIds, clear]);

  function emitSelected() {
    approveJobs.mutate([...selected], {
      onSuccess: ({ approved, blocked }) => {
        toast.success(`${approved} nota(s) enviadas para a fila de emissão.`);
        if (blocked > 0) {
          toast.warning(
            `${blocked} nota(s) retidas: a venda foi estornada. Abra cada uma para liberar ou descartar.`,
          );
        }
        clear();
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao emitir."),
    });
  }

  const firstRow = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastRow = Math.min(total, page * PAGE_SIZE + jobs.length);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-1 text-sm font-semibold">Notas retroativas</h2>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JOB_STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Conexão" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as conexões</SelectItem>
              {connections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          size="sm"
          disabled={selected.size === 0 || approveJobs.isPending}
          onClick={emitSelected}
        >
          Emitir selecionadas ({selected.size})
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : jobs.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Nenhuma nota neste filtro. Carregue um período acima.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2">
              <tr className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
                <th className="w-10 px-3 py-2.5">
                  <Checkbox
                    checked={headerChecked}
                    onCheckedChange={toggleAll}
                    disabled={pendingIds.length === 0}
                    aria-label="Selecionar todas as pendentes desta página"
                  />
                </th>
                <th className="px-3 py-2.5 text-left">Empresa</th>
                <th className="px-3 py-2.5 text-left">Tomador</th>
                <th className="px-3 py-2.5 text-right">Valor</th>
                <th className="px-3 py-2.5 text-left">Ambiente</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="px-3 py-2.5 text-left">Criada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((job) => {
                const status = JOB_STATUS_META[job.status] ?? {
                  label: job.status,
                  tone: "default" as const,
                };
                const retida = isRefundHeld(job);
                const estorno = retida ? REFUND_STATE_META[job.refund_state] : null;
                const selectable = job.status === "pending_review" && !retida;
                return (
                  <tr key={job.id} className="hover:bg-surface-2/60">
                    <td className="px-3 py-2.5">
                      <Checkbox
                        checked={selected.has(job.id)}
                        disabled={!selectable}
                        onCheckedChange={() => toggle(job.id)}
                        aria-label={retida ? "Nota retida: venda estornada" : "Selecionar nota"}
                      />
                    </td>
                    <td className="cursor-pointer px-3 py-2.5" onClick={() => setDetail(job)}>
                      {job.company?.trade_name ?? job.company?.legal_name ?? "—"}
                    </td>
                    <td className="cursor-pointer px-3 py-2.5" onClick={() => setDetail(job)}>
                      <div className="truncate">{job.tomador_nome ?? "—"}</div>
                      <div className="text-2xs font-mono text-text-subtle">
                        {job.tomador_documento ?? ""}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {formatBRL(job.valor_servicos)}
                    </td>
                    <td className="px-3 py-2.5">
                      {(() => {
                        const amb = AMBIENTE_META[job.ambiente] ?? {
                          label: job.ambiente,
                          tone: "default" as const,
                        };
                        return <Badge tone={amb.tone}>{amb.label}</Badge>;
                      })()}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge tone={status.tone}>{status.label}</Badge>
                        {estorno ? <Badge tone={estorno.tone}>{estorno.label}</Badge> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap text-text-muted">
                      {formatDate(job.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-2xs text-text-muted">
            {firstRow}–{lastRow} de {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={page <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="size-4" /> Anterior
            </Button>
            <span className="text-2xs text-text-muted">
              {page + 1}/{pageCount}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Próxima <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <InvoiceJobDrawer
        open={Boolean(detail)}
        onOpenChange={(o) => !o && setDetail(null)}
        job={detail}
      />
    </section>
  );
}

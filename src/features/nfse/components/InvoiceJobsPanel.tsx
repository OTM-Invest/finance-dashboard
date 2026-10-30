import * as React from "react";
import { Ban, ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/features/auth/usePermissions";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

import {
  downloadNfseFile,
  fetchAllInvoiceJobs,
  type InvoiceJob,
  type InvoiceJobFilters,
} from "../api";
import {
  AMBIENTE_META,
  DATE_FIELD_COLUMN_LABEL,
  isRefundHeld,
  JOB_STATUS_FILTERS,
  JOB_STATUS_META,
  REFUND_STATE_META,
} from "../constants";
import { exportInvoiceJobs, exportInvoiceJobsZip, type ExportFormat } from "../export";
import { useApproveInvoiceJobs, useConnections, useInvoiceJobs } from "../hooks";
import { useInvoiceJobFilters } from "../useInvoiceJobFilters";
import { useJobSelection } from "../useJobSelection";
import { InvoiceJobDrawer } from "./InvoiceJobDrawer";
import { InvoiceJobsFilters } from "./InvoiceJobsFilters";
import { VoidJobsDialog } from "./VoidJobsDialog";

const PAGE_SIZE = 20;

/** Origem da nota: retroativa (backfill) vs. tempo real (webhook do charge.paid). */
function jobOrigin(job: InvoiceJob): { label: string; tone: "accent" | "default" } {
  const source = (job.metadata as { source?: string } | null)?.source;
  return source === "backfill"
    ? { label: "Retroativa", tone: "accent" }
    : { label: "Webhook", tone: "default" };
}

export function InvoiceJobsPanel() {
  const { data: connections = [] } = useConnections();
  const approveJobs = useApproveInvoiceJobs();
  const { canEdit } = usePermissions();
  const [voiding, setVoiding] = React.useState(false);

  const { filters: ui, setFilters, setPage, reset } = useInvoiceJobFilters();
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState<ExportFormat | "zip" | null>(null);

  // segue o switcher global: empresa selecionada filtra a fila; consolidado = todas
  const { companyIds, scopeLabel, scopeKind } = useCompanyScope();

  const filters = React.useMemo<InvoiceJobFilters>(() => {
    const group = JOB_STATUS_FILTERS.find((f) => f.value === ui.status);
    return {
      statuses: group?.statuses ?? null,
      accountId: ui.accountId === "all" ? null : ui.accountId,
      companyIds,
      ambiente: ui.ambiente === "all" ? null : ui.ambiente,
      origin: ui.origin === "all" ? null : ui.origin,
      dateField: ui.dateField,
      from: ui.from || null,
      to: ui.to || null,
      search: ui.search || null,
      page: ui.page,
      pageSize: PAGE_SIZE,
    };
  }, [ui, companyIds]);

  const { data, isLoading } = useInvoiceJobs(filters);
  const jobs = React.useMemo(() => data?.rows ?? [], [data]);
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { selected, toggle, toggleAll, headerChecked, pendingIds, clear } = useJobSelection(jobs);

  // o detalhe sai da lista já refetchada, e não de um snapshot congelado no clique:
  // depois de revisar o tomador, o drawer precisa mostrar o dado novo, não o antigo
  const detail = React.useMemo(() => jobs.find((j) => j.id === detailId) ?? null, [jobs, detailId]);

  // filtro muda -> a seleção deixa de fazer sentido (a página volta ao 1º no setter)
  React.useEffect(() => {
    clear();
  }, [
    ui.status,
    ui.accountId,
    ui.ambiente,
    ui.origin,
    ui.dateField,
    ui.from,
    ui.to,
    ui.search,
    clear,
  ]);

  // troca de empresa no switcher global (sem atropelar a página de um link compartilhado)
  const mounted = React.useRef(false);
  React.useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setPage(0);
    clear();
  }, [companyIds, setPage, clear]);

  function emitSelected() {
    approveJobs.mutate([...selected], {
      onSuccess: ({ approved, blocked }) => {
        toast.success(`${approved} nota(s) enviadas para a fila de emissão.`);
        // retidas nunca somem em silêncio: o número que não saiu é o que importa
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

  // exporta TODAS as notas do filtro atual (não só a página) para a contabilidade
  async function handleExport(format: ExportFormat) {
    setExporting(format);
    try {
      const rows = await fetchAllInvoiceJobs(filters);
      if (rows.length === 0) {
        toast.info("Nenhuma nota neste filtro para exportar.");
        return;
      }
      await exportInvoiceJobs(rows, format);
      toast.success(`${rows.length} nota(s) exportadas.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar.");
    } finally {
      setExporting(null);
    }
  }

  // pacote contábil: planilha + XMLs/DANFEs das notas autorizadas do filtro
  async function handleExportZip() {
    setExporting("zip");
    try {
      const rows = await fetchAllInvoiceJobs(filters);
      if (rows.length === 0) {
        toast.info("Nenhuma nota neste filtro para exportar.");
        return;
      }
      const { xmls, missing } = await exportInvoiceJobsZip(rows, downloadNfseFile);
      toast.success(
        `Pacote gerado: ${rows.length} nota(s), ${xmls} XML(s)` +
          (missing > 0 ? ` · ${missing} sem arquivo` : "") +
          ".",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar o pacote.");
    } finally {
      setExporting(null);
    }
  }

  const firstRow = total === 0 ? 0 : ui.page * PAGE_SIZE + 1;
  const lastRow = Math.min(total, ui.page * PAGE_SIZE + jobs.length);

  return (
    <div className="space-y-4">
      <InvoiceJobsFilters
        filters={ui}
        setFilters={setFilters}
        reset={reset}
        connections={connections}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-2xs text-text-muted">
          {total} nota(s) no filtro ·{" "}
          {scopeKind === "consolidated" ? "todas as empresas" : scopeLabel}
        </span>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="outline" disabled={exporting !== null}>
                {exporting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void handleExport("xlsx")}>
                Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleExport("csv")}>
                CSV (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleExportZip()}>
                Pacote contábil (ZIP + XMLs)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {canEdit && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={selected.size === 0 || approveJobs.isPending}
              onClick={() => setVoiding(true)}
            >
              <Ban className="size-4" /> Descartar selecionadas ({selected.size})
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            disabled={selected.size === 0 || approveJobs.isPending}
            onClick={emitSelected}
          >
            Emitir selecionadas ({selected.size})
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : jobs.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Nenhuma nota neste filtro.
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
                <th className="px-3 py-2.5 text-left">{DATE_FIELD_COLUMN_LABEL[ui.dateField]}</th>
                <th className="px-3 py-2.5 text-left">Empresa</th>
                <th className="px-3 py-2.5 text-left">Origem</th>
                <th className="px-3 py-2.5 text-left">Conexão</th>
                <th className="px-3 py-2.5 text-left">Tomador</th>
                <th className="px-3 py-2.5 text-right">Valor</th>
                <th className="px-3 py-2.5 text-left">Ambiente</th>
                <th className="px-3 py-2.5 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((job) => {
                const status = JOB_STATUS_META[job.status] ?? {
                  label: job.status,
                  tone: "default" as const,
                };
                const origem = jobOrigin(job);
                const amb = AMBIENTE_META[job.ambiente] ?? {
                  label: job.ambiente,
                  tone: "default" as const,
                };
                const retida = isRefundHeld(job);
                const estorno = retida ? REFUND_STATE_META[job.refund_state] : null;
                const selectable = job.status === "pending_review" && !retida;
                // a coluna de data acompanha o campo filtrado
                const dateValue = job[ui.dateField];
                return (
                  <tr
                    key={job.id}
                    className="cursor-pointer hover:bg-surface-2/60"
                    onClick={() => setDetailId(job.id)}
                  >
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(job.id)}
                        disabled={!selectable}
                        onCheckedChange={() => toggle(job.id)}
                        aria-label={retida ? "Nota retida: venda estornada" : "Selecionar nota"}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap text-text-muted">
                      {dateValue ? formatDate(dateValue) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {job.company?.trade_name ?? job.company?.legal_name ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={origem.tone}>{origem.label}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-text-muted">{job.account?.label ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="truncate">{job.tomador_nome ?? "—"}</div>
                      <div className="text-2xs font-mono text-text-subtle">
                        {job.tomador_documento ?? ""}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {formatBRL(job.valor_servicos)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={amb.tone}>{amb.label}</Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge tone={status.tone}>{status.label}</Badge>
                        {estorno ? <Badge tone={estorno.tone}>{estorno.label}</Badge> : null}
                      </div>
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
              disabled={ui.page <= 0}
              onClick={() => setPage(Math.max(0, ui.page - 1))}
            >
              <ChevronLeft className="size-4" /> Anterior
            </Button>
            <span className="text-2xs text-text-muted">
              {ui.page + 1}/{pageCount}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={ui.page >= pageCount - 1}
              onClick={() => setPage(Math.min(pageCount - 1, ui.page + 1))}
            >
              Próxima <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <VoidJobsDialog open={voiding} onOpenChange={setVoiding} ids={[...selected]} onDone={clear} />

      <InvoiceJobDrawer
        open={Boolean(detail)}
        onOpenChange={(o) => !o && setDetailId(null)}
        job={detail}
      />
    </div>
  );
}

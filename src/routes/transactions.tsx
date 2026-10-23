import * as React from "react";
import { Download, Plus } from "lucide-react";
import { parseAsInteger, useQueryState } from "nuqs";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/auth/usePermissions";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { BULK_EDIT_LIMIT } from "@/features/transactions/api";
import { availableColumnIds, resolveColumnOrder } from "@/features/transactions/columns";
import { BulkActionsBar } from "@/features/transactions/components/BulkActionsBar";
import { BulkEditDrawer } from "@/features/transactions/components/BulkEditDrawer";
import { TransactionColumnsMenu } from "@/features/transactions/components/TransactionColumnsMenu";
import { TransactionDrawer } from "@/features/transactions/components/TransactionDrawer";
import { TransactionsFilters } from "@/features/transactions/components/TransactionsFilters";
import { TransactionsPagination } from "@/features/transactions/components/TransactionsPagination";
import { TransactionsTable } from "@/features/transactions/components/TransactionsTable";
import {
  useRestoreTransaction,
  useSoftDeleteTransaction,
  useTransactionIds,
  useTransactions,
} from "@/features/transactions/hooks";
import type { TransactionWithRelations } from "@/features/transactions/types";
import { useTransactionColumnPrefs } from "@/features/transactions/useColumnPrefs";
import { useTransactionFilters } from "@/features/transactions/useTransactionFilters";
import { downloadCsv, toCsv } from "@/lib/csv";

const PAGE_SIZE = 50;

export default function TransactionsPage() {
  const { selectedCompanyId, companyIds, isMultiCompany, scopeKind, scopeLabel } =
    useCompanyScope();
  const { canEdit } = usePermissions();
  const [filters, setFilters] = useTransactionFilters();
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const columnPrefs = useTransactionColumnPrefs();

  const orderedColumnIds = React.useMemo(
    () => resolveColumnOrder(columnPrefs.prefs.order, availableColumnIds(isMultiCompany)),
    [columnPrefs.prefs.order, isMultiCompany],
  );

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TransactionWithRelations | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = React.useState(false);

  // `selectedCompanyId` é a empresa única do escopo — nulo em consolidado E em grupo.
  // É o que alimenta os seletores de conta/centro de custo (que são por empresa) e o
  // drawer: sem empresa fixa, o form exige que se escolha a empresa do lançamento.
  const companyId = selectedCompanyId;
  const drawerCompanyId = companyId;

  // Só o recorte — sem ordenação nem página. É o que define "todos os
  // lançamentos do filtro" para a seleção em massa.
  const queryFilters = React.useMemo(
    () => ({
      companyIds,
      from: filters.from || null,
      to: filters.to || null,
      status: filters.status ? [filters.status] : undefined,
      direction: filters.direction,
      accountId: filters.accountId || null,
      costCenterId: filters.costCenterId || null,
      bankAccountId: filters.bankAccountId || null,
      counterpartyId: filters.counterpartyId || null,
      search: filters.search || null,
    }),
    [
      companyIds,
      filters.from,
      filters.to,
      filters.status,
      filters.direction,
      filters.accountId,
      filters.costCenterId,
      filters.bankAccountId,
      filters.counterpartyId,
      filters.search,
    ],
  );

  const { data, isLoading, isFetching } = useTransactions({
    ...queryFilters,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    page,
    pageSize: PAGE_SIZE,
  });

  const softDelete = useSoftDeleteTransaction();
  const restore = useRestoreTransaction();
  const selectAllMatching = useTransactionIds();

  // Trocar de filtro muda o conjunto: manter a seleção antiga levaria a editar
  // lançamentos que não estão mais à vista.
  React.useEffect(() => {
    setSelectedIds(new Set());
  }, [queryFilters]);

  const selection = React.useMemo(
    () =>
      canEdit
        ? {
            selectedIds,
            onToggleRow: (id: string) => {
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            },
            onTogglePage: () => {
              const pageIds = data?.rows.map((r) => r.id) ?? [];
              setSelectedIds((prev) => {
                const allSelected = pageIds.length > 0 && pageIds.every((id) => prev.has(id));
                const next = new Set(prev);
                for (const id of pageIds) {
                  if (allSelected) next.delete(id);
                  else next.add(id);
                }
                return next;
              });
            },
          }
        : undefined,
    [canEdit, selectedIds, data?.rows],
  );

  const handleEdit = React.useCallback((t: TransactionWithRelations) => {
    setEditing(t);
    setDrawerOpen(true);
  }, []);

  const handleNew = React.useCallback(() => {
    setEditing(null);
    setDrawerOpen(true);
  }, []);

  const handleDelete = React.useCallback(
    (t: TransactionWithRelations) => {
      softDelete.mutate(t.id, {
        onSuccess: () => {
          toast("Lançamento excluído", {
            description: t.description,
            action: {
              label: "Desfazer",
              onClick: () => {
                restore.mutate(t.id, {
                  onSuccess: () => {
                    toast.success("Lançamento restaurado");
                  },
                });
              },
            },
          });
        },
        onError: (err) => {
          toast.error("Erro ao excluir", { description: err.message });
        },
      });
    },
    [softDelete, restore],
  );

  // Atalho de teclado: N para novo lançamento
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "n" && e.key !== "N") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      handleNew();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [handleNew]);

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs flex items-center gap-2 font-medium tracking-wide text-text-subtle uppercase">
            Lançamentos
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            {scopeKind === "consolidated" ? "Todas as empresas" : scopeLabel}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {data?.totalCount !== undefined
              ? `${data.totalCount.toLocaleString("pt-BR")} lançamento(s) no escopo selecionado`
              : "Carregando…"}
            {isFetching && !isLoading && (
              <Badge tone="info" className="ml-3">
                Atualizando
              </Badge>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TransactionColumnsMenu
            order={orderedColumnIds}
            isHidden={columnPrefs.isHidden}
            onToggle={columnPrefs.toggleVisibility}
            onMove={(id, direction) => {
              columnPrefs.move(orderedColumnIds, id, direction);
            }}
            onReset={columnPrefs.reset}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!data || data.rows.length === 0}
            onClick={() => {
              if (!data) return;
              const csv = toCsv(data.rows, [
                { key: "accrual_date", header: "Competência", getValue: (r) => r.accrual_date },
                { key: "cash_date", header: "Caixa", getValue: (r) => r.cash_date ?? "" },
                { key: "description", header: "Descrição", getValue: (r) => r.description },
                {
                  key: "counterparty",
                  header: "Fornecedor",
                  getValue: (r) => r.counterparty?.name ?? "",
                },
                {
                  key: "account",
                  header: "Conta",
                  getValue: (r) => (r.account ? `${r.account.code} ${r.account.name}` : ""),
                },
                { key: "direction", header: "Tipo", getValue: (r) => r.direction },
                { key: "amount", header: "Valor", getValue: (r) => r.amount.toFixed(2) },
                { key: "status", header: "Status", getValue: (r) => r.status },
              ]);
              downloadCsv(`lancamentos-${new Date().toISOString().slice(0, 10)}.csv`, csv);
            }}
          >
            <Download className="size-3.5" /> CSV
          </Button>
          {canEdit && (
            <Button onClick={handleNew}>
              <Plus className="size-4" />
              Novo lançamento
              <kbd className="ml-2 hidden rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px] sm:inline">
                N
              </kbd>
            </Button>
          )}
        </div>
      </div>

      <TransactionsFilters companyId={companyId} />

      <BulkActionsBar
        selectedCount={selectedIds.size}
        totalCount={data?.totalCount ?? 0}
        limit={BULK_EDIT_LIMIT}
        selectingAll={selectAllMatching.isPending}
        onSelectAllMatching={() => {
          selectAllMatching.mutate(queryFilters, {
            onSuccess: (ids) => {
              setSelectedIds(new Set(ids));
            },
            onError: (err) => {
              toast.error("Erro ao selecionar", { description: err.message });
            },
          });
        }}
        onClear={() => {
          setSelectedIds(new Set());
        }}
        onEdit={() => {
          setBulkOpen(true);
        }}
      />

      <TransactionsTable
        rows={data?.rows ?? []}
        loading={isLoading}
        sortBy={filters.sortBy}
        sortOrder={filters.sortOrder}
        onSortChange={(sortBy, sortOrder) =>
          void setFilters({
            sortBy: sortBy as typeof filters.sortBy,
            sortOrder,
          })
        }
        orderedColumnIds={orderedColumnIds}
        isHidden={columnPrefs.isHidden}
        onEdit={handleEdit}
        onDelete={handleDelete}
        selection={selection}
      />

      <TransactionsPagination
        page={page}
        pageCount={data?.pageCount ?? 1}
        totalCount={data?.totalCount ?? 0}
        rowsOnPage={data?.rows.length ?? 0}
        pageSize={PAGE_SIZE}
        inflowTotal={data?.inflowTotal ?? 0}
        outflowTotal={data?.outflowTotal ?? 0}
        onPageChange={(p) => void setPage(p)}
      />

      <TransactionDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        transaction={editing}
        companyId={drawerCompanyId}
      />

      <BulkEditDrawer
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        ids={[...selectedIds]}
        companyId={companyId}
        onApplied={() => {
          setSelectedIds(new Set());
        }}
      />
    </div>
  );
}

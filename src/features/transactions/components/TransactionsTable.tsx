import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

import type { TransactionWithRelations } from "../types";
import { TransactionStatusBadge } from "./TransactionStatusBadge";

interface Props {
  rows: TransactionWithRelations[];
  loading: boolean;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSortChange: (sortBy: string, sortOrder: "asc" | "desc") => void;
  /** Ids das colunas a exibir, já resolvidos na ordem preferida do escopo atual. */
  orderedColumnIds: string[];
  isHidden: (id: string) => boolean;
  onEdit: (transaction: TransactionWithRelations) => void;
  onDelete: (transaction: TransactionWithRelations) => void;
  /** Seleção em massa — ausente quando o usuário não pode editar. */
  selection?: {
    selectedIds: Set<string>;
    onToggleRow: (id: string) => void;
    onTogglePage: () => void;
  };
}

export function TransactionsTable({
  rows,
  loading,
  sortBy,
  sortOrder,
  onSortChange,
  orderedColumnIds,
  isHidden,
  onEdit,
  onDelete,
  selection,
}: Props) {
  const sorting = React.useMemo<SortingState>(
    () => [{ id: sortBy, desc: sortOrder === "desc" }],
    [sortBy, sortOrder],
  );

  const columns = React.useMemo<ColumnDef<TransactionWithRelations>[]>(() => {
    const defs: Record<string, ColumnDef<TransactionWithRelations>> = {
      accrual_date: {
        accessorKey: "accrual_date",
        header: "Competência",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="font-mono text-xs whitespace-nowrap text-text-muted">
            {formatDate(row.original.accrual_date)}
          </span>
        ),
      },
      due_date: {
        accessorKey: "due_date",
        header: "Vencimento",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="font-mono text-xs whitespace-nowrap text-text-subtle">
            {row.original.due_date ? formatDate(row.original.due_date) : "—"}
          </span>
        ),
      },
      cash_date: {
        accessorKey: "cash_date",
        header: "Caixa",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="font-mono text-xs whitespace-nowrap text-text-subtle">
            {row.original.cash_date ? formatDate(row.original.cash_date) : "—"}
          </span>
        ),
      },
      description: {
        accessorKey: "description",
        header: "Descrição",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="block max-w-[420px] truncate text-sm text-text">
            {row.original.description}
          </span>
        ),
      },
      counterparty: {
        id: "counterparty",
        header: "Fornecedor",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.counterparty ? (
            <span className="block max-w-[220px] truncate text-xs text-text-muted">
              {row.original.counterparty.name}
            </span>
          ) : (
            <span className="text-2xs text-text-subtle">—</span>
          ),
      },
      account: {
        accessorKey: "account",
        header: "Conta",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.account ? (
            <div className="flex max-w-[260px] flex-col">
              <span className="truncate text-xs text-text-muted">{row.original.account.name}</span>
              <span className="text-2xs font-mono text-text-subtle">
                {row.original.account.code}
              </span>
            </div>
          ) : (
            <span className="text-2xs text-text-subtle">—</span>
          ),
      },
      company: {
        id: "company",
        header: "Empresa",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap text-text-muted">
            {row.original.company?.trade_name ?? row.original.company?.legal_name ?? "—"}
          </span>
        ),
      },
      status: {
        accessorKey: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => <TransactionStatusBadge status={row.original.status} />,
      },
      amount: {
        accessorKey: "amount",
        header: "Valor",
        enableSorting: true,
        cell: ({ row }) => {
          const isInflow = row.original.direction === "inflow";
          const Icon = isInflow ? ArrowUpRight : ArrowDownRight;
          return (
            <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
              <Icon className={cn("size-3.5", isInflow ? "text-income" : "text-expense")} />
              <span
                className={cn(
                  "font-mono text-sm font-medium tabular-nums",
                  isInflow ? "text-income" : "text-expense",
                )}
              >
                {isInflow ? "+" : "-"} {formatBRL(row.original.amount)}
              </span>
            </div>
          );
        },
      },
    };

    const actions: ColumnDef<TransactionWithRelations> = {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Ações do lançamento"
              onClick={(e) => {
                e.stopPropagation();
              }}
              className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-text-muted hover:bg-surface-2 hover:text-text"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                onEdit(row.original);
              }}
            >
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                onDelete(row.original);
              }}
              className="text-expense"
            >
              <Trash2 className="size-4" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    };

    const visible = orderedColumnIds
      .filter((id) => !isHidden(id))
      .map((id) => defs[id])
      .filter((c): c is ColumnDef<TransactionWithRelations> => Boolean(c));

    if (!selection) return [...visible, actions];

    const allOnPageSelected = rows.length > 0 && rows.every((r) => selection.selectedIds.has(r.id));
    const someOnPageSelected = rows.some((r) => selection.selectedIds.has(r.id));

    const select: ColumnDef<TransactionWithRelations> = {
      id: "select",
      enableSorting: false,
      header: () => (
        <Checkbox
          aria-label="Selecionar todos os lançamentos desta página"
          checked={allOnPageSelected ? true : someOnPageSelected ? "indeterminate" : false}
          onCheckedChange={selection.onTogglePage}
        />
      ),
      cell: ({ row }) => (
        // O clique na linha abre o drawer; aqui ele precisa parar no checkbox.
        <div
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <Checkbox
            aria-label={`Selecionar ${row.original.description}`}
            checked={selection.selectedIds.has(row.original.id)}
            onCheckedChange={() => {
              selection.onToggleRow(row.original.id);
            }}
          />
        </div>
      ),
    };

    return [select, ...visible, actions];
  }, [orderedColumnIds, isHidden, onEdit, onDelete, selection, rows]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const first = next[0];
      if (first) onSortChange(first.id, first.desc ? "desc" : "asc");
    },
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-surface-2/60">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-border">
              {hg.headers.map((h) => {
                const canSort = h.column.getCanSort();
                const isAmount = h.id === "amount";
                return (
                  <th
                    key={h.id}
                    onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                    className={cn(
                      "text-2xs px-4 py-2.5 font-medium tracking-wide text-text-subtle uppercase",
                      isAmount ? "text-right" : "text-left",
                      canSort && "cursor-pointer select-none hover:text-text",
                    )}
                  >
                    <span
                      className={cn("inline-flex items-center gap-1", isAmount && "justify-end")}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {canSort && <ArrowUpDown className="size-3 opacity-50" />}
                    </span>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {loading && rows.length === 0 ? (
            Array.from({ length: 10 }).map((_, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                {columns.map((_c, j) => (
                  <td key={j} className="px-4 py-3">
                    <Skeleton className="h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-16 text-center text-sm text-text-muted"
              >
                Nenhum lançamento encontrado para os filtros selecionados.
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => {
                  onEdit(row.original);
                }}
                className={cn(
                  "cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-surface-2/50",
                  selection?.selectedIds.has(row.original.id) && "bg-accent/5",
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

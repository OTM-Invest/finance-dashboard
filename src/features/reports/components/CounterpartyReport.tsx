import { Download } from "lucide-react";
import { Link, useNavigate } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { counterpartyTransactionsHref } from "@/features/transactions/links";
import { cn } from "@/lib/cn";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

import type { CounterpartyKindFilter, CounterpartyRow } from "../api";
import { useCounterpartyAnalysis } from "../hooks";

interface Props {
  companyIds: string[] | null;
  from: string;
  to: string;
  kind: CounterpartyKindFilter;
  onKindChange: (k: CounterpartyKindFilter) => void;
}

const KIND_LABEL: Record<string, string> = {
  customer: "Cliente",
  supplier: "Fornecedor",
  employee: "Funcionário",
  partner: "Sócio",
  government: "Governo",
  other: "Outros",
};

export function CounterpartyReport({ companyIds, from, to, kind, onKindChange }: Props) {
  const { data = [], isLoading } = useCounterpartyAnalysis(companyIds, from, to, kind, 30);
  const navigate = useNavigate();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={kind} onValueChange={(v) => onKindChange(v as CounterpartyKindFilter)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="customer">Clientes</SelectItem>
              <SelectItem value="supplier">Fornecedores</SelectItem>
              <SelectItem value="employee">Funcionários</SelectItem>
              <SelectItem value="partner">Sócios</SelectItem>
              <SelectItem value="government">Governo</SelectItem>
              <SelectItem value="other">Outros</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-text-muted">Top {data.length}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={data.length === 0}
          onClick={() => {
            const csv = toCsv<CounterpartyRow>(data, [
              { key: "name", header: "Contraparte", getValue: (r) => r.name },
              {
                key: "kind",
                header: "Tipo",
                getValue: (r) => KIND_LABEL[r.kind] ?? r.kind,
              },
              {
                key: "inflow",
                header: "Entrada",
                getValue: (r) => r.totalInflow.toFixed(2),
              },
              {
                key: "outflow",
                header: "Saída",
                getValue: (r) => r.totalOutflow.toFixed(2),
              },
              { key: "net", header: "Líquido", getValue: (r) => r.net.toFixed(2) },
              {
                key: "count",
                header: "Lançamentos",
                getValue: (r) => String(r.transactionCount),
              },
              {
                key: "avg",
                header: "Ticket médio",
                getValue: (r) => r.avgTicket.toFixed(2),
              },
              {
                key: "last",
                header: "Última mov.",
                getValue: (r) => r.lastMovement,
              },
            ]);
            downloadCsv(`contrapartes-${from}-${to}.csv`, csv);
          }}
        >
          <Download className="size-3.5" /> Exportar CSV
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : data.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Nenhuma contraparte com movimentação no período.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2">
              <tr className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
                <th className="px-3 py-2.5 text-left">Contraparte</th>
                <th className="px-3 py-2.5 text-right">Entrada</th>
                <th className="px-3 py-2.5 text-right">Saída</th>
                <th className="px-3 py-2.5 text-right">Líquido</th>
                <th className="px-3 py-2.5 text-right">Ticket</th>
                <th className="px-3 py-2.5 text-right">Lanç.</th>
                <th className="px-3 py-2.5 text-right">Última</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((r) => (
                <tr
                  key={r.counterpartyId}
                  className="cursor-pointer hover:bg-surface-2/60"
                  // conveniência do mouse; quem navega por teclado usa o link do
                  // nome, que é o elemento focável de verdade. O clique no próprio
                  // link já navega — ignorar aqui evita disparar duas vezes.
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a")) return;
                    void navigate(counterpartyTransactionsHref(r.counterpartyId, from, to));
                  }}
                >
                  <td className="px-3 py-2">
                    <Link
                      to={counterpartyTransactionsHref(r.counterpartyId, from, to)}
                      className="text-sm hover:underline"
                    >
                      {r.name}
                    </Link>
                    <Badge tone="default" className="mt-0.5">
                      {KIND_LABEL[r.kind] ?? r.kind}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-income">
                    {r.totalInflow > 0 ? formatBRL(r.totalInflow) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-expense">
                    {r.totalOutflow > 0 ? formatBRL(r.totalOutflow) : "—"}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-mono text-sm font-semibold",
                      r.net < 0 ? "text-expense" : "text-text",
                    )}
                  >
                    {formatBRL(r.net)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-text-muted">
                    {formatBRL(r.avgTicket)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-text-muted">
                    {r.transactionCount}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap text-text-subtle">
                    {formatDate(r.lastMovement)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

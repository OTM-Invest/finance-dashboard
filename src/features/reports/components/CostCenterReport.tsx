import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatBRL, formatPercent } from "@/lib/format";

import type { CostCenterRow } from "../api";
import { useCostCenterAnalysis } from "../hooks";

interface Props {
  companyIds: string[] | null;
  from: string;
  to: string;
}

export function CostCenterReport({ companyIds, from, to }: Props) {
  const { data = [], isLoading } = useCostCenterAnalysis(companyIds, from, to);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  if (data.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
        Nenhuma movimentação no período.
      </div>
    );
  }

  const totals = data.reduce(
    (a, r) => ({
      revenue: a.revenue + r.revenue,
      expense: a.expense + r.expense,
      net: a.net + r.net,
      count: a.count + r.transactionCount,
    }),
    { revenue: 0, expense: 0, net: 0, count: 0 },
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const csv = toCsv<CostCenterRow>(data, [
              { key: "name", header: "Área", getValue: (r) => r.name },
              { key: "revenue", header: "Receita", getValue: (r) => r.revenue.toFixed(2) },
              { key: "expense", header: "Despesa", getValue: (r) => r.expense.toFixed(2) },
              { key: "net", header: "Resultado", getValue: (r) => r.net.toFixed(2) },
              {
                key: "margin",
                header: "Margem %",
                getValue: (r) => (r.marginPct == null ? "" : r.marginPct.toFixed(1)),
              },
              {
                key: "count",
                header: "Lançamentos",
                getValue: (r) => String(r.transactionCount),
              },
            ]);
            downloadCsv(`centros-de-custo-${from}-${to}.csv`, csv);
          }}
        >
          <Download className="size-3.5" /> Exportar CSV
        </Button>
      </div>
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
              <th className="px-3 py-2.5 text-left">Área</th>
              <th className="px-3 py-2.5 text-right">Receita</th>
              <th className="px-3 py-2.5 text-right">Despesa</th>
              <th className="px-3 py-2.5 text-right">Resultado</th>
              <th className="px-3 py-2.5 text-right">Margem</th>
              <th className="px-3 py-2.5 text-right">Lanç.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((r) => (
              <tr key={r.costCenterId ?? "sem-centro"} className="hover:bg-surface-2/60">
                <td className="px-3 py-2 text-sm">
                  {r.name}
                  {/* Sem isto, uma linha somando três empresas é indistinguível de
                      uma linha de empresa única — e o leitor não saberia que é soma. */}
                  {r.companiesCount > 1 && (
                    <span className="text-2xs ml-2 text-text-subtle">
                      {r.companiesCount} empresas
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-income">
                  {r.revenue > 0 ? formatBRL(r.revenue) : "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-expense">
                  {r.expense > 0 ? formatBRL(r.expense) : "—"}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right font-mono text-sm font-semibold",
                    r.net < 0 ? "text-expense" : "text-text",
                  )}
                >
                  {formatBRL(r.net)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {r.marginPct == null ? "—" : formatPercent(r.marginPct, { fromHundred: true })}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-text-muted">
                  {r.transactionCount}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-surface-2">
            <tr className="text-xs font-semibold">
              <td className="px-3 py-2 tracking-wide text-text-subtle uppercase">Total</td>
              <td className="px-3 py-2 text-right font-mono text-income">
                {formatBRL(totals.revenue)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-expense">
                {formatBRL(totals.expense)}
              </td>
              <td
                className={cn(
                  "px-3 py-2 text-right font-mono",
                  totals.net < 0 ? "text-expense" : "text-text",
                )}
              >
                {formatBRL(totals.net)}
              </td>
              <td className="px-3 py-2 text-right font-mono">
                {totals.revenue > 0
                  ? formatPercent((totals.net / totals.revenue) * 100, { fromHundred: true })
                  : "—"}
              </td>
              <td className="px-3 py-2 text-right font-mono text-text-muted">{totals.count}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

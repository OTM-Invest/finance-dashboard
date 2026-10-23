/**
 * Matriz do balanço: itens nas linhas, meses nas colunas.
 *
 * Um modelo real tem mais meses que itens (um ano são doze colunas contra ~dez
 * linhas), e a leitura natural é "esta é a linha da Receita ao longo do ano" —
 * por isso o item é a âncora da linha, e é dele que sai o gráfico histórico.
 *
 * A tabela rola na horizontal dentro do próprio container, com a coluna de item
 * fixa à esquerda para o nome não sumir na rolagem.
 */
import * as React from "react";
import { ArrowDown, ArrowUp, LineChart, Minus } from "lucide-react";

import { cn } from "@/lib/cn";
import { formatMonthYear } from "@/lib/dates";
import { formatBRL, formatNumber, formatPercent } from "@/lib/format";

import type { BalanceMatrixLine, BalanceMatrix as Matrix } from "../compute";
import type { AccountingBasis } from "../drilldown";
import { BalanceLineChartDialog } from "./BalanceLineChartDialog";
import { BalanceLineTransactionsSheet } from "./BalanceLineTransactionsSheet";

interface Props {
  matrix: Matrix;
  /** Intercala uma coluna de variação depois de cada mês. */
  showVariation?: boolean;
  companyIds: string[] | null;
  from: string;
  to: string;
  basis: AccountingBasis;
}

/**
 * Variação vs. o mês anterior — mesma linguagem da DRE Comparativo (seta + cor),
 * com a unidade que a linha pede: % para dinheiro, p.p. para percentual.
 */
function VariationCell({ delta, unit }: { delta: number | null; unit: "percent" | "points" }) {
  if (delta == null) {
    return <span className="text-2xs font-mono text-text-subtle">—</span>;
  }
  const Icon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  const tone = delta > 0 ? "text-income" : delta < 0 ? "text-expense" : "text-text-muted";
  const text =
    unit === "points" ? `${formatNumber(delta)} p.p.` : formatPercent(delta, { fromHundred: true });

  return (
    <span className={cn("text-2xs inline-flex items-center gap-0.5 font-mono", tone)}>
      <Icon className="size-3 shrink-0" />
      {text}
    </span>
  );
}

function formatCell(line: BalanceMatrixLine, value: number | null): string {
  if (value == null) return "—";
  if (line.format === "percent") return formatPercent(value, { fromHundred: true });
  if (value === 0) return "—";
  return formatBRL(value);
}

/** Só o que é resultado ganha cor de negativo; item de custo é positivo por natureza. */
function toneFor(line: BalanceMatrixLine, value: number | null): string | undefined {
  if (value == null || value >= 0) return undefined;
  if (line.kind === "filter") return undefined;
  return "text-expense";
}

function periodLabelOf(months: string[]): string {
  const first = months[0];
  const last = months[months.length - 1];
  if (!first || !last) return "—";
  return first === last
    ? formatMonthYear(first)
    : `${formatMonthYear(first)} – ${formatMonthYear(last)}`;
}

export function BalanceMatrix({
  matrix,
  showVariation = false,
  companyIds,
  from,
  to,
  basis,
}: Props) {
  const { months, lines } = matrix;
  const [charted, setCharted] = React.useState<BalanceMatrixLine | null>(null);
  const [drilled, setDrilled] = React.useState<BalanceMatrixLine | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2/60">
              <th className="text-2xs sticky left-0 z-10 bg-surface-2 px-4 py-2.5 text-left font-medium tracking-wide text-text-subtle uppercase">
                Item
              </th>
              {months.map((month, monthIndex) => (
                <React.Fragment key={month}>
                  <th className="text-2xs px-4 py-2.5 text-right font-medium tracking-wide whitespace-nowrap text-text-subtle uppercase">
                    {formatMonthYear(month)}
                  </th>
                  {showVariation && (
                    <th
                      title={
                        monthIndex === 0
                          ? "Sem mês anterior no período"
                          : `Variação vs. ${formatMonthYear(months[monthIndex - 1] ?? month)}`
                      }
                      className={cn(
                        "text-2xs py-2.5 pr-4 text-right font-medium tracking-wide whitespace-nowrap text-text-subtle",
                        // A última não leva borda: o Total já traz a dele à esquerda.
                        monthIndex < months.length - 1 && "border-r border-border/60",
                      )}
                    >
                      Δ
                    </th>
                  )}
                </React.Fragment>
              ))}
              <th className="text-2xs border-l border-border px-4 py-2.5 text-right font-semibold tracking-wide text-text uppercase">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((line) => (
              <tr
                key={line.id}
                // Linha calculada não tem lançamento próprio, então não é clicável.
                onClick={line.drilldown ? () => setDrilled(line) : undefined}
                className={cn(
                  "group hover:bg-surface-2/40",
                  line.emphasis && "bg-surface-2/30",
                  line.drilldown && "cursor-pointer",
                )}
              >
                {/* A célula fixa precisa de fundo opaco para esconder o que rola
                    atrás dela, então ela repete o tom da linha em vez de herdar. */}
                <th
                  scope="row"
                  className={cn(
                    "sticky left-0 z-10 px-4 py-2 text-left text-sm whitespace-nowrap",
                    line.emphasis ? "bg-surface-2 font-semibold" : "bg-surface font-normal",
                    line.kind === "unclassified" && "text-expense",
                    "group-hover:bg-surface-2",
                  )}
                >
                  <span className="flex items-center gap-2">
                    {line.drilldown ? (
                      <button
                        type="button"
                        title={`Ver lançamentos de ${line.label}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setDrilled(line);
                        }}
                        className="rounded-[var(--radius-sm)] text-left underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)] focus-visible:outline-none"
                      >
                        {line.label}
                      </button>
                    ) : (
                      line.label
                    )}
                    <button
                      type="button"
                      aria-label={`Ver histórico de ${line.label}`}
                      title={`Ver histórico de ${line.label}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setCharted(line);
                      }}
                      className="grid size-6 shrink-0 place-items-center rounded-[var(--radius-sm)] text-text-subtle transition-colors hover:bg-surface-3 hover:text-accent focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)] focus-visible:outline-none"
                    >
                      <LineChart className="size-3.5" />
                    </button>
                  </span>
                </th>

                {months.map((month, monthIndex) => {
                  const value = line.values[monthIndex] ?? null;
                  return (
                    <React.Fragment key={month}>
                      <td
                        className={cn(
                          "px-4 py-2 text-right font-mono text-xs whitespace-nowrap",
                          line.emphasis && "font-semibold",
                          toneFor(line, value) ?? "text-text",
                          value == null && "text-text-subtle",
                        )}
                      >
                        {formatCell(line, value)}
                      </td>
                      {showVariation && (
                        <td
                          className={cn(
                            "py-2 pr-4 text-right whitespace-nowrap",
                            monthIndex < months.length - 1 && "border-r border-border/60",
                          )}
                        >
                          <VariationCell
                            delta={line.deltas[monthIndex] ?? null}
                            unit={line.deltaUnit}
                          />
                        </td>
                      )}
                    </React.Fragment>
                  );
                })}

                <td
                  className={cn(
                    "border-l border-border bg-surface-2/40 px-4 py-2 text-right font-mono text-xs font-semibold whitespace-nowrap",
                    toneFor(line, line.total) ?? "text-text",
                  )}
                >
                  {formatCell(line, line.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <BalanceLineChartDialog
        open={charted != null}
        onOpenChange={(next) => {
          if (!next) setCharted(null);
        }}
        line={charted}
        months={months}
        periodLabel={periodLabelOf(months)}
      />

      <BalanceLineTransactionsSheet
        open={drilled != null}
        onOpenChange={(next) => {
          if (!next) setDrilled(null);
        }}
        line={drilled}
        companyIds={companyIds}
        from={from}
        to={to}
        basis={basis}
        periodLabel={periodLabelOf(months)}
      />
    </>
  );
}

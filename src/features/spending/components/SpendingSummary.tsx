import { Link } from "react-router-dom";

import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/format";

import type { Coverage } from "../compute";
import { SpendDelta } from "./ui";

interface Props {
  total: number;
  previous: number;
  deltaPct: number | null;
  monthlyAvg12: number;
  coverage: Coverage;
}

/**
 * A faixa de cima: quanto se gastou, contra o quê, e quanto disso ainda é número
 * "a detalhar". A cobertura fica ao lado do total de propósito — total com 40% em
 * fatura não aberta é um número diferente de total com 2%.
 */
export function SpendingSummary({ total, previous, deltaPct, monthlyAvg12, coverage }: Props) {
  const pct = coverage.confirmedPct;
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1.4fr]">
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)]">
        <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
          Gasto no período
        </div>
        <div className="mt-1 font-display text-4xl font-semibold tracking-tight tabular-nums">
          {formatBRL(total)}
        </div>
        <div className="mt-1 text-xs text-text-muted">
          <SpendDelta value={deltaPct} /> contra {formatBRL(previous)} no período anterior
        </div>
      </div>
      <Tile label="Período anterior" value={formatBRL(previous)} />
      <Tile label="Média mensal 12m" value={formatBRL(monthlyAvg12)} />
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
            Classificado
          </div>
          <div
            className={cn(
              "font-display text-2xl font-semibold tabular-nums",
              pct != null && pct < 90 ? "text-warning" : "text-text",
            )}
          >
            {pct == null ? "—" : `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct ?? 0}%` }} />
        </div>
        <div className="mt-2 text-xs text-text-muted">
          {coverage.pending > 0 ? (
            <>
              {formatBRL(coverage.pending)} ainda em “A detalhar”
              {coverage.pendingCard > 0 && (
                <>
                  , {formatBRL(coverage.pendingCard)} em compras de cartão sem classificação —{" "}
                  <Link to="/faturas" className="text-accent hover:underline">
                    classificar
                  </Link>
                </>
              )}
            </>
          ) : (
            "Todo o gasto está no item certo."
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface-2/60 p-5">
      <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

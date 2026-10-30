import { parseAsStringLiteral, useQueryState } from "nuqs";

import { BASIS_LABELS } from "@/features/balance/drilldown";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { PeriodPicker } from "@/features/periods/PeriodPicker";
import { effectiveRange, usePeriod } from "@/features/periods/usePeriod";
import { RevenueCenter } from "@/features/revenue/components/RevenueCenter";
import { cn } from "@/lib/cn";

const BASES = ["accrual", "cash"] as const;

/**
 * Receita por área — de onde vem a receita do BTG: por área, produto e assessor. Abre o
 * lançamento mensal do BTG pelos relatórios do CRM, como a fatura de cartão abre em
 * compras, sem mexer na contabilidade. Segue o seletor de empresa, consolidado ou grupo.
 * Ver docs/features/receita-por-area.md.
 */
export default function RevenuePage() {
  const { companyIds, companies, isMultiCompany, scopeKind, scopeLabel, scopeCompanies } =
    useCompanyScope();
  const [period] = usePeriod();
  const [basis, setBasis] = useQueryState(
    "regime",
    parseAsStringLiteral(BASES).withDefault("accrual"),
  );

  const range = effectiveRange(period);
  // No "Personalizado" o intervalo fica incompleto entre um clique e outro.
  const rangeReady = Boolean(range.from && range.to) && range.from <= range.to;
  const scopeName = scopeKind === "consolidated" ? "Consolidado" : scopeLabel;
  const companyName = (id: string) =>
    companies.find((c) => c.id === id)?.trade_name ?? "Empresa sem acesso";

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
            Receita por área
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-semibold tracking-tight">{scopeName}</h1>
            {isMultiCompany && scopeCompanies.length > 1 && (
              <span className="text-2xs rounded-full bg-accent-soft px-2 py-0.5 text-accent">
                somando {scopeCompanies.length} empresas
              </span>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-text-muted">
            A receita do BTG aberta por área, produto e assessor, a partir dos relatórios de
            comissão do CRM. Só o lançamento conferido ao centavo entra no Balanço.
          </p>
        </div>
        <div
          className="inline-flex rounded-[var(--radius-md)] border border-border bg-surface p-0.5"
          role="radiogroup"
          aria-label="Regime"
        >
          {BASES.map((b) => (
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={basis === b}
              onClick={() => void setBasis(b)}
              className={cn(
                "rounded-[calc(var(--radius-md)-2px)] px-3 py-1.5 text-xs font-medium transition-colors",
                basis === b
                  ? "bg-accent text-accent-foreground"
                  : "text-text-muted hover:text-text",
              )}
            >
              {BASIS_LABELS[b]}
            </button>
          ))}
        </div>
      </div>

      <PeriodPicker />

      {rangeReady ? (
        <RevenueCenter
          companyIds={companyIds}
          companies={companies}
          companyName={companyName}
          from={range.from}
          to={range.to}
          basis={basis}
        />
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Escolha as datas inicial e final do período.
        </div>
      )}
    </div>
  );
}

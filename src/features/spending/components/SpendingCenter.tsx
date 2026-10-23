/**
 * Central de Gastos — orquestra as leituras e as seções.
 *
 * Toda seção sai de `management_breakdown_multi` (a camada `v_management_lines`, a mesma
 * do Balanço) e das regras de `compute.ts`. As leituras do resumo (período, anterior, 12
 * meses) carregam sempre; as de Tecnologia, Cartões e Conferência só quando a seção abre.
 */
import * as React from "react";
import {
  AlertTriangle,
  Building2,
  Cpu,
  CreditCard,
  LayoutGrid,
  ListChecks,
  Store,
  type LucideIcon,
} from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AccountingBasis } from "@/features/balance/drilldown";
import { useCostCenters } from "@/features/cost-centers/hooks";
import { useManagementAccounts } from "@/features/management-accounts/hooks";
import { cn } from "@/lib/cn";

import {
  buildAreaBreakdown,
  buildPanorama,
  buildSubscriptions,
  coverageOf,
  previousPeriod,
  summarizeVendors,
  totalSpend,
  trailingYear,
  type BreakdownRow,
  type PlanAccount,
} from "../compute";
import { useCardSummary, useReconciliation, useSpendingBreakdown } from "../hooks";
import { AreaSection } from "./AreaSection";
import { CardsSection } from "./CardsSection";
import { PanoramaSection } from "./PanoramaSection";
import { ReconciliationSection } from "./ReconciliationSection";
import { SpendingSummary } from "./SpendingSummary";
import { SubscriptionsSection } from "./SubscriptionsSection";
import { VendorsSection } from "./VendorsSection";

const SECTIONS = [
  "panorama",
  "areas",
  "tecnologia",
  "fornecedores",
  "cartoes",
  "conferencia",
] as const;
type Section = (typeof SECTIONS)[number];

const SECTION_TABS: { value: Section; label: string; icon: LucideIcon }[] = [
  { value: "panorama", label: "Panorama", icon: LayoutGrid },
  { value: "areas", label: "Por área", icon: Building2 },
  { value: "tecnologia", label: "Tecnologia", icon: Cpu },
  { value: "fornecedores", label: "Fornecedores", icon: Store },
  { value: "cartoes", label: "Cartões", icon: CreditCard },
  { value: "conferencia", label: "Conferência", icon: ListChecks },
];

/** Grupo do plano que a seção de assinaturas lê. Código estável do plano gerencial. */
const TECH_CODES = ["tecnologia"];

interface Props {
  companyIds: string[] | null;
  companyName: (id: string) => string;
  from: string;
  to: string;
  basis: AccountingBasis;
}

interface QueryLike {
  isLoading: boolean;
  error: Error | null;
  refetch: () => unknown;
}

/**
 * Consulta que falha NÃO pode virar seção vazia: "nenhum gasto" e "o banco recusou" têm
 * que parecer diferentes.
 */
function Guard({ queries, children }: { queries: QueryLike[]; children: React.ReactNode }) {
  if (queries.some((q) => q.isLoading)) return <Skeleton className="h-64 w-full" />;
  const failure = queries.find((q) => q.error)?.error;
  if (failure) {
    return (
      <div className="space-y-3 rounded-[var(--radius-lg)] border border-expense/40 bg-expense/5 p-6">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-expense" />
          <div>
            <h3 className="text-sm font-semibold text-expense">
              Não foi possível carregar a Central de Gastos
            </h3>
            <p className="mt-1 font-mono text-xs text-text-muted">{failure.message}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => queries.forEach((q) => void q.refetch())}
        >
          Tentar de novo
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}

export function SpendingCenter({ companyIds, companyName, from, to, basis }: Props) {
  const [section, setSection] = useQueryState(
    "secao",
    parseAsStringLiteral(SECTIONS).withDefault("panorama"),
  );
  const prev = previousPeriod(from, to);
  const year = trailingYear(to);

  const current = useSpendingBreakdown({ companyIds, from, to, basis, byVendor: true });
  const previous = useSpendingBreakdown({ companyIds, ...prev, basis, byVendor: false });
  const last12 = useSpendingBreakdown({ companyIds, ...year, basis, byVendor: false });
  const plan = useManagementAccounts();
  const areas = useCostCenters();

  const accounts = React.useMemo<PlanAccount[]>(
    () =>
      (plan.data ?? []).map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        parentId: a.parent_id,
        sortOrder: a.sort_order,
      })),
    [plan.data],
  );
  const accountName = React.useCallback(
    (id: string | null) => accounts.find((a) => a.id === id)?.name ?? "Sem grupo",
    [accounts],
  );
  const areaName = React.useCallback(
    (id: string | null) =>
      id == null
        ? "Sem área"
        : ((areas.data ?? []).find((a) => a.id === id)?.name ?? "Área removida"),
    [areas.data],
  );

  const rows = React.useMemo(() => current.data ?? [], [current.data]);
  const total = totalSpend(rows);
  const previousTotal = totalSpend(previous.data ?? []);
  const panorama = React.useMemo(
    () =>
      buildPanorama({
        accounts,
        current: rows,
        previous: previous.data ?? [],
        last12: last12.data ?? [],
      }),
    [accounts, rows, previous.data, last12.data],
  );

  const summaryQueries = [current, previous, last12, plan, areas];

  return (
    <div className="space-y-5">
      <Guard queries={summaryQueries}>
        <SpendingSummary
          total={total}
          previous={previousTotal}
          deltaPct={
            Math.abs(previousTotal) < 0.005
              ? null
              : ((total - previousTotal) / Math.abs(previousTotal)) * 100
          }
          monthlyAvg12={Math.round((totalSpend(last12.data ?? []) / 12) * 100) / 100}
          coverage={coverageOf(rows)}
        />
      </Guard>

      <div
        className="flex items-center gap-1 overflow-x-auto border-b border-border"
        role="tablist"
      >
        {SECTION_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={section === t.value}
            onClick={() => void setSection(t.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              section === t.value
                ? "border-accent text-accent"
                : "border-transparent text-text-muted hover:text-text",
            )}
          >
            <t.icon className="size-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {section === "panorama" && (
        <Guard queries={summaryQueries}>
          <PanoramaSection groups={panorama} />
        </Guard>
      )}
      {section === "areas" && (
        <Guard queries={summaryQueries}>
          <AreaSection
            areas={buildAreaBreakdown(rows)}
            areaName={areaName}
            groupName={accountName}
          />
        </Guard>
      )}
      {section === "fornecedores" && (
        <Guard queries={summaryQueries}>
          <VendorsSection
            vendors={summarizeVendors(rows)}
            total={total}
            withoutVendor={totalSpend(rows.filter((r) => !r.vendorKey))}
            companyName={companyName}
          />
        </Guard>
      )}
      {section === "tecnologia" && (
        <TechSection
          companyIds={companyIds}
          companyName={companyName}
          from={from}
          to={to}
          basis={basis}
          current={rows}
          techGroupIds={accounts.filter((a) => TECH_CODES.includes(a.code)).map((a) => a.id)}
          baseQueries={summaryQueries}
        />
      )}
      {section === "cartoes" && (
        <CardsContainer
          companyIds={companyIds}
          companyName={companyName}
          from={from}
          to={to}
          basis={basis}
        />
      )}
      {section === "conferencia" && (
        <ReconciliationContainer
          companyIds={companyIds}
          companyName={companyName}
          from={from}
          to={to}
          basis={basis}
        />
      )}
    </div>
  );
}

function TechSection({
  companyIds,
  companyName,
  from,
  to,
  basis,
  current,
  techGroupIds,
  baseQueries,
}: Props & {
  current: BreakdownRow[];
  techGroupIds: string[];
  baseQueries: QueryLike[];
}) {
  const prev = previousPeriod(from, to);
  const year = trailingYear(to);
  const previous = useSpendingBreakdown({
    companyIds,
    ...prev,
    basis,
    byVendor: true,
    codes: TECH_CODES,
  });
  const window = useSpendingBreakdown({
    companyIds,
    ...year,
    basis,
    byVendor: true,
    codes: TECH_CODES,
  });

  const subscriptions = React.useMemo(
    () =>
      buildSubscriptions({
        current: current.filter(
          (r) => r.managementGroupId && techGroupIds.includes(r.managementGroupId),
        ),
        previous: previous.data ?? [],
        window: window.data ?? [],
        windowEnd: to,
      }),
    [current, techGroupIds, previous.data, window.data, to],
  );

  return (
    <Guard queries={[...baseQueries, previous, window]}>
      <SubscriptionsSection subscriptions={subscriptions} companyName={companyName} />
    </Guard>
  );
}

function CardsContainer({ companyIds, companyName, from, to, basis }: Props) {
  const cards = useCardSummary(companyIds, from, to, basis);
  return (
    <Guard queries={[cards]}>
      <CardsSection cards={cards.data ?? []} companyName={companyName} />
    </Guard>
  );
}

function ReconciliationContainer({ companyIds, companyName, from, to, basis }: Props) {
  const recon = useReconciliation(companyIds, from, to, basis);
  return (
    <Guard queries={[recon]}>
      <ReconciliationSection rows={recon.data ?? []} companyName={companyName} />
    </Guard>
  );
}

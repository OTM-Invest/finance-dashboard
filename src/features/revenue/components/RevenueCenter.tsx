/**
 * Receita por área — orquestra as leituras e as abas.
 *
 * Leitura (área, produto, assessor) sai de `revenue_breakdown_multi`, que lê a mesma
 * camada do Balanço: só receita de lançamento ABERTO e conferido. Conferência, assessores,
 * de-para e sincronização são o caminho até lá. Ver docs/features/receita-por-area.md.
 */
import * as React from "react";
import { format, startOfMonth, subMonths } from "date-fns";
import {
  AlertTriangle,
  Building2,
  ListChecks,
  Package,
  RefreshCw,
  Split,
  Users,
  type LucideIcon,
} from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/features/auth/usePermissions";
import type { AccountingBasis } from "@/features/balance/drilldown";
import type { Company } from "@/features/companies/api";
import { useCostCenters } from "@/features/cost-centers/hooks";
import { useManagementAccounts } from "@/features/management-accounts/hooks";
import { cn } from "@/lib/cn";

import { revenueByAdvisor, revenueByArea, revenueByItem, revenueTotals } from "../compute";
import {
  useAdvisorCodes,
  useAdvisorLinks,
  useCategoryRules,
  useCrmReports,
  useLinkableEmployees,
  usePendingRevenueTransactions,
  useReportRoutes,
  useRevenueBreakdown,
  useRevenueStatements,
  useSyncRuns,
  useUnmappedCombinations,
} from "../hooks";
import { AdvisorLinksSection } from "./AdvisorLinksSection";
import { AdvisorTable, RevenueSummary, SliceTable } from "./BreakdownSections";
import { CategoryMapSection } from "./CategoryMapSection";
import { StatementsSection } from "./StatementsSection";
import { SyncSection } from "./SyncSection";

const SECTIONS = [
  "areas",
  "produtos",
  "assessores",
  "conferencia",
  "de-para",
  "sincronizacao",
] as const;
type Section = (typeof SECTIONS)[number];

const SECTION_TABS: { value: Section; label: string; icon: LucideIcon }[] = [
  { value: "areas", label: "Por área", icon: Building2 },
  { value: "produtos", label: "Por produto", icon: Package },
  { value: "assessores", label: "Assessores", icon: Users },
  { value: "conferencia", label: "Conferência", icon: ListChecks },
  { value: "de-para", label: "De-para", icon: Split },
  { value: "sincronizacao", label: "Sincronização", icon: RefreshCw },
];

/** Janela das abas de operação (relatórios, lançamentos, códigos): os últimos 12 meses. */
function operationsFrom(): string {
  return format(startOfMonth(subMonths(new Date(), 12)), "yyyy-MM-dd");
}

interface QueryLike {
  isLoading: boolean;
  error: Error | null;
  refetch: () => unknown;
}

/** Consulta que falha NÃO vira aba vazia: "sem receita" e "o banco recusou" são diferentes. */
function Guard({ queries, children }: { queries: QueryLike[]; children: React.ReactNode }) {
  if (queries.some((q) => q.isLoading)) return <Skeleton className="h-64 w-full" />;
  const failure = queries.find((q) => q.error)?.error;
  if (failure) {
    return (
      <div className="space-y-3 rounded-[var(--radius-lg)] border border-expense/40 bg-expense/5 p-6">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-expense" />
          <div>
            <h3 className="text-sm font-semibold text-expense">Não foi possível carregar</h3>
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

interface Props {
  companyIds: string[] | null;
  companies: Company[];
  companyName: (id: string) => string;
  from: string;
  to: string;
  basis: AccountingBasis;
}

export function RevenueCenter({ companyIds, companies, companyName, from, to, basis }: Props) {
  const [section, setSection] = useQueryState(
    "secao",
    parseAsStringLiteral(SECTIONS).withDefault("areas"),
  );
  const { canEdit, canManage } = usePermissions();
  const opsFrom = React.useMemo(operationsFrom, []);
  const organizationId = companies[0]?.organization_id ?? null;

  const breakdown = useRevenueBreakdown(companyIds, from, to, basis);
  const plan = useManagementAccounts();
  const areas = useCostCenters();

  const rows = React.useMemo(() => breakdown.data ?? [], [breakdown.data]);
  const areaName = React.useCallback(
    (id: string | null) =>
      id == null
        ? "Sem área"
        : id === "difference"
          ? "Diferença relatório × nota"
          : ((areas.data ?? []).find((a) => a.id === id)?.name ?? "Área removida"),
    [areas.data],
  );
  const itemName = React.useCallback(
    (id: string | null) => (plan.data ?? []).find((a) => a.id === id)?.name ?? "Sem item",
    [plan.data],
  );
  const revenueItems = React.useMemo(
    () =>
      (plan.data ?? [])
        .filter((a) => a.parent_id != null && a.kind === "revenue" && a.is_active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((a) => ({ id: a.id, code: a.code, name: a.name })),
    [plan.data],
  );

  const readQueries = [breakdown, plan, areas];

  return (
    <div className="space-y-5">
      <Guard queries={readQueries}>
        <RevenueSummary totals={revenueTotals(rows)} />
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

      {section === "areas" && (
        <Guard queries={readQueries}>
          <SliceTable slices={revenueByArea(rows)} label="Área" nameOf={areaName} />
          <p className="mt-2 text-xs text-text-muted">
            Margem por área: no Balanço (Relatórios → Balanço), uma linha de filtro com o grupo
            Receitas e a área, medida “líquido”, menos a linha de custo da mesma área.
          </p>
        </Guard>
      )}
      {section === "produtos" && (
        <Guard queries={readQueries}>
          <SliceTable
            slices={revenueByItem(rows)}
            label="Produto (item gerencial)"
            nameOf={itemName}
          />
        </Guard>
      )}
      {section === "assessores" && (
        <AdvisorsContainer
          companyIds={companyIds}
          from={opsFrom}
          areaName={areaName}
          revenue={<AdvisorTable advisors={revenueByAdvisor(rows)} areaName={areaName} />}
          readQueries={readQueries}
          canEdit={canEdit}
        />
      )}
      {section === "conferencia" && (
        <ConferenceContainer
          companyIds={companyIds}
          from={opsFrom}
          companyName={companyName}
          canEdit={canEdit}
        />
      )}
      {section === "de-para" && (
        <CategoryMapContainer
          companyIds={companyIds}
          items={revenueItems}
          organizationId={organizationId}
          canEdit={canEdit}
        />
      )}
      {section === "sincronizacao" && (
        <SyncContainer
          companies={companies}
          organizationId={organizationId}
          canEdit={canEdit}
          canManage={canManage}
        />
      )}
    </div>
  );
}

function AdvisorsContainer({
  companyIds,
  from,
  areaName,
  revenue,
  readQueries,
  canEdit,
}: {
  companyIds: string[] | null;
  from: string;
  areaName: (id: string | null) => string;
  revenue: React.ReactNode;
  readQueries: QueryLike[];
  canEdit: boolean;
}) {
  const codes = useAdvisorCodes(companyIds, from);
  const links = useAdvisorLinks();
  const employees = useLinkableEmployees();
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Receita aberta no período, por assessor</h2>
        <Guard queries={readQueries}>{revenue}</Guard>
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Código BTG → colaborador (últimos 12 meses)</h2>
        <Guard queries={[codes, links, employees]}>
          <AdvisorLinksSection
            codes={codes.data ?? []}
            links={links.data ?? []}
            employees={employees.data ?? []}
            areaName={areaName}
            canEdit={canEdit}
          />
        </Guard>
      </section>
    </div>
  );
}

function ConferenceContainer({
  companyIds,
  from,
  companyName,
  canEdit,
}: {
  companyIds: string[] | null;
  from: string;
  companyName: (id: string) => string;
  canEdit: boolean;
}) {
  const reports = useCrmReports(companyIds, from);
  const pending = usePendingRevenueTransactions(companyIds, from);
  const statements = useRevenueStatements(companyIds);
  return (
    <Guard queries={[reports, pending, statements]}>
      <StatementsSection
        reports={reports.data ?? []}
        pending={pending.data ?? []}
        statements={statements.data ?? []}
        companyName={companyName}
        canEdit={canEdit}
      />
    </Guard>
  );
}

function CategoryMapContainer({
  companyIds,
  items,
  organizationId,
  canEdit,
}: {
  companyIds: string[] | null;
  items: { id: string; code: string; name: string }[];
  organizationId: string | null;
  canEdit: boolean;
}) {
  const rules = useCategoryRules();
  const unmapped = useUnmappedCombinations(companyIds);
  return (
    <Guard queries={[rules, unmapped]}>
      <CategoryMapSection
        rules={rules.data ?? []}
        unmapped={unmapped.data ?? []}
        items={items}
        organizationId={organizationId}
        canEdit={canEdit}
      />
    </Guard>
  );
}

function SyncContainer({
  companies,
  organizationId,
  canEdit,
  canManage,
}: {
  companies: Company[];
  organizationId: string | null;
  canEdit: boolean;
  canManage: boolean;
}) {
  const routes = useReportRoutes();
  const runs = useSyncRuns();
  return (
    <Guard queries={[routes, runs]}>
      <SyncSection
        routes={routes.data ?? []}
        runs={runs.data ?? []}
        companies={companies}
        organizationId={organizationId}
        canEdit={canEdit}
        canManage={canManage}
      />
    </Guard>
  );
}

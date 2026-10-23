import * as React from "react";
import { BarChart3, Building2, Table2, Users, type LucideIcon } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BalanceReport } from "@/features/balance/components/BalanceReport";
import { balanceScopeFrom } from "@/features/balance/scope";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { PeriodPicker } from "@/features/periods/PeriodPicker";
import { effectiveRange, usePeriod } from "@/features/periods/usePeriod";
import type { CounterpartyKindFilter } from "@/features/reports/api";
import { CostCenterReport } from "@/features/reports/components/CostCenterReport";
import { CounterpartyReport } from "@/features/reports/components/CounterpartyReport";
import { DreComparisonReport } from "@/features/reports/components/DreComparisonReport";
import { cn } from "@/lib/cn";
import { formatMonthYear } from "@/lib/dates";

const TAB_VALUES = ["cost-center", "balance", "counterparty", "dre-comparison"] as const;
type Tab = (typeof TAB_VALUES)[number];

const TABS: { value: Tab; label: string; icon: LucideIcon }[] = [
  { value: "cost-center", label: "Áreas", icon: Building2 },
  { value: "balance", label: "Balanço", icon: Table2 },
  { value: "counterparty", label: "Contrapartes", icon: Users },
  { value: "dre-comparison", label: "DRE Comparativo", icon: BarChart3 },
];

type Comparison = "mom" | "yoy";

function comparisonPeriods(cmp: Comparison): {
  a: { from: string; to: string; label: string };
  b: { from: string; to: string; label: string };
} {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (cmp === "mom") {
    return {
      a: {
        from: iso(new Date(y, m - 1, 1)),
        to: iso(new Date(y, m, 0)),
        label: formatMonthYear(new Date(y, m - 1, 1)),
      },
      b: {
        from: iso(new Date(y, m - 2, 1)),
        to: iso(new Date(y, m - 1, 0)),
        label: formatMonthYear(new Date(y, m - 2, 1)),
      },
    };
  }
  // YoY: previous month this year vs previous month last year
  return {
    a: {
      from: iso(new Date(y, m - 1, 1)),
      to: iso(new Date(y, m, 0)),
      label: formatMonthYear(new Date(y, m - 1, 1)),
    },
    b: {
      from: iso(new Date(y - 1, m - 1, 1)),
      to: iso(new Date(y - 1, m, 0)),
      label: formatMonthYear(new Date(y - 1, m - 1, 1)),
    },
  };
}

export default function ReportsPage() {
  // Os quatro relatórios seguem o escopo do seletor, cada um do jeito que faz sentido:
  //  · centro de custo agrupa pela chave de consolidação (nome, ou grupo de fusão);
  //  · contraparte soma direto, porque contraparte é da organização;
  //  · comparativo de DRE agrega pelo plano-mestre quando há mais de uma empresa;
  //  · balanço usa o modelo de linhas DO ESCOPO (empresa, grupo ou consolidado).
  const {
    selectedCompanyId,
    selectedGroup,
    companyIds,
    companies,
    isMultiCompany,
    scopeKind,
    scopeLabel,
    scopeCompanies,
  } = useCompanyScope();
  // Sem constante hardcoded: a organização vem da própria lista de empresas acessíveis.
  // Enquanto ela não carregar, as consultas que dependem dela ficam desligadas.
  const organizationId = companies[0]?.organization_id ?? "";
  // Aba e período na URL: o link para um balanço vale o balanço daquele período.
  const [tab, setTab] = useQueryState(
    "aba",
    parseAsStringLiteral(TAB_VALUES).withDefault("cost-center"),
  );
  const [period] = usePeriod();
  const [kind, setKind] = React.useState<CounterpartyKindFilter>("all");
  const [comparison, setComparison] = React.useState<Comparison>("mom");

  const balanceScope = balanceScopeFrom({
    scopeKind,
    selectedCompanyId,
    selectedGroupId: selectedGroup?.id ?? null,
  });

  const scopeName = scopeKind === "consolidated" ? "Consolidado" : scopeLabel;
  const range = effectiveRange(period);
  // No preset "Personalizado" o intervalo fica incompleto entre um clique e outro;
  // sem esta guarda os RPCs receberiam data vazia ou invertida.
  const rangeReady = Boolean(range.from && range.to) && range.from <= range.to;
  const cmp = comparisonPeriods(comparison);

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <Header
        scopeName={scopeName}
        companiesCount={isMultiCompany ? scopeCompanies.length : null}
      />

      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map((t) => (
          <TabButton key={t.value} active={tab === t.value} onClick={() => void setTab(t.value)}>
            <t.icon className="size-3.5" /> {t.label}
          </TabButton>
        ))}
      </div>

      {tab === "dre-comparison" ? (
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="cmp">Comparação</Label>
          <Select value={comparison} onValueChange={(v) => setComparison(v as Comparison)}>
            <SelectTrigger id="cmp">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mom">Mês a mês (MoM)</SelectItem>
              <SelectItem value="yoy">Ano a ano (YoY)</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-2xs text-text-subtle">
            {cmp.a.label} vs {cmp.b.label}
          </span>
        </div>
      ) : (
        <PeriodPicker />
      )}

      {tab !== "dre-comparison" && !rangeReady && (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Escolha as datas inicial e final do período.
        </div>
      )}

      {tab === "cost-center" && rangeReady && (
        <CostCenterReport companyIds={companyIds} from={range.from} to={range.to} />
      )}
      {tab === "balance" && rangeReady && (
        <BalanceReport
          scope={balanceScope}
          organizationId={organizationId}
          companyIds={companyIds}
          groupName={selectedGroup?.name}
          from={range.from}
          to={range.to}
        />
      )}
      {tab === "counterparty" && rangeReady && (
        <CounterpartyReport
          companyIds={companyIds}
          from={range.from}
          to={range.to}
          kind={kind}
          onKindChange={setKind}
        />
      )}
      {tab === "dre-comparison" && (
        <DreComparisonReport
          companyId={selectedCompanyId}
          organizationId={organizationId}
          companyIds={companyIds}
          aggregated={isMultiCompany}
          aFrom={cmp.a.from}
          aTo={cmp.a.to}
          bFrom={cmp.b.from}
          bTo={cmp.b.to}
          labelA={cmp.a.label}
          labelB={cmp.b.label}
        />
      )}
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
        active ? "border-accent text-accent" : "border-transparent text-text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

function Header({
  scopeName,
  companiesCount,
}: {
  scopeName: string;
  /** Nº de empresas somadas; `null` quando o escopo é uma empresa. */
  companiesCount: number | null;
}) {
  return (
    <div>
      <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
        Relatórios Gerenciais
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{scopeName}</h1>
        {companiesCount !== null && companiesCount > 1 && (
          <span className="text-2xs rounded-full bg-accent-soft px-2 py-0.5 text-accent">
            somando {companiesCount} empresas
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-text-muted">
        Balanço gerencial mês a mês, análises por área e contraparte e comparativos de DRE (MoM/YoY)
        — todos exportáveis para CSV.
      </p>
    </div>
  );
}

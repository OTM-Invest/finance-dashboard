/**
 * Aba "Balanço" — orquestra período, modelo e matriz.
 *
 * O rascunho do modelo vive aqui para a matriz mostrar o efeito de cada mudança
 * antes de salvar: montar um Ebitda às cegas e só descobrir o número depois de
 * persistir seria pior. `draft === null` significa "seguindo o que está salvo".
 */
import * as React from "react";
import { AlertTriangle, ArrowUpDown, Download, Loader2, Settings2, Sparkles } from "lucide-react";
import { parseAsBoolean, parseAsStringLiteral, useQueryState } from "nuqs";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCostCenters } from "@/features/cost-centers/hooks";
import { useManagementAccounts } from "@/features/management-accounts/hooks";
import { buildManagementTree } from "@/features/management-accounts/tree";
import { cn } from "@/lib/cn";
import { downloadCsv } from "@/lib/csv";

import { buildBalanceMatrix } from "../compute";
import { buildBalanceCsv } from "../csv";
import { BASIS_LABELS } from "../drilldown";
import { useBalanceModel, useMonthlySeries, useSaveBalanceModel } from "../hooks";
import { linesFromManagementGroups, type BalanceLine } from "../schema";
import { balanceScopeLabel, type BalanceScope } from "../scope";
import { BalanceMatrix } from "./BalanceMatrix";
import { BalanceModelPanel } from "./BalanceModelPanel";
import type { BalanceOptions } from "./options";

const BASES = ["accrual", "cash"] as const;

interface Props {
  /** Escopo do MODELO de linhas: empresa, grupo, ou consolidado. */
  scope: BalanceScope;
  organizationId: string;
  /** Recorte de empresas do escopo — nulo em consolidado. */
  companyIds: string[] | null;
  groupName?: string;
  from: string;
  to: string;
}

export function BalanceReport({ scope, organizationId, companyIds, groupName, from, to }: Props) {
  const [draft, setDraft] = React.useState<BalanceLine[] | null>(null);
  const [editing, setEditing] = React.useState(false);
  // Na URL junto com aba e período: o link reproduz a tela como ela está.
  const [showVariation, setShowVariation] = useQueryState(
    "variacao",
    parseAsBoolean.withDefault(true),
  );
  const [basis, setBasis] = useQueryState(
    "regime",
    parseAsStringLiteral(BASES).withDefault("accrual"),
  );

  const seriesQuery = useMonthlySeries(companyIds, from, to, basis);
  const modelQuery = useBalanceModel(scope, organizationId);
  const save = useSaveBalanceModel(scope, organizationId);

  // Plano gerencial e áreas são globais: a mesma lista serve empresa, grupo e
  // consolidado. O que muda por escopo é o MODELO de linhas, não as opções.
  const managementQuery = useManagementAccounts();
  const costCentersQuery = useCostCenters();

  const saved = React.useMemo(() => modelQuery.data ?? [], [modelQuery.data]);
  const lines = draft ?? saved;
  const isDirty = draft != null && JSON.stringify(draft) !== JSON.stringify(saved);

  const options = React.useMemo<BalanceOptions>(() => {
    const { groups } = buildManagementTree(
      (managementQuery.data ?? []).filter((a) => a.is_active),
      [],
    );
    return {
      groups: groups.map(({ group, items }) => ({
        id: group.id,
        name: group.name,
        items: items.map(({ account }) => ({ id: account.id, name: account.name })),
      })),
      areas: (costCentersQuery.data ?? [])
        .filter((cc) => cc.is_active)
        .map((cc) => ({ id: cc.id, name: cc.name })),
    };
  }, [managementQuery.data, costCentersQuery.data]);

  const scopeLabel = balanceScopeLabel(scope, { groupName });

  const matrix = React.useMemo(
    () => buildBalanceMatrix({ from, to, series: seriesQuery.data ?? [], lines }),
    [from, to, seriesQuery.data, lines],
  );

  const isLoading =
    seriesQuery.isLoading ||
    modelQuery.isLoading ||
    managementQuery.isLoading ||
    costCentersQuery.isLoading;
  if (isLoading) return <Skeleton className="h-72 w-full" />;

  // Consulta que falha NÃO pode virar matriz vazia: sem dado, toda linha calcula
  // zero e a tela fica idêntica a "não houve movimento no período" — um erro de
  // banco passa por resultado legítimo e ninguém percebe.
  const failure =
    seriesQuery.error ?? modelQuery.error ?? managementQuery.error ?? costCentersQuery.error;
  if (failure) {
    return (
      <div className="space-y-3 rounded-[var(--radius-lg)] border border-expense/40 bg-expense/5 p-6">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-expense" />
          <div>
            <h3 className="text-sm font-semibold text-expense">
              Não foi possível carregar o balanço
            </h3>
            <p className="mt-1 font-mono text-xs text-text-muted">{failure.message}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void seriesQuery.refetch();
            void modelQuery.refetch();
            void managementQuery.refetch();
            void costCentersQuery.refetch();
          }}
        >
          Tentar de novo
        </Button>
      </div>
    );
  }

  const persist = () => {
    if (draft == null) return;
    save.mutate(draft, {
      onSuccess: () => {
        setDraft(null);
        toast.success("Modelo salvo");
      },
      onError: (err) => toast.error("Erro ao salvar o modelo", { description: err.message }),
    });
  };

  if (lines.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-12 text-center">
          <h3 className="text-sm font-semibold">Monte o balanço {scopeLabel}</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">
            Cada linha da matriz é um item: uma parte do plano gerencial (por área e natureza), uma
            fórmula sobre outros itens (Ebitda, Lucro Líquido) ou um percentual (Margem).
          </p>
          <Button
            className="mt-4"
            disabled={options.groups.length === 0}
            onClick={() => {
              setDraft(linesFromManagementGroups(options.groups));
              setEditing(true);
            }}
          >
            <Sparkles className="size-4" /> Começar com um item por grupo do plano gerencial
          </Button>
          {options.groups.length === 0 && (
            <p className="text-2xs mt-3 text-text-muted">
              Monte o plano gerencial em Configurações antes de montar o balanço.
            </p>
          )}
        </div>
        {editing && (
          <BalanceModelPanel
            lines={lines}
            series={seriesQuery.data ?? []}
            options={options}
            onChange={(next) => setDraft(next)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div
          role="group"
          aria-label="Regime contábil"
          className="mr-auto inline-flex rounded-[var(--radius-md)] border border-border p-0.5"
        >
          {BASES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={basis === option}
              onClick={() => void setBasis(option)}
              className={cn(
                "rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors",
                basis === option ? "bg-surface-3 text-text" : "text-text-muted hover:text-text",
              )}
            >
              {BASIS_LABELS[option]}
            </button>
          ))}
        </div>

        {isDirty && (
          <>
            <span className="text-2xs text-text-muted">Alterações não salvas</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft(null)}
              disabled={save.isPending}
            >
              Descartar
            </Button>
            <Button size="sm" onClick={persist} disabled={save.isPending}>
              {save.isPending && <Loader2 className="size-3.5 animate-spin" />}
              Salvar modelo
            </Button>
          </>
        )}
        <Button
          variant={showVariation ? "secondary" : "outline"}
          size="sm"
          aria-pressed={showVariation}
          onClick={() => void setShowVariation(!showVariation)}
        >
          <ArrowUpDown className="size-3.5" /> Variação mês a mês
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
          <Settings2 className="size-3.5" /> {editing ? "Ocultar modelo" : "Editar modelo"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadCsv(
              `balanco-${basis === "cash" ? "caixa" : "competencia"}-${from}-${to}.csv`,
              buildBalanceCsv(matrix.months, matrix.lines, { includeVariation: showVariation }),
            )
          }
        >
          <Download className="size-3.5" /> Exportar CSV
        </Button>
      </div>

      {editing && (
        <BalanceModelPanel
          lines={lines}
          series={seriesQuery.data ?? []}
          options={options}
          onChange={(next) => setDraft(next)}
        />
      )}

      <BalanceMatrix
        matrix={matrix}
        showVariation={showVariation}
        basis={basis}
        companyIds={companyIds}
        from={from}
        to={to}
      />

      {matrix.lines.some((l) => l.kind === "unclassified") && (
        <p className="text-2xs text-text-muted">
          A linha <strong>Não classificado</strong> é o que nenhum item captura — inclusive
          transferência entre contas, que soma zero. Ela existe para o relatório fechar com o total
          do escopo; some quando o modelo cobre tudo.
        </p>
      )}
    </div>
  );
}

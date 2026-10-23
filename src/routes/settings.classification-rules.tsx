import * as React from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/features/auth/usePermissions";
import type { ClassificationRule } from "@/features/card-statements/api";
import {
  useClassificationRules,
  useDeleteClassificationRule,
  useSetClassificationRuleActive,
} from "@/features/card-statements/hooks";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { useCostCenters } from "@/features/cost-centers/hooks";
import { useManagementAccounts } from "@/features/management-accounts/hooks";
import { cn } from "@/lib/cn";

const MATCH_LABELS: Record<string, string> = { prefix: "começa com", contains: "contém" };

/**
 * Regras de classificação das compras de cartão.
 *
 * Cada regra é uma decisão que alguém tomou uma vez — "FACEBK é mídia paga" — e que vale
 * para toda fatura importada depois. Nascem na tela da fatura ("criar regra" numa compra
 * classificada); aqui se confere, desliga ou apaga.
 */
export default function SettingsClassificationRulesPage() {
  const { canEdit } = usePermissions();
  const { companies } = useCompanyScope();
  const { data: rules = [], isLoading } = useClassificationRules();
  const { data: accounts = [] } = useManagementAccounts();
  const { data: areas = [] } = useCostCenters();
  const setActive = useSetClassificationRuleActive();
  const remove = useDeleteClassificationRule();
  const [deleting, setDeleting] = React.useState<ClassificationRule | null>(null);

  const itemLabel = (id: string) => {
    const item = accounts.find((a) => a.id === id);
    const group = accounts.find((a) => a.id === item?.parent_id);
    return item ? `${group?.name ?? ""} · ${item.name}` : "—";
  };
  const areaName = (id: string | null) => areas.find((a) => a.id === id)?.name ?? "—";
  const companyName = (id: string | null) =>
    id ? (companies.find((c) => c.id === id)?.trade_name ?? "—") : "Todas";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Regras de classificação</h2>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          Como cada compra de cartão é classificada automaticamente, pela descrição impressa na
          fatura. Compra classificada por regra conta direto no Balanço; o que nenhuma regra pega
          fica a classificar — ou com sugestão da IA, que só conta depois de aceita.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Nenhuma regra ainda. Crie a partir de uma compra classificada, na tela da fatura.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface-2/60">
              <tr className="text-2xs border-b border-border tracking-wide text-text-subtle uppercase">
                <th className="px-4 py-2.5 text-left font-medium">Fornecedor</th>
                <th className="px-4 py-2.5 text-left font-medium">Descrição</th>
                <th className="px-4 py-2.5 text-left font-medium">Item gerencial</th>
                <th className="px-4 py-2.5 text-left font-medium">Área</th>
                <th className="px-4 py-2.5 text-left font-medium">Empresa</th>
                <th className="px-4 py-2.5 text-right font-medium">Status</th>
                <th className="w-12 px-2 py-2.5">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr
                  key={rule.id}
                  className={cn(
                    "border-b border-border last:border-0 hover:bg-surface-2/40",
                    !rule.is_active && "opacity-60",
                  )}
                >
                  <td className="px-4 py-2 font-medium">{rule.name}</td>
                  <td className="px-4 py-2 text-xs text-text-muted">
                    {MATCH_LABELS[rule.match_kind] ?? rule.match_kind}{" "}
                    <span className="font-mono text-text">{rule.pattern}</span>
                  </td>
                  <td className="px-4 py-2">{itemLabel(rule.management_account_id)}</td>
                  <td className="px-4 py-2 text-text-muted">{areaName(rule.cost_center_id)}</td>
                  <td className="px-4 py-2 text-text-muted">{companyName(rule.company_id)}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      disabled={!canEdit || setActive.isPending}
                      onClick={() =>
                        setActive.mutate(
                          { id: rule.id, isActive: !rule.is_active },
                          {
                            onError: (err) =>
                              toast.error("Não foi possível alterar", { description: err.message }),
                          },
                        )
                      }
                      className="disabled:cursor-default"
                      aria-label={rule.is_active ? `Desligar ${rule.name}` : `Ligar ${rule.name}`}
                    >
                      {rule.is_active ? (
                        <Badge tone="income">Ativa</Badge>
                      ) : (
                        <Badge tone="default">Desligada</Badge>
                      )}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Apagar ${rule.name}`}
                        onClick={() => setDeleting(rule)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Apagar a regra "${deleting?.name ?? ""}"?`}
        description="As compras já classificadas por ela continuam como estão; só as próximas faturas deixam de usá-la. Para pausar sem perder a regra, desligue em vez de apagar."
        confirmLabel="Apagar"
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success("Regra apagada");
              setDeleting(null);
            },
            onError: (err) => toast.error("Não foi possível apagar", { description: err.message }),
          });
        }}
      />
    </div>
  );
}

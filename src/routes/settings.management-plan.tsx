import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/features/auth/usePermissions";
import type { ManagementAccount } from "@/features/management-accounts/api";
import { AccountMappingTable } from "@/features/management-accounts/components/AccountMappingTable";
import { ManagementItemDrawer } from "@/features/management-accounts/components/ManagementItemDrawer";
import { ManagementPlanTree } from "@/features/management-accounts/components/ManagementPlanTree";
import {
  useManagementAccounts,
  useMasterAccountMapping,
} from "@/features/management-accounts/hooks";
import { buildManagementTree } from "@/features/management-accounts/tree";

interface DrawerState {
  group: ManagementAccount;
  item: ManagementAccount | null;
}

/**
 * Plano gerencial: o que cada gasto É, independente de como a contabilidade o lança.
 *
 * O item sai da conta contábil — uma vez, aqui — e não é redigitado por lançamento. É a
 * base da Central de Gastos e, na próxima fase, das linhas do Balanço.
 * Ver docs/features/central-de-gastos-plan.md.
 */
export default function SettingsManagementPlanPage() {
  const { canEdit } = usePermissions();
  const { data: accounts = [], isLoading: loadingPlan } = useManagementAccounts();
  const { data: masterAccounts = [], isLoading: loadingMap } = useMasterAccountMapping();
  const [drawer, setDrawer] = React.useState<DrawerState | null>(null);

  const { groups, orphanAccounts } = React.useMemo(
    () => buildManagementTree(accounts, masterAccounts),
    [accounts, masterAccounts],
  );
  const existingCodes = React.useMemo(() => new Set(accounts.map((a) => a.code)), [accounts]);

  if (loadingPlan || loadingMap) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Plano gerencial</h2>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          Classifica o gasto pelo que ele é — pessoas, tecnologia, ocupação — a partir da conta
          contábil. Vale para todas as empresas do grupo e não altera a DRE.
        </p>
      </div>

      {orphanAccounts.length > 0 && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-[var(--radius-md)] border border-warning/40 bg-warning-soft/40 p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <div className="font-medium">
              {orphanAccounts.length} conta{orphanAccounts.length === 1 ? "" : "s"} sem item
            </div>
            <p className="mt-0.5 text-text-muted">
              {orphanAccounts.map((m) => `${m.code} ${m.name}`).join(" · ")}. Escolha o item na
              tabela abaixo.
            </p>
          </div>
        </div>
      )}

      <ManagementPlanTree
        groups={groups}
        canEdit={canEdit}
        onCreateItem={(group) => setDrawer({ group, item: null })}
        onEditItem={(group, item) => setDrawer({ group, item })}
      />

      <section aria-labelledby="mgmt-mapping-heading" className="space-y-3">
        <div>
          <h3 id="mgmt-mapping-heading" className="text-base font-semibold tracking-tight">
            Mapa das contas
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-text-muted">
            Em que item cai cada conta do plano de contas. Trocar aqui reclassifica todos os
            lançamentos da conta, em todas as empresas. Conta nova nasce no item padrão do tipo
            dela.
          </p>
        </div>
        <AccountMappingTable masterAccounts={masterAccounts} groups={groups} canEdit={canEdit} />
      </section>

      {drawer && (
        <ManagementItemDrawer
          open
          onOpenChange={(open) => {
            if (!open) setDrawer(null);
          }}
          group={drawer.group}
          item={drawer.item}
          existingCodes={existingCodes}
        />
      )}
    </div>
  );
}

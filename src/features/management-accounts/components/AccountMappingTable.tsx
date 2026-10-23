import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { ManagementAccount } from "../api";
import { useUpdateMasterAccountMapping } from "../hooks";
import type { ManagementGroupNode, MasterAccountRow } from "../tree";

interface Props {
  masterAccounts: MasterAccountRow[];
  groups: ManagementGroupNode<ManagementAccount>[];
  canEdit: boolean;
}

/**
 * O mapa conta → item, conta a conta. Mexer aqui muda a classificação de TODOS os
 * lançamentos da conta, em todas as empresas — é a única tela que faz isso, e de
 * propósito: o item sai da conta, não é redigitado por lançamento.
 */
export function AccountMappingTable({ masterAccounts, groups, canEdit }: Props) {
  const updateMapping = useUpdateMasterAccountMapping();

  function change(master: MasterAccountRow, managementAccountId: string) {
    if (managementAccountId === master.management_account_id) return;
    updateMapping.mutate(
      { masterAccountId: master.id, managementAccountId },
      {
        onSuccess: () => toast.success(`${master.code} ${master.name} reclassificada`),
        onError: (err) => toast.error("Não foi possível salvar", { description: err.message }),
      },
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-surface-2/60">
          <tr className="border-b border-border">
            <th className="text-2xs w-24 px-4 py-2.5 text-left font-medium tracking-wide text-text-subtle uppercase">
              Conta
            </th>
            <th className="text-2xs px-4 py-2.5 text-left font-medium tracking-wide text-text-subtle uppercase">
              Nome no plano de contas
            </th>
            <th className="text-2xs w-[320px] px-4 py-2.5 text-left font-medium tracking-wide text-text-subtle uppercase">
              Item gerencial
            </th>
          </tr>
        </thead>
        <tbody>
          {masterAccounts.map((master) => (
            <tr
              key={master.id}
              className="border-b border-border last:border-0 hover:bg-surface-2/40"
            >
              <td className="px-4 py-2 font-mono text-xs text-text-muted">{master.code}</td>
              <td className="px-4 py-2">{master.name}</td>
              <td className="px-4 py-1.5">
                <Select
                  value={master.management_account_id ?? ""}
                  onValueChange={(v) => change(master, v)}
                  disabled={!canEdit || updateMapping.isPending}
                >
                  <SelectTrigger
                    aria-label={`Item gerencial de ${master.code}`}
                    className={master.management_account_id ? undefined : "border-warning"}
                  >
                    <SelectValue placeholder="Sem item" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map(({ group, items }) => (
                      <SelectGroup key={group.id}>
                        <SelectLabel>{group.name}</SelectLabel>
                        {items
                          .filter(
                            ({ account }) =>
                              account.is_active || account.id === master.management_account_id,
                          )
                          .map(({ account }) => (
                            <SelectItem key={account.id} value={account.id}>
                              {group.name} · {account.name}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

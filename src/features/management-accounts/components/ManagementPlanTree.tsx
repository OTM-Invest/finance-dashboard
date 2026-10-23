import { Pencil, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import type { ManagementAccount } from "../api";
import { KIND_LABELS, NATURE_LABELS, type ManagementGroupNode } from "../tree";

interface Props {
  groups: ManagementGroupNode<ManagementAccount>[];
  canEdit: boolean;
  onCreateItem: (group: ManagementAccount) => void;
  onEditItem: (group: ManagementAccount, item: ManagementAccount) => void;
}

/**
 * O plano em blocos: um por grupo, com os itens e as contas que caem em cada um. Ler a
 * conta ao lado do item é o que permite conferir o mapa sem abrir outra tela.
 */
export function ManagementPlanTree({ groups, canEdit, onCreateItem, onEditItem }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {groups.map(({ group, items, mappedCount }) => (
        <section
          key={group.id}
          aria-labelledby={`mgmt-group-${group.id}`}
          className={cn(
            "rounded-[var(--radius-lg)] border bg-surface",
            group.requires_detail ? "border-warning/40" : "border-border",
          )}
        >
          <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <h3 id={`mgmt-group-${group.id}`} className="text-sm font-semibold tracking-tight">
                {group.name}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge tone="default">{KIND_LABELS[group.kind]}</Badge>
                {group.requires_detail && <Badge tone="warning">A detalhar</Badge>}
                <span className="text-2xs text-text-subtle">
                  {mappedCount} conta{mappedCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>
            {canEdit && (
              <Button size="sm" variant="ghost" onClick={() => onCreateItem(group)}>
                <Plus className="size-4" /> Item
              </Button>
            )}
          </header>

          <ul className="divide-y divide-border">
            {items.map(({ account, mappedAccounts }) => (
              <li
                key={account.id}
                className={cn("group/item px-4 py-2.5", !account.is_active && "opacity-60")}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{account.name}</span>
                    {account.nature && (
                      <Badge tone={account.nature === "capex" ? "info" : "default"}>
                        {NATURE_LABELS[account.nature]}
                      </Badge>
                    )}
                    {!account.is_active && <Badge tone="default">Inativo</Badge>}
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={`Editar ${account.name}`}
                      onClick={() => onEditItem(group, account)}
                      className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] text-text-muted opacity-0 transition-opacity group-hover/item:opacity-100 hover:bg-surface-2 hover:text-text focus-visible:opacity-100"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                </div>
                {mappedAccounts.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {mappedAccounts.map((m) => (
                      <span
                        key={m.id}
                        className="text-2xs rounded-[var(--radius-sm)] bg-surface-2 px-1.5 py-0.5 font-mono text-text-muted"
                        title={m.name}
                      >
                        {m.code} {m.name}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
            {items.length === 0 && (
              <li className="px-4 py-3 text-xs text-text-subtle">Nenhum item neste grupo.</li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

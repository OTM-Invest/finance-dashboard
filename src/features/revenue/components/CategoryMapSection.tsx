/**
 * De-para da receita do BTG: categoria × produto → item de receita do plano gerencial.
 *
 * Produto vazio é curinga da categoria; o par exato ganha do curinga (a regra mora em
 * `v_revenue_lines`, no banco — aqui só se edita a tabela). Combinação aberta sem regra
 * cai em "BTG · Outras receitas" e aparece no topo, para alguém decidir.
 */
import * as React from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, Money, SpendTable, Td, Th } from "@/features/spending/components/ui";

import type { CategoryRule, UnmappedCombination } from "../api";
import { useDeleteCategoryRule, useSaveCategoryRule } from "../hooks";

export interface RevenueItem {
  id: string;
  code: string;
  name: string;
}

interface Props {
  rules: CategoryRule[];
  unmapped: UnmappedCombination[];
  items: RevenueItem[];
  organizationId: string | null;
  canEdit: boolean;
}

function ItemSelect({
  value,
  items,
  disabled,
  onChange,
}: {
  value: string;
  items: RevenueItem[];
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger size="sm" className="w-72">
        <SelectValue placeholder="Item de receita" />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.id} value={i.id}>
            {i.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CategoryMapSection({ rules, unmapped, items, organizationId, canEdit }: Props) {
  const save = useSaveCategoryRule();
  const remove = useDeleteCategoryRule();
  const [draft, setDraft] = React.useState({ category: "", product: "", itemId: "" });
  // Diferença é linha do banco, não destino de regra (o banco recusa).
  const choices = items.filter((i) => i.code !== "receitas.btg_diferenca");

  const onError = (e: unknown) =>
    toast.error("Não foi possível gravar a regra", {
      description: e instanceof Error ? e.message : undefined,
    });

  const create = (category: string, product: string | null, itemId: string) => {
    if (!organizationId) return;
    save.mutate(
      { organizationId, category, product, managementAccountId: itemId },
      {
        onSuccess: () => {
          toast.success("Regra criada");
          setDraft({ category: "", product: "", itemId: "" });
        },
        onError,
      },
    );
  };

  return (
    <div className="space-y-5">
      {unmapped.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-warning">
            Caíram em “BTG · Outras receitas” por falta de regra
          </h2>
          <SpendTable>
            <tbody>
              {unmapped.map((u) => (
                <tr key={`${u.category}|${u.product}`} className="border-t border-border">
                  <Td align="left">{u.category}</Td>
                  <Td align="left" className="text-text-muted">
                    {u.product}
                  </Td>
                  <Td>
                    <Money value={u.amount} />
                  </Td>
                  <Td align="left">
                    <ItemSelect
                      value=""
                      items={choices}
                      disabled={!canEdit || save.isPending}
                      onChange={(id) => create(u.category, null, id)}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </SpendTable>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Regras</h2>
        {rules.length === 0 ? (
          <EmptyState>Nenhuma regra.</EmptyState>
        ) : (
          <SpendTable>
            <thead className="bg-surface-2">
              <tr>
                <Th align="left">Categoria do BTG</Th>
                <Th align="left">Produto</Th>
                <Th align="left">Item gerencial</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <Td align="left" className="font-medium">
                    {r.category}
                  </Td>
                  <Td align="left" className={r.product ? "" : "text-text-muted italic"}>
                    {r.product ?? "qualquer produto"}
                  </Td>
                  <Td align="left">
                    <ItemSelect
                      value={r.managementAccountId}
                      items={choices}
                      disabled={!canEdit || save.isPending}
                      onChange={(id) =>
                        save.mutate(
                          { id: r.id, managementAccountId: id },
                          { onSuccess: () => toast.success("Regra atualizada"), onError },
                        )
                      }
                    />
                  </Td>
                  <Td>
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Apagar regra"
                        disabled={remove.isPending}
                        onClick={() =>
                          remove.mutate(r.id, {
                            onSuccess: () => toast.success("Regra apagada"),
                            onError,
                          })
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </SpendTable>
        )}
      </section>

      {canEdit && (
        <section className="flex flex-wrap items-end gap-2">
          <Input
            className="h-8 w-56"
            placeholder="Categoria (como vem do BTG)"
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          />
          <Input
            className="h-8 w-56"
            placeholder="Produto (vazio = qualquer)"
            value={draft.product}
            onChange={(e) => setDraft({ ...draft, product: e.target.value })}
          />
          <ItemSelect
            value={draft.itemId}
            items={choices}
            disabled={save.isPending}
            onChange={(id) => setDraft({ ...draft, itemId: id })}
          />
          <Button
            size="sm"
            disabled={!draft.category.trim() || !draft.itemId || save.isPending}
            onClick={() =>
              create(draft.category.trim(), draft.product.trim() || null, draft.itemId)
            }
          >
            Adicionar regra
          </Button>
        </section>
      )}
    </div>
  );
}

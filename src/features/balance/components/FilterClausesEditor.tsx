/**
 * Cláusulas de uma linha de filtro: o que a linha soma na camada gerencial.
 *
 * Cada cláusula é "estes itens × estas áreas × esta natureza"; a linha soma o
 * lançamento que casa com qualquer uma. Quase sempre uma cláusula basta — a segunda
 * existe para casos como o OPEX, que é "todo gasto opex fora de Pessoas" mais "Pessoas
 * sem área".
 */
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { BALANCE_NATURES, emptyClause, type BalanceClause, type BalanceNature } from "../schema";
import type { BalanceOptions } from "./options";

const NATURE_LABELS: Record<BalanceNature, string> = { opex: "Só opex", capex: "Só capex" };

interface Props {
  clauses: BalanceClause[];
  options: BalanceOptions;
  onChange: (clauses: BalanceClause[]) => void;
}

function toggle(ids: readonly string[], id: string, on: boolean): string[] {
  return on ? [...ids, id] : ids.filter((x) => x !== id);
}

export function FilterClausesEditor({ clauses, options, onChange }: Props) {
  const patch = (index: number, values: Partial<BalanceClause>) =>
    onChange(clauses.map((c, i) => (i === index ? { ...c, ...values } : c)));

  return (
    <div className="space-y-3">
      {clauses.map((clause, index) => (
        <fieldset
          key={index}
          className="space-y-3 rounded-[var(--radius-md)] border border-border p-3"
        >
          <div className="flex items-center justify-between">
            <legend className="text-xs font-medium text-text-muted">
              {index === 0 ? "Soma" : "Ou também"}
            </legend>
            {clauses.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Remover condição"
                onClick={() => onChange(clauses.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Itens do plano gerencial</Label>
            <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-[var(--radius-md)] border border-border p-2">
              {options.groups.map((group) => {
                const groupChecked = clause.managementAccountIds.includes(group.id);
                return (
                  <div key={group.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-sm font-medium hover:bg-surface-2">
                      <Checkbox
                        checked={groupChecked}
                        onCheckedChange={(next) =>
                          patch(index, {
                            managementAccountIds: toggle(
                              // Marcar o grupo cobre os itens dele; não precisa deles soltos.
                              clause.managementAccountIds.filter(
                                (id) => !group.items.some((item) => item.id === id),
                              ),
                              group.id,
                              next === true,
                            ),
                          })
                        }
                      />
                      {group.name}
                    </label>
                    {!groupChecked &&
                      group.items.map((item) => (
                        <label
                          key={item.id}
                          className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] py-1 pr-2 pl-8 text-sm text-text-muted hover:bg-surface-2"
                        >
                          <Checkbox
                            checked={clause.managementAccountIds.includes(item.id)}
                            onCheckedChange={(next) =>
                              patch(index, {
                                managementAccountIds: toggle(
                                  clause.managementAccountIds,
                                  item.id,
                                  next === true,
                                ),
                              })
                            }
                          />
                          {item.name}
                        </label>
                      ))}
                  </div>
                );
              })}
            </div>
            <p className="text-2xs text-text-subtle">Nada marcado = qualquer item.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Áreas</Label>
            <Select
              value={clause.areaIds === null ? "any" : "some"}
              onValueChange={(v) =>
                patch(
                  index,
                  v === "any" ? { areaIds: null, includeNoArea: false } : { areaIds: [] },
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Qualquer área (ou nenhuma)</SelectItem>
                <SelectItem value="some">Só as áreas escolhidas</SelectItem>
              </SelectContent>
            </Select>
            {clause.areaIds !== null && (
              <div className="space-y-0.5 rounded-[var(--radius-md)] border border-border p-2">
                {options.areas.map((area) => (
                  <label
                    key={area.id}
                    className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-sm hover:bg-surface-2"
                  >
                    <Checkbox
                      checked={clause.areaIds?.includes(area.id) ?? false}
                      onCheckedChange={(next) =>
                        patch(index, {
                          areaIds: toggle(clause.areaIds ?? [], area.id, next === true),
                        })
                      }
                    />
                    {area.name}
                  </label>
                ))}
                <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-sm text-text-muted hover:bg-surface-2">
                  <Checkbox
                    checked={clause.includeNoArea}
                    onCheckedChange={(next) => patch(index, { includeNoArea: next === true })}
                  />
                  Sem área
                </label>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Natureza</Label>
            <Select
              value={clause.nature ?? "any"}
              onValueChange={(v) =>
                patch(index, { nature: v === "any" ? null : (v as BalanceNature) })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Qualquer</SelectItem>
                {BALANCE_NATURES.map((n) => (
                  <SelectItem key={n} value={n}>
                    {NATURE_LABELS[n]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-2xs text-text-subtle">
              Capex é investimento: fica fora do EBITDA quando a linha de CAPEX não entra nele.
            </p>
          </div>
        </fieldset>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...clauses, emptyClause()])}
      >
        <Plus className="size-3.5" /> Adicionar condição
      </Button>
    </div>
  );
}

/**
 * Opções que o editor do modelo oferece: o plano gerencial em árvore e as áreas. São da
 * organização inteira (globais), então valem para qualquer escopo — o que muda por escopo
 * é o MODELO de linhas, não as opções.
 */
import type { BalanceClause, BalanceLine } from "../schema";

export interface BalanceOptionItem {
  id: string;
  name: string;
}

export interface BalanceOptionGroup extends BalanceOptionItem {
  items: BalanceOptionItem[];
}

export interface BalanceOptions {
  groups: BalanceOptionGroup[];
  areas: BalanceOptionItem[];
}

/** Ids que uma cláusula pode citar e ainda existem — para avisar do que sumiu. */
export function knownReferenceIds(options: BalanceOptions): {
  managementAccountIds: string[];
  areaIds: string[];
} {
  return {
    managementAccountIds: options.groups.flatMap((g) => [g.id, ...g.items.map((i) => i.id)]),
    areaIds: options.areas.map((a) => a.id),
  };
}

function managementNameOf(options: BalanceOptions, id: string): string {
  for (const group of options.groups) {
    if (group.id === id) return group.name;
    const item = group.items.find((i) => i.id === id);
    if (item) return `${group.name} · ${item.name}`;
  }
  return "item removido";
}

function describeClause(clause: BalanceClause, options: BalanceOptions): string {
  const what =
    clause.managementAccountIds.length === 0
      ? "Qualquer item"
      : clause.managementAccountIds.map((id) => managementNameOf(options, id)).join(", ");

  const areaNames = (clause.areaIds ?? []).map(
    (id) => options.areas.find((a) => a.id === id)?.name ?? "área removida",
  );
  if (clause.includeNoArea) areaNames.push("sem área");
  const where = clause.areaIds === null ? null : areaNames.join(", ") || "nenhuma área";

  return [what, where, clause.nature].filter(Boolean).join(" · ");
}

/** Resumo legível de uma linha de filtro, para não precisar abrir o editor. */
export function describeFilterLine(
  line: Extract<BalanceLine, { kind: "filter" }>,
  options: BalanceOptions,
): string {
  if (line.clauses.length === 0) return "Nenhuma condição";
  return line.clauses.map((c) => describeClause(c, options)).join(" ou ");
}

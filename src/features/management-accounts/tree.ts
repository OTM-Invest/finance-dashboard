/**
 * Plano gerencial em árvore — funções puras, sem banco.
 *
 * O banco guarda o plano achatado (grupo e item na mesma tabela, `parent_id` ligando os
 * dois) e o mapa na conta do plano mestre. A tela quer o contrário: grupo → itens → contas
 * que caem em cada item. A montagem fica aqui para ser testável.
 */
import type { Enums } from "@/lib/supabase";

export type ManagementKind = Enums["management_account_kind"];
export type ExpenseNature = Enums["expense_nature"];

export interface ManagementAccountRow {
  id: string;
  parent_id: string | null;
  code: string;
  name: string;
  kind: ManagementKind;
  nature: ExpenseNature | null;
  requires_detail: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface MasterAccountRow {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  management_account_id: string | null;
}

export interface ManagementItemNode<A extends ManagementAccountRow = ManagementAccountRow> {
  account: A;
  mappedAccounts: MasterAccountRow[];
}

export interface ManagementGroupNode<A extends ManagementAccountRow = ManagementAccountRow> {
  group: A;
  items: ManagementItemNode<A>[];
  mappedCount: number;
}

export const KIND_LABELS: Record<ManagementKind, string> = {
  revenue: "Receita",
  revenue_tax: "Tributo sobre a receita",
  expense: "Gasto",
  financial: "Financeiro",
  distribution: "Distribuição",
};

export const EXPENSE_NATURES = ["opex", "capex"] as const satisfies readonly ExpenseNature[];

export const NATURE_LABELS: Record<ExpenseNature, string> = {
  opex: "Opex",
  capex: "Capex",
};

function bySortOrder<T extends { sort_order: number; code: string }>(a: T, b: T): number {
  return a.sort_order - b.sort_order || a.code.localeCompare(b.code);
}

/**
 * Agrupa o plano e pendura em cada item as contas do mestre que apontam para ele.
 *
 * Conta que aponta para um id fora do plano (item apagado, organização alheia) não some:
 * volta em `orphanAccounts`, para a tela mostrar como pendência em vez de esconder.
 */
export function buildManagementTree<A extends ManagementAccountRow>(
  accounts: readonly A[],
  masterAccounts: readonly MasterAccountRow[],
): { groups: ManagementGroupNode<A>[]; orphanAccounts: MasterAccountRow[] } {
  const mappedByItem = new Map<string, MasterAccountRow[]>();
  const knownItems = new Set(accounts.filter((a) => a.parent_id !== null).map((a) => a.id));
  const orphanAccounts: MasterAccountRow[] = [];

  for (const master of [...masterAccounts].sort(bySortOrder)) {
    const target = master.management_account_id;
    if (!target || !knownItems.has(target)) {
      orphanAccounts.push(master);
      continue;
    }
    mappedByItem.set(target, [...(mappedByItem.get(target) ?? []), master]);
  }

  const groups = accounts
    .filter((a) => a.parent_id === null)
    .sort(bySortOrder)
    .map((group) => {
      const items = accounts
        .filter((a) => a.parent_id === group.id)
        .sort(bySortOrder)
        .map((account) => ({ account, mappedAccounts: mappedByItem.get(account.id) ?? [] }));
      return {
        group,
        items,
        mappedCount: items.reduce((sum, item) => sum + item.mappedAccounts.length, 0),
      };
    });

  return { groups, orphanAccounts };
}

/** Normaliza um nome para o trecho de código: minúsculo, sem acento, `_` no lugar do resto. */
export function slugifyCodePart(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug.length > 0 ? slug : "item";
}

/**
 * Código de um item novo: `<grupo>.<nome>`, com sufixo numérico se já existir. O banco
 * confere o formato e a unicidade; isto só evita mandar uma colisão previsível.
 */
export function nextItemCode(
  groupCode: string,
  name: string,
  existingCodes: ReadonlySet<string>,
): string {
  const base = `${groupCode}.${slugifyCodePart(name)}`;
  if (!existingCodes.has(base)) return base;
  let n = 2;
  while (existingCodes.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

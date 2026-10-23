/**
 * Metadados e ordem padrão das colunas configuráveis da tabela de lançamentos.
 * A coluna "actions" é fixa no fim e não entra aqui (não é configurável).
 */

export interface TransactionColumnMeta {
  id: string;
  label: string;
  /** Só existe em um escopo específico (ex.: "company" aparece só no consolidado). */
  contextual?: boolean;
}

/**
 * Ordem padrão. As três datas ficam juntas e em ordem de ciclo — competência (o
 * fato), vencimento (o combinado) e caixa (o pago) — porque é assim que se lê
 * uma linha: o que atrasou é a que tem vencimento no passado e caixa vazia.
 */
export const TRANSACTION_COLUMNS: readonly TransactionColumnMeta[] = [
  { id: "accrual_date", label: "Competência" },
  { id: "due_date", label: "Vencimento" },
  { id: "cash_date", label: "Caixa" },
  { id: "description", label: "Descrição" },
  { id: "counterparty", label: "Fornecedor" },
  { id: "account", label: "Conta" },
  { id: "company", label: "Empresa", contextual: true },
  { id: "status", label: "Status" },
  { id: "amount", label: "Valor" },
];

export const DEFAULT_COLUMN_ORDER: readonly string[] = TRANSACTION_COLUMNS.map((c) => c.id);

const COLUMN_LABELS: Record<string, string> = Object.fromEntries(
  TRANSACTION_COLUMNS.map((c) => [c.id, c.label]),
);

export function columnLabel(id: string): string {
  return COLUMN_LABELS[id] ?? id;
}

/**
 * Ids das colunas disponíveis no escopo atual, na ordem padrão.
 * "company" só entra no modo consolidado.
 */
export function availableColumnIds(isConsolidated: boolean): string[] {
  return TRANSACTION_COLUMNS.filter((c) => c.id !== "company" || isConsolidated).map((c) => c.id);
}

/**
 * Reconcilia a ordem preferida do usuário com as colunas disponíveis no escopo:
 * mantém a ordem salva (ignorando colunas que não existem mais) e acrescenta as
 * colunas novas/contextuais na sua posição padrão. Assim, quem já tinha
 * preferências salvas recebe "Fornecedor" automaticamente, e "Empresa" aparece
 * apenas no consolidado.
 */
export function resolveColumnOrder(savedOrder: string[], available: string[]): string[] {
  const availableSet = new Set(available);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const id of savedOrder) {
    if (availableSet.has(id) && !seen.has(id)) {
      seen.add(id);
      kept.push(id);
    }
  }
  const appended = available.filter((id) => !seen.has(id));
  return [...kept, ...appended];
}

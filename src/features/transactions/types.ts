import type { Enums, Tables } from "@/lib/supabase";

export type TransactionRow = Tables["transactions"]["Row"];
export type TransactionInsert = Tables["transactions"]["Insert"];
export type TransactionUpdate = Tables["transactions"]["Update"];

export type TransactionDirection = Enums["transaction_direction"];
export type TransactionStatus = Enums["transaction_status"];

/** Row with joined relations from related tables (server projection). */
export interface TransactionWithRelations extends TransactionRow {
  account: {
    id: string;
    code: string;
    name: string;
    kind: Enums["account_kind"];
    dre_section: Enums["dre_section"] | null;
  } | null;
  company: { id: string; trade_name: string | null; legal_name: string } | null;
  cost_center: { id: string; name: string } | null;
  bank_account: { id: string; nickname: string; bank_name: string } | null;
  counterparty: { id: string; name: string } | null;
}

/**
 * Valor sentinela do filtro de conta bancária: lançamentos sem conta atribuída.
 * Eles não entram no saldo de nenhuma conta, então precisam ser localizáveis.
 */
export const NO_BANK_ACCOUNT = "__none__";

export interface TransactionFilters {
  /**
   * Recorte de empresas: `null`/ausente = sem filtro (quem limita é a RLS); array =
   * exatamente estas. Um array vazio filtra tudo fora de propósito — é o que um grupo
   * de agregação ainda não resolvido deve somar (nada), nunca "todas".
   */
  companyIds?: string[] | null;
  from?: string | null;
  to?: string | null;
  status?: TransactionStatus[];
  direction?: TransactionDirection | null;
  accountId?: string | null;
  costCenterId?: string | null;
  bankAccountId?: string | null;
  /** Recorte por fornecedor — é por onde o relatório de contrapartes entra aqui. */
  counterpartyId?: string | null;
  search?: string | null;
  /** 1-based page number */
  page?: number;
  pageSize?: number;
  sortBy?: "accrual_date" | "due_date" | "cash_date" | "amount" | "description";
  sortOrder?: "asc" | "desc";
}

export interface TransactionsListResult {
  rows: TransactionWithRelations[];
  totalCount: number;
  pageCount: number;
  inflowTotal: number;
  outflowTotal: number;
}

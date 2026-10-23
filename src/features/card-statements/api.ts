import { supabase, type Enums } from "@/lib/supabase";
import type { Json } from "@/types/database";

import { PARSER_VERSION, type ParsedStatement } from "./reader";

export type CardStatementStatus = Enums["card_statement_status"];
export type CardLineClassification = Enums["card_line_classification"];

export interface ValidationRow {
  code: string;
  label: string;
  expectedCents: number;
  gotCents: number;
  ok: boolean;
}

export interface CardStatementSummaryRow {
  id: string;
  company_id: string;
  transaction_id: string;
  issuer: string;
  closing_date: string;
  due_date: string;
  total_amount: number;
  status: CardStatementStatus;
  created_at: string;
  lineCount: number;
  confirmedCount: number;
}

/** Faturas do escopo, da mais recente para a mais antiga. */
export async function fetchCardStatements(
  companyIds: string[] | null,
): Promise<CardStatementSummaryRow[]> {
  let query = supabase
    .from("card_statements")
    .select(
      `id, company_id, transaction_id, issuer, closing_date, due_date, total_amount, status, created_at,
       lines:card_statement_lines(count),
       confirmed:card_statement_lines(count)`,
    )
    .eq("confirmed.classification_status", "confirmed")
    .order("closing_date", { ascending: false });
  if (companyIds) query = query.in("company_id", companyIds);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(({ lines, confirmed, ...row }) => ({
    ...row,
    lineCount: lines[0]?.count ?? 0,
    confirmedCount: confirmed[0]?.count ?? 0,
  }));
}

export interface PendingInvoiceTransaction {
  id: string;
  company_id: string;
  accrual_date: string;
  cash_date: string | null;
  amount: number;
  description: string;
}

/**
 * Lançamentos de fatura de cartão ainda sem detalhamento: saídas em conta cujo item
 * gerencial é "Fatura de cartão". A exclusão dos já detalhados é feita no banco, antes do
 * limite — senão as faturas mais antigas sumiam da lista.
 */
export async function fetchPendingInvoiceTransactions(
  companyIds: string[] | null,
): Promise<PendingInvoiceTransaction[]> {
  const { data, error } = await supabase.rpc("pending_card_invoice_transactions", {
    p_company_ids: companyIds ?? undefined,
  });
  if (error) throw error;
  return data ?? [];
}

export async function saveCardStatement(input: {
  transactionId: string;
  statement: ParsedStatement;
  sha256: string;
  attachmentId: string | null;
  replace?: boolean;
}): Promise<{ id: string; status: CardStatementStatus }> {
  const { data, error } = await supabase.rpc("save_card_statement", {
    p_transaction_id: input.transactionId,
    p_statement: input.statement as unknown as Json,
    p_parser: "text",
    p_parser_version: PARSER_VERSION,
    p_file_sha256: input.sha256,
    p_attachment_id: input.attachmentId ?? undefined,
    p_replace: input.replace ?? false,
  });
  if (error) throw error;
  // O status é o veredito do banco, que refaz a conferência — não o da prévia na tela.
  return data as unknown as { id: string; status: CardStatementStatus };
}

export interface CardStatementLineRow {
  id: string;
  sort_order: number;
  purchase_date: string;
  description: string;
  line_kind: Enums["card_line_kind"];
  amount: number;
  iof_amount: number;
  currency: string;
  amount_original: number | null;
  fx_rate: number | null;
  installment_n: number | null;
  installment_total: number | null;
  management_account_id: string | null;
  cost_center_id: string | null;
  classification_status: CardLineClassification;
  card: { last4: string; holder_name: string; kind: string } | null;
}

export interface CardStatementDetail {
  id: string;
  company_id: string;
  transaction_id: string;
  closing_date: string;
  due_date: string;
  total_amount: number;
  status: CardStatementStatus;
  validation: ValidationRow[];
  warnings: string[];
  lines: CardStatementLineRow[];
}

export async function fetchCardStatement(id: string): Promise<CardStatementDetail> {
  const { data, error } = await supabase
    .from("card_statements")
    .select(
      `id, company_id, transaction_id, closing_date, due_date, total_amount, status, validation, warnings,
       lines:card_statement_lines(
         id, sort_order, purchase_date, description, line_kind, amount, iof_amount, currency,
         amount_original, fx_rate, installment_n, installment_total, management_account_id,
         cost_center_id, classification_status,
         card:payment_cards(last4, holder_name, kind)
       )`,
    )
    .eq("id", id)
    .order("sort_order", { referencedTable: "lines", ascending: true })
    .single();
  if (error) throw error;
  return {
    ...data,
    validation: data.validation as unknown as ValidationRow[],
    warnings: data.warnings as unknown as string[],
  };
}

/**
 * Classifica uma compra. Escolher o item já é confirmar: é uma pessoa dizendo o que a
 * compra é (a sugestão automática, Fase 3, entra como `suggested`).
 */
export async function classifyCardLine(input: {
  lineId: string;
  managementAccountId: string | null;
  costCenterId: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from("card_statement_lines")
    .update({
      management_account_id: input.managementAccountId,
      cost_center_id: input.costCenterId,
      classification_status: input.managementAccountId ? "confirmed" : "unclassified",
      classification_source: input.managementAccountId ? "human" : null,
    })
    .eq("id", input.lineId);
  if (error) throw error;
}

/** Apaga a fatura e as linhas — o lançamento volta a aparecer inteiro na visão gerencial. */
export async function deleteCardStatement(id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_card_statement", { p_statement_id: id });
  if (error) throw error;
}

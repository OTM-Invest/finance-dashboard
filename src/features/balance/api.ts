import { supabase, type Enums } from "@/lib/supabase";
import type { Json } from "@/types/database";

import type { BalanceDrilldown, MonthlySeriesRow } from "./compute";
import type { AccountingBasis } from "./drilldown";
import { parseBalanceLines, type BalanceLine } from "./schema";
import type { BalanceScope } from "./scope";

/**
 * Série mensal do escopo por (item gerencial, área, natureza). Que linha soma o quê é
 * decidido no cliente (compute.ts), sobre esta série.
 */
export async function fetchMonthlySeries(
  companyIds: string[] | null,
  from: string,
  to: string,
  basis: AccountingBasis,
): Promise<MonthlySeriesRow[]> {
  const { data, error } = await supabase.rpc("management_monthly_series_multi", {
    p_company_ids: companyIds ?? undefined,
    p_from: from,
    p_to: to,
    p_basis: basis,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    month: r.month,
    managementAccountId: r.management_account_id,
    managementGroupId: r.management_group_id,
    areaId: r.cost_center_id,
    nature: r.nature,
    revenue: r.revenue,
    expense: r.expense,
  }));
}

/** Filtro que isola a linha do escopo. Consolidado é "sem empresa e sem grupo". */
function scopeFilter<T extends { eq: (c: string, v: string) => T; is: (c: string, v: null) => T }>(
  query: T,
  scope: BalanceScope,
  organizationId: string,
): T {
  if (scope.kind === "company") return query.eq("company_id", scope.companyId);
  if (scope.kind === "group") return query.eq("company_group_id", scope.groupId);
  return query
    .eq("organization_id", organizationId)
    .is("company_id", null)
    .is("company_group_id", null);
}

/** Modelo do escopo. Escopo sem modelo ainda devolve lista vazia, não erro. */
export async function fetchBalanceModel(
  scope: BalanceScope,
  organizationId: string,
): Promise<BalanceLine[]> {
  const { data, error } = await scopeFilter(
    supabase.from("balance_report_models").select("lines"),
    scope,
    organizationId,
  ).maybeSingle();
  if (error) throw error;
  return parseBalanceLines(data?.lines);
}

/**
 * Grava o modelo do escopo.
 *
 * Lê-então-escreve em vez de `upsert`: os únicos do escopo são índices PARCIAIS
 * (`where company_id is not null`, etc.), e inferência de conflito com índice parcial
 * é frágil. Duas idas ao banco num salvamento de configuração não custam nada, e o
 * caminho fica explícito.
 */
export async function saveBalanceModel(
  scope: BalanceScope,
  organizationId: string,
  lines: BalanceLine[],
): Promise<BalanceLine[]> {
  const { data: existing, error: findError } = await scopeFilter(
    supabase.from("balance_report_models").select("id"),
    scope,
    organizationId,
  ).maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const { data, error } = await supabase
      .from("balance_report_models")
      .update({ lines })
      .eq("id", existing.id)
      .select("lines")
      .single();
    if (error) throw error;
    return parseBalanceLines(data.lines);
  }

  const { data, error } = await supabase
    .from("balance_report_models")
    .insert({
      organization_id: organizationId,
      company_id: scope.kind === "company" ? scope.companyId : null,
      company_group_id: scope.kind === "group" ? scope.groupId : null,
      lines,
    })
    .select("lines")
    .single();
  if (error) throw error;
  return parseBalanceLines(data.lines);
}

/* ─── Lançamentos por trás de uma linha ──────────────────────────────────── */

export interface LineTransaction {
  id: string;
  accrual_date: string;
  cash_date: string | null;
  description: string;
  amount: number;
  direction: Enums["transaction_direction"];
  status: Enums["transaction_status"];
  document_ref: string | null;
  account: { code: string; name: string } | null;
  area: { id: string; name: string } | null;
  counterparty: { name: string } | null;
}

/**
 * Teto da listagem. Uma linha com um ano de movimento passa de mil lançamentos, e a
 * gaveta é para conferir a composição, não para paginar o extrato inteiro — quem precisa
 * disso vai para /transactions com os filtros.
 */
export const LINE_TRANSACTIONS_LIMIT = 500;

export interface LineTransactionsResult {
  rows: LineTransaction[];
  /** Total que casa com o filtro, mesmo quando a listagem é truncada. */
  totalCount: number;
}

/**
 * Os lançamentos das chaves exatas que a linha soma (ver `BalanceDrilldown`). A RPC
 * aplica a mesma população da série — regime, status, datas —, então a lista soma o
 * número da célula clicada.
 */
export async function fetchLineTransactions(params: {
  companyIds: string[] | null;
  from: string;
  to: string;
  drilldown: BalanceDrilldown;
  basis: AccountingBasis;
}): Promise<LineTransactionsResult> {
  const { companyIds, from, to, drilldown, basis } = params;
  // Sem chave nenhuma a linha vale zero; não há o que buscar.
  if (drilldown.keys.length === 0) return { rows: [], totalCount: 0 };

  const { data, error } = await supabase.rpc("management_line_transactions", {
    p_from: from,
    p_to: to,
    p_basis: basis,
    p_company_ids: companyIds ?? undefined,
    p_keys: drilldown.keys as unknown as Json,
    p_limit: LINE_TRANSACTIONS_LIMIT,
  });
  if (error) throw error;

  const rows = (data ?? []).map((r) => ({
    id: r.id,
    accrual_date: r.accrual_date,
    cash_date: r.cash_date,
    description: r.description,
    amount: r.amount,
    direction: r.direction,
    status: r.status,
    document_ref: r.document_ref,
    account: { code: r.account_code, name: r.account_name },
    area: r.cost_center_id ? { id: r.cost_center_id, name: r.cost_center_name } : null,
    counterparty: r.counterparty_name ? { name: r.counterparty_name } : null,
  }));
  return { rows, totalCount: data?.[0]?.total_count ?? 0 };
}

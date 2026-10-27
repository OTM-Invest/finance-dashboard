import type { AccountingBasis } from "@/features/balance/drilldown";
import { supabase } from "@/lib/supabase";

import { fromRpc, type ReportKind, type RevenueRow } from "./compute";

/** Teto de linhas por resposta do PostgREST (`max_rows` em supabase/config.toml). */
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

/**
 * Receita conferida agregada. Lida em páginas com ordem total: o PostgREST corta em
 * `max_rows` sem erro, e sem ordem duas páginas poderiam repetir ou pular linhas.
 */
export async function fetchRevenueBreakdown(params: {
  companyIds: string[] | null;
  from: string;
  to: string;
  basis: AccountingBasis;
}): Promise<RevenueRow[]> {
  const rows: RevenueRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const start = page * PAGE_SIZE;
    const { data, error } = await supabase
      .rpc("revenue_breakdown_multi", {
        p_from: params.from,
        p_to: params.to,
        p_basis: params.basis,
        p_company_ids: params.companyIds ?? undefined,
      })
      .order("company_id")
      .order("management_account_id", { nullsFirst: true })
      .order("cost_center_id", { nullsFirst: true })
      .order("advisor_code", { nullsFirst: true })
      .order("employee_id", { nullsFirst: true })
      .order("line_kind")
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...fromRpc(batch));
    if (batch.length < PAGE_SIZE) return rows;
  }
  throw new Error("O recorte tem linhas demais. Reduza o período ou o escopo.");
}

export interface CrmReportRow {
  id: string;
  companyId: string;
  kind: ReportKind;
  referenceMonth: string;
  periodStart: string | null;
  periodEnd: string | null;
  fileKey: string;
  fileName: string | null;
  totalCommission: number;
  importedAt: string | null;
  removedAt: string | null;
  statementId: string | null;
}

/** Relatórios do espelho com referência a partir de `from`, e o statement que os usa. */
export async function fetchCrmReports(
  companyIds: string[] | null,
  from: string,
): Promise<CrmReportRow[]> {
  let query = supabase
    .from("crm_commission_reports")
    .select(
      "id, company_id, kind, reference_month, period_start, period_end, file_key, file_name, total_commission, imported_at, removed_at, revenue_statement_reports(statement_id)",
    )
    .gte("reference_month", from)
    .order("reference_month", { ascending: false })
    .order("kind")
    .order("file_key");
  if (companyIds) query = query.in("company_id", companyIds);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    companyId: r.company_id,
    kind: r.kind,
    referenceMonth: r.reference_month,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    fileKey: r.file_key,
    fileName: r.file_name,
    totalCommission: r.total_commission,
    importedAt: r.imported_at,
    removedAt: r.removed_at,
    // `report_id` é único em revenue_statement_reports: o PostgREST devolve objeto, não lista.
    statementId: r.revenue_statement_reports?.statement_id ?? null,
  }));
}

export interface ValidationCheck {
  code: string;
  label: string;
  expectedCents: number | null;
  gotCents: number | null;
  ok: boolean;
}

export interface RevenueStatementRow {
  id: string;
  companyId: string;
  transactionId: string;
  kind: ReportKind;
  status: "needs_review" | "reconciled";
  reportTotal: number;
  ledgerAmount: number;
  difference: number;
  differenceNote: string | null;
  differenceAcceptedAt: string | null;
  validation: ValidationCheck[];
  reportIds: string[];
  transaction: { description: string; accrualDate: string; amount: number } | null;
}

export async function fetchRevenueStatements(
  companyIds: string[] | null,
): Promise<RevenueStatementRow[]> {
  let query = supabase
    .from("revenue_statements")
    .select(
      "id, company_id, transaction_id, kind, status, report_total, ledger_amount, difference, difference_note, difference_accepted_at, validation, revenue_statement_reports(report_id), transactions(description, accrual_date, amount)",
    )
    .order("created_at", { ascending: false });
  if (companyIds) query = query.in("company_id", companyIds);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id,
    companyId: s.company_id,
    transactionId: s.transaction_id,
    kind: s.kind,
    status: s.status,
    reportTotal: s.report_total,
    ledgerAmount: s.ledger_amount,
    difference: s.difference ?? 0,
    differenceNote: s.difference_note,
    differenceAcceptedAt: s.difference_accepted_at,
    validation: (Array.isArray(s.validation) ? s.validation : []) as unknown as ValidationCheck[],
    reportIds: (s.revenue_statement_reports ?? []).map((r) => r.report_id),
    transaction: s.transactions
      ? {
          description: s.transactions.description,
          accrualDate: s.transactions.accrual_date,
          amount: s.transactions.amount,
        }
      : null,
  }));
}

export interface PendingRevenueTransaction {
  id: string;
  companyId: string;
  accrualDate: string;
  cashDate: string | null;
  amount: number;
  description: string;
  counterpartyName: string | null;
}

export async function fetchPendingRevenueTransactions(
  companyIds: string[] | null,
  from: string,
): Promise<PendingRevenueTransaction[]> {
  const { data, error } = await supabase.rpc("pending_revenue_transactions", {
    p_company_ids: companyIds ?? undefined,
    p_from: from,
  });
  if (error) throw error;
  return (data ?? []).map((t) => ({
    id: t.id,
    companyId: t.company_id,
    accrualDate: t.accrual_date,
    cashDate: t.cash_date,
    amount: t.amount,
    description: t.description,
    counterpartyName: t.counterparty_name,
  }));
}

export async function saveRevenueStatement(params: {
  transactionId: string;
  reportIds: string[];
  replace?: boolean;
}): Promise<{ id: string; status: string; difference: number }> {
  const { data, error } = await supabase.rpc("save_revenue_statement", {
    p_transaction_id: params.transactionId,
    p_report_ids: params.reportIds,
    p_replace: params.replace ?? false,
  });
  if (error) throw error;
  return data as { id: string; status: string; difference: number };
}

export async function acceptRevenueDifference(statementId: string, note: string): Promise<void> {
  const { error } = await supabase.rpc("accept_revenue_statement_difference", {
    p_statement_id: statementId,
    p_note: note,
  });
  if (error) throw error;
}

export async function deleteRevenueStatement(statementId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_revenue_statement", {
    p_statement_id: statementId,
  });
  if (error) throw error;
}

export interface AdvisorCodeRow {
  advisorCode: string;
  advisorName: string | null;
  advisorActive: boolean | null;
  commission: number;
  lastMonth: string;
}

export async function fetchAdvisorCodes(
  companyIds: string[] | null,
  from: string,
): Promise<AdvisorCodeRow[]> {
  const { data, error } = await supabase.rpc("crm_advisor_codes", {
    p_company_ids: companyIds ?? undefined,
    p_from: from,
  });
  if (error) throw error;
  return (data ?? [])
    .map((a) => ({
      advisorCode: a.advisor_code,
      advisorName: a.advisor_name,
      advisorActive: a.advisor_active,
      commission: a.commission,
      lastMonth: a.last_month,
    }))
    .sort((a, b) => b.commission - a.commission);
}

export interface AdvisorLink {
  advisorCode: string;
  employeeId: string;
  employeeName: string;
  areaId: string | null;
}

/** Código → colaborador → área atual, como a camada gerencial lê. */
export async function fetchAdvisorLinks(): Promise<AdvisorLink[]> {
  const { data, error } = await supabase.rpc("btg_advisor_areas");
  if (error) throw error;
  return (data ?? []).map((a) => ({
    advisorCode: a.advisor_code,
    employeeId: a.employee_id,
    employeeName: a.employee_name,
    areaId: a.cost_center_id,
  }));
}

export interface LinkableEmployee {
  id: string;
  companyId: string;
  fullName: string;
  btgAdvisorCode: string | null;
  areaId: string | null;
}

/**
 * Colaboradores que podem receber um código. `employees` é do módulo de folha: quem não
 * o vê recebe lista vazia, e a tela diz que ligar código exige acesso à folha.
 */
export async function fetchLinkableEmployees(): Promise<LinkableEmployee[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("id, company_id, full_name, btg_advisor_code, cost_center_id")
    .is("deleted_at", null)
    .order("full_name");
  if (error) throw error;
  return (data ?? []).map((e) => ({
    id: e.id,
    companyId: e.company_id,
    fullName: e.full_name,
    btgAdvisorCode: e.btg_advisor_code,
    areaId: e.cost_center_id,
  }));
}

/** Liga (ou desliga, com `null`) o código BTG de um colaborador. */
export async function setEmployeeAdvisorCode(employeeId: string, code: string | null) {
  const { error } = await supabase
    .from("employees")
    .update({ btg_advisor_code: code })
    .eq("id", employeeId);
  if (error) throw error;
}

export interface CategoryRule {
  id: string;
  category: string;
  product: string | null;
  managementAccountId: string;
}

export async function fetchCategoryRules(): Promise<CategoryRule[]> {
  const { data, error } = await supabase
    .from("revenue_category_map")
    .select("id, category, product, management_account_id")
    .order("category")
    .order("product", { nullsFirst: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    category: r.category,
    product: r.product,
    managementAccountId: r.management_account_id,
  }));
}

export async function createCategoryRule(rule: {
  organizationId: string;
  category: string;
  product: string | null;
  managementAccountId: string;
}) {
  const { error } = await supabase.from("revenue_category_map").insert({
    organization_id: rule.organizationId,
    category: rule.category,
    product: rule.product,
    management_account_id: rule.managementAccountId,
  });
  if (error) throw error;
}

export async function updateCategoryRule(id: string, managementAccountId: string) {
  const { error } = await supabase
    .from("revenue_category_map")
    .update({ management_account_id: managementAccountId })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteCategoryRule(id: string) {
  const { error } = await supabase.from("revenue_category_map").delete().eq("id", id);
  if (error) throw error;
}

export interface UnmappedCombination {
  category: string;
  product: string;
  amount: number;
}

/** Combinações abertas que caíram em "BTG · Outras receitas" por falta de regra. */
export async function fetchUnmappedCombinations(
  companyIds: string[] | null,
): Promise<UnmappedCombination[]> {
  let query = supabase
    .from("v_revenue_lines")
    .select("category, product, amount")
    .eq("is_unmapped", true)
    .limit(PAGE_SIZE);
  if (companyIds) query = query.in("company_id", companyIds);
  const { data, error } = await query;
  if (error) throw error;
  const map = new Map<string, UnmappedCombination>();
  for (const r of data ?? []) {
    const key = `${r.category ?? ""}|${r.product ?? ""}`;
    const current = map.get(key);
    if (current) current.amount += Number(r.amount);
    else
      map.set(key, {
        category: r.category ?? "",
        product: r.product ?? "",
        amount: Number(r.amount),
      });
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export interface ReportRoute {
  id: string;
  organizationId: string;
  kind: ReportKind;
  companyId: string;
}

export async function fetchReportRoutes(): Promise<ReportRoute[]> {
  const { data, error } = await supabase
    .from("btg_report_routes")
    .select("id, organization_id, kind, company_id")
    .order("kind");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    kind: r.kind,
    companyId: r.company_id,
  }));
}

export async function saveReportRoute(route: {
  organizationId: string;
  kind: ReportKind;
  companyId: string;
}) {
  const { error } = await supabase
    .from("btg_report_routes")
    .upsert(
      { organization_id: route.organizationId, kind: route.kind, company_id: route.companyId },
      { onConflict: "organization_id,kind" },
    );
  if (error) throw error;
}

export interface SyncRun {
  id: string;
  status: "running" | "succeeded" | "failed";
  periodFrom: string | null;
  periodTo: string | null;
  result: Record<string, unknown>;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export async function fetchSyncRuns(): Promise<SyncRun[]> {
  const { data, error } = await supabase
    .from("crm_sync_runs")
    .select("id, status, period_from, period_to, result, error, started_at, finished_at")
    .order("started_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    status: r.status as SyncRun["status"],
    periodFrom: r.period_from,
    periodTo: r.period_to,
    result: (r.result ?? {}) as Record<string, unknown>,
    error: r.error,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  }));
}

/** Pede a sincronização agora. `false` = não configurada neste ambiente. */
export async function requestSync(from?: string, to?: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("request_crm_revenue_sync", {
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return data;
}

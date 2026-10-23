import type { AccountingBasis } from "@/features/balance/drilldown";
import { supabase } from "@/lib/supabase";

import { parseBreakdownRow, type BreakdownRow } from "./compute";

/** Teto de linhas por resposta do PostgREST (`max_rows` em supabase/config.toml). */
const PAGE_SIZE = 1000;
/** Freio: 50 páginas = 50 mil linhas agregadas, muito acima do que o grupo produz. */
const MAX_PAGES = 50;

export interface BreakdownParams {
  companyIds: string[] | null;
  from: string;
  to: string;
  basis: AccountingBasis;
  /** Sem fornecedor o agregado é pequeno — para comparação de períodos. */
  byVendor: boolean;
  /** Recorte por código de item ou de grupo (`tecnologia`, `tecnologia.ia`). */
  codes?: string[];
}

/**
 * Gasto agregado do recorte. Por fornecedor, o consolidado passa de mil linhas; o
 * PostgREST corta em `max_rows` SEM erro, então lemos em páginas com ordem total — sem
 * ela, duas páginas poderiam repetir ou pular linhas e o total sairia errado em silêncio.
 */
export async function fetchBreakdown(params: BreakdownParams): Promise<BreakdownRow[]> {
  const rows: BreakdownRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const start = page * PAGE_SIZE;
    const { data, error } = await supabase
      .rpc("management_breakdown_multi", {
        p_from: params.from,
        p_to: params.to,
        p_basis: params.basis,
        p_company_ids: params.companyIds ?? undefined,
        p_by_vendor: params.byVendor,
        p_codes: params.codes,
      })
      .order("company_id")
      .order("management_account_id")
      .order("cost_center_id", { nullsFirst: true })
      .order("nature", { nullsFirst: true })
      .order("source")
      .order("vendor_key", { nullsFirst: true })
      .order("currency")
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch.map(parseBreakdownRow));
    if (batch.length < PAGE_SIZE) return rows;
  }
  throw new Error(
    "O recorte tem linhas demais para a Central de Gastos. Reduza o período ou o escopo.",
  );
}

export interface CardSpend {
  companyId: string;
  cardId: string;
  last4: string;
  holderName: string;
  kind: string;
  statementCount: number;
  outflow: number;
  inflow: number;
  amountUsd: number;
  iofAmount: number;
  unconfirmedAmount: number;
  futureInstallments: number;
  lastClosingDate: string;
}

export async function fetchCardSummary(params: {
  companyIds: string[] | null;
  from: string;
  to: string;
  basis: AccountingBasis;
}): Promise<CardSpend[]> {
  const { data, error } = await supabase.rpc("management_card_summary", {
    p_from: params.from,
    p_to: params.to,
    p_basis: params.basis,
    p_company_ids: params.companyIds ?? undefined,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    companyId: r.company_id,
    cardId: r.card_id,
    last4: r.last4,
    holderName: r.holder_name,
    kind: r.kind,
    statementCount: r.statement_count,
    outflow: r.outflow,
    inflow: r.inflow,
    amountUsd: r.amount_usd,
    iofAmount: r.iof_amount,
    unconfirmedAmount: r.unconfirmed_amount,
    futureInstallments: r.future_installments,
    lastClosingDate: r.last_closing_date,
  }));
}

export interface ReconciliationRow {
  companyId: string;
  month: string;
  ledgerInflow: number;
  ledgerOutflow: number;
  layerInflow: number;
  layerOutflow: number;
  difference: number;
}

export async function fetchReconciliation(params: {
  companyIds: string[] | null;
  from: string;
  to: string;
  basis: AccountingBasis;
}): Promise<ReconciliationRow[]> {
  const { data, error } = await supabase.rpc("management_reconciliation", {
    p_from: params.from,
    p_to: params.to,
    p_basis: params.basis,
    p_company_ids: params.companyIds ?? undefined,
  });
  if (error) throw error;
  return (data ?? [])
    .map((r) => ({
      companyId: r.company_id,
      month: r.month,
      ledgerInflow: r.ledger_inflow,
      ledgerOutflow: r.ledger_outflow,
      layerInflow: r.layer_inflow,
      layerOutflow: r.layer_outflow,
      difference: r.difference,
    }))
    .sort((a, b) => a.month.localeCompare(b.month) || a.companyId.localeCompare(b.companyId));
}

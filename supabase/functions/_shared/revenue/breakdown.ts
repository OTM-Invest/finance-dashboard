/**
 * Receita por área, produto e assessor — o que se faz com as linhas de
 * `revenue_breakdown_multi`.
 *
 * Funções puras, sem banco. Em `_shared/` pelo mesmo motivo da Central de Gastos: a tela
 * `/receita` reexporta daqui e uma tool de MCP futura tem de chegar ao mesmo número.
 *
 * A receita é o LÍQUIDO do que o BTG pagou: desconto (fee de plataforma, erro
 * operacional, custos) entra negativo, no item "Deduções". A diferença relatório × nota
 * (decisão D1) é linha própria, sem área e sem assessor. A soma de tudo é o que está no
 * Balanço — não há filtro escondido.
 */

import { CRM_BUCKET_ADVISOR_CODE } from "./contract.ts";

export type RevenueLineKind = "detail" | "difference";

export interface RevenueRow {
  companyId: string;
  managementAccountId: string | null;
  areaId: string | null;
  advisorCode: string | null;
  advisorName: string | null;
  employeeId: string | null;
  employeeName: string | null;
  lineKind: RevenueLineKind;
  amount: number;
  revenue: number;
  months: string[];
}

export interface RevenueRpcRow {
  company_id: string;
  management_account_id: string | null;
  cost_center_id: string | null;
  advisor_code: string | null;
  advisor_name: string | null;
  employee_id: string | null;
  employee_name: string | null;
  line_kind: string;
  amount: number | string | null;
  revenue: number | string | null;
  months: string[] | null;
}

function num(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function fromRpc(rows: readonly RevenueRpcRow[]): RevenueRow[] {
  return rows.map((r) => ({
    companyId: r.company_id,
    managementAccountId: r.management_account_id,
    areaId: r.cost_center_id,
    advisorCode: r.advisor_code,
    advisorName: r.advisor_name,
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    lineKind: r.line_kind === "difference" ? "difference" : "detail",
    amount: num(r.amount),
    revenue: num(r.revenue),
    months: [...(r.months ?? [])].sort(),
  }));
}

export interface RevenueTotals {
  total: number;
  /** Receita de linha detalhada sem área: código sem colaborador ou o balde do CRM. */
  withoutArea: number;
  /** Só a parte do balde 1056306 dentro de `withoutArea`. */
  bucket: number;
  /** Diferença relatório × nota aceita (D1). */
  difference: number;
  /** Fração do total que tem área, 0–1. `null` sem receita. */
  coverage: number | null;
}

export function revenueTotals(rows: readonly RevenueRow[]): RevenueTotals {
  let total = 0;
  let withoutArea = 0;
  let bucket = 0;
  let difference = 0;
  for (const r of rows) {
    total += r.amount;
    if (r.lineKind === "difference") difference += r.amount;
    else if (r.areaId == null) {
      withoutArea += r.amount;
      if (r.advisorCode === CRM_BUCKET_ADVISOR_CODE) bucket += r.amount;
    }
  }
  return {
    total: round2(total),
    withoutArea: round2(withoutArea),
    bucket: round2(bucket),
    difference: round2(difference),
    coverage: Math.abs(total) < 0.005 ? null : (total - withoutArea - difference) / total,
  };
}

export interface RevenueSlice {
  /** id da área / do item / código do assessor; `null` = sem área, diferença. */
  key: string | null;
  amount: number;
  share: number | null;
}

function sliceBy(
  rows: readonly RevenueRow[],
  keyOf: (r: RevenueRow) => string | null,
): RevenueSlice[] {
  const map = new Map<string | null, number>();
  let total = 0;
  for (const r of rows) {
    const k = keyOf(r);
    map.set(k, (map.get(k) ?? 0) + r.amount);
    total += r.amount;
  }
  return [...map.entries()]
    .map(([key, amount]) => ({
      key,
      amount: round2(amount),
      share: Math.abs(total) < 0.005 ? null : amount / total,
    }))
    .sort((a, b) => b.amount - a.amount || String(a.key).localeCompare(String(b.key)));
}

/** Por área. A diferença relatório × nota não é de área nenhuma: chave `"difference"`. */
export function revenueByArea(rows: readonly RevenueRow[]): RevenueSlice[] {
  return sliceBy(rows, (r) => (r.lineKind === "difference" ? "difference" : r.areaId));
}

export function revenueByItem(rows: readonly RevenueRow[]): RevenueSlice[] {
  return sliceBy(rows, (r) => r.managementAccountId);
}

export interface AdvisorRevenue {
  advisorCode: string;
  advisorName: string | null;
  employeeId: string | null;
  employeeName: string | null;
  areaId: string | null;
  isBucket: boolean;
  amount: number;
}

/** Por código de assessor (só linhas detalhadas), maior primeiro. */
export function revenueByAdvisor(rows: readonly RevenueRow[]): AdvisorRevenue[] {
  const map = new Map<string, AdvisorRevenue>();
  for (const r of rows) {
    if (r.lineKind !== "detail" || r.advisorCode == null) continue;
    const current = map.get(r.advisorCode);
    if (current) {
      current.amount += r.amount;
    } else {
      map.set(r.advisorCode, {
        advisorCode: r.advisorCode,
        advisorName: r.advisorName,
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        areaId: r.areaId,
        isBucket: r.advisorCode === CRM_BUCKET_ADVISOR_CODE,
        amount: r.amount,
      });
    }
  }
  return [...map.values()]
    .map((a) => ({ ...a, amount: round2(a.amount) }))
    .sort((a, b) => b.amount - a.amount || a.advisorCode.localeCompare(b.advisorCode));
}

/**
 * O que a Edge Function `crm-revenue-sync` decide antes de gravar — puro e testado.
 *
 *  - a janela padrão (o CRM reimporta mês fechado; seis meses cobrem o que costuma mudar);
 *  - a conferência que BARRA a gravação (relatório que não fecha, linha sem relatório);
 *  - o payload de `crm_commission_sync_apply`, no formato snake_case do banco.
 */

import type { CrmCommission, CrmConfig } from "./client.ts";
import { checkReports, type ReportCheck } from "./conference.ts";

const MONTH = /^\d{4}-\d{2}-01$/;

/** Nomes no Vault do financeiro. Os valores nunca passam por repositório nem chat. */
export const VAULT_NAMES = {
  syncSecret: "crm_revenue_sync_secret",
  url: "crm_supabase_url",
  anonKey: "crm_supabase_anon_key",
  email: "crm_sync_email",
  password: "crm_sync_password",
} as const;

export type SyncConfig =
  | { ok: true; syncSecret: string; crm: CrmConfig }
  | { ok: false; syncSecret: string | null; missing: string[] };

/**
 * Lê o que `crm_revenue_sync_config()` devolveu. Faltando algo, diz QUAIS nomes faltam
 * no Vault — nunca o valor dos que existem.
 */
export function readSyncConfig(raw: unknown): SyncConfig {
  const values = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const get = (name: string): string | null => {
    const v = (values as Record<string, unknown>)[name];
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
  };
  const syncSecret = get(VAULT_NAMES.syncSecret);
  const url = get(VAULT_NAMES.url);
  const anonKey = get(VAULT_NAMES.anonKey);
  const email = get(VAULT_NAMES.email);
  const password = get(VAULT_NAMES.password);
  const missing = Object.values(VAULT_NAMES).filter((name) => get(name) === null);
  if (!syncSecret || !url || !anonKey || !email || !password) {
    return { ok: false, syncSecret, missing };
  }
  return {
    ok: true,
    syncSecret,
    crm: { url: url.replace(/\/+$/, ""), anonKey, email, password },
  };
}

/** Primeiro dia do mês, `months` meses antes de `today` (UTC), e o do mês corrente. */
export function defaultWindow(today: Date, months = 6): { from: string; to: string } {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const start = new Date(Date.UTC(y, m - months, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

/** Janela pedida (botão) ou a padrão (cron). Recusa formato e intervalo invertido. */
export function resolveWindow(
  body: { from?: unknown; to?: unknown },
  today: Date,
): { from: string; to: string } {
  const fallback = defaultWindow(today);
  const from = body.from == null ? fallback.from : body.from;
  const to = body.to == null ? fallback.to : body.to;
  if (typeof from !== "string" || !MONTH.test(from) || typeof to !== "string" || !MONTH.test(to)) {
    throw new Error("Período inválido: use o primeiro dia do mês (AAAA-MM-01)");
  }
  if (from > to) throw new Error("Período invertido");
  return { from, to };
}

export class ConferenceError extends Error {
  constructor(
    readonly failures: ReportCheck[],
    readonly orphanReportIds: string[],
  ) {
    const parts = failures.map(
      (f) =>
        `${f.kind} ${f.referenceMonth.slice(0, 7)} ${f.fileKey}: linhas ${(f.linesCents / 100).toFixed(2)} × total ${(f.totalCents / 100).toFixed(2)}`,
    );
    if (orphanReportIds.length > 0)
      parts.push(`linhas sem relatório: ${orphanReportIds.join(", ")}`);
    super(`Relatório do CRM não fecha — nada foi gravado. ${parts.join("; ")}`);
    this.name = "ConferenceError";
  }
}

export interface SyncPayload {
  reports: Record<string, unknown>[];
  lines: Record<string, unknown>[];
  checks: ReportCheck[];
}

/** Confere tudo e monta o payload; um relatório errado barra a sincronização inteira. */
export function buildSyncPayload(data: CrmCommission): SyncPayload {
  const { checks, orphanReportIds } = checkReports(data.reports, data.lines);
  const failures = checks.filter((c) => !c.ok);
  if (failures.length > 0 || orphanReportIds.length > 0) {
    throw new ConferenceError(failures, orphanReportIds);
  }
  return {
    checks,
    reports: data.reports.map((r) => ({
      id: r.id,
      kind: r.kind,
      reference_month: r.referenceMonth,
      period_start: r.periodStart,
      period_end: r.periodEnd,
      file_key: r.fileKey,
      file_name: r.fileName,
      row_count: r.rowCount,
      total_commission: r.totalCommission,
      imported_at: r.importedAt,
    })),
    lines: data.lines.map((l) => ({
      report_id: l.reportId,
      advisor_code: l.advisorCode,
      advisor_name: l.advisorName,
      advisor_active: l.advisorActive,
      category: l.category,
      product: l.product,
      type: l.type,
      commission: l.commission,
      revenue: l.revenue,
      net_revenue: l.netRevenue,
      row_count: l.rowCount,
    })),
  };
}

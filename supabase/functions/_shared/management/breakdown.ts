/**
 * Central de Gastos — o que se faz com as linhas de `management_breakdown_multi`.
 *
 * Funções puras, sem banco. Vivem em `_shared/` porque a tela `/gastos` (reexporta de
 * `src/features/spending/compute.ts`) e a tool de MCP `management_breakdown` precisam
 * chegar ao MESMO número: "quanto gastamos com IA no trimestre?" não pode ter duas
 * respostas.
 *
 * Gasto = saída − entrada (estorno de compra reduz o gasto do item). A RPC já entrega só
 * itens de natureza `expense`; aqui não se filtra natureza de novo.
 */

export type Nature = "opex" | "capex";
export type Source = "ledger" | "card";

export interface BreakdownRow {
  companyId: string;
  managementAccountId: string;
  managementGroupId: string | null;
  areaId: string | null;
  nature: Nature | null;
  source: Source;
  /** Item "A detalhar" (fatura de cartão ainda não aberta, reembolso de sócio). */
  requiresDetail: boolean;
  /** Nome em maiúsculas — casa o fornecedor entre empresas. Nulo sem fornecedor. */
  vendorKey: string | null;
  vendorName: string | null;
  currency: string;
  outflow: number;
  inflow: number;
  /** Em dólar, já com o sinal (estorno negativo); nulo quando não houve compra em USD. */
  amountUsd: number | null;
  iofAmount: number;
  lineCount: number;
  /** Primeiro dia de cada mês em que a linha apareceu, YYYY-MM-DD, em ordem. */
  months: string[];
}

/** Linha como a RPC devolve (numeric pode chegar como string). */
export interface BreakdownRpcRow {
  company_id: string;
  management_account_id: string;
  management_group_id: string | null;
  cost_center_id: string | null;
  nature: string | null;
  source: string;
  requires_detail: boolean;
  vendor_key: string | null;
  vendor_name: string | null;
  currency: string;
  outflow: number | string | null;
  inflow: number | string | null;
  amount_usd: number | string | null;
  iof_amount: number | string | null;
  line_count: number;
  months: string[] | null;
}

function num(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parseBreakdownRow(r: BreakdownRpcRow): BreakdownRow {
  return {
    companyId: r.company_id,
    managementAccountId: r.management_account_id,
    managementGroupId: r.management_group_id ?? null,
    areaId: r.cost_center_id ?? null,
    nature: r.nature === "opex" || r.nature === "capex" ? r.nature : null,
    source: r.source === "card" ? "card" : "ledger",
    requiresDetail: Boolean(r.requires_detail),
    vendorKey: r.vendor_key ?? null,
    vendorName: r.vendor_name ?? null,
    currency: r.currency ?? "BRL",
    outflow: num(r.outflow),
    inflow: num(r.inflow),
    amountUsd: r.amount_usd == null ? null : num(r.amount_usd),
    iofAmount: num(r.iof_amount),
    lineCount: r.line_count ?? 0,
    months: r.months ?? [],
  };
}

/** Gasto líquido de uma linha. */
export function spendOf(row: Pick<BreakdownRow, "outflow" | "inflow">): number {
  return row.outflow - row.inflow;
}

export function totalSpend(rows: readonly BreakdownRow[]): number {
  return round2(rows.reduce((s, r) => s + spendOf(r), 0));
}

/** Soma o gasto por chave. Chave nula vira `null` no mapa (ex.: lançamento sem área). */
export function spendBy<K>(
  rows: readonly BreakdownRow[],
  keyOf: (row: BreakdownRow) => K,
): Map<K, number> {
  const map = new Map<K, number>();
  for (const row of rows) {
    const key = keyOf(row);
    map.set(key, (map.get(key) ?? 0) + spendOf(row));
  }
  for (const [k, v] of map) map.set(k, round2(v));
  return map;
}

/* ─── Cobertura ──────────────────────────────────────────────────────────── */

export interface Coverage {
  total: number;
  /** Ainda em "A detalhar" — fatura não aberta, compra sem classificação confirmada. */
  pending: number;
  /** Parte do pendente que é fatura de cartão. */
  pendingCard: number;
  /** % do gasto já no item certo. `null` sem gasto. */
  confirmedPct: number | null;
}

export function coverageOf(rows: readonly BreakdownRow[]): Coverage {
  const total = totalSpend(rows);
  const pendingRows = rows.filter((r) => r.requiresDetail);
  const pending = totalSpend(pendingRows);
  const pendingCard = totalSpend(pendingRows.filter((r) => r.source === "card"));
  return {
    total,
    pending,
    pendingCard,
    confirmedPct: total === 0 ? null : round2(((total - pending) / total) * 100),
  };
}

/* ─── Períodos ───────────────────────────────────────────────────────────── */

function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toIso(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

/** Índice absoluto do mês (ano × 12 + mês) — aritmética de mês sem fuso. */
export function monthIndex(iso: string): number {
  const { y, m } = parseIso(iso);
  return y * 12 + (m - 1);
}

function isMonthStart(iso: string): boolean {
  return parseIso(iso).d === 1;
}

function isMonthEnd(iso: string): boolean {
  const { y, m, d } = parseIso(iso);
  return utc(y, m + 1, 0).getUTCDate() === d;
}

/**
 * Período imediatamente anterior, de mesmo tamanho. Período de meses fechados (o caso
 * dos atalhos: mês, trimestre, ano) anda em meses — fevereiro contra janeiro, não contra
 * "os 28 dias antes"; qualquer outro anda em dias.
 */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  if (isMonthStart(from) && isMonthEnd(to)) {
    const months = monthIndex(to) - monthIndex(from) + 1;
    const { y, m } = parseIso(from);
    return { from: toIso(utc(y, m - months, 1)), to: toIso(utc(y, m, 0)) };
  }
  const a = parseIso(from);
  const b = parseIso(to);
  const days = Math.round(
    (utc(b.y, b.m, b.d).getTime() - utc(a.y, a.m, a.d).getTime()) / 86_400_000,
  );
  const prevTo = utc(a.y, a.m, a.d - 1);
  const prevFrom = new Date(prevTo.getTime() - days * 86_400_000);
  return { from: toIso(prevFrom), to: toIso(prevTo) };
}

/** Os 12 meses fechados que terminam no mês de `to` — base da média mensal. */
export function trailingYear(to: string): { from: string; to: string } {
  const { y, m } = parseIso(to);
  return { from: toIso(utc(y, m - 11, 1)), to: toIso(utc(y, m + 1, 0)) };
}

/* ─── Panorama: grupo → item ─────────────────────────────────────────────── */

export interface PlanAccount {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export interface PanoramaItem {
  id: string;
  code: string;
  name: string;
  current: number;
  previous: number;
  /** Variação % sobre o período anterior; nula sem base. */
  deltaPct: number | null;
  /** Média mensal dos últimos 12 meses. */
  monthlyAvg12: number;
  /** Participação no gasto do período, em %. */
  sharePct: number | null;
}

export interface PanoramaGroup extends PanoramaItem {
  items: PanoramaItem[];
}

function deltaPct(current: number, previous: number): number | null {
  if (Math.abs(previous) < 0.005) return null;
  return round2(((current - previous) / Math.abs(previous)) * 100);
}

/**
 * Grupo → item, com período anterior e média de 12 meses. Item sem gasto em nenhuma das
 * três janelas não aparece. Item fora do plano conhecido (não deveria acontecer: a RPC só
 * devolve item do plano) cai num grupo "Sem grupo" em vez de sumir.
 */
export function buildPanorama(input: {
  accounts: readonly PlanAccount[];
  current: readonly BreakdownRow[];
  previous: readonly BreakdownRow[];
  last12: readonly BreakdownRow[];
}): PanoramaGroup[] {
  const cur = spendBy(input.current, (r) => r.managementAccountId);
  const prev = spendBy(input.previous, (r) => r.managementAccountId);
  const year = spendBy(input.last12, (r) => r.managementAccountId);
  const total = totalSpend(input.current);
  const byId = new Map(input.accounts.map((a) => [a.id, a]));

  const share = (v: number) => (total === 0 ? null : round2((v / total) * 100));
  const sortOrderOf = (id: string) => byId.get(id)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const NO_GROUP = "__sem_grupo__";

  const itemsByGroup = new Map<string, PanoramaItem[]>();
  for (const id of new Set([...cur.keys(), ...prev.keys(), ...year.keys()])) {
    const account = byId.get(id);
    const groupId = account?.parentId && byId.has(account.parentId) ? account.parentId : NO_GROUP;
    const c = cur.get(id) ?? 0;
    const p = prev.get(id) ?? 0;
    const item: PanoramaItem = {
      id,
      code: account?.code ?? "",
      name: account?.name ?? "Item desconhecido",
      current: c,
      previous: p,
      deltaPct: deltaPct(c, p),
      monthlyAvg12: round2((year.get(id) ?? 0) / 12),
      sharePct: share(c),
    };
    itemsByGroup.set(groupId, [...(itemsByGroup.get(groupId) ?? []), item]);
  }

  return [...itemsByGroup.entries()]
    .sort(([a], [b]) => sortOrderOf(a) - sortOrderOf(b))
    .map(([groupId, items]) => {
      const group = byId.get(groupId);
      const current = round2(items.reduce((s, i) => s + i.current, 0));
      const previous = round2(items.reduce((s, i) => s + i.previous, 0));
      return {
        id: groupId,
        code: group?.code ?? "",
        name: group?.name ?? "Sem grupo",
        current,
        previous,
        deltaPct: deltaPct(current, previous),
        monthlyAvg12: round2(items.reduce((s, i) => s + i.monthlyAvg12, 0)),
        sharePct: share(current),
        items: [...items].sort((a, b) => sortOrderOf(a.id) - sortOrderOf(b.id)),
      };
    });
}

/* ─── Por área ───────────────────────────────────────────────────────────── */

export interface AreaSpend {
  /** `null` = lançamento sem área. */
  areaId: string | null;
  total: number;
  opex: number;
  capex: number;
  /** Gasto por grupo do plano, maior primeiro. */
  byGroup: { groupId: string | null; total: number }[];
}

/** Custo de cada área (time), todas as naturezas; maior primeiro. */
export function buildAreaBreakdown(rows: readonly BreakdownRow[]): AreaSpend[] {
  const byArea = new Map<string | null, BreakdownRow[]>();
  for (const r of rows) byArea.set(r.areaId, [...(byArea.get(r.areaId) ?? []), r]);
  return [...byArea.entries()]
    .map(([areaId, list]) => ({
      areaId,
      total: totalSpend(list),
      opex: totalSpend(list.filter((r) => r.nature !== "capex")),
      capex: totalSpend(list.filter((r) => r.nature === "capex")),
      byGroup: [...spendBy(list, (r) => r.managementGroupId).entries()]
        .map(([groupId, total]) => ({ groupId, total }))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);
}

/* ─── Fornecedores ───────────────────────────────────────────────────────── */

export interface VendorSummary {
  key: string;
  name: string;
  total: number;
  /** Empresas em que o fornecedor aparece no recorte. */
  companyIds: string[];
  /** Meses em que apareceu, YYYY-MM-DD, em ordem. */
  months: string[];
  /** Maior sequência de meses seguidos. */
  longestStreak: number;
  usd: number | null;
  iof: number;
  sources: Source[];
}

/** Maior sequência de meses consecutivos numa lista de meses. */
export function longestMonthStreak(months: readonly string[]): number {
  const idx = [...new Set(months.map(monthIndex))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < idx.length; i++) {
    run = i > 0 && idx[i] === idx[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/** Ranking de fornecedores (maior gasto primeiro). Linha sem fornecedor fica de fora. */
export function summarizeVendors(rows: readonly BreakdownRow[]): VendorSummary[] {
  const map = new Map<
    string,
    {
      name: string;
      total: number;
      companies: Set<string>;
      months: Set<string>;
      usd: number | null;
      iof: number;
      sources: Set<Source>;
    }
  >();
  for (const r of rows) {
    if (!r.vendorKey) continue;
    const v = map.get(r.vendorKey) ?? {
      name: r.vendorName ?? r.vendorKey,
      total: 0,
      companies: new Set<string>(),
      months: new Set<string>(),
      usd: null,
      iof: 0,
      sources: new Set<Source>(),
    };
    v.total += spendOf(r);
    v.companies.add(r.companyId);
    for (const m of r.months) v.months.add(m);
    if (r.amountUsd != null) v.usd = (v.usd ?? 0) + r.amountUsd;
    v.iof += r.iofAmount;
    v.sources.add(r.source);
    map.set(r.vendorKey, v);
  }
  return [...map.entries()]
    .map(([key, v]) => {
      const months = [...v.months].sort();
      return {
        key,
        name: v.name,
        total: round2(v.total),
        companyIds: [...v.companies].sort(),
        months,
        longestStreak: longestMonthStreak(months),
        usd: v.usd == null ? null : round2(v.usd),
        iof: round2(v.iof),
        sources: [...v.sources].sort(),
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/* ─── Assinaturas (tecnologia) ───────────────────────────────────────────── */

export interface Subscription extends VendorSummary {
  /** Gasto no período anterior, de mesmo tamanho. */
  previous: number;
  /** Mesmo fornecedor em ≥ 2 meses seguidos na janela de 12 meses. */
  recurring: boolean;
  /** Apareceu no último mês da janela ou no anterior. */
  active: boolean;
  /** Tem gasto no período e não tinha no anterior. */
  isNew: boolean;
  /** Subiu mais de 10% sobre o período anterior. */
  rose: boolean;
  /** Pago por mais de uma empresa no período — candidato a contrato único. */
  duplicated: boolean;
  inUsd: boolean;
}

/** Acima disto, "subiu" — abaixo é oscilação de câmbio e de uso. */
export const RISE_THRESHOLD = 0.1;

/**
 * Assinaturas a partir de três leituras do mesmo recorte (em geral o grupo
 * `tecnologia`): o período, o anterior e a janela de 12 meses que termina no período.
 * A janela decide recorrência e se está ativa; o período e o anterior, valor, "nova" e
 * "subiu". Só entra quem tem gasto no período.
 */
export function buildSubscriptions(input: {
  current: readonly BreakdownRow[];
  previous: readonly BreakdownRow[];
  window: readonly BreakdownRow[];
  /** Último mês da janela (YYYY-MM-DD de qualquer dia do mês). */
  windowEnd: string;
}): Subscription[] {
  const prev = new Map(summarizeVendors(input.previous).map((v) => [v.key, v]));
  const win = new Map(summarizeVendors(input.window).map((v) => [v.key, v]));
  const end = monthIndex(input.windowEnd);

  return summarizeVendors(input.current)
    .filter((v) => Math.abs(v.total) >= 0.005)
    .map((v) => {
      const w = win.get(v.key);
      const months = w?.months ?? v.months;
      const last = months.length ? monthIndex(months[months.length - 1]) : -Infinity;
      const previous = prev.get(v.key)?.total ?? 0;
      return {
        ...v,
        previous,
        recurring: longestMonthStreak(months) >= 2,
        active: last >= end - 1,
        isNew: Math.abs(previous) < 0.005,
        rose: previous > 0 && v.total > previous * (1 + RISE_THRESHOLD),
        duplicated: v.companyIds.length > 1,
        inUsd: v.usd != null,
      };
    });
}

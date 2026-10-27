/**
 * Cliente HTTP do CRM — a única camada com I/O de rede da receita do BTG.
 *
 * Autentica como o USUÁRIO DE SERVIÇO do CRM (perfil que só tem
 * `financeiro.receita_btg`, decisão do dono em 27/10/2026): login por senha no Auth do
 * CRM, JWT do usuário, RPC pelo PostgREST do CRM. É o mesmo `has_access()` de qualquer
 * pessoa; revogar é tirar a chave do perfil na tela de Perfis do CRM. Nada de service
 * role do CRM aqui.
 *
 * O PostgREST corta o resultado no `max_rows` SEM erro. Por isso toda leitura é paginada
 * com ordem total e `count=exact`, e o total lido é conferido com o anunciado.
 *
 * `fetch` é injetável para os testes rodarem sem rede.
 */

import { parseLines, parseReports, type CrmReport, type CrmReportLine } from "./contract.ts";

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface CrmConfig {
  url: string;
  anonKey: string;
  email: string;
  password: string;
}

export const CRM_PAGE_SIZE = 1000;

export class CrmError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "CrmError";
  }
}

/** Mensagem do PostgREST/Auth, sem ecoar cabeçalho nem credencial. */
async function errorText(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as Record<string, unknown>;
    const code = typeof body.code === "string" ? body.code : null;
    const msg =
      (typeof body.message === "string" && body.message) ||
      (typeof body.error_description === "string" && body.error_description) ||
      (typeof body.msg === "string" && body.msg) ||
      res.statusText;
    if (code === "42501") {
      return "o usuário de serviço do CRM não tem a chave financeiro.receita_btg";
    }
    return code ? `${msg} (${code})` : msg;
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

export async function signIn(fetchFn: Fetch, config: CrmConfig): Promise<string> {
  const res = await fetchFn(`${config.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: config.anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email: config.email, password: config.password }),
  });
  if (!res.ok) {
    throw new CrmError(
      `Login do usuário de serviço no CRM falhou: ${await errorText(res)}`,
      res.status,
    );
  }
  const body = (await res.json()) as { access_token?: unknown };
  if (typeof body.access_token !== "string" || body.access_token.length === 0) {
    throw new CrmError("Login no CRM não devolveu token");
  }
  return body.access_token;
}

/** Total anunciado em `Content-Range: 0-999/12458`. */
function announcedTotal(res: Response): number | null {
  const range = res.headers.get("content-range");
  const total = range?.split("/")[1];
  if (!total || total === "*") return null;
  const n = Number(total);
  return Number.isInteger(n) ? n : null;
}

/** Chama uma RPC que devolve tabela, página por página, até ler tudo. */
export async function rpcAll(
  fetchFn: Fetch,
  config: CrmConfig,
  token: string,
  fn: string,
  args: Record<string, unknown>,
  order: string,
  pageSize = CRM_PAGE_SIZE,
): Promise<unknown[]> {
  const rows: unknown[] = [];
  let expected: number | null = null;
  // O avanço é pelo que VEIO, não pelo que se pediu: com `max_rows` menor que a página,
  // o PostgREST devolve menos sem avisar, e o total anunciado diz se falta.
  for (let offset = 0; ; offset = rows.length) {
    const params = new URLSearchParams({ order, limit: String(pageSize), offset: String(offset) });
    const res = await fetchFn(`${config.url}/rest/v1/rpc/${fn}?${params}`, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        prefer: "count=exact",
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new CrmError(`${fn} falhou: ${await errorText(res)}`, res.status);
    const page = (await res.json()) as unknown;
    if (!Array.isArray(page)) throw new CrmError(`${fn} não devolveu lista`);
    expected ??= announcedTotal(res);
    rows.push(...page);
    if (page.length === 0) break;
    if (expected !== null ? rows.length >= expected : page.length < pageSize) break;
  }
  if (expected !== null && rows.length !== expected) {
    throw new CrmError(`${fn}: li ${rows.length} linhas, o CRM anunciou ${expected}`);
  }
  return rows;
}

export interface CrmCommission {
  reports: CrmReport[];
  lines: CrmReportLine[];
}

/** Meses (dia 1) de `from` a `to`, inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

/**
 * Relatórios e detalhe do intervalo de meses (dia 1 de cada ponta, inclusive).
 *
 * O detalhe vem UM MÊS POR CHAMADA, em sequência. A RPC do CRM agrega `revenues`
 * (milhões de linhas) e cada página do `limit/offset` refaz a agregação do intervalo
 * inteiro: 13 meses de uma vez passaram do `statement_timeout` de 8s do papel
 * `authenticated` do CRM em 27/10/2026, e seis meses passavam por pouco. Um mês cabe em
 * uma página e numa fração do tempo. A lista de relatórios (um registro por arquivo) é
 * barata e continua numa chamada só.
 */
export async function fetchCommission(
  fetchFn: Fetch,
  config: CrmConfig,
  from: string,
  to: string,
): Promise<CrmCommission> {
  const token = await signIn(fetchFn, config);
  const reports = await rpcAll(
    fetchFn,
    config,
    token,
    "finance_commission_report",
    { p_from: from, p_to: to },
    "report_id",
  );
  const lines: unknown[] = [];
  for (const month of monthsBetween(from, to)) {
    const page = await rpcAll(
      fetchFn,
      config,
      token,
      "finance_commission_report_lines",
      { p_from: month, p_to: month },
      "report_id,advisor_code,category,product,type",
    );
    lines.push(...page);
  }
  return { reports: parseReports(reports), lines: parseLines(lines) };
}

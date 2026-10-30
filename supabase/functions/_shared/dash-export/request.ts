/**
 * Regras puras da Edge Function `dash-cost-export`: autenticação por chave e período.
 *
 * A chave é um segredo compartilhado só com o RCO Dash (DASH_EXPORT_KEY). A comparação
 * é feita sobre o SHA-256 dos dois lados, em tempo constante, para não vazar prefixo
 * por tempo de resposta.
 */

export const MAX_MESES = 24;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class DashExportError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

async function sha256(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return new Uint8Array(digest);
}

/** `Authorization: Bearer <chave>` confere com a chave configurada? Chave vazia nunca passa. */
export async function isAuthorized(header: string | null, expected: string): Promise<boolean> {
  if (!expected) return false;
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "");
  if (!match?.[1]) return false;
  const [a, b] = await Promise.all([sha256(match[1].trim()), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

function parseDate(value: string | null, name: string): string {
  if (!value || !ISO_DATE.test(value)) throw new DashExportError(`invalid_${name}`, 400);
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw new DashExportError(`invalid_${name}`, 400);
  }
  return value;
}

/** `?from=AAAA-MM-DD&to=AAAA-MM-DD`, com no máximo 24 meses entre as duas. */
export function parsePeriod(params: URLSearchParams): { from: string; to: string } {
  const from = parseDate(params.get("from"), "from");
  const to = parseDate(params.get("to"), "to");
  if (to < from) throw new DashExportError("invalid_period", 400);
  const limit = new Date(`${from}T00:00:00Z`);
  limit.setUTCMonth(limit.getUTCMonth() + MAX_MESES);
  if (new Date(`${to}T00:00:00Z`) > limit) throw new DashExportError("period_too_long", 400);
  return { from, to };
}

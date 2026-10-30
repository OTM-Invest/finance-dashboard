/**
 * Contrato com o CRM (`otm-invest-crm`) — o que as RPCs de leitura da receita do BTG
 * devolvem, validado na fronteira.
 *
 * As duas funções vivem no Supabase do CRM e exigem a chave `financeiro.receita_btg`
 * (`docs/btg-commission-reports-plan.md` §9 de lá):
 *
 *  - `finance_commission_report(p_from, p_to)` — um registro por ARQUIVO importado;
 *  - `finance_commission_report_lines(p_from, p_to)` — relatório × assessor × categoria
 *    × produto × tipo, com a comissão SEM arredondar.
 *
 * Formato que mudar do lado de lá faz a sincronização FALHAR, com o caminho do campo no
 * erro — nunca gravar meio relatório ou um número com a coluna trocada. Nenhum dado de
 * cliente atravessa (nem conta, nem nome): o parser nem tem onde guardar.
 */

export const REPORT_KINDS = ["pj1", "pj2", "finder"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/**
 * Linha sem dono: o arquivo do BTG veio sem código de assessor, ou com um código que não
 * existe no CRM. O importador do CRM grava essas linhas no código padrão (1056306, que é
 * também o do Leandro); a RPC de detalhe as devolve sob este rótulo, e deixa o 1056306
 * só com o que o arquivo atribui a ele. Não é código de ninguém — `btg_advisor_code` só
 * aceita dígitos — e fica "sem área", à vista.
 */
export const CRM_BUCKET_ADVISOR_CODE = "SEM_CODIGO";

export interface CrmReport {
  id: string;
  kind: ReportKind;
  /** Sempre dia 1, YYYY-MM-DD. */
  referenceMonth: string;
  periodStart: string | null;
  periodEnd: string | null;
  fileKey: string;
  fileName: string | null;
  rowCount: number;
  /** Total do relatório no CRM, a duas casas, como veio. */
  totalCommission: number;
  importedAt: string | null;
}

export interface CrmReportLine {
  reportId: string;
  kind: ReportKind;
  referenceMonth: string;
  advisorCode: string;
  advisorName: string | null;
  advisorActive: boolean | null;
  category: string;
  product: string;
  type: string;
  /** Soma crua do CRM — só o total do relatório se arredonda. */
  commission: number;
  revenue: number | null;
  netRevenue: number | null;
  rowCount: number;
}

export class ContractError extends Error {
  constructor(path: string, problem: string) {
    super(`Contrato do CRM mudou: ${path} ${problem}`);
    this.name = "ContractError";
  }
}

type Row = Record<string, unknown>;

function asRow(value: unknown, path: string): Row {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ContractError(path, "não é um objeto");
  }
  return value as Row;
}

function str(row: Row, key: string, path: string): string {
  const v = row[key];
  if (typeof v !== "string" || v.length === 0)
    throw new ContractError(`${path}.${key}`, "não é texto");
  return v;
}

function strOrNull(row: Row, key: string, path: string): string | null {
  const v = row[key];
  if (v == null) return null;
  if (typeof v !== "string") throw new ContractError(`${path}.${key}`, "não é texto");
  return v;
}

/** `numeric` do Postgres chega como número JSON (ou string, se alguém mudar o PostgREST). */
function num(row: Row, key: string, path: string): number {
  const v = row[key];
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new ContractError(`${path}.${key}`, "não é número finito");
  }
  return n;
}

function numOrNull(row: Row, key: string, path: string): number | null {
  return row[key] == null ? null : num(row, key, path);
}

function int(row: Row, key: string, path: string): number {
  const n = num(row, key, path);
  if (!Number.isInteger(n) || n < 0) throw new ContractError(`${path}.${key}`, "não é inteiro ≥ 0");
  return n;
}

function kind(row: Row, path: string): ReportKind {
  const v = row.kind;
  if (!REPORT_KINDS.includes(v as ReportKind)) {
    throw new ContractError(`${path}.kind`, `não é ${REPORT_KINDS.join("|")}`);
  }
  return v as ReportKind;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function uuid(row: Row, key: string, path: string): string {
  const v = str(row, key, path);
  if (!UUID.test(v)) throw new ContractError(`${path}.${key}`, "não é uuid");
  return v.toLowerCase();
}

function date(row: Row, key: string, path: string): string {
  const v = str(row, key, path);
  if (!DATE.test(v)) throw new ContractError(`${path}.${key}`, "não é data YYYY-MM-DD");
  return v;
}

function dateOrNull(row: Row, key: string, path: string): string | null {
  return row[key] == null ? null : date(row, key, path);
}

function month(row: Row, key: string, path: string): string {
  const v = date(row, key, path);
  if (!v.endsWith("-01")) throw new ContractError(`${path}.${key}`, "não é dia 1");
  return v;
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new ContractError(path, "não é uma lista");
  return value;
}

/** Resposta de `finance_commission_report`. */
export function parseReports(value: unknown): CrmReport[] {
  return list(value, "reports").map((item, i) => {
    const path = `reports[${i}]`;
    const row = asRow(item, path);
    return {
      id: uuid(row, "report_id", path),
      kind: kind(row, path),
      referenceMonth: month(row, "reference_month", path),
      periodStart: dateOrNull(row, "period_start", path),
      periodEnd: dateOrNull(row, "period_end", path),
      fileKey: str(row, "file_key", path),
      fileName: strOrNull(row, "file_name", path),
      rowCount: int(row, "row_count", path),
      totalCommission: num(row, "total_commission", path),
      importedAt: strOrNull(row, "imported_at", path),
    };
  });
}

/** Resposta de `finance_commission_report_lines`. */
export function parseLines(value: unknown): CrmReportLine[] {
  return list(value, "lines").map((item, i) => {
    const path = `lines[${i}]`;
    const row = asRow(item, path);
    const active = row.advisor_active;
    if (active != null && typeof active !== "boolean") {
      throw new ContractError(`${path}.advisor_active`, "não é booleano");
    }
    return {
      reportId: uuid(row, "report_id", path),
      kind: kind(row, path),
      referenceMonth: month(row, "reference_month", path),
      advisorCode: str(row, "advisor_code", path),
      advisorName: strOrNull(row, "advisor_name", path),
      advisorActive: (active as boolean | null) ?? null,
      category: str(row, "category", path),
      product: str(row, "product", path),
      type: str(row, "type", path),
      commission: num(row, "commission", path),
      revenue: numOrNull(row, "revenue", path),
      netRevenue: numOrNull(row, "net_revenue", path),
      rowCount: int(row, "row_count", path),
    };
  });
}

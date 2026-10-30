/**
 * A conferência do contrato: para cada relatório, a soma CRUA das linhas, arredondada a
 * duas casas, é o total do relatório. Medido no CRM em 27/10/2026: 146 de 146
 * relatórios, zero centavo.
 *
 * Duas armadilhas:
 *  - arredondar linha a linha e somar depois NÃO dá o total (erra 88 de 146 relatórios
 *    em até 9 centavos) — soma-se primeiro, arredonda-se no fim;
 *  - somar em ponto flutuante também pode errar no meio centavo (`1.005 * 100` é
 *    `100.49999…`). Aqui a soma é em decimal exato (bigint em 10⁻¹⁰), e o
 *    arredondamento é o do Postgres (`round(numeric)`: meio centavo para longe do zero),
 *    o mesmo que o banco usa ao conferir de novo em `crm_commission_sync_apply`.
 */

import type { CrmReport, CrmReportLine } from "./contract.ts";

const SCALE = 10;
const CENT_FACTOR = 10n ** BigInt(SCALE - 2);

/**
 * Número decimal → inteiro em 10⁻¹⁰, sem passar por multiplicação em ponto flutuante.
 * Parte do texto mais curto que identifica o número (`String(0.335)` = `"0.335"`).
 */
export function toScaled(value: number | string): bigint {
  const text = typeof value === "number" ? String(value) : value.trim();
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) {
    throw new Error(`Número inválido: ${text}`);
  }
  const [, sign, intPart, fracPart = "", expPart = "0"] = match;
  const digits = (intPart || "0") + fracPart;
  // Posição da vírgula depois de aplicar o expoente, contada a partir do fim.
  const decimals = fracPart.length - Number(expPart);
  const shift = SCALE - decimals;
  let scaled: bigint;
  if (shift >= 0) {
    scaled = BigInt(digits) * 10n ** BigInt(shift);
  } else {
    // Mais casas do que a escala: trunca (abaixo de 10⁻¹⁰ não é dinheiro).
    const cut = digits.length + shift;
    scaled = cut > 0 ? BigInt(digits.slice(0, cut)) : 0n;
  }
  return sign === "-" ? -scaled : scaled;
}

/** Inteiro em 10⁻¹⁰ → centavos, meio centavo para longe do zero (como `round` do Postgres). */
export function scaledToCents(scaled: bigint): number {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const cents = (abs + CENT_FACTOR / 2n) / CENT_FACTOR;
  return Number(negative ? -cents : cents);
}

/** Reais (número ou texto) → centavos, arredondando como o Postgres. */
export function toCents(value: number | string): number {
  return scaledToCents(toScaled(value));
}

/** Soma exata de valores crus, arredondada no fim, em centavos. */
export function sumToCents(values: readonly (number | string)[]): number {
  let total = 0n;
  for (const v of values) total += toScaled(v);
  return scaledToCents(total);
}

export interface ReportCheck {
  reportId: string;
  kind: CrmReport["kind"];
  referenceMonth: string;
  fileKey: string;
  totalCents: number;
  linesCents: number;
  lineCount: number;
  ok: boolean;
}

/**
 * Confere cada relatório contra as suas linhas. Linha de relatório que não veio na lista
 * de relatórios é erro de leitura (as duas RPCs devem ter o mesmo recorte).
 */
export function checkReports(
  reports: readonly CrmReport[],
  lines: readonly CrmReportLine[],
): { checks: ReportCheck[]; orphanReportIds: string[] } {
  const byReport = new Map<string, CrmReportLine[]>();
  for (const line of lines) {
    const bucket = byReport.get(line.reportId);
    if (bucket) bucket.push(line);
    else byReport.set(line.reportId, [line]);
  }

  const known = new Set(reports.map((r) => r.id));
  const orphanReportIds = [...byReport.keys()].filter((id) => !known.has(id)).sort();

  const checks = reports.map((report) => {
    const own = byReport.get(report.id) ?? [];
    const linesCents = sumToCents(own.map((l) => l.commission));
    const totalCents = toCents(report.totalCommission);
    return {
      reportId: report.id,
      kind: report.kind,
      referenceMonth: report.referenceMonth,
      fileKey: report.fileKey,
      totalCents,
      linesCents,
      lineCount: own.length,
      ok: linesCents === totalCents,
    };
  });

  return { checks, orphanReportIds };
}

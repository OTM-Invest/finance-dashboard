/**
 * Que lançamento cada conjunto de relatórios abre — a SUGESTÃO que a tela mostra.
 *
 * O casamento não é 1:1: um mês de PJ1 pode vir em vários arquivos (contas B2B
 * diferentes) e o finder às vezes cobre dois meses. E a descrição do lançamento varia
 * ("comissão ref setembro", "finder ref julho agosto 2025"), então texto não serve. A
 * regra aqui é explícita e conferível:
 *
 *   relatórios da mesma empresa × tipo × mês de referência formam um GRUPO; candidato é
 *   lançamento da mesma empresa com competência num mês coberto pelo grupo (o mês de
 *   referência ou o período do arquivo); ganha o de menor diferença de valor.
 *
 * Um lançamento é sugerido a um grupo só (o de menor diferença). Nada é gravado aqui:
 * uma pessoa confirma, e o banco refaz a conta em `save_revenue_statement`.
 */

import type { ReportKind } from "./contract.ts";

export interface MatchReport {
  id: string;
  companyId: string;
  kind: ReportKind;
  referenceMonth: string;
  periodStart: string | null;
  periodEnd: string | null;
  totalCents: number;
}

export interface MatchTransaction {
  id: string;
  companyId: string;
  accrualDate: string;
  amountCents: number;
}

export interface MatchCandidate {
  transactionId: string;
  differenceCents: number;
}

export interface StatementSuggestion {
  key: string;
  companyId: string;
  kind: ReportKind;
  referenceMonth: string;
  reportIds: string[];
  totalCents: number;
  /** Candidatos em ordem de diferença absoluta; o primeiro é a sugestão. */
  candidates: MatchCandidate[];
  /** Lançamento sugerido (já sem conflito com outro grupo), ou null. */
  suggestedTransactionId: string | null;
}

/** Diferença acima disto não é sugerida: é outro lançamento, não um resíduo. */
export const MAX_SUGGESTION_GAP = 0.02;

function monthOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Meses (dia 1) cobertos pelo grupo: o de referência e os do período dos arquivos. */
function coveredMonths(reports: readonly MatchReport[]): Set<string> {
  const months = new Set<string>();
  for (const r of reports) {
    months.add(r.referenceMonth);
    if (r.periodStart && r.periodEnd) {
      let cursor = monthOf(r.periodStart);
      const last = monthOf(r.periodEnd);
      for (let guard = 0; cursor <= last && guard < 24; guard += 1) {
        months.add(cursor);
        const [y, m] = cursor.split("-").map(Number);
        const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
        cursor = next;
      }
    }
  }
  return months;
}

export function suggestStatements(
  reports: readonly MatchReport[],
  transactions: readonly MatchTransaction[],
): StatementSuggestion[] {
  const groups = new Map<string, MatchReport[]>();
  for (const r of reports) {
    const key = `${r.companyId}|${r.kind}|${r.referenceMonth}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  }

  const suggestions: StatementSuggestion[] = [...groups.entries()].map(([key, group]) => {
    const first = group[0];
    const totalCents = group.reduce((s, r) => s + r.totalCents, 0);
    const months = coveredMonths(group);
    const candidates = transactions
      .filter((t) => t.companyId === first.companyId && months.has(monthOf(t.accrualDate)))
      .map((t) => ({ transactionId: t.id, differenceCents: t.amountCents - totalCents }))
      .filter((c) => Math.abs(c.differenceCents) <= Math.abs(totalCents) * MAX_SUGGESTION_GAP)
      .sort(
        (a, b) =>
          Math.abs(a.differenceCents) - Math.abs(b.differenceCents) ||
          a.transactionId.localeCompare(b.transactionId),
      );
    return {
      key,
      companyId: first.companyId,
      kind: first.kind,
      referenceMonth: first.referenceMonth,
      reportIds: group.map((r) => r.id).sort(),
      totalCents,
      candidates,
      suggestedTransactionId: null,
    };
  });

  // Atribuição gulosa pela menor diferença: o lançamento vai para o grupo que ele
  // explica melhor, e cada grupo leva um lançamento só.
  const pairs = suggestions
    .flatMap((s) => s.candidates.map((c) => ({ s, c })))
    .sort(
      (a, b) =>
        Math.abs(a.c.differenceCents) - Math.abs(b.c.differenceCents) ||
        a.s.key.localeCompare(b.s.key),
    );
  const taken = new Set<string>();
  const assigned = new Map<string, string>();
  for (const { s, c } of pairs) {
    if (assigned.has(s.key) || taken.has(c.transactionId)) continue;
    assigned.set(s.key, c.transactionId);
    taken.add(c.transactionId);
  }

  return suggestions
    .map((s) => ({ ...s, suggestedTransactionId: assigned.get(s.key) ?? null }))
    .sort(
      (a, b) =>
        b.referenceMonth.localeCompare(a.referenceMonth) ||
        a.companyId.localeCompare(b.companyId) ||
        a.kind.localeCompare(b.kind),
    );
}

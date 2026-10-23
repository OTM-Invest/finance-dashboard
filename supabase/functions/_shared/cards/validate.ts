/**
 * Conferência de uma fatura lida — a mesma função para o leitor de texto e o de visão.
 *
 * Uma fatura detalhada só entra na visão gerencial se as linhas fecharem com o que a
 * própria fatura imprime: o total, o resumo (nacionais, internacionais, IOF) e o
 * subtotal de cada cartão. Um número lido errado — por OCR, por layout novo do banco —
 * desfaz a soma, e a fatura fica para conferência em vez de entrar com um gasto falso.
 * Ver docs/features/central-de-gastos-plan.md §2, invariante 3.
 */
import type {
  ParsedStatement,
  StatementLine,
  StatementValidation,
  ValidationCheck,
} from "./types.ts";

/** Quanto a linha pesa na fatura: compra + IOF, estorno abatendo. */
export function lineTotalCents(line: StatementLine): number {
  const gross = line.amountCents + line.iofCents;
  return line.kind === "refund" ? -gross : gross;
}

function check(code: string, label: string, expected: number, got: number): ValidationCheck {
  return { code, label, expectedCents: expected, gotCents: got, ok: expected === got };
}

/**
 * @param ledgerAmountCents valor do lançamento da fatura no financeiro, quando a fatura
 *   já está vinculada a ele — a terceira ponta que precisa bater.
 */
export function validateStatement(
  statement: ParsedStatement,
  ledgerAmountCents?: number | null,
): StatementValidation {
  const checks: ValidationCheck[] = [];
  const sum = (lines: StatementLine[]) => lines.reduce((s, l) => s + lineTotalCents(l), 0);

  checks.push(
    check("total", "Linhas somam o total da fatura", statement.totalCents, sum(statement.lines)),
  );

  for (const card of statement.cards) {
    if (card.subtotalCents == null) continue;
    checks.push(
      check(
        `card:${card.last4}`,
        `Cartão final ${card.last4} soma o subtotal impresso`,
        card.subtotalCents,
        sum(statement.lines.filter((l) => l.cardLast4 === card.last4)),
      ),
    );
  }

  const { summary } = statement;
  const purchases = statement.lines.filter((l) => l.kind === "purchase" || l.kind === "refund");
  if (summary.domesticCents != null) {
    const domestic = purchases
      .filter((l) => l.currency === "BRL")
      .reduce((s, l) => s + (l.kind === "refund" ? -l.amountCents : l.amountCents), 0);
    checks.push(check("domestic", "Compras nacionais", summary.domesticCents, domestic));
  }
  if (summary.internationalCents != null) {
    const international = purchases
      .filter((l) => l.currency === "USD")
      .reduce((s, l) => s + (l.kind === "refund" ? -l.amountCents : l.amountCents), 0);
    checks.push(
      check("international", "Compras internacionais", summary.internationalCents, international),
    );
  }
  if (summary.iofCents != null) {
    const iof =
      statement.lines.reduce((s, l) => s + l.iofCents, 0) +
      statement.lines
        .filter((l) => l.kind === "fee" && l.description.startsWith("IOF "))
        .reduce((s, l) => s + l.amountCents, 0);
    checks.push(check("iof", "IOF de compras internacionais", summary.iofCents, iof));
  }

  if (ledgerAmountCents != null) {
    checks.push(
      check(
        "ledger",
        "Fatura bate com o lançamento no financeiro",
        ledgerAmountCents,
        statement.totalCents,
      ),
    );
  }

  return { ok: checks.every((c) => c.ok), checks };
}

/**
 * Fatura de cartão lida — o contrato entre o leitor (texto hoje, visão na Fase 4), o
 * validador e o banco. Ver docs/features/central-de-gastos-plan.md §7.
 *
 * Todo valor é em CENTAVOS inteiros: a validação compara somas com o total impresso na
 * fatura, e um `0.1 + 0.2` de ponto flutuante faria uma fatura certa parecer errada.
 */

export type CardIssuer = "c6";

export type StatementLineKind = "purchase" | "fee" | "interest" | "refund";

export interface StatementCard {
  last4: string;
  holderName: string;
  kind: "virtual" | "physical";
  /** "Subtotal deste cartão" impresso na fatura. */
  subtotalCents: number | null;
}

export interface StatementLine {
  cardLast4: string;
  /** Data da compra (YYYY-MM-DD) — parcela antiga carrega a data da compra original. */
  purchaseDate: string;
  description: string;
  kind: StatementLineKind;
  /** Valor em reais, sem o IOF. Sempre positivo; o estorno é dito pelo `kind`. */
  amountCents: number;
  currency: "BRL" | "USD";
  /** Valor na moeda original (centavos da moeda), quando internacional. */
  amountOriginalCents: number | null;
  fxRate: number | null;
  /** IOF da compra internacional, que a fatura imprime em linha separada. */
  iofCents: number;
  installmentN: number | null;
  installmentTotal: number | null;
}

/** Pagamento da fatura anterior — aparece entre as transações, mas não é gasto. */
export interface StatementPayment {
  cardLast4: string;
  date: string;
  description: string;
  amountCents: number;
}

export interface StatementSummary {
  domesticCents: number | null;
  internationalCents: number | null;
  iofCents: number | null;
  /** Anuidade, tarifa de saque, emissão de cartão. */
  feesCents: number | null;
  /** Juros de financiamento, juros de mora, multa. */
  interestCents: number | null;
  totalCents: number | null;
  futureObligationsCents: number | null;
}

export interface ParsedStatement {
  issuer: CardIssuer;
  closingDate: string;
  dueDate: string;
  totalCents: number;
  summary: StatementSummary;
  cards: StatementCard[];
  lines: StatementLine[];
  payments: StatementPayment[];
  /** O que o leitor não soube interpretar — não impede salvar, mas aparece na conferência. */
  warnings: string[];
}

export interface ValidationCheck {
  code: string;
  label: string;
  expectedCents: number;
  gotCents: number;
  ok: boolean;
}

export interface StatementValidation {
  ok: boolean;
  checks: ValidationCheck[];
}

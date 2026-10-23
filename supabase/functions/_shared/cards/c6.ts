/**
 * Leitor da fatura do C6 Business a partir das linhas de texto do PDF.
 *
 * Armadilhas que as faturas reais mostraram (plano §7.1), cada uma com teste:
 *  · o PAGAMENTO da fatura anterior aparece entre as transações ("Inclusao de
 *    Pagamento", "Pag Fatura Boleto") e não é gasto;
 *  · o IOF de compra internacional é uma linha separada, com a mesma data e o mesmo
 *    estabelecimento — aqui ele é anexado à compra;
 *  · a data vem sem ano, e parcela antiga pode ser do ano ANTERIOR ("08 out … Parcela
 *    12/12" numa fatura que fecha em setembro);
 *  · uma fatura tem vários cartões (virtual principal + adicionais por portador), cada um
 *    com o próprio subtotal.
 *
 * O leitor não decide se a fatura está certa — quem decide é `validateStatement`, que
 * confere as somas contra o que a própria fatura imprime.
 */
import { CELL_SEPARATOR } from "./text-lines.ts";
import type {
  ParsedStatement,
  StatementCard,
  StatementLine,
  StatementPayment,
  StatementSummary,
} from "./types.ts";

const MONTHS: Record<string, number> = {
  jan: 1,
  fev: 2,
  mar: 3,
  abr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  out: 10,
  nov: 11,
  dez: 12,
};

const MONTHS_LONG: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  março: 3,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

/** "1.234,56" → 123456. Aceita sinal e "R$". */
export function parseBrlCents(raw: string): number | null {
  const m = /^(-)?\s*(?:R\$\s?)?(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const cents = Number(m[2].replace(/\./g, "")) * 100 + Number(m[3]);
  return m[1] ? -cents : cents;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Ano de uma data impressa só com dia e mês: o da data de fechamento, salvo se a data
 * cair DEPOIS do fechamento — aí é do ano anterior (a fatura só lança o que já ocorreu).
 */
export function inferYear(day: number, month: number, closingDate: string): number {
  const [cy, cm, cd] = closingDate.split("-").map(Number);
  const after = month > cm || (month === cm && day > cd);
  return after ? cy - 1 : cy;
}

const SUMMARY_LABELS: Record<string, keyof StatementSummary | "fee" | "interest"> = {
  "compras nacionais": "domesticCents",
  "compras internacionais": "internationalCents",
  "anuidade diferenciada": "fee",
  "tarifa de saque": "fee",
  "personalização de cartão físico adicional e/ou emissão de 2ª via": "fee",
  "iof de financiamento e compras internacionais": "iofCents",
  "juros de financiamento": "interest",
  "juros de mora": "interest",
  "multas por atraso": "interest",
  "total a pagar": "totalCents",
  "saldo obrigações futuras": "futureObligationsCents",
};

const CARD_HEADER =
  /^C6 Business (Virtual )?Final (\d{4}) - (.+?)(?: {2}Cartão Virtual)? {2}Subtotal deste cartão {2}(R\$ ?[\d.,]+)$/;

const TX_LINE =
  /^(\d{2}) (jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez) {2}(.+?) {2}(-?[\d.]+,\d{2})$/;

const IOF_DETAIL = /^IOF Transações Exterior$/i;
const USD_DETAIL = /^USD ([\d.,]+) \| Cotação USD: R\$ ?([\d,]+)$/i;
const INSTALLMENT = /^-?\s*Parcela (\d+)\/(\d+)$/i;
const PAYMENT = /^(inclus[aã]o de pagamento|pag(amento)? fatura)/i;
const INTEREST = /^(juros|encargos|multa)/i;
const FEE = /^(anuidade|tarifa)/i;
const REFUND = /estorno/i;

interface RawTx {
  cardLast4: string;
  day: number;
  month: number;
  description: string;
  detail: "iof" | "usd" | null;
  usdCents: number | null;
  fxRate: number | null;
  installmentN: number | null;
  installmentTotal: number | null;
  valueCents: number;
}

function parseTxLine(line: string, cardLast4: string): RawTx | null {
  const m = TX_LINE.exec(line);
  if (!m) return null;
  const valueCents = parseBrlCents(m[4]);
  if (valueCents == null) return null;

  const parts = m[3]
    .split(CELL_SEPARATOR)
    .map((p) => p.trim())
    .filter(Boolean);
  const descParts: string[] = [];
  let detail: RawTx["detail"] = null;
  let usdCents: number | null = null;
  let fxRate: number | null = null;
  let installmentN: number | null = null;
  let installmentTotal: number | null = null;

  for (const part of parts) {
    const usd = USD_DETAIL.exec(part);
    const inst = INSTALLMENT.exec(part);
    if (IOF_DETAIL.test(part)) detail = "iof";
    else if (usd) {
      detail = "usd";
      usdCents = parseBrlCents(usd[1]);
      fxRate = Number(usd[2].replace(",", "."));
    } else if (inst) {
      installmentN = Number(inst[1]);
      installmentTotal = Number(inst[2]);
    } else {
      // "CONTA AZUL - Parcela 8/12" chega numa célula só em alguns layouts.
      const inline = /^(.*?)\s+-\s+Parcela (\d+)\/(\d+)$/i.exec(part);
      if (inline) {
        descParts.push(inline[1]);
        installmentN = Number(inline[2]);
        installmentTotal = Number(inline[3]);
      } else descParts.push(part);
    }
  }

  return {
    cardLast4,
    day: Number(m[1]),
    month: MONTHS[m[2]],
    description: descParts.join(" ").replace(/\s+/g, " ").trim(),
    detail,
    usdCents,
    fxRate,
    installmentN,
    installmentTotal,
    valueCents,
  };
}

function findClosingDate(lines: readonly string[]): string | null {
  for (const line of lines) {
    const m = /(?:fechamento desta fatura em|feitas até) (\d{2})\/(\d{2})\/(\d{2,4})/i.exec(line);
    if (m) {
      const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      return isoDate(year, Number(m[2]), Number(m[1]));
    }
  }
  return null;
}

/** "Vencimento: 01 de Outubro" — o ano é o primeiro em que a data cai depois do fechamento. */
function findDueDate(lines: readonly string[], closingDate: string): string | null {
  for (const line of lines) {
    const m = /Vencimento: {1,2}(\d{1,2}) de ([A-Za-zçÇ]+)/i.exec(line);
    if (!m) continue;
    const month = MONTHS_LONG[m[2].toLowerCase()];
    if (!month) continue;
    const day = Number(m[1]);
    const [cy, cm, cd] = closingDate.split("-").map(Number);
    const sameYearAfter = month > cm || (month === cm && day > cd);
    return isoDate(sameYearAfter ? cy : cy + 1, month, day);
  }
  return null;
}

function parseSummary(lines: readonly string[]): StatementSummary {
  const summary: StatementSummary = {
    domesticCents: null,
    internationalCents: null,
    iofCents: null,
    feesCents: null,
    interestCents: null,
    totalCents: null,
    futureObligationsCents: null,
  };
  const start = lines.findIndex((l) => /^Resumo da fatura/i.test(l));
  if (start < 0) return summary;

  for (const line of lines.slice(start)) {
    if (/^Transações do cartão/i.test(line)) break;
    const cells = line.split(CELL_SEPARATOR);
    if (cells.length < 2) continue;
    const label = cells[0].trim().toLowerCase();
    const target = SUMMARY_LABELS[label];
    const value = parseBrlCents(cells[cells.length - 1]);
    if (!target || value == null) continue;
    if (target === "fee") summary.feesCents = (summary.feesCents ?? 0) + value;
    else if (target === "interest") summary.interestCents = (summary.interestCents ?? 0) + value;
    else if (summary[target] == null) summary[target] = value;
  }
  return summary;
}

export class StatementParseError extends Error {}

export function parseC6Statement(lines: readonly string[]): ParsedStatement {
  const closingDate = findClosingDate(lines);
  if (!closingDate) {
    throw new StatementParseError(
      "Não achei a data de fechamento. Esta fatura é do C6 Business e tem texto selecionável?",
    );
  }
  const dueDate = findDueDate(lines, closingDate);
  if (!dueDate) throw new StatementParseError("Não achei a data de vencimento da fatura.");

  const summary = parseSummary(lines);
  const cards: StatementCard[] = [];
  const raw: RawTx[] = [];
  const warnings: string[] = [];
  let current: string | null = null;
  let inTransactions = false;

  for (const line of lines) {
    if (/^Transações dos? cart(ão|ões)/i.test(line)) inTransactions = true;
    if (/^Formas de pagamento/i.test(line)) inTransactions = false;
    if (!inTransactions) continue;

    const header = CARD_HEADER.exec(line);
    if (header) {
      current = header[2];
      if (!cards.some((c) => c.last4 === current)) {
        cards.push({
          last4: header[2],
          holderName: header[3].trim(),
          kind: header[1] ? "virtual" : "physical",
          subtotalCents: parseBrlCents(header[4]),
        });
      }
      continue;
    }

    if (!/^\d{2} (jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/.test(line)) continue;
    if (!current) {
      warnings.push(`Transação antes de qualquer cartão, ignorada: "${line}"`);
      continue;
    }
    const tx = parseTxLine(line, current);
    if (!tx) warnings.push(`Linha não reconhecida: "${line}"`);
    else raw.push(tx);
  }

  const payments: StatementPayment[] = [];
  const statementLines: StatementLine[] = [];
  const iofs: RawTx[] = [];

  for (const tx of raw) {
    const date = isoDate(inferYear(tx.day, tx.month, closingDate), tx.month, tx.day);
    if (PAYMENT.test(tx.description)) {
      payments.push({
        cardLast4: tx.cardLast4,
        date,
        description: tx.description,
        amountCents: Math.abs(tx.valueCents),
      });
      continue;
    }
    if (tx.detail === "iof") {
      iofs.push(tx);
      continue;
    }
    const isRefund = tx.valueCents < 0 || REFUND.test(tx.description);
    statementLines.push({
      cardLast4: tx.cardLast4,
      purchaseDate: date,
      description: tx.description,
      kind: isRefund
        ? "refund"
        : INTEREST.test(tx.description)
          ? "interest"
          : FEE.test(tx.description)
            ? "fee"
            : "purchase",
      amountCents: Math.abs(tx.valueCents),
      currency: tx.detail === "usd" ? "USD" : "BRL",
      amountOriginalCents: tx.usdCents,
      fxRate: tx.fxRate,
      iofCents: 0,
      installmentN: tx.installmentN,
      installmentTotal: tx.installmentTotal,
    });
  }

  // IOF vai para a compra internacional do mesmo cartão, dia e estabelecimento. A fatura
  // não diz qual compra quando há duas iguais no dia; então ele vai para a primeira ainda
  // sem IOF, o que não muda nenhum total.
  for (const iof of iofs) {
    const date = isoDate(inferYear(iof.day, iof.month, closingDate), iof.month, iof.day);
    const target = statementLines.find(
      (l) =>
        l.cardLast4 === iof.cardLast4 &&
        l.purchaseDate === date &&
        l.description === iof.description &&
        l.currency === "USD" &&
        l.iofCents === 0,
    );
    if (target) {
      target.iofCents = iof.valueCents;
    } else {
      warnings.push(
        `IOF sem compra correspondente, mantido como linha própria: ${iof.description}`,
      );
      statementLines.push({
        cardLast4: iof.cardLast4,
        purchaseDate: date,
        description: `IOF ${iof.description}`,
        kind: "fee",
        amountCents: iof.valueCents,
        currency: "BRL",
        amountOriginalCents: null,
        fxRate: null,
        iofCents: 0,
        installmentN: null,
        installmentTotal: null,
      });
    }
  }

  const totalCents = summary.totalCents ?? cards.reduce((s, c) => s + (c.subtotalCents ?? 0), 0);

  return {
    issuer: "c6",
    closingDate,
    dueDate,
    totalCents,
    summary,
    cards,
    lines: statementLines,
    payments,
    warnings,
  };
}

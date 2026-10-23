/**
 * Estorno de venda → o que a esteira fiscal precisa saber.
 *
 * A esteira de NFS-e nasceu olhando só para `charge.paid`: dinheiro que entrou
 * vira nota. O caminho inverso não existia — uma venda estornada antes da
 * emissão seguia na fila e virava nota de dinheiro que voltou. Em produção
 * isso aconteceu **19 vezes** (R$ 24.309,60): o estorno já estava no banco
 * quando alguém aprovou a nota.
 *
 * ⚠️ O SINAL CONFIÁVEL É O PAR (evento, status da cobrança) — NUNCA O VALOR.
 * `pagarme_charges.refunded_amount` é agregado dos payables de estorno e chega
 * atrasado ou nunca: em produção, 34 das 93 cobranças com `charge.refunded`
 * têm valor menor que o total, o que as faria passar por "parcial" sem serem.
 * Por isso a classificação aqui ignora dinheiro e lê só estado:
 *
 *   | evento                    | status resultante | leitura          |
 *   | ------------------------- | ----------------- | ---------------- |
 *   | `charge.refunded`         | `canceled`        | estorno TOTAL    |
 *   | `charge.partial_canceled` | segue `paid`      | estorno PARCIAL  |
 *   | `charge.chargedback`      | `chargedback`     | CHARGEBACK       |
 *
 * (117 eventos de produção conferidos em 23/10/2026: a correspondência é 1:1.)
 *
 * Chargeback NÃO é estorno: o serviço foi prestado e o cliente contestou, o que
 * contabilmente é perda, não desfazimento da venda. Por isso ele tem rótulo
 * próprio e a nota fica RETIDA para decisão humana, em vez de descartada.
 */

/** Estado de estorno de uma venda, do ponto de vista da nota. */
export type RefundState = "none" | "partial" | "full" | "chargeback";

/**
 * Precedência quando dois sinais discordam (webhook e sync, ou parcial seguido
 * de total). Só ESCALA: uma venda nunca volta de estornada para íntegra —
 * downgrade silencioso liberaria para emissão uma nota já barrada.
 */
const RANK: Record<RefundState, number> = {
  none: 0,
  partial: 1,
  full: 2,
  chargeback: 3,
};

/**
 * Lê o estado pelo STATUS da cobrança. Serve a todo caminho de ingestão
 * (webhook, sync diário, backfill), porque o status vem no próprio objeto da
 * venda — é a rede de segurança para webhook perdido.
 *
 * `paid` não devolve `partial`: estorno parcial mantém a cobrança em `paid` e
 * só o evento o distingue de uma venda íntegra (ver `refundStateFromEvent`).
 */
export function refundStateFromCharge(chargeStatus: string | null | undefined): RefundState {
  switch (chargeStatus) {
    case "chargedback":
      return "chargeback";
    case "canceled":
      return "full";
    default:
      return "none";
  }
}

/**
 * Lê o estado pelo TIPO DO EVENTO. Complementa o status: só aqui aparece o
 * estorno parcial, que não muda o status da cobrança.
 */
export function refundStateFromEvent(eventType: string | null | undefined): RefundState {
  switch (eventType) {
    case "charge.chargedback":
      return "chargeback";
    case "charge.refunded":
      return "full";
    case "charge.partial_canceled":
      return "partial";
    default:
      return "none";
  }
}

/**
 * Lê o estado pela EXISTÊNCIA de payable de estorno/chargeback na cobrança.
 *
 * Terceiro sinal, para o que os outros dois não alcançam: estorno parcial sem evento.
 * Os eventos só passaram a ser assinados no painel do pagar.me em 13/08/2026, e um
 * estorno parcial anterior a isso não deixou evento nem mexeu no status — mas deixou
 * payable negativo, que é dinheiro contabilizado pelo adquirente e não um agregado.
 *
 * Devolve sempre `partial`, o estado mais fraco, mesmo que o estorno tenha sido total:
 * sem o evento não dá para distinguir, e `partial` RETÉM a nota para decisão humana,
 * enquanto `full` a descartaria sozinho. Na dúvida, retém.
 */
export function refundStateFromPayables(hasDebitPayable: boolean): RefundState {
  return hasDebitPayable ? "partial" : "none";
}

/** Combina sinais mantendo o mais forte. Ver `RANK`. */
export function mergeRefundState(a: RefundState, b: RefundState): RefundState {
  return RANK[a] >= RANK[b] ? a : b;
}

/**
 * Estado final de uma venda a partir dos dois sinais disponíveis no momento da
 * ingestão. `none` significa "nada a fazer com a nota".
 */
export function resolveRefundState(input: {
  eventType?: string | null;
  chargeStatus?: string | null;
}): RefundState {
  return mergeRefundState(
    refundStateFromEvent(input.eventType),
    refundStateFromCharge(input.chargeStatus),
  );
}

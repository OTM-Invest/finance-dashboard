import { describe, expect, it } from "vitest";

import {
  mergeRefundState,
  refundStateFromCharge,
  refundStateFromEvent,
  refundStateFromPayables,
  resolveRefundState,
  type RefundState,
} from "./refunds.ts";

describe("classificação de estorno — o par (evento, status)", () => {
  // A tabela abaixo é a correspondência observada em 117 eventos de produção
  // (23/10/2026). Se o pagar.me mudar o contrato, é AQUI que o teste quebra —
  // e não na emissão de uma nota indevida.
  const PRODUCAO: { evento: string; status: string; esperado: RefundState }[] = [
    { evento: "charge.refunded", status: "canceled", esperado: "full" },
    { evento: "charge.partial_canceled", status: "paid", esperado: "partial" },
    { evento: "charge.chargedback", status: "chargedback", esperado: "chargeback" },
    { evento: "charge.paid", status: "paid", esperado: "none" },
  ];

  it.each(PRODUCAO)("$evento + $status → $esperado", ({ evento, status, esperado }) => {
    expect(resolveRefundState({ eventType: evento, chargeStatus: status })).toBe(esperado);
  });

  it("o status sozinho já basta — é a rede contra webhook perdido", () => {
    // o sync diário e o backfill releem a cobrança sem evento nenhum
    expect(resolveRefundState({ chargeStatus: "canceled" })).toBe("full");
    expect(resolveRefundState({ chargeStatus: "chargedback" })).toBe("chargeback");
  });

  it("estorno parcial depende do evento: o status continua 'paid'", () => {
    // sem o evento, uma venda parcialmente estornada é indistinguível de uma
    // venda íntegra — por isso o parcial NUNCA pode ser derivado do status
    expect(refundStateFromCharge("paid")).toBe("none");
    expect(refundStateFromEvent("charge.partial_canceled")).toBe("partial");
  });

  it("venda íntegra não vira estorno por evento desconhecido", () => {
    for (const evento of [
      "charge.created",
      "charge.pending",
      "charge.payment_failed",
      "charge.underpaid",
      "subscription.canceled",
      "tipo.que.nao.existe",
      "",
    ]) {
      expect(resolveRefundState({ eventType: evento, chargeStatus: "paid" })).toBe("none");
    }
  });
});

describe("payable negativo — o sinal do histórico", () => {
  it("payable de estorno retém a nota como 'partial', nunca como 'full'", () => {
    // sem evento não dá para saber se o estorno foi total; `partial` retém para
    // decisão humana, `full` descartaria a nota sozinho. Na dúvida, retém.
    expect(refundStateFromPayables(true)).toBe("partial");
    expect(refundStateFromPayables(false)).toBe("none");
  });

  it("não rebaixa um estorno total já detectado", () => {
    expect(mergeRefundState("full", refundStateFromPayables(true))).toBe("full");
    expect(mergeRefundState("chargeback", refundStateFromPayables(true))).toBe("chargeback");
  });
});

describe("mergeRefundState — só escala, nunca rebaixa", () => {
  it("o estado mais forte vence, em qualquer ordem", () => {
    expect(mergeRefundState("partial", "full")).toBe("full");
    expect(mergeRefundState("full", "partial")).toBe("full");
    expect(mergeRefundState("full", "chargeback")).toBe("chargeback");
    expect(mergeRefundState("chargeback", "full")).toBe("chargeback");
  });

  it("nenhuma combinação devolve 'none' quando já há estorno", () => {
    // rebaixar para 'none' liberaria para emissão uma nota já barrada
    for (const estado of ["partial", "full", "chargeback"] as RefundState[]) {
      expect(mergeRefundState(estado, "none")).toBe(estado);
      expect(mergeRefundState("none", estado)).toBe(estado);
    }
  });
});

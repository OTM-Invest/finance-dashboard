import { Link } from "react-router-dom";

import { formatDate } from "@/lib/dates";

import type { CardSpend } from "../api";
import { EmptyState, Money, SpendTable, Tag, Td, Th } from "./ui";

interface Props {
  cards: CardSpend[];
  companyName: (id: string) => string;
}

const usd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });

/** Gasto por cartão (portador), com o que ainda não foi classificado e o que vem pela frente. */
export function CardsSection({ cards, companyName }: Props) {
  if (cards.length === 0) {
    return (
      <EmptyState>
        Nenhuma fatura conferida no período.{" "}
        <Link to="/faturas" className="text-accent hover:underline">
          Importar faturas
        </Link>
      </EmptyState>
    );
  }

  const sorted = [...cards].sort((a, b) => b.outflow - b.inflow - (a.outflow - a.inflow));
  const sum = (f: (c: CardSpend) => number) => sorted.reduce((s, c) => s + f(c), 0);

  return (
    <SpendTable>
      <thead className="bg-surface-2">
        <tr>
          <Th align="left">Cartão</Th>
          <Th align="left">Empresa</Th>
          <Th>Gasto</Th>
          <Th>USD</Th>
          <Th>IOF</Th>
          <Th>A classificar</Th>
          <Th>Parcelas a vencer</Th>
          <Th>Última fatura</Th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((c) => (
          <tr key={c.cardId} className="border-t border-border">
            <Td align="left">
              <div className="font-medium">{c.holderName}</div>
              <div className="text-xs text-text-muted">
                final {c.last4} · {c.kind === "virtual" ? "virtual" : "físico"} · {c.statementCount}{" "}
                fatura{c.statementCount === 1 ? "" : "s"}
              </div>
            </Td>
            <Td align="left" className="text-text-muted">
              {companyName(c.companyId)}
            </Td>
            <Td className="font-semibold">
              <Money value={c.outflow - c.inflow} />
            </Td>
            <Td className="text-text-muted">{c.amountUsd ? usd.format(c.amountUsd) : "—"}</Td>
            <Td>
              <Money value={c.iofAmount || null} muted />
            </Td>
            <Td>
              {Math.abs(c.unconfirmedAmount) >= 0.005 ? (
                <Tag tone="warning">
                  <Money value={c.unconfirmedAmount} />
                </Tag>
              ) : (
                <span className="text-text-subtle">—</span>
              )}
            </Td>
            <Td>
              <Money value={c.futureInstallments || null} muted />
            </Td>
            <Td className="text-text-muted">{formatDate(c.lastClosingDate)}</Td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-border-strong bg-surface-2 font-semibold">
          <Td align="left" colSpan={2}>
            Total
          </Td>
          <Td>
            <Money value={sum((c) => c.outflow - c.inflow)} />
          </Td>
          <Td>{usd.format(sum((c) => c.amountUsd))}</Td>
          <Td>
            <Money value={sum((c) => c.iofAmount)} />
          </Td>
          <Td>
            <Money value={sum((c) => c.unconfirmedAmount)} />
          </Td>
          <Td>
            <Money value={sum((c) => c.futureInstallments)} />
          </Td>
          <Td />
        </tr>
      </tfoot>
    </SpendTable>
  );
}

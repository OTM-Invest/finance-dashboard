import { formatBRL } from "@/lib/format";

import type { Subscription } from "../compute";
import { EmptyState, Money, SpendTable, Tag, Td, Th } from "./ui";

interface Props {
  subscriptions: Subscription[];
  companyName: (id: string) => string;
}

const usd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });

/**
 * Tecnologia como lista de assinaturas: recorrente, em dólar, nova, que subiu — e,
 * principalmente, paga por mais de uma empresa, que é onde mora o contrato duplicado.
 */
export function SubscriptionsSection({ subscriptions, companyName }: Props) {
  if (subscriptions.length === 0) {
    return (
      <EmptyState>
        Nenhum gasto de Tecnologia no período. Compras de cartão só entram aqui depois de
        classificadas (por regra ou confirmadas).
      </EmptyState>
    );
  }

  const duplicated = subscriptions.filter((s) => s.duplicated);
  const total = subscriptions.reduce((s, x) => s + x.total, 0);
  const totalUsd = subscriptions.reduce((s, x) => s + (x.usd ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Fornecedores de tecnologia" value={String(subscriptions.length)} />
        <Stat
          label="Recorrentes"
          value={String(subscriptions.filter((s) => s.recurring && s.active).length)}
        />
        <Stat label="Em dólar no período" value={totalUsd ? usd.format(totalUsd) : "—"} />
        <Stat
          label="Pagas por mais de uma empresa"
          value={String(duplicated.length)}
          hint={
            duplicated.length > 0
              ? formatBRL(duplicated.reduce((s, x) => s + x.total, 0)) + " somadas"
              : undefined
          }
          alert={duplicated.length > 0}
        />
      </div>

      <SpendTable>
        <thead className="bg-surface-2">
          <tr>
            <Th align="left">Fornecedor</Th>
            <Th>Período</Th>
            <Th>Anterior</Th>
            <Th>USD</Th>
            <Th align="left">Empresas</Th>
            <Th align="left">Sinais</Th>
          </tr>
        </thead>
        <tbody>
          {subscriptions.map((s) => (
            <tr key={s.key} className="border-t border-border">
              <Td align="left" className="font-medium">
                {s.name}
              </Td>
              <Td className="font-semibold">
                <Money value={s.total} />
              </Td>
              <Td>
                <Money value={s.previous} muted />
              </Td>
              <Td className="text-text-muted">{s.usd == null ? "—" : usd.format(s.usd)}</Td>
              <Td align="left" className="text-xs text-text-muted">
                {s.companyIds.map(companyName).join(", ")}
              </Td>
              <Td align="left">
                <div className="flex flex-wrap gap-1">
                  {s.duplicated && <Tag tone="expense">duplicada</Tag>}
                  {s.recurring && s.active && <Tag tone="info">recorrente</Tag>}
                  {s.recurring && !s.active && <Tag>parada</Tag>}
                  {s.isNew && <Tag tone="warning">nova</Tag>}
                  {s.rose && <Tag tone="warning">subiu</Tag>}
                  {s.inUsd && <Tag>USD</Tag>}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border-strong bg-surface-2 font-semibold">
            <Td align="left">Total</Td>
            <Td>
              <Money value={total} />
            </Td>
            <Td colSpan={4} />
          </tr>
        </tfoot>
      </SpendTable>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  alert,
}: {
  label: string;
  value: string;
  hint?: string;
  alert?: boolean;
}) {
  return (
    <div
      className={
        alert
          ? "rounded-[var(--radius-md)] border border-expense/30 bg-expense-soft p-3"
          : "rounded-[var(--radius-md)] border border-border bg-surface p-3"
      }
    >
      <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">{label}</div>
      <div className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-text-muted">{hint}</div>}
    </div>
  );
}

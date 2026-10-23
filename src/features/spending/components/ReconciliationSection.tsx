import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { formatMonthYear } from "@/lib/dates";

import type { ReconciliationRow } from "../api";
import { EmptyState, Money, SpendTable, Td, Th } from "./ui";

interface Props {
  rows: ReconciliationRow[];
  companyName: (id: string) => string;
}

/** Abaixo de meio centavo é arredondamento, não dinheiro. */
const EPSILON = 0.005;

/**
 * Camada gerencial × lançamentos, por empresa e mês. A camada reclassifica, nunca cria
 * nem some com dinheiro: o líquido tem que ser o mesmo. O bruto pode diferir — o estorno
 * de uma compra vira entrada na camada e só reduz a saída no lançamento da fatura.
 */
export function ReconciliationSection({ rows, companyName }: Props) {
  if (rows.length === 0) return <EmptyState>Nenhum lançamento no período.</EmptyState>;
  const broken = rows.filter((r) => Math.abs(r.difference) >= EPSILON);

  return (
    <div className="space-y-3">
      {broken.length === 0 ? (
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-income/30 bg-income-soft p-3 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-income" />
          <span>
            A Central fecha com os lançamentos em todos os {rows.length} meses × empresas do
            período.
          </span>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-expense/40 bg-expense-soft p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-expense" />
          <span>
            Em {broken.length} mês(es) × empresa a camada gerencial não fecha com os lançamentos.
            Isso é defeito, não classificação: os números da Central não devem ser usados até ser
            corrigido.
          </span>
        </div>
      )}

      <SpendTable>
        <thead className="bg-surface-2">
          <tr>
            <Th align="left">Mês</Th>
            <Th align="left">Empresa</Th>
            <Th>Lançamentos (líquido)</Th>
            <Th>Central (líquido)</Th>
            <Th>Diferença</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const bad = Math.abs(r.difference) >= EPSILON;
            return (
              <tr
                key={`${r.month}-${r.companyId}`}
                className={
                  bad ? "border-t border-border bg-expense-soft" : "border-t border-border"
                }
              >
                <Td align="left" className="capitalize">
                  {formatMonthYear(r.month)}
                </Td>
                <Td align="left" className="text-text-muted">
                  {companyName(r.companyId)}
                </Td>
                <Td>
                  <Money value={r.ledgerInflow - r.ledgerOutflow} />
                </Td>
                <Td>
                  <Money value={r.layerInflow - r.layerOutflow} />
                </Td>
                <Td className={bad ? "font-semibold text-expense" : "text-text-subtle"}>
                  {bad ? <Money value={r.difference} /> : "0"}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </SpendTable>
    </div>
  );
}

/**
 * Leitura da receita conferida: por área, por item (produto) e por assessor. Só o que já
 * está no Balanço — statement `reconciled` — e nada além: as três tabelas somam o mesmo
 * total.
 */
import { EmptyState, Money, SpendTable, Tag, Td, Th } from "@/features/spending/components/ui";
import { formatPercent } from "@/lib/format";

import type { AdvisorRevenue, RevenueSlice, RevenueTotals } from "../compute";

function Share({ value }: { value: number | null }) {
  return <span className="text-text-muted">{value == null ? "—" : formatPercent(value)}</span>;
}

export function RevenueSummary({ totals }: { totals: RevenueTotals }) {
  const cards = [
    { label: "Receita líquida aberta", value: <Money value={totals.total} />, strong: true },
    {
      label: "Com área",
      value: totals.coverage == null ? "—" : formatPercent(totals.coverage),
      strong: false,
    },
    { label: "Sem área", value: <Money value={totals.withoutArea} />, strong: false },
    {
      label: "Diferença relatório × nota",
      value: <Money value={totals.difference} />,
      strong: false,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3"
        >
          <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
            {c.label}
          </div>
          <div
            className={
              c.strong
                ? "mt-1 font-display text-2xl font-semibold tabular-nums"
                : "mt-1 text-lg font-medium tabular-nums"
            }
          >
            {c.value}
          </div>
        </div>
      ))}
      {totals.bucket !== 0 && (
        <p className="col-span-full text-xs text-text-muted">
          <Money value={totals.bucket} /> do “sem área” veio do BTG sem código de assessor, ou com
          um código que não existe no CRM.
        </p>
      )}
    </div>
  );
}

interface SliceProps {
  slices: RevenueSlice[];
  label: string;
  nameOf: (key: string | null) => string;
}

export function SliceTable({ slices, label, nameOf }: SliceProps) {
  if (slices.length === 0) {
    return (
      <EmptyState>
        Nenhuma receita do BTG aberta no período. Abra os lançamentos na aba Conferência.
      </EmptyState>
    );
  }
  return (
    <SpendTable>
      <thead className="bg-surface-2">
        <tr>
          <Th align="left">{label}</Th>
          <Th>Receita</Th>
          <Th>% do total</Th>
        </tr>
      </thead>
      <tbody>
        {slices.map((s) => (
          <tr key={s.key ?? "none"} className="border-t border-border">
            <Td align="left" className={s.key ? "font-medium" : "text-text-muted italic"}>
              {nameOf(s.key)}
            </Td>
            <Td className="font-semibold">
              <Money value={s.amount} />
            </Td>
            <Td>
              <Share value={s.share} />
            </Td>
          </tr>
        ))}
      </tbody>
    </SpendTable>
  );
}

export function AdvisorTable({
  advisors,
  areaName,
}: {
  advisors: AdvisorRevenue[];
  areaName: (id: string | null) => string;
}) {
  if (advisors.length === 0) {
    return <EmptyState>Nenhuma receita do BTG aberta no período.</EmptyState>;
  }
  const total = advisors.reduce((s, a) => s + a.amount, 0);
  return (
    <SpendTable>
      <thead className="bg-surface-2">
        <tr>
          <Th align="left">Código</Th>
          <Th align="left">Assessor (CRM)</Th>
          <Th align="left">Colaborador</Th>
          <Th align="left">Área</Th>
          <Th>Receita</Th>
          <Th>% do total</Th>
        </tr>
      </thead>
      <tbody>
        {advisors.map((a) => (
          <tr key={a.advisorCode} className="border-t border-border">
            <Td align="left" className="font-mono text-xs">
              {a.advisorCode}
            </Td>
            <Td align="left">
              {a.advisorName ?? "—"} {a.isBucket && <Tag tone="warning">sem assessor</Tag>}
            </Td>
            <Td align="left" className={a.employeeName ? "" : "text-text-muted italic"}>
              {a.employeeName ?? "sem colaborador"}
            </Td>
            <Td align="left" className={a.areaId ? "" : "text-text-muted italic"}>
              {areaName(a.areaId)}
            </Td>
            <Td className="font-semibold">
              <Money value={a.amount} />
            </Td>
            <Td>
              <Share value={Math.abs(total) < 0.005 ? null : a.amount / total} />
            </Td>
          </tr>
        ))}
      </tbody>
    </SpendTable>
  );
}

/**
 * Peças visuais repetidas nas seções da Central: tabela, variação e estado vazio.
 */
import type * as React from "react";

import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/format";

export function SpendTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border bg-surface">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = "right",
  className,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      className={cn(
        "text-2xs px-3 py-2.5 font-medium tracking-wide whitespace-nowrap text-text-subtle uppercase",
        align === "left" ? "text-left" : "text-right",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "right",
  className,
  colSpan,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "px-3 py-2",
        align === "left" ? "text-left" : "text-right tabular-nums",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Money({ value, muted }: { value: number | null; muted?: boolean }) {
  return <span className={cn(muted && "text-text-muted")}>{formatBRL(value)}</span>;
}

/**
 * Variação de gasto. Gasto que sobe é o sinal de alerta — vermelho; que cai, verde. O
 * inverso da convenção de receita, de propósito.
 */
export function SpendDelta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-text-subtle">—</span>;
  const tone =
    Math.abs(value) < 0.05 ? "text-text-muted" : value > 0 ? "text-expense" : "text-income";
  const sign = value > 0 ? "+" : "";
  return (
    <span className={cn("font-medium", tone)}>
      {sign}
      {value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
    </span>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface p-10 text-center text-sm text-text-muted">
      {children}
    </div>
  );
}

export function Tag({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warning" | "info" | "expense";
}) {
  return (
    <span
      className={cn(
        "text-2xs inline-flex items-center rounded-full px-1.5 py-0.5 font-medium whitespace-nowrap",
        tone === "neutral" && "bg-surface-2 text-text-muted",
        tone === "warning" && "bg-warning-soft text-warning",
        tone === "info" && "bg-info-soft text-info",
        tone === "expense" && "bg-expense-soft text-expense",
      )}
    >
      {children}
    </span>
  );
}

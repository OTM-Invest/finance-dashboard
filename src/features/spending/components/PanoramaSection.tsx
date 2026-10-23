import * as React from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/cn";

import type { PanoramaGroup } from "../compute";
import { EmptyState, Money, SpendDelta, SpendTable, Td, Th } from "./ui";

/**
 * Grupo → item do plano gerencial. O grupo abre para mostrar os itens; o que mais pesa
 * vem com a barra de participação, para a hierarquia aparecer sem ler número.
 */
export function PanoramaSection({ groups }: { groups: PanoramaGroup[] }) {
  const [open, setOpen] = React.useState<Set<string>>(new Set());

  if (groups.length === 0) {
    return <EmptyState>Nenhum gasto no período.</EmptyState>;
  }

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <SpendTable>
      <thead className="bg-surface-2">
        <tr>
          <Th align="left">Plano gerencial</Th>
          <Th>Período</Th>
          <Th>Anterior</Th>
          <Th>Variação</Th>
          <Th>Média mensal 12m</Th>
          <Th className="w-40">Participação</Th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => {
          const expanded = open.has(g.id);
          return (
            <React.Fragment key={g.id}>
              <tr className="border-t border-border hover:bg-surface-2/50">
                <Td align="left">
                  <button
                    type="button"
                    onClick={() => toggle(g.id)}
                    aria-expanded={expanded}
                    className="inline-flex items-center gap-1.5 font-semibold focus-visible:text-accent"
                  >
                    <ChevronRight
                      className={cn("size-3.5 transition-transform", expanded && "rotate-90")}
                    />
                    {g.name}
                  </button>
                </Td>
                <Td className="font-semibold">
                  <Money value={g.current} />
                </Td>
                <Td>
                  <Money value={g.previous} muted />
                </Td>
                <Td>
                  <SpendDelta value={g.deltaPct} />
                </Td>
                <Td>
                  <Money value={g.monthlyAvg12} muted />
                </Td>
                <Td>
                  <ShareBar value={g.sharePct} />
                </Td>
              </tr>
              {expanded &&
                g.items.map((i) => (
                  <tr key={i.id} className="border-t border-border/60 text-text-muted">
                    <Td align="left" className="pl-9">
                      {i.name}
                    </Td>
                    <Td className="text-text">
                      <Money value={i.current} />
                    </Td>
                    <Td>
                      <Money value={i.previous} muted />
                    </Td>
                    <Td>
                      <SpendDelta value={i.deltaPct} />
                    </Td>
                    <Td>
                      <Money value={i.monthlyAvg12} muted />
                    </Td>
                    <Td>
                      <ShareBar value={i.sharePct} subtle />
                    </Td>
                  </tr>
                ))}
            </React.Fragment>
          );
        })}
      </tbody>
    </SpendTable>
  );
}

function ShareBar({ value, subtle }: { value: number | null; subtle?: boolean }) {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div
          className={cn("h-full rounded-full", subtle ? "bg-accent/40" : "bg-accent")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-12 text-xs">
        {value == null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
      </span>
    </div>
  );
}

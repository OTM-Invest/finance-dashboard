import type { AreaSpend } from "../compute";
import { EmptyState, Money, SpendTable, Td, Th } from "./ui";

interface Props {
  areas: AreaSpend[];
  areaName: (id: string | null) => string;
  groupName: (id: string | null) => string;
}

/** Quanto custa cada time, todas as naturezas, e no que ele mais gasta. */
export function AreaSection({ areas, areaName, groupName }: Props) {
  if (areas.length === 0) return <EmptyState>Nenhum gasto no período.</EmptyState>;
  const total = areas.reduce((s, a) => s + a.total, 0);

  return (
    <SpendTable>
      <thead className="bg-surface-2">
        <tr>
          <Th align="left">Área</Th>
          <Th>Total</Th>
          <Th>Opex</Th>
          <Th>Capex</Th>
          <Th>% do gasto</Th>
          <Th align="left">Onde mais gasta</Th>
        </tr>
      </thead>
      <tbody>
        {areas.map((a) => (
          <tr key={a.areaId ?? "none"} className="border-t border-border">
            <Td align="left" className={a.areaId ? "font-medium" : "text-text-muted italic"}>
              {areaName(a.areaId)}
            </Td>
            <Td className="font-semibold">
              <Money value={a.total} />
            </Td>
            <Td>
              <Money value={a.opex} muted />
            </Td>
            <Td>
              <Money value={a.capex} muted />
            </Td>
            <Td className="text-text-muted">
              {total === 0
                ? "—"
                : `${((a.total / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
            </Td>
            <Td align="left" className="text-xs text-text-muted">
              {a.byGroup
                .slice(0, 3)
                .map((g) => groupName(g.groupId))
                .join(" · ")}
            </Td>
          </tr>
        ))}
      </tbody>
    </SpendTable>
  );
}

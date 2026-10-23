/**
 * As compras da fatura, com o que cada uma é (item gerencial) e para quem (área).
 *
 * Classificar é o que tira o valor de "Fatura de cartão" e põe no item certo. Sem
 * classificação a compra continua somando como fatura — por isso o total da tela nunca
 * muda ao classificar, só a distribuição.
 */
import { Check, Sparkles, Wand2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CostCenterSelect } from "@/features/cost-centers/CostCenterSelect";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

import type { CardStatementLineRow } from "../api";

export interface ItemOptionGroup {
  id: string;
  name: string;
  items: { id: string; name: string }[];
}

interface Props {
  lines: CardStatementLineRow[];
  groups: ItemOptionGroup[];
  canEdit: boolean;
  onClassify: (
    line: CardStatementLineRow,
    change: { managementAccountId?: string | null; costCenterId?: string | null },
  ) => void;
  onAccept: (line: CardStatementLineRow) => void;
  onCreateRule: (line: CardStatementLineRow) => void;
}

const NONE = "__none__";

function lineTotal(line: CardStatementLineRow): number {
  const gross = line.amount + line.iof_amount;
  return line.line_kind === "refund" ? -gross : gross;
}

export function StatementLinesTable({
  lines,
  groups,
  canEdit,
  onClassify,
  onAccept,
  onCreateRule,
}: Props) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
      <table className="w-full min-w-[940px] text-sm">
        <thead className="bg-surface-2/60">
          <tr className="text-2xs border-b border-border tracking-wide text-text-subtle uppercase">
            <th className="w-20 px-3 py-2.5 text-left font-medium">Data</th>
            <th className="px-3 py-2.5 text-left font-medium">Compra</th>
            <th className="w-28 px-3 py-2.5 text-right font-medium">Valor</th>
            <th className="w-[260px] px-3 py-2.5 text-left font-medium">Item gerencial</th>
            <th className="w-[180px] px-3 py-2.5 text-left font-medium">Área</th>
            <th className="w-12 px-2 py-2.5">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr
              key={line.id}
              className={cn(
                "border-b border-border last:border-0",
                line.classification_status !== "confirmed" && "bg-warning-soft/20",
              )}
            >
              <td className="px-3 py-2 font-mono text-xs text-text-muted">
                {formatDate(line.purchase_date, "dd/MM/yy")}
              </td>
              <td className="px-3 py-2">
                <div className="truncate font-medium" title={line.description}>
                  {line.description}
                </div>
                <div className="text-2xs mt-0.5 flex flex-wrap items-center gap-1.5 text-text-muted">
                  {line.card && <span>final {line.card.last4}</span>}
                  {line.installment_n && (
                    <Badge tone="default">
                      parcela {line.installment_n}/{line.installment_total}
                    </Badge>
                  )}
                  {line.currency !== "BRL" && line.amount_original != null && (
                    <span className="font-mono">
                      {line.currency} {line.amount_original.toFixed(2)} · IOF{" "}
                      {formatBRL(line.iof_amount)}
                    </span>
                  )}
                  {line.line_kind === "refund" && <Badge tone="income">estorno</Badge>}
                  {line.classification_source === "rule" && <Badge tone="default">regra</Badge>}
                </div>
                {line.classification_status === "suggested" && (
                  <div className="text-2xs mt-1 flex items-center gap-1.5 text-accent">
                    <Sparkles className="size-3 shrink-0" />
                    <span>
                      Sugestão da IA
                      {line.ai_confidence != null &&
                        ` · ${Math.round(line.ai_confidence * 100)}% de confiança`}
                      {line.suggestion_reason && ` — ${line.suggestion_reason}`}
                    </span>
                  </div>
                )}
              </td>
              <td
                className={cn(
                  "px-3 py-2 text-right font-mono tabular-nums",
                  line.line_kind === "refund" && "text-income",
                )}
              >
                {formatBRL(lineTotal(line))}
              </td>
              <td className="px-3 py-1.5">
                <Select
                  value={line.management_account_id ?? NONE}
                  onValueChange={(v) =>
                    onClassify(line, { managementAccountId: v === NONE ? null : v })
                  }
                  disabled={!canEdit}
                >
                  <SelectTrigger aria-label={`Item gerencial de ${line.description}`}>
                    <SelectValue placeholder="A classificar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— A classificar (fica em Fatura de cartão)</SelectItem>
                    {groups.map((group) => (
                      <SelectGroup key={group.id}>
                        <SelectLabel>{group.name}</SelectLabel>
                        {group.items.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {group.name} · {item.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </td>
              <td className="px-3 py-1.5">
                {canEdit ? (
                  <CostCenterSelect
                    value={line.cost_center_id}
                    onChange={(id) => onClassify(line, { costCenterId: id })}
                  />
                ) : (
                  <span className="text-xs text-text-muted">—</span>
                )}
              </td>
              <td className="px-2 py-1.5 text-right">
                {canEdit && line.classification_status === "suggested" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Aceitar sugestão para ${line.description}`}
                    title="Aceitar sugestão"
                    onClick={() => onAccept(line)}
                  >
                    <Check className="size-3.5" />
                  </Button>
                )}
                {canEdit &&
                  line.classification_status === "confirmed" &&
                  line.classification_source !== "rule" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Criar regra a partir de ${line.description}`}
                      title="Criar regra para as próximas"
                      onClick={() => onCreateRule(line)}
                    >
                      <Wand2 className="size-3.5" />
                    </Button>
                  )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

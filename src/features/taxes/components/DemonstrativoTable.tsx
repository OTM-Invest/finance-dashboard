import * as React from "react";
import { ChevronRight, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { formatBRL, formatPercent } from "@/lib/format";

import type { ComputedLine, LineKind } from "../apuracao";
import { LINE_KIND_META, PRESUMPTION_CLASS_META } from "../constants";

/**
 * O demonstrativo da base de cálculo, linha por linha — o que a planilha da JCE faz à
 * mão com 100 NF-e digitadas.
 *
 * Colapsa por seção de propósito: um trimestre real tem mais de cem documentos, e uma
 * tabela de 105 linhas abertas esconde o total em vez de mostrá-lo. Abre-se a seção
 * quando se quer conferir a origem de um número.
 */

/** Acima disso a seção nasce fechada — o total importa mais que as cem linhas. */
const MAX_PREVIEW = 8;

interface Props {
  lines: ComputedLine[];
  onEditManual?: (line: ComputedLine) => void;
  onRemoveManual?: (line: ComputedLine) => void;
}

export function DemonstrativoTable({ lines, onEditManual, onRemoveManual }: Props) {
  const groups = React.useMemo(() => {
    const byKind = new Map<LineKind, ComputedLine[]>();
    for (const line of lines) {
      const bucket = byKind.get(line.line_kind);
      if (bucket) bucket.push(line);
      else byKind.set(line.line_kind, [line]);
    }
    return [...byKind.entries()].sort(
      (a, b) => LINE_KIND_META[a[0]].order - LINE_KIND_META[b[0]].order,
    );
  }, [lines]);

  if (groups.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-border p-8 text-center text-sm text-text-muted">
        Nenhum lançamento no período. Confira a competência e se a receita já foi lançada.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {groups.map(([kind, groupLines]) => (
        <Section
          key={kind}
          kind={kind}
          lines={groupLines}
          onEditManual={onEditManual}
          onRemoveManual={onRemoveManual}
        />
      ))}
    </div>
  );
}

function Section({
  kind,
  lines,
  onEditManual,
  onRemoveManual,
}: {
  kind: LineKind;
  lines: ComputedLine[];
  onEditManual?: (line: ComputedLine) => void;
  onRemoveManual?: (line: ComputedLine) => void;
}) {
  const [open, setOpen] = React.useState(lines.length <= MAX_PREVIEW);
  const meta = LINE_KIND_META[kind];
  const isBase = kind === "revenue" || kind === "revenue_return";

  const total = lines.reduce((acc, l) => acc + l.amount, 0);
  const totalBase = lines.reduce((acc, l) => acc + l.base_amount, 0);

  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 bg-surface-2 px-3 py-2 text-left transition-colors hover:bg-surface-2/60"
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-text-subtle transition-transform",
            open && "rotate-90",
          )}
        />
        <span className="text-2xs font-semibold tracking-wide text-text-subtle uppercase">
          {meta.label}
        </span>
        <span className="text-2xs text-text-subtle">
          {lines.length} {lines.length === 1 ? "linha" : "linhas"}
        </span>
        <span className="ml-auto flex items-baseline gap-4">
          <span className="font-mono text-xs text-text-muted">{formatBRL(total)}</span>
          {isBase && (
            <span className="font-mono text-sm font-semibold">{formatBRL(totalBase)}</span>
          )}
        </span>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-2xs border-b border-border font-medium tracking-wide text-text-subtle uppercase">
                <th className="px-3 py-2 text-left">Documento</th>
                <th className="px-3 py-2 text-left">Data</th>
                {isBase && <th className="px-3 py-2 text-left">Classe</th>}
                <th className="px-3 py-2 text-right">Valor contábil</th>
                {isBase && <th className="px-3 py-2 text-right">Presunção</th>}
                {isBase && <th className="px-3 py-2 text-right">Base</th>}
                <th className="w-20 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {lines.map((line, i) => (
                <tr key={line.id ?? `${line.line_kind}-${i}`} className="hover:bg-surface-2/40">
                  <td className="max-w-[22rem] px-3 py-1.5">
                    <span className="block truncate">{line.description}</span>
                    {/* em receita, o "digitado" é o que distingue do que veio de lançamento */}
                    {line.is_manual && isBase && (
                      <span className="text-2xs block text-text-subtle">digitado à mão</span>
                    )}
                    {line.document_ref && line.document_ref !== line.description && (
                      <span className="text-2xs block truncate text-text-subtle">
                        {line.document_ref}
                      </span>
                    )}
                    {line.payee && (
                      <span className="text-2xs block truncate text-text-subtle">{line.payee}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap text-text-muted">
                    {line.reference_date ? formatDate(line.reference_date) : "—"}
                  </td>
                  {isBase && (
                    <td className="px-3 py-1.5 text-xs text-text-muted">
                      {line.presumption_class
                        ? PRESUMPTION_CLASS_META[line.presumption_class].label
                        : "—"}
                    </td>
                  )}
                  <td
                    className={cn(
                      "px-3 py-1.5 text-right font-mono text-xs",
                      line.amount < 0 && "text-expense",
                    )}
                  >
                    {formatBRL(line.amount)}
                  </td>
                  {isBase && (
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-text-muted">
                      {line.presumption_rate == null ? "—" : formatPercent(line.presumption_rate)}
                    </td>
                  )}
                  {isBase && (
                    <td className="px-3 py-1.5 text-right font-mono text-xs">
                      {formatBRL(line.base_amount)}
                    </td>
                  )}
                  <td className="px-3 py-1.5 text-right">
                    {line.is_manual ? (
                      <div className="flex items-center justify-end gap-0.5">
                        {onEditManual && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6"
                            aria-label="Editar linha"
                            onClick={() => onEditManual(line)}
                          >
                            <Pencil className="size-3" />
                          </Button>
                        )}
                        {onRemoveManual && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 text-expense hover:bg-expense-soft hover:text-expense"
                            aria-label="Remover linha"
                            onClick={() => onRemoveManual(line)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        )}
                      </div>
                    ) : (
                      // Linha colhida do lançamento é rastreável até a origem; não se
                      // edita aqui, edita-se o lançamento.
                      <Badge tone="default" className="text-2xs">
                        auto
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

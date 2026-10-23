/**
 * Painel de edição do modelo: a lista ordenada de linhas, com os avisos que não
 * impedem o relatório de rodar mas mudam o número (duas linhas somando o mesmo
 * lançamento, fórmula quebrada, item ou área que não existe mais).
 */
import * as React from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import { analyzeModel, type MonthlySeriesRow } from "../compute";
import { LINE_KIND_LABELS, MEASURE_LABELS, type BalanceLine } from "../schema";
import { BalanceLineEditor } from "./BalanceLineEditor";
import { describeFilterLine, knownReferenceIds, type BalanceOptions } from "./options";

interface Props {
  lines: BalanceLine[];
  /** Série do período — é nela que se vê se duas linhas somam o mesmo lançamento. */
  series: readonly MonthlySeriesRow[];
  options: BalanceOptions;
  onChange: (lines: BalanceLine[]) => void;
}

/** Resumo legível da definição da linha, para não precisar abrir o editor. */
function describeLine(
  line: BalanceLine,
  lines: readonly BalanceLine[],
  options: BalanceOptions,
): string {
  const labelOf = (id: string) => lines.find((l) => l.id === id)?.label ?? "?";

  if (line.kind === "filter") {
    return `${MEASURE_LABELS[line.measure]} · ${describeFilterLine(line, options)}`;
  }
  if (line.kind === "formula") {
    if (line.terms.length === 0) return "Sem parcelas";
    return line.terms
      .map((term, i) => {
        const sign = term.sign === 1 ? (i === 0 ? "" : "+ ") : "− ";
        return `${sign}${labelOf(term.lineId)}`;
      })
      .join(" ");
  }
  return `${labelOf(line.numeratorLineId)} ÷ ${labelOf(line.denominatorLineId)}`;
}

function move(lines: BalanceLine[], index: number, delta: number): BalanceLine[] {
  const target = index + delta;
  if (target < 0 || target >= lines.length) return lines;
  const next = [...lines];
  const [moved] = next.splice(index, 1);
  if (moved) next.splice(target, 0, moved);
  return next;
}

export function BalanceModelPanel({ lines, series, options, onChange }: Props) {
  const [editing, setEditing] = React.useState<BalanceLine | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);

  const issues = React.useMemo(
    () => analyzeModel(lines, series, knownReferenceIds(options)),
    [lines, series, options],
  );

  const labelOfLine = (id: string) => lines.find((l) => l.id === id)?.label ?? id;

  const openEditor = (line: BalanceLine | null) => {
    setEditing(line);
    setEditorOpen(true);
  };

  const upsert = (line: BalanceLine) => {
    const exists = lines.some((l) => l.id === line.id);
    onChange(exists ? lines.map((l) => (l.id === line.id ? line : l)) : [...lines, line]);
  };

  const remove = (lineId: string) => {
    onChange(lines.filter((l) => l.id !== lineId));
  };

  return (
    <div className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Linhas do relatório</h3>
          <p className="text-2xs mt-0.5 text-text-muted">
            A ordem aqui é a ordem das linhas na matriz.
          </p>
        </div>
        <Button size="sm" onClick={() => openEditor(null)}>
          <Plus className="size-3.5" /> Nova linha
        </Button>
      </div>

      {(issues.overlappingLineIds.length > 0 ||
        issues.brokenLineIds.length > 0 ||
        issues.unknownReferenceLineIds.length > 0) && (
        <div className="space-y-1 rounded-[var(--radius-md)] border border-expense/40 bg-expense/5 p-3">
          {issues.overlappingLineIds.length > 0 && (
            <p className="text-2xs flex items-start gap-1.5 text-expense">
              <AlertTriangle className="mt-px size-3 shrink-0" />
              Estas linhas somam os mesmos lançamentos, que entram duas vezes no total:{" "}
              {issues.overlappingLineIds.map(labelOfLine).join(", ")}.
            </p>
          )}
          {issues.unknownReferenceLineIds.length > 0 && (
            <p className="text-2xs flex items-start gap-1.5 text-expense">
              <AlertTriangle className="mt-px size-3 shrink-0" />
              Item gerencial ou área que não existe mais:{" "}
              {issues.unknownReferenceLineIds.map(labelOfLine).join(", ")} — a linha ignora esse
              trecho.
            </p>
          )}
          {issues.brokenLineIds.length > 0 && (
            <p className="text-2xs flex items-start gap-1.5 text-expense">
              <AlertTriangle className="mt-px size-3 shrink-0" />
              Cálculo circular ou apontando para linha inexistente:{" "}
              {issues.brokenLineIds
                .map((id) => lines.find((l) => l.id === id)?.label ?? id)
                .join(", ")}
              .
            </p>
          )}
        </div>
      )}

      {lines.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">Nenhuma linha ainda.</p>
      ) : (
        <ul className="divide-y divide-border">
          {lines.map((line, index) => (
            <li key={line.id} className="flex items-center gap-3 py-2">
              <div className="flex flex-col">
                <button
                  type="button"
                  aria-label={`Mover ${line.label} para cima`}
                  disabled={index === 0}
                  className="text-text-subtle hover:text-text disabled:opacity-30"
                  onClick={() => onChange(move(lines, index, -1))}
                >
                  <ArrowUp className="size-3" />
                </button>
                <button
                  type="button"
                  aria-label={`Mover ${line.label} para baixo`}
                  disabled={index === lines.length - 1}
                  className="text-text-subtle hover:text-text disabled:opacity-30"
                  onClick={() => onChange(move(lines, index, 1))}
                >
                  <ArrowDown className="size-3" />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={cn("truncate text-sm", line.emphasis && "font-semibold")}>
                    {line.label}
                  </span>
                  <Badge tone="default">{LINE_KIND_LABELS[line.kind]}</Badge>
                </div>
                <p className="text-2xs truncate text-text-muted">
                  {describeLine(line, lines, options)}
                </p>
              </div>

              <Button
                variant="ghost"
                size="sm"
                aria-label={`Editar ${line.label}`}
                onClick={() => openEditor(line)}
              >
                <Pencil className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <BalanceLineEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        line={editing}
        otherLines={lines.filter((l) => l.id !== editing?.id)}
        options={options}
        onSubmit={upsert}
        onDelete={remove}
      />
    </div>
  );
}

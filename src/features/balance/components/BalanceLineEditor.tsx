/**
 * Editor de uma linha do balanço.
 *
 * O formulário troca de forma conforme o tipo da linha (união discriminada), por
 * isso o estado é local e explícito em vez de react-hook-form: o schema Zod entra
 * só na validação do submit, que é onde ele agrega valor aqui.
 */
import * as React from "react";
import { Minus, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import {
  BALANCE_MEASURES,
  balanceLineSchema,
  emptyClause,
  LINE_KIND_LABELS,
  MEASURE_HINTS,
  MEASURE_LABELS,
  newLineId,
  type BalanceClause,
  type BalanceLine,
  type BalanceMeasure,
  type FormulaTerm,
} from "../schema";
import { FilterClausesEditor } from "./FilterClausesEditor";
import type { BalanceOptions } from "./options";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = criando uma linha nova. */
  line: BalanceLine | null;
  /** Demais linhas do modelo — as que uma fórmula ou percentual pode referenciar. */
  otherLines: BalanceLine[];
  options: BalanceOptions;
  onSubmit: (line: BalanceLine) => void;
  onDelete?: (lineId: string) => void;
}

interface Draft {
  id: string;
  label: string;
  emphasis: boolean;
  kind: BalanceLine["kind"];
  measure: BalanceMeasure;
  clauses: BalanceClause[];
  terms: FormulaTerm[];
  numeratorLineId: string;
  denominatorLineId: string;
}

function toDraft(line: BalanceLine | null, fallbackRefId: string): Draft {
  const base = {
    id: line?.id ?? newLineId(),
    label: line?.label ?? "",
    emphasis: line?.emphasis ?? false,
    measure: "net" as BalanceMeasure,
    clauses: [emptyClause()],
    terms: [] as FormulaTerm[],
    numeratorLineId: fallbackRefId,
    denominatorLineId: fallbackRefId,
  };
  if (!line) return { ...base, kind: "filter" };
  if (line.kind === "filter") {
    return {
      ...base,
      kind: "filter",
      measure: line.measure,
      clauses: line.clauses.map((c) => ({ ...c })),
    };
  }
  if (line.kind === "formula") {
    return { ...base, kind: "formula", terms: line.terms.map((t) => ({ ...t })) };
  }
  return {
    ...base,
    kind: "ratio",
    numeratorLineId: line.numeratorLineId,
    denominatorLineId: line.denominatorLineId,
  };
}

function fromDraft(draft: Draft): BalanceLine {
  const base = { id: draft.id, label: draft.label.trim(), emphasis: draft.emphasis };
  if (draft.kind === "filter") {
    return { ...base, kind: "filter", measure: draft.measure, clauses: draft.clauses };
  }
  if (draft.kind === "formula") {
    return { ...base, kind: "formula", terms: draft.terms };
  }
  return {
    ...base,
    kind: "ratio",
    numeratorLineId: draft.numeratorLineId,
    denominatorLineId: draft.denominatorLineId,
  };
}

export function BalanceLineEditor({
  open,
  onOpenChange,
  line,
  otherLines,
  options,
  onSubmit,
  onDelete,
}: Props) {
  const fallbackRefId = otherLines[0]?.id ?? "";
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(line, fallbackRefId));
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setDraft(toDraft(line, fallbackRefId));
      setError(null);
    }
  }, [open, line, fallbackRefId]);

  const patch = (values: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...values }));
  };

  const needsOtherLines = draft.kind === "formula" || draft.kind === "ratio";
  const hasOtherLines = otherLines.length > 0;

  const submit = () => {
    const candidate = fromDraft(draft);
    const parsed = balanceLineSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Confira os campos da linha.");
      return;
    }
    if (parsed.data.kind === "filter" && parsed.data.clauses.length === 0) {
      setError("Uma linha precisa de ao menos uma condição.");
      return;
    }
    if (parsed.data.kind === "formula" && parsed.data.terms.length === 0) {
      setError("Uma fórmula precisa de ao menos uma parcela.");
      return;
    }
    onSubmit(parsed.data);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="sm" className="flex flex-col p-0">
        <SheetHeader>
          <SheetTitle>{line ? "Editar linha" : "Nova linha"}</SheetTitle>
          <SheetDescription>
            Uma linha soma itens do plano gerencial (por área e natureza), combina outras linhas ou
            divide duas delas.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="line-label">Nome</Label>
            <Input
              id="line-label"
              placeholder="Ebitda"
              value={draft.label}
              onChange={(e) => patch({ label: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="line-kind">Tipo</Label>
            <Select
              value={draft.kind}
              onValueChange={(v) => patch({ kind: v as BalanceLine["kind"] })}
            >
              <SelectTrigger id="line-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(LINE_KIND_LABELS) as [BalanceLine["kind"], string][]).map(
                  ([value, label]) => (
                    <SelectItem
                      key={value}
                      value={value}
                      disabled={value !== "filter" && !hasOtherLines}
                    >
                      {label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            {needsOtherLines && !hasOtherLines && (
              <p className="text-2xs text-text-muted">
                Crie ao menos uma linha do plano gerencial antes de montar cálculos.
              </p>
            )}
          </div>

          {draft.kind === "filter" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="line-measure">O que somar</Label>
                <Select
                  value={draft.measure}
                  onValueChange={(v) => patch({ measure: v as BalanceMeasure })}
                >
                  <SelectTrigger id="line-measure">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BALANCE_MEASURES.map((measure) => (
                      <SelectItem key={measure} value={measure}>
                        {MEASURE_LABELS[measure]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-2xs text-text-muted">{MEASURE_HINTS[draft.measure]}</p>
              </div>

              <FilterClausesEditor
                clauses={draft.clauses}
                options={options}
                onChange={(clauses) => patch({ clauses })}
              />
            </>
          )}

          {draft.kind === "formula" && hasOtherLines && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Parcelas</legend>
              <p className="text-2xs text-text-muted">
                Ex.: Ebitda = <span className="font-mono">+</span> Receita{" "}
                <span className="font-mono">−</span> Assessores <span className="font-mono">−</span>{" "}
                Opex.
              </p>
              <div className="space-y-2">
                {draft.terms.map((term, index) => (
                  <div key={`${term.lineId}-${index}`} className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={term.sign === 1 ? "Somar esta parcela" : "Subtrair esta parcela"}
                      onClick={() =>
                        patch({
                          terms: draft.terms.map((t, i) =>
                            i === index ? { ...t, sign: t.sign === 1 ? -1 : 1 } : t,
                          ),
                        })
                      }
                    >
                      {term.sign === 1 ? (
                        <Plus className="size-3.5" />
                      ) : (
                        <Minus className="size-3.5" />
                      )}
                    </Button>
                    <Select
                      value={term.lineId}
                      onValueChange={(v) =>
                        patch({
                          terms: draft.terms.map((t, i) => (i === index ? { ...t, lineId: v } : t)),
                        })
                      }
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {otherLines.map((other) => (
                          <SelectItem key={other.id} value={other.id}>
                            {other.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label="Remover parcela"
                      onClick={() => patch({ terms: draft.terms.filter((_, i) => i !== index) })}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  patch({
                    terms: [...draft.terms, { lineId: otherLines[0]?.id ?? "", sign: 1 }],
                  })
                }
              >
                <Plus className="size-3.5" /> Adicionar parcela
              </Button>
            </fieldset>
          )}

          {draft.kind === "ratio" && hasOtherLines && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="line-num">Numerador</Label>
                <Select
                  value={draft.numeratorLineId}
                  onValueChange={(v) => patch({ numeratorLineId: v })}
                >
                  <SelectTrigger id="line-num">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {otherLines.map((other) => (
                      <SelectItem key={other.id} value={other.id}>
                        {other.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="line-den">Denominador</Label>
                <Select
                  value={draft.denominatorLineId}
                  onValueChange={(v) => patch({ denominatorLineId: v })}
                >
                  <SelectTrigger id="line-den">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {otherLines.map((other) => (
                      <SelectItem key={other.id} value={other.id}>
                        {other.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={draft.emphasis}
              onCheckedChange={(next) => patch({ emphasis: next === true })}
            />
            Destacar na matriz (Ebitda, Lucro Líquido)
          </label>

          {error && <p className="text-2xs text-expense">{error}</p>}
        </SheetBody>

        <SheetFooter>
          {line && onDelete && (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto text-expense"
              onClick={() => {
                onDelete(line.id);
                onOpenChange(false);
              }}
            >
              <Trash2 className="size-4" /> Remover
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={submit}>
            {line ? "Salvar linha" : "Adicionar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

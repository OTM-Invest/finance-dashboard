/**
 * Criar uma regra a partir de uma compra já classificada: "da próxima vez, faça igual".
 *
 * A regra vale para as faturas que vierem e é reaplicada já nesta — compras ainda a
 * classificar ou só sugeridas pela IA que casarem com ela passam a contar no item.
 * Decisão de pessoa nunca é sobrescrita.
 */
import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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

import { proposeRulePattern, type CardStatementLineRow } from "../api";
import { useApplyClassificationRules, useCreateClassificationRule } from "../hooks";

interface Props {
  line: CardStatementLineRow | null;
  statementId: string;
  companyId: string;
  organizationId: string;
  itemLabel: (id: string | null) => string;
  onOpenChange: (open: boolean) => void;
}

export function CreateRuleSheet({
  line,
  statementId,
  companyId,
  organizationId,
  itemLabel,
  onOpenChange,
}: Props) {
  const create = useCreateClassificationRule();
  const apply = useApplyClassificationRules();
  const [name, setName] = React.useState("");
  const [pattern, setPattern] = React.useState("");
  const [matchKind, setMatchKind] = React.useState<"prefix" | "contains">("prefix");
  const [onlyThisCompany, setOnlyThisCompany] = React.useState(false);

  React.useEffect(() => {
    if (!line) return;
    const proposed = proposeRulePattern(line.description);
    setPattern(proposed);
    setName(proposed.charAt(0) + proposed.slice(1).toLowerCase());
    setMatchKind("prefix");
    setOnlyThisCompany(false);
  }, [line]);

  const pending = create.isPending || apply.isPending;

  async function submit() {
    if (!line?.management_account_id) return;
    try {
      await create.mutateAsync({
        organization_id: organizationId,
        company_id: onlyThisCompany ? companyId : null,
        name: name.trim(),
        match_kind: matchKind,
        pattern,
        management_account_id: line.management_account_id,
        cost_center_id: line.cost_center_id,
        created_from_line_id: line.id,
      });
    } catch (err) {
      toast.error("Não foi possível criar a regra", {
        description: err instanceof Error ? err.message : undefined,
      });
      return;
    }
    // A regra já existe a partir daqui: falhar ao reaplicar não é falhar ao criar.
    onOpenChange(false);
    try {
      const applied = await apply.mutateAsync(statementId);
      toast.success("Regra criada", {
        description:
          applied > 0
            ? `${applied} compra(s) desta fatura já foram classificadas por ela.`
            : "Vale para as próximas faturas.",
      });
    } catch {
      toast.warning("Regra criada, mas não foi reaplicada nesta fatura", {
        description: "Use “Aplicar regras” para classificar as compras desta fatura.",
      });
    }
  }

  return (
    <Sheet open={line !== null} onOpenChange={onOpenChange}>
      <SheetContent size="sm" className="flex flex-col p-0">
        <SheetHeader>
          <SheetTitle>Criar regra</SheetTitle>
          <SheetDescription>
            Compras cuja descrição casar com o padrão vão para{" "}
            <strong>{itemLabel(line?.management_account_id ?? null)}</strong>
            {line?.cost_center_id ? " nesta mesma área" : ""}, nesta e nas próximas faturas.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-5">
          <p className="rounded-[var(--radius-md)] bg-surface-2/60 px-3 py-2 font-mono text-xs">
            {line?.description}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">Fornecedor</Label>
            <Input id="rule-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-[140px_1fr] gap-2">
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Select
                value={matchKind}
                onValueChange={(v) => setMatchKind(v as "prefix" | "contains")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prefix">começa com</SelectItem>
                  <SelectItem value="contains">contém</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-pattern">Padrão</Label>
              <Input
                id="rule-pattern"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                className="font-mono uppercase"
              />
            </div>
          </div>
          <p className="text-2xs text-text-muted">
            Maiúsculas, acentos e pontuação não importam: &quot;FACEBK *WX5&quot; e &quot;FACEBK*
            DZR&quot; começam ambos com FACEBK.
          </p>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <Checkbox
              checked={onlyThisCompany}
              onCheckedChange={(next) => setOnlyThisCompany(next === true)}
              className="mt-0.5"
            />
            <span>
              Só nesta empresa
              <span className="text-2xs block text-text-muted">
                Para quando o mesmo fornecedor é de outro item ou área nas outras empresas.
              </span>
            </span>
          </label>
        </SheetBody>
        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            disabled={pending || pattern.trim().length < 3 || name.trim().length < 2}
            onClick={() => void submit()}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Criar regra
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

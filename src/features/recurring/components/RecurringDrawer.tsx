import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
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
import { Textarea } from "@/components/ui/textarea";
import { AccountCombobox } from "@/features/accounts/AccountCombobox";
import { useBankAccounts } from "@/features/bank-accounts/hooks";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { useCostCenters } from "@/features/cost-centers/hooks";
import { useCounterparties } from "@/features/counterparties/hooks";

import type { RecurringTemplate } from "../api";
import { useCreateRecurringTemplate, useUpdateRecurringTemplate } from "../hooks";
import {
  emptyRecurringForm,
  RECURRENCE_FREQUENCIES,
  recurringFormSchema,
  type RecurringFormValues,
} from "../schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: RecurringTemplate | null;
  companyId: string;
}

/** Valor do select para "campo vazio" — Radix não aceita item com value "". */
const NONE = "__none__";

export function RecurringDrawer({ open, onOpenChange, template, companyId }: Props) {
  const isEditing = Boolean(template);
  const create = useCreateRecurringTemplate();
  const update = useUpdateRecurringTemplate();
  const pending = create.isPending || update.isPending;

  const initialValues = React.useMemo<RecurringFormValues>(() => {
    if (template) {
      return {
        companyId: template.company_id,
        accountId: template.account_id,
        bankAccountId: template.bank_account_id,
        costCenterId: template.cost_center_id,
        counterpartyId: template.counterparty_id,
        documentRef: template.document_ref,
        notes: template.notes,
        description: template.description,
        amount: template.amount,
        direction: template.direction,
        frequency: template.frequency,
        dayOfMonth: template.day_of_month,
        startDate: template.start_date,
        endDate: template.end_date,
        maxOccurrences: template.max_occurrences,
        autoGenerate: template.auto_generate,
        isActive: template.is_active,
      };
    }
    return emptyRecurringForm(companyId);
  }, [template, companyId]);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<RecurringFormValues>({
    resolver: zodResolver(recurringFormSchema),
    defaultValues: initialValues,
  });

  // O drawer fica montado e só a prop `template` muda ao editar; `useForm` lê
  // defaultValues uma única vez, na montagem. Sem este reset o formulário abria
  // com os valores da primeira montagem — vazios — em vez dos da recorrência.
  React.useEffect(() => {
    if (open) reset(initialValues);
  }, [open, initialValues, reset]);

  const watchedCompanyId = watch("companyId");

  const { companies } = useCompanyScope();
  const organizationId = companies[0]?.organization_id ?? "";
  const { data: bankAccounts = [] } = useBankAccounts(watchedCompanyId);
  const { data: costCenters = [] } = useCostCenters();
  const { data: counterparties = [] } = useCounterparties({ organizationId });

  const onSubmit = handleSubmit((values) => {
    const payload = {
      company_id: values.companyId,
      account_id: values.accountId,
      bank_account_id: values.bankAccountId,
      cost_center_id: values.costCenterId,
      counterparty_id: values.counterpartyId,
      document_ref: values.documentRef,
      notes: values.notes,
      description: values.description,
      amount: values.amount,
      direction: values.direction,
      frequency: values.frequency,
      day_of_month: values.dayOfMonth,
      start_date: values.startDate,
      end_date: values.endDate,
      max_occurrences: values.maxOccurrences,
      auto_generate: values.autoGenerate,
      is_active: values.isActive,
    };
    if (isEditing && template) {
      update.mutate(
        {
          id: template.id,
          payload: {
            ...payload,
            // A próxima execução só volta a acompanhar o início enquanto nada
            // foi gerado. Depois disso ela é o cursor da série — reescrevê-la
            // faria a recorrência gerar tudo de novo desde o começo.
            ...(template.total_generated === 0 ? { next_run_date: values.startDate } : {}),
          },
        },
        {
          onSuccess: () => {
            toast.success("Recorrência atualizada");
            onOpenChange(false);
          },
          onError: (err) => toast.error("Erro", { description: err.message }),
        },
      );
    } else {
      create.mutate(
        { ...payload, next_run_date: values.startDate },
        {
          onSuccess: ({ backfilledCount }) => {
            toast.success("Recorrência criada", {
              description:
                backfilledCount > 0
                  ? `${backfilledCount} lançamento(s) retroativo(s) gerado(s)`
                  : undefined,
            });
            onOpenChange(false);
          },
          onError: (err) => toast.error("Erro", { description: err.message }),
        },
      );
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md" className="flex flex-col p-0">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Editar recorrência" : "Nova recorrência"}</SheetTitle>
          <SheetDescription>
            Modelo que gera lançamentos automaticamente — útil pra aluguel, assinaturas, folha base.
          </SheetDescription>
        </SheetHeader>
        {/* O reset acima é quem repovoa o formulário; uma `key` aqui só
            remontaria o DOM sem tocar no estado do useForm. */}
        <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-hidden">
          <SheetBody className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="description">Descrição</Label>
              <Input
                id="description"
                placeholder="Aluguel sede"
                {...register("description")}
                aria-invalid={Boolean(errors.description)}
              />
              {errors.description && (
                <p className="text-2xs text-expense">{errors.description.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="direction">Tipo</Label>
                <Controller
                  name="direction"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="direction">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="outflow">Saída</SelectItem>
                        <SelectItem value="inflow">Entrada</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amount">Valor</Label>
                <Controller
                  name="amount"
                  control={control}
                  render={({ field }) => (
                    <CurrencyInput id="amount" value={field.value} onValueChange={field.onChange} />
                  )}
                />
                {errors.amount && <p className="text-2xs text-expense">{errors.amount.message}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="accountId">Conta</Label>
              <Controller
                name="accountId"
                control={control}
                render={({ field }) => (
                  <AccountCombobox
                    id="accountId"
                    companyId={watchedCompanyId}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              {errors.accountId && (
                <p className="text-2xs text-expense">{errors.accountId.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bankAccountId">Conta bancária</Label>
                <Controller
                  name="bankAccountId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(v) => {
                        field.onChange(v === NONE ? null : v);
                      }}
                    >
                      <SelectTrigger id="bankAccountId">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Sem conta</SelectItem>
                        {bankAccounts
                          .filter((b) => b.is_active)
                          .map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.nickname}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="costCenterId">Área</Label>
                <Controller
                  name="costCenterId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(v) => {
                        field.onChange(v === NONE ? null : v);
                      }}
                    >
                      <SelectTrigger id="costCenterId">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Nenhum</SelectItem>
                        {costCenters.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="counterpartyId">Fornecedor</Label>
                <Controller
                  name="counterpartyId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(v) => {
                        field.onChange(v === NONE ? null : v);
                      }}
                    >
                      <SelectTrigger id="counterpartyId">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Nenhum</SelectItem>
                        {counterparties.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="documentRef">
                  Documento <span className="text-text-subtle">(opcional)</span>
                </Label>
                <Input id="documentRef" placeholder="Contrato 123" {...register("documentRef")} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="frequency">Frequência</Label>
                <Controller
                  name="frequency"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="frequency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RECURRENCE_FREQUENCIES.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dayOfMonth">Dia do mês</Label>
                <Input
                  id="dayOfMonth"
                  type="number"
                  min={1}
                  max={31}
                  {...register("dayOfMonth", { valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="startDate">Início</Label>
                <Input id="startDate" type="date" {...register("startDate")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endDate">
                  Fim <span className="text-text-subtle">(opcional)</span>
                </Label>
                <Controller
                  name="endDate"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="endDate"
                      type="date"
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value === "" ? null : e.target.value)
                      }
                    />
                  )}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="maxOccurrences">
                Máximo de ocorrências <span className="text-text-subtle">(opcional)</span>
              </Label>
              <Controller
                name="maxOccurrences"
                control={control}
                render={({ field }) => (
                  <Input
                    id="maxOccurrences"
                    type="number"
                    min={1}
                    placeholder="Sem limite"
                    value={field.value ?? ""}
                    onChange={(e) => {
                      field.onChange(e.target.value === "" ? null : Number(e.target.value));
                    }}
                  />
                )}
              />
              {isEditing && template && template.total_generated > 0 && (
                <p className="text-2xs text-text-subtle">
                  {template.total_generated} ocorrência(s) já gerada(s).
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">
                Observações <span className="text-text-subtle">(opcional)</span>
              </Label>
              <Textarea id="notes" rows={3} {...register("notes")} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Geração</Label>
                <Controller
                  name="autoGenerate"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ? "auto" : "manual"}
                      onValueChange={(v) => field.onChange(v === "auto")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Automática</SelectItem>
                        <SelectItem value="manual">Manual (precisa aprovar)</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Status</Label>
                <Controller
                  name="isActive"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ? "active" : "inactive"}
                      onValueChange={(v) => field.onChange(v === "active")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Ativa</SelectItem>
                        <SelectItem value="inactive">Pausada</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
          </SheetBody>
          <SheetFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || (isEditing && !isDirty)}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {isEditing ? "Salvar" : "Criar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

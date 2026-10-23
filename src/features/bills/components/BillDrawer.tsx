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
import { AttachmentsSection } from "@/features/attachments/components/AttachmentsSection";
import { CostCenterSelect } from "@/features/cost-centers/CostCenterSelect";

import { useCreateBill, useCreateInstallments, useUpdateBill } from "../hooks";
import { billFormSchema, emptyBillForm, type BillFormValues } from "../schema";
import type { BillDirection, BillWithRelations } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill: BillWithRelations | null;
  companyId: string;
  direction: BillDirection;
}

export function BillDrawer({ open, onOpenChange, bill, companyId, direction }: Props) {
  const isEditing = Boolean(bill);
  const create = useCreateBill();
  const update = useUpdateBill();
  const installments = useCreateInstallments();
  const pending = create.isPending || update.isPending || installments.isPending;

  const initialValues = React.useMemo<BillFormValues>(() => {
    if (bill) {
      return {
        companyId: bill.company_id ?? companyId,
        accountId: bill.account_id ?? "",
        costCenterId: bill.cost_center_id,
        counterpartyId: bill.counterparty_id,
        direction: bill.direction ?? direction,
        amount: bill.amount ?? 0,
        accrualDate: bill.accrual_date ?? new Date().toISOString().slice(0, 10),
        dueDate: bill.due_date ?? new Date().toISOString().slice(0, 10),
        description: bill.description ?? "",
        documentRef: bill.document_ref,
        notes: bill.notes,
        installments: 1,
        intervalDays: 30,
      };
    }
    return emptyBillForm(companyId, direction);
  }, [bill, companyId, direction]);

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<BillFormValues>({
    resolver: zodResolver(billFormSchema),
    defaultValues: initialValues,
  });

  React.useEffect(() => {
    reset(initialValues);
  }, [initialValues, reset]);

  const watchInstallments = watch("installments");
  const isInstallment = !isEditing && watchInstallments > 1;

  const onSubmit = handleSubmit((values) => {
    if (isEditing && bill?.id) {
      update.mutate(
        {
          id: bill.id,
          payload: {
            account_id: values.accountId,
            cost_center_id: values.costCenterId,
            counterparty_id: values.counterpartyId,
            direction: values.direction,
            amount: values.amount,
            accrual_date: values.accrualDate,
            due_date: values.dueDate,
            description: values.description.trim(),
            document_ref: values.documentRef?.trim() ?? null,
            notes: values.notes?.trim() ?? null,
          },
        },
        {
          onSuccess: () => {
            toast.success("Título atualizado");
            onOpenChange(false);
          },
          onError: (err) => toast.error("Erro ao salvar", { description: err.message }),
        },
      );
      return;
    }

    if (values.installments > 1) {
      installments.mutate(
        {
          companyId: values.companyId,
          accountId: values.accountId,
          costCenterId: values.costCenterId,
          counterpartyId: values.counterpartyId,
          direction: values.direction,
          totalAmount: values.amount,
          installments: values.installments,
          firstDueDate: values.dueDate,
          intervalDays: values.intervalDays,
          description: values.description.trim(),
          documentRef: values.documentRef?.trim() ?? null,
        },
        {
          onSuccess: () => {
            toast.success(`${values.installments} parcelas criadas`);
            onOpenChange(false);
          },
          onError: (err) => toast.error("Erro ao parcelar", { description: err.message }),
        },
      );
      return;
    }

    create.mutate(
      {
        company_id: values.companyId,
        account_id: values.accountId,
        cost_center_id: values.costCenterId,
        counterparty_id: values.counterpartyId,
        direction: values.direction,
        amount: values.amount,
        accrual_date: values.accrualDate,
        due_date: values.dueDate,
        status: "pending",
        description: values.description.trim(),
        document_ref: values.documentRef?.trim() ?? null,
        notes: values.notes?.trim() ?? null,
      },
      {
        onSuccess: () => {
          toast.success("Título criado");
          onOpenChange(false);
        },
        onError: (err) => toast.error("Erro ao criar", { description: err.message }),
      },
    );
  });

  const directionLabel = direction === "outflow" ? "a pagar" : "a receber";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md" className="flex flex-col p-0">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? `Editar título ${directionLabel}` : `Novo título ${directionLabel}`}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Atualize os dados do título. Para registrar pagamento, use a ação Dar baixa."
              : "Cadastre um compromisso futuro. Você pode parcelar em até 360 parcelas."}
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={onSubmit}
          key={bill?.id ?? "new"}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <SheetBody className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="description">Descrição</Label>
              <Input
                id="description"
                placeholder="Ex.: Aluguel escritório"
                {...register("description")}
              />
              {errors.description && (
                <p className="text-2xs text-expense">{errors.description.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="amount">{isInstallment ? "Valor total" : "Valor"}</Label>
                <Controller
                  name="amount"
                  control={control}
                  render={({ field }) => (
                    <CurrencyInput id="amount" value={field.value} onValueChange={field.onChange} />
                  )}
                />
                {errors.amount && <p className="text-2xs text-expense">{errors.amount.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dueDate">{isInstallment ? "1º vencimento" : "Vencimento"}</Label>
                <Input id="dueDate" type="date" {...register("dueDate")} />
                {errors.dueDate && (
                  <p className="text-2xs text-expense">{errors.dueDate.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="accountId">Conta DRE</Label>
              <Controller
                name="accountId"
                control={control}
                render={({ field }) => (
                  <AccountCombobox
                    id="accountId"
                    companyId={companyId}
                    value={field.value || null}
                    onChange={field.onChange}
                  />
                )}
              />
              {errors.accountId && (
                <p className="text-2xs text-expense">{errors.accountId.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="costCenterId">
                Área <span className="text-text-subtle">(opcional)</span>
              </Label>
              <Controller
                name="costCenterId"
                control={control}
                render={({ field }) => (
                  <CostCenterSelect
                    id="costCenterId"
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="documentRef">Documento / Referência</Label>
              <Input
                id="documentRef"
                placeholder="NF, contrato, boleto…"
                {...register("documentRef")}
              />
            </div>

            {!isEditing && (
              <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
                <div className="text-2xs mb-2 font-medium tracking-wide text-text-subtle uppercase">
                  Parcelamento
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="installments">Nº de parcelas</Label>
                    <Input
                      id="installments"
                      type="number"
                      min={1}
                      max={360}
                      {...register("installments")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="intervalDays">Intervalo (dias)</Label>
                    <Input
                      id="intervalDays"
                      type="number"
                      min={1}
                      max={365}
                      disabled={watchInstallments <= 1}
                      {...register("intervalDays")}
                    />
                  </div>
                </div>
                {isInstallment && (
                  <p className="text-2xs mt-2 text-text-subtle">
                    Cada parcela: ~
                    {(watch("amount") / watchInstallments).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="notes">
                Notas <span className="text-text-subtle">(opcional)</span>
              </Label>
              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <Textarea
                    id="notes"
                    rows={2}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                  />
                )}
              />
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
                        <SelectItem value="outflow">A pagar</SelectItem>
                        <SelectItem value="inflow">A receber</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="accrualDate">Competência</Label>
                <Input id="accrualDate" type="date" {...register("accrualDate")} />
              </div>
            </div>

            {isEditing && bill?.id ? (
              <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
                <AttachmentsSection
                  entityType="transaction"
                  entityId={bill.id}
                  companyId={companyId}
                />
              </div>
            ) : null}
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
              {isEditing
                ? "Salvar"
                : isInstallment
                  ? `Criar ${watchInstallments} parcelas`
                  : "Criar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";

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
import { SheetBody, SheetFooter } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { AccountCombobox } from "@/features/accounts/AccountCombobox";
import { AttachmentsSection } from "@/features/attachments/components/AttachmentsSection";
import { BankAccountSelect } from "@/features/bank-accounts/BankAccountSelect";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { CostCenterSelect } from "@/features/cost-centers/CostCenterSelect";
import { CounterpartyCombobox } from "@/features/counterparties/CounterpartyCombobox";

import { transactionFormSchema, type TransactionFormValues } from "../schema";
import type { TransactionWithRelations } from "../types";

interface Props {
  initialValues: TransactionFormValues;
  existingTransaction?: TransactionWithRelations | null;
  isPending: boolean;
  onSubmit: (values: TransactionFormValues) => void;
  onCancel: () => void;
}

export function TransactionForm({
  initialValues,
  existingTransaction,
  isPending,
  onSubmit,
  onCancel,
}: Props) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: initialValues,
  });

  const companyId = watch("companyId");
  const direction = watch("direction");
  const isEditing = Boolean(existingTransaction);

  // Counterparties are organization-scoped; resolve the org from the company.
  const { companies, isMultiCompany, scopeCompanies } = useCompanyScope();
  const organizationId = companies.find((c) => c.id === companyId)?.organization_id ?? null;

  // Sem empresa única no escopo (consolidado ou grupo), ao criar, a empresa do lançamento
  // é escolhida aqui — e as opções são as do escopo: num grupo de 2 empresas, lançar numa
  // terceira contradiria o recorte que a pessoa selecionou.
  const operationalCompanies = scopeCompanies;
  const showCompanySelect = !isEditing && isMultiCompany;

  // Trocar a empresa invalida os campos scoped por empresa/organização.
  function handleCompanyChange(nextCompanyId: string) {
    setValue("companyId", nextCompanyId, { shouldValidate: true, shouldDirty: true });
    setValue("accountId", "");
    setValue("costCenterId", null);
    setValue("bankAccountId", null);
    setValue("counterpartyId", null);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
      <SheetBody className="space-y-5">
        {/* Company (obrigatório escolher no consolidado ao criar) */}
        {showCompanySelect && (
          <div className="space-y-1.5">
            <Label htmlFor="companyId">Empresa</Label>
            <Controller
              name="companyId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value || undefined}
                  onValueChange={handleCompanyChange}
                  disabled={isPending}
                >
                  <SelectTrigger id="companyId" aria-invalid={Boolean(errors.companyId)}>
                    <SelectValue placeholder="Selecione a empresa do lançamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {operationalCompanies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.trade_name ?? c.legal_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.companyId && (
              <p className="text-2xs text-expense">{errors.companyId.message}</p>
            )}
          </div>
        )}

        {/* Direction + Status */}
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
                    <SelectItem value="inflow">Entrada (receita)</SelectItem>
                    <SelectItem value="outflow">Saída (despesa)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Agendado</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="settled">Liquidado</SelectItem>
                    <SelectItem value="reconciled">Conciliado</SelectItem>
                    <SelectItem value="canceled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        {/* Amount */}
        <div className="space-y-1.5">
          <Label htmlFor="amount">Valor</Label>
          <Controller
            name="amount"
            control={control}
            render={({ field }) => (
              <CurrencyInput
                id="amount"
                value={field.value}
                onValueChange={field.onChange}
                disabled={isPending}
              />
            )}
          />
          {errors.amount && <p className="text-2xs text-expense">{errors.amount.message}</p>}
        </div>

        {/* Account */}
        <div className="space-y-1.5">
          <Label htmlFor="accountId">Conta</Label>
          <Controller
            name="accountId"
            control={control}
            render={({ field }) => (
              <AccountCombobox
                id="accountId"
                companyId={companyId}
                value={field.value}
                onChange={field.onChange}
                disabled={isPending}
              />
            )}
          />
          {errors.accountId && <p className="text-2xs text-expense">{errors.accountId.message}</p>}
        </div>

        {/* Cost center */}
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
                value={field.value ?? null}
                onChange={field.onChange}
              />
            )}
          />
        </div>

        {/* Counterparty (fornecedor/cliente) */}
        <div className="space-y-1.5">
          <Label htmlFor="counterpartyId">
            Fornecedor / Cliente <span className="text-text-subtle">(opcional)</span>
          </Label>
          <Controller
            name="counterpartyId"
            control={control}
            render={({ field }) => (
              <CounterpartyCombobox
                id="counterpartyId"
                organizationId={organizationId}
                value={field.value ?? null}
                onChange={field.onChange}
                createKind={direction === "inflow" ? "customer" : "supplier"}
                disabled={isPending}
              />
            )}
          />
        </div>

        {/* Bank account */}
        <div className="space-y-1.5">
          <Label htmlFor="bankAccountId">
            Conta bancária <span className="text-text-subtle">(opcional)</span>
          </Label>
          <Controller
            name="bankAccountId"
            control={control}
            render={({ field }) => (
              <BankAccountSelect
                id="bankAccountId"
                companyId={companyId}
                value={field.value ?? null}
                onChange={field.onChange}
              />
            )}
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="accrualDate">Competência</Label>
            <Input
              id="accrualDate"
              type="date"
              {...register("accrualDate")}
              aria-invalid={Boolean(errors.accrualDate)}
            />
            {errors.accrualDate && (
              <p className="text-2xs text-expense">{errors.accrualDate.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dueDate">
              Vencimento <span className="text-text-subtle">(opcional)</span>
            </Label>
            <Controller
              name="dueDate"
              control={control}
              render={({ field }) => (
                <Input
                  id="dueDate"
                  type="date"
                  value={field.value ?? ""}
                  onChange={(e) => {
                    field.onChange(e.target.value === "" ? null : e.target.value);
                  }}
                />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cashDate">
              Pagamento <span className="text-text-subtle">(opcional)</span>
            </Label>
            <Controller
              name="cashDate"
              control={control}
              render={({ field }) => (
                <Input
                  id="cashDate"
                  type="date"
                  value={field.value ?? ""}
                  onChange={(e) => {
                    field.onChange(e.target.value === "" ? null : e.target.value);
                  }}
                />
              )}
            />
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label htmlFor="description">Descrição</Label>
          <Input
            id="description"
            placeholder="Aluguel agosto/2025, NF #1234, etc."
            {...register("description")}
            aria-invalid={Boolean(errors.description)}
          />
          {errors.description && (
            <p className="text-2xs text-expense">{errors.description.message}</p>
          )}
        </div>

        {/* Document */}
        <div className="space-y-1.5">
          <Label htmlFor="documentRef">
            Documento <span className="text-text-subtle">(opcional)</span>
          </Label>
          <Controller
            name="documentRef"
            control={control}
            render={({ field }) => (
              <Input
                id="documentRef"
                placeholder="Nº NF, boleto, contrato…"
                value={field.value ?? ""}
                onChange={(e) => {
                  field.onChange(e.target.value === "" ? null : e.target.value);
                }}
              />
            )}
          />
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label htmlFor="notes">
            Notas internas <span className="text-text-subtle">(opcional)</span>
          </Label>
          <Controller
            name="notes"
            control={control}
            render={({ field }) => (
              <Textarea
                id="notes"
                placeholder="Observações que não vão pro DRE…"
                rows={3}
                value={field.value ?? ""}
                onChange={(e) => {
                  field.onChange(e.target.value === "" ? null : e.target.value);
                }}
              />
            )}
          />
        </div>

        {isEditing && existingTransaction ? (
          <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
            <AttachmentsSection
              entityType="transaction"
              entityId={existingTransaction.id}
              companyId={existingTransaction.company_id}
            />
          </div>
        ) : null}
      </SheetBody>

      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending || (isEditing && !isDirty)}>
          {isPending && <Loader2 className="size-4 animate-spin" />}
          {isEditing ? "Salvar alterações" : "Criar lançamento"}
        </Button>
      </SheetFooter>
    </form>
  );
}

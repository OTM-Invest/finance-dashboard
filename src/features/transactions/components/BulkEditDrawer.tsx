import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { useAccountsByCompany } from "@/features/accounts/hooks";
import { useBankAccounts } from "@/features/bank-accounts/hooks";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { useCostCenters } from "@/features/cost-centers/hooks";
import { useCounterparties } from "@/features/counterparties/hooks";

import type { BulkPatch } from "../api";
import { useBulkUpdateTransactions } from "../hooks";
import type { TransactionStatus } from "../types";

/** Valor do select quando o campo não deve ser tocado. */
const KEEP = "__keep__";
/** Valor do select quando o campo deve ser esvaziado. */
const CLEAR = "__clear__";

const STATUS_OPTIONS: { value: TransactionStatus; label: string }[] = [
  { value: "scheduled", label: "Agendado" },
  { value: "pending", label: "Pendente" },
  { value: "settled", label: "Liquidado" },
  { value: "reconciled", label: "Conciliado" },
  { value: "canceled", label: "Cancelado" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ids: string[];
  companyId: string | null;
  onApplied: () => void;
}

export function BulkEditDrawer({ open, onOpenChange, ids, companyId, onApplied }: Props) {
  const { companies } = useCompanyScope();
  const organizationId = companies[0]?.organization_id ?? "";

  const { data: accounts = [] } = useAccountsByCompany(companyId);
  const { data: bankAccounts = [] } = useBankAccounts(companyId);
  const { data: costCenters = [] } = useCostCenters();
  const { data: counterparties = [] } = useCounterparties({ organizationId });
  const bulk = useBulkUpdateTransactions();

  const [bankAccountId, setBankAccountId] = React.useState(KEEP);
  const [accountId, setAccountId] = React.useState(KEEP);
  const [costCenterId, setCostCenterId] = React.useState(KEEP);
  const [counterpartyId, setCounterpartyId] = React.useState(KEEP);
  const [status, setStatus] = React.useState(KEEP);
  const [cashDate, setCashDate] = React.useState("");

  const reset = React.useCallback(() => {
    setBankAccountId(KEEP);
    setAccountId(KEEP);
    setCostCenterId(KEEP);
    setCounterpartyId(KEEP);
    setStatus(KEEP);
    setCashDate("");
  }, []);

  React.useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const patch = React.useMemo<BulkPatch>(() => {
    const next: BulkPatch = {};
    if (bankAccountId !== KEEP) {
      next.bank_account_id = bankAccountId === CLEAR ? null : bankAccountId;
    }
    if (accountId !== KEEP) next.account_id = accountId;
    if (costCenterId !== KEEP) {
      next.cost_center_id = costCenterId === CLEAR ? null : costCenterId;
    }
    if (counterpartyId !== KEEP) {
      next.counterparty_id = counterpartyId === CLEAR ? null : counterpartyId;
    }
    if (status !== KEEP) next.status = status as TransactionStatus;
    if (cashDate) next.cash_date = cashDate;
    return next;
  }, [bankAccountId, accountId, costCenterId, counterpartyId, status, cashDate]);

  const changedCount = Object.keys(patch).length;
  const settlingStatus = status === "settled" || status === "reconciled";

  const apply = () => {
    bulk.mutate(
      { ids, patch },
      {
        onSuccess: (updated) => {
          toast.success(`${updated.toLocaleString("pt-BR")} lançamento(s) atualizado(s)`);
          onOpenChange(false);
          onApplied();
        },
        onError: (err) => {
          toast.error("Erro na edição em massa", { description: err.message });
        },
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <div className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>Editar {ids.length.toLocaleString("pt-BR")} lançamentos</SheetTitle>
            <SheetDescription>
              Só os campos que você mudar aqui são aplicados — o resto fica como está em cada
              lançamento.
            </SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-4">
            <Field label="Conta bancária" htmlFor="bulk-bank">
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger id="bulk-bank">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP}>Não alterar</SelectItem>
                  <SelectItem value={CLEAR}>Limpar (sem conta)</SelectItem>
                  {bankAccounts
                    .filter((b) => b.is_active)
                    .map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.nickname}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Conta (plano de contas)" htmlFor="bulk-account">
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="bulk-account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP}>Não alterar</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Área" htmlFor="bulk-cc">
              <Select value={costCenterId} onValueChange={setCostCenterId}>
                <SelectTrigger id="bulk-cc">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP}>Não alterar</SelectItem>
                  <SelectItem value={CLEAR}>Limpar</SelectItem>
                  {costCenters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Fornecedor" htmlFor="bulk-cp">
              <Select value={counterpartyId} onValueChange={setCounterpartyId}>
                <SelectTrigger id="bulk-cp">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP}>Não alterar</SelectItem>
                  <SelectItem value={CLEAR}>Limpar</SelectItem>
                  {counterparties.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Status" htmlFor="bulk-status">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="bulk-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP}>Não alterar</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {settlingStatus && (
              <Field label="Data de caixa" htmlFor="bulk-cash-date">
                <Input
                  id="bulk-cash-date"
                  type="date"
                  value={cashDate}
                  onChange={(e) => {
                    setCashDate(e.target.value);
                  }}
                />
                <p className="text-2xs mt-1 text-text-subtle">
                  Preenche só quem ainda não tem data de caixa. Quem já tem mantém a data atual.
                </p>
              </Field>
            )}
          </SheetBody>

          <SheetFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onOpenChange(false);
              }}
              disabled={bulk.isPending}
            >
              Cancelar
            </Button>
            <Button onClick={apply} disabled={changedCount === 0 || bulk.isPending}>
              {bulk.isPending && <Loader2 className="size-4 animate-spin" />}
              {changedCount === 0
                ? "Escolha um campo"
                : `Aplicar a ${ids.length.toLocaleString("pt-BR")}`}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

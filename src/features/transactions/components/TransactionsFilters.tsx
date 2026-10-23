import { Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { useAccountsByCompany } from "@/features/accounts/hooks";
import { useBankAccounts } from "@/features/bank-accounts/hooks";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { useCounterparties } from "@/features/counterparties/hooks";

import { NO_BANK_ACCOUNT } from "../types";
import { useTransactionFilters } from "../useTransactionFilters";

interface Props {
  companyId: string | null;
}

export function TransactionsFilters({ companyId }: Props) {
  const [filters, setFilters] = useTransactionFilters();
  const { data: accounts = [] } = useAccountsByCompany(companyId);
  const { data: bankAccounts = [] } = useBankAccounts(companyId);

  // o nome do fornecedor é resolvido pelo id (a lista da organização tem ~150
  // linhas e já está em cache): levar o nome na URL duplicaria estado que pode
  // envelhecer se a contraparte for renomeada
  const { companies } = useCompanyScope();
  const organizationId = companies[0]?.organization_id ?? "";
  const { data: counterparties = [] } = useCounterparties({ organizationId });
  const counterpartyName = filters.counterpartyId
    ? counterparties.find((c) => c.id === filters.counterpartyId)?.name
    : undefined;

  const hasAny = [
    filters.from,
    filters.to,
    filters.status,
    filters.direction,
    filters.accountId,
    filters.bankAccountId,
    filters.counterpartyId,
    filters.search,
  ].some(Boolean);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="search">Buscar</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-subtle" />
          <Input
            id="search"
            placeholder="Descrição ou fornecedor…"
            value={filters.search}
            onChange={(e) => void setFilters({ search: e.target.value })}
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="from">De</Label>
        <Input
          id="from"
          type="date"
          value={filters.from}
          onChange={(e) => void setFilters({ from: e.target.value })}
          className="w-[150px]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="to">Até</Label>
        <Input
          id="to"
          type="date"
          value={filters.to}
          onChange={(e) => void setFilters({ to: e.target.value })}
          className="w-[150px]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="direction">Tipo</Label>
        <Select
          value={filters.direction ?? "__all__"}
          onValueChange={(v) =>
            void setFilters({
              direction: v === "__all__" ? null : (v as "inflow" | "outflow"),
            })
          }
        >
          <SelectTrigger id="direction" className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            <SelectItem value="inflow">Entrada</SelectItem>
            <SelectItem value="outflow">Saída</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="status">Status</Label>
        <Select
          value={filters.status ?? "__all__"}
          onValueChange={(v) =>
            void setFilters({
              status:
                v === "__all__"
                  ? null
                  : (v as "scheduled" | "pending" | "settled" | "reconciled" | "canceled"),
            })
          }
        >
          <SelectTrigger id="status" className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            <SelectItem value="scheduled">Agendado</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="settled">Liquidado</SelectItem>
            <SelectItem value="reconciled">Conciliado</SelectItem>
            <SelectItem value="canceled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account">Conta</Label>
        <Select
          value={filters.accountId || "__all__"}
          onValueChange={(v) => void setFilters({ accountId: v === "__all__" ? "" : v })}
          disabled={!companyId}
        >
          <SelectTrigger id="account" className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.code} · {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bankAccount">Banco</Label>
        <Select
          value={filters.bankAccountId || "__all__"}
          onValueChange={(v) => void setFilters({ bankAccountId: v === "__all__" ? "" : v })}
          disabled={!companyId}
        >
          <SelectTrigger id="bankAccount" className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            <SelectItem value={NO_BANK_ACCOUNT}>Sem conta atribuída</SelectItem>
            {bankAccounts.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.nickname}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasAny && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            void setFilters({
              from: "",
              to: "",
              status: null,
              direction: null,
              accountId: "",
              costCenterId: "",
              bankAccountId: "",
              counterpartyId: "",
              search: "",
            })
          }
        >
          <X className="size-3.5" /> Limpar
        </Button>
      )}

      {/*
        O recorte por fornecedor não tem campo próprio: ele chega pela URL, vindo
        do relatório de contrapartes. Por isso precisa de rótulo visível — sem
        ele, a pessoa cairia numa lista filtrada sem nada na tela explicando por
        que faltam lançamentos, que é o pior tipo de filtro.
      */}
      {filters.counterpartyId && (
        <div className="flex w-full items-center gap-2">
          <span className="text-2xs tracking-wide text-text-subtle uppercase">Fornecedor</span>
          <Badge tone="accent">{counterpartyName ?? "selecionado"}</Badge>
          <Button variant="ghost" size="sm" onClick={() => void setFilters({ counterpartyId: "" })}>
            <X className="size-3.5" /> Remover
          </Button>
        </div>
      )}
    </div>
  );
}

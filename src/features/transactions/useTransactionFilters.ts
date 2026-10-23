import { parseAsString, parseAsStringEnum, parseAsStringLiteral, useQueryStates } from "nuqs";

import type { TransactionDirection, TransactionStatus } from "./types";

const DIRECTION_VALUES = ["inflow", "outflow"] as const;
const STATUS_VALUES = [
  "scheduled",
  "pending",
  "settled",
  "reconciled",
  "canceled",
] as const satisfies readonly TransactionStatus[];

const SORT_BY_VALUES = ["accrual_date", "due_date", "cash_date", "amount", "description"] as const;
const SORT_ORDER_VALUES = ["asc", "desc"] as const;

export function useTransactionFilters() {
  return useQueryStates({
    from: parseAsString.withDefault(""),
    to: parseAsString.withDefault(""),
    status: parseAsStringLiteral(STATUS_VALUES),
    direction: parseAsStringEnum<TransactionDirection>([...DIRECTION_VALUES]),
    accountId: parseAsString.withDefault(""),
    costCenterId: parseAsString.withDefault(""),
    bankAccountId: parseAsString.withDefault(""),
    // chega pela URL quando se clica numa contraparte no relatório
    counterpartyId: parseAsString.withDefault(""),
    search: parseAsString.withDefault(""),
    sortBy: parseAsStringLiteral(SORT_BY_VALUES).withDefault("accrual_date"),
    sortOrder: parseAsStringLiteral(SORT_ORDER_VALUES).withDefault("desc"),
  });
}

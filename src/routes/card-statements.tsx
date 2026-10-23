import * as React from "react";
import { Link } from "react-router-dom";
import { CreditCard, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/features/auth/usePermissions";
import { ImportStatementSheet } from "@/features/card-statements/components/ImportStatementSheet";
import { useCardStatements } from "@/features/card-statements/hooks";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

/**
 * Faturas de cartão detalhadas.
 *
 * A fatura continua sendo um lançamento só no financeiro (a contabilidade não muda); aqui
 * ela é aberta em compras, para a visão gerencial saber o que foi tecnologia, mídia,
 * equipamento. Ver docs/features/central-de-gastos-plan.md §7.
 */
export default function CardStatementsPage() {
  const { companyIds, companies } = useCompanyScope();
  const { canEdit } = usePermissions();
  const { data: statements = [], isLoading, error } = useCardStatements(companyIds);
  const [importing, setImporting] = React.useState(false);

  const companyName = (id: string) => companies.find((c) => c.id === id)?.trade_name ?? "—";

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
            Central de Gastos
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            Faturas de cartão
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-text-muted">
            O lançamento da fatura continua como está. Aqui ele é aberto em compras — e cada compra,
            classificada, passa a contar no item certo do Balanço.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setImporting(true)}>
            <Plus className="size-4" /> Importar fatura
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : error ? (
        <p className="rounded-[var(--radius-md)] border border-expense/40 bg-expense/5 p-4 text-sm text-expense">
          Não foi possível carregar as faturas: {error.message}
        </p>
      ) : statements.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-12 text-center">
          <CreditCard className="mx-auto size-6 text-text-subtle" />
          <h2 className="mt-3 text-sm font-semibold">Nenhuma fatura detalhada ainda</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">
            Importe o PDF de uma fatura já lançada em Cartão para ver o que tem dentro dela.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {statements.map((s) => {
            const pendingCount = s.lineCount - s.confirmedCount;
            return (
              <li key={s.id}>
                <Link
                  to={`/faturas/${s.id}`}
                  className="block rounded-[var(--radius-lg)] border border-border bg-surface p-4 transition-colors hover:border-accent/40 focus-visible:border-accent"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {companyName(s.company_id)}
                      </div>
                      <div className="text-2xs text-text-muted">
                        Fecha {formatDate(s.closing_date)} · vence {formatDate(s.due_date)}
                      </div>
                    </div>
                    {s.status === "reconciled" ? (
                      <Badge tone="income">Conferida</Badge>
                    ) : (
                      <Badge tone="expense">Não fecha</Badge>
                    )}
                  </div>
                  <div className="mt-3 font-mono text-xl font-semibold tabular-nums">
                    {formatBRL(s.total_amount)}
                  </div>
                  <div className="text-2xs mt-1 text-text-muted">
                    {s.lineCount} compras ·{" "}
                    {pendingCount === 0 ? "todas classificadas" : `${pendingCount} a classificar`}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <ImportStatementSheet open={importing} onOpenChange={setImporting} />
    </div>
  );
}

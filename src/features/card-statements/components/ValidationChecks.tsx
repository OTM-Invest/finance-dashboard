import { CheckCircle2, XCircle } from "lucide-react";

import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/format";

interface Check {
  code: string;
  label: string;
  expectedCents: number;
  gotCents: number;
  ok: boolean;
}

/**
 * As conferências da fatura, uma por linha. A que falha mostra o que a fatura imprime e o
 * que as linhas somam — a diferença é onde procurar a linha lida errada.
 */
export function ValidationChecks({ checks }: { checks: readonly Check[] }) {
  return (
    <ul className="divide-y divide-border rounded-[var(--radius-md)] border border-border">
      {checks.map((check) => (
        <li key={check.code} className="flex items-start gap-2.5 px-3 py-2 text-sm">
          {check.ok ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-income" aria-label="Confere" />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0 text-expense" aria-label="Não confere" />
          )}
          <div className="min-w-0 flex-1">
            <div className={cn(!check.ok && "font-medium text-expense")}>{check.label}</div>
            {!check.ok && (
              <div className="text-2xs mt-0.5 font-mono text-text-muted">
                esperado {formatBRL(check.expectedCents / 100)} · linhas somam{" "}
                {formatBRL(check.gotCents / 100)} · diferença{" "}
                {formatBRL((check.gotCents - check.expectedCents) / 100)}
              </div>
            )}
          </div>
          {check.ok && (
            <span className="font-mono text-xs text-text-muted tabular-nums">
              {formatBRL(check.expectedCents / 100)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

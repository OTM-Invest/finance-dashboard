/**
 * Sincronização com o CRM: que empresa recebe cada tipo de relatório, o botão
 * "Sincronizar agora" e as últimas execuções (com o erro, sem segredo).
 *
 * A credencial do usuário de serviço do CRM fica nos secrets da Edge Function; esta tela
 * nunca a vê. Sem ela configurada, o botão avisa e a execução registra o motivo.
 */
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Company } from "@/features/companies/api";
import { SpendTable, Tag, Td, Th } from "@/features/spending/components/ui";
import { formatDate } from "@/lib/dates";

import type { ReportRoute, SyncRun } from "../api";
import { KIND_LABELS, REPORT_KINDS, type ReportKind } from "../compute";
import { useRequestSync, useSaveReportRoute } from "../hooks";

interface Props {
  routes: ReportRoute[];
  runs: SyncRun[];
  companies: Company[];
  organizationId: string | null;
  canEdit: boolean;
  canManage: boolean;
}

const STATUS_LABEL: Record<SyncRun["status"], string> = {
  running: "em andamento",
  succeeded: "ok",
  failed: "falhou",
};

function resultText(result: Record<string, unknown>): string {
  const n = (k: string) => (typeof result[k] === "number" ? result[k] : 0);
  const parts = [
    `${n("reports")} relatório(s)`,
    `${n("created")} novo(s)`,
    `${n("changed")} mudaram`,
    `${n("removed")} sumiram do CRM`,
  ];
  const unrouted = Array.isArray(result.unrouted) ? (result.unrouted as string[]) : [];
  if (unrouted.length > 0) parts.push(`sem empresa: ${unrouted.join(", ")}`);
  return parts.join(" · ");
}

export function SyncSection({
  routes,
  runs,
  companies,
  organizationId,
  canEdit,
  canManage,
}: Props) {
  const saveRoute = useSaveReportRoute();
  const sync = useRequestSync();
  const routeOf = (kind: ReportKind) => routes.find((r) => r.kind === kind);
  const operational = companies.filter((c) => !c.is_holding);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Que empresa recebe cada relatório</h2>
        <SpendTable>
          <tbody>
            {REPORT_KINDS.map((kind) => (
              <tr key={kind} className="border-t border-border first:border-t-0">
                <Td align="left" className="w-32 font-medium">
                  {KIND_LABELS[kind]}
                </Td>
                <Td align="left">
                  <Select
                    value={routeOf(kind)?.companyId ?? ""}
                    disabled={!canManage || !organizationId || saveRoute.isPending}
                    onValueChange={(companyId) =>
                      organizationId &&
                      saveRoute.mutate(
                        { organizationId, kind, companyId },
                        {
                          onSuccess: () => toast.success("Rota gravada"),
                          onError: (e) =>
                            toast.error("Não foi possível gravar a rota", {
                              description: e instanceof Error ? e.message : undefined,
                            }),
                        },
                      )
                    }
                  >
                    <SelectTrigger size="sm" className="w-72">
                      <SelectValue placeholder="sem empresa — não sincroniza" />
                    </SelectTrigger>
                    <SelectContent>
                      {operational.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.trade_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Td>
              </tr>
            ))}
          </tbody>
        </SpendTable>
        {!canManage && <p className="text-xs text-text-muted">Só admin muda a rota.</p>}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Execuções</h2>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              disabled={sync.isPending}
              onClick={() =>
                sync.mutate(
                  {},
                  {
                    onSuccess: (configured) =>
                      configured
                        ? toast.success("Sincronização pedida — acompanhe abaixo")
                        : toast.warning("Sincronização não configurada neste ambiente", {
                            description:
                              "Falta a URL e o segredo no Vault (crm_revenue_sync_url / _secret).",
                          }),
                    onError: (e) =>
                      toast.error("Não foi possível pedir a sincronização", {
                        description: e instanceof Error ? e.message : undefined,
                      }),
                  },
                )
              }
            >
              <RefreshCw className="size-3.5" /> Sincronizar agora
            </Button>
          )}
        </div>
        {runs.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhuma execução ainda.</p>
        ) : (
          <SpendTable>
            <thead className="bg-surface-2">
              <tr>
                <Th align="left">Quando</Th>
                <Th align="left">Período</Th>
                <Th align="left">Situação</Th>
                <Th align="left">Resultado</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <Td align="left" className="whitespace-nowrap text-text-muted">
                    {formatDate(r.startedAt, "dd/MM HH:mm")}
                  </Td>
                  <Td align="left" className="whitespace-nowrap text-text-muted">
                    {r.periodFrom && r.periodTo
                      ? `${formatDate(r.periodFrom, "MM/yy")} a ${formatDate(r.periodTo, "MM/yy")}`
                      : "—"}
                  </Td>
                  <Td align="left">
                    <Tag
                      tone={
                        r.status === "failed"
                          ? "expense"
                          : r.status === "running"
                            ? "info"
                            : "neutral"
                      }
                    >
                      {STATUS_LABEL[r.status]}
                    </Tag>
                  </Td>
                  <Td align="left" className="text-xs">
                    {r.error ? (
                      <span className="text-expense">{r.error}</span>
                    ) : (
                      <span className="text-text-muted">{resultText(r.result)}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </SpendTable>
        )}
      </section>
    </div>
  );
}

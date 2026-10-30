/**
 * Código do assessor no BTG → colaborador → área atual.
 *
 * A lista é a dos códigos que aparecem nos relatórios do CRM. Para cada código sem
 * colaborador, o nome do CRM PROPÕE um colaborador (`suggestEmployee`); uma pessoa
 * confirma, e o código é gravado em `employees.btg_advisor_code` — a ligação de verdade.
 * A linha sem dono (`SEM_CODIGO`) não se liga a ninguém: fica sem área, à vista.
 */
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, Money, SpendTable, Tag, Td, Th } from "@/features/spending/components/ui";
import { formatDate } from "@/lib/dates";

import type { AdvisorCodeRow, AdvisorLink, LinkableEmployee } from "../api";
import { CRM_BUCKET_ADVISOR_CODE, suggestEmployee } from "../compute";
import { useSetAdvisorCode } from "../hooks";

interface Props {
  codes: AdvisorCodeRow[];
  links: AdvisorLink[];
  employees: LinkableEmployee[];
  areaName: (id: string | null) => string;
  canEdit: boolean;
}

const NONE = "__none__";

export function AdvisorLinksSection({ codes, links, employees, areaName, canEdit }: Props) {
  const setCode = useSetAdvisorCode();
  const linkByCode = new Map(links.map((l) => [l.advisorCode, l]));
  const free = employees.filter((e) => !e.btgAdvisorCode);
  const unlinked = codes.filter(
    (c) => !linkByCode.has(c.advisorCode) && c.advisorCode !== CRM_BUCKET_ADVISOR_CODE,
  );

  const link = (employeeId: string, code: string | null, label: string) =>
    setCode.mutate(
      { employeeId, code },
      {
        onSuccess: () => toast.success(label),
        onError: (e) =>
          toast.error("Não foi possível gravar o código", {
            description: e instanceof Error ? e.message : undefined,
          }),
      },
    );

  if (codes.length === 0) {
    return (
      <EmptyState>
        Nenhum código de assessor nos relatórios sincronizados. Sincronize com o CRM na aba
        Sincronização.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      {unlinked.length > 0 && (
        <p className="text-sm text-text-muted">
          {unlinked.length} código(s) sem colaborador — a receita deles fica sem área até ligar.
          {employees.length === 0 && " Ligar código exige acesso à folha (colaboradores)."}
        </p>
      )}
      <SpendTable>
        <thead className="bg-surface-2">
          <tr>
            <Th align="left">Código</Th>
            <Th align="left">Assessor no CRM</Th>
            <Th>Comissão no período</Th>
            <Th align="left">Último mês</Th>
            <Th align="left">Colaborador</Th>
            <Th align="left">Área</Th>
          </tr>
        </thead>
        <tbody>
          {codes.map((c) => {
            const linked = linkByCode.get(c.advisorCode);
            const isBucket = c.advisorCode === CRM_BUCKET_ADVISOR_CODE;
            const suggestion = linked || isBucket ? null : suggestEmployee(c.advisorName, free);
            return (
              <tr key={c.advisorCode} className="border-t border-border">
                <Td align="left" className="font-mono text-xs">
                  {c.advisorCode}
                </Td>
                <Td align="left">
                  {c.advisorName ?? "—"} {c.advisorActive === false && <Tag>inativo no CRM</Tag>}
                </Td>
                <Td>
                  <Money value={c.commission} />
                </Td>
                <Td align="left" className="text-text-muted">
                  {formatDate(c.lastMonth, "MMM/yyyy")}
                </Td>
                <Td align="left">
                  {isBucket ? (
                    <span className="text-xs text-text-muted">
                      <Tag tone="warning">sem assessor</Tag> não se liga: fica sem área
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Select
                        value={linked?.employeeId ?? NONE}
                        disabled={!canEdit || employees.length === 0 || setCode.isPending}
                        onValueChange={(value) => {
                          if (value === NONE && linked) {
                            link(linked.employeeId, null, "Código desligado");
                          } else if (value !== NONE) {
                            link(value, c.advisorCode, "Código ligado ao colaborador");
                          }
                        }}
                      >
                        <SelectTrigger size="sm" className="w-64">
                          <SelectValue placeholder="sem colaborador" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>sem colaborador</SelectItem>
                          {linked && (
                            <SelectItem value={linked.employeeId}>{linked.employeeName}</SelectItem>
                          )}
                          {free.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.fullName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {suggestion && canEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={setCode.isPending}
                          onClick={() =>
                            link(suggestion.id, c.advisorCode, `Ligado a ${suggestion.fullName}`)
                          }
                        >
                          Ligar a {suggestion.fullName}?
                        </Button>
                      )}
                    </div>
                  )}
                </Td>
                <Td align="left" className={linked?.areaId ? "" : "text-text-muted italic"}>
                  {linked ? areaName(linked.areaId) : "sem área"}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </SpendTable>
      <p className="text-xs text-text-muted">
        A área é a do colaborador hoje: mudar alguém de área move a receita dele junto, também nos
        meses passados — a mesma regra da folha.
      </p>
    </div>
  );
}

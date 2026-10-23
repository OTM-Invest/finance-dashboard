import * as React from "react";
import { Link2, Loader2, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { type CostCenter } from "@/features/cost-centers/api";
import { CostCenterDrawer } from "@/features/cost-centers/components/CostCenterDrawer";
import { useCostCenters, useMergeCostCenters } from "@/features/cost-centers/hooks";
import { cn } from "@/lib/cn";

/**
 * Central de custos: UMA lista, da organização inteira.
 *
 * Não há seletor de empresa porque centro de custo não pertence a empresa — o mesmo
 * "Comercial" vale para todas, e é isso que faz o relatório consolidado somar sem
 * depender de casar nomes parecidos.
 *
 * Duplicata (o mesmo conceito cadastrado duas vezes com nomes diferentes) se resolve
 * FUNDINDO: as referências passam para o centro escolhido e o outro é apagado. É
 * permanente de propósito — organiza-se uma vez, depois é só usar.
 */
export default function SettingsCostCentersPage() {
  const { companies } = useCompanyScope();
  const organizationId = companies[0]?.organization_id ?? "";

  const { data: rows = [], isLoading } = useCostCenters();
  const merge = useMergeCostCenters();

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CostCenter | null>(null);

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [targetId, setTargetId] = React.useState<string | null>(null);
  const [confirmMerge, setConfirmMerge] = React.useState(false);

  const selected = rows.filter((r) => selectedIds.includes(r.id));
  // O destino tem que ser um dos escolhidos, e a escolha morre se ele sair da seleção.
  const effectiveTarget = targetId && selectedIds.includes(targetId) ? targetId : selectedIds[0];
  const targetName = rows.find((r) => r.id === effectiveTarget)?.name ?? "—";

  function toggle(id: string, on: boolean) {
    setSelectedIds((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  function submitMerge() {
    if (!effectiveTarget || selected.length < 2) return;
    merge.mutate(
      {
        sourceIds: selectedIds.filter((id) => id !== effectiveTarget),
        targetId: effectiveTarget,
      },
      {
        onSuccess: (moved) => {
          toast.success(`Fundido em "${targetName}"`, {
            description: `${moved} lançamento(s) passaram para esta área.`,
          });
          setSelectedIds([]);
          setTargetId(null);
          setConfirmMerge(false);
        },
        onError: (err) => {
          toast.error("Não foi possível fundir", { description: err.message });
          setConfirmMerge(false);
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Áreas</h2>
          <p className="mt-1 text-sm text-text-muted">
            Para qual time é cada gasto — uma lista só, usada por todas as empresas do grupo. O que
            o gasto é (receita, imposto, capex) não é área: sai da conta, pelo plano gerencial.
          </p>
        </div>
        <Button
          disabled={!organizationId}
          onClick={() => {
            setEditing(null);
            setDrawerOpen(true);
          }}
        >
          <Plus className="size-4" /> Novo
        </Button>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] border border-accent bg-accent-soft/30 p-3">
          <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
            <Label htmlFor="merge-target">Manter qual área?</Label>
            <Select
              value={effectiveTarget}
              onValueChange={(v) => setTargetId(v)}
              disabled={selected.length < 2}
            >
              <SelectTrigger id="merge-target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {selected.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-2xs text-text-subtle">
              {selected.length === 1
                ? "Escolha mais uma área para fundir."
                : `Os outros ${selected.length - 1} serão apagados e tudo que aponta para eles passa para este.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setSelectedIds([])}>
              Cancelar
            </Button>
            <Button
              disabled={selected.length < 2 || merge.isPending}
              onClick={() => setConfirmMerge(true)}
            >
              {merge.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Link2 className="size-4" />
              )}
              Fundir
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Nenhuma área cadastrada.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60">
              <tr className="border-b border-border">
                <Th>
                  <span className="sr-only">Selecionar</span>
                </Th>
                <Th>Nome</Th>
                <Th>Descrição</Th>
                <Th align="right">Status</Th>
                <Th align="right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-border last:border-0 hover:bg-surface-2/50",
                    !row.is_active && "opacity-60",
                    selectedIds.includes(row.id) && "bg-accent-soft/20",
                  )}
                >
                  <td className="pl-4">
                    <Checkbox
                      checked={selectedIds.includes(row.id)}
                      onCheckedChange={(next) => toggle(row.id, next === true)}
                      aria-label={`Selecionar ${row.name}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="max-w-[400px] truncate px-4 py-3 text-text-muted">
                    {row.description ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.is_active ? (
                      <Badge tone="income">Ativo</Badge>
                    ) : (
                      <Badge tone="default">Inativo</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          aria-label="Ações"
                          className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-text-muted hover:bg-surface-2 hover:text-text"
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditing(row);
                            setDrawerOpen(true);
                          }}
                        >
                          <Pencil className="size-4" /> Editar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {organizationId && (
        <CostCenterDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          costCenter={editing}
          organizationId={organizationId}
        />
      )}

      <ConfirmDialog
        open={confirmMerge}
        onOpenChange={setConfirmMerge}
        title={`Fundir em "${targetName}"?`}
        description={
          <>
            Tudo que aponta para as outras {selected.length - 1} área(s) — lançamentos,
            recorrências, colaboradores e as linhas do balanço — passa para{" "}
            <strong>{targetName}</strong>, e elas são apagadas.
            <br />
            <br />
            <strong>Não tem como desfazer.</strong> Nenhum valor muda: o lançamento continua
            existindo, só classificado na área que ficou.
          </>
        }
        confirmLabel="Fundir"
        pending={merge.isPending}
        onConfirm={submitMerge}
      />
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={cn(
        "text-2xs px-4 py-2.5 font-medium tracking-wide text-text-subtle uppercase",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

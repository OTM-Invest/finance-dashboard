import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";

import type { ManagementAccount } from "../api";
import { useCreateManagementAccount, useUpdateManagementAccount } from "../hooks";
import { managementItemFormSchema, type ManagementItemFormValues } from "../schema";
import { EXPENSE_NATURES, NATURE_LABELS, nextItemCode } from "../tree";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Grupo do item — o novo nasce nele; o existente não muda de grupo por aqui. */
  group: ManagementAccount;
  /** `null` = criar um item novo no grupo. */
  item: ManagementAccount | null;
  existingCodes: ReadonlySet<string>;
}

export function ManagementItemDrawer({ open, onOpenChange, group, item, existingCodes }: Props) {
  const isEditing = Boolean(item);
  const isExpense = group.kind === "expense";
  const create = useCreateManagementAccount();
  const update = useUpdateManagementAccount();
  const pending = create.isPending || update.isPending;

  const initialValues = React.useMemo<ManagementItemFormValues>(
    () => ({
      name: item?.name ?? "",
      description: item?.description ?? null,
      nature: item ? item.nature : group.nature,
      isActive: item?.is_active ?? true,
    }),
    [item, group],
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ManagementItemFormValues>({
    resolver: zodResolver(managementItemFormSchema),
    defaultValues: initialValues,
  });

  React.useEffect(() => {
    if (open) reset(initialValues);
  }, [open, initialValues, reset]);

  const onSubmit = handleSubmit((values) => {
    const fields = {
      name: values.name,
      description: values.description,
      // Natureza só existe em gasto, e em gasto é obrigatória; o banco recusa os dois erros.
      nature: isExpense ? (values.nature ?? group.nature) : null,
      is_active: values.isActive,
    };
    const onError = (err: Error) => toast.error("Erro ao salvar", { description: err.message });

    if (item) {
      update.mutate(
        { id: item.id, payload: fields },
        {
          onSuccess: () => {
            toast.success("Item atualizado");
            onOpenChange(false);
          },
          onError,
        },
      );
      return;
    }

    create.mutate(
      {
        ...fields,
        organization_id: group.organization_id,
        parent_id: group.id,
        code: nextItemCode(group.code, values.name, existingCodes),
        kind: group.kind,
        requires_detail: group.requires_detail,
        sort_order: group.sort_order + 99,
      },
      {
        onSuccess: () => {
          toast.success("Item criado");
          onOpenChange(false);
        },
        onError,
      },
    );
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="sm" className="flex flex-col p-0">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Editar item" : `Novo item em ${group.name}`}</SheetTitle>
          <SheetDescription>
            O item classifica o gasto pelo que ele é. Contas e, mais adiante, linhas de fatura de
            cartão apontam para ele.
          </SheetDescription>
        </SheetHeader>
        <form
          onSubmit={onSubmit}
          key={item?.id ?? `new-${group.id}`}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <SheetBody className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="management-name">Nome</Label>
              <Input
                id="management-name"
                placeholder="Segurança da informação"
                {...register("name")}
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name && <p className="text-2xs text-expense">{errors.name.message}</p>}
              {item && <p className="text-2xs text-text-subtle">Código: {item.code}</p>}
            </div>

            {isExpense && (
              <div className="flex flex-col gap-1.5">
                <Label>Natureza</Label>
                <Controller
                  name="nature"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Escolha" />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPENSE_NATURES.map((n) => (
                          <SelectItem key={n} value={n}>
                            {NATURE_LABELS[n]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-2xs text-text-subtle">
                  Capex é investimento (equipamento, mobiliário); entra na linha CAPEX do Balanço,
                  fora do EBITDA.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="management-description">
                Descrição <span className="text-text-subtle">(opcional)</span>
              </Label>
              <Controller
                name="description"
                control={control}
                render={({ field }) => (
                  <Textarea
                    id="management-description"
                    rows={3}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                  />
                )}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Controller
                name="isActive"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ? "active" : "inactive"}
                    onValueChange={(v) => field.onChange(v === "active")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="inactive">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
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
              {isEditing ? "Salvar" : "Criar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

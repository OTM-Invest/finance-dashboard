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

import type { CostCenter } from "../api";
import { useCreateCostCenter, useUpdateCostCenter } from "../hooks";
import { costCenterFormSchema, emptyCostCenterForm, type CostCenterFormValues } from "../schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  costCenter: CostCenter | null;
  /** Organização da central — o centro é global, não de uma empresa. */
  organizationId: string;
}

export function CostCenterDrawer({ open, onOpenChange, costCenter, organizationId }: Props) {
  const isEditing = Boolean(costCenter);
  const create = useCreateCostCenter();
  const update = useUpdateCostCenter();
  const pending = create.isPending || update.isPending;

  const initialValues = React.useMemo<CostCenterFormValues>(() => {
    if (costCenter) {
      return {
        name: costCenter.name,
        description: costCenter.description,
        isActive: costCenter.is_active,
      };
    }
    return emptyCostCenterForm();
  }, [costCenter]);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<CostCenterFormValues>({
    resolver: zodResolver(costCenterFormSchema),
    defaultValues: initialValues,
  });

  React.useEffect(() => {
    if (open) {
      reset(initialValues);
    }
  }, [open, initialValues, reset]);

  const onSubmit = handleSubmit((values) => {
    const payload = {
      organization_id: organizationId,
      name: values.name,
      description: values.description,
      is_active: values.isActive,
    };
    if (isEditing && costCenter) {
      update.mutate(
        { id: costCenter.id, payload },
        {
          onSuccess: () => {
            toast.success("Área atualizada");
            onOpenChange(false);
          },
          onError: (err) => toast.error("Erro ao salvar", { description: err.message }),
        },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          toast.success("Área criada");
          onOpenChange(false);
        },
        onError: (err) => toast.error("Erro ao criar", { description: err.message }),
      });
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="sm" className="flex flex-col p-0">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Editar área" : "Nova área"}</SheetTitle>
          <SheetDescription>
            A área diz para qual time é o gasto. O que o gasto é sai da conta, pelo plano gerencial.
          </SheetDescription>
        </SheetHeader>
        <form
          onSubmit={onSubmit}
          key={costCenter?.id ?? "new"}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <SheetBody className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                placeholder="Comercial"
                {...register("name")}
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name && <p className="text-2xs text-expense">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">
                Descrição <span className="text-text-subtle">(opcional)</span>
              </Label>
              <Controller
                name="description"
                control={control}
                render={({ field }) => (
                  <Textarea
                    id="description"
                    rows={3}
                    value={field.value ?? ""}
                    onChange={(e) => {
                      field.onChange(e.target.value === "" ? null : e.target.value);
                    }}
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

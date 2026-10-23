import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
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
import { useCostCenters } from "@/features/cost-centers/hooks";

import type { Employee } from "../api";
import { useCreateEmployee, useUpdateEmployee } from "../hooks";
import {
  EMPLOYEE_KINDS,
  EMPLOYEE_STATUSES,
  employeeFormSchema,
  emptyEmployeeForm,
  type EmployeeFormValues,
} from "../schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
  companyId: string;
}

export function EmployeeDrawer({ open, onOpenChange, employee, companyId }: Props) {
  const isEditing = Boolean(employee);
  const create = useCreateEmployee();
  const update = useUpdateEmployee();
  const pending = create.isPending || update.isPending;
  const { data: costCenters = [] } = useCostCenters();

  const initialValues = React.useMemo<EmployeeFormValues>(() => {
    if (employee) {
      return {
        companyId: employee.company_id,
        costCenterId: employee.cost_center_id,
        fullName: employee.full_name,
        cpf: employee.cpf,
        email: employee.email,
        role: employee.role,
        department: employee.department,
        employeeKind: employee.employee_kind,
        baseSalary: employee.base_salary,
        hireDate: employee.hire_date,
        terminationDate: employee.termination_date,
        status: employee.status,
        isPartner: employee.is_partner,
        notes: employee.notes,
      };
    }
    return emptyEmployeeForm(companyId);
  }, [employee, companyId]);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: initialValues,
  });

  React.useEffect(() => {
    reset(initialValues);
  }, [initialValues, reset]);

  const onSubmit = handleSubmit((values) => {
    const payload = {
      company_id: values.companyId,
      cost_center_id: values.costCenterId,
      full_name: values.fullName,
      cpf: values.cpf,
      email: values.email === "" ? null : values.email,
      role: values.role,
      department: values.department,
      employee_kind: values.employeeKind,
      base_salary: values.baseSalary,
      hire_date: values.hireDate,
      termination_date: values.terminationDate,
      status: values.status,
      is_partner: values.isPartner,
      notes: values.notes,
    };
    if (isEditing && employee) {
      update.mutate(
        { id: employee.id, payload },
        {
          onSuccess: () => {
            toast.success("Colaborador atualizado");
            onOpenChange(false);
          },
          onError: (err) => toast.error("Erro ao salvar", { description: err.message }),
        },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          toast.success("Colaborador criado");
          onOpenChange(false);
        },
        onError: (err) => toast.error("Erro ao criar", { description: err.message }),
      });
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md" className="flex flex-col p-0">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Editar colaborador" : "Novo colaborador"}</SheetTitle>
          <SheetDescription>Cadastro pessoal que alimenta a folha mensal.</SheetDescription>
        </SheetHeader>
        <form
          onSubmit={onSubmit}
          key={employee?.id ?? "new"}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <SheetBody className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Nome completo</Label>
              <Input
                id="fullName"
                {...register("fullName")}
                aria-invalid={Boolean(errors.fullName)}
              />
              {errors.fullName && (
                <p className="text-2xs text-expense">{errors.fullName.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="role">
                  Cargo <span className="text-text-subtle">(opcional)</span>
                </Label>
                <Controller
                  name="role"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="role"
                      placeholder="Assessor"
                      value={field.value ?? ""}
                      onChange={(e) => {
                        field.onChange(e.target.value === "" ? null : e.target.value);
                      }}
                    />
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="employeeKind">Tipo</Label>
                <Controller
                  name="employeeKind"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="employeeKind">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EMPLOYEE_KINDS.map((k) => (
                          <SelectItem key={k.value} value={k.value}>
                            {k.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cpf">
                  CPF <span className="text-text-subtle">(opcional)</span>
                </Label>
                <Controller
                  name="cpf"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="cpf"
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value === "" ? null : e.target.value)
                      }
                    />
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">
                  E-mail <span className="text-text-subtle">(opcional)</span>
                </Label>
                <Controller
                  name="email"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="email"
                      type="email"
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value === "" ? null : e.target.value)
                      }
                    />
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="baseSalary">Salário-base</Label>
                <Controller
                  name="baseSalary"
                  control={control}
                  render={({ field }) => (
                    <CurrencyInput
                      id="baseSalary"
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="costCenter">
                  Área <span className="text-text-subtle">(opcional)</span>
                </Label>
                <Controller
                  name="costCenterId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? "__none__"}
                      onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}
                    >
                      <SelectTrigger id="costCenter">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— sem área —</SelectItem>
                        {costCenters.map((cc) => (
                          <SelectItem key={cc.id} value={cc.id}>
                            {cc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="hireDate">Admissão</Label>
                <Input id="hireDate" type="date" {...register("hireDate")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="terminationDate">
                  Demissão <span className="text-text-subtle">(opcional)</span>
                </Label>
                <Controller
                  name="terminationDate"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="terminationDate"
                      type="date"
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value === "" ? null : e.target.value)
                      }
                    />
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EMPLOYEE_STATUSES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="isPartner">Sócio</Label>
                <Controller
                  name="isPartner"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ? "yes" : "no"}
                      onValueChange={(v) => field.onChange(v === "yes")}
                    >
                      <SelectTrigger id="isPartner">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no">Não</SelectItem>
                        <SelectItem value="yes">Sim — recebe dividendos</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">
                Notas <span className="text-text-subtle">(opcional)</span>
              </Label>
              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <Textarea
                    id="notes"
                    rows={3}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                  />
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

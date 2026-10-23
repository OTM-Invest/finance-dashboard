import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useCostCenters } from "./hooks";

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  id?: string;
  placeholder?: string;
}

const NONE = "__none__";

export function CostCenterSelect({ value, onChange, id, placeholder = "Sem área" }: Props) {
  // A central é global: as opções não dependem da empresa do lançamento.
  const { data: costCenters = [], isLoading } = useCostCenters();
  const active = costCenters.filter((c) => c.is_active);

  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      disabled={isLoading}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>— {placeholder}</SelectItem>
        {active.map((cc) => (
          <SelectItem key={cc.id} value={cc.id}>
            {cc.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

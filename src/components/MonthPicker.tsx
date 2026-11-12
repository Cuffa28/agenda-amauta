import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addMonths, currentMonthInBuenosAires, formatMonthLabel, isValidMonth } from "@/domain/dates";

export function MonthPicker({ value, onChange }: { value: string; onChange: (month: string) => void }) {
  const current = currentMonthInBuenosAires();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="icon" aria-label="Mes anterior" onClick={() => onChange(addMonths(value, -1))}>
        <ChevronLeft />
      </Button>
      <Input
        type="month"
        aria-label="Mes de revisión"
        value={value}
        onChange={(e) => isValidMonth(e.target.value) && onChange(e.target.value)}
        className="w-44 bg-card font-mono"
      />
      <Button variant="outline" size="icon" aria-label="Mes siguiente" onClick={() => onChange(addMonths(value, 1))}>
        <ChevronRight />
      </Button>
      {value !== current && (
        <Button variant="ghost" size="sm" onClick={() => onChange(current)}>
          Ir a {formatMonthLabel(current).toLowerCase()}
        </Button>
      )}
    </div>
  );
}


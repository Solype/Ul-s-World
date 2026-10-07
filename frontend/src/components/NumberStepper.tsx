import { Minus, Plus } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  onChange?: (value: number) => void;
  min?: number;
  /** Sans `max`, pas de limite. Le bouton « + » disparaît quand `value >= max`. */
  max?: number;
  /** Valeur calculée (ex. Magie en mode règles) : affichée sans boutons ni saisie. */
  readOnly?: boolean;
  invalid?: boolean;
  title?: string;
  className?: string;
};

/**
 * Champ numérique avec boutons − / + (style « number input with plus/minus buttons » d'Origin UI).
 * Un bouton qui ne peut pas servir est invisible et ne reçoit aucun clic, et toute valeur est ramenée
 * entre `min` et `max`. (Pas d'attribut `disabled` : InputGroup estomperait tout le champ.)
 */
export default function NumberStepper({ value, onChange, min = 0, max, readOnly, invalid, title, className }: Props) {
  if (readOnly || !onChange) {
    return (
      <span title={title}
        className={cn("inline-flex h-8 min-w-12 items-center justify-center rounded-lg border border-dashed px-2 text-sm tabular-nums text-muted-foreground", className)}>
        {value}
      </span>
    );
  }
  const clamp = (v: number) => Math.max(min, max === undefined ? v : Math.min(max, v));
  const canAdd = max === undefined || value < max;
  const canRemove = value > min;
  return (
    <InputGroup className={cn("w-26 shrink-0", className)} title={title}>
      <InputGroupAddon align="inline-start">
        <InputGroupButton size="icon-xs" aria-label="Retirer 1" aria-disabled={!canRemove} tabIndex={-1}
          className={cn(!canRemove && "pointer-events-none invisible")} onClick={() => canRemove && onChange(clamp(value - 1))}>
          <Minus />
        </InputGroupButton>
      </InputGroupAddon>
      <InputGroupInput type="number" inputMode="numeric" min={min} max={max} value={value} aria-invalid={invalid || undefined}
        className="text-center tabular-nums"
        // Pendant la saisie on ne bloque que le dépassement du max ; le min est appliqué en quittant le champ.
        onChange={(e) => onChange(Math.min(max ?? Infinity, e.target.value === "" ? 0 : Number(e.target.value)))}
        onBlur={() => value !== clamp(value) && onChange(clamp(value))} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" aria-label="Ajouter 1" aria-disabled={!canAdd} tabIndex={-1}
          className={cn(!canAdd && "pointer-events-none invisible")} onClick={() => canAdd && onChange(clamp(value + 1))}>
          <Plus />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

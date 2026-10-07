import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  relations: string[];
  /** Mode règles : nombre de relations achetées avec les PC restants. `null` en création libre. */
  bought: number | null;
  invalid?: boolean;
  onChange: (relations: string[]) => void;
};

/** Relations du personnage : un PNJ, un lieu ou une culture, à déclarer au MJ (1 PC = 1 relation). */
export default function RelationsField({ relations, bought, invalid, onChange }: Props) {
  const declared = relations.filter((r) => r.trim()).length;
  const canAdd = bought === null || relations.length < bought;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Relations : un PNJ, un lieu ou une culture, à déclarer au MJ.</span>
        {bought !== null && (
          <Badge variant={declared === bought ? "outline" : "secondary"} className={declared === bought ? "text-success" : undefined}>
            {declared} / {bought}
          </Badge>
        )}
      </div>
      {bought === 0 && relations.length === 0 && (
        <span className="text-xs text-muted-foreground">Dépense des PC restants en « Relations » (Priorités) : 1 PC par relation.</span>
      )}
      {relations.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input className="max-w-sm" placeholder="ex. Le capitaine du port de Mannheim" value={r} aria-invalid={invalid || undefined}
            onChange={(e) => onChange(relations.map((x, j) => (j === i ? e.target.value : x)))} />
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Supprimer"
            onClick={() => onChange(relations.filter((_, j) => j !== i))}><Trash2 /></Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" disabled={!canAdd} onClick={() => onChange([...relations, ""])}>
          <Plus data-icon="inline-start" />Relation
        </Button>
      </div>
    </div>
  );
}

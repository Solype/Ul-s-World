import { Eye, EyeOff, Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Instance } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Status = NonNullable<Instance["statuses"]>[number];

export type StatusActions = {
  onAdd: (label: string, hidden: boolean) => Promise<boolean>;
  onRemove: (id: string) => void;
  /** MJ : cacher ou révéler. */
  onToggleHidden: (id: string, hidden: boolean) => void;
};

type Props = StatusActions & {
  statuses: Status[];
  canEdit: boolean;
  isGM: boolean;
  /** Statuts déjà utilisés dans la room, proposés à la saisie. */
  suggestions: string[];
};

/**
 * Statuts d'un personnage en jeu : tags libres (enflammé, empoisonné...). Les statuts cachés n'arrivent
 * qu'au MJ (filtrés par le serveur) ; ils s'affichent en pointillés avec un œil barré.
 */
export default function StatusTags({ statuses, canEdit, isGM, suggestions, onAdd, onRemove, onToggleHidden }: Props) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [hidden, setHidden] = useState(false);
  const present = new Set(statuses.map((s) => s.label.toLocaleLowerCase()));
  const proposals = suggestions
    .filter((s) => !present.has(s.toLocaleLowerCase()))
    .filter((s) => s.toLocaleLowerCase().includes(label.trim().toLocaleLowerCase()))
    .slice(0, 8);

  const add = async (value: string) => {
    if (!value.trim()) return;
    if (await onAdd(value.trim(), isGM && hidden)) { setLabel(""); setOpen(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); add(label); };

  if (!canEdit && statuses.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {statuses.map((s) => (
        <Badge key={s.id} variant={s.hidden ? "outline" : "secondary"}
          className={cn("gap-1", s.hidden && "border-dashed text-muted-foreground")}
          title={s.hidden ? "Visible par le MJ seulement" : undefined}>
          {s.hidden && <EyeOff className="size-3" />}
          {s.label}
          {isGM && (
            <button type="button" className="rounded-sm opacity-60 hover:opacity-100" onClick={() => onToggleHidden(s.id, !s.hidden)}
              aria-label={s.hidden ? `Révéler ${s.label}` : `Cacher ${s.label}`} title={s.hidden ? "Révéler aux joueurs" : "Cacher aux joueurs"}>
              {s.hidden ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
            </button>
          )}
          {canEdit && (
            <button type="button" className="rounded-sm opacity-60 hover:opacity-100" onClick={() => onRemove(s.id)}
              aria-label={`Retirer ${s.label}`} title="Retirer"><X className="size-3" /></button>
          )}
        </Badge>
      ))}
      {canEdit && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="xs" className="h-6 text-muted-foreground"><Plus data-icon="inline-start" />Statut</Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64">
            <form className="flex flex-col gap-3" onSubmit={submit}>
              <div className="flex gap-2">
                <Input autoFocus placeholder="Enflammé, empoisonné..." value={label} maxLength={40}
                  onChange={(e) => setLabel(e.target.value)} />
                <Button type="submit" size="icon" aria-label="Ajouter" disabled={!label.trim()}><Plus /></Button>
              </div>
              {proposals.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {proposals.map((p) => (
                    <button key={p} type="button" onClick={() => add(p)}>
                      <Badge variant="outline" className="cursor-pointer hover:bg-muted">{p}</Badge>
                    </button>
                  ))}
                </div>
              )}
              {isGM && (
                <Label className="flex items-center gap-2 font-normal">
                  <Checkbox checked={hidden} onCheckedChange={(v) => setHidden(v === true)} />
                  Visible par le MJ seulement
                </Label>
              )}
            </form>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

import { Check, Eye, EyeOff, Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { components } from "@/api/schema";
import type { Instance } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Status = NonNullable<Instance["statuses"]>[number];
export type StatusColor = components["schemas"]["StatusColor"];
export type StatusSuggestion = { label: string; color: StatusColor };

/** Palette des statuts (noms : schemas.StatusColor). Badge : fond pâle en clair, foncé en sombre. */
const COLORS: Record<StatusColor, { label: string; badge: string; swatch: string }> = {
  neutre: { label: "Neutre", badge: "bg-secondary text-secondary-foreground border-border", swatch: "bg-muted-foreground/40" },
  rouge: { label: "Rouge", badge: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-200 dark:border-red-800", swatch: "bg-red-500" },
  orange: { label: "Orange", badge: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-800", swatch: "bg-orange-500" },
  jaune: { label: "Jaune", badge: "bg-yellow-100 text-yellow-900 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-200 dark:border-yellow-800", swatch: "bg-yellow-400" },
  vert: { label: "Vert", badge: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800", swatch: "bg-emerald-500" },
  bleu: { label: "Bleu", badge: "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800", swatch: "bg-sky-500" },
  violet: { label: "Violet", badge: "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-800", swatch: "bg-violet-500" },
  rose: { label: "Rose", badge: "bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-950 dark:text-pink-200 dark:border-pink-800", swatch: "bg-pink-500" },
};
const COLOR_KEYS = Object.keys(COLORS) as StatusColor[];

export type StatusActions = {
  onAdd: (label: string, hidden: boolean, color: StatusColor) => Promise<boolean>;
  onRemove: (id: string) => void;
  onRecolor: (id: string, color: StatusColor) => void;
  /** MJ : cacher ou révéler. */
  onToggleHidden: (id: string, hidden: boolean) => void;
};

type Props = StatusActions & {
  statuses: Status[];
  canEdit: boolean;
  isGM: boolean;
  /** Statuts déjà utilisés dans la room, avec leur couleur, proposés à la saisie. */
  suggestions: StatusSuggestion[];
};

function Swatches({ value, onChange }: { value: StatusColor; onChange: (c: StatusColor) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Couleur">
      {COLOR_KEYS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={COLORS[c].label} title={COLORS[c].label}
          onClick={() => onChange(c)}
          className={cn("flex size-6 items-center justify-center rounded-full ring-offset-2 ring-offset-popover transition",
            COLORS[c].swatch, value === c ? "ring-2 ring-foreground" : "hover:ring-2 hover:ring-foreground/30")}>
          {value === c && <Check className={cn("size-3.5 drop-shadow-sm", c === "jaune" ? "text-black/70" : "text-white")} />}
        </button>
      ))}
    </div>
  );
}

/** Un badge de statut ; cliquer sur l'intitulé ouvre le choix de couleur (si on peut le modifier). */
function StatusBadge({ status, canEdit, isGM, onRemove, onRecolor, onToggleHidden }: {
  status: Status; canEdit: boolean; isGM: boolean;
} & Pick<StatusActions, "onRemove" | "onRecolor" | "onToggleHidden">) {
  const color = COLORS[status.color ?? "neutre"];
  const text = (
    <>
      {status.hidden && <EyeOff className="size-3" />}
      {status.label}
    </>
  );
  return (
    <Badge variant="outline" className={cn("gap-1", color.badge, status.hidden && "border-dashed opacity-80")}
      title={status.hidden ? "Visible par le MJ seulement" : undefined}>
      {canEdit ? (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="flex items-center gap-1" title="Changer la couleur">{text}</button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto">
            <Swatches value={status.color ?? "neutre"} onChange={(c) => onRecolor(status.id, c)} />
          </PopoverContent>
        </Popover>
      ) : text}
      {isGM && (
        <button type="button" className="rounded-sm opacity-60 hover:opacity-100" onClick={() => onToggleHidden(status.id, !status.hidden)}
          aria-label={status.hidden ? `Révéler ${status.label}` : `Cacher ${status.label}`}
          title={status.hidden ? "Révéler aux joueurs" : "Cacher aux joueurs"}>
          {status.hidden ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
        </button>
      )}
      {canEdit && (
        <button type="button" className="rounded-sm opacity-60 hover:opacity-100" onClick={() => onRemove(status.id)}
          aria-label={`Retirer ${status.label}`} title="Retirer"><X className="size-3" /></button>
      )}
    </Badge>
  );
}

/**
 * Statuts d'un personnage en jeu : tags libres (enflammé, empoisonné...) avec une couleur. Les statuts
 * cachés n'arrivent qu'au MJ (filtrés par le serveur) ; ils s'affichent en pointillés avec un œil barré.
 */
export default function StatusTags({ statuses, canEdit, isGM, suggestions, onAdd, onRemove, onRecolor, onToggleHidden }: Props) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [hidden, setHidden] = useState(false);
  const [color, setColor] = useState<StatusColor>("neutre");
  const present = new Set(statuses.map((s) => s.label.toLocaleLowerCase()));
  const proposals = suggestions
    .filter((s) => !present.has(s.label.toLocaleLowerCase()))
    .filter((s) => s.label.toLocaleLowerCase().includes(label.trim().toLocaleLowerCase()))
    .slice(0, 8);

  const add = async (value: string, c: StatusColor) => {
    if (!value.trim()) return;
    if (await onAdd(value.trim(), isGM && hidden, c)) { setLabel(""); setColor("neutre"); setOpen(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); add(label, color); };

  if (!canEdit && statuses.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {statuses.map((s) => (
        <StatusBadge key={s.id} status={s} canEdit={canEdit} isGM={isGM}
          onRemove={onRemove} onRecolor={onRecolor} onToggleHidden={onToggleHidden} />
      ))}
      {canEdit && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="xs" className="h-6 text-muted-foreground"><Plus data-icon="inline-start" />Statut</Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <form className="flex flex-col gap-3" onSubmit={submit}>
              <div className="flex gap-2">
                <Input autoFocus placeholder="Enflammé, empoisonné..." value={label} maxLength={40}
                  onChange={(e) => setLabel(e.target.value)} />
                <Button type="submit" size="icon" aria-label="Ajouter" disabled={!label.trim()}><Plus /></Button>
              </div>
              <Swatches value={color} onChange={setColor} />
              {proposals.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {/* Une suggestion reprend la couleur qu'elle a déjà dans la room. */}
                  {proposals.map((p) => (
                    <button key={p.label} type="button" onClick={() => add(p.label, p.color)}>
                      <Badge variant="outline" className={cn("cursor-pointer hover:opacity-80", COLORS[p.color].badge)}>{p.label}</Badge>
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

import { Swords } from "lucide-react";
import { useId, useState } from "react";
import type { MonitorDef } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { damageAfterArmor } from "@/lib/damage";
import { cn } from "@/lib/utils";

export type DamageInput = { monitor: string; damage: number; armor: number; penetration: number };

/** Champ numérique positif ; vide = 0. */
function NumberField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} inputMode="numeric" value={value} placeholder="0" className="h-8 text-center tabular-nums"
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} />
    </div>
  );
}

/**
 * Infliger une attaque à un personnage en jeu : moniteur touché, dégâts, armure et pénétration de l'arme
 * (règle : backend/app/rules/damage.py). L'aperçu montre ce qui passe l'armure avant d'appliquer.
 */
export default function DamagePopover({ monitors, defs, naturalArmor, onDamage }: {
  /** Moniteurs de condition du personnage (sans le mana). */
  monitors: string[];
  defs: Record<string, MonitorDef>;
  /** Armure naturelle (monstres) : armure proposée contre les dégâts physiques. */
  naturalArmor?: number | null;
  onDamage: (input: DamageInput) => Promise<boolean>;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [monitor, setMonitor] = useState(monitors[0]);
  const [damage, setDamage] = useState("");
  const [armor, setArmor] = useState("");
  const [penetration, setPenetration] = useState("");
  const defaultArmor = (m: string) => (m === "physique" && naturalArmor ? String(naturalArmor) : "");
  const choose = (m: string) => { setMonitor(m); setArmor(defaultArmor(m)); };

  const d = Number(damage || 0), a = Number(armor || 0), p = Number(penetration || 0);
  const inflicted = damageAfterArmor(d, a, p);
  const detail = a <= 0 ? "sans armure, la pénétration ne compte pas"
    : d > a ? `armure ${a} − pénétration ${p} = ${Math.max(0, a - p)}, retirée des ${d} dégâts`
      : `l'armure arrête l'attaque : la pénétration passe${p > d ? `, pas plus que les ${d} dégâts` : ""}`;

  const submit = async () => {
    if (await onDamage({ monitor, damage: d, armor: a, penetration: p })) {
      setOpen(false);
      setDamage("");
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => {
      setOpen(o);
      // Réouverture : le moniteur physique et l'armure naturelle, la pénétration de la dernière arme.
      if (o) { setMonitor(monitors[0]); setArmor(defaultArmor(monitors[0])); }
    }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm"><Swords data-icon="inline-start" />Dégâts</Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-72 flex-col gap-3">
        <div role="radiogroup" aria-label="Moniteur touché" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {monitors.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={monitor === m} onClick={() => choose(m)}
              className={cn("rounded-md px-2 py-1 text-xs font-medium transition-colors",
                monitor === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {defs[m]?.label ?? m}
            </button>
          ))}
        </div>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="grid grid-cols-3 gap-2">
            <NumberField id={`${uid}-damage`} label="Dégâts" value={damage} onChange={setDamage} />
            <NumberField id={`${uid}-armor`} label="Armure" value={armor} onChange={setArmor} />
            <NumberField id={`${uid}-penetration`} label="Pénétration" value={penetration} onChange={setPenetration} />
          </div>
          <p className="text-sm">
            <span className="font-semibold">{inflicted} dégât{inflicted > 1 ? "s" : ""}</span>{" "}
            <span className="text-muted-foreground">— {detail}</span>
          </p>
          <Button type="submit" disabled={!damage}>Infliger {inflicted} à {defs[monitor]?.label ?? monitor}</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

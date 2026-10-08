import { Check } from "lucide-react";
import type { MonsterProfile, Rules } from "@/api/client";
import { Field } from "@/components/editor/Section";
import { Badge } from "@/components/ui/badge";
import { ATTRIBUTE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import NumberStepper from "./NumberStepper";

type Props = {
  rules: Rules;
  /** `null` : fiche de monstre d'avant les caractéristiques, rien n'est restreint tant qu'on n'en coche pas. */
  monster: MonsterProfile | null | undefined;
  onChange: (monster: MonsterProfile) => void;
};

/**
 * Caractéristiques d'un monstre (refdoc/Caractéristique monstres.pdf) : chacune ouvre des attributs, des
 * compétences ou la magie ; l'éditeur n'affiche ensuite que ce que le monstre possède. Cocher une
 * caractéristique coche celles qu'elle requiert (Civilisé → Intelligent, Empathique) ; décocher retire
 * celles qui en dépendaient. Les autres traits (Mort vivant...) sont descriptifs.
 */
export default function MonsterSection({ rules, monster, onChange }: Props) {
  const traits = monster?.traits ?? [];
  const defs = Object.entries(rules.monster_traits);
  const base = rules.monster_base_attributes.map((a) => ATTRIBUTE_LABELS[a]).join(", ");

  const withRequirements = (key: string, acc: Set<string>) => {
    acc.add(key);
    for (const r of rules.monster_traits[key]?.requires ?? []) withRequirements(r, acc);
    return acc;
  };
  const withoutDependents = (key: string, acc: Set<string>) => {
    acc.delete(key);
    for (const [k, d] of defs) if (acc.has(k) && (d.requires ?? []).includes(key)) withoutDependents(k, acc);
    return acc;
  };
  const toggle = (key: string) => {
    const next = traits.includes(key) ? withoutDependents(key, new Set(traits)) : withRequirements(key, new Set(traits));
    // Garde l'ordre du catalogue.
    onChange({ ...monster, traits: defs.map(([k]) => k).filter((k) => next.has(k)) });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          Entité de base : {base}, sans compétence.
          Chaque caractéristique ajoute ce qu'elle indique ; le reste n'existe pas pour ce monstre.
          {!monster && " Fiche sans caractéristiques : rien n'est restreint tant qu'aucune n'est cochée."}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {defs.filter(([, d]) => d.kind === "caracteristique").map(([k, d]) => {
            const on = traits.includes(k);
            const requires = (d.requires ?? []).map((r) => rules.monster_traits[r]?.label ?? r);
            return (
              <button key={k} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(k)}
                className={cn("flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors",
                  on ? "border-primary/60 bg-primary/5" : "hover:bg-muted")}>
                <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                  {on && <Check className="size-3" />}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    {d.label}
                    {requires.length > 0 && <Badge variant="outline" className="font-normal">requiert {requires.join(" et ")}</Badge>}
                  </span>
                  <span className="text-xs text-muted-foreground">{d.effect}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Field label="Autres traits">
        <div className="flex flex-wrap gap-1.5">
          {defs.filter(([, d]) => d.kind === "autre").map(([k, d]) => {
            const on = traits.includes(k);
            return (
              <button key={k} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(k)}
                className={cn("rounded-full border px-3 py-1 text-sm transition-colors",
                  on ? "border-primary/60 bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted")}>
                {d.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Armure naturelle">
        <NumberStepper value={monster?.natural_armor ?? 0}
          onChange={(v) => onChange({ traits, ...monster, natural_armor: v })} />
      </Field>
    </div>
  );
}

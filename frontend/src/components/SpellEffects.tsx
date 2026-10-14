import { useState } from "react";
import type { SpellEffect } from "@/api/client";
import NumberStepper from "@/components/NumberStepper";
import { cn } from "@/lib/utils";

type Scaling = "puissance" | "nombre";

const num = (n: number) => n.toLocaleString("fr-FR");

/** « 2 × P », « 1 + P »... */
function formula(e: SpellEffect, letter: string): string {
  const per = e.per ?? 0;
  const term = per === 1 ? letter : `${num(per)} × ${letter}`;
  return e.base ? `${num(e.base)} + ${term}` : term;
}

/** L'effet vaut-il à cette puissance (ou ce nombre d'enchantements) ? */
function applies(e: SpellEffect, level: number): boolean {
  return (e.at == null || level === e.at) && (e.at_least == null || level >= e.at_least);
}

/**
 * Effets d'un sort selon sa puissance P (ou le nombre N d'enchantements posés) : multiplicateurs,
 * effets propres à une puissance (P = 3) ou à partir d'un seuil (P ≥ 5). Le champ choisit P et calcule
 * les valeurs ; les effets qui ne valent pas à cette puissance sont estompés.
 */
export default function SpellEffects({ effects, scaling }: { effects: SpellEffect[]; scaling?: Scaling | null }) {
  const [level, setLevel] = useState(1);
  if (effects.length === 0) return null;
  const letter = scaling === "nombre" ? "N" : "P";
  const variable = effects.some((e) => e.per != null || e.at != null || e.at_least != null);
  return (
    <div className="flex flex-col gap-2">
      {variable && (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          {scaling === "nombre" ? "Nombre d'enchantements (N)" : "Puissance (P)"}
          <NumberStepper value={level} onChange={setLevel} min={1} />
        </label>
      )}
      <ul className="flex flex-col gap-1 text-sm">
        {effects.map((e, i) => (
          <li key={i} className={cn(variable && !applies(e, level) && "text-muted-foreground opacity-60")}>
            {e.at != null && <span className="font-semibold">{letter} = {e.at} : </span>}
            {e.at_least != null && <span className="font-semibold">{letter} ≥ {e.at_least} : </span>}
            {e.text}
            {e.per != null && (
              <>
                {" : "}{formula(e, letter)}{e.unit && ` ${e.unit}`}
                {applies(e, level) && (
                  <span className="font-semibold text-primary"> = {num((e.base ?? 0) + e.per * level)}{e.unit && ` ${e.unit}`}</span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

import { Calculator, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Attribute, Rules, TraitDef, TraitPick, ValidationReport } from "@/api/client";
import { Field } from "@/components/editor/Section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ATTRIBUTE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

type Props = {
  rules: Rules;
  traits: TraitPick[];
  species: string | null | undefined;
  report: ValidationReport | null;
  /** Mode règles : les PC des traits comptent dans les points de création. */
  rulesMode: boolean;
  onChange: (traits: TraitPick[]) => void;
};

const pcText = (pc: number) => `${pc > 0 ? "+" : "−"}${Math.abs(pc)} PC`;

function pcRange(trait: TraitDef) {
  const values = [...new Set(trait.variants.map((v) => v.pc))].sort((a, b) => Math.abs(a) - Math.abs(b));
  return values.length === 1 ? pcText(values[0]) : `${values[0] > 0 ? "+" : "−"}${values.map(Math.abs).join("/")} PC`;
}

function TraitDetails({ trait }: { trait: TraitDef }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-heading text-base font-semibold">{trait.label}</h4>
        <Badge variant={trait.kind === "bonus" ? "default" : "secondary"}>{trait.kind === "bonus" ? "Bonus" : "Malus"}</Badge>
        <Badge variant="outline">{pcRange(trait)}</Badge>
      </div>
      <p className="text-sm">{trait.effect}</p>
      {trait.automated ? (
        <p className="flex items-start gap-1.5 text-sm"><Calculator className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>Calculé par l'application : <span className="text-primary">{trait.automated}</span></span></p>
      ) : (
        <p className="text-xs text-muted-foreground">Effet descriptif : rien n'est ajouté automatiquement à la fiche.</p>
      )}
    </div>
  );
}

/** Choix d'un trait dans le catalogue : liste à gauche, détail du trait survolé à droite. */
function TraitPicker({ rules, taken, onPick }: { rules: Rules; taken: string[]; onPick: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState("");
  const entries = Object.entries(rules.traits).filter(([key, t]) => t.repeatable || !taken.includes(key));
  const shown = entries.find(([, t]) => t.label === highlighted)?.[1];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm"><Plus data-icon="inline-start" />Trait</Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(46rem,calc(100vw-2rem))] p-0" align="start">
        <div className="flex max-h-[70vh] flex-col sm:flex-row">
          <Command value={highlighted} onValueChange={setHighlighted} className="sm:w-64 sm:shrink-0 sm:border-r">
            <CommandInput placeholder="Rechercher un trait…" />
            <CommandList className="max-h-60 sm:max-h-[60vh]">
              <CommandEmpty>Aucun résultat.</CommandEmpty>
              {(["bonus", "malus"] as const).map((kind) => (
                <CommandGroup key={kind} heading={kind === "bonus" ? "Bonus (coûtent des PC)" : "Malus (rapportent des PC)"}>
                  {entries.filter(([, t]) => t.kind === kind).map(([key, t]) => (
                    <CommandItem key={key} value={t.label} keywords={[t.effect]}
                      onSelect={() => { onPick(key); setOpen(false); }}>
                      <span className="flex-1">{t.label}</span>
                      <span className="text-xs text-muted-foreground">{pcRange(t)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
          <div className="min-w-0 flex-1 overflow-y-auto border-t p-4 sm:border-t-0">
            {shown ? <TraitDetails trait={shown} /> : <p className="text-sm text-muted-foreground">Survole un trait pour voir son effet.</p>}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Traits de personnage (refdoc/Traits de personnage.pdf) : les bonus coûtent des PC, les malus en
 * rapportent. Les effets chiffrés (limites d'attributs, compétences inaccessibles, mana, sous...)
 * sont calculés par le backend et renvoyés dans `report.trait_effects`.
 */
export default function TraitsSection({ rules, traits, species, report, rulesMode, onChange }: Props) {
  const skillLabels = Object.fromEntries(Object.values(rules.skill_groups).flatMap((g) => Object.entries(g.skills)));
  const update = (i: number, patch: Partial<TraitPick>) => onChange(traits.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const issuesOf = (field: string) => report?.issues.filter((x) => x.field === field) ?? [];

  let bonus = 0;
  let malus = 0;
  for (const pick of traits) {
    const t = rules.traits[pick.key];
    const v = t && (t.variants.length === 1 ? t.variants[0] : t.variants.find((x) => x.id === pick.variant));
    if (v) (v.pc < 0 ? (bonus -= v.pc) : (malus += v.pc));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>À décider avec le MJ.</span>
        {traits.length > 0 && (
          <>
            <Badge variant="outline">bonus −{bonus} PC</Badge>
            <Badge variant="outline">malus +{malus} PC</Badge>
            {!rulesMode && <span>(création libre : les PC ne sont pas comptés)</span>}
          </>
        )}
      </div>

      {traits.length === 0 && <span className="text-sm text-muted-foreground">Aucun trait.</span>}
      {traits.map((pick, i) => {
        const trait = rules.traits[pick.key];
        const problems = issuesOf(`traits.${i}`);
        if (!trait) {
          return (
            <div key={i} className="flex items-center gap-2 rounded-xl border border-destructive/60 p-3 text-sm">
              <span className="flex-1">« {pick.key} » n'est pas dans le catalogue.</span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Supprimer"
                onClick={() => onChange(traits.filter((_, j) => j !== i))}><Trash2 /></Button>
            </div>
          );
        }
        const variant = trait.variants.length === 1 ? trait.variants[0] : trait.variants.find((v) => v.id === pick.variant);
        const choice = trait.choice;
        const count = variant?.choice_count ?? choice?.count ?? 1;
        let options = choice?.options?.length ? choice.options
          : choice?.target === "attribute" ? rules.attributes
          : choice?.target === "skill_group" ? Object.keys(rules.skill_groups)
          : choice?.target === "species" ? Object.keys(rules.species_limits).filter((s) => s !== species)
          : Object.keys(skillLabels);
        if (pick.key === "attribut_exceptionnel" && report?.trait_effects?.lowest_max_attributes?.length) {
          options = report.trait_effects.lowest_max_attributes;
        }
        const optionLabel = (o: string) =>
          choice?.labels?.[o] ?? ATTRIBUTE_LABELS[o as Attribute] ?? rules.skill_groups[o]?.label ?? skillLabels[o]
          ?? o.charAt(0).toUpperCase() + o.slice(1);
        const choices = pick.choices ?? [];

        // Hybride : attributs à demi-valeur, dont la moitié est arrondie au-dessus.
        const other = pick.key === "hybride" ? choices[0] : undefined;
        const halves = species && other && rules.species_limits[species] && rules.species_limits[other]
          ? rules.attributes.filter((a) => (rules.species_limits[species][a].max + rules.species_limits[other][a].max) % 2)
          : [];
        const roundedUp = pick.rounded_up ?? [];

        return (
          <div key={i} className={cn("flex flex-col gap-3 rounded-xl border p-3", problems.length > 0 && "border-destructive/60 bg-destructive/5")}>
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger className="font-heading text-sm font-semibold hover:underline" title="Voir l'effet">{trait.label}</PopoverTrigger>
                <PopoverContent className="w-[min(30rem,calc(100vw-2rem))]" align="start"><TraitDetails trait={trait} /></PopoverContent>
              </Popover>
              <Badge variant={trait.kind === "bonus" ? "default" : "secondary"}>{trait.kind === "bonus" ? "Bonus" : "Malus"}</Badge>
              {variant && <Badge variant="outline">{pcText(variant.pc)}</Badge>}
              <span className="flex-1" />
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Retirer ${trait.label}`}
                onClick={() => onChange(traits.filter((_, j) => j !== i))}><Trash2 /></Button>
            </div>

            <div className="flex flex-wrap items-start gap-4">
              {trait.variants.length > 1 && (
                <Field label="Variante">
                  <Select value={pick.variant ?? undefined} onValueChange={(v) => {
                    // Le nombre de choix peut dépendre de la variante : on repart de zéro s'il change.
                    const next = trait.variants.find((x) => x.id === v)?.choice_count ?? choice?.count ?? 1;
                    update(i, { variant: v, choices: next === count ? choices : [] });
                  }}>
                    <SelectTrigger className="w-80 max-w-full"><SelectValue placeholder="Choisir…" /></SelectTrigger>
                    <SelectContent>
                      {trait.variants.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              {choice && (count === options.length ? (
                <Field label={choice.label}>
                  <span className="text-sm">{options.map(optionLabel).join(", ")}</span>
                </Field>
              ) : count === 1 ? (
                <Field label={choice.label}>
                  <Select value={choices[0] ?? undefined} onValueChange={(v) => update(i, { choices: [v], rounded_up: [] })}>
                    <SelectTrigger className="w-80 max-w-full"><SelectValue placeholder="Choisir…" /></SelectTrigger>
                    <SelectContent>
                      {options.map((o) => <SelectItem key={o} value={o}>{optionLabel(o)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              ) : (
                <Field label={`${choice.label} (${choices.length} / ${count})`}>
                  <div className="flex flex-wrap gap-3">
                    {options.map((o) => {
                      const checked = choices.includes(o);
                      return (
                        <Label key={o} className="flex items-center gap-1.5 font-normal">
                          <Checkbox checked={checked} disabled={!checked && choices.length >= count}
                            onCheckedChange={(v) => update(i, { choices: v ? [...choices, o] : choices.filter((x) => x !== o) })} />
                          {optionLabel(o)}
                        </Label>
                      );
                    })}
                  </div>
                </Field>
              ))}
              {halves.length > 0 && (
                <Field label={`Arrondis au-dessus (${roundedUp.length} / ${halves.length / 2})`}
                  hint="Total des maximums : 53 ; minimum = maximum − 5 ; surhumain = maximum + 3.">
                  <div className="flex flex-wrap gap-3">
                    {halves.map((a) => {
                      const checked = roundedUp.includes(a);
                      return (
                        <Label key={a} className="flex items-center gap-1.5 font-normal">
                          <Checkbox checked={checked} disabled={!checked && roundedUp.length >= halves.length / 2}
                            onCheckedChange={(v) => update(i, { rounded_up: v ? [...roundedUp, a] : roundedUp.filter((x) => x !== a) })} />
                          {ATTRIBUTE_LABELS[a]}
                        </Label>
                      );
                    })}
                  </div>
                </Field>
              )}
              {trait.note && (
                <Field label={trait.note}>
                  <Input className="w-72" maxLength={200} value={pick.note ?? ""} onChange={(e) => update(i, { note: e.target.value })} />
                </Field>
              )}
            </div>
            {problems.map((p) => <p key={p.message} className="text-sm text-destructive">{p.message}</p>)}
          </div>
        );
      })}

      {issuesOf("traits").map((p) => <p key={p.message} className="text-sm text-destructive">{p.message}</p>)}
      <div><TraitPicker rules={rules} taken={traits.map((t) => t.key)} onPick={(key) => onChange([...traits, { key }])} /></div>
    </div>
  );
}

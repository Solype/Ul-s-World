import { Gem, Lock, Plus, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SpellEffect } from "@/api/client";
import SpellEffects from "@/components/SpellEffects";

type Entry = {
  label: string; effect: string; skill?: string | null; points?: number; mana?: number; free_knowledge?: number;
  /** Sorts : compétence magique et famille (Feu, Eau...). */
  school?: string | null; group?: string | null;
  /** Enchantements : ce sur quoi ils se posent. */
  target?: string | null;
  /** Sorts : effets selon la puissance P (ou le nombre N d'enchantements). */
  scaling?: "puissance" | "nombre" | null; effects?: SpellEffect[];
};

type Props = {
  /** Libellé de la ressource : « Langues », « Animaux totems ». */
  label: string;
  /** Introduction commune à tout le catalogue (à quoi sert une langue). */
  description?: string | null;
  catalog: Entry[];
  selected: string[];
  /** Nombre de choix autorisés. */
  max: number;
  /** Éléments imposés par les rôles (la langue runique de l'Exorciste). */
  required: string[];
  /** Bonus compté en PCR, en clair (« +1 Observation »), ou `null` s'il reste descriptif. */
  bonus?: (entry: Entry) => string | null;
  /** Ligne sous le nom (« Élémentarisme · Feu »). */
  subtitle?: (entry: Entry) => string | null;
  /** Catalogue incomplet (sorts) : on peut aussi ajouter un élément qui n'y est pas encore. */
  open?: boolean;
  /** Détail propre au catalogue, sous l'effet (codes d'un dieu). */
  details?: (entry: Entry) => ReactNode;
  onChange: (names: string[]) => void;
};

function EntryDetails({ entry, description, required, bonus, subtitle, details }: {
  entry: Entry; description?: string | null; required: boolean; bonus?: string | null; subtitle?: string | null;
  details?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-heading text-base font-semibold">{entry.label}</h4>
          {required && <Badge variant="secondary"><Lock data-icon="inline-start" />Imposé par les rôles</Badge>}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {entry.target && <p className="text-sm"><span className="text-muted-foreground">S'applique à :</span> {entry.target}</p>}
      {entry.effect && <p className="text-sm">{entry.effect}</p>}
      <SpellEffects effects={entry.effects ?? []} scaling={entry.scaling} />
      {!entry.effect && !entry.effects?.length && <p className="text-sm text-muted-foreground italic">Effet à venir.</p>}
      {bonus !== undefined && (
        bonus ? (
          <p className="flex items-center gap-1.5 text-sm"><Gem className="size-3.5 text-primary" />
            <span>Compté en PCR : <span className="font-semibold text-primary">{bonus}</span></span></p>
        ) : (
          <p className="text-xs text-muted-foreground">Effet descriptif : rien n'est ajouté automatiquement à la fiche.</p>
        )
      )}
      {details}
      {description && <p className="border-t pt-3 text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

/**
 * Choix dans un catalogue fermé (langues, animaux totems), sur le modèle du sélecteur de rôles :
 * recherche et liste à gauche, détail de l'élément survolé à droite. Chaque élément choisi devient
 * une étiquette ; un clic dessus réaffiche son détail.
 */
export default function CatalogPicker({
  label, description, catalog, selected, max, required, bonus, subtitle, open: openCatalog = false, details, onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState("");
  const [search, setSearch] = useState("");
  const find = (name: string) => catalog.find((e) => e.label === name);
  const available = catalog.filter((e) => !selected.includes(e.label));
  // Catalogue rangé par famille (sorts : « Élémentarisme · Feu », « Enchantement · Feu ») ; sinon « Au choix ».
  const familyOf = (e: Entry) => subtitle?.(e) ?? e.group ?? "Au choix";
  const families = [...new Set(available.filter((e) => !required.includes(e.label)).map(familyOf))];
  const groups: [string, Entry[]][] = [
    ["Imposé par les rôles", available.filter((e) => required.includes(e.label))],
    ...families.map((f): [string, Entry[]] =>
      [f, available.filter((e) => !required.includes(e.label) && familyOf(e) === f)]),
  ];
  // Saisie libre (catalogue ouvert) : ce qui est tapé, s'il n'est ni dans le catalogue ni déjà choisi.
  const typed = search.trim();
  const canAddTyped = openCatalog && typed !== ""
    && !catalog.some((e) => e.label.toLocaleLowerCase() === typed.toLocaleLowerCase()) && !selected.includes(typed);
  const add = (name: string) => { onChange([...selected, name]); setOpen(false); setSearch(""); };
  const missing = required.filter((r) => !selected.includes(r));
  const shown = find(highlighted);

  return (
    <div className="flex flex-col gap-2 pl-3">
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((name, i) => {
          const entry = find(name);
          const invalid = (!entry && !openCatalog) || i >= max;
          return (
            <Popover key={name}>
              <Badge asChild variant={invalid ? "destructive" : "default"} className="h-7 gap-1 pr-1 pl-2.5 text-sm">
                <span>
                  <PopoverTrigger className="flex items-center gap-1" title="Voir l'effet">
                    {required.includes(name) && <Lock className="size-3" />}
                    {name}
                  </PopoverTrigger>
                  <button type="button" aria-label={`Retirer ${name}`}
                    className="rounded-full p-0.5 opacity-70 hover:bg-background/30 hover:opacity-100"
                    onClick={() => onChange(selected.filter((n) => n !== name))}>
                    <X className="size-3.5" />
                  </button>
                </span>
              </Badge>
              <PopoverContent className="w-[min(28rem,calc(100vw-2rem))]" align="start">
                {entry ? (
                  <EntryDetails entry={entry} description={description} required={required.includes(name)} bonus={bonus?.(entry)}
                    subtitle={subtitle?.(entry)} details={details?.(entry)} />
                ) : openCatalog ? (
                  <p className="text-sm text-muted-foreground">« {name} » n'est pas (encore) dans le catalogue.</p>
                ) : (
                  <p className="text-sm text-muted-foreground">« {name} » n'est pas dans le catalogue : retire-le et choisis-en un autre.</p>
                )}
                {entry && i >= max && <p className="mt-3 text-sm text-destructive">En trop : {max} autorisé(s).</p>}
              </PopoverContent>
            </Popover>
          );
        })}

        {selected.length < max && (available.length > 0 || openCatalog) && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <Plus data-icon="inline-start" />Ajouter ({max - selected.length} à choisir)
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(44rem,calc(100vw-2rem))] p-0" align="start">
              <div className="flex max-h-[70vh] flex-col sm:flex-row">
                <Command value={highlighted} onValueChange={setHighlighted} className="sm:w-56 sm:shrink-0 sm:border-r">
                  <CommandInput placeholder={`Rechercher (${label.toLowerCase()})…`} value={search} onValueChange={setSearch} />
                  <CommandList className="max-h-60 sm:max-h-[60vh]">
                    {!canAddTyped && <CommandEmpty>Aucun résultat.</CommandEmpty>}
                    {canAddTyped && (
                      <CommandGroup heading="Hors catalogue">
                        <CommandItem value={`__libre__ ${typed}`} keywords={[typed]} onSelect={() => add(typed)}>
                          <Plus />Ajouter « {typed} »
                        </CommandItem>
                      </CommandGroup>
                    )}
                    {groups.filter(([, entries]) => entries.length > 0).map(([heading, entries]) => (
                      <CommandGroup key={heading} heading={heading}>
                        {entries.map((e) => (
                          <CommandItem key={e.label} value={e.label} keywords={[e.effect, e.target ?? ""]}
                            onSelect={() => add(e.label)}>
                            {required.includes(e.label) && <Lock className="text-primary" />}
                            {e.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
                <div className="min-w-0 flex-1 overflow-y-auto border-t p-4 sm:border-t-0">
                  {shown ? (
                    <EntryDetails entry={shown} description={description} required={required.includes(shown.label)} bonus={bonus?.(shown)}
                      subtitle={subtitle?.(shown)} details={details?.(shown)} />
                  ) : (
                    <p className="text-sm text-muted-foreground">Survole un élément pour voir son effet.</p>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
        {selected.length === 0 && max === 0 && <span className="text-sm text-muted-foreground">—</span>}
      </div>
      {missing.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3" />À prendre (imposé par les rôles) : {missing.join(", ")}
        </p>
      )}
    </div>
  );
}

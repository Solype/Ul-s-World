import { Plus, Trash2 } from "lucide-react";
import type { CharacterInput, Rules } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import CatalogPicker from "./CatalogPicker";
import GodCodes from "./GodCodes";
import NumberStepper from "./NumberStepper";

type Selection = { name: string; value?: number | null };

type Props = {
  rules: Rules;
  character: CharacterInput;
  rulesMode: boolean;
  /** Minimums donnés par les rôles, par stat. */
  floors: Record<string, number>;
  /** Éléments de catalogue imposés par les rôles, par ressource (la langue runique de l'Exorciste). */
  imposed: Record<string, string[]>;
  /** Ressources inaccessibles (monstre qui n'est pas doué magiquement) : cachées sauf s'il en a encore. */
  forbidden?: string[];
  onChange: (patch: Pick<CharacterInput, "resources" | "bottes" | "selections">) => void;
};

/**
 * Ressources de la fiche (voir RESOURCE_DEFS côté backend) :
 * - `count` : donne accès à N choix (sorts, langues, bottes, dieux, animaux...) ;
 * - `min_total` : codes dont la valeur totale doit atteindre ou dépasser la limite ;
 * - `score` : piété, plafonnée.
 * En mode règles, le nombre de choix vient des rôles (lecture seule). Les ressources qui ont un
 * catalogue (langues, animaux totems, sorts, dieux) se choisissent dans une liste qui montre l'effet de chaque
 * élément ; les autres sont des intitulés libres en attendant leur catalogue (bottes, codes...).
 */
export default function ResourcesSection({ rules, character, rulesMode, floors, imposed, forbidden = [], onChange }: Props) {
  const resources = character.resources ?? {};
  const selections = (character.selections ?? {}) as Record<string, Selection[]>;
  const allowance = (key: string) => (key === "bottes" ? character.bottes ?? 0 : resources[key] ?? 0);
  const setAllowance = (key: string, v: number) =>
    onChange(key === "bottes" ? { bottes: v } : { resources: { ...resources, [key]: v } });
  const setItems = (key: string, items: Selection[]) => onChange({ selections: { ...selections, [key]: items } });

  // Les bonus des animaux totems comptent comme des PCR.
  const skillLabels: Record<string, string> = Object.assign({}, ...Object.values(rules.skill_groups).map((g) => g.skills));
  const totemBonus = (e: { skill?: string | null; points?: number; mana?: number; free_knowledge?: number }) =>
    e.skill ? `+${e.points} ${skillLabels[e.skill] ?? e.skill}`
      : e.mana ? `+${e.mana} mana max`
      : e.free_knowledge ? `+${e.free_knowledge} points de connaissance libres`
      : null;
  // Codes de chaque dieu, montrés dans sa fiche.
  const godCodes = new Map((rules.catalogs.dieux ?? []).map((g) => [g.label, g.codes ?? []]));

  const defs = Object.entries(rules.resource_defs);
  const used = (key: string) => allowance(key) > 0 || (selections[key]?.length ?? 0) > 0;
  const visible = defs.filter(([key]) => used(key) || (!rulesMode && !forbidden.includes(key)));
  const groups = [...new Set(visible.map(([, d]) => d.group))];

  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune ressource : elles viennent des rôles (sorts, langues, dieux, bottes…).</p>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map((group) => (
        <div key={group} className="flex flex-col gap-4 rounded-xl border p-3">
          <h3 className="font-heading text-sm font-semibold">{group}</h3>
          {visible.filter(([, d]) => d.group === group).map(([key, def]) => {
            const n = allowance(key);
            const items = selections[key] ?? [];
            const allowanceControl =
              rulesMode && def.kind !== "score" ? (
                <NumberStepper value={n} readOnly title="Donné par les rôles" />
              ) : (
                <NumberStepper value={n} min={rulesMode ? floors[key] ?? 0 : 0} max={def.max ?? undefined}
                  onChange={(v) => setAllowance(key, v)} />
              );

            if (def.kind === "score") {
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="flex-1 text-sm font-medium">{def.label}</span>
                  {allowanceControl}
                  {def.max != null && <span className="text-sm text-muted-foreground">/ {def.max}</span>}
                </div>
              );
            }

            if (def.kind === "min_total") {
              const total = items.reduce((sum, i) => sum + (i.value ?? 0), 0);
              return (
                <div key={key} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-sm font-medium">{def.label}</span>
                    <span className="text-xs text-muted-foreground">limite</span>
                    {allowanceControl}
                    <Badge variant={total >= n ? "outline" : "secondary"} className={cn(total >= n && "text-success")}>
                      total {total} / {n}
                    </Badge>
                  </div>
                  {items.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 pl-3">
                      <Input value={item.name}
                        onChange={(e) => setItems(key, items.map((x, j) => (j === i ? { ...x, name: e.target.value || "?" } : x)))} />
                      <NumberStepper value={item.value ?? 0}
                        onChange={(v) => setItems(key, items.map((x, j) => (j === i ? { ...x, value: v } : x)))} />
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Supprimer"
                        onClick={() => setItems(key, items.filter((_, j) => j !== i))}><Trash2 /></Button>
                    </div>
                  ))}
                  <div className="pl-3">
                    <Button type="button" variant="outline" size="sm"
                      onClick={() => setItems(key, [...items, { name: `Code ${items.length + 1}`, value: 1 }])}>
                      <Plus data-icon="inline-start" />Code
                    </Button>
                  </div>
                </div>
              );
            }

            // count : un emplacement par choix autorisé ; ceux en trop sont signalés et supprimables.
            const slots = Math.max(n, items.length);
            const catalog = rules.catalogs[key];
            const required = imposed[key] ?? [];
            return (
              <div key={key} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm font-medium">{def.label}</span>
                  {allowanceControl}
                  <Badge variant={items.length === n ? "outline" : "secondary"} className={cn(items.length === n && "text-success")}>
                    {items.length} / {n}
                  </Badge>
                </div>
                {catalog && (
                  <CatalogPicker label={def.label} description={def.description} catalog={catalog} max={n}
                    selected={items.map((x) => x.name)} required={required}
                    bonus={key === "animaux_totems" ? totemBonus : undefined}
                    subtitle={(e) => [e.school ? skillLabels[e.school] ?? e.school : null, e.group].filter(Boolean).join(" · ") || null}
                    open={rules.open_catalogs.includes(key)}
                    details={key === "dieux" ? (e) => <GodCodes codes={godCodes.get(e.label) ?? []} /> : undefined}
                    onChange={(names) => setItems(key, names.map((name) => ({ name })))} />
                )}
                {!catalog && Array.from({ length: slots }, (_, i) => (
                  <div key={i} className="flex items-center gap-2 pl-3">
                    <Input placeholder={`${def.label} ${i + 1} (au choix)`} value={items[i]?.name ?? ""} aria-invalid={i >= n || undefined}
                      onChange={(e) => {
                        const name = e.target.value;
                        const next = [...items];
                        if (name) next[i] = { ...next[i], name };
                        else next.splice(i, 1);
                        setItems(key, next.filter(Boolean));
                      }} />
                    {i >= n && (
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Supprimer"
                        onClick={() => setItems(key, items.filter((_, j) => j !== i))}><Trash2 /></Button>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

import { Lock, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { CharacterInput } from "@/api/client";
import { Field } from "@/components/editor/Section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import NumberStepper from "./NumberStepper";

type Props = {
  character: CharacterInput;
  /** Minimums donnés par les rôles : connaissances par intitulé, et mana maximum. */
  knowledgeFloors: Record<string, number>;
  /** Mode règles : mana max calculé, connaissances libres limitées. `null` en création libre. */
  rules: {
    roleMana: number; totemMana: number; manaFromPool: number; freeKnowledge: number;
    /** Mana donné par les traits (+100 pour un demi-démon / demi-vengeur). */
    traitMana: number;
  } | null;
  onChange: (patch: Pick<CharacterInput, "knowledges" | "mana">) => void;
  /** Monstre : pas de mana sans être Doué magiquement, pas de connaissances sans être Intelligent. */
  showMana?: boolean;
  showKnowledges?: boolean;
};

type Row = { name: string; level: number };

const toRows = (k: Record<string, number> | undefined): Row[] =>
  Object.entries(k ?? {}).map(([name, level]) => ({ name, level }));
// Les lignes sans intitulé restent locales tant qu'elles ne sont pas nommées.
const toDict = (rows: Row[]) =>
  Object.fromEntries(rows.filter((r) => r.name.trim()).map((r) => [r.name.trim(), r.level]));

/**
 * Mana (ressource commune à la magie et à la religion) et connaissances libres :
 * les joueurs inventent l'intitulé qu'ils veulent (voir refdoc/infos.md). Les connaissances
 * données par les rôles ne peuvent pas descendre sous leur minimum ni être supprimées.
 */
export default function KnowledgeAndMana({ character, knowledgeFloors, rules, onChange, showMana = true, showKnowledges = true }: Props) {
  const [rows, setRows] = useState<Row[]>(() => toRows(character.knowledges));

  // Recharge les lignes quand les connaissances changent hors de ce composant (chargement, rôles).
  const external = JSON.stringify(character.knowledges ?? {});
  useEffect(() => {
    if (external !== JSON.stringify(toDict(rows))) setRows(toRows(character.knowledges));
  }, [external]);

  const update = (next: Row[]) => {
    setRows(next);
    onChange({ knowledges: toDict(next) });
  };
  const mana = character.mana ?? {};
  // Points de connaissance libres déjà répartis (au-dessus de ce que donnent les rôles).
  const freeUsed = rows.reduce((sum, r) => sum + Math.max(0, r.level - (knowledgeFloors[r.name.trim()] ?? 0)), 0);
  const freeLeft = rules ? rules.freeKnowledge - freeUsed : Infinity;

  return (
    <div className="flex flex-col gap-5">
      {showMana && <Field label="Mana max" hint={rules
        ? `Rôles ${rules.roleMana - rules.totemMana}${rules.totemMana ? ` + animaux totems ${rules.totemMana}` : ""}`
          + ` + ${rules.manaFromPool} par les PCP mis dans « Mana » (Compétence magique)`
          + `${rules.traitMana ? ` + ${rules.traitMana} (demi-démon / demi-vengeur)` : ""}. Commun à la magie et à la religion.`
        : "Commun à la magie et à la religion."}>
        {rules ? (
          <NumberStepper value={mana.max ?? 0} readOnly className="w-20" />
        ) : (
          <NumberStepper value={mana.max ?? 0} onChange={(v) => onChange({ mana: { ...mana, max: v } })} />
        )}
      </Field>}

      {showKnowledges && <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Connaissances libres, inventées par le joueur. Celles marquées d'un cadenas viennent des rôles.
          </span>
          {rules && (
            <Badge variant={freeLeft === 0 ? "outline" : "secondary"} className={freeLeft === 0 ? "text-success" : undefined}>
              points libres {freeUsed} / {rules.freeKnowledge}
            </Badge>
          )}
        </div>
        {rules && rules.freeKnowledge === 0 && (
          <span className="text-xs text-muted-foreground">
            Mets des PCP dans « Connaissances » (groupe Intellect) : chacun donne 2 points de connaissance.
          </span>
        )}
        {rows.length === 0 && <span className="text-sm text-muted-foreground">Aucune connaissance.</span>}
        {rows.map((r, i) => {
          const floor = knowledgeFloors[r.name.trim()] ?? 0;
          return (
            <div key={i} className="flex items-center gap-2">
              <Input className="max-w-xs" placeholder="ex. Généalogie des rois nains" value={r.name} readOnly={floor > 0}
                onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <NumberStepper value={r.level} min={floor} max={rules ? r.level + Math.max(0, freeLeft) : undefined}
                onChange={(v) => update(rows.map((x, j) => (j === i ? { ...x, level: v } : x)))} />
              {floor > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="secondary"><Lock />{floor}</Badge>
                  </TooltipTrigger>
                  <TooltipContent>Au moins {floor}, donné par les rôles</TooltipContent>
                </Tooltip>
              ) : (
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Supprimer"
                  onClick={() => update(rows.filter((_, j) => j !== i))}><Trash2 /></Button>
              )}
            </div>
          );
        })}
        <div>
          <Button type="button" variant="outline" size="sm" disabled={freeLeft <= 0}
            onClick={() => setRows([...rows, { name: "", level: 1 }])}>
            <Plus data-icon="inline-start" />Connaissance
          </Button>
        </div>
      </div>}
    </div>
  );
}

import { Ban, Lock } from "lucide-react";
import type { CharacterInput, MonsterAccess, Rules, SkillScore, ValidationReport } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { creationBudget, groupCost, maxGroupLevel } from "@/lib/budget";
import { manaMax } from "@/lib/roleEffects";
import { cn } from "@/lib/utils";
import NumberStepper from "./NumberStepper";

const toDistributeOf = (level: number) => 2 * level;

type Props = {
  rules: Rules;
  character: CharacterInput;
  report: ValidationReport | null;
  onChange: (patch: Pick<CharacterInput, "skill_groups" | "skills" | "pools" | "mana">) => void;
  /** Mana donné par les rôles : le mana max vaut ce mana + les PCP mis dans la réserve Mana (voir `manaMax`). */
  roleMana: number;
  /** PCR affichés en mode règles : ceux enregistrés, ou ceux calculés à partir des rôles. */
  pcrSource: "stored" | "computed";
  /** Monstre : ce que ses caractéristiques lui donnent. Le reste n'est montré que s'il a encore des points. */
  access?: MonsterAccess | null;
};

/**
 * Groupes de compétence et compétences, comme sur la fiche :
 * - le niveau du groupe se paie en points de groupe (1 + 2 + ... + niveau) ;
 * - chaque niveau donne 2 points purs (PCP) à répartir dans les compétences du groupe ;
 * - les points de rôle (PCR) viennent des rôles ; PCT = PCP + PCR.
 *
 * PNJ et monstres n'ont qu'une colonne « Valeur » (stockée dans `pcp`), sans PCR ni PCT.
 * Pour un PJ créé selon les règles, les PCR sont en lecture seule : ils viennent des rôles.
 *
 * Réserves (Création de personnage p.5-6) : « Connaissances » (Intellect) et « Mana » (Compétence
 * magique) reçoivent des PCP du groupe, sans PCR ni PCT. Chaque PCP donne 2 points de connaissance
 * libres, ou 15 de mana max.
 */
export default function SkillsSection({ rules, character, report, onChange, pcrSource, roleMana, access }: Props) {
  const rulesMode = character.creation_mode !== "free";
  const isPC = (character.kind ?? "pj") === "pj";
  const pcrLocked = rulesMode;
  const groups = character.skill_groups ?? {};
  const skills = character.skills ?? {};
  const pools = character.pools ?? {};
  const setPool = (name: string, value: number) => {
    const next = { ...pools, [name]: value };
    // Mode règles : le mana max suit la réserve Mana (même calcul que le backend).
    const mana = name === "mana" && rulesMode
      ? { mana: { ...character.mana, max: manaMax(rules, roleMana, value, report?.trait_effects) } }
      : {};
    onChange({ pools: next, ...mana });
  };
  const pcr = (s: string) =>
    pcrLocked && pcrSource === "computed" ? report?.role_points?.skills?.[s] ?? 0 : skills[s]?.pcr ?? 0;
  // Mode règles : les « + » sont bornés par les points de groupe restants et les PCP à répartir.
  const groupsLeft = rulesMode ? creationBudget(rules, character, report).groupsLeft : null;
  // Compétences rendues inaccessibles par un trait (Incompétent !, Asocial...) -> trait responsable.
  const forbidden: Record<string, string> = Object.fromEntries(
    Object.entries(report?.trait_effects?.forbidden_skills ?? {}).map(([s, trait]) => [s, `trait « ${trait} »`]));
  // Monstre : compétences que ses caractéristiques n'ouvrent pas, cachées sauf s'il leur reste des points.
  const hasPoints = (s: string) => (skills[s]?.pcp ?? 0) + (skills[s]?.pcr ?? 0) > 0;
  if (access) {
    for (const grp of Object.values(rules.skill_groups)) {
      for (const s of Object.keys(grp.skills)) if (!access.skills.includes(s)) forbidden[s] = "aucune caractéristique du monstre ne l'ouvre";
    }
  }
  const skillShown = (s: string) => !access || access.skills.includes(s) || hasPoints(s);
  const poolShown = (name: string) => !access || access.pools.includes(name) || (pools[name] ?? 0) > 0;
  const groupShown = (g: string, groupSkills: string[]) =>
    !access || access.skill_groups.includes(g) || (groups[g]?.pcp ?? 0) > 0 || groupSkills.some(hasPoints);

  const setGroup = (g: string, level: number) =>
    onChange({ skill_groups: { ...groups, [g]: { ...groups[g], pcp: level } } });
  const setSkill = (s: string, col: keyof SkillScore, value: number) =>
    onChange({ skills: { ...skills, [s]: { ...skills[s], [col]: value } } });
  const issue = (g: string) => report?.issues.find((i) => i.field === `skill_groups.${g}`)?.message;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Object.entries(rules.skill_groups).filter(([g, group]) => groupShown(g, Object.keys(group.skills))).map(([g, group]) => {
        const level = groups[g]?.pcp ?? 0;
        const groupPools = Object.entries(rules.skill_pools).filter(([name, pool]) => pool.group === g && poolShown(name));
        const distributed =
          Object.keys(group.skills).reduce((sum, s) => sum + (skills[s]?.pcp ?? 0), 0) +
          groupPools.reduce((sum, [name]) => sum + (pools[name] ?? 0), 0);
        const left = Math.max(0, toDistributeOf(level) - distributed);
        const poolRow = (name: string, pool: { label: string; per_point: number }) => {
          const pcp = pools[name] ?? 0;
          return (
            <TableRow key={`pool-${name}`} className="bg-primary/5 hover:bg-primary/10">
              <TableCell className="font-medium">
                {pool.label}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">×{pool.per_point} par PCP</span>
              </TableCell>
              <TableCell>
                <NumberStepper value={pcp} max={rulesMode ? pcp + left : undefined} onChange={(v) => setPool(name, v)} />
              </TableCell>
              {isPC && (
                <TableCell colSpan={2} className="text-center text-xs font-semibold text-primary">
                  {pcp ? `+${pcp * pool.per_point}` : "—"}
                </TableCell>
              )}
            </TableRow>
          );
        };
        const toDistribute = toDistributeOf(level);
        const problem = issue(g);
        return (
          <div key={g} className={cn("flex flex-col gap-3 rounded-xl border p-3", problem && "border-destructive/60 bg-destructive/5")}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="flex-1 font-heading text-sm font-semibold">{group.label}</h3>
              {rulesMode && <Badge variant="outline">coût {groupCost(level)}</Badge>}
              <span className="text-xs text-muted-foreground">Niveau</span>
              <NumberStepper value={level} max={groupsLeft === null ? undefined : maxGroupLevel(level, groupsLeft)}
                onChange={(v) => setGroup(g, v)} />
            </div>

            <Table>
              <TableHeader>
                {isPC ? (
                  <TableRow>
                    <TableHead>Compétence</TableHead>
                    <TableHead className="w-28 text-center">PCP</TableHead>
                    <TableHead className="w-16 text-center">
                      <Tooltip>
                        <TooltipTrigger className="inline-flex items-center gap-1">PCR{pcrLocked && <Lock className="size-3" />}</TooltipTrigger>
                        <TooltipContent>Points de compétence de rôle{pcrLocked && " : donnés par les rôles"}</TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="w-12 text-center">PCT</TableHead>
                  </TableRow>
                ) : (
                  <TableRow>
                    <TableHead>Compétence</TableHead>
                    <TableHead className="w-28 text-center">Valeur</TableHead>
                  </TableRow>
                )}
              </TableHeader>
              <TableBody>
                {/* Sur la fiche, « Connaissances » ouvre le groupe Intellect et « Mana » suit la magie. */}
                {groupPools.filter(([name]) => name !== "mana").map(([name, pool]) => poolRow(name, pool))}
                {Object.entries(group.skills).filter(([s]) => skillShown(s)).map(([s, label]) => {
                  const score = skills[s] ?? {};
                  const total = (score.pcp ?? 0) + (isPC ? pcr(s) : 0);
                  const blockedBy = forbidden[s];
                  return (
                    <TableRow key={s}>
                      <TableCell className={cn(total > 0 && "font-medium", blockedBy && "text-muted-foreground")}>
                        {blockedBy ? (
                          <Tooltip>
                            <TooltipTrigger className="inline-flex items-center gap-1.5 line-through decoration-muted-foreground/60">
                              <Ban className="size-3.5" />{label}
                            </TooltipTrigger>
                            <TooltipContent>Inaccessible : {blockedBy}</TooltipContent>
                          </Tooltip>
                        ) : label}
                      </TableCell>
                      <TableCell>
                        <NumberStepper value={score.pcp ?? 0}
                          max={blockedBy ? score.pcp ?? 0 : rulesMode ? (score.pcp ?? 0) + left : undefined}
                          onChange={(v) => setSkill(s, "pcp", v)} />
                      </TableCell>
                      {isPC && (
                        <>
                          <TableCell className="text-center">
                            {pcrLocked ? (
                              <span className={cn("tabular-nums", pcr(s) ? "text-primary" : "text-muted-foreground")}>{pcr(s)}</span>
                            ) : (
                              <NumberStepper value={pcr(s)} onChange={(v) => setSkill(s, "pcr", v)} />
                            )}
                          </TableCell>
                          <TableCell className="text-center font-semibold tabular-nums">{total}</TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })}
                {groupPools.filter(([name]) => name === "mana").map(([name, pool]) => poolRow(name, pool))}
              </TableBody>
            </Table>

            {rulesMode && toDistribute > 0 && (
              <div className="flex items-center gap-3 text-xs">
                <Progress value={(distributed / toDistribute) * 100} className="flex-1" />
                <span className={cn("tabular-nums", distributed === toDistribute ? "text-success" : "text-muted-foreground")}>
                  PCP {distributed} / {toDistribute}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

import type { components } from "@/api/schema";
import type { Rules } from "@/api/client";

type Grant = components["schemas"]["Grant"];

export type GrantLine = {
  /** Clé de cumul : deux lignes de même clé s'additionnent (ex. « skill:endurance »). Absente pour un choix. */
  key?: string;
  kind: "skill" | "skill_group" | "knowledge" | "stat" | "choice";
  points: number;
  label: string;
  note?: string | null;
};

/** Traduit un grant du catalogue en ligne lisible : « +2 Endurance », « +3 Sabre ou Épée »... */
export function describeGrant(rules: Rules, g: Grant): GrantLine {
  const skillLabel = (s: string) => skillLabels(rules)[s] ?? s;
  const groupLabel = (k: string) => rules.skill_groups[k]?.label ?? k;
  if (g.skill) return { key: `skill:${g.skill}`, kind: "skill", points: g.points, label: skillLabel(g.skill) };
  if (g.skill_group) return { key: `group:${g.skill_group}`, kind: "skill_group", points: g.points, label: `groupe ${groupLabel(g.skill_group)}` };
  if (g.knowledge) return { key: `knowledge:${g.knowledge}`, kind: "knowledge", points: g.points, label: `Connaissance ${g.knowledge.toLowerCase()}` };
  if (g.stat) return { key: `stat:${g.stat}`, kind: "stat", points: g.points, label: rules.stats[g.stat] ?? g.stat, note: g.note };

  const c = g.choice!;
  const count = c.count ?? 1;
  let label: string;
  let points = g.points;
  if (c.target === "knowledge") {
    label = "Connaissance au choix";
  } else if (c.options?.length) {
    label = c.options.map(skillLabel).join(" ou ");
  } else if (c.target === "skill_group") {
    label = count > 1 ? `${count} groupes au choix` : "groupe au choix";
  } else if (c.allow_repeat) {
    // Répartition libre : « +2 en compétences de Mêlée (au choix) ».
    points = g.points * count;
    label = `à répartir en ${c.from_group ? groupLabel(c.from_group) : "compétences"}`;
  } else {
    const where = c.from_group ? `compétence de ${groupLabel(c.from_group)}` : "compétence";
    label = count > 1 ? `dans ${count} × 1 ${where} au choix` : `dans 1 ${where} au choix`;
  }
  return { kind: "choice", points, label };
}

/** Additionne les lignes de même clé (le tronc et le rôle donnent tous deux +1 Endurance → +2). */
export function cumulate(lines: GrantLine[]): GrantLine[] {
  const out: GrantLine[] = [];
  const byKey = new Map<string, GrantLine>();
  for (const line of lines) {
    if (!line.key) {
      out.push({ ...line });
      continue;
    }
    const existing = byKey.get(line.key);
    if (existing) {
      existing.points += line.points;
      if (line.note) existing.note = [existing.note, line.note].filter(Boolean).join(" ; ");
    } else {
      const copy = { ...line };
      byKey.set(line.key, copy);
      out.push(copy);
    }
  }
  return out;
}

let cachedLabels: { rules: Rules; labels: Record<string, string> } | null = null;
function skillLabels(rules: Rules): Record<string, string> {
  if (cachedLabels?.rules !== rules) {
    cachedLabels = {
      rules,
      labels: Object.fromEntries(Object.values(rules.skill_groups).flatMap((g) => Object.entries(g.skills))),
    };
  }
  return cachedLabels.labels;
}

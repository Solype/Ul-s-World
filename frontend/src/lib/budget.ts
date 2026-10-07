import type { CharacterInput, Rules } from "../api/client";

export const groupCost = (level: number) => (level * (level + 1)) / 2;

/**
 * Points restants pendant une création selon les règles, calculés côté client pour que les
 * boutons « + » réagissent immédiatement. La validation qui fait foi reste celle du backend.
 * Une priorité non choisie compte comme 0 point disponible.
 */
export function creationBudget(rules: Rules, c: CharacterInput) {
  const priorities = c.creation?.priorities ?? {};
  const row = (k: keyof typeof priorities) => {
    const p = priorities[k];
    return p ? rules.priorities[p] : undefined;
  };
  const extra = c.creation?.extra_pc ?? {};

  const attributesSpent = rules.attributes.reduce((sum, a) => sum + (c.attributes?.[a] ?? 0), 0);
  const groupsSpent = Object.values(c.skill_groups ?? {}).reduce((sum, g) => sum + groupCost(g.pcp ?? 0), 0);
  const pcSpent =
    (["roles", "attributes", "skill_groups", "money"] as const).reduce((sum, k) => sum + (row(k)?.cost ?? 0), 0) +
    (extra.relations ?? 0) + (extra.magic ?? 0) + (extra.bottes ?? 0);

  const combos = row("roles")?.roles ?? [];
  const nPrimary = c.roles?.primary?.length ?? 0;
  const nSecondary = c.roles?.secondary?.length ?? 0;

  return {
    attributesLeft: (row("attributes")?.attributes ?? 0) - attributesSpent,
    groupsLeft: (row("skill_groups")?.skill_groups ?? 0) - groupsSpent,
    pcLeft: rules.start_pc - pcSpent,
    // On peut ajouter un rôle si une combinaison autorisée par la priorité le permet encore.
    canAddPrimary: combos.some((r) => r.primary > nPrimary && r.secondary >= nSecondary),
    canAddSecondary: combos.some((r) => r.primary >= nPrimary && r.secondary > nSecondary),
  };
}

/** Niveau maximum atteignable pour un groupe avec les points de groupe restants. */
export function maxGroupLevel(level: number, groupsLeft: number) {
  let max = level;
  while (groupCost(max + 1) - groupCost(level) <= groupsLeft) max++;
  return max;
}

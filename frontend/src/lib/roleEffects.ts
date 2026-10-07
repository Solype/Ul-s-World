import type { CharacterInput, Rules, TraitEffects, ValidationReport } from "../api/client";

/**
 * Mana max à la création, même calcul que `expected_mana_max` côté backend :
 * rôles + réserve Mana (+ 100 pour un demi-démon / demi-vengeur).
 */
export function manaMax(rules: Rules, roleMana: number, poolPoints: number, fx?: TraitEffects | null) {
  return roleMana + poolPoints * rules.skill_pools.mana.per_point + (fx?.mana_bonus ?? 0);
}

/** Ce que donnent les rôles (minimums), tel que calculé par le backend dans le rapport de validation. */
export function roleFloors(report: ValidationReport | null) {
  const p = report?.role_points;
  return {
    knowledges: p?.knowledges ?? {},
    stats: p?.stats ?? {},
    imposed: p?.imposed ?? {},
  };
}

/**
 * Même logique que `_sync_role_points` côté backend, pour un aperçu immédiat dans l'éditeur :
 * Magie et bottes = rôles + achats en PC ; mana max = rôles + réserve Mana ;
 * connaissances et ressources remontées au minimum.
 * Renvoie `null` si rien ne change (évite de boucler avec la validation).
 */
export function applyRoleEffects(rules: Rules, c: CharacterInput, report: ValidationReport | null): Partial<CharacterInput> | null {
  if (!report?.role_points) return null;
  const { knowledges, stats } = roleFloors(report);
  const extra = c.creation?.extra_pc ?? {};
  const raise = (values: Record<string, number> | undefined, floors: Record<string, number>) => {
    const out = { ...(values ?? {}) };
    for (const [k, floor] of Object.entries(floors)) out[k] = Math.max(out[k] ?? 0, floor);
    return out;
  };
  const resourceFloors = Object.fromEntries(
    Object.entries(stats).filter(([k]) => !["magic", "mana", "bottes"].includes(k)),
  );
  const patch: Partial<CharacterInput> = {
    magic: (stats.magic ?? 0) + (extra.magic ?? 0),
    bottes: (stats.bottes ?? 0) + (extra.bottes ?? 0) * rules.bottes_per_pc,
    knowledges: raise(c.knowledges, knowledges),
    mana: { ...c.mana, max: manaMax(rules, stats.mana ?? 0, c.pools?.mana ?? 0, report.trait_effects) },
    resources: raise(c.resources, resourceFloors),
  };
  const changed = (Object.keys(patch) as (keyof CharacterInput)[]).some(
    (k) => JSON.stringify(patch[k]) !== JSON.stringify(c[k] ?? (k === "magic" || k === "bottes" ? 0 : {})),
  );
  return changed ? patch : null;
}

/**
 * Dégâts qui passent l'armure : aperçu avant d'infliger. Copie de backend/app/rules/damage.py, qui fait foi
 * (le serveur recalcule) : les garder identiques.
 */
export function damageAfterArmor(damage: number, armor: number, penetration: number) {
  if (armor <= 0) return damage;
  if (damage > armor) return damage - Math.max(0, armor - penetration);
  return Math.min(penetration, damage);
}

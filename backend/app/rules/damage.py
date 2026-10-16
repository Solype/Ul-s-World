"""★ Dégâts et armure (règle détaillée dans texts/combat.md).

Une attaque peut rencontrer une armure. La **pénétration** de l'arme est le nombre de dégâts qu'elle garantit :

- sans armure, la pénétration est ignorée : tous les dégâts passent ;
- dégâts > armure : l'armure est réduite de la pénétration (sans descendre sous 0), puis retirée des dégâts ;
- armure >= dégâts : seule la pénétration passe.

Les dégâts après armure ne dépassent jamais les dégâts avant armure. À dégâts = armure, les deux cas donnent
le même résultat : le cas d'égalité n'a pas d'importance.

La même formule sert à l'aperçu du frontend (frontend/src/lib/damage.ts) : les garder identiques.
"""


def damage_after_armor(damage: int, armor: int, penetration: int) -> int:
    """Dégâts qui passent l'armure (tous positifs ou nuls)."""
    if armor <= 0:
        return damage
    if damage > armor:
        return damage - max(0, armor - penetration)
    return min(penetration, damage)

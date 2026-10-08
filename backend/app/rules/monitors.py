"""★ Moniteurs de condition : l'état d'un personnage en jeu.

La fiche sert de modèle ; l'instance d'un personnage dans une room porte ses moniteurs (valeur actuelle / max).

- Physique, mental, pathologique, endurance : max = compétence du groupe Résistances (PCP + PCR)
  + attribut Résistance, puis les traits (Immunodéficience, Revenant).
- Mana : le mana max de la fiche, seulement si le personnage en a.

À la création de l'instance, chaque moniteur est à son max.
"""

from pydantic import BaseModel

from app.rules.data import Attribute
from app.rules.traits import TraitEffects, trait_effects
from app.schemas import CharacterBase


class MonitorDef(BaseModel):
    label: str
    # Compétence (groupe Résistances) qui construit le moniteur ; None pour le mana.
    skill: str | None


MONITORS: dict[str, MonitorDef] = {
    "physique": MonitorDef(label="Physique", skill="physique"),
    "mental": MonitorDef(label="Mental", skill="mentale"),
    "pathologique": MonitorDef(label="Pathologique", skill="pathologique"),
    "endurance": MonitorDef(label="Endurance", skill="endurance"),
    "mana": MonitorDef(label="Mana", skill=None),
}
CONDITION_MONITORS = [k for k, m in MONITORS.items() if m.skill]

# Revenant : perte d'1/4 du max (arrondi en dessous), au moins 2. Voir refdoc/infos.md.
REVENANT_MIN_LOSS = 2


def _revenant_loss(maximum: int) -> int:
    return max(REVENANT_MIN_LOSS, maximum // 4)


def monitor_maxima(character: CharacterBase, fx: TraitEffects | None = None) -> dict[str, int]:
    """Max de chaque moniteur d'après la fiche. Le mana n'y est que si le personnage en a."""
    if fx is None:
        fx, _ = trait_effects(character.traits, character.species, character.resources.get("piete", 0))
    resistance = character.attributes.get(Attribute.RESISTANCE, 0)
    maxima: dict[str, int] = {}
    for key in CONDITION_MONITORS:
        score = character.skills.get(MONITORS[key].skill)  # type: ignore[arg-type]
        value = resistance + (score.total if score else 0) + fx.monitor_bonus.get(key, 0)
        if fx.monitor_quarter_loss:
            value -= _revenant_loss(value)
        maxima[key] = max(0, value)
    if character.mana.max > 0:
        maxima["mana"] = character.mana.max
    return maxima

"""Modèles décrivant ce qu'un rôle accorde. Le catalogue est dans `roles_catalog.py`,
le calcul dans `roles.py`."""

from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.rules.catalogs import CATALOGS
from app.rules.data import ALL_SKILLS, SKILL_GROUPS

# Statistiques numériques que les rôles peuvent accorder : clé -> libellé.
# magic -> attribut Magie, mana -> mana maximum, bottes -> bottes ; les autres vont dans `resources`.
STATS: dict[str, str] = {
    "magic": "Magie",
    "mana": "Mana (max)",
    "bottes": "Bottes",
    "sorts": "Sorts",
    "langues": "Langues",
    "animaux_totems": "Animaux totems",
    "dieux": "Dieux",
    "codes": "Valeur de codes",
    "piete": "Piété (P)",
    "montures": "Montures",
    "oiseaux": "Oiseaux",
    "fauves": "Fauves",
    "dragons": "Dragons",
    "creatures_magiques": "Créatures magiques",
    "familiers": "Familiers",
    "chiens": "Chiens",
}
CHARACTER_STATS = {"magic", "mana", "bottes"}
RESOURCE_STATS = [k for k in STATS if k not in CHARACTER_STATS]


class ResourceDef(BaseModel):
    """Comment une ressource s'utilise.

    - `count` : donne accès à autant de choix (N sorts, N langues...), stockés dans `selections` ;
    - `min_total` : limite que la somme des valeurs choisies doit atteindre ou dépasser (codes) ;
    - `score` : simple valeur, plafonnée par `max` (piété).
    Les choix sont des intitulés libres en attendant les catalogues (sorts, langues, dieux, codes...).
    """

    label: str
    kind: Literal["count", "min_total", "score"]
    max: int | None = None
    group: str
    description: str | None = None


# Bottes : le nombre vient de `character.bottes` ; les autres de `character.resources`.
RESOURCE_DEFS: dict[str, ResourceDef] = {
    "bottes": ResourceDef(label="Bottes", kind="count", group="Combat"),
    "sorts": ResourceDef(label="Sorts", kind="count", group="Magie"),
    "langues": ResourceDef(label="Langues", kind="count", group="Culture", description=(
        "Lancer un sort se fait dans une langue : le lanceur la choisit avant de lancer les dés. "
        "Chaque langue modifie les conditions de lancer des sorts.")),
    "dieux": ResourceDef(label="Dieux", kind="count", group="Religion"),
    "codes": ResourceDef(label="Codes", kind="min_total", group="Religion"),
    "piete": ResourceDef(label="Piété", kind="score", max=10, group="Religion"),
    "animaux_totems": ResourceDef(label="Animaux totems", kind="count", group="Compagnons"),
    "montures": ResourceDef(label="Montures", kind="count", group="Compagnons"),
    "oiseaux": ResourceDef(label="Oiseaux", kind="count", group="Compagnons"),
    "fauves": ResourceDef(label="Fauves", kind="count", group="Compagnons"),
    "dragons": ResourceDef(label="Dragons", kind="count", group="Compagnons"),
    "creatures_magiques": ResourceDef(label="Créatures magiques", kind="count", group="Compagnons"),
    "familiers": ResourceDef(label="Familiers", kind="count", group="Compagnons"),
    "chiens": ResourceDef(label="Chiens", kind="count", group="Compagnons"),
}

ChoiceTarget = Literal["skill", "skill_group", "knowledge"]


class Choice(BaseModel):
    """Ce parmi quoi le joueur choisit.

    Sans `options` ni `from_group` : tout le catalogue de `target`. Pour une connaissance, le choix
    est libre (le joueur écrit l'intitulé). Avec `allow_repeat`, le même élément peut être choisi
    plusieurs fois : c'est une répartition libre de `count` × `points`.
    """

    target: ChoiceTarget = "skill"
    options: list[str] = []
    from_group: str | None = None
    count: int = Field(1, ge=1, description="Nombre d'éléments à choisir ; chacun reçoit `points`.")
    allow_repeat: bool = False

    def candidates(self) -> list[str]:
        if self.options:
            return self.options
        if self.target == "knowledge":
            return []  # libre
        if self.target == "skill_group":
            return list(SKILL_GROUPS)
        if self.from_group:
            return list(SKILL_GROUPS[self.from_group]["skills"])
        return list(ALL_SKILLS)


class Grant(BaseModel):
    id: str | None = Field(None, description="Obligatoire pour un choix : sert de clé dans `role_choices`.")
    points: int = Field(gt=0)
    skill: str | None = None
    skill_group: str | None = None
    knowledge: str | None = None
    stat: str | None = None
    choice: Choice | None = None
    note: str | None = Field(None, description="Précision affichée, ex. « (sabre ou épée) » pour des bottes.")
    imposed: list[str] = Field([], description="Éléments du catalogue imposés parmi ceux que donne la stat, "
                                               "ex. la langue runique de l'Exorciste.")

    @model_validator(mode="after")
    def _check(self) -> "Grant":
        targets = (self.skill, self.skill_group, self.knowledge, self.stat, self.choice)
        if sum(x is not None for x in targets) != 1:
            raise ValueError("Un grant cible exactement une compétence, un groupe, une connaissance, une stat ou un choix.")
        if self.choice is not None and not self.id:
            raise ValueError("Un grant avec choix doit avoir un `id`.")
        if self.stat is not None and self.stat not in STATS:
            raise ValueError(f"Stat inconnue : {self.stat}")
        if self.imposed:
            labels = {e.label for e in CATALOGS.get(self.stat or "", [])}
            if not labels or not set(self.imposed) <= labels or len(self.imposed) > self.points:
                raise ValueError(f"Éléments imposés invalides : {self.imposed}")
        if self.skill is not None and self.skill not in ALL_SKILLS:
            raise ValueError(f"Compétence inconnue : {self.skill}")
        return self


class Role(BaseModel):
    label: str
    category: str
    # None : le rôle ne peut pas être pris à ce rang (ex. Marchand : secondaire uniquement).
    primary: list[Grant] | None = None
    secondary: list[Grant] | None = None
    # Estimation de la valeur du rôle en points arbitraires, pour l'équilibrage (non vérifiée).
    value: int | None = None
    secondary_value: int | None = None
    description: str = ""

    @model_validator(mode="after")
    def _unique_choice_ids(self) -> "Role":
        for grants in (self.primary or [], self.secondary or []):
            ids = [g.id for g in grants if g.id]
            if len(ids) != len(set(ids)):
                raise ValueError(f"{self.label} : ids de grants en double.")
        return self

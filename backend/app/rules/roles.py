"""Rôles : ce qu'ils accordent, et le calcul de ce que les rôles d'un personnage lui donnent.

Un rôle accorde des `Grant`, différents selon qu'il est pris en principal ou en secondaire
(colonnes « Principal » / « Secondaire » de refdoc/Roles.pdf). Un grant donne des points :
- à une compétence (`skill`) ou un groupe (`skill_group`) : ce sont les PCR ;
- à une connaissance (`knowledge`) : ajoutée aux connaissances libres du joueur ;
- à une statistique numérique (`stat`, voir STATS) : Magie, mana, bottes, sorts, langues... ;
- à un choix du joueur (`choice`), identifié par un `id` stable, par exemple :
  `Grant(id="arme", points=3, choice=Choice(options=["sabre", "epee"]))` (« sabre ou épée »),
  `Grant(id="melee", points=1, choice=Choice(from_group="combat_melee", count=2, allow_repeat=True))`
  (« +2 en compétences de mêlée au choix » : 2 points répartis librement).

Les choix du joueur sont stockés dans `creation.role_choices`, clé = `choice_key(source, id)`.

Ce que donnent les rôles est un **minimum** (voir refdoc/infos.md) : le joueur ne peut pas
descendre en dessous, pour qu'il ne retire pas des points donnés par un rôle pour les mettre ailleurs.

Les PCR sont stockés avec le personnage, calculés à la création, puis recalculés seulement sur
demande (`PATCH /characters/{id}?sync_roles=true`).

Modèles : `role_model.py`. Catalogue : `roles_catalog.py`.
"""

from pydantic import BaseModel

from app.rules import roles_catalog
from app.rules.catalogs import CATALOGS
from app.rules.role_model import STATS, ChoiceTarget, Grant, Role
from app.rules.roles_catalog import ROLE_CATEGORIES, role_key  # noqa: F401  (réexportés)

# Catalogue utilisé pour les calculs ; remplaçable dans les tests (monkeypatch).
ROLES: dict[str, Role] = roles_catalog.ROLES
COMMON_TRUNKS: dict[str, list[Grant]] = roles_catalog.COMMON_TRUNKS

def choice_key(source: str, grant_id: str) -> str:
    """`source` = clé du rôle, ou `tronc:<catégorie>` pour un tronc commun."""
    return f"{source}/{grant_id}"


class ChoiceState(BaseModel):
    key: str
    source_label: str
    points: int
    target: ChoiceTarget
    count: int
    allow_repeat: bool
    options: list[str]
    picked: list[str]


class RolePoints(BaseModel):
    """Tout ce que les rôles d'un personnage lui donnent (minimums)."""

    skills: dict[str, int] = {}
    skill_groups: dict[str, int] = {}
    knowledges: dict[str, int] = {}
    stats: dict[str, int] = {}
    notes: list[str] = []
    # Éléments imposés par les rôles, par ressource : {"langues": ["Runique"]}.
    imposed: dict[str, list[str]] = {}
    # Points de connaissance libres en plus (animal totem Serpent).
    free_knowledge: int = 0
    # Animaux totems dont les bonus sont comptés.
    totems: list[str] = []
    choices: list[ChoiceState] = []
    unknown_roles: list[str] = []
    # Rôles pris à un rang qu'ils n'autorisent pas, ex. "Marchand (principal)".
    invalid_ranks: list[str] = []


def _sources(primary: list[str], secondary: list[str], points: RolePoints) -> list[tuple[str, str, list[Grant]]]:
    """Grants à appliquer, sous la forme (clé source, libellé, grants)."""
    roles, trunks = ROLES, COMMON_TRUNKS
    sources: list[tuple[str, str, list[Grant]]] = []
    categories: list[str] = []
    for keys, rank, label in ((primary, "primary", "principal"), (secondary, "secondary", "secondaire")):
        for key in keys:
            role = roles.get(key)
            if role is None:
                points.unknown_roles.append(key)
                continue
            grants = getattr(role, rank)
            if grants is None:
                points.invalid_ranks.append(f"{role.label} ({label})")
                continue
            sources.append((key, role.label, grants))
            if role.category not in categories:
                categories.append(role.category)
    for category in categories:
        if category in trunks:
            sources.append((f"tronc:{category}", f"Tronc commun {ROLE_CATEGORIES.get(category, category)}", trunks[category]))
    return sources


def compute_role_points(primary: list[str], secondary: list[str], role_choices: dict[str, list[str]],
                        totems: list[str] | None = None) -> RolePoints:
    """Ce que donnent ces rôles avec ces choix. Les choix invalides ou incomplets ne rapportent rien
    (ils apparaissent dans `choices` pour que l'interface et la validation les signalent).

    Les bonus des animaux totems choisis (`totems`) comptent aussi comme des PCR : seuls les
    totems du catalogue, sans doublon et dans la limite donnée par les rôles, sont comptés."""
    result = RolePoints()

    def add(target: str, name: str, points: int) -> None:
        bucket = {"skill": result.skills, "skill_group": result.skill_groups,
                  "knowledge": result.knowledges, "stat": result.stats}[target]
        bucket[name] = bucket.get(name, 0) + points

    for source, label, grants in _sources(primary, secondary, result):
        for grant in grants:
            if grant.note:
                what = STATS.get(grant.stat or "", grant.stat or grant.skill or grant.knowledge or "")
                result.notes.append(f"{label} : {grant.points} {what} {grant.note}".replace("  ", " "))
            if grant.skill:
                add("skill", grant.skill, grant.points)
            elif grant.skill_group:
                add("skill_group", grant.skill_group, grant.points)
            elif grant.knowledge:
                add("knowledge", grant.knowledge, grant.points)
            elif grant.stat:
                add("stat", grant.stat, grant.points)
                for item in grant.imposed:
                    if item not in result.imposed.setdefault(grant.stat, []):
                        result.imposed[grant.stat].append(item)
            elif grant.choice and grant.id:
                key = choice_key(source, grant.id)
                choice = grant.choice
                options = choice.candidates()
                picked = role_choices.get(key, [])
                result.choices.append(ChoiceState(
                    key=key, source_label=label, points=grant.points, target=choice.target,
                    count=choice.count, allow_repeat=choice.allow_repeat, options=options, picked=picked,
                ))
                if choice_is_valid(picked, options, choice.count, choice.allow_repeat):
                    for name in picked:
                        add(choice.target, name.strip(), grant.points)

    catalog = {e.label: e for e in CATALOGS["animaux_totems"]}
    allowed = result.stats.get("animaux_totems", 0)
    for name in dict.fromkeys(t for t in totems or [] if t in catalog):
        if len(result.totems) >= allowed:
            break
        entry = catalog[name]
        result.totems.append(name)
        if entry.skill:
            add("skill", entry.skill, entry.points)
        if entry.mana:
            add("stat", "mana", entry.mana)
        result.free_knowledge += entry.free_knowledge
    return result


def choice_is_valid(picked: list[str], options: list[str], count: int, allow_repeat: bool = False) -> bool:
    """`options` vide : choix libre (connaissance), seuls des intitulés non vides sont exigés."""
    if len(picked) != count or any(not p.strip() for p in picked):
        return False
    if not allow_repeat and len(set(picked)) != count:
        return False
    return not options or all(p in options for p in picked)


def stored_role_points(skills: dict, skill_groups: dict) -> tuple[dict[str, int], dict[str, int]]:
    """PCR actuellement stockés (format JSON), sans les zéros."""

    def extract(scores: dict) -> dict[str, int]:
        return {name: s.get("pcr", 0) for name, s in scores.items() if s.get("pcr", 0)}

    return extract(skills), extract(skill_groups)


def apply_role_points(skills: dict, skill_groups: dict, pcr_skills: dict[str, int],
                      pcr_groups: dict[str, int]) -> tuple[dict, dict]:
    """Écrit ces PCR dans les compétences et groupes (format JSON stocké) ; les autres PCR passent à 0."""

    def apply(scores: dict, computed: dict[str, int]) -> dict:
        out = {name: {**score, "pcr": 0} for name, score in scores.items()}
        for name, pcr in computed.items():
            out[name] = {**out.get(name, {"pcp": 0}), "pcr": pcr}
        return out

    return apply(skills, pcr_skills), apply(skill_groups, pcr_groups)


def raise_to_floor(values: dict[str, int], floors: dict[str, int]) -> dict[str, int]:
    """Remonte chaque valeur au minimum donné par les rôles, sans jamais baisser ce que le joueur a ajouté."""
    out = dict(values)
    for name, floor in floors.items():
        out[name] = max(out.get(name, 0), floor)
    return out

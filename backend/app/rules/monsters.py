"""Caractéristiques des monstres, transcrites depuis refdoc/Caractéristique monstres.pdf.

Un monstre part d'une **entité de base** (Résistance, Dextérité, Force, Vivacité) ; ses caractéristiques
(Physique, Mobile, Intelligent...) lui ouvrent des attributs, des compétences et la magie. Ce qu'elles
n'ouvrent pas n'existe pas pour lui : pas de points possibles, et l'éditeur ne l'affiche pas.

Les autres traits (Mort vivant, Draconique...) sont descriptifs. Les monstres ont en plus une
**armure naturelle**, hors des attributs des PJ. Les interprétations sont dans refdoc/infos.md.
"""

from typing import Literal

from pydantic import BaseModel, Field

from app.rules.data import SKILL_GROUPS, SKILL_POOLS, Attribute
from app.rules.role_model import RESOURCE_DEFS
from app.rules.traits import COMBAT_GROUPS


class MonsterTraitDef(BaseModel):
    label: str
    kind: Literal["caracteristique", "autre"]
    effect: str
    requires: list[str] = Field([], description="Caractéristiques à avoir aussi (Civilisé : Intelligent et Empathique).")
    attributes: list[Attribute] = []
    skill_groups: list[str] = Field([], description="Groupes ouverts en entier.")
    skills: list[str] = Field([], description="Compétences ouvertes seules (les résistances).")
    magic: bool = Field(False, description="Attribut Magie et mana.")
    resources: list[str] = Field([], description="Ressources ouvertes (sorts, langues, bottes...), voir GATED_RESOURCES.")


BASE_ATTRIBUTES = [Attribute.RESISTANCE, Attribute.DEXTERITE, Attribute.FORCE, Attribute.VIVACITE]
# Ressources (role_model.RESOURCE_DEFS) qu'un monstre n'a que si une caractéristique les ouvre.
GATED_RESOURCES = ["bottes", "sorts", "langues", "dieux", "codes", "piete", "animaux_totems"]
# Ressources qu'un monstre n'a jamais.
MONSTER_EXCLUDED_RESOURCES = ["montures"]

MONSTER_TRAITS: dict[str, MonsterTraitDef] = {
    # Absent du document : les compétences de combat sont réservées aux humanoïdes. Les autres monstres
    # se battent avec d'autres compétences (Course pour une charge...).
    "humanoide": MonsterTraitDef(
        label="Humanoïde", kind="caracteristique", skill_groups=COMBAT_GROUPS, resources=["bottes"],
        effect="Groupes de compétence de combat (à distance, artillerie, mêlée) et bottes."),
    "physique": MonsterTraitDef(
        label="Physique", kind="caracteristique", skills=["physique"],
        effect="Compétence Résistance physique."),
    "mobile": MonsterTraitDef(
        label="Mobile", kind="caracteristique", attributes=[Attribute.AGILITE], skill_groups=["deplacement"],
        effect="Attribut Agilité, compétences de Déplacement."),
    "organique": MonsterTraitDef(
        label="Organique", kind="caracteristique", requires=["physique"], skills=["pathologique", "endurance"],
        effect="Compétences Résistance pathologique et Endurance."),
    "intelligent": MonsterTraitDef(
        label="Intelligent", kind="caracteristique", attributes=[Attribute.INTELLECT], skill_groups=["survie", "intellect"],
        effect="Attribut Intellect, groupes de compétence Survie et Intellect (connaissances comprises)."),
    "empathique": MonsterTraitDef(
        label="Empathique", kind="caracteristique", skills=["mentale"],
        effect="Compétence Résistance mentale."),
    "civilise": MonsterTraitDef(
        label="Civilisé", kind="caracteristique", requires=["intelligent", "empathique"],
        attributes=[Attribute.SOCIAL], skill_groups=["sociale", "artisanat"],
        effect="Attribut Social, groupes de compétence Sociale et Artisanat."),
    "doue_magiquement": MonsterTraitDef(
        label="Doué magiquement", kind="caracteristique", skill_groups=["magie"], magic=True,
        resources=["sorts", "langues", "dieux", "codes", "piete", "animaux_totems"],
        effect="Groupe Compétence magique, mana, attribut Magie, langues ; peut acquérir des dieux, codes, sorts, "
               "animaux totems et évoluer sur l'arbre de magie."),
    "mort_vivant": MonsterTraitDef(label="Mort vivant", kind="autre", effect="Descriptif."),
    "draconique": MonsterTraitDef(label="Draconique", kind="autre", effect="Descriptif."),
    "arthropode": MonsterTraitDef(label="Arthropode", kind="autre", effect="Descriptif."),
    "creature_marine": MonsterTraitDef(label="Créature marine", kind="autre", effect="Descriptif."),
    "reptile": MonsterTraitDef(label="Reptile", kind="autre", effect="Descriptif."),
}


def _check_catalog() -> None:
    """Le backend refuse de démarrer si une caractéristique cite un élément inconnu."""
    for key, t in MONSTER_TRAITS.items():
        for name in t.requires:
            assert name in MONSTER_TRAITS, f"Caractéristique {key} : requiert {name}, inconnue"
        for g in t.skill_groups:
            assert g in SKILL_GROUPS, f"Caractéristique {key} : groupe {g} inconnu"
        for s in t.skills:
            assert any(s in grp["skills"] for grp in SKILL_GROUPS.values()), f"Caractéristique {key} : compétence {s} inconnue"
        for r in t.resources:
            assert r in GATED_RESOURCES, f"Caractéristique {key} : ressource {r} absente de GATED_RESOURCES"
    for r in GATED_RESOURCES + MONSTER_EXCLUDED_RESOURCES:
        assert r in RESOURCE_DEFS, f"Ressource {r} inconnue"


_check_catalog()


class MonsterAccess(BaseModel):
    """Ce qu'un monstre possède, d'après ses caractéristiques."""

    attributes: list[Attribute]
    # Groupes affichés : ouverts en entier, ou dont au moins une compétence est ouverte (Résistances).
    skill_groups: list[str]
    skills: list[str]
    pools: list[str]
    magic: bool
    knowledges: bool
    forbidden_resources: list[str] = Field(description="Ressources que ce monstre n'a pas (non ouvertes, ou jamais : montures).")


def monster_access(traits: list[str]) -> MonsterAccess:
    picked = [MONSTER_TRAITS[t] for t in traits if t in MONSTER_TRAITS]
    attributes = set(BASE_ATTRIBUTES)
    full_groups: set[str] = set()
    skills: set[str] = set()
    magic = False
    resources: set[str] = set()
    for t in picked:
        resources.update(t.resources)
        attributes.update(t.attributes)
        full_groups.update(t.skill_groups)
        skills.update(t.skills)
        magic = magic or t.magic
    for g in full_groups:
        skills.update(SKILL_GROUPS[g]["skills"])
    groups = [g for g, grp in SKILL_GROUPS.items() if any(s in skills for s in grp["skills"])]
    return MonsterAccess(
        attributes=[a for a in Attribute if a in attributes],
        skill_groups=groups,
        skills=[s for grp in SKILL_GROUPS.values() for s in grp["skills"] if s in skills],
        pools=[p for p, pool in SKILL_POOLS.items() if pool["group"] in full_groups],
        magic=magic,
        knowledges="intellect" in full_groups,
        forbidden_resources=[r for r in GATED_RESOURCES if r not in resources] + MONSTER_EXCLUDED_RESOURCES,
    )


def monster_issues(traits: list[str]) -> list[tuple[str, str]]:
    """Saisie des caractéristiques : inconnues, en double, ou sans celles qu'elles requièrent."""
    issues = []
    for t in sorted({t for t in traits if traits.count(t) > 1}):
        issues.append(("monster.traits", f"« {MONSTER_TRAITS[t].label if t in MONSTER_TRAITS else t} » choisi plusieurs fois."))
    for t in traits:
        if t not in MONSTER_TRAITS:
            issues.append(("monster.traits", f"« {t} » n'est pas une caractéristique de monstre."))
            continue
        missing = [MONSTER_TRAITS[r].label for r in MONSTER_TRAITS[t].requires if r not in traits]
        if missing:
            issues.append(("monster.traits", f"{MONSTER_TRAITS[t].label} : doit aussi être {' et '.join(missing)}."))
    return issues

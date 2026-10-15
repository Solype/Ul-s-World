from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from app.rules.data import (
    BOTTES_PER_PC,
    PRIORITY_TABLE,
    SKILL_GROUPS,
    SKILL_POOLS,
    SPECIES_LIMITS,
    START_PC,
    Attribute,
    Priority,
    Species,
)
from app.rules import roles as roles_catalog
from app.rules.catalogs import CATALOGS, OPEN_CATALOGS, POWER_TIERS, CatalogEntry, PowerTierDef
from app.rules.monitors import MONITORS, MonitorDef
from app.rules.monsters import BASE_ATTRIBUTES, MONSTER_TRAITS, MonsterTraitDef
from app.rules.role_model import RESOURCE_DEFS, STATS, Grant, ResourceDef, Role
from app.rules.roles import ROLE_CATEGORIES
from app.rules.traits import TRAITS, AttributeLimit, TraitDef
from app.rules.validation import ValidationReport, validate_character
from app.schemas import CharacterBase

router = APIRouter(prefix="/rules", tags=["rules"])


class RoleCombo(BaseModel):
    primary: int
    secondary: int


class PriorityRow(BaseModel):
    cost: int
    roles: list[RoleCombo]
    attributes: int
    skill_groups: int
    money: int


class SkillGroup(BaseModel):
    label: str
    skills: dict[str, str]


class SkillPool(BaseModel):
    """Réserve alimentée par les PCP d'un groupe : chaque PCP donne `per_point` (mana, connaissances)."""

    group: str
    label: str
    per_point: int


class RuleText(BaseModel):
    """Texte des règles, en Markdown. Les lignes `<!-- data:xxx -->` sont remplacées par le frontend
    par un tableau construit à partir des données (`especes`, `priorites`)."""

    id: str
    title: str
    markdown: str


# Textes retranscrits depuis refdoc/ (un fichier par page, le titre est le premier « # »).
TEXTS_DIR = Path(__file__).resolve().parent.parent / "rules" / "texts"
TEXT_ORDER = ["creation"]


def _load_texts() -> list[RuleText]:
    texts = []
    for name in TEXT_ORDER:
        markdown = (TEXTS_DIR / f"{name}.md").read_text(encoding="utf-8")
        title, _, body = markdown.partition("\n")
        texts.append(RuleText(id=name, title=title.removeprefix("# ").strip(), markdown=body.strip()))
    return texts


RULE_TEXTS = _load_texts()


class Rules(BaseModel):
    start_pc: int
    bottes_per_pc: int
    attributes: list[Attribute]
    species_limits: dict[Species, dict[Attribute, AttributeLimit]]
    priorities: dict[Priority, PriorityRow]
    skill_groups: dict[str, SkillGroup]
    skill_pools: dict[str, SkillPool]
    roles: dict[str, Role]
    role_categories: dict[str, str]
    # Tronc commun de chaque catégorie (compté une fois, quel que soit le nombre de rôles de la catégorie).
    common_trunks: dict[str, list[Grant]]
    stats: dict[str, str]
    resource_defs: dict[str, ResourceDef]
    # Choix de certaines ressources (langues, animaux totems, sorts), stockés sous leur libellé.
    catalogs: dict[str, list[CatalogEntry]]
    # Catalogues incomplets (sorts) : un élément hors catalogue reste accepté.
    open_catalogs: list[str]
    # Paliers des pouvoirs des dieux, dans l'ordre, avec la piété qui les débloque.
    power_tiers: dict[str, PowerTierDef]
    # Traits de personnage : bonus (coûtent des PC) et malus (en rapportent).
    traits: dict[str, TraitDef]
    # Monstres : attributs de l'entité de base, caractéristiques et autres traits (refdoc/Caractéristique monstres.pdf).
    monster_base_attributes: list[Attribute]
    monster_traits: dict[str, MonsterTraitDef]
    # Moniteurs de condition d'un personnage en jeu, dans l'ordre d'affichage.
    monitors: dict[str, MonitorDef]
    # Textes des règles (pages à lire), en Markdown.
    texts: list[RuleText]


@router.get("", response_model=Rules, summary="Toutes les règles de création")
def get_rules() -> Rules:
    """Source unique des règles : le frontend construit ses formulaires à partir de cette réponse."""
    return Rules(
        start_pc=START_PC,
        bottes_per_pc=BOTTES_PER_PC,
        attributes=list(Attribute),
        species_limits={
            s: {a: AttributeLimit(min=lo, max=hi, superhuman=sh) for a, (lo, hi, sh) in limits.items()}
            for s, limits in SPECIES_LIMITS.items()
        },
        priorities={
            p: PriorityRow(**{**row, "roles": [RoleCombo(primary=a, secondary=b) for a, b in row["roles"]]})
            for p, row in PRIORITY_TABLE.items()
        },
        skill_groups={g: SkillGroup(**v) for g, v in SKILL_GROUPS.items()},
        skill_pools={k: SkillPool(**v) for k, v in SKILL_POOLS.items()},
        roles=roles_catalog.ROLES,
        role_categories=ROLE_CATEGORIES,
        common_trunks=roles_catalog.COMMON_TRUNKS,
        stats=STATS,
        resource_defs=RESOURCE_DEFS,
        catalogs=CATALOGS,
        open_catalogs=sorted(OPEN_CATALOGS),
        power_tiers=POWER_TIERS,
        traits=TRAITS,
        monster_base_attributes=BASE_ATTRIBUTES,
        monster_traits=MONSTER_TRAITS,
        monitors=MONITORS,
        texts=RULE_TEXTS,
    )


@router.post("/validate", response_model=ValidationReport, summary="Vérifier un personnage sans le sauvegarder")
def validate(character: CharacterBase) -> ValidationReport:
    return validate_character(character)

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
from app.rules.catalogs import CATALOGS, CatalogEntry
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
    # Choix fermés de certaines ressources (langues, animaux totems), stockés sous leur libellé.
    catalogs: dict[str, list[CatalogEntry]]
    # Traits de personnage : bonus (coûtent des PC) et malus (en rapportent).
    traits: dict[str, TraitDef]


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
        traits=TRAITS,
    )


@router.post("/validate", response_model=ValidationReport, summary="Vérifier un personnage sans le sauvegarder")
def validate(character: CharacterBase) -> ValidationReport:
    return validate_character(character)

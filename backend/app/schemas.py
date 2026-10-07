"""Schémas Pydantic exposés par l'API (ils apparaissent tels quels dans /docs)."""

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.rules.data import Attribute, Priority


class CharacterKind(StrEnum):
    PJ = "pj"
    PNJ = "pnj"
    MONSTRE = "monstre"


class CreationMode(StrEnum):
    """`rules` : créé selon les règles de création, et vérifié. `free` : saisie libre (monstres, PNJ...)."""

    RULES = "rules"
    FREE = "free"


class Priorities(BaseModel):
    roles: Priority | None = None
    attributes: Priority | None = None
    skill_groups: Priority | None = None
    money: Priority | None = None


class ExtraPC(BaseModel):
    """PC restants après les priorités, dépensés en relations, Magie ou bottes."""

    relations: int = Field(0, ge=0)
    magic: int = Field(0, ge=0)
    bottes: int = Field(0, ge=0)


class Roles(BaseModel):
    primary: list[str] = []
    secondary: list[str] = []


class SkillScore(BaseModel):
    """Colonnes de la fiche : points purs (PCP) et points de rôle (PCR). Le total est calculé."""

    pcp: int = Field(0, ge=0)
    pcr: int = Field(0, ge=0)

    @property
    def total(self) -> int:
        return self.pcp + self.pcr


class Mana(BaseModel):
    """Ressource commune à la magie et à la religion."""

    current: int = Field(0, ge=0)
    max: int = Field(0, ge=0)


class SelectionItem(BaseModel):
    """Un élément choisi grâce à une ressource (un sort, une langue, un code...)."""

    name: str = Field(min_length=1, max_length=100)
    value: int | None = Field(None, ge=0, description="Valeur de l'élément, pour les ressources `min_total` (codes).")


class TraitPick(BaseModel):
    """Un trait de personnage choisi (catalogue : rules/traits.py)."""

    key: str
    variant: str | None = Field(None, description="Variante, pour un trait à plusieurs coûts (Estropié : pied, main...).")
    choices: list[str] = Field([], description="Attribut, groupe, compétences ou espèce choisis, selon le trait.")
    rounded_up: list[Attribute] = Field([], description="Hybride : attributs dont la demi-valeur est arrondie au-dessus.")
    note: str = Field("", max_length=200, description="Précision libre : objet de la phobie, toxine...")


class Creation(BaseModel):
    """Choix faits pendant la création selon les règles. Absent pour une saisie libre."""

    priorities: Priorities = Priorities()
    extra_pc: ExtraPC = ExtraPC()
    money_spent: int = Field(0, ge=0)
    # Choix offerts par les rôles (« sabre ou épée »...) : clé du choix -> éléments choisis.
    role_choices: dict[str, list[str]] = {}


class CharacterBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    kind: CharacterKind = CharacterKind.PJ
    creation_mode: CreationMode = CreationMode.RULES
    # Texte libre : une espèce jouable (elfe, nain...) ou n'importe quelle créature (loup, dragon...).
    species: str | None = Field(None, max_length=50)
    age: int | None = Field(None, ge=0)
    attributes: dict[Attribute, int] = {}
    magic: int = Field(0, ge=0)
    bottes: int = Field(0, ge=0)
    roles: Roles = Roles()
    skill_groups: dict[str, SkillScore] = {}
    skills: dict[str, SkillScore] = {}
    # PCP mis dans les réserves des groupes (rules/data.py SKILL_POOLS) : mana, connaissances.
    pools: dict[str, Annotated[int, Field(ge=0)]] = {}
    # Connaissances libres, définies par les joueurs : intitulé -> niveau.
    knowledges: dict[Annotated[str, Field(min_length=1, max_length=100)], Annotated[int, Field(ge=0)]] = {}
    mana: Mana = Mana()
    # Compteurs de la fiche : sorts, langues, dieux, piété, montures... (clés : role_model.RESOURCE_STATS).
    resources: dict[str, Annotated[int, Field(ge=0)]] = {}
    # Éléments choisis grâce aux ressources : clé de role_model.RESOURCE_DEFS -> éléments.
    selections: dict[str, list[SelectionItem]] = {}
    traits: list[TraitPick] = []
    equipment: list[str] = []
    relations: list[str] = []
    notes: str = ""
    creation: Creation | None = None


class CharacterCreate(CharacterBase):
    pass


class CharacterUpdate(CharacterBase):
    """PATCH : seuls les champs envoyés sont modifiés."""

    name: str | None = Field(None, min_length=1, max_length=100)  # type: ignore[assignment]


EXPORT_FORMAT = "newmannheim/personnage"
EXPORT_VERSION = 1


class CharacterExport(BaseModel):
    """Fichier d'export d'un personnage, prévu pour être réimporté.

    `version` augmente quand le format change, pour que l'import sache convertir les anciens fichiers.
    """

    format: Literal["newmannheim/personnage"] = EXPORT_FORMAT
    version: int = EXPORT_VERSION
    exported_at: datetime
    character: CharacterBase


class UserPublic(BaseModel):
    """Ce qu'on montre d'un compte aux autres (propriétaire d'un personnage...)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str


class UserRead(UserPublic):
    is_admin: bool
    created_at: datetime


class Credentials(BaseModel):
    """Identifiant et mot de passe, pour l'inscription et la connexion."""

    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_.-]+$",
                          description="Lettres, chiffres, `_`, `.` et `-`. Sans distinction de casse.")
    password: str = Field(min_length=8, max_length=128)


class OwnerUpdate(BaseModel):
    owner_id: int


class CharacterRead(CharacterBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    # Absent pour un personnage créé avant les comptes, tant qu'aucun admin n'existe.
    owner: UserPublic | None = None
    created_at: datetime
    updated_at: datetime

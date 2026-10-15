"""Schémas Pydantic exposés par l'API (ils apparaissent tels quels dans /docs)."""

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.rules.data import Attribute, Priority
from app.rules.role_model import RESOURCE_DEFS


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

    name: str = Field(min_length=1, max_length=500)
    value: int | None = Field(None, ge=0, description="Valeur de l'élément : valeur d'un code, piété d'un dieu.")
    god: str | None = Field(None, max_length=100, description="Codes : le dieu dont vient le code (son contenu est `name`).")

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


class Monster(BaseModel):
    """Propre aux monstres (rules/monsters.py). Absent : fiche de monstre d'avant les caractéristiques, non restreinte."""

    traits: list[str] = Field([], description="Caractéristiques (Physique, Mobile...) et autres traits (Mort vivant...).")
    natural_armor: int = Field(0, ge=0, description="Armure naturelle.")


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
    monster: Monster | None = None

    @model_validator(mode="after")
    def _clamp_piety(self) -> "CharacterBase":
        """L'échelle de piété va de 0 à 10 : au-delà, elle reste à 10 (piété de départ et piété de chaque dieu)."""
        cap = RESOURCE_DEFS["piete"].max
        if self.resources.get("piete", 0) > cap:
            self.resources["piete"] = cap
        for god in self.selections.get("dieux", []):
            if (god.value or 0) > cap:
                god.value = cap
        return self


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


class Registration(Credentials):
    captcha_token: str | None = Field(None, max_length=4096,
                                      description="Jeton du widget Turnstile, si le captcha est activé.")


class CaptchaConfig(BaseModel):
    """Clé publique du widget Turnstile ; `null` quand le captcha est désactivé."""

    site_key: str | None


class OwnerUpdate(BaseModel):
    owner_id: int


class CharacterRead(CharacterBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    # Absent pour un personnage créé avant les comptes, tant qu'aucun admin n'existe.
    owner: UserPublic | None = None
    created_at: datetime
    updated_at: datetime


class RoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class RoomUpdate(RoomCreate):
    pass


class JoinRoom(BaseModel):
    code: str = Field(min_length=4, max_length=20, description="Code d'invitation, avec ou sans tiret.")


class AddMember(BaseModel):
    username: str = Field(min_length=1, max_length=32)


class SubmitCharacter(BaseModel):
    character_id: int


class RoomCharacterStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    # Monstre du MJ mis en jeu sans être intégré à la room : il ne sert qu'à porter ses instances.
    # Jamais montré aux joueurs (ni dans la room, ni en lecture de fiche).
    GM = "mj"


class InstanceVisibility(StrEnum):
    """Ce que les joueurs voient d'un personnage en jeu. Le MJ voit toujours tout.

    `cache` : rien (il n'est pas envoyé). `visible` : le personnage et ses statuts publics, sans
    moniteurs. `revele` : tout. Un PJ est toujours révélé ; un monstre ajouté par le MJ entre caché."""

    CACHE = "cache"
    VISIBLE = "visible"
    REVELE = "revele"


class CharacterSummary(BaseModel):
    """Ce que la room montre d'un personnage ; la fiche complète est sur /api/characters/{id}."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    kind: CharacterKind
    species: str | None
    owner: UserPublic | None


class RoomCharacterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    status: RoomCharacterStatus
    character: CharacterSummary
    created_at: datetime


class RoomMemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user: UserPublic
    joined_at: datetime


class RoomSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    gm: UserPublic
    created_at: datetime


class RoomRead(RoomSummary):
    """Une room vue par l'un de ses membres.

    `invite_code` n'est donné qu'au MJ. Les propositions en attente : toutes pour le MJ,
    seulement les siennes pour un joueur."""

    invite_code: str | None
    members: list[RoomMemberRead]
    characters: list[RoomCharacterRead]


class ChatMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class ChatMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    room_id: int
    author: UserPublic | None
    body: str
    created_at: datetime


class Monitor(BaseModel):
    current: int = Field(ge=0)
    max: int = Field(ge=0)


class GodResourceValue(BaseModel):
    """Une ressource propre à un dieu du personnage, avec sa valeur dans la room."""
    god: str
    name: str
    value: int
    max: int | None = None


class InstanceRead(BaseModel):
    """Un personnage en jeu dans une room, avec ses moniteurs.

    `sheet_max` : les max que donnerait la fiche aujourd'hui. S'ils diffèrent de ceux des moniteurs
    (la fiche a changé depuis), `POST .../resync` les applique en gardant les dégâts subis."""

    id: int
    room_id: int
    character: CharacterSummary
    monitors: dict[str, Monitor]
    # Pour un joueur, les statuts cachés sont retirés par le serveur.
    statuses: list["StatusRead"] = []
    sheet_max: dict[str, int]
    outdated: bool
    visibility: InstanceVisibility = InstanceVisibility.REVELE
    # Rang parmi les exemplaires du même personnage (3 loups : 1, 2, 3) ; absent s'il est seul.
    number: int | None = None
    # Monstres : armure naturelle (absente pour un joueur tant que le monstre n'est pas révélé).
    natural_armor: int | None = None
    # Ressources propres aux dieux de la fiche, avec leur valeur dans la room (absentes pour un joueur tant qu'il
    # n'est pas révélé).
    god_resources: list[GodResourceValue] = []
    # Place dans la room (ordre choisi par le MJ) : trier par `position`, puis par `id`.
    position: int = 0
    updated_at: datetime


class MonsterAdd(BaseModel):
    """Mettre en jeu un monstre : un des siens, ou un monstre de joueur accepté dans la room.
    Le même monstre peut être ajouté plusieurs fois (une instance par exemplaire)."""

    character_id: int
    visibility: InstanceVisibility = InstanceVisibility.CACHE


class VisibilityUpdate(BaseModel):
    visibility: InstanceVisibility


class MonitorChange(BaseModel):
    """Modifier des moniteurs. `delta` ajoute (positif : soin, négatif : dégâts), `set` fixe la valeur.
    Le résultat reste entre 0 et le max. Préférer `delta` : deux changements simultanés s'additionnent."""

    delta: dict[str, int] = {}
    set: dict[str, Annotated[int, Field(ge=0)]] = {}


class InstanceOrder(BaseModel):
    """Nouvel ordre des personnages en jeu : les ids de toutes les instances de la room, chacune une fois."""

    ids: list[int]


class GodResourceChange(BaseModel):
    """Modifier une ressource propre à un dieu, dans la room. `delta` ajoute (après `set`, s'il est donné)."""

    god: str
    name: str
    delta: int = 0
    set: int | None = Field(None, ge=0)


class StatusColor(StrEnum):
    """Palette fixe : le frontend associe à chaque nom une teinte lisible en thème clair et sombre."""

    NEUTRE = "neutre"
    ROUGE = "rouge"
    ORANGE = "orange"
    JAUNE = "jaune"
    VERT = "vert"
    BLEU = "bleu"
    VIOLET = "violet"
    ROSE = "rose"


class StatusRead(BaseModel):
    """Statut d'un personnage en jeu (tag libre). `hidden` : visible du MJ seul."""

    id: str
    label: str
    hidden: bool = False
    color: StatusColor = StatusColor.NEUTRE


class StatusCreate(BaseModel):
    label: str = Field(min_length=1, max_length=40)
    hidden: bool = Field(False, description="Visible du MJ seul (réservé au MJ).")
    color: StatusColor = StatusColor.NEUTRE


class StatusUpdate(BaseModel):
    """Seuls les champs envoyés changent. `hidden` (cacher / révéler) est réservé au MJ."""

    hidden: bool | None = None
    color: StatusColor | None = None


InstanceRead.model_rebuild()

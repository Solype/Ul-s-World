import re
import unicodedata
from datetime import UTC, datetime
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import Character
from app.realtime.manager import manager
from app.rules.data import BOTTES_PER_PC, SKILL_POOLS
from app.rules.role_model import RESOURCE_STATS
from app.rules.roles import apply_role_points, compute_role_points, raise_to_floor, stored_role_points
from app.rules.traits import expected_mana_max, trait_effects
from app.rules.validation import ValidationReport, validate_character
from app.schemas import (
    CharacterBase,
    CharacterCreate,
    CharacterExport,
    CharacterKind,
    CharacterRead,
    CharacterUpdate,
    CreationMode,
    TraitPick,
)

router = APIRouter(prefix="/characters", tags=["characters"])

# Routes synchrones : FastAPI les exécute dans un thread, la session SQLAlchemy (synchrone) ne bloque
# donc pas la boucle d'événements. Les événements websocket partent après la réponse (BackgroundTasks).


def _get_or_404(session: Session, character_id: int) -> Character:
    character = session.get(Character, character_id)
    if character is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Personnage introuvable")
    return character


def _uses_role_points(character: Character) -> bool:
    return character.kind == CharacterKind.PJ and character.creation_mode == CreationMode.RULES


def _sync_role_points(character: Character) -> None:
    """Applique ce que donnent les rôles et les choix du joueur (y compris les animaux totems),
    en tenant compte des traits (compétences inaccessibles, Hostilité des esprits, Demi-démon).

    - PCR : remplacés par le calcul ;
    - Magie, bottes : exactement rôles + achats en PC ;
    - mana max : exactement rôles + 15 × PCP mis dans la réserve Mana (voir `expected_mana_max`) ;
    - connaissances, ressources : remontées au minimum donné par les rôles
      (ce que le joueur a ajouté au-dessus est conservé).
    """
    roles = character.roles or {}
    creation = character.creation or {}
    extra = creation.get("extra_pc", {})
    fx, _ = trait_effects([TraitPick(**t) for t in character.traits or []], character.species,
                          (character.resources or {}).get("piete", 0))
    totems = [] if fx.no_totem_bonus else [i["name"] for i in (character.selections or {}).get("animaux_totems", [])]
    points = compute_role_points(roles.get("primary", []), roles.get("secondary", []),
                                 creation.get("role_choices", {}), totems,
                                 set(fx.role_forbidden_skills), set(fx.role_forbidden_groups))
    character.skills, character.skill_groups = apply_role_points(
        character.skills or {}, character.skill_groups or {}, points.skills, points.skill_groups
    )
    character.magic = points.stats.get("magic", 0) + extra.get("magic", 0)
    character.bottes = points.stats.get("bottes", 0) + extra.get("bottes", 0) * BOTTES_PER_PC
    character.knowledges = raise_to_floor(character.knowledges or {}, points.knowledges)
    mana_pool = (character.pools or {}).get("mana", 0) * SKILL_POOLS["mana"]["per_point"]
    character.mana = {**(character.mana or {}), "max": expected_mana_max(points.stats.get("mana", 0), mana_pool, fx)}
    character.resources = raise_to_floor(
        character.resources or {}, {k: v for k, v in points.stats.items() if k in RESOURCE_STATS}
    )


@router.get("", response_model=list[CharacterRead], summary="Lister les personnages")
def list_characters(kind: CharacterKind | None = None, session: Session = Depends(get_session)) -> list[Character]:
    """`kind` filtre par type : `pj`, `pnj` ou `monstre`. Sans filtre, tout est renvoyé."""
    query = select(Character).order_by(Character.updated_at.desc())
    if kind is not None:
        query = query.where(Character.kind == kind)
    return list(session.scalars(query))


@router.post("", response_model=CharacterRead, status_code=status.HTTP_201_CREATED, summary="Créer un personnage")
def create_character(payload: CharacterCreate, background: BackgroundTasks,
                     session: Session = Depends(get_session)) -> Character:
    character = Character(**payload.model_dump(mode="json"))
    if _uses_role_points(character):
        _sync_role_points(character)
    session.add(character)
    session.commit()
    background.add_task(manager.broadcast, "characters", {"type": "character.created", "id": character.id})
    return character


@router.get("/{character_id}", response_model=CharacterRead, summary="Lire un personnage")
def get_character(character_id: int, session: Session = Depends(get_session)) -> Character:
    return _get_or_404(session, character_id)


@router.patch("/{character_id}", response_model=CharacterRead, summary="Modifier un personnage")
def update_character(
    character_id: int,
    payload: CharacterUpdate,
    background: BackgroundTasks,
    sync_roles: bool = Query(
        False,
        description="Recalculer les PCR à partir des rôles et des choix actuels. "
        "Sinon, les PCR stockés sont conservés (les valeurs envoyées par le client sont ignorées).",
    ),
    session: Session = Depends(get_session),
) -> Character:
    character = _get_or_404(session, character_id)
    stored_pcr = stored_role_points(character.skills or {}, character.skill_groups or {})
    for field, value in payload.model_dump(mode="json", exclude_unset=True).items():
        setattr(character, field, value)
    if _uses_role_points(character):
        if sync_roles:
            _sync_role_points(character)
        else:
            character.skills, character.skill_groups = apply_role_points(
                character.skills or {}, character.skill_groups or {}, *stored_pcr
            )
    session.commit()
    event = {"type": "character.updated", "id": character.id}
    background.add_task(manager.broadcast, "characters", event)
    background.add_task(manager.broadcast, f"character:{character.id}", event)
    return character


@router.delete("/{character_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Supprimer un personnage")
def delete_character(character_id: int, background: BackgroundTasks, session: Session = Depends(get_session)) -> None:
    session.delete(_get_or_404(session, character_id))
    session.commit()
    background.add_task(manager.broadcast, "characters", {"type": "character.deleted", "id": character_id})


@router.get("/{character_id}/export", response_model=CharacterExport, summary="Exporter un personnage (fichier JSON)")
def export_character(character_id: int, response: Response, session: Session = Depends(get_session)) -> CharacterExport:
    """Fichier téléchargeable, versionné, prévu pour être réimporté plus tard."""
    character = CharacterRead.model_validate(_get_or_404(session, character_id))
    slug = re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", character.name).encode("ascii", "ignore").decode().lower())
    filename = f"{slug.strip('-') or 'personnage'}.json"
    response.headers["Content-Disposition"] = (
        f'attachment; filename="{filename}"; filename*=UTF-8\'\'{quote(character.name)}.json')
    return CharacterExport(exported_at=datetime.now(UTC), character=CharacterBase.model_validate(character.model_dump()))


@router.get("/{character_id}/validation", response_model=ValidationReport, summary="Vérifier un personnage sauvegardé")
def validate_saved(character_id: int, session: Session = Depends(get_session)) -> ValidationReport:
    character = CharacterRead.model_validate(_get_or_404(session, character_id))
    return validate_character(character)

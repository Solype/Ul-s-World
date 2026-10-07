"""Rôles et choix du joueur, sur un catalogue fictif (indépendant du vrai catalogue)."""

import pytest

from app.rules import roles
from app.rules.role_model import Choice, Grant, Role
from app.rules.roles import compute_role_points
from app.rules.validation import validate_character
from app.schemas import CharacterBase

GUERRIER = Role(
    label="Guerrier",
    category="combattant",
    primary=[
        Grant(points=2, skill="bouclier"),
        Grant(id="arme", points=2, choice=Choice(options=["sabre", "epee"])),           # « Sabre ou épée »
        Grant(id="melee", points=1, choice=Choice(from_group="combat_melee", count=2)),  # « 2 de mêlée au choix »
    ],
    secondary=[Grant(points=1, skill="bouclier")],
)


# Le vrai catalogue, capturé avant que la fixture ne le remplace par le catalogue fictif.
REAL_ROLES = roles.ROLES
REAL_TRUNKS = roles.COMMON_TRUNKS


def test_real_catalog_ranks():
    real = REAL_ROLES
    assert len(real) == 59
    assert real["marchand"].primary is None and real["marchand"].secondary
    assert real["specialiste_en_explosif"].label == "Spécialiste en explosif"
    assert real["princesse"].category == "exceptionnel"


@pytest.fixture(autouse=True)
def fake_catalog(monkeypatch):
    monkeypatch.setattr(roles, "ROLES", {
        "guerrier": GUERRIER,
        "garde": Role(label="Garde", category="combattant", secondary=[Grant(points=1, skill_group="survie")]),
    })
    monkeypatch.setattr(roles, "COMMON_TRUNKS", {"combattant": [Grant(points=1, skill="endurance")]})


def test_primary_and_secondary_grants_differ():
    assert compute_role_points(["guerrier"], [], {}).skills == {"bouclier": 2, "endurance": 1}
    assert compute_role_points([], ["guerrier"], {}).skills == {"bouclier": 1, "endurance": 1}


def test_common_trunk_counted_once():
    points = compute_role_points(["guerrier"], ["garde"], {})
    assert points.skills["endurance"] == 1
    assert points.skill_groups == {"survie": 1}


def test_role_taken_at_forbidden_rank():
    assert compute_role_points(["garde"], [], {}).invalid_ranks == ["Garde (principal)"]


def test_choice_keys_use_grant_ids():
    keys = {c.key for c in compute_role_points(["guerrier"], [], {}).choices}
    assert keys == {"guerrier/arme", "guerrier/melee"}


def test_choice_grant_requires_id():
    with pytest.raises(ValueError):
        Grant(points=1, choice=Choice(options=["arc"]))


def test_resolved_choices_give_points():
    points = compute_role_points(["guerrier"], [], {"guerrier/arme": ["epee"], "guerrier/melee": ["hache", "epee"]})
    assert points.skills == {"bouclier": 2, "epee": 3, "hache": 1, "endurance": 1}


@pytest.mark.parametrize("picked", [[], ["hache"], ["hache", "hache"], ["hache", "arc"]])
def test_invalid_choice_gives_nothing(picked):
    assert "hache" not in compute_role_points(["guerrier"], [], {"guerrier/melee": picked}).skills


def test_unknown_roles_are_reported_not_counted():
    assert compute_role_points(["druide"], [], {}).unknown_roles == ["druide"]


def test_validation_flags_pending_choices_and_rank(valid_character):
    valid_character["roles"] = {"primary": ["guerrier", "garde"], "secondary": []}
    fields = {i.field for i in validate_character(CharacterBase(**valid_character)).issues}
    assert {"creation.role_choices.guerrier/arme", "creation.role_choices.guerrier/melee", "roles"} <= fields


# --- Stockage et mise à jour des PCR ---

@pytest.fixture
def saved_guerrier(client, valid_character):
    valid_character["roles"] = {"primary": ["guerrier"], "secondary": []}
    valid_character["creation"]["role_choices"] = {"guerrier/arme": ["sabre"]}
    return client.post("/api/characters", json=valid_character).json()


def test_creation_computes_pcr_and_ignores_client_values(client, valid_character):
    valid_character["roles"] = {"primary": ["guerrier"], "secondary": []}
    valid_character["skills"]["hache"]["pcr"] = 99
    saved = client.post("/api/characters", json=valid_character).json()
    assert saved["skills"]["hache"]["pcr"] == 0
    assert saved["skills"]["bouclier"]["pcr"] == 2


def test_patch_keeps_stored_pcr_by_default(client, saved_guerrier, monkeypatch):
    cid = saved_guerrier["id"]
    # Le catalogue change : Guerrier donne désormais +4 en bouclier.
    monkeypatch.setitem(roles.ROLES, "guerrier", GUERRIER.model_copy(update={"primary": [Grant(points=4, skill="bouclier")]}))
    body = {**saved_guerrier, "skills": {**saved_guerrier["skills"], "sabre": {"pcp": 0, "pcr": 50}}}
    patched = client.patch(f"/api/characters/{cid}", json=body).json()
    assert patched["skills"]["bouclier"]["pcr"] == 2   # PCR stocké conservé
    assert patched["skills"]["sabre"]["pcr"] == 2      # valeur du client ignorée
    assert client.get(f"/api/characters/{cid}/validation").json()["role_points_outdated"] is True


def test_patch_with_sync_roles_recomputes(client, saved_guerrier, monkeypatch):
    cid = saved_guerrier["id"]
    monkeypatch.setitem(roles.ROLES, "guerrier", GUERRIER.model_copy(update={"primary": [Grant(points=4, skill="bouclier")]}))
    patched = client.patch(f"/api/characters/{cid}", params={"sync_roles": True}, json={}).json()
    assert patched["skills"]["bouclier"]["pcr"] == 4
    assert patched["skills"]["sabre"]["pcr"] == 0
    assert client.get(f"/api/characters/{cid}/validation").json()["role_points_outdated"] is False


# --- Catalogue réel : effets numériques et minimums ---

@pytest.fixture
def real_catalog(monkeypatch):
    monkeypatch.setattr(roles, "ROLES", REAL_ROLES)
    monkeypatch.setattr(roles, "COMMON_TRUNKS", REAL_TRUNKS)


def test_mage_gives_magic_mana_and_knowledge(real_catalog):
    points = compute_role_points(["magicien"], [], {"magicien/magie": ["alchimie"] * 5})
    assert points.stats["magic"] == 3                 # tronc commun
    assert points.stats["mana"] == 15 + 60            # tronc + Magicien principal
    assert points.knowledges == {"Magique": 4}        # 2 (tronc) + 2 (Magicien)
    assert points.skills["alchimie"] == 5             # « +5 en compétences magiques » réparties


def test_spread_choice_allows_repeats(real_catalog):
    ok = compute_role_points(["bretteur"], [], {"bretteur/arme": ["sabre"], "tronc:guerrier/melee": ["hache", "hache"]})
    assert ok.skills["hache"] == 2


def test_free_knowledge_choice(real_catalog):
    points = compute_role_points([], ["scientifique"], {"scientifique/connaissance": ["Botanique"]})
    assert points.knowledges == {"Botanique": 4}


def test_role_effects_are_minimums(real_catalog, valid_character):
    valid_character["roles"] = {"primary": ["cuirasse"], "secondary": ["marin", "marchand", "cuisinier"]}
    valid_character["knowledges"] = {"Culturelle": 0}
    fields = {i.field for i in validate_character(CharacterBase(**valid_character)).issues}
    assert {"knowledges.Culturelle", "knowledges.Biologique"} <= fields


def test_saving_applies_role_effects(real_catalog, client, valid_character):
    valid_character["roles"] = {"primary": ["adepte"], "secondary": ["marin", "marchand", "cuisinier"]}
    valid_character["knowledges"] = {"Mystique": 10}   # au-dessus du minimum : conservé
    valid_character["magic"] = 0
    saved = client.post("/api/characters", json=valid_character).json()
    assert saved["knowledges"]["Mystique"] == 10
    assert saved["knowledges"]["Culturelle"] == 1
    assert saved["mana"]["max"] == 30 + 30             # tronc religieux + Adepte
    assert saved["resources"] == {"langues": 1, "dieux": 1, "codes": 11, "piete": 3}
    assert saved["magic"] == 1                         # aucun rôle ne donne de Magie : 1 PC


def test_guerre_is_guerriere(real_catalog):
    # Coquille du document : « connaissance guerre » = « connaissance guerrière ».
    points = compute_role_points(["canonniere"], ["medic"], {"tronc:artilleuse/artillerie": ["canon", "engin"],
                                                             "tronc:guerisseur/resistances": ["endurance", "mentale"]})
    assert "Guerre" not in points.knowledges
    assert points.knowledges["Guerrière"] == 2 + 1  # tronc Artilleuse + Canonnière (Médic secondaire n'en donne pas)


def test_exorciste_imposes_runic(real_catalog, valid_character):
    points = compute_role_points(["exorciste"], [], {})
    assert points.stats["langues"] == 2                # tronc religieux + Exorciste
    assert points.imposed == {"langues": ["Runique"]}
    valid_character["roles"] = {"primary": ["exorciste"], "secondary": []}
    valid_character["selections"] = {"langues": [{"name": "Latin"}]}
    messages = [i.message for i in validate_character(CharacterBase(**valid_character)).issues if i.field == "selections.langues"]
    assert any("« Runique » est imposé" in m for m in messages)
    valid_character["selections"] = {"langues": [{"name": "Latin"}, {"name": "Runique"}]}
    messages = [i.message for i in validate_character(CharacterBase(**valid_character)).issues if i.field == "selections.langues"]
    assert not any("imposé" in m for m in messages)


def test_totem_bonuses_are_role_points(real_catalog):
    from app.rules.catalogs import TOTEMS
    from app.rules.data import ALL_SKILLS
    assert all(e.skill in ALL_SKILLS for e in TOTEMS if e.skill)
    # Chamane principal : 2 animaux totems.
    points = compute_role_points(["chamane"], [], {}, ["Aigle", "Cerf", "Serpent"])
    assert points.totems == ["Aigle", "Cerf"]          # au-delà de la limite : non compté
    assert points.skills["observation"] == 1
    base = compute_role_points(["chamane"], [], {})
    assert points.stats["mana"] == base.stats["mana"] + 20
    points = compute_role_points(["chamane"], [], {}, ["Serpent", "Serpent", "Chouette", "Inconnu"])
    assert points.totems == ["Serpent", "Chouette"]
    assert points.free_knowledge == 2

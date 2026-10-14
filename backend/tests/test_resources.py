"""Ressources donnant accès à des choix (sorts, langues...), codes et piété."""

import pytest

from app.rules.validation import validate_character
from app.schemas import CharacterBase


def issues(character: dict) -> dict[str, str]:
    return {i.field: i.message for i in validate_character(CharacterBase(**character)).issues}


def test_count_resource_requires_that_many_choices(monster):
    monster["resources"] = {"sorts": 2}
    monster["selections"] = {"sorts": [{"name": "Boule de feu"}]}
    assert "encore 1" in issues(monster)["selections.sorts"]
    monster["selections"]["sorts"].append({"name": "Éclair"})
    assert "selections.sorts" not in issues(monster)
    monster["selections"]["sorts"].append({"name": "Soin"})
    assert "3 choisis pour 2" in issues(monster)["selections.sorts"]


def test_bottes_allowance_comes_from_bottes(monster):
    monster["bottes"] = 1
    assert "selections.bottes" in issues(monster)
    monster["selections"] = {"bottes": [{"name": "Fente du sabre"}]}
    assert "selections.bottes" not in issues(monster)


@pytest.fixture
def god_codes(monkeypatch):
    """Codes de test pour Dieu 1 et Dieu 2 (le catalogue réel est encore vide)."""
    from app.rules.catalogs import GODS, GodCode
    monkeypatch.setattr(GODS[0], "codes", [GodCode(content="A", value=6, zeal=1), GodCode(content="B", value=4, zeal=2)])
    monkeypatch.setattr(GODS[1], "codes", [GodCode(content="C", value=7, zeal=3)])


def test_codes_total_must_reach_the_limit(monster, god_codes):
    """La valeur de codes des rôles est un minimum ; la valeur des codes vient du catalogue, pas de la fiche."""
    monster["resources"] = {"dieux": 2, "codes": 11}
    monster["selections"] = {"dieux": [{"name": "Dieu 1"}, {"name": "Dieu 2"}],
                             "codes": [{"name": "A", "god": "Dieu 1", "value": 99}, {"name": "B", "god": "Dieu 1"}]}
    assert "valeur totale 10" in issues(monster)["selections.codes"]
    monster["selections"]["codes"][1] = {"name": "C", "god": "Dieu 2"}   # 13 : on est forcé de dépasser
    assert "selections.codes" not in issues(monster)


def code_issues(character: dict) -> str:
    """Tous les messages sur les codes (`issues` ne garde que le dernier)."""
    return " ".join(i.message for i in validate_character(CharacterBase(**character)).issues if i.field == "selections.codes")


def test_codes_come_from_chosen_gods(monster, god_codes):
    monster["resources"] = {"dieux": 1, "codes": 6}
    monster["selections"] = {"dieux": [{"name": "Dieu 1"}], "codes": [{"name": "C", "god": "Dieu 2"}]}
    assert "« C » n'est pas un code d'un dieu choisi" in code_issues(monster)
    monster["selections"]["codes"] = [{"name": "Code libre"}]
    assert "« Code libre » n'est pas un code d'un dieu choisi" in code_issues(monster)
    monster["selections"]["codes"] = [{"name": "C", "god": "Dieu 1"}]
    assert "« C » n'est pas un code de « Dieu 1 »" in code_issues(monster)
    monster["selections"]["codes"] = [{"name": "A", "god": "Dieu 1"}, {"name": "A", "god": "Dieu 1"}]
    assert "« A » choisi plusieurs fois" in code_issues(monster)
    monster["selections"]["codes"] = [{"name": "A", "god": "Dieu 1"}]
    assert "pas un code" not in code_issues(monster)


def test_piety_is_capped(monster):
    monster["resources"] = {"piete": 11}
    assert "maximum 10" in issues(monster)["resources.piete"]


def test_score_resource_has_no_choices(monster):
    monster["selections"] = {"piete": [{"name": "?"}]}
    assert "selections.piete" in issues(monster)


def test_spell_catalog_is_open(monster):
    """Seuls les sorts d'Élémentarisme sont transcrits : un sort hors catalogue reste accepté, pas les doublons."""
    monster["resources"] = {"sorts": 2}
    monster["selections"] = {"sorts": [{"name": "Boule de feu"}, {"name": "Sort inventé"}]}
    assert "selections.sorts" not in issues(monster)
    monster["selections"]["sorts"][1]["name"] = "Boule de feu"
    assert "choisi plusieurs fois" in issues(monster)["selections.sorts"]


def test_god_catalog_is_closed(monster):
    """Les 12 dieux (noms provisoires) : un dieu hors catalogue est signalé."""
    from app.rules.catalogs import GODS
    assert len(GODS) == 12
    monster["resources"] = {"dieux": 2}
    monster["selections"] = {"dieux": [{"name": "Dieu 1"}, {"name": "Zeus"}]}
    assert "« Zeus » n'est pas dans le catalogue" in issues(monster)["selections.dieux"]
    monster["selections"]["dieux"][1]["name"] = "Dieu 12"
    assert "selections.dieux" not in issues(monster)


def test_god_codes_target_known_gods():
    """Les codes sont rangés par nom de dieu : une coquille dans le nom les perdrait sans bruit."""
    from app.rules.catalogs import _GOD_CODES, GODS
    assert set(_GOD_CODES) <= {g.label for g in GODS}


def test_catalog_resources_only_accept_catalog_entries(monster):
    monster["resources"] = {"langues": 2, "animaux_totems": 1}
    monster["selections"] = {"langues": [{"name": "Latin"}, {"name": "Klingon"}], "animaux_totems": [{"name": "Loup"}]}
    assert "« Klingon » n'est pas dans le catalogue" in issues(monster)["selections.langues"]
    assert "selections.animaux_totems" not in issues(monster)
    monster["selections"]["langues"][1]["name"] = "Latin"
    assert "choisi plusieurs fois" in issues(monster)["selections.langues"]
    monster["selections"]["langues"][1]["name"] = "Runique"
    assert "selections.langues" not in issues(monster)

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


def test_codes_total_must_reach_the_limit(monster):
    monster["resources"] = {"codes": 11}
    monster["selections"] = {"codes": [{"name": "Code A", "value": 6}, {"name": "Code B", "value": 4}]}
    assert "valeur totale 10" in issues(monster)["selections.codes"]
    monster["selections"]["codes"][1]["value"] = 7   # 13 : on est forcé de dépasser
    assert "selections.codes" not in issues(monster)


def test_piety_is_capped(monster):
    monster["resources"] = {"piete": 11}
    assert "maximum 10" in issues(monster)["resources.piete"]


def test_score_resource_has_no_choices(monster):
    monster["selections"] = {"piete": [{"name": "?"}]}
    assert "selections.piete" in issues(monster)


def test_catalog_labels_are_unique():
    """Un élément choisi est stocké sous son libellé : deux sorts ne peuvent pas porter le même nom."""
    from app.rules.catalogs import CATALOGS
    for key, entries in CATALOGS.items():
        labels = [e.label for e in entries]
        assert len(labels) == len(set(labels)), key


def test_spell_effects_target_known_spells():
    """Les effets sont rangés par libellé : une coquille dans le nom les perdrait sans bruit."""
    from app.rules.catalogs import _SPELL_EFFECTS, SPELLS
    assert set(_SPELL_EFFECTS) <= {s.label for s in SPELLS}


def test_spell_scaling():
    """Les effets d'un enchantement dépendent du nombre posé, ceux des autres sorts de la puissance."""
    from app.rules.catalogs import SPELLS
    assert {s.scaling for s in SPELLS if s.school == "enchantement"} == {"nombre"}
    assert {s.scaling for s in SPELLS if s.school != "enchantement"} == {"puissance"}


def test_spell_effect_is_exact_or_threshold():
    from pydantic import ValidationError
    from app.rules.catalogs import SpellEffect, _at, _from, _scaled
    assert _scaled("Dégâts", 2, unit="PV").per == 2
    assert _at(3, "x").at == 3 and _from(5, "x").at_least == 5
    with pytest.raises(ValidationError):
        SpellEffect(text="x", at=3, at_least=5)


def test_spell_catalog_is_open(monster):
    """Seuls les sorts d'Élémentarisme sont transcrits : un sort hors catalogue reste accepté, pas les doublons."""
    monster["resources"] = {"sorts": 2}
    monster["selections"] = {"sorts": [{"name": "Boule de feu"}, {"name": "Sort inventé"}]}
    assert "selections.sorts" not in issues(monster)
    monster["selections"]["sorts"][1]["name"] = "Boule de feu"
    assert "choisi plusieurs fois" in issues(monster)["selections.sorts"]


def test_catalog_resources_only_accept_catalog_entries(monster):
    monster["resources"] = {"langues": 2, "animaux_totems": 1}
    monster["selections"] = {"langues": [{"name": "Latin"}, {"name": "Klingon"}], "animaux_totems": [{"name": "Loup"}]}
    assert "« Klingon » n'est pas dans le catalogue" in issues(monster)["selections.langues"]
    assert "selections.animaux_totems" not in issues(monster)
    monster["selections"]["langues"][1]["name"] = "Latin"
    assert "choisi plusieurs fois" in issues(monster)["selections.langues"]
    monster["selections"]["langues"][1]["name"] = "Runique"
    assert "selections.langues" not in issues(monster)

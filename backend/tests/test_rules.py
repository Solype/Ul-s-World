from app.rules.data import group_level_cost
from app.rules.validation import validate_character
from app.schemas import CharacterBase


def test_group_level_cost_matches_document_example():
    # « Pour passer du niveau 0 au niveau 3 il faut donc 1 + 2 + 3 [...] 6 points »
    assert group_level_cost(3) == 6


def test_valid_character(valid_character):
    report = validate_character(CharacterBase(**valid_character))
    assert report.issues == []
    assert report.pc_spent == 25
    assert report.skill_group_points_spent == 18


def test_too_many_pc(valid_character):
    valid_character["creation"]["extra_pc"] = {"magic": 1, "relations": 1}
    report = validate_character(CharacterBase(**valid_character))
    assert any(i.field == "creation.priorities" for i in report.issues)


def test_attribute_out_of_species_limits(valid_character):
    valid_character["attributes"]["agilite"] = 8  # max Nain : 6
    valid_character["attributes"]["resistance"] = 4
    report = validate_character(CharacterBase(**valid_character))
    assert [i.field for i in report.issues] == ["attributes.agilite"]


def test_wrong_role_combination(valid_character):
    valid_character["roles"]["secondary"] = ["marin"]  # A : 1P+3S ou 2P+1S
    valid_character["knowledges"] = {}  # Marchand et Cuisinier ne sont plus là pour les donner
    report = validate_character(CharacterBase(**valid_character))
    assert [i.field for i in report.issues] == ["roles"]


def test_skills_must_use_twice_group_level(valid_character):
    valid_character["skills"]["hache"]["pcp"] = 5
    report = validate_character(CharacterBase(**valid_character))
    assert [i.field for i in report.issues] == ["skill_groups.combat_melee"]


def test_draft_reports_missing_choices():
    report = validate_character(CharacterBase(name="Brouillon"))
    fields = {i.field for i in report.issues}
    assert {"creation.priorities", "species"} <= fields


def test_free_mode_skips_creation_rules(monster):
    report = validate_character(CharacterBase(**monster))
    assert report.valid is True
    assert report.rules_checked is False


def test_free_mode_still_checks_skill_catalog(monster):
    monster["skills"]["morsure_inventee"] = {"pcp": 1}
    report = validate_character(CharacterBase(**monster))
    assert [i.field for i in report.issues] == ["skills.morsure_inventee"]


def test_rules_mode_requires_playable_species(valid_character):
    valid_character["species"] = "loup"
    report = validate_character(CharacterBase(**valid_character))
    assert any(i.field == "species" for i in report.issues)


def test_knowledges_are_free_form(monster):
    monster["knowledges"] = {"Généalogie des rois nains": 2, "Recettes de ragoût de kobold": 1}
    assert validate_character(CharacterBase(**monster)).issues == []


def test_mana_current_cannot_exceed_max(monster):
    monster["mana"] = {"current": 40, "max": 30}
    report = validate_character(CharacterBase(**monster))
    assert [i.field for i in report.issues] == ["mana"]


def test_npc_has_no_role_points(monster):
    monster["kind"] = "pnj"
    monster["skill_groups"]["combat_melee"]["pcr"] = 1
    report = validate_character(CharacterBase(**monster))
    assert [i.field for i in report.issues] == ["skill_groups.combat_melee"]


def test_free_mode_pc_can_set_role_points(valid_character):
    valid_character["creation_mode"] = "free"
    valid_character["skills"]["hache"]["pcr"] = 2
    assert validate_character(CharacterBase(**valid_character)).issues == []


# --- Réserves : Mana (Compétence magique) et Connaissances (Intellect) ---

def test_pools_count_in_group_distribution(valid_character):
    # Intellect niveau 1 : 2 PCP, ici tous mis dans Connaissances -> 4 points de connaissance libres.
    valid_character["skill_groups"]["intellect"] = {"pcp": 1}
    valid_character["pools"] = {"connaissances": 2}
    valid_character["knowledges"] = {"Culturelle": 1, "Biologique": 1, "Héraldique": 3, "Botanique": 1}
    assert validate_character(CharacterBase(**valid_character)).issues == []


def test_free_knowledge_must_match_pool(valid_character):
    valid_character["knowledges"]["Héraldique"] = 1  # aucun PCP en Connaissances
    report = validate_character(CharacterBase(**valid_character))
    assert [i.field for i in report.issues] == ["knowledges"]


def test_mana_comes_from_roles_and_pool(valid_character):
    valid_character["skill_groups"]["magie"] = {"pcp": 1}
    valid_character["pools"] = {"mana": 2}
    report = validate_character(CharacterBase(**valid_character))
    assert any("Mana max attendu : 30" in i.message for i in report.issues)
    valid_character["mana"] = {"max": 30}
    assert validate_character(CharacterBase(**valid_character)).issues == []

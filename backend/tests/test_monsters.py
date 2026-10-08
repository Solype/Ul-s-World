from app.rules.monsters import monster_access
from app.rules.validation import validate_character
from app.schemas import CharacterBase


def _fields(report) -> set[str]:
    return {i.field for i in report.issues}


def test_base_entity_has_four_attributes_and_no_skill():
    access = monster_access([])
    assert access.attributes == ["resistance", "force", "dexterite", "vivacite"]
    assert access.skill_groups == [] and access.skills == []
    assert not access.magic and not access.knowledges and access.pools == []


def test_combat_is_for_humanoids():
    access = monster_access(["humanoide"])
    assert access.skill_groups == ["combat_distance", "combat_artillerie", "combat_melee"]
    assert "bottes" not in access.forbidden_resources and "langues" in access.forbidden_resources


def test_resources_opened_by_characteristics(monster):
    assert {"langues", "sorts", "montures"} <= set(monster_access(["humanoide"]).forbidden_resources)
    assert monster_access(["doue_magiquement"]).forbidden_resources == ["bottes", "montures"]
    monster.update({"skill_groups": {}, "skills": {}, "monster": {"traits": ["doue_magiquement"]}, "bottes": 2,
                    "resources": {"langues": 1, "montures": 1},
                    "selections": {"langues": [{"name": "Runique"}], "montures": [{"name": "Cheval"}]}})
    messages = {i.field: i.message for i in validate_character(CharacterBase(**monster)).issues}
    assert "Humanoïde" in messages["bottes"]
    assert "resources.montures" in messages and "resources.langues" not in messages


def test_characteristics_open_attributes_skills_and_groups():
    access = monster_access(["physique", "organique", "mobile", "intelligent"])
    assert {"agilite", "intellect"} <= set(access.attributes)
    assert "social" not in access.attributes
    # Résistances : seulement les compétences ouvertes, pas Mentale (Empathique).
    assert {"physique", "pathologique", "endurance"} <= set(access.skills)
    assert "mentale" not in access.skills
    assert {"resistances", "deplacement", "survie", "intellect"} <= set(access.skill_groups)
    assert access.knowledges and access.pools == ["connaissances"]


def test_magically_gifted_opens_magic():
    access = monster_access(["doue_magiquement"])
    assert access.magic and "magie" in access.skill_groups and access.pools == ["mana"]
    assert not {"sorts", "langues", "dieux", "animaux_totems"} & set(access.forbidden_resources)


def test_requirements_are_checked(monster):
    monster["monster"] = {"traits": ["civilise", "organique", "intelligent"]}
    messages = [i.message for i in validate_character(CharacterBase(**monster)).issues if i.field == "monster.traits"]
    assert any("Civilisé" in m and "Empathique" in m for m in messages)
    assert any("Organique" in m and "Physique" in m for m in messages)
    assert not any("Intelligent" in m and "Empathique" not in m for m in messages)


def test_points_in_what_the_monster_lacks(monster):
    monster.update({
        "monster": {"traits": ["physique"], "natural_armor": 3},
        "attributes": {"force": 14, "agilite": 12},
        "skill_groups": {"combat_melee": {"pcp": 4}, "survie": {"pcp": 1}},
        "skills": {"main_nue": {"pcp": 6}, "physique": {"pcp": 2}, "mentale": {"pcp": 1}},
        "magic": 2, "mana": {"current": 0, "max": 30}, "resources": {"sorts": 1},
        "knowledges": {"Forêts": 1},
    })
    fields = _fields(validate_character(CharacterBase(**monster)))
    assert {"attributes.agilite", "skill_groups.survie", "skills.mentale", "magic", "mana",
            "resources.sorts", "knowledges", "skills.main_nue", "skill_groups.combat_melee"} <= fields
    assert not {"attributes.force", "skills.physique"} & fields


def test_valid_monster_reports_its_access(monster):
    """Un loup charge avec Course : pas de compétence de combat, réservées aux humanoïdes."""
    monster.update({
        "monster": {"traits": ["physique", "mobile", "draconique"], "natural_armor": 4},
        "skill_groups": {"deplacement": {"pcp": 3}}, "skills": {"course": {"pcp": 6}},
    })
    report = validate_character(CharacterBase(**monster))
    assert report.valid, report.issues
    assert report.monster_access and "agilite" in report.monster_access.attributes


def test_monster_without_block_is_not_restricted(monster):
    """Fiches de monstres d'avant les caractéristiques : rien n'est restreint."""
    report = validate_character(CharacterBase(**monster))
    assert report.valid and report.monster_access is None


def test_monster_block_is_saved(client, monster):
    monster["monster"] = {"traits": ["physique"], "natural_armor": 5}
    created = client.post("/api/characters", json=monster).json()
    assert created["monster"] == {"traits": ["physique"], "natural_armor": 5}
    assert "physique" in client.get("/api/rules").json()["monster_traits"]

from app.rules.traits import TRAITS, expected_mana_max, trait_effects
from app.rules.validation import validate_character
from app.schemas import CharacterBase, TraitPick


def check(character: dict, *traits: dict):
    character["traits"] = list(traits)
    return validate_character(CharacterBase(**character))


def fields(report) -> list[str]:
    return [i.field for i in report.issues]


def test_catalog_matches_document():
    # 21 bonus dans le document, dont Sociopathe de haut niveau, désactivé (voir refdoc/fix.md).
    assert sum(t.kind == "bonus" for t in TRAITS.values()) == 20
    assert "sociopathe" not in TRAITS
    assert sum(t.kind == "malus" for t in TRAITS.values()) == 17
    assert all(t.variants for t in TRAITS.values())
    assert all(v.pc < 0 for t in TRAITS.values() if t.kind == "bonus" for v in t.variants)
    assert all(v.pc > 0 for t in TRAITS.values() if t.kind == "malus" for v in t.variants)


def test_malus_gives_pc_and_bonus_costs(valid_character):
    report = check(valid_character, {"key": "chauve"})
    assert report.pc_total == 26 and report.issues == []
    report = check(valid_character, {"key": "charismatique"})
    assert report.pc_total == 24
    assert fields(report) == ["creation.priorities"]
    assert "24 disponibles (25 -1 par les traits)" in report.issues[0].message


def test_benediction_adds_attribute_points(valid_character):
    report = check(valid_character, {"key": "chauve"}, {"key": "benediction_terlema", "variant": "2"})
    assert report.attribute_points_available == 45
    assert fields(report) == ["creation.priorities", "attributes"]  # 25 + 1 - 2 = 24 PC < 25 dépensés


def test_aptitude_raises_max_to_superhuman(valid_character):
    valid_character["attributes"].update(agilite=8, resistance=4)  # max Nain en agilité : 6
    assert fields(check(valid_character)) == ["attributes.agilite"]
    report = check(valid_character, {"key": "aptitude", "choices": ["agilite"]}, {"key": "chauve"})
    assert report.trait_effects.attribute_limits["agilite"].max == 9
    assert report.issues == []


def test_exceptional_attribute_only_among_lowest_max(valid_character):
    report = check(valid_character, {"key": "attribut_exceptionnel", "choices": ["force"]}, {"key": "chauve"})
    assert set(report.trait_effects.lowest_max_attributes) == {"agilite", "vivacite", "social"}
    assert fields(report) == ["traits"]
    report = check(valid_character, {"key": "attribut_exceptionnel", "choices": ["vivacite"]}, {"key": "chauve"})
    assert report.trait_effects.attribute_limits["vivacite"].max == 9
    assert report.issues == []


def test_crippled_arm_lowers_force_max(valid_character):
    report = check(valid_character, {"key": "estropie", "variant": "bras"})
    assert report.trait_effects.attribute_limits["force"].max == 5
    assert fields(report) == ["attributes.force"]
    # Estropié peut être pris plusieurs fois (deux mains...).
    report = check(valid_character, {"key": "estropie", "variant": "main"}, {"key": "estropie", "variant": "pied"})
    assert report.pc_total == 27 and report.issues == []


def test_asocial(valid_character):
    report = check(valid_character, {"key": "asocial"})
    assert report.trait_effects.attribute_limits["social"].max == 1
    assert fields(report) == ["attributes.social"]
    valid_character["skill_groups"]["sociale"] = {"pcp": 1}  # 1 point de groupe : 19 sur 20
    valid_character["skills"].update(dressage={"pcp": 1}, psychologie={"pcp": 1})
    valid_character["attributes"].update(social=1, resistance=9, intellect=9, dexterite=9)
    report = check(valid_character, {"key": "asocial"})
    assert fields(report) == ["skills.psychologie"]  # Dressage reste accessible


def test_asocial_ignores_role_points_in_social_skills():
    fx, _ = trait_effects([TraitPick(key="asocial")], "nain")
    assert "dressage" not in fx.role_forbidden_skills
    assert {"argumentation", "imposture", "intimidation", "psychologie"} <= set(fx.role_forbidden_skills)


def test_incompetent_in_combat_blocks_all_combat_groups(valid_character):
    report = check(valid_character, {"key": "incompetent", "choices": ["combat"]})
    assert {"skills.hache", "skills.bouclier"} <= set(fields(report))
    # Les PCR du Cuirassé en bouclier sont ignorés.
    assert "bouclier" not in report.role_points.skills
    assert set(report.trait_effects.role_forbidden_groups) == {"combat_distance", "combat_artillerie", "combat_melee"}


def test_incompetent_in_magic_keeps_absorption_with_piety():
    fx, _ = trait_effects([TraitPick(key="incompetent", choices=["magie"])], "nain", piety=0)
    assert "absorption" in fx.forbidden_skills and "magie" in fx.role_forbidden_groups
    fx, _ = trait_effects([TraitPick(key="incompetent", choices=["magie"])], "nain", piety=3)
    assert "absorption" not in fx.forbidden_skills and "magie" not in fx.role_forbidden_groups


def test_no_money_and_magic_resistance(valid_character):
    report = check(valid_character, {"key": "sans_le_sou"}, {"key": "resistance_magie"})
    assert report.money_available == 0
    assert fields(report) == ["magic", "creation.money_spent"]


def test_hostile_spirits_ignore_totems():
    fx, _ = trait_effects([TraitPick(key="hostilite_esprits")], "nain")
    assert fx.no_totem_bonus


def test_half_demon_adds_100_mana(valid_character):
    report = check(valid_character, {"key": "demi_demon", "variant": "demon"}, {"key": "revenant"})
    assert fields(report) == ["mana"] and "Mana max attendu : 100" in report.issues[0].message
    valid_character["mana"] = {"current": 100, "max": 100}
    assert check(valid_character, {"key": "demi_demon", "variant": "demon"}, {"key": "revenant"}).issues == []
    # Les gains normaux (rôles, réserve Mana) s'ajoutent entiers aux 100.
    fx, _ = trait_effects([TraitPick(key="demi_demon", variant="demon")], "nain")
    assert expected_mana_max(15, 30, fx) == 145


def test_hyperhidrosis_needs_mana(valid_character):
    assert fields(check(valid_character, {"key": "hyperhidrose_manafique"}, {"key": "chauve"})) == ["traits"]


def test_hybrid_limits(valid_character):
    # Nain + Orc : vivacité et social tombent sur une demi-valeur, une des deux est arrondie au-dessus.
    report = check(valid_character, {"key": "hybride", "choices": ["orc"]}, {"key": "chauve"})
    assert fields(report) == ["traits"]
    report = check(valid_character, {"key": "hybride", "choices": ["orc"], "rounded_up": ["vivacite"]}, {"key": "chauve"})
    limits = report.trait_effects.attribute_limits
    assert sum(l.max for l in limits.values()) == 53
    assert (limits["vivacite"].min, limits["vivacite"].max, limits["vivacite"].superhuman) == (2, 7, 10)
    assert limits["force"].max == 9 and limits["social"].max == 6
    assert report.issues == []


def test_invalid_picks():
    _, issues = trait_effects([
        TraitPick(key="inconnu"),
        TraitPick(key="estropie"),  # variante manquante
        TraitPick(key="chauve"), TraitPick(key="chauve"),  # pas répétable
        TraitPick(key="aptitude", choices=["magie"]),
    ], "nain")
    assert [f for f, _ in issues] == ["traits.0", "traits.1", "traits.3", "traits.4"]


def test_incompatible_traits():
    _, issues = trait_effects([TraitPick(key="asocial"), TraitPick(key="incompetent", choices=["sociale"])], "nain")
    assert any("incompatible" in m for _, m in issues)


def test_free_mode_checks_picks_but_applies_no_effect(monster):
    monster["traits"] = [{"key": "chauve"}, {"key": "inconnu"}]
    report = validate_character(CharacterBase(**monster))
    assert fields(report) == ["traits.1"]


def test_saving_applies_traits(client, valid_character):
    valid_character["traits"] = [{"key": "incompetent", "choices": ["combat"]},
                                 {"key": "demi_demon", "variant": "vengeur"}]
    saved = client.post("/api/characters", json=valid_character).json()
    assert saved["skills"]["bouclier"]["pcr"] == 0
    assert saved["mana"]["max"] == 100
    assert saved["traits"][1] == {"key": "demi_demon", "variant": "vengeur", "choices": [], "rounded_up": [], "note": ""}

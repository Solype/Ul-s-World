from app.rules.monitors import monitor_maxima
from app.schemas import CharacterBase


def _pj(**extra) -> CharacterBase:
    return CharacterBase(
        name="Test", species="humain", attributes={"resistance": 6},
        skills={"physique": {"pcp": 3, "pcr": 2}, "mentale": {"pcp": 1}, "pathologique": {"pcr": 4}},
        **extra,
    )


def test_maxima_are_skill_plus_resistance():
    # Endurance sans compétence : Résistance seule. Pas de mana : pas de moniteur de mana.
    assert monitor_maxima(_pj()) == {"physique": 11, "mental": 7, "pathologique": 10, "endurance": 6}


def test_mana_monitor_only_when_the_character_has_mana():
    assert monitor_maxima(_pj(mana={"current": 10, "max": 45}))["mana"] == 45


def test_immunodeficiency_reduces_pathological():
    assert monitor_maxima(_pj(traits=[{"key": "immunodeficience"}]))["pathologique"] == 8


def test_revenant_loses_a_quarter_at_least_two_and_spares_mana():
    maxima = monitor_maxima(_pj(traits=[{"key": "revenant"}], mana={"max": 40}))
    # 11 → perd 2 (1/4 = 2) ; 7 → perd 2 (1/4 = 1, relevé à 2) ; 10 → perd 2 ; 6 → perd 2.
    assert maxima == {"physique": 9, "mental": 5, "pathologique": 8, "endurance": 4, "mana": 40}
    big = monitor_maxima(CharacterBase(name="X", attributes={"resistance": 10}, skills={"physique": {"pcp": 10}},
                                       traits=[{"key": "revenant"}]))
    assert big["physique"] == 15  # 20 - 5


def test_traits_combine_and_never_go_below_zero():
    weak = CharacterBase(name="X", traits=[{"key": "immunodeficience"}, {"key": "revenant"}])
    assert monitor_maxima(weak)["pathologique"] == 0

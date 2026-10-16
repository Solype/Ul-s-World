import pytest

from app.rules.damage import damage_after_armor
from tests.test_instances import in_play  # noqa: F401  (fixture : le PJ d'alice en jeu)
from tests.test_rooms import table  # noqa: F401


@pytest.mark.parametrize(("damage", "armor", "penetration", "expected"), [
    (7, 0, 5, 7),     # sans armure, la pénétration est ignorée
    (0, 0, 5, 0),
    (10, 6, 2, 6),    # dégâts > armure : l'armure perd la pénétration (6 - 2 = 4), 10 - 4 = 6
    (10, 6, 0, 4),
    (10, 6, 8, 10),   # pénétration > armure : l'armure tombe à 0, tout passe (jamais plus que les dégâts)
    (5, 6, 2, 2),     # armure > dégâts : seule la pénétration passe
    (1, 6, 3, 1),     # ... sans dépasser les dégâts
    (5, 6, 0, 0),
    (6, 6, 2, 2),     # égalité : les deux cas donnent le même résultat
    (6, 6, 9, 6),
])
def test_damage_after_armor(damage, armor, penetration, expected):
    assert damage_after_armor(damage, armor, penetration) == expected


def test_damage_never_exceeds_the_damage_before_armor():
    for damage in range(15):
        for armor in range(15):
            for penetration in range(15):
                assert 0 <= damage_after_armor(damage, armor, penetration) <= damage


def test_apply_damage_removes_what_passes_the_armor(in_play):  # noqa: F811
    gm, url = in_play["gm"], in_play["url"]
    before = in_play["instance"]["monitors"]["physique"]["current"]
    res = gm.post(f"{url}/damage", json={"monitor": "physique", "damage": 10, "armor": 6, "penetration": 2})
    assert res.status_code == 200
    assert res.json()["inflicted"] == 6
    assert res.json()["instance"]["monitors"]["physique"]["current"] == max(0, before - 6)
    # Un moniteur de condition ne descend pas sous 0.
    res = gm.post(f"{url}/damage", json={"monitor": "physique", "damage": 100})
    assert res.json()["instance"]["monitors"]["physique"]["current"] == 0


def test_apply_damage_needs_a_condition_monitor(in_play):  # noqa: F811
    gm, url = in_play["gm"], in_play["url"]
    assert gm.post(f"{url}/damage", json={"monitor": "mana", "damage": 3}).status_code == 422
    assert gm.post(f"{url}/damage", json={"monitor": "inconnu", "damage": 3}).status_code == 422
    assert gm.post(f"{url}/damage", json={"monitor": "physique", "damage": -1}).status_code == 422

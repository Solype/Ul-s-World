import pytest

from tests.test_rooms import table  # noqa: F401  (fixture : MJ, alice et bob dans une room)

SKILLS = {"physique": "physique", "mental": "mentale", "pathologique": "pathologique", "endurance": "endurance"}


def _expected(character: dict) -> dict[str, int]:
    resistance = character["attributes"].get("resistance", 0)
    skill = lambda key: sum((character["skills"].get(key) or {}).values())  # noqa: E731
    return {m: resistance + skill(s) for m, s in SKILLS.items()}


@pytest.fixture
def in_play(table):  # noqa: F811
    """Le PJ d'alice accepté dans la room : son instance existe."""
    gm, alice, room = table["gm"], table["alice"], table["room"]
    alice.post(f"/api/rooms/{room}/characters", json={"character_id": table["pj"]})
    assert gm.get(f"/api/rooms/{room}/instances").json() == []  # en attente : pas encore en jeu
    gm.post(f"/api/rooms/{room}/characters/{table['pj']}/accept")
    [instance] = gm.get(f"/api/rooms/{room}/instances").json()
    return {**table, "instance": instance, "url": f"/api/rooms/{room}/instances/{instance['id']}"}


def test_accepting_a_pc_creates_its_instance_at_max(in_play):
    instance = in_play["instance"]
    character = in_play["alice"].get(f"/api/characters/{in_play['pj']}").json()
    expected = _expected(character)
    assert {k: m["max"] for k, m in instance["monitors"].items()} == expected
    assert all(m["current"] == m["max"] for m in instance["monitors"].values())
    assert "mana" not in instance["monitors"]  # Thorgal n'a pas de mana
    assert instance["outdated"] is False and instance["character"]["name"] == "Thorgal"
    # Tous les membres voient les moniteurs.
    assert len(in_play["bob"].get(f"/api/rooms/{in_play['room']}/instances").json()) == 1
    assert in_play["outsider"].get(f"/api/rooms/{in_play['room']}/instances").status_code == 404


def test_only_pcs_get_an_instance_for_now(table):  # noqa: F811
    gm, alice, room = table["gm"], table["alice"], table["room"]
    alice.post(f"/api/rooms/{room}/characters", json={"character_id": table["pet"]})
    gm.post(f"/api/rooms/{room}/characters/{table['pet']}/accept")
    assert gm.get(f"/api/rooms/{room}/instances").json() == []


def test_gm_own_pc_enters_play_directly(table, valid_character):  # noqa: F811
    gm, room = table["gm"], table["room"]
    cid = gm.post("/api/characters", json=valid_character).json()["id"]
    gm.post(f"/api/rooms/{room}/characters", json={"character_id": cid})
    assert [i["character"]["id"] for i in gm.get(f"/api/rooms/{room}/instances").json()] == [cid]


def test_any_member_changes_monitors_within_bounds(in_play):
    bob, url = in_play["bob"], in_play["url"]
    physique = in_play["instance"]["monitors"]["physique"]["max"]
    res = bob.patch(url, json={"delta": {"physique": -3, "mental": -1}})
    assert res.status_code == 200
    assert res.json()["monitors"]["physique"]["current"] == physique - 3
    assert in_play["alice"].patch(url, json={"delta": {"physique": 1}}).json()["monitors"]["physique"]["current"] == physique - 2
    # Bornes : jamais sous 0 ni au-dessus du max.
    assert bob.patch(url, json={"delta": {"physique": -999}}).json()["monitors"]["physique"]["current"] == 0
    assert bob.patch(url, json={"delta": {"physique": 999}}).json()["monitors"]["physique"]["current"] == physique
    assert bob.patch(url, json={"set": {"endurance": 2}}).json()["monitors"]["endurance"]["current"] == 2
    assert bob.patch(url, json={"delta": {"mana": -1}}).status_code == 422
    assert in_play["outsider"].patch(url, json={"delta": {"physique": -1}}).status_code == 404


def test_resync_applies_sheet_changes_and_keeps_damage(in_play):
    alice, url, pj = in_play["alice"], in_play["url"], in_play["pj"]
    before = in_play["instance"]["monitors"]
    alice.patch(url, json={"delta": {"physique": -4}})
    character = alice.get(f"/api/characters/{pj}").json()
    alice.patch(f"/api/characters/{pj}", json={
        "attributes": {**character["attributes"], "resistance": character["attributes"]["resistance"] + 1},
        "mana": {"current": 0, "max": 30}})
    stale = alice.get(f"/api/rooms/{in_play['room']}/instances").json()[0]
    assert stale["outdated"] is True
    assert stale["monitors"]["physique"]["max"] == before["physique"]["max"]  # rien ne bouge tout seul

    synced = alice.post(f"{url}/resync").json()
    assert synced["outdated"] is False
    assert synced["monitors"]["physique"] == {"max": before["physique"]["max"] + 1,
                                              "current": before["physique"]["max"] + 1 - 4}
    assert synced["monitors"]["mana"] == {"current": 30, "max": 30}  # nouveau moniteur : au max


def test_instance_leaves_with_the_character(in_play):
    gm, room, pj = in_play["gm"], in_play["room"], in_play["pj"]
    gm.delete(f"/api/rooms/{room}/characters/{pj}")
    assert gm.get(f"/api/rooms/{room}/instances").json() == []
    # Revenir dans la room recrée une instance neuve, au max.
    in_play["alice"].post(f"/api/rooms/{room}/characters", json={"character_id": pj})
    gm.post(f"/api/rooms/{room}/characters/{pj}/accept")
    assert len(gm.get(f"/api/rooms/{room}/instances").json()) == 1
    in_play["alice"].delete(f"/api/characters/{pj}")
    assert gm.get(f"/api/rooms/{room}/instances").json() == []


def test_monitor_changes_are_pushed(in_play):
    bob, room, url = in_play["bob"], in_play["room"], in_play["url"]
    with in_play["gm"].websocket_connect(f"/ws/room:{room}") as ws:
        ws.receive_json()  # présence
        bob.patch(url, json={"delta": {"mental": -2}})
        event = ws.receive_json()
        assert event["type"] == "room.instance"
        assert event["instance"]["id"] == in_play["instance"]["id"]
        assert event["instance"]["monitors"]["mental"]["current"] == in_play["instance"]["monitors"]["mental"]["max"] - 2

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


def test_god_resources_live_in_the_room(in_play):
    """Les ressources viennent des dieux de la fiche (poussées en direct quand elle change) ; leur valeur est
    propre à la room, entre 0 et le max."""
    alice, bob, room, pj, url = in_play["alice"], in_play["bob"], in_play["room"], in_play["pj"], in_play["url"]
    assert in_play["instance"]["god_resources"] == []
    with in_play["gm"].websocket_connect(f"/ws/room:{room}") as ws:
        ws.receive_json()  # présence
        alice.patch(f"/api/characters/{pj}", json={"selections": {"dieux": [{"name": "Dieu 2", "value": 3}]}})
        event = ws.receive_json()
        assert event["type"] == "room.instance"
        assert event["instance"]["god_resources"] == [{"god": "Dieu 2", "name": "Clés bénies", "value": 0, "max": 3}]

    keys = {"god": "Dieu 2", "name": "Clés bénies"}
    value = lambda res: res.json()["god_resources"][0]["value"]  # noqa: E731
    assert value(bob.patch(f"{url}/god-resources", json={**keys, "delta": 2})) == 2
    assert value(bob.patch(f"{url}/god-resources", json={**keys, "delta": 5})) == 3      # max 3
    assert value(bob.patch(f"{url}/god-resources", json={**keys, "delta": -9})) == 0     # jamais sous 0
    assert value(bob.patch(f"{url}/god-resources", json={**keys, "set": 1})) == 1
    assert bob.patch(f"{url}/god-resources", json={"god": "Dieu 9", "name": "Rumeurs", "delta": 1}).status_code == 422
    # La fiche ne porte pas la valeur : elle est propre à la room.
    assert "amounts" not in alice.get(f"/api/characters/{pj}").json()["selections"]["dieux"][0]


def test_monitor_changes_are_pushed(in_play):
    bob, room, url = in_play["bob"], in_play["room"], in_play["url"]
    with in_play["gm"].websocket_connect(f"/ws/room:{room}") as ws:
        ws.receive_json()  # présence
        bob.patch(url, json={"delta": {"mental": -2}})
        event = ws.receive_json()
        assert event["type"] == "room.instance"
        assert event["instance"]["id"] == in_play["instance"]["id"]
        assert event["instance"]["monitors"]["mental"]["current"] == in_play["instance"]["monitors"]["mental"]["max"] - 2


def _labels(instance: dict) -> dict[str, bool]:
    return {s["label"]: s["hidden"] for s in instance["statuses"]}


def test_members_add_and_remove_public_statuses(in_play):
    alice, bob, url = in_play["alice"], in_play["bob"], in_play["url"]
    res = bob.post(f"{url}/statuses", json={"label": "  Enflammé  "})
    assert res.status_code == 201 and _labels(res.json()) == {"Enflammé": False}
    # Même intitulé, casse différente : pas de doublon.
    assert len(alice.post(f"{url}/statuses", json={"label": "enflammé"}).json()["statuses"]) == 1
    status_id = res.json()["statuses"][0]["id"]
    assert alice.delete(f"{url}/statuses/{status_id}").json()["statuses"] == []
    assert alice.post(f"{url}/statuses", json={"label": " "}).status_code == 422
    assert in_play["outsider"].post(f"{url}/statuses", json={"label": "x"}).status_code == 404


def test_hidden_statuses_are_for_the_gm_only(in_play):
    gm, alice, bob, url, room = in_play["gm"], in_play["alice"], in_play["bob"], in_play["url"], in_play["room"]
    assert bob.post(f"{url}/statuses", json={"label": "Maudit", "hidden": True}).status_code == 403
    hidden = gm.post(f"{url}/statuses", json={"label": "Maudit", "hidden": True}).json()
    gm.post(f"{url}/statuses", json={"label": "Empoisonné"})
    assert _labels(hidden) == {"Maudit": True}
    hidden_id = hidden["statuses"][0]["id"]

    # Les joueurs ne le reçoivent jamais : ni dans la liste, ni dans la réponse de leurs propres actions.
    assert _labels(alice.get(f"/api/rooms/{room}/instances").json()[0]) == {"Empoisonné": False}
    assert _labels(bob.patch(url, json={"delta": {"physique": -1}}).json()) == {"Empoisonné": False}
    assert _labels(gm.get(f"/api/rooms/{room}/instances").json()[0]) == {"Maudit": True, "Empoisonné": False}
    # Il n'existe pas pour eux : ni retrait, ni révélation, ni devinette par doublon.
    assert bob.delete(f"{url}/statuses/{hidden_id}").status_code == 404
    assert bob.patch(f"{url}/statuses/{hidden_id}", json={"hidden": False}).status_code == 403
    guessed = bob.post(f"{url}/statuses", json={"label": "maudit"}).json()
    assert _labels(guessed) == {"Empoisonné": False, "maudit": False}

    # Le MJ le révèle : tout le monde le voit.
    gm.patch(f"{url}/statuses/{hidden_id}", json={"hidden": False})
    assert "Maudit" in _labels(alice.get(f"/api/rooms/{room}/instances").json()[0])


def test_hidden_statuses_are_not_pushed_to_players(in_play):
    gm, bob, url, room = in_play["gm"], in_play["bob"], in_play["url"], in_play["room"]
    with gm.websocket_connect(f"/ws/room:{room}") as gm_ws, bob.websocket_connect(f"/ws/room:{room}") as bob_ws:
        for _ in range(2):
            gm_ws.receive_json()  # présence
        bob_ws.receive_json()
        gm.post(f"{url}/statuses", json={"label": "Possédé", "hidden": True})
        assert _labels(gm_ws.receive_json()["instance"]) == {"Possédé": True}
        assert _labels(bob_ws.receive_json()["instance"]) == {}


def test_status_colors(in_play):
    gm, bob, url = in_play["gm"], in_play["bob"], in_play["url"]
    plain = bob.post(f"{url}/statuses", json={"label": "Étourdi"}).json()["statuses"][0]
    assert plain["color"] == "neutre"
    fire = bob.post(f"{url}/statuses", json={"label": "Enflammé", "color": "rouge"}).json()["statuses"][1]
    assert fire["color"] == "rouge"
    assert bob.post(f"{url}/statuses", json={"label": "X", "color": "turquoise"}).status_code == 422
    # Tout membre qui gère le statut change sa couleur ; cacher reste réservé au MJ.
    recolored = bob.patch(f"{url}/statuses/{fire['id']}", json={"color": "orange"}).json()
    assert {s["label"]: s["color"] for s in recolored["statuses"]}["Enflammé"] == "orange"
    assert not any(s["hidden"] for s in recolored["statuses"])
    assert bob.patch(f"{url}/statuses/{fire['id']}", json={"color": "bleu", "hidden": True}).status_code == 403
    both = gm.patch(f"{url}/statuses/{fire['id']}", json={"color": "violet", "hidden": True}).json()
    assert {s["label"]: (s["color"], s["hidden"]) for s in both["statuses"]}["Enflammé"] == ("violet", True)

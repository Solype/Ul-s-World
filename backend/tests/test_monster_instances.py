import pytest

from tests.test_rooms import table  # noqa: F401  (fixture : MJ, alice et bob dans une room)


@pytest.fixture
def wolf(table, monster):  # noqa: F811
    """Un loup du MJ, physique et mobile : moniteur physique seulement, pas dans la room."""
    gm = table["gm"]
    monster.update({"monster": {"traits": ["physique", "mobile"], "natural_armor": 2},
                    "attributes": {"resistance": 3, "force": 6}, "skill_groups": {}, "skills": {"physique": {"pcp": 2}}})
    cid = gm.post("/api/characters", json=monster).json()["id"]
    return {**table, "wolf": cid, "base": f"/api/rooms/{table['room']}/instances"}


def test_gm_adds_copies_of_a_monster_hidden_by_default(wolf):
    gm, bob, base = wolf["gm"], wolf["bob"], wolf["base"]
    first = gm.post(base, json={"character_id": wolf["wolf"]})
    assert first.status_code == 201
    first = first.json()
    assert first["visibility"] == "cache" and first["natural_armor"] == 2
    # Seulement les moniteurs que ses caractéristiques ouvrent.
    assert first["monitors"] == {"physique": {"current": 5, "max": 5}}
    second = gm.post(base, json={"character_id": wolf["wolf"]}).json()
    assert second["number"] == 2
    assert [i["number"] for i in gm.get(base).json()] == [1, 2]
    # Caché : rien pour les joueurs, ni dans la room ni en fiche.
    assert bob.get(base).json() == []
    room = bob.get(f"/api/rooms/{wolf['room']}").json()
    assert all(rc["character"]["id"] != wolf["wolf"] for rc in room["characters"])
    assert bob.get(f"/api/characters/{wolf['wolf']}").status_code == 404
    assert bob.patch(f"{base}/{first['id']}", json={"delta": {"physique": -1}}).status_code == 404


def test_only_the_gm_adds_monsters_and_only_allowed_ones(wolf, monster):
    gm, alice, base, room = wolf["gm"], wolf["alice"], wolf["base"], wolf["room"]
    assert alice.post(base, json={"character_id": wolf["wolf"]}).status_code == 403
    # Un PJ n'est pas un monstre ; le monstre d'un joueur doit être accepté dans la room.
    assert gm.post(base, json={"character_id": wolf["pj"]}).status_code == 404
    theirs = alice.post("/api/characters", json={**monster, "name": "Ours"}).json()["id"]
    assert gm.post(base, json={"character_id": theirs}).status_code == 404
    alice.post(f"/api/rooms/{room}/characters", json={"character_id": theirs})
    gm.post(f"/api/rooms/{room}/characters/{theirs}/accept")
    assert gm.post(base, json={"character_id": theirs}).status_code == 201


def test_visibility_levels(wolf):
    gm, bob, base = wolf["gm"], wolf["bob"], wolf["base"]
    instance = gm.post(base, json={"character_id": wolf["wolf"]}).json()
    url = f"{base}/{instance['id']}"
    gm.post(f"{url}/statuses", json={"label": "Enragé"})
    seen = gm.put(f"{url}/visibility", json={"visibility": "visible"}).json()
    assert seen["visibility"] == "visible" and seen["monitors"]  # le MJ voit tout
    [for_bob] = bob.get(base).json()
    assert for_bob["monitors"] == {} and for_bob["natural_armor"] is None
    assert [s["label"] for s in for_bob["statuses"]] == ["Enragé"]
    gm.put(f"{url}/visibility", json={"visibility": "revele"})
    [for_bob] = bob.get(base).json()
    assert for_bob["monitors"]["physique"]["max"] == 5 and for_bob["natural_armor"] == 2
    # Les joueurs ne touchent pas aux monstres.
    assert bob.patch(url, json={"delta": {"physique": -1}}).status_code == 403
    assert bob.put(f"{url}/visibility", json={"visibility": "cache"}).status_code == 403


def test_visibility_changes_are_pushed(wolf):
    gm, bob, base, room = wolf["gm"], wolf["bob"], wolf["base"], wolf["room"]
    instance = gm.post(base, json={"character_id": wolf["wolf"]}).json()
    url = f"{base}/{instance['id']}"
    with gm.websocket_connect(f"/ws/room:{room}") as gm_ws, bob.websocket_connect(f"/ws/room:{room}") as bob_ws:
        for _ in range(2):
            gm_ws.receive_json()  # présence
        bob_ws.receive_json()
        gm.put(f"{url}/visibility", json={"visibility": "visible"})
        assert gm_ws.receive_json()["instance"]["monitors"]
        event = bob_ws.receive_json()
        assert event["type"] == "room.instance" and event["instance"]["monitors"] == {}
        gm.put(f"{url}/visibility", json={"visibility": "cache"})
        gm_ws.receive_json()
        assert bob_ws.receive_json() == {"type": "room.instance.removed", "id": instance["id"]}


def test_remove_a_copy(wolf):
    gm, base, room = wolf["gm"], wolf["base"], wolf["room"]
    a = gm.post(base, json={"character_id": wolf["wolf"]}).json()
    b = gm.post(base, json={"character_id": wolf["wolf"]}).json()
    assert wolf["alice"].delete(f"{base}/{a['id']}").status_code == 403
    assert gm.delete(f"{base}/{a['id']}").status_code == 204
    [left] = gm.get(base).json()
    assert left["id"] == b["id"] and left["number"] is None
    gm.delete(f"{base}/{b['id']}")
    # Le dernier exemplaire parti, le monstre du MJ n'est plus rattaché à la room.
    assert gm.get(base).json() == []
    assert gm.post(f"/api/rooms/{room}/characters", json={"character_id": wolf["wolf"]}).status_code == 201


def test_pc_cannot_be_hidden_or_removed_this_way(wolf):
    gm, alice, room = wolf["gm"], wolf["alice"], wolf["room"]
    alice.post(f"/api/rooms/{room}/characters", json={"character_id": wolf["pj"]})
    gm.post(f"/api/rooms/{room}/characters/{wolf['pj']}/accept")
    [pc] = gm.get(wolf["base"]).json()
    assert pc["visibility"] == "revele"
    assert gm.put(f"{wolf['base']}/{pc['id']}/visibility", json={"visibility": "cache"}).status_code == 422
    assert gm.delete(f"{wolf['base']}/{pc['id']}").status_code == 422


def test_gm_places_and_groups_characters_in_play(wolf):
    """Le MJ place les cartes et les groupe (le même pour tous) ; une nouvelle carte arrive hors groupe, à la fin."""
    gm, alice, bob, room, base = wolf["gm"], wolf["alice"], wolf["bob"], wolf["room"], wolf["base"]
    layout, groups = f"{base}/layout", f"/api/rooms/{room}/groups"
    alice.post(f"/api/rooms/{room}/characters", json={"character_id": wolf["pj"]})
    gm.post(f"/api/rooms/{room}/characters/{wolf['pj']}/accept")
    [pc] = gm.get(base).json()
    w1 = gm.post(base, json={"character_id": wolf["wolf"], "visibility": "visible"}).json()
    w2 = gm.post(base, json={"character_id": wolf["wolf"]}).json()   # caché aux joueurs
    assert [i["id"] for i in gm.get(base).json()] == [pc["id"], w1["id"], w2["id"]]
    assert gm.get(groups).json() == []

    body = {"loose": [pc["id"]], "groups": [{"name": " Embuscade ", "ids": [w2["id"]]},
                                            {"name": "Meute", "ids": [w1["id"]]}]}
    assert bob.put(layout, json=body).status_code == 403
    assert gm.put(layout, json={**body, "loose": []}).status_code == 422                       # il en manque un
    assert gm.put(layout, json={**body, "loose": [pc["id"], w1["id"]]}).status_code == 422     # doublon
    assert gm.put(layout, json={**body, "groups": [{"id": 999, "name": "X", "ids": [w1["id"], w2["id"]]}]}
                  ).status_code == 422                                                         # groupe inconnu
    with bob.websocket_connect(f"/ws/room:{room}") as ws:
        ws.receive_json()  # présence
        res = gm.put(layout, json=body).json()
        assert ws.receive_json() == {"type": "room.instances.layout"}
    ambush, pack = res["groups"]
    assert (ambush["name"], pack["name"]) == ("Embuscade", "Meute")
    assert [(i["id"], i["group_id"]) for i in res["instances"]] == [
        (pc["id"], None), (w2["id"], ambush["id"]), (w1["id"], pack["id"])]
    assert [i["id"] for i in gm.get(base).json()] == [pc["id"], w2["id"], w1["id"]]
    # Le joueur ne voit pas le groupe où il n'y a que le loup caché.
    assert [i["id"] for i in bob.get(base).json()] == [pc["id"], w1["id"]]
    assert bob.get(groups).json() == [pack]

    # Renommer, réordonner, déplacer : la Meute passe devant et reçoit les deux loups ; l'Embuscade est dissoute
    # par son absence, un groupe vide est créé.
    res = gm.put(layout, json={"loose": [pc["id"]], "groups": [
        {"id": pack["id"], "name": "Loups", "ids": [w1["id"], w2["id"]]}, {"name": "Renforts"}]}).json()
    assert [(g["id"], g["name"], g["position"]) for g in res["groups"]] == [
        (pack["id"], "Loups", 0), (res["groups"][1]["id"], "Renforts", 1)]
    assert [i["group_id"] for i in gm.get(base).json()] == [None, pack["id"], pack["id"]]
    w3 = gm.post(base, json={"character_id": wolf["wolf"]}).json()
    assert w3["group_id"] is None
    assert [i["id"] for i in gm.get(base).json()] == [pc["id"], w1["id"], w2["id"], w3["id"]]
    # Supprimer la room emporte ses groupes.
    assert gm.delete(f"/api/rooms/{room}").status_code == 204

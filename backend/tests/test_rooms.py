import pytest
from starlette.websockets import WebSocketDisconnect


@pytest.fixture
def table(make_client, valid_character, monster):
    """Une room : maitre (MJ) avec alice et bob joueurs. Alice a un PJ et un animal de compagnie.
    Personne n'y est admin (le premier compte, qui l'est, reste en dehors)."""
    make_client("admin")
    gm, alice, bob, outsider = make_client("maitre"), make_client("alice"), make_client("bob"), make_client("eve")
    room = gm.post("/api/rooms", json={"name": "La Compagnie"}).json()
    for player in (alice, bob):
        assert player.post("/api/rooms/join", json={"code": room["invite_code"]}).status_code == 200
    pj = alice.post("/api/characters", json=valid_character).json()["id"]
    pet = alice.post("/api/characters", json={**monster, "name": "Croc", "kind": "pnj"}).json()["id"]
    return {"gm": gm, "alice": alice, "bob": bob, "outsider": outsider, "room": room["id"],
            "code": room["invite_code"], "pj": pj, "pet": pet}


def _statuses(room: dict) -> dict[str, str]:
    return {rc["character"]["name"]: rc["status"] for rc in room["characters"]}


def test_anyone_creates_a_room_and_is_its_gm(make_client):
    make_client("maitre")  # premier compte = admin ; alice est un compte ordinaire
    alice = make_client("alice")
    room = alice.post("/api/rooms", json={"name": "Ma table"}).json()
    assert room["gm"]["username"] == "alice"
    assert len(room["invite_code"]) == 8 and room["members"] == []
    assert [r["name"] for r in alice.get("/api/rooms").json()] == ["Ma table"]


def test_join_by_code_or_by_username(table, make_client):
    gm, alice = table["gm"], table["alice"]
    room = alice.get(f"/api/rooms/{table['room']}").json()
    assert room["invite_code"] is None  # seul le MJ voit le code
    assert [m["user"]["username"] for m in room["members"]] == ["alice", "bob"]
    # Code tapé à la main : minuscules et tiret acceptés.
    carl = make_client("carl")
    code = table["code"].lower()
    assert carl.post("/api/rooms/join", json={"code": f"{code[:4]}-{code[4:]}"}).status_code == 200
    assert carl.post("/api/rooms/join", json={"code": "ZZZZZZZZ"}).status_code == 404

    eve = table["outsider"]
    assert eve.get(f"/api/rooms/{table['room']}").status_code == 404
    assert alice.post(f"/api/rooms/{table['room']}/members", json={"username": "eve"}).status_code == 403
    assert gm.post(f"/api/rooms/{table['room']}/members", json={"username": "personne"}).status_code == 404
    added = gm.post(f"/api/rooms/{table['room']}/members", json={"username": "EVE"}).json()
    assert "eve" in [m["user"]["username"] for m in added["members"]]
    assert [r["name"] for r in eve.get("/api/rooms").json()] == ["La Compagnie"]


def test_player_submits_characters_and_gm_decides(table):
    gm, alice, bob, room = table["gm"], table["alice"], table["bob"], table["room"]
    url = f"/api/rooms/{room}/characters"
    alice.post(url, json={"character_id": table["pj"]})
    res = alice.post(url, json={"character_id": table["pet"]})
    assert _statuses(res.json()) == {"Thorgal": "pending", "Croc": "pending"}
    assert alice.post(url, json={"character_id": table["pj"]}).status_code == 409
    # On ne propose que ses propres personnages.
    assert bob.post(url, json={"character_id": table["pj"]}).status_code == 404

    # Les propositions en attente : le MJ les voit (fiche comprise), les autres joueurs non.
    assert _statuses(bob.get(f"/api/rooms/{room}").json()) == {}
    assert gm.get(f"/api/characters/{table['pj']}").status_code == 200
    assert bob.get(f"/api/characters/{table['pj']}").status_code == 404
    assert bob.post(f"{url}/{table['pj']}/accept").status_code == 403

    gm.post(f"{url}/{table['pj']}/accept")
    after = gm.delete(f"{url}/{table['pet']}").json()  # refus
    assert _statuses(after) == {"Thorgal": "accepted"}
    assert _statuses(bob.get(f"/api/rooms/{room}").json()) == {"Thorgal": "accepted"}


def test_room_members_see_accepted_sheets_but_only_owner_edits(table):
    gm, alice, bob, eve, room = table["gm"], table["alice"], table["bob"], table["outsider"], table["room"]
    alice.post(f"/api/rooms/{room}/characters", json={"character_id": table["pj"]})
    gm.post(f"/api/rooms/{room}/characters/{table['pj']}/accept")
    pj = f"/api/characters/{table['pj']}"
    for path in ("", "/validation", "/export"):
        assert bob.get(f"{pj}{path}").status_code == 200
    assert eve.get(pj).status_code == 404
    assert bob.patch(pj, json={"age": 1}).status_code == 403
    assert gm.patch(pj, json={"age": 1}).status_code == 403  # le MJ lit, ne modifie pas
    assert bob.delete(pj).status_code == 403
    # La liste « mes personnages » reste celle de ses propres personnages.
    assert bob.get("/api/characters").json() == []


def test_gm_characters_enter_directly(table, monster):
    gm, room = table["gm"], table["room"]
    wolf = gm.post("/api/characters", json=monster).json()["id"]
    res = gm.post(f"/api/rooms/{room}/characters", json={"character_id": wolf}).json()
    assert _statuses(res) == {"Loup géant": "accepted"}
    assert table["bob"].get(f"/api/characters/{wolf}").status_code == 200


def test_owner_withdraws_and_leaving_removes_characters(table):
    gm, alice, bob, room = table["gm"], table["alice"], table["bob"], table["room"]
    url = f"/api/rooms/{room}/characters"
    for cid in (table["pj"], table["pet"]):
        alice.post(url, json={"character_id": cid})
        gm.post(f"{url}/{cid}/accept")
    assert bob.delete(f"{url}/{table['pet']}").status_code == 403
    assert _statuses(alice.delete(f"{url}/{table['pet']}").json()) == {"Thorgal": "accepted"}

    alice_id = alice.get("/api/auth/me").json()["id"]
    assert bob.delete(f"/api/rooms/{room}/members/{alice_id}").status_code == 403
    assert alice.delete(f"/api/rooms/{room}/members/{alice_id}").status_code == 204
    assert alice.get(f"/api/rooms/{room}").status_code == 404
    assert _statuses(gm.get(f"/api/rooms/{room}").json()) == {}
    assert bob.get(f"/api/characters/{table['pj']}").status_code == 404
    # Le personnage, lui, existe toujours.
    assert alice.get(f"/api/characters/{table['pj']}").status_code == 200


def test_gm_renames_regenerates_code_and_deletes(table, make_client):
    gm, alice, room = table["gm"], table["alice"], table["room"]
    assert alice.patch(f"/api/rooms/{room}", json={"name": "X"}).status_code == 403
    assert gm.patch(f"/api/rooms/{room}", json={"name": "Les Loups"}).json()["name"] == "Les Loups"
    new_code = gm.post(f"/api/rooms/{room}/invite-code").json()["invite_code"]
    assert new_code != table["code"]
    late = make_client("carl")
    assert late.post("/api/rooms/join", json={"code": table["code"]}).status_code == 404
    assert late.post("/api/rooms/join", json={"code": new_code}).status_code == 200

    alice.post(f"/api/rooms/{room}/characters", json={"character_id": table["pj"]})
    alice.post(f"/api/rooms/{room}/messages", json={"body": "salut"})
    assert alice.delete(f"/api/rooms/{room}").status_code == 403
    assert gm.delete(f"/api/rooms/{room}").status_code == 204
    assert alice.get("/api/rooms").json() == []
    assert alice.get(f"/api/characters/{table['pj']}").status_code == 200


def test_chat_history(table):
    alice, bob, eve, room = table["alice"], table["bob"], table["outsider"], table["room"]
    url = f"/api/rooms/{room}/messages"
    for i in range(5):
        (alice if i % 2 == 0 else bob).post(url, json={"body": f"message {i}"})
    assert alice.post(url, json={"body": "   "}).status_code == 422
    assert eve.post(url, json={"body": "coucou"}).status_code == 404
    assert eve.get(url).status_code == 404

    history = bob.get(url).json()
    assert [m["body"] for m in history] == [f"message {i}" for i in range(5)]
    assert history[0]["author"]["username"] == "alice"
    older = bob.get(url, params={"before": history[3]["id"], "limit": 2}).json()
    assert [m["body"] for m in older] == ["message 1", "message 2"]


def test_presence_and_chat_are_pushed(table):
    alice, bob, room = table["alice"], table["bob"], table["room"]
    ids = {name: table[name].get("/api/auth/me").json()["id"] for name in ("alice", "bob")}
    with alice.websocket_connect(f"/ws/room:{room}") as alice_ws:
        assert alice_ws.receive_json() == {"type": "room.presence", "online": [ids["alice"]]}
        with bob.websocket_connect(f"/ws/room:{room}") as bob_ws:
            both = sorted(ids.values())
            assert alice_ws.receive_json()["online"] == both
            assert bob_ws.receive_json()["online"] == both
            bob.post(f"/api/rooms/{room}/messages", json={"body": "On y va ?"})
            event = alice_ws.receive_json()
            assert event["type"] == "room.message" and event["message"]["body"] == "On y va ?"
            assert event["message"]["author"]["username"] == "bob"
        assert alice_ws.receive_json() == {"type": "room.presence", "online": [ids["alice"]]}


def test_submissions_and_decisions_are_pushed(table):
    gm, alice, bob, room = table["gm"], table["alice"], table["bob"], table["room"]
    url = f"/api/rooms/{room}/characters"
    with gm.websocket_connect(f"/ws/room:{room}") as gm_ws, bob.websocket_connect(f"/ws/room:{room}") as bob_ws:
        for _ in range(2):
            gm_ws.receive_json()  # présence : MJ, puis MJ + bob
        bob_ws.receive_json()
        # Signal sans contenu : chacun relit la room avec ses droits (bob ne voit pas la proposition d'alice).
        steps = [lambda: alice.post(url, json={"character_id": table["pj"]}),
                 lambda: gm.post(f"{url}/{table['pj']}/accept"),
                 lambda: alice.delete(f"{url}/{table['pj']}")]
        for step in steps:
            assert step().status_code < 300
            assert gm_ws.receive_json() == {"type": "room.characters"}
            assert bob_ws.receive_json() == {"type": "room.characters"}


def test_room_channel_is_for_members_only(table):
    with pytest.raises(WebSocketDisconnect) as refused:
        with table["outsider"].websocket_connect(f"/ws/room:{table['room']}") as ws:
            ws.receive_json()
    assert refused.value.code == 4403


def test_kicked_player_is_disconnected(table):
    gm, bob, room = table["gm"], table["bob"], table["room"]
    bob_id = bob.get("/api/auth/me").json()["id"]
    with bob.websocket_connect(f"/ws/room:{room}") as bob_ws:
        bob_ws.receive_json()  # présence
        assert gm.delete(f"/api/rooms/{room}/members/{bob_id}").status_code == 204
        with pytest.raises(WebSocketDisconnect) as closed:
            bob_ws.receive_json()
        assert closed.value.code == 4403

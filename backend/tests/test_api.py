def test_rules_endpoint(client):
    rules = client.get("/api/rules").json()
    assert rules["start_pc"] == 25
    assert rules["species_limits"]["orc"]["force"] == {"min": 5, "max": 10, "superhuman": 13}


def test_crud_and_validation(client, valid_character):
    created = client.post("/api/characters", json=valid_character)
    assert created.status_code == 201
    cid = created.json()["id"]

    assert client.get(f"/api/characters/{cid}/validation").json()["valid"] is True

    patched = client.patch(f"/api/characters/{cid}", json={"age": 41})
    assert patched.json()["age"] == 41
    assert patched.json()["name"] == "Thorgal"

    assert len(client.get("/api/characters").json()) == 1
    assert client.delete(f"/api/characters/{cid}").status_code == 204
    assert client.get(f"/api/characters/{cid}").status_code == 404


def test_websocket_receives_updates(client, valid_character):
    cid = client.post("/api/characters", json=valid_character).json()["id"]
    with client.websocket_connect(f"/ws/character:{cid}") as ws:
        client.patch(f"/api/characters/{cid}", json={"age": 50})
        assert ws.receive_json() == {"type": "character.updated", "id": cid}


def test_list_filters_by_kind(client, valid_character, monster):
    client.post("/api/characters", json=valid_character)
    client.post("/api/characters", json=monster)
    assert [c["name"] for c in client.get("/api/characters", params={"kind": "monstre"}).json()] == ["Loup géant"]
    assert [c["name"] for c in client.get("/api/characters", params={"kind": "pj"}).json()] == ["Thorgal"]
    assert len(client.get("/api/characters").json()) == 2


def test_rules_expose_common_trunks(client):
    trunks = client.get("/api/rules").json()["common_trunks"]
    assert {"skill": "endurance", "points": 2} == {k: v for k, v in trunks["guerrier"][0].items() if k in ("skill", "points")}


def test_rules_expose_catalogs(client):
    catalogs = client.get("/api/rules").json()["catalogs"]
    assert [e["label"] for e in catalogs["langues"]][:2] == ["Elfique", "Égyptien"]
    assert len(catalogs["animaux_totems"]) == 34

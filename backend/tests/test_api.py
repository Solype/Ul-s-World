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


def test_export_is_a_versioned_downloadable_file(client, valid_character):
    valid_character["name"] = "Thorgal Æegirsson"
    cid = client.post("/api/characters", json=valid_character).json()["id"]
    res = client.get(f"/api/characters/{cid}/export")
    assert res.status_code == 200
    # Nom ASCII pour les vieux navigateurs, nom exact (UTF-8) pour les autres.
    assert 'filename="thorgal-egirsson.json"' in res.headers["content-disposition"]
    assert "filename*=UTF-8''Thorgal%20%C3%86egirsson.json" in res.headers["content-disposition"]
    data = res.json()
    assert (data["format"], data["version"]) == ("newmannheim/personnage", 2)
    assert data["character"]["name"] == "Thorgal Æegirsson"
    assert "id" not in data["character"] and "created_at" not in data["character"]
    # Le contenu exporté est un personnage valide, prêt à être recréé.
    assert client.post("/api/characters", json=data["character"]).status_code == 201


def test_import_recreates_the_exported_character_for_the_importer(make_client, valid_character):
    alice, bob = make_client("alice"), make_client("bob")
    cid = alice.post("/api/characters", json=valid_character).json()["id"]
    exported = alice.get(f"/api/characters/{cid}/export").json()
    res = bob.post("/api/characters/import", json=exported)
    assert res.status_code == 201
    imported = res.json()
    assert imported["id"] != cid and imported["owner"]["username"] == "bob"
    same = ("name", "kind", "creation_mode", "attributes", "skills", "roles", "selections", "creation")
    original = alice.get(f"/api/characters/{cid}").json()
    assert {k: imported[k] for k in same} == {k: original[k] for k in same}


def test_import_converts_a_version_1_file(client, monster):
    # Version 1 : une seule piété, pas de piété par dieu.
    monster["resources"] = {"piete": 4, "dieux": 2}
    monster["selections"] = {"dieux": [{"name": "Dieu 1"}, {"name": "Dieu 2", "value": 7}]}
    res = client.post("/api/characters/import", json={"format": "newmannheim/personnage", "version": 1, "character": monster})
    assert res.status_code == 201
    assert [g["value"] for g in res.json()["selections"]["dieux"]] == [4, 7]


def test_import_refuses_unknown_files(client, valid_character):
    file = {"format": "newmannheim/personnage", "version": 99, "character": valid_character}
    assert "version plus récente" in client.post("/api/characters/import", json=file).json()["detail"]
    assert client.post("/api/characters/import", json={**file, "format": "autre", "version": 2}).status_code == 422
    res = client.post("/api/characters/import", json={**file, "version": 2, "character": {**valid_character, "name": ""}})
    assert res.status_code == 422
    assert res.json()["detail"][0]["loc"] == ["body", "character", "name"]


def test_rules_expose_texts(client):
    texts = client.get("/api/rules").json()["texts"]
    assert texts[0]["id"] == "creation" and texts[0]["title"] == "Création de personnage"
    assert "<!-- data:priorites -->" in texts[0]["markdown"]

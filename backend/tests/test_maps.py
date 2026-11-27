import base64

import pytest

from app.vision import blocked
from tests.test_rooms import table  # noqa: F401  (fixture : MJ, alice et bob dans une room)

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")


def _uvtt(**extra) -> dict:
    """10 x 10 cases, origine décalée comme dans un export. Mur vertical en x = 5, porte fermée entre y = 4 et 6."""
    p = lambda x, y: {"x": x + 2, "y": y + 3}  # noqa: E731
    return {
        "format": 0.3,
        "resolution": {"map_origin": {"x": 2, "y": 3}, "map_size": {"x": 10, "y": 10}, "pixels_per_grid": 70},
        "line_of_sight": [[p(5, 0), p(5, 4)], [p(5, 6), p(5, 10)]],
        "portals": [{"position": p(5, 5), "bounds": [p(5, 4), p(5, 6)], "rotation": 0, "closed": True,
                     "freestanding": False}],
        "lights": [],
        "image": base64.b64encode(PNG).decode(),
        **extra,
    }


@pytest.fixture
def on_map(table, monster):  # noqa: F811
    """Une carte montrée ; le PJ d'alice à gauche du mur, un loup visible à droite."""
    gm, alice, room = table["gm"], table["alice"], table["room"]
    alice.post(f"/api/rooms/{room}/characters", json={"character_id": table["pj"]})
    gm.post(f"/api/rooms/{room}/characters/{table['pj']}/accept")
    wolf_id = gm.post("/api/characters", json=monster).json()["id"]
    wolf = gm.post(f"/api/rooms/{room}/instances", json={"character_id": wolf_id, "visibility": "visible"}).json()
    [pc] = [i for i in gm.get(f"/api/rooms/{room}/instances").json() if i["character"]["kind"] == "pj"]
    res = gm.post(f"/api/rooms/{room}/maps?name=Crypte", json=_uvtt())
    assert res.status_code == 201
    url = f"/api/rooms/{room}/maps/{res.json()['id']}"
    token = lambda instance_id: f"{url}/tokens/{instance_id}"  # noqa: E731
    assert alice.put(token(pc["id"]), json={"x": 2.5, "y": 5.5}).status_code == 200
    assert gm.put(token(wolf["id"]), json={"x": 7.5, "y": 5.5}).status_code == 200
    return {**table, "pc": pc["id"], "wolf": wolf["id"], "url": url, "token": token}


def _ids(client, url) -> set[int]:
    return {t["instance_id"] for t in client.get(url).json()["tokens"]}


def test_map_upload_and_image(table):  # noqa: F811
    gm, alice, outsider, room = table["gm"], table["alice"], table["outsider"], table["room"]
    assert gm.get(f"/api/rooms/{room}/maps").json() == []
    assert alice.post(f"/api/rooms/{room}/maps", json=_uvtt()).status_code == 403
    m = gm.post(f"/api/rooms/{room}/maps?name=Crypte", json=_uvtt()).json()
    # Coordonnées ramenées à l'origine de l'image. La première carte est montrée d'office.
    assert (m["name"], m["active"], m["width"], m["height"], m["pixels_per_grid"]) == ("Crypte", True, 10, 10, 70)
    assert m["walls"] == [[5, 0, 5, 4], [5, 6, 5, 10]]
    assert m["doors"] == [{"id": 0, "a": [5, 4], "b": [5, 6], "closed": True}]
    res = alice.get(f"/api/rooms/{room}/maps/{m['id']}/image")
    assert res.status_code == 200 and res.content == PNG and res.headers["content-type"] == "image/png"
    assert outsider.get(f"/api/rooms/{room}/maps/{m['id']}/image").status_code == 404
    assert m["lights"] == []


def test_map_lights(table):  # noqa: F811
    """Lumières ramenées à l'origine de l'image ; couleur AARRGGBB ou RRGGBB vers #rrggbb, blanc si illisible."""
    gm, alice, room = table["gm"], table["alice"], table["room"]
    torch = {"position": {"x": 4, "y": 5}, "range": 4.5, "intensity": 3, "color": "ffFFEBBF", "shadows": True}
    lights = [torch, {"position": {"x": 2, "y": 3}, "color": "#00ff80"}, {"position": {"x": 12, "y": 13}, "color": "?"}]
    m = gm.post(f"/api/rooms/{room}/maps", json=_uvtt(lights=lights)).json()
    expected = [{"x": 2, "y": 2, "range": 4.5, "intensity": 3, "color": "#ffebbf"},
                {"x": 0, "y": 0, "range": 4, "intensity": 1, "color": "#00ff80"},
                {"x": 10, "y": 10, "range": 4, "intensity": 1, "color": "#ffffff"}]
    assert m["lights"] == expected
    assert alice.get(f"/api/rooms/{room}/maps/{m['id']}").json()["lights"] == expected
    too_far = [{**torch, "range": 1000}]
    assert gm.post(f"/api/rooms/{room}/maps", json=_uvtt(lights=too_far)).status_code == 422


def test_map_rejects_bad_files(table):  # noqa: F811
    gm, room = table["gm"], table["room"]
    svg = base64.b64encode(b"<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>").decode()
    assert gm.post(f"/api/rooms/{room}/maps", json=_uvtt(image=svg)).status_code == 422
    huge = _uvtt(resolution={"map_size": {"x": 900, "y": 10}, "pixels_per_grid": 70})
    assert gm.post(f"/api/rooms/{room}/maps", json=huge).status_code == 422
    assert gm.post(f"/api/rooms/{room}/maps", json={"image": "x"}).status_code == 422


def test_gm_prepares_maps_players_see_the_shown_one(on_map):
    gm, bob, room = on_map["gm"], on_map["bob"], on_map["room"]
    crypt = gm.get(on_map["url"]).json()["id"]
    cave = gm.post(f"/api/rooms/{room}/maps?name=Grotte", json=_uvtt()).json()
    # La suivante attend : le MJ y place ses monstres, les joueurs n'en savent rien.
    assert cave["active"] is False
    cave_url = f"/api/rooms/{room}/maps/{cave['id']}"
    assert gm.put(f"{cave_url}/tokens/{on_map['wolf']}", json={"x": 1.5, "y": 1.5}).status_code == 200
    assert [m["name"] for m in bob.get(f"/api/rooms/{room}/maps").json()] == ["Crypte"]
    assert bob.get(cave_url).status_code == bob.get(f"{cave_url}/image").status_code == 404
    assert bob.put(f"{cave_url}/tokens/{on_map['pc']}", json={"x": 1.5, "y": 1.5}).status_code == 404
    assert bob.patch(cave_url, json={"active": True}).status_code == 403
    # Le MJ la montre : elle remplace l'autre. Chaque carte garde ses pions.
    shown = gm.patch(cave_url, json={"active": True}).json()
    assert [(m["id"], m["active"]) for m in shown] == [(crypt, False), (cave["id"], True)]
    assert [m["name"] for m in bob.get(f"/api/rooms/{room}/maps").json()] == ["Grotte"]
    assert _ids(gm, on_map["url"]) == {on_map["pc"], on_map["wolf"]}
    gm.patch(cave_url, json={"active": False})
    assert bob.get(f"/api/rooms/{room}/maps").json() == []
    # Supprimée : ses pions partent avec elle.
    assert gm.delete(on_map["url"]).status_code == 204
    assert [m["name"] for m in gm.get(f"/api/rooms/{room}/maps").json()] == ["Grotte"]


def test_players_only_get_tokens_a_pc_sees(on_map):
    gm, alice, bob, url = on_map["gm"], on_map["alice"], on_map["bob"], on_map["url"]
    assert _ids(gm, url) == {on_map["pc"], on_map["wolf"]}
    # Porte fermée : le loup est derrière le mur, aucun joueur ne reçoit sa position.
    assert _ids(alice, url) == _ids(bob, url) == {on_map["pc"]}
    assert alice.put(f"{url}/doors/0", json={"closed": False}).status_code == 403
    gm.put(f"{url}/doors/0", json={"closed": False})
    assert _ids(bob, url) == {on_map["pc"], on_map["wolf"]}
    # Caché par le MJ : jamais envoyé, même en vue.
    gm.put(f"/api/rooms/{on_map['room']}/instances/{on_map['wolf']}/visibility", json={"visibility": "cache"})
    assert _ids(bob, url) == {on_map["pc"]}


def test_token_moves_are_pushed_filtered(on_map):
    gm, bob, room, token = on_map["gm"], on_map["bob"], on_map["room"], on_map["token"]
    cave = gm.post(f"/api/rooms/{room}/maps?name=Grotte", json=_uvtt()).json()
    with gm.websocket_connect(f"/ws/room:{room}") as gm_ws, bob.websocket_connect(f"/ws/room:{room}") as bob_ws:
        for _ in range(2):
            gm_ws.receive_json()  # présence
        bob_ws.receive_json()
        # Carte non montrée : seul le MJ reçoit le déplacement.
        gm.put(f"/api/rooms/{room}/maps/{cave['id']}/tokens/{on_map['wolf']}", json={"x": 1.5, "y": 1.5})
        assert gm_ws.receive_json()["map_id"] == cave["id"]
        gm.put(token(on_map["wolf"]), json={"x": 8.5, "y": 2.5})
        assert len(gm_ws.receive_json()["tokens"]) == 2
        event = bob_ws.receive_json()
        assert event["type"] == "room.tokens" and [t["instance_id"] for t in event["tokens"]] == [on_map["pc"]]


def test_ping_reaches_who_sees_the_map(on_map):
    gm, alice, bob, room = on_map["gm"], on_map["alice"], on_map["bob"], on_map["room"]
    cave = gm.post(f"/api/rooms/{room}/maps?name=Grotte", json=_uvtt()).json()
    with gm.websocket_connect(f"/ws/room:{room}") as gm_ws, bob.websocket_connect(f"/ws/room:{room}") as bob_ws:
        for _ in range(2):
            gm_ws.receive_json()  # présence
        bob_ws.receive_json()
        # Sur la carte qu'il prépare, le MJ ne montre rien aux joueurs.
        assert gm.post(f"/api/rooms/{room}/maps/{cave['id']}/ping", json={"x": 1, "y": 1}).status_code == 204
        assert gm_ws.receive_json()["map_id"] == cave["id"]
        assert alice.post(f"/api/rooms/{room}/maps/{cave['id']}/ping", json={"x": 1, "y": 1}).status_code == 404
        assert alice.post(f"{on_map['url']}/ping", json={"x": 11, "y": 1}).status_code == 422
        assert alice.post(f"{on_map['url']}/ping", json={"x": 2.5, "y": 3}).status_code == 204
        for ws in (gm_ws, bob_ws):
            event = ws.receive_json()
            assert (event["type"], event["x"], event["y"]) == ("room.ping", 2.5, 3)
    assert on_map["outsider"].post(f"{on_map['url']}/ping", json={"x": 1, "y": 1}).status_code == 404


def test_who_moves_which_token(on_map):
    gm, bob, url, token = on_map["gm"], on_map["bob"], on_map["url"], on_map["token"]
    # Un membre déplace un PJ (comme ses moniteurs), pas un monstre.
    assert bob.put(token(on_map["pc"]), json={"x": 7.5, "y": 1.5}).status_code == 200
    assert bob.put(token(on_map["wolf"]), json={"x": 1.5, "y": 1.5}).status_code == 403
    assert gm.put(token(on_map["pc"]), json={"x": 11, "y": 1}).status_code == 422
    assert gm.put(token(on_map["pc"]), json={"x": 1}).status_code == 422
    # Du même côté que le loup : vu sans ouvrir la porte. Retiré de la carte : plus de vision.
    assert on_map["wolf"] in {t["instance_id"] for t in bob.put(token(on_map["pc"]), json={"x": 7.5, "y": 1.5}).json()}
    gm.put(token(on_map["pc"]), json={"x": None, "y": None})
    assert _ids(bob, url) == set()


def test_token_leaves_with_its_character(on_map):
    gm, url = on_map["gm"], on_map["url"]
    assert gm.delete(f"/api/rooms/{on_map['room']}/instances/{on_map['wolf']}").status_code == 204
    assert _ids(gm, url) == {on_map["pc"]}


def test_line_of_sight_does_not_slip_through_wall_corners():
    # Deux murs qui se rejoignent en (1, 1) : la diagonale passe pile par le coin.
    corner = [(0, 1, 1, 1), (1, 1, 1, 0)]
    assert blocked(0.5, 0.5, 1.5, 1.5, corner)
    assert not blocked(0.5, 0.5, 0.5, 0.9, corner)
    # Longer un mur ne bloque pas.
    assert not blocked(0, 1, 0.5, 1, corner)

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
    """Carte envoyée ; le PJ d'alice à gauche du mur, un loup visible à droite."""
    gm, alice, room = table["gm"], table["alice"], table["room"]
    alice.post(f"/api/rooms/{room}/characters", json={"character_id": table["pj"]})
    gm.post(f"/api/rooms/{room}/characters/{table['pj']}/accept")
    wolf_id = gm.post("/api/characters", json=monster).json()["id"]
    wolf = gm.post(f"/api/rooms/{room}/instances", json={"character_id": wolf_id, "visibility": "visible"}).json()
    [pc] = [i for i in gm.get(f"/api/rooms/{room}/instances").json() if i["character"]["kind"] == "pj"]
    assert gm.put(f"/api/rooms/{room}/map", json=_uvtt()).status_code == 200
    token = lambda i: f"/api/rooms/{room}/instances/{i['id']}/token"  # noqa: E731
    assert alice.put(token(pc), json={"x": 2.5, "y": 5.5}).status_code == 200
    assert gm.put(token(wolf), json={"x": 7.5, "y": 5.5}).status_code == 200
    return {**table, "pc": pc["id"], "wolf": wolf["id"], "token": token}


def _ids(client, room) -> set[int]:
    return {t["instance_id"] for t in client.get(f"/api/rooms/{room}/map").json()["tokens"]}


def test_map_upload_and_image(table):  # noqa: F811
    gm, alice, outsider, room = table["gm"], table["alice"], table["outsider"], table["room"]
    assert gm.get(f"/api/rooms/{room}/map").json() is None
    assert alice.put(f"/api/rooms/{room}/map", json=_uvtt()).status_code == 403
    m = gm.put(f"/api/rooms/{room}/map", json=_uvtt()).json()
    # Coordonnées ramenées à l'origine de l'image.
    assert (m["width"], m["height"], m["pixels_per_grid"]) == (10, 10, 70)
    assert m["walls"] == [[5, 0, 5, 4], [5, 6, 5, 10]]
    assert m["doors"] == [{"id": 0, "a": [5, 4], "b": [5, 6], "closed": True}]
    res = alice.get(f"/api/rooms/{room}/map/image")
    assert res.status_code == 200 and res.content == PNG and res.headers["content-type"] == "image/png"
    assert outsider.get(f"/api/rooms/{room}/map/image").status_code == 404


def test_map_rejects_bad_files(table):  # noqa: F811
    gm, room = table["gm"], table["room"]
    svg = base64.b64encode(b"<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>").decode()
    assert gm.put(f"/api/rooms/{room}/map", json=_uvtt(image=svg)).status_code == 422
    huge = _uvtt(resolution={"map_size": {"x": 900, "y": 10}, "pixels_per_grid": 70})
    assert gm.put(f"/api/rooms/{room}/map", json=huge).status_code == 422
    assert gm.put(f"/api/rooms/{room}/map", json={"image": "x"}).status_code == 422


def test_players_only_get_tokens_a_pc_sees(on_map):
    gm, alice, bob, room = on_map["gm"], on_map["alice"], on_map["bob"], on_map["room"]
    assert _ids(gm, room) == {on_map["pc"], on_map["wolf"]}
    # Porte fermée : le loup est derrière le mur, aucun joueur ne reçoit sa position.
    assert _ids(alice, room) == _ids(bob, room) == {on_map["pc"]}
    assert alice.put(f"/api/rooms/{room}/map/doors/0", json={"closed": False}).status_code == 403
    gm.put(f"/api/rooms/{room}/map/doors/0", json={"closed": False})
    assert _ids(bob, room) == {on_map["pc"], on_map["wolf"]}
    # Caché par le MJ : jamais envoyé, même en vue.
    gm.put(f"/api/rooms/{room}/instances/{on_map['wolf']}/visibility", json={"visibility": "cache"})
    assert _ids(bob, room) == {on_map["pc"]}


def test_token_moves_are_pushed_filtered(on_map):
    gm, bob, room, token = on_map["gm"], on_map["bob"], on_map["room"], on_map["token"]
    with gm.websocket_connect(f"/ws/room:{room}") as gm_ws, bob.websocket_connect(f"/ws/room:{room}") as bob_ws:
        for _ in range(2):
            gm_ws.receive_json()  # présence
        bob_ws.receive_json()
        gm.put(token({"id": on_map["wolf"]}), json={"x": 8.5, "y": 2.5})
        assert len(gm_ws.receive_json()["tokens"]) == 2
        event = bob_ws.receive_json()
        assert event["type"] == "room.tokens" and [t["instance_id"] for t in event["tokens"]] == [on_map["pc"]]


def test_who_moves_which_token(on_map):
    gm, bob, room, token = on_map["gm"], on_map["bob"], on_map["room"], on_map["token"]
    # Un membre déplace un PJ (comme ses moniteurs), pas un monstre.
    assert bob.put(token({"id": on_map["pc"]}), json={"x": 7.5, "y": 1.5}).status_code == 200
    assert bob.put(token({"id": on_map["wolf"]}), json={"x": 1.5, "y": 1.5}).status_code == 403
    assert gm.put(token({"id": on_map["pc"]}), json={"x": 11, "y": 1}).status_code == 422
    assert gm.put(token({"id": on_map["pc"]}), json={"x": 1}).status_code == 422
    # Du même côté que le loup : vu sans ouvrir la porte. Retiré de la carte : plus de vision.
    assert on_map["wolf"] in {t["instance_id"] for t in bob.put(token({"id": on_map["pc"]}), json={"x": 7.5, "y": 1.5}).json()}
    gm.put(token({"id": on_map["pc"]}), json={"x": None, "y": None})
    assert _ids(bob, room) == set()


def test_new_map_clears_tokens(on_map):
    gm, room = on_map["gm"], on_map["room"]
    assert gm.put(f"/api/rooms/{room}/map", json=_uvtt()).json()["tokens"] == []


def test_line_of_sight_does_not_slip_through_wall_corners():
    # Deux murs qui se rejoignent en (1, 1) : la diagonale passe pile par le coin.
    corner = [(0, 1, 1, 1), (1, 1, 1, 0)]
    assert blocked(0.5, 0.5, 1.5, 1.5, corner)
    assert not blocked(0.5, 0.5, 0.5, 0.9, corner)
    # Longer un mur ne bloque pas.
    assert not blocked(0, 1, 0.5, 1, corner)

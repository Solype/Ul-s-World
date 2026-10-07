from datetime import UTC, datetime, timedelta

import pytest
from starlette.websockets import WebSocketDisconnect

from app.core.security import SESSION_COOKIE, hash_password, verify_password
from app.db import get_session
from app.main import app
from app.models import Character, UserSession


def _db():
    return next(app.dependency_overrides[get_session]())


def test_password_hashing():
    stored = hash_password("motdepasse")
    assert stored.startswith("scrypt$") and "motdepasse" not in stored
    assert verify_password("motdepasse", stored)
    assert not verify_password("autrechose", stored)
    assert hash_password("motdepasse") != stored  # sel différent à chaque fois


def test_first_account_is_admin(make_client):
    first, second = make_client("maitre"), make_client("bob")
    assert first.get("/api/auth/me").json()["is_admin"] is True
    assert second.get("/api/auth/me").json()["is_admin"] is False


def test_register_login_logout(make_client):
    anon = make_client()
    assert anon.get("/api/auth/me").status_code == 401
    res = anon.post("/api/auth/register", json={"username": "Alice", "password": "motdepasse"})
    assert res.status_code == 201 and res.json()["username"] == "alice"
    cookie = res.cookies[SESSION_COOKIE]
    assert "httponly" in res.headers["set-cookie"].lower()
    # Le jeton n'est pas stocké en clair.
    assert _db().get(UserSession, cookie) is None

    assert anon.get("/api/auth/me").json()["username"] == "alice"
    assert anon.post("/api/auth/logout").status_code == 204
    assert anon.get("/api/auth/me").status_code == 401
    # Le jeton d'avant ne sert plus à rien, même renvoyé à la main.
    anon.cookies.set(SESSION_COOKIE, cookie)
    assert anon.get("/api/auth/me").status_code == 401
    anon.cookies.clear()

    bad = anon.post("/api/auth/login", json={"username": "alice", "password": "mauvaispass"})
    assert bad.status_code == 401
    assert anon.post("/api/auth/login", json={"username": "ALICE", "password": "motdepasse"}).status_code == 200
    assert anon.get("/api/auth/me").json()["username"] == "alice"


def test_username_is_unique_ignoring_case(make_client):
    make_client("alice")
    res = make_client().post("/api/auth/register", json={"username": "ALICE", "password": "motdepasse"})
    assert res.status_code == 409


def test_expired_session_is_refused(make_client):
    alice = make_client("alice")
    db = _db()
    for s in db.query(UserSession):
        s.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db.commit()
    assert alice.get("/api/auth/me").status_code == 401


def test_characters_require_login(make_client, valid_character):
    anon = make_client()
    assert anon.get("/api/characters").status_code == 401
    assert anon.post("/api/characters", json=valid_character).status_code == 401
    # Les règles restent publiques.
    assert anon.get("/api/rules").status_code == 200


def test_players_only_see_their_characters(make_client, valid_character, monster):
    admin, alice, bob = make_client("maitre"), make_client("alice"), make_client("bob")
    mine = alice.post("/api/characters", json=valid_character).json()
    assert mine["owner"]["username"] == "alice"
    bob.post("/api/characters", json=monster)

    assert [c["name"] for c in alice.get("/api/characters").json()] == ["Thorgal"]
    assert [c["name"] for c in bob.get("/api/characters").json()] == ["Loup géant"]
    assert len(admin.get("/api/characters").json()) == 2

    cid = mine["id"]
    for method, path in [("get", ""), ("get", "/validation"), ("get", "/export"), ("delete", "")]:
        assert getattr(bob, method)(f"/api/characters/{cid}{path}").status_code == 404
    assert bob.patch(f"/api/characters/{cid}", json={"age": 99}).status_code == 404
    # L'admin peut tout modifier.
    assert admin.patch(f"/api/characters/{cid}", json={"age": 41}).json()["age"] == 41


def test_admin_changes_owner(make_client, valid_character):
    admin, alice, bob = make_client("maitre"), make_client("alice"), make_client("bob")
    cid = alice.post("/api/characters", json=valid_character).json()["id"]
    users = {u["username"]: u["id"] for u in admin.get("/api/users").json()}
    assert alice.get("/api/users").status_code == 403
    assert alice.put(f"/api/characters/{cid}/owner", json={"owner_id": users["bob"]}).status_code == 403

    res = admin.put(f"/api/characters/{cid}/owner", json={"owner_id": users["bob"]})
    assert res.json()["owner"]["username"] == "bob"
    assert bob.get(f"/api/characters/{cid}").status_code == 200
    assert alice.get(f"/api/characters/{cid}").status_code == 404
    assert admin.put(f"/api/characters/{cid}/owner", json={"owner_id": 999}).status_code == 422


def test_first_admin_claims_characters_without_owner(make_client):
    anon = make_client()
    db = _db()
    db.add(Character(name="Ancien", kind="pnj", creation_mode="free"))
    db.commit()
    anon.post("/api/auth/register", json={"username": "maitre", "password": "motdepasse"})
    assert [c["owner"]["username"] for c in anon.get("/api/characters").json()] == ["maitre"]


def test_websocket_requires_login_and_access(make_client, valid_character):
    alice, bob = make_client("alice"), make_client("bob")
    cid = alice.post("/api/characters", json=valid_character).json()["id"]
    for client, channel in [(make_client(), "characters"), (bob, f"character:{cid}"), (bob, "inconnu")]:
        with pytest.raises(WebSocketDisconnect) as refused:
            with client.websocket_connect(f"/ws/{channel}") as ws:
                ws.receive_json()
        assert refused.value.code == 4403


def test_list_channel_only_announces_own_characters(make_client, valid_character, monster):
    admin, alice, bob = make_client("maitre"), make_client("alice"), make_client("bob")
    with bob.websocket_connect("/ws/characters") as bob_ws, admin.websocket_connect("/ws/characters") as admin_ws:
        alice_id = alice.post("/api/characters", json=valid_character).json()["id"]
        bob_id = bob.post("/api/characters", json=monster).json()["id"]
        # Bob n'entend pas parler du personnage d'Alice : son premier événement est le sien.
        assert bob_ws.receive_json() == {"type": "character.created", "id": bob_id}
        assert admin_ws.receive_json()["id"] == alice_id
        assert admin_ws.receive_json()["id"] == bob_id

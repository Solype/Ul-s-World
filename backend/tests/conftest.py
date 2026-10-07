import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401
from app.db import Base, get_session
from app.main import app


@pytest.fixture
def make_client():
    """Fabrique de clients sur une même base vide, chacun avec ses cookies.

    `make_client("bob")` inscrit et connecte bob ; `make_client()` reste anonyme.
    Le premier compte inscrit est admin.
    """
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine, expire_on_commit=False)

    def override():
        with TestSession() as s:
            yield s

    app.dependency_overrides[get_session] = override
    clients: list[TestClient] = []

    def make(username: str | None = None) -> TestClient:
        c = TestClient(app).__enter__()
        clients.append(c)
        if username:
            res = c.post("/api/auth/register", json={"username": username, "password": "motdepasse"})
            assert res.status_code == 201, res.text
        return c

    yield make
    for c in clients:
        c.__exit__(None, None, None)
    app.dependency_overrides.clear()


@pytest.fixture
def client(make_client):
    """Client connecté avec le premier compte (admin)."""
    return make_client("maitre")


@pytest.fixture
def valid_character() -> dict:
    """Exemple du document : priorités A|A|D|E (24 PC), 1 PC restant dépensé en Magie."""
    return {
        "name": "Thorgal",
        "species": "nain",
        "age": 40,
        "creation": {
            "priorities": {"roles": "A", "attributes": "A", "skill_groups": "D", "money": "E"},
            "extra_pc": {"magic": 1},
            "money_spent": 100,
        },
        "magic": 1,
        # Total 42, chaque valeur dans les limites du Nain.
        "attributes": {"resistance": 9, "force": 8, "agilite": 3, "dexterite": 7,
                       "vivacite": 3, "intellect": 8, "social": 4},
        # Rôles réels sans choix à faire ; Marchand et Cuisinier donnent chacun une connaissance.
        "roles": {"primary": ["cuirasse"], "secondary": ["marin", "marchand", "cuisinier"]},
        "knowledges": {"Culturelle": 1, "Biologique": 1},
        # Niveau 5 = 15 points de groupe, + niveau 2 = 3 points : 18 sur 20.
        "skill_groups": {"combat_melee": {"pcp": 5}, "artisanat": {"pcp": 2}},
        "skills": {"hache": {"pcp": 6}, "bouclier": {"pcp": 4},
                   "armurerie": {"pcp": 4}},
    }


@pytest.fixture
def monster() -> dict:
    """Un monstre hors règles : espèce libre, attributs au-delà des limites, pas de priorités."""
    return {
        "name": "Loup géant",
        "kind": "monstre",
        "creation_mode": "free",
        "species": "loup",
        "attributes": {"force": 14, "agilite": 12, "vivacite": 11},
        "skill_groups": {"combat_melee": {"pcp": 4}},
        "skills": {"main_nue": {"pcp": 6}},
    }

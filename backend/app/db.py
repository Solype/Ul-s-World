from collections.abc import Iterator

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


def enforce_sqlite_foreign_keys(engine: Engine) -> None:
    """SQLite (dev, tests) n'applique les clés étrangères (ON DELETE CASCADE...) que si on le lui demande,
    à chaque connexion. PostgreSQL les applique toujours."""
    event.listen(engine, "connect", lambda conn, _: conn.execute("PRAGMA foreign_keys=ON"))


connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
if settings.database_url.startswith("sqlite"):
    enforce_sqlite_foreign_keys(engine)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_session() -> Iterator[Session]:
    """Dépendance FastAPI : une session DB par requête."""
    with SessionLocal() as session:
        yield session

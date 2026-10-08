"""Réinitialise le mot de passe de comptes et ferme leurs sessions ouvertes.

Usage :
    python scripts/reset_password.py alice bob     # mot de passe aléatoire pour chacun, affiché une fois
    python scripts/reset_password.py --all         # tous les comptes
    python scripts/reset_password.py alice --password "nouveau mdp"

La base visée est celle de DATABASE_URL (SQLite ./dev.db par défaut). Avec Docker :
    docker compose exec backend python scripts/reset_password.py --all
"""

import argparse
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, select  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.models import User, UserSession  # noqa: E402

# Sans caractères ambigus (0/O, 1/l/I), facile à recopier.
ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def random_password(length: int = 12) -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(length))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("usernames", nargs="*")
    parser.add_argument("--all", action="store_true", help="tous les comptes")
    parser.add_argument("--password", help="mot de passe à donner (sinon : aléatoire, un par compte)")
    args = parser.parse_args()
    if not args.all and not args.usernames:
        parser.error("donner des identifiants, ou --all")
    if args.password is not None and len(args.password) < 8:
        parser.error("le mot de passe doit faire au moins 8 caractères")

    with SessionLocal() as session:
        query = select(User).order_by(User.id)
        if not args.all:
            query = query.where(User.username.in_([u.lower() for u in args.usernames]))
        users = list(session.scalars(query))
        missing = {u.lower() for u in args.usernames} - {u.username for u in users}
        if missing:
            sys.exit(f"Compte(s) introuvable(s) : {', '.join(sorted(missing))}")
        passwords = {}
        for user in users:
            passwords[user.username] = args.password or random_password()
            user.password_hash = hash_password(passwords[user.username])
            session.execute(delete(UserSession).where(UserSession.user_id == user.id))
        session.commit()

    width = max(map(len, passwords), default=0)
    for username, password in passwords.items():
        print(f"{username:<{width}}  {password}")


if __name__ == "__main__":
    main()

"""Mots de passe et jetons de session.

Mots de passe : scrypt (bibliothèque standard), avec un sel par compte. Le format stocké,
`scrypt$n$r$p$sel$empreinte`, garde ses paramètres : on pourra les durcir sans casser les anciens comptes.

Sessions : un jeton aléatoire dans un cookie HttpOnly. La base ne garde que son empreinte SHA-256 :
une fuite de la table ne permet pas de se connecter.
"""

import hashlib
import hmac
import secrets

SCRYPT_N, SCRYPT_R, SCRYPT_P = 2**14, 8, 1
SESSION_COOKIE = "nm_session"


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt, digest = stored.split("$")
    except ValueError:
        return False
    if algo != "scrypt":
        return False
    candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p))
    return hmac.compare_digest(candidate, bytes.fromhex(digest))


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

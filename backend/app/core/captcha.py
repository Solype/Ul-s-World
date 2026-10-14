import httpx
from fastapi import HTTPException, status

from app.core.config import settings

VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def captcha_enabled() -> bool:
    return bool(settings.turnstile_secret)


def check_captcha(token: str | None) -> None:
    """Vérifie auprès de Cloudflare le jeton Turnstile renvoyé par le widget.
    Un jeton ne sert qu'une fois : le frontend en redemande un après chaque échec."""
    if not captcha_enabled():
        return
    if not token:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Captcha manquant")
    try:
        res = httpx.post(VERIFY_URL, data={"secret": settings.turnstile_secret, "response": token}, timeout=10)
        ok = res.json().get("success") is True
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Vérification du captcha impossible") from exc
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Captcha invalide, réessaie")

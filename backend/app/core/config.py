from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration lue depuis les variables d'environnement (ou un fichier .env)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./dev.db"
    cors_origins: list[str] = ["http://localhost:5173"]
    # Durée de vie d'une session de connexion.
    session_days: int = 30
    # À mettre à true derrière HTTPS : le cookie de session n'est alors jamais envoyé en clair.
    cookie_secure: bool = False


settings = Settings()

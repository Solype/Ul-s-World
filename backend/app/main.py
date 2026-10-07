from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, characters, rooms, rules, ws
from app.core.config import settings

app = FastAPI(
    title="NewMannheim",
    description="API de création de personnages. Doc interactive : /docs (Swagger) ou /redoc.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,  # cookie de session
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(rules.router, prefix="/api")
app.include_router(characters.router, prefix="/api")
app.include_router(rooms.router, prefix="/api")
app.include_router(ws.router)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}

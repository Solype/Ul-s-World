FROM python:3.14-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /usr/local/bin/uv

WORKDIR /app
ENV UV_PROJECT_ENVIRONMENT=/opt/venv PATH="/opt/venv/bin:$PATH"

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .

# Applique les migrations puis démarre l'API.
CMD ["sh", "-c", "alembic upgrade head && fastapi run app/main.py --host 0.0.0.0 --port 8000"]

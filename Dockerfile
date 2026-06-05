# ── stage 1: build the React frontend ─────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
# Same-origin in production — no VITE_API_URL needed.
RUN npm run build

# ── stage 2: python backend, with frontend dist copied in ─────────────
FROM python:3.12-slim AS app
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential libpq-dev fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir -e . 2>/dev/null || true
COPY backend/ ./
RUN pip install --no-cache-dir -e .

# Bring in the built React app.
COPY --from=frontend /fe/dist /app/static

ENV PYTHONUNBUFFERED=1 STATIC_DIR=/app/static PORT=8080
EXPOSE 8080

# Run migrations then start. Alembic reads DATABASE_URL from env.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]

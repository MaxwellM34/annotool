# Backend-only image. Frontend deploys to Vercel separately.
FROM python:3.12-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential libpq-dev fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir -e . 2>/dev/null || true
COPY backend/ ./
RUN pip install --no-cache-dir -e .

ENV PYTHONUNBUFFERED=1 PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from .auth import router as auth_router
from .config import settings
from .routers import admin, annotations, images, invoices, tracking


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="annotool", lifespan=lifespan)

# Authlib needs Starlette's SessionMiddleware to hold OAuth state across the redirect.
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret,
    same_site="lax",
    https_only=settings.oauth_redirect_uri.startswith("https://"),
)

# CORS — only needed when the frontend is served from a different origin (local dev).
# In single-service deploy, FRONTEND_URL matches the backend origin so this is a no-op.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(images.router)
app.include_router(annotations.router)
app.include_router(tracking.router)
app.include_router(invoices.router)
app.include_router(admin.router)


@app.get("/healthz")
async def healthz():
    return {"ok": True}


# ──────────────────────────────────────────────────────────────────────
# Serve the React build (single-service deploy).
# The Dockerfile copies the Vite output into /app/static. When that exists,
# we mount everything under /assets and SPA-fallback every non-API path to index.html.
# In local dev (Vite on :5173, backend on :8000), this directory doesn't exist and
# the block silently no-ops — Vite handles the frontend.
# ──────────────────────────────────────────────────────────────────────
STATIC_DIR = Path(os.environ.get("STATIC_DIR", "/app/static"))
if STATIC_DIR.exists() and (STATIC_DIR / "index.html").exists():
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        candidate = STATIC_DIR / full_path
        if candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(STATIC_DIR / "index.html"))

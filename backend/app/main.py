from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from .auth import router as auth_router
from .config import settings
from .routers import admin, annotations, images, invoices, system, tracking


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="annotool", lifespan=lifespan)

# Authlib's OAuth flow needs Starlette's SessionMiddleware to hold state across the redirect.
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret,
    same_site="lax",
    https_only=settings.oauth_redirect_uri.startswith("https://"),
)

# CORS — direct browser → backend calls would need this, but the Vercel deploy
# proxies /api and /auth so the browser sees everything same-origin. The middleware
# is kept here as a safety net for local dev when a developer hits the backend
# directly. FRONTEND_URL must match the actual frontend origin (the Vercel URL).
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
app.include_router(system.router)


@app.get("/healthz")
async def healthz():
    return {"ok": True}

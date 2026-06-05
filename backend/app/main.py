from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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

# CORS — frontend origin must be allowed with credentials for the session cookie.
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

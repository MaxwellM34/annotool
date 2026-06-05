"""Google OAuth + signed-cookie session.

Flow:
  1. Frontend redirects to GET /auth/google/login → backend redirects to Google with state.
  2. Google → GET /auth/google/callback?code&state → backend exchanges code, fetches userinfo,
     checks allowlist, upserts user, sets `session` cookie, redirects to FRONTEND_URL.
  3. Frontend reads /auth/me with credentials: include to learn who's logged in.

The cookie is signed (not encrypted) via itsdangerous; payload is just {uid, exp}.
"""

from __future__ import annotations

import time
from typing import Optional

import httpx
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from itsdangerous import BadSignature, SignatureExpired, TimestampSigner
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .db import get_session
from .models import User

COOKIE_NAME = "annotool_session"
COOKIE_MAX_AGE = 60 * 60 * 24 * 7  # 7 days

_signer = TimestampSigner(settings.session_secret)

oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


def _sign(payload: str) -> str:
    return _signer.sign(payload.encode()).decode()


def _unsign(token: str) -> Optional[str]:
    try:
        return _signer.unsign(token, max_age=COOKIE_MAX_AGE).decode()
    except (BadSignature, SignatureExpired):
        return None


def set_session_cookie(response, user_id: int) -> None:
    token = _sign(str(user_id))
    # secure=True for prod (https). On localhost http, browsers still accept it from same-site requests.
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=settings.oauth_redirect_uri.startswith("https://"),
        path="/",
    )


def clear_session_cookie(response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


async def current_user(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> User:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not signed in")
    payload = _unsign(token)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "session expired")
    try:
        uid = int(payload)
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad session")
    user = await session.get(User, uid)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found")
    return user


async def admin_user(user: User = Depends(current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin only")
    return user


router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/google/login")
async def google_login(request: Request):
    return await oauth.google.authorize_redirect(request, settings.oauth_redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request, session: AsyncSession = Depends(get_session)):
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as e:
        return RedirectResponse(f"{settings.frontend_url}/login?error=oauth_failed")

    userinfo = token.get("userinfo") or {}
    if not userinfo:
        # Fallback: hit the userinfo endpoint directly.
        async with httpx.AsyncClient() as client:
            r = await client.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {token['access_token']}"},
            )
            userinfo = r.json()

    email = (userinfo.get("email") or "").lower()
    if not email or not userinfo.get("email_verified", True):
        return RedirectResponse(f"{settings.frontend_url}/login?error=email_unverified")

    if email not in settings.allowed_emails_set:
        return RedirectResponse(f"{settings.frontend_url}/login?error=not_allowed")

    user = (await session.scalars(select(User).where(User.email == email))).first()
    if not user:
        user = User(
            email=email,
            name=userinfo.get("name", ""),
            picture_url=userinfo.get("picture", ""),
            is_admin=settings.is_admin_email(email),
            hourly_rate_cents=settings.default_hourly_rate_cents,
        )
        session.add(user)
        await session.flush()
    else:
        # Refresh profile bits + admin flag (in case ADMIN_EMAIL changed).
        user.name = userinfo.get("name", user.name)
        user.picture_url = userinfo.get("picture", user.picture_url)
        user.is_admin = settings.is_admin_email(email)
    await session.commit()

    response = RedirectResponse(f"{settings.frontend_url}/")
    set_session_cookie(response, user.id)
    return response


@router.post("/logout")
async def logout():
    response = RedirectResponse(f"{settings.frontend_url}/login", status_code=303)
    clear_session_cookie(response)
    return response


@router.get("/me")
async def me(user: User = Depends(current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "picture_url": user.picture_url,
        "is_admin": user.is_admin,
        "hourly_rate_cents": user.hourly_rate_cents,
    }

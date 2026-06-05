from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import admin_user
from ..db import get_session
from ..models import User
from ..tracking import total_seconds_in_range
from ..invoices import previous_week_range

router = APIRouter(prefix="/api/admin", tags=["admin"])


class RateBody(BaseModel):
    hourly_rate_cents: int = Field(ge=0)


@router.get("/users")
async def list_users(
    admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
):
    users = (await session.scalars(select(User).order_by(User.created_at.desc()))).all()
    start, end = previous_week_range()
    out = []
    for u in users:
        last_week = await total_seconds_in_range(session, user_id=u.id, start=start, end=end)
        out.append({
            "id": u.id,
            "email": u.email,
            "name": u.name,
            "is_admin": u.is_admin,
            "hourly_rate_cents": u.hourly_rate_cents,
            "last_week_seconds": last_week,
        })
    return out


@router.patch("/users/{user_id}/rate")
async def set_rate(
    user_id: int,
    body: RateBody,
    admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
):
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    user.hourly_rate_cents = body.hourly_rate_cents
    await session.commit()
    return {"id": user.id, "hourly_rate_cents": user.hourly_rate_cents}

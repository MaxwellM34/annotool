from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user
from ..db import get_session
from ..models import User
from ..tracking import close_stale_intervals, record_heartbeat, total_seconds_in_range
from ..invoices import per_day_breakdown, previous_week_range

router = APIRouter(prefix="/api/tracking", tags=["tracking"])


class HeartbeatBody(BaseModel):
    image_id: int | None = None


@router.post("/heartbeat")
async def heartbeat(
    body: HeartbeatBody,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    now = datetime.now(timezone.utc)
    interval = await record_heartbeat(
        session, user_id=user.id, image_id=body.image_id, now=now
    )
    return {
        "interval_id": interval.id,
        "started_at": interval.start_ts.isoformat(),
        "last_heartbeat_at": interval.last_heartbeat_ts.isoformat(),
        "image_id": interval.image_id,
    }


@router.get("/summary")
async def summary(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    """Today + this-week + last-week totals for the calling user."""
    await close_stale_intervals(session)
    now = datetime.now(timezone.utc)

    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    weekday = now.weekday()
    week_start = (today_start - timedelta(days=weekday))
    week_end = week_start + timedelta(days=7)

    prev_start, prev_end = previous_week_range()

    today_s = await total_seconds_in_range(session, user_id=user.id, start=today_start, end=today_end)
    this_week_s = await total_seconds_in_range(session, user_id=user.id, start=week_start, end=week_end)
    prev_week_s = await total_seconds_in_range(session, user_id=user.id, start=prev_start, end=prev_end)
    days = await per_day_breakdown(session, user_id=user.id, start=week_start, end=week_end)

    return {
        "today_seconds": today_s,
        "this_week_seconds": this_week_s,
        "last_week_seconds": prev_week_s,
        "this_week_days": days,
        "hourly_rate_cents": user.hourly_rate_cents,
    }

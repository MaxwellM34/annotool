"""Time-tracking core.

Spec (literal):
  - While annotating, the user is "active" if there has been mouse/keyboard/scroll input
    within the last 30 seconds.
  - The frontend sends a heartbeat every 10 s while active.
  - Two consecutive heartbeats on the same open interval ≤30 s apart → the interval extends.
  - If a heartbeat is >30 s after the previous, the previous interval is discarded
    (the user idled out without resuming in time) and a new interval is opened.
  - If the user never sends another heartbeat after going idle, a sweep job (or the next
    sum-hours request) closes the interval — but if the last heartbeat was >30 s ago, the
    interval is dropped entirely. Idle-then-leave windows do not count.

So: an interval only "counts" if it gets closed by either (a) another heartbeat within
30 s of its last (then it transitions naturally — though that case becomes part of a
single continuous interval), or (b) the next heartbeat is ≤30 s late and the interval
keeps growing. A heartbeat that arrives >30 s late discards the previous interval.

Implementation detail: we never count seconds beyond `last_heartbeat_ts`. The "value" of
an interval is `last_heartbeat_ts - start_ts`. As long as heartbeats keep arriving every
≤10 s (within 30 s of the prior), the interval grows. As soon as a gap >30 s happens, the
old interval is forgotten (deleted) and a new one starts at the late heartbeat.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .models import WorkInterval


async def record_heartbeat(
    session: AsyncSession,
    *,
    user_id: int,
    image_id: int | None,
    now: datetime,
) -> WorkInterval:
    threshold = timedelta(seconds=settings.idle_threshold_seconds)
    # Find the user's currently-open interval, if any.
    stmt = (
        select(WorkInterval)
        .where(WorkInterval.user_id == user_id, WorkInterval.ended.is_(False))
        .order_by(WorkInterval.last_heartbeat_ts.desc())
        .limit(1)
    )
    interval = (await session.scalars(stmt)).first()

    if interval is not None:
        gap = now - interval.last_heartbeat_ts
        if gap <= threshold:
            # Continue extending — but if the image switched, close + open a new one
            # so we can attribute time per image.
            if interval.image_id == image_id:
                interval.last_heartbeat_ts = now
                await session.commit()
                return interval
            else:
                interval.ended = True
                await session.flush()
        else:
            # Discard the stale interval entirely — gap exceeded threshold.
            await session.delete(interval)
            await session.flush()

    new_interval = WorkInterval(
        user_id=user_id,
        image_id=image_id,
        start_ts=now,
        last_heartbeat_ts=now,
        ended=False,
    )
    session.add(new_interval)
    await session.commit()
    return new_interval


async def close_stale_intervals(session: AsyncSession, *, now: datetime | None = None) -> int:
    """Discard intervals whose last heartbeat is older than the idle threshold."""
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=settings.idle_threshold_seconds)
    # Per spec, idle-then-leave windows DO NOT COUNT — so we delete, not mark-ended-with-credit.
    stmt = delete(WorkInterval).where(
        WorkInterval.ended.is_(False), WorkInterval.last_heartbeat_ts < cutoff
    )
    result = await session.execute(stmt)
    await session.commit()
    return result.rowcount or 0


async def total_seconds_in_range(
    session: AsyncSession,
    *,
    user_id: int,
    start: datetime,
    end: datetime,
) -> int:
    """Sum of (last_heartbeat - start) over closed intervals overlapping [start, end].

    Open intervals are also summed but only the part up to their last_heartbeat — we
    never invent time past the last seen heartbeat.
    """
    await close_stale_intervals(session)
    stmt = select(WorkInterval).where(
        WorkInterval.user_id == user_id,
        WorkInterval.start_ts < end,
        WorkInterval.last_heartbeat_ts > start,
    )
    total = 0.0
    for iv in (await session.scalars(stmt)).all():
        s = max(iv.start_ts, start)
        e = min(iv.last_heartbeat_ts, end)
        if e > s:
            total += (e - s).total_seconds()
    return int(total)

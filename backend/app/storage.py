"""Storage-usage check + write-lock guard.

We tally `pg_database_size(current_database())`. If we're over `storage_lock_percent`
of `storage_limit_bytes` (Neon free tier = 0.5 GB by default), the app enters a
locked state: image-push and annotation-save endpoints reject writes, and the
frontend shows a "storage full — admin must increase the database plan" message.

Reads (image GET, hours summary, invoice download, etc.) keep working so the
employee can still pull up existing work.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings


@dataclass
class StorageStatus:
    used_bytes: int
    limit_bytes: int
    percent_used: float
    locked: bool

    def as_dict(self) -> dict:
        return {
            "used_bytes": self.used_bytes,
            "limit_bytes": self.limit_bytes,
            "percent_used": round(self.percent_used, 2),
            "locked": self.locked,
            "lock_at_percent": settings.storage_lock_percent,
        }


async def storage_status(session: AsyncSession) -> StorageStatus:
    row = await session.execute(text("SELECT pg_database_size(current_database())"))
    used = int(row.scalar() or 0)
    limit = max(1, settings.storage_limit_bytes)
    pct = 100.0 * used / limit
    return StorageStatus(
        used_bytes=used,
        limit_bytes=limit,
        percent_used=pct,
        locked=pct >= settings.storage_lock_percent,
    )

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user
from ..config import settings
from ..db import get_session
from ..models import User
from ..storage import storage_status

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/storage")
async def storage(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    st = await storage_status(session)
    return st.as_dict()


@router.get("/info")
async def info(user: User = Depends(current_user)):
    return {
        "currency_code": settings.currency_code,
        "currency_symbol": settings.currency_symbol,
        "idle_threshold_seconds": settings.idle_threshold_seconds,
    }

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import admin_user, current_user
from ..db import get_session
from ..invoices import (
    generate_invoice_for_user,
    previous_week_range,
)
from ..models import Invoice, User

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


@router.get("")
async def list_invoices(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    if user.is_admin:
        stmt = select(Invoice).order_by(Invoice.period_start.desc())
    else:
        stmt = select(Invoice).where(Invoice.user_id == user.id).order_by(Invoice.period_start.desc())
    invs = (await session.scalars(stmt)).all()
    out = []
    for inv in invs:
        u = await session.get(User, inv.user_id)
        out.append({
            "id": inv.id,
            "user_id": inv.user_id,
            "user_email": u.email if u else None,
            "user_name": u.name if u else None,
            "period_start": inv.period_start.isoformat(),
            "period_end": inv.period_end.isoformat(),
            "total_seconds": inv.total_seconds,
            "total_cents": inv.total_cents,
            "hourly_rate_cents": inv.hourly_rate_cents,
            "generated_at": inv.generated_at.isoformat(),
        })
    return out


@router.get("/{invoice_id}/pdf")
async def download_pdf(
    invoice_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    inv = await session.get(Invoice, invoice_id)
    if not inv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
    if inv.user_id != user.id and not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
    filename = f"invoice-{inv.period_start.date().isoformat()}-user{inv.user_id}.pdf"
    return Response(
        content=bytes(inv.pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class GenerateBody(BaseModel):
    user_id: int | None = None  # admin can pick; non-admin always uses their own id


@router.post("/generate-previous-week")
async def generate_previous_week(
    body: GenerateBody,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    target_user_id = user.id
    if body.user_id and body.user_id != user.id:
        if not user.is_admin:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "admin only")
        target_user_id = body.user_id
    target_user = await session.get(User, target_user_id)
    if not target_user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")

    start, end = previous_week_range()
    invoice = await generate_invoice_for_user(
        session, user=target_user, period_start=start, period_end=end
    )
    return {"id": invoice.id, "total_cents": invoice.total_cents, "total_seconds": invoice.total_seconds}


@router.post("/run-weekly-cron")
async def run_weekly_cron(
    user: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Admin trigger (or Render cron job hits this) — generate previous-week invoices for all users."""
    start, end = previous_week_range()
    users = (await session.scalars(select(User))).all()
    out = []
    for u in users:
        invoice = await generate_invoice_for_user(
            session, user=u, period_start=start, period_end=end
        )
        out.append({"user_id": u.id, "invoice_id": invoice.id, "total_cents": invoice.total_cents})
    return {"generated": out, "period_start": start.isoformat(), "period_end": end.isoformat()}

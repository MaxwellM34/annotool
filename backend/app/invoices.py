"""Weekly invoice PDF generation."""

from __future__ import annotations

import io
from datetime import date, datetime, timedelta, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Invoice, User, WorkInterval
from .tracking import close_stale_intervals


def previous_week_range(today: date | None = None) -> tuple[datetime, datetime]:
    """Monday 00:00 .. Sunday 23:59:59.999999 UTC of the *previous* week relative to today."""
    today = today or datetime.now(timezone.utc).date()
    # Monday = 0
    weekday = today.weekday()
    this_monday = today - timedelta(days=weekday)
    prev_monday = this_monday - timedelta(days=7)
    prev_sunday = this_monday - timedelta(microseconds=1)
    start = datetime.combine(prev_monday, datetime.min.time(), tzinfo=timezone.utc)
    end = datetime.combine(prev_sunday.date(), datetime.max.time(), tzinfo=timezone.utc)
    return start, end


async def per_day_breakdown(
    session: AsyncSession, *, user_id: int, start: datetime, end: datetime
) -> list[dict]:
    """Returns list of {date, seconds} for each day in [start, end]."""
    await close_stale_intervals(session)
    rows = (await session.scalars(
        select(WorkInterval).where(
            WorkInterval.user_id == user_id,
            WorkInterval.start_ts < end,
            WorkInterval.last_heartbeat_ts > start,
        )
    )).all()

    buckets: dict[str, float] = {}
    for iv in rows:
        s = max(iv.start_ts, start)
        e = min(iv.last_heartbeat_ts, end)
        # Split across day boundaries.
        cursor = s
        while cursor < e:
            next_day = (cursor + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            slice_end = min(next_day, e)
            day_key = cursor.date().isoformat()
            buckets[day_key] = buckets.get(day_key, 0.0) + (slice_end - cursor).total_seconds()
            cursor = slice_end

    return [
        {"date": d, "seconds": int(buckets.get(d, 0))}
        for d in sorted(buckets.keys())
    ]


def _fmt_hms(seconds: int) -> str:
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h}h {m:02d}m {s:02d}s"


def _fmt_money(cents: int) -> str:
    from .config import settings
    return f"{settings.currency_symbol}{cents/100:.2f}"


def build_invoice_pdf(
    *,
    user: User,
    period_start: datetime,
    period_end: datetime,
    total_seconds: int,
    hourly_rate_cents: int,
    breakdown: list[dict],
    invoice_number: str,
) -> bytes:
    total_hours = total_seconds / 3600
    total_cents = int(round(total_hours * hourly_rate_cents))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=LETTER, leftMargin=0.6 * inch, rightMargin=0.6 * inch,
                            topMargin=0.6 * inch, bottomMargin=0.6 * inch)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph(f"<b>Invoice {invoice_number}</b>", styles["Title"]))
    elements.append(Paragraph(
        f"Period: {period_start.date().isoformat()} – {period_end.date().isoformat()}",
        styles["Normal"],
    ))
    elements.append(Spacer(1, 6))
    elements.append(Paragraph(f"<b>For:</b> {user.name or user.email}", styles["Normal"]))
    elements.append(Paragraph(f"<b>Email:</b> {user.email}", styles["Normal"]))
    from .config import settings as _s
    elements.append(Paragraph(f"<b>Currency:</b> {_s.currency_code}", styles["Normal"]))
    elements.append(Spacer(1, 18))

    rows = [["Date", "Hours", "Time"]]
    for day in breakdown:
        rows.append([
            day["date"],
            f"{day['seconds']/3600:.2f}",
            _fmt_hms(int(day["seconds"])),
        ])
    rows.append(["", "", ""])
    rows.append(["Total", f"{total_hours:.2f}", _fmt_hms(total_seconds)])

    table = Table(rows, colWidths=[2.2 * inch, 1.3 * inch, 1.8 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#222")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LINEABOVE", (0, -1), (-1, -1), 1, colors.black),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 24))

    summary = [
        ["Hourly rate", _fmt_money(hourly_rate_cents)],
        ["Total hours", f"{total_hours:.2f}"],
        ["Amount due", _fmt_money(total_cents)],
    ]
    st = Table(summary, colWidths=[2.5 * inch, 2 * inch])
    st.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LINEABOVE", (0, -1), (-1, -1), 1, colors.black),
    ]))
    elements.append(st)

    doc.build(elements)
    return buf.getvalue()


async def generate_invoice_for_user(
    session: AsyncSession,
    *,
    user: User,
    period_start: datetime,
    period_end: datetime,
) -> Invoice:
    breakdown = await per_day_breakdown(session, user_id=user.id, start=period_start, end=period_end)
    total_seconds = sum(d["seconds"] for d in breakdown)
    total_hours = total_seconds / 3600
    total_cents = int(round(total_hours * user.hourly_rate_cents))
    invoice_number = f"INV-{period_start.strftime('%Y%m%d')}-{user.id}"

    pdf_bytes = build_invoice_pdf(
        user=user,
        period_start=period_start,
        period_end=period_end,
        total_seconds=total_seconds,
        hourly_rate_cents=user.hourly_rate_cents,
        breakdown=breakdown,
        invoice_number=invoice_number,
    )

    # Upsert
    existing = (await session.scalars(
        select(Invoice).where(Invoice.user_id == user.id, Invoice.period_start == period_start)
    )).first()
    if existing:
        existing.period_end = period_end
        existing.total_seconds = total_seconds
        existing.hourly_rate_cents = user.hourly_rate_cents
        existing.total_cents = total_cents
        existing.pdf_bytes = pdf_bytes
        existing.breakdown = {"days": breakdown}
        invoice = existing
    else:
        invoice = Invoice(
            user_id=user.id,
            period_start=period_start,
            period_end=period_end,
            total_seconds=total_seconds,
            hourly_rate_cents=user.hourly_rate_cents,
            total_cents=total_cents,
            pdf_bytes=pdf_bytes,
            breakdown={"days": breakdown},
        )
        session.add(invoice)
    await session.commit()
    await session.refresh(invoice)
    return invoice

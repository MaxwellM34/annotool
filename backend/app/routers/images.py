from __future__ import annotations

import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Response, UploadFile, status
from PIL import Image as PILImage
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import admin_user, current_user
from ..config import settings
from ..db import get_session
from ..models import AnnotationSet, Image, User
from ..storage import storage_status

router = APIRouter(prefix="/api/images", tags=["images"])


def _check_push_token(authorization: str | None) -> None:
    if not settings.push_token:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "PUSH_TOKEN not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    if authorization.removeprefix("Bearer ").strip() != settings.push_token:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "bad push token")


@router.post("/push", status_code=201)
async def push_image(
    slug: str = Form(...),
    iter: int = Form(...),
    file: UploadFile = File(...),
    authorization: str | None = Header(None),
    session: AsyncSession = Depends(get_session),
):
    """Called by scripts/push_to_annotool.sh in the leblanc repo (or by hand via curl).

    Bearer-token authenticated. Upserts on (slug, iter).
    """
    _check_push_token(authorization)
    st = await storage_status(session)
    if st.locked:
        raise HTTPException(
            status.HTTP_507_INSUFFICIENT_STORAGE,
            f"storage full ({st.percent_used:.1f}% of {st.limit_bytes} bytes) — admin must increase the database plan",
        )
    blob = await file.read()
    try:
        with PILImage.open(io.BytesIO(blob)) as im:
            width, height = im.size
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "not a valid image")

    existing = (await session.scalars(
        select(Image).where(Image.slug == slug, Image.iter == iter)
    )).first()
    if existing:
        existing.bytes = blob
        existing.filename = file.filename or existing.filename
        existing.content_type = file.content_type or "image/png"
        existing.width, existing.height = width, height
        existing.uploaded_at = datetime.now(timezone.utc)
        image = existing
    else:
        image = Image(
            slug=slug,
            iter=iter,
            filename=file.filename or f"{slug}-iter{iter}.png",
            content_type=file.content_type or "image/png",
            bytes=blob,
            width=width,
            height=height,
        )
        session.add(image)
    await session.commit()
    await session.refresh(image)
    return {"id": image.id, "slug": image.slug, "iter": image.iter, "width": width, "height": height}


@router.get("")
async def list_images(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    """Latest image per slug, plus a flat list of all images for browsing."""
    # Latest iter per slug
    sub = (
        select(Image.slug, func.max(Image.iter).label("max_iter"))
        .group_by(Image.slug)
        .subquery()
    )
    stmt = (
        select(Image)
        .join(sub, (Image.slug == sub.c.slug) & (Image.iter == sub.c.max_iter))
        .order_by(Image.slug)
    )
    latest = (await session.scalars(stmt)).all()

    # Count annotations done by the calling user on each of those latest images.
    latest_ids = [im.id for im in latest]
    user_rounds: dict[int, int] = {}
    if latest_ids:
        rows = (await session.execute(
            select(AnnotationSet.image_id, func.max(AnnotationSet.round))
            .where(AnnotationSet.image_id.in_(latest_ids), AnnotationSet.user_id == user.id)
            .group_by(AnnotationSet.image_id)
        )).all()
        user_rounds = {iid: r for iid, r in rows}

    return [
        {
            "id": im.id,
            "slug": im.slug,
            "iter": im.iter,
            "filename": im.filename,
            "width": im.width,
            "height": im.height,
            "uploaded_at": im.uploaded_at.isoformat(),
            "your_latest_round": user_rounds.get(im.id, 0),
        }
        for im in latest
    ]


@router.get("/{image_id}/png")
async def get_image_png(
    image_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    image = await session.get(Image, image_id)
    if not image:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "image not found")
    return Response(content=image.bytes, media_type=image.content_type or "image/png")


@router.get("/{image_id}")
async def get_image_meta(
    image_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    image = await session.get(Image, image_id)
    if not image:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "image not found")
    return {
        "id": image.id,
        "slug": image.slug,
        "iter": image.iter,
        "filename": image.filename,
        "width": image.width,
        "height": image.height,
        "uploaded_at": image.uploaded_at.isoformat(),
    }


@router.delete("/{image_id}", status_code=204)
async def delete_image(
    image_id: int,
    user: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
):
    await session.execute(delete(Image).where(Image.id == image_id))
    await session.commit()
    return Response(status_code=204)

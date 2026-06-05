from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user
from ..db import get_session
from ..models import AnnotationSet, Image, User
from ..rendering import render_annotated_png

router = APIRouter(prefix="/api/annotations", tags=["annotations"])


class Coord(BaseModel):
    x: float
    y: float


class Annotation(BaseModel):
    id: str
    shape: str = "rect"
    coords: list[Coord]
    color: str = "#FF3A4D"
    strokeWidth: int = 6
    note: str = ""


class AnnotationPayload(BaseModel):
    annotations: list[Annotation] = Field(default_factory=list)


class SaveBody(BaseModel):
    image_id: int
    round: int | None = None  # if omitted, server picks max(round)+1 (or 1 if none)
    payload: AnnotationPayload


@router.get("/by-image/{image_id}")
async def list_for_image(
    image_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    stmt = (
        select(AnnotationSet)
        .where(AnnotationSet.image_id == image_id, AnnotationSet.user_id == user.id)
        .order_by(AnnotationSet.round)
    )
    sets = (await session.scalars(stmt)).all()
    return [
        {
            "id": s.id,
            "image_id": s.image_id,
            "round": s.round,
            "saved_at": s.saved_at.isoformat(),
            "payload": s.payload,
        }
        for s in sets
    ]


@router.post("")
async def save_annotation(
    body: SaveBody,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    image = await session.get(Image, body.image_id)
    if not image:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "image not found")

    round_no = body.round
    if round_no is None:
        max_round = (await session.scalar(
            select(func.max(AnnotationSet.round)).where(
                AnnotationSet.image_id == body.image_id, AnnotationSet.user_id == user.id
            )
        ))
        round_no = (max_round or 0) + 1

    existing = (await session.scalars(
        select(AnnotationSet).where(
            AnnotationSet.image_id == body.image_id,
            AnnotationSet.user_id == user.id,
            AnnotationSet.round == round_no,
        )
    )).first()

    payload_dict = body.payload.model_dump()
    if existing:
        existing.payload = payload_dict
        ann_set = existing
    else:
        ann_set = AnnotationSet(
            image_id=body.image_id,
            user_id=user.id,
            round=round_no,
            payload=payload_dict,
        )
        session.add(ann_set)
    await session.commit()
    await session.refresh(ann_set)

    return {
        "id": ann_set.id,
        "image_id": ann_set.image_id,
        "round": ann_set.round,
        "saved_at": ann_set.saved_at.isoformat(),
        "payload": ann_set.payload,
    }


@router.get("/{ann_id}/annotated.png")
async def annotated_png(
    ann_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    ann = await session.get(AnnotationSet, ann_id)
    if not ann or ann.user_id != user.id and not user.is_admin:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "annotation set not found")
    image = await session.get(Image, ann.image_id)
    if not image:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "image not found")
    out = render_annotated_png(image.bytes, ann.payload)
    return Response(content=out, media_type="image/png")

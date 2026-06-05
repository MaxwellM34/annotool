from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), default="")
    picture_url: Mapped[str] = mapped_column(String(512), default="")
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    hourly_rate_cents: Mapped[int] = mapped_column(Integer, default=2500)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    images: Mapped[list["Image"]] = relationship(back_populates="uploaded_by")
    annotation_sets: Mapped[list["AnnotationSet"]] = relationship(back_populates="user")
    intervals: Mapped[list["WorkInterval"]] = relationship(back_populates="user")
    invoices: Mapped[list["Invoice"]] = relationship(back_populates="user")


class Image(Base):
    __tablename__ = "images"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    iter: Mapped[int] = mapped_column(Integer, nullable=False)
    filename: Mapped[str] = mapped_column(String(255), default="")
    content_type: Mapped[str] = mapped_column(String(64), default="image/png")
    bytes: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    width: Mapped[int] = mapped_column(Integer, default=0)
    height: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    uploaded_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)

    uploaded_by: Mapped[Optional[User]] = relationship(back_populates="images")
    annotation_sets: Mapped[list["AnnotationSet"]] = relationship(back_populates="image", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("slug", "iter", name="uq_image_slug_iter"),)


class AnnotationSet(Base):
    __tablename__ = "annotation_sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    image_id: Mapped[int] = mapped_column(ForeignKey("images.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    round: Mapped[int] = mapped_column(Integer, default=1)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)  # {annotations: [...], ...}
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    image: Mapped[Image] = relationship(back_populates="annotation_sets")
    user: Mapped[User] = relationship(back_populates="annotation_sets")

    __table_args__ = (UniqueConstraint("image_id", "user_id", "round", name="uq_annset_image_user_round"),)


class WorkInterval(Base):
    """Continuous active-time interval. Open intervals have ended=False; nightly job (or
    a check at compute-time) closes intervals whose last heartbeat is >30s old.

    A heartbeat that arrives more than IDLE_THRESHOLD_SECONDS after the previous one
    on the same open interval CLOSES the previous interval (without crediting the gap)
    and opens a NEW interval starting at the new heartbeat.
    """

    __tablename__ = "work_intervals"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    image_id: Mapped[Optional[int]] = mapped_column(ForeignKey("images.id"), nullable=True)
    start_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    last_heartbeat_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    user: Mapped[User] = relationship(back_populates="intervals")

    @property
    def duration_seconds(self) -> float:
        return max(0.0, (self.last_heartbeat_ts - self.start_ts).total_seconds())


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    total_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    hourly_rate_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    total_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    pdf_bytes: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    breakdown: Mapped[dict] = mapped_column(JSONB, default=dict)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="invoices")

    __table_args__ = (UniqueConstraint("user_id", "period_start", name="uq_invoice_user_period"),)

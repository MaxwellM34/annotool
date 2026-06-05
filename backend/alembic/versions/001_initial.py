"""initial schema

Revision ID: 001_initial
Revises:
Create Date: 2026-06-05

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False, server_default=""),
        sa.Column("picture_url", sa.String(512), nullable=False, server_default=""),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("hourly_rate_cents", sa.Integer(), nullable=False, server_default="2500"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "images",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(64), nullable=False),
        sa.Column("iter", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False, server_default=""),
        sa.Column("content_type", sa.String(64), nullable=False, server_default="image/png"),
        sa.Column("bytes", sa.LargeBinary(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("height", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("uploaded_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.UniqueConstraint("slug", "iter", name="uq_image_slug_iter"),
    )
    op.create_index("ix_images_slug", "images", ["slug"])

    op.create_table(
        "annotation_sets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("image_id", sa.Integer(), sa.ForeignKey("images.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("round", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("saved_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("image_id", "user_id", "round", name="uq_annset_image_user_round"),
    )

    op.create_table(
        "work_intervals",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("image_id", sa.Integer(), sa.ForeignKey("images.id"), nullable=True),
        sa.Column("start_ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_heartbeat_ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_work_intervals_user_id", "work_intervals", ["user_id"])
    op.create_index("ix_work_intervals_start_ts", "work_intervals", ["start_ts"])
    op.create_index("ix_work_intervals_ended", "work_intervals", ["ended"])

    op.create_table(
        "invoices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("total_seconds", sa.Integer(), nullable=False),
        sa.Column("hourly_rate_cents", sa.Integer(), nullable=False),
        sa.Column("total_cents", sa.Integer(), nullable=False),
        sa.Column("pdf_bytes", sa.LargeBinary(), nullable=False),
        sa.Column("breakdown", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "period_start", name="uq_invoice_user_period"),
    )
    op.create_index("ix_invoices_user_id", "invoices", ["user_id"])


def downgrade() -> None:
    op.drop_table("invoices")
    op.drop_index("ix_work_intervals_ended", table_name="work_intervals")
    op.drop_index("ix_work_intervals_start_ts", table_name="work_intervals")
    op.drop_index("ix_work_intervals_user_id", table_name="work_intervals")
    op.drop_table("work_intervals")
    op.drop_table("annotation_sets")
    op.drop_index("ix_images_slug", table_name="images")
    op.drop_table("images")
    op.drop_table("users")

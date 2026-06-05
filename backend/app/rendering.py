"""Server-side render of an annotated PNG.

Takes the original image bytes + annotation payload and produces a PNG with red rectangles
drawn over each annotation and a numbered label next to each one. The corresponding note
text is intentionally rendered as a side legend at the bottom of the image (not in-place,
to avoid covering the design).
"""

from __future__ import annotations

import io
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont

LEGEND_FONT_SIZE = 22
LEGEND_LINE_HEIGHT = 32
LEGEND_PAD = 40
LEGEND_TITLE = "Notes"

try:
    _FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", LEGEND_FONT_SIZE)
    _FONT_BOLD = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", LEGEND_FONT_SIZE)
except Exception:  # pragma: no cover — system font fallback
    _FONT = ImageFont.load_default()
    _FONT_BOLD = _FONT


def _draw_rect(draw: ImageDraw.ImageDraw, ann: dict, idx: int) -> None:
    coords = ann.get("coords") or []
    if len(coords) < 2:
        return
    x1, y1 = coords[0]["x"], coords[0]["y"]
    x2, y2 = coords[1]["x"], coords[1]["y"]
    box = (min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2))
    color = ann.get("color") or "#FF3A4D"
    width = int(ann.get("strokeWidth") or 6)
    draw.rectangle(box, outline=color, width=width)
    # Label badge in top-left of the rect
    label = str(idx)
    pad = 6
    bbox = draw.textbbox((0, 0), label, font=_FONT_BOLD)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    badge_box = (box[0], box[1] - th - 2 * pad, box[0] + tw + 2 * pad, box[1])
    if badge_box[1] < 0:
        badge_box = (box[0], box[1], box[0] + tw + 2 * pad, box[1] + th + 2 * pad)
    draw.rectangle(badge_box, fill=color)
    draw.text((badge_box[0] + pad, badge_box[1] + pad - 2), label, fill="white", font=_FONT_BOLD)


def _legend_height(annotations: list[dict]) -> int:
    lines = sum(max(1, _wrap_count((a.get("note") or "").strip())) for a in annotations)
    return LEGEND_PAD * 2 + LEGEND_LINE_HEIGHT * (1 + lines)  # title + n note-lines


def _wrap_count(text: str, max_chars: int = 110) -> int:
    if not text:
        return 1
    lines = 0
    for paragraph in text.splitlines() or [""]:
        lines += max(1, (len(paragraph) + max_chars - 1) // max_chars)
    return lines


def render_annotated_png(image_bytes: bytes, payload: dict) -> bytes:
    annotations = payload.get("annotations") or []
    base = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    legend_h = _legend_height(annotations) if annotations else 0
    canvas = Image.new("RGB", (base.width, base.height + legend_h), "white")
    canvas.paste(base, (0, 0))

    draw = ImageDraw.Draw(canvas)
    for i, ann in enumerate(annotations, start=1):
        _draw_rect(draw, ann, i)

    if annotations:
        y = base.height + LEGEND_PAD
        draw.text((LEGEND_PAD, y), LEGEND_TITLE, fill="black", font=_FONT_BOLD)
        y += LEGEND_LINE_HEIGHT
        for i, ann in enumerate(annotations, start=1):
            note = (ann.get("note") or "").strip() or "(no note)"
            for paragraph in note.splitlines() or [note]:
                # naive wrap
                while paragraph:
                    chunk, paragraph = paragraph[:110], paragraph[110:]
                    label = f"{i}. {chunk}" if chunk and not paragraph and len(chunk) <= 110 and i > 0 and y == base.height + LEGEND_PAD + LEGEND_LINE_HEIGHT else f"   {chunk}"
                    # Always lead the first chunk of each annotation with its number.
                    if y == base.height + LEGEND_PAD + LEGEND_LINE_HEIGHT * (i):
                        label = f"{i}. {chunk}"
                    draw.text((LEGEND_PAD, y), label, fill="black", font=_FONT)
                    y += LEGEND_LINE_HEIGHT

    out = io.BytesIO()
    canvas.save(out, format="PNG", optimize=True)
    return out.getvalue()

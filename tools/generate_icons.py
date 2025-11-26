#!/usr/bin/env python3
"""
Small helper to generate the Moz Helper Suite icon set without external deps.
Creates a layered background gradient plus a stylized white “M” with a soft shadow.
"""

from __future__ import annotations

import math
import pathlib
import struct
import zlib
from typing import Iterable, Tuple


RGB = Tuple[int, int, int]
RGBA = Tuple[int, int, int, int]


def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def _mix_color(a: RGB, b: RGB, t: float) -> RGB:
    return tuple(int(round(_lerp(x, y, t))) for x, y in zip(a, b))


def _point_segment_distance(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    dx = bx - ax
    dy = by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    vx = ax + dx * t
    vy = ay + dy * t
    return math.hypot(px - vx, py - vy)


def _is_letter_m(px: float, py: float, size: int) -> bool:
    if px < 0 or py < 0 or px >= size or py >= size:
        return False
    margin = size * 0.18
    top = size * 0.18
    bottom = size - size * 0.18
    stroke = size * 0.12
    x = px + 0.5
    y = py + 0.5
    if top <= y <= bottom:
        left = margin
        right = size - margin - stroke
        if left <= x <= left + stroke or right <= x <= right + stroke:
            return True
    diag_start_y = bottom
    diag_peak_y = top + stroke * 0.15
    left_diag_start = margin + stroke * 0.25
    right_diag_start = size - margin - stroke * 0.25
    half_stroke = stroke * 0.55
    if _point_segment_distance(x, y, left_diag_start, diag_start_y, size / 2, diag_peak_y) <= half_stroke:
        return True
    if _point_segment_distance(x, y, right_diag_start, diag_start_y, size / 2, diag_peak_y) <= half_stroke:
        return True
    return False


def _background_color(x: int, y: int, size: int) -> RGB:
    top_color = (42, 76, 178)
    bottom_color = (82, 142, 255)
    accent_color = (120, 196, 255)
    diagonal_color = (34, 58, 148)
    vertical_t = y / max(1, size - 1)
    base = _mix_color(top_color, bottom_color, vertical_t)
    cx = cy = (size - 1) / 2
    dist = math.hypot(x - cx, y - cy) / (math.sqrt(2) * size / 2)
    glow = max(0.0, 1.0 - dist)
    with_glow = _mix_color(base, accent_color, 0.35 * glow)
    diagonal_t = (x + (size - 1 - y)) / max(1, 2 * (size - 1))
    return _mix_color(diagonal_color, with_glow, diagonal_t)


def _pixel_color(x: int, y: int, size: int) -> RGBA:
    bg = _background_color(x, y, size)
    shadow_offset = max(1.0, size * 0.04)
    shadow_color = (12, 26, 64, 160)
    letter_color = (250, 252, 255, 255)
    if _is_letter_m(x - shadow_offset, y - shadow_offset, size):
        return shadow_color
    if _is_letter_m(x, y, size):
        return letter_color
    return (*bg, 255)


def _encode_png(width: int, height: int, rows: Iterable[bytes]) -> bytes:
    raw = bytearray()
    for row in rows:
        raw.append(0)  # filter type 0
        raw.extend(row)
    compressed = zlib.compress(bytes(raw), 9)

    def chunk(tag: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + tag
            + payload
            + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = bytearray(b"\x89PNG\r\n\x1a\n")
    png.extend(chunk(b"IHDR", ihdr))
    png.extend(chunk(b"IDAT", compressed))
    png.extend(chunk(b"IEND", b""))
    return bytes(png)


def render_icon(size: int) -> bytes:
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            r, g, b, a = _pixel_color(x, y, size)
            row.extend((r, g, b, a))
        rows.append(bytes(row))
    return _encode_png(size, size, rows)


def main() -> None:
    root = pathlib.Path(__file__).resolve().parents[1]
    icons_dir = root / "icons"
    icons_dir.mkdir(parents=True, exist_ok=True)
    for size in (128, 96, 48, 32, 16):
        data = render_icon(size)
        (icons_dir / f"{size}.png").write_bytes(data)
        print(f"wrote icons/{size}.png")


if __name__ == "__main__":
    main()

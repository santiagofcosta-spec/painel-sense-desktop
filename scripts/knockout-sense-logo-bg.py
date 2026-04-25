"""Remove fundo escuro do sense-logo-idle.png (amostra nos cantos + distância de cor)."""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

from PIL import Image


def median_rgb(img: Image.Image, x0: int, y0: int, x1: int, y1: int) -> tuple[int, int, int]:
    rs: list[int] = []
    gs: list[int] = []
    bs: list[int] = []
    w, h = img.size
    for y in range(max(0, y0), min(h, y1)):
        for x in range(max(0, x0), min(w, x1)):
            r, g, b, _ = img.getpixel((x, y))
            rs.append(r)
            gs.append(g)
            bs.append(b)
    if not rs:
        return 0, 0, 0
    rs.sort()
    gs.sort()
    bs.sort()
    m = len(rs) // 2
    return rs[m], gs[m], bs[m]


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    path = root / "assets" / "sense-logo-idle.png"
    if not path.is_file():
        print("Ficheiro nao encontrado:", path, file=sys.stderr)
        return 1

    backup = path.with_name("sense-logo-idle-backup.png")
    shutil.copy2(path, backup)
    print("Backup:", backup)

    img = Image.open(path).convert("RGBA")
    w, h = img.size
    margin = max(4, min(w, h) // 24)

    corners = [
        median_rgb(img, 0, 0, margin, margin),
        median_rgb(img, w - margin, 0, w, margin),
        median_rgb(img, 0, h - margin, margin, h),
        median_rgb(img, w - margin, h - margin, w, h),
    ]
    br = sum(c[0] for c in corners) // len(corners)
    bg = sum(c[1] for c in corners) // len(corners)
    bb = sum(c[2] for c in corners) // len(corners)

    th = 48.0
    fuzz = 28.0

    out_px: list[tuple[int, int, int, int]] = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = img.getpixel((x, y))
            dist = ((r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2) ** 0.5
            mx, mn = max(r, g, b), min(r, g, b)
            sat = (mx - mn) / max(mx, 1)
            luma = (r + g + b) / 3.0

            if dist < th:
                na = 0
            elif dist < th + fuzz and luma < 62 and sat < 0.28:
                t = (dist - th) / fuzz
                na = int(max(0, min(255, round(t * 255))))
            else:
                na = a
            out_px.append((r, g, b, na))

    out = Image.new("RGBA", (w, h))
    out.putdata(out_px)
    out.save(path, optimize=True)
    print("Gravado com alpha:", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

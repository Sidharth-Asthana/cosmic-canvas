"""Rank candidates by how good they'll look as a wallpaper.

Score = source curation prior + resolution + colorfulness + sharpness.
Aesthetics are computed on the thumbnail (a few hundred px) so we never
download a full-size image we end up rejecting.
"""
from __future__ import annotations

import io
import logging
from statistics import fmean, pstdev

from PIL import Image, ImageFilter, ImageStat

log = logging.getLogger(__name__)

ANALYSIS_SIZE = 320  # px; big enough for stable stats, small enough to be instant


def _colorfulness(img: Image.Image) -> float:
    """Hasler & Süsstrunk metric, normalized to roughly 0..1."""
    pixels = list(img.getdata())
    rg = [r - g for r, g, _ in pixels]
    yb = [(r + g) / 2 - b for r, g, b in pixels]
    metric = ((pstdev(rg) ** 2 + pstdev(yb) ** 2) ** 0.5
              + 0.3 * ((fmean(rg) ** 2 + fmean(yb) ** 2) ** 0.5))
    return min(metric / 100.0, 1.0)


def _sharpness(img: Image.Image) -> float:
    """Variance of a Laplacian, normalized to roughly 0..1."""
    lap = img.convert("L").filter(ImageFilter.Kernel(
        (3, 3), [0, 1, 0, 1, -4, 1, 0, 1, 0], scale=1))
    variance = ImageStat.Stat(lap).var[0]
    return min(variance / 800.0, 1.0)


def aesthetic_score(image_bytes: bytes) -> float:
    """0..2 combined aesthetics from raw (thumbnail) image bytes."""
    with Image.open(io.BytesIO(image_bytes)) as img:
        img = img.convert("RGB")
        img.thumbnail((ANALYSIS_SIZE, ANALYSIS_SIZE))
        return _colorfulness(img) + _sharpness(img)


def resolution_score(width: int | None) -> float:
    """0..1: full credit at 8K, partial below."""
    if not width:
        return 0.3  # unknown — neutral-ish, verified after download
    return min(width / 7680.0, 1.0)


def score_candidate(candidate, session) -> float:
    score = candidate.source_weight + resolution_score(candidate.width)
    if candidate.thumb_url:
        try:
            resp = session.get(candidate.thumb_url, timeout=20)
            resp.raise_for_status()
            score += aesthetic_score(resp.content)
        except Exception as exc:  # noqa: BLE001 - aesthetics are a bonus, not a gate
            log.debug("thumbnail scoring failed for %s: %s", candidate.id, exc)
    candidate.score = score
    return score

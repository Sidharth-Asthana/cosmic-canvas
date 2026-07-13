"""Shared types and helpers for image sources."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

# Titles/descriptions containing these are diagrams or artwork, not telescope imagery.
NON_PHOTO_KEYWORDS = (
    "artist", "illustration", "concept", "infographic", "chart",
    "diagram", "logo", "poster", "rendering", "animation still",
    # ESA/NASA publish annotated versions and data plots alongside each photo;
    # their titles are the only machine-readable signal (no Type field in d2d).
    "annotated", "compass", "spectrum", "spectra", "transmission",
    "light curve", "colour key", "color key", "scale bar", "graphic",
)


@dataclass
class ImageCandidate:
    id: str                      # globally unique, e.g. "esahubble:potm2606a"
    title: str
    credit: str
    source: str                  # display name, e.g. "ESA/Hubble"
    telescope: str
    published: datetime          # timezone-aware UTC
    full_url: str
    thumb_url: str | None = None
    width: int | None = None     # None = unknown until downloaded
    height: int | None = None
    best_effort: bool = False    # relaxed min-width (ISRO/JAXA)
    source_weight: float = 0.0   # curation prior, set by each source
    score: float = field(default=0.0, compare=False)


def looks_like_photo(*texts: str) -> bool:
    blob = " ".join(t.lower() for t in texts if t)
    return not any(k in blob for k in NON_PHOTO_KEYWORDS)


def parse_date(value: str) -> datetime:
    """Parse ISO-ish dates from the various APIs into aware UTC datetimes."""
    value = value.strip().replace("Z", "+00:00")
    for fmt in None, "%Y-%m-%d", "%Y-%m-%dT%H:%M:%S%z":
        try:
            dt = datetime.fromisoformat(value) if fmt is None else datetime.strptime(value, fmt)
            break
        except ValueError:
            continue
    else:
        # Last resort: pull a YYYY-MM-DD out of the string
        m = re.search(r"(\d{4})-(\d{2})-(\d{2})", value)
        if not m:
            raise ValueError(f"unparseable date: {value!r}")
        dt = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def slugify(text: str, max_len: int = 40) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:max_len].rstrip("-") or "image"

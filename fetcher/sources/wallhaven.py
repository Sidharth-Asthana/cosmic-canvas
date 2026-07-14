"""Wallhaven (wallhaven.cc) — themed non-space wallpapers: abstract, nature, water.

No API key needed for SFW searches. We pull the monthly toplist filtered to
"General" category, SFW purity, and >= 3840x2160, so everything is curated,
clean, and true 4K. Licensing is informal (user uploads) — fine for personal
desktop use; the README notes not to redistribute these.
"""
from __future__ import annotations

import logging
from datetime import datetime

from .base import ImageCandidate, parse_date

log = logging.getLogger(__name__)

API_URL = "https://wallhaven.cc/api/v1/search"
THEME_QUERIES = {
    "abstract": "abstract",
    "nature": "nature landscape",
    "water": "ocean water waves",
}
MAX_PER_THEME = 24


def fetch_wallhaven(session, config, cutoff: datetime) -> list[ImageCandidate]:
    quotas = config.get("themes", {})
    candidates: list[ImageCandidate] = []
    for theme, query in THEME_QUERIES.items():
        if quotas.get(theme, 0) <= 0:
            continue
        resp = session.get(API_URL, params={
            "q": query,
            "categories": "100",       # General only (no anime/people)
            "purity": "100",           # SFW only
            "atleast": "3840x2160",
            "sorting": "toplist",
            "topRange": "1M",
        }, timeout=30)
        resp.raise_for_status()
        for item in resp.json().get("data", [])[:MAX_PER_THEME]:
            try:
                published = parse_date(item.get("created_at", ""))
            except ValueError:
                continue
            candidates.append(ImageCandidate(
                id=f"wallhaven:{item['id']}",
                title=f"{theme.title()} · {item['id']}",
                credit="wallhaven.cc community",
                source="Wallhaven",
                telescope="",
                published=published,
                full_url=item["path"],
                thumb_url=(item.get("thumbs") or {}).get("small"),
                width=item.get("dimension_x"),
                height=item.get("dimension_y"),
                theme=theme,
                source_weight=2.0,
            ))
    log.info("Wallhaven: %d themed candidates", len(candidates))
    return candidates

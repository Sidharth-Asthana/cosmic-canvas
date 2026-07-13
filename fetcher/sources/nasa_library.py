"""NASA Image and Video Library (images-api.nasa.gov) — no API key required."""
from __future__ import annotations

import logging
from datetime import datetime

from .base import ImageCandidate, looks_like_photo, parse_date

log = logging.getLogger(__name__)

SEARCH_URL = "https://images-api.nasa.gov/search"
QUERIES = (
    ("james webb space telescope", "James Webb Space Telescope"),
    ("hubble space telescope", "Hubble Space Telescope"),
    ("chandra x-ray observatory", "Chandra X-ray Observatory"),
)
MAX_ITEMS_PER_QUERY = 25


def _orig_asset_url(session, item_href: str) -> str | None:
    resp = session.get(item_href, timeout=30)
    resp.raise_for_status()
    urls = resp.json()
    for u in urls:
        if "~orig" in u and u.lower().endswith((".jpg", ".jpeg", ".png", ".tif")):
            return u.replace("http://", "https://")
    return None


def fetch_library(session, config, cutoff: datetime) -> list[ImageCandidate]:
    candidates = []
    year = cutoff.year
    for query, telescope in QUERIES:
        resp = session.get(SEARCH_URL, params={
            "q": query, "media_type": "image", "year_start": str(year),
        }, timeout=30)
        resp.raise_for_status()
        items = resp.json().get("collection", {}).get("items", [])[:MAX_ITEMS_PER_QUERY]
        for item in items:
            meta_list = item.get("data") or []
            if not meta_list:
                continue
            meta = meta_list[0]
            try:
                published = parse_date(meta.get("date_created", ""))
            except ValueError:
                continue
            if published < cutoff:
                continue
            title = meta.get("title", "").strip()
            if not looks_like_photo(title, meta.get("description", "")[:300]):
                continue
            links = item.get("links") or []
            thumb = next((l.get("href") for l in links if l.get("rel") == "preview"), None)
            candidates.append(ImageCandidate(
                id=f"nasalib:{meta.get('nasa_id')}",
                title=title,
                credit=meta.get("secondary_creator") or meta.get("center") or "NASA",
                source="NASA Image Library",
                telescope=telescope,
                published=published,
                # Full URL resolved lazily (extra request per item) — store the
                # collection href and resolve in resolve_full_url().
                full_url=item.get("href", ""),
                thumb_url=thumb,
                source_weight=1.5,
            ))
    log.info("NASA Image Library: %d candidates", len(candidates))
    return candidates


def resolve_full_url(session, candidate: ImageCandidate) -> bool:
    """Swap the collection href for the actual ~orig asset URL. Returns success."""
    if not candidate.id.startswith("nasalib:") or not candidate.full_url:
        return True
    if candidate.full_url.lower().endswith((".jpg", ".jpeg", ".png", ".tif")):
        return True  # already resolved
    try:
        url = _orig_asset_url(session, candidate.full_url)
    except Exception as exc:  # noqa: BLE001 - per-item failures must not abort the run
        log.warning("could not resolve %s: %s", candidate.id, exc)
        return False
    if not url:
        return False
    candidate.full_url = url
    return True

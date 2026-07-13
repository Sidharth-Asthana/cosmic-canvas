"""NASA Astronomy Picture of the Day (api.nasa.gov/planetary/apod)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from .base import ImageCandidate, looks_like_photo, parse_date

log = logging.getLogger(__name__)

API_URL = "https://api.nasa.gov/planetary/apod"


def fetch_apod(session, config, cutoff: datetime) -> list[ImageCandidate]:
    start = cutoff.date().isoformat()
    end = datetime.now(timezone.utc).date().isoformat()
    resp = session.get(API_URL, params={
        "api_key": config.get("nasa_api_key", "DEMO_KEY"),
        "start_date": start, "end_date": end, "thumbs": False,
    }, timeout=30)
    resp.raise_for_status()
    entries = resp.json()
    if isinstance(entries, dict):
        entries = [entries]

    candidates = []
    for e in entries:
        if e.get("media_type") != "image" or not e.get("hdurl"):
            continue
        title = e.get("title", "").strip()
        if not looks_like_photo(title, e.get("explanation", "")[:300]):
            continue
        candidates.append(ImageCandidate(
            id=f"apod:{e.get('date')}",
            title=title,
            credit=e.get("copyright", "NASA APOD").strip(),
            source="NASA APOD",
            telescope="Various",
            published=parse_date(e.get("date", end)),
            full_url=e["hdurl"],
            thumb_url=e.get("url"),   # APOD 'url' is the screen-size version
            source_weight=2.0,
        ))
    log.info("NASA APOD: %d candidates", len(candidates))
    return candidates

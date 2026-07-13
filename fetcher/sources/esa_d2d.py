"""ESA Data2Dome JSON feeds (esahubble.org / esawebb.org).

Both sites run Djangoplicity and expose the same feed shape at /images/d2d/:
{"Count": n, "Next": url, "Collections": [{ID, Title, Credit, PublicationDate,
 Assets: [{MediaType, Resources: [{ResourceType, URL, Dimensions, FileSize}]}]}]}
"""
from __future__ import annotations

import logging
from datetime import datetime

from .base import ImageCandidate, looks_like_photo, parse_date

log = logging.getLogger(__name__)

MAX_PAGES = 3
MAX_FILE_BYTES = 200 * 1024 * 1024  # skip enormous originals (TIFF masters)
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png")


def _pick_resources(asset: dict) -> tuple[dict | None, dict | None]:
    """Return (best full-size jpg/png resource, thumbnail resource)."""
    best, thumb = None, None
    for res in asset.get("Resources", []):
        url = (res.get("URL") or "").lower()
        dims = res.get("Dimensions") or [0, 0]
        width = dims[0] if dims and isinstance(dims[0], (int, float)) else 0
        rtype = (res.get("ResourceType") or "").lower()
        if rtype in ("thumbnail", "small") and url.endswith(IMAGE_EXTENSIONS):
            if thumb is None or rtype == "small":
                thumb = res
        if not url.endswith(IMAGE_EXTENSIONS):
            continue
        size = res.get("FileSize") or 0
        if size and size > MAX_FILE_BYTES:
            continue
        if best is None or width > (best.get("Dimensions") or [0])[0]:
            best = res
    return best, thumb


def fetch(session, base_url: str, source_name: str, telescope: str,
          prefix: str, weight: float, cutoff: datetime) -> list[ImageCandidate]:
    candidates: list[ImageCandidate] = []
    url = base_url.rstrip("/") + "/images/d2d/"
    for _ in range(MAX_PAGES):
        resp = session.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        collections = data.get("Collections", [])
        oldest_on_page = None
        for col in collections:
            try:
                published = parse_date(col.get("PublicationDate", ""))
            except ValueError:
                continue
            oldest_on_page = min(oldest_on_page or published, published)
            if published < cutoff:
                continue
            title = col.get("Title", "").strip()
            if not looks_like_photo(title, col.get("Description", "")[:500]):
                continue
            for asset in col.get("Assets", []):
                if asset.get("MediaType") != "Image":
                    continue
                best, thumb = _pick_resources(asset)
                if not best:
                    continue
                dims = best.get("Dimensions") or [None, None]
                candidates.append(ImageCandidate(
                    id=f"{prefix}:{col.get('ID', '')}",
                    title=title,
                    credit=col.get("Credit", source_name),
                    source=source_name,
                    telescope=telescope,
                    published=published,
                    full_url=best["URL"],
                    thumb_url=thumb["URL"] if thumb else None,
                    width=dims[0], height=dims[1] if len(dims) > 1 else None,
                    source_weight=weight,
                ))
                break  # one asset per collection is enough
        next_url = data.get("Next")
        # Feed is newest-first; stop once a whole page predates the cutoff.
        if not next_url or (oldest_on_page and oldest_on_page < cutoff):
            break
        url = next_url
    log.info("%s: %d candidates", source_name, len(candidates))
    return candidates


def fetch_hubble(session, config, cutoff):
    return fetch(session, "https://esahubble.org", "ESA/Hubble",
                 "Hubble Space Telescope", "esahubble", 3.0, cutoff)


def fetch_webb(session, config, cutoff):
    return fetch(session, "https://esawebb.org", "ESA/Webb",
                 "James Webb Space Telescope", "esawebb", 3.0, cutoff)

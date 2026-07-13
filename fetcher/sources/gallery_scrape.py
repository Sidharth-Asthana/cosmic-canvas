"""Best-effort gallery scrapers for agencies without public image APIs (ISRO, JAXA).

These sites restructure often and rarely publish 4K imagery, so this module is
deliberately defensive: every failure is logged and returns an empty list, and
candidates are capped per source. Dates are usually absent from gallery markup,
so scraped images are stamped with today's date and deduped via state.json.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .base import ImageCandidate, slugify

log = logging.getLogger(__name__)

MAX_PER_SOURCE = 5
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png")
SKIP_FILENAME_HINTS = ("logo", "icon", "banner", "button", "thumb_", "sprite", "emblem")

ISRO_GALLERIES = (
    "https://www.isro.gov.in/mission_ASTROSAT_Gallery.html",
    "https://www.isro.gov.in/chandrayaan3_gallery.html",
    "https://www.isro.gov.in/75images.html",
)
JAXA_GALLERIES = (
    "https://www.isas.jaxa.jp/en/gallery/",
    "https://xrism.isas.jaxa.jp/en/gallery/",
)


def _scrape_page(session, page_url: str) -> list[str]:
    resp = session.get(page_url, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    urls: list[str] = []
    # Full-size images are usually behind <a href="...jpg">; inline <img> as fallback.
    for tag, attr in (("a", "href"), ("img", "src")):
        for el in soup.find_all(tag):
            raw = el.get(attr) or ""
            if not raw.lower().endswith(IMAGE_EXTENSIONS):
                continue
            if any(h in raw.lower() for h in SKIP_FILENAME_HINTS):
                continue
            urls.append(urljoin(page_url, raw))
    # Preserve order, drop duplicates
    return list(dict.fromkeys(urls))


def _scrape_source(session, galleries, prefix, source_name, telescope, weight):
    now = datetime.now(timezone.utc)
    candidates: list[ImageCandidate] = []
    for page in galleries:
        if len(candidates) >= MAX_PER_SOURCE:
            break
        try:
            urls = _scrape_page(session, page)
        except Exception as exc:  # noqa: BLE001 - site changes must not abort the run
            log.warning("%s gallery %s failed: %s", source_name, page, exc)
            continue
        for url in urls[: MAX_PER_SOURCE - len(candidates)]:
            name = url.rsplit("/", 1)[-1].rsplit(".", 1)[0]
            candidates.append(ImageCandidate(
                id=f"{prefix}:{slugify(name, 60)}",
                title=name.replace("_", " ").replace("-", " ").strip().title(),
                credit=source_name,
                source=source_name,
                telescope=telescope,
                published=now,
                full_url=url,
                thumb_url=None,
                best_effort=True,
                source_weight=weight,
            ))
    log.info("%s: %d candidates (best effort)", source_name, len(candidates))
    return candidates


def fetch_isro(session, config, cutoff):
    return _scrape_source(session, ISRO_GALLERIES, "isro", "ISRO",
                          "AstroSat / Chandrayaan / Aditya-L1", 1.0)


def fetch_jaxa(session, config, cutoff):
    return _scrape_source(session, JAXA_GALLERIES, "jaxa", "JAXA",
                          "JAXA missions", 1.0)

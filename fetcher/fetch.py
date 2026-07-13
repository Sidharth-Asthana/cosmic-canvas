"""Space wallpaper fetcher.

Pulls the latest publicly released space-telescope imagery from NASA, ESA,
ISRO and JAXA, ranks it, downloads the best few as 4K+ JPEGs into the Lively
wallpaper package, refreshes the manifest the wallpaper reads, and enforces
the retention policy (size cap + age limit, favorites exempt).

Run:  python fetch.py            (uses config.json, overlaid by config.local.json)
"""
from __future__ import annotations

import io
import json
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from PIL import Image

# Telescope originals routinely exceed Pillow's 89-megapixel default guard.
Image.MAX_IMAGE_PIXELS = 300_000_000

FETCHER_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(FETCHER_DIR))

from cleanup import run_cleanup  # noqa: E402
from scoring import score_candidate  # noqa: E402
from sources import esa_d2d, gallery_scrape, nasa_apod, nasa_library  # noqa: E402
from sources.base import ImageCandidate, slugify  # noqa: E402

log = logging.getLogger("fetch")

SOURCES = {
    "esa_hubble": esa_d2d.fetch_hubble,
    "esa_webb": esa_d2d.fetch_webb,
    "nasa_apod": nasa_apod.fetch_apod,
    "nasa_library": nasa_library.fetch_library,
    "isro": gallery_scrape.fetch_isro,
    "jaxa": gallery_scrape.fetch_jaxa,
}


def _read_json(path: Path) -> dict:
    # utf-8-sig tolerates BOMs left behind by PowerShell edits
    return json.loads(path.read_text(encoding="utf-8-sig"))


def load_config() -> dict:
    config = _read_json(FETCHER_DIR / "config.json")
    local = FETCHER_DIR / "config.local.json"
    if local.exists():
        config.update(_read_json(local))
    return config


def load_state() -> dict:
    state_path = FETCHER_DIR / "state.json"
    if state_path.exists():
        return _read_json(state_path)
    return {"seen": [], "meta": {}}


def save_state(state: dict) -> None:
    # Keep the seen-list bounded; anything past the lookback window can't recur.
    state["seen"] = state["seen"][-2000:]
    (FETCHER_DIR / "state.json").write_text(
        json.dumps(state, indent=1), encoding="utf-8")


def gather_candidates(session, config, cutoff) -> list[ImageCandidate]:
    candidates: list[ImageCandidate] = []
    for name, fetcher in SOURCES.items():
        if not config.get("sources", {}).get(name, True):
            continue
        try:
            candidates.extend(fetcher(session, config, cutoff))
        except Exception as exc:  # noqa: BLE001 - one dead source must not block the rest
            log.warning("source %s failed: %s", name, exc)
    return candidates


def download_and_encode(session, candidate, config, images_dir: Path) -> dict | None:
    """Download full image, verify size, re-encode to wallpaper JPEG.

    Returns a manifest entry dict, or None if the image doesn't qualify.
    """
    if not nasa_library.resolve_full_url(session, candidate):
        return None
    resp = session.get(candidate.full_url, timeout=180)
    resp.raise_for_status()

    with Image.open(io.BytesIO(resp.content)) as img:
        img = img.convert("RGB")
        min_width = (config["min_width_best_effort"] if candidate.best_effort
                     else config["min_width"])
        if img.width < min_width:
            log.info("rejected %s: %dpx wide < %dpx minimum",
                     candidate.id, img.width, min_width)
            return None
        if img.width > config["max_encode_width"]:
            scale = config["max_encode_width"] / img.width
            img = img.resize(
                (config["max_encode_width"], round(img.height * scale)),
                Image.LANCZOS)

        filename = (f"{candidate.published:%Y%m%d}_"
                    f"{slugify(candidate.source, 12)}_{slugify(candidate.title)}.jpg")
        out_path = images_dir / filename
        img.save(out_path, "JPEG", quality=config["jpeg_quality"],
                 optimize=True, progressive=True)

    log.info("saved %s (%dx%d, %.1f MB) from %s", filename, img.width, img.height,
             out_path.stat().st_size / 1e6, candidate.source)
    return {
        "file": f"images/{filename}",
        "title": candidate.title,
        "credit": candidate.credit,
        "source": candidate.source,
        "telescope": candidate.telescope,
        "published": candidate.published.date().isoformat(),
    }


def rebuild_manifest(config, images_dir: Path, meta: dict) -> None:
    """Write manifest.json (+ manifest.js loadable via <script> under file://)."""
    entries = []
    for sub, favorite in ((images_dir, False), (images_dir / "favorites", True)):
        if not sub.is_dir():
            continue
        for f in sub.iterdir():
            if not (f.is_file() and f.suffix.lower() in (".jpg", ".jpeg", ".png")):
                continue
            rel = f"images/{'favorites/' if favorite else ''}{f.name}"
            entry = meta.get(rel) or meta.get(f"images/{f.name}") or {
                "title": f.stem.replace("_", " ").replace("-", " ").title(),
                "credit": "", "source": "", "telescope": "",
                "published": datetime.fromtimestamp(
                    f.stat().st_mtime, timezone.utc).date().isoformat(),
            }
            entry = {**entry, "file": rel, "favorite": favorite}
            entries.append(entry)
            meta[rel] = {k: v for k, v in entry.items() if k != "favorite"}

    entries.sort(key=lambda e: (e["published"], e["file"]), reverse=True)
    manifest = {"updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "images": entries}

    manifest_path = (FETCHER_DIR / config["manifest_path"]).resolve()
    manifest_path.write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    # WebView2/CEF block fetch() on file:// URLs, but <script src> always works.
    manifest_path.with_suffix(".js").write_text(
        "window.SPACE_MANIFEST = " + json.dumps(manifest) + ";", encoding="utf-8")

    # Drop metadata for files that no longer exist
    live = {e["file"] for e in entries}
    for key in list(meta):
        if key not in live:
            del meta[key]
    log.info("manifest updated: %d image(s)", len(entries))


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler(FETCHER_DIR / "fetch.log", encoding="utf-8"),
        ],
    )
    config = load_config()
    state = load_state()
    images_dir = (FETCHER_DIR / config["images_dir"]).resolve()
    images_dir.mkdir(parents=True, exist_ok=True)
    (images_dir / "favorites").mkdir(exist_ok=True)
    cutoff = datetime.now(timezone.utc) - timedelta(days=config["lookback_days"])

    session = requests.Session()
    session.headers["User-Agent"] = "SpaceWallpaperFetcher/1.0 (personal desktop use)"

    seen = set(state["seen"])
    candidates = [c for c in gather_candidates(session, config, cutoff)
                  if c.id not in seen]
    log.info("%d new candidate(s) after dedupe", len(candidates))

    for c in candidates:
        score_candidate(c, session)
    candidates.sort(key=lambda c: c.score, reverse=True)

    downloaded = 0
    for candidate in candidates:
        if downloaded >= config["downloads_per_run"]:
            break
        try:
            entry = download_and_encode(session, candidate, config, images_dir)
        except Exception as exc:  # noqa: BLE001 - skip broken downloads, try next
            log.warning("download failed for %s: %s", candidate.id, exc)
            state["seen"].append(candidate.id)
            continue
        state["seen"].append(candidate.id)  # seen even if rejected (too small)
        if entry:
            state["meta"][entry["file"]] = {k: v for k, v in entry.items()
                                            if k != "file"}
            downloaded += 1

    run_cleanup(images_dir, config["cleanup"]["max_folder_bytes"],
                config["cleanup"]["max_age_days"])
    rebuild_manifest(config, images_dir, state["meta"])
    save_state(state)
    log.info("done: %d new wallpaper(s)", downloaded)
    return 0


if __name__ == "__main__":
    sys.exit(main())

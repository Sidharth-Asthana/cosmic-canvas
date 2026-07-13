"""Wallpaper folder retention: age limit + size cap. favorites/ is never touched."""
from __future__ import annotations

import logging
import time
from pathlib import Path

log = logging.getLogger(__name__)

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png")


def _managed_files(images_dir: Path) -> list[Path]:
    """Deletable images: directly in images_dir, not in favorites/."""
    return sorted(
        (p for p in images_dir.iterdir()
         if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS),
        key=lambda p: p.stat().st_mtime,
    )


def run_cleanup(images_dir: Path, max_folder_bytes: int, max_age_days: int) -> list[str]:
    """Delete expired/excess images. Returns deleted filenames."""
    deleted: list[str] = []
    files = _managed_files(images_dir)

    cutoff = time.time() - max_age_days * 86400
    for f in list(files):
        if f.stat().st_mtime < cutoff:
            f.unlink()
            files.remove(f)
            deleted.append(f.name)

    def total_size() -> int:
        favorites = images_dir / "favorites"
        fav_bytes = sum(p.stat().st_size for p in favorites.glob("*") if p.is_file()) \
            if favorites.is_dir() else 0
        return fav_bytes + sum(f.stat().st_size for f in files)

    while files and total_size() > max_folder_bytes:
        oldest = files.pop(0)
        oldest.unlink()
        deleted.append(oldest.name)

    if deleted:
        log.info("cleanup removed %d image(s): %s", len(deleted), ", ".join(deleted))
    return deleted

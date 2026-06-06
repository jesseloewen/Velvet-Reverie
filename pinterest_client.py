"""
pinterest_client.py - Pinterest scraper for Velvet Reverie.

Downloads images from a Pinterest board/pin URL or search query.
Cookies are loaded from a JSON file whose path is set via the
PINTEREST_COOKIES_PATH environment variable (defaults to pinterest_cookies.json).

Dependencies:
    py -m pip install pinterest-dl[image] Pillow
    py -m playwright install firefox
"""

import os
import re
import json
import threading
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(override=True)

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
    HEIF_SUPPORT = True
except ImportError:
    HEIF_SUPPORT = False

_CONVERT_SUFFIXES = {".webp", ".heic", ".heif", ".heics", ".heifs", ".hif"}

# ── Config from environment ──────────────────────────────────────────────────
PINTEREST_COOKIES_PATH = os.getenv("PINTEREST_COOKIES_PATH", "pinterest_cookies.json")

# Active scrape jobs: job_id -> {status, progress, total, log, error, folder}
_scrape_jobs: dict[str, dict] = {}
_scrape_lock = threading.Lock()


# ── Helpers ──────────────────────────────────────────────────────────────────

def _safe_filename(text: str) -> str:
    """Strip characters illegal in file names."""
    return re.sub(r'[\\/:*?"<>|]', '', text).strip()


def _convert_to_jpg_or_png(src_path: Path) -> Path:
    """Convert HEIC/WebP to JPG or PNG. Deletes the original."""
    suffix = src_path.suffix.lower()
    if suffix not in _CONVERT_SUFFIXES:
        return src_path
    if suffix in (".heic", ".heif", ".heics", ".heifs", ".hif") and not HEIF_SUPPORT:
        return src_path
    if not PIL_AVAILABLE:
        return src_path

    img = Image.open(src_path)
    has_alpha = img.mode in ("RGBA", "LA", "PA") or (
        img.mode == "P" and "transparency" in img.info
    )
    if has_alpha:
        out_suffix, save_kwargs = ".png", {}
    else:
        out_suffix, save_kwargs = ".jpg", {"quality": 95, "subsampling": 0}
        img = img.convert("RGB")

    dest = src_path.with_suffix(out_suffix)
    counter = 1
    while dest.exists() and dest != src_path:
        dest = src_path.with_stem(src_path.stem + f"_{counter}").with_suffix(out_suffix)
        counter += 1

    img.save(dest, **save_kwargs)
    src_path.unlink()
    return dest


def _rename_images(images: list, label: str) -> None:
    """Rename downloaded files to '01. Label.ext', '02. Label.ext', …"""
    safe_label = _safe_filename(label)
    pad = len(str(len(images)))

    for i, media in enumerate(images, start=1):
        src_path = Path(media.local_path) if media.local_path else None
        if not src_path or not src_path.exists():
            continue

        # Remove sidecar .txt
        sidecar = src_path.with_suffix(".txt")
        if sidecar.exists():
            sidecar.unlink()

        # Convert exotic formats
        if src_path.suffix.lower() in _CONVERT_SUFFIXES:
            src_path = _convert_to_jpg_or_png(src_path)

        ext = src_path.suffix
        new_name = f"{str(i).zfill(pad)}. {safe_label}{ext}"
        dest = src_path.parent / new_name
        counter = 1
        while dest.exists() and dest != src_path:
            new_name = f"{str(i).zfill(pad)}. {safe_label} ({counter}){ext}"
            dest = src_path.parent / new_name
            counter += 1

        src_path.rename(dest)
        media.local_path = str(dest)


def _load_cookies_path() -> str | None:
    """Return the cookies file path if it exists, else None."""
    path = PINTEREST_COOKIES_PATH
    if os.path.exists(path):
        return path
    return None


def _build_api(verbose: bool = False):
    """Build a PinterestDL API instance, injecting cookies when available."""
    try:
        from pinterest_dl import PinterestDL
    except ImportError:
        raise RuntimeError(
            "pinterest-dl is not installed. "
            "Run: py -m pip install pinterest-dl[image]"
        )

    cookies_path = _load_cookies_path()
    api = PinterestDL.with_api(timeout=5, verbose=verbose, ensure_alt=False)
    if cookies_path:
        api = api.with_cookies_path(cookies_path)
    return api, cookies_path is not None


# ── Job tracking helpers ──────────────────────────────────────────────────────

def get_job(job_id: str) -> dict | None:
    with _scrape_lock:
        return _scrape_jobs.get(job_id)


def list_jobs() -> list[dict]:
    with _scrape_lock:
        return list(_scrape_jobs.values())


def _create_job(job_id: str, source: str, num: int, output_dir: str) -> dict:
    job = {
        "id": job_id,
        "source": source,
        "num_requested": num,
        "status": "running",   # running | done | error
        "progress": 0,
        "total": num,
        "downloaded": 0,
        "log": [],
        "error": None,
        "folder": output_dir,
    }
    with _scrape_lock:
        _scrape_jobs[job_id] = job
    return job


def _log(job: dict, msg: str) -> None:
    job["log"].append(msg)
    print(f"[Pinterest] {msg}")


# ── Main scrape function (runs in background thread) ─────────────────────────

def run_scrape(
    job_id: str,
    source_type: str,   # "search" | "url"
    source: str,
    output_dir: str,
    num: int,
    min_width: int = 512,
    min_height: int = 512,
    delay: float = 0.4,
    rename_label: str | None = None,
) -> None:
    """
    Execute scrape in a background thread.
    Updates job dict in-place; caller can poll get_job(job_id).
    """
    job = _create_job(job_id, source, num, output_dir)

    try:
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        api, has_cookies = _build_api(verbose=False)
        _log(job, f"Cookies: {'loaded' if has_cookies else 'none (unauthenticated)'}")
        _log(job, f"Source: [{source_type}] {source}")
        _log(job, f"Downloading up to {num} images → {output_dir}")

        cache_path = str(Path(output_dir) / ".scrape_cache.json")

        if source_type == "search":
            images = api.search_and_download(
                query=source,
                output_dir=output_dir,
                num=num,
                min_resolution=(min_width, min_height),
                cache_path=cache_path,
                caption="none",
                delay=delay,
            )
        else:
            images = api.scrape_and_download(
                url=source,
                output_dir=output_dir,
                num=num,
                min_resolution=(min_width, min_height),
                cache_path=cache_path,
                caption="none",
                delay=delay,
            )

        images = images or []
        job["downloaded"] = len(images)
        _log(job, f"Downloaded {len(images)} image(s)")

        # Rename files
        label = rename_label or (source if source_type == "search" else
                                  [p for p in source.rstrip("/").split("/") if p][-1])
        if images:
            _log(job, f"Renaming as '{label}' …")
            _rename_images(images, label)

        job["status"] = "done"
        job["progress"] = num
        _log(job, "Done.")

    except Exception as exc:
        job["status"] = "error"
        job["error"] = str(exc)
        _log(job, f"ERROR: {exc}")


def start_scrape_thread(
    job_id: str,
    source_type: str,
    source: str,
    output_dir: str,
    num: int,
    min_width: int = 512,
    min_height: int = 512,
    delay: float = 0.4,
    rename_label: str | None = None,
) -> None:
    """Launch run_scrape in a daemon thread."""
    t = threading.Thread(
        target=run_scrape,
        args=(job_id, source_type, source, output_dir, num,
              min_width, min_height, delay, rename_label),
        daemon=True,
    )
    t.start()


def cookies_status() -> dict:
    """Return info about the configured cookies file."""
    path = PINTEREST_COOKIES_PATH
    exists = os.path.exists(path)
    session_ok = False
    cookie_count = 0

    if exists:
        try:
            data = json.loads(Path(path).read_text())
            cookie_count = len(data)
            session_ok = any(
                c.get("name") in ("_pinterest_sess", "csrftoken")
                for c in data
                if "pinterest.com" in c.get("domain", "")
            )
        except Exception:
            pass

    return {
        "path": path,
        "exists": exists,
        "session_ok": session_ok,
        "cookie_count": cookie_count,
    }

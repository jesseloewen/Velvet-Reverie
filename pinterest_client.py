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

try:
    import imagehash
    IMAGEHASH_AVAILABLE = True
except ImportError:
    IMAGEHASH_AVAILABLE = False

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
PINTEREST_DEDUP_BASE_FOLDER = os.getenv("PINTEREST_DEDUP_BASE_FOLDER", "")

# Perceptual-hash duplicate detection threshold (Hamming distance)
DEDUP_THRESHOLD = 4
# Image file extensions considered for dedup scanning
_IMAGE_EXTS = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}

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


# ── Deduplication helpers ─────────────────────────────────────────────────────

def _get_image_hash(image_path: Path):
    """Return perceptual pHash for image_path, or None on failure."""
    if not IMAGEHASH_AVAILABLE or not PIL_AVAILABLE:
        return None
    try:
        with Image.open(image_path) as img:
            return imagehash.phash(img)
    except Exception:
        return None


def _build_hash_registry(folders: list[Path], log_fn=None) -> dict:
    """Hash every image in the given folders into a registry.

    Returns:
        dict mapping hash_str -> [list of absolute path strings]
    """
    registry: dict[str, list[str]] = {}
    for folder in folders:
        if not folder.exists():
            continue
        for root, _, files in os.walk(folder):
            for fname in files:
                if Path(fname).suffix.lower() in _IMAGE_EXTS:
                    fp = Path(root) / fname
                    h = _get_image_hash(fp)
                    if h is None:
                        continue
                    h_str = str(h)
                    if h_str not in registry:
                        registry[h_str] = []
                    registry[h_str].append(str(fp))
    if log_fn:
        log_fn(f"Dedup base: {len(registry)} unique hashes across {len(folders)} folder(s)")
    return registry


def _hash_matches(target_hash, registry: dict, threshold: int) -> bool:
    """Return True if target_hash is within threshold of any hash in registry."""
    for h_str in registry:
        if (target_hash - imagehash.hex_to_hash(h_str)) <= threshold:
            return True
    return False


def dedup_new_images(
    new_folder: Path,
    base_folders: list[Path],
    threshold: int = DEDUP_THRESHOLD,
    log_fn=None,
) -> dict:
    """Remove duplicate images from new_folder.

    Compares every image in new_folder against:
      1. base_folders  – external reference images (e.g. existing collection)
      2. other Pinterest scrape folders already on disk
      3. other images within new_folder itself (internal duplicates)

    Duplicate images (Hamming distance ≤ threshold) are deleted from new_folder.
    Returns a summary dict with keys: scanned, removed, kept.
    """
    if not IMAGEHASH_AVAILABLE or not PIL_AVAILABLE:
        if log_fn:
            log_fn("Dedup skipped: imagehash / Pillow not available")
        return {"scanned": 0, "removed": 0, "kept": 0}

    def _log(msg):
        if log_fn:
            log_fn(msg)

    # Build base registry from all provided folders
    _log("Building dedup base registry…")
    base_registry = _build_hash_registry(base_folders, log_fn=log_fn)

    # Scan new_folder, removing dupes and building an in-batch registry
    batch_registry: dict[str, list[str]] = {}
    owner_of: dict[str, str] = {}  # path -> canonical owner path

    scanned = 0
    removed = 0

    image_files = sorted(
        fp for fp in new_folder.iterdir()
        if fp.is_file() and fp.suffix.lower() in _IMAGE_EXTS
    )

    for fp in image_files:
        h = _get_image_hash(fp)
        if h is None:
            continue
        scanned += 1
        h_str = str(h)

        # Check against base repository
        if _hash_matches(h, base_registry, threshold):
            _log(f"  DUPE (base): removing {fp.name}")
            try:
                fp.unlink()
            except OSError:
                pass
            removed += 1
            continue

        # Check against already-seen images within this batch
        internal_owner = None
        for existing_h_str, paths in batch_registry.items():
            existing_h = imagehash.hex_to_hash(existing_h_str)
            if (h - existing_h) <= threshold:
                internal_owner = owner_of.get(paths[0], paths[0])
                break

        if internal_owner is not None:
            _log(f"  DUPE (internal): removing {fp.name}")
            try:
                fp.unlink()
            except OSError:
                pass
            removed += 1
            continue

        # Not a duplicate — register as canonical owner
        owner_of[str(fp)] = str(fp)
        if h_str not in batch_registry:
            batch_registry[h_str] = []
        batch_registry[h_str].append(str(fp))
        # Also add to base_registry so subsequent batches treat this as seen
        if h_str not in base_registry:
            base_registry[h_str] = []
        base_registry[h_str].append(str(fp))

    kept = scanned - removed
    _log(f"Dedup complete: {scanned} scanned, {removed} removed, {kept} kept")
    return {"scanned": scanned, "removed": removed, "kept": kept}


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
        "dupes_removed": 0,
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
    dedup: bool = False,
    dedup_base_folders: list[str] | None = None,
) -> None:
    """
    Execute scrape in a background thread.
    Updates job dict in-place; caller can poll get_job(job_id).

    When dedup=True the function:
      1. Downloads a batch of images.
      2. Runs perceptual-hash dedup against base_folders + all existing
         pinterest subfolders + images already kept in this run.
      3. Deletes duplicates from disk.
      4. Repeats until `num` unique images have been collected or Pinterest
         has no more results to give.
    """
    job = _create_job(job_id, source, num, output_dir)

    try:
        out_path = Path(output_dir)
        out_path.mkdir(parents=True, exist_ok=True)
        api, has_cookies = _build_api(verbose=False)
        _log(job, f"Cookies: {'loaded' if has_cookies else 'none (unauthenticated)'}")
        _log(job, f"Source: [{source_type}] {source}")
        _log(job, f"Dedup: {'enabled (threshold={})'.format(DEDUP_THRESHOLD) if dedup else 'disabled'}")
        _log(job, f"Target: {num} unique images → {output_dir}")

        cache_path = str(out_path / ".scrape_cache.json")

        if not dedup or not IMAGEHASH_AVAILABLE or not PIL_AVAILABLE:
            # ── Simple path: one download round, no dedup ─────────────────
            if dedup and (not IMAGEHASH_AVAILABLE or not PIL_AVAILABLE):
                _log(job, "WARNING: imagehash/Pillow unavailable — dedup disabled")

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

        else:
            # ── Dedup path: loop until num unique images collected ─────────
            #
            # The pinterest-dl .scrape_cache.json tracks which Pinterest URLs
            # have already been scraped this session.  It's what prevents the
            # library from re-downloading the same images in subsequent calls.
            # When we delete a file because it's a dupe we need fresh images,
            # so we must clear that cache between rounds — just like Ctrl+F5
            # tells the browser to ignore its cache and re-fetch everything.
            #
            # To avoid re-downloading files we already kept, we maintain our
            # own set of Pinterest src URLs for images that survived dedup, and
            # we skip those files when running the dedup pass (they stay on disk
            # and are never re-hashed against themselves).

            # Build base pHash registry from external + sibling folders
            extra_base: list[Path] = []
            if dedup_base_folders:
                for bf in dedup_base_folders:
                    p = Path(bf)
                    if p.exists():
                        extra_base.append(p)

            # Discover sibling pinterest folders (other searches already done)
            pinterest_root = out_path.parent  # input/pinterest/
            if pinterest_root.exists():
                for sibling in pinterest_root.iterdir():
                    if sibling.is_dir() and sibling != out_path:
                        extra_base.append(sibling)

            total_removed = 0
            unique_kept   = 0
            round_num     = 0
            max_rounds    = 10  # safety cap to prevent infinite loops

            # pHash registry that grows with each kept image
            persistent_base = _build_hash_registry(
                extra_base, log_fn=lambda m: _log(job, m)
            )

            # Also pre-hash any files already sitting in out_path from a
            # previous (partial) run of this same folder so we don't keep them
            # as duplicates of themselves on round 2+.
            existing_files = [
                fp for fp in out_path.iterdir()
                if fp.is_file() and fp.suffix.lower() in _IMAGE_EXTS
            ]
            if existing_files:
                _log(job, f"Pre-hashing {len(existing_files)} existing file(s) in output folder…")
                for fp in existing_files:
                    h = _get_image_hash(fp)
                    if h is not None:
                        h_str = str(h)
                        if h_str not in persistent_base:
                            persistent_base[h_str] = []
                        persistent_base[h_str].append(str(fp))
                unique_kept = len(existing_files)

            while unique_kept < num and round_num < max_rounds:
                round_num += 1
                still_need = num - unique_kept
                # Overshoot a bit to compensate for expected dupes
                fetch_n = still_need + max(total_removed, 5)
                _log(job, f"Round {round_num}: need {still_need} more unique images, "
                          f"requesting {fetch_n} from Pinterest…")

                # ── Clear the scrape cache before each round ─────────────────
                # Without this, pinterest-dl returns 0 new images on round 2+
                # because its cache marks every URL from round 1 as "already
                # downloaded".  Deleting the file forces it to re-fetch fresh
                # results from Pinterest on each round (like Ctrl+F5 in a
                # browser).  We track uniqueness ourselves via pHash, so we
                # won't actually keep duplicates of what we already have.
                cache_file = out_path / ".scrape_cache.json"
                if cache_file.exists():
                    cache_file.unlink()
                    _log(job, f"  Cache cleared (Ctrl+F5 reset) for round {round_num}")

                if source_type == "search":
                    new_images = api.search_and_download(
                        query=source,
                        output_dir=output_dir,
                        num=fetch_n,
                        min_resolution=(min_width, min_height),
                        cache_path=str(cache_file),  # fresh cache for this round
                        caption="none",
                        delay=delay,
                    ) or []
                else:
                    new_images = api.scrape_and_download(
                        url=source,
                        output_dir=output_dir,
                        num=fetch_n,
                        min_resolution=(min_width, min_height),
                        cache_path=str(cache_file),
                        caption="none",
                        delay=delay,
                    ) or []

                if not new_images:
                    _log(job, f"Round {round_num}: Pinterest returned no more images")
                    break

                _log(job, f"Round {round_num}: downloaded {len(new_images)} raw image(s), "
                          f"running pHash dedup…")

                # Dedup only the NEWLY downloaded files.
                # Files already in persistent_base (kept from previous rounds)
                # are not touched — we only scan images whose local_path was
                # freshly written this round.
                new_paths = {
                    Path(m.local_path)
                    for m in new_images
                    if m.local_path and Path(m.local_path).exists()
                }

                stats = _dedup_paths(
                    image_paths=new_paths,
                    registry=persistent_base,
                    threshold=DEDUP_THRESHOLD,
                    log_fn=lambda m: _log(job, m),
                )

                round_removed  = stats["removed"]
                round_kept     = stats["kept"]
                total_removed += round_removed
                unique_kept   += round_kept

                job["dupes_removed"] = total_removed
                job["downloaded"]    = unique_kept
                job["progress"]      = unique_kept
                _log(job, f"Round {round_num} result: +{round_kept} unique "
                          f"(+{round_removed} dupes removed) — {unique_kept}/{num} total")

                if round_kept == 0:
                    _log(job, "All new images were duplicates — no fresh content available.")
                    break

            job["downloaded"] = unique_kept
            _log(job, f"Dedup loop done: {unique_kept} unique images kept, "
                      f"{total_removed} duplicates removed across {round_num} round(s)")

            # Final cleanup: delete the cache file so the folder is clean
            final_cache = out_path / ".scrape_cache.json"
            if final_cache.exists():
                final_cache.unlink()

        # ── Rename files ───────────────────────────────────────────────────
        # Collect whatever images are actually on disk now
        kept_files = sorted(
            fp for fp in out_path.iterdir()
            if fp.is_file() and fp.suffix.lower() in _IMAGE_EXTS
        )
        job["downloaded"] = len(kept_files)
        label = rename_label or (source if source_type == "search" else
                                  [p for p in source.rstrip("/").split("/") if p][-1])
        if kept_files:
            _log(job, f"Renaming {len(kept_files)} file(s) as '{label}' …")
            # Build fake media objects that _rename_images can work with
            class _FakeMedia:
                def __init__(self, path): self.local_path = str(path)
            _rename_images([_FakeMedia(fp) for fp in kept_files], label)

        job["status"] = "done"
        job["progress"] = num
        _log(job, "Done.")

    except Exception as exc:
        job["status"] = "error"
        job["error"] = str(exc)
        _log(job, f"ERROR: {exc}")


def _dedup_paths(
    image_paths: set,
    registry: dict,
    threshold: int,
    log_fn=None,
) -> dict:
    """Dedup a specific set of file paths against an existing registry.

    Only the files in image_paths are examined.  Already-kept files that
    live in the same folder but were passed in previous rounds are NOT
    re-scanned (they are already in registry from when they were first kept).

    Duplicate files are deleted from disk.
    Unique files are added to registry in-place so they are treated as
    'seen' in all future rounds.

    Returns {scanned, removed, kept}.
    """
    def _log_d(msg):
        if log_fn:
            log_fn(msg)

    scanned = 0
    removed = 0

    for fp in sorted(image_paths):
        if not fp.exists():
            continue  # already deleted by downloader pruning or a previous pass
        h = _get_image_hash(fp)
        if h is None:
            continue
        scanned += 1
        h_str = str(h)

        if _hash_matches(h, registry, threshold):
            _log_d(f"  DUPE: removing {fp.name}")
            try:
                fp.unlink()
            except OSError:
                pass
            removed += 1
        else:
            # Register as unique — future rounds won't re-download it
            if h_str not in registry:
                registry[h_str] = []
            registry[h_str].append(str(fp))

    kept = scanned - removed
    return {"scanned": scanned, "removed": removed, "kept": kept}


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
    dedup: bool = False,
    dedup_base_folders: list[str] | None = None,
) -> None:
    """Launch run_scrape in a daemon thread."""
    t = threading.Thread(
        target=run_scrape,
        kwargs=dict(
            job_id=job_id, source_type=source_type, source=source,
            output_dir=output_dir, num=num,
            min_width=min_width, min_height=min_height,
            delay=delay, rename_label=rename_label,
            dedup=dedup, dedup_base_folders=dedup_base_folders,
        ),
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

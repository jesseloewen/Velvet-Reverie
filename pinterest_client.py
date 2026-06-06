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
import time
import threading
from pathlib import Path
from dotenv import load_dotenv

try:
    import imagehash
    IMAGEHASH_AVAILABLE = True
except ImportError:
    IMAGEHASH_AVAILABLE = False

try:
    from ultralytics import YOLO as _YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    _YOLO = None  # type: ignore

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

# YOLO model path — downloaded on first use, cached in models/yolo/
_YOLO_MODEL_DIR  = Path(__file__).parent / "models" / "yolo"
_YOLO_MODEL_NAME = str(_YOLO_MODEL_DIR / "yolo11n.pt")
# Person class ID in COCO dataset (used by yolo11n)
_YOLO_PERSON_CLASS = 0
# Minimum confidence for a detection to count
_YOLO_CONF = 0.35

# Lazy-loaded model singletons (loaded once, reused for all filter calls)
_yolo_model = None
_face_cascade = None
_yolo_lock = threading.Lock()

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
    """Build a PinterestDL API instance, injecting cookies when available.

    Tuned for resilience against Pinterest's empty-response / rate-limit
    behaviour:
      - timeout=15   : generous per-request timeout (Pinterest can be slow)
      - max_retries=5: each batch retried up to 5× with exponential back-off
      - retry_delay=2: initial back-off; doubles each attempt
                       (2 s → 4 s → 8 s → 16 s → 32 s before giving up)
    """
    try:
        from pinterest_dl import PinterestDL
    except ImportError:
        raise RuntimeError(
            "pinterest-dl is not installed. "
            "Run: py -m pip install pinterest-dl[image]"
        )

    cookies_path = _load_cookies_path()
    api = PinterestDL.with_api(
        timeout=15,
        verbose=verbose,
        ensure_alt=False,
        max_retries=5,
        retry_delay=2.0,
    )
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
        "no_person_removed": 0,
        "no_face_removed": 0,
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


# ── YOLO / face filter helpers ────────────────────────────────────────────────

def _ensure_yolo() -> bool:
    """Load the YOLO model once and cache it.  Returns True if ready."""
    global _yolo_model
    if not YOLO_AVAILABLE or _YOLO is None:
        return False
    if _yolo_model is not None:
        return True
    with _yolo_lock:
        if _yolo_model is not None:
            return True
        try:
            _YOLO_MODEL_DIR.mkdir(parents=True, exist_ok=True)
            _yolo_model = _YOLO(_YOLO_MODEL_NAME)
            return True
        except Exception as exc:
            print(f"[Pinterest] YOLO load failed: {exc}")
            return False


def _ensure_face_cascade():
    """Load OpenCV Haar face cascade once and cache it."""
    global _face_cascade
    if _face_cascade is not None:
        return _face_cascade
    try:
        import cv2  # noqa: PLC0415
        xml_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        cascade = cv2.CascadeClassifier(xml_path)
        if cascade.empty():
            return None
        _face_cascade = cascade
        return _face_cascade
    except Exception:
        return None


def _image_has_person(image_path: Path) -> bool:
    """Return True if YOLO detects at least one person in the image."""
    if not _ensure_yolo():
        return True  # conservative: keep image if model unavailable
    try:
        results = _yolo_model(
            str(image_path),
            classes=[_YOLO_PERSON_CLASS],
            conf=_YOLO_CONF,
            verbose=False,
        )
        for r in results:
            if r.boxes is not None and len(r.boxes) > 0:
                return True
        return False
    except Exception:
        return True  # keep on error


def _image_has_face(image_path: Path) -> bool:
    """Return True if OpenCV detects at least one face in the image."""
    cascade = _ensure_face_cascade()
    if cascade is None:
        return True  # keep if cascade unavailable
    try:
        import cv2  # noqa: PLC0415
        import numpy as np  # noqa: PLC0415
        with Image.open(image_path) as img:
            rgb = img.convert("RGB")
            gray = np.array(rgb.convert("L"))
        faces = cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=4,
            minSize=(30, 30),
            flags=cv2.CASCADE_SCALE_IMAGE,
        )
        return len(faces) > 0
    except Exception:
        return True  # keep on error


def _filter_by_content(
    image_paths: set,
    require_person: bool = False,
    require_face: bool = False,
    log_fn=None,
) -> dict:
    """Filter image_paths according to content requirements.

    Parameters
    ----------
    image_paths   : set of Path objects to examine (only existing files).
    require_person: if True, delete images that contain no detected person.
    require_face  : if True, delete images that contain no detected face.
    log_fn        : optional logging callback.

    Returns {scanned, no_person_removed, no_face_removed, kept}.
    """
    def _logf(msg):
        if log_fn:
            log_fn(msg)

    scanned = 0
    no_person_removed = 0
    no_face_removed = 0

    if not require_person and not require_face:
        return {"scanned": 0, "no_person_removed": 0, "no_face_removed": 0, "kept": len(image_paths)}

    for fp in sorted(image_paths):
        if not fp.exists():
            continue
        scanned += 1

        if require_person:
            has_person = _image_has_person(fp)
            if not has_person:
                _logf(f"  NO PERSON: removing {fp.name}")
                try:
                    fp.unlink()
                except OSError:
                    pass
                no_person_removed += 1
                continue

        if require_face:
            has_face = _image_has_face(fp)
            if not has_face:
                _logf(f"  NO FACE: removing {fp.name}")
                try:
                    fp.unlink()
                except OSError:
                    pass
                no_face_removed += 1
                continue

    kept = scanned - no_person_removed - no_face_removed
    return {
        "scanned": scanned,
        "no_person_removed": no_person_removed,
        "no_face_removed": no_face_removed,
        "kept": kept,
    }


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
    require_person: bool = False,
    require_face: bool = False,
) -> None:
    """
    Execute scrape in a background thread.
    Updates job dict in-place; caller can poll get_job(job_id).

    Strategy
    --------
    pinterest-dl's search() / scrape() each create a fresh Api object and
    fresh BookmarkManager on every call, so they always start from page 1.
    Making multiple calls therefore returns the same images every time —
    pHash dedup would kill all of them as duplicates, creating an infinite
    zero-keeper loop.

    The correct approach is a SINGLE large API call asking for an overshoot
    batch (num + headroom for expected filter losses), then running dedup
    and content filtering locally on what came back.  No Pinterest re-calls
    are made after the initial download — all filtering happens on disk.
    """
    job = _create_job(job_id, source, num, output_dir)

    try:
        out_path = Path(output_dir)
        out_path.mkdir(parents=True, exist_ok=True)
        api, has_cookies = _build_api(verbose=False)
        _log(job, f"Cookies: {'loaded' if has_cookies else 'none (unauthenticated)'}")
        _log(job, f"Source: [{source_type}] {source}")
        _log(job, f"Dedup: {'enabled (threshold={})'.format(DEDUP_THRESHOLD) if dedup else 'disabled'}")
        if require_person or require_face:
            filters = []
            if require_person:
                filters.append("require person")
            if require_face:
                filters.append("require face")
            _log(job, f"Content filter: {', '.join(filters)}")

        use_dedup = dedup and IMAGEHASH_AVAILABLE and PIL_AVAILABLE
        use_cf    = (require_person or require_face) and YOLO_AVAILABLE

        if dedup and not use_dedup:
            _log(job, "WARNING: imagehash/Pillow unavailable — dedup disabled")
        if (require_person or require_face) and not YOLO_AVAILABLE:
            _log(job, "WARNING: ultralytics not installed — content filter disabled")

        # ── Overshoot calculation ─────────────────────────────────────────
        # Ask Pinterest for more than `num` to leave room for images that
        # will be discarded by dedup / content filtering.
        #   • +50 % headroom when only one filter is active
        #   • +100 % (2×) when both filters are active (losses compound)
        # Minimum overshoot is always at least `num` + 10 images.
        if use_dedup and use_cf:
            fetch_n = max(num * 2, num + 20)
        elif use_dedup or use_cf:
            fetch_n = max(int(num * 1.5), num + 10)
        else:
            fetch_n = num

        _log(job, f"Fetching {fetch_n} image(s) from Pinterest (target after filtering: {num})…")

        cache_file = out_path / ".scrape_cache.json"

        # ── Single Pinterest API call ─────────────────────────────────────
        if source_type == "search":
            all_images = api.search_and_download(
                query=source,
                output_dir=output_dir,
                num=fetch_n,
                min_resolution=(min_width, min_height),
                cache_path=str(cache_file),
                caption="none",
                delay=delay,
            ) or []
        else:
            all_images = api.scrape_and_download(
                url=source,
                output_dir=output_dir,
                num=fetch_n,
                min_resolution=(min_width, min_height),
                cache_path=str(cache_file),
                caption="none",
                delay=delay,
            ) or []

        raw_count = len(all_images)
        _log(job, f"Pinterest returned {raw_count} image(s)")
        job["downloaded"] = raw_count
        job["progress"]   = raw_count

        if raw_count == 0:
            _log(job, "No images returned — check your URL/query and cookies.")
            job["status"]   = "done"
            job["progress"] = num
            _log(job, "Done.")

            # Clean up cache
            if cache_file.exists():
                cache_file.unlink()
            return

        # Build the set of paths that were actually downloaded
        all_paths = {
            Path(m.local_path)
            for m in all_images
            if m.local_path and Path(m.local_path).exists()
        }

        # ── Step 1: pHash dedup ───────────────────────────────────────────
        total_dedup_removed = 0
        if use_dedup and all_paths:
            _log(job, "Running duplicate detection…")

            # Build base registry from external + sibling folders
            extra_base: list[Path] = []
            if dedup_base_folders:
                for bf in dedup_base_folders:
                    p = Path(bf)
                    if p.exists():
                        extra_base.append(p)
            pinterest_root = out_path.parent
            if pinterest_root.exists():
                for sibling in pinterest_root.iterdir():
                    if sibling.is_dir() and sibling != out_path:
                        extra_base.append(sibling)

            persistent_base = _build_hash_registry(
                extra_base, log_fn=lambda m: _log(job, m)
            )

            ds = _dedup_paths(
                image_paths=all_paths,
                registry=persistent_base,
                threshold=DEDUP_THRESHOLD,
                log_fn=lambda m: _log(job, m),
            )
            total_dedup_removed    = ds["removed"]
            job["dupes_removed"]   = total_dedup_removed
            _log(job, f"Dedup: {ds['scanned']} scanned, "
                      f"{total_dedup_removed} removed, {ds['kept']} kept")

        # ── Step 2: content filter ────────────────────────────────────────
        total_cf_removed = 0
        if use_cf:
            surviving = {fp for fp in all_paths if fp.exists()}
            if surviving:
                _log(job, f"Running content filter on {len(surviving)} image(s)…")
                cf = _filter_by_content(
                    surviving,
                    require_person=require_person,
                    require_face=require_face,
                    log_fn=lambda m: _log(job, m),
                )
                job["no_person_removed"] = cf["no_person_removed"]
                job["no_face_removed"]   = cf["no_face_removed"]
                total_cf_removed = cf["no_person_removed"] + cf["no_face_removed"]
                _log(job, f"Content filter: {total_cf_removed} removed "
                          f"(no person: {cf['no_person_removed']}, "
                          f"no face: {cf['no_face_removed']}), "
                          f"{cf['kept']} kept")

        # Final count of what survived all filters
        final_paths = [fp for fp in all_paths if fp.exists()]
        kept_count = len(final_paths)
        job["downloaded"] = kept_count
        job["progress"]   = num
        _log(job, f"After filtering: {kept_count}/{raw_count} image(s) kept "
                  f"(-{total_dedup_removed} dupes, -{total_cf_removed} cf)")

        # Clean up cache
        if cache_file.exists():
            cache_file.unlink()

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
    require_person: bool = False,
    require_face: bool = False,
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
            require_person=require_person, require_face=require_face,
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

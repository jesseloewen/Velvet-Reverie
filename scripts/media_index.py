"""
media_index.py – Smart in-memory media index for Velvet Reverie.

Problem solved
--------------
The outputs/metadata.json file can contain thousands of entries.  Every call to
/api/browse with with_metadata=1 previously read the entire JSON file from disk,
iterated over every entry, and matched each one against the requested directory.
On slow drives (network shares, USB HDDs, spinning rust) this makes the browser
feel sluggish even for folders with just a handful of images.

Solution
--------
Build a directory-keyed in-memory index once at startup, then keep it perfectly
synchronised with every write the app makes (add / delete / move).  A browse
request is now an O(1) dict lookup plus an O(k) sort of the matching entries
(k = files in that folder).

Persistent cache across restarts
---------------------------------
The fully-built index is saved to  outputs/data/index_cache.pkl  after every
write.  On the next startup the cache is validated against metadata.json using
its mtime + file-size as a fingerprint:

  • Cache valid   → load the pre-built structures in microseconds (no JSON
                    parsing, no path resolution, no loop).
  • Cache invalid → fall back to a full rebuild from metadata.json, then save
                    a fresh cache so the *next* restart is instant again.

This means the only time the app reads the whole JSON on startup is after files
were changed while it was not running (external edits, file restores, etc.).

Thread safety
-------------
All public methods acquire a single RLock before touching shared state, so the
index is safe to use from Flask worker threads and the queue-processor thread
simultaneously.

Public API
----------
    index = MediaIndex(metadata_file_path, output_dir_path)

    # Called once at app startup – uses cache when valid
    index.rebuild()

    # Called by browse_folder() instead of load_metadata()
    entries = index.get_files_in_dir(absolute_dir_path)   -> list[dict]

    # Called whenever a new file is saved
    index.add(entry_dict)

    # Called whenever a file is deleted
    index.remove_by_path(absolute_or_relative_path_str)

    # Called whenever a file is moved/renamed
    index.update_path(old_path_str, new_path_str)

    # Called by save_metadata() so the flat JSON stays consistent
    index.get_all()  -> list[dict]   (ordered by timestamp, newest first)

    # Force a full rebuild from disk (ignores cache)
    index.rebuild(force=True)
"""

from __future__ import annotations

import json
import os
import pickle
import struct
import threading
import time
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# ── helpers ──────────────────────────────────────────────────────────────────

def _norm_key(path: Path) -> str:
    """Stable, lowercase, forward-slash key for a directory Path."""
    return str(path.resolve()).replace('\\', '/').lower()


def _resolve_entry_path(entry: dict, output_dir: Path) -> Optional[Path]:
    """
    Return the *absolute* Path for an entry, always rooted under the
    *current* output_dir regardless of where the app was previously installed.
    The file does NOT need to exist on disk – we only need the path for
    bucketing into the directory index.

    Handles four path formats:
        1. Absolute path under current output_dir  (normal case after rebuild)
        2. Absolute path from a previous install location
               e.g. /old/location/outputs/images/foo.png
               → re-rooted to output_dir/images/foo.png
        3. Relative with 'outputs' prefix   e.g. outputs/images/foo.png
        4. Plain relative                   e.g. images/foo.png

    For case 2 we search for a directory component whose name matches the
    last component of output_dir (typically 'outputs') and strip everything
    before and including it so the remaining relative portion can be
    re-rooted under the current output_dir.
    """
    raw = (entry.get('path') or '').strip()
    if not raw:
        return None

    p = Path(raw)

    if p.is_absolute():
        # Fast path: already under the current output_dir – keep as-is.
        try:
            resolved = p.resolve()
            resolved.relative_to(output_dir)  # raises ValueError if not a child
            return resolved
        except ValueError:
            pass  # Fall through to relocation logic
        except Exception:
            pass

        # Slow path: absolute path from a previous install location.
        # Walk the parts looking for the outputs folder name so we can
        # extract the relative sub-path and re-root it here.
        output_dir_name = output_dir.name.lower()  # typically 'outputs'
        parts = p.parts
        for i, part in enumerate(parts):
            if part.lower() == output_dir_name:
                # Everything after this component is the relative sub-path.
                rel_parts = parts[i + 1:]
                if rel_parts:
                    return (output_dir / Path(*rel_parts)).resolve()
                break

        # Last resort: the path does not contain an 'outputs'-like component.
        # Strip all leading components and use just the filename.
        return (output_dir / p.name).resolve()

    # Relative path – may start with 'outputs' or 'outputs/'
    parts = p.parts
    if parts and parts[0].lower() in ('outputs', 'outputs/'):
        p = Path(*parts[1:])

    # Return the resolved absolute path (file need not exist)
    return (output_dir / p).resolve()


# Cache file format version – bump this whenever the pickle schema changes so
# old caches are automatically discarded rather than causing subtle bugs.
# v3: _index_entry now normalises absolute paths to output_dir-relative paths
#     so relocated installs no longer produce broken dir-index keys.
_CACHE_VERSION = 3


# ── main class ────────────────────────────────────────────────────────────────

class MediaIndex:
    """
    Persistent in-memory index of media metadata entries, keyed by parent
    directory so browse lookups are O(1).  The fully-built index is saved to
    a pickle cache file after every write so subsequent app restarts load in
    microseconds instead of re-parsing the entire metadata.json.
    """

    def __init__(self, metadata_file: Path, output_dir: Path) -> None:
        self._metadata_file = metadata_file
        self._output_dir = output_dir.resolve()
        # Cache lives in outputs/data/ alongside thumbnails
        self._cache_file: Path = output_dir / 'data' / 'index_cache.pkl'
        self._lock = threading.RLock()

        # Primary store: id → entry dict (single source of truth)
        self._by_id: Dict[str, dict] = {}

        # Fast lookup: normalised_dir_key → set of entry ids
        self._dir_index: Dict[str, set] = defaultdict(set)

        # Fast lookup: normalised_path_str → entry id  (for delete / move)
        self._path_index: Dict[str, str] = {}

        # Fingerprint of metadata.json at the time the cache was written
        self._cached_fingerprint: Tuple[int, int] = (0, 0)  # (mtime_ns, size)

        # Metrics
        self._build_time: float = 0.0
        self._entry_count: int = 0

        # Dirty flag – set whenever in-memory state diverges from disk
        self._dirty: bool = False

    # ── public ───────────────────────────────────────────────────────────────

    def rebuild(self, force: bool = False) -> int:
        """
        Ensure the index is up-to-date and return the number of entries.

        Strategy
        --------
        1. Read the current fingerprint (mtime_ns + size) of metadata.json.
        2. Try loading the pickle cache.  If the cache version matches AND its
           stored fingerprint matches the live fingerprint, restore all three
           internal dicts directly from the pickle – zero JSON parsing, zero
           path resolution.  Typical load time: < 5 ms for 10 000 entries.
        3. If the cache is missing, stale, or corrupt, fall back to a full
           rebuild from metadata.json, then save a fresh cache so the next
           restart is instant.

        Pass force=True to skip the cache check and always rebuild from JSON.
        """
        t0 = time.monotonic()
        live_fp = self._metadata_fingerprint()

        if not force:
            loaded = self._try_load_cache(live_fp)
            if loaded:
                elapsed = (time.monotonic() - t0) * 1000
                print(
                    f'[MediaIndex] Loaded from cache: {len(self._by_id)} entries '
                    f'across {len(self._dir_index)} directories '
                    f'in {elapsed:.1f} ms'
                )
                return len(self._by_id)

        # Cache miss – parse metadata.json the slow way
        entries: list = []
        if self._metadata_file.exists():
            try:
                with open(self._metadata_file, 'r', encoding='utf-8') as fh:
                    entries = json.load(fh)
                if not isinstance(entries, list):
                    entries = []
            except Exception as exc:
                print(f'[MediaIndex] WARNING – could not read metadata file: {exc}')
                entries = []

        with self._lock:
            self._by_id.clear()
            self._dir_index.clear()
            self._path_index.clear()
            self._dirty = False

            for entry in entries:
                self._index_entry(entry)

            self._entry_count = len(self._by_id)
            self._build_time = time.monotonic() - t0

        elapsed_ms = self._build_time * 1000
        print(
            f'[MediaIndex] Built index: {self._entry_count} entries '
            f'across {len(self._dir_index)} directories '
            f'in {elapsed_ms:.1f} ms'
        )

        # Persist the freshly built index so the next restart is fast
        self._save_cache(live_fp)
        return self._entry_count

    def get_files_in_dir(self, directory: Path) -> List[dict]:
        """
        Return all metadata entries whose file lives directly inside *directory*.
        Returns a list of entry dicts (copies – callers may mutate freely).
        """
        key = _norm_key(directory)
        with self._lock:
            ids = self._dir_index.get(key, set())
            return [dict(self._by_id[eid]) for eid in ids if eid in self._by_id]

    def add(self, entry: dict) -> None:
        """
        Add (or replace) a single entry in the index.
        Call this immediately after writing a new file and its metadata.
        """
        with self._lock:
            self._index_entry(entry)
            self._dirty = True

    def remove_by_path(self, file_path: str) -> bool:
        """
        Remove the entry whose path matches *file_path*.
        Both absolute and relative (with/without 'outputs' prefix) paths are
        accepted.  Returns True if an entry was removed.
        """
        key = self._path_key_from_raw(file_path)
        with self._lock:
            entry_id = self._path_index.pop(key, None)
            if entry_id is None:
                return False
            entry = self._by_id.pop(entry_id, None)
            if entry is None:
                return False
            abs_path = _resolve_entry_path(entry, self._output_dir)
            if abs_path:
                dir_key = _norm_key(abs_path.parent)
                self._dir_index[dir_key].discard(entry_id)
                if not self._dir_index[dir_key]:
                    del self._dir_index[dir_key]
            self._dirty = True
            return True

    def update_path(self, old_path: str, new_path: str) -> bool:
        """
        Update the stored path for an entry (called on file move/rename).
        Returns True if the entry was found and updated.
        """
        old_key = self._path_key_from_raw(old_path)
        with self._lock:
            entry_id = self._path_index.pop(old_key, None)
            if entry_id is None:
                return False
            entry = self._by_id.get(entry_id)
            if entry is None:
                return False

            # Remove from old directory bucket
            old_abs = _resolve_entry_path(entry, self._output_dir)
            if old_abs:
                old_dir_key = _norm_key(old_abs.parent)
                self._dir_index[old_dir_key].discard(entry_id)
                if not self._dir_index[old_dir_key]:
                    del self._dir_index[old_dir_key]

            # Update the entry dict
            entry['path'] = new_path
            entry['filename'] = os.path.basename(new_path)

            # Re-index with new path
            new_abs = _resolve_entry_path(entry, self._output_dir)
            new_key = self._path_key_from_raw(new_path)
            self._path_index[new_key] = entry_id
            if new_abs:
                new_dir_key = _norm_key(new_abs.parent)
                self._dir_index[new_dir_key].add(entry_id)

            self._dirty = True
            return True

    def rebuild_from_list(self, entries: list) -> None:
        """
        Rebuild all indexes from an externally supplied list of entry dicts.
        Called by save_metadata() when the caller has already assembled the
        final list (e.g. after deleting or filtering entries).
        """
        t0 = time.monotonic()
        with self._lock:
            self._by_id.clear()
            self._dir_index.clear()
            self._path_index.clear()
            for entry in (entries or []):
                self._index_entry(entry)
            self._dirty = False
            self._entry_count = len(self._by_id)
        elapsed = (time.monotonic() - t0) * 1000
        print(f'[MediaIndex] Rebuilt from list: {self._entry_count} entries in {elapsed:.1f} ms')

    def get_all(self) -> List[dict]:
        """
        Return all entries as a list, sorted by timestamp (newest first).
        This is used by save_metadata() to serialise back to JSON.
        """
        with self._lock:
            entries = [dict(e) for e in self._by_id.values()]
        entries.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        return entries

    def count(self) -> int:
        with self._lock:
            return len(self._by_id)

    @property
    def dirty(self) -> bool:
        return self._dirty

    def mark_clean(self) -> None:
        """
        Call after writing metadata.json so the dirty flag is cleared and the
        pickle cache is updated to reflect the freshly written file.
        """
        with self._lock:
            self._dirty = False
        # Re-fingerprint the file we just wrote and save the cache
        live_fp = self._metadata_fingerprint()
        self._save_cache(live_fp)

    # ── cache helpers ─────────────────────────────────────────────────────────

    def _metadata_fingerprint(self) -> Tuple[int, int]:
        """Return (mtime_ns, size_bytes) for metadata.json, or (0, 0) if absent."""
        try:
            st = self._metadata_file.stat()
            return (st.st_mtime_ns, st.st_size)
        except OSError:
            return (0, 0)

    def _save_cache(self, fingerprint: Tuple[int, int]) -> None:
        """
        Serialise the current index state to a pickle file so the next app
        restart can skip the JSON-parsing rebuild entirely.
        The pickle payload is a plain dict so it survives minor class changes
        as long as _CACHE_VERSION is not bumped.
        """
        try:
            self._cache_file.parent.mkdir(parents=True, exist_ok=True)
            with self._lock:
                payload = {
                    'version':     _CACHE_VERSION,
                    'fingerprint': fingerprint,
                    'output_dir':  str(self._output_dir),
                    'by_id':       dict(self._by_id),
                    'dir_index':   {k: set(v) for k, v in self._dir_index.items()},
                    'path_index':  dict(self._path_index),
                }
            # Write to a temp file then rename – atomic, no torn writes on crash
            tmp = self._cache_file.with_suffix('.pkl.tmp')
            with open(tmp, 'wb') as fh:
                pickle.dump(payload, fh, protocol=pickle.HIGHEST_PROTOCOL)
            tmp.replace(self._cache_file)
        except Exception as exc:
            # Cache save failure is non-fatal – just log and continue
            print(f'[MediaIndex] WARNING – could not save cache: {exc}')

    def _try_load_cache(self, live_fp: Tuple[int, int]) -> bool:
        """
        Attempt to restore index state from the pickle cache.
        Returns True if the cache was valid and successfully loaded,
        False if a full rebuild from JSON is required.
        """
        if not self._cache_file.exists():
            return False
        try:
            with open(self._cache_file, 'rb') as fh:
                payload = pickle.load(fh)
        except Exception as exc:
            print(f'[MediaIndex] Cache unreadable, will rebuild: {exc}')
            return False

        # Validate version
        if payload.get('version') != _CACHE_VERSION:
            print('[MediaIndex] Cache version mismatch, will rebuild.')
            return False

        # Validate that the cache was built for the same output_dir
        if payload.get('output_dir') != str(self._output_dir):
            print('[MediaIndex] Cache output_dir mismatch, will rebuild.')
            return False

        # Validate the metadata.json fingerprint (mtime + size)
        cached_fp = payload.get('fingerprint', (0, 0))
        if cached_fp != live_fp:
            print('[MediaIndex] Cache stale (metadata.json changed), rebuilding from JSON.')
            return False

        # All checks passed – restore the three index structures directly
        with self._lock:
            self._by_id        = payload['by_id']
            self._dir_index    = defaultdict(set, payload['dir_index'])
            self._path_index   = payload['path_index']
            self._dirty        = False
            self._entry_count  = len(self._by_id)
        return True

    # ── internal helpers ──────────────────────────────────────────────────────

    def _index_entry(self, entry: dict) -> None:
        """Insert one entry into all internal indexes (caller must hold lock)."""
        entry_id = entry.get('id')
        if not entry_id:
            return

        abs_path = _resolve_entry_path(entry, self._output_dir)
        if abs_path is None:
            return

        # _resolve_entry_path always returns a path under self._output_dir now,
        # so relative_to() should never raise ValueError.  The except branch is
        # kept as a belt-and-suspenders fallback.
        try:
            rel = str(abs_path.relative_to(self._output_dir)).replace('\\', '/')
        except ValueError:
            # Should not happen, but recover gracefully by using just the name.
            rel = abs_path.name

        entry = dict(entry)  # work on a copy
        entry['relative_path'] = rel
        entry['type'] = 'file'

        # If the stored 'path' was an absolute path from an old install location,
        # normalise it to a plain relative path so future saves write portable
        # paths into metadata.json and browser requests can resolve them.
        raw_path = (entry.get('path') or '').strip()
        if Path(raw_path).is_absolute():
            entry['path'] = rel
            entry['filename'] = abs_path.name

        # Remove old index entries for this id (handles re-indexing on rebuild)
        old_entry = self._by_id.get(entry_id)
        if old_entry:
            old_abs = _resolve_entry_path(old_entry, self._output_dir)
            if old_abs:
                old_dir_key = _norm_key(old_abs.parent)
                self._dir_index[old_dir_key].discard(entry_id)
                if not self._dir_index[old_dir_key]:
                    del self._dir_index[old_dir_key]
            old_path_key = self._path_key_from_raw(old_entry.get('path', ''))
            self._path_index.pop(old_path_key, None)

        # Insert
        self._by_id[entry_id] = entry
        dir_key = _norm_key(abs_path.parent)
        self._dir_index[dir_key].add(entry_id)
        path_key = self._path_key_from_raw(entry.get('path', ''))
        self._path_index[path_key] = entry_id

    def _path_key_from_raw(self, raw: str) -> str:
        """
        Produce a stable, normalised key from a raw path string.
        Strips the 'outputs' prefix if present so both old and new-style paths
        resolve to the same key.
        """
        raw = (raw or '').strip().replace('\\', '/')
        parts = raw.split('/')
        if parts and parts[0].lower() == 'outputs':
            raw = '/'.join(parts[1:])
        # Resolve to absolute for maximum stability
        p = Path(raw)
        if p.is_absolute():
            return str(p).replace('\\', '/').lower()
        return str((self._output_dir / p)).replace('\\', '/').lower()

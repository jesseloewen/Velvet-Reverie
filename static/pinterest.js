/**
 * pinterest.js – Pinterest scrape + queue-batch logic for Velvet Reverie.
 */

// ── State ────────────────────────────────────────────────────────────────────
let pinterestCurrentJobId = null;
let pinterestPollTimer = null;
let pinterestScrapedFolder = null;   // e.g. "pinterest/watercolor_art"
let pinterestDedupeEnabled = false;  // mirrors #ptDedupeEnabled checkbox
let pinterestRequirePerson = false;  // mirrors #ptRequirePerson checkbox
let pinterestRequireFace   = false;  // mirrors #ptRequireFace checkbox

// ── Init ─────────────────────────────────────────────────────────────────────
function initPinterest() {
    // Source type toggle
    const searchRadio = document.getElementById('ptSourceSearch');
    const urlRadio    = document.getElementById('ptSourceUrl');
    const searchGroup = document.getElementById('ptSearchGroup');
    const urlGroup    = document.getElementById('ptUrlGroup');
    if (searchRadio && urlRadio) {
        const toggle = () => {
            const isSearch = searchRadio.checked;
            searchGroup.style.display = isSearch ? '' : 'none';
            urlGroup.style.display    = isSearch ? 'none' : '';
        };
        searchRadio.addEventListener('change', toggle);
        urlRadio.addEventListener('change', toggle);
        toggle();
    }

    // Scrape button
    const scrapeBtn = document.getElementById('ptScrapeBtn');
    if (scrapeBtn) scrapeBtn.addEventListener('click', startPinterestScrape);

    // Queue batch button
    const queueBtn = document.getElementById('ptQueueBatchBtn');
    if (queueBtn) queueBtn.addEventListener('click', queuePinterestBatch);

    // Size mode radios
    const origSize   = document.getElementById('ptUseOriginalSize');
    const customSize = document.getElementById('ptUseCustomSize');
    const wGroup     = document.getElementById('ptWidthGroup');
    const hGroup     = document.getElementById('ptHeightGroup');
    if (origSize && customSize) {
        const toggleSize = () => {
            const custom = customSize.checked;
            wGroup.querySelector('input').disabled = !custom;
            hGroup.querySelector('input').disabled = !custom;
            wGroup.style.opacity = custom ? '1' : '0.5';
            hGroup.style.opacity = custom ? '1' : '0.5';
        };
        origSize.addEventListener('change', toggleSize);
        customSize.addEventListener('change', toggleSize);
        toggleSize();
    }

    // Dedup checkbox toggle
    const dedupeCheck = document.getElementById('ptDedupeEnabled');
    const dedupeOpts  = document.getElementById('ptDedupeOptions');
    if (dedupeCheck && dedupeOpts) {
        dedupeCheck.addEventListener('change', () => {
            pinterestDedupeEnabled = dedupeCheck.checked;
            dedupeOpts.style.display = dedupeCheck.checked ? '' : 'none';
        });
    }

    // Content filter checkbox state tracking
    const requirePersonCheck = document.getElementById('ptRequirePerson');
    const requireFaceCheck   = document.getElementById('ptRequireFace');
    if (requirePersonCheck) {
        requirePersonCheck.addEventListener('change', () => {
            pinterestRequirePerson = requirePersonCheck.checked;
        });
    }
    if (requireFaceCheck) {
        requireFaceCheck.addEventListener('change', () => {
            pinterestRequireFace = requireFaceCheck.checked;
        });
    }

    // Check cookies status, imagehash and YOLO availability on load
    checkPinterestCookies();
    _ptCheckDedupeAvailability();
    _ptCheckYoloAvailability();
}

// ── YOLO availability check ──────────────────────────────────────────────────
async function _ptCheckYoloAvailability() {
    const badge = document.getElementById('ptYoloBadge');
    if (!badge) return;
    try {
        const res = await fetch('/api/pinterest/yolo-available');
        if (res.ok) {
            const data = await res.json();
            if (!data.available) {
                badge.textContent = 'ultralytics not installed — content filter disabled';
                badge.className = 'pt-badge pt-badge-warn';
                badge.style.display = '';
                const p = document.getElementById('ptRequirePerson');
                const f = document.getElementById('ptRequireFace');
                if (p) p.disabled = true;
                if (f) f.disabled = true;
            } else {
                badge.style.display = 'none';
            }
        }
    } catch (_) {
        // Suppress silently
    }
}

// ── Dedup availability check ─────────────────────────────────────────────────
async function _ptCheckDedupeAvailability() {
    const badge = document.getElementById('ptDedupeBadge');
    if (!badge) return;
    try {
        // Reuse the cookies-status endpoint — it returns from the same module
        // that now exposes IMAGEHASH_AVAILABLE. Check via a scrape dry-run is
        // overkill; instead we rely on the server responding 503 when dedup
        // is requested without imagehash, and show the badge preemptively by
        // asking if imagehash is available via the cookies-status response.
        // For now, attempt a HEAD-style fetch to /api/pinterest/dedup-available.
        const res = await fetch('/api/pinterest/dedup-available');
        if (res.ok) {
            const data = await res.json();
            if (!data.available) {
                badge.textContent = 'imagehash not installed — dedup disabled';
                badge.className = 'pt-badge pt-badge-warn';
                badge.style.display = '';
                const check = document.getElementById('ptDedupeEnabled');
                if (check) check.disabled = true;
            } else {
                badge.style.display = 'none';
            }
        }
    } catch (_) {
        // Endpoint may not exist yet — suppress silently
    }
}

// ── Cookies status ────────────────────────────────────────────────────────────
async function checkPinterestCookies() {
    const badge = document.getElementById('ptCookiesBadge');
    const detail = document.getElementById('ptCookiesDetail');
    if (!badge) return;
    try {
        const res = await fetch('/api/pinterest/cookies-status');
        const data = await res.json();
        if (!data.success) {
            badge.textContent = 'Error';
            badge.className = 'pt-badge pt-badge-error';
            detail.textContent = data.error || 'Could not check cookies';
            return;
        }
        if (!data.exists) {
            badge.textContent = 'No cookies';
            badge.className = 'pt-badge pt-badge-warn';
            detail.textContent = `Expected at: ${data.path}. Set PINTEREST_COOKIES_PATH in .env`;
        } else if (data.session_ok) {
            badge.textContent = `Authenticated (${data.cookie_count} cookies)`;
            badge.className = 'pt-badge pt-badge-ok';
            detail.textContent = `Loaded from: ${data.path}`;
        } else {
            badge.textContent = `Cookies found but session may be expired`;
            badge.className = 'pt-badge pt-badge-warn';
            detail.textContent = `${data.cookie_count} cookies at ${data.path} — re-run login if scraping fails`;
        }
    } catch (e) {
        badge.textContent = 'Unknown';
        badge.className = 'pt-badge pt-badge-warn';
        detail.textContent = 'Could not reach server';
    }
}

// ── Start scrape ──────────────────────────────────────────────────────────────
async function startPinterestScrape() {
    const searchRadio = document.getElementById('ptSourceSearch');
    const sourceType  = searchRadio && searchRadio.checked ? 'search' : 'url';
    const source      = sourceType === 'search'
        ? (document.getElementById('ptSearchQuery')?.value || '').trim()
        : (document.getElementById('ptUrl')?.value || '').trim();

    if (!source) {
        showNotification(sourceType === 'search' ? 'Enter a search query' : 'Enter a Pinterest URL', 'Error', 'error', 3000);
        return;
    }

    const num            = parseInt(document.getElementById('ptNumImages')?.value || '30');
    const minWidth        = parseInt(document.getElementById('ptMinWidth')?.value  || '512');
    const minHeight       = parseInt(document.getElementById('ptMinHeight')?.value || '512');
    const folderName      = (document.getElementById('ptFolderName')?.value || '').trim() || null;
    const label           = (document.getElementById('ptRenameLabel')?.value || '').trim() || null;
    const dedup           = document.getElementById('ptDedupeEnabled')?.checked || false;
    const dedupeBaseFolder= (document.getElementById('ptDedupeBaseFolder')?.value || '').trim() || null;
    const requirePerson   = document.getElementById('ptRequirePerson')?.checked || false;
    const requireFace     = document.getElementById('ptRequireFace')?.checked || false;

    // Update UI
    pinterestScrapedFolder = null;
    _ptSetScrapeState('running');
    _ptSetLog([]);
    _ptSetProgress(0, num);
    _ptSetDedupStats(null);
    _ptSetContentStats(null);
    document.getElementById('ptQueueBatchBtn').disabled = true;

    try {
        const res = await fetch('/api/pinterest/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source_type: sourceType,
                source,
                num,
                folder_name: folderName || source,
                min_width: minWidth,
                min_height: minHeight,
                rename_label: label,
                dedup,
                dedup_base_folder: dedupeBaseFolder,
                require_person: requirePerson,
                require_face: requireFace,
            }),
        });
        const data = await res.json();
        if (!data.success) {
            _ptSetScrapeState('error');
            showNotification(data.error, 'Pinterest Error', 'error', 5000);
            return;
        }
        pinterestCurrentJobId = data.job_id;
        pinterestScrapedFolder = data.folder;
        _ptStartPolling();
    } catch (e) {
        _ptSetScrapeState('error');
        showNotification('Request failed: ' + e.message, 'Error', 'error', 5000);
    }
}

// ── Polling ───────────────────────────────────────────────────────────────────
function _ptStartPolling() {
    if (pinterestPollTimer) clearInterval(pinterestPollTimer);
    pinterestPollTimer = setInterval(_ptPoll, 1500);
}

async function _ptPoll() {
    if (!pinterestCurrentJobId) {
        clearInterval(pinterestPollTimer);
        return;
    }
    try {
        const res = await fetch(`/api/pinterest/job/${pinterestCurrentJobId}`);
        const data = await res.json();
        if (!data.success) return;

        _ptSetLog(data.log || []);
        _ptSetProgress(data.downloaded || 0, data.num_requested || 0);

        // Update dedup stats whenever available
        if (data.dupes_removed > 0 || (data.status === 'done' && data.dupes_removed >= 0)) {
            _ptSetDedupStats(data.dupes_removed ?? null);
        }

        // Update content filter stats whenever available
        const noPerson = data.no_person_removed || 0;
        const noFace   = data.no_face_removed   || 0;
        if (noPerson > 0 || noFace > 0 || data.status === 'done') {
            _ptSetContentStats(
                (noPerson > 0 || noFace > 0) ? { noPerson, noFace } : null,
                data.status === 'done'
            );
        }

        if (data.status === 'done') {
            clearInterval(pinterestPollTimer);
            _ptSetScrapeState('done');
            const count     = data.downloaded || 0;
            const removed   = data.dupes_removed || 0;
            const noPerson2 = data.no_person_removed || 0;
            const noFace2   = data.no_face_removed   || 0;
            const cfRemoved = noPerson2 + noFace2;
            let msg = `Downloaded ${count} image(s) from Pinterest`;
            if (removed > 0 || cfRemoved > 0) {
                const parts = [];
                if (removed > 0)   parts.push(`${removed} dupe(s) removed`);
                if (cfRemoved > 0) parts.push(`${cfRemoved} filtered by content`);
                msg = `${count} image(s) kept · ${parts.join(' · ')}`;
            }
            showNotification(msg, 'Done', 'success', 4000);
            if (removed > 0) _ptSetDedupStats(removed);
            if (noPerson2 > 0 || noFace2 > 0) _ptSetContentStats({ noPerson: noPerson2, noFace: noFace2 }, true);
            // Enable the queue button if we have images
            if (count > 0) {
                document.getElementById('ptQueueBatchBtn').disabled = false;
                _ptSetFolderDisplay(pinterestScrapedFolder);
            }
        } else if (data.status === 'error') {
            clearInterval(pinterestPollTimer);
            _ptSetScrapeState('error');
            showNotification('Scrape failed: ' + (data.error || 'unknown error'), 'Pinterest Error', 'error', 6000);
        }
    } catch (e) {
        // network blip — keep polling
    }
}

// ── Queue batch ───────────────────────────────────────────────────────────────
async function queuePinterestBatch() {
    const prompt = (document.getElementById('ptPrompt')?.value || '').trim();
    if (!prompt) {
        showNotification('Enter a prompt before queueing', 'Error', 'error', 3000);
        return;
    }
    savePromptToHistory(prompt, 'image');
    if (!pinterestScrapedFolder) {
        showNotification('No scraped folder available — run a scrape first', 'Error', 'error', 3000);
        return;
    }

    const useOriginal = document.getElementById('ptUseOriginalSize')?.checked ?? true;
    const width       = parseInt(document.getElementById('ptWidth')?.value  || '1024');
    const height      = parseInt(document.getElementById('ptHeight')?.value || '1024');
    const steps       = parseInt(document.getElementById('ptSteps')?.value  || '4');
    const cfg         = parseFloat(document.getElementById('ptCfg')?.value  || '1.0');
    const shift       = parseFloat(document.getElementById('ptShift')?.value|| '3.0');
    const seed        = document.getElementById('ptSeed')?.value || null;
    const filePrefix  = (document.getElementById('ptFilePrefix')?.value || 'pinterest').trim();
    const subfolder   = (document.getElementById('ptSubfolder')?.value || '').trim();
    const mcnlLora    = document.getElementById('ptMcnlLora')?.checked  || false;
    const snofsLora   = document.getElementById('ptSnofsLora')?.checked || false;
    const maleLora    = document.getElementById('ptMaleLora')?.checked  || false;

    const btn = document.getElementById('ptQueueBatchBtn');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Queueing…';

    try {
        const res = await fetch('/api/pinterest/queue-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt,
                folder: pinterestScrapedFolder,
                use_original_size: useOriginal,
                width, height, steps, cfg, shift,
                seed: seed ? parseInt(seed) : null,
                file_prefix: filePrefix,
                subfolder,
                mcnl_lora: mcnlLora,
                snofs_lora: snofsLora,
                male_lora: maleLora,
            }),
        });
        const data = await res.json();
        if (data.success) {
            showNotification(`Queued ${data.queued_count} image(s) for generation`, 'Queued', 'success', 4000);
            btn.querySelector('span').textContent = `Queued ${data.queued_count}`;
        } else {
            showNotification(data.error, 'Error', 'error', 5000);
            btn.querySelector('span').textContent = 'Queue Batch';
            btn.disabled = false;
        }
    } catch (e) {
        showNotification('Request failed: ' + e.message, 'Error', 'error', 5000);
        btn.querySelector('span').textContent = 'Queue Batch';
        btn.disabled = false;
    }
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function _ptSetScrapeState(state) {
    const btn       = document.getElementById('ptScrapeBtn');
    const indicator = document.getElementById('ptScrapeIndicator');
    if (!btn) return;
    if (state === 'running') {
        btn.disabled = true;
        btn.querySelector('span').textContent = 'Scraping…';
        if (indicator) indicator.style.display = '';
    } else {
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Download Images';
        if (indicator) indicator.style.display = 'none';
    }
}

function _ptSetProgress(done, total) {
    const bar   = document.getElementById('ptProgressBar');
    const label = document.getElementById('ptProgressLabel');
    if (!bar) return;
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    bar.style.width = pct + '%';
    if (label) label.textContent = total > 0 ? `${done} / ${total}` : '';
}

function _ptSetLog(lines) {
    const el = document.getElementById('ptScrapeLog');
    if (!el) return;
    el.textContent = lines.join('\n');
    el.scrollTop = el.scrollHeight;
}

function _ptSetFolderDisplay(folder) {
    const el = document.getElementById('ptScrapedFolderDisplay');
    if (el) {
        el.textContent = folder || 'None';
        el.style.color = folder ? 'var(--primary)' : 'var(--text-muted)';
    }
}

function _ptSetDedupStats(removedCount) {
    const el   = document.getElementById('ptDedupStats');
    const text = document.getElementById('ptDedupStatsText');
    if (!el || !text) return;
    if (removedCount === null || removedCount === undefined) {
        el.style.display = 'none';
        return;
    }
    if (removedCount === 0) {
        // Only show if dedup was enabled, to confirm it ran clean
        const dedupeCheck = document.getElementById('ptDedupeEnabled');
        if (!dedupeCheck?.checked) { el.style.display = 'none'; return; }
        text.textContent = 'Dedup ran — no duplicates found.';
        el.style.background = 'rgba(34,197,94,0.08)';
        el.style.borderColor = 'rgba(34,197,94,0.3)';
        el.querySelector('svg').setAttribute('stroke', '#22c55e');
    } else {
        text.textContent = `${removedCount} duplicate image(s) detected and removed.`;
        el.style.background = 'rgba(239,68,68,0.08)';
        el.style.borderColor = 'rgba(239,68,68,0.25)';
        el.querySelector('svg').setAttribute('stroke', '#ef4444');
    }
    el.style.display = '';
}

function _ptSetContentStats(stats, isDone = false) {
    const el   = document.getElementById('ptContentStats');
    const text = document.getElementById('ptContentStatsText');
    if (!el || !text) return;

    // Check if any content filter is actually enabled
    const personEnabled = document.getElementById('ptRequirePerson')?.checked;
    const faceEnabled   = document.getElementById('ptRequireFace')?.checked;
    if (!personEnabled && !faceEnabled) { el.style.display = 'none'; return; }

    if (!stats) {
        // Called with null — either reset or "ran clean" on done
        if (!isDone) { el.style.display = 'none'; return; }
        text.textContent = 'Content filter ran — all images passed.';
        el.style.background = 'rgba(34,197,94,0.08)';
        el.style.borderColor = 'rgba(34,197,94,0.3)';
        el.querySelector('svg').setAttribute('stroke', '#22c55e');
        el.style.display = '';
        return;
    }

    const { noPerson = 0, noFace = 0 } = stats;
    const total = noPerson + noFace;
    if (total === 0) {
        if (!isDone) { el.style.display = 'none'; return; }
        text.textContent = 'Content filter ran — all images passed.';
        el.style.background = 'rgba(34,197,94,0.08)';
        el.style.borderColor = 'rgba(34,197,94,0.3)';
        el.querySelector('svg').setAttribute('stroke', '#22c55e');
    } else {
        const parts = [];
        if (noPerson > 0) parts.push(`${noPerson} had no person`);
        if (noFace   > 0) parts.push(`${noFace} had no face`);
        text.textContent = `Content filter removed ${total} image(s): ${parts.join(', ')}.`;
        el.style.background = 'rgba(239,68,68,0.08)';
        el.style.borderColor = 'rgba(239,68,68,0.25)';
        el.querySelector('svg').setAttribute('stroke', '#ef4444');
    }
    el.style.display = '';
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initPinterest);

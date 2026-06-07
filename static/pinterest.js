/**
 * pinterest.js – Pinterest download + folder processing logic for Velvet Reverie.
 */

// ── State ────────────────────────────────────────────────────────────────────
// Download section
let pinterestCurrentJobId = null;
let pinterestPollTimer = null;
let pinterestDedupeEnabled = false;
let pinterestRequirePerson = false;
let pinterestRequireFace   = false;
// Process section
let ptProcessJobId     = null;
let ptProcessPollTimer = null;

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

    // Process folder section
    const processBtn = document.getElementById('ptProcessBtn');
    if (processBtn) processBtn.addEventListener('click', startPtProcessFolder);

    const procDedupeCheck = document.getElementById('ptProcDedupeEnabled');
    const procDedupeOpts  = document.getElementById('ptProcDedupeOptions');
    if (procDedupeCheck && procDedupeOpts) {
        procDedupeCheck.addEventListener('change', () => {
            procDedupeOpts.style.display = procDedupeCheck.checked ? '' : 'none';
        });
    }

    // Check cookies status, imagehash and YOLO availability on load
    checkPinterestCookies();
    _ptCheckDedupeAvailability();
    _ptCheckYoloAvailability();
    ptRefreshFolders();
    ptRefreshBatchFolders();
}

// ── YOLO availability check ──────────────────────────────────────────────────
async function _ptCheckYoloAvailability() {
    try {
        const res = await fetch('/api/pinterest/yolo-available');
        if (!res.ok) return;
        const data = await res.json();
        const unavailable = !data.available;
        // Download section badge
        const badge = document.getElementById('ptYoloBadge');
        if (badge) {
            if (unavailable) {
                badge.textContent = 'ultralytics not installed — content filter disabled';
                badge.className = 'pt-badge pt-badge-warn';
                badge.style.display = '';
                ['ptRequirePerson', 'ptRequireFace'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.disabled = true;
                });
            } else { badge.style.display = 'none'; }
        }
        // Process section badge
        const procBadge = document.getElementById('ptProcYoloBadge');
        if (procBadge) {
            if (unavailable) {
                procBadge.textContent = 'ultralytics not installed — content filter disabled';
                procBadge.className = 'pt-badge pt-badge-warn';
                procBadge.style.display = '';
                ['ptProcRequirePerson', 'ptProcRequireFace'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.disabled = true;
                });
            } else { procBadge.style.display = 'none'; }
        }
    } catch (_) { /* Suppress silently */ }
}

// ── Dedup availability check ─────────────────────────────────────────────────
async function _ptCheckDedupeAvailability() {
    try {
        const res = await fetch('/api/pinterest/dedup-available');
        if (!res.ok) return;
        const data = await res.json();
        const unavailable = !data.available;
        // Download section badge
        const badge = document.getElementById('ptDedupeBadge');
        if (badge) {
            if (unavailable) {
                badge.textContent = 'imagehash not installed — dedup disabled';
                badge.className = 'pt-badge pt-badge-warn';
                badge.style.display = '';
                const check = document.getElementById('ptDedupeEnabled');
                if (check) check.disabled = true;
            } else { badge.style.display = 'none'; }
        }
        // Process section badge
        const procBadge = document.getElementById('ptProcDedupeBadge');
        if (procBadge) {
            if (unavailable) {
                procBadge.textContent = 'imagehash not installed — dedup disabled';
                procBadge.className = 'pt-badge pt-badge-warn';
                procBadge.style.display = '';
                const check2 = document.getElementById('ptProcDedupeEnabled');
                if (check2) check2.disabled = true;
            } else { procBadge.style.display = 'none'; }
        }
    } catch (_) { /* Suppress silently */ }
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
    _ptSetScrapeState('running');
    _ptSetLog([]);
    _ptSetProgress(0, num);
    _ptSetDedupStats(null);
    _ptSetContentStats(null);

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
        } else if (data.status === 'error') {
            clearInterval(pinterestPollTimer);
            _ptSetScrapeState('error');
            showNotification('Scrape failed: ' + (data.error || 'unknown error'), 'Pinterest Error', 'error', 6000);
        }
    } catch (e) {
        // network blip — keep polling
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

// ── Open in Batch ────────────────────────────────────────────────────────────
/**
 * Populate the "Open in Batch" folder dropdown — reuses the same API endpoint
 * as the Process section but targets a separate <select> element.
 */
async function ptRefreshBatchFolders() {
    const sel = document.getElementById('ptBatchFolder');
    if (!sel) return;
    try {
        const res = await fetch('/api/pinterest/list-folders');
        if (!res.ok) return;
        const data = await res.json();
        const prev = sel.value;
        sel.innerHTML = '<option value="">&mdash; choose a folder &mdash;</option>';
        (data.folders || []).forEach(f => {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            if (f === prev) opt.selected = true;
            sel.appendChild(opt);
        });
        if (!data.folders || data.folders.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.disabled = true;
            opt.textContent = 'No folders found in input/pinterest/';
            sel.appendChild(opt);
        }
    } catch (_) { /* Suppress silently */ }
}

/**
 * Set the selected folder on the Image Batch tab and switch to it.
 * Pinterest folders live at input/pinterest/<name>, so the subpath is
 * "pinterest/<name>" (matching how the image browser sets selectedImageBatchFolder).
 */
function ptOpenInImageBatch() {
    const folderName = document.getElementById('ptBatchFolder')?.value || '';
    if (!folderName) {
        showNotification('Select a folder first', 'Error', 'error', 3000);
        return;
    }
    const subpath = 'pinterest/' + folderName;
    // Set the Image Batch selected folder (global defined in script.js)
    selectedImageBatchFolder = subpath;
    const display = document.getElementById('imageBatchFolderDisplay');
    if (display) display.textContent = subpath;
    // Auto-fill output folder to match the pinterest folder name
    const outFolder = document.getElementById('imageBatchSubfolder');
    if (outFolder) outFolder.value = 'pinterest/' + folderName;
    switchTab('image-batch');
    showNotification('Folder "' + folderName + '" loaded in Image Batch', 'Image Batch', 'success', 3000);
}

/**
 * Set the selected folder on the Video Batch tab and switch to it.
 */
function ptOpenInVideoBatch() {
    const folderName = document.getElementById('ptBatchFolder')?.value || '';
    if (!folderName) {
        showNotification('Select a folder first', 'Error', 'error', 3000);
        return;
    }
    const subpath = 'pinterest/' + folderName;
    // Set the Video Batch selected folder (global defined in script.js)
    selectedVideoBatchFolder = subpath;
    const display = document.getElementById('videoBatchFolderDisplay');
    if (display) display.textContent = subpath;
    // Auto-fill output folder to match the pinterest folder name
    const outFolder = document.getElementById('videoBatchSubfolder');
    if (outFolder) outFolder.value = 'pinterest/' + folderName;
    switchTab('video-batch');
    showNotification('Folder "' + folderName + '" loaded in Video Batch', 'Video Batch', 'success', 3000);
}

// ── Folder list ───────────────────────────────────────────────────────────────
async function ptRefreshFolders() {
    const sel = document.getElementById('ptProcessFolder');
    if (!sel) return;
    try {
        const res = await fetch('/api/pinterest/list-folders');
        if (!res.ok) return;
        const data = await res.json();
        const prev = sel.value;
        sel.innerHTML = '<option value="">— choose a folder —</option>';
        (data.folders || []).forEach(f => {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            if (f === prev) opt.selected = true;
            sel.appendChild(opt);
        });
        if (!data.folders || data.folders.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.disabled = true;
            opt.textContent = 'No folders found in input/pinterest/';
            sel.appendChild(opt);
        }
    } catch (_) { /* Suppress silently */ }
}

// ── Process existing folder ────────────────────────────────────────────────
async function startPtProcessFolder() {
    const folderName = document.getElementById('ptProcessFolder')?.value || '';
    if (!folderName) {
        showNotification('Select a folder first', 'Error', 'error', 3000);
        return;
    }
    const dedup         = document.getElementById('ptProcDedupeEnabled')?.checked || false;
    const dedupeBase    = (document.getElementById('ptProcDedupeBaseFolder')?.value || '').trim();
    const requirePerson = document.getElementById('ptProcRequirePerson')?.checked || false;
    const requireFace   = document.getElementById('ptProcRequireFace')?.checked || false;

    if (!dedup && !requirePerson && !requireFace) {
        showNotification('Enable at least one operation (dedup or content filter)', 'Error', 'error', 3000);
        return;
    }

    _ptSetProcessState('running');
    _ptSetProcessLog([]);
    _ptSetProcessProgress(0, 0);
    _ptSetProcessStats(null, null);

    try {
        const res = await fetch('/api/pinterest/process-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folder_name: folderName,
                dedup,
                dedup_base_folder: dedupeBase || null,
                require_person: requirePerson,
                require_face: requireFace,
            }),
        });
        const data = await res.json();
        if (!data.success) {
            _ptSetProcessState('idle');
            showNotification(data.error, 'Error', 'error', 5000);
            return;
        }
        ptProcessJobId = data.job_id;
        _ptStartProcessPolling();
    } catch (e) {
        _ptSetProcessState('idle');
        showNotification('Request failed: ' + e.message, 'Error', 'error', 5000);
    }
}

function _ptStartProcessPolling() {
    if (ptProcessPollTimer) clearInterval(ptProcessPollTimer);
    ptProcessPollTimer = setInterval(_ptProcessPoll, 1500);
}

async function _ptProcessPoll() {
    if (!ptProcessJobId) { clearInterval(ptProcessPollTimer); return; }
    try {
        const res  = await fetch(`/api/pinterest/job/${ptProcessJobId}`);
        const data = await res.json();
        if (!data.success) return;

        _ptSetProcessLog(data.log || []);
        _ptSetProcessProgress(data.progress || 0, data.num_requested || 0);

        if (data.status === 'done') {
            clearInterval(ptProcessPollTimer);
            _ptSetProcessState('idle');
            const kept     = data.downloaded ?? 0;
            const dupes    = data.dupes_removed || 0;
            const noPerson = data.no_person_removed || 0;
            const noFace   = data.no_face_removed || 0;
            const cfTotal  = noPerson + noFace;
            _ptSetProcessStats(dupes, { noPerson, noFace });
            const parts = [];
            if (dupes > 0)   parts.push(`${dupes} dupe(s) removed`);
            if (cfTotal > 0) parts.push(`${cfTotal} filtered by content`);
            const msg = parts.length
                ? `${kept} image(s) kept · ${parts.join(' · ')}`
                : `Done — ${kept} image(s) remain in folder`;
            showNotification(msg, 'Done', 'success', 4000);
        } else if (data.status === 'error') {
            clearInterval(ptProcessPollTimer);
            _ptSetProcessState('idle');
            showNotification('Processing failed: ' + (data.error || 'unknown error'), 'Error', 'error', 6000);
        }
    } catch (_) { /* network blip — keep polling */ }
}

// ── Process section UI helpers ─────────────────────────────────────────────
function _ptSetProcessState(state) {
    const btn       = document.getElementById('ptProcessBtn');
    const indicator = document.getElementById('ptProcessIndicator');
    if (!btn) return;
    if (state === 'running') {
        btn.disabled = true;
        btn.querySelector('span').textContent = 'Processing…';
        if (indicator) indicator.style.display = '';
    } else {
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Run Processing';
        if (indicator) indicator.style.display = 'none';
    }
}

function _ptSetProcessProgress(done, total) {
    const bar   = document.getElementById('ptProcessProgressBar');
    const label = document.getElementById('ptProcessProgressLabel');
    if (!bar) return;
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    bar.style.width = pct + '%';
    if (label) label.textContent = total > 0 ? `${done} / ${total}` : '';
}

function _ptSetProcessLog(lines) {
    const el = document.getElementById('ptProcessLog');
    if (!el) return;
    el.textContent = lines.join('\n');
    el.scrollTop = el.scrollHeight;
}

function _ptSetProcessStats(dupesRemoved, cfStats) {
    // Dedup stat box
    const dedupEl   = document.getElementById('ptProcessDedupStats');
    const dedupText = document.getElementById('ptProcessDedupStatsText');
    if (dedupEl && dedupText) {
        if (dupesRemoved === null || dupesRemoved === undefined) {
            dedupEl.style.display = 'none';
        } else if (dupesRemoved === 0) {
            dedupText.textContent = 'Dedup ran — no duplicates found.';
            dedupEl.style.background = 'rgba(34,197,94,0.08)';
            dedupEl.style.borderColor = 'rgba(34,197,94,0.3)';
            dedupEl.querySelector('svg').setAttribute('stroke', '#22c55e');
            dedupEl.style.display = '';
        } else {
            dedupText.textContent = `${dupesRemoved} duplicate image(s) detected and removed.`;
            dedupEl.style.background = 'rgba(239,68,68,0.08)';
            dedupEl.style.borderColor = 'rgba(239,68,68,0.25)';
            dedupEl.querySelector('svg').setAttribute('stroke', '#ef4444');
            dedupEl.style.display = '';
        }
    }
    // Content filter stat box
    const cfEl   = document.getElementById('ptProcessContentStats');
    const cfText = document.getElementById('ptProcessContentStatsText');
    if (cfEl && cfText) {
        const personEnabled = document.getElementById('ptProcRequirePerson')?.checked;
        const faceEnabled   = document.getElementById('ptProcRequireFace')?.checked;
        if (!cfStats || (!personEnabled && !faceEnabled)) {
            cfEl.style.display = 'none';
        } else {
            const { noPerson = 0, noFace = 0 } = cfStats;
            const total = noPerson + noFace;
            if (total === 0) {
                cfText.textContent = 'Content filter ran — all images passed.';
                cfEl.style.background = 'rgba(34,197,94,0.08)';
                cfEl.style.borderColor = 'rgba(34,197,94,0.3)';
                cfEl.querySelector('svg').setAttribute('stroke', '#22c55e');
            } else {
                const parts = [];
                if (noPerson > 0) parts.push(`${noPerson} had no person`);
                if (noFace   > 0) parts.push(`${noFace} had no face`);
                cfText.textContent = `Content filter removed ${total} image(s): ${parts.join(', ')}.`;
                cfEl.style.background = 'rgba(239,68,68,0.08)';
                cfEl.style.borderColor = 'rgba(239,68,68,0.25)';
                cfEl.querySelector('svg').setAttribute('stroke', '#ef4444');
            }
            cfEl.style.display = '';
        }
    }
}

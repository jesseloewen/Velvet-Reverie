// Velvet Reverie - Browser: image browser, video browser, viewer, fullscreen, gallery
// ============================================================================
// IMAGE BROWSER
// ============================================================================

// Input image toggle state
let showingInputImage = false;
let showingVideoInputImage = false;
let currentInputImagePath = null;
let matchSizesEnabled = false;
let cachedImageDimensions = {};

// Browser last-loaded tracking lives in core.js (browserLastLoadedPath, browserLastLoadedAt, etc.)

// ─── Image dimension helpers ────────────────────────────────────────────────

async function getImageDimensions(src) {
    if (cachedImageDimensions[src]) {
        return cachedImageDimensions[src];
    }
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const dimensions = { width: img.naturalWidth, height: img.naturalHeight };
            cachedImageDimensions[src] = dimensions;
            resolve(dimensions);
        };
        img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        img.src = src;
    });
}

async function calculateMatchedSize(outputSrc, inputSrc) {
    try {
        const [outputDims, inputDims] = await Promise.all([
            getImageDimensions(outputSrc),
            getImageDimensions(inputSrc)
        ]);
        const maxWidth  = Math.max(outputDims.width,  inputDims.width);
        const maxHeight = Math.max(outputDims.height, inputDims.height);
        return { width: maxWidth, height: maxHeight };
    } catch (error) {
        console.error('Error calculating matched size:', error);
        return null;
    }
}

// Image Browser Functions
let imageBrowserMode = 'single'; // 'single' | 'batch' | 'image-batch' | 'frame-edit' | 'stitch'
let currentBrowserFolder = 'input'; // 'input' or 'output'
let currentBrowserSubpath = ''; // Current subfolder path
let selectedImageBatchFolder = '';
let selectedVideoBatchFolder = '';

// Video Browser Functions
let currentVideoBrowserFolder = 'input'; // 'input' or 'output'
let currentVideoBrowserSubpath = ''; // Current subfolder path

function ensureLoadingOverlay(containerId, overlayId) {
    const container = document.getElementById(containerId);
    if (!container || !container.parentElement) return null;

    const host = container.parentElement;
    host.classList.add('media-loading-host');

    let overlay = document.getElementById(overlayId);
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.className = 'media-loading-overlay';
        overlay.innerHTML = `
            <span class="media-loading-spinner" aria-hidden="true"></span>
            <span class="media-loading-text">Loading...</span>
        `;
        overlay.style.display = 'none';
        host.appendChild(overlay);
    }

    return overlay;
}

function setLoadingOverlay(containerId, overlayId, isLoading, message = 'Loading...') {
    const container = document.getElementById(containerId);
    const overlay = ensureLoadingOverlay(containerId, overlayId);
    if (!container || !overlay) return;

    const textEl = overlay.querySelector('.media-loading-text');
    if (textEl) {
        textEl.textContent = message;
    }

    overlay.style.display = isLoading ? 'flex' : 'none';
    container.setAttribute('aria-busy', isLoading ? 'true' : 'false');
}

function ensureBrowserTopLoadingStatus(containerId, statusId) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    let status = document.getElementById(statusId);
    if (!status) {
        status = document.createElement('span');
        status.id = statusId;
        status.className = 'browser-top-loading-status';
        status.innerHTML = `
            <span class="browser-top-loading-spinner" aria-hidden="true"></span>
            <span class="browser-top-loading-text">Loading...</span>
        `;
        status.style.display = 'none';
        container.appendChild(status);
    }

    return status;
}

function setBrowserTopLoadingStatus(containerId, statusId, isLoading, message = 'Loading...') {
    const status = ensureBrowserTopLoadingStatus(containerId, statusId);
    if (!status) return;

    const textEl = status.querySelector('.browser-top-loading-text');
    if (textEl) {
        textEl.textContent = message;
    }

    status.style.display = isLoading ? 'inline-flex' : 'none';
}

const SESSION_BROWSER_COUNT_CACHE_KEY = 'velvet.browser.counts.v1';
let sessionBrowserCountCache = null;

function loadSessionBrowserCountCache() {
    if (sessionBrowserCountCache) {
        return sessionBrowserCountCache;
    }

    try {
        const raw = sessionStorage.getItem(SESSION_BROWSER_COUNT_CACHE_KEY);
        if (!raw) {
            sessionBrowserCountCache = {};
            return sessionBrowserCountCache;
        }

        const parsed = JSON.parse(raw);
        sessionBrowserCountCache = parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_error) {
        sessionBrowserCountCache = {};
    }

    return sessionBrowserCountCache;
}

function saveSessionBrowserCountCache() {
    if (!sessionBrowserCountCache) {
        return;
    }

    try {
        sessionStorage.setItem(SESSION_BROWSER_COUNT_CACHE_KEY, JSON.stringify(sessionBrowserCountCache));
    } catch (_error) {
        // Ignore storage failures (private mode / quota)
    }
}

function normalizeBrowserCountPath(path) {
    return String(path || '').replace(/\\/g, '/').trim();
}

function buildSessionBrowserCountKey(scope, path) {
    return `${scope}::${normalizeBrowserCountPath(path)}`;
}

function getSessionCachedBrowserCount(scope, path) {
    const cache = loadSessionBrowserCountCache();
    const key = buildSessionBrowserCountKey(scope, path);
    const entry = cache[key];

    if (!entry || !Number.isInteger(entry.count)) {
        return null;
    }

    return entry.count;
}

function setSessionCachedBrowserCount(scope, path, count) {
    if (!Number.isInteger(count) || count < 0) {
        return;
    }

    const cache = loadSessionBrowserCountCache();
    const key = buildSessionBrowserCountKey(scope, path);
    cache[key] = {
        count,
        updated_at: Date.now()
    };
    sessionBrowserCountCache = cache;
    saveSessionBrowserCountCache();
}

function buildSessionBrowserFolderCountKey(scope, path) {
    return `folders::${scope}::${normalizeBrowserCountPath(path)}`;
}

function extractFolderCountSnapshot(folderData) {
    if (!folderData || typeof folderData !== 'object') {
        return null;
    }

    const snapshot = {};
    const keys = ['item_count', 'folder_count', 'image_count', 'video_count', 'audio_count'];
    keys.forEach(key => {
        if (Number.isInteger(folderData[key])) {
            snapshot[key] = folderData[key];
        }
    });

    return Object.keys(snapshot).length > 0 ? snapshot : null;
}

function getSessionCachedFolderCount(scope, path) {
    const cache = loadSessionBrowserCountCache();
    const key = buildSessionBrowserFolderCountKey(scope, path);
    const entry = cache[key];

    if (!entry || typeof entry !== 'object') {
        return null;
    }

    const snapshot = extractFolderCountSnapshot(entry);
    return snapshot || null;
}

function setSessionCachedFolderCount(scope, path, folderData) {
    const snapshot = extractFolderCountSnapshot(folderData);
    if (!snapshot) {
        return;
    }

    const cache = loadSessionBrowserCountCache();
    const key = buildSessionBrowserFolderCountKey(scope, path);
    cache[key] = {
        ...snapshot,
        updated_at: Date.now()
    };
    sessionBrowserCountCache = cache;
    saveSessionBrowserCountCache();
}

function rememberSessionFolderCounts(scope, folders) {
    (folders || []).forEach(folder => {
        const folderPath = normalizeBrowserCountPath(folder?.path);
        if (!folderPath) {
            return;
        }
        setSessionCachedFolderCount(scope, folderPath, folder);
    });
}

function mergeFolderCountsFromSession(scope, folders) {
    return (folders || []).map(folder => {
        const folderPath = normalizeBrowserCountPath(folder?.path);
        if (!folderPath) {
            return folder;
        }

        const cached = getSessionCachedFolderCount(scope, folderPath);
        if (!cached) {
            return folder;
        }

        return {
            ...folder,
            ...cached
        };
    });
}

function countImagesInFileList(files) {
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];
    const audioExtensions = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma'];
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];

    return (files || []).filter(file => {
        const filename = typeof file === 'string' ? file : (file?.filename || file?.path || '');
        const ext = String(filename).toLowerCase().slice(String(filename).lastIndexOf('.'));
        return imageExtensions.includes(ext) && !audioExtensions.includes(ext) && !videoExtensions.includes(ext);
    }).length;
}

function countVideosInFileList(files) {
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];

    return (files || []).filter(file => {
        const filename = typeof file === 'string' ? file : (file?.filename || file?.path || '');
        const ext = String(filename).toLowerCase().slice(String(filename).lastIndexOf('.'));
        return videoExtensions.includes(ext);
    }).length;
}

function openImageBrowser(mode) {
    console.log('openImageBrowser called with mode:', mode);
    imageBrowserMode = mode;
    const modal = document.getElementById('imageBrowserModal');
    console.log('Image browser modal element:', modal);
    if (!modal) {
        console.error('Image browser modal not found!');
        return;
    }
    
    // Update modal title based on mode
    const modalTitle = modal.querySelector('h3');
    if (modalTitle) {
        if (mode === 'image-batch' || mode === 'video-batch') {
            modalTitle.textContent = 'Choose Input Folder';
        } else {
            modalTitle.textContent = 'Browse Images';
        }
    }
    
    modal.style.display = 'flex';
    console.log('Modal display set to flex');

    // Reopen where the browser was last used in this page session.
    const targetFolder = currentBrowserFolder || 'input';
    const targetSubpath = currentBrowserSubpath || '';
    loadImageBrowserFolder(targetFolder, targetSubpath);
}

// ============================================================================
// VIDEO BROWSER MODAL
// ============================================================================

function openVideoBrowser() {
    currentVideoBrowserSubpath = ''; // Reset to root
    const modal = document.getElementById('videoBrowserModal');
    if (!modal) {
        console.error('Video browser modal not found!');
        return;
    }
    
    modal.style.display = 'flex';
    
    // Show grid view, hide preview
    const gridView = document.getElementById('videoBrowserGridView');
    const previewContainer = document.getElementById('videoPreviewContainer');
    if (gridView) gridView.style.display = 'flex';
    if (previewContainer) previewContainer.style.display = 'none';
    
    // Setup tab listeners
    const tabs = modal.querySelectorAll('.video-browser-tab');
    tabs.forEach(tab => {
        tab.onclick = () => {
            const folder = tab.dataset.folder;
            loadVideoBrowserFolder(folder, '');
        };
    });
    
    // Setup close button for grid view
    const closeBtn = document.getElementById('closeVideoBrowserBtn');
    if (closeBtn) {
        closeBtn.onclick = closeVideoBrowser;
    }
    
    // Setup close button for preview view
    const closePreviewBtn = document.getElementById('closeVideoPreviewBtn');
    if (closePreviewBtn) {
        closePreviewBtn.onclick = closeVideoBrowser;
    }
    
    // Setup back button
    const backBtn = document.getElementById('backToVideosGridBtn');
    if (backBtn) {
        backBtn.onclick = () => {
            // Hide preview, show grid
            if (previewContainer) previewContainer.style.display = 'none';
            if (gridView) gridView.style.display = 'flex';
            
            // Unload video
            if (window.videoPreviewPlayer) {
                window.videoPreviewPlayer.unloadVideo();
            }
        };
    }
    
    // Load input folder by default
    loadVideoBrowserFolder('input', '');
}

function closeVideoBrowser() {
    const modal = document.getElementById('videoBrowserModal');
    const videoPreviewContainer = document.getElementById('videoPreviewContainer');
    const gridView = document.getElementById('videoBrowserGridView');
    
    // Unload video to save bandwidth
    if (window.videoPreviewPlayer) {
        window.videoPreviewPlayer.unloadVideo();
    }
    
    // Reset views to default state
    if (videoPreviewContainer) videoPreviewContainer.style.display = 'none';
    if (gridView) gridView.style.display = 'flex';
    
    modal.style.display = 'none';
}

async function loadVideoBrowserFolder(folder, subpath) {
    const requestToken = ++videoBrowserRequestToken;
    currentVideoBrowserFolder = folder;
    currentVideoBrowserSubpath = subpath || '';
    let quickRenderCompleted = false;
    
    // Update tab active state
    document.querySelectorAll('.video-browser-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.folder === folder) {
            tab.classList.add('active');
        }
    });

    setLoadingOverlay('videoBrowserGrid', 'videoBrowserGridLoadingOverlay', true, 'Loading videos...');
    setBrowserTopLoadingStatus('videoBrowserPath', 'videoBrowserPathLoadingStatus', true, 'Loading folder...');

    if (videoBrowserAbortController) {
        videoBrowserAbortController.abort();
    }
    videoBrowserAbortController = new AbortController();
    
    try {
        // For output folder, default to 'videos' subfolder if at root
        let effectiveSubpath = subpath;
        if (folder === 'output' && !subpath) {
            effectiveSubpath = 'videos';
        }
        const resolvedSubpath = effectiveSubpath || subpath || '';
        const countCacheScope = `modal-video:${folder}`;
        const folderCountCacheScope = `modal-video-folders:${folder}`;
        const cachedCount = getSessionCachedBrowserCount(countCacheScope, resolvedSubpath);

        // Render path immediately (using cached count when available), then progressively fill details.
        renderVideoBrowserPath(folder, resolvedSubpath, cachedCount);

        // Quick fetch: no recursive counts and no metadata join for output.
        const quickEndpoint = folder === 'input'
            ? `/api/browse_images?folder=input&path=${encodeURIComponent(subpath)}&with_counts=0`
            : `/api/browse?path=${encodeURIComponent(effectiveSubpath)}&with_counts=0&with_metadata=0`;

        const quickResponse = await fetch(quickEndpoint, { signal: videoBrowserAbortController.signal });
        const quickData = await quickResponse.json();

        if (requestToken !== videoBrowserRequestToken) {
            return;
        }

        if (quickData.success === false) {
            throw new Error(quickData.error || 'Failed to load videos');
        }

        const quickVideoCount = Number.isInteger(quickData.current_counts?.videos)
            ? quickData.current_counts.videos
            : countVideosInFileList(folder === 'input' ? (quickData.images || []) : (quickData.files || []));
        setSessionCachedBrowserCount(countCacheScope, resolvedSubpath, quickVideoCount);
        renderVideoBrowserPath(folder, resolvedSubpath, quickVideoCount);

        // Get folders and files from response
        const folders = mergeFolderCountsFromSession(folderCountCacheScope, quickData.folders || []);
        // For input folder, browse_images returns image objects with {filename, path, mtime}
        // For output folder, browse returns file metadata objects
        const files = folder === 'input' ? (quickData.images || []) : (quickData.files || []);
        
        // Filter to only show videos
        const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
        const videoFiles = files.filter(file => {
            // Handle both string and object formats
            const filename = typeof file === 'string' ? file : (file.filename || file.path || '');
            const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
            return videoExtensions.includes(ext);
        });
        
        // Render folders and videos immediately.
        renderVideoBrowserGrid(folders, videoFiles);
        quickRenderCompleted = true;
        setLoadingOverlay('videoBrowserGrid', 'videoBrowserGridLoadingOverlay', false);

        // Background fetch: enrich folder counts and top count while thumbnails are already visible.
        setBrowserTopLoadingStatus('videoBrowserPath', 'videoBrowserPathLoadingStatus', true, 'Loading details...');
        const detailsEndpoint = folder === 'input'
            ? `/api/browse_images?folder=input&path=${encodeURIComponent(subpath)}&with_counts=1`
            : `/api/browse?path=${encodeURIComponent(effectiveSubpath)}&with_counts=1&with_metadata=0`;

        const detailsResponse = await fetch(detailsEndpoint, { signal: videoBrowserAbortController.signal });
        const detailsData = await detailsResponse.json();

        if (requestToken !== videoBrowserRequestToken) {
            return;
        }

        if (detailsData.success === false) {
            throw new Error(detailsData.error || 'Failed to load video details');
        }

        const detailsVideoCount = Number.isInteger(detailsData.current_counts?.videos)
            ? detailsData.current_counts.videos
            : countVideosInFileList(folder === 'input' ? (detailsData.images || []) : (detailsData.files || []));
        setSessionCachedBrowserCount(countCacheScope, resolvedSubpath, detailsVideoCount);
        renderVideoBrowserPath(folder, resolvedSubpath, detailsVideoCount);
        const detailsFolders = detailsData.folders || [];
        rememberSessionFolderCounts(folderCountCacheScope, detailsFolders);
        // Only patch folder counts – do NOT re-render the grid with metadata-free files.
        updateRenderedFolderCounts(detailsFolders);
    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }
        console.error('Error loading video browser folder:', error);
        if (!quickRenderCompleted) {
            showNotification('Error loading videos', 'Error', 'error');
        }
    } finally {
        if (requestToken === videoBrowserRequestToken) {
            setLoadingOverlay('videoBrowserGrid', 'videoBrowserGridLoadingOverlay', false);
            setBrowserTopLoadingStatus('videoBrowserPath', 'videoBrowserPathLoadingStatus', false);
            videoBrowserAbortController = null;
        }
    }
}

function renderVideoBrowserPath(folder, subpath, currentVideoCount = null) {
    const pathDisplay = document.getElementById('videoBrowserPathText');
    if (!pathDisplay) return;

    const hasCount = Number.isInteger(currentVideoCount);
    const countLabel = hasCount ? ` (${currentVideoCount} ${currentVideoCount === 1 ? 'video' : 'videos'})` : '';
    
    // Build path display similar to image browser
    const folderName = folder === 'input' ? 'Input' : 'Output';
    
    if (!subpath) {
        // At root of selected folder
        pathDisplay.textContent = `${folderName}${countLabel}`;
    } else {
        // In a subfolder
        // For output folder, remove 'videos' prefix from display if present
        let displayPath = subpath;
        if (folder === 'output' && displayPath.startsWith('videos/')) {
            displayPath = displayPath.substring(7); // Remove 'videos/'
        } else if (folder === 'output' && displayPath === 'videos') {
            displayPath = '';
        }
        
        if (displayPath) {
            pathDisplay.textContent = `${folderName} / ${displayPath.replace(/\//g, ' / ')}${countLabel}`;
        } else {
            pathDisplay.textContent = `${folderName}${countLabel}`;
        }
    }
}

function renderVideoBrowserGrid(folders, videos) {
    const grid = document.getElementById('videoBrowserGrid');
    if (!grid) return;
    
    let html = '';
    
    // Show parent folder navigation if in subfolder
    // For output folder, don't show back button if we're at 'videos' folder (our root)
    const isAtRoot = currentVideoBrowserFolder === 'output' 
        ? (currentVideoBrowserSubpath === 'videos' || !currentVideoBrowserSubpath) 
        : !currentVideoBrowserSubpath;
    
    if (currentVideoBrowserSubpath && !isAtRoot) {
        const parentPath = currentVideoBrowserSubpath.split(/[/\\]/).slice(0, -1).join('/');
        // For output folder, if parent would be empty, go to 'videos' instead
        const effectiveParent = (currentVideoBrowserFolder === 'output' && !parentPath) ? 'videos' : parentPath;
        
        // Escape for JavaScript string (single quotes and backslashes)
        const jsEscapedPath = effectiveParent.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        
        html += `
            <div class="gallery-item folder-item" onclick="loadVideoBrowserFolder('${currentVideoBrowserFolder}', '${jsEscapedPath}')" style="cursor: pointer;">
                <div class="folder-icon" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 150px; background: var(--bg-tertiary); border-radius: 4px;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 12H5M12 19l-7-7 7-7"></path>
                    </svg>
                    <span style="margin-top: 0.5rem; font-size: 0.875rem;">..</span>
                </div>
            </div>
        `;
    }
    
    // Show folders
    folders.forEach(folderItem => {
        // Handle both string (folder name) and object (with name and path) formats
        const folderName = typeof folderItem === 'string' ? folderItem : (folderItem.name || folderItem);
        const folderPath = typeof folderItem === 'object' && folderItem.path 
            ? folderItem.path 
            : (currentVideoBrowserSubpath ? `${currentVideoBrowserSubpath}/${folderName}` : folderName);
        const fallbackVideoCount = typeof folderItem === 'object' && Number.isInteger(folderItem.video_count)
            ? folderItem.video_count
            : null;
        const folderLabel = typeof folderItem === 'object'
            ? formatBrowserFolderLabel(folderName, folderItem, fallbackVideoCount)
            : folderName;
        
        // Escape for JavaScript string (single quotes and backslashes)
        const jsEscapedPath = folderPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        
        html += `
            <div class="gallery-item folder-item" data-path="${escapeHtml(folderPath)}" onclick="loadVideoBrowserFolder('${currentVideoBrowserFolder}', '${jsEscapedPath}')" style="cursor: pointer;">
                <div class="folder-icon" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 150px; background: var(--bg-tertiary); border-radius: 4px;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span style="margin-top: 0.5rem; font-size: 0.875rem; text-align: center; word-break: break-word;">${escapeHtml(folderLabel)}</span>
                </div>
            </div>
        `;
    });
    
    // Show videos
    videos.forEach(video => {
        // Handle multiple formats:
        // - String (simple filename)
        // - Object from browse_images: {filename, path, mtime}
        // - Object from browse: {filename, path, relative_path, ...metadata}
        let filename, relativePath;
        
        if (typeof video === 'string') {
            filename = video;
            relativePath = currentVideoBrowserSubpath ? `${currentVideoBrowserSubpath}/${filename}` : filename;
        } else {
            filename = video.filename || video.path || '';
            // For output folder, use relative_path (relative to OUTPUT_DIR, doesn't include "outputs")
            // For input folder, use path field which has relative path from input root
            if (currentVideoBrowserFolder === 'output') {
                relativePath = video.relative_path || video.path || filename;
            } else {
                relativePath = video.path || filename;
            }
        }
        
        // Escape for JavaScript string (single quotes and backslashes)
        const jsEscapedPath = relativePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        
        // Construct video URL for thumbnail
        const videoUrl = currentVideoBrowserFolder === 'output' 
            ? `/outputs/${relativePath}` 
            : `/api/video/${encodeURIComponent(relativePath)}`;
        
        html += `
            <div class="gallery-item video-hover-preview" onclick="previewVideoBrowserVideo('${jsEscapedPath}', '${currentVideoBrowserFolder}')" style="cursor: pointer; position: relative;">
                <div style="position: relative; width: 100%; padding-top: 75%; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden;">
                    <img 
                        src="/api/thumbnail/${relativePath}"
                        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; background: var(--bg-secondary);"
                        loading="lazy"
                        onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
                    >
                    <video 
                        src="${videoUrl}" 
                        preload="none"
                        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; background: var(--bg-secondary); display: none;"
                        muted
                        playsinline
                        loop
                    ></video>
                    <div class="video-card-play-overlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.3); transition: opacity 0.15s ease;">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" style="opacity: 0.9;">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                    </div>
                </div>
                <div style="margin-top: 0.5rem; font-size: 0.875rem; text-align: center; word-break: break-word;">${escapeHtml(filename)}</div>
            </div>
        `;
    });
    
    if (folders.length === 0 && videos.length === 0) {
        html = '<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 2rem;">No videos found in this folder</div>';
    }
    
    grid.innerHTML = html;
    bindVideoHoverPreviews(grid);
}

const MOBILE_PREVIEW_HOLD_MS = 180;
let activeVideoPreviewCard = null;

function startVideoHoverPreview(cardElement) {
    if (!cardElement || cardElement.dataset.alwaysPlay === 'true') return;

    if (activeVideoPreviewCard && activeVideoPreviewCard !== cardElement) {
        stopVideoHoverPreview(activeVideoPreviewCard);
    }

    const imageElement = cardElement.querySelector('img');
    const videoElement = cardElement.querySelector('video');
    const overlayElement = cardElement.querySelector('.video-card-play-overlay');
    if (!videoElement) return;

    if (imageElement) {
        imageElement.style.display = 'none';
    }

    videoElement.style.display = 'block';
    videoElement.loop = true;
    if (overlayElement) {
        overlayElement.style.opacity = '0';
    }

    const playPromise = videoElement.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
            // Ignore autoplay errors; preview will still show first frame when available.
        });
    }

    activeVideoPreviewCard = cardElement;
}

function stopVideoHoverPreview(cardElement) {
    if (!cardElement || cardElement.dataset.alwaysPlay === 'true') return;

    const imageElement = cardElement.querySelector('img');
    const videoElement = cardElement.querySelector('video');
    const overlayElement = cardElement.querySelector('.video-card-play-overlay');
    if (!videoElement) return;

    videoElement.pause();
    videoElement.currentTime = 0;

    const hasThumbnail = imageElement && imageElement.naturalWidth > 0;
    if (hasThumbnail) {
        videoElement.style.display = 'none';
        imageElement.style.display = 'block';
    } else {
        videoElement.style.display = 'block';
    }

    if (overlayElement) {
        overlayElement.style.opacity = '1';
    }

    if (activeVideoPreviewCard === cardElement) {
        activeVideoPreviewCard = null;
    }
}

function stopActiveVideoPreview() {
    if (activeVideoPreviewCard) {
        stopVideoHoverPreview(activeVideoPreviewCard);
    }
}

function setVideosGridPlaybackMode(enabled) {
    videosPlayEnabled = Boolean(enabled);
    localStorage.setItem('videosPlayEnabled', videosPlayEnabled ? 'true' : 'false');

    const grid = document.getElementById('videosGrid');
    if (!grid) return;

    applyVideosGridPlaybackMode(grid);
}

function applyVideosGridPlaybackMode(gridElement) {
    if (!gridElement) return;

    if (videosPlayEnabled) {
        activeVideoPreviewCard = null;
    }

    const previewCards = gridElement.querySelectorAll('.video-hover-preview');
    previewCards.forEach(cardElement => {
        cardElement.dataset.alwaysPlay = videosPlayEnabled ? 'true' : 'false';
    });

    if (!videosPlayEnabled) {
        disposeVideosPlaybackObserver();
        previewCards.forEach(cardElement => {
            syncVideoCardPlayback(cardElement, false);
        });
        return;
    }

    observeVideosGridPlayback(gridElement);
}

function disposeVideosPlaybackObserver() {
    if (videosPlaybackObserver) {
        videosPlaybackObserver.disconnect();
        videosPlaybackObserver = null;
    }
}

function observeVideosGridPlayback(gridElement) {
    disposeVideosPlaybackObserver();

    if (!gridElement) return;

    const previewCards = gridElement.querySelectorAll('.video-hover-preview');
    if (previewCards.length === 0) return;

    // Fallback for older browsers: keep previous behavior.
    if (typeof IntersectionObserver !== 'function') {
        previewCards.forEach(cardElement => {
            syncVideoCardPlayback(cardElement, true);
        });
        return;
    }

    // Prime cards to thumbnails so off-screen entries do not load videos.
    previewCards.forEach(cardElement => {
        syncVideoCardPlayback(cardElement, false);
    });

    videosPlaybackObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            syncVideoCardPlayback(entry.target, entry.isIntersecting);
        });
    }, {
        root: null,
        rootMargin: '150px 0px',
        threshold: 0.15
    });

    previewCards.forEach(cardElement => {
        videosPlaybackObserver.observe(cardElement);
    });
}

function syncVideoCardPlayback(cardElement, shouldPlay) {
    if (!cardElement) return;

    const imageElement = cardElement.querySelector('img');
    const videoElement = cardElement.querySelector('video');
    const overlayElement = cardElement.querySelector('.video-card-play-overlay');
    if (!videoElement) return;

    if (shouldPlay) {
        if (imageElement) {
            imageElement.style.display = 'none';
        }

        videoElement.style.display = 'block';
        videoElement.loop = true;
        videoElement.preload = 'metadata';
        videoElement.autoplay = true;

        if (overlayElement) {
            overlayElement.style.opacity = '0';
        }

        const playPromise = videoElement.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {
                // Ignore autoplay errors; user can still play in modal.
            });
        }

        return;
    }

    videoElement.pause();
    videoElement.currentTime = 0;
    videoElement.preload = 'none';
    videoElement.autoplay = false;

    const hasThumbnail = imageElement && imageElement.naturalWidth > 0;
    if (hasThumbnail) {
        videoElement.style.display = 'none';
        imageElement.style.display = 'block';
    } else {
        videoElement.style.display = 'block';
    }

    if (overlayElement) {
        overlayElement.style.opacity = '1';
    }
}

function bindVideoHoverPreviews(containerElement) {
    if (!containerElement) return;

    const previewCards = containerElement.querySelectorAll('.video-hover-preview');
    previewCards.forEach(cardElement => {
        if (cardElement.dataset.hoverPreviewBound === 'true') {
            return;
        }

        cardElement.addEventListener('mouseenter', () => startVideoHoverPreview(cardElement));
        cardElement.addEventListener('mouseleave', () => stopVideoHoverPreview(cardElement));

        cardElement.style.touchAction = 'manipulation';
        const mediaElements = cardElement.querySelectorAll('img, video');
        mediaElements.forEach(mediaElement => {
            mediaElement.draggable = false;
            mediaElement.style.webkitUserDrag = 'none';
            mediaElement.style.webkitTouchCallout = 'none';
        });

        cardElement.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });

        cardElement.addEventListener('touchstart', (event) => {
            if (event.touches.length !== 1) return;

            cardElement.dataset.mobilePreviewActive = 'false';
            if (cardElement._mobilePreviewTimer) {
                clearTimeout(cardElement._mobilePreviewTimer);
            }

            cardElement._mobilePreviewTimer = setTimeout(() => {
                startVideoHoverPreview(cardElement);
                cardElement.dataset.mobilePreviewActive = 'true';
                cardElement.dataset.blockNextClick = 'true';
            }, MOBILE_PREVIEW_HOLD_MS);
        }, { passive: true });

        const clearTouchTimer = () => {
            if (cardElement._mobilePreviewTimer) {
                clearTimeout(cardElement._mobilePreviewTimer);
                cardElement._mobilePreviewTimer = null;
            }
        };

        cardElement.addEventListener('touchend', clearTouchTimer, { passive: true });
        cardElement.addEventListener('touchcancel', clearTouchTimer, { passive: true });

        cardElement.addEventListener('click', (event) => {
            if (cardElement.dataset.blockNextClick === 'true') {
                event.preventDefault();
                event.stopPropagation();
                cardElement.dataset.blockNextClick = 'false';
            }
        }, true);

        cardElement.dataset.hoverPreviewBound = 'true';
    });
}

function previewVideoBrowserVideo(filepath, folder) {
    const videoPreviewContainer = document.getElementById('videoPreviewContainer');
    const gridView = document.getElementById('videoBrowserGridView');
    const videoName = document.getElementById('videoPreviewName');

    stopActiveVideoPreview();
    
    if (!videoPreviewContainer) return;
    
    // Hide grid, show preview
    if (gridView) gridView.style.display = 'none';
    if (videoPreviewContainer) videoPreviewContainer.style.display = 'flex';
    
    // Construct the URL for the video
    const videoUrl = folder === 'output' ? `/outputs/${filepath}` : `/api/video/${encodeURIComponent(filepath)}`;
    
    // Load video in custom player
    if (window.videoPreviewPlayer) {
        window.videoPreviewPlayer.loadVideo(videoUrl);
    } else {
        console.error('[VideoPlayer] Custom video player not initialized');
    }
    
    const filename = filepath.split('/').pop();
    videoName.textContent = filename;
    
    // Wire up select button
    const selectBtn = document.getElementById('selectVideoBrowserBtn');
    if (selectBtn) {
        selectBtn.onclick = () => selectVideoBrowserFile(filepath, folder);
    }
}

// Audio Browser Functions
let audioBrowserMode = 'tts';
let currentAudioBrowserFolder = 'input';
let currentAudioBrowserSubpath = '';

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatBrowserFolderLabel(folderName, folderData, fallbackItemCount = null) {
    const itemCount = Number.isInteger(folderData?.item_count)
        ? folderData.item_count
        : (Number.isInteger(fallbackItemCount) ? fallbackItemCount : null);
    const folderCount = Number.isInteger(folderData?.folder_count) ? folderData.folder_count : null;

    if (!Number.isInteger(itemCount) && !Number.isInteger(folderCount)) {
        return folderName;
    }

    const summaryParts = [];
    if (Number.isInteger(itemCount)) {
        summaryParts.push(`${itemCount} ${itemCount === 1 ? 'item' : 'items'}`);
    }
    if (Number.isInteger(folderCount)) {
        summaryParts.push(`${folderCount} ${folderCount === 1 ? 'folder' : 'folders'}`);
    }

    return `${folderName} (${summaryParts.join(', ')})`;
}

function shortenBrowserMediaTitle(title, maxLength = 56) {
    const normalizedTitle = typeof title === 'string' ? title.trim() : '';
    if (!normalizedTitle) {
        return 'Untitled';
    }

    if (normalizedTitle.length <= maxLength) {
        return normalizedTitle;
    }

    return `${normalizedTitle.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function normalizeTtsReferenceAudio(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function rememberTtsReferenceAudio(value) {
    const normalized = normalizeTtsReferenceAudio(value);
    if (!normalized) {
        return;
    }

    lastUsedTtsReferenceAudio = normalized;

    const narratorAudioInput = document.getElementById('ttsNarratorAudio');
    if (narratorAudioInput && narratorAudioInput.value !== normalized) {
        narratorAudioInput.value = normalized;
    }

    const modalVoiceInput = document.getElementById('modalTTSVoice');
    if (modalVoiceInput && modalVoiceInput.value !== normalized) {
        modalVoiceInput.value = normalized;
    }
}

function getPreferredTtsReferenceAudio() {
    if (lastUsedTtsReferenceAudio) {
        return lastUsedTtsReferenceAudio;
    }

    const narratorAudioInput = document.getElementById('ttsNarratorAudio');
    const narratorValue = normalizeTtsReferenceAudio(narratorAudioInput?.value);
    if (narratorValue) {
        return narratorValue;
    }

    const modalVoiceInput = document.getElementById('modalTTSVoice');
    const modalValue = normalizeTtsReferenceAudio(modalVoiceInput?.value);
    if (modalValue) {
        return modalValue;
    }

    return 'Holly.mp3';
}

function closeImageBrowser() {
    const modal = document.getElementById('imageBrowserModal');
    modal.style.display = 'none';
    const useBtn = document.getElementById('useThisFolderBtn');
    if (useBtn) useBtn.style.display = 'none';
}

function renderImageBrowserGridContent(folder, subpath, data) {
    const grid = document.getElementById('imageBrowserGrid');
    if (!grid) return;

    const fragment = document.createDocumentFragment();

    const folders = data.folders || [];
    const files = folder === 'input' ? (data.images || []) : (data.files || []);

    // Filter to only show images - exclude audio AND videos
    const audioExtensions = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma'];
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];
    const imageFiles = files.filter(file => {
        const filename = typeof file === 'string' ? file : (file.filename || file);
        const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
        // Only include image files, exclude audio and video
        return imageExtensions.includes(ext) && !audioExtensions.includes(ext) && !videoExtensions.includes(ext);
    });

    if (folders.length === 0 && imageFiles.length === 0) {
        grid.innerHTML = '<p style="color: #888; grid-column: 1/-1; text-align: center;">No images or folders found</p>';
        return;
    }

    // Add back button if not at root
    // For output folder, don't show back button if we're at 'images' folder (our root)
    const isAtRoot = folder === 'output' ? (subpath === 'images' || !subpath) : !subpath;
    if (subpath && !isAtRoot) {
        const parentPath = subpath.split(/[/\\]/).slice(0, -1).join('/');
        // For output folder, if parent would be empty, go to 'images' instead
        const effectiveParent = (folder === 'output' && !parentPath) ? 'images' : parentPath;

        const backDiv = document.createElement('div');
        backDiv.className = 'browser-folder-item';
        backDiv.innerHTML = `
            <div class="browser-folder-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
            </div>
            <div class="browser-folder-name">..</div>
        `;
        backDiv.addEventListener('click', () => {
            loadImageBrowserFolder(folder, effectiveParent);
        });
        fragment.appendChild(backDiv);
    }

    // Render folders
    folders.forEach(folderItem => {
        const fallbackImageCount = Number.isInteger(folderItem?.image_count) ? folderItem.image_count : null;
        const folderLabel = formatBrowserFolderLabel(folderItem.name, folderItem, fallbackImageCount);
        const div = document.createElement('div');
        div.className = 'browser-folder-item';
        div.dataset.path = folderItem.path || '';
        div.innerHTML = `
            <div class="browser-folder-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
            </div>
            <div class="browser-folder-name">${escapeHtml(folderLabel)}</div>
        `;
        div.addEventListener('click', () => {
            // Always navigate into folders
            loadImageBrowserFolder(folder, folderItem.path);
        });
        fragment.appendChild(div);
    });

    // Render images (audio files filtered out)
    imageFiles.forEach(file => {
        // Handle both object format (with path) and simple string format
        const filename = typeof file === 'string' ? file : (file.filename || file);
        const filePath = typeof file === 'string' ? file : (file.path || file.filename);
        const relativePath = typeof file === 'string' ? null : (file.relative_path || file.filename);

        // For input images, encode path segments separately to preserve forward slashes
        const imagePath = folder === 'input'
            ? `/api/image/input/${filePath.split('/').map(s => encodeURIComponent(s)).join('/')}`
            : `/outputs/${relativePath || filename}`;

        // For output folder, use relativePath for copying; for input, use filePath
        const filePathForSelection = folder === 'output' ? (relativePath || filename) : filePath;

        const div = document.createElement('div');
        div.className = 'browser-image-item';

        const img = document.createElement('img');
        img.src = imagePath;
        img.alt = filename;
        img.loading = 'lazy';
        img.onerror = function() {
            console.error(`Failed to load image: ${imagePath}`);
            this.style.opacity = '0.3';
            this.alt = 'Failed to load';
        };

        const nameDiv = document.createElement('div');
        nameDiv.className = 'browser-image-name';
        nameDiv.textContent = filename;

        div.appendChild(img);
        div.appendChild(nameDiv);

        div.addEventListener('click', () => {
            selectBrowsedImage(filePathForSelection, folder, imagePath);
        });

        fragment.appendChild(div);
    });

    grid.replaceChildren(fragment);
}

async function loadImageBrowserFolder(folder, subpath) {
    const requestToken = ++imageBrowserRequestToken;
    currentBrowserFolder = folder;
    currentBrowserSubpath = subpath || '';
    let quickRenderCompleted = false;
    
    // Update tab active state
    document.querySelectorAll('.image-browser-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.folder === folder) {
            tab.classList.add('active');
        }
    });

    setLoadingOverlay('imageBrowserGrid', 'imageBrowserGridLoadingOverlay', true, 'Loading images...');
    setBrowserTopLoadingStatus('imageBrowserPath', 'imageBrowserPathLoadingStatus', true, 'Loading folder...');

    if (imageBrowserAbortController) {
        imageBrowserAbortController.abort();
    }
    imageBrowserAbortController = new AbortController();
    
    try {
        // For output folder, default to 'images' subfolder if at root
        let effectiveSubpath = subpath;
        if (folder === 'output' && !subpath) {
            effectiveSubpath = 'images';
            // For stitch mode, go directly to frame_edit folder
            if (imageBrowserMode === 'stitch') {
                effectiveSubpath = 'images/frame_edit';
                currentBrowserSubpath = effectiveSubpath;
            }
        }
        const resolvedSubpath = effectiveSubpath || subpath || '';
        const countCacheScope = `modal-image:${folder}`;
        const folderCountCacheScope = `modal-image-folders:${folder}`;
        const cachedCount = getSessionCachedBrowserCount(countCacheScope, resolvedSubpath);
        
        // Update path display with breadcrumb (after adjusting effectiveSubpath)
        renderImageBrowserPath(folder, resolvedSubpath, cachedCount);

        // Quick fetch for fast first paint.
        const quickEndpoint = folder === 'input'
            ? `/api/browse_images?folder=input&path=${encodeURIComponent(subpath)}&with_counts=0`
            : `/api/browse?path=${encodeURIComponent(effectiveSubpath)}&with_counts=0&with_metadata=0`;

        const quickResponse = await fetch(quickEndpoint, { signal: imageBrowserAbortController.signal });
        const quickData = await quickResponse.json();

        if (requestToken !== imageBrowserRequestToken) {
            return;
        }

        if (quickData.success === false) {
            throw new Error(quickData.error || 'Failed to load images');
        }

        const quickImageCount = Number.isInteger(quickData.current_counts?.images)
            ? quickData.current_counts.images
            : countImagesInFileList(folder === 'input' ? (quickData.images || []) : (quickData.files || []));
        setSessionCachedBrowserCount(countCacheScope, resolvedSubpath, quickImageCount);
        renderImageBrowserPath(folder, resolvedSubpath, quickImageCount);
        const quickHydratedFolders = mergeFolderCountsFromSession(folderCountCacheScope, quickData.folders || []);
        const quickRenderData = {
            ...quickData,
            folders: quickHydratedFolders
        };
        renderImageBrowserGridContent(folder, resolvedSubpath, quickRenderData);
        quickRenderCompleted = true;
        setLoadingOverlay('imageBrowserGrid', 'imageBrowserGridLoadingOverlay', false);

        // Background fetch: update counts/labels while images are already visible.
        setBrowserTopLoadingStatus('imageBrowserPath', 'imageBrowserPathLoadingStatus', true, 'Loading details...');
        const detailsEndpoint = folder === 'input'
            ? `/api/browse_images?folder=input&path=${encodeURIComponent(subpath)}&with_counts=1`
            : `/api/browse?path=${encodeURIComponent(effectiveSubpath)}&with_counts=1&with_metadata=0`;

        const detailsResponse = await fetch(detailsEndpoint, { signal: imageBrowserAbortController.signal });
        const detailsData = await detailsResponse.json();

        if (requestToken !== imageBrowserRequestToken) {
            return;
        }

        if (detailsData.success === false) {
            throw new Error(detailsData.error || 'Failed to load image details');
        }

        const detailsImageCount = Number.isInteger(detailsData.current_counts?.images)
            ? detailsData.current_counts.images
            : countImagesInFileList(folder === 'input' ? (detailsData.images || []) : (detailsData.files || []));
        setSessionCachedBrowserCount(countCacheScope, resolvedSubpath, detailsImageCount);
        renderImageBrowserPath(folder, resolvedSubpath, detailsImageCount);
        const detailsFolders = detailsData.folders || [];
        rememberSessionFolderCounts(folderCountCacheScope, detailsFolders);
        // Only patch folder counts into the already-rendered grid – do NOT call
        // renderImageBrowserGridContent with the metadata-free detailsData, which
        // would overwrite the prompts/filenames shown in the quick-pass render.
        updateRenderedFolderCounts(detailsFolders);
    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }
        console.error('Error loading browser folder:', error);
        if (!quickRenderCompleted) {
            showNotification('Error loading images', 'Error', 'error');
        }
    } finally {
        if (requestToken === imageBrowserRequestToken) {
            setLoadingOverlay('imageBrowserGrid', 'imageBrowserGridLoadingOverlay', false);
            setBrowserTopLoadingStatus('imageBrowserPath', 'imageBrowserPathLoadingStatus', false);
            imageBrowserAbortController = null;
        }
    }
}

function renderImageBrowserPath(folder, subpath, currentImageCount = null) {
    const pathDisplay = document.getElementById('imageBrowserPathText');
    const folderName = folder === 'input' ? 'Input' : 'Images';
    const hasCount = Number.isInteger(currentImageCount);
    const countLabel = hasCount ? ` (${currentImageCount} ${currentImageCount === 1 ? 'image' : 'images'})` : '';
    
    if (!subpath || (folder === 'output' && subpath === 'images')) {
        pathDisplay.innerHTML = `${folderName}${countLabel}`;
    } else {
        // Build clickable breadcrumb path
        const parts = subpath.split(/[/\\]/).filter(p => p);
        // For output folder, skip 'images' part as it's the root
        const displayParts = folder === 'output' ? parts.slice(1) : parts;
        
        let html = `<span class="browser-path-part" style="cursor: pointer;" onclick="loadImageBrowserFolder('${folder}', ${folder === 'output' ? "'images'" : "''"})">${folderName}</span>`;
        
        let currentPath = folder === 'output' ? 'images' : '';
        displayParts.forEach((part, index) => {
            currentPath += (currentPath ? '/' : '') + part;
            const pathCopy = currentPath;
            html += ' / ';
            html += `<span class="browser-path-part" style="cursor: pointer;" onclick="loadImageBrowserFolder('${folder}', '${pathCopy}')">${escapeHtml(part)}</span>`;
        });

        html += countLabel;
        
        pathDisplay.innerHTML = html;
    }

    // Toggle "Use This Folder" button visibility based on mode/folder
    const useBtn = document.getElementById('useThisFolderBtn');
    if (useBtn) {
        if (imageBrowserMode === 'image-batch') {
            // Image batch: from both input and output folders
            useBtn.style.display = 'inline-flex';
        } else if (imageBrowserMode === 'frame-edit' && folder === 'input' && subpath && subpath.startsWith('frame_edit')) {
            // Frame Edit: only show for subfolders within frame_edit
            useBtn.style.display = 'inline-flex';
        } else if (imageBrowserMode === 'stitch') {
            // Stitch: show for subfolders in input/frame_edit or output/images/frame_edit
            const validInput = folder === 'input' && subpath && subpath.startsWith('frame_edit');
            const validOutput = folder === 'output' && subpath && subpath.startsWith('images/frame_edit');
            if (validInput || validOutput) {
                useBtn.style.display = 'inline-flex';
            } else {
                useBtn.style.display = 'none';
            }
        } else if (imageBrowserMode === 'video-batch') {
            // Video batch: from both input and output folders
            useBtn.style.display = 'inline-flex';
        } else {
            useBtn.style.display = 'none';
        }
    }
}

async function selectBrowsedImage(filename, folder, imagePath) {
    try {
        // If from output folder, copy to input folder
        let finalFilename = filename;
        if (folder === 'output') {
            const response = await fetch('/api/copy_to_input', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename })
            });
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Failed to copy image');
            }
            finalFilename = data.filename;
        }
        
        // Set the appropriate uploaded filename and preview
        if (imageBrowserMode === 'single') {
            uploadedImageFilename = finalFilename;
            
            // Update preview
            const imagePreviewImg = document.getElementById('imagePreviewImg');
            const imagePreview = document.getElementById('imagePreview');
            const clearImageBtn = document.getElementById('clearImageBtn');
            const useImageSizeGroup = document.getElementById('useImageSizeGroup');
            
            imagePreviewImg.src = imagePath;
            imagePreview.style.display = 'block';
            clearImageBtn.style.display = 'inline-flex';
            useImageSizeGroup.style.display = 'block';
            
            // Clear file input
            document.getElementById('imageUpload').value = '';
        } else if (imageBrowserMode === 'character') {
            // Handle character image selection
            if (typeof uploadedCharImageFilename !== 'undefined') {
                uploadedCharImageFilename = finalFilename;
            }
            
            // Close image browser
            closeImageBrowser();
            
            // Restore character editor with selected image
            if (typeof restoreCharacterEditor === 'function') {
                // Update the stored state with the new image
                if (typeof characterEditorState !== 'undefined' && characterEditorState) {
                    characterEditorState.image = imagePath;
                }
                restoreCharacterEditor();
            }
            
            showNotification('Image selected', 'Success', 'success');
            return; // Skip the closeImageBrowser call at the end
        } else if (imageBrowserMode === 'video') {
            uploadedVideoImageFilename = finalFilename;
            
            // Update video preview
            const imagePreviewImg = document.getElementById('videoPreviewImg');
            const imagePreview = document.getElementById('videoImagePreview');
            const clearImageBtn = document.getElementById('clearVideoImageBtn');
            
            imagePreviewImg.src = imagePath;
            imagePreview.style.display = 'block';
            clearImageBtn.style.display = 'inline-block';
            
            // Clear file input
            document.getElementById('videoImageUpload').value = '';
        } else {
            batchUploadedImageFilename = finalFilename;
            
            // Update batch preview
            const imagePreviewImg = document.getElementById('batchImagePreviewImg');
            const imagePreview = document.getElementById('batchImagePreview');
            const clearImageBtn = document.getElementById('clearBatchImageBtn');
            const useImageSizeGroup = document.getElementById('batchUseImageSizeGroup');
            
            imagePreviewImg.src = imagePath;
            imagePreview.style.display = 'block';
            clearImageBtn.style.display = 'inline-flex';
            useImageSizeGroup.style.display = 'block';
            
            // Clear file input
            document.getElementById('batchImageUpload').value = '';
        }
        
        closeImageBrowser();
        showNotification('Image selected', 'Success', 'success');
    } catch (error) {
        console.error('Error selecting image:', error);
        showNotification('Error selecting image', 'Error', 'error');
    }
}

// Patch folder item counts into an already-rendered gallery/browser grid.
// This is used by the details (second) fetch pass to update subfolder badges
// without re-rendering the entire file grid (which would erase metadata).
function updateRenderedFolderCounts(detailsFolders) {
    if (!Array.isArray(detailsFolders) || detailsFolders.length === 0) return;

    // Build a quick lookup: normalised path -> folder entry
    const countMap = {};
    detailsFolders.forEach(f => {
        if (f && f.path != null) {
            countMap[String(f.path).replace(/\\/g, '/')] = f;
        }
    });

    // Update every rendered folder item whose data-path attribute is in the map
    document.querySelectorAll('.gallery-item.folder-item[data-path], .browser-folder-item[data-path]').forEach(el => {
        const path = el.getAttribute('data-path');
        const folderData = path ? countMap[path] : null;
        if (!folderData) return;

        // Update image/video count badge if present
        const badge = el.querySelector('.folder-count, .item-count, .gallery-count');
        if (badge) {
            const total = (folderData.image_count || 0) + (folderData.video_count || 0) +
                          (folderData.audio_count || 0) + (folderData.item_count || 0);
            // item_count is already the sum in the server response; prefer it
            const display = Number.isInteger(folderData.item_count)
                ? folderData.item_count
                : total;
            badge.textContent = String(display);
        }
    });
}

// Folder Browsing
async function browseFolder(path) {
    const requestToken = ++browseFolderRequestToken;
    let quickRenderCompleted = false;
    setLoadingOverlay('galleryGrid', 'galleryGridLoadingOverlay', true, 'Loading folder...');
    setBrowserTopLoadingStatus('breadcrumb', 'browserBreadcrumbLoadingStatus', true, 'Loading folder...');

    if (browseFolderAbortController) {
        browseFolderAbortController.abort();
    }
    browseFolderAbortController = new AbortController();

    try {
        const normalizedPath = path || 'images';
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];
        const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];
        const imageBrowserCount = document.getElementById('imageBrowserCount');
        const countCacheScope = 'main-images';
        const folderCountCacheScope = 'main-images-folders';
        const cachedCount = getSessionCachedBrowserCount(countCacheScope, normalizedPath);

        if (Number.isInteger(cachedCount)) {
            renderBreadcrumb(normalizedPath, cachedCount);
            if (imageBrowserCount) {
                imageBrowserCount.textContent = String(cachedCount);
            }
        }

                // Quick fetch: include metadata (prompts) immediately; skip slow folder counts.
        const quickResponse = await fetch(`/api/browse?path=${encodeURIComponent(normalizedPath)}&root=images&with_counts=0&with_metadata=1`, {
            signal: browseFolderAbortController.signal
        });
        const quickData = await quickResponse.json();

        if (requestToken !== browseFolderRequestToken) {
            return;
        }

        if (quickData.success === false) {
            throw new Error(quickData.error || 'Failed to load folder');
        }

        currentPath = quickData.current_path || normalizedPath;
        const quickHydratedFolders = mergeFolderCountsFromSession(folderCountCacheScope, quickData.folders || []);
        allItems = [...quickHydratedFolders, ...(quickData.files || [])];

        // Filter images array to exclude videos (videos go to Video Browser tab)
        images = (quickData.files || []).filter(file => {
            if (!file.filename) return false;
            const ext = file.filename.toLowerCase().slice(file.filename.lastIndexOf('.'));
            return imageExtensions.includes(ext) && !videoExtensions.includes(ext);
        });

        const quickImageCount = Number.isInteger(quickData.current_counts?.images)
            ? quickData.current_counts.images
            : images.length;

        selectedItems.clear();

        renderBreadcrumb(currentPath, quickImageCount);
        renderGallery(quickHydratedFolders, quickData.files || []);
        updateSelectionButtons();

        if (imageBrowserCount) {
            imageBrowserCount.textContent = String(quickImageCount);
        }
        setSessionCachedBrowserCount(countCacheScope, currentPath || normalizedPath, quickImageCount);

        browserLastLoadedPath = currentPath || 'images';
        browserLastLoadedAt = Date.now();
        quickRenderCompleted = true;
        setLoadingOverlay('galleryGrid', 'galleryGridLoadingOverlay', false);

                                        // Background details fetch: folder counts only – files already rendered with full metadata.
        setBrowserTopLoadingStatus('breadcrumb', 'browserBreadcrumbLoadingStatus', true, 'Loading details...');
        const detailsResponse = await fetch(`/api/browse?path=${encodeURIComponent(normalizedPath)}&root=images&with_metadata=0`, {
            signal: browseFolderAbortController.signal
        });
        const data = await detailsResponse.json();

        if (requestToken !== browseFolderRequestToken) {
            return;
        }

        if (data.success === false) {
            throw new Error(data.error || 'Failed to load folder details');
        }

        // Only update folder counts and breadcrumb – do NOT re-render the file grid
        // with the metadata-free file list, which would wipe out prompts/seeds shown
        // in the first pass.
        const detailsFolders = data.folders || [];
        rememberSessionFolderCounts(folderCountCacheScope, detailsFolders);

        const imageFileCount = Number.isInteger(data.current_counts?.images)
            ? data.current_counts.images
            : images.length;

        renderBreadcrumb(currentPath, imageFileCount);
        // Patch folder counts into the already-rendered gallery items.
        updateRenderedFolderCounts(detailsFolders);

        if (imageBrowserCount) {
            imageBrowserCount.textContent = String(imageFileCount);
        }
        setSessionCachedBrowserCount(countCacheScope, currentPath || normalizedPath, imageFileCount);

        browserLastLoadedPath = currentPath || 'images';
        browserLastLoadedAt = Date.now();

        if (isFullscreenActive) {
            syncFullscreenAfterDataRefresh('browser');
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }
        console.error('Error browsing folder:', error);
        if (!quickRenderCompleted) {
            showNotification('Error loading folder', 'Error', 'error');
        }
    } finally {
        if (requestToken === browseFolderRequestToken) {
            setLoadingOverlay('galleryGrid', 'galleryGridLoadingOverlay', false);
            setBrowserTopLoadingStatus('breadcrumb', 'browserBreadcrumbLoadingStatus', false);
            browseFolderAbortController = null;
        }
    }
}

function renderBreadcrumb(path, imageFileCount = null) {
    const breadcrumb = document.getElementById('breadcrumb');
    // Remove 'images' prefix from path for display (since we're rooted in images folder)
    let displayPath = path;
    if (displayPath && displayPath.startsWith('images/')) {
        displayPath = displayPath.substring(7); // Remove 'images/'
    } else if (displayPath === 'images') {
        displayPath = '';
    }
    
    const parts = displayPath ? displayPath.split(/[/\\]/).filter(p => p) : [];
    
    let html = '<span class="breadcrumb-item" onclick="browseFolder(\'images\')">🏠 Images</span>';
    
    let currentPath = 'images';
    parts.forEach((part, index) => {
        currentPath += '/' + part;
        const pathCopy = currentPath;
        html += ' / ';
        html += `<span class="breadcrumb-item" onclick="browseFolder('${pathCopy}')">${escapeHtml(part)}</span>`;
    });

    if (Number.isInteger(imageFileCount)) {
        html += ` <span style="color: var(--text-muted);">(${imageFileCount} ${imageFileCount === 1 ? 'image' : 'images'})</span>`;
    }
    
    breadcrumb.innerHTML = html;
}

function renderGallery(folders, files) {
    const galleryGrid = document.getElementById('galleryGrid');
    const galleryEmpty = document.getElementById('galleryEmpty');
    
    let html = '';
    
    // Add back button if not at images root
    if (currentPath && currentPath !== 'images') {
        const parentPath = currentPath.split(/[/\\]/).slice(0, -1).join('/');
        // Ensure parent path doesn't go above 'images' folder
        const finalParentPath = parentPath || 'images';
        html += `
            <div class="gallery-item folder-item" onclick="browseFolder('${finalParentPath}')">
                <div class="folder-icon">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                </div>
                <div class="gallery-item-info">
                    <div class="gallery-item-prompt">..</div>
                </div>
            </div>
        `;
    }
    
    // Render folders
    folders.forEach(folder => {
        const isSelected = selectedItems.has(folder.path);
        const escapedPath = escapeJsString(folder.path);
        const clickHandler = selectionMode ? `toggleItemSelection(event, '${escapedPath}')` : `browseFolder('${escapedPath}')`;
        const fallbackImageCount = Number.isInteger(folder.image_count) ? folder.image_count : null;
        const folderLabel = formatBrowserFolderLabel(folder.name, folder, fallbackImageCount);
        html += `
            <div class="gallery-item folder-item ${isSelected ? 'selected' : ''} ${selectionMode ? 'selection-mode' : ''}" 
                 data-path="${escapeHtml(folder.path)}" 
                 data-type="folder"
                 onclick="${clickHandler}">
                <div class="folder-icon">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
                <div class="gallery-item-info">
                    <div class="gallery-item-prompt">${escapeHtml(folderLabel)}</div>
                </div>
            </div>
        `;
    });
    
    // Render files (images only - videos go to Videos tab)
    files.forEach(file => {
        const filePathKey = file.relative_path || file.path || file.filename || '';
        const escapedFilePathKey = escapeJsString(String(filePathKey));
        const fileIdentifier = file.id || file.relative_path || file.path || file.filename || '';
        const escapedIdentifier = escapeJsString(String(fileIdentifier));
        const outputImagePath = file.relative_path || file.path || file.filename || '';
        const isSelected = selectedItems.has(filePathKey);
        const clickHandler = selectionMode ? `toggleItemSelection(event, '${escapedFilePathKey}')` : `openImageModal('${escapedIdentifier}')`;
        const loweredFilename = (file.filename || '').toLowerCase();
        const isVideo = loweredFilename.endsWith('.mp4') || loweredFilename.endsWith('.webm') || loweredFilename.endsWith('.mov') || loweredFilename.endsWith('.avi') || loweredFilename.endsWith('.mkv') || loweredFilename.endsWith('.m4v');
        const fullTitle = (file.prompt || file.filename || '').toString();
        const shortTitle = shortenBrowserMediaTitle(fullTitle || 'Untitled image');
        const hasDimensions = Number.isFinite(file.width) && Number.isFinite(file.height);
        const hasSteps = Number.isFinite(file.steps);
        const badges = [];
        if (hasDimensions) {
            badges.push(`<span class="param-badge">${file.width}x${file.height}</span>`);
        }
        if (hasSteps) {
            badges.push(`<span class="param-badge">${file.steps} steps</span>`);
        }
        
        // Skip videos - they belong in the Videos tab
        if (isVideo) {
            return;
        }
        
        // Render image
        html += `
            <div class="gallery-item ${isSelected ? 'selected' : ''} ${selectionMode ? 'selection-mode' : ''}" 
                 data-path="${escapeHtml(filePathKey)}" 
                 data-type="file"
                 onclick="${clickHandler}">
                <img src="/outputs/${outputImagePath}" alt="Generated Image" class="gallery-item-image">
                <div class="gallery-item-info">
                    <div class="gallery-item-prompt gallery-item-media-title" title="${escapeHtml(fullTitle || 'Untitled image')}">${escapeHtml(shortTitle)}</div>
                    ${badges.length > 0 ? `<div class="gallery-item-meta">${badges.join('')}</div>` : ''}
                </div>
            </div>
        `;
    });
    
    if (html) {
        galleryGrid.innerHTML = html;
        galleryGrid.style.display = 'grid';
        galleryEmpty.style.display = 'none';
    } else {
        galleryGrid.style.display = 'none';
        galleryEmpty.style.display = 'block';
    }
}

function toggleItemSelection(event, path) {
    // Check if this is a folder - if so, always navigate instead of selecting
    const item = document.querySelector(`[data-path="${path}"]`);
    if (item && item.dataset.type === 'folder') {
        browseFolder(path);
        return;
    }
    
    event.stopPropagation();
    
    if (selectedItems.has(path)) {
        selectedItems.delete(path);
    } else {
        selectedItems.add(path);
    }
    
    // Update UI
    if (item) {
        item.classList.toggle('selected');
    }
    
    updateSelectionButtons();
}

function toggleSelectionMode() {
    selectionMode = !selectionMode;
    const btn = document.getElementById('selectionModeBtn');
    
    if (selectionMode) {
        btn.classList.add('btn-active');
    } else {
        btn.classList.remove('btn-active');
        // Clear selections when exiting selection mode
        selectedItems.clear();
    }
    
    // Re-render gallery to update click handlers
    browseFolder(currentPath);
}

function updateSelectionButtons() {
    const moveBtn = document.getElementById('moveBtn');
    const deleteBtn = document.getElementById('deleteBtn');
    const hasSelection = selectedItems.size > 0 && selectionMode;
    
    moveBtn.style.display = hasSelection ? 'inline-flex' : 'none';
    deleteBtn.style.display = hasSelection ? 'inline-flex' : 'none';
}

// Folder Management
async function createNewFolder() {
    const name = await showPrompt('Enter folder name:', '', 'Create Folder');
    if (!name) return;
    
    try {
        const response = await fetch('/api/folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                parent: currentPath
            })
        });
        
        const result = await response.json();
        if (result.success) {
            browseFolder(currentPath);
            showNotification('Folder created successfully', 'Created', 'success', 3000);
        } else {
            showNotification('Error: ' + result.error, 'Error', 'error');
        }
    } catch (error) {
        console.error('Error creating folder:', error);
        showNotification('Error creating folder', 'Error', 'error');
    }
}

async function setOutputFolder() {
    // Set output folder
    document.getElementById('subfolder').value = currentPath;
    showNotification(`Output folder set to: ${currentPath || 'Root'}`, 'Output Folder Set', 'success', 3000);
}

async function moveSelectedItems() {
    if (selectedItems.size === 0) return;
    
    const target = await showPrompt('Enter target folder path (leave empty for root):', '', 'Move Items');
    if (target === null) return; // Cancelled
    
    try {
        const response = await fetch('/api/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: Array.from(selectedItems),
                target: target
            })
        });
        
        const result = await response.json();
        if (result.errors.length > 0) {
            showNotification('Errors occurred:\n' + result.errors.join('\n'), 'Move Errors', 'error');
        } else if (result.moved.length > 0) {
            showNotification(`Moved ${result.moved.length} item(s) successfully`, 'Moved', 'success', 3000);
        }
        
        browseFolder(currentPath);
    } catch (error) {
        console.error('Error moving items:', error);
        showNotification('Error moving items', 'Error', 'error');
    }
}

async function deleteSelectedItems() {
    if (selectedItems.size === 0) return;
    
    const count = selectedItems.size;
    const confirmed = await showConfirm(`Delete ${count} item(s)? This cannot be undone.`, 'Confirm Delete');
    if (!confirmed) return;
    
    try {
        const response = await fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: Array.from(selectedItems)
            })
        });
        
        const result = await response.json();
        if (result.errors.length > 0) {
            showNotification('Errors occurred:\n' + result.errors.join('\n'), 'Delete Errors', 'error');
        } else if (result.deleted.length > 0) {
            showNotification(`Deleted ${result.deleted.length} item(s) successfully`, 'Deleted', 'success', 3000);
        }
        
        browseFolder(currentPath);
    } catch (error) {
        console.error('Error deleting items:', error);
        showNotification('Error deleting items', 'Error', 'error');
    }
}

// Image Modal
async function openImageModal(imageId) {
    try {
        const idString = String(imageId);
        // Find the index of this image
        currentImageIndex = images.findIndex(img => {
            const candidates = [img.id, img.relative_path, img.path, img.filename]
                .filter(value => value !== undefined && value !== null)
                .map(value => String(value));
            return candidates.includes(idString);
        });
        if (currentImageIndex === -1) currentImageIndex = 0;
        
        showImageAtIndex(currentImageIndex);
        document.getElementById('imageModal').classList.add('active');
    } catch (error) {
        console.error('Error loading image:', error);
    }
}

function closeImageModal() {
    document.getElementById('imageModal').classList.remove('active');
    // Restore saved images array if it was replaced by video modal
    if (savedImages !== null) {
        images = savedImages;
        savedImages = null;
    }
}

function showImageAtIndex(index) {
    if (images.length === 0) return;
    
    // Wrap around
    if (index >= images.length) {
        currentImageIndex = 0;
    } else if (index < 0) {
        currentImageIndex = images.length - 1;
    } else {
        currentImageIndex = index;
    }
    
    const image = images[currentImageIndex];
    currentImageData = image; // Store current image data for import
    
    // Check if we should show video source image instead
    const hasVideoSourceImage = image.job_type === 'video' && image.source_image;
    const shouldShowVideoInput = showingVideoInputImage && hasVideoSourceImage;
    
    // Check if we should show image input instead
    const hasInputImage = image.use_image && image.image_filename;
    const shouldShowImageInput = showingInputImage && hasInputImage;
    
    // Use relative_path if available (includes subfolder), otherwise fall back to filename
    const imagePath = image.relative_path || image.filename;
    const isVideo = imagePath && (imagePath.endsWith('.mp4') || imagePath.endsWith('.webm') || imagePath.endsWith('.mov'));
    
    const detailImage = document.getElementById('detailImage');
    
    // Async function to apply matched sizing if enabled
    const applyMatchedSizing = async () => {
        if (!matchSizesEnabled || !hasInputImage || isVideo || shouldShowVideoInput) {
            removeMatchedSizeStyle(detailImage);
            return;
        }
        
        const outputSrc = `/outputs/${imagePath}`;
        const inputPath = image.image_filename.replace(/\\\\/g, '/');
        const inputSrc = `/api/image/input/${inputPath.split('/').map(s => encodeURIComponent(s)).join('/')}`;
        
        const matchedSize = await calculateMatchedSize(outputSrc, inputSrc);
        if (matchedSize) {
            applyMatchedSizeStyle(detailImage, matchedSize);
        }
    };
    
    // Check if hover comparison should be used
    // Hover compare works when enabled and there's an input image
    const shouldUseHoverCompare = hoverCompareEnabled && hasInputImage && !isVideo && !shouldShowVideoInput;
    
    if (shouldShowVideoInput) {
        // Show source image instead of video
        const comparisonContainer = document.getElementById('imageComparisonContainer');
        comparisonContainer.style.display = 'none';
        detailImage.style.display = 'block';
        
        if (detailImage.tagName.toLowerCase() !== 'img') {
            const img = document.createElement('img');
            img.id = 'detailImage';
            img.alt = 'Source Image';
            detailImage.parentNode.replaceChild(img, detailImage);
        }
        const sourceImagePath = image.source_image.replace(/\\\\/g, '/');
        document.getElementById('detailImage').src = `/api/image/input/${sourceImagePath.split('/').map(s => encodeURIComponent(s)).join('/')}`;
        removeMatchedSizeStyle(document.getElementById('detailImage'));
    } else if (shouldUseHoverCompare) {
        // Use hover comparison mode - takes precedence over shouldShowImageInput
        const comparisonContainer = document.getElementById('imageComparisonContainer');
        detailImage.style.display = 'none';
        comparisonContainer.style.display = 'block';
        
        // Setup comparison images
        const inputImg = document.getElementById('comparisonInputImage');
        const outputImg = document.getElementById('comparisonOutputImage');
        const inputPath = image.image_filename.replace(/\\\\/g, '/');
        const inputSrc = `/api/image/input/${inputPath.split('/').map(s => encodeURIComponent(s)).join('/')}`;
        const outputSrc = `/outputs/${imagePath}`;
        
        // Invert base/reveal based on showingInputImage state
        // Normal (showingInputImage=false): base=input, hover reveals output
        // Inverted (showingInputImage=true): base=output, hover reveals input
        if (showingInputImage) {
            // When "Show Input" toggle is active, invert the behavior
            inputImg.src = outputSrc;
            outputImg.src = inputSrc;
        } else {
            // Normal mode
            inputImg.src = inputSrc;
            outputImg.src = outputSrc;
        }
        
        // Initialize hover tracking
        initializeHoverComparison(comparisonContainer);
    } else if (shouldShowImageInput) {
        // Show input image instead of output (when hover compare is disabled)
        const comparisonContainer = document.getElementById('imageComparisonContainer');
        comparisonContainer.style.display = 'none';
        detailImage.style.display = 'block';
        
        if (detailImage.tagName.toLowerCase() !== 'img') {
            const img = document.createElement('img');
            img.id = 'detailImage';
            img.alt = 'Input Image';
            detailImage.parentNode.replaceChild(img, detailImage);
        }
        const inputPath = image.image_filename.replace(/\\\\/g, '/');
        document.getElementById('detailImage').src = `/api/image/input/${inputPath.split('/').map(s => encodeURIComponent(s)).join('/')}`;
        applyMatchedSizing();
    } else if (isVideo) {
        // Hide comparison container for videos
        const comparisonContainer = document.getElementById('imageComparisonContainer');
        comparisonContainer.style.display = 'none';
        detailImage.style.display = 'block';
        
        // Replace img with video element
        if (detailImage.tagName.toLowerCase() !== 'video') {
            const video = document.createElement('video');
            video.id = 'detailImage';
            video.controls = true;
            video.loop = true; // Enable looping
            video.autoplay = true; // Enable autoplay
            video.playsinline = true;
            video.preload = 'auto';
            video.style.maxWidth = '100%';
            video.style.maxHeight = '80vh';
            
            // Use source element with explicit MIME type for mobile compatibility
            const source = document.createElement('source');
            source.src = `/outputs/${imagePath}`;
            source.type = getVideoMimeType(imagePath);
            video.appendChild(source);
            
            detailImage.parentNode.replaceChild(video, detailImage);
            
            // Load and play
            video.load();
            video.addEventListener('loadedmetadata', () => {
                video.play().catch(err => console.log('Autoplay prevented:', err));
            }, { once: true });
        } else {
            const videoElement = document.getElementById('detailImage');
            videoElement.loop = true; // Enable looping
            videoElement.autoplay = true; // Enable autoplay
            
            // Clear existing sources and add new one
            videoElement.innerHTML = '';
            const source = document.createElement('source');
            source.src = `/outputs/${imagePath}`;
            source.type = getVideoMimeType(imagePath);
            videoElement.appendChild(source);
            
            // Load and play
            videoElement.load();
            videoElement.addEventListener('loadedmetadata', () => {
                videoElement.play().catch(err => console.log('Autoplay prevented:', err));
            }, { once: true });
        }
    } else {
        // Hide comparison container for regular images when hover compare is off
        const comparisonContainer = document.getElementById('imageComparisonContainer');
        comparisonContainer.style.display = 'none';
        detailImage.style.display = 'block';
        
        // Replace video with img element
        if (detailImage.tagName.toLowerCase() !== 'img') {
            const img = document.createElement('img');
            img.id = 'detailImage';
            img.alt = 'Generated Image';
            detailImage.parentNode.replaceChild(img, detailImage);
        }
        document.getElementById('detailImage').src = `/outputs/${imagePath}`;
        applyMatchedSizing();
    }
    
    document.getElementById('imageCounter').textContent = `${currentImageIndex + 1} / ${images.length}`;
    document.getElementById('imageMetadata').innerHTML = renderMetadata(image);
    
    // Update input image toggle button visibility
    updateInputImageToggleVisibility();
}

// Initialize hover comparison tracking
function initializeHoverComparison(container) {
    // Remove any existing listeners
    const oldContainer = container.cloneNode(true);
    container.parentNode.replaceChild(oldContainer, container);
    const newContainer = document.getElementById('imageComparisonContainer');
    
    const maskContainer = document.getElementById('comparisonMaskContainer');
    const revealImage = document.getElementById('comparisonOutputImage');
    
    // Use global radius value
    const getRadius = () => hoverCompareRadius;
    
    // Track mouse movement
    function updateMask(e) {
        const rect = newContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Update clip-path to show circular area around mouse
        revealImage.style.clipPath = `circle(${getRadius()}px at ${x}px ${y}px)`;
    }
    
    // Reset mask on mouse leave
    function resetMask() {
        revealImage.style.clipPath = 'circle(0px at 50% 50%)';
    }
    
    newContainer.addEventListener('mousemove', updateMask);
    newContainer.addEventListener('mouseleave', resetMask);
    
    // Touch support for mobile
    newContainer.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = newContainer.getBoundingClientRect();
            // Offset circle up and to the left of touch point so finger doesn't block view
            const x = touch.clientX - rect.left - 60; // Move 60px left
            const y = touch.clientY - rect.top - 80;  // Move 80px up
            revealImage.style.clipPath = `circle(${getRadius()}px at ${x}px ${y}px)`;
        }
    });
    
    newContainer.addEventListener('touchend', resetMask);
}

// Initialize hover comparison tracking for fullscreen
function initializeFullscreenHoverComparison(container) {
    // Remove any existing listeners
    const oldContainer = container.cloneNode(true);
    container.parentNode.replaceChild(oldContainer, container);
    const newContainer = document.getElementById('fullscreenComparisonContainer');
    
    const revealImage = document.getElementById('fullscreenComparisonOutputImage');
    
    // Use global radius value
    const getRadius = () => hoverCompareRadius;
    
    // Track mouse movement
    function updateMask(e) {
        const rect = newContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Update clip-path to show circular area around mouse
        revealImage.style.clipPath = `circle(${getRadius()}px at ${x}px ${y}px)`;
    }
    
    // Reset mask on mouse leave
    function resetMask() {
        revealImage.style.clipPath = 'circle(0px at 50% 50%)';
    }
    
    newContainer.addEventListener('mousemove', updateMask);
    newContainer.addEventListener('mouseleave', resetMask);
    
    // Touch support for mobile
    newContainer.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = newContainer.getBoundingClientRect();
            // Offset circle up and to the left of touch point so finger doesn't block view
            const x = touch.clientX - rect.left - 60; // Move 60px left
            const y = touch.clientY - rect.top - 80;  // Move 80px up
            revealImage.style.clipPath = `circle(${getRadius()}px at ${x}px ${y}px)`;
        }
    });
    
    newContainer.addEventListener('touchend', resetMask);
}

function nextImage() {
    showImageAtIndex(currentImageIndex + 1);
}

function prevImage() {
    showImageAtIndex(currentImageIndex - 1);
}



// Metadata Rendering
function renderMetadata(image) {
    const isVideo = image.job_type === 'video';
    
    if (isVideo) {
        // Video metadata
        return `
            <div class="metadata-grid">
                <div class="metadata-item metadata-prompt">
                    <div class="metadata-label">Motion Prompt</div>
                    <div class="metadata-value">${escapeHtml(image.prompt)}</div>
                </div>
                <div class="metadata-item">
                    <div class="metadata-label">Source Image</div>
                    <div class="metadata-value">${escapeHtml(image.source_image || 'N/A')}</div>
                </div>
                <div class="metadata-item">
                    <div class="metadata-label">Mode</div>
                    <div class="metadata-value">${image.nsfw ? '<span style="color: #ff6b6b; font-weight: 600;">NSFW</span>' : 'Standard'}</div>
                </div>
                <div class="metadata-item">
                    <div class="metadata-label">Frames</div>
                    <div class="metadata-value">${image.frames || 64}</div>
                </div>
                <div class="metadata-item">
                    <div class="metadata-label">FPS</div>
                    <div class="metadata-value">${image.fps || 16}</div>
                </div>
                <div class="metadata-item">
                    <div class="metadata-label">Megapixels</div>
                    <div class="metadata-value">${image.megapixels || 0.25}</div>
                </div>
                <div class="metadata-item">
                    <div class="metadata-label">Seed</div>
                    <div class="metadata-value">${image.seed}</div>
                </div>
                <div class="metadata-item">
                    <div class="metadata-label">Generated</div>
                    <div class="metadata-value">${formatDate(image.timestamp)}</div>
                </div>
                ${image.generation_duration ? `
                <div class="metadata-item">
                    <div class="metadata-label">Generation Time</div>
                    <div class="metadata-value">${formatDuration(image.generation_duration)}</div>
                </div>
                ` : ''}
                <div class="metadata-item">
                    <div class="metadata-label">Filename</div>
                    <div class="metadata-value">${image.filename}</div>
                </div>
            </div>
        `;
    }
    
    // Image metadata
    const loraStatus = [];
    if (image.mcnl_lora) loraStatus.push('MCNL (F)');
    if (image.snofs_lora) loraStatus.push('Snofs (F)');
    if (image.male_lora) loraStatus.push('Male');
    const loraText = loraStatus.length > 0 ? loraStatus.join(', ') : 'None';
    
    const modeText = image.use_image ? 'Image-to-Image' : 'Text-to-Image';
    const imageSizeText = image.use_image_size ? 'Yes' : 'No';
    
    return `
        <div class="metadata-grid">
            <div class="metadata-item metadata-prompt">
                <div class="metadata-label">Prompt</div>
                <div class="metadata-value">${escapeHtml(image.prompt)}</div>
            </div>
            <div class="metadata-item">
                <div class="metadata-label">Mode</div>
                <div class="metadata-value">${modeText}</div>
            </div>
            ${image.use_image ? `
            <div class="metadata-item">
                <div class="metadata-label">Source Image</div>
                <div class="metadata-value">${escapeHtml(image.image_filename || 'N/A')}</div>
            </div>
            <div class="metadata-item">
                <div class="metadata-label">Use Image Size</div>
                <div class="metadata-value">${imageSizeText}</div>
            </div>
            ` : ''}
            <div class="metadata-item">
                <div class="metadata-label">Dimensions</div>
                <div class="metadata-value">${image.use_image_size ? 'Same as Source' : `${image.width} × ${image.height}`}</div>
            </div>
            <div class="metadata-item">
                <div class="metadata-label">Steps</div>
                <div class="metadata-value">${image.steps}</div>
            </div>
            <div class="metadata-item">
                <div class="metadata-label">CFG Scale</div>
                <div class="metadata-value">${image.cfg || 1.0}</div>
            </div>
            <div class="metadata-item">
                <div class="metadata-label">Shift</div>
                <div class="metadata-value">${image.shift || 3.0}</div>
            </div>
            <div class="metadata-item">
                <div class="metadata-label">Seed</div>
                <div class="metadata-value">${image.seed}</div>
            </div>
            <div class="metadata-item">
                <div class="metadata-label">LoRAs</div>
                <div class="metadata-value">${loraText}</div>
            </div>
            <div class="metadata-item">
                <div class="metadata-label">Generated</div>
                <div class="metadata-value">${formatDate(image.timestamp)}</div>
            </div>
            ${image.generation_duration ? `
            <div class="metadata-item">
                <div class="metadata-label">Generation Time</div>
                <div class="metadata-value">${formatDuration(image.generation_duration)}</div>
            </div>
            ` : ''}
            <div class="metadata-item">
                <div class="metadata-label">Filename</div>
                <div class="metadata-value">${image.filename}</div>
            </div>
        </div>
    `;
}

// Delete current image from modal
async function deleteCurrentImage() {
    if (!currentImageData) return;

    const confirmed = await showConfirm('Delete this image? This cannot be undone.', 'Confirm Delete');
    if (!confirmed) return;

    try {
        const response = await fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: [currentImageData.relative_path] })
        });
        const result = await response.json();
        if (result.success) {
            closeImageModal();
            browseFolder(currentPath);
            showNotification('Image deleted successfully', 'Deleted', 'success', 3000);
        } else if (result.errors && result.errors.length > 0) {
            showNotification('Error: ' + result.errors.join('\n'), 'Delete Error', 'error');
        }
    } catch (error) {
        console.error('Error deleting image:', error);
        showNotification('Error deleting image', 'Error', 'error');
    }
}

// Import Image Data
function importImageData() {
    if (!currentImageData) return;

    const isVideo = currentImageData.job_type === 'video';

    if (isVideo) {
        document.getElementById('videoPrompt').value = currentImageData.prompt || '';
        document.getElementById('videoFrames').value = currentImageData.frames || 64;
        document.getElementById('videoFps').value = currentImageData.fps || 16;
        document.getElementById('videoMegapixels').value = currentImageData.megapixels || 0.25;
        document.getElementById('videoSeed').value = currentImageData.seed || '';
        document.getElementById('videoFilePrefix').value = currentImageData.file_prefix || 'video';
        document.getElementById('videoSubfolder').value = currentImageData.subfolder || '';
        document.getElementById('videoNSFW').checked = currentImageData.nsfw || false;
        updateVideoDuration();

        if (currentImageData.source_image) {
            uploadedVideoImageFilename = currentImageData.source_image;
            const imagePreviewImg = document.getElementById('videoPreviewImg');
            const imagePreview = document.getElementById('videoImagePreview');
            const clearImageBtn = document.getElementById('clearVideoImageBtn');
            const sourceImagePath = currentImageData.source_image.replace(/\\/g, '/');
            imagePreviewImg.src = `/api/image/input/${sourceImagePath.split('/').map(s => encodeURIComponent(s)).join('/')}`;
            imagePreview.style.display = 'block';
            clearImageBtn.style.display = 'inline-flex';
        }

        closeImageModal();
        switchTab('video');
        setTimeout(() => {
            document.querySelector('#videoTab .generation-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        showNotification('Video parameters imported to form', 'Imported', 'success', 3000);
    } else {
        document.getElementById('prompt').value = currentImageData.prompt || '';
        document.getElementById('width').value = currentImageData.width || 512;
        document.getElementById('height').value = currentImageData.height || 1024;
        document.getElementById('steps').value = currentImageData.steps || 4;
        document.getElementById('cfg').value = currentImageData.cfg || 1.0;
        document.getElementById('shift').value = currentImageData.shift || 3.0;
        document.getElementById('seed').value = currentImageData.seed || '';
        document.getElementById('filePrefix').value = currentImageData.file_prefix || 'velvet';
        document.getElementById('subfolder').value = currentImageData.subfolder || '';
        document.getElementById('mcnlLora').checked = currentImageData.mcnl_lora || false;
        document.getElementById('snofsLora').checked = currentImageData.snofs_lora || false;
        document.getElementById('maleLora').checked = currentImageData.male_lora || false;

        if (currentImageData.use_image && currentImageData.image_filename) {
            uploadedImageFilename = currentImageData.image_filename;
            const imagePreviewImg = document.getElementById('imagePreviewImg');
            const imagePreview = document.getElementById('imagePreview');
            const clearImageBtn = document.getElementById('clearImageBtn');
            const useImageSizeGroup = document.getElementById('useImageSizeGroup');
            const useImageSizeCheckbox = document.getElementById('useImageSize');
            const inputImagePath = currentImageData.image_filename.replace(/\\/g, '/');
            imagePreviewImg.src = `/api/image/input/${inputImagePath.split('/').map(s => encodeURIComponent(s)).join('/')}`;
            imagePreview.style.display = 'block';
            clearImageBtn.style.display = 'inline-flex';
            useImageSizeGroup.style.display = 'block';
            useImageSizeCheckbox.checked = currentImageData.use_image_size || false;
            toggleDimensionFields();
        }

        closeImageModal();
        switchTab('single');
        setTimeout(() => {
            document.querySelector('.generation-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        showNotification('Image parameters imported to form', 'Imported', 'success', 3000);
    }
}

function openFullscreen() {
    if (images.length === 0) return;
    
    const viewer = document.getElementById('fullscreenViewer');
    viewer.classList.add('active');
    isFullscreenActive = true;
    
    // Detect which tab opened fullscreen if not already set
    if (!fullscreenSource) {
        const browserTab = document.getElementById('browserTab');
        const videosTab = document.getElementById('videosTab');
        const viewerTab = document.getElementById('viewerTab');
        
        if (browserTab && browserTab.classList.contains('active')) {
            fullscreenSource = 'browser';
        } else if (videosTab && videosTab.classList.contains('active')) {
            fullscreenSource = 'videos';
        } else if (viewerTab && viewerTab.classList.contains('active')) {
            fullscreenSource = 'viewer';
        }
    }

    if (!fullscreenSource) {
        fullscreenSource = 'browser';
    }

    fullscreenAutoFollowEnabled = getDefaultFullscreenAutoFollow(fullscreenSource);
    fullscreenLockedMediaKey = '';
    syncFullscreenAutoFollowControl();
    
    // Request browser fullscreen
    if (viewer.requestFullscreen) {
        viewer.requestFullscreen();
    } else if (viewer.webkitRequestFullscreen) {
        viewer.webkitRequestFullscreen();
    } else if (viewer.msRequestFullscreen) {
        viewer.msRequestFullscreen();
    }
    
    showFullscreenImage(currentImageIndex);
    setupMouseActivityTracking();
    setupZoomControls();
    
    // Set focus to fullscreen viewer to ensure keyboard events work
    setTimeout(() => {
        viewer.focus();
    }, 100);
    
    // Add keyboard listener directly to viewer as backup
    if (!viewer.hasAttribute('data-keyboard-attached')) {
        viewer.addEventListener('keydown', handleKeyboard);
        viewer.setAttribute('data-keyboard-attached', 'true');
    }
}

function closeFullscreen() {
    isFullscreenActive = false;
    
    // Sync viewer tab if it was the source before clearing
    if (fullscreenSource === 'viewer') {
        // Viewer tab will show the current image when you return to it
        viewerCurrentIndex = currentImageIndex;
        // Update the viewer display if still on viewer tab
        const viewerTab = document.getElementById('viewerTab');
        if (viewerTab && viewerTab.classList.contains('active')) {
            const counter = document.getElementById('viewerCounter');
            if (counter && viewerAllFiles.length > 0) {
                counter.textContent = `${viewerCurrentIndex + 1} / ${viewerAllFiles.length}`;
            }
            if (viewerAllFiles[viewerCurrentIndex]) {
                viewerCurrentData = viewerAllFiles[viewerCurrentIndex];
                displayViewerContent(viewerCurrentData);
                renderViewerMetadata(viewerCurrentData);
            }
            // Sync toggle state back to viewer
            if (viewerCurrentData) {
                if (viewerCurrentData.job_type === 'video' && viewerCurrentData.source_image) {
                    showingViewerInputImage = showingVideoInputImage;
                } else if (viewerCurrentData.use_image && viewerCurrentData.image_filename) {
                    showingViewerInputImage = showingInputImage;
                }
            }
        }
    }
    
    fullscreenSource = null; // Clear fullscreen source
    fullscreenAutoFollowEnabled = false;
    fullscreenLockedMediaKey = '';
    syncFullscreenAutoFollowControl();
    showingInputImage = false; // Reset input image toggle state
    showingVideoInputImage = false; // Reset video input toggle state
    
    // Stop autoplay
    stopAutoplay();
    
    // Exit browser fullscreen
    if (document.exitFullscreen) {
        document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
    }
    
    const viewer = document.getElementById('fullscreenViewer');
    viewer.classList.remove('active');
    // Hide reveal toggle in fullscreen when closing
    const fsToggleBtn = document.getElementById('fullscreenRevealToggle');
    if (fsToggleBtn) fsToggleBtn.style.display = 'none';
    
    // Clear mouse activity timer
    if (mouseActivityTimer) {
        clearTimeout(mouseActivityTimer);
        mouseActivityTimer = null;
    }
    
    // Clean up mouse activity tracking listeners
    cleanupMouseActivityTracking();
    
    // Reset zoom
    resetZoom();
}

function showFullscreenImage(index) {
    const sourceArray = getFullscreenSourceArray();
    console.log('showFullscreenImage called with index:', index, 'sourceArray.length:', sourceArray.length, 'fullscreenSource:', fullscreenSource);
    
    if (sourceArray.length === 0) return;
    
    // Wrap around
    if (index >= sourceArray.length) {
        currentImageIndex = 0;
    } else if (index < 0) {
        currentImageIndex = sourceArray.length - 1;
    } else {
        currentImageIndex = index;
    }
    
    const image = sourceArray[currentImageIndex];
    
    // Check if we should show video source image instead
    const hasVideoSourceImage = image.job_type === 'video' && image.source_image;
    const shouldShowVideoInput = showingVideoInputImage && hasVideoSourceImage;
    
    // Check if we should show image input instead
    const hasInputImage = image.use_image && image.image_filename;
    const shouldShowImageInput = showingInputImage && hasInputImage;
    
    // Use relative_path if available (includes subfolder), otherwise fall back to filename
    const imagePath = (image.relative_path || image.filename || image.path || '').replace(/\\/g, '/');
    const isVideo = imagePath && (imagePath.endsWith('.mp4') || imagePath.endsWith('.webm') || imagePath.endsWith('.mov'));
    
    const fsImage = document.getElementById('fullscreenImage');
    
    // Async function to apply matched sizing if enabled
    const applyMatchedSizing = async () => {
        if (!matchSizesEnabled || !hasInputImage || isVideo) {
            // Remove any previous matched sizing
            const img = document.getElementById('fullscreenImage');
            if (img && img.tagName.toLowerCase() === 'img') {
                img.style.width = '';
                img.style.height = '';
                img.style.objectFit = '';
                img.style.maxWidth = '';
                img.style.maxHeight = '';
            }
            return;
        }
        
        console.log('[Match Sizes FS] Calculating matched dimensions...');
        const outputSrc = `/outputs/${imagePath}`;
        const inputPath = image.image_filename.replace(/\\/g, '/');
        const inputSrc = `/api/image/input/${inputPath.split('/').map(s => encodeURIComponent(s)).join('/')}`;
        
        try {
            const matchedSize = await calculateMatchedSize(outputSrc, inputSrc);
            console.log('[Match Sizes FS] Calculated size:', matchedSize);
            const img = document.getElementById('fullscreenImage');
            if (matchedSize && img && img.tagName.toLowerCase() === 'img') {
                console.log(`[Match Sizes FS] Applying ${matchedSize.width}x${matchedSize.height} to fullscreen image`);
                img.style.width = `${matchedSize.width}px`;
                img.style.height = `${matchedSize.height}px`;
                img.style.maxWidth = '100%';
                img.style.maxHeight = '100%';
                img.style.objectFit = 'contain';
            }
        } catch (error) {
            console.error('[Match Sizes FS] Error applying matched sizing:', error);
        }
    };
    
    // Check if hover comparison should be used
    // Hover compare works when enabled and there's an input image
    const shouldUseHoverCompare = hoverCompareEnabled && hasInputImage && !isVideo && !shouldShowVideoInput;
    
    if (shouldShowVideoInput) {
        // Show source image instead of video
        const comparisonContainer = document.getElementById('fullscreenComparisonContainer');
        comparisonContainer.style.display = 'none';
        fsImage.style.display = 'block';
        
        if (fsImage.tagName.toLowerCase() !== 'img') {
            const img = document.createElement('img');
            img.id = 'fullscreenImage';
            img.style.transform = 'scale(1)';
            fsImage.parentNode.replaceChild(img, fsImage);
        }
        const sourceImagePath = image.source_image.replace(/\\/g, '/');
        const imgElement = document.getElementById('fullscreenImage');
        imgElement.onload = () => {
            // Video source images don't have matched sizing (no pairing)
            applyMatchedSizing();
        };
        imgElement.src = `/api/image/input/${sourceImagePath.split('/').map(s => encodeURIComponent(s)).join('/')}`;
    } else if (shouldUseHoverCompare) {
        // Use hover comparison mode - takes precedence over shouldShowImageInput
        const comparisonContainer = document.getElementById('fullscreenComparisonContainer');
        fsImage.style.display = 'none';
        comparisonContainer.style.display = 'block';
        
        // Setup comparison images
        const inputImg = document.getElementById('fullscreenComparisonInputImage');
        const outputImg = document.getElementById('fullscreenComparisonOutputImage');
        const inputPath = image.image_filename.replace(/\\/g, '/');
        const inputSrc = `/api/image/input/${inputPath.split('/').map(s => encodeURIComponent(s)).join('/')}`;
        const outputSrc = `/outputs/${imagePath}`;
        
        // Invert base/reveal based on showingInputImage state
        // Normal (showingInputImage=false): base=input, hover reveals output
        // Inverted (showingInputImage=true): base=output, hover reveals input
        if (showingInputImage) {
            // When "Show Input" toggle is active, invert the behavior
            inputImg.src = outputSrc;
            outputImg.src = inputSrc;
        } else {
            // Normal mode
            inputImg.src = inputSrc;
            outputImg.src = outputSrc;
        }
        
        // Initialize hover tracking
        initializeFullscreenHoverComparison(comparisonContainer);
    } else if (shouldShowImageInput) {
        // Show input image instead of output (when hover compare is disabled)
        const comparisonContainer = document.getElementById('fullscreenComparisonContainer');
        comparisonContainer.style.display = 'none';
        fsImage.style.display = 'block';
        
        if (fsImage.tagName.toLowerCase() !== 'img') {
            const img = document.createElement('img');
            img.id = 'fullscreenImage';
            img.style.transform = 'scale(1)';
            fsImage.parentNode.replaceChild(img, fsImage);
        }
        const inputPath = image.image_filename.replace(/\\/g, '/');
        const imgElement = document.getElementById('fullscreenImage');
        imgElement.onload = () => {
            console.log('[Match Sizes FS] Input image loaded, applying sizing');
            applyMatchedSizing();
        };
        imgElement.src = `/api/image/input/${inputPath.split('/').map(s => encodeURIComponent(s)).join('/')}`;
    } else if (isVideo) {
        // Hide comparison container for videos
        const comparisonContainer = document.getElementById('fullscreenComparisonContainer');
        comparisonContainer.style.display = 'none';
        fsImage.style.display = 'block';
        
        const videoSrc = `/outputs/${imagePath}`;
        
        // Replace img with video element if needed
        if (fsImage.tagName.toLowerCase() !== 'video') {
            const video = document.createElement('video');
            video.id = 'fullscreenImage';
            video.style.transform = 'scale(1)';
            fsImage.parentNode.replaceChild(video, fsImage);
        }
        
        const videoElement = document.getElementById('fullscreenImage');
        
        // Pause and clear existing
        videoElement.pause();
        videoElement.removeAttribute('src');
        while (videoElement.firstChild) {
            videoElement.removeChild(videoElement.firstChild);
        }
        
        // Set attributes
        videoElement.controls = true;
        videoElement.loop = true;
        videoElement.playsinline = true;
        videoElement.preload = 'auto';
        videoElement.muted = true;
        
        // Create source element
        const source = document.createElement('source');
        source.src = videoSrc;
        source.type = getVideoMimeType(imagePath);
        videoElement.appendChild(source);
        
        // Load and play
        videoElement.load();
        videoElement.addEventListener('loadedmetadata', function() {
            videoElement.play().catch(err => {
                console.warn('Fullscreen video autoplay failed:', err);
                videoElement.muted = false;
            });
        }, { once: true });
    } else {
        // Hide comparison container for regular images when hover compare is off
        const comparisonContainer = document.getElementById('fullscreenComparisonContainer');
        comparisonContainer.style.display = 'none';
        fsImage.style.display = 'block';
        
        // Replace video with img element if needed
        if (fsImage.tagName.toLowerCase() !== 'img') {
            const img = document.createElement('img');
            img.id = 'fullscreenImage';
            img.style.transform = 'scale(1)';
            fsImage.parentNode.replaceChild(img, fsImage);
        }
        const imgElement = document.getElementById('fullscreenImage');
        imgElement.onload = () => {
            console.log('[Match Sizes FS] Output image loaded, applying sizing');
            applyMatchedSizing();
        };
        imgElement.src = `/outputs/${imagePath}`;
    }
    
    // Update counter with correct array length
    document.getElementById('fullscreenCounter').textContent = `${currentImageIndex + 1} / ${sourceArray.length}`;
    
    // Update current image data for input image toggle
    currentImageData = image;
    fullscreenLockedMediaKey = getMediaIdentityKey(image);
    
    // Sync back to viewer tab if fullscreen was opened from viewer
    if (fullscreenSource === 'viewer') {
        viewerCurrentIndex = currentImageIndex;
        viewerCurrentData = image;
    }
    
    // Update input image toggle visibility
    updateInputImageToggleVisibility();
    
    // Reset zoom when changing images
    resetZoom();
}

// Zoom Functions
function adjustZoom(delta) {
    zoomLevel = Math.max(1, Math.min(5, zoomLevel + delta));
    applyZoom();
    
    // Hide controls when zooming
    const controls = document.getElementById('fullscreenControls');
    if (controls) {
        controls.classList.remove('visible');
        if (mouseActivityTimer) clearTimeout(mouseActivityTimer);
    }
}

function resetZoom() {
    zoomLevel = 1;
    zoomPanX = 0;
    zoomPanY = 0;
    applyZoom();
    
    // Hide controls when resetting zoom
    const controls = document.getElementById('fullscreenControls');
    if (controls) {
        controls.classList.remove('visible');
        if (mouseActivityTimer) clearTimeout(mouseActivityTimer);
    }
}

function applyZoom() {
    const img = document.getElementById('fullscreenImage');
    const container = document.getElementById('fullscreenImageContainer');
    
    img.style.transform = `translate(${zoomPanX}px, ${zoomPanY}px) scale(${zoomLevel})`;
    img.style.cursor = zoomLevel > 1 ? 'move' : 'default';
    
    // Enable/disable dragging based on zoom level
    if (zoomLevel > 1) {
        container.style.overflow = 'hidden';
    } else {
        container.style.overflow = 'visible';
        zoomPanX = 0;
        zoomPanY = 0;
    }
}

// Autoplay Functions
function toggleAutoplay() {
    if (isAutoplayActive) {
        stopAutoplay();
    } else {
        startAutoplay();
    }
}

function startAutoplay() {
    isAutoplayActive = true;
    
    // Update button icon
    document.querySelector('#fullscreenPlayPause .play-icon').style.display = 'none';
    document.querySelector('#fullscreenPlayPause .pause-icon').style.display = 'block';
    
    // Start the timer
    scheduleNextImage();
}

function stopAutoplay() {
    isAutoplayActive = false;
    
    // Update button icon
    document.querySelector('#fullscreenPlayPause .play-icon').style.display = 'block';
    document.querySelector('#fullscreenPlayPause .pause-icon').style.display = 'none';
    
    // Clear the timer
    if (autoplayTimer) {
        clearTimeout(autoplayTimer);
        autoplayTimer = null;
    }
}

function scheduleNextImage() {
    if (!isAutoplayActive) return;
    
    const interval = parseFloat(document.getElementById('fullscreenAutoplayInterval').value) || 3;
    const milliseconds = interval * 1000;
    
    autoplayTimer = setTimeout(() => {
        fullscreenNextImage();
        scheduleNextImage();
    }, milliseconds);
}

function fullscreenNextImage() {
    console.log('fullscreenNextImage called', 'revealFullscreenActive:', revealFullscreenActive, 'images.length:', images.length);
    if (typeof revealFullscreenActive !== 'undefined' && revealFullscreenActive && Array.isArray(revealLinkedItems) && revealLinkedItems.length > 0) {
        const total = revealLinkedItems.length;
        if (total === 0) return;
        let attempts = 0;
        let nextIndex = (currentRevealIndex + 1 + total) % total;
        // Find next index with available image for current view
        while (attempts < total) {
            const it = revealLinkedItems[nextIndex];
            const src = revealShowOutput
                ? (it.output ? `/outputs/${it.output.relative_path}` : null)
                : `/api/image/input/${it.input.path.split('/').map(s => encodeURIComponent(s)).join('/')}`;
            if (src) {
                currentRevealIndex = nextIndex;
                revealBaseFit = null;
                revealBaseFitIndex = currentRevealIndex;
                openImageInFullscreen(src, true);
                updateRevealFullscreenCounter();
                // Hide controls when changing images
                const controls = document.getElementById('fullscreenControls');
                if (controls) {
                    controls.classList.remove('visible');
                    if (typeof mouseActivityTimer !== 'undefined' && mouseActivityTimer) clearTimeout(mouseActivityTimer);
                }
                return;
            }
            attempts++;
            nextIndex = (nextIndex + 1) % total;
        }
        showNotification('No images available in this view', 'Empty View', 'warning');
    } else {
        console.log('Calling showFullscreenImage with index:', currentImageIndex + 1);
        showFullscreenImage(currentImageIndex + 1);
    }
}

function fullscreenPrevImage() {
    console.log('fullscreenPrevImage called', 'revealFullscreenActive:', revealFullscreenActive, 'images.length:', images.length);
    if (typeof revealFullscreenActive !== 'undefined' && revealFullscreenActive && Array.isArray(revealLinkedItems) && revealLinkedItems.length > 0) {
        const total = revealLinkedItems.length;
        if (total === 0) return;
        let attempts = 0;
        let prevIndex = (currentRevealIndex - 1 + total) % total;
        // Find previous index with available image for current view
        while (attempts < total) {
            const it = revealLinkedItems[prevIndex];
            const src = revealShowOutput
                ? (it.output ? `/outputs/${it.output.relative_path}` : null)
                : `/api/image/input/${it.input.path.split('/').map(s => encodeURIComponent(s)).join('/')}`;
            if (src) {
                currentRevealIndex = prevIndex;
                revealBaseFit = null;
                revealBaseFitIndex = currentRevealIndex;
                openImageInFullscreen(src, true);
                updateRevealFullscreenCounter();
                // Hide controls when changing images
                const controls = document.getElementById('fullscreenControls');
                if (controls) {
                    controls.classList.remove('visible');
                    if (typeof mouseActivityTimer !== 'undefined' && mouseActivityTimer) clearTimeout(mouseActivityTimer);
                }
                return;
            }
            attempts++;
            prevIndex = (prevIndex - 1 + total) % total;
        }
        showNotification('No images available in this view', 'Empty View', 'warning');
    } else {
        console.log('Calling showFullscreenImage with index:', currentImageIndex - 1);
        showFullscreenImage(currentImageIndex - 1);
    }
}

// Zoom Controls Setup
function setupZoomControls() {
    const img = document.getElementById('fullscreenImage');
    const container = document.getElementById('fullscreenImageContainer');
    
    // Mouse wheel zoom
    container.addEventListener('wheel', (e) => {
        if (!isFullscreenActive) return;
        e.preventDefault();
        
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        adjustZoom(delta);
    }, { passive: false });
    
    // Drag to pan when zoomed
    img.addEventListener('mousedown', (e) => {
        if (zoomLevel <= 1) return;
        e.preventDefault();
        
        isDragging = true;
        dragStartX = e.clientX - zoomPanX;
        dragStartY = e.clientY - zoomPanY;
        img.style.cursor = 'grabbing';
    });
    
    container.addEventListener('mousemove', (e) => {
        if (!isDragging || zoomLevel <= 1) return;
        e.preventDefault();
        
        zoomPanX = e.clientX - dragStartX;
        zoomPanY = e.clientY - dragStartY;
        applyZoom();
    });
    
    container.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            const img = document.getElementById('fullscreenImage');
            img.style.cursor = zoomLevel > 1 ? 'move' : 'default';
        }
    });
    
    container.addEventListener('mouseleave', () => {
        if (isDragging) {
            isDragging = false;
            const img = document.getElementById('fullscreenImage');
            img.style.cursor = zoomLevel > 1 ? 'move' : 'default';
        }
    });
    
    // Touch support for pinch-to-zoom
    container.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            // Pinch zoom start
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            lastTouchDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
        } else if (e.touches.length === 1) {
            // Single touch for swipe
            touchStartX = e.touches[0].screenX;
            touchStartY = e.touches[0].screenY;
            
            // Pan if zoomed
            if (zoomLevel > 1) {
                isDragging = true;
                dragStartX = e.touches[0].clientX - zoomPanX;
                dragStartY = e.touches[0].clientY - zoomPanY;
            }
        }
    }, false);
    
    container.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            // Pinch zoom
            e.preventDefault();
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const distance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
            
            if (lastTouchDistance > 0) {
                const delta = (distance - lastTouchDistance) * 0.01;
                adjustZoom(delta);
            }
            
            lastTouchDistance = distance;
        } else if (e.touches.length === 1 && isDragging && zoomLevel > 1) {
            // Pan when zoomed
            e.preventDefault();
            zoomPanX = e.touches[0].clientX - dragStartX;
            zoomPanY = e.touches[0].clientY - dragStartY;
            applyZoom();
        }
    }, { passive: false });
    
    container.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) {
            lastTouchDistance = 0;
        }
        
        if (e.touches.length === 0) {
            // Touch ended
            if (isDragging) {
                isDragging = false;
            } else if (touchStartX !== 0 || touchStartY !== 0) {
                // Swipe detection
                touchEndX = e.changedTouches[0].screenX;
                touchEndY = e.changedTouches[0].screenY;
                handleSwipe();
            }
        }
    }, false);
}

// Touch Support
function initTouchSupport() {
    // Touch support is now handled in setupZoomControls
}

function handleSwipe() {
    // Disable swipes when hover compare is active to prevent navigation conflicts
    if (hoverCompareEnabled) {
        return;
    }
    
    const swipeThreshold = 50;
    const diffX = touchStartX - touchEndX;
    const diffY = touchStartY - touchEndY;
    
    // Determine if swipe is more horizontal or vertical
    const isHorizontal = Math.abs(diffX) > Math.abs(diffY);
    
    if (zoomLevel <= 1) {
        if (isHorizontal && Math.abs(diffX) > swipeThreshold) {
            // Horizontal swipe - navigate images
            if (diffX > 0) {
                // Swiped left - next image
                fullscreenNextImage();
            } else {
                // Swiped right - previous image
                fullscreenPrevImage();
            }
        } else if (!isHorizontal && Math.abs(diffY) > swipeThreshold) {
            // Vertical swipe
            if (revealFullscreenActive) {
                // Toggle input/output in Reveal fullscreen
                toggleRevealView();
            } else if (isFullscreenActive && currentImageData) {
                // Toggle input/output for images/videos with input
                const hasVideoSourceImage = currentImageData.job_type === 'video' && currentImageData.source_image;
                const hasInputImage = currentImageData.use_image && currentImageData.image_filename;
                
                if (hasVideoSourceImage || hasInputImage) {
                    smartToggleInputView();
                }
            }
        }
    }
    
    // Reset touch positions
    touchStartX = 0;
    touchEndX = 0;
    touchStartY = 0;
    touchEndY = 0;
}

// Mouse Activity Tracking
function setupMouseActivityTracking() {
    const viewer = document.getElementById('fullscreenViewer');
    const controls = document.getElementById('fullscreenControls');
    const container = document.getElementById('fullscreenImageContainer');
    
    // Clean up any existing listeners first
    cleanupMouseActivityTracking();
    
    // Show controls initially so users can see them
    controls.classList.add('visible');
    
    // Hide controls after 2 seconds when visible
    const hideControls = () => {
        if (mouseActivityTimer) {
            clearTimeout(mouseActivityTimer);
        }
        mouseActivityTimer = setTimeout(() => {
            if (isFullscreenActive) {
                controls.classList.remove('visible');
            }
        }, 2000);
    };
    
    // Start the hide timer initially
    hideControls();
    
    // Toggle controls on single tap/click only
    let tapStartTime = 0;
    let tapTimeout = null;
    
    // Store listener references for cleanup
    mouseActivityListeners.touchstart = (e) => {
        if (e.touches.length === 1) {
            tapStartTime = Date.now();
        }
    };
    
    mouseActivityListeners.touchend = (e) => {
        // Only toggle if it was a quick tap (not a swipe/pan)
        const tapDuration = Date.now() - tapStartTime;
        if (e.changedTouches.length === 1 && tapDuration < 200 && !isDragging && zoomLevel <= 1) {
            e.preventDefault();
            if (controls.classList.contains('visible')) {
                controls.classList.remove('visible');
                if (mouseActivityTimer) clearTimeout(mouseActivityTimer);
            } else {
                controls.classList.add('visible');
                hideControls();
            }
        }
        tapStartTime = 0;
    };
    
    mouseActivityListeners.click = (e) => {
        // Only on image container, not on controls
        if (e.target === container || e.target.id === 'fullscreenImage') {
            if (controls.classList.contains('visible')) {
                controls.classList.remove('visible');
                if (mouseActivityTimer) clearTimeout(mouseActivityTimer);
            } else {
                controls.classList.add('visible');
                hideControls();
            }
        }
    };
    
    // Add listeners
    container.addEventListener('touchstart', mouseActivityListeners.touchstart, { passive: true });
    container.addEventListener('touchend', mouseActivityListeners.touchend, { passive: false });
    container.addEventListener('click', mouseActivityListeners.click);
}

// Clean up mouse activity tracking listeners
function cleanupMouseActivityTracking() {
    const container = document.getElementById('fullscreenImageContainer');
    if (container) {
        if (mouseActivityListeners.touchstart) {
            container.removeEventListener('touchstart', mouseActivityListeners.touchstart);
        }
        if (mouseActivityListeners.touchend) {
            container.removeEventListener('touchend', mouseActivityListeners.touchend);
        }
        if (mouseActivityListeners.click) {
            container.removeEventListener('click', mouseActivityListeners.click);
        }
    }
    // Reset listener references
    mouseActivityListeners = {
        touchstart: null,
        touchend: null,
        click: null
    };
}

// Keyboard Shortcuts
function handleKeyboard(e) {
    const imageModal = document.getElementById('imageModal');
    const fullscreenViewer = document.getElementById('fullscreenViewer');
    
    // Debug logging
    console.log('Key pressed:', e.key, 'isFullscreenActive:', isFullscreenActive, 'fullscreenViewer.active:', fullscreenViewer?.classList.contains('active'));
    
    // Fullscreen viewer controls - check both isFullscreenActive flag and class
    if (isFullscreenActive || fullscreenViewer?.classList.contains('active')) {
        console.log('Fullscreen navigation triggered');
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
            e.preventDefault();
            e.stopPropagation();
            console.log('Calling fullscreenPrevImage');
            fullscreenPrevImage();
            return;
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
            e.preventDefault();
            e.stopPropagation();
            console.log('Calling fullscreenNextImage');
            fullscreenNextImage();
            return;
        } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
            // Toggle input/source for images and videos
            e.preventDefault();
            e.stopPropagation();
            console.log('ArrowUp/W pressed in fullscreen, calling smartToggleInputView');
            smartToggleInputView();
            return;
        } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
            // Toggle input/source for images and videos
            e.preventDefault();
            e.stopPropagation();
            console.log('ArrowDown/S pressed in fullscreen, calling smartToggleInputView');
            smartToggleInputView();
            return;
        } else if (e.key === 'Escape') {
            // Close fullscreen if viewer is active
            const viewer = document.getElementById('fullscreenViewer');
            if (viewer && viewer.classList.contains('active')) {
                closeFullscreen();
            }
            return;
        } else if (e.key === '+' || e.key === '=') {
            adjustZoom(0.2);
            return;
        } else if (e.key === '-' || e.key === '_') {
            adjustZoom(-0.2);
            return;
        } else if (e.key === '0') {
            resetZoom();
            return;
        } else if (e.key === ' ') {
            e.preventDefault();
            toggleAutoplay();
            return;
        }
        return;
    }
    
    // Image modal controls
    if (imageModal.classList.contains('active')) {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
            prevImage();
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
            nextImage();
        } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
            // Toggle input/source for images and videos
            e.preventDefault();
            smartToggleInputView();
        } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
            // Toggle input/source for images and videos
            e.preventDefault();
            smartToggleInputView();
        } else if (e.key === 'Escape') {
            closeImageModal();
        }
        return;
    }
    
    // Ctrl+Enter to generate (only works in Image and Video tabs)
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        // Check which tab is currently active
        const singleTab = document.getElementById('singleTab');
        const videoTab = document.getElementById('videoTab');
        
        if (singleTab && singleTab.classList.contains('active')) {
            e.preventDefault();
            generateImage();
        } else if (videoTab && videoTab.classList.contains('active')) {
            e.preventDefault();
            generateVideo();
        }
        // Do nothing if other tabs are active
    }
}

// Utilities
function applyMatchedSizeStyle(imageElement, matchedSize) {
    if (!imageElement || !matchedSize) return;
    
    imageElement.style.width = `${matchedSize.width}px`;
    imageElement.style.height = `${matchedSize.height}px`;
    imageElement.style.objectFit = 'contain';
}

// Remove matched size styling from an image element
function removeMatchedSizeStyle(imageElement) {
    if (!imageElement) return;
    
    imageElement.style.width = '';
    imageElement.style.height = '';
    imageElement.style.objectFit = '';
}

// Input image toggle functionality for Image Browser
function initializeInputImageToggle() {
    // Click handlers are now set dynamically in updateInputImageToggleVisibility()
    // based on whether the current item is an image or video
}

function applyInputImageView() {
    if (!currentImageData || !currentImageData.use_image || !currentImageData.image_filename) {
        return; // No input image available
    }
    
    // Apply the view based on current showingInputImage flag
    if (showingInputImage) {
        // Show input image
        const inputPath = currentImageData.image_filename;
        const src = `/api/image/input/${inputPath.split('/').map(s => encodeURIComponent(s)).join('/')}`;
        
        // Update modal image if open
        const detailImage = document.getElementById('detailImage');
        if (detailImage && document.getElementById('imageModal').classList.contains('active')) {
            if (detailImage.tagName.toLowerCase() === 'img') {
                detailImage.src = src;
            }
        }
        
        // Update fullscreen image if open
        const fsImage = document.getElementById('fullscreenImage');
        if (fsImage && isFullscreenActive) {
            if (fsImage.tagName.toLowerCase() === 'img') {
                fsImage.src = src;
            }
        }
    } else {
        // Show output image (current image)
        const outputPath = currentImageData.relative_path || currentImageData.filename;
        
        // Update modal image if open
        const detailImage = document.getElementById('detailImage');
        if (detailImage && document.getElementById('imageModal').classList.contains('active')) {
            if (detailImage.tagName.toLowerCase() === 'img') {
                detailImage.src = `/outputs/${outputPath}`;
            }
        }
        
        // Update fullscreen image if open
        const fsImage = document.getElementById('fullscreenImage');
        if (fsImage && isFullscreenActive) {
            if (fsImage.tagName.toLowerCase() === 'img') {
                fsImage.src = `/outputs/${outputPath}`;
            }
        }
    }
}

async function toggleInputImageView() {
    console.log('toggleInputImageView called', 'currentImageData:', currentImageData);
    if (!currentImageData || !currentImageData.use_image || !currentImageData.image_filename) {
        console.log('No input image available, returning');
        return; // No input image available
    }
    
    // Toggle the global flag
    showingInputImage = !showingInputImage;
    console.log('Toggled showingInputImage to:', showingInputImage);
    
    const toggleBtn = document.getElementById('toggleInputImageBtn');
    const fsToggleBtn = document.getElementById('fullscreenToggleInputBtn');
    const toggleText = document.getElementById('toggleInputImageText');
    
    if (toggleText) {
        toggleText.textContent = showingInputImage ? 'Show Output' : 'Show Input';
    }
    
    if (fsToggleBtn) {
        fsToggleBtn.title = showingInputImage ? 'Show Output (↑/↓)' : 'Show Input (↑/↓)';
    }
    
    // Re-render the current image
    const imageModal = document.getElementById('imageModal');
    if (imageModal.classList.contains('active')) {
        showImageAtIndex(currentImageIndex);
    }
    if (isFullscreenActive) {
        showFullscreenImage(currentImageIndex);
    }
}

function smartToggleInputView() {
    // Smart toggle that detects whether current item is image or video
    console.log('smartToggleInputView called', 'currentImageData:', currentImageData);
    if (!currentImageData) {
        console.log('No currentImageData, returning');
        return;
    }
    
    const hasVideoSourceImage = currentImageData.job_type === 'video' && currentImageData.source_image;
    const hasInputImage = currentImageData.use_image && currentImageData.image_filename;
    
    console.log('Toggle check:', { hasVideoSourceImage, hasInputImage });
    
    if (hasVideoSourceImage) {
        console.log('Calling toggleVideoInputImageView');
        toggleVideoInputImageView();
    } else if (hasInputImage) {
        console.log('Calling toggleInputImageView');
        toggleInputImageView();
    } else {
        console.log('No input/source available to toggle');
    }
}

function toggleVideoInputImageView() {
    console.log('toggleVideoInputImageView called', 'currentImageData:', currentImageData);
    if (!currentImageData || currentImageData.job_type !== 'video' || !currentImageData.source_image) {
        console.log('No video source image available, returning');
        return; // No source image available for this video
    }
    
    // Toggle the global flag
    showingVideoInputImage = !showingVideoInputImage;
    console.log('Toggled showingVideoInputImage to:', showingVideoInputImage);
    
    const toggleBtn = document.getElementById('toggleInputImageBtn');
    const fsToggleBtn = document.getElementById('fullscreenToggleInputBtn');
    const toggleText = document.getElementById('toggleInputImageText');
    
    if (toggleText) {
        toggleText.textContent = showingVideoInputImage ? 'Show Video' : 'Show Source';
    }
    
    if (fsToggleBtn) {
        fsToggleBtn.title = showingVideoInputImage ? 'Show Video (↑/↓)' : 'Show Source (↑/↓)';
    }
    
    // Re-render the current image/video
    const imageModal = document.getElementById('imageModal');
    if (imageModal.classList.contains('active')) {
        showImageAtIndex(currentImageIndex);
    }
    if (isFullscreenActive) {
        showFullscreenImage(currentImageIndex);
    }
}

function updateInputImageToggleVisibility() {
    const hasInputImage = currentImageData && currentImageData.use_image && currentImageData.image_filename;
    const hasVideoSourceImage = currentImageData && currentImageData.job_type === 'video' && currentImageData.source_image;
    
    const toggleBtn = document.getElementById('toggleInputImageBtn');
    const fsToggleBtn = document.getElementById('fullscreenToggleInputBtn');
    const toggleText = document.getElementById('toggleInputImageText');
    const matchSizesLabel = document.getElementById('matchSizesLabel');
    const fullscreenMatchSizesLabel = document.getElementById('fullscreenMatchSizesLabel');
    const hoverCompareLabel = document.getElementById('hoverCompareLabel');
    
    // Show button if either image has input or video has source
    const shouldShow = hasInputImage || hasVideoSourceImage;
    
    if (toggleBtn) {
        toggleBtn.style.display = shouldShow ? 'inline-flex' : 'none';
    }
    
    if (fsToggleBtn) {
        fsToggleBtn.style.display = shouldShow ? 'inline-flex' : 'none';
    }
    
    // Show match sizes checkbox only for images with input (not for videos)
    const shouldShowMatchSizes = hasInputImage && !hasVideoSourceImage;
    if (matchSizesLabel) {
        matchSizesLabel.style.display = shouldShowMatchSizes ? 'inline-flex' : 'none';
    }
    if (fullscreenMatchSizesLabel) {
        fullscreenMatchSizesLabel.style.display = shouldShowMatchSizes ? 'inline-flex' : 'none';
    }
    
    // Show hover compare checkbox only for images with input (not for videos)
    if (hoverCompareLabel) {
        hoverCompareLabel.style.display = shouldShowMatchSizes ? 'inline-flex' : 'none';
    }
    
    // Show hover radius control only when hover compare is enabled
    const hoverRadiusControl = document.getElementById('hoverRadiusControl');
    if (hoverRadiusControl) {
        const shouldShowRadiusControl = shouldShowMatchSizes && hoverCompareEnabled;
        hoverRadiusControl.style.display = shouldShowRadiusControl ? 'flex' : 'none';
    }
    
    // Fullscreen hover compare controls
    const fullscreenHoverCompareLabel = document.getElementById('fullscreenHoverCompareLabel');
    if (fullscreenHoverCompareLabel) {
        fullscreenHoverCompareLabel.style.display = shouldShowMatchSizes ? 'inline-flex' : 'none';
    }
    
    const fullscreenHoverRadiusControl = document.getElementById('fullscreenHoverRadiusControl');
    if (fullscreenHoverRadiusControl) {
        const shouldShowRadiusControl = shouldShowMatchSizes && hoverCompareEnabled;
        fullscreenHoverRadiusControl.style.display = shouldShowRadiusControl ? 'flex' : 'none';
    }
    
    // Update button text and click handler based on content type
    if (hasVideoSourceImage) {
        // Video mode
        if (toggleText) {
            toggleText.textContent = showingVideoInputImage ? 'Show Video' : 'Show Source';
        }
        if (fsToggleBtn) {
            fsToggleBtn.title = showingVideoInputImage ? 'Show Video (↑/↓)' : 'Show Source (↑/↓)';
        }
        // Update onclick handlers for video mode
        if (toggleBtn) {
            toggleBtn.onclick = toggleVideoInputImageView;
        }
        // Note: fsToggleBtn uses addEventListener for smartToggleInputView, don't set onclick
        // Auto-apply video input if global flag is set
        if (showingVideoInputImage) {
            const imageModal = document.getElementById('imageModal');
            if (imageModal.classList.contains('active')) {
                showImageAtIndex(currentImageIndex);
            }
            if (isFullscreenActive) {
                showFullscreenImage(currentImageIndex);
            }
        }
    } else if (hasInputImage) {
        // Image mode
        if (toggleText) {
            toggleText.textContent = showingInputImage ? 'Show Output' : 'Show Input';
        }
        if (fsToggleBtn) {
            fsToggleBtn.title = showingInputImage ? 'Show Output (↑/↓)' : 'Show Input (↑/↓)';
        }
        // Update onclick handlers for image mode
        if (toggleBtn) {
            toggleBtn.onclick = toggleInputImageView;
        }
        // Note: fsToggleBtn uses addEventListener for smartToggleInputView, don't set onclick
        // Auto-apply image input if global flag is set
        if (showingInputImage) {
            applyInputImageView();
        }
    }
}

// ============================================================================
// VIDEOS BROWSER
// ============================================================================
let videosCurrentPath = '';
let videosItems = [];
let currentVideoIndex = 0;

function initializeVideoBrowser() {
    const refreshBtn = document.getElementById('videosRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => loadVideos('videos'));

    const playToggle = document.getElementById('videosPlayToggle');
    if (playToggle) {
        const savedPlaySetting = localStorage.getItem('videosPlayEnabled');
        videosPlayEnabled = savedPlaySetting === 'true';
        playToggle.checked = videosPlayEnabled;

        playToggle.addEventListener('change', (event) => {
            const shouldPlay = Boolean(event.target && event.target.checked);
            setVideosGridPlaybackMode(shouldPlay);
        });
    }
}

async function loadVideos(path) {
    const requestToken = ++videosRequestToken;
    let quickRenderCompleted = false;
    setLoadingOverlay('videosGrid', 'videosGridLoadingOverlay', true, 'Loading videos...');
    setBrowserTopLoadingStatus('videosBreadcrumb', 'videosBreadcrumbLoadingStatus', true, 'Loading folder...');

    if (videosAbortController) {
        videosAbortController.abort();
    }
    videosAbortController = new AbortController();

    try {
        const normalizedPath = path || 'videos';
        const countCacheScope = 'main-videos';
        const folderCountCacheScope = 'main-videos-folders';
        const cachedCount = getSessionCachedBrowserCount(countCacheScope, normalizedPath);
        const videoBrowserCount = document.getElementById('videoBrowserCount');

        if (Number.isInteger(cachedCount)) {
            renderVideosBreadcrumb(normalizedPath, cachedCount);
            if (videoBrowserCount) {
                videoBrowserCount.textContent = String(cachedCount);
            }
        }

                // Quick fetch: include metadata (prompts) immediately; skip slow folder counts.
        const quickResponse = await fetch(`/api/browse?path=${encodeURIComponent(normalizedPath)}&root=videos&with_counts=0&with_metadata=1`, {
            signal: videosAbortController.signal
        });
        const quickData = await quickResponse.json();

        if (requestToken !== videosRequestToken) {
            return;
        }

        if (quickData.success === false) {
            throw new Error(quickData.error || 'Failed to load videos');
        }
        
        videosCurrentPath = quickData.current_path || '';
        
        // Filter to only show videos
        const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
        const videoFiles = (quickData.files || []).filter(file => {
            const filename = file.filename || '';
            const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
            return videoExtensions.includes(ext);
        });

        const videoFileCount = Number.isInteger(quickData.current_counts?.videos)
            ? quickData.current_counts.videos
            : videoFiles.length;
        
        const quickHydratedFolders = mergeFolderCountsFromSession(folderCountCacheScope, quickData.folders || []);
        videosItems = videoFiles;
        renderVideosBreadcrumb(videosCurrentPath, videoFileCount);
        renderVideosGrid(quickHydratedFolders, videoFiles);

        if (isFullscreenActive) {
            syncFullscreenAfterDataRefresh('videos');
        }

        if (videoBrowserCount) {
            videoBrowserCount.textContent = String(videoFileCount);
        }
        setSessionCachedBrowserCount(countCacheScope, videosCurrentPath || normalizedPath, videoFileCount);

        videosLastLoadedPath = videosCurrentPath || 'videos';
        videosLastLoadedAt = Date.now();
        quickRenderCompleted = true;
        setLoadingOverlay('videosGrid', 'videosGridLoadingOverlay', false);

                                        // Background fetch: populate folder counts only (metadata already shown in first pass).
        setBrowserTopLoadingStatus('videosBreadcrumb', 'videosBreadcrumbLoadingStatus', true, 'Loading details...');
        const detailsResponse = await fetch(`/api/browse?path=${encodeURIComponent(normalizedPath)}&root=videos&with_metadata=0`, {
            signal: videosAbortController.signal
        });
        const data = await detailsResponse.json();

        if (requestToken !== videosRequestToken) {
            return;
        }

        if (data.success === false) {
            throw new Error(data.error || 'Failed to load video details');
        }

        // Only update folder counts and breadcrumb – do NOT re-render the video grid
        // with the metadata-free file list, which would wipe out prompts/info shown
        // in the first pass.
        const detailsFolders = data.folders || [];
        rememberSessionFolderCounts(folderCountCacheScope, detailsFolders);

        const detailedVideoCount = Number.isInteger(data.current_counts?.videos)
            ? data.current_counts.videos
            : videosItems.length;

        renderVideosBreadcrumb(videosCurrentPath, detailedVideoCount);
        // Patch folder counts into already-rendered grid items.
        updateRenderedFolderCounts(detailsFolders);

        if (isFullscreenActive) {
            syncFullscreenAfterDataRefresh('videos');
        }

        if (videoBrowserCount) {
            videoBrowserCount.textContent = String(detailedVideoCount);
        }
        setSessionCachedBrowserCount(countCacheScope, videosCurrentPath || normalizedPath, detailedVideoCount);

        videosLastLoadedPath = videosCurrentPath || 'videos';
        videosLastLoadedAt = Date.now();
    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }
        console.error('Error loading videos:', error);
        if (!quickRenderCompleted) {
            showNotification('Error loading videos', 'Error', 'error');
        }
    } finally {
        if (requestToken === videosRequestToken) {
            setLoadingOverlay('videosGrid', 'videosGridLoadingOverlay', false);
            setBrowserTopLoadingStatus('videosBreadcrumb', 'videosBreadcrumbLoadingStatus', false);
            videosAbortController = null;
        }
    }
}

function renderVideosBreadcrumb(path, videoFileCount = null) {
    const breadcrumb = document.getElementById('videosBreadcrumb');
    if (!breadcrumb) return;
    
    // Remove 'videos' prefix from path for display (since we're rooted in videos folder)
    let displayPath = path;
    if (displayPath && displayPath.startsWith('videos/')) {
        displayPath = displayPath.substring(7); // Remove 'videos/'
    } else if (displayPath === 'videos') {
        displayPath = '';
    }
    
    const parts = displayPath ? displayPath.split(/[/\\]/).filter(p => p) : [];
    let html = '<span class="breadcrumb-item" onclick="loadVideos(\'videos\')">🏠 Videos</span>';
    
    let currentPath = 'videos';
    parts.forEach((part, index) => {
        currentPath += '/' + part;
        const pathCopy = currentPath;
        html += ' / ';
        html += `<span class="breadcrumb-item" onclick="loadVideos('${pathCopy}')">${escapeHtml(part)}</span>`;
    });

    if (Number.isInteger(videoFileCount)) {
        html += ` <span style="color: var(--text-muted);">(${videoFileCount} ${videoFileCount === 1 ? 'video' : 'videos'})</span>`;
    }
    
    breadcrumb.innerHTML = html;
}

function renderVideosGrid(folders, videos) {
    const grid = document.getElementById('videosGrid');
    const empty = document.getElementById('videosEmpty');
    if (!grid || !empty) return;
    
    let html = '';
    
    // Add back button if not at videos root
    if (videosCurrentPath && videosCurrentPath !== 'videos') {
        const parentPath = videosCurrentPath.split(/[/\\]/).slice(0, -1).join('/');
        // Ensure parent path doesn't go above 'videos' folder
        const finalParentPath = parentPath || 'videos';
        html += `
            <div class="gallery-item folder-item" onclick="loadVideos('${finalParentPath}')">
                <div class="folder-icon">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                </div>
                <div class="gallery-item-info">
                    <div class="gallery-item-prompt">..</div>
                </div>
            </div>
        `;
    }
    
    // Render folders
    folders.forEach(folder => {
        const escapedPath = escapeJsString(folder.path);
        const fallbackVideoCount = Number.isInteger(folder.video_count) ? folder.video_count : null;
        const folderLabel = formatBrowserFolderLabel(folder.name, folder, fallbackVideoCount);
        html += `
            <div class="gallery-item folder-item" data-path="${escapeHtml(folder.path)}" onclick="loadVideos('${escapedPath}')">
                <div class="folder-icon">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
                <div class="gallery-item-info">
                    <div class="gallery-item-prompt">${escapeHtml(folderLabel)}</div>
                </div>
            </div>
        `;
    });
    
    // Render videos
    videos.forEach((video, index) => {
        const fullTitle = (video.prompt || video.filename || '').toString();
        const shortTitle = shortenBrowserMediaTitle(fullTitle || 'Untitled video');
        html += `
            <div class="gallery-item video-hover-preview" onclick="openVideoModal(${index})">
                <div style="position: relative; width: 100%; height: 100%;">
                    <img src="/api/thumbnail/${video.relative_path}" class="gallery-item-image" style="object-fit: contain; width: 100%; height: 100%; background: var(--bg-secondary);" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                    <video src="/outputs/${video.relative_path}" class="gallery-item-image" style="object-fit: contain; width: 100%; height: 100%; background: var(--bg-secondary); display: none;" playsinline muted loop preload="none"></video>
                    <div class="video-card-play-overlay" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none; transition: opacity 0.15s ease;">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="white" opacity="0.8">
                            <circle cx="12" cy="12" r="10" fill="rgba(0,0,0,0.5)"></circle>
                            <polygon points="10 8 16 12 10 16" fill="white"></polygon>
                        </svg>
                    </div>
                </div>
                <div class="gallery-item-info">
                    <div class="gallery-item-prompt gallery-item-media-title" title="${escapeHtml(fullTitle || 'Untitled video')}">${escapeHtml(shortTitle)}</div>
                    <div class="gallery-item-meta">
                        <span class="param-badge">Video</span>
                        ${video.frames ? `<span class="param-badge">${video.frames} frames</span>` : ''}
                        ${video.fps ? `<span class="param-badge">${video.fps} fps</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    });
    
    if (html) {
        grid.innerHTML = html;
        bindVideoHoverPreviews(grid);
        applyVideosGridPlaybackMode(grid);
        grid.style.display = 'grid';
        empty.style.display = 'none';
    } else {
        disposeVideosPlaybackObserver();
        grid.style.display = 'none';
        empty.style.display = 'block';
    }
}

function openVideoModal(index) {
    if (index < 0 || index >= videosItems.length) return;

    stopActiveVideoPreview();
    
    currentVideoIndex = index;
    const video = videosItems[index];
    
    // Save the current images array before replacing it with videos
    savedImages = images;
    // Use the regular image modal which supports videos
    images = videosItems;
    currentImageIndex = index;
    showImageAtIndex(index);
    document.getElementById('imageModal').classList.add('active');
}

// ─── Viewer state ───────────────────────────────────────────────────────────
let viewerRefreshInterval = null;
let viewerInactivityTimer = null;
let viewerCurrentData = null;
let viewerAllFiles = [];
let viewerCurrentIndex = 0;
let showingViewerInputImage = false;
// ────────────────────────────────────────────────────────────────────────────

function initializeViewer() {
    const refreshBtn = document.getElementById('viewerRefreshBtn');
    const fullscreenBtn = document.getElementById('viewerFullscreenBtn');
    const toggleInputBtn = document.getElementById('viewerToggleInputBtn');
    const viewerContent = document.getElementById('viewerContent');
    const viewerImageWrapper = document.getElementById('viewerImageWrapper');
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadRecentGeneration);
    }
    
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', openViewerFullscreen);
    }
    
    if (toggleInputBtn) {
        toggleInputBtn.addEventListener('click', toggleViewerInputView);
    }
    
    // Mouse/keyboard activity tracking for control hiding
    if (viewerContent) {
        viewerContent.addEventListener('mousemove', resetViewerInactivity);
        viewerContent.addEventListener('click', resetViewerInactivity);
        viewerContent.addEventListener('touchstart', resetViewerInactivity);
        
        // Touch swipe navigation for mobile
        let touchStartX = 0;
        let touchStartY = 0;
        let touchEndX = 0;
        let touchEndY = 0;
        
        viewerContent.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });
        
        viewerContent.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            handleViewerSwipe();
        }, { passive: true });
        
        function handleViewerSwipe() {
            const diffX = touchEndX - touchStartX;
            const diffY = touchEndY - touchStartY;
            const minSwipeDistance = 50;
            
            // Only navigate if horizontal swipe is dominant
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > minSwipeDistance) {
                if (diffX > 0) {
                    // Swipe right - previous
                    navigateViewer(-1);
                } else {
                    // Swipe left - next
                    navigateViewer(1);
                }
            }
        }
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        const viewerTab = document.getElementById('viewerTab');
        const fullscreenViewer = document.getElementById('fullscreenViewer');
        
        // Don't handle if fullscreen is active (let main handler deal with it)
        if (fullscreenViewer && fullscreenViewer.classList.contains('active')) return;
        
        // Only handle if viewer tab is active
        if (!viewerTab || !viewerTab.classList.contains('active')) return;
        
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
            e.preventDefault();
            navigateViewer(-1);
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
            e.preventDefault();
            navigateViewer(1);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'i' || e.key === 'I' || e.key === 'o' || e.key === 'O') {
            e.preventDefault();
            toggleViewerInputView();
        } else if (e.key === 'f' || e.key === 'F') {
            e.preventDefault();
            openViewerFullscreen();
        } else if (e.key === 'r' || e.key === 'R') {
            e.preventDefault();
            loadRecentGeneration();
        }
    });
    
    // Auto-load when switching to viewer tab
    const viewerTabBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.dataset.tab === 'viewer');
    if (viewerTabBtn) {
        viewerTabBtn.addEventListener('click', () => {
            loadRecentGeneration();
            startViewerAutoRefresh();
        });
    }
}

function startViewerAutoRefresh() {
    // Clear existing interval
    if (viewerRefreshInterval) {
        clearInterval(viewerRefreshInterval);
    }
    
    // Refresh every 3 seconds
    viewerRefreshInterval = setInterval(() => {
        const viewerTab = document.getElementById('viewerTab');
        if (viewerTab && viewerTab.classList.contains('active')) {
            loadRecentGeneration();
        }
    }, 3000);
}

function stopViewerAutoRefresh() {
    if (viewerRefreshInterval) {
        clearInterval(viewerRefreshInterval);
        viewerRefreshInterval = null;
    }
}

async function loadRecentGeneration() {
    const loading = document.getElementById('viewerLoading');
    const empty = document.getElementById('viewerEmpty');
    const wrapper = document.getElementById('viewerImageWrapper');
    const metadata = document.getElementById('viewerMetadata');
    const counter = document.getElementById('viewerCounter');
    const prevBtn = document.getElementById('viewerPrev');
    const nextBtn = document.getElementById('viewerNext');
    const headerTitle = document.querySelector('.viewer-header h2');
    
    // Preserve current index and file ID to maintain position
    const currentFileId = viewerCurrentData ? viewerCurrentData.id : null;
    const preservedIndex = viewerCurrentIndex;
    const previousFileCount = viewerAllFiles.length;
    
    try {
        const response = await fetch('/api/recent');
        const data = await response.json();
        
        if (data.success && data.files && data.files.length > 0) {
            viewerAllFiles = data.files;
            
            // Check if new generation was added (more files or different first file)
            const newGenerationAdded = viewerAllFiles.length > previousFileCount || 
                                       (previousFileCount > 0 && viewerAllFiles[0].id !== data.files[0].id);
            
            if (newGenerationAdded) {
                // Jump to most recent (index 0)
                viewerCurrentIndex = 0;
                // Reset toggle state for new generation
                showingViewerInputImage = false;
                console.log('New generation detected, jumping to most recent');
                
                // If fullscreen is active from viewer, sync it to show new generation
                if (isFullscreenActive && fullscreenSource === 'viewer') {
                    syncFullscreenAfterDataRefresh('viewer');
                }
            } else {
                // Try to maintain position after refresh
                if (currentFileId) {
                    // Find the same file by ID
                    const foundIndex = viewerAllFiles.findIndex(f => f.id === currentFileId);
                    if (foundIndex >= 0) {
                        viewerCurrentIndex = foundIndex;
                    } else if (preservedIndex < viewerAllFiles.length) {
                        // File removed, keep same index if valid
                        viewerCurrentIndex = preservedIndex;
                    } else {
                        // Index out of range, reset to first
                        viewerCurrentIndex = 0;
                    }
                } else {
                    // No previous file, start at 0
                    viewerCurrentIndex = 0;
                }
            }
            
            const newData = viewerAllFiles[viewerCurrentIndex];
            
            // Only update display if content actually changed
            const contentChanged = !viewerCurrentData || 
                                   viewerCurrentData.id !== newData.id ||
                                   viewerCurrentData.path !== newData.path;
            
            viewerCurrentData = newData;
            
            if (contentChanged) {
                displayViewerContent(viewerCurrentData);
            }
            
            if (loading) loading.style.display = 'none';
            if (empty) empty.style.display = 'none';
            if (wrapper) wrapper.style.display = 'flex';
            
            // Always update metadata and counter (lightweight updates)
            if (metadata) {
                metadata.style.display = 'block';
                renderViewerMetadata(viewerCurrentData);
            }
            if (counter) {
                counter.style.display = 'block';
                counter.textContent = `${viewerCurrentIndex + 1} / ${viewerAllFiles.length}`;
            }
            if (headerTitle) {
                headerTitle.textContent = viewerAllFiles.length > 1 ? 'Recent Generations' : 'Most Recent Generation';
            }
            // Show navigation arrows if more than one item
            if (prevBtn) prevBtn.style.display = viewerAllFiles.length > 1 ? 'flex' : 'none';
            if (nextBtn) nextBtn.style.display = viewerAllFiles.length > 1 ? 'flex' : 'none';
        } else {
            if (loading) loading.style.display = 'none';
            if (empty) empty.style.display = 'block';
            if (wrapper) wrapper.style.display = 'none';
            if (metadata) metadata.style.display = 'none';
            if (counter) counter.style.display = 'none';
            if (prevBtn) prevBtn.style.display = 'none';
            if (nextBtn) nextBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading recent generation:', error);
        if (loading) loading.style.display = 'none';
        if (empty) {
            empty.style.display = 'block';
            empty.innerHTML = '<p>Error loading recent generation</p>';
        }
        if (wrapper) wrapper.style.display = 'none';
        if (metadata) metadata.style.display = 'none';
        if (counter) counter.style.display = 'none';
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
    }
}

function navigateViewer(direction) {
    if (viewerAllFiles.length === 0) return;
    
    viewerCurrentIndex += direction;
    
    // Wrap around
    if (viewerCurrentIndex >= viewerAllFiles.length) {
        viewerCurrentIndex = 0;
    } else if (viewerCurrentIndex < 0) {
        viewerCurrentIndex = viewerAllFiles.length - 1;
    }
    
    viewerCurrentData = viewerAllFiles[viewerCurrentIndex];
    displayViewerContent(viewerCurrentData);
    renderViewerMetadata(viewerCurrentData);
    
    const counter = document.getElementById('viewerCounter');
    if (counter) {
        counter.textContent = `${viewerCurrentIndex + 1} / ${viewerAllFiles.length}`;
    }
    
    resetViewerInactivity();
}

function displayViewerContent(file) {
    const img = document.getElementById('viewerImage');
    const video = document.getElementById('viewerVideo');
    const wrapper = document.getElementById('viewerImageWrapper');
    
    if (!file) {
        console.error('No file provided to displayViewerContent');
        return;
    }
    
    // Update toggle button visibility
    updateViewerInputToggleVisibility(file);
    
    // Determine if we should show input instead of output
    let shouldShowInput = false;
    if (showingViewerInputImage) {
        if (file.job_type === 'video' && file.source_image) {
            shouldShowInput = true;
        } else if (file.use_image && file.image_filename) {
            shouldShowInput = true;
        }
    }
    
    // Get the path - handle Windows backslashes
    let imagePath;
    if (shouldShowInput) {
        // Show input image/video source
        if (file.job_type === 'video' && file.source_image) {
            imagePath = file.source_image.replace(/\\/g, '/');
        } else if (file.image_filename) {
            imagePath = file.image_filename.replace(/\\/g, '/');
        } else {
            imagePath = (file.relative_path || file.filename || file.path || '').replace(/\\/g, '/');
        }
    } else {
        imagePath = (file.relative_path || file.filename || file.path || '').replace(/\\/g, '/');
    }
    const isVideo = imagePath && (imagePath.endsWith('.mp4') || imagePath.endsWith('.webm') || imagePath.endsWith('.mov'));
    
    // Check if this is the same content already displayed - prevent unnecessary updates
    const currentSrc = isVideo ? (video.querySelector('source')?.src || '') : (img.src || '');
    // Use appropriate endpoint based on whether showing input
    const newSrc = shouldShowInput ? `/api/video/${encodeURIComponent(imagePath)}` : `/outputs/${imagePath}`;
    const isSameContent = currentSrc.endsWith(imagePath);
    
    console.log('Display check:', { path: imagePath, isVideo, isSameContent, currentSrc, newSrc });
    
    // Async function to apply matched sizing if enabled
    const applyMatchedSizing = async () => {
        if (!matchSizesEnabled || !file.use_image || !file.image_filename || isVideo) {
            // Remove any previous matched sizing
            if (img) {
                img.style.width = '';
                img.style.height = '';
                img.style.objectFit = '';
            }
            return;
        }
        
        console.log('[Match Sizes] Calculating matched dimensions...');
        const outputSrc = `/outputs/${(file.relative_path || file.filename || file.path || '').replace(/\\/g, '/')}`;
        const inputPath = file.image_filename.replace(/\\/g, '/');
        const inputSrc = `/api/video/${encodeURIComponent(inputPath)}`;
        
        try {
            const matchedSize = await calculateMatchedSize(outputSrc, inputSrc);
            console.log('[Match Sizes] Calculated size:', matchedSize);
            if (matchedSize && img) {
                console.log(`[Match Sizes] Applying ${matchedSize.width}x${matchedSize.height} to image`);
                // Set fixed dimensions for the image box
                img.style.width = `${matchedSize.width}px`;
                img.style.height = `${matchedSize.height}px`;
                // Constrain to viewport size - both dimensions use matched size as base
                // but will scale down proportionally to fit viewport
                img.style.maxWidth = '100%';
                img.style.maxHeight = '100%';
                img.style.objectFit = 'contain';
            }
        } catch (error) {
            console.error('[Match Sizes] Error applying matched sizing:', error);
        }
    };
    
    if (isVideo) {
        // Hide image
        if (img) img.style.display = 'none';
        
        if (video) {
            // If same video is already playing, don't restart it
            if (isSameContent && video.style.display === 'block') {
                console.log('Same video already playing, skipping update');
                return;
            }
            
            // Clean up existing video
            video.pause();
            video.removeAttribute('src');
            video.load();
            
            // Clear any existing source elements
            while (video.firstChild) {
                video.removeChild(video.firstChild);
            }
            
            console.log('Loading new video:', newSrc);
            
            // Create source element with explicit MIME type
            const source = document.createElement('source');
            source.src = newSrc;
            source.type = getVideoMimeType(imagePath);
            video.appendChild(source);
            
            // Set video attributes
            video.style.display = 'block';
            video.loop = true;
            video.controls = true;
            video.muted = true; // Muted for autoplay
            video.playsinline = true;
            video.preload = 'auto';
            
            // Remove any old event listeners by cloning
            const newVideo = video.cloneNode(true);
            video.parentNode.replaceChild(newVideo, video);
            
            // Add load event listener
            newVideo.addEventListener('loadedmetadata', function() {
                console.log('Video metadata loaded, attempting play');
                newVideo.play().then(() => {
                    console.log('Video playing successfully');
                }).catch(err => {
                    console.warn('Video autoplay failed:', err);
                    // Try unmuting if autoplay fails
                    newVideo.muted = false;
                });
            });
            
            // Add error handler
            newVideo.addEventListener('error', function(e) {
                console.error('Video error:', e, newVideo.error);
            });
            
            // Start loading
            newVideo.load();
        }
    } else {
        // Display image
        if (video) {
            video.pause();
            video.removeAttribute('src');
            video.load();
            video.style.display = 'none';
        }
        if (img) {
            // Only update if different image
            if (!isSameContent) {
                console.log('Loading new image:', newSrc);
                // Wait for image to load before applying matched sizing
                img.onload = () => {
                    console.log('Image loaded, applying matched sizing if enabled');
                    applyMatchedSizing();
                };
                img.src = newSrc;
            } else {
                // Same image - just reapply sizing if needed
                applyMatchedSizing();
            }
            img.style.display = 'block';
        }
    }
    
    resetViewerInactivity();
}

function renderViewerMetadata(file) {
    const container = document.getElementById('viewerMetadata');
    if (!container) return;
    
    const isVideo = file.job_type === 'video';
    
    let html = '<h3>Metadata</h3>';
    
    // Prompt
    if (file.prompt) {
        html += `
            <div class="metadata-row">
                <div class="metadata-label">Prompt</div>
                <div class="metadata-value">${escapeHtml(file.prompt)}</div>
            </div>
        `;
    }
    
    // Filename
    html += `
        <div class="metadata-row">
            <div class="metadata-label">Filename</div>
            <div class="metadata-value">${escapeHtml(file.filename || 'N/A')}</div>
        </div>
    `;
    
    // Type
    html += `
        <div class="metadata-row">
            <div class="metadata-label">Type</div>
            <div class="metadata-value">${isVideo ? 'Video' : 'Image'}</div>
        </div>
    `;
    
    if (isVideo) {
        // Video-specific metadata
        if (file.frames) {
            html += `
                <div class="metadata-row">
                    <div class="metadata-label">Frames</div>
                    <div class="metadata-value">${file.frames}</div>
                </div>
            `;
        }
        if (file.fps) {
            html += `
                <div class="metadata-row">
                    <div class="metadata-label">FPS</div>
                    <div class="metadata-value">${file.fps}</div>
                </div>
            `;
        }
        if (file.megapixels) {
            html += `
                <div class="metadata-row">
                    <div class="metadata-label">Megapixels</div>
                    <div class="metadata-value">${file.megapixels}</div>
                </div>
            `;
        }
    } else {
        // Image-specific metadata
        if (file.width && file.height) {
            html += `
                <div class="metadata-row">
                    <div class="metadata-label">Dimensions</div>
                    <div class="metadata-value">${file.width} × ${file.height}</div>
                </div>
            `;
        }
        if (file.steps) {
            html += `
                <div class="metadata-row">
                    <div class="metadata-label">Steps</div>
                    <div class="metadata-value">${file.steps}</div>
                </div>
            `;
        }
        if (file.cfg) {
            html += `
                <div class="metadata-row">
                    <div class="metadata-label">CFG</div>
                    <div class="metadata-value">${file.cfg}</div>
                </div>
            `;
        }
    }
    
    // Seed
    if (file.seed) {
        html += `
            <div class="metadata-row">
                <div class="metadata-label">Seed</div>
                <div class="metadata-value">${file.seed}</div>
            </div>
        `;
    }
    
    // Timestamp
    if (file.timestamp) {
        const date = new Date(file.timestamp);
        html += `
            <div class="metadata-row">
                <div class="metadata-label">Generated</div>
                <div class="metadata-value">${date.toLocaleString()}</div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

function resetViewerInactivity() {
    const header = document.querySelector('.viewer-header');
    const metadata = document.getElementById('viewerMetadata');
    
    // Show controls
    if (header) header.style.opacity = '1';
    if (metadata) metadata.classList.remove('hidden');
    
    // Clear existing timer
    if (viewerInactivityTimer) {
        clearTimeout(viewerInactivityTimer);
    }
    
    // Set new timer (hide after 3 seconds of inactivity)
    viewerInactivityTimer = setTimeout(() => {
        if (header) header.style.opacity = '0';
        if (metadata) metadata.classList.add('hidden');
    }, 3000);
}

function toggleViewerInputView() {
    if (!viewerCurrentData) {
        return;
    }
    
    const hasInputImage = viewerCurrentData.use_image && viewerCurrentData.image_filename;
    const hasVideoSourceImage = viewerCurrentData.job_type === 'video' && viewerCurrentData.source_image;
    
    if (!hasInputImage && !hasVideoSourceImage) {
        return; // No input available
    }
    
    // Toggle the global flag
    showingViewerInputImage = !showingViewerInputImage;
    
    const toggleBtn = document.getElementById('viewerToggleInputBtn');
    const toggleText = document.getElementById('viewerToggleInputText');
    
    // Update button text based on content type
    if (hasVideoSourceImage) {
        if (toggleText) {
            toggleText.textContent = showingViewerInputImage ? 'Show Video' : 'Show Source';
        }
        if (toggleBtn) {
            toggleBtn.title = showingViewerInputImage ? 'Show Video' : 'Show Source';
        }
    } else if (hasInputImage) {
        if (toggleText) {
            toggleText.textContent = showingViewerInputImage ? 'Show Output' : 'Show Input';
        }
        if (toggleBtn) {
            toggleBtn.title = showingViewerInputImage ? 'Show Output' : 'Show Input';
        }
    }
    
    // Re-render the current content
    displayViewerContent(viewerCurrentData);
}

function updateViewerInputToggleVisibility(file) {
    const hasInputImage = file && file.use_image && file.image_filename;
    const hasVideoSourceImage = file && file.job_type === 'video' && file.source_image;
    
    const toggleBtn = document.getElementById('viewerToggleInputBtn');
    const toggleText = document.getElementById('viewerToggleInputText');
    const matchSizesLabel = document.getElementById('viewerMatchSizesLabel');
    
    // Show button if either image has input or video has source
    const shouldShow = hasInputImage || hasVideoSourceImage;
    
    if (toggleBtn) {
        toggleBtn.style.display = shouldShow ? 'inline-flex' : 'none';
    }
    
    // Show match sizes checkbox only for images with input (not for videos)
    const shouldShowMatchSizes = hasInputImage && !hasVideoSourceImage;
    if (matchSizesLabel) {
        matchSizesLabel.style.display = shouldShowMatchSizes ? 'inline-flex' : 'none';
    }
    
    // Update button text based on content type
    if (hasVideoSourceImage) {
        if (toggleText) {
            toggleText.textContent = showingViewerInputImage ? 'Show Video' : 'Show Source';
        }
        if (toggleBtn) {
            toggleBtn.title = showingViewerInputImage ? 'Show Video' : 'Show Source';
        }
    } else if (hasInputImage) {
        if (toggleText) {
            toggleText.textContent = showingViewerInputImage ? 'Show Output' : 'Show Input';
        }
        if (toggleBtn) {
            toggleBtn.title = showingViewerInputImage ? 'Show Output' : 'Show Input';
        }
    }
}

function openViewerFullscreen() {
    if (viewerAllFiles.length === 0) return;
    
    // Use existing fullscreen viewer with all files
    images = viewerAllFiles;
    currentImageIndex = viewerCurrentIndex;
    fullscreenSource = 'viewer';
    
    // Sync toggle state from viewer to fullscreen
    if (viewerCurrentData) {
        if (viewerCurrentData.job_type === 'video' && viewerCurrentData.source_image) {
            showingVideoInputImage = showingViewerInputImage;
        } else if (viewerCurrentData.use_image && viewerCurrentData.image_filename) {
            showingInputImage = showingViewerInputImage;
        }
    }
    
    openFullscreen();
}


// ============================================================================
// queue.js - Queue management, rendering, drag-and-drop, and navigation
//
// Functions: toggleQueue, toggleTabs, toggleHeader, clearQueue,
//   toggleQueuePause, updatePauseButton, toggleQueueFilter,
//   toggleQueueDirection, loadQueuePreferences, updateQueueFilterButtons,
//   updateQueueDirectionButton, unloadModels, formatDuration,
//   buildQueueRenderSignature, updateLiveTimers, startQueueUpdates,
//   updateQueue, renderQueue, renderQueueItem, setupQueueDragAndDrop,
//   moveQueueItem, reorderQueue, cancelJob, getQueueStatus,
//   openCompletedImage, navigateToCompletedItem, navigateToImage,
//   navigateToVideo, navigateToAudio, navigateToChat, navigateToStory,
//   navigateToAutochat
// ============================================================================

function toggleQueue() {
    const sidebar = document.getElementById('queueSidebar');
    sidebar.classList.toggle('collapsed');
    
    // Update backdrop on mobile
    if (window.updateMobileSidebarBackdrop) {
        window.updateMobileSidebarBackdrop();
    }
}

function toggleTabs() {
    const sidebar = document.getElementById('tabsSidebar');
    sidebar.classList.toggle('collapsed');
    
    // Update backdrop on mobile
    if (window.updateMobileSidebarBackdrop) {
        window.updateMobileSidebarBackdrop();
    }
}

function toggleHeader() {
    const headerContainer = document.getElementById('headerContainer');
    const isCollapsed = headerContainer.classList.toggle('collapsed');
    
    // Save state to localStorage
    localStorage.setItem('headerCollapsed', isCollapsed ? 'true' : 'false');

    // If a chat tab is active, keep the chat header area visible after header toggle.
    const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab');
    if (activeTab === 'chat' || activeTab === 'story' || activeTab === 'autochat') {
        const contentWrapper = document.querySelector('.content-wrapper');
        if (contentWrapper) {
            contentWrapper.scrollTop = 0;
        }
    }
}

async function clearQueue() {
    const confirmed = await showConfirm('Clear all queued items? Completed history will be preserved.', 'Clear Queue');
    if (!confirmed) return;
    
    try {
        const response = await fetch('/api/queue/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Force immediate UI update
            await updateQueue();
            showNotification(`Cleared ${result.cleared_queued} queued item(s)`, 'Queue Cleared', 'success', 3000);
        } else {
            showNotification('Failed to clear queue', 'Error', 'error');
        }
    } catch (error) {
        console.error('Error clearing queue:', error);
        showNotification('Error clearing queue', 'Error', 'error');
    }
}

async function toggleQueuePause() {
    try {
        const response = await fetch('/api/queue/pause', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Update button appearance
            updatePauseButton(result.paused);
            // Force immediate UI update
            await updateQueue();
            
            const message = result.paused ? 'Queue paused. Current generation will finish, then queue will pause.' : 'Queue unpaused. Processing will resume.';
            showNotification(message, result.paused ? 'Queue Paused' : 'Queue Resumed', 'info', 3000);
        } else {
            showNotification('Failed to toggle pause', 'Error', 'error');
        }
    } catch (error) {
        console.error('Error toggling pause:', error);
        showNotification('Error toggling pause', 'Error', 'error');
    }
}

function updatePauseButton(isPaused) {
    const pauseBtn = document.getElementById('pauseQueueBtn');
    if (isPaused) {
        // Show play icon when paused
        pauseBtn.title = 'Resume Queue';
        pauseBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
        `;
        pauseBtn.classList.add('paused');
    } else {
        // Show pause icon when running
        pauseBtn.title = 'Pause Queue';
        pauseBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
        `;
        pauseBtn.classList.remove('paused');
    }
}

// Queue filter and direction functions
function toggleQueueFilter(filterType) {
    // Toggle the filter state
    queueFilters[filterType] = !queueFilters[filterType];
    
    // Update button appearance
    const btnId = `filter${filterType.charAt(0).toUpperCase() + filterType.slice(1)}`;
    const btn = document.getElementById(btnId);
    if (btn) {
        if (queueFilters[filterType]) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    }
    
    // Save filter preferences to localStorage
    localStorage.setItem('queueFilters', JSON.stringify(queueFilters));
    
    // Re-render queue immediately
    updateQueue();
}

function toggleQueueDirection() {
    // Toggle the direction state
    queueReversed = !queueReversed;
    
    // Update button appearance
    const btn = document.getElementById('queueDirectionBtn');
    if (btn) {
        if (queueReversed) {
            btn.classList.add('reversed');
            btn.title = 'Show Newest First';
        } else {
            btn.classList.remove('reversed');
            btn.title = 'Show Oldest First';
        }
    }
    
    // Update queue-content container to reverse section order
    const queueContent = document.querySelector('.queue-content');
    if (queueContent) {
        if (queueReversed) {
            queueContent.classList.add('reversed');
        } else {
            queueContent.classList.remove('reversed');
        }
    }
    
    // Save direction preference to localStorage
    localStorage.setItem('queueReversed', queueReversed.toString());
    
    // Re-render queue immediately
    updateQueue();
}

// Load queue filter and direction preferences from localStorage
function loadQueuePreferences() {
    // Load filters
    const savedFilters = localStorage.getItem('queueFilters');
    if (savedFilters) {
        try {
            const parsedFilters = JSON.parse(savedFilters);
            queueFilters = { ...queueFilters, ...parsedFilters };
        } catch (e) {
            console.error('Error parsing saved queue filters:', e);
        }
    }
    
    // Load direction
    const savedDirection = localStorage.getItem('queueReversed');
    if (savedDirection !== null) {
        queueReversed = savedDirection === 'true';
    }
    
    // Update UI to match loaded preferences
    updateQueueFilterButtons();
    updateQueueDirectionButton();
}

function updateQueueFilterButtons() {
    // Update filter button states
    Object.keys(queueFilters).forEach(filterType => {
        const btnId = `filter${filterType.charAt(0).toUpperCase() + filterType.slice(1)}`;
        const btn = document.getElementById(btnId);
        if (btn) {
            if (queueFilters[filterType]) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });
}

function updateQueueDirectionButton() {
    const btn = document.getElementById('queueDirectionBtn');
    if (btn) {
        if (queueReversed) {
            btn.classList.add('reversed');
            btn.title = 'Show Newest First';
        } else {
            btn.classList.remove('reversed');
            btn.title = 'Show Oldest First';
        }
    }
    
    // Also update queue-content container class
    const queueContent = document.querySelector('.queue-content');
    if (queueContent) {
        if (queueReversed) {
            queueContent.classList.add('reversed');
        } else {
            queueContent.classList.remove('reversed');
        }
    }
}

async function unloadModels() {
    const confirmed = await showConfirm(
        'Unload all models and clear memory (RAM/VRAM/cache)? This is useful to free up system resources when idle.',
        'Unload Models'
    );
    if (!confirmed) return;
    
    try {
        const response = await fetch('/api/comfyui/unload', {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        let result;
        try {
            result = await response.json();
        } catch (jsonError) {
            // If JSON parsing fails, assume success if response was OK
            console.warn('Could not parse JSON response, assuming success');
            result = { success: true };
        }
        
        if (result.success) {
            showNotification('Models unloaded and memory cleared', 'Success', 'success', 3000);
        } else {
            showNotification('Error: ' + (result.error || 'Unknown error'), 'Unload Failed', 'error');
        }
    } catch (error) {
        console.error('Error unloading models:', error);
        showNotification('Failed to unload models: ' + error.message, 'Error', 'error');
    }
}

function formatDuration(seconds) {
    if (!seconds || seconds === 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function buildQueueRenderSignature(queue, active, completed) {
    const queueRows = (Array.isArray(queue) ? queue : []).map(job => [
        job.id,
        job.status,
        job.job_type,
        job.relative_path,
        job.completed_sentences,
        job.total_sentences
    ]);
    const activeRow = active ? [
        active.id,
        active.status,
        active.job_type,
        active.completed_sentences,
        active.total_sentences,
        active.start_time
    ] : null;
    const completedRows = (Array.isArray(completed) ? completed : []).map(job => [
        job.id,
        job.status,
        job.job_type,
        job.relative_path,
        job.generation_duration
    ]);

    return JSON.stringify({
        queueRows,
        activeRow,
        completedRows,
        filters: queueFilters,
        reversed: queueReversed
    });
}

function updateLiveTimers() {
    const timerBadges = document.querySelectorAll('.timer-badge[data-start-time]');
    timerBadges.forEach(badge => {
        const startTime = parseFloat(badge.dataset.startTime);
        const elapsed = Math.floor(Date.now() / 1000 - startTime);
        badge.textContent = formatDuration(elapsed);
    });
}

let initialQueueLoad = true;

function startQueueUpdates() {
    // Clear tracking on startup to allow folder refresh for existing completions
    lastSeenCompletedIds.clear();
    initialQueueLoad = true;
    
    // Start polling queue
    updateQueue();
    queueUpdateInterval = setInterval(() => {
        updateQueue();
        updateLiveTimers();  // Update timer displays every second
    }, 1000);
}

async function updateQueue() {
    if (queueUpdateInFlight) {
        return;
    }

    queueUpdateInFlight = true;
    try {
        const response = await fetch('/api/queue');
        if (!response.ok) {
            console.error('Queue update failed:', response.status);
            return;
        }
        
        const data = await response.json();
        
        // Update pause button state
        if (typeof data.paused !== 'undefined') {
            updatePauseButton(data.paused);
        }
        
        // Check for new completions BEFORE rendering
        const completedJobs = data.completed || [];
        let shouldRefreshFolder = false;
        
        if (initialQueueLoad) {
            initialQueueLoad = false;
            for (const job of completedJobs) {
                lastSeenCompletedIds.add(job.id);
            }
        } else {
            for (const job of completedJobs) {
                if (job.status === 'completed' && job.refresh_folder && !lastSeenCompletedIds.has(job.id)) {
                    lastSeenCompletedIds.add(job.id);
                    shouldRefreshFolder = true;
                    
                    // Send browser notification if enabled
                    sendBrowserNotification(job);
                }
            }
        }

        // Render only when queue data/state actually changed.
        const newSignature = buildQueueRenderSignature(data.queue, data.active, completedJobs);
        if (newSignature !== lastQueueRenderSignature) {
            renderQueue(data.queue, data.active, completedJobs);
            lastQueueRenderSignature = newSignature;
        }
        
        // Refresh folder if we detected new completions
        const browserTab = document.getElementById('browserTab');
        if (shouldRefreshFolder && browserTab && browserTab.classList.contains('active')) {
            setTimeout(() => {
                browseFolder(currentPath);
            }, 500);
        }
        const videosTab = document.getElementById('videosTab');
        if (shouldRefreshFolder && videosTab && videosTab.classList.contains('active')) {
            setTimeout(() => {
                loadVideos(videosCurrentPath);
            }, 500);
        }
    } catch (error) {
        console.error('Error updating queue:', error);
    } finally {
        queueUpdateInFlight = false;
    }
}

function renderQueue(queue, active, completed) {
    const queueList = document.getElementById('queueList');
    const activeJob = document.getElementById('activeJob');
    const completedList = document.getElementById('completedList');
    const queueEmpty = document.getElementById('queueEmpty');
    const queueCounter = document.getElementById('queueCounter');
    
    if (!queueList || !activeJob || !completedList || !queueEmpty || !queueCounter) {
        console.error('Queue DOM elements not found');
        return;
    }
    
    // Ensure we have arrays
    queue = Array.isArray(queue) ? queue : [];
    completed = Array.isArray(completed) ? completed : [];
    
    // Filter out the active job from the queue to avoid duplicates
    if (active) {
        queue = queue.filter(job => job.id !== active.id);
    }
    
    // Apply queue direction (reverse if needed)
    if (queueReversed) {
        queue = [...queue].reverse();
        completed = [...completed].reverse();
    }
    
    // Update queue counter (only if changed)
    const newCounterText = queue.length.toString();
    if (queueCounter.textContent !== newCounterText) {
        queueCounter.textContent = newCounterText;
    }
    const shouldShowCounter = queue.length > 0;
    const currentDisplay = queueCounter.style.display;
    const targetDisplay = shouldShowCounter ? 'inline-block' : 'none';
    if (currentDisplay !== targetDisplay) {
        queueCounter.style.display = targetDisplay;
    }
    
    
    // Ultra-stable update function - never removes elements unnecessarily
    function updateSection(container, jobs, isActiveSection = false) {
        const existingItems = container.querySelectorAll('.queue-item');
        const existingIds = Array.from(existingItems).map(item => item.dataset.jobId);
        const newIds = jobs.map(job => job.id);
        
        // Check if IDs match exactly
        const idsMatch = existingIds.length === newIds.length && 
                        existingIds.every((id, index) => id === newIds[index]);
        
        // For active section with TTS jobs, always re-render to show progress
        if (isActiveSection && jobs.length > 0 && jobs[0].job_type === 'tts') {
            container.innerHTML = jobs.map(job => renderQueueItem(job, isActiveSection)).join('');
            return;
        }
        
        if (idsMatch && existingItems.length === jobs.length) {
            // Perfect match - items haven't changed, do nothing to prevent flicker
            // The queue items are already rendered correctly
            return;
        } else if (idsMatch) {
            // Same IDs, same order - should not happen, but handle it
            return;
        } else {
            // Items added, removed, or reordered - need to update
            container.innerHTML = jobs.map(job => renderQueueItem(job, isActiveSection)).join('');
        }
    }
    
    // Render queued jobs at the top (respect filter)
    if (queueFilters.queued) {
        updateSection(queueList, queue);
        queueList.style.display = queue.length > 0 ? 'block' : 'none';
        
        // Setup drag and drop handlers for queued items
        setupQueueDragAndDrop();
    } else {
        queueList.style.display = 'none';
        queueList.innerHTML = '';
    }
    
    // Render active/generating job in the middle (respect filter)
    if (queueFilters.generating && active && active.id) {
        updateSection(activeJob, [active], true);
        activeJob.style.display = 'block';
    } else {
        // Only clear if there's content
        const hasContent = activeJob.querySelector('.queue-item');
        if (hasContent) {
            activeJob.innerHTML = '';
        }
        activeJob.style.display = 'none';
    }
    
    // Render completed jobs at the bottom (respect filter)
    if (queueFilters.completed) {
        updateSection(completedList, completed);
        completedList.style.display = completed.length > 0 ? 'block' : 'none';
    } else {
        completedList.style.display = 'none';
        completedList.innerHTML = '';
    }

    // Enable hover/touch-hold previews for completed video cards in queue sections.
    bindVideoHoverPreviews(queueList);
    bindVideoHoverPreviews(activeJob);
    bindVideoHoverPreviews(completedList);
    
    // Show empty message only if nothing to display
    const hasItems = (queueFilters.queued && queue.length > 0) || 
                     (queueFilters.generating && active) || 
                     (queueFilters.completed && completed && completed.length > 0);
    const targetEmptyDisplay = hasItems ? 'none' : 'block';
    if (queueEmpty.style.display !== targetEmptyDisplay) {
        queueEmpty.style.display = targetEmptyDisplay;
    }
}

function renderQueueItem(job, isActive) {
    const statusClass = `status-${job.status}`;
    const isVideo = job.job_type === 'video' || (job.relative_path && (job.relative_path.endsWith('.mp4') || job.relative_path.endsWith('.webm')));
    const isTTS = job.job_type === 'tts';
    const isChat = job.job_type === 'chat';
    const isStory = job.job_type === 'story';
    const isAutochat = job.job_type === 'autochat';
    const isNameGen = job.job_type === 'generate_session_name';
    const supportsQueueMedia = !(isTTS || isChat || isStory || isAutochat || isNameGen);
    const hasMedia = supportsQueueMedia && job.status === 'completed' && job.relative_path;
    const hasInputImage = supportsQueueMedia && job.image_filename && (job.status === 'queued' || job.status === 'generating');
    const showMedia = hasMedia || hasInputImage;
    
    // Ensure job.id exists
    if (!job.id) {
        console.error('Job missing ID:', job);
        return '';
    }

    const normalizedRelativePath = (job.relative_path || '').replace(/\\/g, '/');
    const encodedRelativePath = normalizedRelativePath
        ? normalizedRelativePath.split('/').map(segment => encodeURIComponent(segment)).join('/')
        : '';
    const normalizedThumbnailPath = (job.thumbnail_path || '').replace(/\\/g, '/');
    const encodedThumbnailPath = normalizedThumbnailPath
        ? normalizedThumbnailPath.split('/').map(segment => encodeURIComponent(segment)).join('/')
        : '';
    const completedVideoThumbSrc = encodedThumbnailPath
        ? `/outputs/${encodedThumbnailPath}`
        : (encodedRelativePath ? `/api/thumbnail/${encodedRelativePath}` : '');
    
    // Build parameters HTML based on job type
    let paramsHTML = '';
    if (isChat) {
        // Chat job - show model and timer
        paramsHTML = `
            <span class="param-badge">Chat</span>
            <span class="param-badge">${escapeHtml(job.model || 'Unknown')}</span>
        `;
    } else if (isStory) {
        // Story job - show model and timer
        paramsHTML = `
            <span class="param-badge">Story</span>
            <span class="param-badge">${escapeHtml(job.model || 'Unknown')}</span>
        `;
    } else if (isAutochat) {
        // Auto Chat job - show persona name and model
        const personaName = job.persona_name || 'Unknown';
        const modelName = job.model || 'Unknown';
        paramsHTML = `
            <span class="param-badge">Auto Chat</span>
            <span class="param-badge">${escapeHtml(personaName)}</span>
            <span class="param-badge">${escapeHtml(modelName)}</span>
        `;
    } else if (isNameGen) {
        // Session name generation job
        paramsHTML = `
            <span class="param-badge">Auto Name</span>
            <span class="param-badge">${escapeHtml(job.model || 'Unknown')}</span>
        `;
    } else if (isTTS) {
        // TTS job - show sentence progress
        const completed = job.completed_sentences || 0;
        const total = job.total_sentences || 0;
        paramsHTML = `
            <span class="param-badge">TTS</span>
            <span class="param-badge">${completed}/${total} sentences</span>
        `;
        
        // Add progress bar for active TTS
        if (isActive && total > 0) {
            const progress = (completed / total) * 100;
            paramsHTML += `
                <div class="tts-progress-bar" style="width: 100%; height: 4px; background: var(--bg-primary); border-radius: 2px; margin-top: 0.5rem; overflow: hidden;">
                    <div style="height: 100%; background: var(--accent-primary); width: ${progress}%; transition: width 0.3s ease;"></div>
                </div>
            `;
        }
    } else if (isVideo) {
        paramsHTML = `
            <span class="param-badge">Video</span>
            ${job.frames ? `<span class="param-badge">${job.frames} frames</span>` : ''}
            ${job.fps ? `<span class="param-badge">${job.fps} fps</span>` : ''}
        `;
    } else {
        paramsHTML = `
            <span class="param-badge">${job.width || 0}x${job.height || 0}</span>
            <span class="param-badge">${job.steps || 0} steps</span>
        `;
    }
    
    // Add timer badge for active/completed jobs
    if (isActive && job.start_time) {
        const elapsed = Math.floor(Date.now() / 1000 - job.start_time);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        paramsHTML += `<span class="param-badge timer-badge" data-start-time="${job.start_time}">${minutes}:${seconds.toString().padStart(2, '0')}</span>`;
    } else if (job.status === 'completed' && job.generation_duration) {
        const duration = job.generation_duration;
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        paramsHTML += `<span class="param-badge">${minutes}:${seconds.toString().padStart(2, '0')}</span>`;
    }
    
    // Format prompt - for TTS, Chat, Story, Auto Chat, and Name Gen show truncated text
    let displayPrompt = job.prompt || job.message || job.text || '';
    if (isNameGen) {
        displayPrompt = 'Generating session name...';
    } else if (isAutochat) {
        displayPrompt = 'Autonomous AI conversation in progress...';
    } else if ((isTTS || isChat || isStory) && displayPrompt.length > 100) {
        displayPrompt = displayPrompt.substring(0, 100) + '...';
    }
    
    return `
        <div class="queue-item ${isActive ? 'active' : ''} ${showMedia ? 'has-image' : ''} ${job.status === 'completed' ? 'completed-item' : ''}" data-job-id="${escapeHtml(job.id)}" ${job.status === 'queued' ? 'draggable="true"' : ''}>
            ${showMedia ? `
                <div class="queue-item-image">
                    ${hasMedia ? (isVideo ? `
                        <div class="video-hover-preview" style="position: relative; width: 100%; height: 100%;">
                            <img src="${completedVideoThumbSrc}" class="completed-image-thumb" style="object-fit: contain;" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                            <video src="/outputs/${encodedRelativePath}" class="completed-video-preview" style="display: none;" playsinline muted loop preload="none"></video>
                            <div class="video-card-play-overlay" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none; transition: opacity 0.15s ease;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="white" opacity="0.8">
                                    <circle cx="12" cy="12" r="10" fill="rgba(0,0,0,0.5)"></circle>
                                    <polygon points="10 8 16 12 10 16" fill="white"></polygon>
                                </svg>
                            </div>
                        </div>
                    ` : `
                        <img src="/outputs/${job.relative_path}" alt="Generated image" data-completed-image="${escapeHtml(job.relative_path)}" class="completed-image-thumb">
                    `) : hasInputImage ? `
                        <img src="/api/video/${encodeURIComponent(job.image_filename)}" alt="Input image" class="completed-image-thumb" style="opacity: 0.7;">
                    ` : ''}
                </div>
            ` : ''}
            <div class="queue-item-content">
                <div class="queue-item-header">
                    <span class="queue-item-status ${statusClass}">${job.status}</span>
                    <div class="queue-item-actions">
                        ${job.status === 'queued' ? `
                            <button class="queue-item-reorder" data-job-id="${escapeHtml(job.id)}" data-direction="top" title="Move to top">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="18 15 12 9 6 15"></polyline>
                                    <polyline points="18 11 12 5 6 11"></polyline>
                                </svg>
                            </button>
                            <button class="queue-item-reorder" data-job-id="${escapeHtml(job.id)}" data-direction="up" title="Move up">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="18 15 12 9 6 15"></polyline>
                                </svg>
                            </button>
                            <button class="queue-item-reorder" data-job-id="${escapeHtml(job.id)}" data-direction="down" title="Move down">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </button>
                            <button class="queue-item-reorder" data-job-id="${escapeHtml(job.id)}" data-direction="bottom" title="Move to bottom">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="6 13 12 19 18 13"></polyline>
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </button>
                        ` : ''}
                        ${isActive ? `
                            <button class="queue-item-cancel" data-job-id="${escapeHtml(job.id)}" title="Cancel generation">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="15" y1="9" x2="9" y2="15"></line>
                                    <line x1="9" y1="9" x2="15" y2="15"></line>
                                </svg>
                            </button>
                        ` : (job.status === 'queued' || job.status === 'completed' || job.status === 'failed') ? `
                            <button class="queue-item-cancel" data-job-id="${escapeHtml(job.id)}" title="Remove this item">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        ` : ''}
                    </div>
                </div>
                <div class="queue-item-prompt">${escapeHtml(displayPrompt)}</div>
                <div class="queue-item-params">
                    ${paramsHTML}
                </div>
            </div>
        </div>
    `;
}

let draggedElement = null;
let draggedIndex = null;

function setupQueueDragAndDrop() {
    const queueList = document.getElementById('queueList');
    const draggableItems = queueList.querySelectorAll('.queue-item[draggable="true"]');
    
    draggableItems.forEach((item, index) => {
        // Remove existing listeners to avoid duplicates
        item.ondragstart = null;
        item.ondragover = null;
        item.ondragend = null;
        item.ondrop = null;
        
        item.addEventListener('dragstart', function(e) {
            draggedElement = this;
            draggedIndex = index;
            this.style.opacity = '0.4';
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', this.innerHTML);
        });
        
        item.addEventListener('dragover', function(e) {
            if (e.preventDefault) {
                e.preventDefault();
            }
            e.dataTransfer.dropEffect = 'move';
            
            // Visual feedback
            const allItems = Array.from(queueList.querySelectorAll('.queue-item[draggable="true"]'));
            const targetIndex = allItems.indexOf(this);
            
            if (draggedElement !== this) {
                // Add visual indicator
                if (targetIndex > draggedIndex) {
                    this.style.borderBottom = '2px solid var(--primary)';
                    this.style.borderTop = '';
                } else {
                    this.style.borderTop = '2px solid var(--primary)';
                    this.style.borderBottom = '';
                }
            }
            return false;
        });
        
        item.addEventListener('dragleave', function(e) {
            this.style.borderTop = '';
            this.style.borderBottom = '';
        });
        
        item.addEventListener('drop', function(e) {
            if (e.stopPropagation) {
                e.stopPropagation();
            }
            
            this.style.borderTop = '';
            this.style.borderBottom = '';
            
            if (draggedElement !== this) {
                const allItems = Array.from(queueList.querySelectorAll('.queue-item[draggable="true"]'));
                const draggedId = draggedElement.dataset.jobId;
                const targetId = this.dataset.jobId;
                const visualTargetIndex = allItems.indexOf(this);
                
                // Convert visual index to backend index when queue is reversed
                let backendTargetIndex;
                if (queueReversed) {
                    backendTargetIndex = (allItems.length - 1) - visualTargetIndex;
                } else {
                    backendTargetIndex = visualTargetIndex;
                }
                
                // Call backend to reorder
                reorderQueue(draggedId, backendTargetIndex);
            }
            
            return false;
        });
        
        item.addEventListener('dragend', function(e) {
            this.style.opacity = '1';
            
            // Remove all border indicators
            const allItems = queueList.querySelectorAll('.queue-item[draggable="true"]');
            allItems.forEach(item => {
                item.style.borderTop = '';
                item.style.borderBottom = '';
            });
        });
    });
}

async function moveQueueItem(jobId, direction) {
    // Get current queue state
    const queueList = document.getElementById('queueList');
    const queueItems = Array.from(queueList.querySelectorAll('.queue-item[draggable="true"]'));
    
    // Find current item index (visual position in DOM)
    const currentIndex = queueItems.findIndex(item => item.dataset.jobId === jobId);
    if (currentIndex === -1) return;
    
    // Calculate new index (visual position)
    let newVisualIndex;
    if (direction === 'up') {
        if (currentIndex === 0) return; // Already at top
        newVisualIndex = currentIndex - 1;
    } else if (direction === 'down') {
        if (currentIndex === queueItems.length - 1) return; // Already at bottom
        newVisualIndex = currentIndex + 1;
    } else if (direction === 'top') {
        if (currentIndex === 0) return; // Already at top
        newVisualIndex = 0;
    } else if (direction === 'bottom') {
        if (currentIndex === queueItems.length - 1) return; // Already at bottom
        newVisualIndex = queueItems.length - 1;
    } else {
        return;
    }
    
    // Convert visual index to backend index
    // When reversed: visual index 0 = backend index (length-1), visual index (length-1) = backend index 0
    // When normal: visual index = backend index (no conversion needed)
    let backendIndex;
    if (queueReversed) {
        backendIndex = (queueItems.length - 1) - newVisualIndex;
    } else {
        backendIndex = newVisualIndex;
    }
    
    // Call backend to reorder
    await reorderQueue(jobId, backendIndex);
}

async function reorderQueue(jobId, newIndex) {
    try {
        const response = await fetch('/api/queue/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_id: jobId, new_index: newIndex })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Force immediate queue update
            await updateQueue();
        } else {
            showNotification('Failed to reorder queue', 'Error', 'error');
        }
    } catch (error) {
        console.error('Error reordering queue:', error);
        showNotification('Error reordering queue', 'Error', 'error');
    }
}

async function cancelJob(jobId) {
    console.log('cancelJob called with jobId:', jobId);
    
    // Check if this is an active job by finding it in the queue status
    const queueStatus = await getQueueStatus();
    const isActive = queueStatus.active && queueStatus.active.id === jobId;
    
    if (isActive) {
        // Active generation - send cancel request
        try {
            const response = await fetch(`/api/cancel/${jobId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('Cancelling generation...', 'Cancelled', 'warning', 2000);
                // Update will happen through normal polling
                setTimeout(() => updateQueue(), 500);
            } else {
                showNotification(result.error || 'Failed to cancel', 'Error', 'error');
            }
        } catch (error) {
            console.error('Error cancelling job:', error);
            showNotification('Error cancelling generation', 'Error', 'error');
        }
    } else {
        // Queued or completed - remove from queue
        try {
            const response = await fetch(`/api/queue/${jobId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });
            
            console.log('Delete response status:', response.status);
            const result = await response.json();
            console.log('Delete response:', result);
            
            if (result.success) {
                // Remove from local tracking if it was completed
                lastSeenCompletedIds.delete(jobId);
                
                // Force immediate UI update
                console.log('Updating queue after deletion...');
                await updateQueue();
                showNotification('Item removed', 'Removed', 'success', 2000);
            } else {
                console.error('Failed to remove:', result.error);
                showNotification(result.error || 'Failed to remove item', 'Error', 'error');
            }
        } catch (error) {
            console.error('Error removing job:', error);
            showNotification('Error removing item', 'Error', 'error');
        }
    }
}

async function getQueueStatus() {
    try {
        const response = await fetch('/api/queue');
        return await response.json();
    } catch (error) {
        console.error('Error fetching queue status:', error);
        return { queued: [], active: null, completed: [] };
    }
}

async function openCompletedImage(relativePath) {
    // Switch to browser tab and find the image
    switchTab('browser');
    
    // Extract folder path from relative path
    const parts = relativePath.split(/[\/\\]/);
    const folderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    
    // Browse to the folder containing the image
    await browseFolder(folderPath);
    
    // Wait for images to load
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Find the image by relative_path in the loaded images array
    const imageIndex = images.findIndex(img => img.relative_path === relativePath);
    if (imageIndex !== -1) {
        openImageModal(images[imageIndex].id || images[imageIndex].relative_path);
    }
}

// Navigate to completed queue item in appropriate browser/tab
async function navigateToCompletedItem(jobId) {
    try {
        // Find the job in the queue data
        const response = await fetch('/api/queue');
        const data = await response.json();
        
        // Search in completed jobs
        let job = null;
        if (data.completed && Array.isArray(data.completed)) {
            job = data.completed.find(j => j.id === jobId);
        }
        
        if (!job) {
            console.error('Completed job not found:', jobId);
            showNotification('Could not find completed item', 'Error', 'error');
            return;
        }
        
        const jobType = job.job_type;
        
        // Handle different job types
        if (jobType === 'image') {
            // Navigate to image browser and open the specific image
            await navigateToImage(job);
        } else if (jobType === 'video') {
            // Navigate to video browser and open the specific video
            await navigateToVideo(job);
        } else if (jobType === 'tts') {
            // Navigate to audio tab and expand the batch
            await navigateToAudio(job);
        } else if (jobType === 'chat') {
            // Navigate to chat tab and select the session
            await navigateToChat(job);
        } else if (jobType === 'story') {
            // Navigate to story tab and select the session
            await navigateToStory(job);
        } else if (jobType === 'autochat') {
            // Navigate to autochat tab and select the session
            await navigateToAutochat(job);
        } else {
            console.log('Unknown job type for navigation:', jobType);
        }
    } catch (error) {
        console.error('Error navigating to completed item:', error);
        showNotification('Error opening item', 'Error', 'error');
    }
}

// Navigate to specific image in browser
async function navigateToImage(job) {
    // Switch to browser tab
    switchTab('browser');
    
    if (!job.relative_path) {
        console.error('Job missing relative_path:', job);
        return;
    }
    
    // Extract folder path and browse to it
    const parts = job.relative_path.split(/[/\\]/);
    const folderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    
    // Browse to folder - this will load the images array
    await browseFolder(folderPath || 'images');
    
    // Wait a bit for images to load
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Find the image by ID in the loaded images array
    const imageIndex = images.findIndex(img => img.id === job.id);
    
    if (imageIndex !== -1) {
        // Open the modal at this image
        openImageModal(job.id);
    } else {
        console.log('Image not found in current view, staying in folder');
    }
}

// Navigate to specific video in browser
async function navigateToVideo(job) {
    // Switch to videos tab
    switchTab('videos');
    
    if (!job.relative_path) {
        console.error('Job missing relative_path:', job);
        return;
    }
    
    // Extract folder path - videos are under 'videos/' root
    const parts = job.relative_path.split(/[/\\]/);
    let folderPath = 'videos';
    
    // If there's a subfolder, include it
    if (parts.length > 1) {
        // Skip the first part if it's 'videos', then rejoin the rest except filename
        const pathParts = parts[0] === 'videos' ? parts.slice(1) : parts;
        const subfolderParts = pathParts.slice(0, -1);
        if (subfolderParts.length > 0) {
            folderPath = 'videos/' + subfolderParts.join('/');
        }
    }
    
    // Load videos in that folder
    await loadVideos(folderPath);
    
    // Wait for videos to load
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Find the video in the loaded videosItems array
    const videoIndex = videosItems.findIndex(v => v.id === job.id || v.relative_path === job.relative_path);
    
    if (videoIndex !== -1) {
        // Open the video modal
        openVideoModal(videoIndex);
    } else {
        console.log('Video not found in current view, staying in folder');
    }
}

// Navigate to specific audio batch in audio tab
async function navigateToAudio(job) {
    // Switch to audio tab
    switchTab('audio');
    
    // Wait for audio batches to load
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Find and expand the batch
    if (job.batch_id) {
        const batchCard = document.getElementById(`batch_${job.batch_id}`);
        if (batchCard) {
            // Expand the batch if collapsed
            if (batchCard.classList.contains('collapsed')) {
                toggleAudioBatch(job.batch_id);
            }
            
            // Scroll to the batch
            batchCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Highlight briefly
            batchCard.style.outline = '2px solid var(--accent-primary)';
            setTimeout(() => {
                batchCard.style.outline = '';
            }, 2000);
        } else {
            console.log('Audio batch not found:', job.batch_id);
        }
    }
}

// Navigate to specific chat session
async function navigateToChat(job) {
    // Switch to chat tab
    switchTab('chat');
    
    // Wait for chat to initialize
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Select the session if we have a session_id
    if (job.session_id) {
        const sessionExists = chatSessions.some(s => s.session_id === job.session_id);
        if (sessionExists) {
            await selectChatSession(job.session_id);
            showNotification('Opened chat session', 'Success', 'success', 2000);
        } else {
            console.log('Chat session not found:', job.session_id);
            showNotification('Chat session no longer exists', 'Info', 'info', 3000);
        }
    }
}

// Navigate to specific story session
async function navigateToStory(job) {
    // Switch to story tab
    switchTab('story');
    
    // Wait for story to initialize
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // The story.js file should handle this, but we'll try to select the session
    if (job.session_id && window.selectStorySession) {
        const sessionExists = storySessions.some(s => s.session_id === job.session_id);
        if (sessionExists) {
            await window.selectStorySession(job.session_id);
            showNotification('Opened story session', 'Success', 'success', 2000);
        } else {
            console.log('Story session not found:', job.session_id);
            showNotification('Story session no longer exists', 'Info', 'info', 3000);
        }
    }
}

// Navigate to specific autochat session
async function navigateToAutochat(job) {
    // Switch to autochat tab
    switchTab('autochat');
    
    // Wait for autochat to initialize
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // The autochat.js file should handle session selection
    if (job.session_id && window.selectAutochatSession) {
        // Try to select the session
        if (window.autochatSessions) {
            const sessionExists = window.autochatSessions.some(s => s.session_id === job.session_id);
            if (sessionExists) {
                await window.selectAutochatSession(job.session_id);
                showNotification('Opened autochat session', 'Success', 'success', 2000);
            } else {
                console.log('Autochat session not found:', job.session_id);
                showNotification('Autochat session no longer exists', 'Info', 'info', 3000);
            }
        }
    }
}

// Velvet Reverie - Core: globals, state, init, tabs, notifications, theme, hardware
// Velvet Reverie - Web Interface JavaScript

// ─── Global Audio Playback Speed ──────────────────────────────────────────────
const AUDIO_SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
let globalAudioPlaybackSpeed = parseFloat(localStorage.getItem('audioPlaybackSpeed') || '1.0');
if (!AUDIO_SPEED_OPTIONS.includes(globalAudioPlaybackSpeed)) globalAudioPlaybackSpeed = 1.0;

/** Apply the stored speed to every live <audio> element and sync all UI widgets. */
function setGlobalAudioPlaybackSpeed(speed) {
    const parsed = parseFloat(speed);
    if (!AUDIO_SPEED_OPTIONS.includes(parsed)) return;
    globalAudioPlaybackSpeed = parsed;
    localStorage.setItem('audioPlaybackSpeed', String(parsed));
    document.querySelectorAll('audio').forEach(el => { el.playbackRate = parsed; });
    document.querySelectorAll('.audio-speed-select').forEach(sel => { sel.value = String(parsed); });
    console.log('[Audio] Global playback speed set to', parsed + 'x');
}

/** Stamp the current global speed on a single audio element. */
function applyGlobalAudioSpeed(audioEl) {
    if (audioEl) audioEl.playbackRate = globalAudioPlaybackSpeed;
}

/** Sync all speed selector dropdowns and badges to the stored speed, and
 *  watch for any new <audio> elements added to the DOM via MutationObserver. */
function initializeAudioSpeedControls() {
    // Set initial values on all existing widgets
    const speedStr = String(globalAudioPlaybackSpeed);
    document.querySelectorAll('.audio-speed-select').forEach(sel => { sel.value = speedStr; });

    // Apply speed to any <audio> elements already in the DOM
    document.querySelectorAll('audio').forEach(el => { el.playbackRate = globalAudioPlaybackSpeed; });

    // Watch for new <audio> elements added dynamically (TTS batches, chat messages, etc.)
    const observer = new MutationObserver(mutations => {
        let needsWidgetSync = false;
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType !== 1) return;
                // New audio elements
                if (node.tagName === 'AUDIO') { applyGlobalAudioSpeed(node); }
                node.querySelectorAll && node.querySelectorAll('audio').forEach(a => applyGlobalAudioSpeed(a));
                // New speed widgets
                if (node.classList && node.classList.contains('audio-speed-select')) needsWidgetSync = true;
                node.querySelectorAll && node.querySelectorAll('.audio-speed-select').forEach(() => { needsWidgetSync = true; });
            });
        });
        if (needsWidgetSync) {
            const s = String(globalAudioPlaybackSpeed);
            document.querySelectorAll('.audio-speed-select').forEach(sel => { sel.value = s; });
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── Auto-TTS ─────────────────────────────────────────────────────────────────
/** 
 * Globally store the most recent auto-TTS settings by session type.
 * Used to avoid PUT-ing settings to the server on every keystroke.
 */
const autoTTSSessionSettings = { chat: null, story: null, autochat: null };

/**
 * Queue a TTS job using stored auto-TTS settings (no modal interaction).
 * Called automatically when a message completes streaming and auto_tts.enabled is true.
 */
async function queueAutoTTS(messageText, messageId, sessionId, sessionType, ttsSettings) {
    if (!messageText || !messageId || !sessionId || !ttsSettings) {
        console.warn('[AutoTTS] Missing required parameters, skipping');
        return;
    }

    const refAudio = ttsSettings.voice || '';
    if (!refAudio) {
        console.warn('[AutoTTS] No voice configured, skipping');
        return;
    }

    const filePrefix = { chat: 'chat_tts', story: 'story_tts', autochat: 'autochat_tts' }[sessionType] || 'chat_tts';

    try {
        const response = await fetch('/api/queue/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: messageText,
                ref_audio: refAudio,
                seed: null,
                file_prefix: filePrefix,
                subfolder: ttsSettings.subfolder || '',
                tts_engine: ttsSettings.engine || 'ChatterboxTTS',
                audio_format: ttsSettings.format || 'wav',
                temperature: ttsSettings.temperature || 0.8,
                exaggeration: ttsSettings.exaggeration || 0.5,
                cfg_weight: ttsSettings.cfg_weight || 0.5,
                chunk_size: 300,
                language: ttsSettings.language || 'en',
                repetition_penalty: 2.0,
                chat_message_id: messageId,
                session_id: sessionId,
                session_type: sessionType
            })
        });

        const data = await response.json();

        if (data.success) {
            console.log('[AutoTTS] Queued TTS for message:', messageId, '—', data.total_sentences, 'sentence(s)');
            if (typeof pollForChatTTSAudio === 'function') {
                pollForChatTTSAudio(messageId, sessionId, sessionType);
            }
        } else {
            console.error('[AutoTTS] Queue failed:', data.error);
        }
    } catch (error) {
        console.error('[AutoTTS] Error queuing TTS:', error);
    }
}

/**
 * Handle toggling the auto-TTS switch in any chat tab.
 * When turned ON, opens the TTS settings modal in auto-config mode.
 * When turned OFF, saves `enabled: false` to the session.
 */
async function toggleAutoTTS(sessionType, enabled) {
    const currentSession = sessionType === 'autochat' ? currentAutoSession : 
                            sessionType === 'story' ? currentStorySession : currentChatSession;

    if (!currentSession || !currentSession.session_id) {
        showNotification('No active session', 'Error', 'error');
        return;
    }

    // Ensure auto_tts exists on session
    if (!currentSession.auto_tts) {
        currentSession.auto_tts = {
            enabled: false, voice: '', engine: 'ChatterboxTTS', format: 'wav',
            temperature: 0.8, exaggeration: 0.5, cfg_weight: 0.5, language: 'en', subfolder: ''
        };
    }

    if (enabled) {
        currentSession.auto_tts.enabled = true;
        // Open modal in auto-config mode
        showAutoTTSConfigModal(sessionType, currentSession);
    } else {
        currentSession.auto_tts.enabled = false;
        await saveAutoTTSToSession(sessionType, currentSession);
    }
}

/**
 * Open the TTS settings modal in auto-config mode. 
 * Reuses #chatTTSModal but changes button to "Save Settings".
 */
function showAutoTTSConfigModal(sessionType, session) {
    const settings = session.auto_tts || {};

    // Use existing modal, pre-fill with session's auto_tts settings
    const refAudio = settings.voice || getPreferredTtsReferenceAudio();
    document.getElementById('modalTTSVoice').value = refAudio;
    document.getElementById('modalTTSEngine').value = settings.engine || 'ChatterboxTTS';
    document.getElementById('modalTTSFormat').value = settings.format || 'wav';
    document.getElementById('modalTTSTemperature').value = settings.temperature || 0.8;
    document.getElementById('modalTTSTemperatureValue').textContent = (settings.temperature || 0.8).toFixed(1);
    document.getElementById('modalTTSExaggeration').value = settings.exaggeration || 0.5;
    document.getElementById('modalTTSExaggerationValue').textContent = (settings.exaggeration || 0.5).toFixed(1);
    document.getElementById('modalTTSCfgWeight').value = settings.cfg_weight || 0.5;
    document.getElementById('modalTTSCfgWeightValue').textContent = (settings.cfg_weight || 0.5).toFixed(1);
    document.getElementById('modalTTSLanguage').value = settings.language || 'en';
    document.getElementById('modalTTSSubfolder').value = settings.subfolder || '';

    // Clear message-specific hidden fields
    document.getElementById('modalTTSMessageText').value = '';
    document.getElementById('modalTTSMessageId').value = '';

    // Change button to auto-config mode
    const submitBtn = document.querySelector('#chatTTSModal .btn-primary');
    if (submitBtn) {
        submitBtn.textContent = 'Save Settings';
        submitBtn.setAttribute('onclick', '');
        submitBtn.addEventListener('click', function handler() {
            saveAutoTTSSettings(sessionType, session);
        }, { once: true });
    }

    // Store context for cleanup
    document.getElementById('chatTTSModal').dataset.autoMode = 'true';
    document.getElementById('chatTTSModal').dataset.sessionType = sessionType;

    // Show modal
    document.getElementById('chatTTSModal').style.display = 'flex';
    setupTTSModalRangeListeners();
}

/**
 * Save auto-TTS settings from the modal to the session.
 */
async function saveAutoTTSSettings(sessionType, session) {
    if (!session || !session.session_id) return;

    const settings = {
        enabled: true,
        voice: document.getElementById('modalTTSVoice').value.trim(),
        engine: document.getElementById('modalTTSEngine').value,
        format: document.getElementById('modalTTSFormat').value,
        temperature: parseFloat(document.getElementById('modalTTSTemperature').value),
        exaggeration: parseFloat(document.getElementById('modalTTSExaggeration').value),
        cfg_weight: parseFloat(document.getElementById('modalTTSCfgWeight').value),
        language: document.getElementById('modalTTSLanguage').value,
        subfolder: document.getElementById('modalTTSSubfolder').value.trim()
    };

    const refAudio = settings.voice;
    if (refAudio && typeof rememberTtsReferenceAudio === 'function') {
        rememberTtsReferenceAudio(refAudio);
    }

    session.auto_tts = settings;
    await saveAutoTTSToSession(sessionType, session);
    closeChatTTSModal();

    // Retroactively queue TTS for any completed messages that don't have audio
    queueCompletedMessageTTS(sessionType, session);
}

/**
 * Retroactively queue TTS for all completed assistant messages in the session
 * that don't already have tts_audio. Called after saving auto-TTS settings.
 */
function queueCompletedMessageTTS(sessionType, session) {
    if (!session || !session.messages || !session.auto_tts || !session.auto_tts.enabled) return;
    if (!session.auto_tts.voice) return;

    const messages = session.messages || [];
    for (const msg of messages) {
        if (msg.role !== 'assistant') continue;
        if (!msg.completed) continue;
        if (!msg.content) continue;
        if (msg.tts_audio) continue;

        const msgId = msg.message_id || msg.response_id;
        if (!msgId) continue;

        console.log('[AutoTTS] Queuing retroactive TTS for completed message:', msgId);
        queueAutoTTS(msg.content, msgId, session.session_id, sessionType, session.auto_tts);
    }
}

/**
 * PUT auto_tts settings to the server for the given session.
 */
async function saveAutoTTSToSession(sessionType, session) {
    const endpointMap = {
        chat: `/api/chat/sessions/${session.session_id}`,
        story: `/api/story/sessions/${session.session_id}`,
        autochat: `/api/autochat/sessions/${session.session_id}`
    };
    const endpoint = endpointMap[sessionType];
    if (!endpoint) return;

    try {
        await fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ auto_tts: session.auto_tts })
        });
    } catch (error) {
        console.error('[AutoTTS] Failed to save settings:', error);
    }
}

/**
 * Sync the auto-TTS toggle checkbox to match the session's stored state.
 * Called from loadChatUI / loadStoryUI / loadAutoUI when a session is loaded.
 */
function syncAutoTTSToggle(sessionType, session) {
    const toggleMap = { chat: 'chatAutoTTSToggle', story: 'storyAutoTTSToggle', autochat: 'autochatAutoTTSToggle' };
    const toggleId = toggleMap[sessionType];
    if (!toggleId) return;

    const toggle = document.getElementById(toggleId);
    if (!toggle) return;

    if (session && session.auto_tts) {
        toggle.checked = session.auto_tts.enabled === true;
    } else {
        toggle.checked = false;
    }
}
// ──────────────────────────────────────────────────────────────────────────────

// Helper function to get video MIME type
function getVideoMimeType(filename) {
    if (filename.endsWith('.mp4')) return 'video/mp4';
    if (filename.endsWith('.webm')) return 'video/webm';
    if (filename.endsWith('.mov')) return 'video/quicktime';
    return 'video/mp4'; // default
}

// State
let queueUpdateInterval;
let queueUpdateInFlight = false;
let lastQueueRenderSignature = '';
let currentImageIndex = 0;
let images = [];
let savedImages = null; // Store original images when opening video modal
let currentImageData = null;
let touchStartX = 0;
let touchEndX = 0;
let touchStartY = 0;
let touchEndY = 0;
let mouseActivityTimer = null;
let isFullscreenActive = false;
let fullscreenSource = null; // Track which tab opened fullscreen: 'viewer', 'browser', 'videos', etc.
let fullscreenAutoFollowEnabled = false;
let fullscreenLockedMediaKey = null;
let revealFullscreenActive = false; // Track if reveal browser fullscreen is active
let revealLinkedItems = []; // Reveal browser linked items
let currentRevealIndex = 0; // Current reveal index
let revealShowOutput = true; // Show output vs input in reveal
let revealBaseFit = null; // Reveal base fit
let revealBaseFitIndex = 0; // Reveal base fit index
let currentPath = '';
let selectedItems = new Set();
let allItems = [];
let selectionMode = false;
let lastSeenCompletedIds = new Set();
let notificationSoundPlaying = false;

// Queue filter state
let queueFilters = {
    queued: true,
    generating: true,
    completed: true
};
let queueReversed = false; // Queue direction (false = newest first, true = oldest first)

// Browser loading/request state (prevents stale slow-drive responses from repainting UI)
let browseFolderRequestToken = 0;
let browseFolderAbortController = null;
let imageBrowserRequestToken = 0;
let imageBrowserAbortController = null;
let videoBrowserRequestToken = 0;
let videoBrowserAbortController = null;
let videosRequestToken = 0;
let videosAbortController = null;

// Lightweight tab refresh cache
let browserLastLoadedPath = null;
let browserLastLoadedAt = 0;
let videosLastLoadedPath = null;
let videosLastLoadedAt = 0;
let videosPlayEnabled = false;
let videosPlaybackObserver = null;

// Fullscreen zoom state
let zoomLevel = 1;
let zoomPanX = 0;
let zoomPanY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let lastTouchDistance = 0;

// Autoplay state
let autoplayTimer = null;
let isAutoplayActive = false;

// Mouse activity tracking listeners (store for cleanup)
let mouseActivityListeners = {
    touchstart: null,
    touchend: null,
    click: null
};

// Batch generation state
let batchPreviewData = [];
let detectedBatchParameters = [];

// Hardware monitoring state
let hardwareUpdateInterval;

// Audio batch data for full text modal
let audioBatchData = {};

// Chat state
let chatSessions = [];
let currentChatSession = null;
let chatModels = [];
let chatPollingIntervals = {}; // Track polling intervals by response_id
let isLoadingChatSession = false; // Prevent recursive calls
let chatAutoScrollEnabled = true; // Keep chat pinned to bottom unless user scrolls up
let currentBranchPath = []; // Active branch path (array of branch_ids)
const CONVERSATION_DOWNLOAD_ICON = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
`;
const CONVERSATION_BUSY_ICON = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="8" opacity="0.3"></circle>
        <path d="M20 12a8 8 0 0 0-8-8"></path>
    </svg>
`;

const conversationAudioPlaybackStates = {
    chat: {
        queue: [],
        position: -1,
        activePlayer: null,
        isPlaying: false,
        autoPlayEnabled: false,
        isDownloading: false
    },
    story: {
        queue: [],
        position: -1,
        activePlayer: null,
        isPlaying: false,
        autoPlayEnabled: false,
        isDownloading: false
    },
    autochat: {
        queue: [],
        position: -1,
        activePlayer: null,
        isPlaying: false,
        autoPlayEnabled: false,
        isDownloading: false
    }
};

// Story state
let storySessions = [];
let currentStorySession = null;
let storyModels = [];
let storyPollingIntervals = {}; // Track polling intervals by response_id
let isLoadingStorySession = false;
let storyAutoScrollEnabled = true;

// Hover comparison state
let hoverCompareEnabled = false;
let hoverCompareRadius = 80; // Default radius in pixels

// In-memory TTS reference audio (persists until page refresh)
let lastUsedTtsReferenceAudio = '';

function getMediaIdentityKey(item) {
    if (!item) {
        return '';
    }
    return String(item.id || item.relative_path || item.path || item.filename || '');
}

function getFullscreenSourceArray() {
    if (fullscreenSource === 'viewer') {
        return viewerAllFiles;
    }
    if (fullscreenSource === 'videos') {
        return videosItems;
    }
    return images;
}

function getDefaultFullscreenAutoFollow(source) {
    return source === 'viewer';
}

function syncFullscreenAutoFollowControl() {
    const checkbox = document.getElementById('fullscreenAutoFollowCheckbox');
    if (checkbox) {
        checkbox.checked = fullscreenAutoFollowEnabled;
    }
}

function syncFullscreenAfterDataRefresh(updatedSource) {
    if (!isFullscreenActive) {
        return;
    }

    if (updatedSource === 'viewer' && fullscreenSource !== 'viewer') {
        return;
    }
    if (updatedSource === 'browser' && fullscreenSource !== 'browser') {
        return;
    }
    if (updatedSource === 'videos' && fullscreenSource !== 'videos') {
        return;
    }

    const sourceArray = getFullscreenSourceArray();
    if (!Array.isArray(sourceArray) || sourceArray.length === 0) {
        return;
    }

    if (fullscreenAutoFollowEnabled) {
        currentImageIndex = 0;
        showFullscreenImage(0);
        return;
    }

    let targetIndex = -1;
    if (fullscreenLockedMediaKey) {
        targetIndex = sourceArray.findIndex(item => getMediaIdentityKey(item) === fullscreenLockedMediaKey);
    }

    if (targetIndex === -1 && currentImageData) {
        const currentDataKey = getMediaIdentityKey(currentImageData);
        if (currentDataKey) {
            targetIndex = sourceArray.findIndex(item => getMediaIdentityKey(item) === currentDataKey);
        }
    }

    if (targetIndex === -1) {
        targetIndex = Math.min(Math.max(currentImageIndex, 0), sourceArray.length - 1);
    }

    currentImageIndex = targetIndex;
    showFullscreenImage(targetIndex);
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOMContentLoaded - Starting initialization');
    try {
        initializeEventListeners();
        console.log('✓ Event listeners initialized');
    } catch (e) { console.error('✗ Event listeners failed:', e); }
    
    try {
        initializeTabs();
        // Activate the tab that the server marked as active (via the .active class on .tab-btn)
        const activeBtn = document.querySelector('.tab-btn.active');
        if (activeBtn) {
            const activeTabName = activeBtn.getAttribute('data-tab');
            if (activeTabName) {
                switchTab(activeTabName, true); // _skipHistory=true so we don't push a new state
            }
        }
        console.log('✓ Tabs initialized');
    } catch (e) { console.error('✗ Tabs failed:', e); }
    
    try {
        initializeMobileOverlay();
        console.log('✓ Mobile overlay initialized');
    } catch (e) { console.error('✗ Mobile overlay failed:', e); }
    
    try {
        initializeDeviceFullscreenSync();
        console.log('✓ Device fullscreen sync initialized');
    } catch (e) { console.error('✗ Device fullscreen sync failed:', e); }
    
    try {
        initializeBatchMode();
        console.log('✓ Batch mode initialized');
    } catch (e) { console.error('✗ Batch mode failed:', e); }
    
    try {
        initializeImageBatch();
        console.log('✓ Image batch initialized');
    } catch (e) { console.error('✗ Image batch failed:', e); }
    
    try {
        initializeVideoBatch();
        console.log('✓ Video batch initialized');
    } catch (e) { console.error('✗ Video batch failed:', e); }
    
    try {
        initializeVideoBrowser();
        console.log('✓ Videos browser initialized');
    } catch (e) { console.error('✗ Videos browser failed:', e); }
    
    try {
        initializeViewer();
        console.log('✓ Viewer initialized');
    } catch (e) { console.error('✗ Viewer failed:', e); }
    
    try {
        initializeChat();
        console.log('✓ Chat initialized');
    } catch (e) { console.error('✗ Chat failed:', e); }
    
    try {
        initializeStory();
        console.log('✓ Story initialized');
    } catch (e) { console.error('✗ Story failed:', e); }
    
    try {
        initializeAutoChat();
        console.log('✓ Auto Chat initialized');
    } catch (e) { console.error('✗ Auto Chat failed:', e); }

    try {
        initializeConversationAudioAutoplayHandlers();
        console.log('✓ Conversation audio autoplay handlers initialized');
    } catch (e) { console.error('✗ Conversation audio autoplay handlers failed:', e); }
    
    try {
        initializeInputImageToggle();
        console.log('✓ Input image toggle initialized');
    } catch (e) { console.error('✗ Input image toggle failed:', e); }
    
    try {
        browseFolder('');
        console.log('✓ Folder browsing initialized');
    } catch (e) { console.error('✗ Folder browsing failed:', e); }
    
    try {
        loadQueuePreferences();
        console.log('✓ Queue preferences loaded');
    } catch (e) { console.error('✗ Queue preferences failed:', e); }
    
    try {
        startQueueUpdates();
        console.log('✓ Queue updates started');
    } catch (e) { console.error('✗ Queue updates failed:', e); }
    
    try {
        startHardwareMonitoring();
        console.log('✓ Hardware monitoring started');
    } catch (e) { console.error('✗ Hardware monitoring failed:', e); }
    
    // Initialize logout button
    try {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }
        console.log('✓ Logout button initialized');
    } catch (e) { console.error('✗ Logout button failed:', e); } 
    
    // Initialize theme selector
    try {
        initializeThemeSelector();
        console.log('✓ Theme selector initialized');
    } catch (e) { console.error('✗ Theme selector failed:', e); }

    // Initialize media blur setting
    try {
        initializeMediaBlurToggle();
        console.log('✓ Media blur setting initialized');
    } catch (e) { console.error('✗ Media blur setting failed:', e); }
    
    // Initialize auto-unload mode setting (server-side, synced across clients)
    try {
        const autoUnloadSelect = document.getElementById('autoUnloadMode');
        
        const modeLabels = {
            'never': 'Never unload',
            'always': 'Unload every generation',
            'queue_empty': 'Unload when queue empty'
        };
        
        (async () => {
            try {
                const response = await fetch('/api/settings/auto-unload');
                const data = await response.json();
                autoUnloadSelect.value = data.auto_unload_mode;
            } catch(e) {
                console.error('Failed to fetch auto-unload mode:', e);
            }
        })();
        
        autoUnloadSelect.addEventListener('change', function() {
            const mode = this.value;
            updateAutoUnloadSetting(mode);
            showNotification(modeLabels[mode] || mode, 'Auto-Unload', 'info', 3000);
        });
        
        setInterval(async () => {
            try {
                const response = await fetch('/api/settings/auto-unload');
                const data = await response.json();
                if (autoUnloadSelect.value !== data.auto_unload_mode) {
                    autoUnloadSelect.value = data.auto_unload_mode;
                }
            } catch(e) {}
        }, 3000);
        
        console.log('✓ Auto-unload mode setting initialized');
    } catch (e) { console.error('✗ Auto-unload mode setting failed:', e); }
    
    // Initialize notification type setting
    try {
        const notificationTypeSelect = document.getElementById('notificationType');
        
        // Load saved preference from localStorage (default: 'sound')
        const savedNotificationType = localStorage.getItem('notificationType') || 'sound';
        notificationTypeSelect.value = savedNotificationType;
        
        // Listen for changes
        notificationTypeSelect.addEventListener('change', async function() {
            const type = this.value;
            
            // If notification or both, request permission
            if ((type === 'notification' || type === 'both')) {
                if (!('Notification' in window)) {
                    showNotification('Browser notifications are not supported', 'Not Supported', 'error', 3000);
                    // Revert to sound
                    this.value = 'sound';
                    localStorage.setItem('notificationType', 'sound');
                    return;
                }
                
                if (Notification.permission === 'denied') {
                    showNotification('Notification permission was denied. Please enable it in browser settings.', 'Permission Denied', 'error', 5000);
                    // Revert to sound
                    this.value = 'sound';
                    localStorage.setItem('notificationType', 'sound');
                    return;
                }
                
                if (Notification.permission !== 'granted') {
                    const permission = await Notification.requestPermission();
                    if (permission !== 'granted') {
                        showNotification('Notification permission was not granted', 'Permission Required', 'warning', 3000);
                        // Revert to sound
                        this.value = 'sound';
                        localStorage.setItem('notificationType', 'sound');
                        return;
                    }
                }
            }
            
            localStorage.setItem('notificationType', type);
            
            // Show feedback message
            const messages = {
                'none': 'Completion alerts disabled',
                'notification': 'Desktop notifications enabled',
                'sound': 'Sound alerts enabled',
                'both': 'Desktop notifications and sound enabled'
            };
            showNotification(messages[type], 'Alert Settings', 'success', 3000);
            
            // Play sound if sound or both selected (as preview)
            if (type === 'sound' || type === 'both') {
                playNotificationSound();
            }
        });
        console.log('✓ Notification type setting initialized');
    } catch (e) { console.error('✗ Notification type setting failed:', e); }
    
    // Initialize Pushover notification setting (server-side, synced across clients)
    try {
        const pushoverSelect = document.getElementById('pushoverMode');
        
        const pushoverLabels = {
            'off': 'Pushover notifications disabled',
            'every_completion': 'Pushover: every completion',
            'queue_empty': 'Pushover: when queue empty'
        };
        
        (async () => {
            try {
                const response = await fetch('/api/settings/pushover');
                const data = await response.json();
                pushoverSelect.value = data.pushover_mode;
            } catch(e) {
                console.error('Failed to fetch pushover mode:', e);
            }
        })();
        
        pushoverSelect.addEventListener('change', function() {
            const mode = this.value;
            fetch('/api/settings/pushover', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode })
            });
            showNotification(pushoverLabels[mode] || mode, 'Pushover', 'success', 3000);
        });
        
        setInterval(async () => {
            try {
                const response = await fetch('/api/settings/pushover');
                const data = await response.json();
                if (pushoverSelect.value !== data.pushover_mode) {
                    pushoverSelect.value = data.pushover_mode;
                }
            } catch(e) {}
        }, 3000);
        
        console.log('✓ Pushover notification setting initialized');
    } catch (e) { console.error('✗ Pushover notification setting failed:', e); }
    
    // Restore header collapsed state from localStorage
    try {
        const headerContainer = document.getElementById('headerContainer');
        const headerCollapsed = localStorage.getItem('headerCollapsed');
        if (headerCollapsed === 'true' && headerContainer) {
            headerContainer.classList.add('collapsed');
        }
        console.log('✓ Header collapsed state restored');
    } catch (e) { console.error('✗ Header collapsed state restoration failed:', e); }
    
    // Initialize video duration calculator
    try {
        initializeVideoDurationCalculator();
        console.log('✓ Video duration calculator initialized');
    } catch (e) { console.error('✗ Video duration calculator failed:', e); }
    
    // Initialize audio browser
    try {
        initializeAudioBrowser();
        console.log('✓ Audio browser initialized');
    } catch (e) { console.error('✗ Audio browser failed:', e); }
    
    // Fix mobile keyboard scroll issues
    try {
        initializeMobileKeyboardFix();
        console.log('✓ Mobile keyboard fix initialized');
    } catch (e) { console.error('✗ Mobile keyboard fix failed:', e); }
    
    // Prevent pull-to-refresh on mobile
    try {
        initializePreventPullToRefresh();
        console.log('✓ Pull-to-refresh prevention initialized');
    } catch (e) { console.error('✗ Pull-to-refresh prevention failed:', e); }
    
    // Initialize TTS language dropdown state
    try {
        initializeTTSLanguageControls();
        console.log('✓ TTS language controls initialized');
    } catch (e) { console.error('✗ TTS language controls failed:', e); }
    
                // Initialize global audio playback speed UI
    try {
        initializeAudioSpeedControls();
        console.log('✓ Audio speed controls initialized');
    } catch (e) { console.error('✗ Audio speed controls failed:', e); }

    // Initialize prompt history system
    try {
        initializePromptHistory();
        console.log('✓ Prompt history initialized');
    } catch (e) { console.error('✗ Prompt history failed:', e); }

    console.log('DOMContentLoaded - Initialization complete');
});
function updateTTSLanguageState(engineId, languageId) {
    const engineSelect = document.getElementById(engineId);
    const languageSelect = document.getElementById(languageId);
    
    if (!engineSelect || !languageSelect) return;
    
    const engine = engineSelect.value;
    const isMultilingual = engine === 'Chatterbox Multilingual';
    
    // Enable only for Multilingual engine
    languageSelect.disabled = !isMultilingual;
    
    // Add visual indication
    if (isMultilingual) {
        languageSelect.style.opacity = '1';
        languageSelect.style.cursor = 'pointer';
    } else {
        languageSelect.style.opacity = '0.5';
        languageSelect.style.cursor = 'not-allowed';
    }
}

function initializeTTSLanguageControls() {
    // TTS Tab - Main TTS engine and language
    const ttsEngine = document.getElementById('ttsEngine');
    const ttsLanguage = document.getElementById('ttsLanguage');
    
    if (ttsEngine && ttsLanguage) {
        // Set initial state
        updateTTSLanguageState('ttsEngine', 'ttsLanguage');
        
        // Listen for engine changes
        ttsEngine.addEventListener('change', function() {
            updateTTSLanguageState('ttsEngine', 'ttsLanguage');
        });
    }
    
    // Audio Tab - Edit/Regen TTS engine and language
    const editTtsEngine = document.getElementById('editTtsEngine');
    const editLanguage = document.getElementById('editLanguage');
    
    if (editTtsEngine && editLanguage) {
        // Set initial state
        updateTTSLanguageState('editTtsEngine', 'editLanguage');
        
        // Listen for engine changes
        editTtsEngine.addEventListener('change', function() {
            updateTTSLanguageState('editTtsEngine', 'editLanguage');
        });
    }
}

function initializeDeviceFullscreenSync() {
    // Use MutationObserver to detect when fullscreen overlay is activated
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type === 'attributes' && m.target.classList && m.target.classList.contains('fullscreen-viewer')) {
                const isActive = m.target.classList.contains('active');
                if (isActive) {
                    requestDeviceFullscreen(m.target);
                } else {
                    exitDeviceFullscreen();
                }
            }
        }
    });
    // Observe any existing fullscreen viewer containers
    document.querySelectorAll('.fullscreen-viewer').forEach(el => {
        observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    // Also observe DOM for newly added fullscreen viewer elements
    const domObserver = new MutationObserver(() => {
        document.querySelectorAll('.fullscreen-viewer').forEach(el => {
            // Ensure each element is observed once
            observer.observe(el, { attributes: true, attributeFilter: ['class'] });
        });
    });
    domObserver.observe(document.body, { childList: true, subtree: true });
}

function requestDeviceFullscreen(element) {
    try {
        const el = element || document.documentElement;
        if (document.fullscreenElement) return; // already fullscreen
        if (el.requestFullscreen) {
            el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
        } else if (el.webkitRequestFullscreen) { // Safari/iOS
            el.webkitRequestFullscreen();
        } else if (el.msRequestFullscreen) { // IE/Edge legacy
            el.msRequestFullscreen();
        }
    } catch (e) {
        console.warn('Fullscreen request failed:', e);
    }
}

function exitDeviceFullscreen() {
    try {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        } else if (document.webkitFullscreenElement) {
            document.webkitExitFullscreen();
        }
    } catch (e) {
        console.warn('Exit fullscreen failed:', e);
    }
}

// Mobile Overlay for Sidebar
function initializeMobileOverlay() {
    const mainContent = document.querySelector('.main-content');
    const queueSidebar = document.getElementById('queueSidebar');
    const tabsSidebar = document.getElementById('tabsSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    
    // Start with both sidebars collapsed on mobile
    if (window.innerWidth <= 768) {
        if (queueSidebar) queueSidebar.classList.add('collapsed');
        if (tabsSidebar) tabsSidebar.classList.add('collapsed');
    }
    
    // Function to update backdrop visibility
    function updateBackdrop() {
        if (window.innerWidth <= 768 && backdrop) {
            const queueOpen = queueSidebar && !queueSidebar.classList.contains('collapsed');
            const tabsOpen = tabsSidebar && !tabsSidebar.classList.contains('collapsed');
            
            if (queueOpen || tabsOpen) {
                backdrop.classList.add('active');
                // Only prevent body scroll if keyboard is not open
                if (!document.body.classList.contains('keyboard-open')) {
                    document.body.style.overflow = 'hidden';
                }
            } else {
                backdrop.classList.remove('active');
                // Restore body scroll when sidebars are closed (unless keyboard is open)
                // Use 'auto' instead of '' to override CSS default of 'hidden'
                if (!document.body.classList.contains('keyboard-open')) {
                    document.body.style.overflow = 'auto';
                }
            }
        } else if (backdrop) {
            backdrop.classList.remove('active');
            // Restore body scroll on desktop
            document.body.style.overflow = '';
        }
    }
    
    // Close sidebars when clicking backdrop
    if (backdrop) {
        backdrop.addEventListener('click', function() {
            if (queueSidebar) queueSidebar.classList.add('collapsed');
            if (tabsSidebar) tabsSidebar.classList.add('collapsed');
            updateBackdrop();
        });
    }
    
    // Prevent clicks inside sidebars from closing them
    if (queueSidebar) {
        queueSidebar.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }
    if (tabsSidebar) {
        tabsSidebar.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }
    
    // Close sidebars when clicking on main content on mobile
    if (mainContent) {
        mainContent.addEventListener('click', function(e) {
            if (window.innerWidth <= 768) {
                if (queueSidebar && !queueSidebar.classList.contains('collapsed')) {
                    queueSidebar.classList.add('collapsed');
                }
                if (tabsSidebar && !tabsSidebar.classList.contains('collapsed')) {
                    tabsSidebar.classList.add('collapsed');
                }
                updateBackdrop();
            }
        });
    }
    
    // Handle window resize
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            // On desktop, remove collapsed class to show normal behavior
            if (queueSidebar) queueSidebar.classList.remove('collapsed');
            if (tabsSidebar) tabsSidebar.classList.remove('collapsed');
        } else {
            // On mobile, update backdrop based on current state
            updateBackdrop();
        }
    });
    
    // Initial backdrop state
    updateBackdrop();
    
    // Make updateBackdrop available globally for toggle functions
    window.updateMobileSidebarBackdrop = updateBackdrop;
}

// Mobile Keyboard Fix - Prevent header cutoff and enable scrolling when keyboard opens
function initializeMobileKeyboardFix() {
    // Only apply on mobile devices
    if (window.innerWidth > 768) return;
    
    let lastWindowHeight = window.innerHeight;
    let lastVisualHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    let keyboardOpen = false;
    let lastFocusedInput = null;
    let preKeyboardState = null;

    function isTextEntryElement(element) {
        if (!element || !element.tagName) return false;
        const tagName = element.tagName.toUpperCase();
        if (tagName === 'TEXTAREA') return true;
        if (tagName === 'INPUT') {
            const inputType = (element.type || 'text').toLowerCase();
            return !['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'image', 'range', 'color'].includes(inputType);
        }
        return element.isContentEditable === true;
    }

    function getActiveInputElement() {
        const active = document.activeElement;
        return isTextEntryElement(active) ? active : null;
    }

    function getKeyboardInset() {
        if (!window.visualViewport) return 0;
        const viewport = window.visualViewport;
        return Math.max(0, Math.round(window.innerHeight - (viewport.height + viewport.offsetTop)));
    }

    function cachePreKeyboardState(activeInput) {
        const contentWrapper = document.querySelector('.content-wrapper');
        const inputScrollParent = activeInput ? (findScrollableParent(activeInput) || contentWrapper) : contentWrapper;

        preKeyboardState = {
            bodyOverflow: document.body.style.overflow,
            windowScrollY: window.scrollY,
            contentWrapperScrollTop: contentWrapper ? contentWrapper.scrollTop : 0,
            inputScrollParent,
            inputScrollTop: inputScrollParent ? inputScrollParent.scrollTop : 0
        };
    }

    function restorePreKeyboardState() {
        if (!preKeyboardState) return;

        const {
            bodyOverflow,
            windowScrollY,
            contentWrapperScrollTop,
            inputScrollParent,
            inputScrollTop
        } = preKeyboardState;

        document.body.style.overflow = bodyOverflow || '';

        const contentWrapper = document.querySelector('.content-wrapper');
        if (contentWrapper) {
            contentWrapper.scrollTop = contentWrapperScrollTop || 0;
        }

        if (inputScrollParent && inputScrollParent !== contentWrapper) {
            inputScrollParent.scrollTop = inputScrollTop || 0;
        }

        if (window.scrollY !== (windowScrollY || 0)) {
            window.scrollTo({ top: windowScrollY || 0, behavior: 'auto' });
        }

        preKeyboardState = null;
    }

    function keepFocusedInputVisible() {
        const activeInput = getActiveInputElement() || lastFocusedInput;
        if (!activeInput || typeof activeInput.scrollIntoView !== 'function') return;

        requestAnimationFrame(() => {
            activeInput.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        });
    }
    
    function handleKeyboardStateChange() {
        const activeInput = getActiveInputElement();
        if (activeInput) {
            lastFocusedInput = activeInput;
        }

        // Get current viewport heights
        const currentWindowHeight = window.innerHeight;
        const currentVisualHeight = window.visualViewport ? window.visualViewport.height : currentWindowHeight;
        const keyboardInset = getKeyboardInset();
        document.documentElement.style.setProperty('--mobile-keyboard-offset', `${keyboardInset}px`);
        
        // Calculate height differences
        const windowHeightDiff = lastWindowHeight - currentWindowHeight;
        const visualHeightDiff = lastVisualHeight - currentVisualHeight;
        
        // Keyboard likely opened (significant height decrease)
        if ((visualHeightDiff > 150 || windowHeightDiff > 150) && !keyboardOpen) {
            keyboardOpen = true;
            cachePreKeyboardState(activeInput || lastFocusedInput);
            document.body.classList.add('keyboard-open');
            
            // Allow scrolling when keyboard is open
            const backdrop = document.getElementById('sidebarBackdrop');
            const sidebarOpen = backdrop && backdrop.classList.contains('active');
            
            // Only change overflow if no sidebar is open
            if (!sidebarOpen) {
                document.body.style.overflow = 'auto';
            }

            keepFocusedInputVisible();
            
            console.log('Keyboard opened - enabling scroll');
        }
        // Keyboard stays open: keep active input in view while viewport animates
        else if (keyboardOpen && (visualHeightDiff > 20 || windowHeightDiff > 20)) {
            keepFocusedInputVisible();
        }
        // Keyboard likely closed (height increased back significantly)
        else if (keyboardOpen && (visualHeightDiff < -100 || windowHeightDiff < -100)) {
            keyboardOpen = false;
            document.body.classList.remove('keyboard-open');

            document.documentElement.style.setProperty('--mobile-keyboard-offset', '0px');
            restorePreKeyboardState();
            
            console.log('Keyboard closed - restoring scroll state');
        }
        
        // Update stored heights
        lastWindowHeight = currentWindowHeight;
        lastVisualHeight = currentVisualHeight;
    }
    
    // Use Visual Viewport API (best for keyboard detection on iOS)
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleKeyboardStateChange);
        window.visualViewport.addEventListener('scroll', handleKeyboardStateChange);
    }
    
    // Fallback: Monitor window resize
    window.addEventListener('resize', handleKeyboardStateChange);
    
    // Additional detection via focus events
    document.addEventListener('focusin', function(e) {
        if (isTextEntryElement(e.target)) {
            lastFocusedInput = e.target;
            // Give keyboard time to animate in
            setTimeout(handleKeyboardStateChange, 300);
            setTimeout(keepFocusedInputVisible, 380);
        }
    });
    
    document.addEventListener('focusout', function(e) {
        if (isTextEntryElement(e.target)) {
            // Give keyboard time to animate out
            setTimeout(handleKeyboardStateChange, 300);
        }
    });
    
    console.log('Mobile keyboard fix initialized');
}

// Prevent Pull-to-Refresh on Mobile
function initializePreventPullToRefresh() {
    const userAgent = navigator.userAgent || '';
    const isFirefoxAndroid = /Android/i.test(userAgent) && /Firefox\//i.test(userAgent);
    if (isFirefoxAndroid) {
        console.log('Skipping pull-to-refresh prevention on Firefox Android for reliable scrolling');
        return;
    }

    let touchStartY = 0;
    let preventPullToRefresh = false;
    let activeScrollableParent = null;
    
    // Detect touchstart to check if user is at the top of the page
    document.addEventListener('touchstart', function(e) {
        if (!e.touches || e.touches.length === 0) {
            return;
        }

        touchStartY = e.touches[0].clientY;

        // Only consider pull-to-refresh blocking for gestures that start near the top edge.
        if (touchStartY > 40) {
            preventPullToRefresh = false;
            activeScrollableParent = null;
            return;
        }
        
        // Check if any scrollable element is at the top
        const target = e.target;
        activeScrollableParent = findScrollableParent(target);
        
        // Only block pull-to-refresh when the page itself is the scroll context.
        // Internal scroll containers (main content, sidebars, modals) must keep native touch scrolling.
        const scrollingRoot = document.scrollingElement || document.documentElement;
        preventPullToRefresh = !activeScrollableParent && (scrollingRoot ? scrollingRoot.scrollTop === 0 : window.scrollY === 0);
    }, { passive: true });
    
    // Prevent touchmove if pulling down from the top
    document.addEventListener('touchmove', function(e) {
        if (!preventPullToRefresh || activeScrollableParent) {
            return;
        }

        if (!e.cancelable || !e.touches || e.touches.length === 0) {
            return;
        }

        const touchY = e.touches[0].clientY;
        const touchDelta = touchY - touchStartY;
        
        // If pulling down (positive delta) and at the top, prevent default
        if (touchDelta > 12) {
            e.preventDefault();
        }
    }, { passive: false });

    document.addEventListener('touchend', function() {
        preventPullToRefresh = false;
        activeScrollableParent = null;
    }, { passive: true });
    
    console.log('Pull-to-refresh prevention initialized');
}

// Helper function to find the nearest scrollable parent
function findScrollableParent(element) {
    if (!element || element === document.body) {
        return null;
    }
    
    const style = window.getComputedStyle(element);
    const overflowY = style.overflowY;
    const isScrollable = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
    
    if (isScrollable && element.scrollHeight > element.clientHeight) {
        return element;
    }
    
    return findScrollableParent(element.parentElement);
}

// Event Listeners
function initializeEventListeners() {
    // Header toggle
    const headerToggleBtn = document.getElementById('headerToggleBtn');
    if (headerToggleBtn) {
        // Main chevron button toggles header
        const headerToggleChevron = headerToggleBtn.querySelector('.header-toggle-chevron');
        if (headerToggleChevron) {
            headerToggleChevron.addEventListener('click', toggleHeader);
        }
        
        // Tab button toggles tabs sidebar (only shown when header collapsed on mobile)
        const headerToggleTabBtn = document.getElementById('headerToggleTabBtn');
        if (headerToggleTabBtn) {
            headerToggleTabBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleMobileMenu();
            });
        }
        
        // Queue button toggles queue sidebar (only shown when header collapsed on mobile)
        const headerToggleQueueBtn = document.getElementById('headerToggleQueueBtn');
        if (headerToggleQueueBtn) {
            headerToggleQueueBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleMobileQueue();
            });
        }
    }
    
    // Mobile menu
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    }
    
    const mobileQueueBtn = document.getElementById('mobileQueueBtn');
    if (mobileQueueBtn) {
        mobileQueueBtn.addEventListener('click', toggleMobileQueue);
    }
    
    // Collapsible sections
    initializeCollapsibleSections();
    
    // Chat auto-scroll controls
    const chatMessagesContainer = document.getElementById('chatMessages');
    if (chatMessagesContainer) {
        chatMessagesContainer.addEventListener('scroll', handleChatScroll, { passive: true });
    }
    const chatScrollBottomBtn = document.getElementById('chatScrollBottomBtn');
    if (chatScrollBottomBtn) {
        chatScrollBottomBtn.addEventListener('click', (event) => {
            event.preventDefault();
            scrollChatToBottom();
        });
    }

    // Queue toggle
    document.getElementById('toggleQueue').addEventListener('click', toggleQueue);
    document.getElementById('toggleTabs').addEventListener('click', toggleTabs);
    document.getElementById('pauseQueueBtn').addEventListener('click', toggleQueuePause);
    document.getElementById('clearQueueBtn').addEventListener('click', clearQueue);
    document.getElementById('unloadModelsBtn').addEventListener('click', unloadModels);
    
    // Queue filter buttons
    document.getElementById('filterQueued').addEventListener('click', () => toggleQueueFilter('queued'));
    document.getElementById('filterGenerating').addEventListener('click', () => toggleQueueFilter('generating'));
    document.getElementById('filterCompleted').addEventListener('click', () => toggleQueueFilter('completed'));
    document.getElementById('queueDirectionBtn').addEventListener('click', toggleQueueDirection);
    
    // Event delegation for cancel buttons and completed images (handles dynamically created content)
    document.addEventListener('click', function(e) {
        // Check if click is on or inside a reorder button
        const reorderBtn = e.target.closest('.queue-item-reorder');
        if (reorderBtn) {
            e.preventDefault();
            e.stopPropagation();
            
            const jobId = reorderBtn.getAttribute('data-job-id');
            const direction = reorderBtn.getAttribute('data-direction');
            
            if (jobId && direction) {
                moveQueueItem(jobId, direction);
            }
            return;
        }
        
        // Check if click is on or inside a cancel button
        const cancelBtn = e.target.closest('.queue-item-cancel');
        if (cancelBtn) {
            e.preventDefault();
            e.stopPropagation();
            
            const jobId = cancelBtn.getAttribute('data-job-id');
            console.log('Cancel button clicked, jobId:', jobId, 'button:', cancelBtn);
            
            if (jobId) {
                cancelJob(jobId);
            } else {
                console.error('Cancel button found but no job ID', cancelBtn);
            }
            return;
        }
        
        // Handle completed image clicks
        const completedImg = e.target.closest('.completed-image-thumb');
        if (completedImg) {
            const relativePath = completedImg.getAttribute('data-completed-image');
            if (relativePath) {
                e.preventDefault();
                e.stopPropagation();
                openCompletedImage(relativePath);
            }
        }
        
        // Handle completed queue item clicks (navigate to media in appropriate browser)
        const queueItem = e.target.closest('.queue-item');
        if (queueItem) {
            // Don't trigger if clicking on action buttons or images (already handled above)
            if (e.target.closest('.queue-item-actions') || e.target.closest('.completed-image-thumb')) {
                return;
            }
            
            // Only handle completed items
            const statusEl = queueItem.querySelector('.queue-item-status');
            if (statusEl && statusEl.textContent === 'completed') {
                const jobId = queueItem.getAttribute('data-job-id');
                if (jobId) {
                    e.preventDefault();
                    e.stopPropagation();
                    navigateToCompletedItem(jobId);
                }
            }
        }
    }, true);
    
    // Generate button
    document.getElementById('generateBtn').addEventListener('click', generateImage);
    
    // Image modal
    document.getElementById('closeImageBtn').addEventListener('click', closeImageModal);
    document.getElementById('imageOverlay').addEventListener('click', closeImageModal);
    document.getElementById('imagePrev').addEventListener('click', prevImage);
    document.getElementById('imageNext').addEventListener('click', nextImage);
    document.getElementById('importBtn').addEventListener('click', importImageData);
    document.getElementById('deleteImageBtn').addEventListener('click', deleteCurrentImage);
    
    // Clear seed button
    document.getElementById('clearSeedBtn').addEventListener('click', clearSeed);
    
    // Image upload handlers
    document.getElementById('imageUpload').addEventListener('change', handleImagePreview);
    document.getElementById('clearImageBtn').addEventListener('click', clearUploadedImage);
    document.getElementById('useImageSize').addEventListener('change', toggleDimensionFields);
    
    // Batch image upload handlers
    document.getElementById('batchImageUpload').addEventListener('change', handleBatchImagePreview);
    document.getElementById('clearBatchImageBtn').addEventListener('click', clearBatchUploadedImage);
    document.getElementById('batchUseImageSize').addEventListener('change', toggleBatchDimensionFields);
    
    // Image browser buttons
    const browseImageBtn = document.getElementById('browseImageBtn');
    const browseBatchImageBtn = document.getElementById('browseBatchImageBtn');
    const closeBrowserBtn = document.getElementById('closeBrowserBtn');
    
    if (browseImageBtn) {
        browseImageBtn.addEventListener('click', () => openImageBrowser('single'));
    }
    if (browseBatchImageBtn) {
        browseBatchImageBtn.addEventListener('click', () => openImageBrowser('batch'));
    }
    if (closeBrowserBtn) {
        closeBrowserBtn.addEventListener('click', closeImageBrowser);
    }
    
    // Image browser tabs
    document.querySelectorAll('.image-browser-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const folder = e.target.dataset.folder;
            loadImageBrowserFolder(folder, '');
        });
    });

    // Audio browser tabs and close button
    document.querySelectorAll('.audio-browser-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const folder = e.target.dataset.folder;
            loadAudioBrowserFolder(folder, '');
        });
    });

    const ttsNarratorAudioInput = document.getElementById('ttsNarratorAudio');
    if (ttsNarratorAudioInput) {
        rememberTtsReferenceAudio(ttsNarratorAudioInput.value || 'Holly.mp3');
        ttsNarratorAudioInput.addEventListener('change', () => {
            rememberTtsReferenceAudio(ttsNarratorAudioInput.value);
        });
    }

    const modalTTSVoiceInput = document.getElementById('modalTTSVoice');
    if (modalTTSVoiceInput) {
        modalTTSVoiceInput.addEventListener('change', () => {
            rememberTtsReferenceAudio(modalTTSVoiceInput.value);
        });
    }
    
    const closeAudioBrowserBtn = document.getElementById('closeAudioBrowserBtn');
    if (closeAudioBrowserBtn) {
        closeAudioBrowserBtn.addEventListener('click', closeAudioBrowser);
    }

    // Use This Folder (Image Batch or Video Batch or Frame Edit)
    const useFolderBtn = document.getElementById('useThisFolderBtn');
    if (useFolderBtn) {
        useFolderBtn.addEventListener('click', async () => {
            try {
                if (imageBrowserMode === 'image-batch') {
                    // Image batch: handle both input and output folders
                    if (currentBrowserFolder === 'output') {
                        // Copy folder from output to input
                        showNotification('Copying folder from output to input...', 'Copying', 'info');
                        
                        const response = await fetch('/api/copy_folder_to_input', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                folder_path: currentBrowserSubpath || ''
                            })
                        });
                        
                        const result = await response.json();
                        if (result.success) {
                            // Use the copied folder name
                            selectedImageBatchFolder = result.folder_name;
                            const display = document.getElementById('imageBatchFolderDisplay');
                            display.textContent = result.folder_name;
                            showNotification(`Folder copied and selected: ${result.folder_name}`, 'Success', 'success', 3000);
                            closeImageBrowser();
                        } else {
                            showNotification('Error: ' + (result.error || 'Failed to copy folder'), 'Error', 'error');
                        }
                    } else {
                        // Use from input folder directly
                        selectedImageBatchFolder = currentBrowserSubpath || '';
                        const display = document.getElementById('imageBatchFolderDisplay');
                        display.textContent = selectedImageBatchFolder ? selectedImageBatchFolder : 'Root';
                        closeImageBrowser();
                    }
                } else if (imageBrowserMode === 'frame-edit' && currentBrowserFolder === 'input') {
                    // Frame Edit: select folder from input/frame_edit/
                    selectedFrameEditFolder = currentBrowserSubpath || '';
                    const display = document.getElementById('frameEditFolderDisplay');
                    // Remove 'frame_edit/' prefix from display
                    const displayPath = selectedFrameEditFolder.replace(/^frame_edit\//, '');
                    display.textContent = displayPath || 'No folder selected';
                    
                    // Fetch and display frame count
                    updateFrameEditCount(selectedFrameEditFolder);
                    
                    closeImageBrowser();
                } else if (imageBrowserMode === 'stitch') {
                    // Stitch: select folder from input/frame_edit/ or output/images/frame_edit/
                    selectedStitchFolder = currentBrowserSubpath || '';
                    selectedStitchSource = currentBrowserFolder; // Track which folder type
                    const display = document.getElementById('stitchFolderDisplay');
                    
                    // Remove prefix from display based on source
                    let displayPath;
                    if (currentBrowserFolder === 'input') {
                        displayPath = selectedStitchFolder.replace(/^frame_edit\//, '');
                    } else {
                        displayPath = selectedStitchFolder.replace(/^images\/frame_edit\//, '');
                    }
                    display.textContent = displayPath || 'No folder selected';
                    
                    // Parse and set FPS from folder name
                    const folderName = displayPath.split('/').pop() || displayPath;
                    const fps = parseFpsFromFolderName(folderName);
                    document.getElementById('stitchFps').value = fps;
                    
                    // Fetch and display frame count
                    updateStitchFrameCount(selectedStitchFolder, currentBrowserFolder);
                    
                    closeImageBrowser();
                } else if (imageBrowserMode === 'video-batch') {
                    // Video batch: handle both input and output folders
                    if (currentBrowserFolder === 'output') {
                        // Copy folder from output to input
                        showNotification('Copying folder from output to input...', 'Copying', 'info');
                        
                        const response = await fetch('/api/copy_folder_to_input', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                folder_path: currentBrowserSubpath || ''
                            })
                        });
                        
                        const result = await response.json();
                        if (result.success) {
                            // Use the copied folder name
                            selectedVideoBatchFolder = result.folder_name;
                            const display = document.getElementById('videoBatchFolderDisplay');
                            display.textContent = result.folder_name;
                            showNotification(`Folder copied and selected: ${result.folder_name}`, 'Success', 'success', 3000);
                            closeImageBrowser();
                        } else {
                            showNotification('Error: ' + (result.error || 'Failed to copy folder'), 'Error', 'error');
                        }
                    } else {
                        // Use from input folder directly
                        selectedVideoBatchFolder = currentBrowserSubpath || '';
                        const display = document.getElementById('videoBatchFolderDisplay');
                        display.textContent = selectedVideoBatchFolder ? selectedVideoBatchFolder : 'Root';
                        closeImageBrowser();
                    }
                }
            } catch (error) {
                console.error('Error using folder:', error);
                showNotification('Error selecting folder', 'Error', 'error');
            }
        });
    }
    
    // Fullscreen viewer
    document.getElementById('fullscreenBtn').addEventListener('click', openFullscreen);
    document.getElementById('fullscreenClose').addEventListener('click', closeFullscreen);
    document.getElementById('fullscreenPrev').addEventListener('click', fullscreenPrevImage);
    document.getElementById('fullscreenNext').addEventListener('click', fullscreenNextImage);
    
    // Fullscreen input/output toggle button
    const fullscreenToggleBtn = document.getElementById('fullscreenToggleInputBtn');
    if (fullscreenToggleBtn) {
        fullscreenToggleBtn.addEventListener('click', smartToggleInputView);
    }

    const fullscreenAutoFollowCheckbox = document.getElementById('fullscreenAutoFollowCheckbox');
    if (fullscreenAutoFollowCheckbox) {
        fullscreenAutoFollowCheckbox.addEventListener('change', (e) => {
            fullscreenAutoFollowEnabled = Boolean(e.target.checked);

            if (!fullscreenAutoFollowEnabled && isFullscreenActive) {
                const sourceArray = getFullscreenSourceArray();
                const activeItem = sourceArray[currentImageIndex];
                fullscreenLockedMediaKey = getMediaIdentityKey(activeItem);
            }

            if (isFullscreenActive && fullscreenSource) {
                syncFullscreenAfterDataRefresh(fullscreenSource);
            }
        });
    }
    syncFullscreenAutoFollowControl();
    
    // Match sizes checkboxes
    const matchSizesCheckbox = document.getElementById('matchSizesCheckbox');
    const fullscreenMatchSizesCheckbox = document.getElementById('fullscreenMatchSizesCheckbox');
    const viewerMatchSizesCheckbox = document.getElementById('viewerMatchSizesCheckbox');
    
    if (matchSizesCheckbox) {
        matchSizesCheckbox.addEventListener('change', (e) => {
            matchSizesEnabled = e.target.checked;
            // Sync with fullscreen checkbox
            if (fullscreenMatchSizesCheckbox) fullscreenMatchSizesCheckbox.checked = matchSizesEnabled;
            // Re-render current view
            if (currentImageData) {
                const imageModal = document.getElementById('imageModal');
                if (imageModal.classList.contains('active')) {
                    showImageAtIndex(currentImageIndex);
                }
            }
        });
    }
    
    if (fullscreenMatchSizesCheckbox) {
        fullscreenMatchSizesCheckbox.addEventListener('change', (e) => {
            matchSizesEnabled = e.target.checked;
            // Sync with modal checkbox
            if (matchSizesCheckbox) matchSizesCheckbox.checked = matchSizesEnabled;
            // Re-render current view
            if (isFullscreenActive && currentImageData) {
                showFullscreenImage(currentImageIndex);
            }
        });
    }
    
    if (viewerMatchSizesCheckbox) {
        viewerMatchSizesCheckbox.addEventListener('change', (e) => {
            matchSizesEnabled = e.target.checked;
            // Sync with fullscreen checkbox
            if (fullscreenMatchSizesCheckbox) fullscreenMatchSizesCheckbox.checked = matchSizesEnabled;
            // Re-render current view
            if (viewerCurrentData) {
                displayViewerContent(viewerCurrentData);
            }
        });
    }
    
    // Hover comparison checkbox
    const hoverCompareCheckbox = document.getElementById('hoverCompareCheckbox');
    if (hoverCompareCheckbox) {
        hoverCompareCheckbox.addEventListener('change', (e) => {
            hoverCompareEnabled = e.target.checked;
            // Sync with fullscreen checkbox
            const fsCheckbox = document.getElementById('fullscreenHoverCompareCheckbox');
            if (fsCheckbox) fsCheckbox.checked = hoverCompareEnabled;
            // Show/hide radius control
            const radiusControl = document.getElementById('hoverRadiusControl');
            if (radiusControl) {
                radiusControl.style.display = e.target.checked ? 'flex' : 'none';
            }
            // Re-render current image to toggle comparison mode
            if (currentImageData) {
                const imageModal = document.getElementById('imageModal');
                if (imageModal.classList.contains('active')) {
                    showImageAtIndex(currentImageIndex);
                }
            }
        });
    }
    
    // Hover comparison radius slider
    const hoverRadiusSlider = document.getElementById('hoverRadiusSlider');
    const hoverRadiusValue = document.getElementById('hoverRadiusValue');
    if (hoverRadiusSlider && hoverRadiusValue) {
        hoverRadiusSlider.addEventListener('input', (e) => {
            hoverCompareRadius = parseInt(e.target.value);
            hoverRadiusValue.textContent = `${hoverCompareRadius}px`;
            // Sync with fullscreen slider
            const fsSlider = document.getElementById('fullscreenHoverRadiusSlider');
            const fsValue = document.getElementById('fullscreenHoverRadiusValue');
            if (fsSlider) fsSlider.value = hoverCompareRadius;
            if (fsValue) fsValue.textContent = `${hoverCompareRadius}px`;
            // Re-render if currently showing comparison
            if (hoverCompareEnabled && currentImageData) {
                const imageModal = document.getElementById('imageModal');
                if (imageModal.classList.contains('active')) {
                    showImageAtIndex(currentImageIndex);
                }
                if (isFullscreenActive) {
                    showFullscreenImage(currentImageIndex);
                }
            }
        });
    }
    
    // Fullscreen hover comparison checkbox
    const fullscreenHoverCompareCheckbox = document.getElementById('fullscreenHoverCompareCheckbox');
    if (fullscreenHoverCompareCheckbox) {
        fullscreenHoverCompareCheckbox.addEventListener('change', (e) => {
            hoverCompareEnabled = e.target.checked;
            // Sync with modal checkbox
            const modalCheckbox = document.getElementById('hoverCompareCheckbox');
            if (modalCheckbox) modalCheckbox.checked = hoverCompareEnabled;
            // Show/hide radius control
            const radiusControl = document.getElementById('fullscreenHoverRadiusControl');
            if (radiusControl) {
                radiusControl.style.display = e.target.checked ? 'flex' : 'none';
            }
            // Re-render current image
            if (isFullscreenActive && currentImageData) {
                showFullscreenImage(currentImageIndex);
            }
        });
    }
    
    // Fullscreen hover radius slider
    const fullscreenHoverRadiusSlider = document.getElementById('fullscreenHoverRadiusSlider');
    const fullscreenHoverRadiusValue = document.getElementById('fullscreenHoverRadiusValue');
    if (fullscreenHoverRadiusSlider && fullscreenHoverRadiusValue) {
        fullscreenHoverRadiusSlider.addEventListener('input', (e) => {
            hoverCompareRadius = parseInt(e.target.value);
            fullscreenHoverRadiusValue.textContent = `${hoverCompareRadius}px`;
            // Sync with modal slider
            const modalSlider = document.getElementById('hoverRadiusSlider');
            const modalValue = document.getElementById('hoverRadiusValue');
            if (modalSlider) modalSlider.value = hoverCompareRadius;
            if (modalValue) modalValue.textContent = `${hoverCompareRadius}px`;
            // Re-render if currently showing comparison
            if (hoverCompareEnabled && isFullscreenActive && currentImageData) {
                showFullscreenImage(currentImageIndex);
            }
        });
    }
    
    // Fullscreen autoplay controls
    document.getElementById('fullscreenPlayPause').addEventListener('click', toggleAutoplay);
    
    // Folder management
    document.getElementById('newFolderBtn').addEventListener('click', createNewFolder);
    document.getElementById('setOutputFolderBtn').addEventListener('click', setOutputFolder);
    document.getElementById('selectionModeBtn').addEventListener('click', toggleSelectionMode);
    document.getElementById('moveBtn').addEventListener('click', moveSelectedItems);
    document.getElementById('deleteBtn').addEventListener('click', deleteSelectedItems);
    
    // Touch support for fullscreen
    initTouchSupport();
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);
    
    // Batch generation
    initializeBatchMode();
    
    // Video generation
    console.log('Initializing video generation controls...');
    const videoImageUpload = document.getElementById('videoImageUpload');
    const clearVideoImageBtn = document.getElementById('clearVideoImageBtn');
    const clearVideoSeedBtn = document.getElementById('clearVideoSeedBtn');
    const generateVideoBtn = document.getElementById('generateVideoBtn');
    const browseVideoImageBtn = document.getElementById('browseVideoImageBtn');
    
    console.log('Video elements:', {
        videoImageUpload,
        clearVideoImageBtn,
        clearVideoSeedBtn,
        generateVideoBtn,
        browseVideoImageBtn
    });
    
    if (videoImageUpload) {
        videoImageUpload.addEventListener('change', handleVideoImagePreview);
        console.log('✓ Video upload listener attached');
    } else {
        console.error('✗ Video upload input not found');
    }
    if (clearVideoImageBtn) {
        clearVideoImageBtn.addEventListener('click', clearVideoImage);
        console.log('✓ Clear video image listener attached');
    }
    if (clearVideoSeedBtn) {
        clearVideoSeedBtn.addEventListener('click', clearVideoSeed);
        console.log('✓ Clear video seed listener attached');
    }
    
    // Note: generateVideoBtn uses inline onclick handler in HTML for reliability
    // No addEventListener needed here to avoid duplicate calls
    
    if (browseVideoImageBtn) {
        browseVideoImageBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Browse video image button clicked');
            openImageBrowser('video');
        }, true);
        console.log('✓ Browse video image listener attached');
    } else {
        console.error('✗ Browse video image button not found');
    }

    // Frame Edit video controls
    const frameEditVideoUpload = document.getElementById('frameEditVideoUpload');
    const clearFrameEditVideoBtn = document.getElementById('clearFrameEditVideoBtn');
    const browseFrameEditVideoBtn = document.getElementById('browseFrameEditVideoBtn');
    const extractFramesBtn = document.getElementById('extractFramesBtn');
    
    if (frameEditVideoUpload) {
        frameEditVideoUpload.addEventListener('change', handleFrameEditVideoPreview);
    }
    if (clearFrameEditVideoBtn) {
        clearFrameEditVideoBtn.addEventListener('click', clearFrameEditVideo);
    }
    if (browseFrameEditVideoBtn) {
        browseFrameEditVideoBtn.addEventListener('click', () => openVideoBrowser());
    }
    if (extractFramesBtn) {
        extractFramesBtn.addEventListener('click', extractFrames);
    }
    
    // Frame extraction calculation inputs
    const frameStartTime = document.getElementById('frameStartTime');
    const frameEndTime = document.getElementById('frameEndTime');
    const frameSkip = document.getElementById('frameSkip');
    
    if (frameStartTime) {
        frameStartTime.addEventListener('input', updateFrameCalculations);
    }
    if (frameEndTime) {
        frameEndTime.addEventListener('input', updateFrameCalculations);
    }
    if (frameSkip) {
        frameSkip.addEventListener('input', updateFrameCalculations);
    }
    
    // Frame Edit Step 2 controls
    const chooseFrameEditFolderBtn = document.getElementById('chooseFrameEditFolderBtn');
    const queueFrameEditBtn = document.getElementById('queueFrameEditBtn');
    
    if (chooseFrameEditFolderBtn) {
        chooseFrameEditFolderBtn.addEventListener('click', openFrameEditFolderBrowser);
    }
    if (queueFrameEditBtn) {
        queueFrameEditBtn.addEventListener('click', queueFrameEditBatch);
    }
    
    // Frame Edit Step 3 controls
    const chooseStitchFolderBtn = document.getElementById('chooseStitchFolderBtn');
    const stitchFramesBtn = document.getElementById('stitchFramesBtn');
    
    if (chooseStitchFolderBtn) {
        chooseStitchFolderBtn.addEventListener('click', openStitchFolderBrowser);
    }
    if (stitchFramesBtn) {
        stitchFramesBtn.addEventListener('click', stitchFramesToVideo);
    }
}

// Mobile Menu Toggle
function toggleMobileMenu(event) {
    // Prevent event from bubbling to main content
    if (event) {
        event.stopPropagation();
    }
    
    // Toggle the tabs sidebar (left) on mobile
    const sidebar = document.getElementById('tabsSidebar');
    const isCollapsed = sidebar.classList.contains('collapsed');
    
    if (isCollapsed) {
        // Opening the sidebar
        sidebar.classList.remove('collapsed');
    } else {
        // Closing the sidebar
        sidebar.classList.add('collapsed');
    }
    
    // Update backdrop on mobile
    if (window.updateMobileSidebarBackdrop) {
        window.updateMobileSidebarBackdrop();
    }
}

function toggleMobileQueue(event) {
    // Prevent event from bubbling to main content
    if (event) {
        event.stopPropagation();
    }
    
    // Toggle the queue sidebar (right) on mobile
    const sidebar = document.getElementById('queueSidebar');
    const isCollapsed = sidebar.classList.contains('collapsed');
    
    if (isCollapsed) {
        // Opening the sidebar
        sidebar.classList.remove('collapsed');
    } else {
        // Closing the sidebar
        sidebar.classList.add('collapsed');
    }
    
    // Update backdrop on mobile
    if (window.updateMobileSidebarBackdrop) {
        window.updateMobileSidebarBackdrop();
    }
}

// Collapsible Sections
function initializeCollapsibleSections() {
    const collapsibleHeaders = document.querySelectorAll('.collapsible-header');
    
    collapsibleHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const content = document.getElementById(targetId);
            
            if (content) {
                const isActive = content.classList.contains('active');
                
                // Toggle active state
                if (isActive) {
                    content.classList.remove('active');
                    this.classList.add('collapsed');
                } else {
                    content.classList.add('active');
                    this.classList.remove('collapsed');
                }
            }
        });
    });
}

// Tab Management
// Tab URL map for history.pushState
const TAB_URLS = {
    'single': '/image',
    'batch': '/text-batch',
    'image-batch': '/image-batch',
    'pinterest': '/pinterest',
    'video': '/video',
    'video-batch': '/video-batch',
    'frame-edit': '/frame-edit',
    'browser': '/browser',
    'videos': '/video-browser',
    'viewer': '/viewer',
    'chat': '/chat',
    'story': '/story',
    'autochat': '/autochat',
    'tts': '/tts',
    'audio': '/audio',
};

function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');

    tabButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            // Intercept <a> link navigation and handle in-page
            if (button.tagName === 'A') e.preventDefault();
            const targetTab = button.getAttribute('data-tab');
            switchTab(targetTab, true);
            // Update the browser URL without a full reload
            const url = TAB_URLS[targetTab];
            if (url && window.history && window.history.pushState) {
                window.history.pushState({ tab: targetTab }, '', url);
            }
        });
    });

    // Handle browser back/forward navigation
    window.addEventListener('popstate', (e) => {
        if (e.state && e.state.tab) {
            switchTab(e.state.tab);
        }
    });
}

function switchTab(tabName, _skipHistory) {
    const currentActiveTabId = document.querySelector('.tab-content.active')?.id;
    // Update browser URL unless called from initializeTabs (which does it itself)
    if (!_skipHistory) {
        const url = TAB_URLS[tabName];
        if (url && window.history && window.history.pushState) {
            window.history.pushState({ tab: tabName }, '', url);
        }
    }

    // Update button states
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-tab') === tabName) {
            btn.classList.add('active');
        }
    });
    
    // Update content visibility
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Close tabs sidebar on mobile after selection
    if (window.innerWidth <= 768) {
        const tabsSidebar = document.getElementById('tabsSidebar');
        if (tabsSidebar) {
            tabsSidebar.classList.remove('active');
            // Update backdrop
            if (window.updateMobileSidebarBackdrop) {
                window.updateMobileSidebarBackdrop();
            }
        }
    }
    
    const tabs = {
        'single': 'singleTab',
        'batch': 'batchTab',
        'image-batch': 'imageBatchTab',
        'pinterest': 'pinterestTab',
        'browser': 'browserTab',
        'reveal': 'revealTab',
        'video': 'videoTab',
        'video-batch': 'videoBatchTab',
        'frame-edit': 'frameEditTab',
        'videos': 'videosTab',
        'chat': 'chatTab',
        'story': 'storyTab',
        'autochat': 'autochatTab',
        'tts': 'ttsTab',
        'audio': 'audioTab',
        'viewer': 'viewerTab'
    };
    
    const tabId = tabs[tabName];
    if (currentActiveTabId && tabId && currentActiveTabId !== tabId) {
        stopAllConversationAudioPlayback(false);
    }

    if (tabId) {
        const element = document.getElementById(tabId);
        if (element) {
            element.classList.add('active');
        }
    }

    // Keep chat headers (model selector and controls) visible when entering chat tabs.
    if (tabName === 'chat' || tabName === 'story' || tabName === 'autochat') {
        const contentWrapper = document.querySelector('.content-wrapper');
        if (contentWrapper) {
            contentWrapper.scrollTop = 0;
        }
    }
    
    // Load content based on tab
    if (tabName === 'browser') {
        const targetPath = currentPath || 'images';
        const now = Date.now();
        if (browserLastLoadedPath !== targetPath || (now - browserLastLoadedAt) > 10000) {
            browseFolder(targetPath);
        }
    } else if (tabName === 'reveal') {
        loadRevealBrowser();
    } else if (tabName === 'videos') {
        const targetPath = videosCurrentPath || 'videos';
        const now = Date.now();
        if (videosLastLoadedPath !== targetPath || (now - videosLastLoadedAt) > 10000) {
            loadVideos(targetPath);
        }
    } else if (tabName === 'audio') {
        loadAudioBatches();
    } else if (tabName === 'chat') {
        // Refresh chat data when tab opens
        if (currentChatSession && currentChatSession.session_id) {
            // Verify session still exists before trying to select it
            const sessionExists = chatSessions.some(s => s.session_id === currentChatSession.session_id);
            if (sessionExists) {
                selectChatSession(currentChatSession.session_id);
            } else {
                console.log('[CHAT] Current session no longer exists, clearing');
                currentChatSession = null;
                stopWholeChatAudioPlayback(false);
                chatAutoScrollEnabled = true;
                setChatScrollButtonVisibility(false);
                updateChatAudioControlsState();
            }
        }
    } else if (tabName === 'story') {
        // Refresh story data when tab opens
        if (currentStorySession && currentStorySession.session_id) {
            const sessionExists = storySessions.some(s => s.session_id === currentStorySession.session_id);
            if (sessionExists) {
                selectStorySession(currentStorySession.session_id);
            } else {
                console.log('[STORY] Current session no longer exists, clearing');
                currentStorySession = null;
                storyAutoScrollEnabled = true;
            }
        }
    } else if (tabName === 'autochat') {
        // Initialize Auto Chat when tab opens
        if (typeof initializeAutoChat === 'function') {
            initializeAutoChat();
        }
    }
}

// Toast Notification System
function showNotification(message, title = 'Notice', type = 'info', duration = 5000) {
    const container = document.getElementById('notificationContainer');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    // Icon based on type
    const icons = {
        success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
        error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
        warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
        info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
    };
    
    notification.innerHTML = `
        <div class="notification-icon">${icons[type]}</div>
        <div class="notification-content">
            <div class="notification-title">${escapeHtml(title)}</div>
            <div class="notification-message">${escapeHtml(message)}</div>
        </div>
        <button class="notification-close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;
    
    container.appendChild(notification);
    
    // Close button handler
    const closeBtn = notification.querySelector('.notification-close');
    const close = () => {
        notification.classList.add('closing');
        setTimeout(() => notification.remove(), 300);
    };
    
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        close();
    });
    
    // Click notification to close
    notification.addEventListener('click', close);
    
    // Auto-close after duration
    if (duration > 0) {
        setTimeout(close, duration);
    }
}

// Play Notification Sound
let notificationAudioContext = null;

function playNotificationSound() {
    if (notificationSoundPlaying) return;
    notificationSoundPlaying = true;
    try {
        if (!notificationAudioContext) {
            notificationAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (notificationAudioContext.state === 'suspended') {
            notificationAudioContext.resume();
        }
        
        const oscillator = notificationAudioContext.createOscillator();
        const gainNode = notificationAudioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(notificationAudioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, notificationAudioContext.currentTime);
        oscillator.frequency.setValueAtTime(1000, notificationAudioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.3, notificationAudioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, notificationAudioContext.currentTime + 0.3);
        
        oscillator.start(notificationAudioContext.currentTime);
        oscillator.stop(notificationAudioContext.currentTime + 0.3);
        
        oscillator.onended = () => {
            notificationSoundPlaying = false;
        };
    } catch (error) {
        notificationSoundPlaying = false;
        console.error('Error playing notification sound:', error);
    }
}

// Browser Notification System
function sendBrowserNotification(job) {
    // Get notification type preference
    const notificationType = localStorage.getItem('notificationType') || 'sound';
    
    // If none, do nothing
    if (notificationType === 'none') return;
    
    // Play sound if sound or both
    if (notificationType === 'sound' || notificationType === 'both') {
        playNotificationSound();
    }
    
    // Send desktop notification if notification or both
    if (notificationType === 'notification' || notificationType === 'both') {
        sendDesktopNotification(job);
    }
}

// Desktop Notification (split from sendBrowserNotification for clarity)
function sendDesktopNotification(job) {
    
    // Check if browser supports notifications
    if (!('Notification' in window)) return;
    
    // Check if permission is granted
    if (Notification.permission !== 'granted') return;
    
    // Build notification content based on job type
    let title = 'Generation Complete';
    let body = '';
    let icon = '/static/assets/velvet_icon.png';
    
    if (job.job_type === 'image') {
        title = '🖼️ Image Generated';
        body = job.prompt ? job.prompt.substring(0, 100) : 'Image generation complete';
    } else if (job.job_type === 'video') {
        title = '🎬 Video Generated';
        body = job.prompt ? job.prompt.substring(0, 100) : 'Video generation complete';
    } else if (job.job_type === 'tts') {
        title = '🔊 Audio Generated';
        body = job.text ? job.text.substring(0, 100) : 'TTS generation complete';
    } else if (job.job_type === 'chat') {
        title = '💬 Chat Response';
        body = 'Chat response generated';
    } else if (job.job_type === 'story') {
        title = '📖 Story Response';
        body = 'Story response generated';
    } else if (job.job_type === 'autochat') {
        title = '🤖 Auto Chat Update';
        body = 'Auto chat conversation updated';
    }
    
    // Create and show the notification
    try {
        const notification = new Notification(title, {
            body: body,
            icon: icon,
            badge: icon,
            tag: `job-${job.id}`, // Prevent duplicate notifications
            requireInteraction: false,
            silent: false
        });
        
        // Click to focus window
        notification.onclick = function() {
            window.focus();
            notification.close();
        };
        
        // Auto-close after 5 seconds
        setTimeout(() => notification.close(), 5000);
    } catch (error) {
        console.error('Error sending browser notification:', error);
    }
}

// Legacy showAlert wrapper for compatibility
function showAlert(message, title = 'Notice') {
    showNotification(message, title, 'info', 5000);
    return Promise.resolve();
}

// Custom Dialog Functions (keep for prompts and confirms)

function showPrompt(message, defaultValue = '', title = 'Input Required') {
    return new Promise((resolve) => {
        const modal = document.getElementById('customDialog');
        document.getElementById('dialogTitle').textContent = title;
        document.getElementById('dialogMessage').textContent = message;
        document.getElementById('dialogInput').style.display = 'block';
        document.getElementById('dialogInputField').value = defaultValue;
        document.getElementById('dialogInputField').placeholder = defaultValue || '';
        modal.style.display = 'flex';
        
        const confirmBtn = document.getElementById('dialogConfirmBtn');
        const cancelBtn = document.getElementById('dialogCancelBtn');
        
        const cleanup = (result) => {
            modal.style.display = 'none';
            document.getElementById('dialogInput').style.display = 'none';
            confirmBtn.removeEventListener('click', confirmHandler);
            cancelBtn.removeEventListener('click', cancelHandler);
            resolve(result);
        };
        
        const confirmHandler = () => {
            const value = document.getElementById('dialogInputField').value;
            cleanup(value);
        };
        
        const cancelHandler = () => cleanup(null);
        
        confirmBtn.addEventListener('click', confirmHandler);
        cancelBtn.addEventListener('click', cancelHandler);
        
        // Focus input
        setTimeout(() => document.getElementById('dialogInputField').focus(), 100);
    });
}

function showConfirm(message, title = 'Confirm') {
    return new Promise((resolve) => {
        const modal = document.getElementById('customDialog');
        document.getElementById('dialogTitle').textContent = title;
        document.getElementById('dialogMessage').textContent = message;
        document.getElementById('dialogInput').style.display = 'none';
        modal.style.display = 'flex';
        
        const confirmBtn = document.getElementById('dialogConfirmBtn');
        const cancelBtn = document.getElementById('dialogCancelBtn');
        
        const cleanup = (result) => {
            modal.style.display = 'none';
            confirmBtn.removeEventListener('click', confirmHandler);
            cancelBtn.removeEventListener('click', cancelHandler);
            resolve(result);
        };
        
        const confirmHandler = () => cleanup(true);
        const cancelHandler = () => cleanup(false);
        
        confirmBtn.addEventListener('click', confirmHandler);
        cancelBtn.addEventListener('click', cancelHandler);
    });
}

// Delete Current Image
async function deleteCurrentImage() {
    if (!currentImageData) return;
    
    const confirmed = await showConfirm('Delete this image? This cannot be undone.', 'Confirm Delete');
    if (!confirmed) return;
    
    try {
        const response = await fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: [currentImageData.relative_path]
            })
        });
        
        const result = await response.json();
        if (result.success) {
            closeImageModal();
            browseFolder(currentPath);
            showNotification('Image deleted successfully', 'Deleted', 'success', 3000);
        } else if (result.errors.length > 0) {
            showNotification('Error: ' + result.errors.join('\n'), 'Delete Error', 'error');
        }
    } catch (error) {
        console.error('Error deleting image:', error);
        showNotification('Error deleting image', 'Error', 'error');
    }
}

// Clear seed field
function clearSeed() {
    document.getElementById('seed').value = '';
    document.getElementById('seed').focus();
}

function clearVideoSeed() {
    document.getElementById('videoSeed').value = '';
    document.getElementById('videoSeed').focus();
}

function clearTTSSeed() {
    document.getElementById('ttsSeed').value = '';
    document.getElementById('ttsSeed').focus();
}

// Queue Management
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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeJsString(str) {
    // Escape single quotes and backslashes for use in onclick handlers
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString();
}

// ============================================================================
// BATCH GENERATION FEATURES
function startHardwareMonitoring() {
    // Initial update
    updateHardwareStats();
    
    // Update every 2 seconds
    hardwareUpdateInterval = setInterval(updateHardwareStats, 2000);
}

async function updateAutoUnloadSetting(mode) {
    try {
        await fetch('/api/settings/auto-unload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: mode })
        });
    } catch (error) {
        console.error('Error updating auto-unload setting:', error);
    }
}

async function updateHardwareStats() {
    try {
        const response = await fetch('/api/hardware/stats');
        const data = await response.json();
        
        if (data.success) {
            // Update CPU
            updateHardwareBar('cpu', data.cpu.percent, data.cpu.label);
            
            // Update RAM
            updateHardwareBar('ram', data.ram.percent, data.ram.label);
            
            // Update GPU
            updateHardwareBar('gpu', data.gpu.percent, data.gpu.label);
            
            // Update VRAM
            updateHardwareBar('vram', data.vram.percent, data.vram.label);
            
            // Update GPU Temperature (scale 0-100°C to percentage for bar)
            if (data.gpu_temp) {
                const tempPercent = Math.min((data.gpu_temp.celsius / 100) * 100, 100);
                updateHardwareBar('gpuTemp', tempPercent, data.gpu_temp.label);
            }
        }
    } catch (error) {
        console.error('Error fetching hardware stats:', error);
    }
}

function updateHardwareBar(type, percent, label) {
    const bar = document.getElementById(`${type}Bar`);
    const value = document.getElementById(`${type}Value`);
    
    if (!bar || !value) return;
    
    // Update bar width
    bar.style.width = `${Math.min(percent, 100)}%`;
    
    // Update color based on usage
    bar.classList.remove('high', 'critical');
    
    // Special thresholds for GPU temperature (60°C = high, 80°C = critical)
    if (type === 'gpuTemp') {
        if (percent >= 80) {
            bar.classList.add('critical');
        } else if (percent >= 60) {
            bar.classList.add('high');
        }
        value.textContent = label;
        return;
    }
    if (percent >= 90) {
        bar.classList.add('critical');
    } else if (percent >= 75) {
        bar.classList.add('high');
    }
    
    // Update value text
    value.textContent = label;
}

// ============================================================================
function initializeMediaBlurToggle() {
    const blurMediaToggle = document.getElementById('blurMediaToggle');
    const blurEnabled = true;

    applyMediaBlurSetting(blurEnabled);

    if (!blurMediaToggle) {
        console.warn('Media blur toggle not found');
        return;
    }

    blurMediaToggle.checked = blurEnabled;

    blurMediaToggle.addEventListener('change', function() {
        const enabled = this.checked;
        applyMediaBlurSetting(enabled);

        showNotification(
            enabled ? 'All media is now blurred' : 'All media is now visible',
            enabled ? 'Media Blur Enabled' : 'Media Blur Disabled',
            'info',
            2000
        );
    });
}

function applyMediaBlurSetting(enabled) {
    if (!document.body) {
        return;
    }
    document.body.classList.toggle('media-blur-enabled', enabled);
}

// Theme Management Functions
function initializeThemeSelector() {
    const themeSelector = document.getElementById('themeSelector');
    if (!themeSelector) {
        console.warn('Theme selector not found');
        return;
    }
    
    // Load saved theme from localStorage (default: velvet)
    const savedTheme = localStorage.getItem('selectedTheme') || 'velvet';
    applyTheme(savedTheme);
    themeSelector.value = savedTheme;
    
    // Listen for theme changes
    themeSelector.addEventListener('change', function() {
        const selectedTheme = this.value;
        applyTheme(selectedTheme);
        localStorage.setItem('selectedTheme', selectedTheme);
        
        // Show notification with theme name
        const themeNames = {
            'velvet': 'Velvet',
            'dark': 'Dark',
            'light': 'Light',
            'ocean': 'Ocean',
            'sunset': 'Sunset'
        };
        showNotification(
            `Theme changed to ${themeNames[selectedTheme]}`,
            'Theme Updated',
            'info',
            2000
        );
    });
}

function applyTheme(themeName) {
    // Apply theme to document root
    document.documentElement.setAttribute('data-theme', themeName);
    
    // Update theme icon (light theme uses dark icon for visibility)
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
        const iconName = themeName === 'light' ? 'dark' : themeName;
        themeIcon.src = `/static/assets/${iconName}_icon.png`;
    }
    
    console.log(`Applied theme: ${themeName}`);
}

// Authentication functions
async function handleLogout() {
    try {
        const response = await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            // Redirect to login page (which will show automatically since session is cleared)
            window.location.href = '/';
        } else {
            console.error('Logout failed');
            showNotification('Logout failed', 'Error', 'error');
        }
    } catch (error) {
        console.error('Logout error:', error);
        showNotification('Logout error', 'Error', 'error');
    }
}

// Global fetch wrapper to handle authentication errors
const originalFetch = window.fetch;
window.fetch = function(...args) {
    return originalFetch.apply(this, args).then(response => {
        if (response.status === 401) {
            // Unauthorized - redirect to login
            console.log('Session expired, redirecting to login...');
            window.location.href = '/';
            return Promise.reject(new Error('Unauthorized'));
        }
        return response;
    });
};

// Initialize audio browser when tab is opened
function initializeAudioBrowser() {
    const audioRefreshBtn = document.getElementById('audioRefreshBtn');
    if (audioRefreshBtn) {
        audioRefreshBtn.addEventListener('click', loadAudioBatches);
    }
}


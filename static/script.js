// Velvet Reverie - Web Interface JavaScript

// Helper function to get video MIME type
function getVideoMimeType(filename) {
    if (filename.endsWith('.mp4')) return 'video/mp4';
    if (filename.endsWith('.webm')) return 'video/webm';
    if (filename.endsWith('.mov')) return 'video/quicktime';
    return 'video/mp4'; // default
}

// State
let queueUpdateInterval;
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

// Queue filter state
let queueFilters = {
    queued: true,
    generating: true,
    completed: true
};
let queueReversed = false; // Queue direction (false = newest first, true = oldest first)

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

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOMContentLoaded - Starting initialization');
    try {
        initializeEventListeners();
        console.log('✓ Event listeners initialized');
    } catch (e) { console.error('✗ Event listeners failed:', e); }
    
    try {
        initializeTabs();
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
    
    // Initialize auto-unload models setting
    try {
        const autoUnloadCheckbox = document.getElementById('autoUnloadModels');
        
        // Load saved preference from localStorage (default: true)
        const savedAutoUnload = localStorage.getItem('autoUnloadModels');
        if (savedAutoUnload !== null) {
            autoUnloadCheckbox.checked = savedAutoUnload === 'true';
        }
        
        // Send initial setting to backend
        updateAutoUnloadSetting(autoUnloadCheckbox.checked);
        
        // Listen for changes
        autoUnloadCheckbox.addEventListener('change', function() {
            const enabled = this.checked;
            localStorage.setItem('autoUnloadModels', enabled.toString());
            updateAutoUnloadSetting(enabled);
            showNotification(
                enabled ? 'Models will be unloaded after each generation' : 'Models will stay loaded for faster repeat generations',
                'Auto-Unload ' + (enabled ? 'Enabled' : 'Disabled'),
                'info',
                3000
            );
        });
        console.log('✓ Auto-unload models setting initialized');
    } catch (e) { console.error('✗ Auto-unload models setting failed:', e); }
    
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
    
    console.log('DOMContentLoaded - Initialization complete');
});

// TTS language control - enable/disable language dropdown based on engine
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

// Video duration calculator
function updateVideoDuration() {
    const frames = parseInt(document.getElementById('videoFrames')?.value) || 64;
    const fps = parseInt(document.getElementById('videoFps')?.value) || 16;
    const duration = frames / fps;
    const durationElement = document.getElementById('videoDurationValue');
    
    if (durationElement) {
        if (duration < 1) {
            durationElement.textContent = `${(duration * 1000).toFixed(0)} milliseconds`;
        } else if (duration < 60) {
            durationElement.textContent = `${duration.toFixed(1)} seconds`;
        } else {
            const minutes = Math.floor(duration / 60);
            const seconds = (duration % 60).toFixed(1);
            durationElement.textContent = `${minutes}m ${seconds}s`;
        }
    }
}

function updateVideoBatchDuration() {
    const frames = parseInt(document.getElementById('videoBatchFrames')?.value) || 64;
    const fps = parseInt(document.getElementById('videoBatchFps')?.value) || 16;
    const duration = frames / fps;
    const durationElement = document.getElementById('videoBatchDurationValue');
    
    if (durationElement) {
        if (duration < 1) {
            durationElement.textContent = `${(duration * 1000).toFixed(0)} milliseconds`;
        } else if (duration < 60) {
            durationElement.textContent = `${duration.toFixed(1)} seconds`;
        } else {
            const minutes = Math.floor(duration / 60);
            const seconds = (duration % 60).toFixed(1);
            durationElement.textContent = `${minutes}m ${seconds}s`;
        }
    }
}

function initializeVideoDurationCalculator() {
    const videoFramesInput = document.getElementById('videoFrames');
    const videoFpsInput = document.getElementById('videoFps');
    
    if (videoFramesInput) {
        videoFramesInput.addEventListener('input', updateVideoDuration);
        videoFramesInput.addEventListener('change', updateVideoDuration);
        console.log('✓ Video frames input listener attached');
    }
    if (videoFpsInput) {
        videoFpsInput.addEventListener('input', updateVideoDuration);
        videoFpsInput.addEventListener('change', updateVideoDuration);
        console.log('✓ Video FPS input listener attached');
    }
    
    // Video Batch listeners
    const videoBatchFramesInput = document.getElementById('videoBatchFrames');
    const videoBatchFpsInput = document.getElementById('videoBatchFps');
    
    if (videoBatchFramesInput) {
        videoBatchFramesInput.addEventListener('input', updateVideoBatchDuration);
        videoBatchFramesInput.addEventListener('change', updateVideoBatchDuration);
        console.log('✓ Video batch frames input listener attached');
    }
    if (videoBatchFpsInput) {
        videoBatchFpsInput.addEventListener('input', updateVideoBatchDuration);
        videoBatchFpsInput.addEventListener('change', updateVideoBatchDuration);
        console.log('✓ Video batch FPS input listener attached');
    }
    
    // Initial calculations
    updateVideoDuration();
    updateVideoBatchDuration();
}

// Device Fullscreen Sync for Reveal fullscreen viewer
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
    
    function handleKeyboardStateChange() {
        // Get current viewport heights
        const currentWindowHeight = window.innerHeight;
        const currentVisualHeight = window.visualViewport ? window.visualViewport.height : currentWindowHeight;
        
        // Calculate height differences
        const windowHeightDiff = lastWindowHeight - currentWindowHeight;
        const visualHeightDiff = lastVisualHeight - currentVisualHeight;
        
        // Keyboard likely opened (significant height decrease)
        if ((visualHeightDiff > 150 || windowHeightDiff > 150) && !keyboardOpen) {
            keyboardOpen = true;
            document.body.classList.add('keyboard-open');
            
            // Allow scrolling when keyboard is open
            const backdrop = document.getElementById('sidebarBackdrop');
            const sidebarOpen = backdrop && backdrop.classList.contains('active');
            
            // Only change overflow if no sidebar is open
            if (!sidebarOpen) {
                document.body.style.overflow = 'auto';
            }
            
            console.log('Keyboard opened - enabling scroll');
        }
        // Keyboard likely closed (height increased back significantly)
        else if (keyboardOpen && (visualHeightDiff < -100 || windowHeightDiff < -100)) {
            keyboardOpen = false;
            document.body.classList.remove('keyboard-open');
            
            // Restore overflow state based on sidebar status
            const backdrop = document.getElementById('sidebarBackdrop');
            if (!backdrop || !backdrop.classList.contains('active')) {
                document.body.style.overflow = '';
            }
            
            // Scroll to top of content wrapper to ensure header is visible
            const contentWrapper = document.querySelector('.content-wrapper');
            if (contentWrapper && contentWrapper.scrollTop > 0) {
                setTimeout(() => {
                    contentWrapper.scrollTo({ top: 0, behavior: 'smooth' });
                }, 100);
            }
            
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
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            // Give keyboard time to animate in
            setTimeout(handleKeyboardStateChange, 300);
        }
    });
    
    document.addEventListener('focusout', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            // Give keyboard time to animate out
            setTimeout(handleKeyboardStateChange, 300);
        }
    });
    
    console.log('Mobile keyboard fix initialized');
}

// Prevent Pull-to-Refresh on Mobile
function initializePreventPullToRefresh() {
    let touchStartY = 0;
    let preventPullToRefresh = false;
    
    // Detect touchstart to check if user is at the top of the page
    document.addEventListener('touchstart', function(e) {
        touchStartY = e.touches[0].clientY;
        
        // Check if any scrollable element is at the top
        const target = e.target;
        const scrollableParent = findScrollableParent(target);
        
        if (scrollableParent) {
            // If the scrollable element is at the top, we might need to prevent pull-to-refresh
            preventPullToRefresh = scrollableParent.scrollTop === 0;
        } else {
            // If no scrollable parent, check document scroll
            preventPullToRefresh = window.scrollY === 0;
        }
    }, { passive: true });
    
    // Prevent touchmove if pulling down from the top
    document.addEventListener('touchmove', function(e) {
        const touchY = e.touches[0].clientY;
        const touchDelta = touchY - touchStartY;
        
        // If pulling down (positive delta) and at the top, prevent default
        if (preventPullToRefresh && touchDelta > 0) {
            e.preventDefault();
        }
    }, { passive: false });
    
    console.log('Pull-to-refresh prevention initialized');
}

// Helper function to find the nearest scrollable parent
function findScrollableParent(element) {
    if (!element || element === document.body) {
        return null;
    }
    
    const style = window.getComputedStyle(element);
    const overflowY = style.overflowY;
    const isScrollable = overflowY !== 'visible' && overflowY !== 'hidden';
    
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
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });
}

function switchTab(tabName) {
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
    if (tabId) {
        const element = document.getElementById(tabId);
        if (element) {
            element.classList.add('active');
        }
    }
    
    // Load content based on tab
    if (tabName === 'browser') {
        browseFolder(''); // Load root folder when switching to browser tab
    } else if (tabName === 'reveal') {
        loadRevealBrowser();
    } else if (tabName === 'videos') {
        loadVideos();
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
                chatAutoScrollEnabled = true;
                setChatScrollButtonVisibility(false);
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
function playNotificationSound() {
    try {
        // Create audio context if not exists
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Simple notification sound using Web Audio API (pleasant chime)
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Play two notes for a pleasant chime effect
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
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
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updateLiveTimers() {
    const timerBadges = document.querySelectorAll('.timer-badge[data-start-time]');
    timerBadges.forEach(badge => {
        const startTime = parseFloat(badge.dataset.startTime);
        const elapsed = Math.floor(Date.now() / 1000 - startTime);
        badge.textContent = formatDuration(elapsed);
    });
}

function startQueueUpdates() {
    // Clear tracking on startup to allow folder refresh for existing completions
    lastSeenCompletedIds.clear();
    
    // Start polling queue
    updateQueue();
    queueUpdateInterval = setInterval(() => {
        updateQueue();
        updateLiveTimers();  // Update timer displays every second
    }, 1000);
}

async function updateQueue() {
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
        
        for (const job of completedJobs) {
            if (job.status === 'completed' && job.refresh_folder && !lastSeenCompletedIds.has(job.id)) {
                lastSeenCompletedIds.add(job.id);
                shouldRefreshFolder = true;
                
                // Send browser notification if enabled
                sendBrowserNotification(job);
            }
        }
        
        // Render the queue
        renderQueue(data.queue, data.active, completedJobs);
        
        // Refresh folder if we detected new completions
        if (shouldRefreshFolder) {
            setTimeout(() => {
                browseFolder(currentPath);
            }, 500);
        }
    } catch (error) {
        console.error('Error updating queue:', error);
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
    const hasMedia = job.status === 'completed' && job.relative_path;
    const hasInputImage = job.image_filename && (job.status === 'queued' || job.status === 'generating');
    const showMedia = hasMedia || hasInputImage;
    const isVideo = job.job_type === 'video' || (job.relative_path && (job.relative_path.endsWith('.mp4') || job.relative_path.endsWith('.webm')));
    const isTTS = job.job_type === 'tts';
    const isChat = job.job_type === 'chat';
    const isStory = job.job_type === 'story';
    const isAutochat = job.job_type === 'autochat';
    const isNameGen = job.job_type === 'generate_session_name';
    
    // Ensure job.id exists
    if (!job.id) {
        console.error('Job missing ID:', job);
        return '';
    }
    
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
                        <div style="position: relative;">
                            <img src="/api/thumbnail/${job.relative_path}" class="completed-image-thumb" style="object-fit: cover;" loading="lazy" onerror="this.src='/outputs/${job.relative_path}'">
                            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none;">
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

function openCompletedImage(relativePath) {
    // Switch to browser tab and find the image
    switchTab('browser');
    
    // Extract folder path from relative path
    const parts = relativePath.split(/[\/\\]/);
    const folderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    
    // Browse to the folder containing the image
    browseFolder(folderPath);
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

// Global state for uploaded images
let uploadedImageFilename = null;
let batchUploadedImageFilename = null;

// Image Generation
async function generateImage() {
    const prompt = document.getElementById('prompt').value.trim();
    
    if (!prompt) {
        showNotification('Please enter a prompt', 'Missing Prompt', 'warning');
        return;
    }
    
    // Check if image needs to be uploaded first
    const imageUpload = document.getElementById('imageUpload');
    if (imageUpload.files.length > 0 && !uploadedImageFilename) {
        showNotification('Uploading image...', 'Please wait', 'info');
        const uploadSuccess = await handleImageUpload();
        if (!uploadSuccess) {
            return;
        }
    }
    
    const data = {
        prompt: prompt,
        width: parseInt(document.getElementById('width').value),
        height: parseInt(document.getElementById('height').value),
        steps: parseInt(document.getElementById('steps').value),
        cfg: parseFloat(document.getElementById('cfg').value),
        shift: parseFloat(document.getElementById('shift').value),
        seed: document.getElementById('seed').value ? parseInt(document.getElementById('seed').value) : null,
        use_image: uploadedImageFilename ? true : false,
        use_image_size: document.getElementById('useImageSize').checked,
        image_filename: uploadedImageFilename,
        file_prefix: document.getElementById('filePrefix').value.trim() || 'velvet',
        subfolder: document.getElementById('subfolder').value.trim(),
        mcnl_lora: document.getElementById('mcnlLora').checked,
        snofs_lora: document.getElementById('snofsLora').checked,
        male_lora: document.getElementById('maleLora').checked
    };
    
    try {
        const response = await fetch('/api/queue', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('Job queued:', result.job_id);
            
            // Update queue immediately
            updateQueue();
            
            // Reload gallery after a delay to show new image
            setTimeout(() => browseFolder(currentPath), 3000);
            showNotification('Image added to queue', 'Queued', 'success', 3000);
        }
    } catch (error) {
        console.error('Error queueing job:', error);
        showNotification('Error queueing job. Make sure the backend is running.', 'Error', 'error');
    }
}

// Handle image upload
async function handleImageUpload() {
    const imageUpload = document.getElementById('imageUpload');
    const file = imageUpload.files[0];
    
    if (!file) {
        return false;
    }
    
    const formData = new FormData();
    formData.append('image', file);
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            uploadedImageFilename = result.filename;
            showNotification('Image uploaded successfully', 'Success', 'success', 2000);
            return true;
        } else {
            showNotification(result.error || 'Upload failed', 'Error', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error uploading image:', error);
        showNotification('Error uploading image', 'Error', 'error');
        return false;
    }
}

// Handle image upload preview
function handleImagePreview() {
    const imageUpload = document.getElementById('imageUpload');
    const imagePreview = document.getElementById('imagePreview');
    const imagePreviewImg = document.getElementById('imagePreviewImg');
    const clearImageBtn = document.getElementById('clearImageBtn');
    const useImageSizeGroup = document.getElementById('useImageSizeGroup');
    
    const file = imageUpload.files[0];
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            imagePreviewImg.src = e.target.result;
            imagePreview.style.display = 'block';
            clearImageBtn.style.display = 'inline-flex';
            useImageSizeGroup.style.display = 'block';
        };
        reader.readAsDataURL(file);
        
        // Reset uploaded filename so it uploads again
        uploadedImageFilename = null;
    } else {
        imagePreview.style.display = 'none';
        clearImageBtn.style.display = 'none';
        useImageSizeGroup.style.display = 'none';
        uploadedImageFilename = null;
    }
}

// Clear uploaded image
function clearUploadedImage() {
    const imageUpload = document.getElementById('imageUpload');
    const imagePreview = document.getElementById('imagePreview');
    const clearImageBtn = document.getElementById('clearImageBtn');
    const useImageSizeGroup = document.getElementById('useImageSizeGroup');
    const useImageSize = document.getElementById('useImageSize');
    
    imageUpload.value = '';
    imagePreview.style.display = 'none';
    clearImageBtn.style.display = 'none';
    useImageSizeGroup.style.display = 'none';
    useImageSize.checked = false;
    uploadedImageFilename = null;
    
    // Show width/height again
    toggleDimensionFields();
}

// Toggle width/height visibility based on useImageSize checkbox
function toggleDimensionFields() {
    const useImageSize = document.getElementById('useImageSize');
    const widthGroup = document.getElementById('widthGroup');
    const heightGroup = document.getElementById('heightGroup');
    
    if (useImageSize.checked) {
        widthGroup.style.display = 'none';
        heightGroup.style.display = 'none';
    } else {
        widthGroup.style.display = 'block';
        heightGroup.style.display = 'block';
    }
}

// Batch image upload handlers
function handleBatchImagePreview() {
    const imageUpload = document.getElementById('batchImageUpload');
    const imagePreview = document.getElementById('batchImagePreview');
    const imagePreviewImg = document.getElementById('batchImagePreviewImg');
    const clearImageBtn = document.getElementById('clearBatchImageBtn');
    const useImageSizeGroup = document.getElementById('batchUseImageSizeGroup');
    
    const file = imageUpload.files[0];
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            imagePreviewImg.src = e.target.result;
            imagePreview.style.display = 'block';
            clearImageBtn.style.display = 'inline-flex';
            useImageSizeGroup.style.display = 'block';
        };
        reader.readAsDataURL(file);
        
        // Reset uploaded filename so it uploads again
        batchUploadedImageFilename = null;
    } else {
        imagePreview.style.display = 'none';
        clearImageBtn.style.display = 'none';
        useImageSizeGroup.style.display = 'none';
        batchUploadedImageFilename = null;
    }
}

function clearBatchUploadedImage() {
    const imageUpload = document.getElementById('batchImageUpload');
    const imagePreview = document.getElementById('batchImagePreview');
    const clearImageBtn = document.getElementById('clearBatchImageBtn');
    const useImageSizeGroup = document.getElementById('batchUseImageSizeGroup');
    const useImageSize = document.getElementById('batchUseImageSize');
    
    imageUpload.value = '';
    imagePreview.style.display = 'none';
    clearImageBtn.style.display = 'none';
    useImageSizeGroup.style.display = 'none';
    useImageSize.checked = false;
    batchUploadedImageFilename = null;
    
    // Re-enable width/height CSV checkboxes if they were disabled
    toggleBatchDimensionFields();
}

function toggleBatchDimensionFields() {
    const useImageSize = document.getElementById('batchUseImageSize');
    const widthVariable = document.getElementById('batchWidthVariable');
    const heightVariable = document.getElementById('batchHeightVariable');
    
    if (useImageSize.checked) {
        // Disable and uncheck width/height CSV options
        widthVariable.checked = false;
        widthVariable.disabled = true;
        heightVariable.checked = false;
        heightVariable.disabled = true;
    } else {
        // Re-enable width/height CSV options
        widthVariable.disabled = false;
        heightVariable.disabled = false;
    }
}

async function handleBatchImageUpload() {
    const imageUpload = document.getElementById('batchImageUpload');
    const file = imageUpload.files[0];
    
    if (!file) {
        return false;
    }
    
    const formData = new FormData();
    formData.append('image', file);
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            batchUploadedImageFilename = result.filename;
            return true;
        } else {
            showNotification(result.error || 'Upload failed', 'Error', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error uploading batch image:', error);
        showNotification('Error uploading image', 'Error', 'error');
        return false;
    }
}

// ============================================================================
// VIDEO GENERATION
// ============================================================================

let uploadedVideoImageFilename = null;
let uploadedFrameEditVideoFilename = null; // Frame Edit video
let currentFrameEditVideoData = null; // Store video metadata (fps, duration, etc.)

async function generateVideo() {
    const prompt = document.getElementById('videoPrompt').value.trim();
    
    if (!prompt) {
        showNotification('Please enter a motion prompt', 'Missing Prompt', 'warning');
        return;
    }
    
    // Check if image needs to be uploaded first
    const imageUpload = document.getElementById('videoImageUpload');
    if (imageUpload.files.length > 0) {
        // Always upload when there's a file selected (handles new uploads)
        showNotification('Uploading image...', 'Please wait', 'info');
        const uploadSuccess = await handleVideoImageUpload();
        if (!uploadSuccess) {
            return;
        }
    }
    
    // Use uploaded image or default violet.webp
    const imageFilename = uploadedVideoImageFilename || 'violet.webp';
    
    const data = {
        job_type: 'video',
        prompt: prompt,
        image_filename: imageFilename,
        frames: parseInt(document.getElementById('videoFrames').value),
        megapixels: parseFloat(document.getElementById('videoMegapixels').value),
        fps: parseInt(document.getElementById('videoFps').value),
        seed: document.getElementById('videoSeed').value ? parseInt(document.getElementById('videoSeed').value) : null,
        file_prefix: document.getElementById('videoFilePrefix').value.trim() || 'video',
        subfolder: document.getElementById('videoSubfolder').value.trim(),
        nsfw: document.getElementById('videoNSFW').checked
    };
    
    try {
        const response = await fetch('/api/queue', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('Video job queued:', result.job_id);
            
            // Update queue immediately
            updateQueue();
            
            // Reload gallery after a delay to show new video
            setTimeout(() => browseFolder(currentPath), 3000);
            showNotification('Video added to queue', 'Queued', 'success', 3000);
        }
    } catch (error) {
        console.error('Error queueing video job:', error);
        showNotification('Error queueing video job. Make sure the backend is running.', 'Error', 'error');
    }
}

async function handleVideoImageUpload() {
    const imageUpload = document.getElementById('videoImageUpload');
    const file = imageUpload.files[0];
    
    if (!file) {
        return false;
    }
    
    const formData = new FormData();
    formData.append('image', file);
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            uploadedVideoImageFilename = result.filename;
            showNotification('Image uploaded successfully', 'Success', 'success', 2000);
            return true;
        } else {
            showNotification(result.error || 'Upload failed', 'Error', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error uploading image:', error);
        showNotification('Error uploading image', 'Error', 'error');
        return false;
    }
}

function handleVideoImagePreview() {
    const imageUpload = document.getElementById('videoImageUpload');
    const imagePreview = document.getElementById('videoImagePreview');
    const imagePreviewImg = document.getElementById('videoPreviewImg');
    const clearImageBtn = document.getElementById('clearVideoImageBtn');
    
    const file = imageUpload.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreviewImg.src = e.target.result;
            imagePreview.style.display = 'block';
            clearImageBtn.style.display = 'inline-block';
        };
        reader.readAsDataURL(file);
        
        // Reset uploaded filename so it uploads again
        uploadedVideoImageFilename = null;
    } else {
        imagePreview.style.display = 'none';
        clearImageBtn.style.display = 'none';
        uploadedVideoImageFilename = null;
    }
}

function clearVideoImage() {
    const imageUpload = document.getElementById('videoImageUpload');
    const imagePreview = document.getElementById('videoImagePreview');
    const clearImageBtn = document.getElementById('clearVideoImageBtn');
    
    imageUpload.value = '';
    imagePreview.style.display = 'none';
    clearImageBtn.style.display = 'none';
    uploadedVideoImageFilename = null;
}

// ============================================================================
// FRAME EDIT VIDEO FUNCTIONS
// ============================================================================

async function handleFrameEditVideoUpload() {
    const videoUpload = document.getElementById('frameEditVideoUpload');
    const file = videoUpload.files[0];
    
    if (!file) {
        return false;
    }
    
    const formData = new FormData();
    formData.append('video', file);
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            uploadedFrameEditVideoFilename = result.filename;
            showNotification('Video uploaded successfully', 'Success', 'success', 2000);
            return true;
        } else {
            showNotification(result.error || 'Upload failed', 'Error', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error uploading video:', error);
        showNotification('Error uploading video', 'Error', 'error');
        return false;
    }
}

async function handleFrameEditVideoPreview() {
    const videoUpload = document.getElementById('frameEditVideoUpload');
    const videoPreview = document.getElementById('frameEditVideoPreview');
    const videoPreviewEl = document.getElementById('frameEditPreviewVideo');
    const videoInfo = document.getElementById('frameEditVideoInfo');
    const clearVideoBtn = document.getElementById('clearFrameEditVideoBtn');
    const frameExtractControls = document.getElementById('frameExtractControls');
    const outputFolder = document.getElementById('frameOutputFolder');
    
    const file = videoUpload.files[0];
    if (file) {
        // Clear output folder to allow auto-generation for new video
        if (outputFolder) {
            outputFolder.value = '';
        }
        
        // Upload the video file first and wait for it to complete
        await handleFrameEditVideoUpload();
        
        const reader = new FileReader();
        reader.onload = (e) => {
            videoPreviewEl.src = e.target.result;
            videoPreview.style.display = 'block';
            clearVideoBtn.style.display = 'inline-block';
            
            // Display video info
            const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
            videoInfo.textContent = `${file.name} (${fileSizeMB} MB)`;
            
            // Get video metadata when loaded
            videoPreviewEl.onloadedmetadata = () => {
                const duration = videoPreviewEl.duration;
                const width = videoPreviewEl.videoWidth;
                const height = videoPreviewEl.videoHeight;
                
                // Estimate FPS (most videos are 24, 30, or 60 fps)
                // We'll get the actual FPS from the backend when extracting
                const estimatedFPS = 30;
                
                videoInfo.textContent = `${file.name} • ${width}×${height} • ${duration.toFixed(1)}s • ${fileSizeMB} MB`;
                
                // Store video data globally
                currentFrameEditVideoData = {
                    filename: uploadedFrameEditVideoFilename,
                    duration: duration,
                    width: width,
                    height: height,
                    fps: estimatedFPS  // Estimated, will be accurate when backend processes
                };
                
                // Initialize frame extraction controls
                const endTimeInput = document.getElementById('frameEndTime');
                if (endTimeInput) {
                    endTimeInput.value = duration.toFixed(1);
                    endTimeInput.max = duration.toFixed(1);
                }
                
                const startTimeInput = document.getElementById('frameStartTime');
                if (startTimeInput) {
                    startTimeInput.max = duration.toFixed(1);
                }
                
                // Show frame extraction controls
                if (frameExtractControls) {
                    frameExtractControls.style.display = 'block';
                }
                
                // Calculate and display initial values
                updateFrameCalculations();
            };
        };
        reader.readAsDataURL(file);
        
        // Note: uploadedFrameEditVideoFilename is already set by handleFrameEditVideoUpload()
    } else {
        videoPreview.style.display = 'none';
        clearVideoBtn.style.display = 'none';
        if (frameExtractControls) {
            frameExtractControls.style.display = 'none';
        }
        uploadedFrameEditVideoFilename = null;
        currentFrameEditVideoData = null;
    }
}

function clearFrameEditVideo() {
    const videoUpload = document.getElementById('frameEditVideoUpload');
    const videoPreview = document.getElementById('frameEditVideoPreview');
    const videoPreviewEl = document.getElementById('frameEditPreviewVideo');
    const clearVideoBtn = document.getElementById('clearFrameEditVideoBtn');
    const frameExtractControls = document.getElementById('frameExtractControls');
    const outputFolder = document.getElementById('frameOutputFolder');
    
    videoUpload.value = '';
    videoPreviewEl.src = '';
    videoPreview.style.display = 'none';
    clearVideoBtn.style.display = 'none';
    if (frameExtractControls) {
        frameExtractControls.style.display = 'none';
    }
    if (outputFolder) {
        outputFolder.value = '';
    }
    uploadedFrameEditVideoFilename = null;
    currentFrameEditVideoData = null;
}

function selectVideoBrowserFile(filepath, folder) {
    // Set the selected video from browser
    uploadedFrameEditVideoFilename = filepath;
    
    // Update preview
    const videoPreview = document.getElementById('frameEditVideoPreview');
    const videoPreviewEl = document.getElementById('frameEditPreviewVideo');
    const videoInfo = document.getElementById('frameEditVideoInfo');
    const clearVideoBtn = document.getElementById('clearFrameEditVideoBtn');
    const frameExtractControls = document.getElementById('frameExtractControls');
    const outputFolder = document.getElementById('frameOutputFolder');
    
    // Clear output folder to allow auto-generation
    if (outputFolder) {
        outputFolder.value = '';
    }
    
    // Construct the URL for the video
    const videoUrl = folder === 'output' ? `/outputs/${filepath}` : `/api/video/${encodeURIComponent(filepath)}`;
    
    videoPreviewEl.src = videoUrl;
    videoPreview.style.display = 'block';
    clearVideoBtn.style.display = 'inline-block';
    
    // Display video info
    const filename = filepath.split('/').pop();
    videoInfo.textContent = `Selected: ${filename}`;
    
    // Get video metadata when loaded
    videoPreviewEl.onloadedmetadata = () => {
        const duration = videoPreviewEl.duration;
        const width = videoPreviewEl.videoWidth;
        const height = videoPreviewEl.videoHeight;
        const estimatedFPS = 30;
        
        videoInfo.textContent = `${filename} • ${width}×${height} • ${duration.toFixed(1)}s`;
        
        // Store video data globally
        currentFrameEditVideoData = {
            filename: uploadedFrameEditVideoFilename,
            duration: duration,
            width: width,
            height: height,
            fps: estimatedFPS
        };
        
        // Initialize frame extraction controls
        const endTimeInput = document.getElementById('frameEndTime');
        if (endTimeInput) {
            endTimeInput.value = duration.toFixed(1);
            endTimeInput.max = duration.toFixed(1);
        }
        
        const startTimeInput = document.getElementById('frameStartTime');
        if (startTimeInput) {
            startTimeInput.max = duration.toFixed(1);
        }
        
        // Show frame extraction controls
        if (frameExtractControls) {
            frameExtractControls.style.display = 'block';
        }
        
        // Calculate and display initial values
        updateFrameCalculations();
    };
    
    // Close the browser modal
    closeVideoBrowser();
    
    showNotification('Video selected successfully', 'Success', 'success', 2000);
}

function updateFrameCalculations() {
    if (!currentFrameEditVideoData) return;
    
    const startTime = parseFloat(document.getElementById('frameStartTime')?.value || 0);
    const endTime = parseFloat(document.getElementById('frameEndTime')?.value || currentFrameEditVideoData.duration);
    const frameSkip = parseInt(document.getElementById('frameSkip')?.value || 1);
    
    // Validate inputs
    if (startTime >= endTime) return;
    if (frameSkip < 1) return;
    
    const selectedDuration = endTime - startTime;
    const fps = currentFrameEditVideoData.fps;
    
    // Calculate frames
    const totalFrames = Math.floor(selectedDuration * fps);
    const extractedFrames = Math.floor(totalFrames / frameSkip);
    const playbackFPS = fps / frameSkip;
    
    // Update display
    document.getElementById('videoOriginalFPS').textContent = `${fps} fps`;
    document.getElementById('videoSelectedDuration').textContent = `${selectedDuration.toFixed(1)}s`;
    document.getElementById('videoTotalFrames').textContent = totalFrames.toLocaleString();
    document.getElementById('videoExtractedFrames').textContent = extractedFrames.toLocaleString();
    document.getElementById('videoPlaybackFPS').textContent = `${playbackFPS.toFixed(2)} fps`;
}

async function extractFrames() {
    if (!uploadedFrameEditVideoFilename) {
        showNotification('Please select a video first', 'No Video', 'warning');
        return;
    }
    
    const startTime = parseFloat(document.getElementById('frameStartTime')?.value || 0);
    const endTime = parseFloat(document.getElementById('frameEndTime')?.value || currentFrameEditVideoData.duration);
    const frameSkip = parseInt(document.getElementById('frameSkip')?.value || 1);
    const outputFolder = document.getElementById('frameOutputFolder')?.value.trim() || '';
    
    if (startTime >= endTime) {
        showNotification('Start time must be less than end time', 'Invalid Range', 'warning');
        return;
    }
    
    const confirmed = await showConfirm(
        `Extract frames from ${startTime.toFixed(1)}s to ${endTime.toFixed(1)}s (every ${frameSkip} frame${frameSkip > 1 ? 's' : ''})?\n\nThis will create ${Math.floor((endTime - startTime) * currentFrameEditVideoData.fps / frameSkip)} images.`,
        'Extract Frames'
    );
    
    if (!confirmed) return;
    
    const extractBtn = document.getElementById('extractFramesBtn');
    const originalText = extractBtn.innerHTML;
    extractBtn.disabled = true;
    extractBtn.innerHTML = '<span style="display: inline-block; animation: spin 1s linear infinite;">⏳</span> Extracting...';
    
    try {
        const response = await fetch('/api/frame-edit/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_filename: uploadedFrameEditVideoFilename,
                start_time: startTime,
                end_time: endTime,
                frame_skip: frameSkip,
                output_folder: outputFolder
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(
                `Extracted ${result.frame_count} frames to ${result.folder_path}`,
                'Frames Extracted',
                'success',
                5000
            );
            
            // Optionally update output folder input to show where frames were saved
            document.getElementById('frameOutputFolder').value = result.folder_name;
        } else {
            showNotification(result.error || 'Failed to extract frames', 'Error', 'error');
        }
    } catch (error) {
        console.error('Error extracting frames:', error);
        showNotification('Error extracting frames', 'Error', 'error');
    } finally {
        extractBtn.disabled = false;
        extractBtn.innerHTML = originalText;
    }
}

// Frame Edit Step 2: Folder Browser and Batch Processing
let selectedFrameEditFolder = '';

function openFrameEditFolderBrowser() {
    imageBrowserMode = 'frame-edit';
    currentBrowserFolder = 'input';
    currentBrowserSubpath = 'frame_edit'; // Start in frame_edit folder
    selectedFrameEditFolder = '';
    
    // Open modal
    const modal = document.getElementById('imageBrowserModal');
    if (modal) {
        modal.style.display = 'flex';
        const modalTitle = modal.querySelector('h3');
        if (modalTitle) {
            modalTitle.textContent = 'Select Frame Folder';
        }
        
        // Load frame_edit folders
        loadImageBrowserFolder('input', 'frame_edit');
    }
}

async function updateFrameEditCount(folder) {
    if (!folder) {
        const countDisplay = document.getElementById('frameEditFrameCount');
        if (countDisplay) {
            countDisplay.style.display = 'none';
        }
        return;
    }
    
    try {
        const response = await fetch(`/api/frame-edit/count?folder=${encodeURIComponent(folder)}`);
        const result = await response.json();
        
        const countDisplay = document.getElementById('frameEditFrameCount');
        if (countDisplay && result.success) {
            const count = result.frame_count;
            countDisplay.innerHTML = `<strong>${count.toLocaleString()} frame${count !== 1 ? 's' : ''}</strong> ready to process`;
            countDisplay.style.display = 'block';
            
            if (count === 0) {
                countDisplay.style.color = 'var(--error)';
            } else {
                countDisplay.style.color = 'var(--accent-primary)';
            }
        }
    } catch (error) {
        console.error('Error fetching frame count:', error);
    }
}

async function queueFrameEditBatch() {
    if (!selectedFrameEditFolder) {
        showNotification('Please select a frame folder first', 'No Folder Selected', 'warning');
        return;
    }
    
    const prompt = document.getElementById('frameEditPrompt')?.value.trim();
    if (!prompt) {
        showNotification('Please enter a prompt', 'No Prompt', 'warning');
        return;
    }
    
    const steps = parseInt(document.getElementById('frameEditSteps')?.value || 4);
    const cfg = parseFloat(document.getElementById('frameEditCfg')?.value || 1.0);
    const shift = parseFloat(document.getElementById('frameEditShift')?.value || 3.0);
    const seed = document.getElementById('frameEditSeed')?.value.trim();
    const filePrefix = document.getElementById('frameEditFilePrefix')?.value.trim() || 'frame_edit';
    const outputFolder = document.getElementById('frameEditOutputFolder')?.value.trim() || '';
    
    // LoRA settings
    const mcnlLora = document.getElementById('frameEditMcnlLora')?.checked || false;
    const snofsLora = document.getElementById('frameEditSnofsLora')?.checked || false;
    const maleLora = document.getElementById('frameEditMaleLora')?.checked || false;
    
    const confirmed = await showConfirm(
        `Process all frames in ${selectedFrameEditFolder} with AI?\n\nThis will queue one job per frame.`,
        'Queue Frame Edit Batch'
    );
    
    if (!confirmed) return;
    
    const queueBtn = document.getElementById('queueFrameEditBtn');
    const originalText = queueBtn.innerHTML;
    queueBtn.disabled = true;
    queueBtn.innerHTML = '<span style="display: inline-block; animation: spin 1s linear infinite;">⏳</span> Queueing...';
    
    try {
        const response = await fetch('/api/frame-edit/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folder: selectedFrameEditFolder,
                prompt: prompt,
                steps: steps,
                cfg: cfg,
                shift: shift,
                seed: seed || undefined,
                file_prefix: filePrefix,
                output_folder: outputFolder,
                mcnl_lora: mcnlLora,
                snofs_lora: snofsLora,
                male_lora: maleLora
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(
                `Queued ${result.job_count} frames for processing`,
                'Batch Queued',
                'success',
                5000
            );
        } else {
            showNotification(result.error || 'Failed to queue batch', 'Error', 'error');
        }
    } catch (error) {
        console.error('Error queueing frame edit batch:', error);
        showNotification('Error queueing batch', 'Error', 'error');
    } finally {
        queueBtn.disabled = false;
        queueBtn.innerHTML = originalText;
    }
}

// Frame Edit Step 3: Stitch Frames to Video
let selectedStitchFolder = '';
let selectedStitchSource = 'input'; // 'input' or 'output'

function openStitchFolderBrowser() {
    imageBrowserMode = 'stitch';
    currentBrowserFolder = 'input';
    currentBrowserSubpath = 'frame_edit'; // Start in frame_edit input folder
    selectedStitchFolder = '';
    selectedStitchSource = 'input'; // Track source folder
    
    // Open modal
    const modal = document.getElementById('imageBrowserModal');
    if (modal) {
        modal.style.display = 'flex';
        const modalTitle = modal.querySelector('h3');
        if (modalTitle) {
            modalTitle.textContent = 'Select Frames Folder';
        }
        
        // Load frame_edit folders (start with input)
        loadImageBrowserFolder('input', 'frame_edit');
    }
}

async function updateStitchFrameCount(folder, source) {
    if (!folder) {
        const countDisplay = document.getElementById('stitchFrameCount');
        if (countDisplay) {
            countDisplay.style.display = 'none';
        }
        return;
    }
    
    try {
        // Use appropriate endpoint based on source
        const endpoint = source === 'input' ? '/api/frame-edit/count' : '/api/frame-edit/count-output';
        const response = await fetch(`${endpoint}?folder=${encodeURIComponent(folder)}`);
        const result = await response.json();
        
        const countDisplay = document.getElementById('stitchFrameCount');
        if (countDisplay && result.success) {
            const count = result.frame_count;
            countDisplay.innerHTML = `<strong>${count.toLocaleString()} frame${count !== 1 ? 's' : ''}</strong> found`;
            countDisplay.style.display = 'block';
            
            if (count === 0) {
                countDisplay.style.color = 'var(--error)';
            } else {
                countDisplay.style.color = 'var(--accent-primary)';
            }
        }
    } catch (error) {
        console.error('Error fetching frame count:', error);
    }
}

function parseFpsFromFolderName(folderName) {
    // Try to extract FPS from folder name pattern: "name_30fps" or "name_23.98fps"
    const fpsMatch = folderName.match(/(\d+(?:\.\d+)?)fps/i);
    if (fpsMatch) {
        return parseFloat(fpsMatch[1]);
    }
    return 30; // Default fallback
}

async function stitchFramesToVideo() {
    if (!selectedStitchFolder) {
        showNotification('Please select a folder first', 'No Folder Selected', 'warning');
        return;
    }
    
    const fps = parseFloat(document.getElementById('stitchFps')?.value || 30);
    const outputName = document.getElementById('stitchOutputName')?.value.trim();
    
    if (fps <= 0 || fps > 120) {
        showNotification('FPS must be between 1 and 120', 'Invalid FPS', 'warning');
        return;
    }
    
    const confirmed = await showConfirm(
        `Stitch all frames in ${selectedStitchFolder} to video at ${fps} FPS?`,
        'Stitch Frames'
    );
    
    if (!confirmed) return;
    
    const stitchBtn = document.getElementById('stitchFramesBtn');
    const originalText = stitchBtn.innerHTML;
    stitchBtn.disabled = true;
    stitchBtn.innerHTML = '<span style="display: inline-block; animation: spin 1s linear infinite;">⏳</span> Stitching...';
    
    try {
        const response = await fetch('/api/frame-edit/stitch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folder: selectedStitchFolder,
                fps: fps,
                output_name: outputName || undefined,
                source: selectedStitchSource || 'input'
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(
                `Video created: ${result.video_path}`,
                'Video Created',
                'success',
                5000
            );
            
            // Clear output name for next use
            document.getElementById('stitchOutputName').value = '';
        } else {
            showNotification(result.error || 'Failed to stitch frames', 'Error', 'error');
        }
    } catch (error) {
        console.error('Error stitching frames:', error);
        showNotification('Error stitching frames', 'Error', 'error');
    } finally {
        stitchBtn.disabled = false;
        stitchBtn.innerHTML = originalText;
    }
}

// ============================================================================
// IMAGE BROWSER
// ============================================================================

// Image Browser Functions
let imageBrowserMode = 'single'; // 'single' | 'batch' | 'image-batch' | 'frame-edit' | 'stitch'
let currentBrowserFolder = 'input'; // 'input' or 'output'
let currentBrowserSubpath = ''; // Current subfolder path
let selectedImageBatchFolder = '';
let selectedVideoBatchFolder = '';

// Video Browser Functions
let currentVideoBrowserFolder = 'input'; // 'input' or 'output'
let currentVideoBrowserSubpath = ''; // Current subfolder path

function openImageBrowser(mode) {
    console.log('openImageBrowser called with mode:', mode);
    imageBrowserMode = mode;
    currentBrowserSubpath = ''; // Reset to root
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
    
    // Load input folder by default
    loadImageBrowserFolder('input', '');
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
        tab.addEventListener('click', () => {
            const folder = tab.dataset.folder;
            loadVideoBrowserFolder(folder, '');
        });
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
    currentVideoBrowserFolder = folder;
    currentVideoBrowserSubpath = subpath || '';
    
    // Update tab active state
    document.querySelectorAll('.video-browser-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.folder === folder) {
            tab.classList.add('active');
        }
    });
    
    // Update path display
    renderVideoBrowserPath(folder, subpath);
    
    try {
        // For output folder, default to 'videos' subfolder if at root
        let effectiveSubpath = subpath;
        if (folder === 'output' && !subpath) {
            effectiveSubpath = 'videos';
        }
        
        // Fetch files from appropriate folder
        const endpoint = folder === 'input' 
            ? `/api/browse_images?folder=input&path=${encodeURIComponent(subpath)}`
            : `/api/browse?path=${encodeURIComponent(effectiveSubpath)}`;
        
        const response = await fetch(endpoint);
        const data = await response.json();
        
        if (!data.success && data.success !== undefined) {
            throw new Error(data.error || 'Failed to load videos');
        }
        
        // Get folders and files from response
        const folders = data.folders || [];
        // For input folder, browse_images returns image objects with {filename, path, mtime}
        // For output folder, browse returns file metadata objects
        let files = folder === 'input' ? (data.images || []) : (data.files || []);
        
        // Filter to only show videos
        const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
        const videoFiles = files.filter(file => {
            // Handle both string and object formats
            const filename = typeof file === 'string' ? file : (file.filename || file.path || '');
            const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
            return videoExtensions.includes(ext);
        });
        
        // Render folders and videos
        renderVideoBrowserGrid(data.folders || [], videoFiles);
    } catch (error) {
        console.error('Error loading video browser folder:', error);
        showNotification('Error loading videos', 'Error', 'error');
    }
}

function renderVideoBrowserPath(folder, subpath) {
    const pathDisplay = document.getElementById('videoBrowserPathText');
    if (!pathDisplay) return;
    
    // Build path display similar to image browser
    const folderName = folder === 'input' ? 'Input' : 'Output';
    
    if (!subpath) {
        // At root of selected folder
        pathDisplay.textContent = folderName;
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
            pathDisplay.textContent = `${folderName} / ${displayPath.replace(/\//g, ' / ')}`;
        } else {
            pathDisplay.textContent = folderName;
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
        
        // Escape for JavaScript string (single quotes and backslashes)
        const jsEscapedPath = folderPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        
        html += `
            <div class="gallery-item folder-item" onclick="loadVideoBrowserFolder('${currentVideoBrowserFolder}', '${jsEscapedPath}')" style="cursor: pointer;">
                <div class="folder-icon" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 150px; background: var(--bg-tertiary); border-radius: 4px;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span style="margin-top: 0.5rem; font-size: 0.875rem; text-align: center; word-break: break-word;">${escapeHtml(folderName)}</span>
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
                        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;"
                        loading="lazy"
                        onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
                    >
                    <video 
                        src="${videoUrl}" 
                        preload="none"
                        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; display: none;"
                        muted
                        playsinline
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
    if (!cardElement) return;

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
    if (!cardElement) return;

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

function openAudioBrowser(mode) {
    console.log('openAudioBrowser called with mode:', mode);
    audioBrowserMode = mode;
    currentAudioBrowserSubpath = ''; // Reset to root
    const modal = document.getElementById('audioBrowserModal');
    if (!modal) {
        console.error('Audio browser modal not found!');
        return;
    }
    
    modal.style.display = 'flex';
    
    // Load input folder by default
    loadAudioBrowserFolder('input', '');
}

function closeAudioBrowser() {
    const modal = document.getElementById('audioBrowserModal');
    const audioPlayer = document.getElementById('audioPreviewPlayer');
    const audioPreviewContainer = document.getElementById('audioPreviewContainer');
    
    // Stop and reset audio player
    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer.src = '';
    }
    if (audioPreviewContainer) {
        audioPreviewContainer.style.display = 'none';
    }
    
    modal.style.display = 'none';
}

async function loadAudioBrowserFolder(folder, subpath) {
    currentAudioBrowserFolder = folder;
    currentAudioBrowserSubpath = subpath || '';
    
    // Update tab active state
    document.querySelectorAll('.audio-browser-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.folder === folder) {
            tab.classList.add('active');
        }
    });
    
    // Update path display
    renderAudioBrowserPath(folder, subpath);
    
    try {
        // Fetch audio files
        const endpoint = `/api/browse_audio_files?folder=${folder}&path=${encodeURIComponent(subpath)}`;
        const response = await fetch(endpoint);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to load audio files');
        }
        
        // Render folders and audio files
        const grid = document.getElementById('audioBrowserGrid');
        grid.innerHTML = '';
        
        const folders = data.folders || [];
        const audioFiles = data.audio_files || [];
        
        if (folders.length === 0 && audioFiles.length === 0) {
            grid.innerHTML = '<p style="color: #888; grid-column: 1/-1; text-align: center;">No audio files or folders found</p>';
            return;
        }
        
        // Add back button if not at root
        if (subpath) {
            const parentPath = subpath.split(/[\/\\]/).slice(0, -1).join('/');
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
                loadAudioBrowserFolder(folder, parentPath);
            });
            grid.appendChild(backDiv);
        }
        
        // Render folders
        folders.forEach(folderItem => {
            const div = document.createElement('div');
            div.className = 'browser-folder-item';
            div.innerHTML = `
                <div class="browser-folder-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
                <div class="browser-folder-name">${escapeHtml(folderItem.name)}</div>
            `;
            div.addEventListener('click', () => {
                loadAudioBrowserFolder(folder, folderItem.path);
            });
            grid.appendChild(div);
        });
        
        // Render audio files
        audioFiles.forEach(file => {
            const filename = file.filename;
            const filePath = file.path;
            
            const div = document.createElement('div');
            div.className = 'browser-audio-item';
            div.style.cssText = 'padding: 1rem; background: var(--bg-primary); border-radius: 4px; transition: background 0.2s; display: flex; align-items: center; gap: 0.75rem;';
            
            div.innerHTML = `
                <div style="flex-shrink: 0;">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 18V5l12-2v13"></path>
                        <circle cx="6" cy="18" r="3"></circle>
                        <circle cx="18" cy="16" r="3"></circle>
                    </svg>
                </div>
                <div style="flex: 1; min-width: 0; cursor: pointer;" class="audio-select-area">
                    <div style="font-weight: 500; margin-bottom: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(filename)}</div>
                    ${file.size ? `<div style="font-size: 0.75rem; color: var(--text-muted);">${formatFileSize(file.size)}</div>` : ''}
                </div>
                <button class="btn btn-sm audio-play-btn" style="flex-shrink: 0; padding: 0.5rem; display: flex; align-items: center; justify-content: center;" title="Preview audio">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                </button>
            `;
            
            div.addEventListener('mouseenter', () => {
                div.style.background = 'var(--bg-tertiary)';
            });
            div.addEventListener('mouseleave', () => {
                div.style.background = 'var(--bg-primary)';
            });
            
            // Click on name/info area to select
            const selectArea = div.querySelector('.audio-select-area');
            selectArea.addEventListener('click', (e) => {
                e.stopPropagation();
                selectAudioFile(filename, folder, filePath);
            });
            
            // Click on play button to preview
            const playBtn = div.querySelector('.audio-play-btn');
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                playAudioPreview(filename, folder, filePath);
            });
            
            grid.appendChild(div);
        });
    } catch (error) {
        console.error('Error loading audio browser folder:', error);
        showNotification('Error loading audio files', 'Error', 'error');
    }
}

function renderAudioBrowserPath(folder, subpath) {
    const pathDisplay = document.getElementById('audioBrowserPathText');
    const folderName = folder === 'input' ? 'Input' : 'Output';
    
    if (!subpath) {
        pathDisplay.innerHTML = folderName;
        return;
    }
    
    // Build clickable breadcrumb path
    const parts = subpath.split(/[\/\\]/).filter(p => p);
    let html = `<span class="browser-path-part" style="cursor: pointer;" onclick="loadAudioBrowserFolder('${folder}', '')">${folderName}</span>`;
    
    let currentPath = '';
    parts.forEach((part, index) => {
        currentPath += (currentPath ? '/' : '') + part;
        const pathCopy = currentPath;
        html += ' / ';
        html += `<span class="browser-path-part" style="cursor: pointer;" onclick="loadAudioBrowserFolder('${folder}', '${pathCopy}')">${escapeHtml(part)}</span>`;
    });
    
    pathDisplay.innerHTML = html;
}

function playAudioPreview(filename, folder, filePath) {
    console.log('Playing audio preview:', filename, 'from', folder, 'path:', filePath);
    
    const audioPlayer = document.getElementById('audioPreviewPlayer');
    const audioPreviewName = document.getElementById('audioPreviewName');
    const audioPreviewContainer = document.getElementById('audioPreviewContainer');
    
    // Build audio URL based on folder
    let audioUrl;
    if (folder === 'input') {
        // For input folder, need to use ComfyUI input path
        audioUrl = `/api/audio/input/${encodeURIComponent(filePath)}`;
    } else {
        // For output folder, use outputs path
        audioUrl = `/outputs/${encodeURIComponent(filePath)}`;
    }
    
    // Update player
    audioPreviewName.textContent = filename;
    audioPlayer.src = audioUrl;
    audioPreviewContainer.style.display = 'block';
    
    // Play audio
    audioPlayer.play().catch(error => {
        console.error('Error playing audio:', error);
        showNotification('Error playing audio file', 'Playback Error', 'error');
    });
}

function selectAudioFile(filename, folder, filePath) {
    console.log('Selected audio file:', filename, 'from', folder, 'path:', filePath);
    
    if (audioBrowserMode === 'tts') {
        // Set the TTS narrator audio input - use filePath to include subfolder
        document.getElementById('ttsNarratorAudio').value = filePath;
        showNotification(`Selected: ${filePath}`, 'Audio Selected', 'success', 2000);
    } else if (audioBrowserMode === 'modal') {
        // Set the modal TTS voice input
        document.getElementById('modalTTSVoice').value = filePath;
        showNotification(`Selected: ${filePath}`, 'Audio Selected', 'success', 2000);
    }
    
    closeAudioBrowser();
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function closeImageBrowser() {
    const modal = document.getElementById('imageBrowserModal');
    modal.style.display = 'none';
    const useBtn = document.getElementById('useThisFolderBtn');
    if (useBtn) useBtn.style.display = 'none';
}

async function loadImageBrowserFolder(folder, subpath) {
    currentBrowserFolder = folder;
    currentBrowserSubpath = subpath || '';
    
    // Update tab active state
    document.querySelectorAll('.image-browser-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.folder === folder) {
            tab.classList.add('active');
        }
    });
    
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
        
        // Update path display with breadcrumb (after adjusting effectiveSubpath)
        renderImageBrowserPath(folder, effectiveSubpath || subpath);
        
        // Fetch images from appropriate folder
        const endpoint = folder === 'input' 
            ? `/api/browse_images?folder=input&path=${encodeURIComponent(subpath)}`
            : `/api/browse?path=${encodeURIComponent(effectiveSubpath)}`;
        
        const response = await fetch(endpoint);
        const data = await response.json();
        
        // Render folders and images
        const grid = document.getElementById('imageBrowserGrid');
        grid.innerHTML = '';
        
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
            grid.appendChild(backDiv);
        }
        
        // Render folders
        folders.forEach(folderItem => {
            const div = document.createElement('div');
            div.className = 'browser-folder-item';
            div.innerHTML = `
                <div class="browser-folder-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
                <div class="browser-folder-name">${escapeHtml(folderItem.name)}</div>
            `;
            div.addEventListener('click', () => {
                // Always navigate into folders
                loadImageBrowserFolder(folder, folderItem.path);
            });
            grid.appendChild(div);
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
            
            grid.appendChild(div);
        });
    } catch (error) {
        console.error('Error loading browser folder:', error);
        showNotification('Error loading images', 'Error', 'error');
    }
}

function renderImageBrowserPath(folder, subpath) {
    const pathDisplay = document.getElementById('imageBrowserPathText');
    const folderName = folder === 'input' ? 'Input' : 'Images';
    
    if (!subpath || (folder === 'output' && subpath === 'images')) {
        pathDisplay.innerHTML = folderName;
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

// Folder Browsing
async function browseFolder(path) {
    try {
        // Always restrict to 'images' root folder
        const response = await fetch(`/api/browse?path=${encodeURIComponent(path)}&root=images`);
        const data = await response.json();
        
        currentPath = data.current_path;
        allItems = [...data.folders, ...data.files];
        
        // Filter images array to exclude videos (videos go to Video Browser tab)
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];
        const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];
        images = data.files.filter(file => {
            if (!file.filename) return false;
            const ext = file.filename.toLowerCase().slice(file.filename.lastIndexOf('.'));
            // Include only image files, explicitly exclude videos
            return imageExtensions.includes(ext) && !videoExtensions.includes(ext);
        });
        
        selectedItems.clear();
        
        renderBreadcrumb(currentPath);
        renderGallery(data.folders, data.files);
        updateSelectionButtons();
        
        // If fullscreen viewer is active, jump to newest image (index 0)
        if (isFullscreenActive && images.length > 0) {
            currentImageIndex = 0;
            showFullscreenImage(0);
        }
    } catch (error) {
        console.error('Error browsing folder:', error);
    }
}

function renderBreadcrumb(path) {
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
                    <div class="gallery-item-prompt">${escapeHtml(folder.name)}</div>
                </div>
            </div>
        `;
    });
    
    // Render files (images only - videos go to Videos tab)
    files.forEach(file => {
        const isSelected = selectedItems.has(file.relative_path);
        const clickHandler = selectionMode ? `toggleItemSelection(event, '${file.relative_path}')` : `openImageModal('${file.id}')`;
        const isVideo = file.filename && (file.filename.endsWith('.mp4') || file.filename.endsWith('.webm') || file.filename.endsWith('.mov'));
        
        // Skip videos - they belong in the Videos tab
        if (isVideo) {
            return;
        }
        
        // Render image
        html += `
            <div class="gallery-item ${isSelected ? 'selected' : ''} ${selectionMode ? 'selection-mode' : ''}" 
                 data-path="${file.relative_path}" 
                 data-type="file"
                 onclick="${clickHandler}">
                <img src="/outputs/${file.relative_path}" alt="Generated Image" class="gallery-item-image">
                <div class="gallery-item-info">
                    <div class="gallery-item-prompt">${escapeHtml(file.prompt)}</div>
                    <div class="gallery-item-meta">
                        <span class="param-badge">${file.width}x${file.height}</span>
                        <span class="param-badge">${file.steps} steps</span>
                    </div>
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
        // Find the index of this image
        currentImageIndex = images.findIndex(img => img.id === imageId);
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

// Import Image Data
function importImageData() {
    if (!currentImageData) return;
    
    const isVideo = currentImageData.job_type === 'video';
    
    if (isVideo) {
        // Import video parameters to video tab
        document.getElementById('videoPrompt').value = currentImageData.prompt || '';
        document.getElementById('videoFrames').value = currentImageData.frames || 64;
        document.getElementById('videoFps').value = currentImageData.fps || 16;
        document.getElementById('videoMegapixels').value = currentImageData.megapixels || 0.25;
        document.getElementById('videoSeed').value = currentImageData.seed || '';
        document.getElementById('videoFilePrefix').value = currentImageData.file_prefix || 'video';
        document.getElementById('videoSubfolder').value = currentImageData.subfolder || '';
        document.getElementById('videoNSFW').checked = currentImageData.nsfw || false;
        
        // Update video duration calculation
        updateVideoDuration();
        
        // Import source image if available
        if (currentImageData.source_image) {
            uploadedVideoImageFilename = currentImageData.source_image;
            const imagePreviewImg = document.getElementById('videoPreviewImg');
            const imagePreview = document.getElementById('videoImagePreview');
            const clearImageBtn = document.getElementById('clearVideoImageBtn');
            
            // Set preview to show the source image from input folder
            const sourceImagePath = currentImageData.source_image.replace(/\\/g, '/');
            imagePreviewImg.src = `/api/image/input/${sourceImagePath.split('/').map(s => encodeURIComponent(s)).join('/')}`;
            imagePreview.style.display = 'block';
            clearImageBtn.style.display = 'inline-flex';
        }
        
        // Close the modal
        closeImageModal();
        
        // Switch to video generation tab
        switchTab('video');
        
        // Scroll to the form
        setTimeout(() => {
            document.querySelector('#videoTab .generation-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        
        // Show notification
        showNotification('Video parameters imported to form', 'Imported', 'success', 3000);
    } else {
        // Import image parameters to single tab
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
        
        // Import input image if available
        if (currentImageData.use_image && currentImageData.image_filename) {
            uploadedImageFilename = currentImageData.image_filename;
            const imagePreviewImg = document.getElementById('imagePreviewImg');
            const imagePreview = document.getElementById('imagePreview');
            const clearImageBtn = document.getElementById('clearImageBtn');
            const useImageSizeGroup = document.getElementById('useImageSizeGroup');
            const useImageSizeCheckbox = document.getElementById('useImageSize');
            
            // Set preview to show the input image from input folder
            const inputImagePath = currentImageData.image_filename.replace(/\\/g, '/');
            imagePreviewImg.src = `/api/image/input/${inputImagePath.split('/').map(s => encodeURIComponent(s)).join('/')}`;
            imagePreview.style.display = 'block';
            clearImageBtn.style.display = 'inline-flex';
            useImageSizeGroup.style.display = 'block';
            
            // Set the use image size checkbox (use_image is determined by uploadedImageFilename)
            useImageSizeCheckbox.checked = currentImageData.use_image_size || false;
            
            // Update dimension fields visibility based on checkbox state
            toggleDimensionFields();
        }
        
        // Close the modal
        closeImageModal();
        
        // Switch to single generation tab (same pattern as video import)
        switchTab('single');
        
        // Scroll to the form
        setTimeout(() => {
            document.querySelector('.generation-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        
        // Show notification
        showNotification('Image parameters imported to form', 'Imported', 'success', 3000);
    }
}

// Fullscreen Viewer
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
    console.log('showFullscreenImage called with index:', index, 'images.length:', images.length, 'fullscreenSource:', fullscreenSource);
    
    // Use appropriate array based on fullscreen source
    const sourceArray = (fullscreenSource === 'viewer') ? viewerAllFiles : images;
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
                img.style.maxWidth = '90vw';
                img.style.maxHeight = '90vh';
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
// ============================================================================
function initializeBatchMode() {
    // Batch prompt and CSV inputs
    const batchBasePrompt = document.getElementById('batchBasePrompt');
    const batchCSV = document.getElementById('batchCSV');
    
    if (batchBasePrompt) {
        batchBasePrompt.addEventListener('input', updateBatchPreview);
        batchBasePrompt.addEventListener('paste', () => setTimeout(updateBatchPreview, 0));
        batchBasePrompt.addEventListener('change', updateBatchPreview);
    }
    
    if (batchCSV) {
        batchCSV.addEventListener('input', updateBatchPreview);
        batchCSV.addEventListener('paste', () => setTimeout(updateBatchPreview, 0));
        batchCSV.addEventListener('change', updateBatchPreview);
    }
    
    // Batch buttons
    const loadCSVFileBtn = document.getElementById('loadCSVFile');
    const csvFileInput = document.getElementById('csvFileInput');
    
    if (loadCSVFileBtn && csvFileInput) {
        loadCSVFileBtn.addEventListener('click', () => csvFileInput.click());
        csvFileInput.addEventListener('change', handleCSVFileUpload);
    }
    
    // Add event listeners to variable parameter checkboxes
    const variableCheckboxes = document.querySelectorAll('.batch-param-variable');
    variableCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateBatchPreview);
    });
}


// ============================================================================
// IMAGE BATCH FEATURES
// ============================================================================

function initializeImageBatch() {
    const chooseBtn = document.getElementById('chooseImageBatchFolderBtn');
    const queueBtn = document.getElementById('queueImageBatchBtn');
    const useOriginalSize = document.getElementById('imageBatchUseOriginalSize');
    const useCustomSize = document.getElementById('imageBatchUseCustomSize');
    
    if (chooseBtn) {
        chooseBtn.addEventListener('click', () => {
            imageBrowserMode = 'image-batch';
            selectedImageBatchFolder = '';
            loadImageBrowserFolder('input', '');
            const modal = document.getElementById('imageBrowserModal');
            modal.style.display = 'flex';
        });
    }
    if (queueBtn) {
        queueBtn.addEventListener('click', queueImageBatchGeneration);
    }
    
    // Add event listeners for size mode radio buttons
    if (useOriginalSize) {
        useOriginalSize.addEventListener('change', toggleImageBatchSizeFields);
    }
    if (useCustomSize) {
        useCustomSize.addEventListener('change', toggleImageBatchSizeFields);
    }
}

function toggleImageBatchSizeFields() {
    const useCustomSize = document.getElementById('imageBatchUseCustomSize');
    const widthField = document.getElementById('imageBatchWidth');
    const heightField = document.getElementById('imageBatchHeight');
    
    if (useCustomSize && useCustomSize.checked) {
        widthField.disabled = false;
        heightField.disabled = false;
    } else {
        widthField.disabled = true;
        heightField.disabled = true;
    }
}

async function queueImageBatchGeneration() {
    const prompt = document.getElementById('imageBatchPrompt').value.trim();
    if (!prompt) {
        showNotification('Please enter a prompt', 'Missing Prompt', 'warning');
        return;
    }
    const folderPath = selectedImageBatchFolder || currentBrowserSubpath || '';
    const useOriginalSize = document.getElementById('imageBatchUseOriginalSize').checked;
    const width = parseInt(document.getElementById('imageBatchWidth').value);
    const height = parseInt(document.getElementById('imageBatchHeight').value);
    const steps = parseInt(document.getElementById('imageBatchSteps').value);
    const cfg = parseFloat(document.getElementById('imageBatchCfg').value);
    const shift = parseFloat(document.getElementById('imageBatchShift').value);
    const seedVal = document.getElementById('imageBatchSeed').value.trim();
    const seed = seedVal ? parseInt(seedVal) : null;
    const file_prefix = document.getElementById('imageBatchFilePrefix').value.trim() || 'image_batch';
    const subfolder = document.getElementById('imageBatchSubfolder').value.trim();
    const mcnl_lora = document.getElementById('imageBatchMcnlLora').checked;
    const snofs_lora = document.getElementById('imageBatchSnofsLora').checked;
    const male_lora = document.getElementById('imageBatchMaleLora').checked;

    try {
        const response = await fetch('/api/queue/image-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt,
                folder: folderPath,
                use_original_size: useOriginalSize,
                width,
                height,
                steps,
                cfg,
                shift,
                seed,
                file_prefix,
                subfolder,
                mcnl_lora,
                snofs_lora,
                male_lora
            })
        });
        const result = await response.json();
        if (result.success) {
            showNotification(`Queued ${result.queued_count} image(s) from folder`, 'Image Batch Queued', 'success', 3000);
            updateQueue();
        } else {
            showNotification('Error: ' + (result.error || 'Failed to queue image batch'), 'Error', 'error');
        }
    } catch (error) {
        console.error('Error queueing image batch:', error);
        showNotification('Error queueing image batch', 'Error', 'error');
    }
}

function initializeVideoBatch() {
    const chooseBtn = document.getElementById('chooseVideoBatchFolderBtn');
    const queueBtn = document.getElementById('queueVideoBatchBtn');
    if (chooseBtn) {
        chooseBtn.addEventListener('click', () => {
            imageBrowserMode = 'video-batch';
            selectedVideoBatchFolder = '';
            loadImageBrowserFolder('input', '');
            const modal = document.getElementById('imageBrowserModal');
            modal.style.display = 'flex';
        });
    }
    if (queueBtn) {
        queueBtn.addEventListener('click', queueVideoBatchGeneration);
    }
}

async function queueVideoBatchGeneration() {
    const prompt = document.getElementById('videoBatchPrompt').value.trim();
    if (!prompt) {
        showNotification('Please enter a motion prompt', 'Missing Prompt', 'warning');
        return;
    }
    
    const folderPath = selectedVideoBatchFolder || currentBrowserSubpath || '';
    if (!folderPath) {
        showNotification('Please select a folder', 'Missing Folder', 'warning');
        return;
    }
    
    const frames = parseInt(document.getElementById('videoBatchFrames').value);
    const fps = parseInt(document.getElementById('videoBatchFps').value);
    const megapixels = parseFloat(document.getElementById('videoBatchMegapixels').value);
    const seedVal = document.getElementById('videoBatchSeed').value.trim();
    const seed = seedVal ? parseInt(seedVal) : null;
    const file_prefix = document.getElementById('videoBatchFilePrefix').value.trim() || 'video_batch';
    const subfolder = document.getElementById('videoBatchSubfolder').value.trim();
    const nsfw = document.getElementById('videoBatchNSFW').checked;

    try {
        const response = await fetch('/api/queue/video-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt,
                folder: folderPath,
                frames,
                fps,
                megapixels,
                seed,
                file_prefix,
                subfolder,
                nsfw
            })
        });
        const result = await response.json();
        if (result.success) {
            showNotification(`Queued ${result.queued_count} video(s) from folder`, 'Video Batch Queued', 'success', 3000);
            updateQueue();
        } else {
            showNotification('Error: ' + (result.error || 'Failed to queue video batch'), 'Error', 'error');
        }
    } catch (error) {
        console.error('Error queueing video batch:', error);
        showNotification('Error queueing video batch', 'Error', 'error');
    }
}

// ============================================================================
// INPUT IMAGE TOGGLE (For Image Browser)
// ============================================================================
// INPUT IMAGE TOGGLE (For Image Browser)
// ============================================================================
let showingInputImage = false; // Toggle state for viewing input images
let showingVideoInputImage = false; // Toggle state for viewing video source images
let currentInputImagePath = null; // Path to the input image for current output
let matchSizesEnabled = false; // Match input/output image sizes for perfect overlay
let cachedImageDimensions = {}; // Cache for image dimensions (width, height)

// Helper function to get image dimensions (preload and measure)
async function getImageDimensions(src) {
    // Check cache first
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
        img.onerror = () => {
            reject(new Error(`Failed to load image: ${src}`));
        };
        img.src = src;
    });
}

// Calculate matched size for input/output images
async function calculateMatchedSize(outputSrc, inputSrc) {
    try {
        const [outputDims, inputDims] = await Promise.all([
            getImageDimensions(outputSrc),
            getImageDimensions(inputSrc)
        ]);
        
        // Use the larger of the two dimensions
        const maxWidth = Math.max(outputDims.width, inputDims.width);
        const maxHeight = Math.max(outputDims.height, inputDims.height);
        
        return { width: maxWidth, height: maxHeight };
    } catch (error) {
        console.error('Error calculating matched size:', error);
        return null;
    }
}

// Apply matched size styling to an image element
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
    
    // Auto-load when switching to tab
    const videosTabBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.dataset.tab === 'videos');
    if (videosTabBtn) {
        videosTabBtn.addEventListener('click', () => {
            loadVideos(videosCurrentPath || 'videos');
        });
    }
}

async function loadVideos(path) {
    try {
        // Always restrict to 'videos' root folder
        const response = await fetch(`/api/browse?path=${encodeURIComponent(path || 'videos')}&root=videos`);
        const data = await response.json();
        
        videosCurrentPath = data.current_path || '';
        
        // Filter to only show videos
        const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
        const videoFiles = (data.files || []).filter(file => {
            const filename = file.filename || '';
            const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
            return videoExtensions.includes(ext);
        });
        
        videosItems = videoFiles;
        renderVideosBreadcrumb(videosCurrentPath);
        renderVideosGrid(data.folders, videoFiles);
    } catch (error) {
        console.error('Error loading videos:', error);
        showNotification('Error loading videos', 'Error', 'error');
    }
}

function renderVideosBreadcrumb(path) {
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
        html += `
            <div class="gallery-item folder-item" onclick="loadVideos('${escapedPath}')">
                <div class="folder-icon">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
                <div class="gallery-item-info">
                    <div class="gallery-item-prompt">${escapeHtml(folder.name)}</div>
                </div>
            </div>
        `;
    });
    
    // Render videos
    videos.forEach((video, index) => {
        html += `
            <div class="gallery-item video-hover-preview" onclick="openVideoModal(${index})">
                <div style="position: relative; width: 100%; height: 100%;">
                    <img src="/api/thumbnail/${video.relative_path}" class="gallery-item-image" style="object-fit: cover; width: 100%; height: 100%;" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                    <video src="/outputs/${video.relative_path}" class="gallery-item-image" style="object-fit: cover; width: 100%; height: 100%; display: none;" playsinline muted preload="none"></video>
                    <div class="video-card-play-overlay" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none; transition: opacity 0.15s ease;">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="white" opacity="0.8">
                            <circle cx="12" cy="12" r="10" fill="rgba(0,0,0,0.5)"></circle>
                            <polygon points="10 8 16 12 10 16" fill="white"></polygon>
                        </svg>
                    </div>
                </div>
                <div class="gallery-item-info">
                    <div class="gallery-item-prompt">${escapeHtml(video.prompt || video.filename)}</div>
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
        grid.style.display = 'grid';
        empty.style.display = 'none';
    } else {
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

function extractParameters(basePrompt) {
    // Extract [parameter] placeholders
    const regex = /\[([^\]]+)\]/g;
    const parameters = [];
    let match;
    
    while ((match = regex.exec(basePrompt)) !== null) {
        if (!parameters.includes(match[1])) {
            parameters.push(match[1]);
        }
    }
    
    return parameters;
}

/**
 * Split a single CSV line into fields, respecting RFC 4180 quoting:
 *  - Fields may be wrapped in double-quotes.
 *  - A literal double-quote inside a quoted field is escaped as "".
 *  - Commas inside quoted fields are not treated as delimiters.
 *  - Leading/trailing whitespace outside quotes is trimmed.
 */
function parseCSVLine(line) {
    const fields = [];
    let i = 0;
    while (i < line.length) {
        // Skip leading whitespace before field
        while (i < line.length && line[i] === ' ') i++;

        if (line[i] === '"') {
            // Quoted field
            i++; // skip opening quote
            let field = '';
            while (i < line.length) {
                if (line[i] === '"') {
                    if (line[i + 1] === '"') {
                        // Escaped double-quote ("") → literal "
                        field += '"';
                        i += 2;
                    } else {
                        // Closing quote
                        i++;
                        break;
                    }
                } else {
                    field += line[i];
                    i++;
                }
            }
            fields.push(field);
            // Skip whitespace and then expect comma or end
            while (i < line.length && line[i] === ' ') i++;
            if (line[i] === ',') i++;
        } else {
            // Unquoted field — read until next comma
            let start = i;
            while (i < line.length && line[i] !== ',') i++;
            fields.push(line.slice(start, i).trim());
            if (line[i] === ',') i++;
        }
    }
    // Handle trailing comma → empty last field
    if (line.trimEnd().endsWith(',')) fields.push('');
    return fields;
}

function parseCSV(csvText) {
    const lines = csvText.trim().split('\n').filter(line => line.trim());
    if (lines.length < 2) return null;

    const headers = parseCSVLine(lines[0]).map(h => h.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === headers.length) {
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index];
            });
            rows.push(row);
        }
    }

    return { headers, rows };
}

function replaceParameters(basePrompt, paramValues) {
    let result = basePrompt;
    for (const [param, value] of Object.entries(paramValues)) {
        result = result.replace(new RegExp(`\\[${param}\\]`, 'g'), value);
    }
    return result;
}

function getVariableParameters() {
    // Returns list of parameter names that should come from CSV
    const variableParams = [];
    
    if (document.getElementById('batchWidthVariable').checked) variableParams.push('width');
    if (document.getElementById('batchHeightVariable').checked) variableParams.push('height');
    if (document.getElementById('batchStepsVariable').checked) variableParams.push('steps');
    if (document.getElementById('batchCfgVariable').checked) variableParams.push('cfg');
    if (document.getElementById('batchShiftVariable').checked) variableParams.push('shift');
    if (document.getElementById('batchSeedVariable').checked) variableParams.push('seed');
    if (document.getElementById('batchFilePrefixVariable').checked) variableParams.push('file_prefix');
    if (document.getElementById('batchSubfolderVariable').checked) variableParams.push('subfolder');
    if (document.getElementById('batchMcnlLoraVariable').checked) variableParams.push('mcnl_lora');
    if (document.getElementById('batchSnofsLoraVariable').checked) variableParams.push('snofs_lora');
    if (document.getElementById('batchMaleLoraVariable').checked) variableParams.push('male_lora');
    
    return variableParams;
}

function updateBatchPreview() {
    const basePrompt = document.getElementById('batchBasePrompt').value.trim();
    const csvText = document.getElementById('batchCSV').value.trim();
    const detectedParams = document.getElementById('detectedParameters');
    const batchPreview = document.getElementById('batchPreview');
    const queueBatchBtn = document.getElementById('queueBatchBtn');
    const batchCount = document.getElementById('batchCount');
    
    // Extract parameters from base prompt
    detectedBatchParameters = extractParameters(basePrompt);
    const variableParams = getVariableParameters();
    const allRequiredParams = [...detectedBatchParameters, ...variableParams];
    
    if (detectedParams) {
        const displayParts = [];
        if (detectedBatchParameters.length > 0) {
            displayParts.push(detectedBatchParameters.join(', '));
        }
        if (variableParams.length > 0) {
            displayParts.push(`+ ${variableParams.length} variable param(s)`);
        }
        
        if (displayParts.length > 0) {
            detectedParams.textContent = displayParts.join(' ');
            detectedParams.style.color = 'var(--primary)';
        } else {
            detectedParams.textContent = 'None';
            detectedParams.style.color = 'var(--text-muted)';
        }
    }
    
    // Parse CSV / simple list
    if (!csvText) {
        batchPreview.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">Enter prompts or CSV data above to preview the batch</div>';
        queueBatchBtn.disabled = true;
        batchCount.textContent = '0';
        batchPreviewData = [];
        return;
    }

    // ── Simple mode: no base prompt ──────────────────────────────────────────
    // Each non-empty line is treated as a complete prompt for one image.
    if (!basePrompt) {
        const lines = csvText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) {
            batchPreview.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">Enter prompts or CSV data above to preview the batch</div>';
            queueBatchBtn.disabled = true;
            batchCount.textContent = '0';
            batchPreviewData = [];
            return;
        }
        batchPreviewData = lines.map(line => ({ prompt: line, params: {} }));
        let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';
        batchPreviewData.forEach((item, index) => {
            html += `
                <div style="padding: 0.75rem; background: var(--bg-secondary); border-radius: 4px; border-left: 3px solid var(--primary);">
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.25rem;">Image ${index + 1}</div>
                    <div style="font-size: 0.95rem; color: var(--text);">${escapeHtml(item.prompt)}</div>
                </div>
            `;
        });
        html += '</div>';
        batchPreview.innerHTML = html;
        queueBatchBtn.disabled = false;
        batchCount.textContent = batchPreviewData.length.toString();
        return;
    }

    // ── Template mode: base prompt has [param] placeholders ──────────────────
    const csvData = parseCSV(csvText);
    if (!csvData) {
        batchPreview.innerHTML = '<div style="text-align: center; color: var(--warning); padding: 2rem;">Invalid CSV format. First row should be parameter names, followed by value rows.</div>';
        queueBatchBtn.disabled = true;
        batchCount.textContent = '0';
        batchPreviewData = [];
        return;
    }
    
    // Check if CSV headers match parameters (both prompt and variable params)
    const missingParams = allRequiredParams.filter(p => !csvData.headers.includes(p));
    const extraHeaders = csvData.headers.filter(h => !allRequiredParams.includes(h));
    
    if (missingParams.length > 0) {
        batchPreview.innerHTML = `<div style="text-align: center; color: var(--warning); padding: 2rem;">Missing CSV columns: ${missingParams.join(', ')}<br><small style="color: var(--text-muted);">Add these columns to your CSV header row, or leave the base prompt empty to generate one image per line.</small></div>`;
        queueBatchBtn.disabled = true;
        batchCount.textContent = '0';
        batchPreviewData = [];
        return;
    }

    if (csvData.rows.length === 0) {
        batchPreview.innerHTML = '<div style="text-align: center; color: var(--warning); padding: 2rem;">No valid data rows found. Check that your CSV rows have the same number of columns as the header.</div>';
        queueBatchBtn.disabled = true;
        batchCount.textContent = '0';
        batchPreviewData = [];
        return;
    }
    
    // Generate preview
    batchPreviewData = csvData.rows.map(row => {
        const prompt = replaceParameters(basePrompt, row);
        return { prompt, params: row };
    });
    
    let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';
    batchPreviewData.forEach((item, index) => {
        // Build parameter info display
        const paramInfo = [];
        variableParams.forEach(param => {
            if (item.params[param] !== undefined) {
                paramInfo.push(`${param}: ${item.params[param]}`);
            }
        });
        const paramDisplay = paramInfo.length > 0 ? `<div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">${escapeHtml(paramInfo.join(', '))}</div>` : '';
        
        html += `
            <div style="padding: 0.75rem; background: var(--bg-secondary); border-radius: 4px; border-left: 3px solid var(--primary);">
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.25rem;">Image ${index + 1}</div>
                <div style="font-size: 0.95rem; color: var(--text);">${escapeHtml(item.prompt)}</div>
                ${paramDisplay}
            </div>
        `;
    });
    html += '</div>';
    
    if (extraHeaders.length > 0) {
        html = `<div style="color: var(--warning); font-size: 0.9rem; margin-bottom: 0.75rem; padding: 0.5rem; background: var(--bg-secondary); border-radius: 4px;">
            ⚠️ Extra CSV columns (will be ignored): ${extraHeaders.join(', ')}
        </div>` + html;
    }
    
    batchPreview.innerHTML = html;
    queueBatchBtn.disabled = false;
    batchCount.textContent = batchPreviewData.length.toString();
}

async function queueBatchGeneration() {
    if (batchPreviewData.length === 0) {
        showNotification('No valid batch data to queue', 'Empty Batch', 'warning');
        return;
    }
    
    // Check if batch image needs to be uploaded first
    const batchImageUpload = document.getElementById('batchImageUpload');
    if (batchImageUpload.files.length > 0 && !batchUploadedImageFilename) {
        showNotification('Uploading image...', 'Please wait', 'info');
        const uploadSuccess = await handleBatchImageUpload();
        if (!uploadSuccess) {
            return;
        }
    }
    
    // Get default parameters
    const useImageSize = document.getElementById('batchUseImageSize').checked;
    const defaults = {
        width: parseInt(document.getElementById('batchWidth').value),
        height: parseInt(document.getElementById('batchHeight').value),
        steps: parseInt(document.getElementById('batchSteps').value),
        cfg: parseFloat(document.getElementById('batchCfg').value),
        shift: parseFloat(document.getElementById('batchShift').value),
        seed: document.getElementById('batchSeed').value ? parseInt(document.getElementById('batchSeed').value) : null,
        file_prefix: document.getElementById('batchFilePrefix').value.trim() || 'batch',
        subfolder: document.getElementById('batchSubfolder').value.trim(),
        mcnl_lora: document.getElementById('batchMcnlLora').checked,
        snofs_lora: document.getElementById('batchSnofsLora').checked,
        male_lora: document.getElementById('batchMaleLora').checked,
        use_image: batchUploadedImageFilename ? true : false,
        use_image_size: useImageSize,
        image_filename: batchUploadedImageFilename
    };
    
    const variableParams = getVariableParameters();
    
    // Prepare batch jobs
    const jobs = batchPreviewData.map(item => {
        const job = {
            prompt: item.prompt,
            width: defaults.width,
            height: defaults.height,
            steps: defaults.steps,
            cfg: defaults.cfg,
            shift: defaults.shift,
            seed: defaults.seed,
            file_prefix: defaults.file_prefix,
            subfolder: defaults.subfolder,
            mcnl_lora: defaults.mcnl_lora,
            snofs_lora: defaults.snofs_lora,
            male_lora: defaults.male_lora,
            use_image: defaults.use_image,
            use_image_size: defaults.use_image_size,
            image_filename: defaults.image_filename
        };
        
        // Override with CSV values for variable parameters
        // Skip width/height from CSV if use_image_size is enabled
        variableParams.forEach(param => {
            // Skip width/height if using image size
            if (defaults.use_image_size && (param === 'width' || param === 'height')) {
                return;
            }
            
            if (item.params[param] !== undefined) {
                const value = item.params[param];
                
                // Convert types appropriately
                if (param === 'width' || param === 'height' || param === 'steps' || param === 'seed') {
                    job[param] = value ? parseInt(value) : (param === 'seed' ? null : job[param]);
                } else if (param === 'cfg' || param === 'shift') {
                    job[param] = value ? parseFloat(value) : job[param];
                } else if (param === 'mcnl_lora' || param === 'snofs_lora' || param === 'male_lora') {
                    // Convert to boolean (true/false, yes/no, 1/0)
                    const lowerValue = String(value).toLowerCase().trim();
                    job[param] = lowerValue === 'true' || lowerValue === 'yes' || lowerValue === '1';
                } else {
                    job[param] = value;
                }
            }
        });
        
        return job;
    });
    
    try {
        const response = await fetch('/api/queue/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobs: jobs })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(`Queued ${result.queued_count} images successfully`, 'Batch Queued', 'success', 3000);
            updateQueue();
        } else {
            showNotification('Error: ' + result.error, 'Queue Failed', 'error');
        }
    } catch (error) {
        console.error('Error queueing batch:', error);
        showNotification('Error queueing batch', 'Error', 'error');
    }
}

async function handleCSVFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        const text = await file.text();
        document.getElementById('batchCSV').value = text;
        updateBatchPreview();
        showNotification('CSV file loaded successfully', 'Loaded', 'success', 2000);
    } catch (error) {
        console.error('Error reading CSV file:', error);
        showNotification('Error reading CSV file', 'Error', 'error');
    }
    
    // Reset file input
    event.target.value = '';
}

// ============================================================================
// HARDWARE MONITORING
// ============================================================================

function startHardwareMonitoring() {
    // Initial update
    updateHardwareStats();
    
    // Update every 2 seconds
    hardwareUpdateInterval = setInterval(updateHardwareStats, 2000);
}

async function updateAutoUnloadSetting(enabled) {
    try {
        await fetch('/api/settings/auto-unload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: enabled })
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
// VIEWER TAB
// ============================================================================

let viewerRefreshInterval = null;
let viewerInactivityTimer = null;
let viewerCurrentData = null;
let viewerAllFiles = [];
let viewerCurrentIndex = 0;
let showingViewerInputImage = false; // Toggle state for viewer input/output

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
                    currentImageIndex = 0;
                    showFullscreenImage(0);
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

// ===== Text Batch Instructions =====

async function showBatchInstructions() {
    const modal = document.getElementById('batchInstructionsModal');
    const content = document.getElementById('batchInstructionsContent');
    
    if (!modal || !content) return;
    
    // Show modal with loading state
    modal.style.display = 'flex';
    content.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">Loading instructions...</div>';
    
    try {
        const response = await fetch('/api/batch-instructions');
        const data = await response.json();
        
        if (data.success && data.content) {
            // Convert markdown to HTML (simple implementation)
            const htmlContent = markdownToHtml(data.content);
            content.innerHTML = htmlContent;
        } else {
            content.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--warning);">Failed to load instructions</div>';
        }
    } catch (error) {
        console.error('Error loading instructions:', error);
        content.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--warning);">Error loading instructions</div>';
    }
}

function markdownToHtml(markdown) {
    let html = markdown;
    
    // Code blocks
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h4>$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^# (.*$)/gim, '<h2>$1</h2>');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code style="background: var(--bg); padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 0.9em;">$1</code>');
    
    // Horizontal rules
    html = html.replace(/^---$/gim, '<hr style="border: none; border-top: 2px solid var(--border); margin: 1.5rem 0;">');
    
    // Tables
    html = html.replace(/\|(.+)\|\n\|[-:\s|]+\|\n((?:\|.+\|\n?)*)/g, function(match, header, rows) {
        const headerCells = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
        const rowsHtml = rows.trim().split('\n').map(row => {
            const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
            return `<tr>${cells}</tr>`;
        }).join('');
        return `<table style="width: 100%; border-collapse: collapse; margin: 1rem 0;"><thead><tr>${headerCells}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
    });
    
    // Lists
    html = html.replace(/^\d+\.\s+(.+)$/gim, '<li>$1</li>');
    html = html.replace(/^[-*]\s+(.+)$/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul style="margin: 0.5rem 0; padding-left: 1.5rem;">$1</ul>');
    
    // Paragraphs
    html = html.split('\n\n').map(para => {
        if (para.startsWith('<h') || para.startsWith('<pre') || para.startsWith('<ul') || 
            para.startsWith('<ol') || para.startsWith('<hr') || para.startsWith('<table') ||
            para.trim() === '') {
            return para;
        }
        return `<p style="margin: 0.75rem 0;">${para}</p>`;
    }).join('\n');
    
    return html;
}

async function copyBatchInstructions() {
    const button = document.getElementById('copyInstructionsBtn');
    try {
        const response = await fetch('/api/batch-instructions');
        const data = await response.json();
        
        if (data.success && data.content) {
            copyChatMessage(data.content, button);
            setTimeout(() => {
                showNotification('Instructions copied to clipboard', 'Success', 'success');
            }, 100);
        } else {
            showNotification('Failed to copy instructions', 'Error', 'error');
        }
    } catch (error) {
        console.error('Error copying instructions:', error);
        showNotification('Failed to copy instructions', 'Error', 'error');
    }
}

function closeBatchInstructions() {
    const modal = document.getElementById('batchInstructionsModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Story Instructions Functions
async function showStoryInstructions() {
    const modal = document.getElementById('storyInstructionsModal');
    const content = document.getElementById('storyInstructionsContent');
    
    if (!modal || !content) return;
    
    // Show modal with loading state
    modal.style.display = 'flex';
    content.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">Loading instructions...</div>';
    
    try {
        const response = await fetch('/api/story-instructions');
        const data = await response.json();
        
        if (data.success && data.content) {
            // Convert markdown to HTML (simple implementation)
            const htmlContent = markdownToHtml(data.content);
            content.innerHTML = htmlContent;
        } else {
            content.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--warning);">Failed to load instructions</div>';
        }
    } catch (error) {
        console.error('Error loading story instructions:', error);
        content.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--warning);">Error loading instructions</div>';
    }
}

async function copyStoryInstructions() {
    const button = document.getElementById('copyStoryInstructionsBtn');
    try {
        const response = await fetch('/api/story-instructions');
        const data = await response.json();
        
        if (data.success && data.content) {
            copyChatMessage(data.content, button);
            setTimeout(() => {
                showNotification('Story instructions copied to clipboard', 'Success', 'success');
            }, 100);
        } else {
            showNotification('Failed to copy instructions', 'Error', 'error');
        }
    } catch (error) {
        console.error('Error copying story instructions:', error);
        showNotification('Failed to copy instructions', 'Error', 'error');
    }
}

function closeStoryInstructions() {
    const modal = document.getElementById('storyInstructionsModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Add event listeners for batch instructions
document.addEventListener('DOMContentLoaded', function() {
    const showBtn = document.getElementById('showBatchInstructionsBtn');
    const copyBtn = document.getElementById('copyInstructionsBtn');
    const closeBtn = document.getElementById('closeBatchInstructionsBtn');
    const modal = document.getElementById('batchInstructionsModal');
    const overlay = modal?.querySelector('.custom-modal-overlay');
    
    if (showBtn) {
        showBtn.addEventListener('click', showBatchInstructions);
    }
    
    if (copyBtn) {
        copyBtn.addEventListener('click', copyBatchInstructions);
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeBatchInstructions);
    }
    
    if (overlay) {
        overlay.addEventListener('click', closeBatchInstructions);
    }
    
    // ESC key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
            closeBatchInstructions();
        }
    });
    
    // Story instructions event listeners
    const showStoryBtn = document.getElementById('showStoryInstructionsBtn');
    const copyStoryBtn = document.getElementById('copyStoryInstructionsBtn');
    const closeStoryBtn = document.getElementById('closeStoryInstructionsBtn');
    const storyModal = document.getElementById('storyInstructionsModal');
    const storyOverlay = storyModal?.querySelector('.custom-modal-overlay');
    
    if (showStoryBtn) {
        showStoryBtn.addEventListener('click', showStoryInstructions);
    }
    
    if (copyStoryBtn) {
        copyStoryBtn.addEventListener('click', copyStoryInstructions);
    }
    
    if (closeStoryBtn) {
        closeStoryBtn.addEventListener('click', closeStoryInstructions);
    }
    
    if (storyOverlay) {
        storyOverlay.addEventListener('click', closeStoryInstructions);
    }
    
    // ESC key to close story instructions
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && storyModal && storyModal.style.display === 'flex') {
            closeStoryInstructions();
        }
    });
});



// ==================== TTS Functions ====================

// TTS Helper Functions for Chat Integration
function sendToTTS(text) {
    // Populate TTS text field
    document.getElementById('ttsText').value = text;
    // Switch to TTS tab
    switchTab('tts');
    // Show notification
    showNotification('Text copied to TTS tab', 'Success', 'success', 3000);
}

async function ttsNow(text, messageId = null) {
    // Instead of directly queuing, show the modal with settings
    showChatTTSModal(text, messageId);
}

// Chat TTS Modal Functions
function showChatTTSModal(text, messageId = null) {
    console.log('[TTS] Opening TTS modal for message:', messageId);
    
    // Populate modal with current TTS settings
    const refAudio = document.getElementById('ttsNarratorAudio')?.value || 'Holly.mp3';
    const ttsEngine = document.getElementById('ttsEngine')?.value || 'ChatterboxTTS';
    const audioFormat = document.getElementById('ttsAudioFormat')?.value || 'wav';
    const temperature = parseFloat(document.getElementById('ttsTemperature')?.value) || 0.8;
    const exaggeration = parseFloat(document.getElementById('ttsExaggeration')?.value) || 0.5;
    const cfgWeight = parseFloat(document.getElementById('ttsCfgWeight')?.value) || 0.5;
    const language = document.getElementById('ttsLanguage')?.value || 'en';
    const subfolder = document.getElementById('ttsSubfolder')?.value || '';
    
    // Set modal values
    document.getElementById('modalTTSVoice').value = refAudio;
    document.getElementById('modalTTSEngine').value = ttsEngine;
    document.getElementById('modalTTSFormat').value = audioFormat;
    document.getElementById('modalTTSTemperature').value = temperature;
    document.getElementById('modalTTSTemperatureValue').textContent = temperature.toFixed(1);
    document.getElementById('modalTTSExaggeration').value = exaggeration;
    document.getElementById('modalTTSExaggerationValue').textContent = exaggeration.toFixed(1);
    document.getElementById('modalTTSCfgWeight').value = cfgWeight;
    document.getElementById('modalTTSCfgWeightValue').textContent = cfgWeight.toFixed(1);
    document.getElementById('modalTTSLanguage').value = language;
    document.getElementById('modalTTSSubfolder').value = subfolder;
    
    // Store text and message ID
    document.getElementById('modalTTSMessageText').value = text;
    document.getElementById('modalTTSMessageId').value = messageId || '';
    
    // Show modal
    document.getElementById('chatTTSModal').style.display = 'flex';
    
    // Setup range input listeners for live updates
    setupTTSModalRangeListeners();
}

function setupTTSModalRangeListeners() {
    // Temperature
    const tempSlider = document.getElementById('modalTTSTemperature');
    const tempValue = document.getElementById('modalTTSTemperatureValue');
    if (tempSlider && tempValue) {
        tempSlider.oninput = function() {
            tempValue.textContent = parseFloat(this.value).toFixed(1);
        };
    }
    
    // Exaggeration
    const exagSlider = document.getElementById('modalTTSExaggeration');
    const exagValue = document.getElementById('modalTTSExaggerationValue');
    if (exagSlider && exagValue) {
        exagSlider.oninput = function() {
            exagValue.textContent = parseFloat(this.value).toFixed(1);
        };
    }
    
    // CFG Weight
    const cfgSlider = document.getElementById('modalTTSCfgWeight');
    const cfgValue = document.getElementById('modalTTSCfgWeightValue');
    if (cfgSlider && cfgValue) {
        cfgSlider.oninput = function() {
            cfgValue.textContent = parseFloat(this.value).toFixed(1);
        };
    }
}

function closeChatTTSModal() {
    document.getElementById('chatTTSModal').style.display = 'none';
}

function openAudioBrowserForModal() {
    // Open audio browser in 'modal' mode to select file for the TTS modal
    openAudioBrowser('modal');
}

async function submitChatTTS() {
    // Get values from modal
    const text = document.getElementById('modalTTSMessageText').value;
    const messageId = document.getElementById('modalTTSMessageId').value;
    const refAudio = document.getElementById('modalTTSVoice').value.trim();
    const ttsEngine = document.getElementById('modalTTSEngine').value;
    const audioFormat = document.getElementById('modalTTSFormat').value;
    const temperature = parseFloat(document.getElementById('modalTTSTemperature').value);
    const exaggeration = parseFloat(document.getElementById('modalTTSExaggeration').value);
    const cfgWeight = parseFloat(document.getElementById('modalTTSCfgWeight').value);
    const language = document.getElementById('modalTTSLanguage').value;
    const subfolder = document.getElementById('modalTTSSubfolder').value.trim();
    
    if (!text) {
        showNotification('No text to convert to speech', 'Error', 'error');
        return;
    }
    
    if (!refAudio) {
        showNotification('Please specify a reference audio file', 'Error', 'error');
        return;
    }
    
    // Close modal
    closeChatTTSModal();
    
    try {
        // Determine session_id and file_prefix based on the active tab
        const activeTabEl = document.querySelector('.tab-content.active');
        const activeTabId = activeTabEl ? activeTabEl.id : '';
        let sessionId = null;
        let filePrefix = 'chat_tts';
        if (activeTabId === 'autochatTab') {
            sessionId = (typeof currentAutoSession !== 'undefined') ? currentAutoSession?.session_id : null;
            filePrefix = 'autochat_tts';
        } else if (activeTabId === 'storyTab') {
            sessionId = currentStorySession?.session_id;
            filePrefix = 'story_tts';
        } else {
            sessionId = currentChatSession?.session_id;
        }

        const response = await fetch('/api/queue/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                ref_audio: refAudio,
                seed: null,
                file_prefix: filePrefix,
                subfolder,
                tts_engine: ttsEngine,
                audio_format: audioFormat,
                temperature,
                exaggeration,
                cfg_weight: cfgWeight,
                chunk_size: 300,
                language,
                repetition_penalty: 2.0,
                // Track which chat message this TTS belongs to
                chat_message_id: messageId,
                session_id: sessionId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`TTS queued! ${data.total_sentences} sentence(s) will be generated.`, 'Success', 'success', 4000);
            
            // Store batch ID with message for later audio attachment
            if (messageId && data.batch_id) {
                // We'll handle this when TTS completes
                console.log('[TTS] Batch ID:', data.batch_id, 'for message:', messageId);
            }
        } else {
            showNotification(data.error || 'Failed to queue TTS generation', 'Error', 'error', 5000);
        }
    } catch (error) {
        console.error('TTS generation error:', error);
        showNotification('Failed to queue TTS generation', 'Error', 'error', 5000);
    }
}

async function generateTTS() {
    const text = document.getElementById('ttsText').value.trim();
    const refAudio = document.getElementById('ttsNarratorAudio').value.trim();
    const seed = document.getElementById('ttsSeed').value.trim();
    const filePrefix = document.getElementById('ttsFilePrefix').value.trim() || 'tts';
    const subfolder = document.getElementById('ttsSubfolder').value.trim();
    
    // Get Gradio TTS parameters
    const ttsEngine = document.getElementById('ttsEngine').value || 'ChatterboxTTS';
    const audioFormat = document.getElementById('ttsAudioFormat').value || 'wav';
    const temperature = parseFloat(document.getElementById('ttsTemperature').value) || 0.8;
    const exaggeration = parseFloat(document.getElementById('ttsExaggeration').value) || 0.5;
    const cfgWeight = parseFloat(document.getElementById('ttsCfgWeight').value) || 0.5;
    const chunkSize = parseInt(document.getElementById('ttsChunkSize').value) || 300;
    const language = document.getElementById('ttsLanguage').value || 'en';
    const repetitionPenalty = parseFloat(document.getElementById('ttsRepetitionPenalty').value) || 2.0;
    
    if (!text) {
        showAlert('Error', 'Please enter text to convert to speech');
        return;
    }
    
    if (!refAudio) {
        showAlert('Error', 'Please specify a reference audio file');
        return;
    }
    
    try {
        const response = await fetch('/api/queue/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                ref_audio: refAudio,
                seed: seed ? parseInt(seed) : null,
                file_prefix: filePrefix,
                subfolder,
                tts_engine: ttsEngine,
                audio_format: audioFormat,
                temperature,
                exaggeration,
                cfg_weight: cfgWeight,
                chunk_size: chunkSize,
                language,
                repetition_penalty: repetitionPenalty
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('Success', `TTS queued! ${data.total_sentences} sentence(s) will be generated.`);
            // Clear text input after successful submission
            document.getElementById('ttsText').value = '';
        } else {
            showAlert('Error', data.error || 'Failed to queue TTS generation');
        }
    } catch (error) {
        console.error('TTS generation error:', error);
        showAlert('Error', 'Failed to queue TTS generation');
    }
}

// Audio Browser Functions
let currentPlayingBatch = null;
let currentPlayingIndex = 0;
let audioElement = null;

async function loadAudioBatches() {
    try {
        const response = await fetch('/api/browse_audio?folder=output');
        const data = await response.json();
        
        if (!data.success) {
            console.error('Failed to load audio:', data.error);
            return;
        }
        
        const container = document.getElementById('audioBatchesContainer');
        const emptyMessage = document.getElementById('audioEmpty');
        
        if (!data.batches || data.batches.length === 0) {
            container.style.display = 'none';
            emptyMessage.style.display = 'flex';
            return;
        }
        
        container.style.display = 'block';
        emptyMessage.style.display = 'none';
        
        // Render batches
        container.innerHTML = data.batches.map(batch => renderAudioBatch(batch)).join('');
        
        // Event listeners are now handled via onclick in HTML
        
    } catch (error) {
        console.error('Error loading audio batches:', error);
    }
}

function renderAudioBatch(batch) {
    const date = new Date(batch.timestamp);
    const formattedDate = date.toLocaleString();
    const firstSentencePreview = batch.files[0]?.prompt || batch.files[0]?.text || '';
    
    // Get first few words (up to 50 chars) for title
    const titleText = firstSentencePreview.length > 50 ? firstSentencePreview.substring(0, 50) + '...' : firstSentencePreview;
    
    // Get voice/style from first file
    const voice = batch.files[0]?.style || batch.files[0]?.narrator_audio || 'Unknown Voice';
    const voiceName = voice.replace('.mp3', '').replace('.wav', '');
    
    // Get language from first file
    const language = batch.files[0]?.language || 'English';
    
    // Collect all text for "View Full Text" button - join with line breaks for readability
    const fullText = batch.files
        .sort((a, b) => (a.sentence_index || 0) - (b.sentence_index || 0))
        .map(f => f.prompt || f.text || '')
        .filter(text => text.trim())
        .join(' ');
    
    // Store batch data globally for full text modal
    audioBatchData[batch.batch_id] = {
        fullText: fullText,
        voiceName: voiceName,
        language: language
    };
    
    // Count unique sentences (not versions)
    const uniqueSentenceIndices = new Set(batch.files.map(f => f.sentence_index));
    const uniqueSentenceCount = uniqueSentenceIndices.size;
    
    // Calculate total duration based on most recent versions (will be updated when versions are selected)
    const sentenceGroups = {};
    batch.files.forEach(file => {
        const idx = file.sentence_index;
        if (!sentenceGroups[idx]) sentenceGroups[idx] = [];
        sentenceGroups[idx].push(file);
    });
    let totalDuration = 0;
    Object.values(sentenceGroups).forEach(versions => {
        // Use most recent version by default (newest version_number)
        versions.sort((a, b) => (b.version_number || 0) - (a.version_number || 0));
        const duration = versions[0].duration || 0;
        console.log(`[AUDIO] Sentence ${versions[0].sentence_index}: duration=${duration}s, file=${versions[0].filename}`);
        totalDuration += duration;
    });
    console.log(`[AUDIO] Batch ${batch.batch_id} total duration: ${totalDuration}s (${uniqueSentenceCount} sentences)`);
    const totalDurationFormatted = formatDuration(totalDuration);
    
    return `
        <div class="audio-batch-card collapsed" id="batch_${batch.batch_id}">
            <div class="audio-batch-header" onclick="toggleAudioBatch('${batch.batch_id}'); return false;">
                <div class="audio-batch-info">
                    <div class="audio-batch-title">
                        <h3>${escapeHtml(titleText)}</h3>
                        <svg class="collapse-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                    <div class="audio-batch-meta">
                        <span>${escapeHtml(voiceName)}</span>
                        <span>•</span>
                        <span>${escapeHtml(language)}</span>
                        <span>•</span>
                        <span>${formattedDate}</span>
                        <span>•</span>
                        <span>${uniqueSentenceCount} sentence(s)</span>
                        <span>•</span>
                        <span id="totalDuration_${batch.batch_id}">${totalDurationFormatted}</span>
                    </div>
                </div>
            </div>
            <div class="audio-batch-content" id="batchContent_${batch.batch_id}">
                <div class="audio-player-section">
                    <audio id="audioPlayer_${batch.batch_id}" class="audio-player" controls ontimeupdate="updateCurrentPlaythroughTime('${batch.batch_id}')">
                        <source src="" type="audio/mpeg">
                        Your browser does not support the audio element.
                    </audio>
                    <div class="audio-player-info">
                        <div id="currentSentence_${batch.batch_id}" class="current-sentence-display">Select a sentence or click Play All</div>
                        <div id="playthroughTime_${batch.batch_id}" class="playthrough-time-display" style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.5rem;"></div>
                    </div>
                </div>
                <div class="audio-controls">
                    <button class="btn btn-primary btn-sm" id="playBatch_${batch.batch_id}" onclick="playAudioBatch('${batch.batch_id}'); return false;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                        Play All
                    </button>
                    <button class="btn btn-secondary btn-sm" id="stopBatch_${batch.batch_id}" onclick="stopAudioPlayback('${batch.batch_id}'); return false;" style="display: none;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="6" y="6" width="12" height="12"></rect>
                        </svg>
                        Stop
                    </button>
                    <button class="btn btn-info btn-sm" id="viewTextBatch_${batch.batch_id}" onclick="showFullTextModal('${batch.batch_id}'); return false;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                        View Full Text
                    </button>
                    <button class="btn btn-success btn-sm" id="downloadAllBatch_${batch.batch_id}" onclick="downloadMergedAudio('${batch.batch_id}'); return false;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        Download All
                    </button>
                </div>
                <div class="audio-sentences-list" id="sentencesList_${batch.batch_id}">
                    ${renderUniqueSentences(batch.batch_id, batch.files)}
                </div>
            </div>
        </div>
    `;
}

function formatDuration(seconds) {
    if (!seconds || seconds === 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function renderUniqueSentences(batchId, files) {
    // Group files by sentence_index
    const sentenceGroups = {};
    files.forEach(file => {
        const idx = file.sentence_index;
        if (!sentenceGroups[idx]) {
            sentenceGroups[idx] = [];
        }
        sentenceGroups[idx].push(file);
    });
    
    // Sort sentence indices and render only one item per sentence_index
    const sortedIndices = Object.keys(sentenceGroups).map(Number).sort((a, b) => a - b);
    return sortedIndices.map(sentenceIdx => {
        const versions = sentenceGroups[sentenceIdx];
        // Sort versions by version_number, newest first
        versions.sort((a, b) => (b.version_number || 0) - (a.version_number || 0));
        // Use the newest version as the default display
        const latestVersion = versions[0];
        return renderSentenceItem(batchId, latestVersion, sentenceIdx, files);
    }).join('');
}

function updateCurrentPlaythroughTime(batchId) {
    const audioPlayer = document.getElementById(`audioPlayer_${batchId}`);
    const display = document.getElementById(`playthroughTime_${batchId}`);
    const totalDisplay = document.getElementById(`totalDuration_${batchId}`);
    
    if (!audioPlayer || !display || !currentPlayingBatch || currentPlayingBatch.batch_id !== batchId) return;
    
    // Calculate elapsed time from completed sentences
    let elapsedTime = 0;
    for (let i = 0; i < currentPlayingIndex; i++) {
        elapsedTime += currentPlayingBatch.files[i].duration || 0;
    }
    // Add current audio position
    elapsedTime += audioPlayer.currentTime || 0;
    
    // Calculate total duration
    let totalDuration = 0;
    currentPlayingBatch.files.forEach(f => {
        totalDuration += f.duration || 0;
    });
    
    // Update display
    display.textContent = `Playthrough: ${formatDuration(elapsedTime)} / ${formatDuration(totalDuration)}`;
    
    // Also update the total duration in header if it's playing
    if (totalDisplay) {
        totalDisplay.textContent = formatDuration(totalDuration);
    }
}

function renderSentenceItem(batchId, file, sentenceIdx, allFiles) {
    // Group files by sentence_index to find versions
    const sentence_index = file.sentence_index;
    const versions = allFiles.filter(f => f.sentence_index === sentence_index);
    versions.sort((a, b) => (b.version_number || 0) - (a.version_number || 0)); // Sort by version, newest first
    
    const hasMultipleVersions = versions.length > 1;
    
    return `
        <div class="audio-sentence-item" data-sentence-index="${sentence_index}" data-batch="${batchId}" data-sentence-id="${file.id}" onclick="playSingleSentence('${batchId}', ${sentence_index}); return false;">
            <div class="audio-sentence-number">${sentence_index + 1}</div>
            <div class="audio-sentence-text">${escapeHtml(file.prompt || file.text || '')}</div>
            <div class="audio-sentence-actions" style="display: flex; gap: 0.25rem; align-items: center;">
                ${hasMultipleVersions ? `
                    <select class="version-selector" onchange="switchSentenceVersion('${batchId}', ${sentence_index}, this.value); event.stopPropagation();" onclick="event.stopPropagation();" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary);">
                        ${versions.map(v => `<option value="${v.id}" ${v.id === file.id ? 'selected' : ''}>v${v.version_number || 0}</option>`).join('')}
                    </select>
                ` : ''}
                <button class="btn-icon download-sentence-btn" onclick="event.stopPropagation(); downloadAudioSentence('${file.id}'); return false;" title="Download this sentence">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                </button>
                <button class="btn-icon edit-sentence-btn" onclick="event.stopPropagation(); openEditSentenceModal('${file.id}', \`${(file.prompt || file.text || '').replace(/`/g, '\\`').replace(/\\/g, '\\\\').replace(/\$/g, '\\$')}\`); return false;" title="Edit & Regenerate">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="btn-icon play-sentence-btn" id="playBtn_${batchId}_${sentence_index}" onclick="event.stopPropagation(); playSingleSentence('${batchId}', ${sentence_index}); return false;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                </button>
                <button class="btn-icon stop-sentence-btn" id="stopBtn_${batchId}_${sentence_index}" style="display: none; background: var(--danger);" onclick="event.stopPropagation(); stopSingleSentence('${batchId}', ${sentence_index}); return false;" title="Stop playback">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="6" y="6" width="12" height="12"></rect>
                    </svg>
                </button>
            </div>
        </div>
    `;
}

function toggleAudioBatch(batchId) {
    const batchCard = document.getElementById(`batch_${batchId}`);
    if (batchCard) {
        batchCard.classList.toggle('collapsed');
    }
}

// Helper function to get selected versions for each sentence
function getSelectedVersionsForBatch(batchId, batch) {
    // Group files by sentence_index
    const sentenceGroups = {};
    batch.files.forEach(file => {
        const idx = file.sentence_index;
        if (!sentenceGroups[idx]) sentenceGroups[idx] = [];
        sentenceGroups[idx].push(file);
    });
    
    // Get selected version for each sentence
    const sortedIndices = Object.keys(sentenceGroups).map(Number).sort((a, b) => a - b);
    const selectedVersions = sortedIndices.map(idx => {
        const versions = sentenceGroups[idx];
        
        // Check if there's a version selector for this sentence
        const sentenceItem = document.querySelector(`[data-sentence-index="${idx}"][data-batch="${batchId}"]`);
        if (sentenceItem) {
            const selector = sentenceItem.querySelector('.version-selector');
            if (selector) {
                // Use the selected version from dropdown
                const selectedId = selector.value;
                const selectedFile = versions.find(v => v.id === selectedId);
                if (selectedFile) return selectedFile;
            }
        }
        
        // Fallback: use newest version
        versions.sort((a, b) => (b.version_number || 0) - (a.version_number || 0));
        return versions[0];
    });
    
    return selectedVersions;
}

function playSingleSentence(batchId, sentenceIndex) {
    // Find the batch and start playing from this sentence onwards
    const batchResponse = fetch('/api/browse_audio?folder=output')
        .then(res => res.json())
        .then(data => {
            const batch = data.batches.find(b => b.batch_id === batchId);
            if (!batch) return;
            
            // Get selected versions for all sentences
            const selectedVersions = getSelectedVersionsForBatch(batchId, batch);
            
            // Find the position of this sentence in the array
            const playIndex = selectedVersions.findIndex(f => f.sentence_index === sentenceIndex);
            if (playIndex === -1) return;
            
            // Set up for consecutive playback from this sentence
            currentPlayingBatch = { ...batch, files: selectedVersions };
            currentPlayingIndex = playIndex;
            
            // Show stop button for batch controls
            const playBtn = document.getElementById(`playBatch_${batchId}`);
            const stopBtn = document.getElementById(`stopBatch_${batchId}`);
            if (playBtn) playBtn.style.display = 'none';
            if (stopBtn) stopBtn.style.display = 'inline-flex';
            
            // Show stop button for this specific sentence, hide play button
            const sentencePlayBtn = document.getElementById(`playBtn_${batchId}_${sentenceIndex}`);
            const sentenceStopBtn = document.getElementById(`stopBtn_${batchId}_${sentenceIndex}`);
            if (sentencePlayBtn) sentencePlayBtn.style.display = 'none';
            if (sentenceStopBtn) sentenceStopBtn.style.display = 'inline-flex';
            
            // Expand the batch if collapsed
            const batchCard = document.getElementById(`batch_${batchId}`);
            if (batchCard) {
                batchCard.classList.remove('collapsed');
                batchCard.classList.add('playing');
            }
            
            // Start consecutive playback from this sentence
            playNextSentence();
        })
        .catch(err => console.error('Error playing sentence:', err));
}

function stopSingleSentence(batchId, sentenceIndex) {
    // Stop playback
    stopAudioPlayback(batchId);
    
    // Hide stop button, show play button for this sentence
    const sentencePlayBtn = document.getElementById(`playBtn_${batchId}_${sentenceIndex}`);
    const sentenceStopBtn = document.getElementById(`stopBtn_${batchId}_${sentenceIndex}`);
    if (sentencePlayBtn) sentencePlayBtn.style.display = 'inline-flex';
    if (sentenceStopBtn) sentenceStopBtn.style.display = 'none';
}

async function playAudioBatch(batchId) {
    // Fetch batch data
    try {
        const response = await fetch('/api/browse_audio?folder=output');
        const data = await response.json();
        const batch = data.batches.find(b => b.batch_id === batchId);
        
        if (!batch) return;
        
        // Get selected versions for all sentences
        const selectedVersions = getSelectedVersionsForBatch(batchId, batch);
        
        currentPlayingBatch = { ...batch, files: selectedVersions };
        currentPlayingIndex = 0;
        
        // Show stop button, hide play button
        const playBtn = document.getElementById(`playBatch_${batchId}`);
        const stopBtn = document.getElementById(`stopBatch_${batchId}`);
        if (playBtn) playBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'inline-flex';
        
        // Expand the batch if collapsed
        const batchCard = document.getElementById(`batch_${batchId}`);
        if (batchCard) batchCard.classList.remove('collapsed');
        
        // Highlight the batch being played
        document.querySelectorAll('.audio-batch-card').forEach(card => {
            card.classList.remove('playing');
        });
        batchCard.classList.add('playing');
        
        // Play first audio
        playNextSentence();
    } catch (error) {
        console.error('Error playing audio batch:', error);
    }
}

function playNextSentence() {
    if (!currentPlayingBatch || currentPlayingIndex >= currentPlayingBatch.files.length) {
        // Finished playing all sentences
        stopAudioPlayback(currentPlayingBatch.batch_id);
        return;
    }
    
    const file = currentPlayingBatch.files[currentPlayingIndex];
    const batchId = currentPlayingBatch.batch_id;
    const audioPlayer = document.getElementById(`audioPlayer_${batchId}`);
    const currentSentenceDisplay = document.getElementById(`currentSentence_${batchId}`);
    const batchContent = document.getElementById(`batchContent_${batchId}`);
    
    if (!audioPlayer) {
        console.error('Audio player not found');
        return;
    }
    
    // Update audio source - use relative_path or construct from path
    const audioPath = file.relative_path || file.path.replace(/\\/g, '/');
    audioPlayer.src = `/outputs/${audioPath}`;
    console.log('[Audio] Loading:', audioPlayer.src);
    audioPlayer.load();
    
    // Update display
    if (currentSentenceDisplay) {
        currentSentenceDisplay.textContent = `Playing ${currentPlayingIndex + 1}/${currentPlayingBatch.files.length}: ${file.prompt || file.text || ''}`;
    }
    
    // Highlight current sentence and manage button visibility
    if (batchContent) {
        batchContent.querySelectorAll('.audio-sentence-item').forEach((item, idx) => {
            const isActive = idx === currentPlayingIndex;
            item.classList.toggle('active', isActive);
            
            const sentenceIdx = item.getAttribute('data-sentence-index');
            const playBtn = document.getElementById(`playBtn_${batchId}_${sentenceIdx}`);
            const stopBtn = document.getElementById(`stopBtn_${batchId}_${sentenceIdx}`);
            
            if (isActive) {
                // Show stop button for active sentence
                if (playBtn) playBtn.style.display = 'none';
                if (stopBtn) stopBtn.style.display = 'inline-flex';
                // Scroll to active sentence
                item.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                // Show play button for inactive sentences
                if (playBtn) playBtn.style.display = 'inline-flex';
                if (stopBtn) stopBtn.style.display = 'none';
            }
        });
    }
    
    // Remove old event listeners
    audioPlayer.onended = null;
    audioPlayer.onerror = null;
    
    // Add new event listeners
    audioPlayer.onended = () => {
        currentPlayingIndex++;
        playNextSentence();
    };
    
    audioPlayer.onerror = (e) => {
        console.error('Audio playback error:', e);
        currentPlayingIndex++;
        playNextSentence();
    };
    
    // Play
    audioPlayer.play().catch(err => {
        console.error('Failed to play audio:', err);
        currentPlayingIndex++;
        playNextSentence();
    });
}

function stopAudioPlayback(batchId) {
    if (batchId) {
        const audioPlayer = document.getElementById(`audioPlayer_${batchId}`);
        if (audioPlayer) {
            audioPlayer.pause();
            audioPlayer.src = '';
        }
        
        const playBtn = document.getElementById(`playBatch_${batchId}`);
        const stopBtn = document.getElementById(`stopBatch_${batchId}`);
        if (playBtn) playBtn.style.display = 'inline-flex';
        if (stopBtn) stopBtn.style.display = 'none';
        
        const currentSentenceDisplay = document.getElementById(`currentSentence_${batchId}`);
        if (currentSentenceDisplay) {
            currentSentenceDisplay.textContent = 'Select a sentence or click Play All';
        }
        
        const batchContent = document.getElementById(`batchContent_${batchId}`);
        if (batchContent) {
            batchContent.querySelectorAll('.audio-sentence-item').forEach(item => {
                item.classList.remove('active');
                
                // Reset all sentence buttons to play state
                const sentenceIdx = item.getAttribute('data-sentence-index');
                const playBtn = document.getElementById(`playBtn_${batchId}_${sentenceIdx}`);
                const stopBtn = document.getElementById(`stopBtn_${batchId}_${sentenceIdx}`);
                if (playBtn) playBtn.style.display = 'inline-flex';
                if (stopBtn) stopBtn.style.display = 'none';
            });
        }
        
        const batchCard = document.getElementById(`batch_${batchId}`);
        if (batchCard) batchCard.classList.remove('playing');
    }
    
    currentPlayingBatch = null;
    currentPlayingIndex = 0;
}

async function showFullTextModal(batchId) {
    const modal = document.getElementById('audioTextModal');
    const textarea = document.getElementById('audioFullTextArea');
    
    if (!modal || !textarea) return;
    
    try {
        // Fetch batch data fresh to get currently selected versions
        const response = await fetch('/api/browse_audio?folder=output');
        const data = await response.json();
        const batch = data.batches.find(b => b.batch_id === batchId);
        
        if (!batch) {
            console.error('[AUDIO] Batch not found:', batchId);
            showNotification('Batch not found', 'Error', 'error');
            return;
        }
        
        // Group files by sentence_index
        const sentenceGroups = {};
        batch.files.forEach(file => {
            const idx = file.sentence_index;
            if (!sentenceGroups[idx]) sentenceGroups[idx] = [];
            sentenceGroups[idx].push(file);
        });
        
        // Build full text from currently selected versions
        const sortedIndices = Object.keys(sentenceGroups).map(Number).sort((a, b) => a - b);
        const fullTextParts = [];
        
        sortedIndices.forEach(idx => {
            const versions = sentenceGroups[idx];
            // Check which version is currently selected in the UI
            const selectedVersionSelect = document.querySelector(`[data-sentence-index="${idx}"][data-batch="${batchId}"] .version-selector`);
            
            let selectedFile;
            if (selectedVersionSelect) {
                // Get the selected version from dropdown
                const selectedId = selectedVersionSelect.value;
                selectedFile = versions.find(v => v.id === selectedId);
            }
            
            // Fallback to newest version if no selector or not found
            if (!selectedFile) {
                versions.sort((a, b) => (b.version_number || 0) - (a.version_number || 0));
                selectedFile = versions[0];
            }
            
            const text = (selectedFile.prompt || selectedFile.text || '').trim();
            if (text) {
                fullTextParts.push(text);
            }
        });
        
        textarea.value = fullTextParts.join(' ');
        modal.style.display = 'flex';
        
    } catch (error) {
        console.error('[AUDIO] Error loading full text:', error);
        showNotification('Could not load full text', 'Error', 'error');
    }
}

function closeAudioTextModal() {
    const modal = document.getElementById('audioTextModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function copyAudioText() {
    const textarea = document.getElementById('audioFullTextArea');
    if (textarea) {
        textarea.select();
        document.execCommand('copy');
        
        // Visual feedback
        const copyBtn = document.getElementById('copyAudioTextBtn');
        if (copyBtn) {
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!';
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
            }, 2000);
        }
    }
}

// Edit Sentence Modal Functions
async function openEditSentenceModal(sentenceId, text) {
    const modal = document.getElementById('editSentenceModal');
    const textarea = document.getElementById('editSentenceTextArea');
    const idInput = document.getElementById('editSentenceId');
    
    if (modal && textarea && idInput) {
        textarea.value = text;
        idInput.value = sentenceId;
        
        // Fetch metadata to get TTS settings
        try {
            const response = await fetch('/api/browse_audio?folder=output');
            const data = await response.json();
            
            if (data.success && data.batches) {
                // Find the sentence in the batches
                let sentenceData = null;
                for (const batch of data.batches) {
                    sentenceData = batch.files.find(f => f.id === sentenceId);
                    if (sentenceData) break;
                }
                
                if (sentenceData) {
                    // Populate settings from metadata (Gradio API parameters)
                    document.getElementById('editTtsEngine').value = sentenceData.tts_engine || 'ChatterboxTTS';
                    document.getElementById('editSeed').value = sentenceData.seed || '';
                    document.getElementById('editTemperature').value = sentenceData.temperature || 0.8;
                    document.getElementById('editExaggeration').value = sentenceData.exaggeration || 0.5;
                    document.getElementById('editCfgWeight').value = sentenceData.cfg_weight || 0.5;
                    // Use chunk_size if available, fall back to max_chars for backward compatibility
                    document.getElementById('editChunkSize').value = sentenceData.chunk_size || sentenceData.max_chars || 300;
                    document.getElementById('editLanguage').value = sentenceData.language || 'en';
                    
                    // Update language dropdown state based on loaded engine
                    updateTTSLanguageState('editTtsEngine', 'editLanguage');
                }
            }
        } catch (error) {
            console.error('Error loading sentence metadata:', error);
            // Use defaults if fetch fails
            document.getElementById('editTtsEngine').value = 'ChatterboxTTS';
            document.getElementById('editSeed').value = '';
            document.getElementById('editTemperature').value = 0.8;
            document.getElementById('editExaggeration').value = 0.5;
            document.getElementById('editCfgWeight').value = 0.5;
            document.getElementById('editChunkSize').value = 300;
            document.getElementById('editSilence').value = 100;
            document.getElementById('editLanguage').value = 'en';
            
            // Update language dropdown state with default engine
            updateTTSLanguageState('editTtsEngine', 'editLanguage');
        }
        
        modal.style.display = 'flex';
        textarea.focus();
    }
}

function closeEditSentenceModal() {
    const modal = document.getElementById('editSentenceModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function regenerateSentence() {
    const sentenceId = document.getElementById('editSentenceId').value;
    const text = document.getElementById('editSentenceTextArea').value.trim();
    
    // Get TTS settings from modal (Gradio API parameters)
    const ttsEngine = document.getElementById('editTtsEngine').value || 'ChatterboxTTS';
    const seed = document.getElementById('editSeed').value.trim();
    const temperature = parseFloat(document.getElementById('editTemperature').value) || 0.8;
    const exaggeration = parseFloat(document.getElementById('editExaggeration').value) || 0.5;
    const cfgWeight = parseFloat(document.getElementById('editCfgWeight').value) || 0.5;
    const chunkSize = parseInt(document.getElementById('editChunkSize').value) || 300;
    const language = document.getElementById('editLanguage').value || 'en';
    
    if (!text) {
        showNotification('Text cannot be empty', 'Error', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/queue/tts/regenerate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sentence_id: sentenceId,
                text: text,
                tts_engine: ttsEngine,
                seed: seed ? parseInt(seed) : null,
                temperature,
                exaggeration,
                cfg_weight: cfgWeight,
                max_chars: chunkSize,  // Backend maps this to chunk_size
                silence_ms: 100,  // Not used in Gradio API, but keep for compatibility
                language
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(`Regeneration queued (version ${result.version_number})`, 'Success', 'success', 3000);
            closeEditSentenceModal();
            
            // Reload audio tab after a short delay to show the queued job
            setTimeout(() => {
                if (currentTab === 'audio') {
                    loadAudioTab();
                }
            }, 1000);
        } else {
            showNotification(result.error || 'Regeneration failed', 'Error', 'error');
        }
    } catch (error) {
        console.error('Error regenerating sentence:', error);
        showNotification('Error regenerating sentence', 'Error', 'error');
    }
}

// Switch between different versions of the same sentence
async function switchSentenceVersion(batchId, sentenceIndex, newFileId) {
    try {
        // Fetch the batch data to find the new file
        const response = await fetch('/api/browse_audio?folder=output');
        const data = await response.json();
        const batch = data.batches.find(b => b.batch_id === batchId);
        
        if (!batch) return;
        
        // Find the new version file
        const newFile = batch.files.find(f => f.id === newFileId);
        if (!newFile) return;
        
        // Update the sentence item display to show the new version's text
        const sentenceItem = document.querySelector(`[data-sentence-index="${sentenceIndex}"][data-batch="${batchId}"]`);
        if (sentenceItem) {
            const textElement = sentenceItem.querySelector('.audio-sentence-text');
            if (textElement) {
                textElement.textContent = newFile.prompt || newFile.text || '';
            }
            
            // Update the data-sentence-id attribute
            sentenceItem.setAttribute('data-sentence-id', newFileId);
        }
        
        // Recalculate total duration based on currently selected versions
        const sentenceGroups = {};
        batch.files.forEach(file => {
            const idx = file.sentence_index;
            if (!sentenceGroups[idx]) sentenceGroups[idx] = [];
            sentenceGroups[idx].push(file);
        });
        
        // Calculate new total duration
        let newTotalDuration = 0;
        Object.keys(sentenceGroups).forEach(idx => {
            const versions = sentenceGroups[idx];
            // Find which version is currently selected for this sentence
            const selectedVersionSelect = document.querySelector(`[data-sentence-index="${idx}"][data-batch="${batchId}"] .version-selector`);
            if (selectedVersionSelect) {
                const selectedId = selectedVersionSelect.value;
                const selectedFile = versions.find(v => v.id === selectedId);
                if (selectedFile) {
                    newTotalDuration += selectedFile.duration || 0;
                }
            } else {
                // No selector (only one version), use the first one
                versions.sort((a, b) => (b.version_number || 0) - (a.version_number || 0));
                newTotalDuration += versions[0].duration || 0;
            }
        });
        
        // Update the total duration display in the header
        const totalDurationDisplay = document.getElementById(`totalDuration_${batchId}`);
        if (totalDurationDisplay) {
            totalDurationDisplay.textContent = formatDuration(newTotalDuration);
        }
        
        // If this sentence is currently playing, update the player
        const audioPlayer = document.getElementById(`audioPlayer_${batchId}`);
        if (audioPlayer && currentPlayingBatch && currentPlayingBatch.batch_id === batchId) {
            // Find the index in the playing files array
            const playingIdx = currentPlayingBatch.files.findIndex(f => f.sentence_index === sentenceIndex);
            if (playingIdx !== -1 && playingIdx === currentPlayingIndex) {
                // Update the current file and replay
                currentPlayingBatch.files[playingIdx] = newFile;
                const audioPath = newFile.relative_path || newFile.path;
                audioPlayer.src = `/outputs/${audioPath}`;
                audioPlayer.load();
                audioPlayer.play();
            }
        }
        
        showNotification('Switched to version ' + (newFile.version_number || 0), 'Version Changed', 'success', 2000);
    } catch (error) {
        console.error('Error switching sentence version:', error);
        showNotification('Error switching version', 'Error', 'error');
    }
}

// Download functions for audio
async function downloadAudioSentence(fileId) {
    try {
        // Create a temporary link and trigger download
        const link = document.createElement('a');
        link.href = `/api/audio/download/${fileId}`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Download started', 'Success', 'success');
    } catch (error) {
        console.error('[AUDIO] Error downloading audio:', error);
        showNotification('Download failed', 'Error', 'error');
    }
}

async function downloadMergedAudio(batchId) {
    try {
        // Show loading notification
        showNotification('Merging audio files...', 'Info', 'info');
        
        // Fetch batch data to get all sentence indices
        const response = await fetch('/api/browse_audio?folder=output');
        const data = await response.json();
        const batch = data.batches.find(b => b.batch_id === batchId);
        
        if (!batch) {
            showNotification('Batch not found', 'Error', 'error');
            return;
        }
        
        // Get all unique sentence indices (to get selected versions)
        const sentenceGroups = {};
        batch.files.forEach(file => {
            const idx = file.sentence_index;
            if (!sentenceGroups[idx]) {
                sentenceGroups[idx] = [];
            }
            sentenceGroups[idx].push(file);
        });
        
        // Get the currently selected version for each sentence
        const sentenceIndices = [];
        Object.keys(sentenceGroups).forEach(idx => {
            const sentenceIndex = parseInt(idx);
            const sentenceItem = document.querySelector(`[data-sentence-index="${sentenceIndex}"][data-batch="${batchId}"]`);
            
            if (sentenceItem) {
                const selector = sentenceItem.querySelector('.version-selector');
                if (selector) {
                    // Use selected version from dropdown
                    const selectedFileId = selector.value;
                    const selectedFile = batch.files.find(f => f.id === selectedFileId);
                    if (selectedFile) {
                        sentenceIndices.push(selectedFile.sentence_index);
                    }
                } else {
                    // No selector, use the sentence_index directly
                    sentenceIndices.push(sentenceIndex);
                }
            } else {
                // Fallback: just include the sentence index
                sentenceIndices.push(sentenceIndex);
            }
        });
        
        // Remove duplicates and sort
        const uniqueIndices = [...new Set(sentenceIndices)].sort((a, b) => a - b);
        
        // Call backend to merge
        const mergeResponse = await fetch('/api/audio/merge_batch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                batch_id: batchId,
                sentence_indices: uniqueIndices
            })
        });
        
        if (mergeResponse.ok) {
            // Download the merged file
            const blob = await mergeResponse.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            
            // Get filename from Content-Disposition header or use default
            const contentDisposition = mergeResponse.headers.get('Content-Disposition');
            let filename = `merged_${batchId}.wav`;
            if (contentDisposition) {
                const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (match && match[1]) {
                    filename = match[1].replace(/['"]/g, '');
                }
            }
            
            link.download = filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            showNotification('Audio merged and download started', 'Success', 'success');
        } else {
            const errorData = await mergeResponse.json();
            showNotification(errorData.error || 'Failed to merge audio', 'Error', 'error');
        }
    } catch (error) {
        console.error('[AUDIO] Error merging audio:', error);
        showNotification('Failed to merge audio files', 'Error', 'error');
    }
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

// ============================================================================
// CHAT SYSTEM
// ============================================================================

function initializeChat() {
    console.log('[CHAT] Initializing chat system...');
    
    // Load Ollama models
    loadOllamaModels();
    
    // Load chat sessions
    loadChatSessions();
    
    // Event listeners
    const newChatBtn = document.getElementById('newChatBtn');
    const toggleChatSidebarBtn = document.getElementById('toggleChatSidebarBtn');
    const closeChatSidebarBtn = document.getElementById('closeChatSidebarBtn');
    const toggleChatParamsBtn = document.getElementById('toggleChatParamsBtn');
    const closeChatParamsBtn = document.getElementById('closeChatParamsBtn');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const chatInput = document.getElementById('chatInput');
    const chatModelSelector = document.getElementById('chatModelSelector');
    const generateNameBtn = document.getElementById('generateSessionNameBtn');
    
    if (newChatBtn) newChatBtn.addEventListener('click', createNewChatSession);
    if (toggleChatSidebarBtn) toggleChatSidebarBtn.addEventListener('click', toggleChatSidebar);
    if (closeChatSidebarBtn) closeChatSidebarBtn.addEventListener('click', toggleChatSidebar);
    if (toggleChatParamsBtn) toggleChatParamsBtn.addEventListener('click', toggleChatParams);
    if (closeChatParamsBtn) closeChatParamsBtn.addEventListener('click', toggleChatParams);
    if (chatSendBtn) chatSendBtn.addEventListener('click', () => sendChatMessage());
    if (chatModelSelector) chatModelSelector.addEventListener('change', updateCurrentSessionModel);
    if (generateNameBtn) generateNameBtn.addEventListener('click', generateSessionName);
    
    // Close sidebars when clicking backdrop (mobile)
    const chatSessionsSidebar = document.getElementById('chatSessionsSidebar');
    const chatParamsSidebar = document.getElementById('chatParamsSidebar');
    
    if (chatSessionsSidebar) {
        chatSessionsSidebar.addEventListener('click', (e) => {
            if (e.target === chatSessionsSidebar && !chatSessionsSidebar.classList.contains('collapsed')) {
                toggleChatSidebar();
            }
        });
    }
    
    if (chatParamsSidebar) {
        chatParamsSidebar.addEventListener('click', (e) => {
            if (e.target === chatParamsSidebar && !chatParamsSidebar.classList.contains('collapsed')) {
                toggleChatParams();
            }
        });
    }
    
    // Chat input handlers
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
        
        // Auto-resize textarea
        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = chatInput.scrollHeight + 'px';
        });
    }
    
    // Parameter sliders - update value displays and auto-save
    const paramInputs = [
        { id: 'chatTemperature', valueId: 'chatTemperatureValue' },
        { id: 'chatTopP', valueId: 'chatTopPValue' },
        { id: 'chatTopK', valueId: 'chatTopKValue' },
        { id: 'chatRepeatPenalty', valueId: 'chatRepeatPenaltyValue' }
    ];
    
    paramInputs.forEach(({ id, valueId }) => {
        const input = document.getElementById(id);
        const valueDisplay = document.getElementById(valueId);
        if (input && valueDisplay) {
            input.addEventListener('input', () => {
                valueDisplay.textContent = input.value;
                autoSaveChatParameters();
            });
        }
    });
    
    // Seed input - update display and auto-save
    const seedInput = document.getElementById('chatSeed');
    const seedValue = document.getElementById('chatSeedValue');
    const clearSeedBtn = document.getElementById('clearChatSeedBtn');
    if (seedInput && seedValue) {
        seedInput.addEventListener('input', () => {
            seedValue.textContent = seedInput.value || 'Random';
            autoSaveChatParameters();
        });
    }
    
    // Context size selector - auto-save on change
    const chatNumCtx = document.getElementById('chatNumCtx');
    if (chatNumCtx) {
        chatNumCtx.addEventListener('change', () => {
            const valueDisplay = document.getElementById('chatNumCtxValue');
            if (valueDisplay) {
                valueDisplay.textContent = chatNumCtx.value;
            }
            autoSaveChatParameters();
        });
    }
    
    // Session name and system prompt - auto-save on input with debouncing
    const chatSessionName = document.getElementById('chatSessionName');
    const chatSystemPrompt = document.getElementById('chatSystemPrompt');
    
    let saveTimeout = null;
    const debouncedSave = () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            autoSaveChatParameters();
        }, 500); // Wait 500ms after user stops typing
    };
    
    if (chatSessionName) {
        chatSessionName.addEventListener('input', debouncedSave);
    }
    if (chatSystemPrompt) {
        chatSystemPrompt.addEventListener('input', debouncedSave);
    }
    
    console.log('[CHAT] Chat system initialized');
}

async function loadOllamaModels() {
    try {
        const response = await fetch('/api/ollama/models');
        const data = await response.json();
        
        if (data.success && data.models) {
            chatModels = data.models;
            const selector = document.getElementById('chatModelSelector');
            if (selector) {
                selector.innerHTML = '';
                if (chatModels.length === 0) {
                    selector.innerHTML = '<option value="">No models available</option>';
                    selector.disabled = true;
                } else {
                    chatModels.forEach(model => {
                        const option = document.createElement('option');
                        option.value = model.name;
                        option.textContent = model.name;
                        selector.appendChild(option);
                    });
                    selector.disabled = false;
                }
            }
            console.log(`[CHAT] Loaded ${chatModels.length} Ollama models`);
        } else {
            console.error('[CHAT] Failed to load models:', data.error);
            showNotification('Failed to load Ollama models', 'Error', 'error');
        }
    } catch (error) {
        console.error('[CHAT] Error loading models:', error);
        showNotification('Ollama server not available', 'Error', 'error');
    }
}

async function loadChatSessions() {
    try {
        const response = await fetch('/api/chat/sessions');
        const data = await response.json();
        
        if (data.success) {
            chatSessions = data.sessions;
            
            // Update currentChatSession with fresh data from server if it exists
            if (currentChatSession) {
                const freshSession = chatSessions.find(s => s.session_id === currentChatSession.session_id);
                if (freshSession) {
                    // Update current session with fresh data (preserves session_id and all other fields)
                    console.log('[CHAT] Updating currentChatSession with fresh data from server');
                    currentChatSession = freshSession;
                } else {
                    // Current session was deleted, clear it
                    console.log('[CHAT] Current session no longer exists, clearing');
                    currentChatSession = null;
                    chatAutoScrollEnabled = true;
                    setChatScrollButtonVisibility(false);
                }
            }
            
            renderChatSessions();
            console.log(`[CHAT] Loaded ${chatSessions.length} chat sessions`);
        } else {
            console.error('[CHAT] Failed to load sessions:', data.error);
        }
    } catch (error) {
        console.error('[CHAT] Error loading sessions:', error);
    }
}

function renderChatSessions() {
    const sessionsList = document.getElementById('chatSessionsList');
    if (!sessionsList) return;
    
    if (chatSessions.length === 0) {
        sessionsList.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 2rem 1rem;">
                <p>No chat sessions yet</p>
                <p style="font-size: 0.875rem;">Click + to create a new chat</p>
            </div>
        `;
        return;
    }
    
    sessionsList.innerHTML = '';
    // Sessions are already sorted by updated_at from backend (most recent first)
    chatSessions.forEach(session => {
        const sessionItem = document.createElement('div');
        sessionItem.className = 'chat-session-item';
        if (currentChatSession && currentChatSession.session_id === session.session_id) {
            sessionItem.classList.add('active');
        }
        
        const date = new Date(session.updated_at || session.created_at);
        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        sessionItem.innerHTML = `
            <div class="chat-session-content">
                <div class="session-name">${escapeHtml(session.chat_name)}</div>
                <div class="session-model">${escapeHtml(session.model)}</div>
                <div class="session-date">${dateStr}</div>
            </div>
            <div class="chat-session-actions">
                <button class="chat-session-duplicate" data-session-id="${session.session_id}" title="Duplicate chat">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                </button>
                <button class="chat-session-delete" data-session-id="${session.session_id}" title="Delete chat">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        `;
        
        // Add click handler for session selection
        sessionItem.addEventListener('click', (e) => {
            // Don't select if clicking action buttons
            if (e.target.closest('.chat-session-actions')) return;
            selectChatSession(session.session_id);
        });
        
        sessionsList.appendChild(sessionItem);
    });
    
    // Add duplicate handlers
    sessionsList.querySelectorAll('.chat-session-duplicate').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const sessionId = btn.dataset.sessionId;
            openDuplicateChatModal(sessionId);
        });
    });
    
    // Add delete handlers
    sessionsList.querySelectorAll('.chat-session-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const sessionId = btn.dataset.sessionId;
            await deleteChatSession(sessionId);
        });
    });
}

async function createNewChatSession() {
    try {
        const defaultModel = chatModels.length > 0 ? chatModels[0].name : 'llama3.2';
        
        const response = await fetch('/api/chat/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_name: 'New Chat',
                model: defaultModel,
                system_prompt: '',
                temperature: 0.7,
                top_p: 0.9,
                top_k: 40,
                repeat_penalty: 1.1,
                num_ctx: 2048,
                seed: null
            })
        });
        
        const data = await response.json();
        if (data.success) {
            // Wait for sessions to load before selecting
            await loadChatSessions();
            // Now select the new session (loadChatSessions ensures it's in the list)
            await selectChatSession(data.session.session_id);
            showNotification('New chat session created', 'Success', 'success');
        } else {
            showNotification('Failed to create chat session', 'Error', 'error');
        }
    } catch (error) {
        console.error('[CHAT] Error creating session:', error);
        showNotification('Error creating chat session', 'Error', 'error');
    }
}

// Clear chat seed (set to random)
function clearChatSeed() {
    const seedInput = document.getElementById('chatSeed');
    const seedValue = document.getElementById('chatSeedValue');
    if (seedInput && seedValue) {
        seedInput.value = '';
        seedValue.textContent = 'Random';
        autoSaveChatParameters();
    }
}
async function selectChatSession(sessionId, skipPollingResume = false) {
    console.log('[CHAT] selectChatSession called with sessionId:', sessionId);
    if (isLoadingChatSession) {
        console.log('[CHAT] Already loading a session, skipping');
        return;
    }
    isLoadingChatSession = true;
    
    try {
        console.log('[CHAT] Fetching session data from API...');
        const response = await fetch(`/api/chat/sessions/${sessionId}`);
        const data = await response.json();
        console.log('[CHAT] Session data received:', data);
        
        if (data.success) {
            currentChatSession = data.session;
            chatAutoScrollEnabled = true;
            setChatScrollButtonVisibility(false);
            console.log('[CHAT] currentChatSession set to:', currentChatSession);
            console.log('[CHAT] session_id:', currentChatSession?.session_id);
            renderChatSessions(); // Update active state
            loadChatUI();
            await renderChatMessages();
            
            // Resume polling for any incomplete responses (e.g., after page reload)
            // But not if we're being called from a polling completion (skipPollingResume)
            if (!skipPollingResume) {
                // Check both incomplete messages in session AND jobs in queue
                const incompleteMessages = currentChatSession.messages.filter(m => 
                    m.role === 'assistant' && !m.completed && (m.response_id || m.message_id)
                );
                
                // Also check queue for this session's jobs
                try {
                    const queueResponse = await fetch('/api/queue');
                    const queueData = await queueResponse.json();
                    
                    if (queueData) {
                        const allJobs = [...(queueData.queue || []), queueData.active].filter(Boolean);
                        const sessionChatJobs = allJobs.filter(job => 
                            job.job_type === 'chat' && job.session_id === sessionId
                        );
                        
                        // Collect response_ids from both incomplete messages and queued jobs
                        const responseIds = new Set();
                        incompleteMessages.forEach(msg => {
                            const id = msg.response_id || msg.message_id;
                            if (id) responseIds.add(id);
                        });
                        sessionChatJobs.forEach(job => {
                            if (job.response_id) responseIds.add(job.response_id);
                        });
                        
                        // Start polling for all identified response IDs
                        responseIds.forEach(responseId => {
                            // Don't start if already polling
                            if (!chatPollingIntervals[responseId]) {
                                console.log(`[CHAT] Resuming polling for response: ${responseId}`);
                                startChatStreamingPolling(responseId);
                            }
                        });
                    }
                } catch (error) {
                    console.error('[CHAT] Error checking queue for resume:', error);
                    // Fallback: just poll incomplete messages
                    incompleteMessages.forEach(msg => {
                        const responseId = msg.response_id || msg.message_id;
                        if (!chatPollingIntervals[responseId]) {
                            console.log(`[CHAT] Resuming polling for incomplete response: ${responseId}`);
                            startChatStreamingPolling(responseId);
                        }
                    });
                }
            }
            
            console.log(`[CHAT] Loaded session: ${sessionId}`);
        } else {
            showNotification('Failed to load chat session', 'Error', 'error');
        }
    } catch (error) {
        console.error('[CHAT] Error loading session:', error);
        showNotification('Error loading chat session', 'Error', 'error');
    } finally {
        isLoadingChatSession = false;
    }
}

function loadChatUI() {
    if (!currentChatSession) return;
    
    // Update title
    const chatTitle = document.getElementById('chatTitle');
    if (chatTitle) chatTitle.textContent = currentChatSession.chat_name;
    
    // Update model selector
    const modelSelector = document.getElementById('chatModelSelector');
    if (modelSelector) {
        modelSelector.value = currentChatSession.model;
        modelSelector.disabled = false;
    }
    
    // Update parameters
    document.getElementById('chatSessionName').value = currentChatSession.chat_name;
    document.getElementById('chatSystemPrompt').value = currentChatSession.system_prompt || '';
    document.getElementById('chatTemperature').value = currentChatSession.temperature || 0.7;
    document.getElementById('chatTopP').value = currentChatSession.top_p || 0.9;
    document.getElementById('chatTopK').value = currentChatSession.top_k || 40;
    document.getElementById('chatRepeatPenalty').value = currentChatSession.repeat_penalty || 1.1;
    document.getElementById('chatNumCtx').value = currentChatSession.num_ctx || 2048;
    document.getElementById('chatSeed').value = currentChatSession.seed || '';
    
    // Update value displays
    document.getElementById('chatTemperatureValue').textContent = currentChatSession.temperature || 0.7;
    document.getElementById('chatTopPValue').textContent = currentChatSession.top_p || 0.9;
    document.getElementById('chatTopKValue').textContent = currentChatSession.top_k || 40;
    document.getElementById('chatRepeatPenaltyValue').textContent = currentChatSession.repeat_penalty || 1.1;
    document.getElementById('chatNumCtxValue').textContent = currentChatSession.num_ctx || 2048;
    document.getElementById('chatSeedValue').textContent = currentChatSession.seed ? currentChatSession.seed : 'Random';
    
    // Enable all controls
    document.getElementById('chatSessionName').disabled = false;
    document.getElementById('chatSystemPrompt').disabled = false;
    document.getElementById('chatTemperature').disabled = false;
    document.getElementById('chatTopP').disabled = false;
    document.getElementById('chatTopK').disabled = false;
    document.getElementById('chatRepeatPenalty').disabled = false;
    document.getElementById('chatNumCtx').disabled = false;
    document.getElementById('chatSeed').disabled = false;
    document.getElementById('clearChatSeedBtn').disabled = false;
    
    const generateNameBtn = document.getElementById('generateSessionNameBtn');
    if (generateNameBtn) generateNameBtn.disabled = false;
    
    // Show input container
    const inputContainer = document.getElementById('chatInputContainer');
    if (inputContainer) inputContainer.style.display = 'flex';
}

function isScrolledToBottom(container, threshold = 50) {
    if (!container) return true;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    // Consider \"at bottom\" if within threshold pixels of bottom
    return scrollHeight - scrollTop - clientHeight < threshold;
}

function scrollToBottom(container) {
    if (!container) return;
    container.scrollTop = container.scrollHeight;
}

function setChatScrollButtonVisibility(visible) {
    const button = document.getElementById('chatScrollBottomBtn');
    if (!button) return;
    button.style.display = visible ? 'flex' : 'none';
}

function handleChatScroll() {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    if (!currentChatSession || currentChatSession.messages.length === 0) {
        chatAutoScrollEnabled = true;
        setChatScrollButtonVisibility(false);
        return;
    }
    const atBottom = isScrolledToBottom(container, 24);
    if (atBottom) {
        chatAutoScrollEnabled = true;
        setChatScrollButtonVisibility(false);
    } else {
        chatAutoScrollEnabled = false;
        setChatScrollButtonVisibility(true);
    }
}

function scrollChatToBottom() {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    scrollToBottom(container);
    chatAutoScrollEnabled = true;
    setChatScrollButtonVisibility(false);
}

async function renderChatMessages() {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) return;

    if (!currentChatSession || currentChatSession.messages.length === 0) {
        messagesContainer.innerHTML = `
            <div class="chat-empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <h3>Start the conversation</h3>
                <p>Type a message below to begin chatting</p>
            </div>
        `;
        // Clear token count display and context bar
        const tokenDisplay = document.getElementById('chatTotalTokens');
        if (tokenDisplay) tokenDisplay.textContent = '';
        const contextBar = document.getElementById('chatContextBar');
        if (contextBar) contextBar.style.width = '0%';
        const contextLabel = document.getElementById('chatContextLabel');
        if (contextLabel) contextLabel.textContent = '';
        chatAutoScrollEnabled = true;
        setChatScrollButtonVisibility(false);
        return;
    }
    
    // Get queue status to check for queued/generating AI responses only
    const queueStatus = await getQueueStatus();
    const allJobs = [...(queueStatus.queue || []), queueStatus.active].filter(Boolean);
    const chatJobsInQueue = allJobs.filter(job => 
        job.job_type === 'chat' && job.session_id === currentChatSession.session_id
    );
    
    messagesContainer.innerHTML = '';
    currentChatSession.messages.forEach((message, index) => {
        // Only show loading bubbles for AI responses (not user messages)
        let isLoading = false;
        if (message.role === 'assistant') {
            // Check if this AI response is still queued/generating
            const isQueued = chatJobsInQueue.some(job => 
                job.response_id === message.response_id || job.response_id === message.message_id
            );
            isLoading = isQueued || (!message.completed && !message.content);
        }
        // User messages never show loading bubbles - they appear immediately
        
        // Check if this is the last message of its type
        const isLastUserMessage = message.role === 'user' && 
            index === currentChatSession.messages.map(m => m.role).lastIndexOf('user');
        const isLastAIMessage = message.role === 'assistant' && 
            index === currentChatSession.messages.length - 1;
        
        const messageEl = createChatMessageElement(message, isLoading, isLastUserMessage, isLastAIMessage);
        messagesContainer.appendChild(messageEl);
    });

    // Calculate and display total token count and context usage
    const totalTokens = calculateTotalTokens(currentChatSession.messages);
    const maxContext = currentChatSession.num_ctx || 2048;
    const contextUsage = (totalTokens / maxContext) * 100;
    
    const tokenDisplay = document.getElementById('chatTotalTokens');
    if (tokenDisplay) {
        tokenDisplay.textContent = `Total: ${totalTokens.toLocaleString()} tokens`;
    }
    
    // Update context progress bar
    const contextBar = document.getElementById('chatContextBar');
    const contextLabel = document.getElementById('chatContextLabel');
    if (contextBar && contextLabel) {
        contextBar.style.width = `${Math.min(contextUsage, 100)}%`;
        
        // Color code based on usage
        if (contextUsage < 70) {
            contextBar.style.backgroundColor = 'var(--success-color, #34d399)';
        } else if (contextUsage < 90) {
            contextBar.style.backgroundColor = 'var(--warning-color, #fbbf24)';
        } else {
            contextBar.style.backgroundColor = 'var(--error-color, #ff3b30)';
        }
        
        contextLabel.textContent = `${contextUsage.toFixed(1)}% of ${maxContext.toLocaleString()} context`;
    }

    if (chatAutoScrollEnabled) {
        scrollToBottom(messagesContainer);
        setChatScrollButtonVisibility(false);
    } else {
        setChatScrollButtonVisibility(true);
    }
}

function createChatMessageElement(message, isLoading = false, isLastUserMessage = false, isLastAIMessage = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${message.role}`;
    if (isLoading) messageDiv.classList.add('loading');
    
    // Use response_id for AI messages, message_id for user messages
    const messageId = message.response_id || message.message_id || '';
    const branchId = message.branch_id || '';
    messageDiv.dataset.messageId = messageId;
    messageDiv.dataset.branchId = branchId;
    
    const avatar = document.createElement('div');
    avatar.className = 'chat-message-avatar';
    avatar.textContent = message.role === 'user' ? 'U' : 'AI';
    
    // Create wrapper for name, time, and content
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-message-wrapper';
    
    // Create header with name, time, and token count
    const header = document.createElement('div');
    header.className = 'chat-message-header';
    const displayName = message.role === 'user' ? 'You' : 'Assistant';
    const tokenCount = estimateTokenCount(message.content || '');
    header.innerHTML = `
        <span class="chat-message-name">${displayName}</span>
        <span class="chat-message-meta">
            <span class="chat-message-tokens" title="Estimated tokens">${tokenCount} tokens</span>
            <span class="chat-message-time">${formatMessageTime(message.timestamp)}</span>
        </span>
    `;
    
    const content = document.createElement('div');
    content.className = 'chat-message-content';
    content.dataset.originalContent = message.content; // Store original content for edit cancel
    
    // Check if this is an error message
    const isError = message.error === true;
    
    if (isLoading) {
        content.innerHTML = `
            <div class="chat-loading-dots">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
            </div>
        `;
    } else {
        // Format message content (basic markdown support)
        const formattedContent = formatChatMessage(message.content);
        content.innerHTML = formattedContent;
        
        // Apply error styling if needed
        if (isError) {
            content.style.color = 'var(--error-color)';
        }
    }
    
    wrapper.appendChild(header);
    wrapper.appendChild(content);
    
    // Add audio player if message has TTS audio
    if (message.tts_audio) {
        const audioContainer = document.createElement('div');
        audioContainer.className = 'chat-message-audio';
        audioContainer.style.cssText = 'margin-top: 0.75rem; padding: 0.75rem; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-color);';
        audioContainer.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
                <span style="font-size: 0.875rem; color: var(--text-muted);">TTS Audio</span>
            </div>
            <audio controls style="width: 100%;">
                <source src="/outputs/${message.tts_audio}" type="audio/wav">
                Your browser does not support the audio element.
            </audio>
        `;
        wrapper.appendChild(audioContainer);
    }
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(wrapper);
    
    // Create button container for all action buttons
    const btnContainer = document.createElement('div');
    btnContainer.className = 'chat-message-actions';
    
    // Branch navigation arrows (show if message has siblings)
    if (!isLoading && branchId) {
        // Check for siblings by fetching from session data
        const siblings = getSiblingsForMessage(message);
        if (siblings.length > 1) {
            const currentIndex = siblings.findIndex(s => s.branch_id === branchId);
            const branchInfo = document.createElement('span');
            branchInfo.className = 'branch-indicator';
            branchInfo.textContent = `${currentIndex + 1}/${siblings.length}`;
            branchInfo.title = 'Branch ' + (currentIndex + 1) + ' of ' + siblings.length;
            btnContainer.appendChild(branchInfo);
            
            // Previous branch button
            if (currentIndex > 0) {
                const prevBtn = document.createElement('button');
                prevBtn.className = 'branch-nav-btn';
                prevBtn.title = 'Previous branch';
                prevBtn.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                `;
                prevBtn.onclick = () => switchToBranch(siblings[currentIndex - 1].branch_id);
                btnContainer.appendChild(prevBtn);
            }
            
            // Next branch button
            if (currentIndex < siblings.length - 1) {
                const nextBtn = document.createElement('button');
                nextBtn.className = 'branch-nav-btn';
                nextBtn.title = 'Next branch';
                nextBtn.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                `;
                nextBtn.onclick = () => switchToBranch(siblings[currentIndex + 1].branch_id);
                btnContainer.appendChild(nextBtn);
            }
        }
    }
    
    // Copy button on all messages
    if (!isLoading && message.content) {
        const copyBtn = document.createElement('button');
        copyBtn.className = 'chat-action-btn';
        copyBtn.title = 'Copy message';
        copyBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
        `;
        copyBtn.onclick = () => copyChatMessage(message.content, copyBtn);
        btnContainer.appendChild(copyBtn);
        
        // Send to TTS button - navigates to TTS tab with text
        const sendTTSBtn = document.createElement('button');
        sendTTSBtn.className = 'chat-action-btn';
        sendTTSBtn.title = 'Send to TTS tab';
        sendTTSBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
        `;
        sendTTSBtn.onclick = () => sendToTTS(message.content);
        btnContainer.appendChild(sendTTSBtn);
        
        // TTS Now button - queues immediately with current settings
        const ttsNowBtn = document.createElement('button');
        ttsNowBtn.className = 'chat-action-btn';
        ttsNowBtn.title = 'Generate TTS now';
        ttsNowBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
        `;
        // Pass both text and message ID to ttsNow
        ttsNowBtn.onclick = () => ttsNow(message.content, messageId);
        btnContainer.appendChild(ttsNowBtn);
        
        // Edit button on all messages
        const editBtn = document.createElement('button');
        editBtn.className = 'chat-action-btn';
        editBtn.title = 'Edit message';
        editBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
        `;
        const messageIndex = currentChatSession?.messages.findIndex(m => 
            (m.message_id && m.message_id === messageId) || 
            (m.response_id && m.response_id === message.response_id)
        );
        editBtn.onclick = () => editChatMessage(messageDiv, messageIndex);
        btnContainer.appendChild(editBtn);
        
        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'chat-action-btn';
        deleteBtn.title = 'Delete message';
        deleteBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
        `;
        deleteBtn.onclick = () => deleteChatMessage(messageIndex);
        btnContainer.appendChild(deleteBtn);
    }
    
    // Add button container to message if it has any buttons
    if (btnContainer.children.length > 0) {
        wrapper.appendChild(btnContainer);
    }
    
    return messageDiv;
}

// Helper function to get siblings for a message
function getSiblingsForMessage(message) {
    if (!currentChatSession || !message) return [];
    
    const parentId = message.parent_id;
    const siblings = [];
    
    // Find all messages with same parent_id
    for (const msg of currentChatSession.messages) {
        if (msg.parent_id === parentId && msg.branch_id) {
            siblings.push({
                branch_id: msg.branch_id,
                message_id: msg.message_id || msg.response_id,
                content: msg.content
            });
        }
    }
    
    return siblings;
}

// Switch to a different branch
async function switchToBranch(branchId) {
    if (!currentChatSession || !branchId) return;
    
    try {
        const response = await fetch('/api/chat/branch/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: currentChatSession.session_id,
                branch_id: branchId
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to switch branch');
        }
        
        const result = await response.json();
        if (result.success) {
            // Update active path
            currentBranchPath = result.active_path || [];
            
            // Reload session to get updated messages
            await selectChatSession(currentChatSession.session_id, true);
            
            showNotification('Switched to alternate branch', 'Success', 'success');
        }
    } catch (error) {
        console.error('[BRANCH] Error switching branch:', error);
        showNotification('Failed to switch branch: ' + error.message, 'Error', 'error');
    }
}

function formatChatMessage(text) {
    if (!text) return '';
    
    // Trim whitespace to prevent blank lines at start/end
    text = text.trim();
    
    // Escape HTML
    let formatted = escapeHtml(text);
    
    // Convert markdown-style code blocks
    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code class="language-${lang || ''}">${code}</code></pre>`;
    });
    
    // Convert inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Convert line breaks to <br>
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
}

// Make globally accessible
window.formatChatMessage = formatChatMessage;

// Estimate token count for text (rough approximation)
function estimateTokenCount(text) {
    if (!text) return 0;
    
    // Remove extra whitespace
    const cleaned = text.trim().replace(/\s+/g, ' ');
    
    // Rough estimation: ~1.3 tokens per word for English text
    // This accounts for punctuation, common words, etc.
    const words = cleaned.split(' ').length;
    const estimated = Math.ceil(words * 1.3);
    
    return estimated;
}

// Calculate total token count for all messages in session
function calculateTotalTokens(messages) {
    if (!messages || !Array.isArray(messages)) return 0;
    
    return messages.reduce((total, msg) => {
        return total + estimateTokenCount(msg.content || '');
    }, 0);
}

function formatMessageTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function sendChatMessage(messageText = null) {
    console.log('[CHAT] sendChatMessage called - currentChatSession:', currentChatSession);
    
    if (!currentChatSession) {
        console.error('[CHAT] No current session');
        showNotification('Please select or create a chat session', 'Info', 'warning');
        return;
    }
    
    const chatInput = document.getElementById('chatInput');
    const message = messageText || chatInput.value.trim();
    
    if (!message) {
        console.log('[CHAT] No message to send');
        return;
    }
    
    const sessionId = currentChatSession.session_id;
    
    if (!sessionId) {
        console.error('[CHAT] Current session has no session_id:', currentChatSession);
        showNotification('Invalid session. Please select or create a chat session', 'Error', 'error');
        currentChatSession = null;
        chatAutoScrollEnabled = true;
        setChatScrollButtonVisibility(false);
        return;
    }
    
    console.log('[CHAT] Sending message - sessionId:', sessionId, 'message:', message);
    
    // Clear input
    chatInput.value = '';
    chatInput.style.height = 'auto';
    
    // Disable input while sending
    chatInput.disabled = true;
    const sendBtn = document.getElementById('chatSendBtn');
    if (sendBtn) sendBtn.disabled = true;
    
    try {
        // Send message to API
        const payload = {
            session_id: sessionId,
            message: message
        };
        console.log('[CHAT] Sending payload:', payload);
        
        const response = await fetch('/api/chat/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        console.log('[CHAT] Response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[CHAT] Server error:', response.status, errorText);
            throw new Error(`Server returned ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        console.log('[CHAT] Response data:', data);
        
        if (data.success) {
            console.log('[CHAT] Message queued, response_id:', data.response_id);
            
            // Start polling immediately - it will sync messages from backend and update DOM
            // This approach ensures backend is source of truth and avoids local/remote conflicts
            startChatStreamingPolling(data.response_id);
        } else {
            console.error('[CHAT] Failed to send message:', data.error || 'Unknown error');
            showNotification(data.error || 'Failed to send message', 'Error', 'error');
            
            // Reload session to remove any partially added messages (only if session still exists)
            if (currentChatSession && currentChatSession.session_id) {
                await selectChatSession(currentChatSession.session_id, true);
            }
        }
    } catch (error) {
        console.error('[CHAT] Error sending message:', error);
        showNotification('Error sending message: ' + error.message, 'Error', 'error');
        
        // Reload session to ensure consistent state (only if session still exists)
        if (currentChatSession && currentChatSession.session_id) {
            await selectChatSession(currentChatSession.session_id, true);
        }
    } finally {
        // Re-enable input
        chatInput.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        chatInput.focus();
    }
}

async function deleteChatMessage(messageIndex) {
    if (!currentChatSession || messageIndex === -1) return;
    
    const message = currentChatSession.messages[messageIndex];
    if (!message) return;
    
    // Show confirmation dialog
    const confirmed = await showConfirm(
        'Are you sure you want to delete this message? This action cannot be undone.',
        'Delete Message'
    );
    
    if (!confirmed) return;
    
    try {
        // Remove message from array
        currentChatSession.messages.splice(messageIndex, 1);
        
        // Save to backend
        const response = await fetch(`/api/chat/sessions/${currentChatSession.session_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: currentChatSession.messages
            })
        });
        
        const data = await response.json();
        if (data.success) {
            currentChatSession = data.session;
            await renderChatMessages();
            showNotification('Message deleted', 'Success', 'success');
        } else {
            showNotification('Failed to delete message', 'Error', 'error');
        }
    } catch (error) {
        console.error('[CHAT] Error deleting message:', error);
        showNotification('Error deleting message', 'Error', 'error');
    }
}

function editChatMessage(messageDiv, messageIndex) {
    if (!currentChatSession || messageIndex === -1) return;
    
    const message = currentChatSession.messages[messageIndex];
    if (!message) return;
    
    const contentEl = messageDiv.querySelector('.chat-message-content');
    const originalContent = message.content;
    
    // Create editable textarea
    const textarea = document.createElement('textarea');
    textarea.className = 'chat-edit-textarea';
    textarea.value = originalContent;
    textarea.style.width = '100%';
    textarea.style.minHeight = '200px';
    textarea.style.maxHeight = '60vh';
    textarea.style.background = 'var(--bg-secondary)';
    textarea.style.border = '1px solid var(--border-color)';
    textarea.style.borderRadius = '8px';
    textarea.style.padding = '0.75rem';
    textarea.style.color = 'var(--text-primary)';
    textarea.style.fontFamily = 'inherit';
    textarea.style.fontSize = 'inherit';
    textarea.style.resize = 'vertical';
    textarea.style.lineHeight = '1.5';
    
    // Create action buttons
    const actionsDiv = document.createElement('div');
    actionsDiv.style.display = 'flex';
    actionsDiv.style.gap = '0.5rem';
    actionsDiv.style.marginTop = '0.5rem';
    
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.className = 'btn btn-primary';
    saveBtn.style.fontSize = '0.875rem';
    saveBtn.style.padding = '0.375rem 0.75rem';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.style.fontSize = '0.875rem';
    cancelBtn.style.padding = '0.375rem 0.75rem';
    
    actionsDiv.appendChild(saveBtn);
    actionsDiv.appendChild(cancelBtn);
    
    // Replace content with textarea
    const originalHTML = contentEl.innerHTML;
    contentEl.innerHTML = '';
    contentEl.appendChild(textarea);
    contentEl.appendChild(actionsDiv);
    
    // Hide action buttons temporarily and add editing class
    const btnContainer = messageDiv.querySelector('.chat-message-actions');
    if (btnContainer) btnContainer.style.display = 'none';
    messageDiv.classList.add('editing');
    
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    
    // Cancel handler
    cancelBtn.onclick = () => {
        contentEl.innerHTML = originalHTML;
        if (btnContainer) btnContainer.style.display = '';
        messageDiv.classList.remove('editing');
    };
    
    // Save handler
    saveBtn.onclick = async () => {
        const newContent = textarea.value.trim();
        if (!newContent) {
            showNotification('Message cannot be empty', 'Error', 'error');
            return;
        }
        
        if (newContent === originalContent) {
            cancelBtn.onclick();
            return;
        }
        
        // Update message content
        currentChatSession.messages[messageIndex].content = newContent;
        
        // Save to backend
        try {
            const response = await fetch(`/api/chat/sessions/${currentChatSession.session_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: currentChatSession.messages
                })
            });
            
            const data = await response.json();
            if (data.success) {
                currentChatSession = data.session;
                await renderChatMessages();
                showNotification('Message updated', 'Success', 'success');
            } else {
                showNotification('Failed to update message', 'Error', 'error');
            }
        } catch (error) {
            console.error('[CHAT] Error updating message:', error);
            showNotification('Error updating message', 'Error', 'error');
        }
    };
}

async function refreshCurrentSession() {
    if (!currentChatSession) return false;
    
    try {
        const response = await fetch(`/api/chat/sessions/${currentChatSession.session_id}`);
        const data = await response.json();
        
        if (data.success) {
            currentChatSession = data.session;
            await renderChatMessages();
            return true;
        }
        console.error('[CHAT] Failed to refresh session:', data.error);
        return false;
    } catch (error) {
        console.error('[CHAT] Error refreshing session:', error);
        return false;
    }
}

function startChatStreamingPolling(responseId) {
    if (!currentChatSession) return;
    
    // Clear existing polling for this response if any
    if (chatPollingIntervals[responseId]) {
        clearInterval(chatPollingIntervals[responseId]);
    }
    
    const sessionId = currentChatSession.session_id;
    let lastContent = '';
    let pollCount = 0;
    const startTime = Date.now();
    const MAX_POLL_DURATION = 10 * 60 * 1000; // 10 minutes timeout
    
    const pollSession = async () => {
        pollCount++;
        
        // Check timeout
        if (Date.now() - startTime > MAX_POLL_DURATION) {
            console.error('[CHAT] Polling timeout for response:', responseId);
            if (chatPollingIntervals[responseId]) {
                clearInterval(chatPollingIntervals[responseId]);
                delete chatPollingIntervals[responseId];
            }
            // Show error in message
            const messagesContainer = document.getElementById('chatMessages');
            if (messagesContainer) {
                const messageEl = messagesContainer.querySelector(`[data-message-id="${responseId}"]`);
                if (messageEl) {
                    const contentEl = messageEl.querySelector('.chat-message-content');
                    if (contentEl) {
                        contentEl.innerHTML = '<span style="color: var(--error-color);">⚠ Response timeout - please try again</span>';
                        messageEl.classList.remove('loading');
                    }
                }
            }
            return;
        }
        
        try {
            const response = await fetch(`/api/chat/sessions/${sessionId}`);
            const data = await response.json();
            
            if (!data.success) {
                console.error('[CHAT] Failed to poll session');
                if (chatPollingIntervals[responseId]) {
                    clearInterval(chatPollingIntervals[responseId]);
                    delete chatPollingIntervals[responseId];
                }
                return;
            }
            
            const session = data.session;
            const message = session.messages.find(m => 
                m.message_id === responseId || m.response_id === responseId
            );
            
            if (!message) {
                console.warn(`[CHAT] Message ${responseId} not found in session`);
                return;
            }
            
            // CRITICAL: Always update to latest session from backend
            // This ensures we have ALL messages, not just the one we're polling
            const oldSession = currentChatSession;
            if (currentChatSession && currentChatSession.session_id === sessionId) {
                currentChatSession = session;
            }
            
            const currentContent = message.content || '';
            const contentChanged = currentContent !== lastContent;
            
            // Update DOM intelligently - sync all messages from backend without full re-render
            const messagesContainer = document.getElementById('chatMessages');
            if (messagesContainer) {
                // Get the message element for THIS response
                const messageEl = messagesContainer.querySelector(`[data-message-id="${responseId}"]`);
                
                if (messageEl) {
                    // Update this specific message's content
                    if (contentChanged || pollCount === 1) {
                        lastContent = currentContent;
                        
                        const contentEl = messageEl.querySelector('.chat-message-content');
                        if (contentEl) {
                            if (currentContent) {
                                // Has content - show formatted text
                                contentEl.innerHTML = formatChatMessage(currentContent);
                                messageEl.classList.remove('loading');
                                
                                // Update per-message token count during streaming
                                const headerTokenSpan = messageEl.querySelector('.chat-message-tokens');
                                if (headerTokenSpan) {
                                    const tokenCount = estimateTokenCount(currentContent);
                                    headerTokenSpan.textContent = `${tokenCount} tokens`;
                                }
                            } else {
                                // Still generating - show loading dots
                                contentEl.innerHTML = `
                                    <div class="chat-loading-dots">
                                        <div class="dot"></div>
                                        <div class="dot"></div>
                                        <div class="dot"></div>
                                    </div>
                                `;
                            }
                        }
                        
                        // Update token count and context bar during streaming
                        const totalTokens = calculateTotalTokens(currentChatSession.messages);
                        const maxContext = currentChatSession.num_ctx || 2048;
                        const contextUsage = (totalTokens / maxContext) * 100;
                        
                        const tokenDisplay = document.getElementById('chatTotalTokens');
                        if (tokenDisplay) {
                            tokenDisplay.textContent = `Total: ${totalTokens.toLocaleString()} tokens`;
                        }
                        
                        const contextBar = document.getElementById('chatContextBar');
                        const contextLabel = document.getElementById('chatContextLabel');
                        if (contextBar && contextLabel) {
                            contextBar.style.width = `${Math.min(contextUsage, 100)}%`;
                            
                            if (contextUsage < 70) {
                                contextBar.style.backgroundColor = 'var(--success-color, #34d399)';
                            } else if (contextUsage < 90) {
                                contextBar.style.backgroundColor = 'var(--warning-color, #fbbf24)';
                            } else {
                                contextBar.style.backgroundColor = 'var(--error-color, #ff3b30)';
                            }
                            
                            contextLabel.textContent = `${contextUsage.toFixed(1)}% of ${maxContext.toLocaleString()} context`;
                        }
                    }
                    
                    // Check for any NEW messages from backend that aren't in DOM yet
                    // This handles messages added to queue while we're streaming
                    const existingIds = new Set();
                    messagesContainer.querySelectorAll('[data-message-id]').forEach(el => {
                        existingIds.add(el.dataset.messageId);
                    });
                    
                    // Append any missing messages
                    currentChatSession.messages.forEach((msg, idx) => {
                        const msgId = msg.message_id || msg.response_id;
                        if (msgId && !existingIds.has(msgId)) {
                            console.log(`[CHAT] Adding missing message to DOM: ${msgId}`);
                            const isLoading = msg.role === 'assistant' && !msg.completed && !msg.content;
                            const msgEl = createChatMessageElement(msg, isLoading);
                            messagesContainer.appendChild(msgEl);
                        }
                    });
                    
                    if (chatAutoScrollEnabled) {
                        scrollToBottom(messagesContainer);
                        setChatScrollButtonVisibility(false);
                    }
                } else if (pollCount === 1) {
                    // Message element doesn't exist yet - full render needed
                    console.warn(`[CHAT] Message element not found for ${responseId}, doing full render`);
                    if (currentChatSession && currentChatSession.session_id === sessionId) {
                        await renderChatMessages();
                    }
                }
            }
            
            // Check if completed
            if (message.completed) {
                console.log('[CHAT] Response completed:', responseId);
                
                // Stop polling
                if (chatPollingIntervals[responseId]) {
                    clearInterval(chatPollingIntervals[responseId]);
                    delete chatPollingIntervals[responseId];
                }
                
                // Reload session list to update order (most recent first)
                loadChatSessions();
                
                // Auto-generate title if enabled and this is the first response
                const autoGenerateCheckbox = document.getElementById('chatAutoGenerateTitle');
                if (autoGenerateCheckbox && autoGenerateCheckbox.checked) {
                    // Use session data from response (always fresh, works even if chat tab isn't open)
                    const sessionData = data.session;
                    if (sessionData && sessionData.messages) {
                        // Count how many assistant messages exist (completed ones)
                        const completedAssistantMessages = sessionData.messages.filter(
                            m => m.role === 'assistant' && m.completed
                        ).length;
                        
                        // If this is the first completed assistant response, auto-generate title
                        if (completedAssistantMessages === 1) {
                            console.log('[CHAT] Auto-generating title for first response in session:', sessionId);
                            setTimeout(() => {
                                // Call generate with specific session ID (works even if chat tab isn't active)
                                generateSessionNameForSession(sessionId);
                            }, 500); // Small delay to ensure session is updated
                        }
                    }
                }
                
                // CRITICAL FIX: Re-create message element to show action buttons
                // The buttons only appear when !isLoading in createChatMessageElement
                const messagesContainer = document.getElementById('chatMessages');
                if (messagesContainer && currentChatSession) {
                    const messageEl = messagesContainer.querySelector(`[data-message-id="${responseId}"]`);
                    if (messageEl) {
                        // Find the message in the session by response_id or message_id
                        const msg = currentChatSession.messages.find(m => 
                            m.response_id === responseId || m.message_id === responseId
                        );
                        
                        if (msg) {
                            // Re-create the message element with buttons (isLoading = false)
                            const newMessageEl = createChatMessageElement(msg, false);
                            messageEl.replaceWith(newMessageEl);
                            
                            console.log('[CHAT] Message element re-created with action buttons for:', responseId);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[CHAT] Polling error:', error);
        }
    };
    
    // Poll every 500ms
    chatPollingIntervals[responseId] = setInterval(pollSession, 500);
    pollSession(); // Initial poll
}

async function updateCurrentSessionModel() {
    if (!currentChatSession) return;
    
    const modelSelector = document.getElementById('chatModelSelector');
    const newModel = modelSelector.value;
    const sessionId = currentChatSession.session_id;
    
    try {
        const response = await fetch(`/api/chat/sessions/${sessionId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: newModel })
        });
        
        const data = await response.json();
        if (data.success) {
            // Reload the full session to ensure consistency
            await selectChatSession(sessionId, true);
            showNotification('Model updated', 'Success', 'success');
        } else {
            showNotification('Failed to update model', 'Error', 'error');
        }
    } catch (error) {
        console.error('[CHAT] Error updating model:', error);
        showNotification('Error updating model', 'Error', 'error');
    }
}

async function autoSaveChatParameters() {
    if (!currentChatSession) return;
    
    const sessionId = currentChatSession.session_id;
    if (!sessionId) return;
    
    try {
        const seedValue = document.getElementById('chatSeed').value;
        const updates = {
            chat_name: document.getElementById('chatSessionName').value,
            system_prompt: document.getElementById('chatSystemPrompt').value,
            temperature: parseFloat(document.getElementById('chatTemperature').value),
            top_p: parseFloat(document.getElementById('chatTopP').value),
            top_k: parseInt(document.getElementById('chatTopK').value),
            repeat_penalty: parseFloat(document.getElementById('chatRepeatPenalty').value),
            num_ctx: parseInt(document.getElementById('chatNumCtx').value),
            seed: seedValue ? parseInt(seedValue) : null
        };
        
        const response = await fetch(`/api/chat/sessions/${sessionId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        
        const data = await response.json();
        if (data.success) {
            // Update currentChatSession with fresh data from server
            currentChatSession = data.session;
            
            // Update title in chat header
            const chatTitle = document.getElementById('chatTitle');
            if (chatTitle) {
                chatTitle.textContent = currentChatSession.chat_name;
            }
            
            // Update session in local array for immediate UI refresh
            const sessionIndex = chatSessions.findIndex(s => s.session_id === currentChatSession.session_id);
            if (sessionIndex !== -1) {
                chatSessions[sessionIndex] = currentChatSession;
            }
            
            // Re-render session list to show updated name
            renderChatSessions();
            
            console.log('[CHAT] Parameters auto-saved');
        } else {
            console.error('[CHAT] Failed to auto-save parameters');
        }
    } catch (error) {
        console.error('[CHAT] Error auto-saving parameters:', error);
    }
}

async function generateSessionNameForSession(sessionId) {
    // Generate name for any session by ID (works even if not currently active)
    console.log('[CHAT] Auto-generating title for session:', sessionId);
    
    try {
        const response = await fetch('/api/chat/generate_name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            console.log('[CHAT] Auto-generate request sent for session:', sessionId);
            // Sessions will be reloaded automatically when the title is generated
        } else {
            console.error('[CHAT] Failed to auto-generate title:', data.error);
        }
    } catch (error) {
        console.error('[CHAT] Error auto-generating title:', error);
    }
}

async function generateSessionName() {
    if (!currentChatSession) return;
    
    const sessionId = currentChatSession.session_id;
    
    // Check if session has messages
    if (!currentChatSession.messages || currentChatSession.messages.length === 0) {
        showNotification('Add some messages first before generating a name', 'Info', 'warning');
        return;
    }
    
    const generateNameBtn = document.getElementById('generateSessionNameBtn');
    const originalHtml = generateNameBtn.innerHTML;
    
    try {
        // Disable button and show loading
        generateNameBtn.disabled = true;
        generateNameBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; animation: spin 1s linear infinite;">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
            </svg>
            Generating...
        `;
        
        const response = await fetch('/api/chat/generate_name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Generating session name...', 'Info', 'info');
            
            // Poll for completion
            const pollInterval = setInterval(async () => {
                try {
                    const statusResponse = await fetch(`/api/chat/sessions/${sessionId}`);
                    const statusData = await statusResponse.json();
                    
                    if (statusData.success) {
                        // Check if name changed from original
                        const newName = statusData.session.chat_name;
                        if (newName !== currentChatSession.chat_name) {
                            // Name was updated
                            currentChatSession.chat_name = newName;
                            const sessionNameInput = document.getElementById('chatSessionName');
                            if (sessionNameInput) sessionNameInput.value = newName;
                            
                            // Update session list
                            await loadChatSessions();
                            
                            clearInterval(pollInterval);
                            generateNameBtn.disabled = false;
                            generateNameBtn.innerHTML = originalHtml;
                            showNotification(`Session renamed to: ${newName}`, 'Success', 'success');
                        }
                    }
                } catch (error) {
                    console.error('[NAME_GEN] Polling error:', error);
                }
            }, 1000);
            
            // Timeout after 30 seconds
            setTimeout(() => {
                clearInterval(pollInterval);
                generateNameBtn.disabled = false;
                generateNameBtn.innerHTML = originalHtml;
            }, 30000);
        } else {
            showNotification(data.error || 'Failed to generate session name', 'Error', 'error');
            generateNameBtn.disabled = false;
            generateNameBtn.innerHTML = originalHtml;
        }
    } catch (error) {
        console.error('[NAME_GEN] Error:', error);
        showNotification('Error generating session name: ' + error.message, 'Error', 'error');
        generateNameBtn.disabled = false;
        generateNameBtn.innerHTML = originalHtml;
    }
}

async function deleteChatSession(sessionId) {
    const session = chatSessions.find(s => s.session_id === sessionId);
    if (!session) return;
    
    const confirmed = await showConfirm(`Delete chat "${session.chat_name}"?`, 'Confirm Delete');
    if (!confirmed) return;
    
    try {
        const response = await fetch(`/api/chat/sessions/${sessionId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // If we deleted the current session, clear it
            if (currentChatSession && currentChatSession.session_id === sessionId) {
                currentChatSession = null;
                chatAutoScrollEnabled = true;
                setChatScrollButtonVisibility(false);
                
                // Reset title and messages
                const chatTitle = document.getElementById('chatTitle');
                if (chatTitle) chatTitle.textContent = 'Select or create a chat';
            
                const chatMessages = document.getElementById('chatMessages');
                if (chatMessages) {
                    chatMessages.innerHTML = `
                        <div class="chat-empty-state">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            </svg>
                            <h3>Start a conversation</h3>
                            <p>Create a new chat or select an existing one from the sidebar</p>
                        </div>
                    `;
                }
                
                // Reset all parameters to default values with null checks
                const chatSessionName = document.getElementById('chatSessionName');
                if (chatSessionName) chatSessionName.value = '';
                
                const chatSystemPrompt = document.getElementById('chatSystemPrompt');
                if (chatSystemPrompt) chatSystemPrompt.value = '';
                
                const chatTemperature = document.getElementById('chatTemperature');
                if (chatTemperature) chatTemperature.value = 0.7;
                
                const chatTopP = document.getElementById('chatTopP');
                if (chatTopP) chatTopP.value = 0.9;
                
                const chatTopK = document.getElementById('chatTopK');
                if (chatTopK) chatTopK.value = 40;
                
                const chatRepeatPenalty = document.getElementById('chatRepeatPenalty');
                if (chatRepeatPenalty) chatRepeatPenalty.value = 1.1;
                
                const chatNumCtx = document.getElementById('chatNumCtx');
                if (chatNumCtx) chatNumCtx.value = 2048;
                
                // Reset value displays with null checks
                const chatTemperatureValue = document.getElementById('chatTemperatureValue');
                if (chatTemperatureValue) chatTemperatureValue.textContent = '0.7';
                
                const chatTopPValue = document.getElementById('chatTopPValue');
                if (chatTopPValue) chatTopPValue.textContent = '0.9';
                
                const chatTopKValue = document.getElementById('chatTopKValue');
                if (chatTopKValue) chatTopKValue.textContent = '40';
                
                const chatRepeatPenaltyValue = document.getElementById('chatRepeatPenaltyValue');
                if (chatRepeatPenaltyValue) chatRepeatPenaltyValue.textContent = '1.1';
                
                const chatNumCtxValue = document.getElementById('chatNumCtxValue');
                if (chatNumCtxValue) chatNumCtxValue.textContent = '2048';
                
                // Disable all controls with null checks
                if (chatSessionName) chatSessionName.disabled = true;
                if (chatSystemPrompt) chatSystemPrompt.disabled = true;
                if (chatTemperature) chatTemperature.disabled = true;
                if (chatTopP) chatTopP.disabled = true;
                if (chatTopK) chatTopK.disabled = true;
                if (chatRepeatPenalty) chatRepeatPenalty.disabled = true;
                if (chatNumCtx) chatNumCtx.disabled = true;
                
                const modelSelector = document.getElementById('chatModelSelector');
                if (modelSelector) modelSelector.disabled = true;
                
                const generateNameBtn = document.getElementById('generateSessionNameBtn');
                if (generateNameBtn) generateNameBtn.disabled = true;
                
                // Hide input container
                const chatInputContainer = document.getElementById('chatInputContainer');
                if (chatInputContainer) chatInputContainer.style.display = 'none';
            }
            
            // Reload sessions to update the list
            await loadChatSessions();
            
            showNotification('Chat session deleted', 'Success', 'success');
        } else {
            showNotification(data.error || 'Failed to delete session', 'Error', 'error');
        }
    } catch (error) {
        console.error('[CHAT] Error deleting session:', error);
        showNotification('Error deleting session: ' + error.message, 'Error', 'error');
    }
}

function toggleChatSidebar() {
    const sidebar = document.getElementById('chatSessionsSidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
    }
}

function toggleChatParams() {
    const sidebar = document.getElementById('chatParamsSidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
    }
}

// ============================================================================
// DUPLICATE CHAT SESSION
// ============================================================================

function openDuplicateChatModal(sessionId) {
    const modal = document.getElementById('duplicateChatModal');
    const sessionIdInput = document.getElementById('duplicateChatSessionId');
    
    if (modal && sessionIdInput) {
        sessionIdInput.value = sessionId;
        // Reset checkboxes to defaults
        document.getElementById('duplicateChatSettings').checked = true;
        document.getElementById('duplicateChatMessages').checked = false;
        modal.style.display = 'flex';
    }
}

function closeDuplicateChatModal() {
    const modal = document.getElementById('duplicateChatModal');
    if (modal) modal.style.display = 'none';
}

async function confirmDuplicateChat() {
    const sessionId = document.getElementById('duplicateChatSessionId').value;
    const copySettings = document.getElementById('duplicateChatSettings').checked;
    const copyMessages = document.getElementById('duplicateChatMessages').checked;
    
    if (!sessionId) return;
    
    try {
        const response = await fetch(`/api/chat/sessions/${sessionId}/duplicate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                copy_settings: copySettings,
                copy_messages: copyMessages
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            closeDuplicateChatModal();
            await loadChatSessions();
            // Select the new duplicated session
            await selectChatSession(data.session.session_id);
            showNotification('Chat session duplicated', 'Success', 'success');
        } else {
            showNotification(data.error || 'Failed to duplicate session', 'Error', 'error');
        }
    } catch (error) {
        console.error('[CHAT] Error duplicating session:', error);
        showNotification('Error duplicating session: ' + error.message, 'Error', 'error');
    }
}

function copyChatMessage(text, buttonElement) {
    if (!text) return;
    
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showCopySuccess(buttonElement);
        }).catch(err => {
            console.error('Clipboard API failed:', err);
            fallbackCopyText(text, buttonElement);
        });
    } else {
        // Use fallback method
        fallbackCopyText(text, buttonElement);
    }
}

// Make globally accessible for other scripts (story.js, autochat.js)
window.copyChatMessage = copyChatMessage;

function fallbackCopyText(text, buttonElement) {
    // Create temporary textarea
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showCopySuccess(buttonElement);
        } else {
            console.error('Copy command failed');
        }
    } catch (err) {
        console.error('Fallback copy failed:', err);
    } finally {
        document.body.removeChild(textarea);
    }
}

// Make globally accessible
window.fallbackCopyText = fallbackCopyText;

function showCopySuccess(buttonElement) {
    if (!buttonElement) return; // Handle null/undefined button
    
    // Visual feedback
    const originalHTML = buttonElement.innerHTML;
    buttonElement.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
    `;
    buttonElement.style.color = 'var(--success)';
    
    // Reset after 2 seconds
    setTimeout(() => {
        buttonElement.innerHTML = originalHTML;
        buttonElement.style.color = '';
    }, 2000);
}

// Make globally accessible
window.showCopySuccess = showCopySuccess;

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make globally accessible
window.escapeHtml = escapeHtml;

// ============================================================================
// END CHAT SYSTEM
// ============================================================================

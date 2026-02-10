# Velvet Reverie - AI Agent Instructions

## Project Overview
Flask-based web UI for image/video generation with **password protection**, AI chat, interactive storytelling, text-to-speech, batch processing, queue management, multi-theme system, and organized file storage. **Requires ComfyUI server at `http://127.0.0.1:8188`**, **Ollama server at `http://127.0.0.1:11434`**, and **Gradio ChatterBox TTS at `http://127.0.0.1:7860`**. Core dependencies: Flask, psutil, pydub, mutagen, gradio_client (optional except Flask). Supports multiple workflows: Qwen (image), Wan2.2 I2V (video), Gradio ChatterBox (audio with 3 engines), and Ollama LLMs (chat/story).

**RECENT MAJOR CHANGES (2026-02-10):**
- **Frame Edit Tab**: Complete video-to-frames-to-AI-to-video workflow with 3-step collapsible UI
  - **Step 1 - Extract Frames**: Upload video → extract frames with time range/frame skip controls → saves to `input/frame_edit/[folder]_[fps]fps/`
  - **Step 2 - Process Frames**: Batch AI processing of all extracted frames with image-to-image generation → saves to `outputs/images/frame_edit/[folder]/`
  - **Step 3 - Stitch Video**: Select folder (from input or output) → FFmpeg stitches frames back to video → saves to `outputs/videos/frame_edit/`
  - **FPS Auto-Detection**: Parses folder names using regex `(\d+(?:\.\d+)?)fps` to auto-fill stitching FPS
  - **Dual Source Support**: Can stitch from input folders (extracted frames) or output folders (AI-processed frames)
  - **FFmpeg Integration**: Uses absolute paths for file lists to avoid "No such file" errors
  - **Metadata Tracking**: Video metadata includes source folder, frame count, and FPS (stored via `source_image` field)
- **Dual Sidebar Layout**: Complete UI restructure with collapsible tabs sidebar on left and queue sidebar on right
  - **Three-Column Layout**: `.tabs-sidebar` (left, 260px → 40px collapsed), `.main-content` (center, dynamic), `.queue-sidebar` (right, 320px → 40px collapsed)
  - **Vertical Tab Navigation**: All 14 tabs moved from horizontal top bar to left sidebar with groupings (Images, Videos, Browsers, Chats, Audio)
  - **Mobile Backdrop System**: `.sidebar-backdrop` dims main content when sidebars open on mobile (≤768px), prevents body scroll
  - **Mobile Toggle Buttons**: Hamburger menu (☰) for tabs sidebar, list icon for queue sidebar in header (visible only on mobile)
  - **Auto-Close on Mobile**: Tabs sidebar automatically collapses after tab selection on mobile for better UX
  - **Desktop Collapse**: Width-based transitions on desktop (not transform), smooth CSS animations
  - **Header Reorganization**: Mobile menu → Theme selector → Unload models → Logout → Mobile queue buttons
  - **Safe Area Support**: iOS notch support with `env(safe-area-inset-*)` for proper spacing

**PREVIOUS MAJOR CHANGES (2026-02-09):**
- **Dynamic Theme Icons**: Theme-specific icons that update based on selected theme
  - **Individual Theme Icons**: Each theme has its own icon file in `static/assets/` (velvet_icon.png, dark_icon.png, light_icon.png, ocean_icon.png, sunset_icon.png)
  - **Auto-Update System**: Header icon and favicon dynamically change when user switches themes
  - **Light Theme Exception**: Light theme uses dark_icon.png for better visibility on light backgrounds
  - **Icon Implementation**: `applyTheme()` function updates `#themeIcon` src based on selected theme
  - **Favicon Update**: Browser favicon uses velvet_icon.png (default theme icon)
  - **Login Page**: Login screen also uses velvet_icon.png for consistent branding
- **TTS Integration Buttons**: All message tabs (Chat, Story, Auto Chat) now have TTS action buttons
  - **Send to TTS Button**: Speaker icon navigates to TTS tab with message content pre-filled
  - **Generate TTS Now Button**: Play icon immediately queues TTS generation with current settings
  - **Wrapper Functions**: Index-based retrieval from session data (sendStoryToTTS, storyTTSNow, sendAutochatToTTS, autochatTTSNow)
  - **Consistent Functionality**: Same behavior across all three message tabs using global sendToTTS() and ttsNow() functions
  - **Button Positioning**: Placed between Copy and Edit buttons in message action row

**PREVIOUS MAJOR CHANGES (2026-02-08):**
- **Complete Rebranding**: Application renamed from "ComfyUI Web Interface" to **Velvet Reverie**
  - **Updated Branding**: All UI text, login pages, and documentation updated
  - **Theme Icons**: Individual icon files for each theme in `static/assets/` (velvet_icon.png, dark_icon.png, light_icon.png, ocean_icon.png, sunset_icon.png)
  - **Favicon**: Browser favicon uses velvet_icon.png for default branding
  - **Default File Prefix**: Changed from "comfyui" to "velvet"
  - **Consistent Naming**: Updated across all files (templates, Python, JavaScript, JSON configs)
- **Multi-Theme System**: Complete theme customization with 5 beautiful color schemes
  - **5 Themes**: Velvet (default), Dark, Light, Ocean, Sunset
  - **Theme Selector**: Dropdown in top bar (between title and logout button)
  - **Persistent Selection**: Theme choice saved to localStorage
  - **CSS Variables**: Each theme uses CSS custom properties for complete color control
  - **Responsive Design**: Theme selector works on all screen sizes
  - **Dark/Light Support**: Proper contrast and readability across all themes
  - **Velvet Theme Colors**: Deep purple palette (#1d0632, #412355, #472061) for luxurious aesthetic

**PREVIOUS MAJOR CHANGES (2026-02-07):**
- **TTS Backend Migration**: Replaced ComfyUI TTSVibe with Gradio ChatterBox API for text-to-speech
  - **Three Engines**: ChatterboxTTS (Standard), Chatterbox Multilingual, Chatterbox Turbo
  - **New Client**: `gradio_tts_client.py` - Gradio API client with engine loading/unloading
  - **Enhanced Parameters**: Temperature, exaggeration, CFG weight, chunk size, language selection, repetition penalty, emotion description
  - **Model Unloading**: Integrated with ComfyUI/Ollama cleanup systems (auto and manual)
  - **Engine Selection**: Users can change TTS engine when regenerating sentences in Audio tab
  - **Required Parameters**: All Gradio unified API parameters handled (higgs_system_prompt, qwen_voice_description, qwen_ref_text, qwen_style_instruct, indextts2_emotion_description set to None for Chatterbox-only usage)
- **Auto Chat Feature**: NEW autonomous dual AI conversation system where two personas talk to each other automatically
  - **Dual Personas**: Configure two independent AI personas (A & B) with separate names, models, system prompts, and parameters
  - **Autonomous Conversations**: Personas alternate responses automatically until max_turns reached or manually stopped
  - **Manual Intervention**: User can inject messages as either persona during active conversations
  - **Flip Display**: Toggle to swap visual sides (left/right) without changing underlying data or persona identities
  - **SSE Streaming**: Real-time message streaming with 300ms polling for status updates
  - **Message Management**: Copy, edit, and delete any message with backend persistence
  - **Queue Integration**: Shows persona name and model in queue items instead of generic "AI ↔ AI"
  - **Session Persistence**: Full session storage with duplicate/delete capabilities
- **Token Counting**: Each message displays estimated token count (~1.3 tokens/word); total session tokens shown above messages area
- **Context Progress Bar**: Color-coded visual indicator shows context window usage in real-time (green <70%, yellow 70-90%, red >90%)
- **Live Context Updates**: Progress bar updates as messages stream in, showing percentage of num_ctx (2048 chat, 4096 story) used
- **Message Deletion**: Delete buttons added to all messages (user and AI) with confirmation dialog; updates backend immediately
- **Streaming Button Fix**: Action buttons (copy/edit/delete) now appear immediately when streaming completes (no reload needed)
- **Ollama Keep-Alive**: All chat/story requests use `keep_alive=-1` to keep models loaded indefinitely (no 5-minute auto-unload)
- **Hover Comparison Feature**: Image browser modal and fullscreen now support hover-based before/after comparison for i2i generations
- **Adjustable Comparison Radius**: Slider control (50-400px) to adjust the size of the circular reveal area
- **Inverted Comparison Mode**: "Show Input" toggle inverts which image is base vs revealed when hovering
- **Smart Comparison Logic**: Hover compare automatically enabled only when input image exists; takes precedence over standard toggle
- **Fullscreen Hover Compare**: Hover comparison works in both modal and fullscreen views with synced controls

**PREVIOUS CHANGES (2026-02-02):**
- **Queue Pause**: Pause button in queue header stops new jobs from starting (current job completes first); orange button with play icon when paused
- **Queue Reordering**: Drag and drop queued items OR use up/down arrow buttons to change execution order; mobile-friendly button controls
- **Input Image Preview**: Queue items with input images (i2i, video) show source image while queued/generating, then switch to output when complete
- **Session Management Redesign**: Chat and story sessions now have duplicate buttons alongside delete buttons in session list
- **Duplicate with Options**: Modal allows choosing to copy settings (system prompt, characters, lorebook) and/or messages
- **Custom Dialogs Everywhere**: All browser `confirm()` and `alert()` calls replaced with `showConfirm()` and `showAlert()` custom modals
- **Session Actions Container**: `.chat-session-actions` wraps duplicate + delete buttons with proper flex layout
- **Message UI Redesign**: Both chat and story tabs have consistent UI with circular avatars, name/time headers, and action buttons (copy/edit)
- **Edit Message Feature**: All messages (user and AI) can be edited in-place with large textarea (200px min, 60vh max, expands to 95% width)
- **No Regeneration**: Edit only changes text content, does not regenerate or modify conversation flow
- **Button Positioning**: User message buttons on left, AI message buttons on right, always visible (no hover)
- **Story Streaming Fix**: Story tab now updates individual messages during streaming instead of re-rendering entire chat (eliminates flickering)

**Key Features:**
- **Password Protection** - Session-based auth with remember me (30 days), SHA-256 password hashing
- **Media Type Folders** - Organized output structure: `images/`, `videos/`, `audio/`, `chats/`
- **Image Generation** - Text-to-image and image-to-image with Qwen Lightning (4-step)
- **Video Generation** - Image-to-video using Wan2.2 I2V workflow with optional NSFW mode
- **Frame Edit Workflow** - Complete video → frames → AI processing → video pipeline with 3-step UI (extract, process, stitch)
- **Text-to-Speech** - Batch audio generation with voice display, full text viewer, and download capabilities
- **Audio Downloads** - Individual sentence downloads and merged audio export for TTS batches
- **AI Chat** - Interactive chat with Ollama models (streaming SSE responses, session-based, indefinite model loading)
- **Story Mode** - Character-driven interactive storytelling with lorebook system (keyword-activated lore, character cards, user personas)
- **Auto Chat** - Dual AI autonomous conversations where two personas talk to each other automatically (flip display, manual intervention, SSE streaming)
- **Message Management** - Edit or delete any message (user or AI) in chat/story/autochat tabs; token counting per message and total
- **Chat to Chat** - Autonomous AI-to-AI conversations with two models (background threading)
- **Smart Model Switching** - Automatic model unloading when switching between workflows (ComfyUI ↔ Ollama)
- **Complete Model Cleanup** - Unloads ALL models after EVERY job completion with 5s wait to prevent RAM cramming
- **Video Batch** - Batch convert folders of images to videos with same settings
- **Hardware Monitor** - Real-time CPU/RAM/GPU/VRAM with color-coded bars
- **Image Browser** - Browse/organize images (separated from videos)
- **Video Browser** - Dedicated tab for viewing generated videos only
- **Audio Browser** - Manage TTS-generated audio files with voice labels
- **Reveal Browser** - Pairs input images with generated outputs (images only, videos removed)
- **Batch Mode** - CSV templates with `[parameter]` placeholders, folder-based batch processing
- **Mobile Optimized** - Collapsible UI, touch controls, responsive design
- **Queue System** - Persistent across restarts, thread-safe LIFO/FIFO, unified for all job types
- **Queue Pause** - Pause queue processing (finishes current job, then waits); orange button state when paused
- **Queue Reordering** - Drag and drop queued items to change execution order (cannot move below active/completed)
- **Persistent Chat Processing** - Chat/story responses save to session even if browser disconnects during generation
- **Multi-Theme System** - 5 customizable color themes (Velvet, Dark, Light, Ocean, Sunset) with persistent selection

## Multi-Theme System
**Implementation**: Complete theme customization using CSS variables with localStorage persistence.

**Theme Structure** (`static/style.css`):
```css
/* Theme: Velvet (Default) */
:root,
[data-theme="velvet"] {
    --bg-primary: #1d0632;
    --bg-secondary: #412355;
    --bg-tertiary: #472061;
    --bg-hover: #573275;
    --text-primary: #e8e0f5;
    --text-secondary: #b8a8d4;
    --text-muted: #8871a8;
    --accent-primary: #8b5cf6;
    --accent-hover: #a78bfa;
    --border-color: #5a3a7a;
    --success: #10b981;
    --warning: #f59e0b;
    --error: #ef4444;
    --shadow: rgba(0, 0, 0, 0.6);
}

/* Theme: Dark */
[data-theme="dark"] {
    --bg-primary: #0f0f0f;
    --bg-secondary: #1a1a1a;
    /* ... other colors */
}

/* Theme: Light */
[data-theme="light"] {
    --bg-primary: #ffffff;
    --bg-secondary: #f5f5f7;
    /* ... other colors */
}

/* Theme: Ocean */
[data-theme="ocean"] {
    --bg-primary: #0a1628;
    --bg-secondary: #132337;
    /* ... other colors */
}

/* Theme: Sunset */
[data-theme="sunset"] {
    --bg-primary: #2d1810;
    --bg-secondary: #3d2318;
    /* ... other colors */
}
```

**Theme Selector** (`templates/index.html`):
```html
<div class="theme-selector" style="margin-left: auto; margin-right: 0.75rem;">
    <select id="themeSelector" class="theme-dropdown" title="Change Theme">
        <option value="velvet">💜 Velvet</option>
        <option value="dark">🌙 Dark</option>
        <option value="light">☀️ Light</option>
        <option value="ocean">🌊 Ocean</option>
        <option value="sunset">🌅 Sunset</option>
    </select>
</div>
```

**Theme Management** (`static/script.js`):
```javascript
function initializeThemeSelector() {
    const themeSelector = document.getElementById('themeSelector');
    
    // Load saved theme from localStorage (default: velvet)
    const savedTheme = localStorage.getItem('selectedTheme') || 'velvet';
    applyTheme(savedTheme);
    themeSelector.value = savedTheme;
    
    // Listen for theme changes
    themeSelector.addEventListener('change', function() {
        const selectedTheme = this.value;
        applyTheme(selectedTheme);
        localStorage.setItem('selectedTheme', selectedTheme);
        
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
```

**Key Patterns:**
- **CSS Variables**: All colors use CSS custom properties for easy theme switching
- **Data Attribute**: Themes applied via `data-theme` attribute on `<html>` element
- **Persistence**: Theme choice saved to `localStorage.selectedTheme`
- **Default Theme**: Velvet is default if no saved preference exists
- **Responsive**: Theme selector dropdown styled consistently across all themes
- **Icons**: Emoji icons (💜 🌙 ☀️ 🌊 🌅) for visual theme identification
- **Theme Icon Files**: Individual PNG icons in `static/assets/` (velvet_icon.png, dark_icon.png, light_icon.png, ocean_icon.png, sunset_icon.png)
- **Dynamic Icons**: Header icon updates automatically when theme changes via `#themeIcon` element
- **Light Theme Special Case**: Light theme uses dark_icon.png for better contrast
- **Notifications**: Toast notification confirms theme change

**When Adding UI Elements:**
- Use CSS variables (`var(--bg-primary)`, `var(--text-primary)`, etc.)
- Never hardcode colors - always reference theme variables
- Test new elements across all 5 themes for readability
- Ensure sufficient contrast ratios for accessibility (especially Light theme)

## UI Layout Architecture (Dual Sidebar System)

**Three-Column Flexbox Layout** - Modern responsive design with collapsible panels on desktop and overlay panels on mobile.

### Desktop Layout (>768px)

**HTML Structure** (`templates/index.html`):
```html
<body>
    <!-- Mobile-only backdrop (hidden on desktop) -->
    <div class="sidebar-backdrop" id="sidebarBackdrop"></div>
    
    <!-- LEFT: Tabs Sidebar (260px → 40px collapsed) -->
    <div class="tabs-sidebar" id="tabsSidebar">
        <div class="tabs-sidebar-header">
            <h3>Navigation</h3>
            <button class="sidebar-toggle-btn" onclick="toggleTabs()" title="Toggle sidebar">
                <svg><!-- Chevron icon --></svg>
            </button>
        </div>
        <div class="tabs-sidebar-content">
            <!-- Tab groups with 14 tabs total -->
            <div class="tab-group">
                <div class="tab-group-title">Images</div>
                <button class="tab-btn" data-tab="single">Image</button>
                <button class="tab-btn" data-tab="batch">Text Batch</button>
                <button class="tab-btn" data-tab="image-batch">Image Batch</button>
            </div>
            <!-- ... more groups: Videos, Browsers, Chats, Audio -->
        </div>
    </div>
    
    <!-- CENTER: Main Content Area (dynamic width) -->
    <div class="main-content">
        <!-- Collapsible Header -->
        <header class="top-bar">
            <!-- Mobile menu button (visible only ≤768px) -->
            <button class="mobile-menu-btn" id="mobileMenuBtn" onclick="toggleTabs()">
                <svg><!-- Hamburger icon ☰ --></svg>
            </button>
            
            <!-- App title with icon -->
            <div class="title-container">
                <img id="themeIcon" src="/static/assets/velvet_icon.png" class="title-icon">
                <h1>Velvet Reverie</h1>
            </div>
            
            <!-- Theme selector dropdown -->
            <div class="theme-selector">
                <select id="themeSelector" class="theme-dropdown">
                    <option value="velvet">💜 Velvet</option>
                    <!-- ... other themes -->
                </select>
            </div>
            
            <!-- Unload models button -->
            <button class="unload-btn" id="unloadModelsBtn" onclick="unloadAllModels()">
                Unload All Models
            </button>
            
            <!-- Logout button -->
            <button class="logout-btn" onclick="logout()">Logout</button>
            
            <!-- Mobile queue button (visible only ≤768px) -->
            <button class="mobile-queue-btn" id="mobileQueueBtn" onclick="toggleQueue()">
                <svg><!-- List icon --></svg>
            </button>
        </header>
        
        <!-- Tab Content Areas (14 tabs) -->
        <div id="singleTab" class="tab-content active">
            <!-- Image generation UI -->
        </div>
        <!-- ... other 14 tabs -->
    </div>
    
    <!-- RIGHT: Queue Sidebar (320px → 40px collapsed) -->
    <div class="queue-sidebar collapsed" id="queueSidebar">
        <div class="queue-sidebar-header">
            <button class="sidebar-toggle-btn" onclick="toggleQueue()">
                <svg><!-- Chevron icon --></svg>
            </button>
            <h2>Queue</h2>
            <button class="pause-queue-btn" onclick="toggleQueuePause()">⏸</button>
            <button class="clear-queue-btn" onclick="clearQueue()">Clear</button>
        </div>
        <!-- Queue content -->
    </div>
</body>
```

**CSS Architecture** (`static/style.css`):
```css
/* Root flex container for three-column layout */
body {
    display: flex;
    min-height: 100vh;
    overflow: hidden;
    position: relative;
}

/* LEFT SIDEBAR: Tabs Navigation */
.tabs-sidebar {
    width: 260px;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-color);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: width 0.3s ease;
    z-index: 999;
}

.tabs-sidebar.collapsed {
    width: 40px; /* Only shows toggle button */
}

/* Tabs sidebar header with title and toggle button */
.tabs-sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
}

/* Scrollable tab content area */
.tabs-sidebar-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 1rem 0;
}

/* Tab group styling */
.tab-group {
    margin-bottom: 1.5rem;
}

.tab-group-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 0.5rem 1rem;
    margin-bottom: 0.25rem;
}

.tab-btn {
    width: 100%;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    text-align: left;
    color: var(--text-primary);
    cursor: pointer;
    border-left: 3px solid transparent;
    transition: all 0.2s ease;
}

.tab-btn:hover {
    background: var(--bg-hover);
    border-left-color: var(--accent-primary);
}

.tab-btn.active {
    background: var(--bg-tertiary);
    border-left-color: var(--accent-primary);
    color: var(--accent-primary);
    font-weight: 500;
}

/* CENTER: Main content area (dynamic width) */
.main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-primary);
}

/* RIGHT SIDEBAR: Queue */
.queue-sidebar {
    width: 320px;
    background: var(--bg-secondary);
    border-left: 1px solid var(--border-color);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: width 0.3s ease;
    z-index: 999;
}

.queue-sidebar.collapsed {
    width: 40px; /* Only shows toggle button */
}

/* Hide sidebar content when collapsed */
.tabs-sidebar.collapsed h3,
.tabs-sidebar.collapsed .tabs-sidebar-content,
.queue-sidebar.collapsed h2,
.queue-sidebar.collapsed .queue-content {
    display: none;
}

/* Mobile backdrop (hidden on desktop) */
.sidebar-backdrop {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
    z-index: 998;
    opacity: 0;
    transition: opacity 0.3s ease;
}
```

### Mobile Layout (≤768px)

**Transform-Based Overlays** - Sidebars slide over content instead of collapsing width:

```css
/* Mobile breakpoint */
@media (max-width: 768px) {
    body {
        flex-direction: column;
    }
    
    /* LEFT SIDEBAR: Slide from left */
    .tabs-sidebar {
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        width: 260px; /* Fixed width on mobile */
        transform: translateX(-100%);
        transition: transform 0.3s ease;
        z-index: 1000;
    }
    
    .tabs-sidebar.active {
        transform: translateX(0);
    }
    
    /* RIGHT SIDEBAR: Slide from right */
    .queue-sidebar {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: 320px; /* Fixed width on mobile */
        transform: translateX(100%);
        transition: transform 0.3s ease;
        z-index: 1000;
    }
    
    .queue-sidebar.active {
        transform: translateX(0);
    }
    
    /* Show backdrop when any sidebar is open */
    .sidebar-backdrop.active {
        display: block;
        opacity: 1;
    }
    
    /* Prevent body scroll when sidebar open */
    body.sidebar-open {
        overflow: hidden;
    }
    
    /* Mobile toggle buttons (visible only on mobile) */
    .mobile-menu-btn,
    .mobile-queue-btn {
        display: flex;
        padding: 0.5rem;
        background: transparent;
        border: none;
        color: var(--text-primary);
        cursor: pointer;
    }
    
    /* Hide desktop-only elements */
    .tabs-sidebar-header h3,
    .queue-sidebar-header h2 {
        display: none;
    }
    
    /* Safe area insets for notched devices (iOS) */
    .tabs-sidebar {
        padding-top: env(safe-area-inset-top);
    }
    
    .queue-sidebar {
        padding-top: env(safe-area-inset-top);
        padding-right: env(safe-area-inset-right);
    }
}

/* Desktop: Hide mobile buttons */
@media (min-width: 769px) {
    .mobile-menu-btn,
    .mobile-queue-btn {
        display: none;
    }
}
```

### JavaScript Sidebar Management (`static/script.js`)

**Toggle Functions** - Handles both desktop and mobile behaviors:

```javascript
// Toggle tabs sidebar (left)
function toggleTabs() {
    const sidebar = document.getElementById('tabsSidebar');
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
        // Mobile: Toggle .active class for transform animation
        sidebar.classList.toggle('active');
        updateMobileSidebarBackdrop();
    } else {
        // Desktop: Toggle .collapsed class for width animation
        sidebar.classList.toggle('collapsed');
    }
}

// Toggle queue sidebar (right)
function toggleQueue() {
    const sidebar = document.getElementById('queueSidebar');
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
        // Mobile: Toggle .active class
        sidebar.classList.toggle('active');
        updateMobileSidebarBackdrop();
    } else {
        // Desktop: Toggle .collapsed class
        sidebar.classList.toggle('collapsed');
    }
}

// Update backdrop visibility and body scroll lock
function updateMobileSidebarBackdrop() {
    const backdrop = document.getElementById('sidebarBackdrop');
    const tabsSidebar = document.getElementById('tabsSidebar');
    const queueSidebar = document.getElementById('queueSidebar');
    const isMobile = window.innerWidth <= 768;
    
    if (!isMobile) {
        backdrop.classList.remove('active');
        document.body.classList.remove('sidebar-open');
        return;
    }
    
    // Show backdrop if any sidebar is open
    const anyOpen = tabsSidebar.classList.contains('active') || 
                    queueSidebar.classList.contains('active');
    
    if (anyOpen) {
        backdrop.classList.add('active');
        document.body.classList.add('sidebar-open');
        document.body.style.overflow = 'hidden'; // Prevent body scroll
    } else {
        backdrop.classList.remove('active');
        document.body.classList.remove('sidebar-open');
        document.body.style.overflow = '';
    }
}

// Backdrop click closes all sidebars
document.getElementById('sidebarBackdrop')?.addEventListener('click', function() {
    document.getElementById('tabsSidebar').classList.remove('active');
    document.getElementById('queueSidebar').classList.remove('active');
    updateMobileSidebarBackdrop();
});

// Auto-close tabs sidebar after tab selection (mobile only)
function switchTab(tabName) {
    // ... tab switching logic ...
    
    // Close tabs sidebar on mobile after selection
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        document.getElementById('tabsSidebar').classList.remove('active');
        updateMobileSidebarBackdrop();
    }
}

// Initialize mobile overlay handling
function initializeMobileOverlay() {
    // Handle resize events to reset sidebar states
    window.addEventListener('resize', function() {
        const isMobile = window.innerWidth <= 768;
        const tabsSidebar = document.getElementById('tabsSidebar');
        const queueSidebar = document.getElementById('queueSidebar');
        
        if (!isMobile) {
            // Desktop: Remove mobile classes
            tabsSidebar.classList.remove('active');
            queueSidebar.classList.remove('active');
            updateMobileSidebarBackdrop();
        } else {
            // Mobile: Remove desktop collapsed classes
            tabsSidebar.classList.remove('collapsed');
            queueSidebar.classList.remove('collapsed');
        }
    });
}

// Call on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeMobileOverlay();
    // ... other initialization
});
```

**Global Backdrop Update Function** - Exposed for queue updates:

```javascript
// Expose globally for use in queue rendering
window.updateMobileSidebarBackdrop = updateMobileSidebarBackdrop;
```

### Key Patterns and Rules

**Desktop Behavior:**
- Sidebars collapse to 40px width (show only toggle button)
- Main content expands smoothly via flexbox
- Width-based transitions (`width: 260px` → `width: 40px`)
- No backdrop overlay
- Independent collapse states for each sidebar

**Mobile Behavior (≤768px):**
- Sidebars slide over content as fixed overlays
- Transform-based animations (`translateX(-100%)` → `translateX(0)`)
- `.active` class toggles visibility
- Backdrop dims main content when any sidebar open
- Body scroll locked when sidebars open (`overflow: hidden`)
- Auto-close tabs sidebar after tab selection
- Safe area insets for notched devices (iPhone X+)

**Theme Integration:**
- All colors use CSS variables (`var(--bg-primary)`, etc.)
- Sidebars respect active theme
- Border colors, backgrounds, hover states all theme-aware
- Tab active states use `--accent-primary` color

**Responsive Breakpoints:**
- `768px` - Primary mobile breakpoint (tablet/phone)
- `480px` - Secondary breakpoint for smaller phones

**Touch Optimization:**
- Minimum 44px tap targets
- Increased button spacing on mobile
- `-webkit-tap-highlight-color: transparent`
- `-webkit-overflow-scrolling: touch` for smooth scrolling

**State Management:**
- Desktop: `.collapsed` class on sidebar element
- Mobile: `.active` class on sidebar element
- Backdrop: `.active` class on `.sidebar-backdrop` element
- Body: `.sidebar-open` class when mobile sidebar active

**Critical Rules:**
1. Never mix width and transform approaches in same breakpoint
2. Always update backdrop state after sidebar toggles
3. Desktop uses `.collapsed`, mobile uses `.active`
4. Mobile menu buttons only visible ≤768px
5. Backdrop only active on mobile when sidebar open
6. Auto-close tabs sidebar on mobile after tab selection
7. Reset sidebar states on resize events
8. Both sidebars can be open simultaneously
9. Use `window.innerWidth <= 768` for mobile detection
10. Theme variables must be used for all colors

## Architecture (Four-Layer System)

**1. ComfyUI Client** (`comfyui_client.py`)  
Python stdlib wrapper (urllib, json). Three workflow types:
- **Images**: `Qwen_Full (API).json` - Node IDs: 45 (prompt), 32 (width), 31 (height), 36 (steps), 39 (CFG), 40 (shift), 35 (seed), 38 (use_image), 34 (use_image_size), 43 (image_filename), 41/42/33 (LoRAs)
- **Videos**: `Wan2.2 I2V (API).json` - Node IDs: 97 (LoadImage), 116:93 (prompt), 116:98 (frames), 116:116 (megapixels), 116:94 (fps), 116:86 (seed)
- **NSFW Videos**: `Wan2.2 I2V NSFW (API).json` - Same node structure as standard video workflow, uses NSFW models
- **CRITICAL**: Open all JSON files with `encoding='utf-8'` to handle Unicode characters on Windows

**1.5. Gradio TTS Client** (`gradio_tts_client.py`)  
Python Gradio client wrapper for ChatterBox TTS API. Connects to `http://127.0.0.1:7860`.
- **Three Engines**: Standard (ChatterboxTTS), Multilingual (Chatterbox Multilingual), Turbo (Chatterbox Turbo)
- **Methods**: `load_engine(engine_type)`, `unload_engine(engine_type)`, `unload_all_engines()`, `generate_tts()`, `health_check()`
- **Reference Audio**: Uses `handle_file()` from gradio_client to upload reference audio files
- **Parameters**: text, ref_audio_path, engine, audio_format (wav/mp3), exaggeration (0-2), temperature (0-2), cfg_weight (0-2), chunk_size (50-1000), seed, language (17 options), repetition_penalty, emotion_description
- **Unified API**: All 114 parameters handled - non-Chatterbox parameters set to None (higgs_system_prompt, qwen_voice_description, qwen_ref_text, qwen_style_instruct, indextts2_emotion_description)
- **Engine Tracking**: `current_engine` tracks loaded engine to avoid redundant loading

**2. Ollama Client** (`ollama_client.py`)  
Python stdlib wrapper (urllib, json) for Ollama API. Connects to `http://127.0.0.1:11434`.
- **Methods**: `health_check()`, `list_models()`, `chat()` (streaming support), `unload_all_models()`
- **Chat Streaming**: Generator-based with `stream=True` yields chunks for SSE
- **Model Management**: `unload_all_models()` called when switching to/from ComfyUI workflows

**3. Flask Backend** (`app.py`)  
Queue processor (LIFO display, FIFO execution), metadata storage, hardware monitoring, workflow type tracking. Serves on `0.0.0.0:4879`. Background daemon thread processes queue sequentially. **CRITICAL**: Unloads ALL models (ComfyUI + Ollama) after EVERY job completion with 5-second wait to prevent RAM cramming.

**Job Types in Queue:**
- `'image'` - Image generation (t2i or i2i)
- `'video'` - Video generation (standard or NSFW)
- `'tts'` - Text-to-speech batch processing
- `'chat'` - Single chat message (timer badge, streams via SSE, processes in background thread)
- `'autochat'` - Dual AI persona conversation turn (shows persona name and model, SSE streaming, auto-queues next turn)
**Workflow Type Tracking**: `last_workflow_type` global tracks current workflow ('image_t2i', 'image_i2i', 'video', 'video_nsfw', 'tts', 'chat:model_name'). Auto-unloads models when switching types.

**4. Frontend** (`templates/index.html`, `static/`)  
Vanilla JS SPA with **14 tabs** in order: **Image, Text Batch, Image Batch, Video, Video Batch, Frame Edit, Image Browser, Video Browser, Viewer, Chat, Story, Auto Chat, TTS, Audio**. **CRITICAL PATTERN**: Inline `onclick` handlers required for buttons in certain contexts (event listeners alone don't work). Mobile UI with collapsible sections. Custom modals (no browser dialogs). 1s polling for queue updates, 300ms polling for Auto Chat status.

**Tab Structure:**
```javascript
// Tab mapping in switchTab() function (script.js)
const tabs = {
    'single': 'singleTab',           // Image generation
    'batch': 'batchTab',             // Text Batch (CSV)
    'image-batch': 'imageBatchTab',  // Image Batch (folder processing)
    'browser': 'browserTab',         // Image Browser (images only)
    'video': 'videoTab',             // Video generation (single)
    'video-batch': 'videoBatchTab',  // Video Batch (folder to videos)
    'frame-edit': 'frameEditTab',    // Frame Edit (video → frames → AI → video)
    'videos': 'videosTab',           // Video Browser (videos only)
    'viewer': 'viewerTab',           // Viewer (special purpose)
    'chat': 'chatTab',               // AI Chat (Ollama streaming)
    'story': 'storyTab',             // Story Mode (character roleplay + lorebook)
    'autochat': 'autochatTab',       // Auto Chat (dual AI personas)
    'tts': 'ttsTab',                 // Text-to-Speech batch
    'audio': 'audioTab'              // Audio Browser
};
```

**Data Flow:**  
```
Image: User → Queue (front insert) → Thread (end pop, oldest first) → ComfyUI → PNG + Metadata
Video: User → Upload image → Queue → ComfyUI → MP4 + Metadata
Video Batch: User → Select folder → Queue (one job per image) → ComfyUI → MP4s in output folder
Chat: User → Queue → Background thread processes → Ollama (streaming) → Session storage → SSE to browser
Story: User → Queue → Background thread → Ollama (streaming) → Lorebook keyword matching → Session storage → SSE
Auto Chat: Start → Queue Persona A → Ollama (streaming) → Auto-queue Persona B → Alternating turns → SSE + 300ms polling
Chat2Chat: User → Queue → Background thread → Ollama (two models alternating) → Session polling → UI updates
TTS: User → Queue (batch) → Gradio ChatterBox API → WAV/MP3 files + Metadata
Reveal: Scans processed folders → Pairs input images with outputs (images only) → Fullscreen viewer
Image Browser: Shows images only, filters out videos → Gallery view
Video Browser: Shows videos only, filters out images → Gallery with play icons
Audio Browser: Shows audio files from TTS batches → Playback controls
```

## Critical Patterns

### Code Quality & Best Practices
**Import Management**: Only import what's actually used. Optional dependencies handled gracefully:
```python
# Conditional imports with fallbacks (app.py pattern)
try:
    from mutagen.mp3 import MP3
    MUTAGEN_AVAILABLE = True
except ImportError:
    MUTAGEN_AVAILABLE = False
    print("[AUDIO] Warning: mutagen not installed. MP3 duration will be estimated.")

# Later in code - check flag before using
if MUTAGEN_AVAILABLE:
    audio = MP3(file_path)
else:
    # Fallback estimation
```

**File I/O**: Always specify `encoding='utf-8'` for text files (critical on Windows):
```python
# CORRECT - Already implemented throughout codebase
with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)
```

**Type Safety**: Check for None before using optional values:
```python
# File upload validation (app.py pattern)
if not file or file.filename == '' or file.filename is None:
    return jsonify({'success': False, 'error': 'No selected file'}), 400
```

**Local vs Global Variables**: Define variables locally when possible to avoid undefined errors:
```python
# BAD - Global constant removed, always redefined
# COMFYUI_INPUT_DIR = Path('..') / 'comfy.git' / 'app' / 'input'  # Don't do this!

# GOOD - Define locally in each function that needs it
def serve_video_from_input(filepath):
    comfyui_input_dir = Path('..') / 'comfy.git' / 'app' / 'input'
    comfyui_input = comfyui_input_dir / filepath
```

### Password Protection System
**Authentication**: SHA-256 password hashing with Flask sessions and remember me cookies.

```python
# app.py - Password configuration (line ~22)
PASSWORD_HASH = "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8"  # "password"
# Generate new hash: hashlib.sha256("your_password".encode()).hexdigest()

# Authentication decorator protects routes
@require_auth
def protected_route():
    # Check session or remember me cookie
    # Return 401 if unauthorized
```

**Login Flow**:
1. Unauthenticated users see `templates/login.html`
2. Login via `POST /api/auth/login` with password + remember_me checkbox
3. Success → Session cookie + optional remember me cookie (30 days)
4. Frontend auto-redirects on 401 via global fetch wrapper

**Frontend Pattern**:
```javascript
// script.js - Global fetch interceptor
window.fetch = function(...args) {
    return originalFetch.apply(this, args).then(response => {
        if (response.status === 401) {
            window.location.href = '/';  // Redirect to login
            return Promise.reject(new Error('Unauthorized'));
        }
        return response;
    });
};
```

**Protected Endpoints**: All generation/queue/browse endpoints require `@require_auth` decorator.

### Media Type Folder Organization
**Output Structure**: Each media type has dedicated root folder with user subfolders nested inside.

```
outputs/
├── metadata.json          # Shared metadata
├── queue_state.json       # Queue persistence
├── images/                # All image generations
│   └── myFolder/          # User-specified subfolder
├── videos/                # All video generations
│   └── myFolder/
├── audio/                 # All TTS audio
│   └── myFolder/
└── chats/                 # Chat sessions
    ├── chat_sessions.json
    └── c2c_sessions.json
```

**Critical Function**:
```python
# app.py - get_next_filename() with media_type parameter
def get_next_filename(prefix: str, subfolder: str = "", extension: str = "png", media_type: str = "images") -> tuple:
    # Builds path: OUTPUT_DIR / media_type / subfolder / filename
    if subfolder:
        target_dir = OUTPUT_DIR / media_type / subfolder
    else:
        target_dir = OUTPUT_DIR / media_type
    # Returns (relative_path, absolute_path)
```

**Usage Pattern**:
```python
# Image generation
relative_path, output_path = get_next_filename(file_prefix, subfolder, 'png', 'images')

# Video generation
relative_path, output_path = get_next_filename(file_prefix, subfolder, 'mp4', 'videos')

# TTS audio
relative_path, output_path = get_next_filename(file_prefix, subfolder, 'wav', 'audio')
```

**User Experience**: When user types "myFolder" in output field, it creates `images/myFolder/` or `videos/myFolder/` automatically. Transparent to user, organized on backend.

### TTS Voice Display & Full Text Viewer with Audio Downloads
**Audio Browser**: Shows voice name in subtitle and first few words as title, with "View Full Text" modal and download capabilities.

```javascript
// script.js - renderAudioBatch()
function renderAudioBatch(batch) {
    // Title: First 50 chars of text
    const titleText = firstSentencePreview.substring(0, 50) + '...';
    
    // Voice: From metadata (style or narrator_audio)
    const voice = batch.files[0]?.style || batch.files[0]?.narrator_audio || 'Unknown Voice';
    const voiceName = voice.replace('.mp3', '').replace('.wav', '');
    
    // Full text for modal
    const fullText = batch.files.map(f => f.prompt || f.text || '').join(' ');
    
    // Download All button merges selected versions and downloads single file
    <button onclick="downloadMergedAudio('${batch.batch_id}')">Download All</button>
}
```

**Audio Download Features:**
1. **Individual Sentence Downloads** - Each sentence has a download button for the selected version
2. **Merged Audio Export** - "Download All" button merges all selected sentence versions into a single WAV file with 100ms silence between sentences
3. **Smart Version Selection** - Automatically uses the currently selected version from dropdown for each sentence

**Backend Endpoints**:
```python
# app.py - Audio download endpoints
@app.route('/api/audio/download/<file_id>')  # Download single sentence
@app.route('/api/audio/merge_batch', methods=['POST'])  # Merge and download batch

# Merging uses pydub with silence between sentences
combined = AudioSegment.from_file(file1) + AudioSegment.silent(100) + AudioSegment.from_file(file2)
combined.export(output_path, format="wav")
```

**Path Handling** (CRITICAL):
```python
# Metadata paths may be relative to project root or need OUTPUT_DIR
path_str = file_entry.get('path', '')
file_path = Path(path_str)

# Try as-is first, then with OUTPUT_DIR if not found
if not file_path.exists():
    file_path = OUTPUT_DIR / path_str
```

**Backend Storage**:
```python
# app.py - add_metadata_entry() for TTS
if job_type == 'tts':
    entry["narrator_audio"] = narrator_audio
    entry["style"] = style  # Stored for voice display
    entry["text"] = prompt
```

**Modal Pattern**:
```html
<!-- templates/index.html - Audio full text modal -->
<div class="custom-modal" id="audioTextModal">
    <textarea id="audioFullTextArea" readonly></textarea>
    <button onclick="copyAudioText()">Copy Text</button>
</div>
```

### Audio/Video File Path Handling (CRITICAL)
**Issue**: Metadata stores paths differently depending on generation type. Some paths are relative to project root, others need OUTPUT_DIR prepended.

**Solution Pattern** (use for all file serving):
```python
# CORRECT - Handle both path formats
path_str = file_entry.get('path', '')
file_path = Path(path_str)

# If path doesn't exist as-is, try with OUTPUT_DIR
if not file_path.is_absolute() and not file_path.exists():
    file_path = OUTPUT_DIR / path_str

if not file_path.exists():
    print(f"[ERROR] File not found: {file_path}")
    return error_response()

# INCORRECT - Always prepending causes "outputs/outputs/audio/..." bug
file_path = OUTPUT_DIR / file_entry.get('path', '')  # Don't do this!
```

**Common Path Formats in Metadata:**
- TTS files: `"audio/tts0369.mp3"` (relative to project root, don't add OUTPUT_DIR)
- Image files: `"images/myFolder/img_001.png"` (relative to OUTPUT_DIR)
- Video files: `"videos/myFolder/vid_001.mp4"` (relative to OUTPUT_DIR)

**Error Symptom**: `[AUDIO] Warning: File not found: outputs\outputs\audio\...` = double OUTPUT_DIR bug

### Custom Modal System (NO Browser Dialogs)
**CRITICAL**: Never use browser `confirm()` or `alert()`. Always use custom modals with `showConfirm()` and `showAlert()`.

```javascript
// CORRECT - Use custom confirm dialog
async function deleteItem() {
    const confirmed = await showConfirm('Delete this item?', 'Confirm Delete');
    if (!confirmed) return;
    // Proceed with deletion
}

// INCORRECT - Never use browser dialogs
if (confirm('Delete this item?')) {  // DON'T DO THIS!
    // ...
}
```

**Custom Dialog Implementation:**
```javascript
// script.js - Promise-based custom modals
function showConfirm(message, title = 'Confirm') {
    return new Promise((resolve) => {
        const modal = document.getElementById('customDialog');
        document.getElementById('dialogTitle').textContent = title;
        document.getElementById('dialogMessage').textContent = message;
        modal.style.display = 'flex';
        
        const confirmHandler = () => cleanup(true);
        const cancelHandler = () => cleanup(false);
        
        confirmBtn.addEventListener('click', confirmHandler);
        cancelBtn.addEventListener('click', cancelHandler);
    });
}

function showAlert(message, title = 'Notice') {
    // Uses showNotification for toast-style alerts
    showNotification(message, title, 'info', 5000);
    return Promise.resolve();
}
```

**Modal HTML Structure** (`templates/index.html`):
```html
<div class="custom-modal" id="customDialog" style="display: none;">
    <div class="custom-modal-overlay"></div>
    <div class="custom-modal-content">
        <h2 id="dialogTitle"></h2>
        <p id="dialogMessage"></p>
        <div class="custom-modal-actions">
            <button id="dialogConfirmBtn" class="btn btn-primary">Confirm</button>
            <button id="dialogCancelBtn" class="btn btn-secondary">Cancel</button>
        </div>
    </div>
</div>
```

**When to Use:**
- Session deletion (chat/story): `showConfirm('Delete chat "Name"?', 'Confirm Delete')`
- Character deletion: `showConfirm('Delete this character?', 'Confirm Delete')`
- Lorebook entry deletion: `showConfirm('Delete this lorebook entry?', 'Confirm Delete')`
- Any destructive action requiring confirmation
- Always await the result and check boolean return value

### Session Duplication System
**Feature**: Duplicate chat/story sessions with selective copying of settings and messages.

**Frontend Pattern:**
```javascript
// Session item with action buttons
<div class="chat-session-item">
    <div class="chat-session-content">
        <div class="session-name">Chat Name</div>
        <div class="session-model">llama3.2</div>
    </div>
    <div class="chat-session-actions">
        <button class="chat-session-duplicate" data-session-id="${id}">🗐</button>
        <button class="chat-session-delete" data-session-id="${id}">🗑</button>
    </div>
</div>

// Event handlers prevent session selection when clicking action buttons
item.addEventListener('click', (e) => {
    if (e.target.closest('.chat-session-actions')) return;
    selectSession(sessionId);
});
```

**Duplicate Modal Structure:**
```html
<div class="custom-modal" id="duplicateChatModal">
    <div class="form-group">
        <label class="checkbox-label">
            <input type="checkbox" id="duplicateChatSettings" checked>
            <span>Copy session settings (system prompt, temperature, etc.)</span>
        </label>
    </div>
    <div class="form-group">
        <label class="checkbox-label">
            <input type="checkbox" id="duplicateChatMessages">
            <span>Copy all messages</span>
        </label>
    </div>
</div>
```

**Backend Duplication** (`app.py`):
```python
@app.route('/api/chat/sessions/<session_id>/duplicate', methods=['POST'])
@require_auth
def duplicate_chat_session(session_id):
    data = request.json
    copy_settings = data.get('copy_settings', True)
    copy_messages = data.get('copy_messages', False)
    
    # Find original session
    original_session = find_session(session_id)
    
    # Create new session with unique ID
    new_session = {'session_id': str(uuid.uuid4())}
    
    if copy_settings:
        # Copy all settings (system_prompt, temperature, etc.)
        new_session['chat_name'] = original_session.get('chat_name', 'New Chat') + ' (Copy)'
        new_session['model'] = original_session.get('model')
        # ... copy other settings
    
    if copy_messages:
        # Deep copy to avoid reference issues
        import copy
        new_session['messages'] = copy.deepcopy(original_session['messages'])
    else:
        new_session['messages'] = []
    
    return jsonify({'success': True, 'session': new_session})
```

**Story Duplication Specifics:**
- Also copies `characters` array (character cards with descriptions, personalities)
- Copies `lorebook` entries (keyword-activated lore)
- Preserves `active_character_id` and `user_persona_id`
- Appends " (Copy)" to session name for easy identification

**CSS for Action Buttons:**
```css
.chat-session-actions {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
}

.chat-session-duplicate,
.chat-session-delete {
    padding: 0.25rem;
    background: transparent;
    border: none;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s ease;
}

.chat-session-duplicate:hover {
    background: rgba(0, 122, 255, 0.1);
    color: #007aff;
}

.chat-session-delete:hover {
    background: rgba(255, 59, 48, 0.1);
    color: #ff3b30;
}
```

### Button Event Handlers (CRITICAL BUG FIX)
**LESSON LEARNED**: JavaScript `addEventListener` doesn't always fire on dynamically styled buttons. Solution: Use inline `onclick` in HTML.

```html
<!-- CORRECT: Use inline onclick -->
<button id="browseVideoImageBtn" onclick="openImageBrowser('video'); return false;">Browse</button>
<button id="generateVideoBtn" onclick="generateVideo(); return false;">Generate</button>

<!-- INCORRECT: addEventListener may not fire -->
document.getElementById('browseVideoImageBtn').addEventListener('click', () => openImageBrowser('video'));
```

**When to use inline onclick:**
- Video tab buttons (upload, browse, generate, clear seed)
- Any button that mysteriously doesn't respond to clicks
- Buttons inside forms or complex layouts
- Dynamic content that needs guaranteed event handling

**Seed Clear Button Pattern:**
```html
<!-- Video tab requires inline onclick for reliable event handling -->
<button type="button" class="clear-btn" id="clearVideoSeedBtn" title="Clear seed" onclick="clearVideoSeed(); return false;">
    <svg width="16" height="16">...</svg>
</button>
```

```javascript
// Dedicated function (not inline anonymous function)
function clearVideoSeed() {
    document.getElementById('videoSeed').value = '';
    document.getElementById('videoSeed').focus();
}
```

### Video Generation System
**Workflows**: 
- `Wan2.2 I2V (API).json` - Standard video generation
- `Wan2.2 I2V NSFW (API).json` - NSFW-enabled video generation (controlled by checkbox in UI)

```python
# Backend (app.py) - Automatic workflow switching with model unloading
if job_type == 'video':
    is_nsfw = job.get('nsfw', False)
    current_workflow = 'video_nsfw' if is_nsfw else 'video'
    
    # Unload models if switching workflow types
    if last_workflow_type and last_workflow_type != current_workflow:
        print(f"[WORKFLOW] Switching from {last_workflow_type} to {current_workflow}, unloading models...")
        comfyui_client.unload_models()
        time.sleep(2)  # Give ComfyUI time to unload
    
    last_workflow_type = current_workflow
    
    relative_path, output_path = get_next_filename(file_prefix, subfolder, 'mp4')
    comfyui_client.generate_video(
        positive_prompt=job['prompt'],
        image_filename=job.get('image_filename'),
        frames=job.get('frames', 64),
        megapixels=job.get('megapixels', 0.25),
        fps=job.get('fps', 16),
        seed=seed,
        output_path=str(output_path),
        wait=True,
        nsfw=is_nsfw  # Pass NSFW flag to client
    )
```

**ComfyUI Client** - Workflow selection:
```python
# comfyui_client.py - generate_video() selects appropriate workflow
workflow_path = "workflows/Wan2.2 I2V NSFW (API).json" if nsfw else "workflows/Wan2.2 I2V (API).json"
workflow = self.load_workflow(workflow_path)
print(f"[WORKFLOW] Using {'NSFW' if nsfw else 'standard'} video workflow: {workflow_path}")
```

**Frontend** - NSFW checkbox in Video tab:
```html
<!-- Video Parameters section -->
<div class="form-group">
    <label>NSFW Mode</label>
    <label class="checkbox-label">
        <input type="checkbox" id="videoNSFW" class="checkbox-input">
        <span>Use NSFW-enabled workflow (requires NSFW models)</span>
    </label>
</div>
```

### Frame Edit Workflow
**Complete video → frames → AI processing → video pipeline** with 3-step collapsible UI for frame-by-frame video editing.

**Folder Structure:**
```
input/frame_edit/[folder]_[fps]fps/     # Extracted frames from video
outputs/images/frame_edit/[folder]/      # AI-processed frames
outputs/videos/frame_edit/               # Final stitched videos
```

**Step 1 - Extract Frames** (`/api/frame-edit/extract`):
```python
# Frontend - Video upload and time range controls
<input type="file" accept="video/*" id="frameEditVideoInput">
<input type="number" id="frameEditStartTime" placeholder="Start (s)">
<input type="number" id="frameEditEndTime" placeholder="End (s)">
<input type="number" id="frameEditFrameSkip" value="1" min="1">

# Backend - FFmpeg frame extraction with FPS detection
ffprobe_cmd = ['ffprobe', '-v', 'error', '-select_streams', 'v:0', 
               '-show_entries', 'stream=r_frame_rate', str(video_path)]
# Parses "30/1" or "30000/1001" to float
fps = float(num) / float(den)

# Calculates playback FPS based on frame skip
playback_fps = fps / frame_skip  # 30fps video with skip=2 → 15fps output

# Folder naming includes FPS for auto-fill in Step 3
output_folder = f"{video_basename}_{playback_fps}fps_{timestamp}"
# Example: "myvideo_30fps_20260210_120000"

# FFmpeg extraction with frame skip
ffmpeg_cmd = [
    'ffmpeg',
    '-ss', str(start_time),
    '-i', str(video_path),
    '-t', str(duration),
    '-vf', f'select=not(mod(n\\,{frame_skip}))',  # Every Nth frame
    '-vsync', 'vfr',
    '-q:v', '2',  # High quality
    str(output_dir / 'frame_%04d.png')
]
```

**Step 2 - Process Frames** (`/api/frame-edit/process`):
```python
# Queue individual i2i jobs for each frame
for frame_file in frame_files:
    relative_frame_path = f"frame_edit/{folder_name}/{frame_file.name}"
    job = {
        'job_type': 'image',
        'use_image': True,  # i2i mode
        'use_image_size': True,  # Match source size
        'image_filename': relative_frame_path,
        'subfolder': f"frame_edit/{folder_name}",  # Output to outputs/images/frame_edit/
        'prompt': prompt,  # Same prompt for all frames
        # ... other parameters
    }
    generation_queue.insert(0, job)
```

**Step 3 - Stitch Video** (`/api/frame-edit/stitch`):
```javascript
// Frontend - FPS auto-fill from folder name
function parseFpsFromFolderName(folderName) {
    const match = folderName.match(/(\d+(?:\.\d+)?)fps/);
    return match ? parseFloat(match[1]) : null;
}

// When selecting folder, auto-populate FPS input
const fps = parseFpsFromFolderName(folderName);
if (fps) document.getElementById('stitchFps').value = fps;

// Dual source support - stitch from input (extracted) or output (processed)
const source = selectedStitchSource;  // 'input' or 'output'
```

```python
# Backend - FFmpeg concat with absolute paths (critical!)
file_list_path = frame_folder / 'ffmpeg_file_list.txt'
with open(file_list_path, 'w', encoding='utf-8') as f:
    for frame_file in frame_files:
        # MUST use absolute paths to avoid "No such file" errors
        absolute_path = str(frame_file.absolute()).replace('\\', '/')
        f.write(f"file '{absolute_path}'\n")

ffmpeg_cmd = [
    'ffmpeg',
    '-f', 'concat',
    '-safe', '0',
    '-r', str(fps),
    '-i', str(file_list_path.absolute()),  # Absolute path for file list
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', '18',  # High quality (18 = visually lossless)
    '-y',
    str(output_path.absolute())  # Absolute path for output
]

# Metadata uses source_image field to store source folder
metadata_entry = add_metadata_entry(
    str(output_path),
    f"Stitched from frames in {folder_name}",
    0, 0, 0, 0, "", "frame_edit",
    job_type='video',
    source_image=folder_name,  # Track source folder
    frames=len(frame_files),
    fps=fps
)
```

**Critical Patterns:**
- **FPS in Folder Name**: Extracted folders include FPS (e.g., `video_30fps`) for auto-fill in Step 3
- **Absolute Paths**: FFmpeg file list MUST use absolute paths to avoid errors
- **Dual Source**: Step 3 can stitch from input (extracted) or outputs/images (processed) folders
- **Metadata Storage**: Use `source_image` field to track source folder (frames are named, not from single image)
- **No cwd Parameter**: Don't use `cwd` in subprocess.run() - absolute paths handle everything

**Typical Workflow:**
1. Upload 30fps video → Extract with skip=2 → Creates `myvideo_15fps/` in input/frame_edit/
2. Select folder → Process all frames with prompt → AI outputs to outputs/images/frame_edit/myvideo_15fps/
3. Select processed folder → FPS auto-fills to 15 → Stitch → Video in outputs/videos/frame_edit/

### Workflow Type Tracking & Model Unloading
**Critical Feature**: System tracks workflow type and automatically unloads ALL models (ComfyUI + Ollama + Gradio TTS) after EVERY job completion to prevent RAM cramming.

```python
# app.py - Global state tracking
last_workflow_type = None  # 'image_t2i', 'image_i2i', 'video', 'video_nsfw', 'tts', 'chat:model_name', 'story:model_name', 'chat2chat:model1_model2'

# BEFORE job starts - unload previous workflow type
if job_type == 'video':
    is_nsfw = job.get('nsfw', False)
    current_workflow = 'video_nsfw' if is_nsfw else 'video'
    
    if last_workflow_type and last_workflow_type != current_workflow:
        if last_workflow_type == 'tts':
            gradio_tts_client.unload_all_engines()
        else:
            comfyui_client.unload_models()
            comfyui_client.clear_cache()
        time.sleep(2)
    last_workflow_type = current_workflow

elif job_type == 'tts':
    # Unload models if switching workflow types
    if last_workflow_type and last_workflow_type != 'tts':
        if last_workflow_type.startswith('chat:'):
            ollama_client.unload_all_models()
        else:
            comfyui_client.unload_models()
        time.sleep(2)
    last_workflow_type = 'tts'

elif job_type == 'chat' or job_type == 'story' or job_type == 'chat2chat':
    # Unload ComfyUI/TTS models before Ollama
    if last_workflow_type and not last_workflow_type.startswith(('chat:', 'story:')):
        if last_workflow_type == 'tts':
            gradio_tts_client.unload_all_engines()
        else:
            comfyui_client.unload_models()
            comfyui_client.clear_cache()
        time.sleep(5)
    last_workflow_type = f'{job_type}:{model_name}'

# AFTER job completes (CRITICAL - prevents RAM cramming)
# Inside completion section after active_generation = None
print("[CLEANUP] Unloading all models after job completion...")
try:
    comfyui_client.unload_models()
    comfyui_client.clear_cache()
    ollama_client.unload_all_models()
    gradio_tts_client.unload_all_engines()
except Exception as e:
    print(f"[CLEANUP] Error: {e}")
time.sleep(5)  # Wait for complete cleanup
```

**Model Unloading Strategy:**
1. **Before Job**: Unload previous workflow if switching types (2-5s wait)
2. **After EVERY Job**: Unload ALL models (ComfyUI + Ollama + Gradio TTS) with 5s wait
3. **Prevents**: RAM/VRAM cramming on systems with limited resources
4. **Trade-off**: Slightly slower between jobs, but prevents OOM crashes

### Chat & Chat to Chat System
**Two Ollama-powered features** with persistent session storage and queue integration:

**Ollama Keep-Alive Configuration** - Models stay loaded indefinitely:
```python
# ollama_client.py - chat() method with keep_alive parameter
def chat(self, model: str, messages: List[Dict[str, str]], 
         temperature: float = 0.7, ..., 
         keep_alive: int = -1) -> Generator[str, None, None]:
    payload = {
        "model": model,
        "messages": messages,
        "stream": stream,
        "keep_alive": keep_alive,  # -1 = indefinite, 0 = unload immediately
        "options": {...}
    }
    # Default -1 keeps models loaded indefinitely (no 5-minute timeout)
    # Prevents reload delays when returning to conversations
```

**Chat Tab** - Single-user interactive chat with streaming:
```python
# Backend: POST /api/chat/message
# Creates queue job, processes in background thread
job = {
    'id': job_id,
    'job_type': 'chat',
    'session_id': session_id,
    'message': user_message,
    'model': model_name,
    ...
}

# Background thread processes independently of browser
def process_chat_background():
    # Add user message to session
    session['messages'].append(user_msg)
    
    # Stream from Ollama
    response_gen = ollama_client.chat(model=model, messages=messages, stream=True)
    
    # Save full response to session
    full_response = ''.join(response_gen)
    session['messages'].append({'role': 'assistant', 'content': full_response})
    
    # Mark completed
    active_generation['chat_completed'] = True

# Separate streaming endpoint for browser (polls session)
def stream_to_client():
    # Polls session for new messages
    while not active_generation.get('chat_completed'):
        # Check for new messages in session
        # Yield via SSE
        time.sleep(0.3)
```

**Chat to Chat Tab** - Autonomous AI-to-AI conversations:
```python
# Backend: POST /api/chat2chat/start
# Creates conversation session with two models
c2c_session = {
    'id': session_id,
    'model1': model1_name,
    'model2': model2_name,
    'max_turns': max_turns,
    'status': 'running',
    'messages': [],
    ...
}

# Queue job monitors session status
job = {
    'job_type': 'chat2chat',
    'session_id': session_id,
    ...
}

# Background thread alternates between models
def run_chat2chat_background():
    while session['status'] == 'running' and turn < max_turns:
        # Model 1 generates
        response1 = ollama_client.chat(model=model1, messages=context1)
        session['messages'].append({'role': 'model1', 'content': response1})
        
        # Model 2 responds
        response2 = ollama_client.chat(model=model2, messages=context2)
        session['messages'].append({'role': 'model2', 'content': response2})
        
        turn += 1
    
    session['status'] = 'stopped'
```

**Frontend Patterns:**
- **Chat**: EventSource for SSE streaming, auto-scroll, session history
- **Chat2Chat**: 300ms polling for status updates, stop/continue controls
- **Import to New**: Buttons copy settings from previous sessions to new chat
- **Queue Display**: Shows "Chat" or "Chat to Chat" badge with timer (not steps/size)

**Session Storage:**
- Chat: `outputs/chat_sessions.json` - User-assistant message history
- Chat2Chat: `outputs/c2c_sessions.json` - Model-to-model conversation logs
- Story: `outputs/chats/stories.json` - Story sessions with characters/lorebook
- Persistent: Survives server restarts, shared across users

### Story Mode System
**Character-driven interactive storytelling** with lorebook, character cards, and user personas for rich roleplay experiences:

**Story Tab Architecture:**
```python
# Backend: POST /api/story/message
# Creates queue job, processes in background thread with lorebook
job = {
    'id': job_id,
    'job_type': 'story',
    'session_id': session_id,
    'message': user_message,
    'model': model_name,
    'response_id': response_id,
    ...
}

# Story session structure
story_session = {
    'session_id': uuid,
    'title': 'Session Name',
    'model': 'llama3.2',
    'system_prompt': 'Custom instructions...',
    'active_character_id': char_id,      # Character AI is playing
    'user_persona_id': persona_id,       # Character user is playing
    'characters': [                      # Character cards
        {
            'id': uuid,
            'name': 'Character Name',
            'description': 'Physical appearance...',
            'personality': 'Personality traits...',
            'example_dialogue': 'Speech examples...',
            'include_in_lore': False    # Include as background char
        }
    ],
    'lorebook': [                        # World/lore entries
        {
            'id': uuid,
            'keys': ['keyword1', 'keyword2'],  # Activation keywords
            'content': 'Lore information...',
            'persistent': False          # Always active if True
        }
    ],
    'messages': [...]
}
```

**Lorebook System (Keyword-Activated Context):**
```python
# app.py - Lorebook activation during story processing
activated_entries = []

# Scan last 3 messages for keywords
recent_messages = session_data['messages'][-3:]
scan_text = ' '.join([msg['content'] for msg in recent_messages]).lower()

for entry in lorebook:
    # Persistent entries are always active
    if entry.get('persistent', False):
        activated_entries.append(entry)
        continue
    
    # Keyword matching (case-insensitive)
    keys = [k.lower().strip() for k in entry.get('keys', [])]
    for key in keys:
        if key in scan_text:
            activated_entries.append(entry)
            break  # Activate once per entry

print(f"[STORY] Activated {len(activated_entries)} lorebook entries")
```

**Prompt Assembly Pipeline (4 Layers):**
```python
# Layer 1: System Prompt + Roleplay Instructions
# - User's custom system prompt
# - Active character instructions ("You are roleplaying as X...")
# - User persona instructions ("User is roleplaying as Y...")

# Layer 2: Active Character Details (Full Context)
# - Character name, description, personality, example dialogue
# - Sent as system message: "=== YOU ARE PLAYING: CHARACTER ==="

# Layer 2.5: User Persona Details (if different from active character)
# - Persona name, description, personality
# - Sent as system message: "=== THE USER IS PLAYING: PERSONA ==="

# Layer 3: Lorebook Entries & Background Characters (Dynamic Context)
# - Activated lorebook entries (keyword-matched or persistent)
# - Characters marked include_in_lore (excluding active character)
# - Sent as single system message: "[World Information]"

# Layer 4: Chat History (Sliding Window)
# - Previous user/assistant messages
# - Sent as alternating user/assistant messages
```

**Frontend Components:**
- **Left Sidebar**: Story session list (create new, switch between sessions)
- **Center**: Story messages with streaming responses, character indicators
- **Right Sidebar**: Parameters panel with character/lorebook managers
- **Character Manager**: Add/edit/delete character cards, set active character
- **Lorebook Manager**: Add/edit/delete lore entries with keyword triggers
- **User Persona**: Select which character the user is playing (optional)

**Story-Specific Endpoints:**
- `GET /api/story/sessions` - List all story sessions
- `POST /api/story/sessions` - Create new story session
- `GET /api/story/sessions/<session_id>` - Get specific session with full data
- `PUT /api/story/sessions/<session_id>` - Update session (title, characters, lorebook)
- `DELETE /api/story/sessions/<session_id>` - Delete story session
- `POST /api/story/message` - Send message, queue story generation job
- `GET /api/story/stream/<session_id>/<response_id>` - SSE stream for response

**Model Switching for Story:**
```python
# app.py - Story jobs update workflow tracking
if job_type == 'story':
    current_workflow = f'story:{model}'
    
    # Unload ComfyUI models if switching from image/video
    if last_workflow_type and not last_workflow_type.startswith(('chat:', 'story:')):
        comfyui_client.unload_models()
        time.sleep(2)
    # Unload previous Ollama model if switching models
    elif last_workflow_type and last_workflow_type != current_workflow:
        ollama_client.unload_all_models()
        time.sleep(1)
    
    last_workflow_type = current_workflow
```

**Frontend Files:**
- `static/story.js` - Core story tab logic (sessions, messaging, streaming)
- `static/story_modals.js` - Character/lorebook manager modals
- Integrated with main `script.js` tab switching and queue display

**Key Patterns:**
- Characters can be both "active character" (AI plays) and "user persona" (user plays)
- Lorebook entries with `persistent: true` always inject into context
- Keyword matching is case-insensitive and scans last 3 messages only
- Background characters (`include_in_lore: true`) appear in Layer 3 context
- Story sessions persist to `outputs/chats/stories.json` separately from chat sessions

### Auto Chat System
**Autonomous dual-persona AI conversations** where two separate AI personas talk to each other automatically with SSE streaming, manual intervention, and purely visual flip display:

**Auto Chat Architecture:**
```python
# Backend: POST /api/autochat/start
# Creates autonomous conversation session with two independent personas
autochat_session = {
    'session_id': uuid,
    'status': 'running',  # 'running', 'stopped', 'finished'
    'current_turn': 0,
    'max_turns': 10,
    'persona_a': {
        'name': 'Alice',
        'model': 'llama3.2',
        'system_prompt': 'Custom instructions...',
        'temperature': 0.7,
        'num_ctx': 2048,
        ...
    },
    'persona_b': {
        'name': 'Bob',
        'model': 'mistral',
        'system_prompt': 'Custom instructions...',
        'temperature': 0.8,
        'num_ctx': 2048,
        ...
    },
    'messages': [
        {
            'persona': 'a',  # Which persona sent this (never changes)
            'content': 'Message text...',
            'timestamp': '2025-02-07T12:34:56',
            'response_id': uuid  # For SSE streaming tracking
        }
    ]
}
```

**Autonomous Turn System (Backend):**
```python
# app.py - Auto-queue next turn after completion
def process_autochat_job(job):
    session = job['session']
    persona = job['persona']  # 'a' or 'b'
    
    # Generate response from current persona
    persona_config = session[f'persona_{persona}']
    messages = build_context_for_persona(session, persona)
    
    response_gen = ollama_client.chat(
        model=persona_config['model'],
        messages=messages,
        temperature=persona_config['temperature'],
        num_ctx=persona_config['num_ctx'],
        stream=True
    )
    
    # Save to session with persona marker
    full_response = ''.join(response_gen)
    session['messages'].append({
        'persona': persona,
        'content': full_response,
        'timestamp': datetime.now().isoformat(),
        'response_id': str(uuid.uuid4())
    })
    
    # Auto-queue next turn if conversation still running
    if session['status'] == 'running' and session['current_turn'] < session['max_turns']:
        next_persona = 'b' if persona == 'a' else 'a'
        session['current_turn'] += 1
        
        # Queue next turn (shows persona name + model in queue)
        next_job = {
            'id': str(uuid.uuid4()),
            'job_type': 'autochat',
            'session_id': session['session_id'],
            'persona': next_persona,
            'persona_name': session[f'persona_{next_persona}']['name'],
            'model': session[f'persona_{next_persona}']['model'],
            ...
        }
        generation_queue.insert(0, next_job)
    else:
        session['status'] = 'finished'
```

**Manual Intervention (User Injects Message):**
```python
# Backend: POST /api/autochat/manual-message
# User can inject messages as either persona during active conversation
@app.route('/api/autochat/manual-message', methods=['POST'])
def send_autochat_manual_message():
    data = request.json
    session_id = data.get('session_id')
    content = data.get('content')
    persona = data.get('persona')  # 'a' or 'b' (which persona user is sending as)
    
    session = find_autochat_session(session_id)
    
    # Add user's manual message
    session['messages'].append({
        'persona': persona,
        'content': content,
        'timestamp': datetime.now().isoformat(),
        'is_manual': True  # Flag for UI styling
    })
    
    # Queue AI response from opposite persona
    next_persona = 'b' if persona == 'a' else 'a'
    response_job = {
        'id': str(uuid.uuid4()),
        'job_type': 'autochat',
        'session_id': session_id,
        'persona': next_persona,
        'persona_name': session[f'persona_{next_persona}']['name'],
        'model': session[f'persona_{next_persona}']['model'],
        ...
    }
    generation_queue.insert(0, response_job)
    
    return jsonify({'success': True, 'response_id': response_job['id']})
```

**Flip Display System (Purely Visual):**
```javascript
// Frontend: static/autochat.js - Flip swaps left/right without backend changes
let flipDisplay = false;  // Global state (per session)

function createAutoMessageElement(msg) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'autochat-message';
    
    // Position calculation (flip inverts sides)
    const isLeft = flipDisplay ? (msg.persona === 'b') : (msg.persona === 'a');
    messageDiv.classList.add(isLeft ? 'user' : 'assistant');
    
    // CRITICAL: Always use actual persona for name/avatar (never swap)
    const personaConfig = currentAutochatSession[`persona_${msg.persona}`];
    const name = personaConfig.name;
    const model = personaConfig.model;
    
    // Left = user class, Right = assistant class
    // Flip changes which persona gets which side, not their identity
    
    return messageDiv;
}

function toggleFlipDisplay() {
    flipDisplay = !flipDisplay;
    updateFlipDisplayUI();
    renderAutochatMessages();  // Re-render with new positioning
}

function updateFlipDisplayUI() {
    // Update "Send as [Name]" label based on flip state
    const leftPersona = flipDisplay ? 'b' : 'a';
    const leftName = currentAutochatSession[`persona_${leftPersona}`].name;
    document.getElementById('sendAsLabel').textContent = `Send as ${leftName}`;
}

function sendManualMessage() {
    const content = document.getElementById('manualMessageInput').value;
    
    // User always sends as left side (flip determines which persona is left)
    const persona = flipDisplay ? 'b' : 'a';
    
    fetch('/api/autochat/manual-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            session_id: currentAutochatSession.session_id,
            persona: persona,
            content: content
        })
    });
}
```

**SSE Streaming Implementation:**
```javascript
// Frontend: static/autochat.js - Real-time message updates
function startMessageStreaming(responseId) {
    const eventSource = new EventSource(`/api/autochat/stream/${currentAutochatSession.session_id}/${responseId}`);
    
    eventSource.onmessage = function(event) {
        const data = JSON.parse(event.data);
        
        if (data.done) {
            eventSource.close();
            // Re-create message element to show action buttons
            updateMessageWithActionButtons(responseId);
        } else if (data.content) {
            // Update message content in real-time
            updateMessageContent(responseId, data.content);
        } else if (data.error) {
            eventSource.close();
            showNotification(data.error, 'Error', 'error');
        }
    };
    
    eventSource.onerror = function() {
        eventSource.close();
        showNotification('Streaming connection lost', 'Error', 'error');
    };
}

// Fallback: 300ms polling for status updates
setInterval(() => {
    if (currentAutochatSession && currentAutochatSession.status === 'running') {
        fetch(`/api/autochat/status/${currentAutochatSession.session_id}`)
            .then(r => r.json())
            .then(data => {
                if (data.new_messages) {
                    renderAutochatMessages();  // Update UI with new messages
                }
            });
    }
}, 300);
```

**Queue Integration:**
```python
# Backend: Job creation includes persona name and model for display
job = {
    'id': str(uuid.uuid4()),
    'job_type': 'autochat',
    'session_id': session_id,
    'persona': 'a',
    'persona_name': 'Alice',  # Shows in queue badge
    'model': 'llama3.2',       # Shows in queue badge
    ...
}

# Frontend: Queue rendering shows "Alice (llama3.2)" instead of "AI ↔ AI"
if (item.job_type === 'autochat') {
    const badge = `${item.persona_name} (${item.model})`;
    // Also shows timer counting elapsed seconds
}
```

**Frontend Files:**
- `static/autochat.js` - Complete Auto Chat tab logic (~1100 lines: sessions, messaging, SSE streaming, flip display, edit/delete)
- Integrated with main `script.js` tab switching and queue display
- Uses global functions from `script.js`: `escapeHtml()`, `formatChatMessage()`, `showNotification()`, `showConfirm()`

**Session Storage:**
- `outputs/chats/autochat.json` - All Auto Chat sessions with full persona configs and messages
- Persistent: Survives server restarts, shared across users

**Auto Chat Endpoints:**
- `POST /api/autochat/sessions` - Create new Auto Chat session with dual personas
- `GET /api/autochat/sessions` - List all Auto Chat sessions
- `GET /api/autochat/sessions/<session_id>` - Get specific session with full data
- `PUT /api/autochat/sessions/<session_id>` - Update session (persona configs, messages)
- `DELETE /api/autochat/sessions/<session_id>` - Delete Auto Chat session
- `POST /api/autochat/start` - Start conversation (queues first message)
- `POST /api/autochat/stop` - Stop running conversation (current message completes)
- `POST /api/autochat/continue` - Resume stopped conversation
- `POST /api/autochat/manual-message` - User injects message as either persona
- `GET /api/autochat/stream/<session_id>/<response_id>` - SSE stream for response
- `GET /api/autochat/status/<session_id>` - Poll for new messages (300ms fallback)

**Key Patterns:**
- **Two Independent Personas**: Each has own name, model, system prompt, temperature, num_ctx
- **Persona Identity Never Changes**: `persona: 'a'` or `'b'` in message always reflects actual sender
- **Flip is Purely Visual**: Swaps left/right positioning without modifying backend data
- **User Always Sends Left**: Manual intervention sends as whichever persona is currently on left side
- **Auto-Queuing**: After each message completes, next persona automatically queued (alternating until max_turns)
- **SSE Streaming**: EventSource for real-time updates, 300ms polling as fallback
- **Queue Display**: Shows persona name + model (e.g., "Alice (llama3.2)") instead of generic "AI ↔ AI"
- **Manual Intervention**: User can inject messages mid-conversation, queues AI response from other persona
- **Edit/Delete Support**: All messages (manual or AI) can be edited or deleted in-place
- **Sidebar Collapse**: Mobile responsive with `.collapsed` class (not `.active`)
- **Session Persistence**: Full conversation history with persona configs stored in `autochat.json`

### Message UI & Editing System (Chat & Story)
**Consistent message structure** across both chat and story tabs with inline editing, deletion, and token counting:

**Token Counting** - Estimates tokens per message and displays session totals:
```javascript
// Utility function in both script.js and story.js
function estimateTokenCount(text) {
    if (!text) return 0;
    const cleaned = text.trim().replace(/\s+/g, ' ');
    const words = cleaned.split(' ').length;
    return Math.ceil(words * 1.3);  // ~1.3 tokens per word
}

function calculateTotalTokens(messages) {
    return messages.reduce((total, msg) => {
        return total + estimateTokenCount(msg.content || '');
    }, 0);
}

// Display in message header and above messages area
<span class="chat-message-tokens" title="Estimated tokens">${tokenCount} tokens</span>
<div class="chat-token-display" id="chatTotalTokens">Total: 1,234 tokens</div>
```

**Context Progress Bar** - Real-time visualization of context window usage with color-coded thresholds:
```javascript
// Calculate context usage in renderChatMessages/renderStoryMessages
const totalTokens = calculateTotalTokens(messages);
const maxContext = currentSession.num_ctx || 2048;  // 2048 for chat, 4096 for story
const contextUsage = (totalTokens / maxContext) * 100;

// Update DOM elements
const contextBar = document.getElementById('chatContextBar');  // or storyContextBar
const contextLabel = document.getElementById('chatContextLabel');  // or storyContextLabel

if (contextBar && contextLabel) {
    contextBar.style.width = `${Math.min(contextUsage, 100)}%`;
    
    // Color code based on usage thresholds
    if (contextUsage < 70) {
        contextBar.style.backgroundColor = 'var(--success-color, #34d399)';  // Green
    } else if (contextUsage < 90) {
        contextBar.style.backgroundColor = 'var(--warning-color, #fbbf24)';  // Yellow
    } else {
        contextBar.style.backgroundColor = 'var(--error-color, #ff3b30)';  // Red
    }
    
    contextLabel.textContent = `${contextUsage.toFixed(1)}% of ${maxContext.toLocaleString()} context`;
}
```

**Live Updates During Streaming** - Progress bar updates as messages stream in:
```javascript
// In startChatStreamingPolling or updateStoryMessageContent
// Recalculate after each chunk
const totalTokens = calculateTotalTokens(currentSession.messages);
const maxContext = currentSession.num_ctx || 2048;
const contextUsage = (totalTokens / maxContext) * 100;

// Update progress bar immediately
contextBar.style.width = `${Math.min(contextUsage, 100)}%`;
// Update color based on current usage
// Update label with percentage and totals
```

**HTML Structure:**
```html
<div class="chat-context-info">
    <div class="chat-token-display" id="chatTotalTokens"></div>
    <div class="chat-context-track">
        <div id="chatContextBar" class="chat-context-bar" style="width: 0%;"></div>
    </div>
    <div id="chatContextLabel" class="chat-context-label"></div>
</div>
```

**CSS Styling:**
```css
.chat-context-info {
    padding: 0 1rem 0.5rem 1rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.chat-context-track {
    flex: 1;
    height: 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    overflow: hidden;
    position: relative;
}

.chat-context-bar {
    height: 100%;
    background-color: var(--success-color, #34d399);
    border-radius: 4px;
    transition: width 0.3s ease, background-color 0.3s ease;
    position: relative;
    overflow: hidden;
    width: 0%;
}

.chat-context-bar::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
    animation: shimmer 2s infinite;
}

@keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
}

.chat-context-label {
    font-size: 0.875rem;
    color: var(--text-muted);
    white-space: nowrap;
    min-width: 150px;
    text-align: right;
}
```

**Message Structure:**
```javascript
// Both chat and story use identical structure
<div class="chat-message user/assistant">
    <div class="chat-message-avatar">
        <img src="character.image" /> or text initials
    </div>
    <div class="chat-message-wrapper">
        <div class="chat-message-header">
            <span class="chat-message-name">Character Name</span>
            <span class="chat-message-meta">
                <span class="chat-message-tokens">150 tokens</span>
                <span class="chat-message-time">05:58 PM</span>
            </span>
        </div>
        <div class="chat-message-content">Message text...</div>
        <div class="chat-message-actions">
            <button class="chat-action-btn">Copy</button>
            <button class="chat-action-btn">Send to TTS</button>
            <button class="chat-action-btn">TTS Now</button>
            <button class="chat-action-btn">Edit</button>
            <button class="chat-action-btn">Delete</button>
        </div>
    </div>
</div>
```

**Button Positioning (CSS):**
```css
/* User message buttons - left aligned */
.chat-message.user .chat-message-actions {
    justify-content: flex-start;
}

/* AI message buttons - right aligned */
.chat-message.assistant .chat-message-actions {
    justify-content: flex-end;
}

/* Expand message width when editing */
.chat-message.editing {
    max-width: 95%;  /* Up from 80% */
}
```

**TTS Button Functionality:**
```javascript
// Chat tab - uses global functions directly from script.js
sendTTSBtn.onclick = () => sendToTTS(message.content);
ttsNowBtn.onclick = () => ttsNow(message.content);

// Story tab - wrapper functions retrieve from session
function sendStoryToTTS(messageIndex) {
    if (!currentStorySession || !currentStorySession.messages[messageIndex]) return;
    const message = currentStorySession.messages[messageIndex];
    sendToTTS(message.content);  // Global function in script.js
}

function storyTTSNow(messageIndex) {
    if (!currentStorySession || !currentStorySession.messages[messageIndex]) return;
    const message = currentStorySession.messages[messageIndex];
    ttsNow(message.content);  // Global function in script.js
}

// Auto Chat tab - wrapper functions for persona messages
function sendAutochatToTTS(index) {
    if (!currentAutoSession || !currentAutoSession.messages[index]) return;
    const message = currentAutoSession.messages[index];
    sendToTTS(message.content);
}

function autochatTTSNow(index) {
    if (!currentAutoSession || !currentAutoSession.messages[index]) return;
    const message = currentAutoSession.messages[index];
    ttsNow(message.content);
}

// Global TTS functions (script.js)
function sendToTTS(text) {
    document.getElementById('ttsText').value = text;
    switchTab('tts');
    showNotification('Text copied to TTS tab', 'Success', 'success', 3000);
}

async function ttsNow(text) {
    // Gets current TTS parameters from UI
    // Queues TTS job immediately with those settings
    const refAudio = document.getElementById('ttsNarratorAudio').value.trim();
    const seed = document.getElementById('ttsSeed').value.trim();
    const filePrefix = document.getElementById('ttsFilePrefix').value.trim() || 'tts';
    // ... other parameters
    // POST to /api/queue/tts
}
```

**Edit Functionality:**
```javascript
// Chat: editChatMessage(messageDiv, messageIndex)
// Story: editStoryMessage(messageDiv, messageIndex)

function editChatMessage(messageDiv, messageIndex) {
    // 1. Create large textarea (200px min, 60vh max)
    // 2. Add .editing class to expand message width to 95%
    // 3. Hide action buttons during edit
    // 4. Save updates message in session.messages array
    // 5. PUT to /api/chat/sessions/<id> with messages field
    // 6. Re-render messages after save
    // 7. No regeneration - only text changes
}
```

**Delete Functionality:**
```javascript
// Chat: deleteChatMessage(messageIndex)
// Story: deleteStoryMessage(messageIndex)

async function deleteChatMessage(messageIndex) {
    if (!currentChatSession || messageIndex === -1) return;
    
    // Show confirmation dialog (uses custom modal, not browser confirm)
    const confirmed = await showConfirm(
        'Are you sure you want to delete this message? This action cannot be undone.',
        'Delete Message'
    );
    
    if (!confirmed) return;
    
    // Remove message from array
    currentChatSession.messages.splice(messageIndex, 1);
    
    // Save to backend (PUT request)
    const response = await fetch(`/api/chat/sessions/${currentChatSession.session_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: currentChatSession.messages })
    });
    
    // Re-render and show notification
    await renderChatMessages();
    showNotification('Message deleted', 'Success', 'success');
}
```

**Streaming Updates (Story Fix):**
```javascript
// BAD - Re-renders entire chat on every chunk (causes flicker)
function updateStoryMessageContent(responseId, content) {
    renderStoryMessages();  // Don't do this!
}

// GOOD - Update only the specific message element
function updateStoryMessageContent(responseId, content) {
    const messageElements = container.querySelectorAll('.chat-message.assistant');
    for (const messageEl of messageElements) {
        // Find message by response_id match
        if (sessionMsg && sessionMsg.response_id === responseId) {
            contentEl.innerHTML = formatChatMessage(content);
            messageEl.classList.remove('loading');
            
            // Update context progress bar during streaming
            const totalTokens = calculateTotalTokens(currentSession.messages);
            const maxContext = currentSession.num_ctx || 4096;
            const contextUsage = (totalTokens / maxContext) * 100;
            
            // Update bar width, color, and label
            contextBar.style.width = `${Math.min(contextUsage, 100)}%`;
            // ... color coding logic
            
            break;
        }
    }
}
```

**Button Visibility Fix After Streaming:**
```javascript
// PROBLEM: Buttons don't appear until page reload because createChatMessageElement() 
// only adds action buttons when !isLoading, but streaming only updates innerHTML

// SOLUTION: Re-create message element when streaming completes
// In startChatStreamingPolling() or EventSource.onmessage when data.done=true:
if (data.done) {
    eventSource.close();
    
    // Re-create message element to show action buttons
    const container = document.getElementById('chatMessages');  // or storyMessages
    const messageElements = container.querySelectorAll('.chat-message.assistant');
    for (const messageEl of messageElements) {
        const index = Array.from(container.children).indexOf(messageEl);
        const msg = currentSession.messages[index];
        
        if (msg && msg.response_id === responseId) {
            // Re-create with isLoading=false to trigger button rendering
            const newMessageEl = createChatMessageElement(msg);  // or createStoryMessageElement
            messageEl.replaceWith(newMessageEl);
            break;
        }
    }
}
```

**Backend Support:**
```python
# Both endpoints support messages array updates
@app.route('/api/chat/sessions/<session_id>', methods=['PUT'])
@app.route('/api/story/sessions/<session_id>', methods=['PUT'])

if 'messages' in data:
    session_data['messages'] = data['messages']
```

**Critical Rules:**
- Always append buttons to `wrapper`, not `div` (for correct positioning)
- Five action buttons on all messages: Copy, Send to TTS, TTS Now, Edit, Delete
- TTS buttons use speaker icon (Send to TTS) and play icon (TTS Now) for visual distinction
- Delete button has red hover for visual distinction from other actions
- Use `.editing` class to expand message width during edit
- Edit/delete saves to session immediately via PUT request with messages array
- Delete always uses custom `showConfirm()` dialog, never browser confirm
- Token counts update when messages are added, edited, or deleted
- Context progress bar updates in real-time during streaming (width, color, label)
- Context bar color codes: green <70%, yellow 70-90%, red >90% of num_ctx
- Story streaming must update individual messages, not re-render entire chat
- Buttons always visible (no hover effects)
- Re-create message element when streaming completes to show action buttons (fixes button visibility bug)
- Total token count displayed above messages area with `.chat-token-display`
- Context progress bar displayed above messages with `.chat-context-info` container

### Video Output Detection (comfyui_client.py)
```python
# Check multiple possible output keys (workflow-dependent)
for node_id, node_output in outputs.items():
    if 'gifs' in node_output:      # SaveVideo standard
        video_key = 'gifs'
    elif 'videos' in node_output:  # Alternative
        video_key = 'videos'
    elif 'images' in node_output:  # Some workflows
        video_key = 'images'
```

**Video Rendering** (script.js):
```javascript
// Gallery: Detect video by extension
const isVideo = imagePath.endsWith('.mp4') || imagePath.endsWith('.webm') || imagePath.endsWith('.mov');

// Render with play icon overlay
<video src="/outputs/${imagePath}" preload="metadata"></video>

// Fullscreen: Dynamically swap img/video elements
if (isVideo) {
    const video = document.createElement('video');
    video.controls = true;
    video.loop = true;
    fsImage.parentNode.replaceChild(video, fsImage);
}

// Modal: Same pattern - replace element based on file type
```

**Video Serving** (app.py):
```python
@app.route('/outputs/<path:filepath>')  # Serves from outputs/
@app.route('/api/video/<path:filepath>')  # Serves from ComfyUI input or outputs

# MIME types for proper browser playback
if filepath.endswith('.mp4'):
    return send_file(file_path, mimetype='video/mp4')
```

### Reveal Browser (Image Pairing - Images Only)
Automatically pairs input images with generated outputs. **Videos removed** - use Video Browser tab instead.
```javascript
// Combines output and input items when in input view
const outputItems = data.output_images || [];
const inputItems = data.input_images || [];
const allItems = revealShowOutput ? outputItems : [...outputItems, ...inputItems];

// Filter to show only images (videos go to Video Browser)
const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];
const items = allItems.filter(item => {
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
    return imageExtensions.includes(ext);
});
```

### Queue System (Thread-Safe LIFO/FIFO)
### Queue System (Thread-Safe LIFO/FIFO)
```python
# Add to FRONT for display (newest on top)
with queue_lock:
    generation_queue.insert(0, job)
    
# Process from END (oldest first, FIFO execution)
with queue_lock:
    job = generation_queue[-1]  # Take oldest
    active_generation = job
```

**Job Types**: `job_type` field determines processing:
- `'image'` - Image generation (shows width, height, steps)
- `'video'` - Video generation (shows frames, fps, megapixels)
- `'tts'` - Text-to-speech batch (shows batch count)
- `'chat'` - Single chat message (shows timer, no steps/size)
- `'story'` - Story mode message (shows timer, character-driven roleplay)
- `'chat2chat'` - AI conversation (shows timer for entire duration)

**Queue Display Patterns:**
```javascript
// In renderQueueItem() - detect job type
const isChat = item.job_type === 'chat';
const isStory = item.job_type === 'story';
const isChat2Chat = item.job_type === 'chat2chat';
const isTTS = item.job_type === 'tts';

if (isChat || isStory || isChat2Chat) {
    // Show timer badge instead of steps/size
    const badge = isChat ? 'Chat' : (isStory ? 'Story' : 'Chat to Chat');
    // Display model name and message/conversation name
    // Timer counts elapsed seconds
} else {
    // Show standard parameters (width, height, steps, etc.)
}
```

**Status Handling:**
- `'queued'` - Waiting in queue (can be cancelled)
- `'active'` - Currently processing (cannot be cancelled)
- `'completed'` - Successfully finished
- `'failed'` - Only for connection errors (especially Ollama)
- `'cancelled'` - User cancelled before processing

**Input Image Preview (Queue Items):**
```javascript
// Frontend (script.js) - renderQueueItem logic
const hasMedia = job.status === 'completed' && job.relative_path;
const hasInputImage = job.image_filename && (job.status === 'queued' || job.status === 'generating');
const showMedia = hasMedia || hasInputImage;

// Show input image for queued/active items
${hasInputImage ? `
    <img src="/api/video/${encodeURIComponent(job.image_filename)}" 
         alt="Input image" 
         class="completed-image-thumb" 
         style="opacity: 0.7;">
` : ''}

// Show output image/video for completed items
${hasMedia ? `
    <img src="/outputs/${job.relative_path}" 
         alt="Generated image" 
         class="completed-image-thumb">
` : ''}
```

**Behavior:**
- **Queued/Generating**: Shows `job.image_filename` from ComfyUI input directory with 70% opacity
- **Completed**: Switches to `job.relative_path` from outputs directory at 100% opacity
- **Applies to**: Image-to-image (i2i) and video generation jobs
- **URL**: `/api/video/` endpoint serves from both input and output directories
- **Visual Indicator**: Input images appear slightly faded (0.7 opacity) to distinguish from completed outputs

**Queue Pause Feature:**
```python
# Backend (app.py) - Global pause state
queue_paused = False  # Pause queue processing

# Process queue checks pause state before taking new jobs
with queue_lock:
    if generation_queue and not active_generation and not queue_paused:
        job = generation_queue[-1]  # Take oldest
        active_generation = job

# API endpoint toggles pause state
@app.route('/api/queue/pause', methods=['POST'])
def toggle_queue_pause():
    global queue_paused
    with queue_lock:
        queue_paused = not queue_paused
    return jsonify({'paused': queue_paused})

# Queue status includes pause state
return jsonify({
    'queue': queue_copy,
    'active': active,
    'completed': completed_copy,
    'paused': paused
})
```

```javascript
// Frontend (script.js) - Pause button toggles state
async function toggleQueuePause() {
    const response = await fetch('/api/queue/pause', { method: 'POST' });
    const result = await response.json();
    updatePauseButton(result.paused);
}

// Button shows play icon when paused (orange), pause icon when running
function updatePauseButton(isPaused) {
    if (isPaused) {
        pauseBtn.classList.add('paused');  // Orange background
        pauseBtn.innerHTML = 'play icon';   // Triangle
        pauseBtn.title = 'Resume Queue';
    } else {
        pauseBtn.classList.remove('paused');
        pauseBtn.innerHTML = 'pause icon';  // Two bars
        pauseBtn.title = 'Pause Queue';
    }
}

// updateQueue() reads pause state and updates button
const data = await response.json();
if (typeof data.paused !== 'undefined') {
    updatePauseButton(data.paused);
}
```

**Behavior:**
- When paused, current generation finishes but queue won't start next job
- Button shows orange background with play icon when paused
- Button shows normal background with pause icon when running
- Pause state persists across queue polling updates (1s interval)
- No persistence across server restarts (always starts unpaused)

**Queue Reordering (Drag & Drop):**
```python
# Backend (app.py) - Reorder endpoint
@app.route('/api/queue/reorder', methods=['POST'])
@require_auth
def reorder_queue():
    data = request.json
    job_id = data.get('job_id')
    new_index = data.get('new_index')
    
    with queue_lock:
        # Find job in queue
        job_index = None
        for i, job in enumerate(generation_queue):
            if job['id'] == job_id:
                job_index = i
                break
        
        # Check if job is queued (not active)
        if job.get('status') != 'queued':
            return jsonify({'success': False, 'error': 'Can only reorder queued items'})
        
        # Remove and reinsert at new position
        removed_job = generation_queue.pop(job_index)
        generation_queue.insert(new_index, removed_job)
    
    save_queue_state()
    return jsonify({'success': True})
```

```javascript
// Frontend (script.js) - Drag and drop implementation
function setupQueueDragAndDrop() {
    const queueList = document.getElementById('queueList');
    const draggableItems = queueList.querySelectorAll('.queue-item[draggable="true"]');
    
    draggableItems.forEach((item, index) => {
        item.addEventListener('dragstart', function(e) {
            draggedElement = this;
            draggedIndex = index;
            this.style.opacity = '0.4';
        });
        
        item.addEventListener('dragover', function(e) {
            e.preventDefault();
            // Visual feedback: border-top or border-bottom based on drag direction
            const targetIndex = allItems.indexOf(this);
            if (targetIndex > draggedIndex) {
                this.style.borderBottom = '2px solid var(--primary)';
            } else {
                this.style.borderTop = '2px solid var(--primary)';
            }
        });
        
        item.addEventListener('drop', function(e) {
            e.stopPropagation();
            const draggedId = draggedElement.dataset.jobId;
            const targetIndex = allItems.indexOf(this);
            reorderQueue(draggedId, targetIndex);
        });
    });
}

// Called after rendering queue
setupQueueDragAndDrop();

// Mobile-friendly up/down buttons
async function moveQueueItem(jobId, direction) {
    const queueItems = Array.from(queueList.querySelectorAll('.queue-item[draggable="true"]'));
    const currentIndex = queueItems.findIndex(item => item.dataset.jobId === jobId);
    
    let newIndex;
    if (direction === 'up' && currentIndex > 0) {
        newIndex = currentIndex - 1;
    } else if (direction === 'down' && currentIndex < queueItems.length - 1) {
        newIndex = currentIndex + 1;
    } else {
        return; // Already at boundary
    }
    
    await reorderQueue(jobId, newIndex);
}

// HTML - Up/down buttons in queue item header
<div class="queue-item-actions">
    <button class="queue-item-reorder" data-direction="up">↑</button>
    <button class="queue-item-reorder" data-direction="down">↓</button>
    <button class="queue-item-cancel">×</button>
</div>
```

```css
/* CSS for draggable items */
.queue-item[draggable="true"] {
    cursor: move;
    cursor: grab;
}

.queue-item[draggable="true"]:active {
    cursor: grabbing;
}

/* CSS for reorder buttons */
.queue-item-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
}

.queue-item-reorder {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.25rem;
}

.queue-item-reorder:hover {
    color: var(--accent-primary);
}
```

**Reordering Methods:**
- **Drag & Drop**: Click and drag items to new position (desktop-friendly)
- **Arrow Buttons**: Click up/down buttons to move one position at a time (mobile-friendly)
- Both methods work simultaneously and use same backend endpoint

**Reordering Rules:**
- Only items with `status === 'queued'` show reorder controls
- Cannot reorder active (generating) items
- Cannot reorder completed/failed items
- Up button disabled at top position, down button disabled at bottom
- Visual feedback: opacity 0.4 while dragging, border indicator on drop target
- Reordering is immediate and updates across all connected clients
- Queue state persists to disk after reordering

**Persistent State**: `outputs/queue_state.json` survives restarts, shared across all browsers/users
**Queue Management**: X button works on queued/completed/failed (NOT active), clear removes only queued items

### File Encoding (Windows Unicode Fix)
**CRITICAL**: All JSON file operations already use UTF-8 encoding. If adding new file I/O, maintain this pattern:
```python
# CORRECT - Already implemented throughout codebase
def load_workflow(self, workflow_path: str) -> Dict[str, Any]:
    with open(workflow_path, 'r', encoding='utf-8') as f:
        return json.load(f)

# INCORRECT - Don't do this (will cause UnicodeDecodeError on Windows)
with open(workflow_path, 'r') as f:  # Uses system default (cp1252 on Windows)
```

**Error Pattern**: `'charmap' codec can't decode byte 0x9d` = missing UTF-8 encoding

### Desktop Sidebar Collapse
Queue sidebar collapses from 320px to 40px (not translateX). Main content expands via CSS transitions:
```css
.queue-sidebar { width: 320px; transition: width 0.3s ease; }
.queue-sidebar.collapsed { width: 40px; }
```

### Mobile Optimization
- Queue sidebar: Fixed overlay on mobile (≤768px), `transform: translateX(-100%)`
- Collapsible sections: `.collapsible-header` + `.collapsible-content` with `.active` class
- Touch targets: Min 44px height
- Tabs: "Single", "Text Batch", "Image Batch", "Browser", "Reveal Browser", "Video"

### Metadata Storage
Flat JSON array in `outputs/metadata.json` with type-specific fields:
```python
# Image metadata
{id, filename, path, subfolder, timestamp, prompt, width, height, steps, seed, 
 file_prefix, mcnl_lora, snofs_lora, male_lora, cfg, shift, use_image, 
 use_image_size, image_filename, job_type: 'image'}

# Video metadata  
{id, filename, path, subfolder, timestamp, prompt, seed, file_prefix,
 frames, megapixels, fps, job_type: 'video', source_image, nsfw: bool}

# TTS metadata
{id, job_type: 'tts', batch_name, timestamp, files: [texts, styles, seeds]}

# Chat metadata (stored separately in outputs/chats/chats.json)
{session_id, model, system_prompt, messages: [{role, content, timestamp}]}

# Story metadata (stored separately in outputs/chats/stories.json)
{session_id, title, model, system_prompt, active_character_id, user_persona_id,
 characters: [{id, name, description, personality, example_dialogue, include_in_lore}],
 lorebook: [{id, keys, content, persistent}],
 messages: [{role, content, timestamp, response_id, completed}]}

# Chat2Chat metadata (stored separately in c2c_sessions.json)
{session_id, model1, model2, max_turns, topic, system1, system2, messages: [{role, content}]}
```

### Image/Video Path Handling
Always use `relative_path` (includes subfolder) over `filename`:
```javascript
const imagePath = image.relative_path || image.filename || image.path;
const isVideo = imagePath && (imagePath.endsWith('.mp4') || imagePath.endsWith('.webm'));

// Videos from reveal browser input folder
const videoSrc = image.path ? `/api/video/${encodeURIComponent(image.path)}` : `/outputs/${imagePath}`;
```

## Development Commands

### Setup & Run
```powershell
# Install dependencies
pip install -r requirements.txt

# Start server
python app.py  # Starts on http://0.0.0.0:4879
```

**Critical Dependencies:**
- `flask` - Web framework (required)
- `psutil` - System/hardware monitoring (optional, graceful fallback)
- `pydub` - Audio merging for TTS Download All feature (optional)
- `mutagen` - Accurate MP3 duration calculation (optional, uses estimation fallback)

### Development Workflow
```powershell
python app.py                    # Start server on port 4879
python -m py_compile <file>      # Check syntax
# No hot reload - restart after Python changes
# Frontend (HTML/CSS/JS) - just refresh browser (Ctrl+F5 for hard refresh)
```

### Image Browser vs Video Browser Separation
**Image Browser** (`browserTab`) - Shows images only, filters out videos:
```javascript
// In renderGallery() - skip videos
files.forEach(file => {
    const isVideo = file.filename && (file.filename.endsWith('.mp4') || ...);
    if (isVideo) return; // Skip videos - they go to Video Browser
    // Render image...
});POST /api/queue/image-batch` - Queue folder of images for batch processing
- `POST /api/queue/video-batch` - Queue folder of images to convert to videos
- `
```

**Video Browser** (`videosTab`) - Shows videos only:
```javascript
// In loadVideos() - filter to videos only
const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
const videoFiles = (data.files || []).filter(file => {
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
    return videoExtensions.includes(ext);
});
// Render with play icon overlay
```

### Video Batch Processing
Convert entire folders of images to videos with same settings:
```python
# Backend endpoint: POST /api/queue/video-batch
comfyui_input_dir = Path('..') / 'comfy.git' / 'app' / 'input'
current_dir = comfyui_input_dir / folder if folder else comfyui_input_dir
image_files = [f for f in current_dir.iterdir() if f.suffix.lower() in allowed_extensions]

for file in image_files:
    job = {
        'id': str(uuid.uuid4()),
        'job_type': 'video',
        'prompt': prompt,
        'image_filename': rel_path,
        'frames': frames,
        'fps': fps,
        'megapixels': megapixels,
        'seed': seed,
        'file_prefix': file_prefix,
        'subfolder': subfolder,
        ...
    }
    generation_queue.insert(0, job)
```

**Frontend** - Folder selection via image browser modal:
```javascript
// Video Batch uses same image browser modal
imageBrowserMode = 'video-batch';
// Modal title changes: "Choose Input Folder" instead of "Browse Images"
// "Use This Folder" button shows for both 'image-batch' and 'video-batch' modes
if ((imageBrowserMode === 'image-batch' || imageBrowserMode === 'video-batch') && folder === 'input') {
    useBtn.style.display = 'inline-flex';
}
```

### Hover Comparison Feature (Image Browser)
**Purpose**: Interactive before/after comparison for image-to-image generations. Shows input image as base, reveals output image in circular area around mouse cursor.

**HTML Structure** (`templates/index.html`):
```html
<div class="image-detail-center">
    <!-- Comparison Container (hidden unless hover compare enabled) -->
    <div id="imageComparisonContainer" class="image-comparison-container" style="display: none;">
        <img id="comparisonInputImage" class="comparison-base" alt="Input Image">
        <div id="comparisonMaskContainer" class="comparison-mask-container">
            <img id="comparisonOutputImage" class="comparison-reveal" alt="Output Image">
        </div>
    </div>
    <!-- Regular Image Display -->
    <img id="detailImage" alt="Generated Image">
</div>

<!-- Controls -->
<label id="hoverCompareLabel" style="display: none;">
    <input type="checkbox" id="hoverCompareCheckbox" class="checkbox-input">
    <span>Hover Compare</span>
</label>
<div id="hoverRadiusControl" style="display: none;">
    <input type="range" id="hoverRadiusSlider" min="50" max="400" value="80" step="10">
    <span id="hoverRadiusValue">80px</span>
</div>
```

**State Management** (`static/script.js`):
```javascript
// Global state
let hoverCompareEnabled = false;
let hoverCompareRadius = 80; // Adjustable 50-400px

// Checkbox toggles comparison mode
hoverCompareCheckbox.addEventListener('change', (e) => {
    hoverCompareEnabled = e.target.checked;
    // Show/hide radius slider
    radiusControl.style.display = e.target.checked ? 'flex' : 'none';
    // Re-render current image
    showImageAtIndex(currentImageIndex);
});

// Slider adjusts reveal radius
hoverRadiusSlider.addEventListener('input', (e) => {
    hoverCompareRadius = parseInt(e.target.value);
    hoverRadiusValue.textContent = `${hoverCompareRadius}px`;
    showImageAtIndex(currentImageIndex); // Live update
});
```

**Rendering Logic** (`showImageAtIndex`):
```javascript
// Check if hover comparison should be used
const shouldUseHoverCompare = hoverCompareEnabled && hasInputImage && !isVideo && !shouldShowVideoInput;

if (shouldUseHoverCompare) {
    // Hide regular image, show comparison container
    detailImage.style.display = 'none';
    comparisonContainer.style.display = 'block';
    
    const inputSrc = `/api/image/input/${inputPath}`;
    const outputSrc = `/outputs/${imagePath}`;
    
    // Invert base/reveal based on "Show Input" toggle
    if (showingInputImage) {
        // Inverted: base=output, hover reveals input
        inputImg.src = outputSrc;
        outputImg.src = inputSrc;
    } else {
        // Normal: base=input, hover reveals output
        inputImg.src = inputSrc;
        outputImg.src = outputSrc;
    }
    
    initializeHoverComparison(comparisonContainer);
}
```

**Mouse Tracking** (`initializeHoverComparison`):
```javascript
function initializeHoverComparison(container) {
    const revealImage = document.getElementById('comparisonOutputImage');
    
    function updateMask(e) {
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Circular clip-path reveals output at mouse position
        revealImage.style.clipPath = `circle(${hoverCompareRadius}px at ${x}px ${y}px)`;
    }
    
    function resetMask() {
        revealImage.style.clipPath = 'circle(0px at 50% 50%)';
    }
    
    container.addEventListener('mousemove', updateMask);
    container.addEventListener('mouseleave', resetMask);
    
    // Touch support for mobile
    container.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const rect = container.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            revealImage.style.clipPath = `circle(${hoverCompareRadius}px at ${x}px ${y}px)`;
        }
    });
}
```

**CSS** (`static/style.css`):
```css
.image-comparison-container {
    position: relative;
    max-width: 100%;
    max-height: 60vh;
    overflow: hidden;
    border-radius: 8px;
    cursor: crosshair;
}

.comparison-base {
    display: block;
    max-width: 100%;
    max-height: 60vh;
    object-fit: contain;
    user-select: none;
}

.comparison-mask-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}

.comparison-reveal {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    clip-path: circle(0px at 50% 50%);
    transition: clip-path 0.05s ease-out;
    user-select: none;
}
```

**Visibility Logic** (`updateInputImageToggleVisibility`):
```javascript
// Show hover compare controls only for images with input (not videos)
const shouldShowMatchSizes = hasInputImage && !hasVideoSourceImage;
if (hoverCompareLabel) {
    hoverCompareLabel.style.display = shouldShowMatchSizes ? 'inline-flex' : 'none';
}

// Show radius slider only when hover compare is enabled
if (hoverRadiusControl) {
    const shouldShowRadiusControl = shouldShowMatchSizes && hoverCompareEnabled;
    hoverRadiusControl.style.display = shouldShowRadiusControl ? 'flex' : 'none';
}
```

**Key Behaviors:**
- **Automatic Toggle**: Hover compare checkbox appears only when viewing i2i image (has input image)
- **Radius Control**: Slider appears when hover compare is enabled, disappears when disabled
- **Inverted Mode**: "Show Input" button inverts base/reveal (output base with input revealed)
- **Priority**: Hover compare takes precedence over standard "Show Input" toggle when enabled
- **Mobile Support**: Touch drag to reveal on mobile devices
- **Live Updates**: Changing slider updates comparison immediately without dismiss/reopen

**Fullscreen Implementation:**
Hover comparison also works in fullscreen view with synced controls:

```html
<!-- Fullscreen controls have same checkbox and slider -->
<label class="fullscreen-control-label" id="fullscreenHoverCompareLabel">
    <input type="checkbox" id="fullscreenHoverCompareCheckbox" class="checkbox-input">
    <span>Hover Compare</span>
</label>
<div id="fullscreenHoverRadiusControl" style="display: none;">
    <input type="range" id="fullscreenHoverRadiusSlider" min="50" max="400" value="80" step="10">
    <span id="fullscreenHoverRadiusValue">80px</span>
</div>

<!-- Fullscreen has its own comparison container -->
<div id="fullscreenComparisonContainer" class="fullscreen-comparison-container">
    <img id="fullscreenComparisonInputImage" class="comparison-base">
    <div id="fullscreenComparisonMaskContainer" class="comparison-mask-container">
        <img id="fullscreenComparisonOutputImage" class="comparison-reveal">
    </div>
</div>
```

**State Synchronization:**
```javascript
// Modal and fullscreen checkboxes sync with each other
hoverCompareCheckbox.addEventListener('change', (e) => {
    hoverCompareEnabled = e.target.checked;
    const fsCheckbox = document.getElementById('fullscreenHoverCompareCheckbox');
    if (fsCheckbox) fsCheckbox.checked = hoverCompareEnabled;
    // Update both modal and fullscreen views
});

// Sliders sync in both directions
hoverRadiusSlider.addEventListener('input', (e) => {
    hoverCompareRadius = parseInt(e.target.value);
    const fsSlider = document.getElementById('fullscreenHoverRadiusSlider');
    if (fsSlider) fsSlider.value = hoverCompareRadius;
    // Re-render both modal and fullscreen if active
});
```

**Fullscreen Rendering** (`showFullscreenImage`):
```javascript
const shouldUseHoverCompare = hoverCompareEnabled && hasInputImage && !isVideo && !shouldShowVideoInput;

if (shouldUseHoverCompare) {
    const comparisonContainer = document.getElementById('fullscreenComparisonContainer');
    fsImage.style.display = 'none';
    comparisonContainer.style.display = 'block';
    
    // Same inversion logic as modal
    if (showingInputImage) {
        inputImg.src = outputSrc;
        outputImg.src = inputSrc;
    } else {
        inputImg.src = inputSrc;
        outputImg.src = outputSrc;
    }
    
    initializeFullscreenHoverComparison(comparisonContainer);
}
```

**Fullscreen CSS:**
```css
.fullscreen-comparison-container {
    position: relative;
    max-width: 90vw;
    max-height: 90vh;
    overflow: hidden;
    cursor: crosshair;
}

.fullscreen-comparison-container .comparison-base {
    display: block;
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
    user-select: none;
}
```

### Import from Video
When importing parameters from a video, detect type and populate Video tab:
```javascript
function importImageData() {
    const isVideo = currentImageData.job_type === 'video';
    
    if (isVideo) {
        // Populate Video tab fields
        document.getElementById('videoPrompt').value = currentImageData.prompt || '';
        document.getElementById('videoFrames').value = currentImageData.frames || 64;
        document.getElementById('videoFps').value = currentImageData.fps || 16;
        document.getElementById('videoMegapixels').value = currentImageData.megapixels || 0.25;
        switchTab('video');  // Switch to Video tab
    } else {
        // Populate Image tab fields (standard parameters)
        switchTab('single');  // Switch to Image tab
    }
}
```hon app.py                    # Start server on port 4879
python -m py_compile <file>      # Check syntax
# No hot reload - restart after Python changes
# Frontend (HTML/CSS/JS) - just refresh browser (Ctrl+F5 for hard refresh)
```

## Key API Endpoints

**Authentication:**
- `POST /api/auth/login` - Login with password and remember me flag
- `POST /api/auth/logout` - Clear session and cookies
- `GET /api/auth/check` - Check authentication status

**Generation:**
- `POST /api/queue/image` - Queue single image generation
- `POST /api/queue/batch` - Queue CSV batch with parameter placeholders
- `POST /api/queue/image-batch` - Queue folder of images for batch processing
- `POST /api/queue/video` - Queue single video generation
- `POST /api/queue/video-batch` - Queue folder of images to convert to videos
- `POST /api/queue/tts` - Queue text-to-speech batch generation
- `GET /api/queue/status` - Get queue and completed jobs
- `POST /api/queue/pause` - Pause/unpause queue processing
- `POST /api/queue/reorder` - Reorder queued item to new position (drag & drop)
- `POST /api/queue/cancel/<job_id>` - Cancel queued job
- `POST /api/queue/clear` - Clear all queued (not active) jobs
- `GET /api/batch-instructions` - Get inline batch CSV instructions (no external file)

**Frame Edit:**
- `POST /api/frame-edit/extract` - Extract frames from video with time range/frame skip (saves to input/frame_edit/)
- `GET /api/frame-edit/count` - Count frames in input/frame_edit folder
- `GET /api/frame-edit/count-output` - Count frames in outputs/images/frame_edit folder
- `POST /api/frame-edit/process` - Queue batch AI processing for all frames in folder
- `POST /api/frame-edit/stitch` - Stitch frames back to video using FFmpeg (source: input or output)

**Chat & AI:**
- `GET /api/ollama/health` - Check if Ollama server is running
- `GET /api/ollama/models` - List available Ollama models
- `POST /api/chat/message` - Send chat message (SSE streaming response)
- `GET /api/chat/sessions` - List all chat sessions
- `POST /api/chat/sessions` - Create new chat session
- `GET /api/chat/sessions/<session_id>` - Get specific chat session
- `PUT /api/chat/sessions/<session_id>` - Update session (name, settings, messages)
- `DELETE /api/chat/sessions/<session_id>` - Delete chat session
- `POST /api/chat/sessions/<session_id>/duplicate` - Duplicate with optional settings/messages
- `POST /api/chat/sessions/<session_id>/clear` - Clear chat history
- `POST /api/chat/generate_name` - Auto-generate session name from chat context
- `GET /api/chat/stream/<session_id>/<response_id>` - SSE stream for response
- `POST /api/story/sessions` - Create new story session
- `GET /api/story/sessions/<session_id>` - Get specific story session
- `PUT /api/story/sessions/<session_id>` - Update story (title, characters, lorebook)
- `DELETE /api/story/sessions/<session_id>` - Delete story session
- `POST /api/story/sessions/<session_id>/duplicate` - Duplicate with optional settings/messages
- `POST /api/story/message` - Send story message (queued with lorebook processing)
- `GET /api/story/stream/<session_id>/<response_id>` - SSE stream for story response
- `POST /api/autochat/sessions` - Create new Auto Chat session with dual personas
- `GET /api/autochat/sessions` - List all Auto Chat sessions
- `GET /api/autochat/sessions/<session_id>` - Get specific Auto Chat session
- `PUT /api/autochat/sessions/<session_id>` - Update session (persona configs, messages)
- `DELETE /api/autochat/sessions/<session_id>` - Delete Auto Chat session
- `POST /api/autochat/start` - Start autonomous conversation (queues first message)
- `POST /api/autochat/stop` - Stop running conversation
- `POST /api/autochat/continue` - Resume stopped conversation
- `POST /api/autochat/manual-message` - User injects message as either persona
- `GET /api/autochat/stream/<session_id>/<response_id>` - SSE stream for response
- `GET /api/autochat/status/<session_id>` - Poll for new messages (300ms fallback)

**File Management:**
- `GET /api/browse?path=<subfolder>` - Browse folder with metadata
- `GET /api/browse_images?folder=input` - List images from ComfyUI input
- `GET /api/reveal?path=<subfolder>` - Get input/output pairs for reveal browser
- `GET /api/browse_audio?folder=output` - List TTS audio batches
- `GET /api/audio/download/<file_id>` - Download single audio sentence by file ID
- `POST /api/audio/merge_batch` - Merge selected audio files from batch and download as single WAV
- `POST /api/upload` - Upload image to ComfyUI input (returns filename)
- `POST /api/copy_to_input` - Copy image from output to input
- `POST /api/folder` - Create subfolder
- `POST /api/move` / `POST /api/delete` - Batch operations

**System:**
- `POST /api/comfyui/unload` - Unload all models (ComfyUI + Ollama + Gradio TTS) and clear memory (manual trigger)
- `GET /api/comfyui/status` - Get system status
- `GET /api/hardware/stats` - CPU/RAM/GPU/VRAM usage (psutil, nvidia-smi)

**Response Format**: All write endpoints return `{success: bool, ...}`. Always check `result.success`.

## Common Modifications

**Add Image Generation Parameter:**  
1. HTML input in `templates/index.html` (single form)
2. Capture in `generateImage()` (script.js)  
3. Add to job dict in `add_to_queue()` (app.py)
4. Add to `modify_workflow()` and `generate_image()` signatures (comfyui_client.py)
5. Update workflow node using ID from `Qwen_Full (API).json`
6. Store in `add_metadata_entry()` (app.py)
7. Display in `renderMetadata()` (script.js)
8. Update `importImageData()` (script.js)

**Add Video Generation Parameter:**
1. HTML input in Video tab (templates/index.html)
2. Capture in `generateVideo()` (script.js)
3. Add to video job dict in `add_to_queue()` (app.py)
4. Update `generate_video()` call in `process_queue()` (app.py)
5. Modify both Wan2.2 I2V workflow nodes in `generate_video()` (comfyui_client.py)
6. Add to video metadata in `add_metadata_entry()` (app.py)
7. Display in `renderMetadata()` video section (script.js)

**Add Chat Feature:**
1. Create Ollama client method in `ollama_client.py`
2. Add route in `app.py` (typically returns JSON or SSE stream)
3. Add job type to queue processing in `process_queue()` if needed
4. Add frontend handler in `script.js`
5. Update tab UI in `templates/index.html`
6. Consider session storage in `chat_sessions.json` or `c2c_sessions.json`

**Change ComfyUI Workflow (Image/Video only):**  
1. Export workflow from ComfyUI as JSON
2. Save as `Qwen_Full (API).json`, `Wan2.2 I2V (API).json`, or `Wan2.2 I2V NSFW (API).json`
3. Find node IDs (inspect workflow JSON structure)
4. Update node IDs in `comfyui_client.py` - `modify_workflow()` or `generate_video()`
5. Test with single generation

**Note**: TTS now uses Gradio ChatterBox API (not ComfyUI) - see `gradio_tts_client.py` for implementation

**Fix Button Click Issues:**
If buttons don't respond to clicks, add inline onclick:
```html
<button id="myBtn" onclick="myFunction(); return false;">Click Me</button>
```

## File Structure
```
├── app.py                      # Flask backend (5122 lines: queue, metadata, auth, hardware, story/lorebook, TTS)
├── comfyui_client.py           # Stdlib ComfyUI wrapper (731 lines: urllib, json) - UTF-8!
├── gradio_tts_client.py        # Gradio TTS client (285 lines: engine management, TTS generation)
├── ollama_client.py            # Stdlib Ollama wrapper (281 lines: urllib, json)
├── requirements.txt            # 5 dependencies: flask, psutil, pydub, mutagen, gradio_client
├── templates/
│   ├── index.html              # 14-tab SPA with inline onclick handlers
│   └── login.html              # Login page with password authentication
├── static/
│   ├── script.js               # Vanilla JS (queue polling, chat streaming, rendering)
│   ├── story.js                # Story tab logic (sessions, messaging, streaming)
│   ├── story_modals.js         # Character/lorebook manager modals
│   ├── autochat.js             # Auto Chat tab logic (~1100 lines)
│   ├── style.css               # Multi-theme system, mobile responsive
│   └── assets/                 # Theme icons
│       ├── velvet_icon.png     # Velvet theme icon (default, used for favicon)
│       ├── dark_icon.png       # Dark theme icon (also used for light theme)
│       ├── light_icon.png      # Light theme icon (unused, uses dark_icon)
│       ├── ocean_icon.png      # Ocean theme icon
│       └── sunset_icon.png     # Sunset theme icon
├── outputs/                    # Gitignored - all generated content + metadata
│   ├── metadata.json           # Flat array of all generations
│   ├── queue_state.json        # Persistent queue state
│   ├── images/                 # Image outputs (with subfolders)
│   │   └── frame_edit/         # Frame Edit AI-processed frames
│   ├── videos/                 # Video outputs (with subfolders)
│   │   └── frame_edit/         # Frame Edit stitched videos
│   ├── audio/                  # TTS audio outputs (with subfolders)
│   └── chats/                  # Chat/story session storage
│       ├── chats.json          # Chat sessions
│       ├── stories.json        # Story sessions with characters/lorebook
│       └── autochat.json       # Auto Chat sessions with dual personas
├── workflows/
│   ├── Qwen_Full (API).json          # Image generation (node IDs documented)
│   ├── Wan2.2 I2V (API).json         # Video generation (node IDs documented)
│   └── Wan2.2 I2V NSFW (API).json    # NSFW video (node IDs documented)
├── cache/                      # Empty cache dirs for ML frameworks
└── *.json                      # Pinokio integration (install, start, update, reset)
```

## State Variables (script.js)

```javascript
let currentImageIndex = 0;                    // Gallery navigation
let images = [];                              // All images/videos in view
let currentPath = '';                         // Browser folder path
let zoomLevel = 1;                            // Fullscreen zoom (1-5x)
let uploadedImageFilename = null;             // Single tab uploaded image
let uploadedVideoImageFilename = null;        // Video tab uploaded image
let imageBrowserMode = 'single';              // 'single', 'batch', 'image-batch', 'video', or 'video-batch'
let currentBrowserFolder = 'input';           // 'input' or 'output' for browser
let selectedImageBatchFolder = '';            // Selected folder for image batch
let selectedVideoBatchFolder = '';            // Selected folder for video batch
let revealShowOutput = true;                  // Reveal browser: show output vs input (images only now)
let videosCurrentPath = '';                   // Video browser current folder
let videosItems = [];                         // Videos in current video browser view
let chatEventSource = null;                   // SSE connection for chat streaming
let chat2chatPollingInterval = null;          // Polling interval for Chat to Chat updates
let currentChatSessionId = null;              // Current active chat session
let currentC2CSessionId = null;               // Current active Chat to Chat session
```

## Keyboard Shortcuts

**Anywhere:** `Ctrl+Enter` - Trigger generation  
**Fullscreen:** `←/→` or `A/D` (navigate), `+/-/0` (zoom), `Space` (autoplay), `Esc` (exit)  
**Modal:** `←/→` (navigate), `Esc` (close)

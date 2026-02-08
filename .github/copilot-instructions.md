# Velvet Reverie - AI Agent Instructions

## Project Overview
Flask-based web UI for AI-powered content generation. Coordinates three external services:
- **ComfyUI** (`127.0.0.1:8188`) - Image/video generation via JSON workflows
- **Ollama** (`127.0.0.1:11434`) - Chat/story AI with streaming responses
- **Gradio ChatterBox TTS** (`127.0.0.1:7860`) - Text-to-speech generation

**Tech Stack**: Python 3.8+ (Flask, stdlib wrappers), Vanilla JavaScript (no frameworks), single-page application with 15 tabs.

## Architecture (4-Layer System)

`
Frontend (templates/index.html + static/*.js)
     REST API + SSE streaming
Flask Backend (app.py - 5.1k lines)
     Queue processor (background thread, LIFO display/FIFO execution)
     Workflow type tracking (auto model unloading on switches)
     Session-based auth (SHA-256 password hash, 30-day cookies)
     HTTP requests
External Services (ComfyUI, Ollama, Gradio TTS)
     Python stdlib clients (urllib, no external libs except gradio_client)
`

**Data Flow**: User  Queue (front insert)  Background thread (end pop, oldest first)  External service  `outputs/{media_type}/`  Metadata JSON

## Critical Patterns

### 1. File Encoding (Windows Compatibility)
**ALWAYS use UTF-8 encoding** for all file operations to handle Unicode characters on Windows:
```python
# CORRECT - Already implemented throughout codebase
with open(workflow_path, 'r', encoding='utf-8') as f:
    return json.load(f)

# INCORRECT - Causes UnicodeDecodeError on Windows
with open(workflow_path, 'r') as f:  # Uses system default (cp1252)
```

### 2. Media Type Folder Organization
**Purpose**: Separate outputs by media type, user subfolders nested inside.

```python
# Structure: outputs/{media_type}/{user_subfolder}/file.ext
def get_next_filename(prefix, subfolder, extension, media_type):
    if subfolder:
        target_dir = OUTPUT_DIR / media_type / subfolder
    else:
        target_dir = OUTPUT_DIR / media_type
    # Returns (relative_path, absolute_path)
```

**Usage**:
```python
# Image: outputs/images/myFolder/velvet0001.png
relative_path, output_path = get_next_filename('velvet', 'myFolder', 'png', 'images')

# Video: outputs/videos/myFolder/velvet0001.mp4
relative_path, output_path = get_next_filename('velvet', 'myFolder', 'mp4', 'videos')
```

### 3. Queue System (Thread-Safe LIFO/FIFO)
**Display**: LIFO (newest on top) | **Execution**: FIFO (oldest first)

```python
# Add to FRONT for display
with queue_lock:
    generation_queue.insert(0, job)

# Process from END (oldest first)
with queue_lock:
    if generation_queue and not active_generation and not queue_paused:
        job = generation_queue[-1]
        active_generation = job
```

**Job Types**: `'image'`, `'video'`, `'tts'`, `'chat'`, `'story'`, `'autochat'`, `'chat2chat'`

### 4. Workflow Type Tracking (Model Unloading)
**Purpose**: Prevent RAM/VRAM cramming by unloading models when switching workflow types.

```python
# Global state
last_workflow_type = None  # 'image_t2i', 'video', 'video_nsfw', 'tts', 'chat:model_name'

# BEFORE job starts - unload previous type
if last_workflow_type and last_workflow_type != current_workflow:
    if last_workflow_type == 'tts':
        gradio_tts_client.unload_all_engines()
    elif last_workflow_type.startswith('chat:'):
        ollama_client.unload_all_models()
    else:
        comfyui_client.unload_models()
    time.sleep(2)

# AFTER EVERY job - unload ALL models (critical for low VRAM systems)
comfyui_client.unload_models()
ollama_client.unload_all_models()
gradio_tts_client.unload_all_engines()
time.sleep(5)
```

### 5. Custom Dialogs (No Browser Alerts)
**Never use browser `confirm()` or `alert()`.** Always use custom modals:

```javascript
// CORRECT
const confirmed = await showConfirm('Delete this item?', 'Confirm Delete');
if (!confirmed) return;

// INCORRECT - Don't do this!
if (confirm('Delete this item?')) { }
```

### 6. Frontend Event Handlers (Critical Bug Fix)
**Problem**: `addEventListener` doesn't always fire on dynamically styled buttons.  
**Solution**: Use inline `onclick` in HTML for reliable event handling.

```html
<!-- CORRECT: Inline onclick for guaranteed execution -->
<button id="generateVideoBtn" onclick="generateVideo(); return false;">Generate</button>

<!-- INCORRECT: addEventListener may not fire -->
<script>
document.getElementById('generateVideoBtn').addEventListener('click', generateVideo);
</script>
```

**When to use inline onclick**: Video tab buttons, reorder buttons, any button that mysteriously doesn't respond.

## Development Workflow

### Setup & Run
```bash
pip install -r requirements.txt  # Flask, psutil, mutagen, pydub, gradio_client
python app.py                    # Starts on http://0.0.0.0:4879
```

**Dependencies**: Flask (required), others optional with graceful fallbacks. No hot reload - restart after Python changes.

### Configuration
```python
# app.py (line ~42) - Change password hash
PASSWORD_HASH = hashlib.sha256("your_password".encode()).hexdigest()

# app.py (line ~45) - ComfyUI token (if password protected)
COMFYUI_TOKEN = "$ 2b$ 12$ ..."  # From ComfyUI's ./PASSWORD file
```

### Adding a New Parameter

**1. Image Generation**:
```python
# 1. Add HTML input in templates/index.html
# 2. Capture in generateImage() (script.js)
# 3. Add to job dict in add_to_queue() (app.py)
# 4. Update generate_image() signature (comfyui_client.py)
# 5. Modify workflow node in workflows/Qwen_Full (API).json
# 6. Store in add_metadata_entry() (app.py)
# 7. Display in renderMetadata() (script.js)
```

**2. Video Generation**:
```python
# Same pattern, but modify both workflows:
# - workflows/Wan2.2 I2V (API).json
# - workflows/Wan2.2 I2V NSFW (API).json
```

## File Structure

```
 app.py                      # Flask backend (queue, auth, metadata)
 comfyui_client.py           # ComfyUI API wrapper (stdlib)
 ollama_client.py            # Ollama API wrapper (stdlib)
 gradio_tts_client.py        # Gradio TTS API wrapper
 requirements.txt            # Only 5 dependencies
 templates/
    index.html              # 15-tab SPA (9k lines)
    login.html              # Password authentication
 static/
    script.js               # Main UI logic (9.5k lines)
    autochat.js             # Dual AI conversations
    story.js                # Character roleplay system
    story_modals.js         # Character/lorebook managers
    style.css               # 5 themes (Violet, Dark, Light, Ocean, Sunset)
 workflows/                  # ComfyUI workflow JSON files
    Qwen_Full (API).json    # Image generation
    Wan2.2 I2V (API).json   # Video generation
    Wan2.2 I2V NSFW (API).json  # NSFW video
 outputs/                    # Generated content (gitignored)
     metadata.json           # Flat array of all generations
     queue_state.json        # Persistent queue state
     images/                 # Image outputs (with subfolders)
     videos/                 # Video outputs (with subfolders)
     audio/                  # TTS audio (with subfolders)
     chats/                  # Session storage
         chats.json          # Chat sessions
         stories.json        # Story sessions (characters + lorebook)
         autochat.json       # Auto Chat sessions (dual personas)
```

## Key API Endpoints

**Generation**:
- `POST /api/queue/image` - Queue single image
- `POST /api/queue/video` - Queue single video
- `POST /api/queue/tts` - Queue TTS batch
- `GET /api/queue/status` - Get queue state
- `POST /api/queue/pause` - Pause/unpause queue
- `POST /api/queue/reorder` - Reorder queued items (drag & drop)

**Chat/Story**:
- `POST /api/chat/message` - Send message (returns SSE stream)
- `GET /api/chat/sessions` - List sessions
- `POST /api/story/message` - Send story message (lorebook processing)
- `GET /api/story/stream/<session_id>/<response_id>` - SSE stream

**File Management**:
- `GET /api/browse?path=<folder>` - Browse with metadata
- `POST /api/upload` - Upload to ComfyUI input
- `POST /api/audio/merge_batch` - Merge TTS sentences to WAV

**All write endpoints return `{success: bool, ...}` - always check `result.success`.**

## Common Pitfalls

1. **Forgetting UTF-8 encoding**  UnicodeDecodeError on Windows
2. **Using browser confirm/alert**  Use `showConfirm()`/`showAlert()` instead
3. **addEventListener not firing**  Use inline `onclick` for critical buttons
4. **Not unloading models**  RAM/VRAM cramming, add cleanup after jobs
5. **Wrong media_type in get_next_filename**  Files end up in wrong folder (images/videos/audio)

## Multi-Theme System
5 themes using CSS variables: Violet (default), Dark, Light, Ocean, Sunset. Theme selector in top bar, persisted to localStorage. All colors use `var(--bg-primary)`, `var(--text-primary)`, etc. **When adding UI elements, always use CSS variables, never hardcoded colors.**

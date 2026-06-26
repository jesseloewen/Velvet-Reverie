# Velvet Reverie

Flask-based web UI for AI image/video generation, chat, and text-to-speech — with password protection, a persistent job queue, hardware monitoring, and organized file storage. Supports Qwen Image (4-step lightning), Wan2.2 I2V (image-to-video, including NSFW mode), ChatterBox TTS, and Ollama.

## Features

- **Password protection** — session-based auth with remember-me (30 days)
- **Multi-theme system** — 5 themes: Velvet, Dark, Light, Ocean, Sunset
- **Hardware monitor** — real-time CPU / RAM / GPU / VRAM bars (color-coded)
- **Mobile-optimized** — collapsible sidebars, touch controls, responsive layout
- **Image generation** — text-to-image and image-to-image with Qwen Lightning
- **Video generation** — image-to-video via Wan2.2 I2V, standard and NSFW workflows
- **Frame Edit** — extract frames → AI-process each frame → stitch back to video
- **Text-to-Speech** — batch TTS with ChatterBox, per-sentence regeneration, audio download
- **AI Chat** — streaming chat with any Ollama model, session management, branching
- **Story Mode** — character-driven storytelling with lorebook system
- **Auto Chat** — autonomous dual-AI persona conversations
- **Batch generation** — CSV parameter templates with `[placeholder]` support
- **Image Batch** — queue an entire input folder with one shared prompt
- **Video Batch** — convert entire folders of images to videos
- **Pinterest pipeline** — scrape images from Pinterest, deduplicate with pHash, filter with YOLO11n / OpenCV, then batch-queue for AI generation
- **Image Browser** — browse, organize, move, and delete generated images
- **Video Browser** — browse and play generated videos with inline preview
- **Viewer** — auto-refresh fullscreen viewer (zoom 100–500%, autoplay, keyboard nav)
- **Audio Browser** — manage TTS batches; per-sentence playback, full-text view, download
- **Reveal Browser** — pairs input images with their generated outputs side-by-side
- **LoRA controls** — MCNL, Snofs, and Male LoRA toggles with keyword hints
- **Persistent queue** — survives restarts, shared across all browsers, drag-to-reorder
- **Prompt history** — per-category localStorage dropdown (last 50 prompts)
- **Blur Media toggle** — one-click privacy blur on all images and videos

## Tab URLs

Each section of the app has its own URL — bookmark or share directly:

| URL | Tab |
|-----|-----|
| `/image` | Image generation |
| `/text-batch` | Text Batch generation |
| `/image-batch` | Image Batch |
| `/pinterest` | Pinterest scraper |
| `/video` | Video generation |
| `/video-batch` | Video Batch |
| `/frame-edit` | Frame Edit pipeline |
| `/browser` | Image Browser |
| `/video-browser` | Video Browser |
| `/viewer` | Viewer |
| `/chat` | Chat |
| `/story` | Story Mode |
| `/autochat` | Auto Chat |
| `/tts` | Text-to-Speech |
| `/audio` | Audio Browser |

Navigating between tabs updates the URL via `history.pushState` (no full reload). The browser back/forward buttons work as expected.

## Security & Authentication

- **Default password:** `password` — **change this immediately**
- **Remember me:** 30-day cookie (enabled by default)
- **Secure sessions:** Flask sessions with HTTP-only cookies
- **Auto-logout:** redirects to login on session expiry

### Changing the Password

Generate a SHA-256 hash for your new password:

```bash
python -c "import hashlib; print(hashlib.sha256(b'your_password').hexdigest())"
```

Then set `PASSWORD_HASH` in your `.env` file (or directly in `app.py`) and restart.

## Requirements

The following services must be running before starting the app:

| Service | Default address |
|---------|----------------|
| ComfyUI | `http://127.0.0.1:8188` |
| Ollama | `http://127.0.0.1:11434` |
| ChatterBox TTS (subprocess) | managed automatically |

Additional system tools:
- **ffmpeg** — required for audio merging (add to PATH)
- **nvidia-smi** — optional, enables GPU / VRAM monitoring

ComfyUI models needed:
- Qwen Image model (diffusion, CLIP, VAE, LoRA)
- Wan2.2 I2V (standard + NSFW variants)

## Quick Start

```bash
pip install -r requirements.txt
python app.py          # http://localhost:4879
```

Log in with the default password `password`, then change it.

## Project Structure

```
app.py                          # Flask backend — only Python file in root
requirements.txt

lib/                            # Supporting Python modules
├── __init__.py
├── chatterbox_server.py        # ChatterBox TTS FastAPI subprocess server
├── comfyui_client.py           # ComfyUI API client (stdlib urllib)
├── ollama_client.py            # Ollama API client (stdlib urllib)
├── gradio_tts_client.py        # ChatterBox TTS HTTP client + subprocess manager
├── media_index.py              # In-memory media index with pickle cache
├── pinterest_client.py         # Pinterest scraper (pHash dedup + YOLO filter)
└── setup_pinterest.py          # One-time Pinterest dependency installer + login
.env                            # Runtime config (gitignored)
.env.example                    # Config template

models/
└── yolo/
    └── yolo11n.pt              # Auto-downloaded on first Pinterest use

static/
├── assets/                     # Theme icons (velvet, dark, ocean, sunset)
├── css/
│   ├── main.css                # @imports all modules below
│   ├── themes.css              # CSS custom properties for all 5 themes + reset
│   ├── layout.css              # Sidebars, header, hardware monitor, content wrapper
│   ├── components.css          # Buttons, forms, modals, queue items, collapsibles
│   ├── browser.css             # Gallery grid, fullscreen viewer, zoom, hover compare
│   ├── chat.css                # Chat / story / autochat UI
│   ├── tts.css                 # TTS panel, audio batch player
│   └── misc.css                # Prompt history, Pinterest badges, scrollbar
├── js/
│   ├── core.js                 # Globals, state, init, tab switching, theme, hardware
│   ├── queue.js                # Queue rendering, drag-drop reorder, navigation
│   ├── image.js                # Single / text-batch / image-batch generation
│   ├── video.js                # Video / video-batch / frame-edit generation
│   ├── browser.js              # Image browser, video browser, viewer, fullscreen
│   ├── tts.js                  # TTS generation, audio browser, batch playback
│   └── chat.js                 # Chat, story, autochat, conversation audio
├── autochat.js                 # Auto Chat UI logic
├── story.js                    # Story mode with lorebook
├── story_modals.js             # Story character / lorebook modals
├── pinterest.js                # Pinterest scrape + queue pipeline UI
├── prompt_history.js           # Per-category prompt history (localStorage)
└── video-player.js             # Custom HTML5 video player widget

templates/
├── index.html                  # App shell — includes all tab templates
├── login.html                  # Password login page
└── tabs/
    ├── tab_image.html
    ├── tab_text_batch.html
    ├── tab_image_batch.html
    ├── tab_pinterest.html
    ├── tab_video.html
    ├── tab_video_batch.html
    ├── tab_frame_edit.html
    ├── tab_browser.html
    ├── tab_video_browser.html
    ├── tab_viewer.html
    ├── tab_chat.html
    ├── tab_story.html
    ├── tab_autochat.html
    ├── tab_tts.html
    └── tab_audio.html

workflows/
├── Qwen_Full (API).json
├── Wan2.2 I2V (API).json
└── Wan2.2 I2V NSFW (API).json

outputs/                        # Generated content (gitignored)
├── images/
├── videos/
├── audio/
├── chats/
├── metadata.json
└── queue_state.json
```

## Configuration (`.env`)

```ini
FLASK_HOST=0.0.0.0
FLASK_PORT=4879
FLASK_SECRET_KEY=velvet-reverie-secret-key
SESSION_LIFETIME_DAYS=30
PASSWORD_HASH=<sha256 hash>

COMFYUI_HOST=127.0.0.1
COMFYUI_PORT=8188
COMFYUI_TOKEN=

OLLAMA_HOST=127.0.0.1
OLLAMA_PORT=11434

GRADIO_HOST=127.0.0.1
GRADIO_PORT=8765

OUTPUT_DIR=outputs
INPUT_DIR=input
TTS_AUDIO_INPUT_DIR=input/audio_tts
COMFYUI_INPUT_DIR=../ComfyUI/input/
COMFYUI_OUTPUT_DIR=../ComfyUI/output/
WORKFLOWS_DIR=workflows

WORKFLOW_QWEN=Qwen_Full (API).json
WORKFLOW_VIDEO=Wan2.2 I2V (API).json
WORKFLOW_VIDEO_NSFW=Wan2.2 I2V NSFW (API).json

PINTEREST_COOKIES_PATH=pinterest_cookies.json
PINTEREST_DEDUP_BASE_FOLDER=
```

## Keyboard Shortcuts

**Anywhere:**
- `Ctrl+Enter` / `Cmd+Enter` — generate image or video

**Fullscreen Viewer:**
- `←` / `→` or `A` / `D` — navigate
- `+` / `-` — zoom in / out
- `0` — reset zoom to 100%
- `Space` — toggle autoplay
- `Esc` — exit fullscreen

**Image Modal:**
- `←` / `→` — previous / next
- `Esc` — close

## Pinterest Pipeline

### Prerequisites

1. Install Pinterest dependencies (one-time):
   ```bash
   python lib/setup_pinterest.py
   ```

2. Save your Pinterest session cookies:
   ```bash
   python lib/setup_pinterest.py --login          # email/password
   python lib/setup_pinterest.py --login --google # Google account (opens Firefox)
   ```
   Cookies are saved to `pinterest_cookies.json` (path set by `PINTEREST_COOKIES_PATH`).

> `pinterest_cookies.json` contains session credentials — it is gitignored and must never be committed.

### Workflow

1. **Download** — enter a search query or Pinterest URL, set image count, optional dedup (pHash) and content filters (YOLO person / OpenCV face detection)
2. **Process Existing Folder** — run dedup and content filtering on already-downloaded folders without re-scraping
3. **Open in Batch** — send any Pinterest folder directly to Image Batch or Video Batch and queue for generation

### Content Filter Dependencies

| Library | Purpose |
|---------|---------|
| `ultralytics` | YOLO11n person detection |
| `opencv-python` | Haar cascade face detection |

Both are in `requirements.txt`. If `ultralytics` is missing the content filter checkboxes are disabled with a warning badge; everything else continues to work.

## Generation Parameters

### Image
| Parameter | Default | Range |
|-----------|---------|-------|
| width | 1024 | 64–2048 (step 64) |
| height | 1024 | 64–2048 (step 64) |
| steps | 4 | 1–100 |
| cfg | 1.0 | 0.1–20.0 |
| shift | 3.0 | 0.0–10.0 |
| seed | random | optional |
| file_prefix | velvet | optional |
| subfolder | — | optional |

### Video
| Parameter | Default | Range |
|-----------|---------|-------|
| frames | 64 | 10–200 |
| fps | 16 | 8–60 |
| megapixels | 0.25 | 0.1–2.0 |
| seed | random | optional |
| nsfw | false | boolean |

## API Endpoints

### Auth
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/check`

### Tab URLs
- `GET /` — root (redirects to Image tab or login)
- `GET /image`, `/text-batch`, `/image-batch`, `/pinterest`
- `GET /video`, `/video-batch`, `/frame-edit`
- `GET /browser`, `/video-browser`, `/viewer`
- `GET /chat`, `/story`, `/autochat`
- `GET /tts`, `/audio`

### Queue
- `POST /api/queue` — image or video job
- `GET /api/queue` — queue status
- `DELETE /api/queue/<job_id>`
- `POST /api/queue/batch` — CSV batch
- `POST /api/queue/image-batch`
- `POST /api/queue/video-batch`
- `POST /api/queue/tts`
- `POST /api/queue/tts/regenerate`
- `POST /api/queue/pause`
- `POST /api/queue/reorder`
- `POST /api/queue/clear`
- `POST /api/cancel/<job_id>`

### Browse & Files
- `GET /api/browse`
- `GET /api/browse_images`
- `GET /api/browse_audio`
- `GET /api/browse_audio_files`
- `POST /api/folder`
- `POST /api/move`
- `POST /api/delete`
- `POST /api/upload`
- `POST /api/copy_to_input`
- `POST /api/copy_folder_to_input`
- `GET /api/recent`
- `GET /outputs/<path>`
- `GET /api/video/<path>`
- `GET /api/thumbnail/<path>`
- `GET /api/image/input/<path>`
- `GET /api/audio/input/<path>`
- `GET /api/audio/download/<file_id>`
- `POST /api/audio/merge_batch`

### Chat / Story / Auto Chat
- `GET|POST /api/chat/sessions`
- `GET|PUT|DELETE /api/chat/sessions/<id>`
- `POST /api/chat/sessions/<id>/duplicate`
- `POST /api/chat/message`
- `GET /api/chat/stream/<session_id>/<response_id>`
- `POST /api/chat/generate_name`
- `GET /api/chat/sessions/<id>/audio/download`
- `GET|POST /api/story/sessions` (same pattern)
- `POST /api/story/message`
- `GET /api/story/stream/<session_id>/<response_id>`
- `GET|POST /api/autochat/sessions` (same pattern)
- `POST /api/autochat/start`
- `POST /api/autochat/manual_message`
- `GET /api/autochat/stream/<session_id>/<response_id>`
- `POST /api/autochat/sessions/<id>/stop`
- `POST /api/autochat/sessions/<id>/continue`

### Frame Edit
- `POST /api/frame-edit/extract`
- `GET /api/frame-edit/count`
- `POST /api/frame-edit/process`
- `GET /api/frame-edit/count-output`
- `POST /api/frame-edit/stitch`

### System
- `GET /api/hardware/stats`
- `GET /api/ollama/health`
- `GET /api/ollama/models`
- `GET /api/gradio_tts/health`
- `POST /api/comfyui/unload`
- `POST /api/settings/auto-unload`
- `POST /api/thumbnails/generate-all`

### Pinterest
- `GET /api/pinterest/cookies-status`
- `POST /api/pinterest/scrape`
- `GET /api/pinterest/job/<job_id>`
- `GET /api/pinterest/jobs`
- `GET /api/pinterest/dedup-available`
- `GET /api/pinterest/yolo-available`
- `GET /api/pinterest/list-folders`
- `POST /api/pinterest/process-folder`

## Development Notes

- **Frontend changes** (HTML / CSS / JS) — browser refresh only (Ctrl+F5)
- **Backend changes** (`app.py` or other `.py` files) — restart the Flask server
- Queue processing runs in a background daemon thread
- ComfyUI and Ollama clients use Python stdlib only (`urllib`, `json`)
- All file I/O uses `encoding='utf-8'`
- Auto-unload: models are freed after every completed job (ComfyUI `/free`, Ollama `keep_alive=0`, ChatterBox `/unload`); configurable via the Auto-Unload toggle in the hardware monitor strip

## Privacy

- `outputs/` is gitignored
- `pinterest_cookies.json` is gitignored
- All metadata stored locally in `outputs/metadata.json`

## License

Open source — free to use and modify.

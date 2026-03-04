# Velvet Reverie - AI Agent Guide

## Architecture Overview
Flask backend + vanilla JS frontend for AI media generation (no build tools). Three Python clients communicate with external services:
- **comfyui_client.py**: Image/video generation via ComfyUI API (configurable via `COMFYUI_HOST:PORT`)
- **ollama_client.py**: Chat/story AI via Ollama API (configurable via `OLLAMA_HOST:PORT`)  
- **gradio_tts_client.py**: Text-to-speech via Gradio ChatterBox (configurable via `GRADIO_HOST:PORT`)

Data flows: User → Queue (LIFO display, FIFO processing) → Workflow Client → External Service → Metadata + File Storage

## Configuration System (NEW)
**Environment Variables:** All paths and settings use `.env` file (loaded via python-dotenv):
```python
# app.py initialization
load_dotenv()  # Loads .env at startup
FLASK_HOST = os.getenv('FLASK_HOST', '0.0.0.0')
OUTPUT_DIR = Path(os.getenv('OUTPUT_DIR', 'outputs'))
```

**Critical:** Define Flask config vars BEFORE using them:
```python
# CORRECT: Define at module level (after load_dotenv)
FLASK_HOST = os.getenv('FLASK_HOST', '0.0.0.0')
FLASK_PORT = int(os.getenv('FLASK_PORT', '4879'))
# Later in __main__:
app.run(host=FLASK_HOST, port=FLASK_PORT)

# WRONG: Reading env in __main__ without defining constants
app.run(host=os.getenv('FLASK_HOST'))  # NameError if referenced elsewhere
```

**Key environment variables** (see `.env.example`):
- Service endpoints: `COMFYUI_HOST/PORT`, `OLLAMA_HOST/PORT`, `GRADIO_HOST/PORT`
- Paths: `OUTPUT_DIR`, `WORKFLOWS_DIR`, `COMFYUI_INPUT_DIR`, `COMFYUI_OUTPUT_DIR`
- Workflow files: `WORKFLOW_QWEN`, `WORKFLOW_VIDEO`, `WORKFLOW_VIDEO_NSFW`
- NOT in env (controlled by web UI): `queue_paused`, `auto_unload_models`

## Critical Patterns

### Queue System (`app.py` lines ~90-100)
- Thread-safe with `queue_lock`, starts **PAUSED** by default (`queue_paused = True`)
- Jobs added to front (`insert(0)`), processed from back (`.pop()`) for FIFO execution
- Four job types: `image`, `video`, `tts`, `chat/story/autochat` (different badge rendering)
- Persistent via `outputs/queue_state.json` with UTF-8 encoding (Windows compatibility)
- `queue_paused` and `auto_unload_models` are runtime flags (not env vars), defaults hardcoded

### Model Memory Management
**Default: FALSE** (changed from True). System can auto-unload models after job completion:
```python
# After job completes (app.py ~line 1200)
if auto_unload_models:  # Web UI controlled, default False
    comfyui_client.unload_models()
    ollama_client.unload_all_models()
    gradio_tts_client.unload_all_engines()
    time.sleep(5)
```

### Button Event Handlers (Known Issue)
Use inline `onclick="func()"` instead of `addEventListener` for reliable execution in complex layouts:
```html
<!-- CORRECT: Works reliably -->
<button onclick="generateVideo(); return false;">Generate</button>

<!-- AVOID: May not fire in some contexts -->
<script>btn.addEventListener('click', generateVideo)</script>
```

### File Encoding (Windows)
**Always** specify `encoding='utf-8'` for JSON operations:
```python
with open(file_path, 'r', encoding='utf-8') as f:  # Required on Windows
    data = json.load(f)
```

### Path References
All ComfyUI/Gradio paths use environment variables (not hardcoded):
```python
# CORRECT: Use env-configured paths
ref_audio_path = COMFYUI_INPUT_DIR / ref_audio_name
output_path = COMFYUI_OUTPUT_DIR / subfolder / filename

# WRONG: Hardcoded paths
ref_audio_path = Path('..') / 'comfy.git' / 'app' / 'input' / ref_audio_name
```

### Client Initialization Pattern
All clients accept config paths via constructor (not hardcoded internally):
```python
# app.py client setup
comfyui_client = ComfyUIClient(
    server_address=f"{COMFYUI_HOST}:{COMFYUI_PORT}",
    token=COMFYUI_TOKEN if COMFYUI_TOKEN else None,
    workflows_dir=str(WORKFLOWS_DIR),
    output_dir=str(COMFYUI_OUTPUT_DIR)  # Pass output path
)
```

### Media Type Organization
Files organized by type, not arbitrary folders:
```
outputs/
 images/[subfolder]/  # User subfolder nested in type folder
 videos/[subfolder]/
 audio/[subfolder]/
 chats/               # JSON session storage
```

## Development Commands
```powershell
python app.py                            # Start on :4879 (or FLASK_PORT from .env)
python -m py_compile app.py              # Syntax check
pip install -r requirements.txt          # Includes python-dotenv
curl http://127.0.0.1:8188/system_stats  # Test ComfyUI
curl http://127.0.0.1:11434/api/tags     # Test Ollama
```

## Pinokio Integration (NEW)
**Launcher files** for Pinokio app manager:
- `pinokio.js`: Menu definition (Start/Reset buttons)
- `start.js`: Launches Flask app with venv, reads port from `.env`
- `reset.js`: Clears outputs/cache folders

**Key pattern:** Use `__dirname` not `process.cwd()` for script-relative paths:
```javascript
// CORRECT: Relative to script location
const envPath = path.join(__dirname, '.env')

// WRONG: Relative to Pinokio installation
const envPath = path.join(process.cwd(), '.env')
```

## External Dependencies
Must be running before app.py starts:
- ComfyUI server with Qwen (image) + Wan2.2 I2V (video) workflows loaded
- Ollama server with at least one model installed
- Gradio ChatterBox TTS server (three engines: Standard, Multilingual, Turbo)

## Key Files
- `app.py` (~5680 lines): Main Flask app, queue processor, all routes
- `.env`: Configuration (gitignored), `.env.example`: Template with comments
- `static/script.js`: Core UI logic, queue rendering, image browser
- `static/autochat.js`: Dual AI persona conversations (autonomous mode)
- `static/story.js` + `story_modals.js`: Character-driven storytelling with lorebook
- `workflows/*.json`: ComfyUI workflow definitions with node IDs documented in comments
- `templates/index.html`: 14-tab SPA with dual collapsible sidebars (tabs left, queue right)
- `requirements.txt`: Includes `python-dotenv` for env loading

## Common Issues
1. **Unicode errors**: Missing `encoding='utf-8'` in file operations
2. **Queue not processing**: Check `queue_paused` flag (starts True by default)
3. **Models not unloading**: `auto_unload_models = False` by default (changed from True)
4. **Buttons not working**: Use inline `onclick` instead of addEventListener
5. **NameError on startup**: Flask config vars must be defined at module level before use
6. **Wrong paths in Pinokio**: Use `__dirname` not `process.cwd()` in .js files

## Authentication
Default password: `password` (hash in `.env` or `app.py` `PASSWORD_HASH`). Session-based with 30-day remember cookie. Generate new hash: `python -c "import hashlib; print(hashlib.sha256(b'yourpass').hexdigest())"`

# Velvet Reverie

Flask-based web UI for AI image/video generation, chat, and text-to-speech with queue management and multi-theme system.

## Features

- **Image Generation** - Text-to-image and image-to-image with Qwen Lightning
- **Video Generation** - Image-to-video using Wan2.2 I2V workflow
- **Text-to-Speech** - Batch audio generation with Gradio ChatterBox
- **AI Chat** - Interactive chat with Ollama models (streaming responses)
- **Story Mode** - Character-driven interactive storytelling with lorebook system
- **Auto Chat** - Dual AI autonomous conversations
- **Queue System** - Persistent job queue with pause/reorder capabilities
- **Multi-Theme System** - 5 customizable color themes (Violet, Dark, Light, Ocean, Sunset)
- **Password Protection** - Session-based authentication with remember me

## Requirements

- Python 3.8+
- **ComfyUI server** running at `http://127.0.0.1:8188`
- **Ollama server** running at `http://127.0.0.1:11434` (for chat features)
- **Gradio ChatterBox TTS** at `http://127.0.0.1:7860` (for TTS features)

## Installation

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure settings (optional):**
   - Edit `app.py` to change the password hash (line ~42)
   - Generate new hash: `hashlib.sha256("your_password".encode()).hexdigest()`
   - Set ComfyUI token if needed (line ~45)

## Usage

1. **Start the server:**
   ```bash
   python app.py
   ```
   
   **With custom host/port:**
   ```bash
   python app.py --host 127.0.0.1 --port 5000
   ```
   
   **Using environment variables:**
   ```bash
   # Windows
   set VELVET_HOST=127.0.0.1
   set VELVET_PORT=5000
   python app.py
   
   # Linux/Mac
   VELVET_HOST=127.0.0.1 VELVET_PORT=5000 python app.py
   ```

2. **Open in browser:**
   ```
   http://localhost:4879
   ```

3. **Login:**
   - Default password: `password`
   - Change this in production!

## Pinokio Integration

This application can be installed and run through [Pinokio](https://pinokio.computer) for automated setup with isolated Python environment. See the parent directory's README for details.

## Structure

```
├── app.py                      # Flask backend
├── comfyui_client.py           # ComfyUI API wrapper
├── ollama_client.py            # Ollama API wrapper
├── gradio_tts_client.py        # Gradio TTS API wrapper
├── requirements.txt            # Python dependencies
├── templates/                  # HTML templates
│   ├── index.html              # Main application interface
│   └── login.html              # Login page
├── static/                     # CSS and JavaScript
│   ├── style.css               # Styling and theme system
│   ├── script.js               # Main application logic
│   ├── autochat.js             # Auto Chat functionality
│   ├── story.js                # Story mode logic
│   └── story_modals.js         # Character/lorebook managers
├── workflows/                  # ComfyUI workflow JSON files
└── outputs/                    # Generated content (gitignored)
    ├── images/                 # Image outputs
    ├── videos/                 # Video outputs
    ├── audio/                  # TTS audio outputs
    └── chats/                  # Chat session storage
```

## Configuration

### Password Authentication
Edit `PASSWORD_HASH` in `app.py` (line ~42):
```python
PASSWORD_HASH = hashlib.sha256("your_password".encode()).hexdigest()
```

### ComfyUI Connection
If ComfyUI has password protection, set the token in `app.py` (line ~45):
```python
COMFYUI_TOKEN = "$2b$12$..."  # From ComfyUI's ./PASSWORD file
```

### Server Configuration
Configure host and port via command-line arguments (highest priority):
```bash
python app.py --host 127.0.0.1 --port 5000
```

Or environment variables:
```bash
set VELVET_HOST=127.0.0.1
set VELVET_PORT=5000
```

Or edit defaults in `app.py` if running standalone without arguments.

## License

This project is provided as-is for personal and educational use.

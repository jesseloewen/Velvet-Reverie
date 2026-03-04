# Velvet Reverie

Flask-based web UI for image/video generation, AI chat, text-to-speech, with **password protection**, queue management, and organized file storage. Supports Qwen Image model (4-step lightning), Wan2.2 I2V (image-to-video) with NSFW mode, Gradio ChatterBox TTS (audio), and Ollama (AI chat).

## Features

- 🔐 **Password protection** - Session-based authentication with remember me (30 days)
- 💜 **Multi-theme system** - 5 beautiful themes (Velvet, Dark, Light, Ocean, Sunset)
- 📁 **Organized storage** - Separate folders for images, videos, audio, and chat sessions
- 📊 **Hardware monitor** - Real-time CPU/RAM/GPU/VRAM usage with color-coded progress bars
- 📱 **Mobile-optimized** - Collapsible menus, touch-friendly controls, responsive design
- 🖼️ **Image generation** - Text-to-image and image-to-image with Qwen Lightning
- 🎬 **Video generation** - Image-to-video using Wan2.2 I2V workflow with NSFW mode support
- 🎥 **Frame Edit** - Complete video → frames → AI processing → video pipeline with 3-step UI
- 🗣️ **Text-to-Speech** - Batch TTS generation with voice display and full text viewer
- 💬 **AI Chat** - Interactive chat with Ollama models (streaming responses)
- 📚 **Story Mode** - Character-driven storytelling with lorebook system
- 🤖 **Auto Chat** - Autonomous dual AI persona conversations
- 🔄 **Smart workflow switching** - Automatic model unloading when switching between workflows
- 🎬 **Video batch processing** - Convert entire folders of images to videos
- 🎭 **Reveal Browser** - Automatically pairs input images with generated outputs
- 🎥 **Video Browser** - Dedicated tab for viewing generated videos only
- 🎵 **Audio Browser** - Manage TTS-generated audio with voice labels and playback
- 📊 **Batch generation** - CSV-based parameter templates with `[placeholder]` support
- 🖼️ **Image browser** - Browse and organize images (separated from videos)
- 🎛️ **LoRA controls** - Three toggle switches with keyword hints (MCNL, Snofs, Male)
- ⌨️ **Keyboard shortcuts** - Ctrl+Enter to generate, fullscreen navigation
- 📋 **Persistent queue** - Shared across users, survives restarts, shows count badge
- 📁 **Folder management** - Create, browse, move, delete with breadcrumbs
- 🖼️ **Image/Video viewer** - Fullscreen with zoom (100-500%), autoplay, keyboard nav
- 💾 **Metadata tracking** - All generation params saved automatically
- 🔔 **Toast notifications** - Custom modals, no browser dialogs

## Security & Authentication

### Password Protection
The web interface is protected with password authentication:

- **Default password:** `password` ⚠️ **Change immediately!**
- **Remember me:** Keeps you logged in for 30 days (default enabled)
- **Secure sessions:** Flask sessions with HTTP-only cookies
- **Auto-logout:** Automatic redirect to login on session expiry

### Changing the Password

1. Open `app.py` and find the `PASSWORD_HASH` variable (line ~22)
2. Generate a new password hash using Python:
   ```python
   import hashlib
   new_password = "your_secure_password"
   print(hashlib.sha256(new_password.encode()).hexdigest())
   ```
3. Replace the hash in `app.py` with your new hash
4. Restart the application

**Quick command:**
```powershell
python -c "import hashlib; print(hashlib.sha256(b'your_password').hexdigest())"
```

See [PASSWORD_README.md](PASSWORD_README.md) for detailed instructions.

## File Organization

```
outputs/
├── metadata.json          # Shared metadata for all generations
├── queue_state.json       # Persistent queue state
├── images/                # Generated images
├── videos/                # Generated videos
├── audio/                 # TTS audio files
└── chats/                 # Chat session data
```

## Requirements

**Must be running before starting the app:**
- **ComfyUI server** on `http://127.0.0.1:8188` with models:
  - Qwen Image model (diffusion, CLIP, VAE, LoRA)
  - Wan2.2 I2V model (standard and NSFW variants)
- **Gradio ChatterBox TTS** on `http://127.0.0.1:7860` (for text-to-speech)
- **Ollama server** on `http://127.0.0.1:11434` (for AI chat features)
- Optional: NVIDIA GPU with nvidia-smi for GPU/VRAM monitoring

## Quick Start

```powershell
pip install -r requirements.txt
python app.py  # Starts on http://localhost:4879
```

**First Login:**
- Navigate to `http://localhost:4879`
- Enter default password: `password`
- Check "Remember me" to stay logged in for 30 days
- **⚠️ Change the default password immediately!**

## Tabs Overview

The interface has **14 tabs**:
1. **Image**: Generate individual images with full parameter control
2. **Text Batch**: Create multiple variations using CSV templates with parameter placeholders  
3. **Image Batch**: Batch processing with folder selection and same-prompt AI editing
4. **Video**: Convert static images into animated videos with NSFW mode option
5. **Video Batch**: Batch convert folders of images to videos
6. **Frame Edit**: Extract frames from video → AI process all frames → stitch back to video
7. **Image Browser**: Browse, organize, and manage your generated images
8. **Video Browser**: Browse and play generated videos
9. **Viewer**: Image/video viewer (opens automatically from other tabs)
10. **Chat**: Interactive AI chat with Ollama models (streaming responses)
11. **Story**: Character-driven interactive storytelling with lorebook system
12. **Auto Chat**: Autonomous dual AI persona conversations
13. **TTS**: Text-to-speech batch generation with Gradio ChatterBox
14. **Audio**: Browse and manage TTS-generated audio files

## Mobile Optimization
### Desktop
- **Collapsible Queue Sidebar** - Click chevron to collapse sidebar from 320px to 40px
- **Responsive Layout** - Main content expands smoothly when sidebar collapses
- **Generate Button** - Positioned next to prompt box for quick access
- **Keyboard Shortcuts** - Full keyboard navigation support

### Mobile
- **Responsive Design** - Optimized layouts for screens ≤768px (tablets) and ≤480px (phones)
- **Collapsible Menu** - Hamburger button (☰) in header toggles queue sidebar overlay
- **Collapsible Sections** - Parameters and LoRA settings collapse to save screen space
- **Touch-Friendly** - Minimum 44px touch targets, increased button spacing
- **Single-Column Layout** - Parameter grids and prompt controls stack vertically
- **Fullscreen Viewer** - Pinch-to-zoom, swipe navigation, optimized controls, video playback
- **Tab Navigation** - Compact tabs for all 8 modes

## Keyboard Shortcuts

**Anywhere (except in modals):**
- `Ctrl+Enter` (or `Cmd+Enter`) - Generate image/video

**Fullscreen Viewer:**
- `←` / `→` or `A` / `D` - Navigate images/videos
- `+` / `-` - Zoom in/out
- `0` - Reset zoom to 100%
- `Space` - Toggle autoplay
- `Esc` - Exit fullscreen

**Image Modal:**
- `←` / `→` - Previous/next image
- `Esc` - Close modal

## Usage
- **Reveal Browser**: View input images paired with generated outputs
- **Video**: Convert static images into animated videos with NSFW mode option
- **Video Batch**: Batch convert folders of images to videos
- **Video Browser**: Browse and play generated videos

### Generate Images (Image Tab)

1. Navigate to the **Image** tab (default)
2. **Monitor hardware usage** - Check CPU/RAM/GPU/VRAM bars at the top (updates every 2 seconds)
3. **Upload or browse images** (optional, for image-to-image):
   - Click "Upload Image" to select a file from your computer
   - Click "Browse" to select existing images from input/output folders
   - Enable "Use Image Size" to match source image dimensions
4. Enter your prompt in the text area (or press `Ctrl+Enter` to generate quickly)
5. Adjust parameters:
   - **Width/Height**: Image dimensions (default: 1024×1024)
   - **Steps**: Sampling steps (default: 4)
   - **CFG Scale**: Classifier-free guidance (default: 1.0)
   - **Shift**: Generation shift parameter (default: 3.0)
   - **Seed**: Random seed (leave empty for random, ✕ button to clear)
   - **File Prefix**: Custom filename prefix (default: "comfyui")
   - **Subfolder**: Target folder for output (optional, set from browser)
6. Configure **LoRA Settings** (collapsible section):
   - **MCNL LoRA**: Manga/comic line art style with keywords
   - **Snofs LoRA**: Soft lighting and artistic effects with keywords
   - **Male LoRA**: Male character enhancement
7. Click "Generate" button or press `Ctrl+Enter` to add to queue
8. Watch progress in the left sidebar queue panel
9. **Note:** Models automatically unload when switching between text-to-image and image-to-image modes

### Generate Videos (Video Tab)

1. Navigate to the **Video** tab
2. **Upload or browse a source image**:
   - Click "Upload Image" or "Browse" to select an input image
   - Clear with the X button to select a different image
3. **Enable NSFW Mode** (optional):
   - Check "NSFW Mode" to use NSFW-enabled workflow
   - Requires NSFW models installed in ComfyUI
   - System automatically unloads models when switching between standard/NSFW modes
4. Enter a **motion prompt** describing the desired animation:
   - Example: "Make her wave at the camera"
   - Example: "Zoom in slowly while camera rotates"
5. Adjust video parameters:
   - **Frames**: Video length (10-200, default: 64)
   - **FPS**: Frames per second (8-60, default: 16)  
   - **Megapixels**: Scale factor (0.1-2.0, default: 0.25)
   - **Seed**: Random seed (optional, for reproducibility)
6. View **estimated duration** below FPS field (updates automatically)
7. Click "Generate Video" to add to queue
8. Video appears in queue with "🎬 Video" badge
9. When complete, video can be viewed in **Video Browser** tab

### Video Batch Processing (Video Batch Tab)

1. Navigate to the **Video Batch** tab
2. **Select a folder of images** to convert to videos:
   - Click "Choose Folder" to browse ComfyUI input folders
   - Each image in the folder will be queued as a separate video generation
3. Enter a **motion prompt** for all videos:
   - This prompt will be applied to every image in the folder
4. Adjust video parameters (applied to all):
   - **Frames**: Video length (10-200, default: 64)
   - **FPS**: Frames per second (8-60, default: 16)
   - **Megapixels**: Scale factor (0.1-2.0, default: 0.25)
   - **Seed**: Random seed (optional)
5. View **estimated duration** per video and total batch duration
6. Click "Queue Video Batch" to add all jobs to queue
7. Videos appear in queue with "🎬 Video" badges
8. All videos output to the same subfolder

### Reveal Browser (Input/Output Pairing - Images Only)

1. Navigate to the **Reveal Browser** tab
2. Browse folders containing processed images
3. Toggle between:
   - **Show Output** / **Show Input**: Switch between viewing outputs or inputs

### Text-to-Speech (TTS Tab)

1. Navigate to the **TTS** tab
2. **Enter text** to convert to speech:
   - Multiple sentences supported (auto-split)
   - Full paragraphs or stories
3. **Select voice** from available narrator options
4. Configure TTS parameters:
   - **Seed**: Random seed (optional)
   - **File Prefix**: Custom filename prefix (default: "tts")
   - **Subfolder**: Output folder in `outputs/audio/` (optional)
5. Click **"Generate TTS Batch"** to queue all sentences
6. Each sentence generates as a separate audio file
7. View progress in queue sidebar (shows batch count)
8. Results appear in **Audio Browser** tab

### Audio Browser

1. Navigate to the **Audio** tab
2. View TTS batches organized by generation time
3. Each batch shows:
   - **Title**: First 50 characters of generated text
   - **Voice name**: Narrator used (e.g., "Holly")
   - **Date and sentence count**
4. **Expand batch** to see individual sentences
5. **Play controls**:
   - Click "Play All" to play sentences sequentially
   - Click individual sentences to play from that point
   - Current sentence highlights during playback
6. **View Full Text** button:
   - Opens modal with complete text
   - Easy copy with "Copy Text" button
   - Shows all sentences in batch
7. **Audio player** - Integrated controls for playback

### AI Chat (Chat Tab)

1. Navigate to the **Chat** tab
2. **Start a new chat**:
   - Enter optional chat name
   - Select Ollama model (loads available models)
   - Add system instructions (optional, defines AI behavior)
   - Click "Start Chat"
3. **Chat interface**:
   - Type messages in text area
   - Press Enter or click "Send" to submit
   - **Streaming responses** - Text appears in real-time
   - Messages persist in session history
4. **Session management**:
   - View all chat sessions with "View Sessions"
   - Load previous conversations
   - Clear chat history
   - Import settings to new chat
5. **Queue integration**:
   - Chat messages appear in queue with timer badge
   - Background processing continues even if browser disconnects
   - Session saved before and after generation

### Chat to Chat (Autonomous AI Conversations)

1. Navigate to the **Chat to Chat** tab
2. **Configure conversation**:
   - Enter conversation topic/name
   - Select two different Ollama models
   - Name each AI agent (e.g., "Philosopher", "Scientist")
   - Add system instructions for each agent
   - Enter starting message for first agent
   - Set maximum turns (default: 50)
3. **Start conversation**:
   - Click "Start Conversation"
   - AI agents chat autonomously
   - **Real-time updates** - Messages appear as generated
4. **Conversation controls**:
   - **Stop** - Pause conversation at any point
   - **Continue** - Resume from where it stopped
   - Conversation auto-stops at max turns
5. **View sessions**:
   - Browse all Chat to Chat sessions
   - Load previous conversations
   - Continue or review completed chats
6. **Queue integration**:
   - Shows "Chat to Chat" b     # Flask backend with auth, queue, hardware monitoring
├── comfyui_client.py           # Python stdlib ComfyUI API wrapper (urllib, json)
├── ollama_client.py            # Python stdlib Ollama API wrapper (urllib, json)
├── templates/
│   ├── index.html              # 13-tab SPA main interface
│   └── login.html              # Password login page
├── static/
│   ├── style.css               # Dark theme, mobile responsive
│   └── script.js               # Vanilla JS (queue, hardware, chat streaming)
├── outputs/                    # Generated content (gitignored)
│   ├── images/                 # All image generations
│   │   └── myFolder/           # User subfolders
│   ├── videos/                 # All video generations
│   │   └── myFolder/
│   ├── audio/                  # All TTS audio
│   │   └── myFolder/
│   ├── chats/                  # Chat sessions
│   │   ├── chat_sessions.json
│   │   └── c2c_sessions.json
│   ├── metadata.json           # Generation metadata
│   └── queue_state.json        # Persistent queue state
├── workflows/
│   ├── Qwen_Full (API).json         # Image generation workflow
│   ├── Wan2.2 I2V (API).json        # Video generation workflow (standard)
│   ├── Wan2.2 I2V NSFW (API).json   # Video generation workflow (NSFW)
│   └── TTSVibe (API).json           # Text-to-speech workflow
├── requirements.txt            # Python dependencies
├── PASSWORD_README.md          # Password change instructions
├── Authentication
- `POST /api/auth/login` - Login with password and remember me flag
- `POST /api/auth/logout` - Clear session and cookies
- `GET /api/auth/check` - Check authentication status

### Core Endpoints
- `GET /` - Main web interface (13 tabs) or login page
- `POST /api/queue/image` - Add image generation job to queue
- `POST /api/queue/video` - Add video generation job to queue
- `GET /api/queue/status` - Get queue status (queued, active, completed)
- `POST /api/queue/cancel/<job_id>` - Cancel queued job
- `POST /api/queue/clear` - Clear queued items only
- `POST /api/queue/batch` - Add batch image generation jobs from CSV
- `POST /api/queue/image-batch` - Queue folder of images for batch processing
- `POST /api/queue/video-batch` - Queue folder of images to convert to videos
- `POST /api/queue/tts` - Queue text-to-speech batch generation
- `GET /api/batch-instructions` - Get inline batch CSV instructions
- `GET /api/browse` - Browse folder contents with metadata
- `GET /api/browse_audio` - Browse audio files and TTS batches
- `GET /api/reveal` - Get input/output pairs for reveal browser
- `POST /api/folder` - Create new subfolder
- `POST /api/move` - Move files/folders
- `POST /api/delete` - Delete files/folders
- `GET /api/images/<image_id>` - Get specific image metadata
- `GET /outputs/<path:filepath>` - Serve generated image/video/audio

### Video Endpoints
- `GET /api/video/<path:filepath>` - Serve video from ComfyUI input or outputs
- `POST /api/upload` - Upload image to ComfyUI input (returns filename)

### Chat & AI Endpoints
- `GET /api/ollama/health` - Check if Ollama server is running
- `GET /api/ollama/models` - List available Ollama models
- `POST /api/chat/message` - Send chat message (SSE streaming response)
- `GET /api/chat/sessions` - List all chat sessions
- `GET /api/chat/<session_id>` - Get specific chat session
- `POST /api/chat/<session_id>/clear` - Clear chat history
- `POST /api/chat2chat/start` - Start autonomous AI-to-AI conversation
- `GET /api/chat2chat/<session_id>` - Get Chat to Chat session status
- `POST /api/chat2chat/<session_id>/stop` - Stop running conversation
- `POST /api/chat2chat/<session_id>/continue` - Resume stopped conversation
- `GET /api/chat2chat/sessions` - List all Chat to Chat sessions
- Click any image/video to open detail view with metadata
- Use arrow buttons or keyboard (←/→/A/D) to navigate
- Click fullscreen button for immersive viewing:
  - **Videos**: Play with controls, looping enabled in modal
  - **Images**: Zoom 100-500%, drag to pan when zoomed
  - **Autoplay**: Press Space or and Ollama clients (urllib, json)
- External dependencies: Flask, psutil
- **Authentication:**
  - Session-based with Flask sessions
  - Remember me cookie lasts 30 days
  - All API endpoints protected with `@require_auth` decorator
  - 401 responses trigger automatic redirect to login
- **Smart Workflow Switching:**
  - Automatically detects workflow type changes (image/video/NSFW/chat)
  - Unloads models before switching to prevent conflicts
  - 2-5 second delay after unloading for stability
- **Model Management:**
  - Unloads ALL models (ComfyUI + Ollama) after EVERY job completion
  - 5-second wait for complete cleanup
  - Prevents RAM/VRAM cramming on limited systems
- **Hardware Monitoring:**
  - Updates every 2 seconds via polling
  - Uses psutil for CPU/RAM (cross-platform)
  - Uses nvidia-smi for GPU/VRAM (NVIDIA only)
  - Color-coded bars: blue (normal), orange (high), red (critical)
- **Video Generation:**
  - Supports standard and NSFW workflows
  - Videos saved as MP4 files in `outputs/videos/`
  - Proper MIME types for browser playback
  - Integrated with fullscreen viewer
- **Chat Features:**
  - Background thread processing for async handling
  - SSE (Server-Sent Events) for real-time streaming
  - Session persistence in JSON files
  - Ollama integration for LLM support
- **File Organization:**
  - Media-type folders created automatically
  - User subfolders nested within media types
  - Transparent to user interfacend with immediate UI feedback
- **Persistent queue** - Survives server restarts via `queue_state.json`
- **Shared across all users** - All browsers see same queue state

## Generation Parameters

### Image Parameters
- `positive_prompt`: Main prompt text (sent to Qwen CLIP encoder)
- `width`: Image width (64-2048, step 64, default 1024)
- `height`: Image height (64-2048, step 64, default 1024)  
- `steps`: Sampling steps (1-100, default 4 for Qwen Lightning)
- `seed`: Random seed (optional, auto-generated if empty)
- `cfg`: Classifier-free guidance (default 1.0)
- `shift`: Generation shift parameter (default 3.0)
- `file_prefix`: Custom filename prefix (default: "comfyui")
- `subfolder`: Target subfolder path (optional)
- `mcnl_lora`: Enable MCNL LoRA (manga/comic style)
- `snofs_lora`: Enable Snofs LoRA (soft lighting effects)
- `male_lora`: Enable Male LoRA (male character enhancement)

### Video Parameters
- `positive_prompt`: Motion description (animation to apply)
- `image_filename`: Source image from ComfyUI input directory
- `frames`: Video length (10-200, default 64)
- `fps`: Frames per second (8-60, default 16)
- `megapixels`: Scale factor (0.1-2.0, default 0.25)
- `seed`: Random seed (optional, for reproducibility)
- `nsfw`: Use NSFW workflow (boolean, default false)
- `file_prefix`: Custom filename prefix (default: "video")
- `subfolder`: Target subfolder path (optional)

## Project Structure

```
├── app.py                      # Flask backend (5640 lines: auth, queue, hardware)
├── comfyui_client.py           # Python stdlib ComfyUI API wrapper (urllib, json)
├── ollama_client.py            # Python stdlib Ollama API wrapper (urllib, json)
├── gradio_tts_client.py        # Gradio ChatterBox TTS client
├── templates/
│   ├── index.html              # 14-tab SPA main interface
│   └── login.html              # Password login page
├── static/
│   ├── style.css               # Multi-theme system, mobile responsive
│   ├── script.js               # Core UI logic, queue, hardware monitoring
│   ├── story.js                # Story mode with lorebook
│   ├── story_modals.js         # Story UI modals
│   └── autochat.js             # Dual AI persona chat
├── outputs/                    # Generated content (gitignored)
│   ├── images/                 # All image generations
│   │   └── myFolder/           # User subfolders
│   ├── videos/                 # All video generations
│   │   └── myFolder/
│   ├── audio/                  # All TTS audio
│   │   └── myFolder/
│   ├── chats/                  # Chat sessions
│   │   └── chats.json
│   ├── metadata.json           # Generation metadata
│   └── queue_state.json        # Persistent queue state
├── workflows/
│   ├── Qwen_Full (API).json         # Image generation workflow
│   ├── Wan2.2 I2V (API).json        # Video generation workflow (standard)
│   └── Wan2.2 I2V NSFW (API).json   # Video generation workflow (NSFW)
├── cache/                      # Cache directories for ML frameworks
├── requirements.txt            # Python dependencies (flask, psutil, pydub, mutagen, gradio_client)
└── PASSWORD_README.md          # Password change instructions
```

## API Endpoints

### Core Endpoints
- `GET /` - Main web interface with 14 tabs
- `POST /api/queue` - Add image or video generation job to queue
- `GET /api/queue` - Get queue status (queued, active, completed)
- `DELETE /api/queue/<job_id>` - Remove queued or completed job
- `POST /api/queue/clear` - Clear queued items only
- `POST /api/queue/batch` - Add batch image generation jobs
- `POST /api/queue/image-batch` - Queue folder of images for batch processing
- `POST /api/queue/video-batch` - Queue folder of images to convert to videos
- `GET /api/browse` - Browse folder contents with metadata
- `GET /api/reveal` - Get input/output pairs for reveal browser
- `POST /api/folder` - Create new subfolder
- `POST /api/move` - Move files/folders
- `POST /api/delete` - Delete files/folders
- `GET /api/images/<image_id>` - Get specific image metadata
- `GET /outputs/<path:filepath>` - Serve generated image/video

### Video Endpoints
- `GET /api/video/<path:filepath>` - Serve video from ComfyUI input or outputs
- `POST /api/upload` - Upload image to ComfyUI input (returns filename)

### System Monitoring Endpoints
- `GET /api/hardware/stats` - Get CPU/RAM/GPU/VRAM usage statistics
- `POST /api/comfyui/unload` - Manually unload models and clear memory
- `GET /api/comfyui/status` - Get memory status and auto-unload timer

### Image Management Endpoints
- `GET /api/browse_images?folder=input` - List images from ComfyUI input
- `GET /api/image/input/<filename>` - Serve image from ComfyUI input
- `POST /api/copy_to_input` - Copy image from output to input folder

## Development

- **No hot reload** - Restart Flask server after Python changes
- Frontend changes (HTML/CSS/JS) only need browser refresh (Ctrl+F5)
- Queue processing runs in daemon thread
- Uses Python stdlib for ComfyUI and Ollama clients (urllib, json)
- **Required dependency**: Flask
- **Optional dependencies**: psutil (hardware monitoring), pydub (audio merging), mutagen (MP3 duration)
- **UTF-8 Encoding**: All file I/O uses `encoding='utf-8'` for Windows compatibility
- **Smart Workflow Switching:**
  - Automatically detects workflow type changes (image/video/NSFW/chat)
  - Unloads ALL models (ComfyUI + Ollama) after every job completion
  - 5-second wait after unloading to prevent RAM cramming
- **Model Management:**
  - Complete cleanup after each generation
  - Prevents memory issues on limited hardware
- **Hardware Monitoring:**
  - Updates every 2 seconds via polling
  - Uses psutil for CPU/RAM (cross-platform, optional)
  - Uses nvidia-smi for GPU/VRAM (NVIDIA only, optional)
  - Color-coded bars: blue (normal), orange (high), red (critical)
- **Video Generation:**
  - Supports standard and NSFW workflows
  - Videos saved as MP4 files
  - Proper MIME types for browser playback
  - Integrated with fullscreen viewer
- **Chat Features:**
  - SSE streaming for real-time responses
  - Background processing continues if browser disconnects
  - Session persistence across restarts

## Privacy

- `outputs/` directory is gitignored
- `robots.txt` blocks major AI crawlers (GPTBot, Claude-Web, etc.)
- All metadata stored locally in `outputs/metadata.json`

## License

This project is open source and available for use and modification.

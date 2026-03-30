"""
Velvet Reverie - Flask Web UI
"""

from flask import Flask, render_template, request, jsonify, send_file, send_from_directory, Response, stream_with_context, session, make_response
from comfyui_client import ComfyUIClient
from ollama_client import OllamaClient
from gradio_tts_client import GradioTTSClient
import os
import json
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path
import uuid
import mimetypes
import hashlib
from functools import wraps
import wave
from dotenv import load_dotenv
from PIL import Image
import cv2
import numpy as np

# Load environment variables from .env file
# override=True ensures .env values take precedence over shell environment variables
load_dotenv(override=True)

# Try to import mutagen for accurate MP3 duration
try:
    from mutagen.mp3 import MP3
    MUTAGEN_AVAILABLE = True
except ImportError:
    MUTAGEN_AVAILABLE = False
    print("[AUDIO] Warning: mutagen not installed. MP3 duration will be estimated.")

# Check if ffmpeg is available for audio merging
import subprocess
import shutil

def check_ffmpeg_available():
    """Check if ffmpeg is available in system PATH"""
    return shutil.which("ffmpeg") is not None or shutil.which("avconv") is not None

FFMPEG_AVAILABLE = check_ffmpeg_available()
if FFMPEG_AVAILABLE:
    print("[AUDIO] ffmpeg detected - audio merging enabled")
else:
    print("[AUDIO] Warning: ffmpeg not found. Please install ffmpeg for audio merging.")
    print("[AUDIO] Download from: https://ffmpeg.org/download.html")

app = Flask(__name__)

# Flask Configuration from environment
FLASK_HOST = os.getenv('FLASK_HOST', '0.0.0.0')
FLASK_PORT = int(os.getenv('FLASK_PORT', '4879'))
FLASK_DEBUG = os.getenv('FLASK_DEBUG', 'False').lower() in ('true', '1', 'yes')
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'velvet-reverie-secret-key')
SESSION_LIFETIME_DAYS = int(os.getenv('SESSION_LIFETIME_DAYS', '30'))
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=SESSION_LIFETIME_DAYS)

# Authentication configuration
PASSWORD_HASH = os.getenv('PASSWORD_HASH', 'f9031e664507bef426d72ed433ed4a07d47aefa362285b757186c6f8a7a1bf76')
# To generate a new password hash: hashlib.sha256("your_password".encode()).hexdigest()

# SSL/HTTPS Configuration
ENABLE_SSL = os.getenv('ENABLE_SSL', 'False').lower() in ('true', '1', 'yes')
SSL_CERT_FILE = os.getenv('SSL_CERT_FILE', 'cert.pem')
SSL_KEY_FILE = os.getenv('SSL_KEY_FILE', 'key.pem')

# ComfyUI Configuration
COMFYUI_HOST = os.getenv('COMFYUI_HOST', '127.0.0.1')
COMFYUI_PORT = os.getenv('COMFYUI_PORT', '8188')
COMFYUI_TOKEN = os.getenv('COMFYUI_TOKEN', '')
# Token is stored in ComfyUI's ./PASSWORD file or shown in console at startup

# Ollama Configuration
OLLAMA_HOST = os.getenv('OLLAMA_HOST', '127.0.0.1')
OLLAMA_PORT = os.getenv('OLLAMA_PORT', '11434')

# Gradio TTS Configuration
GRADIO_HOST = os.getenv('GRADIO_HOST', '127.0.0.1')
GRADIO_PORT = os.getenv('GRADIO_PORT', '7860')
GRADIO_OUTPUT_DIR = Path(os.getenv('GRADIO_OUTPUT_DIR', '../Ultimate-TTS-Studio.git/app/outputs'))

# Paths Configuration
OUTPUT_DIR = Path(os.getenv('OUTPUT_DIR', 'outputs'))
OUTPUT_DIR.mkdir(exist_ok=True)
METADATA_FILE = OUTPUT_DIR / "metadata.json"
QUEUE_FILE = OUTPUT_DIR / "queue_state.json"
CHATS_FILE = OUTPUT_DIR / "chats" / "chats.json"
STORIES_FILE = OUTPUT_DIR / "chats" / "stories.json"
AUTOCHAT_FILE = OUTPUT_DIR / "chats" / "autochat.json"

# Workflows directory
WORKFLOWS_DIR = Path(os.getenv('WORKFLOWS_DIR', 'workflows'))

# ComfyUI paths (for input files and output)
COMFYUI_INPUT_DIR = Path(os.getenv('COMFYUI_INPUT_DIR', '../comfy.git/app/input'))
COMFYUI_OUTPUT_DIR = Path(os.getenv('COMFYUI_OUTPUT_DIR', '../comfy.git/app/output'))

# Documentation directory
DOCS_DIR = Path(os.getenv('DOCS_DIR', 'docs'))

# Create media type folders
(OUTPUT_DIR / "images").mkdir(exist_ok=True)
(OUTPUT_DIR / "videos").mkdir(exist_ok=True)
(OUTPUT_DIR / "audio").mkdir(exist_ok=True)
(OUTPUT_DIR / "chats").mkdir(exist_ok=True)

# Global queue and status
generation_queue = []
completed_jobs = []  # Keep last N completed jobs
MAX_COMPLETED_HISTORY = int(os.getenv('MAX_COMPLETED_HISTORY', '50'))
queue_lock = threading.Lock()
chat_lock = threading.Lock()
active_generation = None
queue_paused = True  # Start paused by default (controlled via web UI)

# Initialize ComfyUI client with optional token
comfyui_server = f"{COMFYUI_HOST}:{COMFYUI_PORT}"
comfyui_client = ComfyUIClient(
    server_address=comfyui_server, 
    token=COMFYUI_TOKEN if COMFYUI_TOKEN else None, 
    workflows_dir=str(WORKFLOWS_DIR),
    output_dir=str(COMFYUI_OUTPUT_DIR)
)

# Initialize Ollama client
ollama_server = f"{OLLAMA_HOST}:{OLLAMA_PORT}"
ollama_client = OllamaClient(server_address=ollama_server)

# Initialize Gradio TTS client
gradio_server = f"{GRADIO_HOST}:{GRADIO_PORT}"
gradio_tts_client = GradioTTSClient(server_address=gradio_server, output_dir=str(GRADIO_OUTPUT_DIR))

# Track last workflow type for model unloading
last_workflow_type = None  # 'image_t2i', 'image_i2i', 'video', 'video_nsfw', 'tts'

# Track if cancellation was requested
cancellation_requested = False

# Global setting for auto-unload models (controlled via web UI)
auto_unload_models = False

# Authentication decorator
def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Check session
        if session.get('authenticated'):
            return f(*args, **kwargs)
        # Check remember me cookie
        remember_token = request.cookies.get('remember_token')
        if remember_token and remember_token == get_remember_token():
            session['authenticated'] = True
            session.permanent = True
            return f(*args, **kwargs)
        # Not authenticated
        return jsonify({'error': 'Unauthorized', 'authenticated': False}), 401
    return decorated_function

def get_remember_token():
    """Generate a secure remember me token"""
    return hashlib.sha256(f"{PASSWORD_HASH}{app.config['SECRET_KEY']}".encode()).hexdigest()

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Authenticate user"""
    data = request.json
    password = data.get('password', '')
    remember_me = data.get('remember_me', False)
    
    # Hash the provided password
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    if password_hash == PASSWORD_HASH:
        session['authenticated'] = True
        
        response = make_response(jsonify({
            'success': True,
            'message': 'Login successful'
        }))
        
        # Set remember me cookie if requested
        if remember_me:
            session.permanent = True
            response.set_cookie(
                'remember_token',
                get_remember_token(),
                max_age=30*24*60*60,  # 30 days
                httponly=True,
                samesite='Lax'
            )
        else:
            session.permanent = False
        
        return response
    else:
        return jsonify({
            'success': False,
            'error': 'Invalid password'
        }), 401

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """Logout user"""
    session.clear()
    response = make_response(jsonify({
        'success': True,
        'message': 'Logged out successfully'
    }))
    response.set_cookie('remember_token', '', expires=0)
    return response

@app.route('/api/auth/check', methods=['GET'])
def check_auth():
    """Check if user is authenticated"""
    # Check session
    if session.get('authenticated'):
        return jsonify({'authenticated': True})
    # Check remember me cookie
    remember_token = request.cookies.get('remember_token')
    if remember_token and remember_token == get_remember_token():
        session['authenticated'] = True
        session.permanent = True
        return jsonify({'authenticated': True})
    return jsonify({'authenticated': False})


def get_next_filename(prefix: str, subfolder: str = "", extension: str = "png", media_type: str = "images") -> tuple:
    """Generate next available filename with incremental index
    
    Args:
        prefix: Filename prefix
        subfolder: User-specified subfolder (will be placed inside media_type folder)
        extension: File extension
        media_type: Root folder for media type ('images', 'videos', 'audio', 'chats')
    
    Returns:
        (relative_path, absolute_path) - relative_path is relative to OUTPUT_DIR
    """
    # Build path: OUTPUT_DIR / media_type / subfolder
    if subfolder:
        target_dir = OUTPUT_DIR / media_type / subfolder
    else:
        target_dir = OUTPUT_DIR / media_type
    target_dir.mkdir(parents=True, exist_ok=True)
    
    index = 0
    while True:
        filename = f"{prefix}{index:04d}.{extension}"
        filepath = target_dir / filename
        if not filepath.exists():
            relative_path = filepath.relative_to(OUTPUT_DIR)
            return str(relative_path), filepath
        index += 1


def load_metadata():
    """Load image metadata from file"""
    OUTPUT_DIR.mkdir(exist_ok=True)  # Ensure directory exists
    if METADATA_FILE.exists():
        with open(METADATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []


def save_metadata(metadata):
    """Save image metadata to file"""
    OUTPUT_DIR.mkdir(exist_ok=True)  # Ensure directory exists
    with open(METADATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2)


# ===== Video Thumbnail Generation =====

def generate_video_thumbnail(video_path: Path, thumbnail_path: Path = None, max_size=(320, 240)):
    """
    Generate a thumbnail from the first frame of a video
    
    Args:
        video_path: Path to the video file
        thumbnail_path: Path where thumbnail should be saved (auto-generated if None)
        max_size: Maximum thumbnail dimensions (width, height)
    
    Returns:
        Path to the generated thumbnail, or None if generation failed
    """
    try:
        # Auto-generate thumbnail path if not provided
        if thumbnail_path is None:
            thumbnail_path = video_path.with_suffix('.thumb.jpg')
        
        # Open video file
        cap = cv2.VideoCapture(str(video_path))
        
        # Read first frame
        ret, frame = cap.read()
        cap.release()
        
        if not ret or frame is None:
            print(f"[THUMBNAIL] Failed to read first frame from {video_path}")
            return None
        
        # Convert BGR to RGB
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Convert to PIL Image
        img = Image.fromarray(frame_rgb)
        
        # Resize maintaining aspect ratio
        img.thumbnail(max_size, Image.Resampling.LANCZOS)
        
        # Ensure thumbnail directory exists
        thumbnail_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Save as JPEG
        img.save(thumbnail_path, 'JPEG', quality=85, optimize=True)
        
        print(f"[THUMBNAIL] Generated: {thumbnail_path}")
        return thumbnail_path
        
    except Exception as e:
        print(f"[THUMBNAIL] Error generating thumbnail for {video_path}: {e}")
        return None


def get_or_generate_thumbnail(video_path: Path):
    """
    Get existing thumbnail or generate a new one
    
    Args:
        video_path: Path to the video file (can be relative or absolute)
    
    Returns:
        Path to thumbnail (relative to OUTPUT_DIR), or None if generation failed
    """
    # Resolve video path
    if not video_path.is_absolute():
        video_path = OUTPUT_DIR / video_path
    
    if not video_path.exists():
        print(f"[THUMBNAIL] Video file not found: {video_path}")
        return None
    
    # Calculate thumbnail path (same location as video, with .thumb.jpg extension)
    thumbnail_path = video_path.with_suffix('.thumb.jpg')
    
    # Return existing thumbnail if it exists and is newer than the video
    if thumbnail_path.exists():
        try:
            video_mtime = video_path.stat().st_mtime
            thumb_mtime = thumbnail_path.stat().st_mtime
            if thumb_mtime >= video_mtime:
                # Return path relative to OUTPUT_DIR
                return thumbnail_path.relative_to(OUTPUT_DIR)
        except Exception as e:
            print(f"[THUMBNAIL] Error checking thumbnail timestamps: {e}")
    
    # Generate new thumbnail
    result = generate_video_thumbnail(video_path, thumbnail_path)
    
    if result:
        # Return path relative to OUTPUT_DIR
        return thumbnail_path.relative_to(OUTPUT_DIR)
    
    return None


def generate_all_video_thumbnails():
    """
    Background task to generate thumbnails for all existing videos
    """
    print("[THUMBNAIL] Starting thumbnail generation for all videos...")
    
    videos_dir = OUTPUT_DIR / "videos"
    if not videos_dir.exists():
        print("[THUMBNAIL] No videos directory found")
        return
    
    # Find all video files
    video_extensions = {'.mp4', '.webm', '.mov', '.avi', '.mkv'}
    video_files = []
    
    for ext in video_extensions:
        video_files.extend(videos_dir.rglob(f'*{ext}'))
    
    total = len(video_files)
    generated = 0
    skipped = 0
    failed = 0
    
    for i, video_path in enumerate(video_files, 1):
        try:
            thumbnail_path = video_path.with_suffix('.thumb.jpg')
            
            # Skip if thumbnail exists and is newer
            if thumbnail_path.exists():
                video_mtime = video_path.stat().st_mtime
                thumb_mtime = thumbnail_path.stat().st_mtime
                if thumb_mtime >= video_mtime:
                    skipped += 1
                    continue
            
            # Generate thumbnail
            result = generate_video_thumbnail(video_path, thumbnail_path)
            
            if result:
                generated += 1
            else:
                failed += 1
            
            if i % 10 == 0:
                print(f"[THUMBNAIL] Progress: {i}/{total} videos processed")
                
        except Exception as e:
            print(f"[THUMBNAIL] Error processing {video_path}: {e}")
            failed += 1
    
    print(f"[THUMBNAIL] Complete - Generated: {generated}, Skipped: {skipped}, Failed: {failed}")



def get_unique_filename(target_path: Path) -> Path:
    """Get unique filename by appending (1), (2), etc. if file exists"""
    if not target_path.exists():
        return target_path
    
    stem = target_path.stem
    suffix = target_path.suffix
    parent = target_path.parent
    index = 1
    
    while True:
        new_name = f"{stem} ({index}){suffix}"
        new_path = parent / new_name
        if not new_path.exists():
            return new_path
        index += 1


def update_metadata_path(old_path: str, new_path: str):
    """Update metadata when a file is moved"""
    metadata = load_metadata()
    for entry in metadata:
        if entry.get('path') == old_path:
            entry['path'] = new_path
            entry['filename'] = os.path.basename(new_path)
            break
    save_metadata(metadata)


def delete_metadata_entry(file_path: str):
    """Remove metadata entry when file is deleted"""
    metadata = load_metadata()
    metadata = [entry for entry in metadata if entry.get('path') != file_path]
    save_metadata(metadata)


def load_chats():
    """Load chat sessions from file"""
    OUTPUT_DIR.mkdir(exist_ok=True)  # Ensure directory exists
    if CHATS_FILE.exists():
        try:
            with open(CHATS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading chats: {e}")
    return []


def save_chats(chats):
    """Save chat sessions to file"""
    OUTPUT_DIR.mkdir(exist_ok=True)  # Ensure directory exists
    try:
        with open(CHATS_FILE, 'w', encoding='utf-8') as f:
            json.dump(chats, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving chats: {e}")

def merge_tts_batch_for_chat(batch_id, chat_message_id, session_id):
    """Merge TTS batch audio files and attach to chat message"""
    try:
        metadata = load_metadata()
        
        # Get all files for this batch
        batch_files = [entry for entry in metadata 
                      if entry.get('job_type') == 'tts' and entry.get('batch_id') == batch_id]
        
        if not batch_files:
            print(f"[MERGE] No files found for batch {batch_id}")
            return None
        
        # Group by sentence_index and get latest version of each
        sentence_groups = {}
        for file in batch_files:
            idx = file.get('sentence_index')
            if idx not in sentence_groups:
                sentence_groups[idx] = []
            sentence_groups[idx].append(file)
        
        # Get latest version for each sentence
        files_to_merge = []
        for idx in sorted(sentence_groups.keys()):
            versions = sentence_groups[idx]
            versions.sort(key=lambda x: x.get('version_number', 0), reverse=True)
            files_to_merge.append(versions[0])
        
        if not files_to_merge:
            return None
        
        # Collect valid file paths
        valid_files = []
        for file_entry in files_to_merge:
            path_str = file_entry.get('path', '')
            file_path = Path(path_str)
            
            if not file_path.is_absolute() and not file_path.exists():
                file_path = OUTPUT_DIR / path_str if not file_path.exists() else file_path
            
            if not file_path.exists():
                continue
            
            valid_files.append(file_path)
        
        if not valid_files:
            return None
        
        # Generate output filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_filename = f"chat_merged_{batch_id[:8]}_{timestamp}.wav"
        output_path = OUTPUT_DIR / "audio" / "chat_merged" / output_filename
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Use ffmpeg to merge files
        silence_path = OUTPUT_DIR / "audio" / f"silence_temp_{timestamp}.wav"
        
        # Create silence
        silence_cmd = [
            'ffmpeg', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
            '-t', '0.1', '-y', str(silence_path)
        ]
        subprocess.run(silence_cmd, check=True, capture_output=True)
        
        # Build input list
        inputs = []
        for i, file_path in enumerate(valid_files):
            inputs.extend(['-i', str(file_path)])
            if i < len(valid_files) - 1:
                inputs.extend(['-i', str(silence_path)])
        
        # Merge
        stream_count = len(valid_files) + (len(valid_files) - 1)
        filter_str = ''.join([f'[{i}:a]' for i in range(stream_count)]) + f'concat=n={stream_count}:v=0:a=1[out]'
        
        merge_cmd = ['ffmpeg'] + inputs + [
            '-filter_complex', filter_str,
            '-map', '[out]',
            '-y', str(output_path)
        ]
        
        subprocess.run(merge_cmd, check=True, capture_output=True)
        
        # Cleanup
        if silence_path.exists():
            silence_path.unlink()
        
        # Update chat message
        if session_id and chat_message_id:
            with chat_lock:
                sessions = load_chats()
                for session in sessions:
                    if session['session_id'] == session_id:
                        for message in session.get('messages', []):
                            msg_id = message.get('message_id') or message.get('response_id')
                            if msg_id == chat_message_id:
                                relative_path = str(output_path.relative_to(OUTPUT_DIR))
                                message['tts_audio'] = relative_path
                                message['tts_batch_id'] = batch_id
                                print(f"[MERGE] Attached audio to message: {relative_path}")
                                break
                        break
                save_chats(sessions)
        
        return str(output_path.relative_to(OUTPUT_DIR))
            
    except Exception as e:
        print(f"[MERGE] Error: {e}")
        return None


def load_stories():
    """Load story sessions from file"""
    OUTPUT_DIR.mkdir(exist_ok=True)  # Ensure directory exists
    (OUTPUT_DIR / "chats").mkdir(exist_ok=True)
    if STORIES_FILE.exists():
        try:
            with open(STORIES_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading stories: {e}")
    return []


def save_stories(stories):
    """Save story sessions to file"""
    OUTPUT_DIR.mkdir(exist_ok=True)  # Ensure directory exists
    (OUTPUT_DIR / "chats").mkdir(exist_ok=True)
    try:
        with open(STORIES_FILE, 'w', encoding='utf-8') as f:
            json.dump(stories, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving stories: {e}")


def load_autochat():
    """Load autochat sessions from file"""
    OUTPUT_DIR.mkdir(exist_ok=True)
    (OUTPUT_DIR / "chats").mkdir(exist_ok=True)
    if AUTOCHAT_FILE.exists():
        try:
            with open(AUTOCHAT_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading autochat: {e}")
    return []


def save_autochat(sessions):
    """Save autochat sessions to file"""
    OUTPUT_DIR.mkdir(exist_ok=True)
    (OUTPUT_DIR / "chats").mkdir(exist_ok=True)
    try:
        with open(AUTOCHAT_FILE, 'w', encoding='utf-8') as f:
            json.dump(sessions, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving autochat: {e}")


def build_autochat_context(session, active_persona):
    """Build message context for autochat generation with role flipping"""
    messages = []
    
    # Get active persona settings
    persona = session[f'persona_{active_persona}']
    
    # Add system prompt
    system_prompt = persona.get('system_prompt', '')
    if system_prompt:
        messages.append({
            'role': 'system',
            'content': system_prompt
        })
    
    # Add conversation history with role flipping
    # Active persona's messages become 'assistant', other persona becomes 'user'
    for msg in session.get('messages', []):
        if not msg.get('content'):
            continue
            
        msg_persona = msg.get('persona')
        if msg_persona == active_persona:
            # This persona's own messages
            messages.append({
                'role': 'assistant',
                'content': msg['content']
            })
        else:
            # Other persona's messages
            messages.append({
                'role': 'user',
                'content': msg['content']
            })
    
    return messages


def load_queue_state():
    """Load queue state from file"""
    OUTPUT_DIR.mkdir(exist_ok=True)  # Ensure directory exists
    if QUEUE_FILE.exists():
        try:
            with open(QUEUE_FILE, 'r') as f:
                data = json.load(f)
                return data.get('queue', []), data.get('completed', []), data.get('active')
        except Exception as e:
            print(f"Error loading queue state: {e}")
    return [], [], None


def save_queue_state():
    """Save queue state to file"""
    OUTPUT_DIR.mkdir(exist_ok=True)  # Ensure directory exists
    try:
        print(f"[QUEUE_SAVE] Starting save, acquiring lock...")
        with queue_lock:
            print(f"[QUEUE_SAVE] Lock acquired, copying data...")
            data = {
                'queue': generation_queue.copy(),
                'active': active_generation.copy() if active_generation else None,
                'completed': completed_jobs.copy()
            }
            print(f"[QUEUE_SAVE] Data copied, queue has {len(data['queue'])} items")
        print(f"[QUEUE_SAVE] Writing to file: {QUEUE_FILE}")
        with open(QUEUE_FILE, 'w') as f:
            json.dump(data, f, indent=2)
            f.flush()  # Ensure immediate write to disk
        print(f"[QUEUE_SAVE] File written successfully")
    except Exception as e:
        import traceback
        print(f"[QUEUE_SAVE] Error saving queue state: {e}")
        print(f"[QUEUE_SAVE] Traceback: {traceback.format_exc()}")


def add_metadata_entry(image_path, prompt, width, height, steps, seed, file_prefix, subfolder, cfg=1.0, shift=3.0, use_image=False, use_image_size=False, image_filename=None, mcnl_lora=False, snofs_lora=False, male_lora=False, frames=None, megapixels=None, fps=None, job_type='image', source_image=None, generation_duration=None, nsfw=False, batch_id=None, sentence_index=None, total_sentences=None, narrator_audio=None, style=None, temperature=None, exaggeration=None, cfg_weight=None, max_chars=None, silence_ms=None, language=None, duration=None, tts_engine=None, audio_format=None, chunk_size=None, repetition_penalty=None, emotion_description=None):
    """Add a new metadata entry"""
    metadata = load_metadata()
    entry = {
        "id": str(uuid.uuid4()),
        "filename": os.path.basename(image_path),
        "path": str(image_path),
        "subfolder": subfolder,
        "timestamp": datetime.now().isoformat(),
        "prompt": prompt,
        "width": width,
        "height": height,
        "steps": steps,
        "cfg": cfg,
        "shift": shift,
        "seed": seed,
        "use_image": use_image,
        "use_image_size": use_image_size,
        "image_filename": image_filename,
        "file_prefix": file_prefix,
        "mcnl_lora": mcnl_lora,
        "snofs_lora": snofs_lora,
        "male_lora": male_lora,
        "job_type": job_type,
        "generation_duration": generation_duration
    }
    
    # Add video-specific fields
    if job_type == 'video':
        entry["frames"] = frames
        entry["megapixels"] = megapixels
        entry["fps"] = fps
        entry["source_image"] = source_image
        entry["nsfw"] = nsfw
    
    # Add TTS-specific fields
    if job_type == 'tts':
        entry["batch_id"] = batch_id
        entry["sentence_index"] = sentence_index
        entry["total_sentences"] = total_sentences
        entry["narrator_audio"] = narrator_audio
        entry["ref_audio"] = narrator_audio  # Alias for consistency
        entry["style"] = style or narrator_audio  # Store voice/style for TTS
        entry["text"] = prompt  # Store text in both prompt and text fields
        entry["version_number"] = 0  # Default to version 0, will be set by regeneration
        entry["duration"] = duration if duration is not None else 0  # Audio duration in seconds
        # Store Gradio TTS settings
        entry["tts_engine"] = tts_engine or "ChatterboxTTS"
        entry["audio_format"] = audio_format or "wav"
        entry["temperature"] = temperature if temperature is not None else 0.8
        entry["exaggeration"] = exaggeration if exaggeration is not None else 0.5
        entry["cfg_weight"] = cfg_weight if cfg_weight is not None else 0.5
        entry["chunk_size"] = chunk_size if chunk_size is not None else 300
        entry["language"] = language or "en"
        entry["repetition_penalty"] = repetition_penalty if repetition_penalty is not None else 2.0
        entry["emotion_description"] = emotion_description or ""
        # Legacy fields for backward compatibility
        entry["max_chars"] = chunk_size if chunk_size is not None else 300
        entry["silence_ms"] = 100  # Not used in Gradio API, but keep for compatibility
    
    metadata.append(entry)
    save_metadata(metadata)
    return entry


def process_queue():
    """Background thread to process the generation queue"""
    global active_generation, generation_queue, completed_jobs, last_workflow_type, cancellation_requested, queue_paused
    
    def get_audio_duration(file_path):
        """Calculate audio file duration in seconds"""
        try:
            file_path_str = str(file_path)
            # For WAV files
            if file_path_str.lower().endswith('.wav'):
                with wave.open(file_path_str, 'r') as audio_file:
                    frames = audio_file.getnframes()
                    rate = audio_file.getframerate()
                    duration = frames / float(rate)
                    print(f"[AUDIO] WAV duration for {Path(file_path).name}: {duration:.2f}s")
                    return round(duration, 2)
            # For MP3 files
            elif file_path_str.lower().endswith('.mp3'):
                if MUTAGEN_AVAILABLE:
                    audio = MP3(file_path_str)
                    duration = audio.info.length
                    print(f"[AUDIO] MP3 duration for {Path(file_path).name}: {duration:.2f}s")
                    return round(duration, 2)
                else:
                    # Fallback: Average bitrate estimation: 128 kbps = 16000 bytes/sec
                    file_size = os.path.getsize(file_path_str)
                    duration = file_size / 16000  # Rough approximation
                    print(f"[AUDIO] MP3 duration (estimated) for {Path(file_path).name}: {duration:.2f}s")
                    return round(duration, 2)
            else:
                return 0
        except Exception as e:
            print(f"[AUDIO] Error calculating duration for {file_path}: {e}")
            return 0
    
    while True:
        job = None
        
        with queue_lock:
            # Only take new jobs if queue is not paused
            if generation_queue and not active_generation and not queue_paused:
                job = generation_queue[-1]  # Take from end (oldest item)
                active_generation = job
                job['status'] = 'generating'
                job['start_time'] = time.time()  # Track generation start time
                cancellation_requested = False  # Reset cancellation flag
        
        if job:
            try:
                start_time = job.get('start_time', time.time())
                job_type = job.get('job_type', 'image')
                file_prefix = job.get('file_prefix', 'velvet')
                subfolder = job.get('subfolder', '')
                
                # Get the seed (generate if not provided)
                seed = job.get('seed')
                if seed is None:
                    import random
                    seed = random.randint(0, 2**32 - 1)
                
                if job_type == 'video':
                    # Video generation
                    is_nsfw = job.get('nsfw', False)
                    current_workflow = 'video_nsfw' if is_nsfw else 'video'
                    
                    # Unload models if switching workflow types
                    if last_workflow_type and last_workflow_type != current_workflow:
                        print(f"[WORKFLOW] Switching from {last_workflow_type} to {current_workflow}, unloading models...")
                        if last_workflow_type.startswith('chat:'):
                            print("[WORKFLOW] Unloading Ollama (automatic on workflow switch)")
                            ollama_client.unload_all_models()
                        elif last_workflow_type == 'tts':
                            print("[WORKFLOW] Unloading Gradio TTS (automatic on workflow switch)")
                            gradio_tts_client.unload_all_engines()
                        else:
                            comfyui_client.unload_models()
                        time.sleep(2)  # Give time to unload
                    
                    last_workflow_type = current_workflow
                    
                    print(f"[VIDEO] Starting {'NSFW ' if is_nsfw else ''}video generation...")
                    print(f"[VIDEO] Prompt: {job['prompt']}")
                    print(f"[VIDEO] Image: {job.get('image_filename', 'violet.webp')}")
                    print(f"[VIDEO] Frames: {job.get('frames', 64)}, FPS: {job.get('fps', 16)}, Megapixels: {job.get('megapixels', 0.25)}")
                    
                    relative_path, output_path = get_next_filename(file_prefix, subfolder, 'mp4', 'videos')
                    print(f"[VIDEO] Output path: {output_path}")
                    
                    comfyui_client.generate_video(
                        positive_prompt=job['prompt'],
                        image_filename=job.get('image_filename', 'violet.webp'),
                        frames=job.get('frames', 64),
                        megapixels=job.get('megapixels', 0.25),
                        fps=job.get('fps', 16),
                        seed=seed,
                        output_path=str(output_path),
                        wait=True,
                        nsfw=is_nsfw
                    )
                    
                    print(f"[VIDEO] Video generation completed")
                    
                    # Generate thumbnail for the video
                    try:
                        thumbnail_path = get_or_generate_thumbnail(output_path)
                        if thumbnail_path:
                            print(f"[VIDEO] Thumbnail generated: {thumbnail_path}")
                        else:
                            print(f"[VIDEO] Warning: Thumbnail generation failed")
                    except Exception as e:
                        print(f"[VIDEO] Error generating thumbnail: {e}")
                    
                    # Calculate generation duration
                    generation_duration = round(time.time() - start_time, 1)
                    
                    # Add metadata for video
                    metadata_entry = add_metadata_entry(
                        str(output_path),
                        job['prompt'],
                        0, 0,  # No width/height for video
                        0,  # No steps for video
                        seed,
                        file_prefix,
                        subfolder,
                        frames=job.get('frames', 64),
                        megapixels=job.get('megapixels', 0.25),
                        fps=job.get('fps', 16),
                        job_type='video',
                        source_image=job.get('image_filename', 'violet.webp'),
                        generation_duration=generation_duration,
                        nsfw=is_nsfw
                    )
                elif job_type == 'tts':
                    # TTS generation using Gradio API - process all sentences in this job
                    current_workflow = 'tts'
                    
                    # Unload models if switching workflow types
                    if last_workflow_type and last_workflow_type != current_workflow:
                        print(f"[WORKFLOW] Switching from {last_workflow_type} to {current_workflow}, unloading models...")
                        if last_workflow_type.startswith('chat:'):
                            ollama_client.unload_all_models()
                            time.sleep(1)
                        elif last_workflow_type == 'tts':
                            print("[WORKFLOW] Unloading Gradio TTS (automatic on workflow switch)")
                            gradio_tts_client.unload_all_engines()
                            time.sleep(1)
                        else:
                            comfyui_client.unload_models()
                            time.sleep(2)
                    
                    last_workflow_type = current_workflow
                    
                    # Get TTS parameters
                    sentences = job.get('sentences', [])
                    batch_id = job.get('batch_id')
                    total_sentences = len(sentences)
                    is_regeneration = job.get('regeneration', False)
                    original_sentence_index = job.get('original_sentence_index', 0)
                    version_number = job.get('version_number', 0)
                    
                    # Get Gradio TTS specific parameters
                    tts_engine = job.get('tts_engine', 'ChatterboxTTS')
                    audio_format = job.get('audio_format', 'wav')
                    ref_audio_name = job.get('ref_audio', 'Holly.mp3')  # Reference audio filename
                    
                    print(f"[TTS] Starting TTS {'regeneration' if is_regeneration else 'batch'} generation...")
                    print(f"[TTS] Total sentences: {total_sentences}")
                    print(f"[TTS] Reference Audio: {ref_audio_name}")
                    print(f"[TTS] Engine: {tts_engine}")
                    if is_regeneration:
                        print(f"[TTS] Regenerating sentence {original_sentence_index} (version {version_number})")
                    
                    # Resolve reference audio file path from ComfyUI input directory
                    ref_audio_path = COMFYUI_INPUT_DIR / ref_audio_name
                    
                    # Check if reference audio exists
                    if not ref_audio_path.exists():
                        print(f"[TTS] ERROR: Reference audio not found: {ref_audio_path}")
                        job['status'] = 'failed'
                        job['error'] = f'Reference audio file not found: {ref_audio_name}'
                        job['failed_at'] = datetime.now().isoformat()
                        # Don't use continue - let the job flow to completion section
                    
                    # Load TTS engine if not already loaded (only if job hasn't failed)
                    if job.get('status') != 'failed':
                        engine_map = {
                            'ChatterboxTTS': 'standard',
                            'Chatterbox Multilingual': 'multilingual',
                            'Chatterbox Turbo': 'turbo'
                        }
                        engine_type = engine_map.get(tts_engine, 'standard')
                        
                        # Only load if different from current engine
                        if gradio_tts_client.current_engine != engine_type:
                            print(f"[TTS] Loading engine: {tts_engine} ({engine_type})")
                            if not gradio_tts_client.load_engine(engine_type):
                                print("[TTS] ERROR: Failed to load TTS engine")
                                job['status'] = 'failed'
                                job['error'] = 'Failed to load TTS engine'
                                job['failed_at'] = datetime.now().isoformat()
                                # Don't use continue - let the job flow to completion section
                    
                    output_paths = []
                    metadata_entries = []  # Collect metadata entries without saving
                    batch_token = (batch_id or str(job.get('id', '')) or str(uuid.uuid4()))[:8]
                    
                    # Define worker function for parallel TTS generation
                    def generate_sentence(idx, sentence):
                        """Worker function to generate a single sentence in parallel"""
                        try:
                            # Determine output file extension based on audio_format
                            file_ext = audio_format if audio_format in ['wav', 'mp3'] else 'wav'
                            
                            # For regenerations, use version suffix in filename
                            if is_regeneration:
                                version_suffix = f"_s{original_sentence_index}_v{version_number}"
                                versioned_prefix = f"{file_prefix}{version_suffix}"
                                # Thread-safe: Use unique prefix per sentence
                                with queue_lock:  # Lock to prevent filename conflicts
                                    relative_path, output_path = get_next_filename(versioned_prefix, subfolder, file_ext, 'audio')
                                actual_sentence_index = original_sentence_index
                            else:
                                # Normal generation - include batch token to avoid overwriting files from older batches
                                sentence_prefix = f"{file_prefix}_{batch_token}_s{idx:04d}"  # e.g., tts_a1b2c3d4_s0001
                                # Thread-safe: Use unique prefix per sentence (no lock needed)
                                if subfolder:
                                    target_dir = OUTPUT_DIR / 'audio' / subfolder
                                else:
                                    target_dir = OUTPUT_DIR / 'audio'
                                target_dir.mkdir(parents=True, exist_ok=True)
                                filename = f"{sentence_prefix}.{file_ext}"
                                output_path = target_dir / filename
                                relative_path = output_path.relative_to(OUTPUT_DIR)
                                actual_sentence_index = idx
                            
                            print(f"[TTS] [{idx + 1}/{total_sentences}] Starting: {sentence[:50]}...")
                            
                            # Generate TTS using Gradio API (skip cleanup until all sentences done)
                            result = gradio_tts_client.generate_tts(
                                text=sentence,
                                ref_audio_path=str(ref_audio_path),
                                engine=tts_engine,
                                audio_format=audio_format,
                                exaggeration=job.get('exaggeration', 0.5),
                                temperature=job.get('temperature', 0.8),
                                cfg_weight=job.get('cfg_weight', 0.5),
                                chunk_size=job.get('chunk_size', 300),
                                seed=seed if seed else 0,
                                language=job.get('language', 'en'),
                                repetition_penalty=job.get('repetition_penalty', 2.0),
                                emotion_description=job.get('emotion_description', ''),
                                output_path=str(output_path),
                                skip_cleanup=True
                            )
                            
                            if not result:
                                return {'success': False, 'idx': idx, 'error': f'Failed to generate audio'}
                            
                            # Calculate audio duration
                            audio_duration = get_audio_duration(output_path)
                            
                            # Create metadata entry
                            entry = {
                                "id": str(uuid.uuid4()),
                                "filename": os.path.basename(output_path),
                                "path": str(output_path),
                                "subfolder": subfolder,
                                "timestamp": datetime.now().isoformat(),
                                "prompt": sentence,
                                "text": sentence,
                                "width": 0,
                                "height": 0,
                                "steps": 0,
                                "cfg": 1.0,
                                "shift": 3.0,
                                "seed": seed if seed else 0,
                                "use_image": False,
                                "use_image_size": False,
                                "image_filename": None,
                                "file_prefix": file_prefix,
                                "mcnl_lora": False,
                                "snofs_lora": False,
                                "male_lora": False,
                                "job_type": 'tts',
                                "batch_id": batch_id,
                                "sentence_index": actual_sentence_index,
                                "total_sentences": total_sentences,
                                "narrator_audio": ref_audio_name,
                                "ref_audio": ref_audio_name,
                                "style": ref_audio_name,
                                "version_number": version_number if is_regeneration else 0,
                                "duration": audio_duration,
                                "tts_engine": tts_engine,
                                "audio_format": audio_format,
                                "temperature": job.get('temperature', 0.8),
                                "exaggeration": job.get('exaggeration', 0.5),
                                "cfg_weight": job.get('cfg_weight', 0.5),
                                "chunk_size": job.get('chunk_size', 300),
                                "max_chars": job.get('chunk_size', 300),
                                "language": job.get('language', 'en'),
                                "repetition_penalty": job.get('repetition_penalty', 2.0),
                                "emotion_description": job.get('emotion_description', ''),
                                "silence_ms": 100
                            }
                            
                            print(f"[TTS] [{idx + 1}/{total_sentences}] Completed")
                            return {'success': True, 'idx': idx, 'entry': entry, 'relative_path': str(relative_path)}
                            
                        except Exception as e:
                            print(f"[TTS] [{idx + 1}/{total_sentences}] ERROR: {e}")
                            import traceback
                            traceback.print_exc()
                            return {'success': False, 'idx': idx, 'error': str(e)}
                    
                    # Process sentences in parallel (only if job hasn't already failed)
                    if job.get('status') != 'failed':
                        # Use ThreadPoolExecutor for parallel generation (max 3 concurrent)
                        max_workers = min(3, len(sentences))  # Limit to 3 parallel generations
                        results = [None] * len(sentences)  # Pre-allocate results array to maintain order
                        
                        print(f"[TTS] Starting parallel generation with {max_workers} workers...")
                        
                        with ThreadPoolExecutor(max_workers=max_workers) as executor:
                            # Submit all sentences for generation
                            future_to_idx = {executor.submit(generate_sentence, idx, sentence): idx 
                                           for idx, sentence in enumerate(sentences)}
                            
                            # Collect results as they complete
                            completed_count = 0
                            for future in as_completed(future_to_idx):
                                # Check for cancellation
                                if cancellation_requested:
                                    print(f"[TTS] Cancellation detected, stopping generation...")
                                    job['status'] = 'cancelled'
                                    executor.shutdown(wait=False, cancel_futures=True)
                                    break
                                
                                idx = future_to_idx[future]
                                result = future.result()
                                results[idx] = result  # Store in correct position
                                
                                if result['success']:
                                    completed_count += 1
                                    # Update progress counter
                                    with queue_lock:
                                        if active_generation and active_generation.get('id') == job['id']:
                                            active_generation['completed_sentences'] = completed_count
                                        job['completed_sentences'] = completed_count
                                else:
                                    print(f"[TTS] ERROR on sentence {idx + 1}: {result.get('error')}")
                                    job['status'] = 'failed'
                                    job['error'] = f"Failed to generate sentence {idx + 1}: {result.get('error')}"
                                    job['failed_at'] = datetime.now().isoformat()
                                    executor.shutdown(wait=False, cancel_futures=True)
                                    break
                        
                        # Process results in order (for metadata and output paths)
                        if job.get('status') != 'failed' and job.get('status') != 'cancelled':
                            for result in results:
                                if result and result['success']:
                                    metadata_entries.append(result['entry'])
                                    output_paths.append(result['relative_path'])
                        
                        print(f"[TTS] All sentences completed, saving metadata...")
                        
                        # Save all metadata entries at once (single disk write)
                        if metadata_entries:
                            metadata = load_metadata()
                            metadata.extend(metadata_entries)
                            save_metadata(metadata)
                            print(f"[TTS] Saved {len(metadata_entries)} metadata entries")
                        
                        # Cleanup TTS output folder once after all sentences
                        print(f"[TTS] Cleaning up TTS output folder...")
                        gradio_tts_client.cleanup_output_folder()
                        
                        # Save queue state once after all sentences
                        save_queue_state()
                        print(f"[TTS] Queue state saved")
                    else:
                        print(f"[TTS] Skipping sentence processing due to earlier failure")
                    
                    # Auto-merge audio if chat message tracking is enabled
                    if job.get('chat_message_id') and job.get('status') != 'failed' and FFMPEG_AVAILABLE:
                        try:
                            print(f"[TTS] Auto-merging audio for chat message: {job.get('chat_message_id')}")
                            merged_file = merge_tts_batch_for_chat(batch_id, job.get('chat_message_id'), job.get('session_id'))
                            if merged_file:
                                print(f"[TTS] Successfully auto-merged to: {merged_file}")
                                job['merged_audio'] = merged_file
                            else:
                                print(f"[TTS] Auto-merge failed")
                        except Exception as e:
                            print(f"[TTS] Error during auto-merge: {e}")
                            import traceback
                            traceback.print_exc()
                    
                    # Calculate total generation duration
                    generation_duration = round(time.time() - start_time, 1)
                    job['generation_duration'] = generation_duration
                    job['output_paths'] = output_paths
                
                elif job_type == 'generate_session_name':
                    # Generate session name based on chat context
                    session_id = job.get('session_id')
                    model = job.get('model', 'llama3.2')
                    
                    # Switch to chat workflow if needed
                    current_workflow = f'generate_name:{model}'
                    if last_workflow_type and last_workflow_type != current_workflow:
                        print(f"[WORKFLOW] Switching from {last_workflow_type} to {current_workflow}, unloading models...")
                        if not last_workflow_type.startswith('chat:') and not last_workflow_type.startswith('generate_name:'):
                            comfyui_client.unload_models()
                            time.sleep(2)
                    last_workflow_type = current_workflow
                    
                    print(f"[NAME_GEN] Generating name for session {session_id} using {model}")
                    
                    try:
                        # Get session data
                        with chat_lock:
                            sessions = load_chats()
                            session_data = None
                            for s in sessions:
                                if s['session_id'] == session_id:
                                    session_data = s
                                    break
                        
                        if not session_data:
                            print(f"[NAME_GEN] Session not found: {session_id}")
                            raise Exception("Session not found")
                        
                        # Build context from recent messages (last 5 exchanges max)
                        messages = session_data.get('messages', [])
                        context_messages = messages[-10:] if len(messages) > 10 else messages
                        
                        # Build context summary
                        context_text = ""
                        for msg in context_messages:
                            role = "User" if msg['role'] == 'user' else "Assistant"
                            content = msg.get('content', '')[:200]  # Limit length
                            context_text += f"{role}: {content}\n"
                        
                        # Create prompt for name generation
                        name_prompt = f"""Based on the following conversation, generate a SHORT, descriptive session name (2-5 words maximum). The name should capture the main topic or theme. Do NOT use quotes. Just output the name directly.

Conversation:
{context_text}

Session name:"""
                        
                        print(f"[NAME_GEN] Requesting name from {model}...")
                        
                        # Generate name using Ollama
                        ollama_messages = [{'role': 'user', 'content': name_prompt}]
                        response_gen = ollama_client.chat(
                            model=model,
                            messages=ollama_messages,
                            stream=False
                        )
                        
                        # Get the response from generator (even with stream=False it returns a generator)
                        generated_name = ''.join(response_gen).strip()
                        
                        # Clean up - remove quotes and limit length
                        generated_name = generated_name.strip('"\'\'""')
                        if len(generated_name) > 50:
                            generated_name = generated_name[:50].strip()
                        
                        print(f"[NAME_GEN] Generated name: {generated_name}")
                        
                        # Update session name
                        with chat_lock:
                            sessions = load_chats()
                            for s in sessions:
                                if s['session_id'] == session_id:
                                    s['chat_name'] = generated_name
                                    s['updated_at'] = datetime.now().isoformat()
                                    break
                            save_chats(sessions)
                        
                        job['generated_name'] = generated_name
                        print(f"[NAME_GEN] Session name updated to: {generated_name}")
                        
                    except Exception as e:
                        import traceback
                        print(f"[NAME_GEN] Error generating session name: {e}")
                        print(f"[NAME_GEN] Traceback: {traceback.format_exc()}")
                        job['error'] = str(e)
                        raise
                
                elif job_type == 'chat':
                    # Chat generation with Ollama
                    session_id = job.get('session_id')
                    model = job.get('model', 'llama3.2')
                    user_message = job.get('message')
                    response_id = job.get('response_id')
                    
                    current_workflow = f'chat:{model}'
                    
                    # Unload models if switching from other workflow types
                    if last_workflow_type and not last_workflow_type.startswith('chat:'):
                        print(f"[WORKFLOW] Switching from {last_workflow_type} to {current_workflow}, unloading models...")
                        if last_workflow_type == 'tts':
                            print("[WORKFLOW] Unloading Gradio TTS (automatic on workflow switch)")
                            gradio_tts_client.unload_all_engines()
                            time.sleep(1)
                        else:
                            comfyui_client.unload_models()
                            time.sleep(2)
                    # If switching between different chat models, unload previous Ollama model
                    elif last_workflow_type and last_workflow_type != current_workflow:
                        print(f"[WORKFLOW] Switching chat model from {last_workflow_type} to {current_workflow}, unloading previous model...")
                        ollama_client.unload_all_models()
                        time.sleep(1)
                    
                    last_workflow_type = current_workflow
                    
                    print(f"[CHAT] Processing message in session {session_id}")
                    print(f"[CHAT] Model: {model}")
                    
                    # Handle case where message might be an object (shouldn't happen, but defensive)
                    if isinstance(user_message, dict):
                        user_message = user_message.get('content', str(user_message))
                    elif not isinstance(user_message, str):
                        user_message = str(user_message)
                    
                    print(f"[CHAT] Message: {user_message[:100]}...")
                    
                    # CRITICAL: Reload session from disk to get latest messages
                    # This ensures that if multiple chat jobs are queued, each one
                    # gets the updated context from previously completed responses
                    sessions = load_chats()
                    session_data = None
                    for s in sessions:
                        if s['session_id'] == session_id:
                            session_data = s
                            break
                    
                    if not session_data:
                        raise Exception(f"Session {session_id} not found")
                    
                    print(f"[CHAT] Session has {len(session_data['messages'])} total messages")
                    print(f"[CHAT] Looking for response_id: {response_id}")
                    
                    # Find the placeholder assistant message (should already exist from when message was sent)
                    assistant_msg = None
                    for msg in session_data['messages']:
                        if msg.get('response_id') == response_id:
                            assistant_msg = msg
                            break
                    
                    # If not found (shouldn't happen), create new placeholder
                    if not assistant_msg:
                        print(f"[WARNING] Assistant message not found, creating placeholder for {response_id}")
                        assistant_msg = {
                            'role': 'assistant',
                            'content': '',
                            'timestamp': datetime.now().isoformat(),
                            'response_id': response_id,
                            'completed': False
                        }
                        session_data['messages'].append(assistant_msg)
                        with chat_lock:
                            # Reload to ensure we don't overwrite
                            sessions = load_chats()
                            for s in sessions:
                                if s['session_id'] == session_id:
                                    s['messages'].append(assistant_msg)
                                    break
                            save_chats(sessions)
                    
                    # Build message context (all messages UP TO this point in sequence)
                    # CRITICAL: Only include messages that come BEFORE this response in the conversation
                    # This prevents including future user messages that are queued but not yet processed
                    messages = []
                    
                    # Add system prompt as first message if provided
                    system_prompt = session_data.get('system_prompt', '')
                    print(f"[CHAT] System prompt present: {bool(system_prompt)}")
                    if system_prompt:
                        print(f"[CHAT] Adding system message: '{system_prompt[:100]}...'")
                        messages.append({
                            'role': 'system',
                            'content': system_prompt
                        })
                    
                    # Find the position of the current response message
                    current_msg_index = None
                    for idx, msg in enumerate(session_data['messages']):
                        if msg.get('response_id') == response_id:
                            current_msg_index = idx
                            break
                    
                    if current_msg_index is None:
                        print(f"[WARNING] Could not find current message in session, using all messages")
                        current_msg_index = len(session_data['messages'])
                    
                    print(f"[CHAT] Current response index: {current_msg_index}")
                    print(f"[CHAT] Total session messages: {len(session_data['messages'])}")
                    
                    # Include only messages BEFORE the current response
                    for idx, msg in enumerate(session_data['messages']):
                        # Stop before we reach the current response
                        if idx >= current_msg_index:
                            break
                        
                        # Include messages with content (both user and completed assistant)
                        if msg.get('content'):
                            print(f"[CHAT] Adding message {idx}: {msg['role']} - '{msg['content'][:50]}...'")
                            messages.append({
                                'role': msg['role'],
                                'content': msg['content']
                            })
                    
                    # Validation: ensure we have at least one user message
                    has_user_message = any(m['role'] == 'user' for m in messages)
                    if not has_user_message:
                        print(f"[ERROR] No user message in context! Messages: {[m['role'] for m in messages]}")
                        raise Exception("Cannot generate response without user message")
                    
                    print(f"[CHAT] Context for response {response_id}: {len(messages)} messages (including system prompt)")
                    if messages:
                        print(f"[CHAT] Last context message: {messages[-1]['role']}: {messages[-1]['content'][:50]}...")
                    
                    # ============= DEBUG: Full Context Being Sent to Ollama =============
                    temperature = session_data.get('temperature', 0.7)
                    top_p = session_data.get('top_p', 0.9)
                    top_k = session_data.get('top_k', 40)
                    repeat_penalty = session_data.get('repeat_penalty', 1.1)
                    num_ctx = session_data.get('num_ctx', 2048)
                    seed = session_data.get('seed', None)
                    
                    print(f"\n{'='*80}")
                    print(f"[CHAT DEBUG] Full context being sent to Ollama for response_id: {response_id}")
                    print(f"[CHAT DEBUG] Model: {model}")
                    print(f"[CHAT DEBUG] Temperature: {temperature}")
                    print(f"[CHAT DEBUG] Top P: {top_p}")
                    print(f"[CHAT DEBUG] Top K: {top_k}")
                    print(f"[CHAT DEBUG] Repeat Penalty: {repeat_penalty}")
                    print(f"[CHAT DEBUG] Context Window: {num_ctx}")
                    print(f"[CHAT DEBUG] Seed: {seed if seed is not None else 'random'}")
                    print(f"[CHAT DEBUG] Number of messages in context: {len(messages)}")
                    print(f"-" * 80)
                    for idx, msg in enumerate(messages):
                        role_label = msg['role'].upper()
                        content_preview = msg['content'][:100].replace('\n', ' ')
                        if len(msg['content']) > 100:
                            content_preview += '...'
                        print(f"[CHAT DEBUG] [{idx+1}] {role_label}: {content_preview}")
                    print(f"{'='*80}\n")
                    # ===================================================================
                    
                    # Stream response from Ollama
                    try:
                        full_response = ''
                        chunk_count = 0
                        has_error = False
                        
                        for chunk in ollama_client.chat(
                            model=model,
                            messages=messages,
                            temperature=temperature,
                            top_p=top_p,
                            top_k=top_k,
                            repeat_penalty=repeat_penalty,
                            num_ctx=num_ctx,
                            stream=True
                        ):
                            # Check if cancellation was requested
                            if cancellation_requested:
                                print(f"[CHAT] Cancellation detected, stopping stream at {len(full_response)} characters")
                                break
                            
                            # Check if chunk is an error message
                            if chunk.startswith('Error'):
                                has_error = True
                                full_response = chunk
                                print(f"[CHAT] Ollama returned error: {chunk}")
                                break
                            
                            full_response += chunk
                            chunk_count += 1
                            
                            # Update the assistant message in session periodically (every 10 chunks)
                            # This reduces file I/O while keeping updates reasonably real-time
                            if chunk_count % 10 == 0:
                                # CRITICAL: Reload sessions from disk before saving to avoid overwriting
                                # newer messages that were added while we're streaming
                                with chat_lock:
                                    sessions = load_chats()
                                    session_data = None
                                    for s in sessions:
                                        if s['session_id'] == session_id:
                                            session_data = s
                                            break
                                    
                                    if session_data:
                                        # Find our assistant message again
                                        for msg in session_data['messages']:
                                            if msg.get('response_id') == response_id:
                                                msg['content'] = full_response
                                                break
                                        save_chats(sessions)
                        
                        # If error occurred, mark job as failed
                        if has_error:
                            with chat_lock:
                                sessions = load_chats()
                                session_data = None
                                for s in sessions:
                                    if s['session_id'] == session_id:
                                        session_data = s
                                        break
                                
                                if session_data:
                                    for msg in session_data['messages']:
                                        if msg.get('response_id') == response_id:
                                            msg['content'] = full_response
                                            msg['completed'] = True
                                            msg['error'] = True
                                            break
                                    save_chats(sessions)
                            
                            # Mark job as failed
                            with queue_lock:
                                if active_generation and active_generation.get('id') == job['id']:
                                    active_generation['status'] = 'failed'
                                job['status'] = 'failed'
                                job['failed_at'] = datetime.now().isoformat()
                            # Don't use continue - let job flow to completion section to clear active_generation
                        
                        # Final save with completed status
                        with chat_lock:
                            sessions = load_chats()
                            session_data = None
                            for s in sessions:
                                if s['session_id'] == session_id:
                                    session_data = s
                                    break
                            
                            if session_data:
                                # Find our assistant message again
                                for msg in session_data['messages']:
                                    if msg.get('response_id') == response_id:
                                        msg['content'] = full_response.strip()
                                        msg['completed'] = True
                                        msg['timestamp'] = datetime.now().isoformat()
                                        # Add cancelled flag if generation was interrupted
                                        if cancellation_requested and full_response.strip():
                                            msg['cancelled'] = True
                                        break
                                save_chats(sessions)
                        
                        status_text = "cancelled" if cancellation_requested else "completed"
                        print(f"[CHAT] Response {status_text}: {len(full_response)} characters")
                        
                        # Calculate generation duration
                        generation_duration = round(time.time() - start_time, 1)
                        job['generation_duration'] = generation_duration
                        job['response'] = full_response
                        
                        # Mark job as cancelled if cancellation was requested
                        if cancellation_requested:
                            job['status'] = 'cancelled'
                            print("[CHAT] Job marked as cancelled (text preserved)")
                        
                    except Exception as e:
                        import traceback
                        print(f"[CHAT] Error generating response: {e}")
                        print(f"[CHAT] Traceback: {traceback.format_exc()}")
                        
                        # Mark the response as failed
                        with chat_lock:
                            sessions = load_chats()
                            session_data = None
                            for s in sessions:
                                if s['session_id'] == session_id:
                                    session_data = s
                                    break
                            
                            if session_data:
                                for msg in session_data['messages']:
                                    if msg.get('response_id') == response_id:
                                        msg['content'] = f"Error: {str(e)}"
                                        msg['completed'] = True
                                        msg['error'] = True
                                        break
                                save_chats(sessions)
                        raise
                
                elif job_type == 'autochat':
                    # Autochat generation with Ollama (autonomous AI-to-AI conversation)
                    session_id = job.get('session_id')
                    active_persona = job.get('active_persona')  # 'a' or 'b'
                    response_id = job.get('response_id')
                    
                    print(f"[AUTOCHAT] Processing turn for session {session_id}, persona {active_persona}")
                    
                    # Reload session from disk
                    sessions = load_autochat()
                    session_data = None
                    for s in sessions:
                        if s['session_id'] == session_id:
                            session_data = s
                            break
                    
                    if not session_data:
                        raise Exception(f"Autochat session {session_id} not found")
                    
                    # Check if session is still running
                    if session_data.get('status') != 'running':
                        print(f"[AUTOCHAT] Session stopped, skipping turn")
                        continue
                    
                    # Get shared model (prefer top-level, fallback to persona model for backward compatibility)
                    model = session_data.get('model') or session_data[f'persona_{active_persona}'].get('model', 'llama3.2')
                    
                    # Get persona settings
                    persona = session_data[f'persona_{active_persona}']
                    
                    current_workflow = f'autochat:{model}'
                    
                    # Unload models if switching from other workflow types
                    if last_workflow_type and not last_workflow_type.startswith(('chat:', 'story:', 'autochat:')):
                        print(f"[WORKFLOW] Switching from {last_workflow_type} to {current_workflow}, unloading models...")
                        if last_workflow_type == 'tts':
                            print("[WORKFLOW] Unloading Gradio TTS (automatic on workflow switch)")
                            gradio_tts_client.unload_all_engines()
                            time.sleep(1)
                        else:
                            comfyui_client.unload_models()
                            time.sleep(2)
                    # If switching between different models, unload previous Ollama model
                    elif last_workflow_type and last_workflow_type != current_workflow:
                        print(f"[WORKFLOW] Switching model from {last_workflow_type} to {current_workflow}, unloading previous model...")
                        ollama_client.unload_all_models()
                        time.sleep(1)
                    
                    last_workflow_type = current_workflow
                    
                    # Create placeholder message
                    assistant_msg = {
                        'role': 'assistant',  # All autochat messages stored as assistant
                        'content': '',
                        'timestamp': datetime.now().isoformat(),
                        'response_id': response_id,
                        'persona': active_persona,
                        'completed': False,
                        'manual': False
                    }
                    
                    with chat_lock:
                        sessions = load_autochat()
                        for s in sessions:
                            if s['session_id'] == session_id:
                                s['messages'].append(assistant_msg)
                                save_autochat(sessions)
                                break
                    
                    # Build context for this persona
                    messages = build_autochat_context(session_data, active_persona)
                    
                    print(f"[AUTOCHAT] Persona {active_persona.upper()} ({persona['name']}) - {len(messages)} context messages")
                    
                    # Get generation parameters
                    temperature = persona.get('temperature', 0.7)
                    top_p = persona.get('top_p', 0.9)
                    top_k = persona.get('top_k', 40)
                    repeat_penalty = persona.get('repeat_penalty', 1.1)
                    seed = persona.get('seed', None)
                    # Use shared num_ctx (prefer top-level, fallback to persona for backward compatibility)
                    num_ctx = session_data.get('num_ctx') or persona.get('num_ctx', 2048)
                    
                    # Stream response from Ollama
                    try:
                        full_response = ''
                        chunk_count = 0
                        has_error = False
                        
                        for chunk in ollama_client.chat(
                            model=model,
                            messages=messages,
                            temperature=temperature,
                            top_p=top_p,
                            top_k=top_k,
                            repeat_penalty=repeat_penalty,
                            num_ctx=num_ctx,
                            seed=seed,
                            stream=True
                        ):
                            # Check if cancellation was requested
                            if cancellation_requested:
                                print(f"[AUTOCHAT] Cancellation detected")
                                break
                            
                            # Check if chunk is an error message
                            if chunk.startswith('Error'):
                                has_error = True
                                full_response = chunk
                                print(f"[AUTOCHAT] Ollama returned error: {chunk}")
                                break
                            
                            full_response += chunk
                            chunk_count += 1
                            
                            # Update periodically (every 10 chunks)
                            if chunk_count % 10 == 0:
                                with chat_lock:
                                    sessions = load_autochat()
                                    for s in sessions:
                                        if s['session_id'] == session_id:
                                            for msg in s['messages']:
                                                if msg.get('response_id') == response_id:
                                                    msg['content'] = full_response
                                                    break
                                            save_autochat(sessions)
                                            break
                        
                        # Handle error
                        if has_error:
                            with chat_lock:
                                sessions = load_autochat()
                                for s in sessions:
                                    if s['session_id'] == session_id:
                                        for msg in s['messages']:
                                            if msg.get('response_id') == response_id:
                                                msg['content'] = full_response
                                                msg['completed'] = True
                                                msg['error'] = True
                                                break
                                        save_autochat(sessions)
                                        break
                            
                            with queue_lock:
                                if active_generation and active_generation.get('id') == job['id']:
                                    active_generation['status'] = 'failed'
                                job['status'] = 'failed'
                                job['failed_at'] = datetime.now().isoformat()
                            # Don't use continue - let job flow to completion section to clear active_generation
                        
                        # Final save with completed status
                        with chat_lock:
                            sessions = load_autochat()
                            session_data = None
                            for s in sessions:
                                if s['session_id'] == session_id:
                                    session_data = s
                                    break
                            
                            if session_data:
                                # Update message
                                for msg in session_data['messages']:
                                    if msg.get('response_id') == response_id:
                                        msg['content'] = full_response.strip()
                                        msg['completed'] = True
                                        msg['timestamp'] = datetime.now().isoformat()
                                        if cancellation_requested and full_response.strip():
                                            msg['cancelled'] = True
                                        break
                                
                                # Increment turn counter
                                session_data['current_turn'] += 1
                                
                                # Check if we should continue
                                should_continue = (
                                    session_data.get('status') == 'running' and
                                    session_data['current_turn'] < session_data.get('max_turns', 10) and
                                    not cancellation_requested
                                )
                                
                                if should_continue:
                                    # Queue next turn for other persona
                                    next_persona = 'b' if active_persona == 'a' else 'a'
                                    session_data['active_perspective'] = next_persona
                                    next_response_id = str(uuid.uuid4())
                                    
                                    # Get persona data for job display
                                    next_persona_data = session_data[f'persona_{next_persona}']
                                    shared_model = session_data.get('model', 'llama3.2')
                                    
                                    next_job = {
                                        'id': str(uuid.uuid4()),
                                        'job_type': 'autochat',
                                        'session_id': session_id,
                                        'active_persona': next_persona,
                                        'persona_name': next_persona_data.get('name', f'Persona {next_persona.upper()}'),
                                        'model': shared_model,
                                        'response_id': next_response_id,
                                        'status': 'queued',
                                        'created_at': datetime.now().isoformat()
                                    }
                                    
                                    with queue_lock:
                                        generation_queue.insert(0, next_job)
                                    
                                    print(f"[AUTOCHAT] Turn {session_data['current_turn']}/{session_data['max_turns']} complete, queuing persona {next_persona.upper()}")
                                else:
                                    # Max turns reached or stopped
                                    if session_data['current_turn'] >= session_data.get('max_turns', 10):
                                        session_data['status'] = 'stopped'
                                        print(f"[AUTOCHAT] Max turns ({session_data['max_turns']}) reached, conversation stopped")
                                    elif cancellation_requested:
                                        session_data['status'] = 'stopped'
                                        print(f"[AUTOCHAT] Conversation cancelled")
                                
                                save_autochat(sessions)
                        
                        status_text = "cancelled" if cancellation_requested else "completed"
                        print(f"[AUTOCHAT] Response {status_text}: {len(full_response)} characters")
                        
                        generation_duration = round(time.time() - start_time, 1)
                        job['generation_duration'] = generation_duration
                        job['response'] = full_response
                        
                        if cancellation_requested:
                            job['status'] = 'cancelled'
                        
                    except Exception as e:
                        import traceback
                        print(f"[AUTOCHAT] Error generating response: {e}")
                        print(f"[AUTOCHAT] Traceback: {traceback.format_exc()}")
                        
                        with chat_lock:
                            sessions = load_autochat()
                            for s in sessions:
                                if s['session_id'] == session_id:
                                    for msg in s['messages']:
                                        if msg.get('response_id') == response_id:
                                            msg['content'] = f"Error: {str(e)}"
                                            msg['completed'] = True
                                            msg['error'] = True
                                            break
                                    save_autochat(sessions)
                                    break
                        raise
                
                elif job_type == 'story':
                    # Story generation with Ollama + Lorebook system
                    session_id = job.get('session_id')
                    model = job.get('model', 'llama3.2')
                    user_message = job.get('message')
                    response_id = job.get('response_id')
                    
                    current_workflow = f'story:{model}'
                    
                    # Unload models if switching from other workflow types
                    if last_workflow_type and not last_workflow_type.startswith(('chat:', 'story:')):
                        print(f"[WORKFLOW] Switching from {last_workflow_type} to {current_workflow}, unloading models...")
                        if last_workflow_type == 'tts':
                            print("[WORKFLOW] Unloading Gradio TTS (automatic on workflow switch)")
                            gradio_tts_client.unload_all_engines()
                            time.sleep(1)
                        else:
                            comfyui_client.unload_models()
                            time.sleep(2)
                    # If switching between different models, unload previous Ollama model
                    elif last_workflow_type and last_workflow_type != current_workflow:
                        print(f"[WORKFLOW] Switching model from {last_workflow_type} to {current_workflow}, unloading previous model...")
                        ollama_client.unload_all_models()
                        time.sleep(1)
                    
                    last_workflow_type = current_workflow
                    
                    print(f"[STORY] Processing message in session {session_id}")
                    print(f"[STORY] Model: {model}")
                    
                    # Handle case where message might be an object
                    if isinstance(user_message, dict):
                        user_message = user_message.get('content', str(user_message))
                    elif not isinstance(user_message, str):
                        user_message = str(user_message)
                    
                    print(f"[STORY] Message: {user_message[:100]}...")
                    
                    # CRITICAL: Reload session from disk to get latest messages
                    sessions = load_stories()
                    session_data = None
                    for s in sessions:
                        if s['session_id'] == session_id:
                            session_data = s
                            break
                    
                    if not session_data:
                        raise Exception(f"Story session {session_id} not found")
                    
                    print(f"[STORY] Session has {len(session_data['messages'])} total messages")
                    
                    # Find the placeholder assistant message
                    assistant_msg = None
                    for msg in session_data['messages']:
                        if msg.get('response_id') == response_id:
                            assistant_msg = msg
                            break
                    
                    if not assistant_msg:
                        print(f"[WARNING] Assistant message not found, creating placeholder for {response_id}")
                        assistant_msg = {
                            'role': 'assistant',
                            'content': '',
                            'timestamp': datetime.now().isoformat(),
                            'response_id': response_id,
                            'completed': False
                        }
                        session_data['messages'].append(assistant_msg)
                        story_lock = threading.Lock()
                        with story_lock:
                            sessions = load_stories()
                            for s in sessions:
                                if s['session_id'] == session_id:
                                    s['messages'].append(assistant_msg)
                                    break
                            save_stories(sessions)
                    
                    # ========== LOREBOOK SYSTEM: Keyword Matching & Context Injection ==========
                    lorebook = session_data.get('lorebook', [])
                    activated_entries = []
                    
                    if lorebook:
                        print(f"[STORY] Scanning lorebook with {len(lorebook)} entries")
                        
                        # Get last 2-3 messages for keyword scanning
                        recent_messages = []
                        for msg in session_data['messages']:
                            if msg.get('content'):
                                recent_messages.append(msg['content'])
                        
                        # Scan only last 3 messages for keywords
                        scan_text = ' '.join(recent_messages[-3:]).lower() if recent_messages else ''
                        
                        for entry in lorebook:
                            # Check if entry is persistent (always active)
                            if entry.get('persistent', False):
                                activated_entries.append(entry)
                                print(f"[STORY] Activated persistent entry")
                                continue
                            
                            # Check if entry should be activated by keywords
                            keys = entry.get('keys', [])
                            if not isinstance(keys, list):
                                # Handle old format if needed
                                keys = [str(keys)] if keys else []
                            
                            # Lowercase all keys for matching
                            keys_lower = [k.lower().strip() for k in keys if k]
                            
                            # Check if any key matches in recent text
                            for key in keys_lower:
                                if key in scan_text:
                                    activated_entries.append(entry)
                                    print(f"[STORY] Activated entry by keyword '{key}'")
                                    break  # Only activate once per entry
                        
                        print(f"[STORY] Activated {len(activated_entries)} lorebook entries")
                    
                    # ========== PROMPT ASSEMBLY PIPELINE ==========
                    messages = []
                    
                    # First: Find active character and user persona
                    characters = session_data.get('characters', [])
                    active_char_id = session_data.get('active_character_id')
                    active_character = None
                    
                    if characters and active_char_id:
                        for char in characters:
                            if char.get('id') == active_char_id:
                                active_character = char
                                break
                    
                    user_persona_id = session_data.get('user_persona_id')
                    user_persona = None
                    if user_persona_id and characters:
                        for char in characters:
                            if char.get('id') == user_persona_id:
                                user_persona = char
                                break
                    
                    # Layer 1: Core Roleplay System Prompt
                    # Build a comprehensive system prompt explaining the character system
                    
                    # Construct system instructions
                    system_parts = []
                    
                    # Add user's custom system prompt if provided
                    custom_system = session_data.get('system_prompt', '').strip()
                    if custom_system:
                        system_parts.append(custom_system)
                    
                    # Add roleplay instructions
                    roleplay_instructions = []
                    
                    if active_character:
                        char_name = active_character.get('name', 'the character')
                        roleplay_instructions.append(
                            f"You are roleplaying as {char_name}. Respond and act as this character would, using their voice, personality, and mannerisms. "
                            f"Stay in character at all times. Write from {char_name}'s perspective and embody their traits completely."
                        )
                    
                    if user_persona:
                        persona_name = user_persona.get('name', 'the user')
                        roleplay_instructions.append(
                            f"The user is roleplaying as {persona_name}. When they send messages, they are speaking/acting as {persona_name}, not as themselves. "
                            f"Treat their messages as coming from {persona_name} and respond to {persona_name} accordingly."
                        )
                    elif not active_character:
                        # No character system active - default creative writing mode
                        roleplay_instructions.append(
                            "Write creative narrative content. Develop the story naturally based on the user's prompts."
                        )
                    
                    if roleplay_instructions:
                        system_parts.append('[Roleplay Instructions]\n' + '\n\n'.join(roleplay_instructions))
                    
                    # Combine system prompt parts
                    if system_parts:
                        messages.append({
                            'role': 'system',
                            'content': '\n\n'.join(system_parts)
                        })
                        print(f"[STORY] Added system prompt with roleplay instructions")
                    
                    # Layer 2: Active Character Details (Full Context)
                    if active_character and any(active_character.get(k) for k in ['name', 'description', 'personality']):
                        char_parts = []
                        char_name = active_character.get('name', 'Character')
                        
                        char_parts.append(f"=== YOU ARE PLAYING: {char_name.upper()} ===")
                        
                        if active_character.get('description'):
                            char_parts.append(f"Physical Description:\n{active_character['description']}")
                        
                        if active_character.get('personality'):
                            char_parts.append(f"Personality & Traits:\n{active_character['personality']}")
                        
                        if active_character.get('example_dialogue'):
                            char_parts.append(f"Speech Examples (how {char_name} talks):\n{active_character['example_dialogue']}")
                        
                        char_parts.append(f"Remember: You ARE {char_name}. Think, speak, and act as {char_name} would. Use first-person perspective.")
                        
                        character_context = '\n\n'.join(char_parts)
                        messages.append({
                            'role': 'system',
                            'content': character_context
                        })
                        print(f"[STORY] Added active character: {char_name}")
                    
                    # Layer 2.5: User Persona Details (if different from active character)
                    if user_persona and user_persona.get('id') != active_character.get('id') if active_character else True:
                        persona_parts = []
                        persona_name = user_persona.get('name', 'User')
                        
                        persona_parts.append(f"=== THE USER IS PLAYING: {persona_name.upper()} ===")
                        
                        if user_persona.get('description'):
                            persona_parts.append(f"Description of {persona_name}:\n{user_persona['description']}")
                        
                        if user_persona.get('personality'):
                            persona_parts.append(f"Personality:\n{user_persona['personality']}")
                        
                        persona_parts.append(f"When the user sends messages, they are speaking AS {persona_name}. Respond to them as if you're interacting with {persona_name}.")
                        
                        persona_context = '\n\n'.join(persona_parts)
                        messages.append({
                            'role': 'system',
                            'content': persona_context
                        })
                        print(f"[STORY] Added user persona: {persona_name}")
                    
                    # Layer 3: Lorebook Entries & Background Characters (Dynamic Context)
                    world_context = []
                    
                    # Add activated lorebook entries
                    if activated_entries:
                        for entry in activated_entries:
                            content = entry.get('content', '').strip()
                            if content:
                                world_context.append(content)
                        print(f"[STORY] Added {len(activated_entries)} lorebook entries to context")
                    
                    # Add characters marked as include_in_lore (but not the active character)
                    if characters:
                        for char in characters:
                            if char.get('include_in_lore', False) and char.get('id') != active_char_id:
                                char_lore = []
                                char_name = char.get('name', 'Character')
                                char_lore.append(f"[Background Character: {char_name}]")
                                
                                if char.get('description'):
                                    char_lore.append(f"Description: {char['description']}")
                                if char.get('personality'):
                                    char_lore.append(f"Personality: {char['personality']}")
                                
                                if char_lore:
                                    world_context.append('\n'.join(char_lore))
                                    print(f"[STORY] Added background character to lore: {char_name}")
                    
                    # Add all world context as a single system message
                    if world_context:
                        messages.append({
                            'role': 'system',
                            'content': f"[World Information]\n" + '\n\n'.join(world_context)
                        })
                        print(f"[STORY] Added world context ({len(world_context)} items)")
                    
                    # Layer 4: Chat History (Sliding Window)
                    # Find position of current response
                    current_msg_index = None
                    for idx, msg in enumerate(session_data['messages']):
                        if msg.get('response_id') == response_id:
                            current_msg_index = idx
                            break
                    
                    if current_msg_index is None:
                        current_msg_index = len(session_data['messages'])
                    
                    # Include only messages BEFORE the current response
                    for idx, msg in enumerate(session_data['messages']):
                        if idx >= current_msg_index:
                            break
                        if msg.get('content'):
                            messages.append({
                                'role': msg['role'],
                                'content': msg['content']
                            })
                    
                    # Layer 5: Author's Note (High Priority - Recency Bias)
                    authors_note = session_data.get('authors_note', '').strip()
                    if authors_note:
                        messages.append({
                            'role': 'system',
                            'content': f"[Author's Note]\n{authors_note}"
                        })
                        print(f"[STORY] Added author's note: {authors_note[:100]}...")
                    
                    # Validation
                    has_user_message = any(m['role'] == 'user' for m in messages)
                    if not has_user_message:
                        print(f"[ERROR] No user message in context!")
                        raise Exception("Cannot generate response without user message")
                    
                    print(f"[STORY] Final context: {len(messages)} messages")
                    
                    # Get generation parameters
                    temperature = session_data.get('temperature', 0.8)
                    top_p = session_data.get('top_p', 0.9)
                    top_k = session_data.get('top_k', 40)
                    repeat_penalty = session_data.get('repeat_penalty', 1.1)
                    num_ctx = session_data.get('num_ctx', 4096)
                    seed = session_data.get('seed', None)
                    
                    print(f"[STORY] Temperature: {temperature}, Top P: {top_p}, Context: {num_ctx}, Seed: {seed if seed is not None else 'random'}")
                    
                    # ========== DEBUG: Print complete Ollama request ==========
                    print("\n" + "="*80)
                    print("[OLLAMA DEBUG] Complete request being sent to Ollama:")
                    print("="*80)
                    print(f"Model: {model}")
                    print(f"Stream: True")
                    print(f"Parameters:")
                    print(f"  - temperature: {temperature}")
                    print(f"  - top_p: {top_p}")
                    print(f"  - top_k: {top_k}")
                    print(f"  - repeat_penalty: {repeat_penalty}")
                    print(f"  - num_ctx: {num_ctx}")
                    print(f"  - seed: {seed if seed is not None else 'random'}")
                    print(f"\nMessages array ({len(messages)} total):")
                    print("-"*80)
                    for idx, msg in enumerate(messages, 1):
                        role = msg.get('role', 'unknown')
                        content = msg.get('content', '')
                        print(f"\nMessage {idx}:")
                        print(f"  Role: {role}")
                        print(f"  Content length: {len(content)} characters")
                        print(f"  Content preview (first 500 chars):")
                        print(f"    {content[:500]}")
                        if len(content) > 500:
                            print(f"    ... ({len(content) - 500} more characters)")
                    print("\n" + "="*80)
                    print("[OLLAMA DEBUG] End of request")
                    print("="*80 + "\n")
                    
                    # Stream response from Ollama
                    try:
                        full_response = ''
                        chunk_count = 0
                        has_error = False
                        story_lock = threading.Lock()
                        
                        for chunk in ollama_client.chat(
                            model=model,
                            messages=messages,
                            temperature=temperature,
                            top_p=top_p,
                            top_k=top_k,
                            repeat_penalty=repeat_penalty,
                            num_ctx=num_ctx,
                            seed=seed,
                            stream=True
                        ):
                            # Check if cancellation was requested
                            if cancellation_requested:
                                print(f"[STORY] Cancellation detected, stopping stream at {len(full_response)} characters")
                                break
                            
                            if chunk.startswith('Error'):
                                has_error = True
                                full_response = chunk
                                print(f"[STORY] Ollama returned error: {chunk}")
                                break
                            
                            full_response += chunk
                            chunk_count += 1
                            
                            # Update periodically (every 10 chunks)
                            if chunk_count % 10 == 0:
                                with story_lock:
                                    sessions = load_stories()
                                    session_data = None
                                    for s in sessions:
                                        if s['session_id'] == session_id:
                                            session_data = s
                                            break
                                    
                                    if session_data:
                                        for msg in session_data['messages']:
                                            if msg.get('response_id') == response_id:
                                                msg['content'] = full_response
                                                break
                                        save_stories(sessions)
                        
                        # Handle errors
                        if has_error:
                            with story_lock:
                                sessions = load_stories()
                                for s in sessions:
                                    if s['session_id'] == session_id:
                                        for msg in s['messages']:
                                            if msg.get('response_id') == response_id:
                                                msg['content'] = full_response
                                                msg['completed'] = True
                                                msg['error'] = True
                                                break
                                        break
                                save_stories(sessions)
                            
                            with queue_lock:
                                if active_generation and active_generation.get('id') == job['id']:
                                    active_generation['status'] = 'failed'
                                job['status'] = 'failed'
                                job['failed_at'] = datetime.now().isoformat()
                            # Don't use continue - let job flow to completion section to clear active_generation
                        
                        # Final save with completed status
                        with story_lock:
                            sessions = load_stories()
                            for s in sessions:
                                if s['session_id'] == session_id:
                                    for msg in s['messages']:
                                        if msg.get('response_id') == response_id:
                                            msg['content'] = full_response.strip()
                                            msg['completed'] = True
                                            msg['timestamp'] = datetime.now().isoformat()
                                            # Add cancelled flag if generation was interrupted
                                            if cancellation_requested and full_response.strip():
                                                msg['cancelled'] = True
                                            break
                                    break
                            save_stories(sessions)
                        
                        status_text = "cancelled" if cancellation_requested else "completed"
                        print(f"[STORY] Response {status_text}: {len(full_response)} characters")
                        
                        generation_duration = round(time.time() - start_time, 1)
                        job['generation_duration'] = generation_duration
                        job['response'] = full_response
                        
                        # Mark job as cancelled if cancellation was requested
                        if cancellation_requested:
                            job['status'] = 'cancelled'
                            print("[STORY] Job marked as cancelled (text preserved)")
                        
                    except Exception as e:
                        import traceback
                        print(f"[STORY] Error generating response: {e}")
                        print(f"[STORY] Traceback: {traceback.format_exc()}")
                        
                        # Mark as failed
                        story_lock = threading.Lock()
                        with story_lock:
                            sessions = load_stories()
                            for s in sessions:
                                if s['session_id'] == session_id:
                                    for msg in s['messages']:
                                        if msg.get('response_id') == response_id:
                                            msg['content'] = f"Error: {str(e)}"
                                            msg['completed'] = True
                                            msg['error'] = True
                                            break
                                    break
                            save_stories(sessions)
                        raise
                
                else:
                    # Image generation
                    # Distinguish between text-to-image and image-to-image workflows
                    use_image = job.get('use_image', False)
                    current_workflow = 'image_i2i' if use_image else 'image_t2i'
                    
                    # Unload models if switching workflow types (including from chat)
                    if last_workflow_type and last_workflow_type != current_workflow:
                        print(f"[WORKFLOW] Switching from {last_workflow_type} to {current_workflow}, unloading models...")
                        if last_workflow_type.startswith('chat:'):
                            print("[WORKFLOW] Unloading Ollama (automatic on workflow switch)")
                            ollama_client.unload_all_models()
                        elif last_workflow_type == 'tts':
                            print("[WORKFLOW] Unloading Gradio TTS (automatic on workflow switch)")
                            gradio_tts_client.unload_all_engines()
                        else:
                            comfyui_client.unload_models()
                        time.sleep(2)  # Give time to unload
                    
                    last_workflow_type = current_workflow
                    
                    # Generate image with auto-incrementing filename
                    relative_path, output_path = get_next_filename(file_prefix, subfolder)
                    
                    comfyui_client.generate_image(
                        positive_prompt=job['prompt'],
                        width=job['width'],
                        height=job['height'],
                        steps=job['steps'],
                        cfg=job.get('cfg', 1.0),
                        seed=seed,
                        shift=job.get('shift', 3.0),
                        use_image=use_image,
                        use_image_size=job.get('use_image_size', False),
                        image_filename=job.get('image_filename'),
                        mcnl_lora=job.get('mcnl_lora', False),
                        snofs_lora=job.get('snofs_lora', False),
                        male_lora=job.get('male_lora', False),
                        output_path=str(output_path),
                        wait=True
                    )
                    
                    # Calculate generation duration
                    generation_duration = round(time.time() - start_time, 1)
                    
                    # Add metadata with actual seed used - process sequentially before next job
                    metadata_entry = add_metadata_entry(
                        str(output_path),
                        job['prompt'],
                        job['width'],
                        job['height'],
                        job['steps'],
                        seed,
                        file_prefix,
                        subfolder,
                        job.get('cfg', 1.0),
                        job.get('shift', 3.0),
                        job.get('use_image', False),
                        job.get('use_image_size', False),
                        job.get('image_filename'),
                        job.get('mcnl_lora', False),
                        job.get('snofs_lora', False),
                        job.get('male_lora', False),
                        generation_duration=generation_duration
                    )
                
                # Only mark as completed if not cancelled or failed
                if job.get('status') not in ('cancelled', 'failed'):
                    job['status'] = 'completed'
                
                # Handle TTS, chat, and story jobs differently (they don't have single output_path)
                if job_type not in ('tts', 'chat', 'story'):
                    # Only set these if output_path was actually created
                    if 'output_path' in locals():
                        job['output_path'] = str(output_path)
                    if 'relative_path' in locals():
                        job['relative_path'] = str(relative_path)
                    if 'metadata_entry' in locals():
                        job['metadata_id'] = metadata_entry['id']
                
                job['completed_at'] = datetime.now().isoformat()
                if 'generation_duration' not in job:
                    job['generation_duration'] = generation_duration
                job['refresh_folder'] = True
                
            except Exception as e:
                print(f"[ERROR] Generation failed: {str(e)}")
                print(f"[ERROR] Error type: {type(e).__name__}")
                import traceback
                traceback.print_exc()
                job['status'] = 'failed'
                job['error'] = str(e)
                job['failed_at'] = datetime.now().isoformat()
            
            # Always process completion inside a critical section to ensure sequential batch processing
            with queue_lock:
                if generation_queue and generation_queue[-1]['id'] == job['id']:
                    generation_queue.pop()  # Remove from end
                
                # Add to completed jobs history
                completed_jobs.insert(0, job)
                if len(completed_jobs) > MAX_COMPLETED_HISTORY:
                    completed_jobs.pop()
                
                active_generation = None
                # Don't reset timer here - let it continue if queue is empty
            
            # Conditionally unload models based on auto_unload_models setting
            if auto_unload_models:
                print("[CLEANUP] Auto-unload enabled: Unloading all models after job completion...")
                try:
                    comfyui_client.unload_models()
                    comfyui_client.clear_cache()
                    print("[CLEANUP] ComfyUI models unloaded")
                except Exception as e:
                    print(f"[CLEANUP] Error unloading ComfyUI models: {e}")
                
                try:
                    ollama_client.unload_all_models()
                    print("[CLEANUP] Ollama models unloaded")
                except Exception as e:
                    print(f"[CLEANUP] Error unloading Ollama models: {e}")
                
                try:
                    gradio_tts_client.unload_all_engines()
                    print("[CLEANUP] Gradio TTS engines unloaded")
                except Exception as e:
                    print(f"[CLEANUP] Error unloading Gradio TTS: {e}")
                
                print("[CLEANUP] Waiting for RAM/VRAM to clear...")
                time.sleep(5)  # Give time for complete cleanup
                print("[CLEANUP] Ready for next job")
            else:
                print("[CLEANUP] Auto-unload disabled: Keeping models loaded for faster repeat generations")
            
            # Save queue state after job completes
            save_queue_state()
        else:
            # Queue is empty - just wait
            time.sleep(0.5)


# Load persisted queue state before starting queue processor
print("Loading queue state...")
loaded_queue, loaded_completed, loaded_active = load_queue_state()
generation_queue = loaded_queue
completed_jobs = loaded_completed
# Don't restore active generation on startup - it should start fresh
print(f"Loaded {len(generation_queue)} queued jobs and {len(completed_jobs)} completed jobs")

# Start queue processor thread
queue_thread = threading.Thread(target=process_queue, daemon=True)
queue_thread.start()


@app.route('/')
def index():
    """Main page"""
    # Check session
    if session.get('authenticated'):
        return render_template('index.html')
    # Check remember me cookie
    remember_token = request.cookies.get('remember_token')
    if remember_token and remember_token == get_remember_token():
        session['authenticated'] = True
        session.permanent = True
        return render_template('index.html')
    # Show login page
    return render_template('login.html')


@app.route('/api/batch-instructions', methods=['GET'])
def get_batch_instructions():
    """Serve the text batch instructions from text_batch.md"""
    try:
        instructions_path = DOCS_DIR / 'ai_instructions' / 'text_batch.md'
        if instructions_path.exists():
            with open(instructions_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return jsonify({'success': True, 'content': content})
        else:
            # Fallback content if file doesn't exist
            fallback = """# Batch Prompt Architect Instructions

## Goal
Generate a "Base Prompt" with placeholders and a corresponding "CSV Data" block for bulk image generation.

## 1. The Base Prompt
- Use `[parameterName]` placeholders for variables (e.g., `[subject]`, `[style]`)
- The AI will automatically detect these as input fields

## 2. The CSV Structure
- **Header Row**: Must exactly match the `[parameterName]` used in the prompt
- **Data Rows**: One row per image variation
- **Case Sensitivity**: Parameter names must match case

## 3. Technical Parameters (Optional CSV Columns)
Include these headers to control engine settings per row:
- `width` / `height`: Pixel dimensions
- `steps`: Quality/sampling steps
- `seed`: For reproducibility
- `file_prefix`: Filename start
- `subfolder`: Target directory
"""
            return jsonify({'success': True, 'content': fallback})
    except Exception as e:
        print(f"[ERROR] Failed to load batch instructions: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/story-instructions', methods=['GET'])
def get_story_instructions():
    """Serve the story mode instructions from story.md"""
    try:
        instructions_path = DOCS_DIR / 'ai_instructions' / 'story.md'
        if instructions_path.exists():
            with open(instructions_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return jsonify({'success': True, 'content': content})
        else:
            # Fallback content if file doesn't exist
            fallback = """# Story Mode AI Instructions

## Character Card Format

**Required Fields:**
- `name`: Character's full name/title
- `description`: Physical appearance (150-300 words)
- `personality`: Core traits (150-300 words)
- `example_dialogue`: 3 speech examples showing unique voice/tone

## Lorebook Entry Format

**Required Fields:**
- `keys`: Array of 3-5 activation keywords
- `content`: Detailed world/lore info (100-300 words)

## Critical Rules
- **Description**: Vivid physical details + body language (not personality traits)
- **Personality**: Core traits + depth + contradictions (not appearance)
- **Dialogue**: Unique voice patterns (avoid generic speech)
- **Keys**: Natural terms players would actually use
- **Content**: Specific actionable details (not vague lore dumps)
"""
            return jsonify({'success': True, 'content': fallback})
    except Exception as e:
        print(f"[ERROR] Failed to load story instructions: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/settings/auto-unload', methods=['POST'])
def update_auto_unload_setting():
    """Update auto-unload models setting"""
    global auto_unload_models
    data = request.json
    auto_unload_models = bool(data.get('enabled', True))
    print(f"[SETTINGS] Auto-unload models: {auto_unload_models}")
    return jsonify({'success': True, 'auto_unload_models': auto_unload_models})

# ============================================================================
# CHAT ENDPOINTS
# ============================================================================

@app.route('/api/ollama/health', methods=['GET'])
def check_ollama_health():
    """Check if Ollama server is running"""
    try:
        is_healthy = ollama_client.health_check()
        return jsonify({'success': True, 'healthy': is_healthy})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/ollama/models', methods=['GET'])
def list_ollama_models():
    """List available Ollama models"""
    try:
        models = ollama_client.list_models()
        return jsonify({'success': True, 'models': models})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/gradio_tts/health', methods=['GET'])
def check_gradio_tts_health():
    """Check if Gradio TTS server is running"""
    try:
        is_healthy = gradio_tts_client.health_check()
        return jsonify({'success': True, 'healthy': is_healthy})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/chat/sessions', methods=['GET'])
@require_auth
def get_chat_sessions():
    """Get all chat sessions"""
    sessions = load_chats()
    # Sort by updated_at timestamp (most recent first)
    sessions.sort(key=lambda s: s.get('updated_at', s.get('created_at', '')), reverse=True)
    return jsonify({'success': True, 'sessions': sessions})

@app.route('/api/chat/sessions', methods=['POST'])
@require_auth
def create_chat_session():
    """Create a new chat session"""
    data = request.json
    sessions = load_chats()
    
    new_session = {
        'session_id': str(uuid.uuid4()),
        'chat_name': data.get('chat_name', 'New Chat'),
        'model': data.get('model', 'llama3.2'),
        'system_prompt': data.get('system_prompt', ''),
        'temperature': data.get('temperature', 0.7),
        'top_p': data.get('top_p', 0.9),
        'top_k': data.get('top_k', 40),
        'repeat_penalty': data.get('repeat_penalty', 1.1),
        'num_ctx': data.get('num_ctx', 2048),
        'seed': data.get('seed', None),
        'messages': [],
        'created_at': datetime.now().isoformat(),
        'updated_at': datetime.now().isoformat()
    }
    
    sessions.append(new_session)
    save_chats(sessions)
    
    return jsonify({'success': True, 'session': new_session})

@app.route('/api/chat/sessions/<session_id>', methods=['GET'])
@require_auth
def get_chat_session(session_id):
    """Get a specific chat session"""
    sessions = load_chats()
    for session_data in sessions:
        if session_data['session_id'] == session_id:
            return jsonify({'success': True, 'session': session_data})
    return jsonify({'success': False, 'error': 'Session not found'}), 404

@app.route('/api/chat/sessions/<session_id>', methods=['PUT'])
@require_auth
def update_chat_session(session_id):
    """Update chat session parameters"""
    data = request.json
    sessions = load_chats()
    
    for session_data in sessions:
        if session_data['session_id'] == session_id:
            # Update only provided fields
            if 'chat_name' in data:
                session_data['chat_name'] = data['chat_name']
            if 'model' in data:
                session_data['model'] = data['model']
            if 'system_prompt' in data:
                session_data['system_prompt'] = data['system_prompt']
            if 'temperature' in data:
                session_data['temperature'] = data['temperature']
            if 'top_p' in data:
                session_data['top_p'] = data['top_p']
            if 'top_k' in data:
                session_data['top_k'] = data['top_k']
            if 'repeat_penalty' in data:
                session_data['repeat_penalty'] = data['repeat_penalty']
            if 'num_ctx' in data:
                session_data['num_ctx'] = data['num_ctx']
            if 'seed' in data:
                session_data['seed'] = data['seed']
            if 'messages' in data:
                session_data['messages'] = data['messages']
            
            session_data['updated_at'] = datetime.now().isoformat()
            save_chats(sessions)
            return jsonify({'success': True, 'session': session_data})
    
    return jsonify({'success': False, 'error': 'Session not found'}), 404

@app.route('/api/chat/sessions/<session_id>', methods=['DELETE'])
@require_auth
def delete_chat_session(session_id):
    """Delete a chat session"""
    sessions = load_chats()
    original_count = len(sessions)
    sessions = [s for s in sessions if s['session_id'] != session_id]
    
    if len(sessions) < original_count:
        save_chats(sessions)
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Session not found'}), 404

@app.route('/api/chat/sessions/<session_id>/duplicate', methods=['POST'])
@require_auth
def duplicate_chat_session(session_id):
    """Duplicate a chat session with optional settings and messages"""
    data = request.json
    copy_settings = data.get('copy_settings', True)
    copy_messages = data.get('copy_messages', False)
    
    sessions = load_chats()
    original_session = None
    
    # Find the original session
    for session_data in sessions:
        if session_data['session_id'] == session_id:
            original_session = session_data
            break
    
    if not original_session:
        return jsonify({'success': False, 'error': 'Session not found'}), 404
    
    # Create new session
    new_session = {
        'session_id': str(uuid.uuid4()),
        'created_at': datetime.now().isoformat(),
        'updated_at': datetime.now().isoformat()
    }
    
    # Copy settings if requested
    if copy_settings:
        new_session['chat_name'] = original_session.get('chat_name', 'New Chat') + ' (Copy)'
        new_session['model'] = original_session.get('model', 'llama3.2')
        new_session['system_prompt'] = original_session.get('system_prompt', '')
        new_session['temperature'] = original_session.get('temperature', 0.7)
        new_session['top_p'] = original_session.get('top_p', 0.9)
        new_session['top_k'] = original_session.get('top_k', 40)
        new_session['repeat_penalty'] = original_session.get('repeat_penalty', 1.1)
        new_session['num_ctx'] = original_session.get('num_ctx', 2048)
    else:
        # Use defaults
        new_session['chat_name'] = 'New Chat (Copy)'
        new_session['model'] = 'llama3.2'
        new_session['system_prompt'] = ''
        new_session['temperature'] = 0.7
        new_session['top_p'] = 0.9
        new_session['top_k'] = 40
        new_session['repeat_penalty'] = 1.1
        new_session['num_ctx'] = 2048
    
    # Copy messages if requested (deep copy to avoid reference issues)
    if copy_messages and 'messages' in original_session:
        import copy
        new_session['messages'] = copy.deepcopy(original_session['messages'])
    else:
        new_session['messages'] = []
    
    sessions.append(new_session)
    save_chats(sessions)
    
    return jsonify({'success': True, 'session': new_session})


@app.route('/api/chat/generate_name', methods=['POST'])
@require_auth
def generate_session_name():
    """Generate a session name based on chat context"""
    data = request.json
    session_id = data.get('session_id')
    
    print(f"[NAME_GEN] Endpoint called for session: {session_id}")
    
    if not session_id:
        return jsonify({'success': False, 'error': 'Missing session_id'}), 400
    
    # Get session details
    sessions = load_chats()
    session_data = None
    for s in sessions:
        if s['session_id'] == session_id:
            session_data = s
            break
    
    if not session_data:
        print(f"[NAME_GEN] Session not found: {session_id}")
        return jsonify({'success': False, 'error': 'Session not found'}), 404
    
    # Check if session has messages
    if not session_data.get('messages') or len(session_data['messages']) == 0:
        print(f"[NAME_GEN] No messages in session")
        return jsonify({'success': False, 'error': 'No messages in session to generate name from'}), 400
    
    print(f"[NAME_GEN] Session has {len(session_data['messages'])} messages, queuing job")
    
    # Create job for queue
    job_id = str(uuid.uuid4())
    job = {
        'id': job_id,
        'job_type': 'generate_session_name',
        'session_id': session_id,
        'model': session_data.get('model', 'llama3.2'),
        'timestamp': datetime.now().isoformat(),
        'status': 'queued'
    }
    
    print(f"[NAME_GEN] Created job object: {job}")
    
    try:
        with queue_lock:
            print(f"[NAME_GEN] Acquired queue lock, adding to queue")
            generation_queue.insert(0, job)
            print(f"[NAME_GEN] Job added to queue")
            print(f"[NAME_GEN] Queue now has {len(generation_queue)} items")
            print(f"[NAME_GEN] Queue contents: {[j.get('job_type', 'unknown') for j in generation_queue]}")
        
        # Save OUTSIDE the lock to avoid deadlock
        print(f"[NAME_GEN] Saving queue state...")
        save_queue_state()
        print(f"[NAME_GEN] Queue state saved")
        
        return jsonify({
            'success': True,
            'job_id': job_id,
            'message': 'Session name generation queued'
        })
    except Exception as e:
        import traceback
        print(f"[NAME_GEN] ERROR queuing job: {e}")
        print(f"[NAME_GEN] Traceback: {traceback.format_exc()}")
        return jsonify({'success': False, 'error': f'Failed to queue job: {str(e)}'}), 500

@app.route('/api/chat/message', methods=['POST'])
@require_auth
def send_chat_message():
    """Add a chat message to the queue"""
    data = request.json
    print(f"[CHAT] send_chat_message - received data: {data}")
    print(f"[CHAT] request.json type: {type(data)}")
    
    session_id = data.get('session_id') if data else None
    user_message = data.get('message') if data else None
    
    print(f"[CHAT] session_id: {session_id} (type: {type(session_id)})")
    print(f"[CHAT] user_message: {user_message} (type: {type(user_message)})")
    
    # Ensure message is a string
    if isinstance(user_message, dict):
        print(f"[WARNING] Received dict as message: {user_message}")
        user_message = user_message.get('content', '')
    elif not isinstance(user_message, str):
        print(f"[WARNING] Received non-string message type {type(user_message)}: {user_message}")
        user_message = str(user_message) if user_message else ''
    
    if not session_id or not user_message:
        print(f"[CHAT ERROR] Missing data - session_id: {session_id}, user_message: {user_message}")
        return jsonify({'success': False, 'error': 'Missing session_id or message'}), 400
    
    # CRITICAL: Use lock to prevent race condition when multiple messages sent rapidly
    # Without lock: Thread1 reads session, Thread2 reads session, Thread1 saves, Thread2 saves (overwrites Thread1!)
    with chat_lock:
        # Get session details
        sessions = load_chats()
        session_data = None
        for s in sessions:
            if s['session_id'] == session_id:
                session_data = s
                break
        
        if not session_data:
            return jsonify({'success': False, 'error': 'Session not found'}), 404
        
        # Create message ID for tracking in queue
        message_id = str(uuid.uuid4())
        
        # Create response ID first
        response_id = str(uuid.uuid4())
        
        # Add user message to session
        user_msg = {
            'role': 'user',
            'content': user_message,
            'timestamp': datetime.now().isoformat(),
            'message_id': message_id
        }
        session_data['messages'].append(user_msg)
        
        # Add placeholder for AI response to maintain message ordering
        assistant_msg = {
            'role': 'assistant',
            'content': '',
            'timestamp': datetime.now().isoformat(),
            'response_id': response_id,
            'completed': False
        }
        session_data['messages'].append(assistant_msg)
        
        session_data['updated_at'] = datetime.now().isoformat()
        save_chats(sessions)
        
        print(f"[CHAT] Added messages to session {session_id}: user={message_id}, assistant={response_id}")
        print(f"[CHAT] Total messages in session: {len(session_data['messages'])}")
    
    # Create queue job
    job = {
        'id': message_id,
        'job_type': 'chat',
        'session_id': session_id,
        'message': user_message,
        'model': session_data['model'],
        'system_prompt': session_data.get('system_prompt', ''),
        'temperature': session_data.get('temperature', 0.7),
        'top_p': session_data.get('top_p', 0.9),
        'top_k': session_data.get('top_k', 40),
        'repeat_penalty': session_data.get('repeat_penalty', 1.1),
        'num_ctx': session_data.get('num_ctx', 2048),
        'status': 'queued',
        'added_at': datetime.now().isoformat(),
        'response_id': response_id  # ID for assistant's response
    }
    
    print(f"[CHAT] Creating job with parameters:")
    print(f"  System prompt: '{job['system_prompt'][:50]}...' (length: {len(job['system_prompt'])})" if job['system_prompt'] else "  System prompt: (empty)")
    print(f"  Temperature: {job['temperature']}, Top P: {job['top_p']}, Top K: {job['top_k']}")
    print(f"  Repeat Penalty: {job['repeat_penalty']}, Context: {job['num_ctx']}")
    
    with queue_lock:
        generation_queue.insert(0, job)
    
    save_queue_state()
    
    return jsonify({
        'success': True, 
        'job_id': message_id,
        'message_id': message_id,
        'response_id': job['response_id']
    })

@app.route('/api/chat/stream/<session_id>/<response_id>')
@require_auth
def stream_chat_response(session_id, response_id):
    """Stream chat response via Server-Sent Events"""
    def generate():
        """Generator for SSE stream"""
        try:
            # Wait for the response to be generated and stored
            max_wait = 300  # 5 minutes timeout
            start_time = time.time()
            last_content = ""
            
            while time.time() - start_time < max_wait:
                sessions = load_chats()
                session_data = None
                for s in sessions:
                    if s['session_id'] == session_id:
                        session_data = s
                        break
                
                if not session_data:
                    yield f"data: {json.dumps({'error': 'Session not found'})}\n\n"
                    break
                
                # Find the response message
                response_msg = None
                for msg in session_data['messages']:
                    if msg.get('message_id') == response_id or msg.get('response_id') == response_id:
                        if msg['role'] == 'assistant':
                            response_msg = msg
                            break
                
                if response_msg:
                    content = response_msg.get('content', '')
                    if content != last_content:
                        # New content available - send the delta
                        delta = content[len(last_content):]
                        if delta:
                            yield f"data: {json.dumps({'chunk': delta, 'full_content': content})}\n\n"
                            last_content = content
                    
                    # Check if message is complete
                    if response_msg.get('completed', False):
                        yield f"data: {json.dumps({'done': True, 'full_content': content})}\n\n"
                        break
                
                time.sleep(0.3)  # Poll every 300ms
            
            # Timeout or completion
            yield f"data: {json.dumps({'done': True})}\n\n"
            
        except Exception as e:
            print(f"[CHAT] Stream error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    return Response(stream_with_context(generate()), mimetype='text/event-stream')

# ============================================================================
# END CHAT ENDPOINTS
# ============================================================================

# ============================================================================
# AUTOCHAT ENDPOINTS
# ============================================================================

@app.route('/api/autochat/sessions', methods=['GET'])
@require_auth
def get_autochat_sessions():
    """Get all autochat sessions"""
    sessions = load_autochat()
    # Sort by updated_at timestamp (most recent first)
    sessions.sort(key=lambda s: s.get('updated_at', s.get('created_at', '')), reverse=True)
    return jsonify({'success': True, 'sessions': sessions})

@app.route('/api/autochat/sessions', methods=['POST'])
@require_auth
def create_autochat_session():
    """Create a new autochat session"""
    data = request.json
    sessions = load_autochat()
    
    # Shared model and num_ctx
    shared_model = data.get('model', 'llama3.2')
    shared_num_ctx = data.get('num_ctx', 2048)
    
    new_session = {
        'session_id': str(uuid.uuid4()),
        'session_name': data.get('session_name', 'New Auto Chat'),
        'model': shared_model,
        'num_ctx': shared_num_ctx,
        'persona_a': {
            'name': data.get('persona_a_name', 'Alice'),
            'system_prompt': data.get('persona_a_system', ''),
            'temperature': data.get('persona_a_temperature', 0.7),
            'top_p': data.get('persona_a_top_p', 0.9),
            'top_k': data.get('persona_a_top_k', 40),
            'repeat_penalty': data.get('persona_a_repeat_penalty', 1.1),
            'seed': data.get('persona_a_seed', None)
        },
        'persona_b': {
            'name': data.get('persona_b_name', 'Bob'),
            'system_prompt': data.get('persona_b_system', ''),
            'temperature': data.get('persona_b_temperature', 0.7),
            'top_p': data.get('persona_b_top_p', 0.9),
            'top_k': data.get('persona_b_top_k', 40),
            'repeat_penalty': data.get('persona_b_repeat_penalty', 1.1),
            'seed': data.get('persona_b_seed', None)
        },
        'max_turns': data.get('max_turns', 10),
        'current_turn': 0,
        'status': 'stopped',
        'active_perspective': 'a',
        'messages': [],
        'created_at': datetime.now().isoformat(),
        'updated_at': datetime.now().isoformat()
    }
    
    sessions.append(new_session)
    save_autochat(sessions)
    
    return jsonify({'success': True, 'session': new_session})

@app.route('/api/autochat/sessions/<session_id>', methods=['GET'])
@require_auth
def get_autochat_session(session_id):
    """Get a specific autochat session"""
    sessions = load_autochat()
    for session_data in sessions:
        if session_data['session_id'] == session_id:
            return jsonify({'success': True, 'session': session_data})
    return jsonify({'success': False, 'error': 'Session not found'}), 404

@app.route('/api/autochat/sessions/<session_id>', methods=['PUT'])
@require_auth
def update_autochat_session(session_id):
    """Update autochat session parameters"""
    data = request.json
    sessions = load_autochat()
    
    for session_data in sessions:
        if session_data['session_id'] == session_id:
            # Update session-level fields
            if 'session_name' in data:
                session_data['session_name'] = data['session_name']
            if 'model' in data:
                session_data['model'] = data['model']
            if 'num_ctx' in data:
                session_data['num_ctx'] = data['num_ctx']
            if 'max_turns' in data:
                session_data['max_turns'] = data['max_turns']
            if 'status' in data:
                session_data['status'] = data['status']
            if 'active_perspective' in data:
                session_data['active_perspective'] = data['active_perspective']
            if 'current_turn' in data:
                session_data['current_turn'] = data['current_turn']
            if 'messages' in data:
                session_data['messages'] = data['messages']
            
            # Update persona A fields
            if 'persona_a' in data:
                for key, value in data['persona_a'].items():
                    session_data['persona_a'][key] = value
            
            # Update persona B fields
            if 'persona_b' in data:
                for key, value in data['persona_b'].items():
                    session_data['persona_b'][key] = value
            
            session_data['updated_at'] = datetime.now().isoformat()
            save_autochat(sessions)
            return jsonify({'success': True, 'session': session_data})
    
    return jsonify({'success': False, 'error': 'Session not found'}), 404

@app.route('/api/autochat/sessions/<session_id>', methods=['DELETE'])
@require_auth
def delete_autochat_session(session_id):
    """Delete an autochat session"""
    sessions = load_autochat()
    original_count = len(sessions)
    sessions = [s for s in sessions if s['session_id'] != session_id]
    
    if len(sessions) < original_count:
        save_autochat(sessions)
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Session not found'}), 404

@app.route('/api/autochat/sessions/<session_id>/duplicate', methods=['POST'])
@require_auth
def duplicate_autochat_session(session_id):
    """Duplicate an autochat session with optional settings and messages"""
    data = request.json
    copy_settings = data.get('copy_settings', True)
    copy_messages = data.get('copy_messages', False)
    
    sessions = load_autochat()
    original_session = None
    
    # Find the original session
    for session_data in sessions:
        if session_data['session_id'] == session_id:
            original_session = session_data
            break
    
    if not original_session:
        return jsonify({'success': False, 'error': 'Session not found'}), 404
    
    # Create new session
    new_session = {
        'session_id': str(uuid.uuid4()),
        'created_at': datetime.now().isoformat(),
        'updated_at': datetime.now().isoformat()
    }
    
    # Copy settings if requested
    if copy_settings:
        new_session['session_name'] = original_session.get('session_name', 'New Auto Chat') + ' (Copy)'
        new_session['model'] = original_session.get('model', 'llama3.2')
        new_session['num_ctx'] = original_session.get('num_ctx', 2048)
        new_session['max_turns'] = original_session.get('max_turns', 10)
        new_session['status'] = 'stopped'
        new_session['current_turn'] = 0
        new_session['active_perspective'] = original_session.get('active_perspective', 'a')
        
        # Deep copy personas
        import copy
        new_session['persona_a'] = copy.deepcopy(original_session.get('persona_a', {}))
        new_session['persona_b'] = copy.deepcopy(original_session.get('persona_b', {}))
    else:
        # Use defaults
        new_session['session_name'] = 'New Auto Chat (Copy)'
        new_session['model'] = 'llama3.2'
        new_session['num_ctx'] = 2048
        new_session['max_turns'] = 10
        new_session['status'] = 'stopped'
        new_session['current_turn'] = 0
        new_session['active_perspective'] = 'a'
        new_session['persona_a'] = {
            'name': 'Alice',
            'system_prompt': '',
            'temperature': 0.7,
            'top_p': 0.9,
            'top_k': 40,
            'repeat_penalty': 1.1
        }
        new_session['persona_b'] = {
            'name': 'Bob',
            'system_prompt': '',
            'temperature': 0.7,
            'top_p': 0.9,
            'top_k': 40,
            'repeat_penalty': 1.1
        }
    
    # Copy messages if requested
    if copy_messages and 'messages' in original_session:
        import copy
        new_session['messages'] = copy.deepcopy(original_session['messages'])
    else:
        new_session['messages'] = []
    
    sessions.append(new_session)
    save_autochat(sessions)
    
    return jsonify({'success': True, 'session': new_session})

@app.route('/api/autochat/sessions/<session_id>/stop', methods=['POST'])
@require_auth
def stop_autochat_session(session_id):
    """Stop an autochat session"""
    sessions = load_autochat()
    
    for session_data in sessions:
        if session_data['session_id'] == session_id:
            session_data['status'] = 'stopped'
            session_data['updated_at'] = datetime.now().isoformat()
            save_autochat(sessions)
            return jsonify({'success': True, 'session': session_data})
    
    return jsonify({'success': False, 'error': 'Session not found'}), 404

@app.route('/api/autochat/sessions/<session_id>/continue', methods=['POST'])
@require_auth
def continue_autochat_session(session_id):
    """Continue an autochat session"""
    sessions = load_autochat()
    
    for session_data in sessions:
        if session_data['session_id'] == session_id:
            # Set status to running
            session_data['status'] = 'running'
            session_data['updated_at'] = datetime.now().isoformat()
            
            # Determine next persona from last message (opposite of last speaker)
            messages = session_data.get('messages', [])
            if messages:
                last_message = messages[-1]
                last_persona = last_message.get('persona', 'b')
                # Continue with opposite persona
                next_persona = 'b' if last_persona == 'a' else 'a'
            else:
                # No messages yet, start with persona A
                next_persona = 'a'
            
            # Update active perspective
            session_data['active_perspective'] = next_persona
            save_autochat(sessions)
            
            response_id = str(uuid.uuid4())
            
            # Get persona data for job display
            persona_data = session_data[f'persona_{next_persona}']
            shared_model = session_data.get('model', 'llama3.2')
            
            job = {
                'id': str(uuid.uuid4()),
                'job_type': 'autochat',
                'session_id': session_id,
                'active_persona': next_persona,
                'persona_name': persona_data.get('name', f'Persona {next_persona.upper()}'),
                'model': shared_model,
                'response_id': response_id,
                'status': 'queued',
                'created_at': datetime.now().isoformat()
            }
            
            with queue_lock:
                generation_queue.insert(0, job)
            
            print(f"[AUTOCHAT] Continue: Last message from persona {last_persona if messages else 'none'}, queuing persona {next_persona.upper()}")
            
            return jsonify({'success': True, 'session': session_data, 'job_id': job['id']})
    
    return jsonify({'success': False, 'error': 'Session not found'}), 404

@app.route('/api/autochat/start', methods=['POST'])
@require_auth
def start_autochat():
    """Start autochat conversation"""
    data = request.json
    session_id = data.get('session_id')
    
    if not session_id:
        return jsonify({'success': False, 'error': 'Missing session_id'}), 400
    
    sessions = load_autochat()
    session_data = None
    for s in sessions:
        if s['session_id'] == session_id:
            session_data = s
            break
    
    if not session_data:
        return jsonify({'success': False, 'error': 'Session not found'}), 404
    
    # Set session to running and reset turn counter
    session_data['status'] = 'running'
    session_data['current_turn'] = 0
    session_data['active_perspective'] = 'a'  # Start with persona A
    session_data['updated_at'] = datetime.now().isoformat()
    save_autochat(sessions)
    
    # Create first job for persona A
    response_id = str(uuid.uuid4())
    persona_a_data = session_data['persona_a']
    shared_model = session_data.get('model', 'llama3.2')
    
    job = {
        'id': str(uuid.uuid4()),
        'job_type': 'autochat',
        'session_id': session_id,
        'active_persona': 'a',
        'persona_name': persona_a_data.get('name', 'Persona A'),
        'model': shared_model,
        'response_id': response_id,
        'status': 'queued',
        'created_at': datetime.now().isoformat()
    }
    
    with queue_lock:
        generation_queue.insert(0, job)
    
    return jsonify({'success': True, 'session': session_data, 'job_id': job['id']})

@app.route('/api/autochat/manual_message', methods=['POST'])
@require_auth
def autochat_manual_message():
    """Inject a manual message into autochat conversation"""
    data = request.json
    session_id = data.get('session_id')
    message = data.get('message')
    persona = data.get('persona')  # 'a' or 'b'
    
    if not all([session_id, message, persona]):
        return jsonify({'success': False, 'error': 'Missing required fields'}), 400
    
    if persona not in ['a', 'b']:
        return jsonify({'success': False, 'error': 'Invalid persona'}), 400
    
    with chat_lock:
        sessions = load_autochat()
        session_data = None
        for s in sessions:
            if s['session_id'] == session_id:
                session_data = s
                break
        
        if not session_data:
            return jsonify({'success': False, 'error': 'Session not found'}), 404
        
        # Add manual message
        manual_msg = {
            'role': 'assistant',  # Store as assistant since it's from a persona
            'content': message,
            'timestamp': datetime.now().isoformat(),
            'message_id': str(uuid.uuid4()),
            'persona': persona,
            'completed': True,
            'manual': True
        }
        session_data['messages'].append(manual_msg)
        session_data['updated_at'] = datetime.now().isoformat()
        save_autochat(sessions)
    
    # If session was running, queue response from other persona
    if session_data.get('status') == 'running':
        other_persona = 'b' if persona == 'a' else 'a'
        response_id = str(uuid.uuid4())
        
        # Get the other persona's data for the response job
        other_persona_data = session_data[f'persona_{other_persona}']
        shared_model = session_data.get('model', 'llama3.2')
        
        job = {
            'id': str(uuid.uuid4()),
            'job_type': 'autochat',
            'session_id': session_id,
            'active_persona': other_persona,
            'persona_name': other_persona_data.get('name', f'Persona {other_persona.upper()}'),
            'model': shared_model,
            'response_id': response_id,
            'status': 'queued',
            'created_at': datetime.now().isoformat()
        }
        
        with queue_lock:
            generation_queue.insert(0, job)
        
        return jsonify({'success': True, 'session': session_data, 'job_id': job['id']})
    
    return jsonify({'success': True, 'session': session_data})

@app.route('/api/autochat/stream/<session_id>/<response_id>')
@require_auth
def autochat_stream(session_id, response_id):
    """SSE-style polling endpoint for autochat streaming"""
    def generate():
        try:
            while True:
                sessions = load_autochat()
                session_data = None
                for s in sessions:
                    if s['session_id'] == session_id:
                        session_data = s
                        break
                
                if not session_data:
                    yield f"data: {json.dumps({'error': 'Session not found'})}\n\n"
                    return
                
                # Find message with response_id
                for msg in session_data['messages']:
                    if msg.get('response_id') == response_id:
                        yield f"data: {json.dumps({'content': msg.get('content', ''), 'done': msg.get('completed', False)})}\n\n"
                        
                        if msg.get('completed'):
                            return
                        break
                
                time.sleep(0.3)
        except GeneratorExit:
            pass
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    return Response(stream_with_context(generate()), mimetype='text/event-stream')

# ============================================================================
# END AUTOCHAT ENDPOINTS
# ============================================================================

# ============================================================================
# STORY ENDPOINTS
# ============================================================================

@app.route('/api/story/sessions', methods=['GET'])
@require_auth
def get_story_sessions():
    """Get all story sessions"""
    sessions = load_stories()
    # Sort by updated_at timestamp (most recent first)
    sessions.sort(key=lambda s: s.get('updated_at', s.get('created_at', '')), reverse=True)
    return jsonify({'success': True, 'sessions': sessions})

@app.route('/api/story/sessions', methods=['POST'])
@require_auth
def create_story_session():
    """Create a new story session"""
    data = request.json
    sessions = load_stories()
    
    new_session = {
        'session_id': str(uuid.uuid4()),
        'story_name': data.get('story_name', 'New Story'),
        'model': data.get('model', 'llama3.2'),
        'system_prompt': data.get('system_prompt', ''),
        'characters': data.get('characters', []),  # Array of character objects with id, name, description, etc.
        'active_character_id': data.get('active_character_id', None),  # Which character is currently active
        'user_persona_id': data.get('user_persona_id', None),  # Which character represents the user
        'lorebook': data.get('lorebook', []),  # Array of {keys: [str], content: str}
        'authors_note': data.get('authors_note', ''),
        'temperature': data.get('temperature', 0.8),
        'top_p': data.get('top_p', 0.9),
        'top_k': data.get('top_k', 40),
        'repeat_penalty': data.get('repeat_penalty', 1.1),
        'num_ctx': data.get('num_ctx', 4096),
        'seed': data.get('seed', None),
        'messages': [],
        'created_at': datetime.now().isoformat(),
        'updated_at': datetime.now().isoformat()
    }
    
    sessions.append(new_session)
    save_stories(sessions)
    
    return jsonify({'success': True, 'session': new_session})

@app.route('/api/story/sessions/<session_id>', methods=['GET'])
@require_auth
def get_story_session(session_id):
    """Get a specific story session"""
    sessions = load_stories()
    for session_data in sessions:
        if session_data['session_id'] == session_id:
            return jsonify({'success': True, 'session': session_data})
    return jsonify({'success': False, 'error': 'Session not found'}), 404

@app.route('/api/story/sessions/<session_id>', methods=['PUT'])
@require_auth
def update_story_session(session_id):
    """Update story session parameters"""
    data = request.json
    print(f"[STORY] Updating session {session_id}")
    print(f"[STORY] Update fields: {list(data.keys())}")
    if 'characters' in data:
        print(f"[STORY] Updating characters array: {len(data['characters'])} characters")
        for char in data['characters']:
            print(f"[STORY]   - Character: {char.get('name', 'unnamed')}")
    
    sessions = load_stories()
    
    for session_data in sessions:
        if session_data['session_id'] == session_id:
            # Update only provided fields
            if 'story_name' in data:
                session_data['story_name'] = data['story_name']
            if 'model' in data:
                session_data['model'] = data['model']
            if 'system_prompt' in data:
                session_data['system_prompt'] = data['system_prompt']
            if 'character_card' in data:
                session_data['character_card'] = data['character_card']
            if 'characters' in data:
                session_data['characters'] = data['characters']
                print(f"[STORY] Characters updated successfully in session data")
            if 'active_character_id' in data:
                session_data['active_character_id'] = data['active_character_id']
                print(f"[STORY] Active character ID set to: {data['active_character_id']}")
            if 'user_persona_id' in data:
                session_data['user_persona_id'] = data['user_persona_id']
                print(f"[STORY] User persona ID set to: {data['user_persona_id']}")
            if 'lorebook' in data:
                session_data['lorebook'] = data['lorebook']
            if 'authors_note' in data:
                session_data['authors_note'] = data['authors_note']
            if 'temperature' in data:
                session_data['temperature'] = data['temperature']
            if 'top_p' in data:
                session_data['top_p'] = data['top_p']
            if 'top_k' in data:
                session_data['top_k'] = data['top_k']
            if 'repeat_penalty' in data:
                session_data['repeat_penalty'] = data['repeat_penalty']
            if 'num_ctx' in data:
                session_data['num_ctx'] = data['num_ctx']
            if 'seed' in data:
                session_data['seed'] = data['seed']
            if 'messages' in data:
                session_data['messages'] = data['messages']
            
            session_data['updated_at'] = datetime.now().isoformat()
            save_stories(sessions)
            print(f"[STORY] Session {session_id} saved to disk successfully")
            return jsonify({'success': True, 'session': session_data})
    
    print(f"[STORY] ERROR: Session {session_id} not found!")
    return jsonify({'success': False, 'error': 'Session not found'}), 404

@app.route('/api/story/sessions/<session_id>', methods=['DELETE'])
@require_auth
def delete_story_session(session_id):
    """Delete a story session"""
    sessions = load_stories()
    original_count = len(sessions)
    sessions = [s for s in sessions if s['session_id'] != session_id]
    
    if len(sessions) < original_count:
        save_stories(sessions)
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Session not found'}), 404

@app.route('/api/story/sessions/<session_id>/duplicate', methods=['POST'])
@require_auth
def duplicate_story_session(session_id):
    """Duplicate a story session with optional settings and messages"""
    data = request.json
    copy_settings = data.get('copy_settings', True)
    copy_messages = data.get('copy_messages', False)
    
    sessions = load_stories()
    original_session = None
    
    # Find the original session
    for session_data in sessions:
        if session_data['session_id'] == session_id:
            original_session = session_data
            break
    
    if not original_session:
        return jsonify({'success': False, 'error': 'Session not found'}), 404
    
    # Create new session
    new_session = {
        'session_id': str(uuid.uuid4()),
        'created_at': datetime.now().isoformat(),
        'updated_at': datetime.now().isoformat()
    }
    
    # Copy settings if requested
    if copy_settings:
        new_session['story_name'] = original_session.get('story_name', 'New Story') + ' (Copy)'
        new_session['model'] = original_session.get('model', 'llama3.2')
        new_session['system_prompt'] = original_session.get('system_prompt', '')
        new_session['temperature'] = original_session.get('temperature', 0.8)
        new_session['top_p'] = original_session.get('top_p', 0.9)
        new_session['top_k'] = original_session.get('top_k', 40)
        new_session['repeat_penalty'] = original_session.get('repeat_penalty', 1.1)
        new_session['num_ctx'] = original_session.get('num_ctx', 4096)
        new_session['authors_note'] = original_session.get('authors_note', '')
        
        # Deep copy characters and lorebook
        import copy
        new_session['characters'] = copy.deepcopy(original_session.get('characters', []))
        new_session['lorebook'] = copy.deepcopy(original_session.get('lorebook', []))
        new_session['active_character_id'] = original_session.get('active_character_id', None)
        new_session['user_persona_id'] = original_session.get('user_persona_id', None)
    else:
        # Use defaults
        new_session['story_name'] = 'New Story (Copy)'
        new_session['model'] = 'llama3.2'
        new_session['system_prompt'] = ''
        new_session['temperature'] = 0.8
        new_session['top_p'] = 0.9
        new_session['top_k'] = 40
        new_session['repeat_penalty'] = 1.1
        new_session['num_ctx'] = 4096
        new_session['authors_note'] = ''
        new_session['characters'] = []
        new_session['lorebook'] = []
        new_session['active_character_id'] = None
        new_session['user_persona_id'] = None
    
    # Copy messages if requested (deep copy to avoid reference issues)
    if copy_messages and 'messages' in original_session:
        import copy
        new_session['messages'] = copy.deepcopy(original_session['messages'])
    else:
        new_session['messages'] = []
    
    sessions.append(new_session)
    save_stories(sessions)
    
    return jsonify({'success': True, 'session': new_session})

@app.route('/api/story/message', methods=['POST'])
@require_auth
def send_story_message():
    """Add a story message to the queue"""
    data = request.json
    print(f"[STORY] send_story_message - received data: {data}")
    
    session_id = data.get('session_id') if data else None
    user_message = data.get('message') if data else None
    
    # Ensure message is a string
    if isinstance(user_message, dict):
        print(f"[WARNING] Received dict as message: {user_message}")
        user_message = user_message.get('content', '')
    elif not isinstance(user_message, str):
        print(f"[WARNING] Received non-string message type {type(user_message)}: {user_message}")
        user_message = str(user_message) if user_message else ''
    
    if not session_id or not user_message:
        print(f"[STORY ERROR] Missing data - session_id: {session_id}, user_message: {user_message}")
        return jsonify({'success': False, 'error': 'Missing session_id or message'}), 400
    
    # Use story lock to prevent race condition
    story_lock = threading.Lock()
    with story_lock:
        # Get session details
        sessions = load_stories()
        session_data = None
        for s in sessions:
            if s['session_id'] == session_id:
                session_data = s
                break
        
        if not session_data:
            return jsonify({'success': False, 'error': 'Session not found'}), 404
        
        # Create message ID for tracking in queue
        message_id = str(uuid.uuid4())
        
        # Create response ID first
        response_id = str(uuid.uuid4())
        
        # Add user message to session
        user_msg = {
            'role': 'user',
            'content': user_message,
            'timestamp': datetime.now().isoformat(),
            'message_id': message_id
        }
        session_data['messages'].append(user_msg)
        
        # Add placeholder for AI response
        assistant_msg = {
            'role': 'assistant',
            'content': '',
            'timestamp': datetime.now().isoformat(),
            'response_id': response_id,
            'completed': False
        }
        session_data['messages'].append(assistant_msg)
        
        session_data['updated_at'] = datetime.now().isoformat()
        save_stories(sessions)
        
        print(f"[STORY] Added messages to session {session_id}: user={message_id}, assistant={response_id}")
    
    # Create queue job
    job = {
        'id': message_id,
        'job_type': 'story',
        'session_id': session_id,
        'message': user_message,
        'model': session_data['model'],
        'system_prompt': session_data.get('system_prompt', ''),
        'character_card': session_data.get('character_card', {}),
        'lorebook': session_data.get('lorebook', []),
        'authors_note': session_data.get('authors_note', ''),
        'temperature': session_data.get('temperature', 0.8),
        'top_p': session_data.get('top_p', 0.9),
        'top_k': session_data.get('top_k', 40),
        'repeat_penalty': session_data.get('repeat_penalty', 1.1),
        'num_ctx': session_data.get('num_ctx', 4096),
        'status': 'queued',
        'added_at': datetime.now().isoformat(),
        'response_id': response_id
    }
    
    print(f"[STORY] Creating job with lorebook entries: {len(job['lorebook'])}")
    
    with queue_lock:
        generation_queue.insert(0, job)
    
    save_queue_state()
    
    return jsonify({
        'success': True, 
        'job_id': message_id,
        'message_id': message_id,
        'response_id': response_id
    })

@app.route('/api/story/stream/<session_id>/<response_id>')
@require_auth
def stream_story_response(session_id, response_id):
    """Stream story response via Server-Sent Events"""
    def generate():
        """Generator for SSE stream"""
        try:
            # Wait for the response to be generated and stored
            max_wait = 300  # 5 minutes timeout
            start_time = time.time()
            last_content = ""
            
            while time.time() - start_time < max_wait:
                sessions = load_stories()
                session_data = None
                for s in sessions:
                    if s['session_id'] == session_id:
                        session_data = s
                        break
                
                if not session_data:
                    yield f"data: {json.dumps({'error': 'Session not found'})}\n\n"
                    break
                
                # Find the response message
                response_msg = None
                for msg in session_data['messages']:
                    if msg.get('message_id') == response_id or msg.get('response_id') == response_id:
                        if msg['role'] == 'assistant':
                            response_msg = msg
                            break
                
                if response_msg:
                    content = response_msg.get('content', '')
                    if content != last_content:
                        # New content available - send the delta
                        delta = content[len(last_content):]
                        if delta:
                            yield f"data: {json.dumps({'chunk': delta, 'full_content': content})}\n\n"
                            last_content = content
                    
                    # Check if message is complete
                    if response_msg.get('completed', False):
                        yield f"data: {json.dumps({'done': True, 'full_content': content})}\n\n"
                        break
                
                time.sleep(0.3)  # Poll every 300ms
            
            # Timeout or completion
            yield f"data: {json.dumps({'done': True})}\n\n"
            
        except Exception as e:
            print(f"[STORY] Stream error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    return Response(stream_with_context(generate()), mimetype='text/event-stream')

# ============================================================================
# END STORY ENDPOINTS
# ============================================================================

@app.route('/api/queue', methods=['POST'])
@require_auth
def add_to_queue():
    """Add a new generation job to the queue"""
    data = request.json
    
    job_type = data.get('job_type', 'image')  # 'image' or 'video'
    
    job = {
        'id': str(uuid.uuid4()),
        'job_type': job_type,
        'prompt': data.get('prompt', ''),
        'status': 'queued',
        'added_at': datetime.now().isoformat()
    }
    
    # Add parameters based on job type
    if job_type == 'video':
        job.update({
            'image_filename': data.get('image_filename'),
            'frames': int(data.get('frames', 64)),
            'megapixels': float(data.get('megapixels', 0.25)),
            'fps': int(data.get('fps', 16)),
            'seed': data.get('seed'),
            'file_prefix': data.get('file_prefix', 'video'),
            'subfolder': data.get('subfolder', ''),
            'nsfw': data.get('nsfw', False),
        })
    else:  # image
        job.update({
            'width': int(data.get('width', 1024)),
            'height': int(data.get('height', 1024)),
            'steps': int(data.get('steps', 4)),
            'cfg': float(data.get('cfg', 1.0)),
            'shift': float(data.get('shift', 3.0)),
            'seed': data.get('seed'),
            'use_image': data.get('use_image', False),
            'use_image_size': data.get('use_image_size', False),
            'image_filename': data.get('image_filename'),
            'file_prefix': data.get('file_prefix', 'comfyui'),
            'subfolder': data.get('subfolder', ''),
            'mcnl_lora': data.get('mcnl_lora', False),
            'snofs_lora': data.get('snofs_lora', False),
            'male_lora': data.get('male_lora', False),
        })
    
    with queue_lock:
        generation_queue.insert(0, job)  # Add to front of queue
    
    save_queue_state()
    return jsonify({'success': True, 'job_id': job['id']})


@app.route('/api/queue/batch', methods=['POST'])
@require_auth
def add_batch_to_queue():
    """Add multiple generation jobs to the queue"""
    data = request.json
    jobs_data = data.get('jobs', [])
    
    if not jobs_data:
        return jsonify({'success': False, 'error': 'No jobs provided'}), 400
    
    queued_ids = []
    
    with queue_lock:
        for job_data in jobs_data:
            job = {
                'id': str(uuid.uuid4()),
                'prompt': job_data.get('prompt', ''),
                'width': int(job_data.get('width', 1024)),
                'height': int(job_data.get('height', 1024)),
                'steps': int(job_data.get('steps', 4)),
                'cfg': float(job_data.get('cfg', 1.0)),
                'shift': float(job_data.get('shift', 3.0)),
                'seed': job_data.get('seed'),
                'use_image': job_data.get('use_image', False),
                'use_image_size': job_data.get('use_image_size', False),
                'image_filename': job_data.get('image_filename'),
                'file_prefix': job_data.get('file_prefix', 'batch'),
                'subfolder': job_data.get('subfolder', ''),
                'mcnl_lora': job_data.get('mcnl_lora', False),
                'snofs_lora': job_data.get('snofs_lora', False),
                'male_lora': job_data.get('male_lora', False),
                'status': 'queued',
                'added_at': datetime.now().isoformat()
            }
            generation_queue.insert(0, job)  # Add to front of queue
            queued_ids.append(job['id'])
    
    save_queue_state()
    return jsonify({
        'success': True,
        'queued_count': len(queued_ids),
        'job_ids': queued_ids
    })


@app.route('/api/queue/image-batch', methods=['POST'])
def add_image_batch_to_queue():
    """Queue all images from a selected input folder using same prompt/settings.
    Can use original image sizes or a custom size for all images."""
    data = request.json
    prompt = (data.get('prompt') or '').strip()
    folder = data.get('folder', '').strip()  # relative path under ComfyUI input
    use_original_size = bool(data.get('use_original_size', True))
    width = int(data.get('width', 1024))
    height = int(data.get('height', 1024))
    steps = int(data.get('steps', 4))
    cfg = float(data.get('cfg', 1.0))
    shift = float(data.get('shift', 3.0))
    seed = data.get('seed')
    file_prefix = data.get('file_prefix', 'image_batch')
    subfolder = data.get('subfolder', '')
    mcnl_lora = bool(data.get('mcnl_lora', False))
    snofs_lora = bool(data.get('snofs_lora', False))
    male_lora = bool(data.get('male_lora', False))

    if not prompt:
        return jsonify({'success': False, 'error': 'Prompt required'}), 400

    try:
        # Resolve ComfyUI input directory
        if not COMFYUI_INPUT_DIR.exists():
            return jsonify({'success': False, 'error': 'ComfyUI input directory not found'}), 500

        # Navigate to selected subfolder (or root if empty)
        current_dir = COMFYUI_INPUT_DIR / folder if folder else COMFYUI_INPUT_DIR
        if not current_dir.exists() or not current_dir.is_dir():
            return jsonify({'success': False, 'error': 'Invalid input folder'}), 400

        # Collect image files directly in this folder
        allowed_extensions = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}
        image_files = [f for f in current_dir.iterdir() if f.is_file() and f.suffix.lower() in allowed_extensions]

        if not image_files:
            return jsonify({'success': False, 'error': 'No images found in selected folder'}), 400

        queued_ids = []
        # If subfolder not provided, mirror input folder path under outputs
        if not subfolder:
            # Use the folder path relative to input root; normalize to posix style
            subfolder = folder.replace('\\', '/').strip('/')

        with queue_lock:
            for file in image_files:
                # Build relative path from input root for image_filename
                rel_path = str(file.relative_to(COMFYUI_INPUT_DIR))
                job = {
                    'id': str(uuid.uuid4()),
                    'prompt': prompt,
                    # Use custom dimensions when not using original size
                    'width': width,
                    'height': height,
                    'steps': steps,
                    'cfg': cfg,
                    'shift': shift,
                    'seed': seed,
                    'use_image': True,
                    'use_image_size': use_original_size,
                    'image_filename': rel_path,
                    'file_prefix': file_prefix,
                    'subfolder': subfolder,
                    'mcnl_lora': mcnl_lora,
                    'snofs_lora': snofs_lora,
                    'male_lora': male_lora,
                    'status': 'queued',
                    'added_at': datetime.now().isoformat()
                }
                generation_queue.insert(0, job)
                queued_ids.append(job['id'])

        save_queue_state()
        return jsonify({'success': True, 'queued_count': len(queued_ids), 'job_ids': queued_ids})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/queue/video-batch', methods=['POST'])
def queue_video_batch():
    """Queue multiple videos from a folder of images"""
    try:
        data = request.json
        prompt = data.get('prompt', '').strip()
        folder = data.get('folder', '').strip()
        frames = data.get('frames', 64)
        fps = data.get('fps', 16)
        megapixels = data.get('megapixels', 0.25)
        seed = data.get('seed')
        file_prefix = data.get('file_prefix', 'video_batch').strip()
        subfolder = data.get('subfolder', '').strip()
        nsfw = data.get('nsfw', False)

        if not prompt:
            return jsonify({'success': False, 'error': 'Prompt is required'}), 400

        # Define ComfyUI input directory
        if not COMFYUI_INPUT_DIR.exists():
            return jsonify({'success': False, 'error': 'ComfyUI input directory not found'}), 400

        # Navigate to selected subfolder (or root if empty)
        current_dir = COMFYUI_INPUT_DIR / folder if folder else COMFYUI_INPUT_DIR
        if not current_dir.exists() or not current_dir.is_dir():
            return jsonify({'success': False, 'error': 'Invalid input folder'}), 400

        # Collect image files directly in this folder
        allowed_extensions = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}
        image_files = [f for f in current_dir.iterdir() if f.is_file() and f.suffix.lower() in allowed_extensions]

        if not image_files:
            return jsonify({'success': False, 'error': 'No images found in selected folder'}), 400

        queued_ids = []
        # If subfolder not provided, mirror input folder path under outputs
        if not subfolder:
            # Use the folder path relative to input root; normalize to posix style
            subfolder = folder.replace('\\\\', '/').strip('/')

        with queue_lock:
            for file in image_files:
                # Build relative path from input root for image_filename
                rel_path = str(file.relative_to(COMFYUI_INPUT_DIR))
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
                    'nsfw': nsfw,
                    'status': 'queued',
                    'added_at': datetime.now().isoformat()
                }
                generation_queue.insert(0, job)
                queued_ids.append(job['id'])

        save_queue_state()
        return jsonify({'success': True, 'queued_count': len(queued_ids), 'job_ids': queued_ids})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/queue/tts/regenerate', methods=['POST'])
@require_auth
def regenerate_tts_sentence():
    """Regenerate a specific TTS sentence, creating a new version"""
    data = request.json
    sentence_id = data.get('sentence_id')  # Original metadata ID
    edited_text = data.get('text', '').strip()  # Potentially edited text
    
    # Get TTS settings from request (with defaults)
    tts_engine = data.get('tts_engine')  # User-selected engine (can override original)
    seed = data.get('seed')  # Can be None for random
    temperature = data.get('temperature', 0.8)
    exaggeration = data.get('exaggeration', 0.5)
    cfg_weight = data.get('cfg_weight', 0.5)
    max_chars = data.get('max_chars', 100)
    silence_ms = data.get('silence_ms', 100)
    language = data.get('language', 'English')
    emotion_description = data.get('emotion_description', '')
    
    if not edited_text:
        return jsonify({'success': False, 'error': 'Text is required'}), 400
    
    try:
        # Load metadata to get original settings
        metadata = load_metadata()
        original_entry = next((e for e in metadata if e.get('id') == sentence_id), None)
        
        if not original_entry:
            return jsonify({'success': False, 'error': 'Original sentence not found'}), 404
        
        # Get settings from original
        batch_id = original_entry.get('batch_id')
        sentence_index = original_entry.get('sentence_index', 0)
        total_sentences = original_entry.get('total_sentences', 1)
        ref_audio = original_entry.get('ref_audio') or original_entry.get('narrator_audio', 'Holly.mp3')
        style = original_entry.get('style', ref_audio)
        file_prefix = original_entry.get('file_prefix', 'tts')
        subfolder = original_entry.get('subfolder', '')
        
        # Get TTS engine and format (user-provided or fallback to original)
        if not tts_engine:  # If user didn't select an engine, use original
            tts_engine = original_entry.get('tts_engine', 'ChatterboxTTS')
        audio_format = original_entry.get('audio_format', 'wav')
        
        # Find existing versions for this sentence position
        existing_versions = [
            e for e in metadata 
            if e.get('batch_id') == batch_id 
            and e.get('sentence_index') == sentence_index
            and e.get('job_type') == 'tts'
        ]
        version_number = len(existing_versions)  # Next version number (0-indexed existing + 1)
        
        # Create ONE job for this single sentence
        job_id = str(uuid.uuid4())
        job = {
            'id': job_id,
            'job_type': 'tts',
            'text': edited_text,  # Use edited text
            'sentences': [edited_text],  # Single sentence array
            'ref_audio': ref_audio,
            'tts_engine': tts_engine,
            'audio_format': audio_format,
            'seed': seed,
            'file_prefix': file_prefix,
            'subfolder': subfolder,
            'batch_id': batch_id,  # Same batch for grouping
            'total_sentences': 1,
            'completed_sentences': 0,
            'status': 'queued',
            'added_at': datetime.now().isoformat(),
            'regeneration': True,
            'original_sentence_index': sentence_index,
            'version_number': version_number,
            # Gradio TTS settings
            'temperature': temperature,
            'exaggeration': exaggeration,
            'cfg_weight': cfg_weight,
            'chunk_size': max_chars,  # Map max_chars to chunk_size
            'language': language,
            'repetition_penalty': 2.0,
            'emotion_description': emotion_description
        }
        
        with queue_lock:
            generation_queue.insert(0, job)
        
        save_queue_state()
        return jsonify({
            'success': True,
            'job_id': job_id,
            'version_number': version_number
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/queue/tts', methods=['POST'])
@require_auth
def add_tts_to_queue():
    """Add TTS generation job to the queue. One job contains all sentences."""
    data = request.json
    text = data.get('text', '').strip()
    ref_audio = data.get('ref_audio', 'Holly.mp3')  # Reference audio for voice cloning
    seed = data.get('seed')
    file_prefix = data.get('file_prefix', 'tts').strip()
    subfolder = data.get('subfolder', '').strip()
    
    # Get Gradio TTS settings with defaults
    tts_engine = data.get('tts_engine', 'ChatterboxTTS')
    audio_format = data.get('audio_format', 'wav')
    temperature = data.get('temperature', 0.8)
    exaggeration = data.get('exaggeration', 0.5)
    cfg_weight = data.get('cfg_weight', 0.5)
    chunk_size = data.get('chunk_size', 300)
    language = data.get('language', 'en')
    repetition_penalty = data.get('repetition_penalty', 2.0)
    emotion_description = data.get('emotion_description', '')
    
    # Chat message tracking (optional)
    chat_message_id = data.get('chat_message_id')
    session_id = data.get('session_id')
    
    if not text:
        return jsonify({'success': False, 'error': 'Text is required'}), 400
    
    try:
        # Split text into sentences
        import re
        
        # Custom sentence splitting that:
        # - Does NOT split on ellipsis (...)
        # - Does NOT split on titles (Mr., Mrs., Ms., Miss., Dr., Prof., etc.)
        # - DOES split on period, question mark, exclamation mark (even inside quotes)
        # - Handles quoted dialog properly
        
        # Replace ellipsis temporarily to protect them from splitting
        text_protected = text.replace('...', '<!ELLIPSIS!>')
        
        # Protect common titles from being split (case-insensitive)
        # Map of regex patterns to placeholders and their original text
        titles_map = [
            (r'\bMr\.', '<!MR!>', 'Mr.'),
            (r'\bMrs\.', '<!MRS!>', 'Mrs.'),
            (r'\bMs\.', '<!MS!>', 'Ms.'),
            (r'\bMiss\.', '<!MISS!>', 'Miss.'),
            (r'\bDr\.', '<!DR!>', 'Dr.'),
            (r'\bProf\.', '<!PROF!>', 'Prof.'),
            (r'\bSr\.', '<!SR!>', 'Sr.'),
            (r'\bJr\.', '<!JR!>', 'Jr.'),
            (r'\bSt\.', '<!ST!>', 'St.'),
            (r'\bRev\.', '<!REV!>', 'Rev.'),
            (r'\bGen\.', '<!GEN!>', 'Gen.'),
            (r'\bCol\.', '<!COL!>', 'Col.'),
            (r'\bLt\.', '<!LT!>', 'Lt.'),
            (r'\bSgt\.', '<!SGT!>', 'Sgt.'),
            (r'\bCpt\.', '<!CPT!>', 'Cpt.'),
            (r'\bCmdr\.', '<!CMDR!>', 'Cmdr.'),
            (r'\bAve\.', '<!AVE!>', 'Ave.'),
            (r'\bBlvd\.', '<!BLVD!>', 'Blvd.'),
            (r'\bNo\.', '<!NO!>', 'No.'),
            (r'\bVol\.', '<!VOL!>', 'Vol.'),
            (r'\bVs\.', '<!VS!>', 'Vs.'),
            (r'\bEtc\.', '<!ETC!>', 'Etc.'),
            (r'\bInc\.', '<!INC!>', 'Inc.'),
            (r'\bLtd\.', '<!LTD!>', 'Ltd.'),
            (r'\bCo\.', '<!CO!>', 'Co.'),
            (r'\bCorp\.', '<!CORP!>', 'Corp.')
        ]
        
        # Apply title protection (case-insensitive)
        for pattern, placeholder, _ in titles_map:
            text_protected = re.sub(pattern, placeholder, text_protected, flags=re.IGNORECASE)
        
        # Split on sentence endings: . ! ? followed by space/quote/end
        # This pattern catches punctuation followed by optional closing quotes, then space or end
        sentences = re.split(r'([.!?]["\'Â»]?\s+|[.!?]["\'Â»]?$)', text_protected)
        
        # Recombine sentences with their punctuation
        clean_sentences = []
        i = 0
        while i < len(sentences):
            if i + 1 < len(sentences) and re.match(r'[.!?]', sentences[i+1]):
                combined = (sentences[i] + sentences[i+1]).strip()
                # Restore ellipsis
                combined = combined.replace('<!ELLIPSIS!>', '...')
                # Restore titles
                for pattern, placeholder, original_text in titles_map:
                    combined = combined.replace(placeholder, original_text)
                clean_sentences.append(combined)
                i += 2
            else:
                if sentences[i].strip() and not re.match(r'^[.!?]', sentences[i]):
                    restored = sentences[i].strip().replace('<!ELLIPSIS!>', '...')
                    # Restore titles
                    for pattern, placeholder, original_text in titles_map:
                        restored = restored.replace(placeholder, original_text)
                    clean_sentences.append(restored)
                i += 1
        
        # Filter empty
        clean_sentences = [s for s in clean_sentences if s]
        
        if not clean_sentences:
            return jsonify({'success': False, 'error': 'No valid sentences found in text'}), 400
        
        # Create a batch ID to group these audio files together
        batch_id = str(uuid.uuid4())
        
        # Create ONE job with all sentences
        job = {
            'id': str(uuid.uuid4()),
            'job_type': 'tts',
            'text': text,  # Full text for display
            'sentences': clean_sentences,  # Array of sentences to generate
            'ref_audio': ref_audio,
            'tts_engine': tts_engine,
            'audio_format': audio_format,
            'seed': seed,
            'file_prefix': file_prefix,
            'subfolder': subfolder,
            'batch_id': batch_id,
            'total_sentences': len(clean_sentences),
            'completed_sentences': 0,
            'status': 'queued',
            'added_at': datetime.now().isoformat(),
            # Gradio TTS settings
            'temperature': temperature,
            'exaggeration': exaggeration,
            'cfg_weight': cfg_weight,
            'chunk_size': chunk_size,
            'language': language,
            'repetition_penalty': repetition_penalty,
            'emotion_description': emotion_description,
            # Chat message tracking
            'chat_message_id': chat_message_id,
            'session_id': session_id
        }
        
        with queue_lock:
            generation_queue.insert(0, job)
        
        save_queue_state()
        return jsonify({
            'success': True,
            'job_id': job['id'],
            'batch_id': batch_id,
            'total_sentences': len(clean_sentences)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/queue', methods=['GET'])
@require_auth
def get_queue():
    """Get current queue status"""
    with queue_lock:
        queue_copy = [job.copy() for job in generation_queue]
        active = active_generation.copy() if active_generation else None
        completed_copy = [job.copy() for job in completed_jobs]
        paused = queue_paused
    
    # Debug: Print queue status
    if len(queue_copy) > 0:
        print(f"[QUEUE] Returning queue with {len(queue_copy)} items")
        print(f"[QUEUE] Job types in queue: {[j.get('job_type') for j in queue_copy]}")
    
    return jsonify({
        'queue': queue_copy,
        'active': active,
        'completed': completed_copy,
        'paused': paused
    })


@app.route('/api/queue/<job_id>', methods=['DELETE'])
def cancel_job(job_id):
    """Cancel a queued job or remove a completed job"""
    removed = False
    removed_type = None
    
    with queue_lock:
        # Check if it's the active job (don't allow removal)
        if active_generation and active_generation.get('id') == job_id:
            return jsonify({'success': False, 'error': 'Cannot remove active job'}), 400
        
        # Try to remove from queued jobs
        for i in range(len(generation_queue)):
            if generation_queue[i]['id'] == job_id:
                if generation_queue[i].get('status') == 'queued':
                    generation_queue.pop(i)
                    removed = True
                    removed_type = 'queued'
                    print(f"Removed queued job: {job_id}")
                    break
        
        # If not found in queue, try completed jobs
        if not removed:
            for i in range(len(completed_jobs)):
                if completed_jobs[i]['id'] == job_id:
                    completed_jobs.pop(i)
                    removed = True
                    removed_type = 'completed'
                    print(f"Removed completed job: {job_id}")
                    break
    
    if removed:
        save_queue_state()
        return jsonify({'success': True, 'message': f'{removed_type} job removed'})
    
    return jsonify({'success': False, 'error': 'Job not found'}), 404


@app.route('/api/cancel/<job_id>', methods=['POST'])
def cancel_generation(job_id):
    """Cancel active generation - interrupt ComfyUI workflows or stop Ollama streaming"""
    global cancellation_requested
    
    with queue_lock:
        if not active_generation or active_generation.get('id') != job_id:
            return jsonify({'success': False, 'error': 'Job is not currently generating'}), 400
        
        # Set cancellation flag
        cancellation_requested = True
        job_type = active_generation.get('job_type', 'image')
        
        print(f"[CANCEL] Cancellation requested for {job_type} job: {job_id}")
    
    # Send interrupt to ComfyUI for ComfyUI-based workflows
    if job_type in ['image', 'video', 'tts']:
        try:
            comfyui_client.interrupt()
            print(f"[CANCEL] Interrupt signal sent to ComfyUI for {job_type} job")
        except Exception as e:
            print(f"[CANCEL] Error sending interrupt to ComfyUI: {e}")
        
        if job_type == 'tts':
            print("[CANCEL] TTS job - remaining sentences will be skipped")
    
    # For Ollama workflows (chat/story), the streaming loop will stop but generated text is kept
    elif job_type in ['chat', 'story']:
        print(f"[CANCEL] {job_type.capitalize()} job - will stop streaming and save generated text")
    
    return jsonify({'success': True, 'message': 'Cancellation requested'})


@app.route('/api/queue/pause', methods=['POST'])
def toggle_queue_pause():
    """Pause or unpause queue processing"""
    global queue_paused
    
    with queue_lock:
        queue_paused = not queue_paused
        status = 'paused' if queue_paused else 'unpaused'
    
    print(f"[QUEUE] Queue {status}")
    return jsonify({
        'success': True,
        'paused': queue_paused,
        'message': f'Queue {status}'
    })


@app.route('/api/queue/reorder', methods=['POST'])
@require_auth
def reorder_queue():
    """Reorder a queued item to a new position"""
    data = request.json
    job_id = data.get('job_id')
    new_index = data.get('new_index')
    
    if not job_id or new_index is None:
        return jsonify({'success': False, 'error': 'Missing job_id or new_index'}), 400
    
    with queue_lock:
        # Find the job in the queue
        job_index = None
        for i, job in enumerate(generation_queue):
            if job['id'] == job_id:
                job_index = i
                break
        
        if job_index is None:
            return jsonify({'success': False, 'error': 'Job not found in queue'}), 404
        
        # Check if job is queued (not active)
        job = generation_queue[job_index]
        if job.get('status') != 'queued':
            return jsonify({'success': False, 'error': 'Can only reorder queued items'}), 400
        
        # Remove job from current position
        removed_job = generation_queue.pop(job_index)
        
        # Insert at new position
        # Remember: queue display is LIFO (index 0 = newest/top), execution is FIFO (index -1 = oldest/bottom)
        # new_index from frontend is visual position (0 = top)
        generation_queue.insert(new_index, removed_job)
        
        print(f"[QUEUE] Reordered job {job_id} from index {job_index} to {new_index}")
    
    save_queue_state()
    return jsonify({'success': True})


@app.route('/api/queue/clear', methods=['POST'])
def clear_queue():
    """Clear only queued jobs (preserve completed history)"""
    cleared_queued = 0
    
    with queue_lock:
        cleared_queued = len(generation_queue)
        generation_queue.clear()
        # Keep completed_jobs intact to preserve history
    
    save_queue_state()
    print(f"Cleared {cleared_queued} queued jobs (preserved completed history)")
    return jsonify({
        'success': True,
        'cleared_queued': cleared_queued
    })


@require_auth
@app.route('/api/recent')
def get_recent_generation():
    """Get all recent generations sorted by timestamp (newest first)"""
    metadata = load_metadata()
    
    if not metadata:
        return jsonify({'error': 'No generations found'}), 404
    
    # Filter out audio files from recent generations (they have dedicated audio browser)
    audio_extensions = {'.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma'}
    filtered_metadata = [
        entry for entry in metadata 
        if Path(entry['path']).suffix.lower() not in audio_extensions
    ]
    
    # Sort by timestamp to get most recent first
    sorted_metadata = sorted(filtered_metadata, key=lambda x: x.get('timestamp', ''), reverse=True)
    
    # Add relative_path to all entries
    for item in sorted_metadata:
        item['type'] = 'file'
        item['relative_path'] = str(Path(item['path']).relative_to(OUTPUT_DIR))
    
    return jsonify({'success': True, 'files': sorted_metadata})


@app.route('/api/browse')
@require_auth
def browse_folder():
    """Browse files and folders in a directory"""
    subfolder = request.args.get('path', '')
    root_folder = request.args.get('root', '')  # Optional root folder restriction (e.g., 'images', 'videos')
    
    # If root folder is specified, ensure path stays within that root
    if root_folder:
        # Normalize the root folder
        root_folder = root_folder.strip().strip('/')
        
        # If no subfolder specified, use the root folder
        if not subfolder:
            subfolder = root_folder
        else:
            # Ensure subfolder is within the root folder
            subfolder_normalized = subfolder.strip().strip('/')
            if not subfolder_normalized.startswith(root_folder):
                # If trying to go above root, redirect to root
                subfolder = root_folder
    
    current_dir = OUTPUT_DIR / subfolder if subfolder else OUTPUT_DIR
    
    if not current_dir.exists() or not current_dir.is_dir():
        return jsonify({'error': 'Invalid directory'}), 404
    
    # Get folders
    folders = []
    for item in current_dir.iterdir():
        if item.is_dir():
            rel_path = str(item.relative_to(OUTPUT_DIR)).replace('\\', '/')
            folders.append({
                'name': item.name,
                'path': rel_path,
                'type': 'folder'
            })
    
    # Get files with metadata (filter out audio files)
    metadata = load_metadata()
    audio_extensions = {'.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma'}
    files = []
    for entry in metadata:
        entry_path_str = entry['path']
        entry_path = Path(entry_path_str)
        
        # Skip audio files in image browser
        if entry_path.suffix.lower() in audio_extensions:
            continue
        
        # Convert to absolute path for comparison
        if entry_path.is_absolute():
            entry_abs_path = entry_path
        else:
            # Path might start with "outputs" or "outputs\\" - handle both cases
            entry_abs_path = OUTPUT_DIR / entry_path
            if not entry_abs_path.exists():
                # Try removing "outputs" prefix from the path
                path_parts = entry_path.parts
                if path_parts and path_parts[0].lower() == 'outputs':
                    entry_path = Path(*path_parts[1:])
                    entry_abs_path = OUTPUT_DIR / entry_path
        
        # Check if file is in current directory
        if entry_abs_path.exists() and entry_abs_path.parent == current_dir:
            entry['type'] = 'file'
            # Store relative path without "outputs" prefix - use forward slashes for web
            try:
                entry['relative_path'] = str(entry_abs_path.relative_to(OUTPUT_DIR)).replace('\\', '/')
            except ValueError:
                entry['relative_path'] = str(entry_path).replace('\\', '/')
            files.append(entry)
    
    # Sort: folders first, then files by timestamp (newest first)
    folders.sort(key=lambda x: x['name'])
    files.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
    
    return jsonify({
        'current_path': subfolder,
        'folders': folders,
        'files': files
    })


@app.route('/api/folder', methods=['POST'])
def create_folder():
    """Create a new folder"""
    data = request.json
    folder_name = data.get('name', '').strip()
    parent_path = data.get('parent', '')
    
    if not folder_name:
        return jsonify({'error': 'Folder name required'}), 400
    
    # Sanitize folder name
    folder_name = "".join(c for c in folder_name if c.isalnum() or c in (' ', '-', '_'))
    
    target_dir = OUTPUT_DIR / parent_path / folder_name if parent_path else OUTPUT_DIR / folder_name
    
    if target_dir.exists():
        return jsonify({'error': 'Folder already exists'}), 400
    
    try:
        target_dir.mkdir(parents=True, exist_ok=False)
        return jsonify({'success': True, 'path': str(target_dir.relative_to(OUTPUT_DIR))})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/upload', methods=['POST'])
def upload_image():
    """Upload an image or video for generation"""
    # Accept both 'image' and 'video' form fields
    if 'image' not in request.files and 'video' not in request.files:
        return jsonify({'success': False, 'error': 'No file provided'}), 400
    
    file = request.files.get('image') or request.files.get('video')
    
    if not file or file.filename == '' or file.filename is None:
        return jsonify({'success': False, 'error': 'No selected file'}), 400
    
    # Check file extension (support both images and videos)
    allowed_extensions = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.mp4', '.webm', '.mov', '.avi', '.mkv'}
    file_ext = Path(file.filename).suffix.lower()
    
    if file_ext not in allowed_extensions:
        return jsonify({'success': False, 'error': 'Invalid file type. Allowed: ' + ', '.join(allowed_extensions)}), 400
    
    try:
        # Save to ComfyUI input directory
        
        # Verify directory exists
        if not COMFYUI_INPUT_DIR.exists():
            return jsonify({
                'success': False, 
                'error': f'ComfyUI input directory not found at {COMFYUI_INPUT_DIR.absolute()}'
            }), 500
        
        # Generate unique filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"upload_{timestamp}{file_ext}"
        filepath = COMFYUI_INPUT_DIR / filename
        
        # Save file
        file.save(str(filepath))
        
        file_type = 'video' if file_ext in {'.mp4', '.webm', '.mov', '.avi', '.mkv'} else 'image'
        
        return jsonify({
            'success': True,
            'filename': filename,
            'file_type': file_type,
            'message': f'{file_type.capitalize()} uploaded successfully'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/frame-edit/extract', methods=['POST'])
@require_auth
def extract_frames_from_video():
    """Extract frames from video for frame-by-frame editing"""
    import subprocess
    import re
    
    data = request.json
    video_filename = data.get('video_filename')
    start_time = float(data.get('start_time', 0))
    end_time = float(data.get('end_time', 0))
    frame_skip = int(data.get('frame_skip', 1))
    output_folder = data.get('output_folder', '').strip()
    
    if not video_filename:
        return jsonify({'success': False, 'error': 'No video filename provided'}), 400
    
    try:
        # Locate video file in ComfyUI input directory
        COMFYUI_INPUT_DIR = Path('..') / 'comfy.git' / 'app' / 'input'
        video_path = COMFYUI_INPUT_DIR / video_filename
        
        if not video_path.exists():
            return jsonify({'success': False, 'error': f'Video file not found: {video_filename}'}), 404
        
        # Get actual video FPS using ffprobe
        try:
            ffprobe_cmd = [
                'ffprobe',
                '-v', 'error',
                '-select_streams', 'v:0',
                '-show_entries', 'stream=r_frame_rate',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                str(video_path)
            ]
            result = subprocess.run(ffprobe_cmd, capture_output=True, text=True, timeout=10)
            fps_str = result.stdout.strip()
            
            # Parse FPS (e.g., "30/1" or "30000/1001")
            if '/' in fps_str:
                num, den = fps_str.split('/')
                fps = float(num) / float(den)
            else:
                fps = float(fps_str)
        except Exception as e:
            print(f"[FRAME_EXTRACT] Warning: Could not get FPS, using default 30: {e}")
            fps = 30.0
        
        # Calculate playback FPS for folder name
        playback_fps = fps / frame_skip
        playback_fps_str = f"{playback_fps:.2f}" if playback_fps % 1 != 0 else f"{int(playback_fps)}"
        
        # Generate output folder name if not provided
        if not output_folder:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            video_basename = Path(video_filename).stem
            output_folder = f"{video_basename}_{playback_fps_str}fps_{timestamp}"
        else:
            # Append FPS to user-provided folder name
            output_folder = f"{output_folder}_{playback_fps_str}fps"
        
        # Create output directory: input/frame_edit/[folder_name]/
        frame_edit_base = COMFYUI_INPUT_DIR / 'frame_edit'
        frame_edit_base.mkdir(exist_ok=True)
        
        output_dir = frame_edit_base / output_folder
        if output_dir.exists():
            # Add timestamp to make unique
            timestamp = datetime.now().strftime('%H%M%S')
            output_folder = f"{output_folder}_{timestamp}"
            output_dir = frame_edit_base / output_folder
        
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Calculate frame selection filter
        # FFmpeg select filter: select='not(mod(n,N))' extracts every Nth frame
        duration = end_time - start_time
        
        # Build ffmpeg command
        # -ss: start time, -t: duration, -vf: video filter (select frames)
        # Output: frame_%04d.png (frame_0001.png, frame_0002.png, etc.)
        ffmpeg_cmd = [
            'ffmpeg',
            '-ss', str(start_time),
            '-i', str(video_path),
            '-t', str(duration),
            '-vf', f'select=not(mod(n\\,{frame_skip}))',
            '-vsync', 'vfr',  # Variable frame rate to respect select filter
            '-q:v', '2',  # High quality
            str(output_dir / 'frame_%04d.png')
        ]
        
        print(f"[FRAME_EXTRACT] Extracting frames from {video_filename}")
        print(f"[FRAME_EXTRACT] Time range: {start_time}s to {end_time}s")
        print(f"[FRAME_EXTRACT] Frame skip: {frame_skip}")
        print(f"[FRAME_EXTRACT] Output: {output_dir}")
        
        # Run ffmpeg
        result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True, timeout=300)
        
        if result.returncode != 0:
            print(f"[FRAME_EXTRACT] FFmpeg error: {result.stderr}")
            return jsonify({
                'success': False,
                'error': f'FFmpeg failed: {result.stderr[:200]}'
            }), 500
        
        # Count extracted frames
        frame_files = list(output_dir.glob('frame_*.png'))
        frame_count = len(frame_files)
        
        print(f"[FRAME_EXTRACT] Extracted {frame_count} frames")
        
        # Return relative path from input directory
        relative_path = f"frame_edit/{output_folder}"
        
        return jsonify({
            'success': True,
            'frame_count': frame_count,
            'folder_name': output_folder,
            'folder_path': relative_path,
            'fps': fps,
            'message': f'Successfully extracted {frame_count} frames'
        })
        
    except subprocess.TimeoutExpired:
        return jsonify({'success': False, 'error': 'Frame extraction timed out'}), 500
    except Exception as e:
        print(f"[FRAME_EXTRACT] Error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/frame-edit/count', methods=['GET'])
@require_auth
def get_frame_edit_count():
    """Get count of frames in a frame_edit folder"""
    folder = request.args.get('folder', '').strip()
    
    if not folder:
        return jsonify({'success': False, 'error': 'No folder specified'}), 400
    
    # Extract folder name from path (remove 'frame_edit/' prefix if present)
    folder_name = folder.replace('frame_edit/', '').replace('frame_edit\\', '')
    
    if not folder_name:
        return jsonify({'success': False, 'error': 'Invalid folder path'}), 400
    
    # Locate frames in ComfyUI input/frame_edit/[folder]/
    COMFYUI_INPUT_DIR = Path('..') / 'comfy.git' / 'app' / 'input'
    frame_folder = COMFYUI_INPUT_DIR / 'frame_edit' / folder_name
    
    if not frame_folder.exists():
        return jsonify({'success': False, 'error': f'Frame folder not found: {folder_name}'}), 404
    
    # Get all image files in folder
    allowed_extensions = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}
    frame_files = [f for f in frame_folder.iterdir() if f.is_file() and f.suffix.lower() in allowed_extensions]
    
    return jsonify({
        'success': True,
        'frame_count': len(frame_files),
        'folder': folder_name
    })


@app.route('/api/frame-edit/process', methods=['POST'])
@require_auth
def process_frame_edit_batch():
    """Process all frames in a frame_edit folder through ComfyUI"""
    data = request.json
    folder = data.get('folder', '').strip()
    
    if not folder:
        return jsonify({'success': False, 'error': 'No folder specified'}), 400
    
    # Extract folder name from path (remove 'frame_edit/' prefix if present)
    folder_name = folder.replace('frame_edit/', '').replace('frame_edit\\', '')
    
    if not folder_name:
        return jsonify({'success': False, 'error': 'Invalid folder path'}), 400
    
    # Locate frames in ComfyUI input/frame_edit/[folder]/
    COMFYUI_INPUT_DIR = Path('..') / 'comfy.git' / 'app' / 'input'
    frame_folder = COMFYUI_INPUT_DIR / 'frame_edit' / folder_name
    
    if not frame_folder.exists():
        return jsonify({'success': False, 'error': f'Frame folder not found: {folder_name}'}), 404
    
    # Get all image files in folder
    allowed_extensions = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}
    frame_files = [f for f in frame_folder.iterdir() if f.is_file() and f.suffix.lower() in allowed_extensions]
    
    if not frame_files:
        return jsonify({'success': False, 'error': 'No image files found in folder'}), 404
    
    # Sort by filename to maintain order
    frame_files.sort()
    
    # Get generation parameters
    prompt = data.get('prompt', '').strip()
    steps = int(data.get('steps', 4))
    cfg = float(data.get('cfg', 1.0))
    shift = float(data.get('shift', 3.0))
    seed_str = data.get('seed', '').strip()
    file_prefix = data.get('file_prefix', 'frame_edit').strip()
    
    # LoRA settings
    mcnl_lora = data.get('mcnl_lora', False)
    snofs_lora = data.get('snofs_lora', False)
    male_lora = data.get('male_lora', False)
    
    # Output folder: use custom name or default to input folder name
    output_folder = data.get('output_folder', '').strip()
    if not output_folder or output_folder.lower() == 'auto':
        output_folder = folder_name  # Use input folder name as default
    output_subfolder = f"frame_edit/{output_folder}"
    
    # Queue individual jobs for each frame
    queued_jobs = []
    
    with queue_lock:
        for frame_file in frame_files:
            # Use relative path from input directory
            relative_frame_path = f"frame_edit/{folder_name}/{frame_file.name}"
            
            job_id = str(uuid.uuid4())
            job = {
                'id': job_id,
                'job_type': 'image',
                'timestamp': datetime.now().isoformat(),
                'status': 'queued',
                'prompt': prompt,
                'width': 1024,  # Default width
                'height': 1024,  # Default height
                'steps': steps,
                'cfg': cfg,
                'shift': shift,
                'seed': seed_str or str(random.randint(0, 2**32 - 1)),
                'use_image': True,  # i2i mode
                'use_image_size': True,  # Use source image size
                'image_filename': relative_frame_path,
                'file_prefix': file_prefix,
                'subfolder': output_subfolder,
                'mcnl_lora': mcnl_lora,
                'snofs_lora': snofs_lora,
                'male_lora': male_lora,
                'frame_edit_batch': True  # Flag for tracking
            }
            
            generation_queue.insert(0, job)
            queued_jobs.append(job_id)
    
    save_queue_state()
    
    return jsonify({
        'success': True,
        'job_count': len(queued_jobs),
        'folder': folder_name,
        'output_path': output_subfolder,
        'message': f'Queued {len(queued_jobs)} frames for processing'
    })


@app.route('/api/frame-edit/count-output', methods=['GET'])
@require_auth
def get_frame_edit_output_count():
    """Get count of frames in a frame_edit output folder"""
    folder = request.args.get('folder', '').strip()
    
    if not folder:
        return jsonify({'success': False, 'error': 'No folder specified'}), 400
    
    # Extract folder name from path (remove 'images/frame_edit/' prefix if present)
    folder_name = folder.replace('images/frame_edit/', '').replace('images\\frame_edit\\', '')
    
    if not folder_name:
        return jsonify({'success': False, 'error': 'Invalid folder path'}), 400
    
    # Locate frames in outputs/images/frame_edit/[folder]/
    frame_folder = OUTPUT_DIR / 'images' / 'frame_edit' / folder_name
    
    if not frame_folder.exists():
        return jsonify({'success': False, 'error': f'Frame folder not found: {folder_name}'}), 404
    
    # Get all image files in folder
    allowed_extensions = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}
    frame_files = [f for f in frame_folder.iterdir() if f.is_file() and f.suffix.lower() in allowed_extensions]
    
    return jsonify({
        'success': True,
        'frame_count': len(frame_files),
        'folder': folder_name
    })


@app.route('/api/frame-edit/stitch', methods=['POST'])
@require_auth
def stitch_frames_to_video():
    """Stitch frames from input or output folder into a video"""
    import subprocess
    
    data = request.json
    folder = data.get('folder', '').strip()
    fps = float(data.get('fps', 30))
    output_name = data.get('output_name', '').strip()
    source = data.get('source', 'output').strip()  # 'input' or 'output'
    
    if not folder:
        return jsonify({'success': False, 'error': 'No folder specified'}), 400
    
    # Determine folder location based on source
    if source == 'input':
        # Use folder path as-is from input directory
        folder_name = folder.strip()
        # Use absolute path construction to avoid path resolution issues
        COMFYUI_INPUT_DIR = Path.cwd().parent / 'comfy.git' / 'app' / 'input'
        frame_folder = COMFYUI_INPUT_DIR / folder_name
    else:
        # Use folder path as-is from output (already includes 'images/' if needed)
        folder_name = folder.strip()
        # If path doesn't start with 'images/', add it
        if not folder_name.startswith('images'):
            frame_folder = OUTPUT_DIR / 'images' / folder_name
        else:
            frame_folder = OUTPUT_DIR / folder_name
    
    if not folder_name:
        return jsonify({'success': False, 'error': 'Invalid folder path'}), 400
    
    if not frame_folder.exists():
        return jsonify({'success': False, 'error': f'Frame folder not found: {folder_name}'}), 404
    
    # Get all image files in folder (sorted)
    allowed_extensions = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}
    frame_files = sorted([f for f in frame_folder.iterdir() if f.is_file() and f.suffix.lower() in allowed_extensions])
    
    if not frame_files:
        return jsonify({'success': False, 'error': 'No image files found in folder'}), 404
    
    # Generate output video name (use just the folder name, not full path)
    # Extract last part of path for filename
    folder_basename = Path(folder_name).name if folder_name else 'output'
    if not output_name:
        output_name = f"{folder_basename}.mp4"
    elif not output_name.endswith('.mp4'):
        output_name = f"{output_name}.mp4"
    
    # Create output directory: outputs/videos/frame_edit/
    video_output_dir = OUTPUT_DIR / 'videos' / 'frame_edit'
    video_output_dir.mkdir(parents=True, exist_ok=True)
    
    output_path = video_output_dir / output_name
    
    # If file exists, add timestamp to make unique
    if output_path.exists():
        timestamp = datetime.now().strftime('%H%M%S')
        output_name = f"{Path(output_name).stem}_{timestamp}.mp4"
        output_path = video_output_dir / output_name
    
    try:
        # Use ffmpeg to stitch frames
        # Pattern matches frame_0001.png, frame_0002.png, etc.
        # -framerate: input framerate
        # -pattern_type glob: use glob pattern matching
        # -i: input pattern
        # -c:v libx264: use H.264 codec
        # -pix_fmt yuv420p: pixel format for compatibility
        # -crf 18: high quality (lower = better quality, 18 is visually lossless)
        
        # Create a file list for ffmpeg (more reliable than glob patterns)
        file_list_path = frame_folder / 'ffmpeg_file_list.txt'
        with open(file_list_path, 'w', encoding='utf-8') as f:
            for frame_file in frame_files:
                # FFmpeg format: file 'absolute_path' (use absolute paths to avoid issues)
                absolute_path = str(frame_file.absolute()).replace('\\', '/')
                f.write(f"file '{absolute_path}'\n")
        
        ffmpeg_cmd = [
            'ffmpeg',
            '-f', 'concat',
            '-safe', '0',
            '-r', str(fps),
            '-i', str(file_list_path.absolute()),  # Use absolute path for file list
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-crf', '18',
            '-y',  # Overwrite output file
            str(output_path.absolute())  # Use absolute path for output
        ]
        
        print(f"[FRAME_STITCH] Stitching {len(frame_files)} frames to video")
        print(f"[FRAME_STITCH] FPS: {fps}")
        print(f"[FRAME_STITCH] Output: {output_path}")
        print(f"[FRAME_STITCH] File list: {file_list_path}")
        
        # Run ffmpeg (no cwd needed since we're using absolute paths)
        result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True, timeout=600)
        
        # Clean up file list
        try:
            file_list_path.unlink()
        except:
            pass
        
        if result.returncode != 0:
            print(f"[FRAME_STITCH] FFmpeg error: {result.stderr}")
            return jsonify({
                'success': False,
                'error': f'FFmpeg failed: {result.stderr[:200]}'
            }), 500
        
        print(f"[FRAME_STITCH] Video created: {output_path}")
        
        # Add metadata entry (using positional args matching function signature)
        relative_video_path = f"videos/frame_edit/{output_name}"
        metadata_entry = add_metadata_entry(
            str(output_path),     # path
            f"Stitched from frames in {folder_name}",  # prompt
            0, 0,                 # width, height (not applicable)
            0,                    # steps (not applicable)
            0,                    # seed (not applicable)
            "",                   # file_prefix (empty)
            "frame_edit",         # subfolder
            job_type='video',
            source_image=folder_name,  # Store source folder in source_image field
            frames=len(frame_files),
            fps=fps
        )
        
        return jsonify({
            'success': True,
            'video_path': relative_video_path,
            'frame_count': len(frame_files),
            'fps': fps,
            'message': f'Successfully stitched {len(frame_files)} frames to video'
        })
        
    except subprocess.TimeoutExpired:
        return jsonify({'success': False, 'error': 'Video stitching timed out'}), 500
    except Exception as e:
        print(f"[FRAME_STITCH] Error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/browse_images', methods=['GET'])
def browse_images():
    """Browse images from input or output folders with subfolder support"""
    folder = request.args.get('folder', 'input')  # 'input' or 'output'
    subpath = request.args.get('path', '')  # Subfolder path
    
    try:
        if folder == 'input':
            # List images and folders from ComfyUI input directory
            COMFYUI_INPUT_DIR = Path('..') / 'comfy.git' / 'app' / 'input'
            
            if not COMFYUI_INPUT_DIR.exists():
                return jsonify({'success': False, 'error': 'Input directory not found'}), 404
            
            # Navigate to subfolder if specified
            current_dir = COMFYUI_INPUT_DIR / subpath if subpath else COMFYUI_INPUT_DIR
            
            if not current_dir.exists() or not current_dir.is_dir():
                return jsonify({'success': False, 'error': 'Invalid directory'}), 404
            
            # Get folders
            folders = []
            for item in current_dir.iterdir():
                if item.is_dir():
                    rel_path = str(item.relative_to(COMFYUI_INPUT_DIR))
                    folders.append({
                        'name': item.name,
                        'path': rel_path,
                        'type': 'folder'
                    })
            
            # Get all image and video files
            allowed_extensions = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.mp4', '.webm', '.mov', '.avi', '.mkv'}
            images = []
            
            for file in current_dir.iterdir():
                if file.is_file() and file.suffix.lower() in allowed_extensions:
                    # Store relative path from input root
                    rel_path = str(file.relative_to(COMFYUI_INPUT_DIR))
                    images.append({
                        'filename': file.name,
                        'path': rel_path,
                        'mtime': file.stat().st_mtime
                    })
            
            # Sort folders by name, images by modification time (newest first)
            folders.sort(key=lambda x: x['name'])
            images.sort(key=lambda x: x['mtime'], reverse=True)
            
            return jsonify({
                'success': True, 
                'images': images, 
                'folders': folders,
                'current_path': subpath,
                'folder': 'input'
            })
        else:
            # For output folder, use existing browse endpoint functionality
            return jsonify({'success': False, 'error': 'Use /api/browse for output folder'}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/browse_audio_files', methods=['GET'])
def browse_audio_files():
    """Browse audio files from input or output folders"""
    folder = request.args.get('folder', 'input')  # 'input' or 'output'
    subpath = request.args.get('path', '')  # Subfolder path
    
    try:
        audio_extensions = {'.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma'}
        
        if folder == 'input':
            # List audio files from ComfyUI input directory
            COMFYUI_INPUT_DIR = Path('..') / 'comfy.git' / 'app' / 'input'
            
            if not COMFYUI_INPUT_DIR.exists():
                return jsonify({'success': False, 'error': 'Input directory not found'}), 404
            
            # Navigate to subfolder if specified
            current_dir = COMFYUI_INPUT_DIR / subpath if subpath else COMFYUI_INPUT_DIR
            
            if not current_dir.exists() or not current_dir.is_dir():
                return jsonify({'success': False, 'error': 'Invalid directory'}), 404
            
            # Get folders
            folders = []
            for item in current_dir.iterdir():
                if item.is_dir():
                    rel_path = str(item.relative_to(COMFYUI_INPUT_DIR))
                    folders.append({
                        'name': item.name,
                        'path': rel_path,
                        'type': 'folder'
                    })
            
            # Get audio files
            audio_files = []
            for file in current_dir.iterdir():
                if file.is_file() and file.suffix.lower() in audio_extensions:
                    rel_path = str(file.relative_to(COMFYUI_INPUT_DIR))
                    audio_files.append({
                        'filename': file.name,
                        'path': rel_path,
                        'mtime': file.stat().st_mtime,
                        'size': file.stat().st_size
                    })
            
            # Sort folders by name, audio files by modification time (newest first)
            folders.sort(key=lambda x: x['name'])
            audio_files.sort(key=lambda x: x['mtime'], reverse=True)
            
            return jsonify({
                'success': True,
                'audio_files': audio_files,
                'folders': folders,
                'current_path': subpath,
                'folder': 'input'
            })
        else:  # output folder
            # Navigate to subfolder in output directory
            current_dir = OUTPUT_DIR / subpath if subpath else OUTPUT_DIR
            
            if not current_dir.exists() or not current_dir.is_dir():
                return jsonify({'success': False, 'error': 'Invalid directory'}), 404
            
            # Get folders
            folders = []
            for item in current_dir.iterdir():
                if item.is_dir():
                    rel_path = str(item.relative_to(OUTPUT_DIR))
                    folders.append({
                        'name': item.name,
                        'path': rel_path,
                        'type': 'folder'
                    })
            
            # Get audio files with metadata
            metadata = load_metadata()
            audio_files = []
            
            for entry in metadata:
                entry_path = Path(entry['path'])
                if entry_path.parent == current_dir and entry_path.suffix.lower() in audio_extensions:
                    rel_path = str(entry_path.relative_to(OUTPUT_DIR))
                    audio_files.append({
                        'filename': entry['filename'],
                        'path': entry['path'],
                        'relative_path': rel_path,
                        'mtime': entry.get('timestamp', ''),
                        'job_type': entry.get('job_type', '')
                    })
            
            # Sort folders by name, audio files by mtime (newest first)
            folders.sort(key=lambda x: x['name'])
            audio_files.sort(key=lambda x: x.get('mtime', ''), reverse=True)
            
            return jsonify({
                'success': True,
                'audio_files': audio_files,
                'folders': folders,
                'current_path': subpath,
                'folder': 'output'
            })
    except Exception as e:
        print(f"Error browsing audio files: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/browse_audio', methods=['GET'])
def browse_audio():
    """Browse audio files, optionally filtered by folder or grouped by batch_id"""
    folder = request.args.get('folder', 'input')  # 'input' or 'output'
    subpath = request.args.get('path', '')  # Subfolder path
    
    try:
        if folder == 'output':
            # Get TTS audio files from output folder
            metadata = load_metadata()
            tts_entries = [entry for entry in metadata if entry.get('job_type') == 'tts']
            
            # Group by batch_id
            batches = {}
            for entry in tts_entries:
                batch_id = entry.get('batch_id', 'unknown')
                if batch_id not in batches:
                    batches[batch_id] = []
                batches[batch_id].append(entry)
            
            # Sort each batch by sentence_index
            for batch_id in batches:
                batches[batch_id].sort(key=lambda x: x.get('sentence_index', 0))
            
            # Convert to list of batches with metadata
            batch_list = []
            for batch_id, entries in batches.items():
                # Add relative_path and calculate duration if missing
                for entry in entries:
                    if 'relative_path' not in entry and 'path' in entry:
                        entry['relative_path'] = str(Path(entry['path']).relative_to(OUTPUT_DIR))
                    
                    # Calculate duration if not present or is 0
                    if 'duration' not in entry or entry.get('duration', 0) == 0:
                        file_path = OUTPUT_DIR / entry.get('path', '')
                        if file_path.exists():
                            # Define get_audio_duration inline for this context
                            def calc_duration(fp):
                                try:
                                    fp_str = str(fp)
                                    if fp_str.lower().endswith('.wav'):
                                        with wave.open(fp_str, 'r') as af:
                                            frames = af.getnframes()
                                            rate = af.getframerate()
                                            return round(frames / float(rate), 2)
                                    elif fp_str.lower().endswith('.mp3'):
                                        if MUTAGEN_AVAILABLE:
                                            audio = MP3(fp_str)
                                            return round(audio.info.length, 2)
                                        else:
                                            file_size = os.path.getsize(fp_str)
                                            return round(file_size / 16000, 2)
                                    return 0
                                except Exception as e:
                                    print(f"[AUDIO] Error calculating duration: {e}")
                                    return 0
                            
                            entry['duration'] = calc_duration(file_path)
                            print(f"[AUDIO] Calculated missing duration for {entry.get('filename')}: {entry['duration']}s")
                
                batch_list.append({
                    'batch_id': batch_id,
                    'timestamp': entries[0].get('timestamp'),
                    'file_count': len(entries),
                    'files': entries
                })
            
            # Sort batches by timestamp (newest first)
            batch_list.sort(key=lambda x: x['timestamp'], reverse=True)
            
            return jsonify({
                'success': True,
                'batches': batch_list,
                'folder': 'output'
            })
        else:
            # List audio files from ComfyUI input directory
            COMFYUI_INPUT_DIR = Path('..') / 'comfy.git' / 'app' / 'input'
            
            if not COMFYUI_INPUT_DIR.exists():
                return jsonify({'success': False, 'error': 'Input directory not found'}), 404
            
            # Navigate to subfolder if specified
            current_dir = COMFYUI_INPUT_DIR / subpath if subpath else COMFYUI_INPUT_DIR
            
            if not current_dir.exists() or not current_dir.is_dir():
                return jsonify({'success': False, 'error': 'Invalid directory'}), 404
            
            # Get folders
            folders = []
            for item in current_dir.iterdir():
                if item.is_dir():
                    rel_path = str(item.relative_to(COMFYUI_INPUT_DIR))
                    folders.append({
                        'name': item.name,
                        'path': rel_path,
                        'type': 'folder'
                    })
            
            # Get all audio files
            allowed_extensions = {'.mp3', '.wav', '.ogg', '.flac', '.m4a'}
            audio_files = []
            
            for file in current_dir.iterdir():
                if file.is_file() and file.suffix.lower() in allowed_extensions:
                    # Store relative path from input root
                    rel_path = str(file.relative_to(COMFYUI_INPUT_DIR))
                    audio_files.append({
                        'filename': file.name,
                        'path': rel_path,
                        'mtime': file.stat().st_mtime
                    })
            
            # Sort folders by name, audio by modification time (newest first)
            folders.sort(key=lambda x: x['name'])
            audio_files.sort(key=lambda x: x['mtime'], reverse=True)
            
            return jsonify({
                'success': True,
                'audio_files': audio_files,
                'folders': folders,
                'current_path': subpath,
                'folder': 'input'
            })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/image/input/<path:filepath>')
def serve_input_image(filepath):
    """Serve images from ComfyUI input directory (supports subfolders)"""
    try:
        COMFYUI_INPUT_DIR = Path('..') / 'comfy.git' / 'app' / 'input'
        # Resolve to absolute path
        absolute_dir = COMFYUI_INPUT_DIR.resolve()
        file_path = absolute_dir / filepath
        
        # Security check: ensure the file is within the input directory
        try:
            file_path.resolve().relative_to(absolute_dir)
        except ValueError:
            print(f"Security error: attempted to access file outside input directory: {filepath}")
            return jsonify({'error': 'Invalid file path'}), 403
        
        # Debug logging
        print(f"Serving input image: {filepath}")
        print(f"Resolved path: {file_path}")
        print(f"File exists: {file_path.exists()}")
        
        if not file_path.exists():
            print(f"File not found: {file_path}")
            return jsonify({'error': 'File not found'}), 404
        
        # Use the base directory and relative path for send_from_directory
        # This is more reliable than send_file for serving static files
        relative_to_input = file_path.relative_to(absolute_dir)
        return send_from_directory(str(absolute_dir), str(relative_to_input).replace('\\', '/'))
    except Exception as e:
        print(f"Error serving input image {filepath}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 404


@app.route('/api/copy_to_input', methods=['POST'])
def copy_to_input():
    """Copy an image from output folder to input folder"""
    data = request.json
    filename = data.get('filename', '')
    
    if not filename:
        return jsonify({'success': False, 'error': 'Filename required'}), 400
    
    try:
        # Source: output directory (can include subfolder path)
        source = OUTPUT_DIR / filename
        
        if not source.exists():
            print(f"Source file not found: {source}")
            return jsonify({'success': False, 'error': f'Source file not found: {filename}'}), 404
        
        # Destination: ComfyUI input directory (root level)
        COMFYUI_INPUT_DIR = Path('..') / 'comfy.git' / 'app' / 'input'
        
        if not COMFYUI_INPUT_DIR.exists():
            return jsonify({'success': False, 'error': 'Input directory not found'}), 500
        
        # Generate unique filename if file already exists (copy to root of input folder)
        dest_filename = source.name
        dest_path = COMFYUI_INPUT_DIR / dest_filename
        
        counter = 1
        while dest_path.exists():
            stem = source.stem
            suffix = source.suffix
            dest_filename = f"{stem}_{counter}{suffix}"
            dest_path = COMFYUI_INPUT_DIR / dest_filename
            counter += 1
        
        # Copy file
        import shutil
        shutil.copy2(source, dest_path)
        
        print(f"Copied {source} to {dest_path}")
        
        return jsonify({
            'success': True,
            'filename': dest_filename,
            'message': 'Image copied to input folder'
        })
    except Exception as e:
        print(f"Error copying to input: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/copy_folder_to_input', methods=['POST'])
def copy_folder_to_input():
    """Copy an entire folder from output to ComfyUI input directory"""
    data = request.json
    folder_path = data.get('folder_path', '').strip()
    
    if not folder_path:
        return jsonify({'success': False, 'error': 'Folder path required'}), 400
    
    try:
        # Source: output directory subfolder
        source_folder = OUTPUT_DIR / folder_path
        
        if not source_folder.exists():
            return jsonify({'success': False, 'error': f'Source folder not found: {folder_path}'}), 404
        
        if not source_folder.is_dir():
            return jsonify({'success': False, 'error': f'Path is not a directory: {folder_path}'}), 400
        
        # Destination: ComfyUI input directory
        COMFYUI_INPUT_DIR = Path('..') / 'comfy.git' / 'app' / 'input'
        
        if not COMFYUI_INPUT_DIR.exists():
            return jsonify({'success': False, 'error': 'Input directory not found'}), 500
        
        # Get folder name and create destination path
        folder_name = source_folder.name
        dest_folder = COMFYUI_INPUT_DIR / folder_name
        
        # Handle duplicate folder names by appending counter
        counter = 1
        while dest_folder.exists():
            dest_folder = COMFYUI_INPUT_DIR / f"{folder_name}_{counter}"
            counter += 1
        
        # Copy entire folder
        import shutil
        shutil.copytree(source_folder, dest_folder)
        
        # Return the relative folder name (not full path, just the folder name)
        result_folder_name = dest_folder.name
        print(f"Copied folder from {source_folder} to {dest_folder}")
        
        return jsonify({
            'success': True,
            'folder_name': result_folder_name,
            'message': 'Folder copied to input directory'
        })
    except Exception as e:
        print(f"Error copying folder to input: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/move', methods=['POST'])
def move_items():
    """Move files and folders to a target directory"""
    data = request.json
    items = data.get('items', [])  # List of paths
    target = data.get('target', '')  # Target folder path
    
    target_dir = OUTPUT_DIR / target if target else OUTPUT_DIR
    
    if not target_dir.exists():
        return jsonify({'error': 'Target directory does not exist'}), 400
    
    moved = []
    errors = []
    
    for item_path in items:
        try:
            source = OUTPUT_DIR / item_path
            if not source.exists():
                errors.append(f"{item_path}: Not found")
                continue
            
            # Determine target path with conflict resolution
            target_path = target_dir / source.name
            target_path = get_unique_filename(target_path)
            
            # Move the file/folder
            import shutil
            shutil.move(str(source), str(target_path))
            
            # Update metadata if it's a file
            if source.is_file():
                old_path = str(source)
                new_path = str(target_path)
                update_metadata_path(old_path, new_path)
            
            moved.append({
                'from': item_path,
                'to': str(target_path.relative_to(OUTPUT_DIR))
            })
            
        except Exception as e:
            errors.append(f"{item_path}: {str(e)}")
    
    return jsonify({
        'success': len(errors) == 0,
        'moved': moved,
        'errors': errors
    })


@app.route('/api/delete', methods=['POST'])
def delete_items():
    """Delete files and empty folders"""
    data = request.json
    items = data.get('items', [])
    
    deleted = []
    errors = []
    
    for item_path in items:
        try:
            target = OUTPUT_DIR / item_path
            if not target.exists():
                errors.append(f"{item_path}: Not found")
                continue
            
            if target.is_file():
                target.unlink()
                delete_metadata_entry(str(target))
                deleted.append(item_path)
            elif target.is_dir():
                # Only delete if empty
                if not any(target.iterdir()):
                    target.rmdir()
                    deleted.append(item_path)
                else:
                    errors.append(f"{item_path}: Folder not empty")
            
        except Exception as e:
            errors.append(f"{item_path}: {str(e)}")
    
    return jsonify({
        'success': len(errors) == 0,
        'deleted': deleted,
        'errors': errors
    })


def send_video_with_range_support(file_path):
    """
    Send video file with HTTP range request support for mobile browsers.
    Mobile browsers require range requests to stream video properly.
    """
    file_path = Path(file_path)
    if not file_path.exists():
        return "File not found", 404
    
    file_size = file_path.stat().st_size
    
    # Get MIME type
    mime_type = mimetypes.guess_type(str(file_path))[0]
    if not mime_type:
        if str(file_path).endswith('.mp4'):
            mime_type = 'video/mp4'
        elif str(file_path).endswith('.webm'):
            mime_type = 'video/webm'
        elif str(file_path).endswith('.mov'):
            mime_type = 'video/quicktime'
        else:
            mime_type = 'application/octet-stream'
    
    # Check if Range header is present
    range_header = request.headers.get('Range')
    
    if not range_header:
        # No range request - send entire file
        return send_file(file_path, mimetype=mime_type)
    
    # Parse range header (format: "bytes=start-end")
    try:
        byte_range = range_header.replace('bytes=', '').split('-')
        start = int(byte_range[0]) if byte_range[0] else 0
        end = int(byte_range[1]) if byte_range[1] else file_size - 1
        
        # Validate range
        if start >= file_size or start < 0 or end >= file_size:
            return Response(status=416)  # Range Not Satisfiable
        
        length = end - start + 1
        
        # Read the requested chunk
        with open(file_path, 'rb') as f:
            f.seek(start)
            data = f.read(length)
        
        # Create response with proper headers
        response = Response(data, status=206, mimetype=mime_type)
        response.headers['Content-Range'] = f'bytes {start}-{end}/{file_size}'
        response.headers['Accept-Ranges'] = 'bytes'
        response.headers['Content-Length'] = str(length)
        response.headers['Cache-Control'] = 'no-cache'
        
        return response
        
    except (ValueError, IndexError):
        # Invalid range format - send entire file
        return send_file(file_path, mimetype=mime_type)


@app.route('/api/images/<image_id>')
def get_image_metadata(image_id):
    """Get metadata for a specific image"""
    metadata = load_metadata()
    for entry in metadata:
        if entry['id'] == image_id:
            return jsonify(entry)
    return jsonify({'error': 'Image not found'}), 404


@app.route('/outputs/<path:filepath>')
def serve_image(filepath):
    """Serve generated images, videos, and audio files from any subfolder"""
    file_path = OUTPUT_DIR / filepath
    if file_path.exists() and file_path.is_file():
        # Use range support for videos (required for mobile browsers)
        if filepath.endswith(('.mp4', '.webm', '.mov')):
            return send_video_with_range_support(file_path)
        # Serve audio files with proper MIME type
        elif filepath.endswith('.mp3'):
            return send_file(file_path, mimetype='audio/mpeg')
        elif filepath.endswith('.wav'):
            return send_file(file_path, mimetype='audio/wav')
        elif filepath.endswith('.ogg'):
            return send_file(file_path, mimetype='audio/ogg')
        elif filepath.endswith('.flac'):
            return send_file(file_path, mimetype='audio/flac')
        elif filepath.endswith('.m4a'):
            return send_file(file_path, mimetype='audio/mp4')
        else:
            return send_file(file_path)
    return "File not found", 404

@app.route('/api/video/<path:filepath>')
def serve_video_from_input(filepath):
    """Serve videos from ComfyUI input directory or outputs directory"""
    # Try ComfyUI input directory first
    COMFYUI_INPUT_DIR = Path('..') / 'comfy.git' / 'app' / 'input'
    comfyui_input = COMFYUI_INPUT_DIR / filepath
    if comfyui_input.exists() and comfyui_input.is_file():
        return send_video_with_range_support(comfyui_input)
    
    # Fallback to outputs directory
    output_path = OUTPUT_DIR / filepath
    if output_path.exists() and output_path.is_file():
        return send_video_with_range_support(output_path)
    
    return "Video not found", 404


@app.route('/api/thumbnail/<path:filepath>')
def serve_video_thumbnail(filepath):
    """
    Serve video thumbnail, generating it if necessary
    Expects filepath to be relative to OUTPUT_DIR (e.g., 'videos/subfolder/video.mp4')
    """
    try:
        # Get or generate thumbnail
        thumbnail_rel_path = get_or_generate_thumbnail(Path(filepath))
        
        if thumbnail_rel_path is None:
            # Return a default placeholder or 404
            return "Thumbnail generation failed", 404
        
        # Serve the thumbnail
        thumbnail_path = OUTPUT_DIR / thumbnail_rel_path
        
        if thumbnail_path.exists():
            return send_file(thumbnail_path, mimetype='image/jpeg')
        else:
            return "Thumbnail not found", 404
            
    except Exception as e:
        print(f"[THUMBNAIL] Error serving thumbnail for {filepath}: {e}")
        return "Error generating thumbnail", 500


@app.route('/api/thumbnails/generate-all', methods=['POST'])
@require_auth
def trigger_thumbnail_generation():
    """
    Manually trigger thumbnail generation for all videos
    This is a background task that won't block the response
    """
    try:
        # Start thumbnail generation in background thread
        thread = threading.Thread(target=generate_all_video_thumbnails, daemon=True)
        thread.start()
        
        return jsonify({
            'success': True,
            'message': 'Thumbnail generation started in background'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500



@app.route('/api/audio/input/<path:filepath>')
def serve_audio_from_input(filepath):
    """Serve audio files from ComfyUI input directory"""
    COMFYUI_INPUT_DIR = Path('..') / 'comfy.git' / 'app' / 'input'
    audio_path = COMFYUI_INPUT_DIR / filepath
    
    if not audio_path.exists() or not audio_path.is_file():
        return "Audio file not found", 404
    
    # Determine MIME type based on extension
    if filepath.endswith('.mp3'):
        mime_type = 'audio/mpeg'
    elif filepath.endswith('.wav'):
        mime_type = 'audio/wav'
    elif filepath.endswith('.ogg'):
        mime_type = 'audio/ogg'
    elif filepath.endswith('.flac'):
        mime_type = 'audio/flac'
    elif filepath.endswith('.m4a') or filepath.endswith('.aac'):
        mime_type = 'audio/mp4'
    elif filepath.endswith('.wma'):
        mime_type = 'audio/x-ms-wma'
    else:
        mime_type = 'application/octet-stream'
    
    return send_file(audio_path, mimetype=mime_type)


@app.route('/api/audio/download/<file_id>')
@require_auth
def download_audio_sentence(file_id):
    """Download a single audio sentence by its file ID"""
    try:
        metadata = load_metadata()
        
        # Find the file by ID
        file_entry = None
        for entry in metadata:
            if entry.get('id') == file_id:
                file_entry = entry
                break
        
        if not file_entry:
            return jsonify({'success': False, 'error': 'Audio file not found'}), 404
        
        # Get the file path - handle both absolute and relative paths
        path_str = file_entry.get('path', '')
        file_path = Path(path_str)
        
        # If path is not absolute and doesn't exist, try prepending OUTPUT_DIR
        if not file_path.is_absolute() and not file_path.exists():
            # Check if it's already relative to project root
            if not file_path.exists():
                # Try with OUTPUT_DIR
                file_path = OUTPUT_DIR / path_str
        
        if not file_path.exists():
            print(f"[AUDIO] Download failed - file not found: {file_path}")
            return jsonify({'success': False, 'error': f'Audio file does not exist: {file_path.name}'}), 404
        
        # Determine MIME type
        if file_entry.get('filename', '').endswith('.mp3'):
            mime_type = 'audio/mpeg'
        elif file_entry.get('filename', '').endswith('.wav'):
            mime_type = 'audio/wav'
        else:
            mime_type = 'audio/mpeg'
        
        # Send file with download headers
        return send_file(
            file_path,
            mimetype=mime_type,
            as_attachment=True,
            download_name=file_entry.get('filename', 'audio.wav')
        )
    
    except Exception as e:
        print(f"[AUDIO] Error downloading audio: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/audio/merge_batch', methods=['POST'])
@require_auth
def merge_audio_batch():
    """Merge selected audio files from a batch into a single file"""
    if not FFMPEG_AVAILABLE:
        return jsonify({
            'success': False,
            'error': 'Audio merging requires ffmpeg to be installed on your system. Download from https://ffmpeg.org/download.html and add to PATH.'
        }), 500
    
    try:
        data = request.json
        batch_id = data.get('batch_id')
        sentence_indices = data.get('sentence_indices', [])  # Array of sentence indices
        
        if not batch_id:
            return jsonify({'success': False, 'error': 'batch_id is required'}), 400
        
        metadata = load_metadata()
        
        # Get all files for this batch
        batch_files = [entry for entry in metadata 
                      if entry.get('job_type') == 'tts' and entry.get('batch_id') == batch_id]
        
        if not batch_files:
            return jsonify({'success': False, 'error': 'Batch not found'}), 404
        
        # Group by sentence_index
        sentence_groups = {}
        for file in batch_files:
            idx = file.get('sentence_index')
            if idx not in sentence_groups:
                sentence_groups[idx] = []
            sentence_groups[idx].append(file)
        
        # If no specific indices provided, use all
        if not sentence_indices:
            sentence_indices = sorted(sentence_groups.keys())
        
        # Get the latest version for each requested sentence_index
        files_to_merge = []
        for idx in sorted(sentence_indices):
            if idx in sentence_groups:
                versions = sentence_groups[idx]
                # Sort by version_number, newest first
                versions.sort(key=lambda x: x.get('version_number', 0), reverse=True)
                files_to_merge.append(versions[0])
        
        if not files_to_merge:
            return jsonify({'success': False, 'error': 'No audio files found for merging'}), 404
        
        # Merge audio files using ffmpeg
        # Collect valid file paths
        valid_files = []
        for file_entry in files_to_merge:
            # Handle path - may be relative to project root or need OUTPUT_DIR
            path_str = file_entry.get('path', '')
            file_path = Path(path_str)
            
            # If path is not absolute and doesn't exist, try prepending OUTPUT_DIR
            if not file_path.is_absolute() and not file_path.exists():
                # Try with OUTPUT_DIR if not already correct
                file_path = OUTPUT_DIR / path_str if not file_path.exists() else file_path
            
            if not file_path.exists():
                print(f"[AUDIO] Warning: File not found: {file_path}")
                continue
            
            valid_files.append(file_path)
        
        if not valid_files:
            return jsonify({'success': False, 'error': 'No valid audio files found for merging'}), 404
        
        # Generate output filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_filename = f"merged_{batch_id}_{timestamp}.wav"
        output_path = OUTPUT_DIR / "audio" / output_filename
        
        # Use ffmpeg to merge files with silence between them
        try:
            # Create a temporary file list for ffmpeg concat
            concat_list_path = OUTPUT_DIR / "audio" / f"concat_list_{timestamp}.txt"
            silence_path = OUTPUT_DIR / "audio" / f"silence_{timestamp}.wav"
            
            # Create 100ms silence file using ffmpeg
            silence_cmd = [
                'ffmpeg', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
                '-t', '0.1', '-y', str(silence_path)
            ]
            subprocess.run(silence_cmd, check=True, capture_output=True)
            
            # Build ffmpeg filter_complex command to concatenate with silence
            inputs = []
            filter_parts = []
            for i, file_path in enumerate(valid_files):
                inputs.extend(['-i', str(file_path)])
                if i > 0:
                    inputs.extend(['-i', str(silence_path)])
            
            # Build filter complex string
            stream_count = len(valid_files) + (len(valid_files) - 1)  # files + silences
            filter_str = f"{''.join([f'[{i}:a]' for i in range(stream_count)])}concat=n={stream_count}:v=0:a=1[out]"
            
            # Run ffmpeg merge command
            merge_cmd = ['ffmpeg'] + inputs + [
                '-filter_complex', filter_str,
                '-map', '[out]',
                '-y', str(output_path)
            ]
            
            result = subprocess.run(merge_cmd, check=True, capture_output=True, text=True)
            
            # Clean up temporary files
            if concat_list_path.exists():
                concat_list_path.unlink()
            if silence_path.exists():
                silence_path.unlink()
            
            print(f"[AUDIO] Merged {len(valid_files)} audio files into {output_filename}")
            
        except subprocess.CalledProcessError as e:
            print(f"[AUDIO] ffmpeg error: {e.stderr}")
            return jsonify({'success': False, 'error': f'ffmpeg error: {e.stderr}'}), 500
        except Exception as e:
            print(f"[AUDIO] Error during merge: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'success': False, 'error': str(e)}), 500
        
        # Send the merged file
        return send_file(
            output_path,
            mimetype='audio/wav',
            as_attachment=True,
            download_name=output_filename
        )
    
    except Exception as e:
        print(f"[AUDIO] Error merging audio: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# AI Assistant Endpoints

# ComfyUI Memory Management Endpoints

@app.route('/api/comfyui/unload', methods=['POST'])
def unload_comfyui_models():
    """Manually unload all ComfyUI and Ollama models and clear memory"""
    try:
        # Unload ComfyUI models
        comfyui_client.unload_models()
        comfyui_client.clear_cache()
        
        # Unload Ollama models
        ollama_client.unload_all_models()
        
        # Unload Gradio TTS models
        gradio_tts_client.unload_all_engines()
        
        return jsonify({
            'success': True,
            'message': 'ComfyUI, Ollama, and Gradio TTS models unloaded and memory cleared'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/hardware/stats', methods=['GET'])
def get_hardware_stats():
    """Get current hardware usage statistics"""
    try:
        import psutil
        
        # CPU Usage
        cpu_percent = psutil.cpu_percent(interval=0.1)
        
        # RAM Usage
        ram = psutil.virtual_memory()
        ram_used_gb = ram.used / (1024**3)
        ram_total_gb = ram.total / (1024**3)
        ram_percent = ram.percent
        
        # GPU/VRAM Usage (try to get from nvidia-smi or fallback)
        gpu_percent = 0
        vram_used_gb = 0
        vram_total_gb = 0
        vram_percent = 0
        gpu_temp = 0
        
        try:
            import subprocess
            # Try nvidia-smi for NVIDIA GPUs (including temperature)
            result = subprocess.run(
                ['nvidia-smi', '--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu', '--format=csv,noheader,nounits'],
                capture_output=True,
                text=True,
                timeout=2
            )
            if result.returncode == 0:
                values = result.stdout.strip().split(',')
                if len(values) >= 3:
                    gpu_percent = float(values[0].strip())
                    vram_used_gb = float(values[1].strip()) / 1024
                    vram_total_gb = float(values[2].strip()) / 1024
                    vram_percent = (vram_used_gb / vram_total_gb * 100) if vram_total_gb > 0 else 0
                if len(values) >= 4:
                    gpu_temp = float(values[3].strip())
        except Exception as e:
            print(f"GPU stats unavailable: {e}")
        
        return jsonify({
            'success': True,
            'cpu': {
                'percent': round(cpu_percent, 1),
                'label': f'{round(cpu_percent, 1)}%'
            },
            'ram': {
                'percent': round(ram_percent, 1),
                'used_gb': round(ram_used_gb, 2),
                'total_gb': round(ram_total_gb, 2),
                'label': f'{round(ram_used_gb, 1)} / {round(ram_total_gb, 1)} GB'
            },
            'gpu': {
                'percent': round(gpu_percent, 1),
                'label': f'{round(gpu_percent, 1)}%'
            },
            'vram': {
                'percent': round(vram_percent, 1),
                'used_gb': round(vram_used_gb, 2),
                'total_gb': round(vram_total_gb, 2),
                'label': f'{round(vram_used_gb, 1)} / {round(vram_total_gb, 1)} GB'
            },
            'gpu_temp': {
                'celsius': round(gpu_temp, 1),
                'label': f'{round(gpu_temp, 1)}Â°C'
            }
        })
    except ImportError:
        return jsonify({
            'success': False,
            'error': 'psutil not installed'
        }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


def ensure_dummy_image():
    """Create a dummy image if permanent\violet.webp doesn't exist"""
    COMFYUI_INPUT_DIR = Path('..') / 'comfy.git' / 'app' / 'input'
    permanent_dir = COMFYUI_INPUT_DIR / 'permanent'
    dummy_image_path = permanent_dir / 'violet.webp'
    
    if not dummy_image_path.exists():
        print(f"Creating dummy image: {dummy_image_path}")
        permanent_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            # Create a simple 512x512 purple/violet image using PIL
            from PIL import Image
            img = Image.new('RGB', (512, 512), color=(138, 43, 226))  # Violet color
            img.save(str(dummy_image_path), 'WEBP')
            print(f"[OK] Dummy image created successfully")
        except ImportError:
            print("Warning: PIL not available, creating placeholder file")
            # If PIL is not available, create a minimal valid WebP file
            # This is a 1x1 violet pixel WebP file (minimal valid WebP)
            webp_data = bytes([
                0x52, 0x49, 0x46, 0x46, 0x3A, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
                0x56, 0x50, 0x38, 0x4C, 0x2E, 0x00, 0x00, 0x00, 0x2F, 0x00, 0x00, 0x00,
                0x00, 0x47, 0x00, 0x9D, 0x01, 0x2A, 0x01, 0x00, 0x01, 0x00, 0x11, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00
            ])
            with open(dummy_image_path, 'wb') as f:
                f.write(webp_data)
            print(f"[OK] Placeholder image created")
    else:
        print(f"[OK] Dummy image already exists: {dummy_image_path}")


if __name__ == '__main__':
    print("=" * 60)
    print("VELVET REVERIE - Starting Server")
    print("=" * 60)
    
    # Setup SSL context if enabled
    ssl_context = None
    protocol = 'http'
    if ENABLE_SSL:
        if Path(SSL_CERT_FILE).exists() and Path(SSL_KEY_FILE).exists():
            ssl_context = (SSL_CERT_FILE, SSL_KEY_FILE)
            protocol = 'https'
            print(f"SSL: Enabled (cert: {SSL_CERT_FILE}, key: {SSL_KEY_FILE})")
        else:
            print(f"[WARNING] SSL enabled but certificate files not found!")
            print(f"  Expected: {SSL_CERT_FILE} and {SSL_KEY_FILE}")
            print(f"  Run 'python generate_cert.py' to create self-signed certificates")
            print(f"  Falling back to HTTP...")
            protocol = 'http'
    
    print(f"Server: {protocol}://{FLASK_HOST}:{FLASK_PORT}")
    print(f"Output Directory: {OUTPUT_DIR.absolute()}")
    print(f"Workflows Directory: {WORKFLOWS_DIR.absolute()}")
    print(f"ComfyUI Server: http://{COMFYUI_HOST}:{COMFYUI_PORT}")
    print(f"Ollama Server: http://{OLLAMA_HOST}:{OLLAMA_PORT}")
    print(f"Gradio TTS Server: http://{GRADIO_HOST}:{GRADIO_PORT}")
    print("=" * 60)
    
    # Ensure dummy image exists
    ensure_dummy_image()
    
    # Generate thumbnails for existing videos in background
    print("Starting background thumbnail generation...")
    thumbnail_thread = threading.Thread(target=generate_all_video_thumbnails, daemon=True)
    thumbnail_thread.start()
    
    print("=" * 60)
    if ssl_context:
        print("Starting Flask with HTTPS...")
        app.run(host=FLASK_HOST, port=FLASK_PORT, debug=FLASK_DEBUG, threaded=True, ssl_context=ssl_context)
    else:
        print("Starting Flask with HTTP...")
        app.run(host=FLASK_HOST, port=FLASK_PORT, debug=FLASK_DEBUG, threaded=True)


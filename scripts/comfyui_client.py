"""
Velvet Reverie - Workflow Client
Interact with ComfyUI API backend to execute workflows
"""

import json
import urllib.request
import urllib.parse
import urllib.error
import uuid
import random
import time
import shutil
import os
import base64
import socket
import ssl
import struct
import threading
from pathlib import Path
from typing import Optional, Dict, Any, Callable


class ComfyUIClient:
    def __init__(self, server_address: str = "127.0.0.1:8188", token: str = None, workflows_dir: str = "workflows", output_dir: str = None):
        """
        Initialize ComfyUI client
        
        Args:
            server_address: ComfyUI server address (default: 127.0.0.1:8188)
            token: ComfyUI API token (optional, required if password protection enabled)
            workflows_dir: Directory containing workflow JSON files (default: workflows)
            output_dir: ComfyUI output directory path (default: ../comfy.git/app/output)
        """
        self.server_address = server_address
        self.client_id = str(uuid.uuid4())
        self.token = token
        self.workflows_dir = Path(workflows_dir)
        self.output_dir = Path(output_dir) if output_dir else Path('..') / 'comfy.git' / 'app' / 'output'

        # Live progress tracking via ComfyUI WebSocket.
        # ComfyUI only reports sampling step progress (value/max) over the
        # WebSocket ("/ws"), not via the HTTP history endpoint while running.
        self._progress_values = {}  # prompt_id -> (current_step, total_steps)
        self._progress_lock = threading.Lock()
        self._ws_thread = None
        
        # Load workflow filenames from environment or use defaults
        self.workflow_qwen = os.getenv('WORKFLOW_QWEN', 'Qwen_Full (API).json')
        self.workflow_video = os.getenv('WORKFLOW_VIDEO', 'Wan2.2 I2V (API).json')
        self.workflow_video_nsfw = os.getenv('WORKFLOW_VIDEO_NSFW', 'Wan2.2 I2V NSFW (API).json')
        
    # ── WebSocket progress listener ──────────────────────────────────────────
    def get_latest_progress(self, prompt_id: str) -> Optional[tuple]:
        """Return the latest observed (current_step, total_steps) for a prompt, if any."""
        with self._progress_lock:
            return self._progress_values.get(prompt_id)

    def _start_ws_listener(self) -> None:
        """Start a background thread that reads progress events from ComfyUI's WebSocket."""
        if self._ws_thread is not None and self._ws_thread.is_alive():
            return
        def _run():
            while True:
                try:
                    self._listen_ws()
                except socket.timeout:
                    # Idle connection dropped; silently reconnect.
                    pass
                except (ConnectionError, OSError):
                    # Connection lost; silently reconnect.
                    pass
                except Exception as e:
                    print(f"[PROGRESS] WebSocket listener error: {e}; retrying in 3s...")
                time.sleep(3)
        self._ws_thread = threading.Thread(target=_run, daemon=True)
        self._ws_thread.start()

    def _listen_ws(self) -> None:
        """Connect to the ComfyUI WebSocket and record progress events until the socket dies."""
        host, port = self.server_address.split(':')
        port = int(port)
        ws_path = f"/ws?clientId={urllib.parse.quote(self.client_id)}"
        if self.token:
            ws_path += f"&token={urllib.parse.quote(self.token)}"

        sock = socket.create_connection((host, port), timeout=15)
        try:
            if port == 443:
                ctx = ssl.create_default_context()
                sock = ctx.wrap_socket(sock, server_hostname=host)

            key = base64.b64encode(os.urandom(16)).decode()
            request = (
                f"GET {ws_path} HTTP/1.1\r\n"
                f"Host: {self.server_address}\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                f"Sec-WebSocket-Key: {key}\r\n"
                "Sec-WebSocket-Version: 13\r\n\r\n"
            )
            sock.sendall(request.encode())

            # Read handshake response
            response = self._recv_until_headers(sock)
            if b" 101 " not in response.split(b"\r\n", 1)[0]:
                raise RuntimeError(f"WebSocket handshake failed: {response.split(b'\r\n', 1)[0]!r}")

            sock.settimeout(60)
            while True:
                opcode, payload = self._read_ws_frame(sock)
                if opcode == 0x1:  # text frame
                    self._handle_ws_message(payload)
                elif opcode == 0x8:  # close
                    break
        finally:
            try:
                sock.close()
            except Exception:
                pass

    @staticmethod
    def _recv_until_headers(sock) -> bytes:
        data = b""
        while b"\r\n\r\n" not in data:
            chunk = sock.recv(4096)
            if not chunk:
                break
            data += chunk
        return data

    @staticmethod
    def _read_ws_frame(sock):
        """Read a single WebSocket frame, returning (opcode, payload_bytes)."""
        header = sock.recv(2)
        if len(header) < 2:
            raise ConnectionError("WebSocket closed")
        b1, b2 = header[0], header[1]
        opcode = b1 & 0x0F
        length = b2 & 0x7F
        if length == 126:
            ext = sock.recv(2)
            length = struct.unpack(">H", ext)[0]
        elif length == 127:
            ext = sock.recv(8)
            length = struct.unpack(">Q", ext)[0]
        masked = (b2 & 0x80) != 0
        mask = sock.recv(4) if masked else None
        payload = b""
        while len(payload) < length:
            chunk = sock.recv(length - len(payload))
            if not chunk:
                break
            payload += chunk
        if masked and mask:
            payload = bytes(c ^ mask[i % 4] for i, c in enumerate(payload))
        return opcode, payload

    def _handle_ws_message(self, payload: bytes) -> None:
        try:
            msg = json.loads(payload)
        except Exception:
            return
        msg_type = msg.get('type')
        data = msg.get('data') or {}

        if msg_type == 'progress':
            # Legacy ComfyUI format: {"type":"progress","data":{"value":N,"max":M}}
            prompt_id = msg.get('prompt_id')
            value = data.get('value')
            maximum = data.get('max')
            self._record_progress(prompt_id, value, maximum)
        elif msg_type == 'progress_state':
            # New ComfyUI format:
            #   {"type":"progress_state","data":{"prompt_id":...,"nodes":{
            #       "<node_id>":{"value":N,"max":M,"state":"running",...}, ...}}}
            prompt_id = data.get('prompt_id')
            nodes = data.get('nodes') or {}
            self._record_progress_state(prompt_id, nodes)

    def _record_progress_state(self, prompt_id, nodes) -> None:
        """Record sampling progress from the sampler node only.

        The sampler node reports its progress with max == total steps
        (e.g. 8, 20, 50) and value == current step. Every other node
        (loaders/encoders/previewers) reports max == 1, which is useless for a
        step bar, so we ignore them entirely.
        """
        if not prompt_id or not nodes:
            return

        # Only the sampler node reports real step progress with max == total
        # steps (e.g. 8, 20, 50). Every other node (loaders/encoders) reports
        # max == 1, which is meaningless for a step bar. Skip those entirely so
        # the bar only appears once sampling actually begins.
        for node in nodes.values():
            maximum = node.get('max')
            if maximum and maximum > 1:
                self._record_progress(prompt_id, node.get('value'), maximum)
                return

    def _record_progress(self, prompt_id, value, maximum) -> None:
        if not prompt_id or value is None or maximum is None or maximum <= 0:
            return
        int_value, int_max = int(value), int(maximum)
        with self._progress_lock:
            previous = self._progress_values.get(prompt_id)
            # Guard against regressions: once we've seen a real sampler total
            # (max > 1), ignore lower-max noise from other nodes in the graph.
            if previous is not None:
                prev_value, prev_max = previous
                if prev_max > 1 and int_max <= 1:
                    return
                if prev_max == int_max and int_value < prev_value:
                    return
            self._progress_values[prompt_id] = (int_value, int_max)
        if previous is None or previous[1] != int_max:
            print(f"[PROGRESS] ComfyUI sampling step {int_max} total (via WebSocket) for {prompt_id}")

    def load_workflow(self, workflow_filename: str = None) -> Dict[str, Any]:
        """
        Load workflow from JSON file
        
        Args:
            workflow_filename: Filename of workflow (will be combined with workflows_dir)
                             If None, uses default qwen workflow
        
        Returns:
            Workflow dictionary
        """
        if workflow_filename is None:
            workflow_filename = self.workflow_qwen
        
        # If workflow_filename is an absolute path, use it directly
        workflow_path = Path(workflow_filename)
        if not workflow_path.is_absolute():
            workflow_path = self.workflows_dir / workflow_filename
        
        with open(workflow_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    def interrupt(self) -> bool:
        """
        Send interrupt signal to ComfyUI to cancel current generation
        
        Returns:
            True if successful, False otherwise
        """
        try:
            url = f"http://{self.server_address}/interrupt"
            if self.token:
                url += f"?token={self.token}"
            req = urllib.request.Request(
                url,
                data=b"",
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                return response.status == 200
        except Exception as e:
            print(f"Error sending interrupt: {e}")
            return False
    
    def queue_prompt(self, workflow: Dict[str, Any]) -> Dict[str, Any]:
        """
        Queue a prompt to ComfyUI
        
        Args:
            workflow: The workflow dictionary
            
        Returns:
            Response from the API containing prompt_id
        """
        p = {"prompt": workflow, "client_id": self.client_id}
        data = json.dumps(p).encode('utf-8')
        
        url = f"http://{self.server_address}/prompt"
        if self.token:
            url += f"?token={self.token}"
        
        req = urllib.request.Request(
            url,
            data=data,
            headers={'Content-Type': 'application/json'}
        )
        
        try:
            response = urllib.request.urlopen(req)
            return json.loads(response.read())
        except urllib.error.HTTPError as e:
            # Read the error response body for debugging
            error_body = e.read().decode('utf-8') if e.fp else "No error details"
            print(f"[ERROR] ComfyUI rejected workflow with HTTP {e.code}: {e.reason}")
            print(f"[ERROR] Response body: {error_body}")
            print(f"[DEBUG] Workflow being sent: {json.dumps(workflow, indent=2)}")
            raise
        except urllib.error.URLError as e:
            print(f"Error connecting to ComfyUI: {e}")
            raise
    
    def get_image(self, filename: str, subfolder: str = "", folder_type: str = "output") -> bytes:
        """
        Download generated image from ComfyUI
        
        Args:
            filename: Name of the image file
            subfolder: Subfolder in the output directory
            folder_type: Type of folder (output, input, temp)
            
        Returns:
            Image data as bytes
        """
        data = {"filename": filename, "subfolder": subfolder, "type": folder_type}
        url_values = urllib.parse.urlencode(data)
        
        url = f"http://{self.server_address}/view?{url_values}"
        if self.token:
            url += f"&token={self.token}"
        
        try:
            with urllib.request.urlopen(url) as response:
                return response.read()
        except urllib.error.URLError as e:
            print(f"Error downloading image: {e}")
            raise
    
    def get_history(self, prompt_id: str) -> Dict[str, Any]:
        """
        Get the execution history for a prompt
        
        Args:
            prompt_id: The prompt ID to query
            
        Returns:
            History data for the prompt
        """
        url = f"http://{self.server_address}/history/{prompt_id}"
        if self.token:
            url += f"?token={self.token}"
        
        try:
            with urllib.request.urlopen(url) as response:
                return json.loads(response.read())
        except urllib.error.URLError as e:
            print(f"Error getting history: {e}")
            raise
    
    def wait_for_completion(self, prompt_id: str, timeout: int = None, progress_callback: Optional[Callable[[int, int], None]] = None) -> Dict[str, Any]:
        """
        Wait for a prompt to complete execution
        
        Args:
            prompt_id: The prompt ID to wait for
            timeout: Maximum time to wait in seconds (None for no timeout)
            progress_callback: Optional callback invoked as (current_step, total_steps)
                each time sampling progress is observed.
            
        Returns:
            History data when completed
        """
        start_time = time.time()
        self._start_ws_listener()
        
        while True:
            # Check timeout if specified
            if timeout is not None and time.time() - start_time >= timeout:
                raise TimeoutError(f"Workflow did not complete within {timeout} seconds")
            
            history = self.get_history(prompt_id)
            
            if prompt_id in history:
                return history[prompt_id]
            
            if progress_callback is not None:
                # Prefer live WebSocket progress; fall back to history messages.
                latest = self.get_latest_progress(prompt_id)
                if latest is not None:
                    current, total = latest
                    progress_callback(current, total)
                else:
                    self._report_progress(history, prompt_id, progress_callback)
            
            time.sleep(1)
    
    @staticmethod
    def _report_progress(history: Dict[str, Any], prompt_id: str, progress_callback: Callable[[int, int], None]) -> None:
        """
        Extract the latest sampling progress from a ComfyUI history response and
        forward it to the callback as (current_step, total_steps).

        ComfyUI reports progress via status.messages entries of the form:
            {"type": "progress", "data": {"value": <current>, "max": <total>}}
        """
        try:
            entry = history.get(prompt_id)
            if not entry:
                return
            messages = entry.get('status', {}).get('messages', [])
            for message in reversed(messages):
                if message.get('type') == 'progress':
                    data = message.get('data') or {}
                    value = data.get('value')
                    maximum = data.get('max')
                    if value is not None and maximum is not None and maximum > 0:
                        progress_callback(int(value), int(maximum))
                    return
        except Exception as e:
            print(f"Error parsing ComfyUI progress: {e}")
    
    def modify_workflow(
        self,
        workflow: Dict[str, Any],
        positive_prompt: str = "",
        width: Optional[int] = None,
        height: Optional[int] = None,
        steps: Optional[int] = None,
        cfg: Optional[float] = None,
        seed: Optional[int] = None,
        shift: Optional[float] = None,
        use_image: bool = False,
        use_image_size: bool = False,
        image_filename: Optional[str] = None,
        mcnl_lora: bool = False,
        snofs_lora: bool = False,
        male_lora: bool = False
    ) -> Dict[str, Any]:
        """
        Modify workflow parameters for Qwen_Full (API).json workflow
        
        Args:
            workflow: The workflow dictionary
            positive_prompt: Positive prompt text
            width: Image width
            height: Image height
            steps: Number of sampling steps
            cfg: CFG scale
            seed: Random seed (None for random)
            shift: Shift parameter for ModelSamplingAuraFlow
            use_image: Whether to use image-to-image mode
            use_image_size: Whether to use the uploaded image's size
            image_filename: Name of uploaded image file
            mcnl_lora: Enable MCNL LoRA
            snofs_lora: Enable Snofs LoRA
            male_lora: Enable Male LoRA
            
        Returns:
            Modified workflow
        """
        # Create a copy to avoid modifying the original
        modified = json.loads(json.dumps(workflow))
        
        # Update positive prompt (node 45)
        if positive_prompt:
            modified["45"]["inputs"]["value"] = positive_prompt
        
        # Update dimensions (nodes 32=width, 31=height)
        if width is not None:
            modified["32"]["inputs"]["value"] = width
        if height is not None:
            modified["31"]["inputs"]["value"] = height
        
        # Update sampling parameters
        if steps is not None:
            modified["36"]["inputs"]["value"] = steps
        if cfg is not None:
            modified["39"]["inputs"]["value"] = cfg
        if shift is not None:
            modified["40"]["inputs"]["value"] = shift
        if seed is not None:
            modified["35"]["inputs"]["value"] = seed
        elif seed is None:
            # Generate random seed
            modified["35"]["inputs"]["value"] = random.randint(0, 2**32 - 1)
        
        # Update use_image (node 38)
        modified["38"]["inputs"]["value"] = use_image
        
        # Update use_image_size (node 34)
        modified["34"]["inputs"]["value"] = use_image_size
        
        # Update image filename (node 43). Some workflows require a valid image path
        # even in text-to-image mode. Provide a fallback to the default image.
        if not image_filename:
            # Default to the example.png image that comes with the workflow
            image_filename = "example.png"
        modified["43"]["inputs"]["image"] = image_filename
        
        # Update LoRA booleans (nodes 41=MCNL, 42=Snofs, 33=Male)
        modified["41"]["inputs"]["value"] = mcnl_lora
        modified["42"]["inputs"]["value"] = snofs_lora
        modified["33"]["inputs"]["value"] = male_lora
        
        return modified

    def unload_models(self) -> None:
        """Call ComfyUI to unload models (free VRAM/RAM caches)."""
        url = f"http://{self.server_address}/unload"
        if self.token:
            url += f"?token={self.token}"
        req = urllib.request.Request(url, method="POST")
        try:
            with urllib.request.urlopen(req) as response:
                # ComfyUI may return empty response; handle gracefully
                _ = response.read().decode("utf-8").strip()
        except urllib.error.URLError as e:
            # Log and continue; unloading failures shouldn't crash the app
            print(f"Error calling /unload: {e}")
        except Exception as e:
            print(f"Unexpected error unloading models: {e}")

    def clear_cache(self) -> None:
        """Call ComfyUI to clear caches via /free endpoint."""
        url = f"http://{self.server_address}/free"
        if self.token:
            url += f"?token={self.token}"
        req = urllib.request.Request(url, method="POST")
        try:
            with urllib.request.urlopen(req) as response:
                # ComfyUI /free often returns empty or non-JSON; just read and ignore
                _ = response.read().decode("utf-8").strip()
        except urllib.error.URLError as e:
            print(f"Error calling /free: {e}")
        except Exception as e:
            print(f"Unexpected error clearing cache: {e}")
    
    def generate_image(
        self,
        positive_prompt: str,
        width: int = 512,
        height: int = 1024,
        steps: int = 4,
        cfg: float = 1.0,
        seed: Optional[int] = None,
        shift: float = 3.0,
        use_image: bool = False,
        use_image_size: bool = False,
        image_filename: Optional[str] = None,
        mcnl_lora: bool = False,
        snofs_lora: bool = False,
        male_lora: bool = False,
        output_path: Optional[str] = None,
        wait: bool = True,
        progress_callback: Optional[Callable[[int, int], None]] = None
    ) -> Optional[str]:
        """
        Generate an image using the workflow
        
        Args:
            positive_prompt: Positive prompt text
            width: Image width
            height: Image height
            steps: Number of sampling steps
            cfg: CFG scale
            seed: Random seed (None for random)
            shift: Shift parameter for ModelSamplingAuraFlow
            use_image: Whether to use image-to-image mode
            use_image_size: Whether to use the uploaded image's size
            image_filename: Name of uploaded image file
            mcnl_lora: Enable MCNL LoRA
            snofs_lora: Enable Snofs LoRA
            male_lora: Enable Male LoRA
            output_path: Path to save the image (None to not save)
            wait: Whether to wait for completion
            progress_callback: Optional callback invoked as (current_step, total_steps)
            
        Returns:
            Path to saved image if output_path provided and wait=True, else None
        """
        # Load and modify workflow
        workflow = self.load_workflow()
        modified_workflow = self.modify_workflow(
            workflow,
            positive_prompt=positive_prompt,
            width=width,
            height=height,
            steps=steps,
            cfg=cfg,
            seed=seed,
            shift=shift,
            use_image=use_image,
            use_image_size=use_image_size,
            image_filename=image_filename,
            mcnl_lora=mcnl_lora,
            snofs_lora=snofs_lora,
            male_lora=male_lora
        )
        
        # Ensure the progress WebSocket is listening before we queue.
        self._start_ws_listener()

        # Queue the prompt
        response = self.queue_prompt(modified_workflow)
        prompt_id = response['prompt_id']
        print(f"Queued prompt: {prompt_id}")
        
        if not wait:
            return None
        
        # Wait for completion
        print("Waiting for generation to complete...")
        history = self.wait_for_completion(prompt_id, progress_callback=progress_callback)
        
        # Get the output images
        outputs = history['outputs']
        
        # Find SaveImage node output
        for node_id, node_output in outputs.items():
            if 'images' in node_output:
                for image in node_output['images']:
                    filename = image['filename']
                    subfolder = image.get('subfolder', '')
                    
                    if output_path:
                        # Move from ComfyUI output to our outputs folder (avoid duplication)
                        comfyui_output = self.output_dir
                        if subfolder:
                            comfyui_output = comfyui_output / subfolder
                        comfyui_output = comfyui_output / filename
                        
                        if comfyui_output.exists():
                            # Move file instead of downloading
                            Path(output_path).parent.mkdir(parents=True, exist_ok=True)
                            shutil.move(str(comfyui_output), output_path)
                            print(f"Image moved from {comfyui_output} to {output_path}")
                            return output_path
                        else:
                            print(f"[WARNING] ComfyUI output not found at {comfyui_output}, downloading instead")
                            # Fallback to download method
                            image_data = self.get_image(filename, subfolder)
                            with open(output_path, 'wb') as f:
                                f.write(image_data)
                            print(f"Image downloaded and saved to: {output_path}")
                            return output_path
                    else:
                        print(f"Image generated: {filename}")
        
        return None
    
    def generate_video(
        self,
        positive_prompt: str,
        image_filename: str,
        frames: int = 64,
        megapixels: float = 0.25,
        fps: int = 16,
        seed: Optional[int] = None,
        output_path: Optional[str] = None,
        wait: bool = True,
        nsfw: bool = False,
        progress_callback: Optional[Callable[[int, int], None]] = None
    ) -> Optional[str]:
        """
        Generate a video using the Wan2.2 I2V workflow
        
        Args:
            positive_prompt: Positive prompt text
            image_filename: Name of the source image file in ComfyUI input folder
            frames: Number of frames (length) to generate
            megapixels: Image scale in megapixels
            fps: Frames per second for output video
            seed: Random seed (None for random)
            output_path: Path to save the video (None to not save)
            wait: Whether to wait for completion
            nsfw: Use NSFW workflow (default: False)
            progress_callback: Optional callback invoked as (current_step, total_steps)
            
        Returns:
            Path to saved video if output_path provided and wait=True, else None
        """
        # Load appropriate workflow based on NSFW flag
        workflow_filename = self.workflow_video_nsfw if nsfw else self.workflow_video
        workflow = self.load_workflow(workflow_filename)
        print(f"[WORKFLOW] Using {'NSFW' if nsfw else 'standard'} video workflow: {workflow_filename}")
        
        # Generate random seed if not provided
        if seed is None:
            seed = random.randint(0, 2**32 - 1)
        
        # Modify workflow nodes based on Wan2.2 I2V (API).json structure:
        # - Node "97": LoadImage (class_type: LoadImage) - "image" input
        # - Node "116:93": CLIPTextEncode (class_type: CLIPTextEncode) - "text" input for positive prompt
        # - Node "116:98": WanImageToVideo (class_type: WanImageToVideo) - "length" input for frame count
        # - Node "116:116": ImageScaleToTotalPixels (class_type: ImageScaleToTotalPixels) - "megapixels" input
        # - Node "116:94": CreateVideo (class_type: CreateVideo) - "fps" input
        # - Node "116:86": KSamplerAdvanced (class_type: KSamplerAdvanced) - "noise_seed" input
        
        workflow["97"]["inputs"]["image"] = image_filename
        workflow["116:93"]["inputs"]["text"] = positive_prompt
        workflow["116:98"]["inputs"]["length"] = frames
        workflow["116:116"]["inputs"]["megapixels"] = megapixels
        workflow["116:94"]["inputs"]["fps"] = fps
        workflow["116:86"]["inputs"]["noise_seed"] = seed
        
        # Ensure the progress WebSocket is listening before we queue.
        self._start_ws_listener()

        # Queue the prompt
        response = self.queue_prompt(workflow)
        prompt_id = response['prompt_id']
        print(f"Queued video prompt: {prompt_id}")
        
        if not wait:
            return None
        
        # Wait for completion
        print("Waiting for video generation to complete...")
        history = self.wait_for_completion(prompt_id, progress_callback=progress_callback)
        
        # Get the output videos
        outputs = history['outputs']
        print(f"[DEBUG] History outputs: {outputs.keys()}")
        
        # Find video output - check multiple possible keys
        for node_id, node_output in outputs.items():
            print(f"[DEBUG] Node {node_id} output keys: {node_output.keys()}")
            
            # Check for various video output keys
            video_key = None
            if 'gifs' in node_output:
                video_key = 'gifs'
            elif 'videos' in node_output:
                video_key = 'videos'
            elif 'images' in node_output:  # Some workflows output videos as images
                video_key = 'images'
            
            if video_key:
                print(f"[DEBUG] Found video output in node {node_id} under key '{video_key}'")
                for video in node_output[video_key]:
                    filename = video['filename']
                    subfolder = video.get('subfolder', '')
                    print(f"[DEBUG] Video filename: {filename}, subfolder: {subfolder}")
                    
                    if output_path:
                        # Move from ComfyUI output to our outputs folder (avoid duplication)
                        comfyui_output = self.output_dir
                        if subfolder:
                            comfyui_output = comfyui_output / subfolder
                        comfyui_output = comfyui_output / filename
                        
                        if comfyui_output.exists():
                            # Move file instead of downloading
                            Path(output_path).parent.mkdir(parents=True, exist_ok=True)
                            shutil.move(str(comfyui_output), output_path)
                            print(f"Video moved from {comfyui_output} to {output_path}")
                            return output_path
                        else:
                            print(f"[WARNING] ComfyUI output not found at {comfyui_output}, downloading instead")
                            # Fallback to download method
                            video_data = self.get_image(filename, subfolder)
                            with open(output_path, 'wb') as f:
                                f.write(video_data)
                            print(f"Video downloaded and saved to: {output_path}")
                            return output_path
                    else:
                        print(f"Video generated: {filename}")
        
        print("[ERROR] No video output found in history!")
        return None
    
    def unload_models(self) -> bool:
        """
        Unload all models from memory (RAM/VRAM)
        
        Returns:
            True if successful, False otherwise
        """
        url = f"http://{self.server_address}/free"
        if self.token:
            url += f"?token={self.token}"
        
        data = json.dumps({"unload_models": True, "free_memory": True}).encode('utf-8')
        
        req = urllib.request.Request(
            url,
            data=data,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        
        try:
            with urllib.request.urlopen(req) as response:
                response_text = response.read().decode('utf-8').strip()
                # Some ComfyUI versions return empty response
                if response_text:
                    try:
                        result = json.loads(response_text)
                    except json.JSONDecodeError:
                        pass  # Empty or non-JSON response is OK
                print(f"Models unloaded and memory freed")
                return True
        except urllib.error.URLError as e:
            print(f"Error unloading models: {e}")
            return False
    
    def clear_cache(self) -> bool:
        """
        Clear cache and garbage collect
        
        Returns:
            True if successful, False otherwise
        """
        url = f"http://{self.server_address}/free"
        if self.token:
            url += f"?token={self.token}"
        
        data = json.dumps({"unload_models": False, "free_memory": True}).encode('utf-8')
        
        req = urllib.request.Request(
            url,
            data=data,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        
        try:
            with urllib.request.urlopen(req) as response:
                response_text = response.read().decode('utf-8').strip()
                # Some ComfyUI versions return empty response
                if response_text:
                    try:
                        result = json.loads(response_text)
                    except json.JSONDecodeError:
                        pass  # Empty or non-JSON response is OK
                print(f"Cache cleared")
                return True
        except urllib.error.URLError as e:
            print(f"Error clearing cache: {e}")
            return False
    
    def interrupt_processing(self) -> bool:
        """
        Interrupt current processing (emergency stop)
        
        Returns:
            True if successful, False otherwise
        """
        url = f"http://{self.server_address}/interrupt"
        if self.token:
            url += f"?token={self.token}"
        
        req = urllib.request.Request(url, method='POST')
        
        try:
            with urllib.request.urlopen(req) as response:
                print(f"Processing interrupted")
                return True
        except urllib.error.URLError as e:
            print(f"Error interrupting: {e}")
            return False
    
    def generate_tts(
        self,
        text: str,
        narrator_audio: str = "Holly.mp3",
        seed: Optional[int] = None,
        output_path: Optional[str] = None,
        wait: bool = True,
        temperature: float = 0.8,
        exaggeration: float = 0.5,
        cfg_weight: float = 0.5,
        max_chars: int = 100,
        silence_ms: int = 100,
        language: str = "English"
    ) -> Optional[str]:
        """
        Generate TTS audio using the ChatterBox workflow
        
        Args:
            text: Text to convert to speech
            narrator_audio: Name of the narrator audio file in ComfyUI input folder
            seed: Random seed (None for random)
            output_path: Path to save the audio (None to not save)
            wait: Whether to wait for completion
            temperature: Randomness (0-2, default 0.8)
            exaggeration: Voice expression (0-2, default 0.5)
            cfg_weight: Guidance strength (0-2, default 0.5)
            max_chars: Max characters per chunk (default 100)
            silence_ms: Silence between chunks in milliseconds (default 100)
            language: Output language (default "English")
            
        Returns:
            Path to saved audio if output_path provided and wait=True, else None
        """
        # Load TTS workflow (if exists in environment, otherwise skip TTS support)
        tts_workflow = os.getenv('WORKFLOW_TTS', 'TTSVibe (API).json')
        workflow = self.load_workflow(tts_workflow)
        
        # Generate random seed if not provided
        if seed is None:
            seed = random.randint(0, 2**32 - 1)
        
        # Modify workflow nodes based on TTSVibe (API).json structure with ChatterBox:
        # - Node "4": LoadAudio - "audio" input for narrator voice
        # - Node "38": PrimitiveStringMultiline - "value" input for text
        # - Node "43": UnifiedTTSTextNode - "seed", "max_chars_per_chunk", "silence_between_chunks_ms" inputs
        # - Node "63": ChatterBoxEngineNode - "language", "exaggeration", "temperature", "cfg_weight" inputs
        
        workflow["4"]["inputs"]["audio"] = narrator_audio
        workflow["38"]["inputs"]["value"] = text
        workflow["43"]["inputs"]["seed"] = seed
        workflow["43"]["inputs"]["max_chars_per_chunk"] = max_chars
        workflow["43"]["inputs"]["silence_between_chunks_ms"] = silence_ms
        
        # Update ChatterBox engine parameters
        workflow["63"]["inputs"]["language"] = language
        workflow["63"]["inputs"]["exaggeration"] = exaggeration
        workflow["63"]["inputs"]["temperature"] = temperature
        workflow["63"]["inputs"]["cfg_weight"] = cfg_weight
        
        # Queue the prompt
        response = self.queue_prompt(workflow)
        prompt_id = response['prompt_id']
        print(f"Queued TTS prompt: {prompt_id}")
        
        if not wait:
            return None
        
        # Wait for completion
        print("Waiting for TTS generation to complete...")
        history = self.wait_for_completion(prompt_id)
        
        # Get the output audio
        outputs = history['outputs']
        print(f"[DEBUG] TTS outputs: {outputs.keys()}")
        
        # Find audio output - typically from SaveAudioMP3 node
        for node_id, node_output in outputs.items():
            print(f"[DEBUG] Node {node_id} output keys: {node_output.keys()}")
            
            # Check for audio output
            if 'audio' in node_output:
                for audio in node_output['audio']:
                    filename = audio['filename']
                    subfolder = audio.get('subfolder', '')
                    print(f"[DEBUG] Audio filename: {filename}, subfolder: {subfolder}")
                    
                    if output_path:
                        # Move from ComfyUI output to our outputs folder (avoid duplication)
                        comfyui_output = self.output_dir
                        if subfolder:
                            comfyui_output = comfyui_output / subfolder
                        comfyui_output = comfyui_output / filename
                        
                        if comfyui_output.exists():
                            # Move file instead of downloading
                            Path(output_path).parent.mkdir(parents=True, exist_ok=True)
                            shutil.move(str(comfyui_output), output_path)
                            print(f"Audio moved from {comfyui_output} to {output_path}")
                            return output_path
                        else:
                            print(f"[WARNING] ComfyUI output not found at {comfyui_output}, downloading instead")
                            # Fallback to download method
                            audio_data = self.get_image(filename, subfolder)
                            with open(output_path, 'wb') as f:
                                f.write(audio_data)
                            print(f"Audio downloaded and saved to: {output_path}")
                            return output_path
                    else:
                        print(f"Audio generated: {filename}")
        
        print("[ERROR] No audio output found in history!")
        return None


def main():
    """Example usage"""
    # Initialize client with optional token
    # If ComfyUI has password protection, set token parameter
    client = ComfyUIClient(server_address="127.0.0.1:8188", token=None)
    
    # Generate an image
    client.generate_image(
        positive_prompt="a beautiful landscape with mountains and a lake at sunset",
        width=512,
        height=1024,
        steps=4,
        cfg=1.0,
        output_path="output_image.png"
    )


if __name__ == "__main__":
    main()


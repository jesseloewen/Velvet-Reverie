"""
ChatterBox TTS Client
Manages a chatterbox_server.py subprocess (FastAPI + uvicorn) and communicates
with it over a local HTTP REST API. Replaces the previous Gradio-based implementation.

The subprocess is started lazily on first use and can be stopped explicitly.
The public interface (method names / signatures) is preserved so app.py needs
no changes.
"""

from __future__ import annotations

import os
import random
import shutil
import signal
import subprocess
import sys
import time
import traceback
from pathlib import Path
from typing import Literal, Optional

import requests


# ── Constants ─────────────────────────────────────────────────────────────────

# How long (seconds) to wait for the subprocess to become healthy after launch
_SERVER_STARTUP_TIMEOUT = 60

# How long (seconds) to wait between health-check polls during startup
_SERVER_POLL_INTERVAL = 1.0

# Engine name mapping: public API name -> internal server name
_ENGINE_DISPLAY_TO_INTERNAL: dict[str, str] = {
    "ChatterboxTTS":         "standard",
    "Chatterbox Multilingual": "multilingual",
    "Chatterbox Turbo":      "turbo",
}


# ── Client class ──────────────────────────────────────────────────────────────

class GradioTTSClient:
    """
    Drop-in replacement for the old Gradio-based TTS client.

    Internally it starts (and stops) a chatterbox_server.py subprocess and
    speaks to it over a local FastAPI REST endpoint.
    """

    def __init__(
        self,
        server_address: str = "127.0.0.1:8765",
        output_dir: Optional[str] = None,  # kept for API compatibility, no longer used
    ) -> None:
        """
        Args:
            server_address: host:port the subprocess will bind to.
                            Defaults to 127.0.0.1:8765.
            output_dir: Unused – kept for backwards compatibility with app.py.
        """
        host, _, port_str = server_address.partition(":")
        self.host: str = host or "127.0.0.1"
        self.port: int = int(port_str) if port_str else 8765
        self.base_url: str = f"http://{self.host}:{self.port}"

        # Path to the server script (same directory as this file)
        self._server_script: Path = Path(__file__).parent / "chatterbox_server.py"

        # Python interpreter to use – prefer the venv that owns this file
        self._python: str = sys.executable

        self._process: Optional[subprocess.Popen] = None
        self.current_engine: Optional[str] = None  # internal name: standard / multilingual / turbo

    # ── Subprocess lifecycle ──────────────────────────────────────────────────

    def _kill_port_orphan(self) -> None:
        """Kill any process already listening on our port (stale from a prior run)."""
        try:
            result = subprocess.run(
                ["lsof", "-t", f"-i:{self.port}"],
                capture_output=True, text=True,
            )
            for pid_str in result.stdout.split():
                try:
                    pid = int(pid_str.strip())
                    os.kill(pid, signal.SIGKILL)
                    print(f"[CHATTERBOX TTS] Killed orphaned process {pid} on port {self.port}")
                except (ValueError, ProcessLookupError, PermissionError):
                    pass
            if result.stdout.strip():
                time.sleep(1)  # give the kernel a moment to release the port
        except FileNotFoundError:
            pass  # lsof not available

    def _start_server(self) -> bool:
        """Launch chatterbox_server.py as a subprocess. Returns True on success."""
        # Kill any orphaned server from a previous Flask run so we own the port
        self._kill_port_orphan()

        if not self._server_script.exists():
            print(f"[CHATTERBOX TTS] Server script not found: {self._server_script}")
            return False

        cmd = [
            self._python,
            str(self._server_script),
            "--host", self.host,
            "--port", str(self.port),
        ]

        print(f"[CHATTERBOX TTS] Starting server: {' '.join(cmd)}")

        try:
            self._process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                # Give the child its own process group so we can kill the tree
                start_new_session=True,
            )
        except Exception as exc:
            print(f"[CHATTERBOX TTS] Failed to start server process: {exc}")
            return False

        # Stream server output to our stdout in a background thread
        import threading

        def _pipe_output(proc: subprocess.Popen) -> None:
            for line in proc.stdout:  # type: ignore[union-attr]
                print(f"[CHATTERBOX SERVER] {line}", end="")

        threading.Thread(target=_pipe_output, args=(self._process,), daemon=True).start()

        # Wait until the /health endpoint responds
        deadline = time.time() + _SERVER_STARTUP_TIMEOUT
        while time.time() < deadline:
            if self._process.poll() is not None:
                print("[CHATTERBOX TTS] Server process exited prematurely")
                return False
            if self._is_server_running():
                print(f"[CHATTERBOX TTS] Server ready at {self.base_url}")
                return True
            time.sleep(_SERVER_POLL_INTERVAL)

        print("[CHATTERBOX TTS] Timed out waiting for server to start")
        self.stop_server()
        return False

    def stop_server(self) -> None:
        """Terminate the subprocess cleanly."""
        if self._process is None:
            return
        print("[CHATTERBOX TTS] Stopping server …")
        try:
            # Try graceful SIGTERM first
            os.killpg(os.getpgid(self._process.pid), signal.SIGTERM)
            try:
                self._process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(os.getpgid(self._process.pid), signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            # Process already gone
            pass
        except AttributeError:
            # os.killpg / os.getpgid not available (Windows)
            self._process.terminate()
            try:
                self._process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self._process.kill()
        finally:
            self._process = None
            self.current_engine = None
            print("[CHATTERBOX TTS] Server stopped")

    def _is_server_running(self) -> bool:
        """Return True if the /health endpoint responds successfully."""
        try:
            resp = requests.get(f"{self.base_url}/health", timeout=2)
            return resp.status_code == 200
        except Exception:
            return False

    def _ensure_server(self) -> bool:
        """Make sure the subprocess is up; start it if not. Returns True on success."""
        # If we own the process and it's healthy, reuse it
        if self._process is not None and self._process.poll() is None and self._is_server_running():
            return True
        # Otherwise (no process, process died, or foreign server) start fresh
        return self._start_server()

    # ── Engine management (mirrors old Gradio API) ────────────────────────────

    def load_engine(
        self,
        engine: Literal["standard", "multilingual", "turbo"] = "standard",
    ) -> bool:
        """
        Ask the server to load a ChatterBox engine variant.

        Args:
            engine: 'standard' | 'multilingual' | 'turbo'

        Returns:
            True on success, False on failure.
        """
        if not self._ensure_server():
            print(f"[CHATTERBOX TTS] Cannot load engine – server not available")
            return False

        try:
            print(f"[CHATTERBOX TTS] Loading engine '{engine}' …")
            resp = requests.post(
                f"{self.base_url}/load",
                json={"engine": engine},
                timeout=300,  # model downloads can take a while
            )
            resp.raise_for_status()
            self.current_engine = engine
            print(f"[CHATTERBOX TTS] Engine '{engine}' loaded")
            return True
        except Exception as exc:
            print(f"[CHATTERBOX TTS] Failed to load engine '{engine}': {exc}")
            return False

    def unload_engine(
        self,
        engine: Optional[Literal["standard", "multilingual", "turbo"]] = None,
    ) -> bool:
        """
        Ask the server to unload an engine (defaults to the currently loaded one).

        Args:
            engine: Engine to unload, or None to unload whatever is currently loaded.

        Returns:
            True on success, False on failure.
        """
        if not self._is_server_running():
            # Server isn't running – nothing to unload
            self.current_engine = None
            return True
        
        target = engine or self.current_engine
        if target is None:
            print("[CHATTERBOX TTS] No engine to unload")
            return True

        try:
            print(f"[CHATTERBOX TTS] Unloading engine '{target}' …")
            resp = requests.post(
                f"{self.base_url}/unload",
                json={"engine": target},
                timeout=30,
            )
            resp.raise_for_status()
            if target == self.current_engine:
                self.current_engine = None
            print(f"[CHATTERBOX TTS] Engine '{target}' unloaded")
            return True
        except Exception as exc:
            print(f"[CHATTERBOX TTS] Failed to unload engine '{target}': {exc}")
            return False
    
    def unload_all_engines(self) -> bool:
        """Unload all engines and release GPU memory."""
        if not self._is_server_running():
            self.current_engine = None
            return True

        try:
            resp = requests.post(
                f"{self.base_url}/unload",
                json={"engine": None},
                timeout=30,
            )
            resp.raise_for_status()
        except Exception as exc:
            print(f"[CHATTERBOX TTS] Error unloading all engines: {exc}")

        self.current_engine = None
        return True

    # ── Generation ────────────────────────────────────────────────────────────

    def generate_tts(
        self,
        text: str,
        ref_audio_path: str,
        engine: str = "ChatterboxTTS",
        audio_format: Literal["wav", "mp3"] = "wav",
        exaggeration: float = 0.5,
        temperature: float = 0.8,
        cfg_weight: float = 0.5,
        chunk_size: int = 300,          # kept for API compatibility, not used
        seed: Optional[int] = None,
        language: str = "en",           # kept for API compatibility
        repetition_penalty: float = 2.0, # kept for API compatibility
        emotion_description: str = "",  # kept for API compatibility
        output_path: Optional[str] = None,
        skip_cleanup: bool = False,      # kept for API compatibility, no-op
    ) -> Optional[str]:
        """
        Generate TTS audio using the ChatterBox subprocess API.

        Args:
            text:             Text to synthesise.
            ref_audio_path:   Absolute path to reference audio (3-10 s WAV/MP3).
            engine:           Display name – 'ChatterboxTTS', 'Chatterbox Multilingual',
                              or 'Chatterbox Turbo'.
            audio_format:     'wav' or 'mp3'.
            exaggeration:     Emotion exaggeration (0-2).
            temperature:      Sampling temperature (0-2).
            cfg_weight:       CFG weight (0-2).
            chunk_size:       (Ignored – kept for backwards compatibility.)
            seed:             Random seed; None / 0 picks a random seed.
            language:         (Ignored – kept for backwards compatibility.)
            repetition_penalty: (Ignored – kept for backwards compatibility.)
            emotion_description: (Ignored – kept for backwards compatibility.)
            output_path:      Where to save the result. If None the audio bytes
                              are written to a temp file and its path is returned.
            skip_cleanup:     (Ignored – no longer needed.)

        Returns:
            Path string to the generated audio file, or None on failure.
        """
        # Resolve internal engine name
        internal_engine = _ENGINE_DISPLAY_TO_INTERNAL.get(engine, "standard")

        # Ensure seed is set
        if not seed:
            seed = random.randint(1, 2 ** 31 - 1)

        # Validate reference audio
        ref_path = Path(ref_audio_path)
        if not ref_path.exists():
            print(f"[CHATTERBOX TTS] Reference audio not found: {ref_audio_path}")
            return None
        
        # Ensure the server is running
        if not self._ensure_server():
            print("[CHATTERBOX TTS] Server unavailable – cannot generate")
            return None

        print(f"[CHATTERBOX TTS] Generating | engine={internal_engine} seed={seed}")
        print(f"[CHATTERBOX TTS] Text  : {text[:80]}{'…' if len(text) > 80 else ''}")
        print(f"[CHATTERBOX TTS] RefAudio: {ref_audio_path}")

        try:
            resp = requests.post(
                f"{self.base_url}/generate",
                json={
                    "text":           text,
                    "ref_audio_path": str(ref_path.resolve()),
                    "engine":         internal_engine,
                    "audio_format":   audio_format,
                    "exaggeration":   exaggeration,
                    "temperature":    temperature,
                    "cfg_weight":     cfg_weight,
                    "seed":           seed,
                    "language":       language,
                },
                timeout=600,  # long text can take time
            )
            resp.raise_for_status()
        except requests.HTTPError as exc:
            detail = ""
            try:
                detail = exc.response.json().get("detail", "")
            except Exception:
                pass
            print(f"[CHATTERBOX TTS] Generation HTTP error: {exc} – {detail}")
            traceback.print_exc()
            return None
        except Exception as exc:
            print(f"[CHATTERBOX TTS] Generation request failed: {exc}")
            traceback.print_exc()
            return None

        # Write audio bytes to the destination path
        audio_bytes = resp.content
        ext = audio_format if audio_format in ("wav", "mp3") else "wav"

        if output_path:
            dest = Path(output_path)
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(audio_bytes)
            print(f"[CHATTERBOX TTS] Saved {len(audio_bytes):,} bytes → {dest}")
            return str(dest)
        else:
            # Write to a temporary file
            import tempfile
            with tempfile.NamedTemporaryFile(
                suffix=f".{ext}", delete=False
            ) as tmp:
                tmp.write(audio_bytes)
                tmp_path = tmp.name
            print(f"[CHATTERBOX TTS] Saved {len(audio_bytes):,} bytes → {tmp_path} (temp)")
            return tmp_path

    # ── Cleanup (no-op stub kept for API compatibility) ───────────────────────

    def cleanup_output_folder(self) -> int:
        """
        No-op stub – kept for API compatibility with app.py.
        The old Gradio implementation cleaned up an external TTS Studio output
        folder; this implementation writes directly to the requested output_path
        so there is nothing extra to clean up.
        """
        return 0
    
    # ── Health check ─────────────────────────────────────────────────────────

    def health_check(self) -> bool:
        """Return True if the subprocess API is reachable."""
        if not self._is_server_running():
            # Try to start the server on demand
            return self._start_server()
        return True

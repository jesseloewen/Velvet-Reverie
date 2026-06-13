"""
ChatterBox TTS API Server
Self-contained FastAPI server that loads ChatterboxTTS and exposes a REST API.
Launched as a subprocess by GradioTTSClient (now ChatterboxTTSClient).

Endpoints:
  GET  /health                   - liveness check
  POST /load    {engine}         - load a model variant
  POST /unload  {engine?}        - unload a model variant (or current)
  POST /generate                 - synthesise speech, returns audio/wav bytes
"""

from __future__ import annotations

import argparse
import gc
import os
import sys
import random
import tempfile
import traceback
from pathlib import Path
from typing import Literal, Optional

# ── FastAPI / uvicorn ──────────────────────────────────────────────────────────
try:
    import uvicorn
    from fastapi import FastAPI, HTTPException
    from fastapi.responses import Response
    from pydantic import BaseModel
except ImportError as exc:
    sys.exit(f"[CHATTERBOX SERVER] Missing dependency: {exc}. Install: pip install fastapi uvicorn")

# ── PyTorch ────────────────────────────────────────────────────────────────────
try:
    import torch
    import torchaudio
except ImportError as exc:
    sys.exit(f"[CHATTERBOX SERVER] Missing dependency: {exc}. Install: pip install torch torchaudio")

# ── ChatterboxTTS ──────────────────────────────────────────────────────────────
try:
    from chatterbox.tts import ChatterboxTTS
except ImportError as exc:
    sys.exit(
        f"[CHATTERBOX SERVER] chatterbox-tts not installed: {exc}.\n"
        "Install: pip install chatterbox-tts"
    )

# ──────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="ChatterBox TTS API", version="1.0.0")

# Global state
_model: Optional[ChatterboxTTS] = None
_current_engine: Optional[str] = None  # "standard" | "multilingual" | "turbo"
_device: str = "cuda" if torch.cuda.is_available() else "cpu"

print(f"[CHATTERBOX SERVER] Using device: {_device}")


# ── Request / Response models ─────────────────────────────────────────────────

class LoadRequest(BaseModel):
    engine: Literal["standard", "multilingual", "turbo"] = "standard"


class UnloadRequest(BaseModel):
    engine: Optional[Literal["standard", "multilingual", "turbo"]] = None


class GenerateRequest(BaseModel):
    text: str
    ref_audio_path: str                         # Absolute path to .wav / .mp3
    engine: Literal["standard", "multilingual", "turbo"] = "standard"
    audio_format: Literal["wav", "mp3"] = "wav"
    exaggeration: float = 0.5
    temperature: float = 0.8
    cfg_weight: float = 0.5
    seed: Optional[int] = None
    language: str = "en"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_model(engine: str) -> None:
    """Load a ChatterboxTTS model variant into the global slot."""
    global _model, _current_engine

    if _current_engine == engine and _model is not None:
        print(f"[CHATTERBOX SERVER] Engine '{engine}' already loaded – skipping")
        return

    # Unload previous model to free VRAM before loading new one
    _unload_model_internal()

    print(f"[CHATTERBOX SERVER] Loading engine '{engine}' on {_device} …")

    # ChatterboxTTS.from_pretrained(device) takes only the device argument.
    # The library downloads a single hardcoded checkpoint (ResembleAI/chatterbox)
    # and caches it in the HuggingFace hub cache directory.
    try:
        _model = ChatterboxTTS.from_pretrained(_device)
        _current_engine = engine
        print(f"[CHATTERBOX SERVER] Engine '{engine}' loaded successfully")
    except Exception as exc:
        _model = None
        _current_engine = None
        raise RuntimeError(f"Failed to load engine '{engine}': {exc}") from exc


def _unload_model_internal() -> None:
    """Release the global model and flush GPU memory."""
    global _model, _current_engine
    if _model is not None:
        print(f"[CHATTERBOX SERVER] Unloading engine '{_current_engine}' …")
        del _model
        _model = None
        _current_engine = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        print("[CHATTERBOX SERVER] Model unloaded and memory released")


def _encode_audio(waveform: torch.Tensor, sample_rate: int, fmt: str) -> bytes:
    """Encode a waveform tensor to WAV or MP3 bytes.

    torchcodec (the torchaudio backend in newer versions) cannot write to a
    BytesIO object – it requires a real file path.  We therefore write to a
    temporary file and read the bytes back.
    """
    suffix = ".mp3" if fmt == "mp3" else ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = tmp.name

    try:
        if fmt == "mp3":
            try:
                torchaudio.save(tmp_path, waveform.cpu(), sample_rate, format="mp3")
            except Exception:
                # Fallback: save as WAV if MP3 backend unavailable
                torchaudio.save(tmp_path, waveform.cpu(), sample_rate, format="wav")
        else:
            torchaudio.save(tmp_path, waveform.cpu(), sample_rate, format="wav")

        with open(tmp_path, "rb") as f:
            return f.read()
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "device": _device,
        "loaded_engine": _current_engine,
    }


@app.post("/load")
def load_engine(req: LoadRequest):
    try:
        _load_model(req.engine)
        return {"success": True, "engine": req.engine, "device": _device}
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/unload")
def unload_engine(req: UnloadRequest):
    global _current_engine
    target = req.engine or _current_engine
    if target is None:
        return {"success": True, "message": "No engine loaded"}
    _unload_model_internal()
    return {"success": True, "unloaded": target}


@app.post("/generate")
def generate(req: GenerateRequest):
    global _model, _current_engine

    # ── Auto-load the requested engine if not already loaded ──────────────────
    if _model is None or _current_engine != req.engine:
        try:
            _load_model(req.engine)
        except Exception as exc:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Failed to load engine: {exc}")

    # ── Validate reference audio ───────────────────────────────────────────────
    ref_path = Path(req.ref_audio_path)
    if not ref_path.exists():
        raise HTTPException(
            status_code=400,
            detail=f"Reference audio not found: {req.ref_audio_path}"
        )

    # ── Seed ──────────────────────────────────────────────────────────────────
    seed = req.seed
    if not seed:
        seed = random.randint(1, 2**31 - 1)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

    print(f"[CHATTERBOX SERVER] Generating | engine={req.engine} seed={seed}")
    print(f"[CHATTERBOX SERVER] Text: {req.text[:80]}{'…' if len(req.text) > 80 else ''}")

    try:
        # ── Generate waveform ─────────────────────────────────────────────────
        wav = _model.generate(
            req.text,
            audio_prompt_path=str(ref_path),
            exaggeration=req.exaggeration,
            temperature=req.temperature,
            cfg_weight=req.cfg_weight,
        )

        # wav may be a Tensor [1, T] or [T]; normalise to [1, T]
        if wav.dim() == 1:
            wav = wav.unsqueeze(0)

        sample_rate = _model.sr  # typically 24000

        audio_bytes = _encode_audio(wav, sample_rate, req.audio_format)

        mime = "audio/mpeg" if req.audio_format == "mp3" else "audio/wav"
        print(f"[CHATTERBOX SERVER] Generated {len(audio_bytes):,} bytes ({req.audio_format})")
        return Response(content=audio_bytes, media_type=mime)

    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Generation failed: {exc}")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ChatterBox TTS API Server")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8765, help="Bind port (default: 8765)")
    parser.add_argument(
        "--preload", choices=["standard", "multilingual", "turbo"], default=None,
        help="Pre-load a model at startup instead of on first request"
    )
    args = parser.parse_args()

    if args.preload:
        try:
            _load_model(args.preload)
        except Exception as exc:
            print(f"[CHATTERBOX SERVER] Pre-load failed: {exc}")

    print(f"[CHATTERBOX SERVER] Starting on http://{args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")

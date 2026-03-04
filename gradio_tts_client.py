"""
Gradio TTS Client for ChatterBox TTS API
Uses gradio_client to interface with ChatterBox voice cloning and TTS engines
"""

from gradio_client import Client, handle_file
from pathlib import Path
from typing import Optional, Literal
import random

class GradioTTSClient:
    """Client for interfacing with ChatterBox TTS Gradio API"""
    
    def __init__(self, server_address: str = "127.0.0.1:7860", output_dir: Optional[str] = None):
        """
        Initialize Gradio TTS client
        
        Args:
            server_address: Address of Gradio server (default: 127.0.0.1:7860)
            output_dir: Gradio TTS output directory path (default: ../Ultimate-TTS-Studio.git/app/outputs)
        """
        self.server_address = server_address
        self.base_url = f"http://{server_address}/"
        self.client = None
        self.current_engine = None  # Track loaded engine
        self.output_dir = Path(output_dir) if output_dir else Path('..') / 'Ultimate-TTS-Studio.git' / 'app' / 'outputs'
        
    def connect(self):
        """Connect to Gradio server"""
        try:
            self.client = Client(self.base_url)
            print(f"[GRADIO TTS] Connected to {self.base_url}")
            return True
        except Exception as e:
            print(f"[GRADIO TTS] Connection failed: {e}")
            return False
    
    def _ensure_connected(self):
        """Ensure client is connected, reconnect if needed"""
        if self.client is None:
            self.connect()
    
    def load_engine(self, engine: Literal["standard", "multilingual", "turbo"] = "standard") -> bool:
        """
        Load specific ChatterBox engine
        
        Args:
            engine: Engine type - 'standard', 'multilingual', or 'turbo'
            
        Returns:
            True if successful, False otherwise
        """
        self._ensure_connected()
        
        try:
            if engine == "standard":
                print("[GRADIO TTS] Loading ChatterBox (Standard)...")
                self.client.predict(api_name="/handle_load_chatterbox")
                self.current_engine = "standard"
            elif engine == "multilingual":
                print("[GRADIO TTS] Loading ChatterBox Multilingual...")
                self.client.predict(api_name="/handle_load_chatterbox_multilingual")
                self.current_engine = "multilingual"
            elif engine == "turbo":
                print("[GRADIO TTS] Loading ChatterBox Turbo...")
                self.client.predict(api_name="/handle_load_chatterbox_turbo")
                self.current_engine = "turbo"
            else:
                raise ValueError(f"Unknown engine type: {engine}")
            
            print(f"[GRADIO TTS] Engine '{engine}' loaded successfully")
            return True
        except Exception as e:
            print(f"[GRADIO TTS] Failed to load engine '{engine}': {e}")
            return False
    
    def unload_engine(self, engine: Optional[Literal["standard", "multilingual", "turbo"]] = None) -> bool:
        """
        Unload specific ChatterBox engine (or current engine if not specified)
        
        Args:
            engine: Engine type to unload, or None to unload current engine
            
        Returns:
            True if successful, False otherwise
        """
        self._ensure_connected()
        
        # If no engine specified, unload current engine
        if engine is None:
            engine = self.current_engine
        
        if engine is None:
            print("[GRADIO TTS] No engine to unload")
            return True
        
        try:
            if engine == "standard":
                print("[GRADIO TTS] Unloading ChatterBox (Standard)...")
                self.client.predict(api_name="/handle_unload_chatterbox")
            elif engine == "multilingual":
                print("[GRADIO TTS] Unloading ChatterBox Multilingual...")
                self.client.predict(api_name="/handle_unload_chatterbox_multilingual")
            elif engine == "turbo":
                print("[GRADIO TTS] Unloading ChatterBox Turbo...")
                self.client.predict(api_name="/handle_unload_chatterbox_turbo")
            else:
                print(f"[GRADIO TTS] Unknown engine type: {engine}")
                return False
            
            if engine == self.current_engine:
                self.current_engine = None
            
            print(f"[GRADIO TTS] Engine '{engine}' unloaded successfully")
            return True
        except Exception as e:
            print(f"[GRADIO TTS] Failed to unload engine '{engine}': {e}")
            return False
    
    def unload_all_engines(self) -> bool:
        """Unload all possible engines"""
        self._ensure_connected()
        
        success = True
        for engine in ["standard", "multilingual", "turbo"]:
            try:
                self.unload_engine(engine)
            except Exception as e:
                print(f"[GRADIO TTS] Error unloading {engine}: {e}")
                success = False
        
        self.current_engine = None
        return success
    
    def generate_tts(
        self,
        text: str,
        ref_audio_path: str,
        engine: Literal["ChatterboxTTS", "Chatterbox Multilingual", "Chatterbox Turbo"] = "ChatterboxTTS",
        audio_format: Literal["wav", "mp3"] = "wav",
        exaggeration: float = 0.5,
        temperature: float = 0.8,
        cfg_weight: float = 0.5,
        chunk_size: int = 300,
        seed: Optional[int] = None,
        language: str = "en",
        repetition_penalty: float = 2.0,
        emotion_description: str = "",
        output_path: Optional[str] = None
    ) -> Optional[str]:
        """
        Generate TTS audio using ChatterBox
        
        Args:
            text: Text to convert to speech
            ref_audio_path: Path to reference audio file for voice cloning (3-10 seconds)
            engine: TTS engine to use
            audio_format: Output format ('wav' or 'mp3')
            exaggeration: Voice style intensity (0-2, default 0.5)
            temperature: Randomness level (0-2, default 0.8, higher = more expressive)
            cfg_weight: Classifier-Free Guidance weight (0-2, default 0.5)
            chunk_size: Max characters per chunk (default 300)
            seed: Random seed for reproducibility (0 = random)
            language: Language code for multilingual engine (e.g., 'en', 'zh', 'fr')
            repetition_penalty: Repetition penalty for multilingual (default 2.0)
            emotion_description: Emotion/style description for TTS v2 (optional, default "")
            output_path: Path to save output file (if None, file is not moved)
            
        Returns:
            Path to generated audio file, or None on failure
        """
        self._ensure_connected()
        
        # Generate random seed if not provided or if 0
        if seed is None or seed == 0:
            seed = random.randint(1, 2**31 - 1)
        
        # Ensure reference audio path exists
        ref_audio = Path(ref_audio_path)
        if not ref_audio.exists():
            print(f"[GRADIO TTS] Reference audio not found: {ref_audio_path}")
            return None
        
        try:
            print(f"[GRADIO TTS] Generating TTS with engine: {engine}")
            print(f"[GRADIO TTS] Text: {text[:50]}...")
            print(f"[GRADIO TTS] Reference audio: {ref_audio_path}")
            print(f"[GRADIO TTS] Seed: {seed}")
            
            # Prepare parameters based on engine
            if engine == "Chatterbox Multilingual":
                # Multilingual engine uses different reference audio parameter
                result = self.client.predict(
                    text_input=text,
                    tts_engine=engine,
                    audio_format=audio_format,
                    # Standard Chatterbox parameters (set to None/defaults)
                    chatterbox_ref_audio=None,
                    chatterbox_exaggeration=0.5,
                    chatterbox_temperature=0.8,
                    chatterbox_cfg_weight=0.5,
                    chatterbox_chunk_size=300,
                    chatterbox_seed=0,
                    # Multilingual specific parameters
                    chatterbox_mtl_ref_audio=handle_file(str(ref_audio)),
                    chatterbox_mtl_language=language,
                    chatterbox_mtl_repetition_penalty=repetition_penalty,
                    # chTTS v2 parameters
                    indextts2_emotion_description=emotion_description,
                    # Higgs parameters (not used for Chatterbox)
                    higgs_system_prompt=None,
                    # Qwen parameters (not used for Chatterbox)
                    qwen_voice_description=None,
                    qwen_ref_text=None,
                    qwen_style_instruct=None,
                    # Audio post-processing (disabled)
                    gain_db=0,
                    enable_eq=False,
                    enable_reverb=False,
                    api_name="/generate_unified_tts"
                )
            else:
                # Standard or Turbo engine
                result = self.client.predict(
                    text_input=text,
                    tts_engine=engine,
                    audio_format=audio_format,
                    # Standard Chatterbox parameters
                    chatterbox_ref_audio=handle_file(str(ref_audio)),
                    chatterbox_exaggeration=exaggeration,
                    chatterbox_temperature=temperature,
                    chatterbox_cfg_weight=cfg_weight,
                    chatterbox_chunk_size=chunk_size,
                    chatterbox_seed=seed,
                    # Multilingual specific parameters (set to None/defaults)
                    chatterbox_mtl_ref_audio=None,
                    chatterbox_mtl_language="en",
                    chatterbox_mtl_repetition_penalty=2.0,
                    # chTTS v2 parameters
                    indextts2_emotion_description=emotion_description,
                    # Higgs parameters (not used for Chatterbox)
                    higgs_system_prompt=None,
                    # Qwen parameters (not used for Chatterbox)
                    qwen_voice_description=None,
                    qwen_ref_text=None,
                    qwen_style_instruct=None,
                    # Audio post-processing (disabled)
                    gain_db=0,
                    enable_eq=False,
                    enable_reverb=False,
                    api_name="/generate_unified_tts"
                )
            
            # Result is a tuple, first element is the audio file path
            if result and len(result) > 0:
                generated_file = result[0]
                print(f"[GRADIO TTS] Generated audio: {generated_file}")
                
                # Move to output path if specified (deletes source file like image/video generation)
                if output_path:
                    import shutil
                    import glob
                    output = Path(output_path)
                    output.parent.mkdir(parents=True, exist_ok=True)
                    
                    # Move file instead of copying (matches ComfyUI image/video pattern)
                    shutil.move(generated_file, output)
                    print(f"[GRADIO TTS] Audio moved from {generated_file} to {output_path}")
                    
                    # Cleanup Ultimate-TTS-Studio outputs folder (delete all generated audio files)
                    # This matches the ComfyUI pattern where output folder is cleaned after moving files
                    try:
                        if self.output_dir.exists() and self.output_dir.is_dir():
                            # Delete all audio files in the outputs folder
                            deleted_count = 0
                            for audio_file in self.output_dir.glob('*.wav'):
                                try:
                                    audio_file.unlink()
                                    deleted_count += 1
                                except Exception as e:
                                    print(f"[GRADIO TTS] Could not delete {audio_file.name}: {e}")
                            for audio_file in self.output_dir.glob('*.mp3'):
                                try:
                                    audio_file.unlink()
                                    deleted_count += 1
                                except Exception as e:
                                    print(f"[GRADIO TTS] Could not delete {audio_file.name}: {e}")
                            
                            if deleted_count > 0:
                                print(f"[GRADIO TTS] Cleaned up {deleted_count} audio file(s) from TTS Studio outputs folder")
                    except Exception as e:
                        print(f"[GRADIO TTS] Note: Could not cleanup TTS Studio outputs: {e}")
                    
                    return str(output)
                
                return generated_file
            else:
                print("[GRADIO TTS] No output returned from API")
                return None
                
        except Exception as e:
            print(f"[GRADIO TTS] Generation failed: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def health_check(self) -> bool:
        """Check if Gradio TTS server is accessible"""
        try:
            self._ensure_connected()
            return self.client is not None
        except Exception as e:
            print(f"[GRADIO TTS] Health check failed: {e}")
            return False

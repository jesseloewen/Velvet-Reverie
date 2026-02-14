"""
Ollama Chat Client
Interact with Ollama API for chat functionality
"""

import json
import urllib.request
import urllib.parse
import urllib.error
from typing import Optional, Dict, Any, List, Generator


class OllamaClient:
    def __init__(self, server_address: str = "127.0.0.1:11434"):
        """
        Initialize Ollama client
        
        Args:
            server_address: Ollama server address (default: 127.0.0.1:11434)
        """
        self.server_address = server_address
        self.base_url = f"http://{server_address}"
        
    def health_check(self) -> bool:
        """
        Check if Ollama server is running
        
        Returns:
            True if server is running, False otherwise
        """
        try:
            req = urllib.request.Request(f"{self.base_url}/api/tags")
            with urllib.request.urlopen(req, timeout=5) as response:
                return response.status == 200
        except Exception as e:
            print(f"Ollama health check failed: {e}")
            return False
    
    def list_models(self) -> List[Dict[str, Any]]:
        """
        List all available models
        
        Returns:
            List of model information dictionaries
        """
        try:
            req = urllib.request.Request(f"{self.base_url}/api/tags")
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode('utf-8'))
                return data.get('models', [])
        except Exception as e:
            print(f"Failed to list models: {e}")
            return []
    
    def chat(self, 
             model: str, 
             messages: List[Dict[str, str]], 
             system: Optional[str] = None,
             temperature: float = 0.7,
             top_p: float = 0.9,
             top_k: int = 40,
             repeat_penalty: float = 1.1,
             num_ctx: int = 2048,
             seed: Optional[int] = None,
             stream: bool = False,
             keep_alive: int = -1) -> Generator[str, None, None]:
        """
        Send a chat request to Ollama
        
        Args:
            model: Model name (e.g., 'llama3.2', 'qwen2.5')
            messages: List of message dicts with 'role' and 'content'
            system: System prompt/instructions
            temperature: Temperature for generation (0.0 to 2.0)
            top_p: Top-p sampling (0.0 to 1.0)
            top_k: Top-k sampling
            repeat_penalty: Repeat penalty (1.0 = no penalty)
            num_ctx: Context window size
            seed: Random seed for reproducibility (None = random)
            stream: Whether to stream response
            keep_alive: Duration to keep model loaded (-1 = indefinitely, 0 = unload immediately)
            
        Yields:
            Response content chunks if streaming, else single response
        """
        payload = {
            "model": model,
            "messages": messages,
            "stream": stream,
            "keep_alive": keep_alive,
            "options": {
                "temperature": temperature,
                "top_p": top_p,
                "top_k": top_k,
                "repeat_penalty": repeat_penalty,
                "num_ctx": num_ctx
            }
        }
        
        # Add seed if provided
        if seed is not None:
            payload["options"]["seed"] = seed
        
        # Note: System prompt should be first message in messages array with role='system'
        # The 'system' parameter is deprecated in newer Ollama versions
        
        data = json.dumps(payload).encode('utf-8')
        
        print(f"[OLLAMA] Sending chat request to model: {model}")
        print(f"[OLLAMA] Messages count: {len(messages)}")
        print(f"[OLLAMA] Stream mode: {stream}")
        
        try:
            req = urllib.request.Request(
                f"{self.base_url}/api/chat",
                data=data,
                headers={'Content-Type': 'application/json'}
            )
            
            with urllib.request.urlopen(req, timeout=300) as response:
                if stream:
                    # Stream response line by line
                    for line in response:
                        if line:
                            chunk = json.loads(line.decode('utf-8'))
                            if 'message' in chunk and 'content' in chunk['message']:
                                yield chunk['message']['content']
                            if chunk.get('done', False):
                                break
                else:
                    # Single response
                    result = json.loads(response.read().decode('utf-8'))
                    if 'message' in result and 'content' in result['message']:
                        yield result['message']['content']
        
        except urllib.error.HTTPError as e:
            error_msg = f"HTTP Error {e.code}: {e.reason}"
            error_details = ""
            try:
                error_body = e.read().decode('utf-8')
                error_data = json.loads(error_body)
                if 'error' in error_data:
                    error_details = error_data['error']
                else:
                    error_details = error_body
            except:
                try:
                    error_details = e.read().decode('utf-8')
                except:
                    pass
            
            full_error = f"{error_msg}"
            if error_details:
                full_error += f" - {error_details}"
            
            print(f"[OLLAMA] HTTP Error: {full_error}")
            print(f"[OLLAMA] Model attempted: {model}")
            print(f"[OLLAMA] Hint: Check if model is properly pulled with 'ollama pull {model}'")
            yield f"Error communicating with Ollama: {full_error}"
        
        except urllib.error.URLError as e:
            error_msg = f"Connection error: {e.reason}"
            print(f"[OLLAMA] URL Error: {error_msg}")
            print(f"[OLLAMA] Hint: Is Ollama server running? Check with 'ollama list'")
            yield f"Cannot connect to Ollama server: {error_msg}"
        
        except Exception as e:
            print(f"[OLLAMA] Unexpected error: {type(e).__name__}: {e}")
            print(f"[OLLAMA] Model: {model}")
            yield f"Unexpected error: {str(e)}"
    
    def generate(self, 
                 model: str, 
                 prompt: str,
                 system: Optional[str] = None,
                 temperature: float = 0.7,
                 stream: bool = False,
                 keep_alive: int = -1) -> Generator[str, None, None]:
        """
        Simple generate endpoint (non-chat)
        
        Args:
            model: Model name
            prompt: Text prompt
            system: System prompt
            temperature: Temperature for generation
            stream: Whether to stream response
            keep_alive: Duration to keep model loaded (-1 = indefinitely, 0 = unload immediately)
            
        Yields:
            Response text chunks
        """
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": stream,
            "keep_alive": keep_alive,
            "options": {
                "temperature": temperature
            }
        }
        
        if system:
            payload["system"] = system
        
        data = json.dumps(payload).encode('utf-8')
        
        try:
            req = urllib.request.Request(
                f"{self.base_url}/api/generate",
                data=data,
                headers={'Content-Type': 'application/json'}
            )
            
            with urllib.request.urlopen(req, timeout=300) as response:
                if stream:
                    for line in response:
                        if line:
                            chunk = json.loads(line.decode('utf-8'))
                            if 'response' in chunk:
                                yield chunk['response']
                            if chunk.get('done', False):
                                break
                else:
                    result = json.loads(response.read().decode('utf-8'))
                    if 'response' in result:
                        yield result['response']
        
        except Exception as e:
            print(f"Ollama generate error: {e}")
            yield f"Error: {str(e)}"
    
    def unload_model(self, model: str) -> bool:
        """
        Unload a specific model from memory
        
        Args:
            model: Model name to unload
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Send a generate request with keep_alive=0 to unload the model
            payload = {
                "model": model,
                "prompt": "",
                "keep_alive": 0
            }
            
            data = json.dumps(payload).encode('utf-8')
            req = urllib.request.Request(
                f"{self.base_url}/api/generate",
                data=data,
                headers={'Content-Type': 'application/json'}
            )
            
            with urllib.request.urlopen(req, timeout=10) as response:
                result = json.loads(response.read().decode('utf-8'))
                print(f"[OLLAMA] Unloaded model: {model}")
                return True
                
        except Exception as e:
            print(f"Failed to unload Ollama model {model}: {e}")
            return False
    
    def unload_all_models(self) -> bool:
        """
        Unload all loaded Ollama models from memory
        
        Returns:
            True if at least one model was unloaded successfully
        """
        try:
            models = self.list_models()
            if not models:
                print("[OLLAMA] No models found to unload")
                return True
            
            success_count = 0
            for model_info in models:
                model_name = model_info.get('name', '')
                if model_name:
                    if self.unload_model(model_name):
                        success_count += 1
            
            print(f"[OLLAMA] Unloaded {success_count}/{len(models)} models")
            return success_count > 0
            
        except Exception as e:
            print(f"Failed to unload Ollama models: {e}")
            return False

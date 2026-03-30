/**
 * Custom Video Player with Advanced Controls
 * Features:
 * - Speed control (0.25x to 2x)
 * - Loop toggle (on by default)
 * - Double-click to skip forward/backward
 * - Smart loading (only loads when needed)
 * - Keyboard shortcuts
 */

class CustomVideoPlayer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`[VideoPlayer] Container not found: ${containerId}`);
            return;
        }
        
        this.videoElement = null;
        this.controls = {};
        this.currentVideoUrl = null;
        this.isLooping = true;
        this.playbackRate = 1.0;
        this.skipSeconds = 5; // Double-click skip amount
        
        this.init();
    }
    
    init() {
        // Build player HTML
        this.container.innerHTML = `
            <div class="custom-video-player" style="width: 100%; height: 100%; display: flex; flex-direction: column; background: var(--bg-secondary); border-radius: 8px; overflow: hidden;">
                <!-- Video Element -->
                <div class="video-wrapper" style="flex: 1; position: relative; background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                    <video 
                        class="video-element" 
                        style="width: 100%; height: 100%; max-width: 100%; max-height: 100%; object-fit: contain !important;"
                        loop
                        preload="none"
                    ></video>
                    
                    <!-- Loading Indicator -->
                    <div class="video-loading" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); display: none;">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" style="animation: spin 1s linear infinite;">
                            <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
                            <path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="1"></path>
                        </svg>
                    </div>
                    
                    <!-- Click zones for double-click seek -->
                    <div class="seek-zone seek-backward" style="position: absolute; left: 0; top: 0; bottom: 60px; width: 30%; cursor: pointer;"></div>
                    <div class="seek-zone seek-forward" style="position: absolute; right: 0; top: 0; bottom: 60px; width: 30%; cursor: pointer;"></div>
                </div>
                
                <!-- Custom Controls -->
                <div class="video-controls" style="background: var(--bg-tertiary); padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem;">
                    <!-- Progress Bar -->
                    <div class="progress-container" style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="time-current" style="font-size: 0.75rem; min-width: 45px;">0:00</span>
                        <input type="range" class="progress-bar" min="0" max="100" value="0" step="0.1" style="flex: 1; cursor: pointer;">
                        <span class="time-total" style="font-size: 0.75rem; min-width: 45px;">0:00</span>
                    </div>
                    
                    <!-- Control Buttons -->
                    <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                        <!-- Play/Pause -->
                        <button class="btn-play-pause" style="background: none; border: none; cursor: pointer; padding: 0; display: flex; align-items: center; flex-shrink: 0;" title="Play/Pause (Space)">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--text-primary)" class="icon-play">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--text-primary)" class="icon-pause" style="display: none;">
                                <rect x="6" y="4" width="4" height="16"></rect>
                                <rect x="14" y="4" width="4" height="16"></rect>
                            </svg>
                        </button>
                        
                        <!-- Volume -->
                        <div style="display: flex; align-items: center; gap: 0.25rem; flex-shrink: 0;">
                            <button class="btn-mute" style="background: none; border: none; cursor: pointer; padding: 0; display: flex; align-items: center;" title="Mute (M)">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" stroke-width="2" class="icon-volume">
                                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                                </svg>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" stroke-width="2" class="icon-muted" style="display: none;">
                                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                                    <line x1="23" y1="9" x2="17" y2="15"></line>
                                    <line x1="17" y1="9" x2="23" y2="15"></line>
                                </svg>
                            </button>
                            <input type="range" class="volume-bar" min="0" max="100" value="100" style="width: 80px; cursor: pointer;">
                        </div>
                        
                        <!-- Speed Control -->
                        <div style="display: flex; align-items: center; gap: 0.25rem; flex-shrink: 0;">
                            <label style="font-size: 0.75rem; color: var(--text-muted); white-space: nowrap;">Speed:</label>
                            <select class="speed-select" style="background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 0.25rem; font-size: 0.75rem; cursor: pointer;">
                                <option value="0.25">0.25x</option>
                                <option value="0.5">0.5x</option>
                                <option value="0.75">0.75x</option>
                                <option value="1" selected>1x</option>
                                <option value="1.25">1.25x</option>
                                <option value="1.5">1.5x</option>
                                <option value="1.75">1.75x</option>
                                <option value="2">2x</option>
                            </select>
                        </div>
                        
                        <!-- Loop Toggle -->
                        <button class="btn-loop active" style="background: var(--accent); color: white; border: none; border-radius: 4px; padding: 0.25rem 0.5rem; font-size: 0.75rem; cursor: pointer; display: flex; align-items: center; gap: 0.25rem; flex-shrink: 0; white-space: nowrap;" title="Loop (L)">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M17 1l4 4-4 4"></path>
                                <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                                <path d="M7 23l-4-4 4-4"></path>
                                <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                            </svg>
                            <span>Loop</span>
                        </button>
                        
                        <!-- Fullscreen -->
                        <button class="btn-fullscreen" style="background: none; border: none; cursor: pointer; padding: 0; margin-left: auto; display: flex; align-items: center; flex-shrink: 0;" title="Fullscreen (F)">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" stroke-width="2">
                                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            
            <style>
                @keyframes spin {
                    from { transform: translate(-50%, -50%) rotate(0deg); }
                    to { transform: translate(-50%, -50%) rotate(360deg); }
                }
                
                .custom-video-player {
                    max-width: 100vw;
                    max-height: 100vh;
                    box-sizing: border-box;
                }
                
                .custom-video-player .video-wrapper {
                    max-width: 100%;
                    max-height: 100%;
                    overflow: hidden;
                }
                
                .custom-video-player .video-element {
                    max-width: 100%;
                    max-height: 100%;
                    display: block;
                    object-fit: contain !important;
                }
                
                /* Fullscreen mode - ensure video never gets cropped */
                .custom-video-player:fullscreen {
                    width: 100vw;
                    height: 100vh;
                    max-width: 100vw;
                    max-height: 100vh;
                }
                
                .custom-video-player:fullscreen .video-wrapper {
                    flex: 1;
                    width: 100vw;
                    height: calc(100vh - 80px); /* Reserve space for controls */
                    max-width: 100vw;
                    max-height: calc(100vh - 80px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .custom-video-player:fullscreen .video-element {
                    width: 100% !important;
                    height: 100% !important;
                    max-width: 100vw !important;
                    max-height: 100% !important;
                    object-fit: contain !important;
                }
                
                /* Webkit fullscreen */
                .custom-video-player:-webkit-full-screen {
                    width: 100vw;
                    height: 100vh;
                }
                
                .custom-video-player:-webkit-full-screen .video-wrapper {
                    flex: 1;
                    width: 100vw;
                    height: calc(100vh - 80px);
                    max-width: 100vw;
                    max-height: calc(100vh - 80px);
                }
                
                .custom-video-player:-webkit-full-screen .video-element {
                    width: 100% !important;
                    height: 100% !important;
                    max-width: 100vw !important;
                    max-height: 100% !important;
                    object-fit: contain !important;
                }
                
                /* Mozilla fullscreen */
                .custom-video-player:-moz-full-screen {
                    width: 100vw;
                    height: 100vh;
                }
                
                .custom-video-player:-moz-full-screen .video-wrapper {
                    flex: 1;
                    width: 100vw;
                    height: calc(100vh - 80px);
                    max-width: 100vw;
                    max-height: calc(100vh - 80px);
                }
                
                .custom-video-player:-moz-full-screen .video-element {
                    width: 100% !important;
                    height: 100% !important;
                    max-width: 100vw !important;
                    max-height: 100% !important;
                    object-fit: contain !important;
                }
                
                /* MS fullscreen */
                .custom-video-player:-ms-fullscreen {
                    width: 100vw;
                    height: 100vh;
                }
                
                .custom-video-player:-ms-fullscreen .video-wrapper {
                    flex: 1;
                    width: 100vw;
                    height: calc(100vh - 80px);
                    max-width: 100vw;
                    max-height: calc(100vh - 80px);
                }
                
                .custom-video-player:-ms-fullscreen .video-element {
                    width: 100% !important;
                    height: 100% !important;
                    max-width: 100vw !important;
                    max-height: 100% !important;
                    object-fit: contain !important;
                }
                
                @media (max-width: 768px) {
                    .custom-video-player {
                        border-radius: 0 !important;
                    }
                    
                    .video-controls {
                        padding: 0.5rem !important;
                    }
                    
                    .video-controls > div:last-child {
                        gap: 0.5rem !important;
                    }
                    
                    .volume-bar {
                        width: 60px !important;
                    }height: calc(100vh - 60px) !important;
                        max-height: calc(100vh - 60px) !important;
                    }
                    
                    .custom-video-player:fullscreen .video-controls,
                    .custom-video-player:-webkit-full-screen .video-controls,
                    .custom-video-player:-moz-full-screen .video-controls {
                        padding: 0.35rem !important;
                    }
                }
                
                @media (max-width: 480px) {
                    .video-controls {
                        font-size: 0.875rem;
                    }
                    
                    .time-current,
                    .time-total {
                        font-size: 0.7rem !important;
                        min-width: 38px !important;
                    }
                    
                    .btn-play-pause svg,
                    .btn-mute svg,
                    .btn-fullscreen svg {
                        width: 20px;
                        height: 20px;
                    }
                    
                    .btn-loop span {
                        display: none;
                    }
                    
                    .btn-loop svg {
                        margin: 0;
                    }
                    
                    /* Extra small screen fullscreen */
                    .custom-video-player:fullscreen .video-wrapper,
                    .custom-video-player:-webkit-full-screen .video-wrapper,
                    .custom-video-player:-moz-full-screen .video-wrapper {
                        height: calc(100vh - 50px) !important;
                        max-height: calc(100vh - 50px) !important;
                    }
                }
                
                /* Landscape orientation on mobile - maximize video space */
                @media (max-width: 896px) and (max-height: 414px) and (orientation: landscape) {
                    .custom-video-player:fullscreen .video-wrapper,
                    .custom-video-player:-webkit-full-screen .video-wrapper,
                    .custom-video-player:-moz-full-screen .video-wrapper {
                        height: calc(100vh - 45px) !important;
                        max-height: calc(100vh - 45px) !important;
                    }
                    
                    .custom-video-player:fullscreen .video-element,
                    .custom-video-player:-webkit-full-screen .video-element,
                    .custom-video-player:-moz-full-screen .video-element {
                        max-height: calc(100vh - 45px) !important;
                    }
                    
                    .custom-video-player:fullscreen .video-controls,
                    .custom-video-player:-webkit-full-screen .video-controls,
                    .custom-video-player:-moz-full-screen .video-controls {
                        padding: 0.25rem 0.5rem !important;
                        gap: 0.25rem !important;
                    }
                }
                
                .custom-video-player input[type="range"] {
                    -webkit-appearance: none;
                    appearance: none;
                    background: transparent;
                    outline: none;
                }
                
                .custom-video-player input[type="range"]::-webkit-slider-track {
                    background: var(--bg-secondary);
                    height: 4px;
                    border-radius: 2px;
                }
                
                .custom-video-player input[type="range"]::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 12px;
                    height: 12px;
                    background: var(--accent);
                    border-radius: 50%;
                    cursor: pointer;
                    margin-top: -4px;
                }
                
                .custom-video-player input[type="range"]::-moz-range-track {
                    background: var(--bg-secondary);
                    height: 4px;
                    border-radius: 2px;
                }
                
                .custom-video-player input[type="range"]::-moz-range-thumb {
                    width: 12px;
                    height: 12px;
                    background: var(--accent);
                    border-radius: 50%;
                    cursor: pointer;
                    border: none;
                }
                
                .btn-loop.active {
                    background: var(--accent) !important;
                }
                
                .btn-loop:not(.active) {
                    background: var(--bg-secondary) !important;
                    color: var(--text-muted) !important;
                }
            </style>
        `;
        
        // Get references to elements
        this.videoElement = this.container.querySelector('.video-element');
        this.loadingIndicator = this.container.querySelector('.video-loading');
        this.controls.playPause = this.container.querySelector('.btn-play-pause');
        this.controls.mute = this.container.querySelector('.btn-mute');
        this.controls.loop = this.container.querySelector('.btn-loop');
        this.controls.fullscreen = this.container.querySelector('.btn-fullscreen');
        this.controls.progressBar = this.container.querySelector('.progress-bar');
        this.controls.volumeBar = this.container.querySelector('.volume-bar');
        this.controls.speedSelect = this.container.querySelector('.speed-select');
        this.controls.timeCurrent = this.container.querySelector('.time-current');
        this.controls.timeTotal = this.container.querySelector('.time-total');
        this.controls.seekBackward = this.container.querySelector('.seek-backward');
        this.controls.seekForward = this.container.querySelector('.seek-forward');
        
        // Attach event listeners
        this.attachEventListeners();
    }
    
    attachEventListeners() {
        // Play/Pause button
        this.controls.playPause.addEventListener('click', () => this.togglePlayPause());
        
        // Mute button
        this.controls.mute.addEventListener('click', () => this.toggleMute());
        
        // Loop button
        this.controls.loop.addEventListener('click', () => this.toggleLoop());
        
        // Fullscreen button
        this.controls.fullscreen.addEventListener('click', () => this.toggleFullscreen());
        
        // Progress bar
        this.controls.progressBar.addEventListener('input', (e) => this.seekTo(e.target.value));
        
        // Volume bar
        this.controls.volumeBar.addEventListener('input', (e) => this.setVolume(e.target.value));
        
        // Speed selector
        this.controls.speedSelect.addEventListener('change', (e) => this.setSpeed(parseFloat(e.target.value)));
        
        // Double-click seek zones
        this.controls.seekBackward.addEventListener('dblclick', () => this.skipBackward());
        this.controls.seekForward.addEventListener('dblclick', () => this.skipForward());
        
        // Video events
        this.videoElement.addEventListener('loadstart', () => this.showLoading());
        this.videoElement.addEventListener('canplay', () => this.hideLoading());
        this.videoElement.addEventListener('play', () => this.updatePlayPauseIcon());
        this.videoElement.addEventListener('pause', () => this.updatePlayPauseIcon());
        this.videoElement.addEventListener('timeupdate', () => this.updateProgress());
        this.videoElement.addEventListener('loadedmetadata', () => this.updateDuration());
        this.videoElement.addEventListener('volumechange', () => this.updateVolumeIcon());
        
        // Fullscreen change event
        document.addEventListener('fullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('mozfullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('MSFullscreenChange', () => this.handleFullscreenChange());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyPress(e));
    }
    
    loadVideo(url) {
        if (this.currentVideoUrl === url && this.videoElement.src) {
            console.log('[VideoPlayer] Video already loaded');
            return;
        }
        
        console.log('[VideoPlayer] Loading video:', url);
        
        // Stop current video
        this.videoElement.pause();
        this.videoElement.src = '';
        
        // Load new video
        this.currentVideoUrl = url;
        this.videoElement.src = url;
        this.videoElement.loop = this.isLooping;
        this.videoElement.playbackRate = this.playbackRate;
        
        // Try to play
        this.videoElement.play().catch(err => {
            console.log('[VideoPlayer] Autoplay prevented:', err);
        });
    }
    
    unloadVideo() {
        this.videoElement.pause();
        this.videoElement.src = '';
        this.currentVideoUrl = null;
        this.controls.progressBar.value = 0;
        this.controls.timeCurrent.textContent = '0:00';
    }
    
    togglePlayPause() {
        if (this.videoElement.paused) {
            this.videoElement.play();
        } else {
            this.videoElement.pause();
        }
    }
    
    toggleMute() {
        this.videoElement.muted = !this.videoElement.muted;
    }
    
    toggleLoop() {
        this.isLooping = !this.isLooping;
        this.videoElement.loop = this.isLooping;
        this.controls.loop.classList.toggle('active', this.isLooping);
    }
    
    toggleFullscreen() {
        const player = this.container.querySelector('.custom-video-player');
        if (!document.fullscreenElement && !document.webkitFullscreenElement && 
            !document.mozFullScreenElement && !document.msFullscreenElement) {
            // Request fullscreen with all vendor prefixes
            if (player.requestFullscreen) {
                player.requestFullscreen();
            } else if (player.webkitRequestFullscreen) {
                player.webkitRequestFullscreen();
            } else if (player.mozRequestFullScreen) {
                player.mozRequestFullScreen();
            } else if (player.msRequestFullscreen) {
                player.msRequestFullscreen();
            }
        } else {
            // Exit fullscreen with all vendor prefixes
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    }
    
    handleFullscreenChange() {
        const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || 
                                document.mozFullScreenElement || document.msFullscreenElement);
        
        if (isFullscreen) {
            console.log('[VideoPlayer] Entered fullscreen mode');
            // Force object-fit: contain in fullscreen
            this.videoElement.style.objectFit = 'contain';
        } else {
            console.log('[VideoPlayer] Exited fullscreen mode');
        }
    }
    
    seekTo(percent) {
        const time = (percent / 100) * this.videoElement.duration;
        this.videoElement.currentTime = time;
    }
    
    setVolume(value) {
        this.videoElement.volume = value / 100;
    }
    
    setSpeed(rate) {
        this.playbackRate = rate;
        this.videoElement.playbackRate = rate;
    }
    
    skipForward() {
        this.videoElement.currentTime = Math.min(
            this.videoElement.currentTime + this.skipSeconds,
            this.videoElement.duration
        );
    }
    
    skipBackward() {
        this.videoElement.currentTime = Math.max(
            this.videoElement.currentTime - this.skipSeconds,
            0
        );
    }
    
    updatePlayPauseIcon() {
        const playIcon = this.container.querySelector('.icon-play');
        const pauseIcon = this.container.querySelector('.icon-pause');
        
        if (this.videoElement.paused) {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
        } else {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
        }
    }
    
    updateVolumeIcon() {
        const volumeIcon = this.container.querySelector('.icon-volume');
        const mutedIcon = this.container.querySelector('.icon-muted');
        
        if (this.videoElement.muted || this.videoElement.volume === 0) {
            volumeIcon.style.display = 'none';
            mutedIcon.style.display = 'block';
        } else {
            volumeIcon.style.display = 'block';
            mutedIcon.style.display = 'none';
        }
    }
    
    updateProgress() {
        const percent = (this.videoElement.currentTime / this.videoElement.duration) * 100;
        this.controls.progressBar.value = percent || 0;
        this.controls.timeCurrent.textContent = this.formatTime(this.videoElement.currentTime);
    }
    
    updateDuration() {
        this.controls.timeTotal.textContent = this.formatTime(this.videoElement.duration);
    }
    
    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    showLoading() {
        this.loadingIndicator.style.display = 'block';
    }
    
    hideLoading() {
        this.loadingIndicator.style.display = 'none';
    }
    
    handleKeyPress(e) {
        // Only handle if player is visible and video is loaded
        if (!this.currentVideoUrl || this.container.offsetParent === null) return;
        
        switch(e.key.toLowerCase()) {
            case ' ':
            case 'k':
                e.preventDefault();
                this.togglePlayPause();
                break;
            case 'm':
                e.preventDefault();
                this.toggleMute();
                break;
            case 'f':
                e.preventDefault();
                this.toggleFullscreen();
                break;
            case 'l':
                e.preventDefault();
                this.toggleLoop();
                break;
            case 'arrowleft':
                e.preventDefault();
                this.skipBackward();
                break;
            case 'arrowright':
                e.preventDefault();
                this.skipForward();
                break;
        }
    }
}

// Global instance for video preview player
window.videoPreviewPlayer = null;

// Initialize player when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for the container to be available
    setTimeout(() => {
        const container = document.getElementById('videoPreviewPlayerContainer');
        if (container) {
            window.videoPreviewPlayer = new CustomVideoPlayer('videoPreviewPlayerContainer');
            console.log('[VideoPlayer] Custom video player initialized');
        } else {
            console.log('[VideoPlayer] Container not found, will retry...');
            // Retry after a longer delay
            setTimeout(() => {
                const retryContainer = document.getElementById('videoPreviewPlayerContainer');
                if (retryContainer) {
                    window.videoPreviewPlayer = new CustomVideoPlayer('videoPreviewPlayerContainer');
                    console.log('[VideoPlayer] Custom video player initialized (retry)');
                }
            }, 1000);
        }
    }, 100);
});

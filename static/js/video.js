// ============================================================================
// video.js - Video generation, frame-edit, video-batch, and duration calculator
//
// Functions: generateVideo, handleVideoImageUpload, handleVideoImagePreview,
//   clearVideoImage, handleFrameEditVideoUpload, handleFrameEditVideoPreview,
//   clearFrameEditVideo, selectVideoBrowserFile, updateFrameCalculations,
//   extractFrames, openFrameEditFolderBrowser, updateFrameEditCount,
//   queueFrameEditBatch, openStitchFolderBrowser, updateStitchFrameCount,
//   parseFpsFromFolderName, stitchFramesToVideo, initializeVideoBatch,
//   queueVideoBatchGeneration, updateVideoDuration, updateVideoBatchDuration,
//   initializeVideoDurationCalculator,
//   showStoryInstructions, copyStoryInstructions, closeStoryInstructions
// ============================================================================

let uploadedVideoImageFilename = null;
let uploadedFrameEditVideoFilename = null; // Frame Edit video
let currentFrameEditVideoData = null; // Store video metadata (fps, duration, etc.)

// Frame Edit Step 2: Folder Browser and Batch Processing
let selectedFrameEditFolder = '';

// Frame Edit Step 3: Stitch Frames to Video
let selectedStitchFolder = '';
let selectedStitchSource = 'input'; // 'input' or 'output'

async function generateVideo() {
    const prompt = document.getElementById('videoPrompt').value.trim();
    
    if (!prompt) {
        showNotification('Please enter a motion prompt', 'Missing Prompt', 'warning');
        return;
    }
    savePromptToHistory(prompt, 'video');
    
    // Check if image needs to be uploaded first
    const imageUpload = document.getElementById('videoImageUpload');
    if (imageUpload.files.length > 0) {
        // Always upload when there's a file selected (handles new uploads)
        showNotification('Uploading image...', 'Please wait', 'info');
        const uploadSuccess = await handleVideoImageUpload();
        if (!uploadSuccess) {
            return;
        }
    }
    
    // Use uploaded image or default example.png
    const imageFilename = uploadedVideoImageFilename || 'example.png';
    
    const data = {
        job_type: 'video',
        prompt: prompt,
        image_filename: imageFilename,
        frames: parseInt(document.getElementById('videoFrames').value),
        megapixels: parseFloat(document.getElementById('videoMegapixels').value),
        fps: parseInt(document.getElementById('videoFps').value),
        seed: document.getElementById('videoSeed').value ? parseInt(document.getElementById('videoSeed').value) : null,
        file_prefix: document.getElementById('videoFilePrefix').value.trim() || 'video',
        subfolder: document.getElementById('videoSubfolder').value.trim(),
        nsfw: document.getElementById('videoNSFW').checked
    };
    
    try {
        const response = await fetch('/api/queue', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('Video job queued:', result.job_id);
            
            // Update queue immediately
            updateQueue();
            
            // Reload gallery after a delay to show new video
            setTimeout(() => browseFolder(currentPath), 3000);
            showNotification('Video added to queue', 'Queued', 'success', 3000);
        }
    } catch (error) {
        console.error('Error queueing video job:', error);
        showNotification('Error queueing video job. Make sure the backend is running.', 'Error', 'error');
    }
}

async function handleVideoImageUpload() {
    const imageUpload = document.getElementById('videoImageUpload');
    const file = imageUpload.files[0];
    
    if (!file) {
        return false;
    }
    
    const formData = new FormData();
    formData.append('image', file);
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            uploadedVideoImageFilename = result.filename;
            showNotification('Image uploaded successfully', 'Success', 'success', 2000);
            return true;
        } else {
            showNotification(result.error || 'Upload failed', 'Error', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error uploading image:', error);
        showNotification('Error uploading image', 'Error', 'error');
        return false;
    }
}

function handleVideoImagePreview() {
    const imageUpload = document.getElementById('videoImageUpload');
    const imagePreview = document.getElementById('videoImagePreview');
    const imagePreviewImg = document.getElementById('videoPreviewImg');
    const clearImageBtn = document.getElementById('clearVideoImageBtn');
    
    const file = imageUpload.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreviewImg.src = e.target.result;
            imagePreview.style.display = 'block';
            clearImageBtn.style.display = 'inline-block';
        };
        reader.readAsDataURL(file);
        
        // Reset uploaded filename so it uploads again
        uploadedVideoImageFilename = null;
    } else {
        imagePreview.style.display = 'none';
        clearImageBtn.style.display = 'none';
        uploadedVideoImageFilename = null;
    }
}

function clearVideoImage() {
    const imageUpload = document.getElementById('videoImageUpload');
    const imagePreview = document.getElementById('videoImagePreview');
    const clearImageBtn = document.getElementById('clearVideoImageBtn');
    
    imageUpload.value = '';
    imagePreview.style.display = 'none';
    clearImageBtn.style.display = 'none';
    uploadedVideoImageFilename = null;
}

// ============================================================================
// FRAME EDIT VIDEO FUNCTIONS
// ============================================================================

async function handleFrameEditVideoUpload() {
    const videoUpload = document.getElementById('frameEditVideoUpload');
    const file = videoUpload.files[0];
    
    if (!file) {
        return false;
    }
    
    const formData = new FormData();
    formData.append('video', file);
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            uploadedFrameEditVideoFilename = result.filename;
            showNotification('Video uploaded successfully', 'Success', 'success', 2000);
            return true;
        } else {
            showNotification(result.error || 'Upload failed', 'Error', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error uploading video:', error);
        showNotification('Error uploading video', 'Error', 'error');
        return false;
    }
}

async function handleFrameEditVideoPreview() {
    const videoUpload = document.getElementById('frameEditVideoUpload');
    const videoPreview = document.getElementById('frameEditVideoPreview');
    const videoPreviewEl = document.getElementById('frameEditPreviewVideo');
    const videoInfo = document.getElementById('frameEditVideoInfo');
    const clearVideoBtn = document.getElementById('clearFrameEditVideoBtn');
    const frameExtractControls = document.getElementById('frameExtractControls');
    const outputFolder = document.getElementById('frameOutputFolder');
    
    const file = videoUpload.files[0];
    if (file) {
        // Clear output folder to allow auto-generation for new video
        if (outputFolder) {
            outputFolder.value = '';
        }
        
        // Upload the video file first and wait for it to complete
        await handleFrameEditVideoUpload();
        
        const reader = new FileReader();
        reader.onload = (e) => {
            videoPreviewEl.src = e.target.result;
            videoPreview.style.display = 'block';
            clearVideoBtn.style.display = 'inline-block';
            
            // Display video info
            const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
            videoInfo.textContent = `${file.name} (${fileSizeMB} MB)`;
            
            // Get video metadata when loaded
            videoPreviewEl.onloadedmetadata = () => {
                const duration = videoPreviewEl.duration;
                const width = videoPreviewEl.videoWidth;
                const height = videoPreviewEl.videoHeight;
                
                // Estimate FPS (most videos are 24, 30, or 60 fps)
                // We'll get the actual FPS from the backend when extracting
                const estimatedFPS = 30;
                
                videoInfo.textContent = `${file.name} • ${width}×${height} • ${duration.toFixed(1)}s • ${fileSizeMB} MB`;
                
                // Store video data globally
                currentFrameEditVideoData = {
                    filename: uploadedFrameEditVideoFilename,
                    duration: duration,
                    width: width,
                    height: height,
                    fps: estimatedFPS  // Estimated, will be accurate when backend processes
                };
                
                // Initialize frame extraction controls
                const endTimeInput = document.getElementById('frameEndTime');
                if (endTimeInput) {
                    endTimeInput.value = duration.toFixed(1);
                    endTimeInput.max = duration.toFixed(1);
                }
                
                const startTimeInput = document.getElementById('frameStartTime');
                if (startTimeInput) {
                    startTimeInput.max = duration.toFixed(1);
                }
                
                // Show frame extraction controls
                if (frameExtractControls) {
                    frameExtractControls.style.display = 'block';
                }
                
                // Calculate and display initial values
                updateFrameCalculations();
            };
        };
        reader.readAsDataURL(file);
        
        // Note: uploadedFrameEditVideoFilename is already set by handleFrameEditVideoUpload()
    } else {
        videoPreview.style.display = 'none';
        clearVideoBtn.style.display = 'none';
        if (frameExtractControls) {
            frameExtractControls.style.display = 'none';
        }
        uploadedFrameEditVideoFilename = null;
        currentFrameEditVideoData = null;
    }
}

function clearFrameEditVideo() {
    const videoUpload = document.getElementById('frameEditVideoUpload');
    const videoPreview = document.getElementById('frameEditVideoPreview');
    const videoPreviewEl = document.getElementById('frameEditPreviewVideo');
    const clearVideoBtn = document.getElementById('clearFrameEditVideoBtn');
    const frameExtractControls = document.getElementById('frameExtractControls');
    const outputFolder = document.getElementById('frameOutputFolder');
    
    videoUpload.value = '';
    videoPreviewEl.src = '';
    videoPreview.style.display = 'none';
    clearVideoBtn.style.display = 'none';
    if (frameExtractControls) {
        frameExtractControls.style.display = 'none';
    }
    if (outputFolder) {
        outputFolder.value = '';
    }
    uploadedFrameEditVideoFilename = null;
    currentFrameEditVideoData = null;
}

function selectVideoBrowserFile(filepath, folder) {
    // Set the selected video from browser
    uploadedFrameEditVideoFilename = filepath;
    
    // Update preview
    const videoPreview = document.getElementById('frameEditVideoPreview');
    const videoPreviewEl = document.getElementById('frameEditPreviewVideo');
    const videoInfo = document.getElementById('frameEditVideoInfo');
    const clearVideoBtn = document.getElementById('clearFrameEditVideoBtn');
    const frameExtractControls = document.getElementById('frameExtractControls');
    const outputFolder = document.getElementById('frameOutputFolder');
    
    // Clear output folder to allow auto-generation
    if (outputFolder) {
        outputFolder.value = '';
    }
    
    // Construct the URL for the video
    const videoUrl = folder === 'output' ? `/outputs/${filepath}` : `/api/video/${encodeURIComponent(filepath)}`;
    
    videoPreviewEl.src = videoUrl;
    videoPreview.style.display = 'block';
    clearVideoBtn.style.display = 'inline-block';
    
    // Display video info
    const filename = filepath.split('/').pop();
    videoInfo.textContent = `Selected: ${filename}`;
    
    // Get video metadata when loaded
    videoPreviewEl.onloadedmetadata = () => {
        const duration = videoPreviewEl.duration;
        const width = videoPreviewEl.videoWidth;
        const height = videoPreviewEl.videoHeight;
        const estimatedFPS = 30;
        
        videoInfo.textContent = `${filename} • ${width}×${height} • ${duration.toFixed(1)}s`;
        
        // Store video data globally
        currentFrameEditVideoData = {
            filename: uploadedFrameEditVideoFilename,
            duration: duration,
            width: width,
            height: height,
            fps: estimatedFPS
        };
        
        // Initialize frame extraction controls
        const endTimeInput = document.getElementById('frameEndTime');
        if (endTimeInput) {
            endTimeInput.value = duration.toFixed(1);
            endTimeInput.max = duration.toFixed(1);
        }
        
        const startTimeInput = document.getElementById('frameStartTime');
        if (startTimeInput) {
            startTimeInput.max = duration.toFixed(1);
        }
        
        // Show frame extraction controls
        if (frameExtractControls) {
            frameExtractControls.style.display = 'block';
        }
        
        // Calculate and display initial values
        updateFrameCalculations();
    };
    
    // Close the browser modal
    closeVideoBrowser();
    
    showNotification('Video selected successfully', 'Success', 'success', 2000);
}

function updateFrameCalculations() {
    if (!currentFrameEditVideoData) return;
    
    const startTime = parseFloat(document.getElementById('frameStartTime')?.value || 0);
    const endTime = parseFloat(document.getElementById('frameEndTime')?.value || currentFrameEditVideoData.duration);
    const frameSkip = parseInt(document.getElementById('frameSkip')?.value || 1);
    
    // Validate inputs
    if (startTime >= endTime) return;
    if (frameSkip < 1) return;
    
    const selectedDuration = endTime - startTime;
    const fps = currentFrameEditVideoData.fps;
    
    // Calculate frames
    const totalFrames = Math.floor(selectedDuration * fps);
    const extractedFrames = Math.floor(totalFrames / frameSkip);
    const playbackFPS = fps / frameSkip;
    
    // Update display
    document.getElementById('videoOriginalFPS').textContent = `${fps} fps`;
    document.getElementById('videoSelectedDuration').textContent = `${selectedDuration.toFixed(1)}s`;
    document.getElementById('videoTotalFrames').textContent = totalFrames.toLocaleString();
    document.getElementById('videoExtractedFrames').textContent = extractedFrames.toLocaleString();
    document.getElementById('videoPlaybackFPS').textContent = `${playbackFPS.toFixed(2)} fps`;
}

async function extractFrames() {
    if (!uploadedFrameEditVideoFilename) {
        showNotification('Please select a video first', 'No Video', 'warning');
        return;
    }
    
    const startTime = parseFloat(document.getElementById('frameStartTime')?.value || 0);
    const endTime = parseFloat(document.getElementById('frameEndTime')?.value || currentFrameEditVideoData.duration);
    const frameSkip = parseInt(document.getElementById('frameSkip')?.value || 1);
    const outputFolder = document.getElementById('frameOutputFolder')?.value.trim() || '';
    
    if (startTime >= endTime) {
        showNotification('Start time must be less than end time', 'Invalid Range', 'warning');
        return;
    }
    
    const confirmed = await showConfirm(
        `Extract frames from ${startTime.toFixed(1)}s to ${endTime.toFixed(1)}s (every ${frameSkip} frame${frameSkip > 1 ? 's' : ''})?\n\nThis will create ${Math.floor((endTime - startTime) * currentFrameEditVideoData.fps / frameSkip)} images.`,
        'Extract Frames'
    );
    
    if (!confirmed) return;
    
    const extractBtn = document.getElementById('extractFramesBtn');
    const originalText = extractBtn.innerHTML;
    extractBtn.disabled = true;
    extractBtn.innerHTML = '<span style="display: inline-block; animation: spin 1s linear infinite;">⏳</span> Extracting...';
    
    try {
        const response = await fetch('/api/frame-edit/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_filename: uploadedFrameEditVideoFilename,
                start_time: startTime,
                end_time: endTime,
                frame_skip: frameSkip,
                output_folder: outputFolder
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(
                `Extracted ${result.frame_count} frames to ${result.folder_path}`,
                'Frames Extracted',
                'success',
                5000
            );
            
            // Optionally update output folder input to show where frames were saved
            document.getElementById('frameOutputFolder').value = result.folder_name;
        } else {
            showNotification(result.error || 'Failed to extract frames', 'Error', 'error');
        }
    } catch (error) {
        console.error('Error extracting frames:', error);
        showNotification('Error extracting frames', 'Error', 'error');
    } finally {
        extractBtn.disabled = false;
        extractBtn.innerHTML = originalText;
    }
}

function openFrameEditFolderBrowser() {
    imageBrowserMode = 'frame-edit';
    currentBrowserFolder = 'input';
    currentBrowserSubpath = 'frame_edit'; // Start in frame_edit folder
    selectedFrameEditFolder = '';
    
    // Open modal
    const modal = document.getElementById('imageBrowserModal');
    if (modal) {
        modal.style.display = 'flex';
        const modalTitle = modal.querySelector('h3');
        if (modalTitle) {
            modalTitle.textContent = 'Select Frame Folder';
        }
        
        // Load frame_edit folders
        loadImageBrowserFolder('input', 'frame_edit');
    }
}

async function updateFrameEditCount(folder) {
    if (!folder) {
        const countDisplay = document.getElementById('frameEditFrameCount');
        if (countDisplay) {
            countDisplay.style.display = 'none';
        }
        return;
    }
    
    try {
        const response = await fetch(`/api/frame-edit/count?folder=${encodeURIComponent(folder)}`);
        const result = await response.json();
        
        const countDisplay = document.getElementById('frameEditFrameCount');
        if (countDisplay && result.success) {
            const count = result.frame_count;
            countDisplay.innerHTML = `<strong>${count.toLocaleString()} frame${count !== 1 ? 's' : ''}</strong> ready to process`;
            countDisplay.style.display = 'block';
            
            if (count === 0) {
                countDisplay.style.color = 'var(--error)';
            } else {
                countDisplay.style.color = 'var(--accent-primary)';
            }
        }
    } catch (error) {
        console.error('Error fetching frame count:', error);
    }
}

async function queueFrameEditBatch() {
    if (!selectedFrameEditFolder) {
        showNotification('Please select a frame folder first', 'No Folder Selected', 'warning');
        return;
    }
    
    const prompt = document.getElementById('frameEditPrompt')?.value.trim();
    if (!prompt) {
        showNotification('Please enter a prompt', 'No Prompt', 'warning');
        return;
    }
    savePromptToHistory(prompt, 'image');
    
    const steps = parseInt(document.getElementById('frameEditSteps')?.value || 4);
    const cfg = parseFloat(document.getElementById('frameEditCfg')?.value || 1.0);
    const shift = parseFloat(document.getElementById('frameEditShift')?.value || 3.0);
    const seed = document.getElementById('frameEditSeed')?.value.trim();
    const filePrefix = document.getElementById('frameEditFilePrefix')?.value.trim() || 'frame_edit';
    const outputFolder = document.getElementById('frameEditOutputFolder')?.value.trim() || '';
    
    // LoRA settings
    const mcnlLora = document.getElementById('frameEditMcnlLora')?.checked || false;
    const snofsLora = document.getElementById('frameEditSnofsLora')?.checked || false;
    const maleLora = document.getElementById('frameEditMaleLora')?.checked || false;
    
    const confirmed = await showConfirm(
        `Process all frames in ${selectedFrameEditFolder} with AI?\n\nThis will queue one job per frame.`,
        'Queue Frame Edit Batch'
    );
    
    if (!confirmed) return;
    
    const queueBtn = document.getElementById('queueFrameEditBtn');
    const originalText = queueBtn.innerHTML;
    queueBtn.disabled = true;
    queueBtn.innerHTML = '<span style="display: inline-block; animation: spin 1s linear infinite;">⏳</span> Queueing...';
    
    try {
        const response = await fetch('/api/frame-edit/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folder: selectedFrameEditFolder,
                prompt: prompt,
                steps: steps,
                cfg: cfg,
                shift: shift,
                seed: seed || undefined,
                file_prefix: filePrefix,
                output_folder: outputFolder,
                mcnl_lora: mcnlLora,
                snofs_lora: snofsLora,
                male_lora: maleLora
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(
                `Queued ${result.job_count} frames for processing`,
                'Batch Queued',
                'success',
                5000
            );
        } else {
            showNotification(result.error || 'Failed to queue batch', 'Error', 'error');
        }
    } catch (error) {
        console.error('Error queueing frame edit batch:', error);
        showNotification('Error queueing batch', 'Error', 'error');
    } finally {
        queueBtn.disabled = false;
        queueBtn.innerHTML = originalText;
    }
}

function openStitchFolderBrowser() {
    imageBrowserMode = 'stitch';
    currentBrowserFolder = 'input';
    currentBrowserSubpath = 'frame_edit'; // Start in frame_edit input folder
    selectedStitchFolder = '';
    selectedStitchSource = 'input'; // Track source folder
    
    // Open modal
    const modal = document.getElementById('imageBrowserModal');
    if (modal) {
        modal.style.display = 'flex';
        const modalTitle = modal.querySelector('h3');
        if (modalTitle) {
            modalTitle.textContent = 'Select Frames Folder';
        }
        
        // Load frame_edit folders (start with input)
        loadImageBrowserFolder('input', 'frame_edit');
    }
}

async function updateStitchFrameCount(folder, source) {
    if (!folder) {
        const countDisplay = document.getElementById('stitchFrameCount');
        if (countDisplay) {
            countDisplay.style.display = 'none';
        }
        return;
    }
    
    try {
        // Use appropriate endpoint based on source
        const endpoint = source === 'input' ? '/api/frame-edit/count' : '/api/frame-edit/count-output';
        const response = await fetch(`${endpoint}?folder=${encodeURIComponent(folder)}`);
        const result = await response.json();
        
        const countDisplay = document.getElementById('stitchFrameCount');
        if (countDisplay && result.success) {
            const count = result.frame_count;
            countDisplay.innerHTML = `<strong>${count.toLocaleString()} frame${count !== 1 ? 's' : ''}</strong> found`;
            countDisplay.style.display = 'block';
            
            if (count === 0) {
                countDisplay.style.color = 'var(--error)';
            } else {
                countDisplay.style.color = 'var(--accent-primary)';
            }
        }
    } catch (error) {
        console.error('Error fetching frame count:', error);
    }
}

function parseFpsFromFolderName(folderName) {
    // Try to extract FPS from folder name pattern: "name_30fps" or "name_23.98fps"
    const fpsMatch = folderName.match(/(\d+(?:\.\d+)?)fps/i);
    if (fpsMatch) {
        return parseFloat(fpsMatch[1]);
    }
    return 30; // Default fallback
}

async function stitchFramesToVideo() {
    if (!selectedStitchFolder) {
        showNotification('Please select a folder first', 'No Folder Selected', 'warning');
        return;
    }
    
    const fps = parseFloat(document.getElementById('stitchFps')?.value || 30);
    const outputName = document.getElementById('stitchOutputName')?.value.trim();
    
    if (fps <= 0 || fps > 120) {
        showNotification('FPS must be between 1 and 120', 'Invalid FPS', 'warning');
        return;
    }
    
    const confirmed = await showConfirm(
        `Stitch all frames in ${selectedStitchFolder} to video at ${fps} FPS?`,
        'Stitch Frames'
    );
    
    if (!confirmed) return;
    
    const stitchBtn = document.getElementById('stitchFramesBtn');
    const originalText = stitchBtn.innerHTML;
    stitchBtn.disabled = true;
    stitchBtn.innerHTML = '<span style="display: inline-block; animation: spin 1s linear infinite;">⏳</span> Stitching...';
    
    try {
        const response = await fetch('/api/frame-edit/stitch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folder: selectedStitchFolder,
                fps: fps,
                output_name: outputName || undefined,
                source: selectedStitchSource || 'input'
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(
                `Video created: ${result.video_path}`,
                'Video Created',
                'success',
                5000
            );
            
            // Clear output name for next use
            document.getElementById('stitchOutputName').value = '';
        } else {
            showNotification(result.error || 'Failed to stitch frames', 'Error', 'error');
        }
    } catch (error) {
        console.error('Error stitching frames:', error);
        showNotification('Error stitching frames', 'Error', 'error');
    } finally {
        stitchBtn.disabled = false;
        stitchBtn.innerHTML = originalText;
    }
}

// ============================================================================
// VIDEO BATCH
// ============================================================================

function initializeVideoBatch() {
    const chooseBtn = document.getElementById('chooseVideoBatchFolderBtn');
    const queueBtn = document.getElementById('queueVideoBatchBtn');
    if (chooseBtn) {
        chooseBtn.addEventListener('click', () => {
            selectedVideoBatchFolder = '';
            openImageBrowser('video-batch');
        });
    }
    if (queueBtn) {
        queueBtn.addEventListener('click', queueVideoBatchGeneration);
    }
}

async function queueVideoBatchGeneration() {
    const prompt = document.getElementById('videoBatchPrompt').value.trim();
    if (!prompt) {
        showNotification('Please enter a motion prompt', 'Missing Prompt', 'warning');
        return;
    }
    savePromptToHistory(prompt, 'video');
    
    const folderPath = selectedVideoBatchFolder || currentBrowserSubpath || '';
    if (!folderPath) {
        showNotification('Please select a folder', 'Missing Folder', 'warning');
        return;
    }
    
    const frames = parseInt(document.getElementById('videoBatchFrames').value);
    const fps = parseInt(document.getElementById('videoBatchFps').value);
    const megapixels = parseFloat(document.getElementById('videoBatchMegapixels').value);
    const seedVal = document.getElementById('videoBatchSeed').value.trim();
    const seed = seedVal ? parseInt(seedVal) : null;
    const file_prefix = document.getElementById('videoBatchFilePrefix').value.trim() || 'video_batch';
    const subfolder = document.getElementById('videoBatchSubfolder').value.trim();
    const nsfw = document.getElementById('videoBatchNSFW').checked;

    try {
        const response = await fetch('/api/queue/video-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt,
                folder: folderPath,
                frames,
                fps,
                megapixels,
                seed,
                file_prefix,
                subfolder,
                nsfw
            })
        });
        const result = await response.json();
        if (result.success) {
            showNotification(`Queued ${result.queued_count} video(s) from folder`, 'Video Batch Queued', 'success', 3000);
            updateQueue();
        } else {
            showNotification('Error: ' + (result.error || 'Failed to queue video batch'), 'Error', 'error');
        }
    } catch (error) {
        console.error('Error queueing video batch:', error);
        showNotification('Error queueing video batch', 'Error', 'error');
    }
}

// Video duration calculator
function updateVideoDuration() {
    const frames = parseInt(document.getElementById('videoFrames')?.value) || 64;
    const fps = parseInt(document.getElementById('videoFps')?.value) || 16;
    const duration = frames / fps;
    const durationElement = document.getElementById('videoDurationValue');
    
    if (durationElement) {
        if (duration < 1) {
            durationElement.textContent = `${(duration * 1000).toFixed(0)} milliseconds`;
        } else if (duration < 60) {
            durationElement.textContent = `${duration.toFixed(1)} seconds`;
        } else {
            const minutes = Math.floor(duration / 60);
            const seconds = (duration % 60).toFixed(1);
            durationElement.textContent = `${minutes}m ${seconds}s`;
        }
    }
}

function updateVideoBatchDuration() {
    const frames = parseInt(document.getElementById('videoBatchFrames')?.value) || 64;
    const fps = parseInt(document.getElementById('videoBatchFps')?.value) || 16;
    const duration = frames / fps;
    const durationElement = document.getElementById('videoBatchDurationValue');
    
    if (durationElement) {
        if (duration < 1) {
            durationElement.textContent = `${(duration * 1000).toFixed(0)} milliseconds`;
        } else if (duration < 60) {
            durationElement.textContent = `${duration.toFixed(1)} seconds`;
        } else {
            const minutes = Math.floor(duration / 60);
            const seconds = (duration % 60).toFixed(1);
            durationElement.textContent = `${minutes}m ${seconds}s`;
        }
    }
}

function initializeVideoDurationCalculator() {
    const videoFramesInput = document.getElementById('videoFrames');
    const videoFpsInput = document.getElementById('videoFps');
    
    if (videoFramesInput) {
        videoFramesInput.addEventListener('input', updateVideoDuration);
        videoFramesInput.addEventListener('change', updateVideoDuration);
        console.log('✓ Video frames input listener attached');
    }
    if (videoFpsInput) {
        videoFpsInput.addEventListener('input', updateVideoDuration);
        videoFpsInput.addEventListener('change', updateVideoDuration);
        console.log('✓ Video FPS input listener attached');
    }
    
    // Video Batch listeners
    const videoBatchFramesInput = document.getElementById('videoBatchFrames');
    const videoBatchFpsInput = document.getElementById('videoBatchFps');
    
    if (videoBatchFramesInput) {
        videoBatchFramesInput.addEventListener('input', updateVideoBatchDuration);
        videoBatchFramesInput.addEventListener('change', updateVideoBatchDuration);
        console.log('✓ Video batch frames input listener attached');
    }
    if (videoBatchFpsInput) {
        videoBatchFpsInput.addEventListener('input', updateVideoBatchDuration);
        videoBatchFpsInput.addEventListener('change', updateVideoBatchDuration);
        console.log('✓ Video batch FPS input listener attached');
    }
    
    // Initial calculations
    updateVideoDuration();
    updateVideoBatchDuration();
}

// Story Instructions Functions
async function showStoryInstructions() {
    const modal = document.getElementById('storyInstructionsModal');
    const content = document.getElementById('storyInstructionsContent');
    
    if (!modal || !content) return;
    
    // Show modal with loading state
    modal.style.display = 'flex';
    content.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">Loading instructions...</div>';
    
    try {
        const response = await fetch('/api/story-instructions');
        const data = await response.json();
        
        if (data.success && data.content) {
            // Convert markdown to HTML (simple implementation)
            const htmlContent = markdownToHtml(data.content);
            content.innerHTML = htmlContent;
        } else {
            content.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--warning);">Failed to load instructions</div>';
        }
    } catch (error) {
        console.error('Error loading story instructions:', error);
        content.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--warning);">Error loading instructions</div>';
    }
}

async function copyStoryInstructions() {
    const button = document.getElementById('copyStoryInstructionsBtn');
    try {
        const response = await fetch('/api/story-instructions');
        const data = await response.json();
        
        if (data.success && data.content) {
            copyChatMessage(data.content, button);
            setTimeout(() => {
                showNotification('Story instructions copied to clipboard', 'Success', 'success');
            }, 100);
        } else {
            showNotification('Failed to copy instructions', 'Error', 'error');
        }
    } catch (error) {
        console.error('Error copying story instructions:', error);
        showNotification('Failed to copy instructions', 'Error', 'error');
    }
}

function closeStoryInstructions() {
    const modal = document.getElementById('storyInstructionsModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Add event listeners for story instructions
document.addEventListener('DOMContentLoaded', function() {
    const showStoryBtn = document.getElementById('showStoryInstructionsBtn');
    const copyStoryBtn = document.getElementById('copyStoryInstructionsBtn');
    const closeStoryBtn = document.getElementById('closeStoryInstructionsBtn');
    const storyModal = document.getElementById('storyInstructionsModal');
    const storyOverlay = storyModal?.querySelector('.custom-modal-overlay');
    
    if (showStoryBtn) {
        showStoryBtn.addEventListener('click', showStoryInstructions);
    }
    
    if (copyStoryBtn) {
        copyStoryBtn.addEventListener('click', copyStoryInstructions);
    }
    
    if (closeStoryBtn) {
        closeStoryBtn.addEventListener('click', closeStoryInstructions);
    }
    
    if (storyOverlay) {
        storyOverlay.addEventListener('click', closeStoryInstructions);
    }
    
    // ESC key to close story instructions
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && storyModal && storyModal.style.display === 'flex') {
            closeStoryInstructions();
        }
    });
});

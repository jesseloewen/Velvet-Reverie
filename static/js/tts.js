// Velvet Reverie - TTS & Audio: TTS generation, audio browser, audio batch playback
function openAudioBrowser(mode) {
    console.log('openAudioBrowser called with mode:', mode);
    audioBrowserMode = mode;
    const modal = document.getElementById('audioBrowserModal');
    if (!modal) {
        console.error('Audio browser modal not found!');
        return;
    }
    
    modal.style.display = 'flex';

    // Reopen where the browser was last used in this page session.
    const targetFolder = currentAudioBrowserFolder || 'input';
    const targetSubpath = currentAudioBrowserSubpath || '';
    loadAudioBrowserFolder(targetFolder, targetSubpath);
}

function closeAudioBrowser() {
    const modal = document.getElementById('audioBrowserModal');
    const audioPlayer = document.getElementById('audioPreviewPlayer');
    const audioPreviewContainer = document.getElementById('audioPreviewContainer');
    
    // Stop and reset audio player
    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer.src = '';
    }
    if (audioPreviewContainer) {
        audioPreviewContainer.style.display = 'none';
    }
    
    modal.style.display = 'none';
}

async function loadAudioBrowserFolder(folder, subpath) {
    currentAudioBrowserFolder = folder;
    currentAudioBrowserSubpath = subpath || '';
    
    // Update tab active state
    document.querySelectorAll('.audio-browser-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.folder === folder) {
            tab.classList.add('active');
        }
    });
    
    // Update path display
    renderAudioBrowserPath(folder, subpath);
    
    try {
        // Fetch audio files
        const endpoint = `/api/browse_audio_files?folder=${folder}&path=${encodeURIComponent(subpath)}`;
        const response = await fetch(endpoint);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to load audio files');
        }
        
        // Render folders and audio files
        const grid = document.getElementById('audioBrowserGrid');
        grid.innerHTML = '';
        
        const folders = data.folders || [];
        const audioFiles = data.audio_files || [];
        
        if (folders.length === 0 && audioFiles.length === 0) {
            grid.innerHTML = '<p style="color: #888; grid-column: 1/-1; text-align: center;">No audio files or folders found</p>';
            return;
        }
        
        // Add back button if not at root
        if (subpath) {
            const parentPath = subpath.split(/[\/\\]/).slice(0, -1).join('/');
            const backDiv = document.createElement('div');
            backDiv.className = 'browser-folder-item';
            backDiv.innerHTML = `
                <div class="browser-folder-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                </div>
                <div class="browser-folder-name">..</div>
            `;
            backDiv.addEventListener('click', () => {
                loadAudioBrowserFolder(folder, parentPath);
            });
            grid.appendChild(backDiv);
        }
        
        // Render folders
        folders.forEach(folderItem => {
            const fallbackAudioCount = Number.isInteger(folderItem?.audio_count) ? folderItem.audio_count : null;
            const folderLabel = formatBrowserFolderLabel(folderItem.name, folderItem, fallbackAudioCount);
            const div = document.createElement('div');
            div.className = 'browser-folder-item';
            div.innerHTML = `
                <div class="browser-folder-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
                <div class="browser-folder-name">${escapeHtml(folderLabel)}</div>
            `;
            div.addEventListener('click', () => {
                loadAudioBrowserFolder(folder, folderItem.path);
            });
            grid.appendChild(div);
        });
        
        // Render audio files
        audioFiles.forEach(file => {
            const filename = file.filename;
            const filePath = file.path;
            
            const div = document.createElement('div');
            div.className = 'browser-audio-item';
            div.style.cssText = 'padding: 1rem; background: var(--bg-primary); border-radius: 4px; transition: background 0.2s; display: flex; align-items: center; gap: 0.75rem;';
            
            div.innerHTML = `
                <div style="flex-shrink: 0;">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 18V5l12-2v13"></path>
                        <circle cx="6" cy="18" r="3"></circle>
                        <circle cx="18" cy="16" r="3"></circle>
                    </svg>
                </div>
                <div style="flex: 1; min-width: 0; cursor: pointer;" class="audio-select-area">
                    <div class="browser-audio-name">${escapeHtml(filename)}</div>
                    ${file.size ? `<div style="font-size: 0.75rem; color: var(--text-muted);">${formatFileSize(file.size)}</div>` : ''}
                </div>
                <button class="btn btn-sm audio-play-btn" style="flex-shrink: 0; padding: 0.5rem; display: flex; align-items: center; justify-content: center;" title="Preview audio">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                </button>
            `;
            
            div.addEventListener('mouseenter', () => {
                div.style.background = 'var(--bg-tertiary)';
            });
            div.addEventListener('mouseleave', () => {
                div.style.background = 'var(--bg-primary)';
            });
            
            // Click on name/info area to select
            const selectArea = div.querySelector('.audio-select-area');
            selectArea.addEventListener('click', (e) => {
                e.stopPropagation();
                selectAudioFile(filename, folder, filePath);
            });
            
            // Click on play button to preview
            const playBtn = div.querySelector('.audio-play-btn');
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                playAudioPreview(filename, folder, filePath);
            });
            
            grid.appendChild(div);
        });
    } catch (error) {
        console.error('Error loading audio browser folder:', error);
        showNotification('Error loading audio files', 'Error', 'error');
    }
}

function renderAudioBrowserPath(folder, subpath) {
    const pathDisplay = document.getElementById('audioBrowserPathText');
    const folderName = folder === 'input' ? 'Input' : 'Output';
    
    if (!subpath) {
        pathDisplay.innerHTML = folderName;
        return;
    }
    
    // Build clickable breadcrumb path
    const parts = subpath.split(/[\/\\]/).filter(p => p);
    let html = `<span class="browser-path-part" style="cursor: pointer;" onclick="loadAudioBrowserFolder('${folder}', '')">${folderName}</span>`;
    
    let currentPath = '';
    parts.forEach((part, index) => {
        currentPath += (currentPath ? '/' : '') + part;
        const pathCopy = currentPath;
        html += ' / ';
        html += `<span class="browser-path-part" style="cursor: pointer;" onclick="loadAudioBrowserFolder('${folder}', '${pathCopy}')">${escapeHtml(part)}</span>`;
    });
    
    pathDisplay.innerHTML = html;
}

function playAudioPreview(filename, folder, filePath) {
    console.log('Playing audio preview:', filename, 'from', folder, 'path:', filePath);
    
    const audioPlayer = document.getElementById('audioPreviewPlayer');
    const audioPreviewName = document.getElementById('audioPreviewName');
    const audioPreviewContainer = document.getElementById('audioPreviewContainer');
    
    // Build audio URL based on folder
    let audioUrl;
    if (folder === 'input') {
        // For input folder, need to use ComfyUI input path
        audioUrl = `/api/audio/input/${encodeURIComponent(filePath)}`;
    } else {
        // For output folder, use outputs path
        audioUrl = `/outputs/${encodeURIComponent(filePath)}`;
    }
    
    // Update player
    audioPreviewName.textContent = filename;
    audioPlayer.src = audioUrl;
    audioPreviewContainer.style.display = 'block';
    
        // Apply global speed then play
    applyGlobalAudioSpeed(audioPlayer);
    audioPlayer.play().catch(error => {
        console.error('Error playing audio:', error);
        showNotification('Error playing audio file', 'Playback Error', 'error');
    });
}

function selectAudioFile(filename, folder, filePath) {
    console.log('Selected audio file:', filename, 'from', folder, 'path:', filePath);
    
    if (audioBrowserMode === 'tts') {
        // Set the TTS narrator audio input - use filePath to include subfolder
        document.getElementById('ttsNarratorAudio').value = filePath;
        rememberTtsReferenceAudio(filePath);
        showNotification(`Selected: ${filePath}`, 'Audio Selected', 'success', 2000);
    } else if (audioBrowserMode === 'modal') {
        // Set the modal TTS voice input
        document.getElementById('modalTTSVoice').value = filePath;
        rememberTtsReferenceAudio(filePath);
        showNotification(`Selected: ${filePath}`, 'Audio Selected', 'success', 2000);
    }
    
    closeAudioBrowser();
}

function normalizeTtsReferenceAudio(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function rememberTtsReferenceAudio(value) {
    const normalized = normalizeTtsReferenceAudio(value);
    if (!normalized) {
        return;
    }

    lastUsedTtsReferenceAudio = normalized;

    const narratorAudioInput = document.getElementById('ttsNarratorAudio');
    if (narratorAudioInput && narratorAudioInput.value !== normalized) {
        narratorAudioInput.value = normalized;
    }

    const modalVoiceInput = document.getElementById('modalTTSVoice');
    if (modalVoiceInput && modalVoiceInput.value !== normalized) {
        modalVoiceInput.value = normalized;
    }
}

function getPreferredTtsReferenceAudio() {
    if (lastUsedTtsReferenceAudio) {
        return lastUsedTtsReferenceAudio;
    }

    const narratorAudioInput = document.getElementById('ttsNarratorAudio');
    const narratorValue = normalizeTtsReferenceAudio(narratorAudioInput?.value);
    if (narratorValue) {
        return narratorValue;
    }

    const modalVoiceInput = document.getElementById('modalTTSVoice');
    const modalValue = normalizeTtsReferenceAudio(modalVoiceInput?.value);
    if (modalValue) {
        return modalValue;
    }

    return 'Holly.mp3';
}

// ==================== TTS Functions ====================

// TTS Helper Functions for Chat Integration
function sendToTTS(text) {
    // Populate TTS text field
    document.getElementById('ttsText').value = text;
    // Switch to TTS tab
    switchTab('tts');
    // Show notification
    showNotification('Text copied to TTS tab', 'Success', 'success', 3000);
}

async function ttsNow(text, messageId = null) {
    // Instead of directly queuing, show the modal with settings
    showChatTTSModal(text, messageId);
}

// Chat TTS Modal Functions
function showChatTTSModal(text, messageId = null) {
    console.log('[TTS] Opening TTS modal for message:', messageId);
    
    // Populate modal with current TTS settings
    const refAudio = getPreferredTtsReferenceAudio();
    const ttsEngine = document.getElementById('ttsEngine')?.value || 'ChatterboxTTS';
    const audioFormat = document.getElementById('ttsAudioFormat')?.value || 'wav';
    const temperature = parseFloat(document.getElementById('ttsTemperature')?.value) || 0.8;
    const exaggeration = parseFloat(document.getElementById('ttsExaggeration')?.value) || 0.5;
    const cfgWeight = parseFloat(document.getElementById('ttsCfgWeight')?.value) || 0.5;
    const language = document.getElementById('ttsLanguage')?.value || 'en';
    const subfolder = document.getElementById('ttsSubfolder')?.value || '';
    
    // Set modal values
    document.getElementById('modalTTSVoice').value = refAudio;
    document.getElementById('modalTTSEngine').value = ttsEngine;
    document.getElementById('modalTTSFormat').value = audioFormat;
    document.getElementById('modalTTSTemperature').value = temperature;
    document.getElementById('modalTTSTemperatureValue').textContent = temperature.toFixed(1);
    document.getElementById('modalTTSExaggeration').value = exaggeration;
    document.getElementById('modalTTSExaggerationValue').textContent = exaggeration.toFixed(1);
    document.getElementById('modalTTSCfgWeight').value = cfgWeight;
    document.getElementById('modalTTSCfgWeightValue').textContent = cfgWeight.toFixed(1);
    document.getElementById('modalTTSLanguage').value = language;
    document.getElementById('modalTTSSubfolder').value = subfolder;
    
    // Store text and message ID
    document.getElementById('modalTTSMessageText').value = text;
    document.getElementById('modalTTSMessageId').value = messageId || '';
    
    // Show modal
    document.getElementById('chatTTSModal').style.display = 'flex';
    
    // Setup range input listeners for live updates
    setupTTSModalRangeListeners();
}

function setupTTSModalRangeListeners() {
    // Temperature
    const tempSlider = document.getElementById('modalTTSTemperature');
    const tempValue = document.getElementById('modalTTSTemperatureValue');
    if (tempSlider && tempValue) {
        tempSlider.oninput = function() {
            tempValue.textContent = parseFloat(this.value).toFixed(1);
        };
    }
    
    // Exaggeration
    const exagSlider = document.getElementById('modalTTSExaggeration');
    const exagValue = document.getElementById('modalTTSExaggerationValue');
    if (exagSlider && exagValue) {
        exagSlider.oninput = function() {
            exagValue.textContent = parseFloat(this.value).toFixed(1);
        };
    }
    
    // CFG Weight
    const cfgSlider = document.getElementById('modalTTSCfgWeight');
    const cfgValue = document.getElementById('modalTTSCfgWeightValue');
    if (cfgSlider && cfgValue) {
        cfgSlider.oninput = function() {
            cfgValue.textContent = parseFloat(this.value).toFixed(1);
        };
    }
}

function closeChatTTSModal() {
    // Reset modal to normal mode if it was used in auto-config mode
    const modal = document.getElementById('chatTTSModal');
    if (modal.dataset.autoMode === 'true') {
        modal.dataset.autoMode = 'false';
        const submitBtn = modal.querySelector('.btn-primary');
        if (submitBtn) {
            submitBtn.textContent = 'Generate TTS';
            submitBtn.setAttribute('onclick', 'submitChatTTS()');
        }
    }
    modal.style.display = 'none';
}

function openAudioBrowserForModal() {
    // Open audio browser in 'modal' mode to select file for the TTS modal
    openAudioBrowser('modal');
}

async function submitChatTTS() {
    // Get values from modal
    const text = document.getElementById('modalTTSMessageText').value;
    const messageId = document.getElementById('modalTTSMessageId').value;
    const refAudio = document.getElementById('modalTTSVoice').value.trim();
    const ttsEngine = document.getElementById('modalTTSEngine').value;
    const audioFormat = document.getElementById('modalTTSFormat').value;
    const temperature = parseFloat(document.getElementById('modalTTSTemperature').value);
    const exaggeration = parseFloat(document.getElementById('modalTTSExaggeration').value);
    const cfgWeight = parseFloat(document.getElementById('modalTTSCfgWeight').value);
    const language = document.getElementById('modalTTSLanguage').value;
    const subfolder = document.getElementById('modalTTSSubfolder').value.trim();
    
    if (!text) {
        showNotification('No text to convert to speech', 'Error', 'error');
        return;
    }
    
    if (!refAudio) {
        showNotification('Please specify a reference audio file', 'Error', 'error');
        return;
    }

    rememberTtsReferenceAudio(refAudio);
    
    // Close modal
    closeChatTTSModal();
    
    try {
        // Determine session_id and file_prefix based on the active tab
        const activeTabEl = document.querySelector('.tab-content.active');
        const activeTabId = activeTabEl ? activeTabEl.id : '';
        let sessionId = null;
        let filePrefix = 'chat_tts';
        let sessionType = 'chat';
        if (activeTabId === 'autochatTab') {
            sessionId = (typeof currentAutoSession !== 'undefined') ? currentAutoSession?.session_id : null;
            filePrefix = 'autochat_tts';
            sessionType = 'autochat';
        } else if (activeTabId === 'storyTab') {
            sessionId = currentStorySession?.session_id;
            filePrefix = 'story_tts';
            sessionType = 'story';
        } else {
            sessionId = currentChatSession?.session_id;
        }

        const response = await fetch('/api/queue/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                ref_audio: refAudio,
                seed: null,
                file_prefix: filePrefix,
                subfolder,
                tts_engine: ttsEngine,
                audio_format: audioFormat,
                temperature,
                exaggeration,
                cfg_weight: cfgWeight,
                chunk_size: 300,
                language,
                repetition_penalty: 2.0,
                // Track which chat message this TTS belongs to
                chat_message_id: messageId,
                session_id: sessionId,
                session_type: sessionType
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`TTS queued! ${data.total_sentences} sentence(s) will be generated.`, 'Success', 'success', 4000);
            
            // If this TTS is linked to a chat message, poll the session until audio is ready
            // then inject the audio player into the message element without requiring a page reload.
            if (messageId && sessionId) {
                console.log('[TTS] Starting audio ready poll for message:', messageId, 'session:', sessionId, 'type:', sessionType);
                pollForChatTTSAudio(messageId, sessionId, sessionType);
            }
        } else {
            showNotification(data.error || 'Failed to queue TTS generation', 'Error', 'error', 5000);
        }
    } catch (error) {
        console.error('TTS generation error:', error);
        showNotification('Failed to queue TTS generation', 'Error', 'error', 5000);
    }
}

/**
 * Poll the session endpoint until tts_audio is set on the target message,
 * then inject the audio player element into the DOM so it appears immediately
 * without the user needing to reload or navigate away and back.
 *
 * @param {string} messageId  - message_id or response_id of the target message
 * @param {string} sessionId  - session_id of the chat/story/autochat session
 * @param {string} sessionType - 'chat' | 'story' | 'autochat'
 */
async function pollForChatTTSAudio(messageId, sessionId, sessionType) {
    const MAX_WAIT_MS = 10 * 60 * 1000; // 10 minutes
    const POLL_INTERVAL_MS = 2000;       // poll every 2 seconds
    const startTime = Date.now();

    // Map session type to its API endpoint
    const sessionEndpoints = {
        'chat':     `/api/chat/sessions/${sessionId}`,
        'story':    `/api/story/sessions/${sessionId}`,
        'autochat': `/api/autochat/sessions/${sessionId}`,
    };
    const endpoint = sessionEndpoints[sessionType] || sessionEndpoints['chat'];

    // Map session type to the container selector and conversation audio type label
    const containerIds = {
        'chat':     'chatMessages',
        'story':    'storyMessages',
        'autochat': 'autochatMessages',
    };
    const messagesContainerId = containerIds[sessionType] || 'chatMessages';
    const audioConversationType = sessionType; // 'chat', 'story', or 'autochat'

    const poll = async () => {
        if (Date.now() - startTime > MAX_WAIT_MS) {
            console.warn('[TTS] Audio poll timed out for message:', messageId);
            return;
        }

        try {
            const resp = await fetch(endpoint);
            if (!resp.ok) {
                console.warn('[TTS] Session fetch failed, retrying...', resp.status);
                setTimeout(poll, POLL_INTERVAL_MS);
                return;
            }

            const data = await resp.json();
            if (!data.success) {
                setTimeout(poll, POLL_INTERVAL_MS);
                return;
            }

            const session = data.session;
            const messages = session.messages || [];

            // Find the message by message_id or response_id
            const msg = messages.find(m =>
                m.message_id === messageId || m.response_id === messageId
            );

            if (!msg) {
                // Message not found yet, keep polling
                setTimeout(poll, POLL_INTERVAL_MS);
                return;
            }

            if (!msg.tts_audio) {
                // Audio not ready yet, keep polling
                setTimeout(poll, POLL_INTERVAL_MS);
                return;
            }

            // Audio is ready — inject the player into the DOM
            console.log('[TTS] Audio ready for message:', messageId, '→', msg.tts_audio);
            injectChatMessageAudio(messageId, msg.tts_audio, audioConversationType, messagesContainerId, messages.indexOf(msg));

        } catch (err) {
            console.error('[TTS] Poll error:', err);
            setTimeout(poll, POLL_INTERVAL_MS);
        }
    };

    // Start the first poll after a short delay to allow the job to be enqueued
    setTimeout(poll, POLL_INTERVAL_MS);
}

/**
 * Inject (or replace) the audio player element inside the message DOM element.
 * If an audio player already exists for this message it won't be duplicated.
 *
 * @param {string} messageId          - data-message-id on the message element
 * @param {string} audioPath          - relative audio path stored in tts_audio
 * @param {string} conversationType   - 'chat' | 'story' | 'autochat'
 * @param {string} containerId        - ID of the messages container element
 * @param {number} messageIndex       - index of the message in the session array
 */
function injectChatMessageAudio(messageId, audioPath, conversationType, containerId, messageIndex) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn('[TTS] Messages container not found:', containerId);
        return;
    }

    // Locate the message element. Chat uses data-message-id; story uses data-message-id too;
    // autochat uses data-response-id as well.
    let messageEl = container.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageEl) {
        messageEl = container.querySelector(`[data-response-id="${messageId}"]`);
    }

    if (!messageEl) {
        console.warn('[TTS] Could not find message element for:', messageId);
        return;
    }

    const wrapper = messageEl.querySelector('.chat-message-wrapper');
    if (!wrapper) {
        console.warn('[TTS] Could not find .chat-message-wrapper inside message element');
        return;
    }

    // Don't add a duplicate if one already exists
    if (wrapper.querySelector('.chat-message-audio')) {
        console.log('[TTS] Audio player already present in message, skipping injection');
        return;
    }

    // Use createConversationAudioElement if available (chat.js), otherwise fall back to HTML builder
    let audioEl = null;
    if (typeof createConversationAudioElement === 'function') {
        audioEl = createConversationAudioElement(conversationType, audioPath, messageIndex);
    }

    if (audioEl) {
        // Insert before the actions div (or at end of wrapper if no actions div)
        const actionsDiv = wrapper.querySelector('.chat-message-actions');
        if (actionsDiv) {
            wrapper.insertBefore(audioEl, actionsDiv);
        } else {
            wrapper.appendChild(audioEl);
        }
        console.log('[TTS] Audio player injected for message:', messageId);
    } else if (typeof buildConversationAudioHtml === 'function') {
        // Fallback: use HTML string builder (e.g. autochat/story)
        const html = buildConversationAudioHtml(conversationType, audioPath, messageIndex);
        if (html) {
            const actionsDiv = wrapper.querySelector('.chat-message-actions');
            if (actionsDiv) {
                actionsDiv.insertAdjacentHTML('beforebegin', html);
            } else {
                wrapper.insertAdjacentHTML('beforeend', html);
            }
            console.log('[TTS] Audio player HTML injected for message:', messageId);
        }
    }
}

async function generateTTS() {
    const text = document.getElementById('ttsText').value.trim();
    const refAudio = document.getElementById('ttsNarratorAudio').value.trim();
    const seed = document.getElementById('ttsSeed').value.trim();
    const filePrefix = document.getElementById('ttsFilePrefix').value.trim() || 'tts';
    const subfolder = document.getElementById('ttsSubfolder').value.trim();
    
    // Get Gradio TTS parameters
    const ttsEngine = document.getElementById('ttsEngine').value || 'ChatterboxTTS';
    const audioFormat = document.getElementById('ttsAudioFormat').value || 'wav';
    const temperature = parseFloat(document.getElementById('ttsTemperature').value) || 0.8;
    const exaggeration = parseFloat(document.getElementById('ttsExaggeration').value) || 0.5;
    const cfgWeight = parseFloat(document.getElementById('ttsCfgWeight').value) || 0.5;
    const chunkSize = parseInt(document.getElementById('ttsChunkSize').value) || 300;
    const language = document.getElementById('ttsLanguage').value || 'en';
    const repetitionPenalty = parseFloat(document.getElementById('ttsRepetitionPenalty').value) || 2.0;
    
    if (!text) {
        showAlert('Error', 'Please enter text to convert to speech');
        return;
    }
    
    if (!refAudio) {
        showAlert('Error', 'Please specify a reference audio file');
        return;
    }

    rememberTtsReferenceAudio(refAudio);
    
    try {
        const response = await fetch('/api/queue/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                ref_audio: refAudio,
                seed: seed ? parseInt(seed) : null,
                file_prefix: filePrefix,
                subfolder,
                tts_engine: ttsEngine,
                audio_format: audioFormat,
                temperature,
                exaggeration,
                cfg_weight: cfgWeight,
                chunk_size: chunkSize,
                language,
                repetition_penalty: repetitionPenalty
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('Success', `TTS queued! ${data.total_sentences} sentence(s) will be generated.`);
            // Clear text input after successful submission
            document.getElementById('ttsText').value = '';
        } else {
            showAlert('Error', data.error || 'Failed to queue TTS generation');
        }
    } catch (error) {
        console.error('TTS generation error:', error);
        showAlert('Error', 'Failed to queue TTS generation');
    }
}

// Audio Browser Functions
let currentPlayingBatch = null;
let currentPlayingIndex = 0;
let audioElement = null;

async function loadAudioBatches() {
    try {
        const response = await fetch('/api/browse_audio?folder=output');
        const data = await response.json();
        
        if (!data.success) {
            console.error('Failed to load audio:', data.error);
            return;
        }
        
        const container = document.getElementById('audioBatchesContainer');
        const emptyMessage = document.getElementById('audioEmpty');
        
        if (!data.batches || data.batches.length === 0) {
            container.style.display = 'none';
            emptyMessage.style.display = 'flex';
            return;
        }
        
        container.style.display = 'block';
        emptyMessage.style.display = 'none';
        
        // Render batches
        container.innerHTML = data.batches.map(batch => renderAudioBatch(batch)).join('');
        
        // Event listeners are now handled via onclick in HTML
        
    } catch (error) {
        console.error('Error loading audio batches:', error);
    }
}

function renderAudioBatch(batch) {
    const date = new Date(batch.timestamp);
    const formattedDate = date.toLocaleString();
    const firstSentencePreview = batch.files[0]?.prompt || batch.files[0]?.text || '';
    
    // Get first few words (up to 50 chars) for title
    const titleText = firstSentencePreview.length > 50 ? firstSentencePreview.substring(0, 50) + '...' : firstSentencePreview;
    
    // Get voice/style from first file
    const voice = batch.files[0]?.style || batch.files[0]?.narrator_audio || 'Unknown Voice';
    const voiceName = voice.replace('.mp3', '').replace('.wav', '');
    
    // Get language from first file
    const language = batch.files[0]?.language || 'English';
    
    // Collect all text for "View Full Text" button - join with line breaks for readability
    const fullText = batch.files
        .sort((a, b) => (a.sentence_index || 0) - (b.sentence_index || 0))
        .map(f => f.prompt || f.text || '')
        .filter(text => text.trim())
        .join(' ');
    
    // Store batch data globally for full text modal
    audioBatchData[batch.batch_id] = {
        fullText: fullText,
        voiceName: voiceName,
        language: language
    };
    
    // Count unique sentences (not versions)
    const uniqueSentenceIndices = new Set(batch.files.map(f => f.sentence_index));
    const uniqueSentenceCount = uniqueSentenceIndices.size;
    
    // Calculate total duration based on most recent versions (will be updated when versions are selected)
    const sentenceGroups = {};
    batch.files.forEach(file => {
        const idx = file.sentence_index;
        if (!sentenceGroups[idx]) sentenceGroups[idx] = [];
        sentenceGroups[idx].push(file);
    });
    let totalDuration = 0;
    Object.values(sentenceGroups).forEach(versions => {
        // Use most recent version by default (newest version_number)
        versions.sort((a, b) => (b.version_number || 0) - (a.version_number || 0));
        const duration = versions[0].duration || 0;
        console.log(`[AUDIO] Sentence ${versions[0].sentence_index}: duration=${duration}s, file=${versions[0].filename}`);
        totalDuration += duration;
    });
    console.log(`[AUDIO] Batch ${batch.batch_id} total duration: ${totalDuration}s (${uniqueSentenceCount} sentences)`);
    const totalDurationFormatted = formatDuration(totalDuration);
    
    return `
        <div class="audio-batch-card collapsed" id="batch_${batch.batch_id}">
            <div class="audio-batch-header" onclick="toggleAudioBatch('${batch.batch_id}'); return false;">
                <div class="audio-batch-info">
                    <div class="audio-batch-title">
                        <h3>${escapeHtml(titleText)}</h3>
                        <svg class="collapse-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                    <div class="audio-batch-meta">
                        <span>${escapeHtml(voiceName)}</span>
                        <span>•</span>
                        <span>${escapeHtml(language)}</span>
                        <span>•</span>
                        <span>${formattedDate}</span>
                        <span>•</span>
                        <span>${uniqueSentenceCount} sentence(s)</span>
                        <span>•</span>
                        <span id="totalDuration_${batch.batch_id}">${totalDurationFormatted}</span>
                    </div>
                </div>
            </div>
                        <div class="audio-batch-content" id="batchContent_${batch.batch_id}">
                <div class="audio-player-section">
                    <div class="audio-player-speed-row">
                        <span class="audio-player-speed-label">Speed</span>
                        <select class="audio-speed-select" onchange="setGlobalAudioPlaybackSpeed(this.value)" aria-label="Audio playback speed" title="Audio playback speed (global)">
                            <option value="0.5">0.5x</option>
                            <option value="0.75">0.75x</option>
                            <option value="1">1x</option>
                            <option value="1.25">1.25x</option>
                            <option value="1.5">1.5x</option>
                            <option value="1.75">1.75x</option>
                            <option value="2">2x</option>
                        </select>
                    </div>
                    <audio id="audioPlayer_${batch.batch_id}" class="audio-player" controls ontimeupdate="updateCurrentPlaythroughTime('${batch.batch_id}')">
                        <source src="" type="audio/mpeg">
                        Your browser does not support the audio element.
                    </audio>
                    <div class="audio-player-info">
                        <div id="currentSentence_${batch.batch_id}" class="current-sentence-display">Select a sentence or click Play All</div>
                        <div id="playthroughTime_${batch.batch_id}" class="playthrough-time-display" style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.5rem;"></div>
                    </div>
                </div>
                <div class="audio-controls">
                    <button class="btn btn-primary btn-sm" id="playBatch_${batch.batch_id}" onclick="playAudioBatch('${batch.batch_id}'); return false;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                        Play All
                    </button>
                    <button class="btn btn-secondary btn-sm" id="stopBatch_${batch.batch_id}" onclick="stopAudioPlayback('${batch.batch_id}'); return false;" style="display: none;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="6" y="6" width="12" height="12"></rect>
                        </svg>
                        Stop
                    </button>
                    <button class="btn btn-info btn-sm" id="viewTextBatch_${batch.batch_id}" onclick="showFullTextModal('${batch.batch_id}'); return false;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                        View Full Text
                    </button>
                    <button class="btn btn-success btn-sm" id="downloadAllBatch_${batch.batch_id}" onclick="downloadMergedAudio('${batch.batch_id}'); return false;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        Download All
                    </button>
                </div>
                <div class="audio-sentences-list" id="sentencesList_${batch.batch_id}">
                    ${renderUniqueSentences(batch.batch_id, batch.files)}
                </div>
            </div>
        </div>
    `;
}

function formatDuration(seconds) {
    if (!seconds || seconds === 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function renderUniqueSentences(batchId, files) {
    // Group files by sentence_index
    const sentenceGroups = {};
    files.forEach(file => {
        const idx = file.sentence_index;
        if (!sentenceGroups[idx]) {
            sentenceGroups[idx] = [];
        }
        sentenceGroups[idx].push(file);
    });
    
    // Sort sentence indices and render only one item per sentence_index
    const sortedIndices = Object.keys(sentenceGroups).map(Number).sort((a, b) => a - b);
    return sortedIndices.map(sentenceIdx => {
        const versions = sentenceGroups[sentenceIdx];
        // Sort versions by version_number, newest first
        versions.sort((a, b) => (b.version_number || 0) - (a.version_number || 0));
        // Use the newest version as the default display
        const latestVersion = versions[0];
        return renderSentenceItem(batchId, latestVersion, sentenceIdx, files);
    }).join('');
}

function updateCurrentPlaythroughTime(batchId) {
    const audioPlayer = document.getElementById(`audioPlayer_${batchId}`);
    const display = document.getElementById(`playthroughTime_${batchId}`);
    const totalDisplay = document.getElementById(`totalDuration_${batchId}`);
    
    if (!audioPlayer || !display || !currentPlayingBatch || currentPlayingBatch.batch_id !== batchId) return;
    
    // Calculate elapsed time from completed sentences
    let elapsedTime = 0;
    for (let i = 0; i < currentPlayingIndex; i++) {
        elapsedTime += currentPlayingBatch.files[i].duration || 0;
    }
    // Add current audio position
    elapsedTime += audioPlayer.currentTime || 0;
    
    // Calculate total duration
    let totalDuration = 0;
    currentPlayingBatch.files.forEach(f => {
        totalDuration += f.duration || 0;
    });
    
    // Update display
    display.textContent = `Playthrough: ${formatDuration(elapsedTime)} / ${formatDuration(totalDuration)}`;
    
    // Also update the total duration in header if it's playing
    if (totalDisplay) {
        totalDisplay.textContent = formatDuration(totalDuration);
    }
}

function renderSentenceItem(batchId, file, sentenceIdx, allFiles) {
    // Group files by sentence_index to find versions
    const sentence_index = file.sentence_index;
    const versions = allFiles.filter(f => f.sentence_index === sentence_index);
    versions.sort((a, b) => (b.version_number || 0) - (a.version_number || 0)); // Sort by version, newest first
    
    const hasMultipleVersions = versions.length > 1;
    
    return `
        <div class="audio-sentence-item" data-sentence-index="${sentence_index}" data-batch="${batchId}" data-sentence-id="${file.id}" onclick="playSingleSentence('${batchId}', ${sentence_index}); return false;">
            <div class="audio-sentence-number">${sentence_index + 1}</div>
            <div class="audio-sentence-text">${escapeHtml(file.prompt || file.text || '')}</div>
            <div class="audio-sentence-actions" style="display: flex; gap: 0.25rem; align-items: center;">
                ${hasMultipleVersions ? `
                    <select class="version-selector" onchange="switchSentenceVersion('${batchId}', ${sentence_index}, this.value); event.stopPropagation();" onclick="event.stopPropagation();" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary);">
                        ${versions.map(v => `<option value="${v.id}" ${v.id === file.id ? 'selected' : ''}>v${v.version_number || 0}</option>`).join('')}
                    </select>
                ` : ''}
                <button class="btn-icon download-sentence-btn" onclick="event.stopPropagation(); downloadAudioSentence('${file.id}'); return false;" title="Download this sentence">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                </button>
                <button class="btn-icon edit-sentence-btn" onclick="event.stopPropagation(); openEditSentenceModal('${file.id}', \`${(file.prompt || file.text || '').replace(/`/g, '\\`').replace(/\\/g, '\\\\').replace(/\$/g, '\\$')}\`); return false;" title="Edit & Regenerate">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="btn-icon play-sentence-btn" id="playBtn_${batchId}_${sentence_index}" onclick="event.stopPropagation(); playSingleSentence('${batchId}', ${sentence_index}); return false;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                </button>
                <button class="btn-icon stop-sentence-btn" id="stopBtn_${batchId}_${sentence_index}" style="display: none; background: var(--danger);" onclick="event.stopPropagation(); stopSingleSentence('${batchId}', ${sentence_index}); return false;" title="Stop playback">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="6" y="6" width="12" height="12"></rect>
                    </svg>
                </button>
            </div>
        </div>
    `;
}

function toggleAudioBatch(batchId) {
    const batchCard = document.getElementById(`batch_${batchId}`);
    if (batchCard) {
        batchCard.classList.toggle('collapsed');
    }
}

// Helper function to get selected versions for each sentence
function getSelectedVersionsForBatch(batchId, batch) {
    // Group files by sentence_index
    const sentenceGroups = {};
    batch.files.forEach(file => {
        const idx = file.sentence_index;
        if (!sentenceGroups[idx]) sentenceGroups[idx] = [];
        sentenceGroups[idx].push(file);
    });
    
    // Get selected version for each sentence
    const sortedIndices = Object.keys(sentenceGroups).map(Number).sort((a, b) => a - b);
    const selectedVersions = sortedIndices.map(idx => {
        const versions = sentenceGroups[idx];
        
        // Check if there's a version selector for this sentence
        const sentenceItem = document.querySelector(`[data-sentence-index="${idx}"][data-batch="${batchId}"]`);
        if (sentenceItem) {
            const selector = sentenceItem.querySelector('.version-selector');
            if (selector) {
                // Use the selected version from dropdown
                const selectedId = selector.value;
                const selectedFile = versions.find(v => v.id === selectedId);
                if (selectedFile) return selectedFile;
            }
        }
        
        // Fallback: use newest version
        versions.sort((a, b) => (b.version_number || 0) - (a.version_number || 0));
        return versions[0];
    });
    
    return selectedVersions;
}

function playSingleSentence(batchId, sentenceIndex) {
    // Find the batch and start playing from this sentence onwards
    const batchResponse = fetch('/api/browse_audio?folder=output')
        .then(res => res.json())
        .then(data => {
            const batch = data.batches.find(b => b.batch_id === batchId);
            if (!batch) return;
            
            // Get selected versions for all sentences
            const selectedVersions = getSelectedVersionsForBatch(batchId, batch);
            
            // Find the position of this sentence in the array
            const playIndex = selectedVersions.findIndex(f => f.sentence_index === sentenceIndex);
            if (playIndex === -1) return;
            
            // Set up for consecutive playback from this sentence
            currentPlayingBatch = { ...batch, files: selectedVersions };
            currentPlayingIndex = playIndex;
            
            // Show stop button for batch controls
            const playBtn = document.getElementById(`playBatch_${batchId}`);
            const stopBtn = document.getElementById(`stopBatch_${batchId}`);
            if (playBtn) playBtn.style.display = 'none';
            if (stopBtn) stopBtn.style.display = 'inline-flex';
            
            // Show stop button for this specific sentence, hide play button
            const sentencePlayBtn = document.getElementById(`playBtn_${batchId}_${sentenceIndex}`);
            const sentenceStopBtn = document.getElementById(`stopBtn_${batchId}_${sentenceIndex}`);
            if (sentencePlayBtn) sentencePlayBtn.style.display = 'none';
            if (sentenceStopBtn) sentenceStopBtn.style.display = 'inline-flex';
            
            // Expand the batch if collapsed
            const batchCard = document.getElementById(`batch_${batchId}`);
            if (batchCard) {
                batchCard.classList.remove('collapsed');
                batchCard.classList.add('playing');
            }
            
            // Start consecutive playback from this sentence
            playNextSentence();
        })
        .catch(err => console.error('Error playing sentence:', err));
}

function stopSingleSentence(batchId, sentenceIndex) {
    // Stop playback
    stopAudioPlayback(batchId);
    
    // Hide stop button, show play button for this sentence
    const sentencePlayBtn = document.getElementById(`playBtn_${batchId}_${sentenceIndex}`);
    const sentenceStopBtn = document.getElementById(`stopBtn_${batchId}_${sentenceIndex}`);
    if (sentencePlayBtn) sentencePlayBtn.style.display = 'inline-flex';
    if (sentenceStopBtn) sentenceStopBtn.style.display = 'none';
}

async function playAudioBatch(batchId) {
    // Fetch batch data
    try {
        const response = await fetch('/api/browse_audio?folder=output');
        const data = await response.json();
        const batch = data.batches.find(b => b.batch_id === batchId);
        
        if (!batch) return;
        
        // Get selected versions for all sentences
        const selectedVersions = getSelectedVersionsForBatch(batchId, batch);
        
        currentPlayingBatch = { ...batch, files: selectedVersions };
        currentPlayingIndex = 0;
        
        // Show stop button, hide play button
        const playBtn = document.getElementById(`playBatch_${batchId}`);
        const stopBtn = document.getElementById(`stopBatch_${batchId}`);
        if (playBtn) playBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'inline-flex';
        
        // Expand the batch if collapsed
        const batchCard = document.getElementById(`batch_${batchId}`);
        if (batchCard) batchCard.classList.remove('collapsed');
        
        // Highlight the batch being played
        document.querySelectorAll('.audio-batch-card').forEach(card => {
            card.classList.remove('playing');
        });
        batchCard.classList.add('playing');
        
        // Play first audio
        playNextSentence();
    } catch (error) {
        console.error('Error playing audio batch:', error);
    }
}

function playNextSentence() {
    if (!currentPlayingBatch || currentPlayingIndex >= currentPlayingBatch.files.length) {
        // Finished playing all sentences
        stopAudioPlayback(currentPlayingBatch.batch_id);
        return;
    }
    
    const file = currentPlayingBatch.files[currentPlayingIndex];
    const batchId = currentPlayingBatch.batch_id;
    const audioPlayer = document.getElementById(`audioPlayer_${batchId}`);
    const currentSentenceDisplay = document.getElementById(`currentSentence_${batchId}`);
    const batchContent = document.getElementById(`batchContent_${batchId}`);
    
    if (!audioPlayer) {
        console.error('Audio player not found');
        return;
    }
    
    // Update audio source - use relative_path or construct from path
    const audioPath = file.relative_path || file.path.replace(/\\/g, '/');
    audioPlayer.src = `/outputs/${audioPath}`;
    console.log('[Audio] Loading:', audioPlayer.src);
    audioPlayer.load();
    
    // Update display
    if (currentSentenceDisplay) {
        currentSentenceDisplay.textContent = `Playing ${currentPlayingIndex + 1}/${currentPlayingBatch.files.length}: ${file.prompt || file.text || ''}`;
    }
    
    // Highlight current sentence and manage button visibility
    if (batchContent) {
        batchContent.querySelectorAll('.audio-sentence-item').forEach((item, idx) => {
            const isActive = idx === currentPlayingIndex;
            item.classList.toggle('active', isActive);
            
            const sentenceIdx = item.getAttribute('data-sentence-index');
            const playBtn = document.getElementById(`playBtn_${batchId}_${sentenceIdx}`);
            const stopBtn = document.getElementById(`stopBtn_${batchId}_${sentenceIdx}`);
            
            if (isActive) {
                // Show stop button for active sentence
                if (playBtn) playBtn.style.display = 'none';
                if (stopBtn) stopBtn.style.display = 'inline-flex';
                // Scroll to active sentence
                item.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                // Show play button for inactive sentences
                if (playBtn) playBtn.style.display = 'inline-flex';
                if (stopBtn) stopBtn.style.display = 'none';
            }
        });
    }
    
    // Remove old event listeners
    audioPlayer.onended = null;
    audioPlayer.onerror = null;
    
    // Add new event listeners
    audioPlayer.onended = () => {
        currentPlayingIndex++;
        playNextSentence();
    };
    
    audioPlayer.onerror = (e) => {
        console.error('Audio playback error:', e);
        currentPlayingIndex++;
        playNextSentence();
    };
    
        // Apply global speed then play
    applyGlobalAudioSpeed(audioPlayer);
    audioPlayer.play().catch(err => {
        console.error('Failed to play audio:', err);
        currentPlayingIndex++;
        playNextSentence();
    });
}

function stopAudioPlayback(batchId) {
    if (batchId) {
        const audioPlayer = document.getElementById(`audioPlayer_${batchId}`);
        if (audioPlayer) {
            audioPlayer.pause();
            audioPlayer.src = '';
        }
        
        const playBtn = document.getElementById(`playBatch_${batchId}`);
        const stopBtn = document.getElementById(`stopBatch_${batchId}`);
        if (playBtn) playBtn.style.display = 'inline-flex';
        if (stopBtn) stopBtn.style.display = 'none';
        
        const currentSentenceDisplay = document.getElementById(`currentSentence_${batchId}`);
        if (currentSentenceDisplay) {
            currentSentenceDisplay.textContent = 'Select a sentence or click Play All';
        }
        
        const batchContent = document.getElementById(`batchContent_${batchId}`);
        if (batchContent) {
            batchContent.querySelectorAll('.audio-sentence-item').forEach(item => {
                item.classList.remove('active');
                
                // Reset all sentence buttons to play state
                const sentenceIdx = item.getAttribute('data-sentence-index');
                const playBtn = document.getElementById(`playBtn_${batchId}_${sentenceIdx}`);
                const stopBtn = document.getElementById(`stopBtn_${batchId}_${sentenceIdx}`);
                if (playBtn) playBtn.style.display = 'inline-flex';
                if (stopBtn) stopBtn.style.display = 'none';
            });
        }
        
        const batchCard = document.getElementById(`batch_${batchId}`);
        if (batchCard) batchCard.classList.remove('playing');
    }
    
    currentPlayingBatch = null;
    currentPlayingIndex = 0;
}

async function showFullTextModal(batchId) {
    const modal = document.getElementById('audioTextModal');
    const textarea = document.getElementById('audioFullTextArea');
    
    if (!modal || !textarea) return;
    
    try {
        // Fetch batch data fresh to get currently selected versions
        const response = await fetch('/api/browse_audio?folder=output');
        const data = await response.json();
        const batch = data.batches.find(b => b.batch_id === batchId);
        
        if (!batch) {
            console.error('[AUDIO] Batch not found:', batchId);
            showNotification('Batch not found', 'Error', 'error');
            return;
        }
        
        // Group files by sentence_index
        const sentenceGroups = {};
        batch.files.forEach(file => {
            const idx = file.sentence_index;
            if (!sentenceGroups[idx]) sentenceGroups[idx] = [];
            sentenceGroups[idx].push(file);
        });
        
        // Build full text from currently selected versions
        const sortedIndices = Object.keys(sentenceGroups).map(Number).sort((a, b) => a - b);
        const fullTextParts = [];
        
        sortedIndices.forEach(idx => {
            const versions = sentenceGroups[idx];
            // Check which version is currently selected in the UI
            const selectedVersionSelect = document.querySelector(`[data-sentence-index="${idx}"][data-batch="${batchId}"] .version-selector`);
            
            let selectedFile;
            if (selectedVersionSelect) {
                // Get the selected version from dropdown
                const selectedId = selectedVersionSelect.value;
                selectedFile = versions.find(v => v.id === selectedId);
            }
            
            // Fallback to newest version if no selector or not found
            if (!selectedFile) {
                versions.sort((a, b) => (b.version_number || 0) - (a.version_number || 0));
                selectedFile = versions[0];
            }
            
            const text = (selectedFile.prompt || selectedFile.text || '').trim();
            if (text) {
                fullTextParts.push(text);
            }
        });
        
        textarea.value = fullTextParts.join(' ');
        modal.style.display = 'flex';
        
    } catch (error) {
        console.error('[AUDIO] Error loading full text:', error);
        showNotification('Could not load full text', 'Error', 'error');
    }
}

function closeAudioTextModal() {
    const modal = document.getElementById('audioTextModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function copyAudioText() {
    const textarea = document.getElementById('audioFullTextArea');
    if (textarea) {
        textarea.select();
        document.execCommand('copy');
        
        // Visual feedback
        const copyBtn = document.getElementById('copyAudioTextBtn');
        if (copyBtn) {
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!';
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
            }, 2000);
        }
    }
}

// Edit Sentence Modal Functions
async function openEditSentenceModal(sentenceId, text) {
    const modal = document.getElementById('editSentenceModal');
    const textarea = document.getElementById('editSentenceTextArea');
    const idInput = document.getElementById('editSentenceId');
    
    if (modal && textarea && idInput) {
        textarea.value = text;
        idInput.value = sentenceId;
        
        // Fetch metadata to get TTS settings
        try {
            const response = await fetch('/api/browse_audio?folder=output');
            const data = await response.json();
            
            if (data.success && data.batches) {
                // Find the sentence in the batches
                let sentenceData = null;
                for (const batch of data.batches) {
                    sentenceData = batch.files.find(f => f.id === sentenceId);
                    if (sentenceData) break;
                }
                
                if (sentenceData) {
                    // Populate settings from metadata (Gradio API parameters)
                    document.getElementById('editTtsEngine').value = sentenceData.tts_engine || 'ChatterboxTTS';
                    document.getElementById('editSeed').value = sentenceData.seed || '';
                    document.getElementById('editTemperature').value = sentenceData.temperature || 0.8;
                    document.getElementById('editExaggeration').value = sentenceData.exaggeration || 0.5;
                    document.getElementById('editCfgWeight').value = sentenceData.cfg_weight || 0.5;
                    // Use chunk_size if available, fall back to max_chars for backward compatibility
                    document.getElementById('editChunkSize').value = sentenceData.chunk_size || sentenceData.max_chars || 300;
                    document.getElementById('editLanguage').value = sentenceData.language || 'en';
                    
                    // Update language dropdown state based on loaded engine
                    updateTTSLanguageState('editTtsEngine', 'editLanguage');
                }
            }
        } catch (error) {
            console.error('Error loading sentence metadata:', error);
            // Use defaults if fetch fails
            document.getElementById('editTtsEngine').value = 'ChatterboxTTS';
            document.getElementById('editSeed').value = '';
            document.getElementById('editTemperature').value = 0.8;
            document.getElementById('editExaggeration').value = 0.5;
            document.getElementById('editCfgWeight').value = 0.5;
            document.getElementById('editChunkSize').value = 300;
            document.getElementById('editSilence').value = 100;
            document.getElementById('editLanguage').value = 'en';
            
            // Update language dropdown state with default engine
            updateTTSLanguageState('editTtsEngine', 'editLanguage');
        }
        
        modal.style.display = 'flex';
        textarea.focus();
    }
}

function closeEditSentenceModal() {
    const modal = document.getElementById('editSentenceModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function regenerateSentence() {
    const sentenceId = document.getElementById('editSentenceId').value;
    const text = document.getElementById('editSentenceTextArea').value.trim();
    
    // Get TTS settings from modal (Gradio API parameters)
    const ttsEngine = document.getElementById('editTtsEngine').value || 'ChatterboxTTS';
    const seed = document.getElementById('editSeed').value.trim();
    const temperature = parseFloat(document.getElementById('editTemperature').value) || 0.8;
    const exaggeration = parseFloat(document.getElementById('editExaggeration').value) || 0.5;
    const cfgWeight = parseFloat(document.getElementById('editCfgWeight').value) || 0.5;
    const chunkSize = parseInt(document.getElementById('editChunkSize').value) || 300;
    const language = document.getElementById('editLanguage').value || 'en';
    
    if (!text) {
        showNotification('Text cannot be empty', 'Error', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/queue/tts/regenerate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sentence_id: sentenceId,
                text: text,
                tts_engine: ttsEngine,
                seed: seed ? parseInt(seed) : null,
                temperature,
                exaggeration,
                cfg_weight: cfgWeight,
                max_chars: chunkSize,  // Backend maps this to chunk_size
                silence_ms: 100,  // Not used in Gradio API, but keep for compatibility
                language
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(`Regeneration queued (version ${result.version_number})`, 'Success', 'success', 3000);
            closeEditSentenceModal();
            
            // Reload audio tab after a short delay to show the queued job
            setTimeout(() => {
                if (currentTab === 'audio') {
                    loadAudioTab();
                }
            }, 1000);
        } else {
            showNotification(result.error || 'Regeneration failed', 'Error', 'error');
        }
    } catch (error) {
        console.error('Error regenerating sentence:', error);
        showNotification('Error regenerating sentence', 'Error', 'error');
    }
}

// Switch between different versions of the same sentence
async function switchSentenceVersion(batchId, sentenceIndex, newFileId) {
    try {
        // Fetch the batch data to find the new file
        const response = await fetch('/api/browse_audio?folder=output');
        const data = await response.json();
        const batch = data.batches.find(b => b.batch_id === batchId);
        
        if (!batch) return;
        
        // Find the new version file
        const newFile = batch.files.find(f => f.id === newFileId);
        if (!newFile) return;
        
        // Update the sentence item display to show the new version's text
        const sentenceItem = document.querySelector(`[data-sentence-index="${sentenceIndex}"][data-batch="${batchId}"]`);
        if (sentenceItem) {
            const textElement = sentenceItem.querySelector('.audio-sentence-text');
            if (textElement) {
                textElement.textContent = newFile.prompt || newFile.text || '';
            }
            
            // Update the data-sentence-id attribute
            sentenceItem.setAttribute('data-sentence-id', newFileId);
        }
        
        // Recalculate total duration based on currently selected versions
        const sentenceGroups = {};
        batch.files.forEach(file => {
            const idx = file.sentence_index;
            if (!sentenceGroups[idx]) sentenceGroups[idx] = [];
            sentenceGroups[idx].push(file);
        });
        
        // Calculate new total duration
        let newTotalDuration = 0;
        Object.keys(sentenceGroups).forEach(idx => {
            const versions = sentenceGroups[idx];
            // Find which version is currently selected for this sentence
            const selectedVersionSelect = document.querySelector(`[data-sentence-index="${idx}"][data-batch="${batchId}"] .version-selector`);
            if (selectedVersionSelect) {
                const selectedId = selectedVersionSelect.value;
                const selectedFile = versions.find(v => v.id === selectedId);
                if (selectedFile) {
                    newTotalDuration += selectedFile.duration || 0;
                }
            } else {
                // No selector (only one version), use the first one
                versions.sort((a, b) => (b.version_number || 0) - (a.version_number || 0));
                newTotalDuration += versions[0].duration || 0;
            }
        });
        
        // Update the total duration display in the header
        const totalDurationDisplay = document.getElementById(`totalDuration_${batchId}`);
        if (totalDurationDisplay) {
            totalDurationDisplay.textContent = formatDuration(newTotalDuration);
        }
        
        // If this sentence is currently playing, update the player
        const audioPlayer = document.getElementById(`audioPlayer_${batchId}`);
        if (audioPlayer && currentPlayingBatch && currentPlayingBatch.batch_id === batchId) {
            // Find the index in the playing files array
            const playingIdx = currentPlayingBatch.files.findIndex(f => f.sentence_index === sentenceIndex);
            if (playingIdx !== -1 && playingIdx === currentPlayingIndex) {
                // Update the current file and replay
                currentPlayingBatch.files[playingIdx] = newFile;
                const audioPath = newFile.relative_path || newFile.path;
                                audioPlayer.src = `/outputs/${audioPath}`;
                audioPlayer.load();
                applyGlobalAudioSpeed(audioPlayer);
                audioPlayer.play();
            }
        }
        
        showNotification('Switched to version ' + (newFile.version_number || 0), 'Version Changed', 'success', 2000);
    } catch (error) {
        console.error('Error switching sentence version:', error);
        showNotification('Error switching version', 'Error', 'error');
    }
}

// Download functions for audio
async function downloadAudioSentence(fileId) {
    try {
        // Create a temporary link and trigger download
        const link = document.createElement('a');
        link.href = `/api/audio/download/${fileId}`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Download started', 'Success', 'success');
    } catch (error) {
        console.error('[AUDIO] Error downloading audio:', error);
        showNotification('Download failed', 'Error', 'error');
    }
}

async function downloadMergedAudio(batchId) {
    try {
        // Show loading notification
        showNotification('Merging audio files...', 'Info', 'info');
        
        // Fetch batch data to get all sentence indices
        const response = await fetch('/api/browse_audio?folder=output');
        const data = await response.json();
        const batch = data.batches.find(b => b.batch_id === batchId);
        
        if (!batch) {
            showNotification('Batch not found', 'Error', 'error');
            return;
        }
        
        // Get all unique sentence indices (to get selected versions)
        const sentenceGroups = {};
        batch.files.forEach(file => {
            const idx = file.sentence_index;
            if (!sentenceGroups[idx]) {
                sentenceGroups[idx] = [];
            }
            sentenceGroups[idx].push(file);
        });
        
        // Get the currently selected version for each sentence
        const sentenceIndices = [];
        Object.keys(sentenceGroups).forEach(idx => {
            const sentenceIndex = parseInt(idx);
            const sentenceItem = document.querySelector(`[data-sentence-index="${sentenceIndex}"][data-batch="${batchId}"]`);
            
            if (sentenceItem) {
                const selector = sentenceItem.querySelector('.version-selector');
                if (selector) {
                    // Use selected version from dropdown
                    const selectedFileId = selector.value;
                    const selectedFile = batch.files.find(f => f.id === selectedFileId);
                    if (selectedFile) {
                        sentenceIndices.push(selectedFile.sentence_index);
                    }
                } else {
                    // No selector, use the sentence_index directly
                    sentenceIndices.push(sentenceIndex);
                }
            } else {
                // Fallback: just include the sentence index
                sentenceIndices.push(sentenceIndex);
            }
        });
        
        // Remove duplicates and sort
        const uniqueIndices = [...new Set(sentenceIndices)].sort((a, b) => a - b);
        
        // Call backend to merge
        const mergeResponse = await fetch('/api/audio/merge_batch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                batch_id: batchId,
                sentence_indices: uniqueIndices
            })
        });
        
        if (mergeResponse.ok) {
            // Download the merged file
            const blob = await mergeResponse.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            
            // Get filename from Content-Disposition header or use default
            const contentDisposition = mergeResponse.headers.get('Content-Disposition');
            let filename = `merged_${batchId}.wav`;
            if (contentDisposition) {
                const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (match && match[1]) {
                    filename = match[1].replace(/['"]/g, '');
                }
            }
            
            link.download = filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            showNotification('Audio merged and download started', 'Success', 'success');
        } else {
            const errorData = await mergeResponse.json();
            showNotification(errorData.error || 'Failed to merge audio', 'Error', 'error');
        }
    } catch (error) {
        console.error('[AUDIO] Error merging audio:', error);
        showNotification('Failed to merge audio files', 'Error', 'error');
    }
}


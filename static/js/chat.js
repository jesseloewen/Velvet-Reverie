// Velvet Reverie - Chat: chat sessions, messages, story mode, autochat, conversation audio
// ============================================================================
// CHAT SYSTEM
// ============================================================================

function initializeChat() {
    console.log('[CHAT] Initializing chat system...');
    
    // Load Ollama models
    loadOllamaModels();
    
    // Load chat sessions
    loadChatSessions();
    
    // Event listeners
    const newChatBtn = document.getElementById('newChatBtn');
    const toggleChatSidebarBtn = document.getElementById('toggleChatSidebarBtn');
    const closeChatSidebarBtn = document.getElementById('closeChatSidebarBtn');
    const toggleChatParamsBtn = document.getElementById('toggleChatParamsBtn');
    const closeChatParamsBtn = document.getElementById('closeChatParamsBtn');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const chatInput = document.getElementById('chatInput');
    const chatModelSelector = document.getElementById('chatModelSelector');
    const generateNameBtn = document.getElementById('generateSessionNameBtn');
    
    if (newChatBtn) newChatBtn.addEventListener('click', createNewChatSession);
    if (toggleChatSidebarBtn) toggleChatSidebarBtn.addEventListener('click', toggleChatSidebar);
    if (closeChatSidebarBtn) closeChatSidebarBtn.addEventListener('click', toggleChatSidebar);
    if (toggleChatParamsBtn) toggleChatParamsBtn.addEventListener('click', toggleChatParams);
    if (closeChatParamsBtn) closeChatParamsBtn.addEventListener('click', toggleChatParams);
    if (chatSendBtn) chatSendBtn.addEventListener('click', () => sendChatMessage());
    if (chatModelSelector) chatModelSelector.addEventListener('change', updateCurrentSessionModel);
    if (generateNameBtn) generateNameBtn.addEventListener('click', generateSessionName);
    
    // Close sidebars when clicking backdrop (mobile)
    const chatSessionsSidebar = document.getElementById('chatSessionsSidebar');
    const chatParamsSidebar = document.getElementById('chatParamsSidebar');
    
    if (chatSessionsSidebar) {
        chatSessionsSidebar.addEventListener('click', (e) => {
            if (e.target === chatSessionsSidebar && !chatSessionsSidebar.classList.contains('collapsed')) {
                toggleChatSidebar();
            }
        });
    }
    
    if (chatParamsSidebar) {
        chatParamsSidebar.addEventListener('click', (e) => {
            if (e.target === chatParamsSidebar && !chatParamsSidebar.classList.contains('collapsed')) {
                toggleChatParams();
            }
        });
    }
    
    // Chat input handlers
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
        
        // Auto-resize textarea
        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = chatInput.scrollHeight + 'px';
        });
    }
    
    // Parameter sliders - update value displays and auto-save
    const paramInputs = [
        { id: 'chatTemperature', valueId: 'chatTemperatureValue' },
        { id: 'chatTopP', valueId: 'chatTopPValue' },
        { id: 'chatTopK', valueId: 'chatTopKValue' },
        { id: 'chatRepeatPenalty', valueId: 'chatRepeatPenaltyValue' }
    ];
    
    paramInputs.forEach(({ id, valueId }) => {
        const input = document.getElementById(id);
        const valueDisplay = document.getElementById(valueId);
        if (input && valueDisplay) {
            input.addEventListener('input', () => {
                valueDisplay.textContent = input.value;
                autoSaveChatParameters();
            });
        }
    });
    
    // Seed input - update display and auto-save
    const seedInput = document.getElementById('chatSeed');
    const seedValue = document.getElementById('chatSeedValue');
    const clearSeedBtn = document.getElementById('clearChatSeedBtn');
    if (seedInput && seedValue) {
        seedInput.addEventListener('input', () => {
            seedValue.textContent = seedInput.value || 'Random';
            autoSaveChatParameters();
        });
    }
    
    // Context size selector - auto-save on change
    const chatNumCtx = document.getElementById('chatNumCtx');
    if (chatNumCtx) {
        chatNumCtx.addEventListener('change', () => {
            const valueDisplay = document.getElementById('chatNumCtxValue');
            if (valueDisplay) {
                valueDisplay.textContent = chatNumCtx.value;
            }
            autoSaveChatParameters();
        });
    }
    
    // Session name and system prompt - auto-save on input with debouncing
    const chatSessionName = document.getElementById('chatSessionName');
    const chatSystemPrompt = document.getElementById('chatSystemPrompt');
    
    let saveTimeout = null;
    const debouncedSave = () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            autoSaveChatParameters();
        }, 500); // Wait 500ms after user stops typing
    };
    
    if (chatSessionName) {
        chatSessionName.addEventListener('input', debouncedSave);
    }
    if (chatSystemPrompt) {
        chatSystemPrompt.addEventListener('input', debouncedSave);
    }
    
    console.log('[CHAT] Chat system initialized');
}

async function loadOllamaModels() {
    try {
        const response = await fetch('/api/ollama/models');
        const data = await response.json();
        
        if (data.success && data.models) {
            chatModels = data.models;
            const selector = document.getElementById('chatModelSelector');
            if (selector) {
                selector.innerHTML = '';
                if (chatModels.length === 0) {
                    selector.innerHTML = '<option value="">No models available</option>';
                    selector.disabled = true;
                } else {
                    chatModels.forEach(model => {
                        const option = document.createElement('option');
                        option.value = model.name;
                        option.textContent = model.name;
                        selector.appendChild(option);
                    });
                    selector.disabled = false;
                }
            }
            console.log(`[CHAT] Loaded ${chatModels.length} Ollama models`);
        } else {
            console.error('[CHAT] Failed to load models:', data.error);
            showNotification('Failed to load Ollama models', 'Error', 'error');
        }
    } catch (error) {
        console.error('[CHAT] Error loading models:', error);
        showNotification('Ollama server not available', 'Error', 'error');
    }
}

async function loadChatSessions() {
    try {
        const response = await fetch('/api/chat/sessions');
        const data = await response.json();
        
        if (data.success) {
            chatSessions = data.sessions;
            
            // Update currentChatSession with fresh data from server if it exists
            if (currentChatSession) {
                const freshSession = chatSessions.find(s => s.session_id === currentChatSession.session_id);
                if (freshSession) {
                    // Update current session with fresh data (preserves session_id and all other fields)
                    const previousName = currentChatSession.chat_name;
                    console.log('[CHAT] Updating currentChatSession with fresh data from server');
                    currentChatSession = freshSession;
                    if (previousName !== freshSession.chat_name) {
                        syncActiveChatNameUI(freshSession.chat_name);
                    }
                } else {
                    // Current session was deleted, clear it
                    console.log('[CHAT] Current session no longer exists, clearing');
                    currentChatSession = null;
                    stopWholeChatAudioPlayback(false);
                    chatAutoScrollEnabled = true;
                    setChatScrollButtonVisibility(false);
                }
            }
            
            renderChatSessions();
            updateChatAudioControlsState();
            console.log(`[CHAT] Loaded ${chatSessions.length} chat sessions`);
        } else {
            console.error('[CHAT] Failed to load sessions:', data.error);
        }
    } catch (error) {
        console.error('[CHAT] Error loading sessions:', error);
    }
}

function renderChatSessions() {
    const sessionsList = document.getElementById('chatSessionsList');
    if (!sessionsList) return;
    
    if (chatSessions.length === 0) {
        sessionsList.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 2rem 1rem;">
                <p>No chat sessions yet</p>
                <p style="font-size: 0.875rem;">Click + to create a new chat</p>
            </div>
        `;
        return;
    }
    
    sessionsList.innerHTML = '';
    // Sessions are already sorted by updated_at from backend (most recent first)
    chatSessions.forEach(session => {
        const sessionItem = document.createElement('div');
        sessionItem.className = 'chat-session-item';
        if (currentChatSession && currentChatSession.session_id === session.session_id) {
            sessionItem.classList.add('active');
        }
        
        const date = new Date(session.updated_at || session.created_at);
        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        sessionItem.innerHTML = `
            <div class="chat-session-content">
                <div class="session-name">${escapeHtml(session.chat_name)}</div>
                <div class="session-model">${escapeHtml(session.model)}</div>
                <div class="session-date">${dateStr}</div>
            </div>
            <div class="chat-session-actions">
                <button class="chat-session-duplicate" data-session-id="${session.session_id}" title="Duplicate chat">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                </button>
                <button class="chat-session-delete" data-session-id="${session.session_id}" title="Delete chat">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        `;
        
        // Add click handler for session selection
        sessionItem.addEventListener('click', (e) => {
            // Don't select if clicking action buttons
            if (e.target.closest('.chat-session-actions')) return;
            selectChatSession(session.session_id);
        });
        
        sessionsList.appendChild(sessionItem);
    });
    
    // Add duplicate handlers
    sessionsList.querySelectorAll('.chat-session-duplicate').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const sessionId = btn.dataset.sessionId;
            openDuplicateChatModal(sessionId);
        });
    });
    
    // Add delete handlers
    sessionsList.querySelectorAll('.chat-session-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const sessionId = btn.dataset.sessionId;
            await deleteChatSession(sessionId);
        });
    });
}

async function createNewChatSession() {
    try {
        const defaultModel = chatModels.length > 0 ? chatModels[0].name : 'llama3.2';
        
        const response = await fetch('/api/chat/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_name: 'New Chat',
                model: defaultModel,
                system_prompt: '',
                temperature: 0.7,
                top_p: 0.9,
                top_k: 40,
                repeat_penalty: 1.1,
                num_ctx: 2048,
                seed: null
            })
        });
        
        const data = await response.json();
        if (data.success) {
            // Wait for sessions to load before selecting
            await loadChatSessions();
            // Now select the new session (loadChatSessions ensures it's in the list)
            await selectChatSession(data.session.session_id);
            showNotification('New chat session created', 'Success', 'success');
        } else {
            showNotification('Failed to create chat session', 'Error', 'error');
        }
    } catch (error) {
        console.error('[CHAT] Error creating session:', error);
        showNotification('Error creating chat session', 'Error', 'error');
    }
}

// Clear chat seed (set to random)
function clearChatSeed() {
    const seedInput = document.getElementById('chatSeed');
    const seedValue = document.getElementById('chatSeedValue');
    if (seedInput && seedValue) {
        seedInput.value = '';
        seedValue.textContent = 'Random';
        autoSaveChatParameters();
    }
}
async function selectChatSession(sessionId, skipPollingResume = false) {
    console.log('[CHAT] selectChatSession called with sessionId:', sessionId);
    if (isLoadingChatSession) {
        console.log('[CHAT] Already loading a session, skipping');
        return;
    }
    isLoadingChatSession = true;
    
    try {
        console.log('[CHAT] Fetching session data from API...');
        const response = await fetch(`/api/chat/sessions/${sessionId}`);
        const data = await response.json();
        console.log('[CHAT] Session data received:', data);
        
        if (data.success) {
            if (currentChatSession && currentChatSession.session_id !== data.session.session_id) {
                stopWholeChatAudioPlayback(false);
            }
            currentChatSession = data.session;
            if (typeof updateUrlState === 'function') {
                updateUrlState({ tab: 'chat', sessionId: sessionId });
            }
            chatAutoScrollEnabled = true;
            setChatScrollButtonVisibility(false);
            console.log('[CHAT] currentChatSession set to:', currentChatSession);
            console.log('[CHAT] session_id:', currentChatSession?.session_id);
            renderChatSessions(); // Update active state
            loadChatUI();
            await renderChatMessages();
            
            // Resume polling for any incomplete responses (e.g., after page reload)
            // But not if we're being called from a polling completion (skipPollingResume)
            if (!skipPollingResume) {
                // Check both incomplete messages in session AND jobs in queue
                const incompleteMessages = currentChatSession.messages.filter(m => 
                    m.role === 'assistant' && !m.completed && (m.response_id || m.message_id)
                );
                
                // Also check queue for this session's jobs
                try {
                    const queueResponse = await fetch('/api/queue');
                    const queueData = await queueResponse.json();
                    
                    if (queueData) {
                        const allJobs = [...(queueData.queue || []), queueData.active].filter(Boolean);
                        const sessionChatJobs = allJobs.filter(job => 
                            job.job_type === 'chat' && job.session_id === sessionId
                        );
                        
                        // Collect response_ids from both incomplete messages and queued jobs
                        const responseIds = new Set();
                        incompleteMessages.forEach(msg => {
                            const id = msg.response_id || msg.message_id;
                            if (id) responseIds.add(id);
                        });
                        sessionChatJobs.forEach(job => {
                            if (job.response_id) responseIds.add(job.response_id);
                        });
                        
                        // Start polling for all identified response IDs
                        responseIds.forEach(responseId => {
                            // Don't start if already polling
                            if (!chatPollingIntervals[responseId]) {
                                console.log(`[CHAT] Resuming polling for response: ${responseId}`);
                                startChatStreamingPolling(responseId);
                            }
                        });
                    }
                } catch (error) {
                    console.error('[CHAT] Error checking queue for resume:', error);
                    // Fallback: just poll incomplete messages
                    incompleteMessages.forEach(msg => {
                        const responseId = msg.response_id || msg.message_id;
                        if (!chatPollingIntervals[responseId]) {
                            console.log(`[CHAT] Resuming polling for incomplete response: ${responseId}`);
                            startChatStreamingPolling(responseId);
                        }
                    });
                }
            }
            
            console.log(`[CHAT] Loaded session: ${sessionId}`);
        } else {
            showNotification('Failed to load chat session', 'Error', 'error');
        }
    } catch (error) {
        console.error('[CHAT] Error loading session:', error);
        showNotification('Error loading chat session', 'Error', 'error');
    } finally {
        isLoadingChatSession = false;
    }
}

/**
 * Poll the session until its chat_name changes away from 'New Chat'.
 * This handles the race where auto_generate_first_chat_name() runs on the backend
 * after the message is marked completed, so the first loadChatSessions() call
 * returns before the new name is written.
 *
 * @param {string} sessionId - session to watch
 */
async function pollForChatSessionName(sessionId) {
    const MAX_WAIT_MS = 60 * 1000; // 60 seconds — Ollama can be slow
    const POLL_INTERVAL_MS = 1500;
    const startTime = Date.now();

    const poll = async () => {
        if (Date.now() - startTime > MAX_WAIT_MS) {
            console.log('[CHAT] Session name poll timed out for:', sessionId);
            return;
        }

        // Stop if the user has switched away from this session or the name is already updated
        if (!currentChatSession || currentChatSession.session_id !== sessionId) return;
        if (currentChatSession.chat_name !== 'New Chat') return;

        try {
            const resp = await fetch(`/api/chat/sessions/${sessionId}`);
            if (!resp.ok) { setTimeout(poll, POLL_INTERVAL_MS); return; }

            const data = await resp.json();
            if (!data.success) { setTimeout(poll, POLL_INTERVAL_MS); return; }

            const freshName = data.session?.chat_name;
            if (freshName && freshName !== 'New Chat') {
                console.log('[CHAT] Auto-generated name received:', freshName);

                // Update in-memory state
                currentChatSession.chat_name = freshName;

                // Update session list cache
                const idx = chatSessions.findIndex(s => s.session_id === sessionId);
                if (idx !== -1) {
                    chatSessions[idx].chat_name = freshName;
                }

                // Refresh UI
                syncActiveChatNameUI(freshName);
                renderChatSessions();
            } else {
                setTimeout(poll, POLL_INTERVAL_MS);
            }
        } catch (err) {
            console.error('[CHAT] Session name poll error:', err);
            setTimeout(poll, POLL_INTERVAL_MS);
        }
    };

    setTimeout(poll, POLL_INTERVAL_MS);
}

function syncActiveChatNameUI(chatName) {
    const safeName = chatName || 'New Chat';
    const chatTitle = document.getElementById('chatTitle');
    if (chatTitle) chatTitle.textContent = safeName;

    const chatSessionName = document.getElementById('chatSessionName');
    if (chatSessionName) chatSessionName.value = safeName;
}

function loadChatUI() {
    if (!currentChatSession) return;
    
    // Update title
    const chatTitle = document.getElementById('chatTitle');
    if (chatTitle) chatTitle.textContent = currentChatSession.chat_name;
    
    // Update model selector
    const modelSelector = document.getElementById('chatModelSelector');
    if (modelSelector) {
        modelSelector.value = currentChatSession.model;
        modelSelector.disabled = false;
    }
    
    // Update parameters
    document.getElementById('chatSessionName').value = currentChatSession.chat_name;
    document.getElementById('chatSystemPrompt').value = currentChatSession.system_prompt || '';
    document.getElementById('chatTemperature').value = currentChatSession.temperature || 0.7;
    document.getElementById('chatTopP').value = currentChatSession.top_p || 0.9;
    document.getElementById('chatTopK').value = currentChatSession.top_k || 40;
    document.getElementById('chatRepeatPenalty').value = currentChatSession.repeat_penalty || 1.1;
    document.getElementById('chatNumCtx').value = currentChatSession.num_ctx || 2048;
    document.getElementById('chatSeed').value = currentChatSession.seed || '';
    
    // Update value displays
    document.getElementById('chatTemperatureValue').textContent = currentChatSession.temperature || 0.7;
    document.getElementById('chatTopPValue').textContent = currentChatSession.top_p || 0.9;
    document.getElementById('chatTopKValue').textContent = currentChatSession.top_k || 40;
    document.getElementById('chatRepeatPenaltyValue').textContent = currentChatSession.repeat_penalty || 1.1;
    document.getElementById('chatNumCtxValue').textContent = currentChatSession.num_ctx || 2048;
    document.getElementById('chatSeedValue').textContent = currentChatSession.seed ? currentChatSession.seed : 'Random';
    
    // Enable all controls
    document.getElementById('chatSessionName').disabled = false;
    document.getElementById('chatSystemPrompt').disabled = false;
    document.getElementById('chatTemperature').disabled = false;
    document.getElementById('chatTopP').disabled = false;
    document.getElementById('chatTopK').disabled = false;
    document.getElementById('chatRepeatPenalty').disabled = false;
    document.getElementById('chatNumCtx').disabled = false;
    document.getElementById('chatSeed').disabled = false;
    document.getElementById('clearChatSeedBtn').disabled = false;
    
    const generateNameBtn = document.getElementById('generateSessionNameBtn');
    if (generateNameBtn) generateNameBtn.disabled = false;
    
    // Show input container
    const inputContainer = document.getElementById('chatInputContainer');
    if (inputContainer) inputContainer.style.display = 'flex';

    // Sync auto-TTS toggle state from session
    syncAutoTTSToggle('chat', currentChatSession);
}

function isScrolledToBottom(container, threshold = 50) {
    if (!container) return true;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    // Consider \"at bottom\" if within threshold pixels of bottom
    return scrollHeight - scrollTop - clientHeight < threshold;
}

function scrollToBottom(container) {
    if (!container) return;
    container.scrollTop = container.scrollHeight;
}

function setChatScrollButtonVisibility(visible) {
    const button = document.getElementById('chatScrollBottomBtn');
    if (!button) return;
    button.style.display = visible ? 'flex' : 'none';
}

function handleChatScroll() {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    if (!currentChatSession || currentChatSession.messages.length === 0) {
        chatAutoScrollEnabled = true;
        setChatScrollButtonVisibility(false);
        return;
    }
    const atBottom = isScrolledToBottom(container, 24);
    if (atBottom) {
        chatAutoScrollEnabled = true;
        setChatScrollButtonVisibility(false);
    } else {
        chatAutoScrollEnabled = false;
        setChatScrollButtonVisibility(true);
    }
}

function scrollChatToBottom() {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    scrollToBottom(container);
    chatAutoScrollEnabled = true;
    setChatScrollButtonVisibility(false);
}

function normalizeOutputAudioPath(path) {
    if (!path) return '';
    return String(path).replace(/\\/g, '/').replace(/^\/+/, '');
}

function buildOutputAudioUrl(outputPath) {
    const normalized = normalizeOutputAudioPath(outputPath);
    if (!normalized) return '';
    const encodedPath = normalized.split('/').map(segment => encodeURIComponent(segment)).join('/');
    return `/outputs/${encodedPath}`;
}

function getAudioMimeTypeFromPath(path) {
    const normalized = normalizeOutputAudioPath(path).toLowerCase();
    if (normalized.endsWith('.mp3')) return 'audio/mpeg';
    if (normalized.endsWith('.ogg')) return 'audio/ogg';
    if (normalized.endsWith('.flac')) return 'audio/flac';
    if (normalized.endsWith('.m4a') || normalized.endsWith('.aac')) return 'audio/mp4';
    return 'audio/wav';
}

function getConversationAudioSession(conversationType) {
    if (conversationType === 'story') {
        return (typeof currentStorySession !== 'undefined') ? currentStorySession : null;
    }
    if (conversationType === 'autochat') {
        return (typeof currentAutoSession !== 'undefined') ? currentAutoSession : null;
    }
    return currentChatSession;
}

function getConversationAudioDisplayName(conversationType) {
    if (conversationType === 'story') return 'Story';
    if (conversationType === 'autochat') return 'Auto Chat';
    return 'Chat';
}

function getConversationAudioContainerId(conversationType) {
    if (conversationType === 'story') return 'storyMessages';
    if (conversationType === 'autochat') return 'autochatMessages';
    return 'chatMessages';
}

function getConversationAudioAutoplayToggleId(conversationType) {
    if (conversationType === 'story') return 'storyAudioAutoplayToggle';
    if (conversationType === 'autochat') return 'autochatAudioAutoplayToggle';
    return 'chatAudioAutoplayToggle';
}

function getConversationAudioDownloadButtonId(conversationType) {
    if (conversationType === 'story') return 'storyDownloadAllAudioBtn';
    if (conversationType === 'autochat') return 'autochatDownloadAllAudioBtn';
    return 'chatDownloadAllAudioBtn';
}

function getConversationAudioDownloadEndpoint(conversationType, sessionId) {
    if (conversationType === 'story') {
        return `/api/story/sessions/${encodeURIComponent(sessionId)}/audio/download`;
    }
    if (conversationType === 'autochat') {
        return `/api/autochat/sessions/${encodeURIComponent(sessionId)}/audio/download`;
    }
    return `/api/chat/sessions/${encodeURIComponent(sessionId)}/audio/download`;
}

function getConversationAudioState(conversationType) {
    return conversationAudioPlaybackStates[conversationType] || conversationAudioPlaybackStates.chat;
}

function getConversationAudioPlayers(conversationType) {
    const container = document.getElementById(getConversationAudioContainerId(conversationType));
    if (!container) return [];

    return Array.from(container.querySelectorAll(`audio[data-conversation-audio="${conversationType}"]`))
        .sort((a, b) => (parseInt(a.dataset.messageIndex || '0', 10) - parseInt(b.dataset.messageIndex || '0', 10)));
}

function getConversationAudioPlayerByMessageIndex(conversationType, messageIndex) {
    const container = document.getElementById(getConversationAudioContainerId(conversationType));
    if (!container) return null;

    return container.querySelector(`audio[data-conversation-audio="${conversationType}"][data-message-index="${messageIndex}"]`);
}

function refreshConversationAudioQueue(conversationType) {
    const state = getConversationAudioState(conversationType);
    state.queue = getConversationAudioPlayers(conversationType)
        .map(player => parseInt(player.dataset.messageIndex || '-1', 10))
        .filter(index => index >= 0);
}

function initializeConversationAudioAutoplayHandlers() {
    ['chat', 'story', 'autochat'].forEach(bindConversationAudioAutoplayHandlers);
}

function bindConversationAudioAutoplayHandlers(conversationType) {
    const container = document.getElementById(getConversationAudioContainerId(conversationType));
    if (!container || container.dataset.autoplayHandlersBound === 'true') {
        return;
    }

    container.dataset.autoplayHandlersBound = 'true';

    container.addEventListener('play', event => {
        const player = event.target;
        if (!(player instanceof HTMLAudioElement)) return;
        if (player.dataset.conversationAudio !== conversationType) return;
        handleConversationAudioPlay(conversationType, player);
    }, true);

    container.addEventListener('ended', event => {
        const player = event.target;
        if (!(player instanceof HTMLAudioElement)) return;
        if (player.dataset.conversationAudio !== conversationType) return;
        handleConversationAudioEnded(conversationType, player);
    }, true);

    container.addEventListener('pause', event => {
        const player = event.target;
        if (!(player instanceof HTMLAudioElement)) return;
        if (player.dataset.conversationAudio !== conversationType) return;
        handleConversationAudioPause(conversationType, player);
    }, true);
}

function handleConversationAudioPlay(conversationType, player) {
    const state = getConversationAudioState(conversationType);
    if (!state.autoPlayEnabled) {
        return;
    }

    const messageIndex = parseInt(player.dataset.messageIndex || '-1', 10);
    if (messageIndex < 0) {
        return;
    }

    refreshConversationAudioQueue(conversationType);
    const position = state.queue.indexOf(messageIndex);
    if (position < 0) {
        return;
    }

    state.position = position;
    state.activePlayer = player;
    state.isPlaying = true;

    const nextIndex = state.queue[state.position + 1];
    if (nextIndex !== undefined) {
        const nextPlayer = getConversationAudioPlayerByMessageIndex(conversationType, nextIndex);
        if (nextPlayer) {
            nextPlayer.preload = 'auto';
        }
    }

    updateConversationAudioControlsState(conversationType);
}

async function handleConversationAudioEnded(conversationType, player) {
    const state = getConversationAudioState(conversationType);
    if (!state.autoPlayEnabled) {
        state.activePlayer = null;
        state.isPlaying = false;
        state.queue = [];
        state.position = -1;
        updateConversationAudioControlsState(conversationType);
        return;
    }

    const messageIndex = parseInt(player.dataset.messageIndex || '-1', 10);
    if (messageIndex < 0) {
        return;
    }

    refreshConversationAudioQueue(conversationType);
    const currentPosition = state.queue.indexOf(messageIndex);
    if (currentPosition < 0) {
        state.activePlayer = null;
        state.isPlaying = false;
        state.queue = [];
        state.position = -1;
        updateConversationAudioControlsState(conversationType);
        return;
    }

    state.position = currentPosition;
    const nextIndex = state.queue[state.position + 1];
    if (nextIndex === undefined) {
        state.activePlayer = null;
        state.isPlaying = false;
        state.queue = [];
        state.position = -1;
        updateConversationAudioControlsState(conversationType);
        return;
    }

    const nextPlayer = getConversationAudioPlayerByMessageIndex(conversationType, nextIndex);
    if (!nextPlayer) {
        state.activePlayer = null;
        state.isPlaying = false;
        state.queue = [];
        state.position = -1;
        updateConversationAudioControlsState(conversationType);
        return;
    }

    state.position += 1;
    state.activePlayer = nextPlayer;
    state.isPlaying = true;
    scrollConversationAudioPlayerIntoView(nextPlayer);

        try {
        applyGlobalAudioSpeed(nextPlayer);
        await nextPlayer.play();

        const upcomingIndex = state.queue[state.position + 1];
        if (upcomingIndex !== undefined) {
            const upcomingPlayer = getConversationAudioPlayerByMessageIndex(conversationType, upcomingIndex);
            if (upcomingPlayer) {
                upcomingPlayer.preload = 'auto';
            }
        }
    } catch (error) {
        console.warn(`[${conversationType.toUpperCase()} AUDIO] Failed to auto-play next clip`, error);
        state.activePlayer = null;
        state.isPlaying = false;
        state.queue = [];
        state.position = -1;
    }

    updateConversationAudioControlsState(conversationType);
}

function handleConversationAudioPause(conversationType, player) {
    const state = getConversationAudioState(conversationType);
    if (!state.autoPlayEnabled) {
        return;
    }

    if (state.activePlayer !== player || player.ended) {
        return;
    }

    state.activePlayer = null;
    state.isPlaying = false;
    state.queue = [];
    state.position = -1;
    updateConversationAudioControlsState(conversationType);
}

function scrollConversationAudioPlayerIntoView(player) {
    const targetEl = player?.closest('.chat-message') || player?.closest('.chat-message-audio') || player;
    if (!targetEl) return;

    // Keep scrolling constrained to the message list so tab/header UI does not jump.
    const messagesContainer = targetEl.closest('.chat-messages');
    if (!messagesContainer) return;

    const containerRect = messagesContainer.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const edgePadding = 12;

    if (targetRect.top < containerRect.top + edgePadding) {
        const delta = targetRect.top - containerRect.top - edgePadding;
        messagesContainer.scrollBy({ top: delta, behavior: 'smooth' });
        return;
    }

    if (targetRect.bottom > containerRect.bottom - edgePadding) {
        const delta = targetRect.bottom - containerRect.bottom + edgePadding;
        messagesContainer.scrollBy({ top: delta, behavior: 'smooth' });
    }
}

function updateConversationAutoplayToggleState(conversationType) {
    const state = getConversationAudioState(conversationType);
    const toggle = document.getElementById(getConversationAudioAutoplayToggleId(conversationType));
    if (!toggle) return;

    const session = getConversationAudioSession(conversationType);
    const hasSession = !!(session && session.session_id);
    const displayName = getConversationAudioDisplayName(conversationType);
    const labelElement = toggle.closest('.chat-audio-autoplay-toggle');

    toggle.checked = !!state.autoPlayEnabled;
    toggle.disabled = !hasSession;
    if (labelElement) {
        labelElement.classList.toggle('is-disabled', !hasSession);
    }

    const label = state.autoPlayEnabled
        ? `Auto play is on for ${displayName.toLowerCase()} audio. Next clip will play automatically.`
        : `Enable auto play for ${displayName.toLowerCase()} audio`;
    toggle.title = label;
    toggle.setAttribute('aria-label', label);
}

function updateConversationDownloadButtonIcon(conversationType) {
    const state = getConversationAudioState(conversationType);
    const button = document.getElementById(getConversationAudioDownloadButtonId(conversationType));
    if (!button) return;

    const displayName = getConversationAudioDisplayName(conversationType);
    if (state.isDownloading) {
        button.classList.add('is-busy');
        button.innerHTML = CONVERSATION_BUSY_ICON;
        const busyLabel = `Merging ${displayName.toLowerCase()} audio, please wait`;
        button.title = busyLabel;
        button.setAttribute('aria-label', busyLabel);
    } else {
        button.classList.remove('is-busy');
        button.innerHTML = CONVERSATION_DOWNLOAD_ICON;
        const idleLabel = `Merge and download all ${displayName.toLowerCase()} message audio`;
        button.title = idleLabel;
        button.setAttribute('aria-label', idleLabel);
    }
}

function updateConversationAudioControlsState(conversationType) {
    const state = getConversationAudioState(conversationType);
    const downloadBtn = document.getElementById(getConversationAudioDownloadButtonId(conversationType));
    const session = getConversationAudioSession(conversationType);
    const hasSession = !!(session && session.session_id);
    const hasAudio = getConversationAudioPlayers(conversationType).length > 0;

    if (downloadBtn) {
        downloadBtn.disabled = state.isDownloading || !hasSession || !hasAudio;
    }

    updateConversationAutoplayToggleState(conversationType);
    updateConversationDownloadButtonIcon(conversationType);
}

function updateChatAudioControlsState() {
    updateConversationAudioControlsState('chat');
}

function updateStoryAudioControlsState() {
    updateConversationAudioControlsState('story');
}

function updateAutochatAudioControlsState() {
    updateConversationAudioControlsState('autochat');
}

function stopConversationAudioPlayback(conversationType, options = {}) {
    const { showStoppedNotice = false, showFinishedNotice = false, hard = true } = options;
    const state = getConversationAudioState(conversationType);

    if (state.activePlayer && hard) {
        state.activePlayer.pause();
        state.activePlayer.currentTime = 0;
    }

    state.activePlayer = null;
    state.isPlaying = false;
    state.queue = [];
    state.position = -1;

    updateConversationAudioControlsState(conversationType);

    const displayName = getConversationAudioDisplayName(conversationType);
    if (showFinishedNotice) {
        showNotification(`Finished playing ${displayName.toLowerCase()} audio`, `${displayName} Audio`, 'success', 3000);
    } else if (showStoppedNotice) {
        showNotification(`Paused ${displayName.toLowerCase()} audio playback`, `${displayName} Audio`, 'info', 2500);
    }
}

function stopWholeChatAudioPlayback(showStoppedNotice = false, showFinishedNotice = false) {
    stopConversationAudioPlayback('chat', { showStoppedNotice, showFinishedNotice, hard: true });
}

function stopAllConversationAudioPlayback(showStoppedNotice = false) {
    stopConversationAudioPlayback('chat', { showStoppedNotice, hard: true });
    stopConversationAudioPlayback('story', { showStoppedNotice, hard: true });
    stopConversationAudioPlayback('autochat', { showStoppedNotice, hard: true });
}

function setConversationAudioAutoPlay(conversationType, enabled) {
    const session = getConversationAudioSession(conversationType);
    const displayName = getConversationAudioDisplayName(conversationType);
    const state = getConversationAudioState(conversationType);

    if (!enabled) {
        state.autoPlayEnabled = false;
        state.activePlayer = null;
        state.isPlaying = false;
        state.queue = [];
        state.position = -1;
        showNotification(`${displayName} audio auto play disabled`, `${displayName} Audio`, 'info', 2500);
        updateConversationAudioControlsState(conversationType);
        return;
    }

    if (!session || !session.session_id) {
        showNotification(`Please select a ${displayName.toLowerCase()} session first`, 'Info', 'warning', 3000);
        state.autoPlayEnabled = false;
        updateConversationAudioControlsState(conversationType);
        return;
    }

    state.autoPlayEnabled = true;

    const activePlayer = getConversationAudioPlayers(conversationType)
        .find(player => !player.paused && !player.ended && player.currentTime > 0);
    if (activePlayer) {
        handleConversationAudioPlay(conversationType, activePlayer);
    }

    showNotification(`${displayName} audio auto play enabled`, `${displayName} Audio`, 'success', 2500);
    updateConversationAudioControlsState(conversationType);
}

function setChatAudioAutoPlay(enabled) {
    setConversationAudioAutoPlay('chat', enabled);
}

function setStoryAudioAutoPlay(enabled) {
    setConversationAudioAutoPlay('story', enabled);
}

function setAutochatAudioAutoPlay(enabled) {
    setConversationAudioAutoPlay('autochat', enabled);
}

function downloadMessageAudio(audioPath) {
    const normalizedPath = normalizeOutputAudioPath(audioPath);
    const audioUrl = buildOutputAudioUrl(normalizedPath);
    if (!audioUrl) {
        showNotification('Audio file path is invalid', 'Error', 'error', 3000);
        return;
    }

    const downloadName = normalizedPath.split('/').pop() || 'message_audio.wav';
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = downloadName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function downloadChatMessageAudio(audioPath) {
    downloadMessageAudio(audioPath);
}

async function downloadWholeConversationAudio(conversationType) {
    const session = getConversationAudioSession(conversationType);
    const displayName = getConversationAudioDisplayName(conversationType);
    const state = getConversationAudioState(conversationType);

    if (!session || !session.session_id) {
        showNotification(`Please select a ${displayName.toLowerCase()} session first`, 'Info', 'warning', 3000);
        return;
    }

    const players = getConversationAudioPlayers(conversationType);
    if (players.length === 0) {
        showNotification(`No message audio found in this ${displayName.toLowerCase()} session`, 'Info', 'warning', 3500);
        return;
    }

    const endpoint = getConversationAudioDownloadEndpoint(conversationType, session.session_id);

    try {
        state.isDownloading = true;
        updateConversationAudioControlsState(conversationType);
        showNotification(`Preparing ${displayName.toLowerCase()} audio merge...`, `${displayName} Audio`, 'info', 3500);

        const response = await fetch(endpoint);
        if (!response.ok) {
            let errorMessage = `Failed to merge ${displayName.toLowerCase()} audio`;
            try {
                const errorData = await response.json();
                if (errorData?.error) {
                    errorMessage = errorData.error;
                }
            } catch (_error) {
                // Ignore JSON parse errors and keep fallback message.
            }
            throw new Error(errorMessage);
        }

        showNotification('Merge complete. Starting download...', `${displayName} Audio`, 'info', 2500);

        const blob = await response.blob();
        const disposition = response.headers.get('content-disposition') || '';
        let filename = `${conversationType}_audio_${Date.now()}.wav`;

        const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
        const basicMatch = disposition.match(/filename="?([^";]+)"?/i);
        if (utf8Match && utf8Match[1]) {
            filename = decodeURIComponent(utf8Match[1]);
        } else if (basicMatch && basicMatch[1]) {
            filename = basicMatch[1];
        }

        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);

        showNotification(`Merged ${displayName.toLowerCase()} audio download started`, 'Success', 'success', 4000);
    } catch (error) {
        console.error(`[${conversationType.toUpperCase()} AUDIO] Error downloading merged audio:`, error);
        showNotification(error.message || `Failed to download merged ${displayName.toLowerCase()} audio`, 'Error', 'error', 4500);
    } finally {
        state.isDownloading = false;
        updateConversationAudioControlsState(conversationType);
    }
}

async function downloadWholeChatAudio() {
    await downloadWholeConversationAudio('chat');
}

async function downloadWholeStoryAudio() {
    await downloadWholeConversationAudio('story');
}

async function downloadWholeAutochatAudio() {
    await downloadWholeConversationAudio('autochat');
}

function createConversationAudioElement(conversationType, audioPath, messageIndex) {
    const normalizedPath = normalizeOutputAudioPath(audioPath);
    const audioUrl = buildOutputAudioUrl(normalizedPath);
    if (!audioUrl) {
        return null;
    }

    const audioContainer = document.createElement('div');
    audioContainer.className = 'chat-message-audio';

    const audioHeader = document.createElement('div');
    audioHeader.className = 'chat-message-audio-header';

    const audioLabel = document.createElement('div');
    audioLabel.className = 'chat-audio-label';
    audioLabel.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
        <span>TTS Audio</span>
    `;

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'chat-action-btn chat-audio-download-btn';
    downloadBtn.title = 'Download this message audio';
    downloadBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>Download</span>
    `;
    downloadBtn.onclick = () => downloadMessageAudio(normalizedPath);

    audioHeader.appendChild(audioLabel);
    audioHeader.appendChild(downloadBtn);

        const audioEl = document.createElement('audio');
    audioEl.controls = true;
    audioEl.preload = 'none';
    audioEl.style.width = '100%';
    audioEl.dataset.conversationAudio = conversationType;
    audioEl.dataset.messageIndex = String(messageIndex);
    applyGlobalAudioSpeed(audioEl);

    const sourceEl = document.createElement('source');
    sourceEl.src = audioUrl;
    sourceEl.type = getAudioMimeTypeFromPath(normalizedPath);
    audioEl.appendChild(sourceEl);
    audioEl.appendChild(document.createTextNode('Your browser does not support the audio element.'));

    audioContainer.appendChild(audioHeader);
    audioContainer.appendChild(audioEl);
    return audioContainer;
}

function buildConversationAudioHtml(conversationType, audioPath, messageIndex) {
    const normalizedPath = normalizeOutputAudioPath(audioPath);
    const audioUrl = buildOutputAudioUrl(normalizedPath);
    if (!audioUrl) {
        return '';
    }

    const encodedPath = encodeURIComponent(normalizedPath);
    const audioMime = getAudioMimeTypeFromPath(normalizedPath);

    return `
        <div class="chat-message-audio">
            <div class="chat-message-audio-header">
                <div class="chat-audio-label">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                    </svg>
                    <span>TTS Audio</span>
                </div>
                <button class="chat-action-btn chat-audio-download-btn" title="Download this message audio" onclick="downloadMessageAudio(decodeURIComponent('${encodedPath}')); return false;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    <span>Download</span>
                </button>
            </div>
            <audio controls preload="none" style="width: 100%;" data-conversation-audio="${conversationType}" data-message-index="${messageIndex}">
                <source src="${audioUrl}" type="${audioMime}">
                Your browser does not support the audio element.
            </audio>
        </div>
    `;
}

async function renderChatMessages() {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) return;

    if (!currentChatSession || currentChatSession.messages.length === 0) {
        messagesContainer.innerHTML = `
            <div class="chat-empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <h3>Start the conversation</h3>
                <p>Type a message below to begin chatting</p>
            </div>
        `;
        // Clear token count display and context bar
        const tokenDisplay = document.getElementById('chatTotalTokens');
        if (tokenDisplay) tokenDisplay.textContent = '';
        const contextBar = document.getElementById('chatContextBar');
        if (contextBar) contextBar.style.width = '0%';
        const contextLabel = document.getElementById('chatContextLabel');
        if (contextLabel) contextLabel.textContent = '';
        stopWholeChatAudioPlayback(false);
        updateChatAudioControlsState();
        chatAutoScrollEnabled = true;
        setChatScrollButtonVisibility(false);
        return;
    }
    
    // Get queue status to check for queued/generating AI responses only
    const queueStatus = await getQueueStatus();
    const allJobs = [...(queueStatus.queue || []), queueStatus.active].filter(Boolean);
    const chatJobsInQueue = allJobs.filter(job => 
        job.job_type === 'chat' && job.session_id === currentChatSession.session_id
    );
    
    messagesContainer.innerHTML = '';
    currentChatSession.messages.forEach((message, index) => {
        // Only show loading bubbles for AI responses (not user messages)
        let isLoading = false;
        if (message.role === 'assistant') {
            // Check if this AI response is still queued/generating
            const isQueued = chatJobsInQueue.some(job => 
                job.response_id === message.response_id || job.response_id === message.message_id
            );
            isLoading = isQueued || (!message.completed && !message.content);
        }
        // User messages never show loading bubbles - they appear immediately
        
        // Check if this is the last message of its type
        const isLastUserMessage = message.role === 'user' && 
            index === currentChatSession.messages.map(m => m.role).lastIndexOf('user');
        const isLastAIMessage = message.role === 'assistant' && 
            index === currentChatSession.messages.length - 1;
        
        const messageEl = createChatMessageElement(message, index, isLoading, isLastUserMessage, isLastAIMessage);
        messagesContainer.appendChild(messageEl);
    });

    // Calculate and display total token count and context usage
    const totalTokens = calculateTotalTokens(currentChatSession.messages);
    const maxContext = currentChatSession.num_ctx || 2048;
    const contextUsage = (totalTokens / maxContext) * 100;
    
    const tokenDisplay = document.getElementById('chatTotalTokens');
    if (tokenDisplay) {
        tokenDisplay.textContent = `Total: ${totalTokens.toLocaleString()} tokens`;
    }
    
    // Update context progress bar
    const contextBar = document.getElementById('chatContextBar');
    const contextLabel = document.getElementById('chatContextLabel');
    if (contextBar && contextLabel) {
        contextBar.style.width = `${Math.min(contextUsage, 100)}%`;
        
        // Color code based on usage
        if (contextUsage < 70) {
            contextBar.style.backgroundColor = 'var(--success-color, #34d399)';
        } else if (contextUsage < 90) {
            contextBar.style.backgroundColor = 'var(--warning-color, #fbbf24)';
        } else {
            contextBar.style.backgroundColor = 'var(--error-color, #ff3b30)';
        }
        
        contextLabel.textContent = `${contextUsage.toFixed(1)}% of ${maxContext.toLocaleString()} context`;
    }

    if (chatAutoScrollEnabled) {
        scrollToBottom(messagesContainer);
        setChatScrollButtonVisibility(false);
    } else {
        setChatScrollButtonVisibility(true);
    }

    updateChatAudioControlsState();
}

function createChatMessageElement(message, messageIndex = -1, isLoading = false, isLastUserMessage = false, isLastAIMessage = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${message.role}`;
    if (isLoading) messageDiv.classList.add('loading');
    
    // Use response_id for AI messages, message_id for user messages
    const messageId = message.response_id || message.message_id || '';
    const branchId = message.branch_id || '';
    messageDiv.dataset.messageId = messageId;
    messageDiv.dataset.branchId = branchId;
    
    const avatar = document.createElement('div');
    avatar.className = 'chat-message-avatar';
    avatar.textContent = message.role === 'user' ? 'U' : 'AI';
    
    // Create wrapper for name, time, and content
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-message-wrapper';
    
    // Create header with name, time, and token count
    const header = document.createElement('div');
    header.className = 'chat-message-header';
    const displayName = message.role === 'user' ? 'You' : 'Assistant';
    const tokenCount = estimateTokenCount(message.content || '');
    header.innerHTML = `
        <span class="chat-message-name">${displayName}</span>
        <span class="chat-message-meta">
            <span class="chat-message-tokens" title="Estimated tokens">${tokenCount} tokens</span>
            <span class="chat-message-time">${formatMessageTime(message.timestamp)}</span>
        </span>
    `;
    
    const content = document.createElement('div');
    content.className = 'chat-message-content';
    content.dataset.originalContent = message.content; // Store original content for edit cancel
    
    // Check if this is an error message
    const isError = message.error === true;
    
    if (isLoading) {
        content.innerHTML = `
            <div class="chat-loading-dots">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
            </div>
        `;
    } else {
        // Format message content (basic markdown support)
        const formattedContent = formatChatMessage(message.content);
        content.innerHTML = formattedContent;
        
        // Apply error styling if needed
        if (isError) {
            content.style.color = 'var(--error-color)';
        }
    }
    
    wrapper.appendChild(header);
    
    // Add thinking section for assistant messages if thinking content exists
    if (message.role === 'assistant') {
        const hasThinking = message.thinking || (isLoading && message.role === 'assistant');
        if (hasThinking) {
            const thinkingSection = document.createElement('div');
            thinkingSection.className = 'chat-thinking-section';
            
            const thinkingHeader = document.createElement('div');
            thinkingHeader.className = 'chat-thinking-header';
            thinkingHeader.onclick = function() {
                const content = this.nextElementSibling;
                const chevron = this.querySelector('.chat-thinking-chevron');
                const isOpen = content.style.display !== 'none';
                content.style.display = isOpen ? 'none' : 'block';
                chevron.textContent = isOpen ? '▶' : '▼';
            };
            
            const thinkingDone = message.thinking_completed || (message.thinking && !isLoading);
            thinkingHeader.innerHTML = `
                <span class="chat-thinking-chevron">▶</span>
                <span class="chat-thinking-label">Thinking</span>
                ${!thinkingDone ? '<span class="chat-thinking-status">thinking...</span>' : ''}
            `;
            
            const thinkingContent = document.createElement('div');
            thinkingContent.className = 'chat-thinking-content';
            thinkingContent.style.display = 'none';
            thinkingContent.innerHTML = message.thinking ? formatChatMessage(message.thinking) : '<em>Thinking...</em>';
            
            thinkingSection.appendChild(thinkingHeader);
            thinkingSection.appendChild(thinkingContent);
            wrapper.appendChild(thinkingSection);
        }
    }
    
    wrapper.appendChild(content);
    
    // Add audio player if message has TTS audio
    if (message.tts_audio) {
        const audioContainer = createConversationAudioElement('chat', message.tts_audio, messageIndex);
        if (audioContainer) {
            wrapper.appendChild(audioContainer);
        }
    }
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(wrapper);
    
    // Create button container for all action buttons
    const btnContainer = document.createElement('div');
    btnContainer.className = 'chat-message-actions';
    
    // Branch navigation arrows (show if message has siblings)
    if (!isLoading && branchId) {
        // Check for siblings by fetching from session data
        const siblings = getSiblingsForMessage(message);
        if (siblings.length > 1) {
            const currentIndex = siblings.findIndex(s => s.branch_id === branchId);
            const branchInfo = document.createElement('span');
            branchInfo.className = 'branch-indicator';
            branchInfo.textContent = `${currentIndex + 1}/${siblings.length}`;
            branchInfo.title = 'Branch ' + (currentIndex + 1) + ' of ' + siblings.length;
            btnContainer.appendChild(branchInfo);
            
            // Previous branch button
            if (currentIndex > 0) {
                const prevBtn = document.createElement('button');
                prevBtn.className = 'branch-nav-btn';
                prevBtn.title = 'Previous branch';
                prevBtn.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                `;
                prevBtn.onclick = () => switchToBranch(siblings[currentIndex - 1].branch_id);
                btnContainer.appendChild(prevBtn);
            }
            
            // Next branch button
            if (currentIndex < siblings.length - 1) {
                const nextBtn = document.createElement('button');
                nextBtn.className = 'branch-nav-btn';
                nextBtn.title = 'Next branch';
                nextBtn.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                `;
                nextBtn.onclick = () => switchToBranch(siblings[currentIndex + 1].branch_id);
                btnContainer.appendChild(nextBtn);
            }
        }
    }
    
    // Copy button on all messages
    if (!isLoading && message.content) {
        const copyBtn = document.createElement('button');
        copyBtn.className = 'chat-action-btn';
        copyBtn.title = 'Copy message';
        copyBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
        `;
        copyBtn.onclick = () => copyChatMessage(message.content, copyBtn);
        btnContainer.appendChild(copyBtn);
        
        // Send to TTS button - navigates to TTS tab with text
        const sendTTSBtn = document.createElement('button');
        sendTTSBtn.className = 'chat-action-btn';
        sendTTSBtn.title = 'Send to TTS tab';
        sendTTSBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
        `;
        sendTTSBtn.onclick = () => sendToTTS(message.content);
        btnContainer.appendChild(sendTTSBtn);
        
        // TTS Now button - queues immediately with current settings
        const ttsNowBtn = document.createElement('button');
        ttsNowBtn.className = 'chat-action-btn';
        ttsNowBtn.title = 'Generate TTS now';
        ttsNowBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
        `;
        // Pass both text and message ID to ttsNow
        ttsNowBtn.onclick = () => ttsNow(message.content, messageId);
        btnContainer.appendChild(ttsNowBtn);
        
        // Edit button on all messages
        const editBtn = document.createElement('button');
        editBtn.className = 'chat-action-btn';
        editBtn.title = 'Edit message';
        editBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
        `;
        const messageIndex = currentChatSession?.messages.findIndex(m => 
            (m.message_id && m.message_id === messageId) || 
            (m.response_id && m.response_id === message.response_id)
        );
        editBtn.onclick = () => editChatMessage(messageDiv, messageIndex);
        btnContainer.appendChild(editBtn);
        
        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'chat-action-btn';
        deleteBtn.title = 'Delete message';
        deleteBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
        `;
        deleteBtn.onclick = () => deleteChatMessage(messageIndex);
        btnContainer.appendChild(deleteBtn);
    }
    
    // Add button container to message if it has any buttons
    if (btnContainer.children.length > 0) {
        wrapper.appendChild(btnContainer);
    }
    
    return messageDiv;
}

// Helper function to get siblings for a message
function getSiblingsForMessage(message) {
    if (!currentChatSession || !message) return [];
    
    const parentId = message.parent_id;
    const siblings = [];
    
    // Find all messages with same parent_id
    for (const msg of currentChatSession.messages) {
        if (msg.parent_id === parentId && msg.branch_id) {
            siblings.push({
                branch_id: msg.branch_id,
                message_id: msg.message_id || msg.response_id,
                content: msg.content
            });
        }
    }
    
    return siblings;
}

// Switch to a different branch
async function switchToBranch(branchId) {
    if (!currentChatSession || !branchId) return;
    
    try {
        const response = await fetch('/api/chat/branch/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: currentChatSession.session_id,
                branch_id: branchId
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to switch branch');
        }
        
        const result = await response.json();
        if (result.success) {
            // Update active path
            currentBranchPath = result.active_path || [];
            
            // Reload session to get updated messages
            await selectChatSession(currentChatSession.session_id, true);
            
            showNotification('Switched to alternate branch', 'Success', 'success');
        }
    } catch (error) {
        console.error('[BRANCH] Error switching branch:', error);
        showNotification('Failed to switch branch: ' + error.message, 'Error', 'error');
    }
}

function formatChatMessage(text) {
    if (!text) return '';
    
    // Trim whitespace to prevent blank lines at start/end
    text = text.trim();
    
    // Escape HTML
    let formatted = escapeHtml(text);
    
    // Convert markdown-style code blocks
    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code class="language-${lang || ''}">${code}</code></pre>`;
    });
    
    // Convert inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Convert line breaks to <br>
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
}

// Make globally accessible
window.formatChatMessage = formatChatMessage;

// Estimate token count for text (rough approximation)
function estimateTokenCount(text) {
    if (!text) return 0;
    
    // Remove extra whitespace
    const cleaned = text.trim().replace(/\s+/g, ' ');
    
    // Rough estimation: ~1.3 tokens per word for English text
    // This accounts for punctuation, common words, etc.
    const words = cleaned.split(' ').length;
    const estimated = Math.ceil(words * 1.3);
    
    return estimated;
}

// Calculate total token count for all messages in session
function calculateTotalTokens(messages) {
    if (!messages || !Array.isArray(messages)) return 0;
    
    return messages.reduce((total, msg) => {
        return total + estimateTokenCount(msg.content || '');
    }, 0);
}

function formatMessageTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function sendChatMessage(messageText = null) {
    console.log('[CHAT] sendChatMessage called - currentChatSession:', currentChatSession);
    
    if (!currentChatSession) {
        console.error('[CHAT] No current session');
        showNotification('Please select or create a chat session', 'Info', 'warning');
        return;
    }
    
    const chatInput = document.getElementById('chatInput');
    const message = messageText || chatInput.value.trim();
    
    if (!message) {
        console.log('[CHAT] No message to send');
        return;
    }
    savePromptToHistory(message, 'chat');
    
    const sessionId = currentChatSession.session_id;
    
    if (!sessionId) {
        console.error('[CHAT] Current session has no session_id:', currentChatSession);
        showNotification('Invalid session. Please select or create a chat session', 'Error', 'error');
        currentChatSession = null;
        chatAutoScrollEnabled = true;
        setChatScrollButtonVisibility(false);
        return;
    }
    
    console.log('[CHAT] Sending message - sessionId:', sessionId, 'message:', message);
    
    // Clear input
    chatInput.value = '';
    chatInput.style.height = 'auto';
    
    // Disable input while sending
    chatInput.disabled = true;
    const sendBtn = document.getElementById('chatSendBtn');
    if (sendBtn) sendBtn.disabled = true;
    
    try {
        // Send message to API
        const payload = {
            session_id: sessionId,
            message: message
        };
        console.log('[CHAT] Sending payload:', payload);
        
        const response = await fetch('/api/chat/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        console.log('[CHAT] Response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[CHAT] Server error:', response.status, errorText);
            throw new Error(`Server returned ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        console.log('[CHAT] Response data:', data);
        
        if (data.success) {
            console.log('[CHAT] Message queued, response_id:', data.response_id);
            
            // Start polling immediately - it will sync messages from backend and update DOM
            // This approach ensures backend is source of truth and avoids local/remote conflicts
            startChatStreamingPolling(data.response_id);
        } else {
            console.error('[CHAT] Failed to send message:', data.error || 'Unknown error');
            showNotification(data.error || 'Failed to send message', 'Error', 'error');
            
            // Reload session to remove any partially added messages (only if session still exists)
            if (currentChatSession && currentChatSession.session_id) {
                await selectChatSession(currentChatSession.session_id, true);
            }
        }
    } catch (error) {
        console.error('[CHAT] Error sending message:', error);
        showNotification('Error sending message: ' + error.message, 'Error', 'error');
        
        // Reload session to ensure consistent state (only if session still exists)
        if (currentChatSession && currentChatSession.session_id) {
            await selectChatSession(currentChatSession.session_id, true);
        }
    } finally {
        // Re-enable input
        chatInput.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        chatInput.focus();
    }
}

async function deleteChatMessage(messageIndex) {
    if (!currentChatSession || messageIndex === -1) return;
    
    const message = currentChatSession.messages[messageIndex];
    if (!message) return;
    
    // Show confirmation dialog
    const confirmed = await showConfirm(
        'Are you sure you want to delete this message? This action cannot be undone.',
        'Delete Message'
    );
    
    if (!confirmed) return;
    
    try {
        // Remove message from array
        currentChatSession.messages.splice(messageIndex, 1);
        
        // Save to backend
        const response = await fetch(`/api/chat/sessions/${currentChatSession.session_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: currentChatSession.messages
            })
        });
        
        const data = await response.json();
        if (data.success) {
            currentChatSession = data.session;
            await renderChatMessages();
            showNotification('Message deleted', 'Success', 'success');
        } else {
            showNotification('Failed to delete message', 'Error', 'error');
        }
    } catch (error) {
        console.error('[CHAT] Error deleting message:', error);
        showNotification('Error deleting message', 'Error', 'error');
    }
}

function editChatMessage(messageDiv, messageIndex) {
    if (!currentChatSession || messageIndex === -1) return;
    
    const message = currentChatSession.messages[messageIndex];
    if (!message) return;
    
    const contentEl = messageDiv.querySelector('.chat-message-content');
    const originalContent = message.content;
    
    // Create editable textarea
    const textarea = document.createElement('textarea');
    textarea.className = 'chat-edit-textarea';
    textarea.value = originalContent;
    textarea.style.width = '100%';
    textarea.style.minHeight = '200px';
    textarea.style.maxHeight = '60vh';
    textarea.style.background = 'var(--bg-secondary)';
    textarea.style.border = '1px solid var(--border-color)';
    textarea.style.borderRadius = '8px';
    textarea.style.padding = '0.75rem';
    textarea.style.color = 'var(--text-primary)';
    textarea.style.fontFamily = 'inherit';
    textarea.style.fontSize = 'inherit';
    textarea.style.resize = 'vertical';
    textarea.style.lineHeight = '1.5';
    
    // Create action buttons
    const actionsDiv = document.createElement('div');
    actionsDiv.style.display = 'flex';
    actionsDiv.style.gap = '0.5rem';
    actionsDiv.style.marginTop = '0.5rem';
    
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.className = 'btn btn-primary';
    saveBtn.style.fontSize = '0.875rem';
    saveBtn.style.padding = '0.375rem 0.75rem';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.style.fontSize = '0.875rem';
    cancelBtn.style.padding = '0.375rem 0.75rem';
    
    actionsDiv.appendChild(saveBtn);
    actionsDiv.appendChild(cancelBtn);
    
    // Replace content with textarea
    const originalHTML = contentEl.innerHTML;
    contentEl.innerHTML = '';
    contentEl.appendChild(textarea);
    contentEl.appendChild(actionsDiv);
    
    // Hide action buttons temporarily and add editing class
    const btnContainer = messageDiv.querySelector('.chat-message-actions');
    if (btnContainer) btnContainer.style.display = 'none';
    messageDiv.classList.add('editing');
    
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    
    // Cancel handler
    cancelBtn.onclick = () => {
        contentEl.innerHTML = originalHTML;
        if (btnContainer) btnContainer.style.display = '';
        messageDiv.classList.remove('editing');
    };
    
    // Save handler
    saveBtn.onclick = async () => {
        const newContent = textarea.value.trim();
        if (!newContent) {
            showNotification('Message cannot be empty', 'Error', 'error');
            return;
        }
        
        if (newContent === originalContent) {
            cancelBtn.onclick();
            return;
        }
        
        // Update message content
        currentChatSession.messages[messageIndex].content = newContent;
        
        // Save to backend
        try {
            const response = await fetch(`/api/chat/sessions/${currentChatSession.session_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: currentChatSession.messages
                })
            });
            
            const data = await response.json();
            if (data.success) {
                currentChatSession = data.session;
                await renderChatMessages();
                showNotification('Message updated', 'Success', 'success');
            } else {
                showNotification('Failed to update message', 'Error', 'error');
            }
        } catch (error) {
            console.error('[CHAT] Error updating message:', error);
            showNotification('Error updating message', 'Error', 'error');
        }
    };
}

async function refreshCurrentSession() {
    if (!currentChatSession) return false;
    
    try {
        const response = await fetch(`/api/chat/sessions/${currentChatSession.session_id}`);
        const data = await response.json();
        
        if (data.success) {
            currentChatSession = data.session;
            await renderChatMessages();
            return true;
        }
        console.error('[CHAT] Failed to refresh session:', data.error);
        return false;
    } catch (error) {
        console.error('[CHAT] Error refreshing session:', error);
        return false;
    }
}

function startChatStreamingPolling(responseId) {
    if (!currentChatSession) return;
    
    // Clear existing polling for this response if any
    if (chatPollingIntervals[responseId]) {
        clearInterval(chatPollingIntervals[responseId]);
    }
    
    const sessionId = currentChatSession.session_id;
    let lastContent = '';
    let lastThinking = '';
    let pollCount = 0;
    const startTime = Date.now();
    const MAX_POLL_DURATION = 10 * 60 * 1000; // 10 minutes timeout
    
    const pollSession = async () => {
        pollCount++;
        
        // Check timeout
        if (Date.now() - startTime > MAX_POLL_DURATION) {
            console.error('[CHAT] Polling timeout for response:', responseId);
            if (chatPollingIntervals[responseId]) {
                clearInterval(chatPollingIntervals[responseId]);
                delete chatPollingIntervals[responseId];
            }
            // Show error in message
            const messagesContainer = document.getElementById('chatMessages');
            if (messagesContainer) {
                const messageEl = messagesContainer.querySelector(`[data-message-id="${responseId}"]`);
                if (messageEl) {
                    const contentEl = messageEl.querySelector('.chat-message-content');
                    if (contentEl) {
                        contentEl.innerHTML = '<span style="color: var(--error-color);">⚠ Response timeout - please try again</span>';
                        messageEl.classList.remove('loading');
                    }
                }
            }
            return;
        }
        
        try {
            const response = await fetch(`/api/chat/sessions/${sessionId}`);
            const data = await response.json();
            
            if (!data.success) {
                console.error('[CHAT] Failed to poll session');
                if (chatPollingIntervals[responseId]) {
                    clearInterval(chatPollingIntervals[responseId]);
                    delete chatPollingIntervals[responseId];
                }
                return;
            }
            
            const session = data.session;
            const message = session.messages.find(m => 
                m.message_id === responseId || m.response_id === responseId
            );
            
            if (!message) {
                console.warn(`[CHAT] Message ${responseId} not found in session`);
                return;
            }
            
            // CRITICAL: Always update to latest session from backend
            // This ensures we have ALL messages, not just the one we're polling
            const oldSession = currentChatSession;
            if (currentChatSession && currentChatSession.session_id === sessionId) {
                currentChatSession = session;

                // Reflect server-side auto-generated title immediately.
                const oldName = oldSession ? oldSession.chat_name : null;
                if (oldName !== session.chat_name) {
                    syncActiveChatNameUI(session.chat_name);

                    const sessionIndex = chatSessions.findIndex(s => s.session_id === sessionId);
                    if (sessionIndex !== -1) {
                        chatSessions[sessionIndex].chat_name = session.chat_name;
                        chatSessions[sessionIndex].updated_at = session.updated_at;
                        renderChatSessions();
                    }
                }
            }
            
            const currentContent = message.content || '';
            const currentThinking = message.thinking || '';
            const contentChanged = currentContent !== lastContent;
            const thinkingChanged = currentThinking !== (lastThinking || '');
            
            // Update DOM intelligently - sync all messages from backend without full re-render
            const messagesContainer = document.getElementById('chatMessages');
            if (messagesContainer) {
                // Get the message element for THIS response
                const messageEl = messagesContainer.querySelector(`[data-message-id="${responseId}"]`);
                
                if (messageEl) {
                    // Update this specific message's content
                    if (contentChanged || pollCount === 1) {
                        lastContent = currentContent;
                        
                        const contentEl = messageEl.querySelector('.chat-message-content');
                        if (contentEl) {
                            if (currentContent) {
                                // Has content - show formatted text
                                contentEl.innerHTML = formatChatMessage(currentContent);
                                messageEl.classList.remove('loading');
                                
                                // Update per-message token count during streaming
                                const headerTokenSpan = messageEl.querySelector('.chat-message-tokens');
                                if (headerTokenSpan) {
                                    const tokenCount = estimateTokenCount(currentContent);
                                    headerTokenSpan.textContent = `${tokenCount} tokens`;
                                }
                            } else {
                                // Still generating - show loading dots
                                contentEl.innerHTML = `
                                    <div class="chat-loading-dots">
                                        <div class="dot"></div>
                                        <div class="dot"></div>
                                        <div class="dot"></div>
                                    </div>
                                `;
                            }
                        }
                    }
                    
                    // Update thinking section independently from content
                    if (thinkingChanged || pollCount === 1) {
                        lastThinking = currentThinking;
                        
                        const thinkingSection = messageEl.querySelector('.chat-thinking-section');
                        
                        if (currentThinking) {
                            if (!thinkingSection) {
                                // Create thinking section if it appeared mid-stream
                                const wrapper = messageEl.querySelector('.chat-message-wrapper');
                                const contentEl = messageEl.querySelector('.chat-message-content');
                                if (wrapper && contentEl) {
                                    const newThinkingSection = document.createElement('div');
                                    newThinkingSection.className = 'chat-thinking-section';
                                    
                                    const thinkingHeader = document.createElement('div');
                                    thinkingHeader.className = 'chat-thinking-header';
                                    thinkingHeader.onclick = function() {
                                        const tc = this.nextElementSibling;
                                        const chevron = this.querySelector('.chat-thinking-chevron');
                                        const isOpen = tc.style.display !== 'none';
                                        tc.style.display = isOpen ? 'none' : 'block';
                                        chevron.textContent = isOpen ? '▶' : '▼';
                                    };
                                    
                                    const thinkingDone = message.thinking_completed;
                                    thinkingHeader.innerHTML = `
                                        <span class="chat-thinking-chevron">▶</span>
                                        <span class="chat-thinking-label">Thinking</span>
                                        ${!thinkingDone ? '<span class="chat-thinking-status">thinking...</span>' : ''}
                                    `;
                                    
                                    const thinkingContent = document.createElement('div');
                                    thinkingContent.className = 'chat-thinking-content';
                                    thinkingContent.style.display = 'none';
                                    thinkingContent.innerHTML = formatChatMessage(currentThinking);
                                    
                                    newThinkingSection.appendChild(thinkingHeader);
                                    newThinkingSection.appendChild(thinkingContent);
                                    wrapper.insertBefore(newThinkingSection, contentEl);
                                }
                            } else {
                                // Update existing thinking content
                                const thinkingContent = thinkingSection.querySelector('.chat-thinking-content');
                                if (thinkingContent) {
                                    thinkingContent.innerHTML = formatChatMessage(currentThinking);
                                }
                                // Update thinking status indicator
                                if (message.thinking_completed) {
                                    const statusEl = thinkingSection.querySelector('.chat-thinking-status');
                                    if (statusEl) statusEl.remove();
                                }
                            }
                        }
                    }
                    
                    // Update token count and context bar during streaming
                    const totalTokens = calculateTotalTokens(currentChatSession.messages);
                    const maxContext = currentChatSession.num_ctx || 2048;
                    const contextUsage = (totalTokens / maxContext) * 100;
                    
                    const tokenDisplay = document.getElementById('chatTotalTokens');
                    if (tokenDisplay) {
                        tokenDisplay.textContent = `Total: ${totalTokens.toLocaleString()} tokens`;
                    }
                    
                    const contextBar = document.getElementById('chatContextBar');
                    const contextLabel = document.getElementById('chatContextLabel');
                    if (contextBar && contextLabel) {
                        contextBar.style.width = `${Math.min(contextUsage, 100)}%`;
                        
                        if (contextUsage < 70) {
                            contextBar.style.backgroundColor = 'var(--success-color, #34d399)';
                        } else if (contextUsage < 90) {
                            contextBar.style.backgroundColor = 'var(--warning-color, #fbbf24)';
                        } else {
                            contextBar.style.backgroundColor = 'var(--error-color, #ff3b30)';
                        }
                        
                        contextLabel.textContent = `${contextUsage.toFixed(1)}% of ${maxContext.toLocaleString()} context`;
                    }
                    
                    // Check for any NEW messages from backend that aren't in DOM yet
                    // This handles messages added to queue while we're streaming
                    const existingIds = new Set();
                    messagesContainer.querySelectorAll('[data-message-id]').forEach(el => {
                        existingIds.add(el.dataset.messageId);
                    });
                    
                    // Append any missing messages
                    currentChatSession.messages.forEach((msg, idx) => {
                        const msgId = msg.message_id || msg.response_id;
                        if (msgId && !existingIds.has(msgId)) {
                            console.log(`[CHAT] Adding missing message to DOM: ${msgId}`);
                            const isLoading = msg.role === 'assistant' && !msg.completed && !msg.content;
                            const msgEl = createChatMessageElement(msg, idx, isLoading);
                            messagesContainer.appendChild(msgEl);
                        }
                    });
                    
                    if (chatAutoScrollEnabled) {
                        scrollToBottom(messagesContainer);
                        setChatScrollButtonVisibility(false);
                    }
                } else if (pollCount === 1) {
                    // Message element doesn't exist yet - full render needed
                    console.warn(`[CHAT] Message element not found for ${responseId}, doing full render`);
                    if (currentChatSession && currentChatSession.session_id === sessionId) {
                        await renderChatMessages();
                    }
                }
            }
            
            // Check if completed
            if (message.completed) {
                console.log('[CHAT] Response completed:', responseId);
                
                // Stop polling
                if (chatPollingIntervals[responseId]) {
                    clearInterval(chatPollingIntervals[responseId]);
                    delete chatPollingIntervals[responseId];
                }
                
                // Reload session list to update order (most recent first)
                loadChatSessions();
                
                // The backend auto-names the session on the first exchange, but it does so
                // via a second Ollama call that runs AFTER marking the message completed.
                // loadChatSessions() above may resolve before that name is written, so the
                // UI would keep showing "New Chat". Poll the session endpoint for a short
                // grace period to catch the name update as soon as it appears.
                if (currentChatSession && currentChatSession.chat_name === 'New Chat') {
                    pollForChatSessionName(sessionId);
                }
                
                // CRITICAL FIX: Re-create message element to show action buttons
                // The buttons only appear when !isLoading in createChatMessageElement
                const messagesContainer = document.getElementById('chatMessages');
                if (messagesContainer && currentChatSession) {
                    const messageEl = messagesContainer.querySelector(`[data-message-id="${responseId}"]`);
                    if (messageEl) {
                        // Find the message in the session by response_id or message_id
                        const msg = currentChatSession.messages.find(m => 
                            m.response_id === responseId || m.message_id === responseId
                        );
                        
                        if (msg) {
                            const messageIndex = currentChatSession.messages.findIndex(m =>
                                m.response_id === responseId || m.message_id === responseId
                            );
                            // Re-create the message element with buttons (isLoading = false)
                            const newMessageEl = createChatMessageElement(msg, messageIndex, false);
                            messageEl.replaceWith(newMessageEl);
                            
                            console.log('[CHAT] Message element re-created with action buttons for:', responseId);
                        }
                    }
                }

                // Auto-TTS: check the whole session for any completed messages needing TTS
                if (currentChatSession && currentChatSession.auto_tts && currentChatSession.auto_tts.enabled) {
                    queueCompletedMessageTTS('chat', currentChatSession);
                }
            }
        } catch (error) {
            console.error('[CHAT] Polling error:', error);
        }
    };
    
    // Poll every 500ms
    chatPollingIntervals[responseId] = setInterval(pollSession, 500);
    pollSession(); // Initial poll
}

async function updateCurrentSessionModel() {
    if (!currentChatSession) return;
    
    const modelSelector = document.getElementById('chatModelSelector');
    const newModel = modelSelector.value;
    const sessionId = currentChatSession.session_id;
    
    try {
        const response = await fetch(`/api/chat/sessions/${sessionId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: newModel })
        });
        
        const data = await response.json();
        if (data.success) {
            // Reload the full session to ensure consistency
            await selectChatSession(sessionId, true);
            showNotification('Model updated', 'Success', 'success');
        } else {
            showNotification('Failed to update model', 'Error', 'error');
        }
    } catch (error) {
        console.error('[CHAT] Error updating model:', error);
        showNotification('Error updating model', 'Error', 'error');
    }
}

async function autoSaveChatParameters() {
    if (!currentChatSession) return;
    
    const sessionId = currentChatSession.session_id;
    if (!sessionId) return;
    
    try {
        const seedValue = document.getElementById('chatSeed').value;
        const updates = {
            chat_name: document.getElementById('chatSessionName').value,
            system_prompt: document.getElementById('chatSystemPrompt').value,
            temperature: parseFloat(document.getElementById('chatTemperature').value),
            top_p: parseFloat(document.getElementById('chatTopP').value),
            top_k: parseInt(document.getElementById('chatTopK').value),
            repeat_penalty: parseFloat(document.getElementById('chatRepeatPenalty').value),
            num_ctx: parseInt(document.getElementById('chatNumCtx').value),
            seed: seedValue ? parseInt(seedValue) : null
        };
        
        const response = await fetch(`/api/chat/sessions/${sessionId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        
        const data = await response.json();
        if (data.success) {
            // Update currentChatSession with fresh data from server
            currentChatSession = data.session;
            
            // Update title in chat header
            const chatTitle = document.getElementById('chatTitle');
            if (chatTitle) {
                chatTitle.textContent = currentChatSession.chat_name;
            }
            
            // Update session in local array for immediate UI refresh
            const sessionIndex = chatSessions.findIndex(s => s.session_id === currentChatSession.session_id);
            if (sessionIndex !== -1) {
                chatSessions[sessionIndex] = currentChatSession;
            }
            
            // Re-render session list to show updated name
            renderChatSessions();
            
            console.log('[CHAT] Parameters auto-saved');
        } else {
            console.error('[CHAT] Failed to auto-save parameters');
        }
    } catch (error) {
        console.error('[CHAT] Error auto-saving parameters:', error);
    }
}

async function generateSessionName() {
    if (!currentChatSession) return;
    
    const sessionId = currentChatSession.session_id;
    
    // Check if session has messages
    if (!currentChatSession.messages || currentChatSession.messages.length === 0) {
        showNotification('Add some messages first before generating a name', 'Info', 'warning');
        return;
    }
    
    const generateNameBtn = document.getElementById('generateSessionNameBtn');
    const originalHtml = generateNameBtn.innerHTML;
    
    try {
        // Disable button and show loading
        generateNameBtn.disabled = true;
        generateNameBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; animation: spin 1s linear infinite;">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
            </svg>
            Generating...
        `;
        
        const response = await fetch('/api/chat/generate_name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Generating session name...', 'Info', 'info');
            
            // Poll for completion
            const pollInterval = setInterval(async () => {
                try {
                    const statusResponse = await fetch(`/api/chat/sessions/${sessionId}`);
                    const statusData = await statusResponse.json();
                    
                    if (statusData.success) {
                        // Check if name changed from original
                        const newName = statusData.session.chat_name;
                        if (newName !== currentChatSession.chat_name) {
                            // Name was updated
                            currentChatSession.chat_name = newName;
                            syncActiveChatNameUI(newName);
                            
                            // Update session list
                            await loadChatSessions();
                            
                            clearInterval(pollInterval);
                            generateNameBtn.disabled = false;
                            generateNameBtn.innerHTML = originalHtml;
                            showNotification(`Session renamed to: ${newName}`, 'Success', 'success');
                        }
                    }
                } catch (error) {
                    console.error('[NAME_GEN] Polling error:', error);
                }
            }, 1000);
            
            // Timeout after 30 seconds
            setTimeout(() => {
                clearInterval(pollInterval);
                generateNameBtn.disabled = false;
                generateNameBtn.innerHTML = originalHtml;
            }, 30000);
        } else {
            showNotification(data.error || 'Failed to generate session name', 'Error', 'error');
            generateNameBtn.disabled = false;
            generateNameBtn.innerHTML = originalHtml;
        }
    } catch (error) {
        console.error('[NAME_GEN] Error:', error);
        showNotification('Error generating session name: ' + error.message, 'Error', 'error');
        generateNameBtn.disabled = false;
        generateNameBtn.innerHTML = originalHtml;
    }
}

async function deleteChatSession(sessionId) {
    const session = chatSessions.find(s => s.session_id === sessionId);
    if (!session) return;
    
    const confirmed = await showConfirm(`Delete chat "${session.chat_name}"?`, 'Confirm Delete');
    if (!confirmed) return;
    
    try {
        const response = await fetch(`/api/chat/sessions/${sessionId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // If we deleted the current session, clear it
            if (currentChatSession && currentChatSession.session_id === sessionId) {
                currentChatSession = null;
                if (typeof updateUrlState === 'function') {
                    updateUrlState({ tab: 'chat' });
                }
                chatAutoScrollEnabled = true;
                setChatScrollButtonVisibility(false);
                
                // Reset title and messages
                const chatTitle = document.getElementById('chatTitle');
                if (chatTitle) chatTitle.textContent = 'Select or create a chat';
            
                const chatMessages = document.getElementById('chatMessages');
                if (chatMessages) {
                    chatMessages.innerHTML = `
                        <div class="chat-empty-state">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            </svg>
                            <h3>Start a conversation</h3>
                            <p>Create a new chat or select an existing one from the sidebar</p>
                        </div>
                    `;
                }
                
                // Reset all parameters to default values with null checks
                const chatSessionName = document.getElementById('chatSessionName');
                if (chatSessionName) chatSessionName.value = '';
                
                const chatSystemPrompt = document.getElementById('chatSystemPrompt');
                if (chatSystemPrompt) chatSystemPrompt.value = '';
                
                const chatTemperature = document.getElementById('chatTemperature');
                if (chatTemperature) chatTemperature.value = 0.7;
                
                const chatTopP = document.getElementById('chatTopP');
                if (chatTopP) chatTopP.value = 0.9;
                
                const chatTopK = document.getElementById('chatTopK');
                if (chatTopK) chatTopK.value = 40;
                
                const chatRepeatPenalty = document.getElementById('chatRepeatPenalty');
                if (chatRepeatPenalty) chatRepeatPenalty.value = 1.1;
                
                const chatNumCtx = document.getElementById('chatNumCtx');
                if (chatNumCtx) chatNumCtx.value = 2048;
                
                // Reset value displays with null checks
                const chatTemperatureValue = document.getElementById('chatTemperatureValue');
                if (chatTemperatureValue) chatTemperatureValue.textContent = '0.7';
                
                const chatTopPValue = document.getElementById('chatTopPValue');
                if (chatTopPValue) chatTopPValue.textContent = '0.9';
                
                const chatTopKValue = document.getElementById('chatTopKValue');
                if (chatTopKValue) chatTopKValue.textContent = '40';
                
                const chatRepeatPenaltyValue = document.getElementById('chatRepeatPenaltyValue');
                if (chatRepeatPenaltyValue) chatRepeatPenaltyValue.textContent = '1.1';
                
                const chatNumCtxValue = document.getElementById('chatNumCtxValue');
                if (chatNumCtxValue) chatNumCtxValue.textContent = '2048';
                
                // Disable all controls with null checks
                if (chatSessionName) chatSessionName.disabled = true;
                if (chatSystemPrompt) chatSystemPrompt.disabled = true;
                if (chatTemperature) chatTemperature.disabled = true;
                if (chatTopP) chatTopP.disabled = true;
                if (chatTopK) chatTopK.disabled = true;
                if (chatRepeatPenalty) chatRepeatPenalty.disabled = true;
                if (chatNumCtx) chatNumCtx.disabled = true;
                
                const modelSelector = document.getElementById('chatModelSelector');
                if (modelSelector) modelSelector.disabled = true;
                
                const generateNameBtn = document.getElementById('generateSessionNameBtn');
                if (generateNameBtn) generateNameBtn.disabled = true;
                
                // Hide input container
                const chatInputContainer = document.getElementById('chatInputContainer');
                if (chatInputContainer) chatInputContainer.style.display = 'none';
            }
            
            // Reload sessions to update the list
            await loadChatSessions();
            
            showNotification('Chat session deleted', 'Success', 'success');
        } else {
            showNotification(data.error || 'Failed to delete session', 'Error', 'error');
        }
    } catch (error) {
        console.error('[CHAT] Error deleting session:', error);
        showNotification('Error deleting session: ' + error.message, 'Error', 'error');
    }
}

function toggleChatSidebar() {
    const sidebar = document.getElementById('chatSessionsSidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
    }
}

function toggleChatParams() {
    const sidebar = document.getElementById('chatParamsSidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
    }
}

// ============================================================================
// DUPLICATE CHAT SESSION
// ============================================================================

function openDuplicateChatModal(sessionId) {
    const modal = document.getElementById('duplicateChatModal');
    const sessionIdInput = document.getElementById('duplicateChatSessionId');
    
    if (modal && sessionIdInput) {
        sessionIdInput.value = sessionId;
        // Reset checkboxes to defaults
        document.getElementById('duplicateChatSettings').checked = true;
        document.getElementById('duplicateChatMessages').checked = false;
        modal.style.display = 'flex';
    }
}

function closeDuplicateChatModal() {
    const modal = document.getElementById('duplicateChatModal');
    if (modal) modal.style.display = 'none';
}

async function confirmDuplicateChat() {
    const sessionId = document.getElementById('duplicateChatSessionId').value;
    const copySettings = document.getElementById('duplicateChatSettings').checked;
    const copyMessages = document.getElementById('duplicateChatMessages').checked;
    
    if (!sessionId) return;
    
    try {
        const response = await fetch(`/api/chat/sessions/${sessionId}/duplicate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                copy_settings: copySettings,
                copy_messages: copyMessages
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            closeDuplicateChatModal();
            await loadChatSessions();
            // Select the new duplicated session
            await selectChatSession(data.session.session_id);
            showNotification('Chat session duplicated', 'Success', 'success');
        } else {
            showNotification(data.error || 'Failed to duplicate session', 'Error', 'error');
        }
    } catch (error) {
        console.error('[CHAT] Error duplicating session:', error);
        showNotification('Error duplicating session: ' + error.message, 'Error', 'error');
    }
}

function copyChatMessage(text, buttonElement) {
    if (!text) return;
    
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showCopySuccess(buttonElement);
        }).catch(err => {
            console.error('Clipboard API failed:', err);
            fallbackCopyText(text, buttonElement);
        });
    } else {
        // Use fallback method
        fallbackCopyText(text, buttonElement);
    }
}

// Make globally accessible for other scripts (story.js, autochat.js)
window.copyChatMessage = copyChatMessage;

function fallbackCopyText(text, buttonElement) {
    // Create temporary textarea
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showCopySuccess(buttonElement);
        } else {
            console.error('Copy command failed');
        }
    } catch (err) {
        console.error('Fallback copy failed:', err);
    } finally {
        document.body.removeChild(textarea);
    }
}

// Make globally accessible
window.fallbackCopyText = fallbackCopyText;

function showCopySuccess(buttonElement) {
    if (!buttonElement) return; // Handle null/undefined button
    
    // Visual feedback
    const originalHTML = buttonElement.innerHTML;
    buttonElement.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
    `;
    buttonElement.style.color = 'var(--success)';
    
    // Reset after 2 seconds
    setTimeout(() => {
        buttonElement.innerHTML = originalHTML;
        buttonElement.style.color = '';
    }, 2000);
}

// Make globally accessible
window.showCopySuccess = showCopySuccess;

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make globally accessible
window.escapeHtml = escapeHtml;

// ============================================================================
// END CHAT SYSTEM
// ============================================================================

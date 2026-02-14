// ============================================================================
// STORY FUNCTIONS
// ============================================================================

// Self-contained copy function for story messages
function copyStoryMessageText(text, buttonElement) {
    if (!text) return;
    
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showStoryCopySuccess(buttonElement);
        }).catch(err => {
            console.error('[STORY] Clipboard API failed:', err);
            fallbackStoryCopy(text, buttonElement);
        });
    } else {
        fallbackStoryCopy(text, buttonElement);
    }
}

function fallbackStoryCopy(text, buttonElement) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showStoryCopySuccess(buttonElement);
        }
    } catch (err) {
        console.error('[STORY] Copy failed:', err);
    } finally {
        document.body.removeChild(textarea);
    }
}

function showStoryCopySuccess(buttonElement) {
    if (!buttonElement) return;
    
    const originalHTML = buttonElement.innerHTML;
    buttonElement.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
    `;
    buttonElement.style.color = 'var(--success)';
    
    setTimeout(() => {
        buttonElement.innerHTML = originalHTML;
        buttonElement.style.color = '';
    }, 2000);
}

// TTS wrapper functions for story messages
function sendStoryToTTS(messageIndex) {
    if (!currentStorySession || !currentStorySession.messages[messageIndex]) return;
    
    const message = currentStorySession.messages[messageIndex];
    sendToTTS(message.content);
}

function storyTTSNow(messageIndex) {
    if (!currentStorySession || !currentStorySession.messages[messageIndex]) return;
    
    const message = currentStorySession.messages[messageIndex];
    ttsNow(message.content);
}

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

async function initializeStory() {
    console.log('[STORY] Initializing Story tab');
    
    // Load Ollama models for story (same as chat)
    await loadStoryModels();
    
    // Load story sessions
    loadStorySessions();
    
    // Event listeners
    const newStoryBtn = document.getElementById('newStoryBtn');
    const storySendBtn = document.getElementById('storySendBtn');
    const storyInput = document.getElementById('storyInput');
    const storyModelSelector = document.getElementById('storyModelSelector');
    const storyScrollBottomBtn = document.getElementById('storyScrollBottomBtn');
    const manageCharactersBtn = document.getElementById('manageCharactersBtn');
    const manageLorebookBtn = document.getElementById('manageLorebookBtn');
    
    // Sidebar toggle buttons
    const toggleStorySidebarBtn = document.getElementById('toggleStorySidebarBtn');
    const closeStorySidebarBtn = document.getElementById('closeStorySidebarBtn');
    const toggleStoryParamsBtn = document.getElementById('toggleStoryParamsBtn');
    const closeStoryParamsBtn = document.getElementById('closeStoryParamsBtn');
    
    if (newStoryBtn) newStoryBtn.addEventListener('click', () => createNewStorySession());
    if (storySendBtn) storySendBtn.addEventListener('click', () => sendStoryMessage());
    if (storyScrollBottomBtn) storyScrollBottomBtn.addEventListener('click', () => scrollStoryToBottom());
    if (manageCharactersBtn) manageCharactersBtn.addEventListener('click', () => openCharactersModal());
    if (manageLorebookBtn) manageLorebookBtn.addEventListener('click', () => openLorebookModal());
    
    // Toggle sidebars
    if (toggleStorySidebarBtn) {
        toggleStorySidebarBtn.addEventListener('click', () => {
            const sidebar = document.getElementById('storySessionsSidebar');
            if (sidebar) sidebar.classList.toggle('collapsed');
        });
    }
    
    if (closeStorySidebarBtn) {
        closeStorySidebarBtn.addEventListener('click', () => {
            const sidebar = document.getElementById('storySessionsSidebar');
            if (sidebar) sidebar.classList.add('collapsed');
        });
    }
    
    if (toggleStoryParamsBtn) {
        toggleStoryParamsBtn.addEventListener('click', () => {
            const sidebar = document.getElementById('storyParamsSidebar');
            if (sidebar) sidebar.classList.toggle('collapsed');
        });
    }
    
    if (closeStoryParamsBtn) {
        closeStoryParamsBtn.addEventListener('click', () => {
            const sidebar = document.getElementById('storyParamsSidebar');
            if (sidebar) sidebar.classList.add('collapsed');
        });
    }
    
    // Story input handling
    if (storyInput) {
        storyInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 200) + 'px';
        });
        
        storyInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                // Enter sends message, Shift+Enter adds newline
                e.preventDefault();
                sendStoryMessage();
            }
            // Shift+Enter allows default behavior (newline)
        });
    }
    
    // Model selector change
    if (storyModelSelector) {
        storyModelSelector.addEventListener('change', async function() {
            if (currentStorySession) {
                await updateStorySessionSettings({ model: this.value });
            }
        });
    }
    
    // Scroll detection for auto-scroll
    const storyMessages = document.getElementById('storyMessages');
    if (storyMessages) {
        storyMessages.addEventListener('scroll', handleStoryScroll);
    }
    
    // Parameter change handlers
    setupStoryParameterHandlers();
    
    // Character image upload preview handler
    const charImageUpload = document.getElementById('editCharImageUpload');
    if (charImageUpload) {
        charImageUpload.addEventListener('change', function() {
            const file = this.files[0];
            const preview = document.getElementById('charImagePreview');
            const previewImg = document.getElementById('charImagePreviewImg');
            
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    previewImg.src = e.target.result;
                    preview.style.display = 'block';
                };
                reader.readAsDataURL(file);
                
                // Reset uploaded filename so it uploads again
                if (typeof uploadedCharImageFilename !== 'undefined') {
                    uploadedCharImageFilename = null;
                }
            }
        });
    }
    
    // Character image URL field change handler
    const charImageInput = document.getElementById('editCharImage');
    if (charImageInput) {
        charImageInput.addEventListener('input', function() {
            const preview = document.getElementById('charImagePreview');
            const previewImg = document.getElementById('charImagePreviewImg');
            
            if (this.value.trim()) {
                previewImg.src = this.value.trim();
                preview.style.display = 'block';
            } else {
                preview.style.display = 'none';
            }
        });
    }
    
    console.log('[STORY] Story tab initialized');
}

async function loadStoryModels() {
    try {
        const response = await fetch('/api/ollama/models');
        if (!response.ok) throw new Error('Failed to load models');
        
        const data = await response.json();
        storyModels = data.models || [];
        
        const selector = document.getElementById('storyModelSelector');
        if (selector) {
            if (storyModels.length > 0) {
                selector.innerHTML = storyModels.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
                selector.disabled = false;
            } else {
                selector.innerHTML = '<option value="">No models available</option>';
                selector.disabled = true;
            }
        }
        console.log(`[STORY] Loaded ${storyModels.length} Ollama models`);
    } catch (error) {
        console.error('[STORY] Error loading models:', error);
        const selector = document.getElementById('storyModelSelector');
        if (selector) {
            selector.innerHTML = '<option value="">Error loading models</option>';
            selector.disabled = true;
        }
    }
}

async function loadStorySessions() {
    try {
        const response = await fetch('/api/story/sessions');
        if (!response.ok) throw new Error('Failed to load sessions');
        
        const data = await response.json();
        storySessions = data.sessions || [];
        
        renderStorySessions();
    } catch (error) {
        console.error('[STORY] Error loading sessions:', error);
    }
}

function renderStorySessions() {
    const list = document.getElementById('storySessionsList');
    if (!list) return;
    
    if (storySessions.length === 0) {
        list.innerHTML = '<div class="chat-sessions-empty">No story sessions yet</div>';
        return;
    }
    
    list.innerHTML = storySessions.map(session => `
        <div class="chat-session-item ${currentStorySession && currentStorySession.session_id === session.session_id ? 'active' : ''}" 
             data-session-id="${session.session_id}">
            <div class="chat-session-content">
                <div class="chat-session-title">${escapeHtml(session.story_name || 'Untitled Story')}</div>
                <div class="chat-session-meta">
                    <span>${session.messages ? session.messages.length : 0} messages</span>
                    <span>${session.model || 'llama3.2'}</span>
                </div>
            </div>
            <div class="chat-session-actions">
                <button class="chat-session-duplicate" data-session-id="${session.session_id}" title="Duplicate story">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                </button>
                <button class="chat-session-delete" data-session-id="${session.session_id}" title="Delete story">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
    
    // Add click handlers for sessions
    list.querySelectorAll('.chat-session-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // Don't select if clicking action buttons
            if (e.target.closest('.chat-session-actions')) return;
            
            const sessionId = item.dataset.sessionId;
            selectStorySession(sessionId);
        });
    });
    
    // Add duplicate handlers
    list.querySelectorAll('.chat-session-duplicate').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const sessionId = btn.dataset.sessionId;
            openDuplicateStoryModal(sessionId);
        });
    });
    
    // Add delete handlers
    list.querySelectorAll('.chat-session-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const sessionId = btn.dataset.sessionId;
            await deleteStorySession(sessionId);
        });
    });
}

async function createNewStorySession() {
    try {
        const response = await fetch('/api/story/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                story_name: 'New Story',
                model: storyModels[0]?.name || 'llama3.2',
                system_prompt: '',
                temperature: 0.8,
                num_ctx: 4096,
                seed: null
            })
        });
        
        if (!response.ok) throw new Error('Failed to create session');
        
        const data = await response.json();
        if (data.success) {
            await loadStorySessions();
            await selectStorySession(data.session.session_id);
        }
    } catch (error) {
        console.error('[STORY] Error creating session:', error);
        showNotification('Failed to create story session', 'error');
    }
}

// Clear story seed (set to random)
function clearStorySeed() {
    const seedInput = document.getElementById('storySeed');
    const seedValue = document.getElementById('storySeedValue');
    if (seedInput && seedValue) {
        seedInput.value = '';
        seedValue.textContent = 'Random';
        autoSaveStoryParameters();
    }
}

async function selectStorySession(sessionId, skipPollingResume = false) {
    if (isLoadingStorySession) {
        console.log('[STORY] Already loading a session, skipping');
        return;
    }
    
    isLoadingStorySession = true;
    
    try {
        const response = await fetch(`/api/story/sessions/${sessionId}`);
        if (!response.ok) throw new Error('Session not found');
        
        const data = await response.json();
        if (!data.success) throw new Error('Failed to load session');
        
        currentStorySession = data.session;
        
        // Update UI
        loadStoryUI();
        await renderStoryMessages();
        renderStorySessions(); // Refresh to show active state
        
        scrollStoryToBottom();
    } catch (error) {
        console.error('[STORY] Error loading session:', error);
        showNotification('Failed to load story session', 'error');
    } finally {
        isLoadingStorySession = false;
    }
}

function loadStoryUI() {
    if (!currentStorySession) return;
    
    // Show UI elements
    document.getElementById('storyInputContainer').style.display = 'flex';
    
    // Hide empty state if visible
    const messages = document.getElementById('storyMessages');
    if (messages && messages.querySelector('.chat-empty-state')) {
        // Empty state will be removed when messages render
    }
    
    // Set model
    const modelSelector = document.getElementById('storyModelSelector');
    if (modelSelector) {
        modelSelector.value = currentStorySession.model || 'llama3.2';
        modelSelector.disabled = false;
    }
    
    // Set parameters
    document.getElementById('storySessionName').value = currentStorySession.story_name || '';
    document.getElementById('storySessionName').disabled = false;
    
    document.getElementById('storySystemPrompt').value = currentStorySession.system_prompt || '';
    document.getElementById('storySystemPrompt').disabled = false;
    
    // Enable character and lorebook management buttons
    document.getElementById('manageCharactersBtn').disabled = false;
    document.getElementById('manageLorebookBtn').disabled = false;
    
    // Update character count and active display
    const characters = currentStorySession.characters || [];
    const activeCharId = currentStorySession.active_character_id;
    const userPersonaId = currentStorySession.user_persona_id;
    document.getElementById('charactersCount').textContent = characters.length;
    
    const activeCharDisplay = document.getElementById('activeCharacterDisplay');
    const activeChar = characters.find(c => c.id === activeCharId);
    if (activeChar) {
        activeCharDisplay.textContent = `AI Playing: ${activeChar.name}`;
        activeCharDisplay.style.color = 'var(--text-primary)';
    } else {
        activeCharDisplay.textContent = 'No active character';
        activeCharDisplay.style.color = 'var(--text-muted)';
    }
    
    const userPersonaDisplay = document.getElementById('userPersonaDisplay');
    const userPersona = characters.find(c => c.id === userPersonaId);
    if (userPersona) {
        userPersonaDisplay.textContent = `You Playing: ${userPersona.name}`;
        userPersonaDisplay.style.color = 'var(--text-primary)';
    } else {
        userPersonaDisplay.textContent = 'No user persona';
        userPersonaDisplay.style.color = 'var(--text-muted)';
    }
    
    // Update lorebook count
    document.getElementById('lorebookCount').textContent = (currentStorySession.lorebook || []).length;
    
    // Author's note
    document.getElementById('authorsNote').value = currentStorySession.authors_note || '';
    document.getElementById('authorsNote').disabled = false;
    
    // Generation parameters
    document.getElementById('storyTemperature').value = currentStorySession.temperature || 0.8;
    document.getElementById('storyTemperature').disabled = false;
    document.getElementById('storyTemperatureValue').textContent = currentStorySession.temperature || 0.8;
    
    document.getElementById('storyTopP').value = currentStorySession.top_p || 0.9;
    document.getElementById('storyTopP').disabled = false;
    document.getElementById('storyTopPValue').textContent = currentStorySession.top_p || 0.9;
    
    document.getElementById('storyTopK').value = currentStorySession.top_k || 40;
    document.getElementById('storyTopK').disabled = false;
    document.getElementById('storyTopKValue').textContent = currentStorySession.top_k || 40;
    
    document.getElementById('storyRepeatPenalty').value = currentStorySession.repeat_penalty || 1.1;
    document.getElementById('storyRepeatPenalty').disabled = false;
    document.getElementById('storyRepeatPenaltyValue').textContent = currentStorySession.repeat_penalty || 1.1;
    
    document.getElementById('storyNumCtx').value = currentStorySession.num_ctx || 4096;
    document.getElementById('storyNumCtx').disabled = false;
    document.getElementById('storyNumCtxValue').textContent = currentStorySession.num_ctx || 4096;
    
    document.getElementById('storySeed').value = currentStorySession.seed || '';
    document.getElementById('storySeed').disabled = false;
    document.getElementById('storySeedValue').textContent = currentStorySession.seed ? currentStorySession.seed : 'Random';
    document.getElementById('clearStorySeedBtn').disabled = false;
}

async function renderStoryMessages() {
    const container = document.getElementById('storyMessages');
    if (!container || !currentStorySession) return;
    
    const messages = currentStorySession.messages || [];
    
    if (messages.length === 0) {
        container.innerHTML = `
            <div class="chat-empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path>
                    <circle cx="6.5" cy="11.5" r="1.5"></circle>
                    <circle cx="9.5" cy="7.5" r="1.5"></circle>
                    <circle cx="14.5" cy="7.5" r="1.5"></circle>
                    <circle cx="17.5" cy="11.5" r="1.5"></circle>
                </svg>
                <p>Begin your story by typing a prompt below</p>
            </div>
        `;
        // Clear token count display and context bar
        const tokenDisplay = document.getElementById('storyTotalTokens');
        if (tokenDisplay) tokenDisplay.textContent = '';
        const contextBar = document.getElementById('storyContextBar');
        if (contextBar) contextBar.style.width = '0%';
        const contextLabel = document.getElementById('storyContextLabel');
        if (contextLabel) contextLabel.textContent = '';
        return;
    }
    
    // Calculate and display total token count and context usage
    const totalTokens = calculateTotalTokens(messages);
    const maxContext = currentStorySession.num_ctx || 4096;
    const contextUsage = (totalTokens / maxContext) * 100;
    
    const tokenDisplay = document.getElementById('storyTotalTokens');
    if (tokenDisplay) {
        tokenDisplay.textContent = `Total: ${totalTokens.toLocaleString()} tokens`;
    }
    
    // Update context progress bar
    const contextBar = document.getElementById('storyContextBar');
    const contextLabel = document.getElementById('storyContextLabel');
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
    
    container.innerHTML = messages.map(msg => 
        createStoryMessageElement(msg).outerHTML
    ).join('');
    
    // Start polling for incomplete messages
    messages.forEach(msg => {
        if (msg.role === 'assistant' && !msg.completed) {
            startStoryStreamingPolling(msg.response_id);
        }
    });
}

function createStoryMessageElement(message) {
    const div = document.createElement('div');
    div.className = `chat-message ${message.role}`;
    
    const content = message.content || '';
    const isLoading = !message.completed && message.role === 'assistant';
    
    // Get character names and images
    let displayName = message.role === 'user' ? 'You' : 'Story';
    let avatarText = message.role === 'user' ? 'U' : 'AI';
    let imageUrl = null;
    
    if (currentStorySession) {
        if (message.role === 'user' && currentStorySession.user_persona_id) {
            const userPersona = currentStorySession.characters?.find(c => c.id === currentStorySession.user_persona_id);
            if (userPersona) {
                displayName = userPersona.name;
                avatarText = userPersona.name.substring(0, 2).toUpperCase();
                imageUrl = userPersona.image;
            }
        } else if (message.role === 'assistant' && currentStorySession.active_character_id) {
            const activeChar = currentStorySession.characters?.find(c => c.id === currentStorySession.active_character_id);
            if (activeChar) {
                displayName = activeChar.name;
                avatarText = activeChar.name.substring(0, 2).toUpperCase();
                imageUrl = activeChar.image;
            }
        }
    }
    
    // Create avatar element
    const avatar = document.createElement('div');
    avatar.className = 'chat-message-avatar';
    
    // Use image if available, otherwise text
    if (imageUrl) {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = displayName;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.onerror = function() {
            // Fallback to text if image fails to load
            this.style.display = 'none';
            avatar.textContent = avatarText;
        };
        avatar.appendChild(img);
    } else {
        avatar.textContent = avatarText;
    }
    
    // Create wrapper for name, time, and content
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-message-wrapper';
    
    // Create header with name, time, and token count
    const header = document.createElement('div');
    header.className = 'chat-message-header';
    const tokenCount = estimateTokenCount(content);
    header.innerHTML = `
        <span class="chat-message-name">${escapeHtml(displayName)}</span>
        <span class="chat-message-meta">
            <span class="chat-message-tokens" title="Estimated tokens">${tokenCount} tokens</span>
            <span class="chat-message-time">${formatMessageTime(message.timestamp)}</span>
        </span>
    `;
    
    // Create content element
    const contentDiv = document.createElement('div');
    contentDiv.className = 'chat-message-content';
    contentDiv.innerHTML = isLoading && !content ? '<div class="loading-spinner"></div>' : formatChatMessage(content);
    
    // Assemble the message
    wrapper.appendChild(header);
    wrapper.appendChild(contentDiv);
    div.appendChild(avatar);
    div.appendChild(wrapper);
    
    // Add action buttons below message
    if (!isLoading && content) {
        const btnContainer = document.createElement('div');
        btnContainer.className = 'chat-message-actions';
        
        // Copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'chat-action-btn';
        copyBtn.title = 'Copy message';
        copyBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
        `;
        copyBtn.onclick = () => copyStoryMessageText(content, copyBtn);
        btnContainer.appendChild(copyBtn);
        
        // Send to TTS button - navigates to TTS tab with text
        const messageIndex = currentStorySession?.messages.findIndex(m => 
            (m.message_id && m.message_id === message.message_id) || 
            (m.response_id && m.response_id === message.response_id) ||
            (m.timestamp === message.timestamp && m.content === content)
        );
        
        const sendTTSBtn = document.createElement('button');
        sendTTSBtn.className = 'chat-action-btn';
        sendTTSBtn.title = 'Send to TTS tab';
        sendTTSBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
        `;
        sendTTSBtn.onclick = () => sendStoryToTTS(messageIndex);
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
        ttsNowBtn.onclick = () => storyTTSNow(messageIndex);
        btnContainer.appendChild(ttsNowBtn);
        
        // Edit button
        const editBtn = document.createElement('button');
        editBtn.className = 'chat-action-btn';
        editBtn.title = 'Edit message';
        editBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
        `;
        editBtn.onclick = () => editStoryMessage(div, messageIndex);
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
        deleteBtn.onclick = () => deleteStoryMessage(messageIndex);
        btnContainer.appendChild(deleteBtn);
        
        wrapper.appendChild(btnContainer);
    }
    
    return div;
}

async function deleteStoryMessage(messageIndex) {
    if (!currentStorySession || messageIndex === -1) return;
    
    const message = currentStorySession.messages[messageIndex];
    if (!message) return;
    
    // Show confirmation dialog
    const confirmed = await showConfirm(
        'Are you sure you want to delete this message? This action cannot be undone.',
        'Delete Message'
    );
    
    if (!confirmed) return;
    
    try {
        // Remove message from array
        currentStorySession.messages.splice(messageIndex, 1);
        
        // Save to backend
        const response = await fetch(`/api/story/sessions/${currentStorySession.session_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: currentStorySession.messages
            })
        });
        
        const data = await response.json();
        if (data.success) {
            currentStorySession = data.session;
            await renderStoryMessages();
            showNotification('Message deleted', 'Success', 'success');
        } else {
            showNotification('Failed to delete message', 'Error', 'error');
        }
    } catch (error) {
        console.error('[STORY] Error deleting message:', error);
        showNotification('Error deleting message', 'Error', 'error');
    }
}

function editStoryMessage(messageDiv, messageIndex) {
    if (!currentStorySession || messageIndex === -1) return;
    
    const message = currentStorySession.messages[messageIndex];
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
        currentStorySession.messages[messageIndex].content = newContent;
        
        // Save to backend
        try {
            const response = await fetch(`/api/story/sessions/${currentStorySession.session_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: currentStorySession.messages
                })
            });
            
            const data = await response.json();
            if (data.success) {
                currentStorySession = data.session;
                await renderStoryMessages();
                showNotification('Message updated', 'Success', 'success');
            } else {
                showNotification('Failed to update message', 'Error', 'error');
            }
        } catch (error) {
            console.error('[STORY] Error updating message:', error);
            showNotification('Error updating message', 'Error', 'error');
        }
    };
}

async function sendStoryMessage() {
    const input = document.getElementById('storyInput');
    const message = input.value.trim();
    
    if (!message || !currentStorySession) return;
    
    try {
        const response = await fetch('/api/story/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: currentStorySession.session_id,
                message: message
            })
        });
        
        if (!response.ok) throw new Error('Failed to send message');
        
        const data = await response.json();
        if (data.success) {
            // Clear input
            input.value = '';
            input.style.height = 'auto';
            
            // Reload session to show new messages
            await selectStorySession(currentStorySession.session_id, true);
            
            // Start streaming
            startStoryStreamingPolling(data.response_id);
        }
    } catch (error) {
        console.error('[STORY] Error sending message:', error);
        showNotification('Failed to send message', 'error');
    }
}

function startStoryStreamingPolling(responseId) {
    if (storyPollingIntervals[responseId]) return; // Already polling
    
    const sessionId = currentStorySession?.session_id;
    if (!sessionId) return;
    
    const eventSource = new EventSource(`/api/story/stream/${sessionId}/${responseId}`);
    
    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.error) {
                console.error('[STORY] Stream error:', data.error);
                eventSource.close();
                delete storyPollingIntervals[responseId];
                return;
            }
            
            if (data.chunk || data.full_content) {
                updateStoryMessageContent(responseId, data.full_content || '');
            }
            
            if (data.done) {
                eventSource.close();
                delete storyPollingIntervals[responseId];
                
                // CRITICAL FIX: Re-render the specific message to show action buttons
                // The buttons only appear when !isLoading in createStoryMessageElement
                const container = document.getElementById('storyMessages');
                if (container && currentStorySession) {
                    const messageElements = container.querySelectorAll('.chat-message.assistant');
                    for (const messageEl of messageElements) {
                        const index = Array.from(container.children).indexOf(messageEl);
                        const msg = currentStorySession.messages[index];
                        
                        if (msg && msg.response_id === responseId) {
                            // Re-create the message element with buttons
                            const newMessageEl = createStoryMessageElement(msg);
                            messageEl.replaceWith(newMessageEl);
                            break;
                        }
                    }
                }
                
                // Reload session to get final state
                selectStorySession(sessionId, true);
            }
        } catch (error) {
            console.error('[STORY] Error parsing stream:', error);
        }
    };
    
    eventSource.onerror = () => {
        eventSource.close();
        delete storyPollingIntervals[responseId];
    };
    
    storyPollingIntervals[responseId] = eventSource;
}

function updateStoryMessageContent(responseId, content) {
    if (!currentStorySession) return;
    
    // Update in memory
    const msg = currentStorySession.messages.find(m => m.response_id === responseId);
    if (msg) {
        msg.content = content;
    }
    
    // Update UI - only update the specific message element, not the entire chat
    const container = document.getElementById('storyMessages');
    if (container) {
        // Find the message element with this response_id by checking all messages
        const messageElements = container.querySelectorAll('.chat-message.assistant');
        for (const messageEl of messageElements) {
            const contentEl = messageEl.querySelector('.chat-message-content');
            if (contentEl) {
                // Check if this is the message we're streaming to by comparing with our message
                const index = Array.from(container.children).indexOf(messageEl);
                const sessionMsg = currentStorySession.messages[index];
                
                if (sessionMsg && sessionMsg.response_id === responseId) {
                    // Update only this message's content
                    if (content) {
                        contentEl.innerHTML = formatChatMessage(content);
                        messageEl.classList.remove('loading');
                        
                        // Update token count and context progress bar as content streams
                        const totalTokens = calculateTotalTokens(currentStorySession.messages);
                        const maxContext = currentStorySession.num_ctx || 4096;
                        const contextUsage = (totalTokens / maxContext) * 100;
                        
                        const tokenDisplay = document.getElementById('storyTotalTokens');
                        if (tokenDisplay) {
                            tokenDisplay.textContent = `Total: ${totalTokens.toLocaleString()} tokens`;
                        }
                        
                        const contextBar = document.getElementById('storyContextBar');
                        const contextLabel = document.getElementById('storyContextLabel');
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
                        
                        // Update token count in message header
                        const headerTokenSpan = messageEl.querySelector('.chat-message-tokens');
                        if (headerTokenSpan) {
                            const msgTokens = estimateTokenCount(content);
                            headerTokenSpan.textContent = `${msgTokens} tokens`;
                        }
                    }
                    break;
                }
            }
        }
    }
    
    if (storyAutoScrollEnabled) {
        scrollStoryToBottom();
    }
}

function scrollStoryToBottom() {
    const container = document.getElementById('storyMessages');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

function handleStoryScroll() {
    const container = document.getElementById('storyMessages');
    if (!container) return;
    
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    storyAutoScrollEnabled = isNearBottom;
    
    const scrollBtn = document.getElementById('storyScrollBottomBtn');
    if (scrollBtn) {
        scrollBtn.style.display = isNearBottom ? 'none' : 'flex';
    }
}

async function deleteStorySession(sessionId) {
    const session = storySessions.find(s => s.session_id === sessionId);
    if (!session) return;
    
    const confirmed = await showConfirm(`Delete story "${session.story_name}"?`, 'Confirm Delete');
    if (!confirmed) return;
    
    try {
        const response = await fetch(`/api/story/sessions/${sessionId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Failed to delete');
        
        // If we deleted the current session, clear it
        if (currentStorySession && currentStorySession.session_id === sessionId) {
            currentStorySession = null;
            document.getElementById('storyInputContainer').style.display = 'none';
            document.getElementById('storyMessages').innerHTML = `
                <div class="chat-empty-state">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path>
                        <circle cx="6.5" cy="11.5" r="1.5"></circle>
                        <circle cx="9.5" cy="7.5" r="1.5"></circle>
                        <circle cx="14.5" cy="7.5" r="1.5"></circle>
                        <circle cx="17.5" cy="11.5" r="1.5"></circle>
                    </svg>
                    <h3>Start your story</h3>
                    <p>Create a new story or select an existing one from the sidebar</p>
                </div>
            `;
        }
        
        await loadStorySessions();
        showNotification('Story deleted', 'success');
    } catch (error) {
        console.error('[STORY] Error deleting session:', error);
        showNotification('Failed to delete story', 'error');
    }
}

async function updateStorySessionSettings(updates) {
    if (!currentStorySession) {
        console.error('[STORY] No current session to update');
        return;
    }
    
    console.log('[STORY] Updating session settings:', Object.keys(updates));
    
    try {
        const response = await fetch(`/api/story/sessions/${currentStorySession.session_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[STORY] Update failed:', response.status, errorText);
            throw new Error('Failed to update');
        }
        
        const data = await response.json();
        console.log('[STORY] Update response:', data.success);
        if (data.success) {
            currentStorySession = data.session;
            console.log('[STORY] Current session updated');
            await loadStorySessions(); // Refresh list
        }
    } catch (error) {
        console.error('[STORY] Error updating settings:', error);
        showNotification('Failed to save changes', 'error');
    }
}

function setupStoryParameterHandlers() {
    // Story name
    const nameInput = document.getElementById('storySessionName');
    if (nameInput) {
        let nameTimeout;
        nameInput.addEventListener('input', () => {
            clearTimeout(nameTimeout);
            nameTimeout = setTimeout(() => {
                updateStorySessionSettings({ story_name: nameInput.value });
                if (currentStorySession) {
                    currentStorySession.story_name = nameInput.value;
                    document.getElementById('storySessionTitle').textContent = nameInput.value;
                }
            }, 500);
        });
    }
    
    // System prompt
    const systemPrompt = document.getElementById('storySystemPrompt');
    if (systemPrompt) {
        let systemTimeout;
        systemPrompt.addEventListener('input', () => {
            clearTimeout(systemTimeout);
            systemTimeout = setTimeout(() => {
                updateStorySessionSettings({ system_prompt: systemPrompt.value });
            }, 500);
        });
    }
    
    // Author's note
    const authorsNote = document.getElementById('authorsNote');
    if (authorsNote) {
        let noteTimeout;
        authorsNote.addEventListener('input', () => {
            clearTimeout(noteTimeout);
            noteTimeout = setTimeout(() => {
                updateStorySessionSettings({ authors_note: authorsNote.value });
            }, 500);
        });
    }
    
    // Generation parameters
    const params = [
        { id: 'storyTemperature', key: 'temperature', valueId: 'storyTemperatureValue' },
        { id: 'storyTopP', key: 'top_p', valueId: 'storyTopPValue' },
        { id: 'storyTopK', key: 'top_k', valueId: 'storyTopKValue' },
        { id: 'storyRepeatPenalty', key: 'repeat_penalty', valueId: 'storyRepeatPenaltyValue' },
        { id: 'storyNumCtx', key: 'num_ctx', valueId: 'storyNumCtxValue' }
    ];
    
    params.forEach(param => {
        const element = document.getElementById(param.id);
        const valueDisplay = document.getElementById(param.valueId);
        
        if (element && valueDisplay) {
            element.addEventListener('input', () => {
                const value = param.key === 'num_ctx' ? parseInt(element.value) : parseFloat(element.value);
                valueDisplay.textContent = value;
            });
            
            element.addEventListener('change', () => {
                const value = param.key === 'num_ctx' ? parseInt(element.value) : parseFloat(element.value);
                updateStorySessionSettings({ [param.key]: value });
            });
        }
    });
    
    // Seed parameter
    const seedInput = document.getElementById('storySeed');
    const seedValue = document.getElementById('storySeedValue');
    if (seedInput && seedValue) {
        seedInput.addEventListener('input', () => {
            seedValue.textContent = seedInput.value || 'Random';
        });
        
        seedInput.addEventListener('change', () => {
            const value = seedInput.value ? parseInt(seedInput.value) : null;
            updateStorySessionSettings({ seed: value });
        });
    }
}

// ============================================================================
// DUPLICATE STORY SESSION
// ============================================================================

function openDuplicateStoryModal(sessionId) {
    const modal = document.getElementById('duplicateStoryModal');
    const sessionIdInput = document.getElementById('duplicateStorySessionId');
    
    if (modal && sessionIdInput) {
        sessionIdInput.value = sessionId;
        // Reset checkboxes to defaults
        document.getElementById('duplicateStorySettings').checked = true;
        document.getElementById('duplicateStoryMessages').checked = false;
        modal.style.display = 'flex';
    }
}

function closeDuplicateStoryModal() {
    const modal = document.getElementById('duplicateStoryModal');
    if (modal) modal.style.display = 'none';
}

async function confirmDuplicateStory() {
    const sessionId = document.getElementById('duplicateStorySessionId').value;
    const copySettings = document.getElementById('duplicateStorySettings').checked;
    const copyMessages = document.getElementById('duplicateStoryMessages').checked;
    
    if (!sessionId) return;
    
    try {
        const response = await fetch(`/api/story/sessions/${sessionId}/duplicate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                copy_settings: copySettings,
                copy_messages: copyMessages
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            closeDuplicateStoryModal();
            await loadStorySessions();
            // Select the new duplicated session
            await selectStorySession(data.session.session_id);
            showNotification('Story session duplicated', 'success');
        } else {
            showNotification(data.error || 'Failed to duplicate session', 'error');
        }
    } catch (error) {
        console.error('[STORY] Error duplicating session:', error);
        showNotification('Error duplicating session: ' + error.message, 'error');
    }
}

function formatMessageTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

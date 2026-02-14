// Auto Chat - Dual AI Autonomous Conversations
// Global state
let currentAutoSession = null;
let autoPollingInterval = null;
let flipDisplay = false;
let autochatModels = [];
let autochatEventSource = null;
let activeStreamingMessages = new Set();
let autochatAutoScrollEnabled = true; // Keep autochat pinned to bottom unless user scrolls up

// Initialize Auto Chat
function initializeAutoChat() {
    console.log('[AUTOCHAT] Initializing...');
    
    // Initialize mobile sidebar state
    initializeAutochatMobileSidebars();
    
    // Load available models
    loadAutochatModels();
    
    // Load sessions
    loadAutoSessions();
    
    // Event listeners
    setupAutochatEventListeners();
    
    // Set initial scroll button state
    setAutochatScrollButtonVisibility(false);
}

// Initialize mobile sidebar behavior
function initializeAutochatMobileSidebars() {
    const sessionsSidebar = document.getElementById('autochatSessionsSidebar');
    const paramsSidebar = document.getElementById('autochatParamsSidebar');
    
    // Start collapsed on mobile
    if (window.innerWidth <= 768) {
        sessionsSidebar?.classList.add('collapsed');
        paramsSidebar?.classList.add('collapsed');
    }
    
    // Close sidebar when clicking on backdrop (mobile)
    if (sessionsSidebar) {
        sessionsSidebar.addEventListener('click', (e) => {
            if (e.target === sessionsSidebar && !sessionsSidebar.classList.contains('collapsed')) {
                toggleAutochatSidebar();
            }
        });
    }
    
    if (paramsSidebar) {
        paramsSidebar.addEventListener('click', (e) => {
            if (e.target === paramsSidebar && !paramsSidebar.classList.contains('collapsed')) {
                toggleAutochatParams();
            }
        });
    }
    
    // Handle window resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            // Desktop: remove collapsed class to show
            sessionsSidebar?.classList.remove('collapsed');
            paramsSidebar?.classList.remove('collapsed');
        }
    });
}

// Setup event listeners
function setupAutochatEventListeners() {
    // Session management
    document.getElementById('newAutochatBtn')?.addEventListener('click', createAutoSession);
    document.getElementById('toggleAutochatSidebarBtn')?.addEventListener('click', toggleAutochatSidebar);
    document.getElementById('closeAutochatSidebarBtn')?.addEventListener('click', () => {
        document.getElementById('autochatSessionsSidebar').classList.add('collapsed');
    });
    
    // Parameters panel
    document.getElementById('toggleAutochatParamsBtn')?.addEventListener('click', toggleAutochatParams);
    document.getElementById('closeAutochatParamsBtn')?.addEventListener('click', () => {
        document.getElementById('autochatParamsSidebar').classList.add('collapsed');
    });
    
    // Control buttons
    document.getElementById('startAutochatBtn')?.addEventListener('click', startAutoConversation);
    document.getElementById('stopAutochatBtn')?.addEventListener('click', stopAutoConversation);
    document.getElementById('continueAutochatBtn')?.addEventListener('click', continueAutoConversation);
    
    // Flip display toggle
    document.getElementById('flipDisplayCheckbox')?.addEventListener('change', (e) => {
        flipDisplay = e.target.checked;
        if (currentAutoSession) {
            renderAutoMessages();
            updateFlipDisplayUI();
        }
    });
    
    // Manual message sending
    document.getElementById('autochatManualInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            sendManualMessage();
        }
    });
    document.getElementById('autochatManualInput')?.addEventListener('input', updateManualCharCount);
    document.getElementById('autochatManualSendBtn')?.addEventListener('click', sendManualMessage);
    
    // Session name update
    document.getElementById('autochatSessionName')?.addEventListener('blur', updateAutochatSessionName);
    
    // Max turns slider
    document.getElementById('autochatMaxTurns')?.addEventListener('input', (e) => {
        document.getElementById('autochatMaxTurnsValue').textContent = e.target.value;
    });
    document.getElementById('autochatMaxTurns')?.addEventListener('change', updateAutochatMaxTurns);
    
    // Shared settings listeners
    document.getElementById('autochatSharedModel')?.addEventListener('change', updateSharedSettings);
    document.getElementById('autochatSharedNumCtx')?.addEventListener('input', (e) => {
        document.getElementById('autochatSharedNumCtxValue').textContent = e.target.value;
    });
    document.getElementById('autochatSharedNumCtx')?.addEventListener('change', updateSharedSettings);
    
    // Persona A parameter listeners
    setupPersonaListeners('A');
    setupPersonaListeners('B');
    
    // Scroll controls
    const autochatMessagesContainer = document.getElementById('autochatMessages');
    if (autochatMessagesContainer) {
        autochatMessagesContainer.addEventListener('scroll', handleAutochatScroll, { passive: true });
    }
    document.getElementById('autochatScrollBottomBtn')?.addEventListener('click', scrollAutochatToBottom);
}

// Setup parameter listeners for a persona
function setupPersonaListeners(persona) {
    const prefix = `persona${persona}`;
    
    // Name
    document.getElementById(`${prefix}Name`)?.addEventListener('blur', () => updatePersona(persona));
    
    // System prompt
    document.getElementById(`${prefix}System`)?.addEventListener('blur', () => updatePersona(persona));
    
    // Sliders (removed NumCtx - now shared)
    const sliders = ['Temperature', 'TopP', 'TopK', 'RepeatPenalty'];
    sliders.forEach(param => {
        const slider = document.getElementById(`${prefix}${param}`);
        slider?.addEventListener('input', (e) => {
            document.getElementById(`${prefix}${param}Value`).textContent = e.target.value;
        });
        slider?.addEventListener('change', () => updatePersona(persona));
    });
    
    // Seed parameter
    const seedInput = document.getElementById(`${prefix}Seed`);
    const seedValue = document.getElementById(`${prefix}SeedValue`);
    if (seedInput && seedValue) {
        seedInput.addEventListener('input', () => {
            seedValue.textContent = seedInput.value || 'Random';
        });
        seedInput.addEventListener('change', () => updatePersona(persona));
    }
}

// Toggle sidebar
function toggleAutochatSidebar() {
    document.getElementById('autochatSessionsSidebar')?.classList.toggle('collapsed');
}

// Toggle parameters
function toggleAutochatParams() {
    document.getElementById('autochatParamsSidebar')?.classList.toggle('collapsed');
}

// Toggle accordion
function toggleAccordion(id) {
    const content = document.getElementById(id);
    content?.classList.toggle('active');
}

// Load Ollama models
async function loadAutochatModels() {
    try {
        const response = await fetch('/api/ollama/models');
        const data = await response.json();
        
        if (data.success) {
            autochatModels = data.models;
            
            // Populate shared model dropdown
            const sharedModel = document.getElementById('autochatSharedModel');
            
            if (sharedModel) {
                const options = autochatModels.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
                sharedModel.innerHTML = options;
            }
        }
    } catch (error) {
        console.error('[AUTOCHAT] Error loading models:', error);
    }
}

// Load sessions
async function loadAutoSessions() {
    try {
        const response = await fetch('/api/autochat/sessions');
        const data = await response.json();
        
        if (data.success) {
            renderAutoSessionsList(data.sessions);
        }
    } catch (error) {
        console.error('[AUTOCHAT] Error loading sessions:', error);
    }
}

// Render sessions list
function renderAutoSessionsList(sessions) {
    const list = document.getElementById('autochatSessionsList');
    if (!list) return;
    
    if (sessions.length === 0) {
        list.innerHTML = '<div class="chat-sessions-empty">No auto chat sessions</div>';
        return;
    }
    
    list.innerHTML = sessions.map(session => `
        <div class="chat-session-item" data-session-id="${session.session_id}">
            <div class="chat-session-content">
                <div class="session-name">${escapeHtml(session.session_name)}</div>
                <div class="session-model" style="font-size: 0.75rem; display: flex; gap: 0.5rem;">
                    <span>${escapeHtml(session.persona_a.name)} (${escapeHtml(session.persona_a.model)})</span>
                    <span>↔</span>
                    <span>${escapeHtml(session.persona_b.name)} (${escapeHtml(session.persona_b.model)})</span>
                </div>
                <div class="session-meta">
                    Turn ${session.current_turn}/${session.max_turns} · ${session.messages.length} messages
                </div>
            </div>
            <div class="chat-session-actions">
                <button class="chat-session-duplicate" data-session-id="${session.session_id}" title="Duplicate">🗐</button>
                <button class="chat-session-delete" data-session-id="${session.session_id}" title="Delete">🗑</button>
            </div>
        </div>
    `).join('');
    
    // Add click handlers
    list.querySelectorAll('.chat-session-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.chat-session-actions')) return;
            selectAutoSession(item.dataset.sessionId);
        });
    });
    
    list.querySelectorAll('.chat-session-duplicate').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            duplicateAutoSession(btn.dataset.sessionId);
        });
    });
    
    list.querySelectorAll('.chat-session-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteAutoSession(btn.dataset.sessionId);
        });
    });
}

// Create new session
async function createAutoSession() {
    try {
        const response = await fetch('/api/autochat/sessions', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                session_name: 'New Auto Chat',
                model: autochatModels[0]?.name || 'llama3.2',
                num_ctx: 2048,
                persona_a_name: 'Alice',
                persona_a_system: 'You are Alice, a friendly and helpful AI assistant.',
                persona_b_name: 'Bob',
                persona_b_system: 'You are Bob, a curious and thoughtful AI assistant.'
            })
        });
        
        const data = await response.json();
        if (data.success) {
            await loadAutoSessions();
            selectAutoSession(data.session.session_id);
            showNotification('Auto Chat session created', 'Success', 'success');
        }
    } catch (error) {
        console.error('[AUTOCHAT] Error creating session:', error);
        showNotification('Failed to create session', 'Error', 'error');
    }
}

// Select session
async function selectAutoSession(sessionId) {
    try {
        // Clear previous session's streaming connections
        if (autoPollingInterval) {
            clearInterval(autoPollingInterval);
            autoPollingInterval = null;
        }
        activeStreamingMessages.clear();
        
        const response = await fetch(`/api/autochat/sessions/${sessionId}`);
        const data = await response.json();
        
        if (data.success) {
            currentAutoSession = data.session;
            populateAutochatUI();
            autochatAutoScrollEnabled = true;
            setAutochatScrollButtonVisibility(false);
            renderAutoMessages();
            startAutoPolling();
        }
    } catch (error) {
        console.error('[AUTOCHAT] Error loading session:', error);
    }
}

// Populate UI with session data
function populateAutochatUI() {
    if (!currentAutoSession) return;
    
    // Title and turn counter
    document.getElementById('autochatSessionTitle').textContent = currentAutoSession.session_name;
   document.getElementById('autochatTurnCounter').textContent = 
        `Turn ${currentAutoSession.current_turn}/${currentAutoSession.max_turns}`;
    document.getElementById('autochatTurnCounter').style.display = 'inline';
    
    // Session name
    document.getElementById('autochatSessionName').value = currentAutoSession.session_name;
    document.getElementById('autochatSessionName').disabled = false;
    
    // Max turns
    document.getElementById('autochatMaxTurns').value = currentAutoSession.max_turns;
    document.getElementById('autochatMaxTurnsValue').textContent = currentAutoSession.max_turns;
    document.getElementById('autochatMaxTurns').disabled = false;
    
    // Shared model
    document.getElementById('autochatSharedModel').value = currentAutoSession.model || currentAutoSession.persona_a?.model || '';
    document.getElementById('autochatSharedModel').disabled = false;
    
    // Shared context window
    const numCtx = currentAutoSession.num_ctx || currentAutoSession.persona_a?.num_ctx || 2048;
    document.getElementById('autochatSharedNumCtx').value = numCtx;
    document.getElementById('autochatSharedNumCtxValue').textContent = numCtx;
    document.getElementById('autochatSharedNumCtx').disabled = false;
    
    // Persona A
    populatePersona('A', currentAutoSession.persona_a);
    
    // Persona B
    populatePersona('B', currentAutoSession.persona_b);
    
    // Control buttons
    updateControlButtons();
    
    // Show manual input section
    document.getElementById('autochatManualSection').style.display = 'block';
    document.getElementById('flipDisplayLabel').style.display = 'flex';
    
    // Update flip display UI (send-as label)
    updateFlipDisplayUI();
}

// Populate persona fields
function populatePersona(persona, data) {
    const prefix = `persona${persona}`;
    
    document.getElementById(`${prefix}Name`).value = data.name;
    document.getElementById(`${prefix}Name`).disabled = false;
    
    document.getElementById(`${prefix}System`).value = data.system_prompt;
    document.getElementById(`${prefix}System`).disabled = false;
    
    document.getElementById(`${prefix}Temperature`).value = data.temperature;
    document.getElementById(`${prefix}TemperatureValue`).textContent = data.temperature;
    document.getElementById(`${prefix}Temperature`).disabled = false;
    
    document.getElementById(`${prefix}TopP`).value = data.top_p;
    document.getElementById(`${prefix}TopPValue`).textContent = data.top_p;
    document.getElementById(`${prefix}TopP`).disabled = false;
    
    document.getElementById(`${prefix}TopK`).value = data.top_k;
    document.getElementById(`${prefix}TopKValue`).textContent = data.top_k;
    document.getElementById(`${prefix}TopK`).disabled = false;
    
    document.getElementById(`${prefix}RepeatPenalty`).value = data.repeat_penalty;
    document.getElementById(`${prefix}RepeatPenaltyValue`).textContent = data.repeat_penalty;
    document.getElementById(`${prefix}RepeatPenalty`).disabled = false;
    
    document.getElementById(`${prefix}Seed`).value = data.seed || '';
    document.getElementById(`${prefix}SeedValue`).textContent = data.seed ? data.seed : 'Random';
    document.getElementById(`${prefix}Seed`).disabled = false;
    document.getElementById(`clear${prefix}SeedBtn`).disabled = false;
}

// Update UI based on flip display
function updateFlipDisplayUI() {
    if (!currentAutoSession) return;
    
    // Update send-as label (user always sends as left side)
    const sendAsLabel = document.getElementById('autochatSendAsLabel');
    if (sendAsLabel) {
        const leftPersona = flipDisplay ? currentAutoSession.persona_b : currentAutoSession.persona_a;
        sendAsLabel.textContent = `Send as ${leftPersona.name}`;
    }
}

// Update control buttons based on session status
function updateControlButtons() {
    if (!currentAutoSession) return;
    
    const startBtn = document.getElementById('startAutochatBtn');
    const stopBtn = document.getElementById('stopAutochatBtn');
    const continueBtn = document.getElementById('continueAutochatBtn');
    
    const isRunning = currentAutoSession.status === 'running';
    const isStopped = currentAutoSession.status === 'stopped';
    const hasReachedMax = currentAutoSession.current_turn >= currentAutoSession.max_turns;
    
    startBtn.disabled = !isStopped || currentAutoSession.messages.length > 0 || hasReachedMax;
    startBtn.style.display = (isStopped && currentAutoSession.messages.length === 0) ? 'inline-flex' : 'none';
    
    stopBtn.disabled = !isRunning;
    stopBtn.style.display = isRunning ? 'inline-flex' : 'none';
    
    continueBtn.disabled = !isStopped || hasReachedMax;
    continueBtn.style.display = (isStopped && currentAutoSession.messages.length > 0) ? 'inline-flex' : 'none';
}

// Render messages
function renderAutoMessages() {
    if (!currentAutoSession) return;
    
    const container = document.getElementById('autochatMessages');
    if (!container) return;
    
    const messages = currentAutoSession.messages;
    
    if (messages.length === 0) {
        container.innerHTML = `
            <div class="chat-empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    <path d="M9 10h.01M15 10h.01"></path>
                    <path d="M9.5 15a3.5 3.5 0 0 0 5 0"></path>
                </svg>
                <h3>Ready to Start</h3>
                <p>Click "Start" to begin the autonomous conversation</p>
            </div>
        `;
        autochatAutoScrollEnabled = true;
        setAutochatScrollButtonVisibility(false);
        return;
    }
    
    container.innerHTML = messages.map((msg, index) => createAutoMessageElement(msg, index)).join('');
    
    // Scroll to bottom only if auto-scroll enabled
    if (autochatAutoScrollEnabled) {
        container.scrollTop = container.scrollHeight;
    }
    
    // Update token display
    updateTokenDisplay();
}

// Create message element
function createAutoMessageElement(msg, index) {
    // Always use the ACTUAL persona data (never swap names)
    const persona = msg.persona === 'a' ? currentAutoSession.persona_a : currentAutoSession.persona_b;
    
    // Avatar letter shows which persona it actually is
    const personaLetter = msg.persona.toUpperCase();
    const isLoading = !msg.completed;
    const isManual = msg.manual;
    
    // Determine visual side (left/right) based on actual persona and flip state
    // Without flip: A=left, B=right
    // With flip: A=right, B=left
    const isLeft = flipDisplay ? (msg.persona === 'b') : (msg.persona === 'a');
    const roleClass = isLeft ? 'user' : 'assistant';
    
    const tokenCount = estimateTokenCount(msg.content || '');
    const timestamp = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    return `
        <div class="chat-message ${roleClass} autochat-message persona-${msg.persona} ${isLoading ? 'loading' : ''}" data-message-index="${index}" data-response-id="${msg.response_id || ''}">
            <div class="chat-message-avatar">${personaLetter}</div>
            <div class="chat-message-wrapper">
                <div class="chat-message-header">
                    <span class="chat-message-name">
                        ${escapeHtml(persona.name)}
                        ${isManual ? '<span class="autochat-persona-badge" title="Manual message">✋</span>' : ''}
                    </span>
                    <span class="chat-message-meta">
                        <span class="chat-message-tokens" title="Estimated tokens">${tokenCount} tokens</span>
                        <span class="chat-message-time">${timestamp}</span>
                    </span>
                </div>
                <div class="chat-message-content">${isLoading ? '<div class="typing-indicator"><span></span><span></span><span></span></div>' : formatChatMessage(msg.content || '')}</div>
                ${!isLoading ? `
                    <div class="chat-message-actions">
                        <button class="chat-action-btn" onclick="copyAutochatMessage(${index}, this)" title="Copy">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                        <button class="chat-action-btn" onclick="sendAutochatToTTS(${index})" title="Send to TTS tab">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                            </svg>
                        </button>
                        <button class="chat-action-btn" onclick="autochatTTSNow(${index})" title="Generate TTS now">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                        </button>
                        <button class="chat-action-btn" onclick="editAutochatMessage(this.closest('.chat-message'), ${index})" title="Edit">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="chat-action-btn" onclick="deleteAutochatMessage(${index})" title="Delete">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// Get display persona (always returns actual persona data, flip only affects position)
function getDisplayPersona(actualPersona) {
    if (!currentAutoSession) return { name: 'Unknown' };
    
    // Always return the actual persona data - flip only affects visual position, not identity
    return actualPersona === 'a' ? currentAutoSession.persona_a : currentAutoSession.persona_b;
}

// Start conversation
async function startAutoConversation() {
    if (!currentAutoSession) return;
    
    try {
        const response = await fetch('/api/autochat/start', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ session_id: currentAutoSession.session_id })
        });
        
        const data = await response.json();
        if (data.success) {
            currentAutoSession.status = 'running';
            updateControlButtons();
            showNotification('Conversation started', 'Success', 'success');
        }
    } catch (error) {
        console.error('[AUTOCHAT] Error starting conversation:', error);
        showNotification('Failed to start conversation', 'Error', 'error');
    }
}

// Stop conversation
async function stopAutoConversation() {
    if (!currentAutoSession) return;
    
    try {
        const response = await fetch(`/api/autochat/sessions/${currentAutoSession.session_id}/stop`, {
            method: 'POST'
        });
        
        const data = await response.json();
        if (data.success) {
            currentAutoSession.status = 'stopped';
            updateControlButtons();
            
            // Remove any queued (not generating) autochat items for this session
            try {
                const queueResponse = await fetch('/api/queue');
                const queueData = await queueResponse.json();
                
                // Filter for queued autochat jobs for this session
                const queuedAutochatJobs = (queueData.queue || []).filter(job => 
                    job.job_type === 'autochat' && 
                    job.session_id === currentAutoSession.session_id &&
                    job.status === 'queued'
                );
                
                // Cancel each queued job
                for (const job of queuedAutochatJobs) {
                    try {
                        await fetch(`/api/queue/${job.id}`, {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' }
                        });
                        console.log(`[AUTOCHAT] Removed queued job: ${job.id}`);
                    } catch (err) {
                        console.error(`[AUTOCHAT] Error removing job ${job.id}:`, err);
                    }
                }
                
                if (queuedAutochatJobs.length > 0) {
                    console.log(`[AUTOCHAT] Removed ${queuedAutochatJobs.length} queued item(s)`);
                }
            } catch (queueError) {
                console.error('[AUTOCHAT] Error removing queued items:', queueError);
            }
            
            showNotification('Conversation stopped', 'Success', 'success');
        }
    } catch (error) {
        console.error('[AUTOCHAT] Error stopping conversation:', error);
        showNotification('Failed to stop conversation', 'Error', 'error');
    }
}

// Continue conversation
async function continueAutoConversation() {
    if (!currentAutoSession) return;
    
    try {
        const response = await fetch(`/api/autochat/sessions/${currentAutoSession.session_id}/continue`, {
            method: 'POST'
        });
        
        const data = await response.json();
        if (data.success) {
            currentAutoSession.status = 'running';
            updateControlButtons();
            showNotification('Conversation continued', 'Success', 'success');
        }
    } catch (error) {
        console.error('[AUTOCHAT] Error continuing conversation:', error);
        showNotification('Failed to continue conversation', 'Error', 'error');
    }
}

// Send manual message (always as the persona on the left side)
async function sendManualMessage() {
    if (!currentAutoSession) return;
    
    const input = document.getElementById('autochatManualInput');
    const message = input.value.trim();
    
    // User always sends as the persona on the LEFT side
    // Without flip: left = persona A
    // With flip: left = persona B
    const persona = flipDisplay ? 'b' : 'a';
    
    if (!message) return;
    
    try {
        const response = await fetch('/api/autochat/manual_message', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                session_id: currentAutoSession.session_id,
                message: message,
                persona: persona
            })
        });
        
        const data = await response.json();
        if (data.success) {
            input.value = '';
            updateManualCharCount();
            showNotification('Manual message sent', 'Success', 'success');
        }
    } catch (error) {
        console.error('[AUTOCHAT] Error sending manual message:', error);
        showNotification('Failed to send message', 'Error', 'error');
    }
}

// Update manual character count
function updateManualCharCount() {
    const input = document.getElementById('autochatManualInput');
    const count = document.getElementById('manualCharCount');
    if (input && count) {
        count.textContent = `${input.value.length} characters`;
    }
}

// Start polling for updates AND SSE streaming
function startAutoPolling() {
    // Clear existing interval
    if (autoPollingInterval) {
        clearInterval(autoPollingInterval);
    }
    
    // Poll every 300ms for session status
    autoPollingInterval = setInterval(async () => {
        if (!currentAutoSession) {
            clearInterval(autoPollingInterval);
            return;
        }
        
        try {
            const response = await fetch(`/api/autochat/sessions/${currentAutoSession.session_id}`);
            const data = await response.json();
            
            if (data.success) {
                const previousMessageCount = currentAutoSession.messages.length;
                const previousMessages = currentAutoSession.messages;
                currentAutoSession = data.session;
                
                // Check for new messages
                if (currentAutoSession.messages.length > previousMessageCount) {
                    // Find new messages and start streaming for them
                    for (let i = previousMessageCount; i < currentAutoSession.messages.length; i++) {
                        const msg = currentAutoSession.messages[i];
                        if (!msg.completed && msg.response_id && !activeStreamingMessages.has(msg.response_id)) {
                            startMessageStreaming(msg.response_id);
                        }
                    }
                    renderAutoMessages();
                } else {
                    // Update existing incomplete messages
                    for (let i = 0; i < currentAutoSession.messages.length; i++) {
                        const msg = currentAutoSession.messages[i];
                        if (!msg.completed && msg.response_id && !activeStreamingMessages.has(msg.response_id)) {
                            startMessageStreaming(msg.response_id);
                        }
                    }
                }
                
                // Update turn counter and control buttons
                document.getElementById('autochatTurnCounter').textContent = 
                    `Turn ${currentAutoSession.current_turn}/${currentAutoSession.max_turns}`;
                updateControlButtons();
            }
        } catch (error) {
            console.error('[AUTOCHAT] Polling error:', error);
        }
    }, 300);
}

// Start streaming for a specific message
function startMessageStreaming(responseId) {
    if (!currentAutoSession || !responseId) return;
    if (activeStreamingMessages.has(responseId)) return;
    
    activeStreamingMessages.add(responseId);
    console.log('[AUTOCHAT] Starting stream for response:', responseId);
    
    const eventSource = new EventSource(`/api/autochat/stream/${currentAutoSession.session_id}/${responseId}`);
    
    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.done) {
                console.log('[AUTOCHAT] Stream complete for:', responseId);
                eventSource.close();
                activeStreamingMessages.delete(responseId);
                
                // Mark message as completed and update UI to show action buttons
                const messageIndex = currentAutoSession.messages.findIndex(m => m.response_id === responseId);
                if (messageIndex >= 0) {
                    currentAutoSession.messages[messageIndex].completed = true;
                    
                    // Update the existing message element without replacing it
                    const container = document.getElementById('autochatMessages');
                    const messageEl = container?.querySelector(`[data-response-id="${responseId}"]`);
                    if (messageEl) {
                        // Remove loading class
                        messageEl.classList.remove('loading');
                        
                        // Find the message wrapper to add action buttons
                        const wrapper = messageEl.querySelector('.chat-message-wrapper');
                        if (wrapper && !wrapper.querySelector('.chat-message-actions')) {
                            const actionsHTML = `
                                <div class="chat-message-actions">
                                    <button class="chat-action-btn" onclick="copyAutochatMessage(${messageIndex}, this)" title="Copy">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                        </svg>
                                    </button>
                                    <button class="chat-action-btn" onclick="sendAutochatToTTS(${messageIndex})" title="Send to TTS tab">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                                        </svg>
                                    </button>
                                    <button class="chat-action-btn" onclick="autochatTTSNow(${messageIndex})" title="Generate TTS now">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                        </svg>
                                    </button>
                                    <button class="chat-action-btn" onclick="editAutochatMessage(document.querySelector('[data-response-id=\"' + '${responseId}' + '\"]'), ${messageIndex})" title="Edit">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                        </svg>
                                    </button>
                                    <button class="chat-action-btn" onclick="deleteAutochatMessage(${messageIndex})" title="Delete">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <polyline points="3 6 5 6 21 6"></polyline>
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                        </svg>
                                    </button>
                                </div>
                            `;
                            wrapper.insertAdjacentHTML('beforeend', actionsHTML);
                        }
                    }
                }
            } else if (data.content !== undefined) {
                // Update message content in real-time
                updateMessageContent(responseId, data.content);
            }
        } catch (error) {
            console.error('[AUTOCHAT] Stream parse error:', error);
        }
    };
    
    eventSource.onerror = (error) => {
        console.error('[AUTOCHAT] Stream error for:', responseId, error);
        eventSource.close();
        activeStreamingMessages.delete(responseId);
    };
}

// Update message content without full re-render
function updateMessageContent(responseId, content) {
    if (!currentAutoSession) return;
    
    // Find message index
    const messageIndex = currentAutoSession.messages.findIndex(m => m.response_id === responseId);
    if (messageIndex < 0) return;
    
    // Update in-memory content
    currentAutoSession.messages[messageIndex].content = content;
    
    // Find message element
    const container = document.getElementById('autochatMessages');
    if (!container) return;
    
    const messageEl = container.querySelector(`[data-response-id="${responseId}"]`);
    if (!messageEl) return;
    
    // Update content div
    const contentDiv = messageEl.querySelector('.chat-message-content');
    if (contentDiv) {
        contentDiv.innerHTML = formatChatMessage(content || '');
    }
    
    // Update token count
    const tokenCount = estimateTokenCount(content || '');
    const tokenSpan = messageEl.querySelector('.chat-message-tokens');
    if (tokenSpan) {
        tokenSpan.textContent = `${tokenCount} tokens`;
    }
    
    // Update total context bar
    updateTokenDisplay();
    
    // Auto-scroll only if enabled
    if (autochatAutoScrollEnabled) {
        container.scrollTop = container.scrollHeight;
    }
}

// Copy message
function copyAutochatMessage(index, buttonElement) {
    if (!currentAutoSession || !currentAutoSession.messages[index]) return;
    
    const message = currentAutoSession.messages[index];
    copyChatMessage(message.content, buttonElement);
}

// TTS wrapper functions for autochat messages
function sendAutochatToTTS(index) {
    if (!currentAutoSession || !currentAutoSession.messages[index]) return;
    
    const message = currentAutoSession.messages[index];
    sendToTTS(message.content);
}

function autochatTTSNow(index) {
    if (!currentAutoSession || !currentAutoSession.messages[index]) return;
    
    const message = currentAutoSession.messages[index];
    ttsNow(message.content);
}

// Edit message
function editAutochatMessage(messageDiv, messageIndex) {
    if (!currentAutoSession || messageIndex === -1) return;
    
    const message = currentAutoSession.messages[messageIndex];
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
        currentAutoSession.messages[messageIndex].content = newContent;
        
        // Save to backend
        try {
            const response = await fetch(`/api/autochat/sessions/${currentAutoSession.session_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: currentAutoSession.messages
                })
            });
            
            const data = await response.json();
            if (data.success) {
                currentAutoSession = data.session;
                renderAutoMessages();
                showNotification('Message updated', 'Success', 'success');
            } else {
                showNotification('Failed to update message', 'Error', 'error');
            }
        } catch (error) {
            console.error('[AUTOCHAT] Error updating message:', error);
            showNotification('Error updating message', 'Error', 'error');
        }
    };
}

// Delete message
// Auto-scroll helper functions
function setAutochatScrollButtonVisibility(visible) {
    const button = document.getElementById('autochatScrollBottomBtn');
    if (!button) return;
    button.style.display = visible ? 'flex' : 'none';
}

function handleAutochatScroll() {
    const container = document.getElementById('autochatMessages');
    if (!container) return;
    if (!currentAutoSession || currentAutoSession.messages.length === 0) {
        autochatAutoScrollEnabled = true;
        setAutochatScrollButtonVisibility(false);
        return;
    }
    // Use same utility function from script.js
    const atBottom = typeof isScrolledToBottom === 'function' ? isScrolledToBottom(container, 24) : 
        (container.scrollHeight - container.scrollTop - container.clientHeight < 24);
    if (atBottom) {
        autochatAutoScrollEnabled = true;
        setAutochatScrollButtonVisibility(false);
    } else {
        autochatAutoScrollEnabled = false;
        setAutochatScrollButtonVisibility(true);
    }
}

function scrollAutochatToBottom() {
    const container = document.getElementById('autochatMessages');
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    autochatAutoScrollEnabled = true;
    setAutochatScrollButtonVisibility(false);
}

async function deleteAutochatMessage(index) {
    if (!currentAutoSession || !currentAutoSession.messages[index]) return;
    
    const confirmed = await showConfirm(
        'Are you sure you want to delete this message? This action cannot be undone.',
        'Delete Message'
    );
    
    if (!confirmed) return;
    
    currentAutoSession.messages.splice(index, 1);
    
    // Recalculate turn count based on remaining messages
    // Each turn consists of messages from both personas, so divide by 2
    const newTurnCount = Math.ceil(currentAutoSession.messages.length / 2);
    currentAutoSession.current_turn = newTurnCount;
    
    try {
        const response = await fetch(`/api/autochat/sessions/${currentAutoSession.session_id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                messages: currentAutoSession.messages,
                current_turn: newTurnCount 
            })
        });
        
        const data = await response.json();
        if (data.success) {
            renderAutoMessages();
            showNotification('Message deleted', 'Success', 'success');
        }
    } catch (error) {
        console.error('[AUTOCHAT] Error deleting message:', error);
        showNotification('Failed to delete message', 'Error', 'error');
    }
}

// Duplicate session
async function duplicateAutoSession(sessionId) {
    // Store session ID for modal
    window.duplicatingAutochatSessionId = sessionId;
    
    // Show duplicate modal
    document.getElementById('duplicateAutochatModal').style.display = 'flex';
}

function closeDuplicateAutochatModal() {
    document.getElementById('duplicateAutochatModal').style.display = 'none';
    window.duplicatingAutochatSessionId = null;
}

async function confirmDuplicateAutochat() {
    if (!window.duplicatingAutochatSessionId) return;
    
    const copy_settings = document.getElementById('duplicateAutochatSettings').checked;
    const copy_messages = document.getElementById('duplicateAutochatMessages').checked;
    
    try {
        const response = await fetch(`/api/autochat/sessions/${window.duplicatingAutochatSessionId}/duplicate`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ copy_settings, copy_messages })
        });
        
        const data = await response.json();
        if (data.success) {
            closeDuplicateAutochatModal();
            await loadAutoSessions();
            selectAutoSession(data.session.session_id);
            showNotification('Session duplicated', 'Success', 'success');
        }
    } catch (error) {
        console.error('[AUTOCHAT] Error duplicating session:', error);
        showNotification('Failed to duplicate session', 'Error', 'error');
    }
}

// Delete session
async function deleteAutoSession(sessionId) {
    const confirmed = await showConfirm(
        'Are you sure you want to delete this auto chat session? This action cannot be undone.',
        'Delete Session'
    );
    
    if (!confirmed) return;
    
    try {
        const response = await fetch(`/api/autochat/sessions/${sessionId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        if (data.success) {
            if (currentAutoSession && currentAutoSession.session_id === sessionId) {
                currentAutoSession = null;
                clearAutoUI();
            }
            await loadAutoSessions();
            showNotification('Session deleted', 'Success', 'success');
        }
    } catch (error) {
        console.error('[AUTOCHAT] Error deleting session:', error);
        showNotification('Failed to delete session', 'Error', 'error');
    }
}

// Clear UI when no session selected
function clearAutoUI() {
    // Stop polling and clear streaming connections
    if (autoPollingInterval) {
        clearInterval(autoPollingInterval);
        autoPollingInterval = null;
    }
    activeStreamingMessages.clear();
    
    document.getElementById('autochatMessages').innerHTML = `
        <div class="chat-empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                <path d="M9 10h.01M15 10h.01"></path>
                <path d="M9.5 15a3.5 3.5 0 0 0 5 0"></path>
            </svg>
            <h3>Start AI Conversation</h3>
            <p>Create a new auto chat or select an existing one from the sidebar</p>
        </div>
    `;
    
    document.getElementById('autochatSessionTitle').textContent = 'Select a session';
    document.getElementById('autochatTurnCounter').style.display = 'none';
    document.getElementById('autochatManualSection').style.display = 'none';
    document.getElementById('flipDisplayLabel').style.display = 'none';
    
    // Disable all controls
    document.querySelectorAll('#autochatParamsContent input, #autochatParamsContent select, #autochatParamsContent textarea').forEach(el => {
        el.disabled = true;
    });
}

// Update session name
async function updateAutochatSessionName() {
    if (!currentAutoSession) return;
    
    const name = document.getElementById('autochatSessionName').value.trim();
    if (!name || name === currentAutoSession.session_name) return;
    
    try {
        const response = await fetch(`/api/autochat/sessions/${currentAutoSession.session_id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ session_name: name })
        });
        
        const data = await response.json();
        if (data.success) {
            currentAutoSession.session_name = name;
            document.getElementById('autochatSessionTitle').textContent = name;
            await loadAutoSessions();
        }
    } catch (error) {
        console.error('[AUTOCHAT] Error updating session name:', error);
    }
}

// Update max turns
async function updateAutochatMaxTurns() {
    if (!currentAutoSession) return;
    
    const maxTurns = parseInt(document.getElementById('autochatMaxTurns').value);
    
    try {
        const response = await fetch(`/api/autochat/sessions/${currentAutoSession.session_id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ max_turns: maxTurns })
        });
        
        const data = await response.json();
        if (data.success) {
            currentAutoSession.max_turns = maxTurns;
            document.getElementById('autochatTurnCounter').textContent = 
                `Turn ${currentAutoSession.current_turn}/${maxTurns}`;
            updateControlButtons();
        }
    } catch (error) {
        console.error('[AUTOCHAT] Error updating max turns:', error);
    }
}

// Update persona settings
async function updatePersona(persona) {
    if (!currentAutoSession) return;
    
    const prefix = `persona${persona}`;
    const personaKey = `persona_${persona.toLowerCase()}`;
    
    const seedValue = document.getElementById(`${prefix}Seed`).value;
    const updatedPersona = {
        name: document.getElementById(`${prefix}Name`).value.trim(),
        system_prompt: document.getElementById(`${prefix}System`).value.trim(),
        temperature: parseFloat(document.getElementById(`${prefix}Temperature`).value),
        top_p: parseFloat(document.getElementById(`${prefix}TopP`).value),
        top_k: parseInt(document.getElementById(`${prefix}TopK`).value),
        repeat_penalty: parseFloat(document.getElementById(`${prefix}RepeatPenalty`).value),
        seed: seedValue ? parseInt(seedValue) : null
    };
    
    try {
        const response = await fetch(`/api/autochat/sessions/${currentAutoSession.session_id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ [personaKey]: updatedPersona })
        });
        
        const data = await response.json();
        if (data.success) {
            currentAutoSession[personaKey] = updatedPersona;
            updateManualPersonaLabels();
            await loadAutoSessions();
        }
    } catch (error) {
        console.error(`[AUTOCHAT] Error updating persona ${persona}:`, error);
    }
}

// Update shared settings (model and num_ctx)
async function updateSharedSettings() {
    if (!currentAutoSession) return;
    
    const model = document.getElementById('autochatSharedModel').value;
    const num_ctx = parseInt(document.getElementById('autochatSharedNumCtx').value);
    
    try {
        const response = await fetch(`/api/autochat/sessions/${currentAutoSession.session_id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ model, num_ctx })
        });
        
        const data = await response.json();
        if (data.success) {
            currentAutoSession.model = model;
            currentAutoSession.num_ctx = num_ctx;
            updateTokenDisplay();
            await loadAutoSessions();
        }
    } catch (error) {
        console.error('[AUTOCHAT] Error updating shared settings:', error);
    }
}

// Clear persona A seed (set to random)
function clearPersonaASeed() {
    const seedInput = document.getElementById('personaASeed');
    const seedValue = document.getElementById('personaASeedValue');
    if (seedInput && seedValue) {
        seedInput.value = '';
        seedValue.textContent = 'Random';
        updatePersona('A');
    }
}

// Clear persona B seed (set to random)
function clearPersonaBSeed() {
    const seedInput = document.getElementById('personaBSeed');
    const seedValue = document.getElementById('personaBSeedValue');
    if (seedInput && seedValue) {
        seedInput.value = '';
        seedValue.textContent = 'Random';
        updatePersona('B');
    }
}

// Update token display
function updateTokenDisplay() {
    if (!currentAutoSession) return;
    
    const totalTokens = calculateTotalTokens(currentAutoSession.messages);
    const maxContext = currentAutoSession.num_ctx || currentAutoSession.persona_a?.num_ctx || 2048;
    const contextUsage = (totalTokens / maxContext) * 100;
    
    // Update total tokens
    document.getElementById('autochatTotalTokens').textContent = 
        `Total: ${totalTokens.toLocaleString()} tokens`;
    
    // Update context bar
    const contextBar = document.getElementById('autochatContextBar');
    const contextLabel = document.getElementById('autochatContextLabel');
    
    if (contextBar && contextLabel) {
        contextBar.style.width = `${Math.min(contextUsage, 100)}%`;
        
        // Color code
        if (contextUsage < 70) {
            contextBar.style.backgroundColor = 'var(--success-color, #34d399)';
        } else if (contextUsage < 90) {
            contextBar.style.backgroundColor = 'var(--warning-color, #fbbf24)';
        } else {
            contextBar.style.backgroundColor = 'var(--error-color, #ff3b30)';
        }
        
        contextLabel.textContent = `${contextUsage.toFixed(1)}% of ${maxContext.toLocaleString()} context`;
    }
}

// Calculate total tokens
function calculateTotalTokens(messages) {
    return messages.reduce((total, msg) => {
        return total + estimateTokenCount(msg.content || '');
    }, 0);
}

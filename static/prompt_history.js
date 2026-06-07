// ─── Prompt History System ────────────────────────────────────────────────────
// Tracks recent prompts per category (image, video, chat) in localStorage.
// Image prompts are shared across: Single, Text Batch, Image Batch, Frame Edit.
// Video prompts are shared across: Video, Video Batch.
// Chat prompts are shared across: Chat, Story, AutoChat (manual input).
//
// Usage:
//   - Call attachPromptHistory(textareaEl, 'image'|'video'|'chat') to wire up a textarea.
//   - When a generation is submitted, call savePromptToHistory(promptText, category).
// ─────────────────────────────────────────────────────────────────────────────

const PROMPT_HISTORY_MAX = 50;

const PROMPT_HISTORY_KEYS = {
    image: 'promptHistory_image',
    video: 'promptHistory_video',
    chat:  'promptHistory_chat',
};

// ── Storage helpers ──────────────────────────────────────────────────────────

/** Return the history array for a category (most-recent first). */
function getPromptHistory(category) {
    const key = PROMPT_HISTORY_KEYS[category];
    if (!key) return [];
    try {
        return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
        return [];
    }
}

/**
 * Save a prompt to the category history.
 * Duplicates are NOT stored – if the exact text already exists it is moved to
 * the front instead. The list is capped at PROMPT_HISTORY_MAX entries.
 */
function savePromptToHistory(promptText, category) {
    const text = (promptText || '').trim();
    if (!text) return;

    const key = PROMPT_HISTORY_KEYS[category];
    if (!key) return;

    let history = getPromptHistory(category);

    // Remove existing identical entry so it bubbles to the top
    history = history.filter(item => item !== text);

    // Prepend the new entry
    history.unshift(text);

    // Cap the list
    if (history.length > PROMPT_HISTORY_MAX) {
        history = history.slice(0, PROMPT_HISTORY_MAX);
    }

    try {
        localStorage.setItem(key, JSON.stringify(history));
    } catch (e) {
        console.warn('[PromptHistory] Could not save to localStorage:', e);
    }
}

/** Clear all prompts for a category. */
function clearPromptHistory(category) {
    const key = PROMPT_HISTORY_KEYS[category];
    if (key) localStorage.removeItem(key);
}

// ── Dropdown UI ──────────────────────────────────────────────────────────────

// Track all active dropdowns so we can close them
const _promptHistoryDropdowns = new WeakMap();

/**
 * Attach prompt-history UI to a <textarea> element.
 * Creates a small history-button next to the textarea and a dropdown list.
 *
 * @param {HTMLTextAreaElement} textarea
 * @param {'image'|'video'|'chat'} category
 */
function attachPromptHistory(textarea, category) {
    if (!textarea) return;

    // Avoid double-attaching
    if (textarea.dataset.promptHistoryAttached) return;
    textarea.dataset.promptHistoryAttached = 'true';
    textarea.dataset.promptHistoryCategory = category;

    // ── Build wrapper ──
    const wrapper = document.createElement('div');
    wrapper.className = 'ph-wrapper';

    // Insert wrapper in place of textarea
    textarea.parentNode.insertBefore(wrapper, textarea);
    wrapper.appendChild(textarea);

    // ── Build trigger button ──
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ph-trigger-btn';
    btn.title = 'Recent prompts';
    btn.setAttribute('aria-label', 'Show recent prompts');
    btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
        </svg>
        <span class="ph-trigger-label">History</span>
        <svg class="ph-trigger-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="6 9 12 15 18 9"/>
        </svg>`;
    wrapper.appendChild(btn);

    // ── Build dropdown ──
    const dropdown = document.createElement('div');
    dropdown.className = 'ph-dropdown';
    dropdown.setAttribute('role', 'listbox');
    dropdown.setAttribute('aria-label', 'Recent prompts');
    wrapper.appendChild(dropdown);

    // ── State ──
    let isOpen = false;

    function renderDropdown() {
        const history = getPromptHistory(category);
        dropdown.innerHTML = '';

        // Header row
        const header = document.createElement('div');
        header.className = 'ph-header';

        const titleEl = document.createElement('span');
        titleEl.className = 'ph-header-title';
        const icons = { image: '🖼️', video: '🎬', chat: '💬' };
        titleEl.textContent = `${icons[category] || '📝'} Recent ${category} prompts`;
        header.appendChild(titleEl);

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'ph-clear-btn';
        clearBtn.title = `Clear ${category} prompt history`;
        clearBtn.textContent = 'Clear all';
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            clearPromptHistory(category);
            renderDropdown();
        });
        header.appendChild(clearBtn);
        dropdown.appendChild(header);

        if (history.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'ph-empty';
            empty.textContent = 'No recent prompts yet.';
            dropdown.appendChild(empty);
            return;
        }

        const list = document.createElement('ul');
        list.className = 'ph-list';

        history.forEach((item, idx) => {
            const li = document.createElement('li');
            li.className = 'ph-item';
            li.setAttribute('role', 'option');
            li.tabIndex = 0;

            const textEl = document.createElement('span');
            textEl.className = 'ph-item-text';
            textEl.textContent = item;
            li.appendChild(textEl);

            // Delete individual entry
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'ph-item-del';
            delBtn.title = 'Remove this prompt';
            delBtn.setAttribute('aria-label', 'Remove this prompt');
            delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>`;
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                let h = getPromptHistory(category);
                h.splice(idx, 1);
                localStorage.setItem(PROMPT_HISTORY_KEYS[category], JSON.stringify(h));
                renderDropdown();
            });
            li.appendChild(delBtn);

            // Click or Enter → fill textarea
            const selectItem = () => {
                textarea.value = item;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                textarea.dispatchEvent(new Event('change', { bubbles: true }));
                closeDropdown();
                textarea.focus();
            };

            li.addEventListener('click', selectItem);
            li.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectItem();
                }
            });

            list.appendChild(li);
        });

        dropdown.appendChild(list);
    }

    function openDropdown() {
        if (isOpen) return;
        isOpen = true;
        renderDropdown();
        dropdown.classList.add('open');
        btn.classList.add('active');

        // Position: if there's room below keep it, otherwise flip up
        requestAnimationFrame(() => {
            const rect = wrapper.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            const dropH = dropdown.offsetHeight || 300;
            if (spaceBelow < dropH && spaceAbove > dropH) {
                dropdown.classList.add('flip-up');
            } else {
                dropdown.classList.remove('flip-up');
            }
        });
    }

    function closeDropdown() {
        if (!isOpen) return;
        isOpen = false;
        dropdown.classList.remove('open');
        btn.classList.remove('active');
    }

    // Store reference for external close
    _promptHistoryDropdowns.set(textarea, { open: openDropdown, close: closeDropdown });

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        isOpen ? closeDropdown() : openDropdown();
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) closeDropdown();
    }, true);

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) closeDropdown();
    });
}

// ── Wire up all prompt textareas ──────────────────────────────────────────────

/**
 * Call once after DOMContentLoaded to attach history to all known prompt
 * textareas in the app.
 */
function initializePromptHistory() {
    // Image prompts (shared list)
    const imagePromptIds = [
        'prompt',            // Single image
        'batchBasePrompt',   // Text Batch
        'imageBatchPrompt',  // Image Batch
        'frameEditPrompt',   // Frame Edit
    ];
    imagePromptIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) attachPromptHistory(el, 'image');
    });

    // Video prompts (shared list)
    const videoPromptIds = [
        'videoPrompt',       // Video
        'videoBatchPrompt',  // Video Batch
    ];
    videoPromptIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) attachPromptHistory(el, 'video');
    });

    // Chat prompts (shared list)
    const chatPromptIds = [
        'chatInput',             // Chat
        'storyInput',            // Story
        'autochatManualInput',   // Auto Chat manual message
    ];
    chatPromptIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) attachPromptHistory(el, 'chat');
    });

    console.log('[PromptHistory] Initialized');
}

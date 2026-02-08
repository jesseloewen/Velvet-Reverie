// ============================================================================
// CHARACTER MANAGEMENT MODAL
// ============================================================================

let uploadedCharImageFilename = null;
let characterEditorState = null; // Store editor state when switching to image browser

function openCharactersModal() {
    document.getElementById('charactersModal').style.display = 'flex';
    renderCharactersList();
    
    // Add Escape key handler
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeCharactersModal();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

function closeCharactersModal() {
    document.getElementById('charactersModal').style.display = 'none';
    document.getElementById('characterEditor').style.display = 'none';
}

function renderCharactersList() {
    const container = document.getElementById('charactersList');
    const characters = currentStorySession?.characters || [];
    const activeCharId = currentStorySession?.active_character_id;
    const userPersonaId = currentStorySession?.user_persona_id;
    
    document.getElementById('charactersCount').textContent = characters.length;
    
    // Update active character display
    const activeCharDisplay = document.getElementById('activeCharacterDisplay');
    const activeChar = characters.find(c => c.id === activeCharId);
    if (activeChar) {
        activeCharDisplay.textContent = `Active: ${activeChar.name}`;
        activeCharDisplay.style.color = 'var(--text-primary)';
    } else {
        activeCharDisplay.textContent = 'No active character';
        activeCharDisplay.style.color = 'var(--text-muted)';
    }
    
    if (characters.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 2rem;">No characters yet. Click "New Character" to add one.</div>';
        return;
    }
    
    container.innerHTML = characters.map(char => `
        <div class="character-card" style="
            background: var(--bg-secondary);
            border: 2px solid ${char.id === activeCharId ? 'var(--accent)' : 'var(--border-color)'};
            border-radius: 8px;
            padding: 1rem;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        ">
            <div style="display: flex; gap: 0.75rem; align-items: start;">
                <div style="flex: 1; min-width: 0; overflow: hidden;">
                    <h4 style="margin: 0 0 0.25rem 0; font-size: 1rem; line-height: 1.3; word-wrap: break-word;">
                        ${escapeHtml(char.name || 'Unnamed Character')}
                    </h4>
                    ${char.id === activeCharId ? '<div style="color: var(--accent); font-size: 0.75rem; margin: 0.25rem 0;">● Active Character</div>' : ''}
                    ${char.id === userPersonaId ? '<div style="color: var(--success); font-size: 0.75rem; margin: 0.25rem 0;">👤 Your Persona</div>' : ''}
                    ${char.include_in_lore ? '<div style="color: var(--primary); font-size: 0.75rem; margin: 0.25rem 0;">📖 Included in World Lore</div>' : ''}
                    <p style="margin: 0.5rem 0 0 0; font-size: 0.875rem; color: var(--text-muted); line-height: 1.4; word-wrap: break-word; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                        ${escapeHtml(char.description || 'No description')}
                    </p>
                </div>
                <div style="display: flex; gap: 0.25rem; flex-shrink: 0;">
                    <button class="btn-icon" onclick="editCharacter('${char.id}')" title="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn-icon" onclick="showCopyCharacterModal('${char.id}')" title="Copy to Another Story">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>
                    <button class="btn-icon" onclick="deleteCharacter('${char.id}')" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                ${char.id !== activeCharId ? `<button class="btn btn-sm" onclick="setActiveCharacter('${char.id}')" style="flex: 1; min-width: 120px; white-space: nowrap;">Set Active</button>` : ''}
                ${char.id !== userPersonaId ? `<button class="btn btn-sm" onclick="setUserPersona('${char.id}')" style="flex: 1; min-width: 120px; white-space: nowrap;">Set as You</button>` : `<button class="btn btn-sm" onclick="clearUserPersona()" style="flex: 1; min-width: 120px; white-space: nowrap;">Clear Persona</button>`}
                ${char.id !== activeCharId && char.id !== userPersonaId ? `<button class="btn btn-sm ${char.include_in_lore ? 'btn-primary' : ''}" onclick="toggleCharacterInLore('${char.id}')" style="flex: 1; min-width: 140px; white-space: nowrap;" title="Include this character's info in world context even when another character is active">${char.include_in_lore ? '📖 In Lore' : 'Add to Lore'}</button>` : ''}
            </div>
        </div>
    `).join('');
}

function addNewCharacter() {
    document.getElementById('characterEditorTitle').textContent = 'New Character';
    document.getElementById('editingCharacterId').value = '';
    document.getElementById('editCharName').value = '';
    document.getElementById('editCharImage').value = '';
    document.getElementById('editCharDescription').value = '';
    document.getElementById('editCharPersonality').value = '';
    document.getElementById('editCharExampleDialogue').value = '';
    document.getElementById('editCharImageUpload').value = '';
    document.getElementById('charImagePreview').style.display = 'none';
    uploadedCharImageFilename = null;
    document.getElementById('characterEditor').style.display = 'block';
    document.getElementById('characterEditor').scrollIntoView({ behavior: 'smooth' });
}

function openImageBrowserForCharacter() {
    // Save current character editor state
    characterEditorState = {
        charId: document.getElementById('editingCharacterId').value,
        name: document.getElementById('editCharName').value,
        image: document.getElementById('editCharImage').value,
        description: document.getElementById('editCharDescription').value,
        personality: document.getElementById('editCharPersonality').value,
        exampleDialogue: document.getElementById('editCharExampleDialogue').value,
        isEditing: document.getElementById('characterEditorTitle').textContent === 'Edit Character'
    };
    
    // Close character modal
    closeCharactersModal();
    
    // Open image browser in character mode
    imageBrowserMode = 'character';
    openImageBrowser('character');
}

function restoreCharacterEditor() {
    if (!characterEditorState) return;
    
    // Reopen characters modal
    document.getElementById('charactersModal').style.display = 'flex';
    renderCharactersList();
    
    // Restore editor state
    document.getElementById('characterEditorTitle').textContent = characterEditorState.isEditing ? 'Edit Character' : 'New Character';
    document.getElementById('editingCharacterId').value = characterEditorState.charId;
    document.getElementById('editCharName').value = characterEditorState.name;
    document.getElementById('editCharImage').value = characterEditorState.image;
    document.getElementById('editCharDescription').value = characterEditorState.description;
    document.getElementById('editCharPersonality').value = characterEditorState.personality;
    document.getElementById('editCharExampleDialogue').value = characterEditorState.exampleDialogue;
    
    // Show editor and preview
    document.getElementById('characterEditor').style.display = 'block';
    
    const preview = document.getElementById('charImagePreview');
    const previewImg = document.getElementById('charImagePreviewImg');
    if (characterEditorState.image) {
        previewImg.src = characterEditorState.image;
        preview.style.display = 'block';
    }
    
    // Clear state
    characterEditorState = null;
}

function clearCharacterImage() {
    document.getElementById('editCharImage').value = '';
    document.getElementById('editCharImageUpload').value = '';
    document.getElementById('charImagePreview').style.display = 'none';
    uploadedCharImageFilename = null;
}

function editCharacter(charId) {
    const char = currentStorySession.characters.find(c => c.id === charId);
    if (!char) return;
    
    document.getElementById('characterEditorTitle').textContent = 'Edit Character';
    document.getElementById('editingCharacterId').value = charId;
    document.getElementById('editCharName').value = char.name || '';
    document.getElementById('editCharImage').value = char.image || '';
    document.getElementById('editCharDescription').value = char.description || '';
    document.getElementById('editCharPersonality').value = char.personality || '';
    document.getElementById('editCharExampleDialogue').value = char.example_dialogue || '';
    document.getElementById('editCharImageUpload').value = '';
    uploadedCharImageFilename = null;
    
    // Show preview if image exists
    const preview = document.getElementById('charImagePreview');
    const previewImg = document.getElementById('charImagePreviewImg');
    if (char.image) {
        previewImg.src = char.image;
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
    
    document.getElementById('characterEditor').style.display = 'block';
    document.getElementById('characterEditor').scrollIntoView({ behavior: 'smooth' });
}

async function saveCharacterEdit() {
    const charId = document.getElementById('editingCharacterId').value;
    
    // Handle image upload if file is selected
    const imageUpload = document.getElementById('editCharImageUpload');
    if (imageUpload.files[0] && !uploadedCharImageFilename) {
        const formData = new FormData();
        formData.append('image', imageUpload.files[0]);
        
        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                uploadedCharImageFilename = result.filename;
                // Set the image path to use the uploaded file
                document.getElementById('editCharImage').value = `/api/video/${uploadedCharImageFilename}`;
            } else {
                showNotification(result.error || 'Image upload failed', 'error');
                return;
            }
        } catch (error) {
            console.error('Error uploading character image:', error);
            showNotification('Error uploading image', 'error');
            return;
        }
    }
    
    const charData = {
        name: document.getElementById('editCharName').value.trim(),
        image: document.getElementById('editCharImage').value.trim(),
        description: document.getElementById('editCharDescription').value.trim(),
        personality: document.getElementById('editCharPersonality').value.trim(),
        example_dialogue: document.getElementById('editCharExampleDialogue').value.trim()
    };
    
    console.log('[CHARACTER] Saving character:', charData);
    console.log('[CHARACTER] Current session:', currentStorySession?.session_id);
    
    if (!charData.name) {
        showNotification('Character name is required', 'error');
        return;
    }
    
    if (!currentStorySession) {
        console.error('[CHARACTER] No current session!');
        showNotification('No active story session', 'error');
        return;
    }
    
    // Make sure characters array exists
    let characters = Array.isArray(currentStorySession.characters) ? [...currentStorySession.characters] : [];
    console.log('[CHARACTER] Current characters array:', characters.length, 'items');
    
    if (charId) {
        // Update existing
        const index = characters.findIndex(c => c.id === charId);
        if (index !== -1) {
            characters[index] = { ...characters[index], ...charData };
        }
    } else {
        // Add new
        const newChar = {
            id: 'char_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            ...charData
        };
        characters.push(newChar);
        
        // Set as active if it's the first character
        if (characters.length === 1) {
            await updateStorySessionSettings({ 
                characters: characters,
                active_character_id: newChar.id
            });
            await loadStoryUI();  // Refresh UI
            renderCharactersList();
            cancelCharacterEdit();
            showNotification('First character created and set as active', 'success');
            return;
        }
    }
    
    console.log('[CHARACTER] Updating session with characters:', characters.length, 'total');
    await updateStorySessionSettings({ characters: characters });
    console.log('[CHARACTER] Character saved successfully');
    
    // Refresh UI to show updated count
    await loadStoryUI();
    
    // Re-render story messages to update character avatars
    if (typeof renderStoryMessages === 'function') {
        await renderStoryMessages();
    }
    
    // Show success message
    showNotification('Character saved successfully', 'success');
    
    renderCharactersList();
    cancelCharacterEdit();
}

function cancelCharacterEdit() {
    document.getElementById('characterEditor').style.display = 'none';
}

async function deleteCharacter(charId) {
    const confirmed = await showConfirm('Delete this character?', 'Confirm Delete');
    if (!confirmed) return;
    
    let characters = currentStorySession.characters.filter(c => c.id !== charId);
    const updates = { characters: characters };
    
    // Clear active character if we're deleting it
    if (currentStorySession.active_character_id === charId) {
        updates.active_character_id = characters.length > 0 ? characters[0].id : null;
    }
    
    // Clear user persona if we're deleting it
    if (currentStorySession.user_persona_id === charId) {
        updates.user_persona_id = null;
    }
    
    await updateStorySessionSettings(updates);
    renderCharactersList();
}

async function setActiveCharacter(charId) {
    await updateStorySessionSettings({ active_character_id: charId });
    renderCharactersList();
    showNotification('Active character updated', 'success');
}

async function setUserPersona(charId) {
    await updateStorySessionSettings({ user_persona_id: charId });
    renderCharactersList();
    showNotification('User persona set', 'success');
}

async function clearUserPersona() {
    await updateStorySessionSettings({ user_persona_id: null });
    renderCharactersList();
    showNotification('User persona cleared', 'success');
}

async function toggleCharacterInLore(charId) {
    const char = currentStorySession.characters.find(c => c.id === charId);
    if (!char) return;
    
    // Toggle the include_in_lore status
    const newStatus = !char.include_in_lore;
    
    // Update the character in the array
    let characters = currentStorySession.characters.map(c => {
        if (c.id === charId) {
            return { ...c, include_in_lore: newStatus };
        }
        return c;
    });
    
    await updateStorySessionSettings({ characters: characters });
    renderCharactersList();
    showNotification(newStatus ? 'Character added to world lore' : 'Character removed from world lore', 'success');
}

// ============================================================================
// COPY CHARACTER TO ANOTHER STORY
// ============================================================================

function showCopyCharacterModal(characterId) {
    const character = currentStorySession.characters.find(c => c.id === characterId);
    if (!character) return;
    
    // Store the character to copy
    window.characterToCopy = character;
    
    // Get all other stories (excluding current)
    const otherStories = storySessions.filter(s => s.session_id !== currentStorySession.session_id);
    
    if (otherStories.length === 0) {
        showNotification('No other stories available. Create another story first.', 'error');
        return;
    }
    
    // Show selection modal
    const modal = document.getElementById('copyCharacterModal');
    const list = document.getElementById('copyCharacterStoryList');
    
    document.getElementById('copyCharacterName').textContent = character.name;
    
    list.innerHTML = otherStories.map(story => `
        <div class="story-select-item" onclick="copyCharacterToStory('${story.session_id}')" style="
            padding: 1rem;
            border: 2px solid var(--border-color);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
        " onmouseover="this.style.borderColor='var(--accent)';" onmouseout="this.style.borderColor='var(--border-color)';">
            <div style="font-weight: 600; font-size: 1rem; margin-bottom: 0.25rem;">${escapeHtml(story.story_name || 'Untitled Story')}</div>
            <div style="color: var(--text-muted); font-size: 0.875rem;">
                ${story.characters?.length || 0} characters • ${story.lorebook?.length || 0} lorebook entries
            </div>
        </div>
    `).join('');
    
    modal.style.display = 'flex';
    
    // Add Escape key handler
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeCopyCharacterModal();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

function closeCopyCharacterModal() {
    document.getElementById('copyCharacterModal').style.display = 'none';
    window.characterToCopy = null;
}

async function copyCharacterToStory(targetSessionId) {
    if (!window.characterToCopy) return;
    
    try {
        // Get target story session
        const response = await fetch(`/api/story/sessions/${targetSessionId}`);
        if (!response.ok) throw new Error('Failed to load target story');
        
        const data = await response.json();
        const targetSession = data.session;
        
        // Create new character with new ID
        const newCharacter = {
            ...window.characterToCopy,
            id: 'char_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
        };
        
        // Add to target story's characters
        const targetCharacters = targetSession.characters || [];
        targetCharacters.push(newCharacter);
        
        // Update target story
        const updateResponse = await fetch(`/api/story/sessions/${targetSessionId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characters: targetCharacters })
        });
        
        if (!updateResponse.ok) throw new Error('Failed to update target story');
        
        showNotification(`Character "${newCharacter.name}" copied successfully!`, 'success');
        closeCopyCharacterModal();
        
    } catch (error) {
        console.error('[CHARACTER] Copy error:', error);
        showNotification('Failed to copy character', 'error');
    }
}

// ============================================================================
// LOREBOOK MANAGEMENT MODAL
// ============================================================================

function openLorebookModal() {
    document.getElementById('lorebookModal').style.display = 'flex';
    renderLorebookEntriesList();
    
    // Add Escape key handler
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeLorebookModal();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

function closeLorebookModal() {
    document.getElementById('lorebookModal').style.display = 'none';
    document.getElementById('lorebookEntryEditor').style.display = 'none';
}

function renderLorebookEntriesList() {
    const container = document.getElementById('lorebookEntriesList');
    const lorebook = currentStorySession?.lorebook || [];
    
    document.getElementById('lorebookCount').textContent = lorebook.length;
    
    if (lorebook.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 2rem;">No lorebook entries yet. Click "New Entry" to add one.</div>';
        return;
    }
    
    container.innerHTML = lorebook.map((entry, index) => `
        <div class="lorebook-card" style="
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 1rem;
        ">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem;">
                        ${entry.keys.map(key => `<span style="
                            background: var(--accent-bg);
                            color: var(--accent);
                            padding: 0.25rem 0.5rem;
                            border-radius: 4px;
                            font-size: 0.75rem;
                            font-weight: 500;
                        ">${escapeHtml(key)}</span>`).join('')}
                    </div>
                    <p style="margin: 0; font-size: 0.875rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                        ${escapeHtml(entry.content)}
                    </p>
                </div>
                <div style="display: flex; gap: 0.25rem; margin-left: 0.5rem;">
                    <button class="btn-icon ${entry.persistent ? 'btn-primary' : ''}" onclick="toggleLorebookPersistent(${index})" title="${entry.persistent ? 'Always active without keywords' : 'Toggle persistent (always active)'}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                        </svg>
                    </button>
                    <button class="btn-icon" onclick="editLorebookEntry(${index})" title="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn-icon" onclick="showCopyLorebookModal(${index})" title="Copy to Another Story">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>
                    <button class="btn-icon" onclick="deleteLorebookEntry(${index})" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function addNewLorebookEntry() {
    document.getElementById('lorebookEntryEditorTitle').textContent = 'New Entry';
    document.getElementById('editingLorebookEntryIndex').value = '';
    document.getElementById('editLorebookKeys').value = '';
    document.getElementById('editLorebookContent').value = '';
    document.getElementById('lorebookEntryEditor').style.display = 'block';
    document.getElementById('lorebookEntryEditor').scrollIntoView({ behavior: 'smooth' });
}

function editLorebookEntry(index) {
    const entry = currentStorySession.lorebook[index];
    if (!entry) return;
    
    document.getElementById('lorebookEntryEditorTitle').textContent = 'Edit Entry';
    document.getElementById('editingLorebookEntryIndex').value = index;
    document.getElementById('editLorebookKeys').value = entry.keys.join(', ');
    document.getElementById('editLorebookContent').value = entry.content;
    document.getElementById('lorebookEntryEditor').style.display = 'block';
    document.getElementById('lorebookEntryEditor').scrollIntoView({ behavior: 'smooth' });
}

async function saveLorebookEntryEdit() {
    const indexStr = document.getElementById('editingLorebookEntryIndex').value;
    const keysStr = document.getElementById('editLorebookKeys').value.trim();
    const content = document.getElementById('editLorebookContent').value.trim();
    
    if (!keysStr || !content) {
        showNotification('Keywords and content are required', 'error');
        return;
    }
    
    const keys = keysStr.split(',').map(k => k.trim()).filter(k => k);
    if (keys.length === 0) {
        showNotification('At least one keyword is required', 'error');
        return;
    }
    
    let lorebook = currentStorySession.lorebook || [];
    
    const entryData = { 
        keys, 
        content
    };
    
    if (indexStr !== '') {
        // Update existing - preserve persistent value
        const index = parseInt(indexStr);
        entryData.persistent = lorebook[index]?.persistent || false;
        lorebook[index] = entryData;
    } else {
        // Add new - default persistent to false
        entryData.persistent = false;
        lorebook.push(entryData);
    }
    
    await updateStorySessionSettings({ lorebook: lorebook });
    await loadStoryUI();  // Refresh UI
    
    // Show success message
    showNotification('Lorebook entry saved', 'success');
    
    renderLorebookEntriesList();
    cancelLorebookEntryEdit();
}

function cancelLorebookEntryEdit() {
    document.getElementById('lorebookEntryEditor').style.display = 'none';
}

async function deleteLorebookEntry(index) {
    const confirmed = await showConfirm('Delete this lorebook entry?', 'Confirm Delete');
    if (!confirmed) return;
    
    let lorebook = currentStorySession.lorebook.filter((_, i) => i !== index);
    await updateStorySessionSettings({ lorebook: lorebook });
    renderLorebookEntriesList();
}

async function toggleLorebookPersistent(index) {
    let lorebook = currentStorySession.lorebook || [];
    
    if (lorebook[index]) {
        // Toggle the persistent status
        lorebook[index].persistent = !lorebook[index].persistent;
        
        await updateStorySessionSettings({ lorebook: lorebook });
        renderLorebookEntriesList();
        
        const status = lorebook[index].persistent ? 'always active' : 'keyword-triggered';
        showNotification(`Lorebook entry is now ${status}`, 'success');
    }
}

// ============================================================================
// COPY LOREBOOK ENTRY TO ANOTHER STORY
// ============================================================================

function showCopyLorebookModal(entryIndex) {
    const entry = currentStorySession.lorebook[entryIndex];
    if (!entry) return;
    
    // Store the entry to copy
    window.lorebookEntryToCopy = entry;
    
    // Get all other stories (excluding current)
    const otherStories = storySessions.filter(s => s.session_id !== currentStorySession.session_id);
    
    if (otherStories.length === 0) {
        showNotification('No other stories available. Create another story first.', 'error');
        return;
    }
    
    // Show selection modal
    const modal = document.getElementById('copyLorebookModal');
    const list = document.getElementById('copyLorebookStoryList');
    
    document.getElementById('copyLorebookKeys').textContent = entry.keys.join(', ');
    
    list.innerHTML = otherStories.map(story => `
        <div class="story-select-item" onclick="copyLorebookToStory('${story.session_id}')" style="
            padding: 1rem;
            border: 2px solid var(--border-color);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
        " onmouseover="this.style.borderColor='var(--accent)';" onmouseout="this.style.borderColor='var(--border-color)';">
            <div style="font-weight: 600; font-size: 1rem; margin-bottom: 0.25rem;">${escapeHtml(story.story_name || 'Untitled Story')}</div>
            <div style="color: var(--text-muted); font-size: 0.875rem;">
                ${story.characters?.length || 0} characters • ${story.lorebook?.length || 0} lorebook entries
            </div>
        </div>
    `).join('');
    
    modal.style.display = 'flex';
    
    // Add Escape key handler
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeCopyLorebookModal();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

function closeCopyLorebookModal() {
    document.getElementById('copyLorebookModal').style.display = 'none';
    window.lorebookEntryToCopy = null;
}

async function copyLorebookToStory(targetSessionId) {
    if (!window.lorebookEntryToCopy) return;
    
    try {
        // Get target story session
        const response = await fetch(`/api/story/sessions/${targetSessionId}`);
        if (!response.ok) throw new Error('Failed to load target story');
        
        const data = await response.json();
        const targetSession = data.session;
        
        // Create copy of entry (no ID needed for lorebook entries)
        const newEntry = {
            keys: [...window.lorebookEntryToCopy.keys],
            content: window.lorebookEntryToCopy.content
        };
        
        // Add to target story's lorebook
        const targetLorebook = targetSession.lorebook || [];
        targetLorebook.push(newEntry);
        
        // Update target story
        const updateResponse = await fetch(`/api/story/sessions/${targetSessionId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lorebook: targetLorebook })
        });
        
        if (!updateResponse.ok) throw new Error('Failed to update target story');
        
        showNotification(`Lorebook entry "${newEntry.keys.join(', ')}" copied successfully!`, 'success');
        closeCopyLorebookModal();
        
    } catch (error) {
        console.error('[LOREBOOK] Copy error:', error);
        showNotification('Failed to copy lorebook entry', 'error');
    }
}

// ============================================================================
// COPY ALL CHARACTERS TO ANOTHER STORY
// ============================================================================

function showCopyAllCharactersModal() {
    const characters = currentStorySession?.characters || [];
    
    if (characters.length === 0) {
        showNotification('No characters to copy', 'error');
        return;
    }
    
    // Get all other stories (excluding current)
    const otherStories = storySessions.filter(s => s.session_id !== currentStorySession.session_id);
    
    if (otherStories.length === 0) {
        showNotification('No other stories available. Create another story first.', 'error');
        return;
    }
    
    // Show selection modal
    const modal = document.getElementById('copyAllCharactersModal');
    const list = document.getElementById('copyAllCharactersStoryList');
    
    document.getElementById('copyAllCharactersCount').textContent = characters.length;
    
    list.innerHTML = otherStories.map(story => `
        <div class="story-select-item" onclick="copyAllCharactersToStory('${story.session_id}')" style="
            padding: 1rem;
            border: 2px solid var(--border-color);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
        " onmouseover="this.style.borderColor='var(--accent)';" onmouseout="this.style.borderColor='var(--border-color)';">
            <div style="font-weight: 600; font-size: 1rem; margin-bottom: 0.25rem;">${escapeHtml(story.story_name || 'Untitled Story')}</div>
            <div style="color: var(--text-muted); font-size: 0.875rem;">
                ${story.characters?.length || 0} characters • ${story.lorebook?.length || 0} lorebook entries
            </div>
        </div>
    `).join('');
    
    modal.style.display = 'flex';
    
    // Add Escape key handler
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeCopyAllCharactersModal();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

function closeCopyAllCharactersModal() {
    document.getElementById('copyAllCharactersModal').style.display = 'none';
}

async function copyAllCharactersToStory(targetSessionId) {
    const characters = currentStorySession?.characters || [];
    
    if (characters.length === 0) {
        showNotification('No characters to copy', 'error');
        return;
    }
    
    try {
        // Get target story session
        const response = await fetch(`/api/story/sessions/${targetSessionId}`);
        if (!response.ok) throw new Error('Failed to load target story');
        
        const data = await response.json();
        const targetSession = data.session;
        
        // Create new characters with new IDs
        const newCharacters = characters.map(char => ({
            ...char,
            id: 'char_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
        }));
        
        // Add to target story's characters
        const targetCharacters = targetSession.characters || [];
        targetCharacters.push(...newCharacters);
        
        // Update target story
        const updateResponse = await fetch(`/api/story/sessions/${targetSessionId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characters: targetCharacters })
        });
        
        if (!updateResponse.ok) throw new Error('Failed to update target story');
        
        showNotification(`${newCharacters.length} characters copied successfully!`, 'success');
        closeCopyAllCharactersModal();
        
    } catch (error) {
        console.error('[CHARACTER] Copy all error:', error);
        showNotification('Failed to copy characters', 'error');
    }
}

// ============================================================================
// COPY ALL LOREBOOK TO ANOTHER STORY
// ============================================================================

function showCopyAllLorebookModal() {
    const lorebook = currentStorySession?.lorebook || [];
    
    if (lorebook.length === 0) {
        showNotification('No lorebook entries to copy', 'error');
        return;
    }
    
    // Get all other stories (excluding current)
    const otherStories = storySessions.filter(s => s.session_id !== currentStorySession.session_id);
    
    if (otherStories.length === 0) {
        showNotification('No other stories available. Create another story first.', 'error');
        return;
    }
    
    // Show selection modal
    const modal = document.getElementById('copyAllLorebookModal');
    const list = document.getElementById('copyAllLorebookStoryList');
    
    document.getElementById('copyAllLorebookCount').textContent = lorebook.length;
    
    list.innerHTML = otherStories.map(story => `
        <div class="story-select-item" onclick="copyAllLorebookToStory('${story.session_id}')" style="
            padding: 1rem;
            border: 2px solid var(--border-color);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
        " onmouseover="this.style.borderColor='var(--accent)';" onmouseout="this.style.borderColor='var(--border-color)';">
            <div style="font-weight: 600; font-size: 1rem; margin-bottom: 0.25rem;">${escapeHtml(story.story_name || 'Untitled Story')}</div>
            <div style="color: var(--text-muted); font-size: 0.875rem;">
                ${story.characters?.length || 0} characters • ${story.lorebook?.length || 0} lorebook entries
            </div>
        </div>
    `).join('');
    
    modal.style.display = 'flex';
    
    // Add Escape key handler
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeCopyAllLorebookModal();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

function closeCopyAllLorebookModal() {
    document.getElementById('copyAllLorebookModal').style.display = 'none';
}

async function copyAllLorebookToStory(targetSessionId) {
    const lorebook = currentStorySession?.lorebook || [];
    
    if (lorebook.length === 0) {
        showNotification('No lorebook entries to copy', 'error');
        return;
    }
    
    try {
        // Get target story session
        const response = await fetch(`/api/story/sessions/${targetSessionId}`);
        if (!response.ok) throw new Error('Failed to load target story');
        
        const data = await response.json();
        const targetSession = data.session;
        
        // Create copies of lorebook entries (lorebook doesn't need new IDs)
        const newEntries = lorebook.map(entry => ({ ...entry }));
        
        // Add to target story's lorebook
        const targetLorebook = targetSession.lorebook || [];
        targetLorebook.push(...newEntries);
        
        // Update target story
        const updateResponse = await fetch(`/api/story/sessions/${targetSessionId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lorebook: targetLorebook })
        });
        
        if (!updateResponse.ok) throw new Error('Failed to update target story');
        
        showNotification(`${newEntries.length} lorebook entries copied successfully!`, 'success');
        closeCopyAllLorebookModal();
        
    } catch (error) {
        console.error('[LOREBOOK] Copy all error:', error);
        showNotification('Failed to copy lorebook entries', 'error');
    }
}

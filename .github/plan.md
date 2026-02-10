# Plan: Auto Chat - Dual AI Autonomous Conversations with Manual Intervention

This will add a new Auto Chat tab enabling two AI personas to converse autonomously with each other, with full chat features (streaming, parameters, manual intervention, and perspective flipping). The feature leverages the existing partial implementation in `autochat.json` and follows the established chat architecture patterns.

**Core Concept**: Two AI personas (A & B) alternate messages automatically. Each persona has independent settings (model, system prompt, parameters). The user can inject manual messages as either persona anytime, and flip the display names/avatars without affecting the actual conversation flow.

## Implementation Status

### ✅ Phase 1: Backend Foundation (COMPLETED)

#### ✅ Step 1: Backend Session Management (COMPLETED)
- ✅ Added `AUTOCHAT_FILE` constant in `app.py`
- ✅ Created `load_autochat()` and `save_autochat()` functions
- ✅ Added `GET /api/autochat/sessions` - List all sessions
- ✅ Added `POST /api/autochat/sessions` - Create new session
- ✅ Added `GET /api/autochat/sessions/<session_id>` - Get specific session
- ✅ Added `PUT /api/autochat/sessions/<session_id>` - Update session
- ✅ Added `DELETE /api/autochat/sessions/<session_id>` - Delete session
- ✅ Added `POST /api/autochat/sessions/<session_id>/duplicate` - Duplicate session

#### ✅ Step 2: Backend Message Context Transformation (COMPLETED)
- ✅ Created `build_autochat_context(session, active_persona)` function
- ✅ Implements role-flipping logic (active persona becomes 'assistant', other becomes 'user')
- ✅ Applies persona-specific system prompt

#### ✅ Step 3: Backend Auto Generation Queue Processing (COMPLETED)
- ✅ Added `POST /api/autochat/start` - Start conversation
- ✅ Added autochat job handling in `process_queue()` function
- ✅ Streaming response with periodic saves (every 10 chunks)
- ✅ Auto-enqueue next turn when current completes
- ✅ Respects max_turns limit
- ✅ Handles cancellation gracefully
- ✅ Model unloading after job completes

#### ✅ Step 4: Backend Manual Intervention & Control (COMPLETED)
- ✅ Added `POST /api/autochat/manual_message` - Inject manual message
- ✅ Added `POST /api/autochat/sessions/<session_id>/stop` - Stop conversation
- ✅ Added `POST /api/autochat/sessions/<session_id>/continue` - Resume conversation
- ✅ Added `GET /api/autochat/stream/<session_id>/<response_id>` - SSE streaming

**Fixed Issues:**
- ✅ Model storage bug: Session creation now properly stores model as string (not "[object Object]")

### ✅ Phase 2: Frontend Implementation (COMPLETED)

#### ✅ Step 5: Frontend HTML Tab Structure (COMPLETED)
- ✅ Added Auto Chat button to tab navigation in "Chats" group
- ✅ Added Auto Chat tab HTML after Story tab  
- ✅ Three-column layout (sessions sidebar | messages area | parameters panel)
- ✅ Session controls (start/stop/continue/flip display buttons)
- ✅ Parameters panel with persona A/B accordions
- ✅ Manual message input section with persona selector
- ✅ Duplicate session modal

#### ✅ Step 6: Frontend Auto Chat Core Logic (COMPLETED)
- ✅ Created `static/autochat.js` with full functionality
- ✅ Session management functions (create, load, select, delete, duplicate)
- ✅ Message rendering with persona-based styling
- ✅ Streaming with 300ms polling
- ✅ Manual message sending with persona selection
- ✅ Token counting per message + total context bar

#### ✅ Step 7: Frontend Display Flip Logic (COMPLETED)
- ✅ Toggle checkbox for display flipping in header
- ✅ `getDisplayPersona()` function implemented
- ✅ UI label/avatar swapping (data unchanged)
- ✅ Manual send dropdown labels flip with toggle

#### ✅ Step 8: Frontend Parameters Panel (COMPLETED)
- ✅ Real-time parameter updates for both personas
- ✅ Model dropdown integration with Ollama
- ✅ Auto-save on blur for text inputs
- ✅ Slider live value displays

#### ✅ Step 9: Frontend Tab Integration (COMPLETED)
- ✅ Added to `switchTab()` function mapping (already existed)
- ✅ Added `initializeAutoChat()` call in initialization
- ✅ Queue rendering already supports autochat job type
- ✅ Tab visibility CSS integrated

#### ✅ Step 10: Frontend Session Management UI (COMPLETED)
- ✅ Delete session with confirmation dialog
- ✅ Duplicate session modal with checkboxes
- ✅ Session list with metadata (turn count, models, names)
- ✅ New session button with default settings

#### ✅ Step 11: CSS Styling (COMPLETED)
- ✅ `.autochat-message` - Persona-colored borders (A=blue, B=green)
- ✅ `.autochat-manual-section` - Manual input area styling
- ✅ `.autochat-persona-badge` - Manual message indicator badge
- ✅ `.autochat-controls` - Top bar button group
- ✅ `.autochat-flip-toggle` - Display flip checkbox styling
- ✅ `.autochat-params-accordion` - Collapsible persona settings
- ✅ Mobile responsive design

#### ✅ Step 12: Script Integration (COMPLETED)
- ✅ Added `autochat.js` script include in `index.html`
- ✅ Integrated with existing chat system styles
- ✅ Mobile-responsive controls

## ✅ IMPLEMENTATION COMPLETE

All backend and frontend components have been implemented successfully!

## Steps

### 1. Backend: Session Management
Add Auto Chat session CRUD operations to [app.py](app.py)

- Load/save functions for `outputs/chats/autochat.json` (pattern from `load_chat_sessions()`)
- `GET /api/autochat/sessions` - List all sessions (sorted by updated_at)
- `POST /api/autochat/sessions` - Create new session with default persona A/B settings
- `GET /api/autochat/sessions/<session_id>` - Get specific session with full data
- `PUT /api/autochat/sessions/<session_id>` - Update session (names, settings, messages)
- `DELETE /api/autochat/sessions/<session_id>` - Delete session
- `POST /api/autochat/sessions/<session_id>/duplicate` - Duplicate with optional settings/messages
- Use `chat_lock` for thread-safe file access

### 2. Backend: Message Context Transformation
Build dynamic role-flipping in [app.py](app.py)

- Create `build_autochat_context(session, active_persona)` function
- When generating for persona A: A's messages become `role='assistant'`, B's become `role='user'`
- When generating for persona B: B's messages become `role='assistant'`, A's become `role='user'`
- Apply persona-specific `system_prompt` at context start
- Handle manual messages (tagged with `manual: true`) as coming from specified persona
- Respect `num_ctx` limit (default 2048 per persona)

### 3. Backend: Auto Generation Queue Processing
Add autochat job handling to [app.py](app.py) `process_queue()` function

- `POST /api/autochat/start` - Enqueue initial turn (creates job with `job_type: 'autochat'`)
- Queue job structure: `{job_type: 'autochat', session_id, active_persona, response_id}`
- In `process_queue()` under autochat job type:
  - Load session, check status (skip if 'stopped')
  - Build context with `build_autochat_context(session, active_persona)`
  - Call `ollama_client.chat()` with persona's model and parameters (streaming, `keep_alive=-1`)
  - Save response incrementally (every 10 chunks) with `persona`, `response_id`, `completed: false`
  - When complete, mark `completed: true`, increment `current_turn`
  - If `current_turn < max_turns` and `status == 'running'`: auto-enqueue NEXT persona's turn
  - If `max_turns` reached: set `status: 'stopped'`
- Unload models after job completes (existing pattern)

### 4. Backend: Manual Intervention & Control
Add user control endpoints to [app.py](app.py)

- `POST /api/autochat/manual_message` - Inject manual message
  - Parameters: `session_id`, `message`, `persona` (a or b)
  - Validates: persona exists
  - Appends message with `manual: true`, `persona: <chosen>`, `completed: true`
  - If status was 'running': enqueue turn for OTHER persona (continues conversation)
  - Returns: success + updated session
- `POST /api/autochat/sessions/<session_id>/stop` - Set `status: 'stopped'`, don't enqueue next turn
- `POST /api/autochat/sessions/<session_id>/continue` - Set `status: 'running'`, enqueue next turn for `active_perspective` persona
- `GET /api/autochat/stream/<session_id>/<response_id>` - SSE-style polling endpoint (pattern from chat)

### 5. Frontend: HTML Tab Structure
Add Auto Chat tab to [templates/index.html](templates/index.html)

- Insert after Story tab (before Chat to Chat reference): `<div class="tab-content" id="autochatTab">`
- Three-column layout: sessions sidebar (left) | messages area (center) | parameters panel (right)
- **Sessions sidebar**: List with create/delete/duplicate buttons (pattern from chat)
- **Messages area**: 
  - Top bar: session name, start/stop/continue buttons, flip display toggle, turn counter (X/Y turns)
  - Messages container with scroll (same classes as `chatMessages`)
  - Manual input section: persona selector (A/B dropdown), textarea, send button, character count
- **Parameters panel** (collapsible):
  - Accordion with two sections: "Persona A Settings" and "Persona B Settings"
  - Each section: name input, model dropdown, system prompt textarea, sliders (temperature, top_p, top_k, repeat_penalty, num_ctx)
  - Max turns input (default 10, range 1-100)
- Custom modals: duplicate session, delete confirmation (pattern from chat)

### 6. Frontend: Auto Chat Core Logic
Create [static/autochat.js](static/autochat.js) (pattern from [static/story.js](static/story.js))

- State management: `currentAutoSession`, `autoPollingInterval`, `flipDisplay = false`
- `initializeAutoChat()` - Setup event listeners, load sessions
- `loadAutoSessions()` - Fetch `/api/autochat/sessions`, render list
- `createAutoSession()` - POST new session with default personas
- `selectAutoSession(sessionId)` - Load session, render messages, populate parameters
- `renderAutoMessages()` - Build message elements with persona-based styling
  - Apply `flipDisplay` to swap displayed names/avatars (not persona data)
  - User messages always on right, AI on left (unless manual injection matches flip)
  - Show persona name in header (use flipped names if `flipDisplay = true`)
  - Circular avatars with first letter of persona name
  - Token counting per message + total context bar
  - Edit/delete buttons (pattern from chat)
- `startAutoConversation()` - POST `/api/autochat/start`, start polling
- `stopAutoConversation()` - POST `/api/autochat/sessions/<id>/stop`
- `continueAutoConversation()` - POST `/api/autochat/sessions/<id>/continue`
- `sendManualMessage()` - POST `/api/autochat/manual_message` with chosen persona
- `startAutoPolling(responseId)` - Poll session every 300ms, update streaming message

### 7. Frontend: Display Flip Logic
Implement label/avatar swapping in [static/autochat.js](static/autochat.js)

- Add toggle checkbox: "Flip Display" (shows Persona B on left, A on right)
- `flipDisplay` state variable toggles name/avatar rendering only
- `getDisplayPersona(actualPersona)` - Returns display name based on flip state
- When rendering messages: use display persona for UI, keep actual persona in data
- Example: If flip=true, persona A messages show "Persona B" name/avatar
- Manual send dropdown labels flip too (shows flipped names to user)

### 8. Frontend: Parameters Panel
Add real-time parameter updates in [static/autochat.js](static/autochat.js)

- `updatePersonaA()` / `updatePersonaB()` - PUT `/api/autochat/sessions/<id>` with updated persona object
- Slider change listeners: debounce updates (300ms), show live values
- Model dropdown: fetch from `/api/ollama/models` (pattern from chat)
- Auto-save on blur for text inputs (name, system prompt)
- Visual indicator when settings change (unsaved badge)

### 9. Frontend: Tab Integration
Update [static/script.js](static/script.js) tab switching and queue rendering

- Add to `switchTab()` function: `'autochat': 'autochatTab'` mapping
- Add tab button to navigation if not exists: after Story tab
- In `renderQueueItem()`: already exists `job_type === 'autochat'` support (shows "Auto Chat" badge, timer)
- Call `initializeAutoChat()` in `initializeTabs()` after other chat initializations
- Add tab visibility CSS (show/hide on tab switch)

### 10. Frontend: Session Management UI
Add CRUD operations in [static/autochat.js](static/autochat.js)

- `deleteAutoSession(sessionId)` - Confirmation dialog → DELETE endpoint → reload list
- `duplicateAutoSession(sessionId)` - Modal with checkboxes (copy settings, copy messages) → POST duplicate endpoint
- `clearAutoMessages(sessionId)` - Confirmation → PUT with empty messages array
- Session list item click: load and switch to that session
- New session button: create with default settings, auto-select
- Show session metadata: persona names, model names, turn count, last updated

### 11. CSS Styling
Add Auto Chat specific styles to [static/style.css](static/style.css)

- `.autochat-message` - Persona-colored borders (A=blue, B=green)
- `.autochat-manual-section` - Manual input area styling (distinct from auto messages)
- `.autochat-persona-badge` - Small badge showing A/B on messages
- `.autochat-controls` - Top bar button group (start/stop/continue)
- `.autochat-flip-toggle` - Display flip checkbox styling
- `.autochat-params-accordion` - Collapsible persona settings sections
- Reuse existing `.chat-message`, `.chat-message-actions` classes for consistency
- Mobile responsive: collapsible panels, touch-friendly controls

### 12. Fix Existing Bugs
Correct autochat.json model storage issue in [app.py](app.py)

- Current bug: `"model": "[object Object]"` instead of string
- Ensure session creation/update serializes model as string (model name, not full object)
- Validate model exists in Ollama before saving (call `/api/ollama/models`)

## Verification

1. **Create session**: Navigate to Auto Chat tab → click "New Auto Chat" → verify session appears in list
2. **Configure personas**: Set names ("Alice", "Bob"), models (llama3.2), system prompts → save → verify updates persist
3. **Start auto conversation**: Set max_turns=5 → click "Start" → verify messages stream in alternating (Alice → Bob → Alice...)
4. **Manual intervention**: While running → select persona A → type message → send → verify appears in conversation → verify auto resumes with B's response
5. **Flip display**: Toggle "Flip Display" → verify names/avatars swap visually → send manual message → verify still sends as correct persona (not affected by display)
6. **Stop/Continue**: Click "Stop" during generation → verify current message completes → verify next turn doesn't auto-start → click "Continue" → verify resumes
7. **Streaming**: Watch messages appear character-by-character → verify token counts update → verify context bar reflects usage
8. **Parameters**: Change temperature mid-conversation → verify new setting applies to next message
9. **Session management**: Duplicate session → verify settings copied → delete session → verify removed from list
10. **Queue integration**: Check queue sidebar → verify Auto Chat jobs show "Auto Chat" badge, timer, persona names

## Decisions

- **Display flip**: Swap labels/avatars only, not message positions (simpler, preserves visual flow)
- **Manual mode**: Allow anytime (running or stopped), pauses briefly for injection then resumes
- **Manual send**: User chooses persona via dropdown (flexible, explicit which side they're speaking as)
- **Message storage**: Store flat with `persona` field, transform roles dynamically per generation (cleaner, single source of truth)
- **Tab placement**: After Story tab (keeps chat features grouped)
- **Context transformation**: Each persona sees self as assistant, other as user (proper conversational context)
- **Auto-resume**: After manual message, auto-enqueues next turn for other persona (seamless intervention)

## Technical Details

### Session Structure (autochat.json)
```json
{
  "session_id": "uuid",
  "session_name": "Alice & Bob Conversation",
  "persona_a": {
    "name": "Alice",
    "model": "llama3.2",
    "system_prompt": "You are Alice, a friendly AI assistant.",
    "temperature": 0.7,
    "top_p": 0.9,
    "top_k": 40,
    "repeat_penalty": 1.1,
    "num_ctx": 2048
  },
  "persona_b": {
    "name": "Bob",
    "model": "llama3.2",
    "system_prompt": "You are Bob, a curious AI assistant.",
    "temperature": 0.7,
    "top_p": 0.9,
    "top_k": 40,
    "repeat_penalty": 1.1,
    "num_ctx": 2048
  },
  "max_turns": 10,
  "current_turn": 5,
  "status": "running",
  "active_perspective": "b",
  "messages": [
    {
      "role": "assistant",
      "content": "Hello Bob!",
      "timestamp": "2026-02-07T10:30:00",
      "message_id": "uuid",
      "persona": "a",
      "completed": true,
      "manual": false
    },
    {
      "role": "assistant",
      "content": "Hi Alice! How are you?",
      "timestamp": "2026-02-07T10:30:05",
      "message_id": "uuid",
      "persona": "b",
      "response_id": "uuid",
      "completed": true,
      "manual": false
    },
    {
      "role": "assistant",
      "content": "I'm doing great!",
      "timestamp": "2026-02-07T10:30:15",
      "message_id": "uuid",
      "persona": "a",
      "completed": true,
      "manual": true
    }
  ],
  "created_at": "2026-02-07T10:29:00",
  "updated_at": "2026-02-07T10:30:15"
}
```

### Context Building Logic
When generating for Persona A:
```python
context = [
    {"role": "system", "content": persona_a.system_prompt}
]
for msg in messages:
    if msg["persona"] == "a":
        context.append({"role": "assistant", "content": msg["content"]})
    else:  # persona b
        context.append({"role": "user", "content": msg["content"]})
```

When generating for Persona B (flipped):
```python
context = [
    {"role": "system", "content": persona_b.system_prompt}
]
for msg in messages:
    if msg["persona"] == "b":
        context.append({"role": "assistant", "content": msg["content"]})
    else:  # persona a
        context.append({"role": "user", "content": msg["content"]})
```

### Queue Job Structure
```python
{
    "id": "uuid",
    "job_type": "autochat",
    "session_id": "uuid",
    "active_persona": "a",  # or "b"
    "response_id": "uuid",
    "status": "queued",
    "created_at": "timestamp"
}
```

### Display Flip Logic
```javascript
function getDisplayPersona(actualPersona, flipDisplay) {
    if (flipDisplay) {
        return actualPersona === 'a' ? currentAutoSession.persona_b : currentAutoSession.persona_a;
    }
    return actualPersona === 'a' ? currentAutoSession.persona_a : currentAutoSession.persona_b;
}
```

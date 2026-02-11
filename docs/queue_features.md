# Queue Filtering and Direction Features

## Overview
Added functionality to filter queue items by type and reverse the queue display order.

## Features Implemented

### 1. Queue Filters
- **Queued Items Filter**: Show/hide items waiting in queue
- **Active/Generating Filter**: Show/hide currently processing items
- **Completed Filter**: Show/hide finished items

### 2. Queue Direction Toggle
- **Normal Mode** (default): Newest items first (LIFO display)
  - Section order: Queued → Active → Completed
- **Reversed Mode**: Oldest items first (FIFO display)
  - Section order: Completed → Active → Queued
  - The queue sections visually swap positions (completed moves to top)

## User Interface

### Filter Buttons
Located below the queue header, three toggle buttons:
- **Queued** - Shows queued items (checkmark icon)
- **Active** - Shows generating items (clock icon)
- **Done** - Shows completed items (checkmark circle icon)

Active filters have a purple background, inactive filters are gray.

### Direction Button
- Located to the right of filter buttons
- Arrow icon indicates direction (down = newest first, up = oldest first)
- Click to toggle between normal and reversed order

## Technical Details

### State Management
```javascript
// Filter state
let queueFilters = {
    queued: true,      // Show queued items
    generating: true,  // Show active/generating items
    completed: true    // Show completed items
};

// Direction state
let queueReversed = false; // false = newest first, true = oldest first
```

### Persistence
- Filter preferences saved to `localStorage.queueFilters`
- Direction preference saved to `localStorage.queueReversed`
- Settings persist across page reloads and sessions

### Mobile Responsive
- Buttons show icons only on mobile (≤768px)
- Text labels hidden to save space
- Properly sized for touch interaction (44px minimum tap target)

## Usage

### Filtering
1. Click any filter button to toggle that category on/off
2. At least one category should be active to see items
3. Disabled categories are completely hidden from view

### Direction
1. Click the direction button (arrow icon) to reverse order
2. Icon rotates 180° to indicate current direction
3. Reverses item order within queued and completed sections
4. Swaps section positions (Completed ↔ Queued)
5. Active/generating item always remains in middle

**Visual Changes:**
- Normal: Queued (top) → Active (middle) → Completed (bottom)
- Reversed: Completed (top) → Active (middle) → Queued (bottom)

## CSS Classes

### Filter Buttons
- `.queue-filter-btn` - Base filter button style
- `.queue-filter-btn.active` - Active state (enabled filter)

### Direction Button
- `.queue-direction-btn` - Base direction button style
- `.queue-direction-btn.reversed` - Reversed state (rotated icon)

### Queue Content
- `.queue-content` - Container with flexbox for section ordering
- `.queue-content.reversed` - Reversed state that swaps section positions
- `.queue-list` - Queued items section (order: 1 normal, 3 reversed)
- `.active-job` - Active/generating item section (order: 2 always)
- `.completed-list` - Completed items section (order: 3 normal, 1 reversed)
- `.queue-empty` - Empty message (order: 4 always)

## Functions

### JavaScript Functions
- `toggleQueueFilter(filterType)` - Toggle a specific filter on/off
- `toggleQueueDirection()` - Toggle queue direction
- `loadQueuePreferences()` - Load saved preferences from localStorage
- `updateQueueFilterButtons()` - Sync button states with preferences
- `updateQueueDirectionButton()` - Sync direction button state

### Modified Functions
- `renderQueue(queue, active, completed)` - Now respects filters and direction
  - Applies direction reversal to queued and completed arrays
  - Shows/hides sections based on filter states
  - Updates empty message logic to account for filters

## Benefits

### For Users
- **Better Organization**: Focus on relevant queue items
- **Cleaner Interface**: Hide completed items when not needed
- **Flexible Viewing**: Choose display order that makes sense for workflow

### For Workflow
- **Job Prioritization**: See newest/oldest items first based on preference
- **Progress Tracking**: Toggle completed items to focus on pending work
- **Queue Management**: Easier to manage large queues with filtering

## Browser Compatibility
- Works in all modern browsers
- Uses localStorage (supported IE8+)
- Graceful degradation if localStorage unavailable
- Mobile-optimized for touch devices

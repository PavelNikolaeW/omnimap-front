# OmniMap Frontend Architecture

Visual knowledge mapping application with real-time synchronization.

## Quick Links

| Module | Description | Path |
|--------|-------------|------|
| [API](modules/API.md) | HTTP client, auth, endpoints | `src/js/api/` |
| [State](modules/STATE.md) | Block storage, IndexedDB, state management | `src/js/stateLocal/` |
| [Sync](modules/SYNC.md) | WebSocket, offline queue, real-time | `src/js/sincManager/` |
| [Painter](modules/PAINTER.md) | Rendering, Grid layout, colors | `src/js/painter/` |
| [Commands](modules/COMMANDS.md) | Hotkeys, command system, context | `src/js/controller/comands/` |
| [Actions](modules/ACTIONS.md) | Business logic, block operations | `src/js/actions/` |
| [Diagrams](modules/DIAGRAMS.md) | jsPlumb connections, diagram mode | `src/js/controller/` |
| [Layout Editor](LAYOUT_EDITOR.md) | Visual grid editor | `src/js/controller/layoutEditor/` |

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    UI Layer (Controller)                     │
│     commands, popups, layoutEditor, blockStyleManager        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│               Business Logic Layer (Actions)                 │
│        blockActions, navigationActions, selectionActions     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              State Management Layer                          │
│      LocalStateManager, ContextManager, TreeService          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Data Synchronization Layer                      │
│            SincManager, WebSocket, OfflineQueue              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      API Layer                               │
│               api.js, chatApi.js, llmApi.js                  │
└─────────────────────────────────────────────────────────────┘
```

## Event-Driven Communication

Components communicate through window events via `dispatch()`:

```javascript
import { dispatch } from '../utils/utils';

// Emit event
dispatch('EventName', { key: value });

// Listen
window.addEventListener('EventName', (e) => {
    const data = e.detail;
});
```

### Key Events

| Event | Direction | Purpose |
|-------|-----------|---------|
| `ShowBlocks` | → Painter | Trigger re-render |
| `OpenBlock` | → LocalStateManager | Navigate into block |
| `UpdateBlocks` | → LocalStateManager | Update multiple blocks |
| `WebSocUpdateBlock` | WebSocket → State | Real-time sync update |
| `CreateBlock` | Command → State | Create new block |
| `MoveBlock` | Command → State | Move block to new parent |
| `ContextChanged` | ContextManager → UI | Selection changed |

## Application Modes

```javascript
MODES = {
    NORMAL: 'normal',           // Default navigation
    TEXT_EDIT: 'textEdit',      // Editing block text
    CONNECT_TO_BLOCK: 'connectToBlock',      // Selecting connection target
    CONNECT_SELECT_SOURCE: 'connectSelectSource', // Selecting connection source
    CUT_BLOCK: 'cutBlock',      // Moving block
    DIAGRAM: 'diagram',         // Diagram editing mode
    CHAT: 'chat'                // Chat panel open
}
```

## Block Data Format

```javascript
{
    id: 'uuid',                           // Unique identifier
    title: 'Block title',                 // Display title
    parent_id: 'parent-uuid' | false,     // Parent block (false for root)
    children: '["child-1", "child-2"]',   // JSON string of child IDs
    updated_at: 1234567890,               // Unix timestamp
    permission: 'view'|'edit'|'delete'|null, // Access level
    forbidden: boolean,                   // 403 access denied
    data: {
        text: 'Block content',
        childOrder: ['child-1', 'child-2'], // Render order
        color: [180, 50, 50],              // HSL color
        view: 'link'|'iframe'|null,        // Special view type
        customGrid: { grid, cells },       // Diagram mode
        layoutCells: { gridSize, cells },  // Layout editor
        connections: [{ sourceId, targetId, ... }], // Arrow connections
        customStyles: { shape, border, ... }  // Block styling
    }
}
```

## Real-Time Sync Flow

```
Backend (Django)
    │
    ▼ RabbitMQ (update_block, update_blocks)
    │
Sync Service (FastAPI)
    │
    ▼ WebSocket (block_update, block_updates_batch)
    │
Frontend (webSocket.js)
    │ debounce 50ms
    ▼
dispatch('WebSocUpdateBlock')
    │
LocalStateManager
    │
    ▼
Painter.render() → DOM
```

## Directory Structure

```
src/js/
├── index.js              # Entry point
├── config.js             # Runtime configuration
├── actions/              # Business logic layer
├── api/                  # HTTP clients
├── auth/                 # Authentication
├── controller/           # UI controllers
│   ├── comands/          # Command system
│   ├── layoutEditor/     # Visual grid editor
│   └── popups/           # Modal dialogs
├── core/                 # Health check, status
├── onboarding/           # User onboarding
├── painter/              # Rendering engine
├── services/             # Tree service, templates
├── sincManager/          # WebSocket sync
├── stateLocal/           # State management
└── utils/                # Utility functions
```

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@jsplumb/browser-ui` | ^6.2.10 | Connection arrows |
| `axios` | ^1.7.5 | HTTP client |
| `hotkeys-js` | ^3.13.9 | Keyboard shortcuts |
| `localforage` | ^1.10.0 | IndexedDB wrapper |
| `zustand` | ^5.0.9 | React state (chat UI) |

## Entry Point Flow

```javascript
// src/js/index.js
1. Import CSS styles
2. Register Service Worker
3. Initialize singletons:
   - LocalStateManager
   - SincManager (WebSocket)
   - CommandManager
   - Breadcrumbs
   - TreeNavigation
   - AuthStateManager
   - StatusIndicators
4. Check authentication
5. Load blocks and render
```

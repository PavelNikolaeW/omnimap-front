# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Workflow

**IMPORTANT: Разработка ведётся в отдельных ветках!**

1. **Создай ветку** для задачи:
   ```bash
   git checkout -b feature/название-задачи
   # или
   git checkout -b fix/описание-бага
   ```

2. **Работай в своей ветке** — никогда не коммить напрямую в `main`

3. **После завершения задачи** создай Pull Request:
   ```bash
   git push -u origin feature/название-задачи
   gh pr create --title "Описание" --body "Детали изменений"
   ```

4. **Дождись ревью** от Claude Code Action перед мержем

## Project Overview

OmniMap is a web-based visual knowledge mapping application built with JavaScript (ES6+) and Webpack 5. It enables users to create, visualize, and collaborate on hierarchical block-based information structures with real-time synchronization.

## Build & Development Commands

```bash
# Development server (uses remote backend at omnimap.ru)
npm start

# Development with local backend
npm run start_local

# Production build (minified, with service worker)
npm run build

# Debug build with source maps
npm run build:debug
```

Environment variables are configured in webpack configs:
- `APP_BACKEND_URL`: Backend API endpoint
- `LLM_GATEWAY_URL`: LLM service endpoint
- `SINC_SERVICE_URL`: WebSocket sync service URL

## Architecture

### Event-Driven Communication

The app uses a custom event system via window events. Components communicate through `dispatch()` (from `utils/utils.js`):

```javascript
dispatch('EventName', { key: value });  // Emit
window.addEventListener('EventName', (e) => { /* handle e.detail */ });  // Listen
```

Key events: `ShowBlocks`, `OpenBlock`, `UpdateBlocks`, `UndoStackAdd`, `ContextChanged`

### Core Modules

- **`src/js/index.js`**: Application entry point, initializes all managers
- **`src/js/controller/comands/comandManager.js`**: Command registration and hotkey binding (uses `hotkeys-js`)
- **`src/js/controller/comands/contextManager.js`**: UI state management (selected block, mode, etc.)
- **`src/js/stateLocal/localStateManager.js`**: Block repository and persistence (uses IndexedDB via `localforage`)
- **`src/js/painter/painter.js`**: Queue-based recursive renderer for block hierarchy
- **`src/js/sincManager/sincManager.js`**: Real-time WebSocket synchronization
- **`src/js/api/api.js`**: Axios-based API client with JWT token handling

### Command System

Commands are registered in `comandManager.js` with hotkey bindings:

```javascript
{
  id: 'commandName',
  hotkey: 'ctrl+k',
  mode: 'edit',  // or 'select', 'all'
  execute: (ctx) => { /* action */ },
  description: 'What this does'
}
```

Context (`ctx`) includes: `blockElement`, `mode`, `blockId`, `selectedBlocks`, etc.

### State Management

- **LocalStateManager**: Maintains block tree, handles IndexedDB persistence
- **ContextManager**: Tracks UI state (selection, mode, focus)
- **UndoStack**: Manages undo/redo via operation UUIDs

### Real-Time Synchronization Architecture

The app uses a 3-tier sync architecture: Backend → Sync Service → Frontend.

```
┌─────────────────┐     RabbitMQ      ┌─────────────────┐      WebSocket      ┌─────────────────┐
│  omnimap-back   │ ──────────────→  │  omnimap-sync   │ ──────────────────→  │  omnimap-front  │
│  (Django)       │                   │  (FastAPI)      │                      │  (JS)           │
└─────────────────┘                   └─────────────────┘                      └─────────────────┘
```

#### Backend → RabbitMQ Messages (api/tasks.py)

| Task Function | RabbitMQ Action | When Used |
|---------------|-----------------|-----------|
| `send_message_block_update` | `update_block` | Single block CRUD |
| `send_message_blocks_update` | `update_blocks` | Batch import (created + updated) |
| `send_message_unsubscribe_user` | `unsubscribe` | Block deletion |
| `send_message_subscribe_user` | `subscribe` | Grant access |
| `send_message_access_update` | `update_access` | Permission changes |

#### Sync Service → WebSocket Messages (omnimap-sync)

| WebSocket Message Type | Source | Format |
|------------------------|--------|--------|
| `block_updates` | Response to `get_updates` request | `{type, updates: [block, ...]}` |
| `block_update` | Single block change | `{type, block_uuid, data: block}` |
| `block_updates_batch` | Multiple blocks for one user | `{type, updates: [{type, block_uuid, data}, ...]}` |
| `block_update_access` | Permission change | `{type, start_block_ids, block_uuids, permission}` |

#### Frontend WebSocket Handling (sincManager/webSocket.js)

```javascript
// Message routing with debounce for live updates
'block_updates'       → dispatch immediately (initial sync)
'block_update'        → _queueBlockUpdates() → 50ms debounce → dispatch
'block_updates_batch' → _queueBlockUpdates() → 50ms debounce → dispatch
'block_update_access' → dispatch immediately
```

Key optimizations:
- **Debounce (50ms)**: Accumulates rapid `block_update` messages into single batch
- **Deduplication**: Same block ID in buffer → last update wins
- **Subtree deletion**: `removeBlock()` recursively removes children

#### Block Data Format (from backend)

```javascript
{
  id: 'uuid',
  title: 'Block title',
  data: '{"text": "...", "childOrder": [...]}',  // JSON string
  parent_id: 'parent-uuid' | false,
  updated_at: 1234567890,  // Unix timestamp
  children: '["child-uuid-1", "child-uuid-2"]',  // JSON string
  deleted: true  // Optional, for deletion sync
}
```

#### Key Sync Events

| Event | Dispatched By | Handled By |
|-------|---------------|------------|
| `WebSocUpdateBlock` | webSocket.js | LocalStateManager.webSocUpdateBlock() |
| `WebSocUpdateBlockAccess` | webSocket.js | LocalStateManager.WebSocUpdateBlockAccess() |
| `WebSocketConnected` | webSocket.js | statusIndicators |
| `WebSocketDisconnected` | webSocket.js | statusIndicators |

### Rendering Pipeline

`Painter` → `BlockCreator` → DOM. Uses CSS Grid for layout (`gridLayoutCalculator.js`, `gridClassManager.js`).

## Key Directories

```
src/js/
├── api/          # HTTP client with auth interceptors
├── auth/         # Authentication logic
├── controller/   # Commands, popups, UI management
│   ├── comands/  # Command definitions and managers
│   └── popups/   # Modal components
├── painter/      # Rendering engine and layout
├── sincManager/  # WebSocket real-time sync
├── stateLocal/   # Block storage and state
└── utils/        # Helper functions
```

## Adding New Features

### New Command
1. Add command definition in `src/js/controller/comands/commands.js`
2. Register hotkey in `comandManager.js`
3. Access UI state via `contextManager.getContext()`

### New Popup
1. Extend base `Popup` class from `src/js/controller/popups/popup.js`
2. Implement `show()`, `hide()`, and event handlers
3. Register in `index.js` initialization

### Block Operations
Use `LocalStateManager` methods for CRUD operations on blocks. Operations are synced via `SincManager`.

## Authentication

Cookie-based JWT tokens (`access`, `refresh`). API client auto-refreshes on 401. User stored as `currentUser` in IndexedDB.

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

Test files are located in `src/js/__tests__/` mirroring the source structure.

## Workflow Rules

**After any code changes:**
1. Run `npm test` to verify tests pass
2. Commit changes with descriptive message

## Cross-Service Changes (ВАЖНО!)

**НИКОГДА не изменяй код других сервисов напрямую!**

Если изменения на фронтенде требуют изменений в других сервисах:

1. **НЕ редактируй** файлы в `omnimap-back`, `llm-gateway` или `omnimap-sync`
2. **Создай файл задач** `BACKEND_TASKS.md` в ../omnimap-back:
   ```markdown
   # Задачи для backend-сервисов

   ## omnimap-back
   - [ ] Добавить эндпоинт GET /api/v1/example
   - [ ] Изменить формат ответа в /api/v1/blocks

   ## llm-gateway
   - [ ] Добавить поддержку нового параметра stream_options

   ## omnimap-sync
   - [ ] Добавить новый тип сообщения "block_moved"
   ```
3. **В PR укажи**, что требуются изменения в других сервисах
4. Агент, работающий над соответствующим сервисом, выполнит задачи и создаст отдельный PR

**Причина:** Каждый сервис имеет свои тесты. Изменения без прогона тестов ломают CI/CD.

## Notes

- Code comments are in Russian
- Production build generates a Service Worker for offline support

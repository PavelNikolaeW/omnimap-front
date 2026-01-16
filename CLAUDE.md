# CLAUDE.md

OmniMap Frontend - visual knowledge mapping with real-time sync.

## Quick Start

```bash
npm start          # Dev server (remote backend)
npm run start_local # Dev server (local backend)
npm run build      # Production build
npm test           # Unit tests
npm run test:e2e   # E2E tests
```

## Documentation

**Architecture overview:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

| Module | Description |
|--------|-------------|
| [API](docs/modules/API.md) | HTTP client, JWT auth, endpoints |
| [State](docs/modules/STATE.md) | Block storage, IndexedDB |
| [Sync](docs/modules/SYNC.md) | WebSocket, offline queue |
| [Painter](docs/modules/PAINTER.md) | Rendering, Grid layout |
| [Commands](docs/modules/COMMANDS.md) | Hotkeys, command system |
| [Actions](docs/modules/ACTIONS.md) | Business logic |
| [Diagrams](docs/modules/DIAGRAMS.md) | Connections, shapes |
| [Utils](docs/modules/UTILS.md) | Helpers, permissions, queues |
| [Onboarding](docs/modules/ONBOARDING.md) | Tutorial, hints, welcome flow |
| [Home Page](docs/modules/HOME_PAGE.md) | Initial structure for new users |
| [Layout Editor](docs/LAYOUT_EDITOR.md) | Visual grid editor |

## Git Workflow

**Работай в отдельной ветке, не коммить в main напрямую!**

```bash
git checkout -b feature/название-задачи
# ... работа ...
git push -u origin feature/название-задачи
gh pr create --title "Описание" --body "Детали"
```

## Cross-Service Changes

**НЕ редактируй код других сервисов напрямую!**

Если нужны изменения в `omnimap-back`, `llm-gateway` или `omnimap-sync`:
1. Создай `BACKEND_TASKS.md` в директории соответствующего сервиса
2. Укажи в PR что требуются изменения в других сервисах

## Key Patterns

### Event System

```javascript
import { dispatch } from '../utils/utils';
dispatch('EventName', { data });
window.addEventListener('EventName', (e) => e.detail);
```

Key events: `ShowBlocks`, `OpenBlock`, `UpdateBlocks`, `CreateBlock`, `MoveBlock`, `WebSocUpdateBlock`

### Block Data Format

```javascript
{
  id: 'uuid',
  title: 'Title',
  parent_id: 'parent-uuid' | false,
  children: '["child-1"]',  // JSON string
  updated_at: 1234567890,
  permission: 'view'|'edit'|'delete'|null,
  data: {
    text: 'Content',
    childOrder: ['child-1', 'child-2'],
    color: [180, 50, 50],  // HSL
    connections: [{ sourceId, targetId, type }],
    customGrid: { grid, cells },  // Diagram mode
    layoutCells: { gridSize, cells },  // Layout editor
    customStyles: { shape, border, shadow }
  }
}
```

### Application Modes

```javascript
MODES = {
  NORMAL: 'normal',
  TEXT_EDIT: 'textEdit',
  CONNECT_TO_BLOCK: 'connectToBlock',
  CONNECT_SELECT_SOURCE: 'connectSelectSource',
  CUT_BLOCK: 'cutBlock',
  DIAGRAM: 'diagram',
  CHAT: 'chat'
}
```

## Adding Features

### New Command

Add to `src/js/controller/comands/commands.js`:
```javascript
{
  id: 'myCommand',
  defaultHotkey: 'ctrl+m',
  mode: ['normal'],
  execute: (ctx) => { /* logic */ },
  description: 'What it does'
}
```

### New Block Shape

1. CSS in `src/style/diagram-editor.css`:
```css
[data-block-shape="myshape"] { clip-path: ...; }
[data-block-shape="myshape"][data-block-shadow="md"] {
  filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));
}
```
2. Add preset in `BlockStyleManager.presetShapes`

### New Connection Type

1. Add to `CONNECTION_TYPES` in `src/js/controller/connectionTypes.js`
2. Add config to `CONNECTION_CONFIGS`

### New Popup

1. Extend `Popup` class from `src/js/controller/popups/popup.js`
2. Implement `show()`, `hide()`, handlers
3. Register in `index.js`

## Testing

```bash
npm test                          # All unit tests
npx jest path/to/test.js          # Single test
npm run test:e2e                  # E2E tests
npm run test:e2e:ui               # E2E with UI
```

## Directory Structure

```
src/js/
├── actions/        # Business logic (blockActions, selectionActions)
├── api/            # HTTP clients (api.js, chatApi.js, llmApi.js)
├── auth/           # Authentication
├── controller/     # UI controllers
│   ├── comands/    # Command system (comandManager, contextManager)
│   ├── layoutEditor/  # Visual grid editor
│   └── popups/     # Modal dialogs
├── core/           # Health check, status indicators
├── onboarding/     # Onboarding (OnboardingManager, hints, tutorial)
├── painter/        # Rendering (painter, blockCreator, grid*)
├── services/       # TreeService, homePageInitializer, layoutTemplates
├── sincManager/    # WebSocket sync (webSocket, offlineQueue)
├── stateLocal/     # State management (localStateManager)
└── utils/          # Utilities (dispatch, permissions, etc.)
```

## Key Files

| File | Purpose |
|------|---------|
| `src/js/index.js` | Entry point |
| `src/js/stateLocal/localStateManager.js` | Block state, events |
| `src/js/sincManager/webSocket.js` | WebSocket client |
| `src/js/painter/painter.js` | Render engine |
| `src/js/controller/comands/commands.js` | All commands |
| `src/js/controller/comands/contextManager.js` | UI state |
| `src/js/api/api.js` | HTTP client |
| `src/js/onboarding/OnboardingManager.js` | Onboarding state |
| `src/js/services/homePageInitializer.js` | Home page creation |

## Notes

- Comments in Russian
- jsPlumb (`@jsplumb/browser-ui`) for connections
- React + Zustand for chat UI
- localforage for IndexedDB
- hotkeys-js for keyboard shortcuts

# Commands Module

Hotkey system and command registration.

**Location:** `src/js/controller/comands/`

## Files

| File | Purpose |
|------|---------|
| `comandManager.js` | Command registration, hotkey binding |
| `commands.js` | All command definitions (150+) |
| `contextManager.js` | UI state, selection, modes |
| `arrowComands.js` | Connection commands |
| `colorCommands.js` | Color picker commands |
| `layoutCommands.js` | Layout editor commands |
| `cmdUtils.js` | Utility functions |
| `optionManager.js` | User preferences |
| `uiManager.js` | UI element management |

## Command Structure

```javascript
{
    id: 'commandName',           // Unique identifier
    defaultHotkey: 'ctrl+k',     // Default keyboard shortcut
    mode: ['normal', 'edit'],    // Allowed modes ('*' for all)
    execute: (ctx) => { ... },   // Main handler
    btnExec: (ctx) => { ... },   // Button click handler (optional)
    description: 'What it does', // For help panel
    regLink: true,               // Register in link mode
    throttleDisable: false,      // Disable 250ms throttle
    eventType: 'keydown'         // 'keydown' or 'keyup'
}
```

## CommandManager

```javascript
class CommandManager {
    constructor(rootContainer, breadcrumb, treeNavigation, hotkeysMap) {
        this.commandsById = {};
        this.ctxManager = new ContextManager(...);
        this.init();
    }

    registerCommand(cmd) {
        this.commandsById[cmd.id] = cmd;
        if (cmd.defaultHotkey) {
            this.bindHotkey(cmd.id, cmd);
        }
    }

    executeCommand(ctx) {
        const cmd = this.commandsById[ctx.getCmd()];
        if (cmd.mode.includes(ctx.mode) || cmd.mode.includes('*')) {
            cmd.execute(ctx);
        }
    }
}
```

## ContextManager

Tracks current UI state:

```javascript
class ContextManager {
    mode = 'normal';              // Current mode
    blockElement = undefined;      // Hovered block DOM element
    blockLinkElement = undefined;  // Block link element
    blockId = undefined;           // Current block ID
    selectedBlocks = new Set();    // Multi-selection
    clickedAnchor = null;          // Connection anchor point
    shiftLock = false;             // Shift key held
    cut = undefined;               // Cut operation data
}
```

### Getting Context

```javascript
import { contextManager } from './contextManager';

const ctx = contextManager.getContext();
// Returns:
// {
//     blockId: 'uuid',
//     blockElement: HTMLElement,
//     selectedBlocks: ['uuid1', 'uuid2'],
//     mode: 'normal',
//     cmdId: 'openBlock'
// }
```

## Key Commands

### Navigation

| Command | Hotkey | Mode | Description |
|---------|--------|------|-------------|
| `openBlock` | `Enter` | normal | Open/enter block |
| `back` | `Backspace` | normal | Go back |
| `escape` | `Esc` | * | Cancel/reset |
| `arrowUp/Down/Left/Right` | Arrows | normal | Navigate siblings |

### Block Operations

| Command | Hotkey | Mode | Description |
|---------|--------|------|-------------|
| `createBlock` | `n` | normal | Create child block |
| `editBlock` | `e` | normal | Edit block text |
| `deleteBlock` | `d` | normal | Delete block |
| `cutBlock` | `x` | normal | Start cut |
| `pasteBlock` | `p` | cutBlock | Paste/move |
| `copyBlock` | `c` | normal | Copy to clipboard |
| `pasteLinkBlock` | `v` | normal | Paste as link |

### Diagram Mode

| Command | Hotkey | Mode | Description |
|---------|--------|------|-------------|
| `diagram` | `g` | normal | Toggle diagram mode |
| `connectBlock` | `a` | normal/diagram | Create connection |
| `deleteConnectBlock` | `shift+a` | normal/diagram | Delete connection |
| `connectDashed` | - | diagram | Dashed connection |
| `connectCurved` | - | diagram | Curved connection |

### UI Commands

| Command | Hotkey | Mode | Description |
|---------|--------|------|-------------|
| `search` | `/` | normal | Open search |
| `hotkeyPopup` | `?` | normal | Show hotkeys |
| `chatPanel` | `shift+c` | * | Open chat |
| `layoutEditor` | `l+e` | normal | Open layout editor |

## Adding New Command

1. Add definition in `commands.js`:
```javascript
{
    id: 'myCommand',
    defaultHotkey: 'ctrl+m',
    mode: ['normal'],
    execute: (ctx) => {
        const blockId = ctx.blockElement?.id;
        // Your logic
    },
    description: 'Does something'
}
```

2. Command is auto-registered on init.

3. Access via hotkey or UI button.

## Hotkey Customization

```javascript
// Custom hotkey map
const hotkeysMap = {
    'createBlock': 'ctrl+n',
    'deleteBlock': 'ctrl+d'
};

// Reinitialize with new hotkeys
dispatch('ReRegistrationCmd', hotkeysMap);
```

## Mode Transitions

```javascript
// Normal → Cut mode
ctx.mode = 'cutBlock';
ctx.cut = { block_id, old_parent_id };

// Cut → Normal (after paste)
ctx.mode = 'normal';
ctx.cut = undefined;

// Normal → Connect mode
ctx.mode = 'connectSelectSource';
ctx.connectSourceId = blockId;

// Connect → Normal
ctx.mode = 'normal';
ctx.connectSourceId = null;
```

## Multi-Selection

```javascript
// Shift+Click toggles selection
ctx.toggleBlockSelection(blockElement, linkElement);

// Get selected IDs
const selected = ctx.getSelectedBlockIds();

// Clear selection
ctx.clearSelection();

// Check for multi-selection
if (ctx.hasMultiSelection()) {
    // Handle batch operation
}
```

## UI Manager

Controls button panel:

```javascript
import { uiManager } from './uiManager';

// Render buttons for mode
uiManager.renderBtn('normal', commandsById);

// Handle submenu
uiManager.handleSubmenuClick(targetId, ctx);

// Pending diagram selection
if (uiManager.isPendingDiagramSelection()) {
    uiManager.handleDiagramBlockSelection(ctx, blockId, element);
}
```

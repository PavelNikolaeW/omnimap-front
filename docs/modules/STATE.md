# State Management Module

Block storage, IndexedDB persistence, and state coordination.

**Location:** `src/js/stateLocal/`

## Files

| File | Purpose |
|------|---------|
| `localStateManager.js` | Main state manager, event handlers |
| `treeValidator.js` | Tree structure validation |

## LocalStateManager

Singleton managing all block data and coordinating between API, storage, and UI.

### Core Properties

```javascript
class LocalStateManager {
    blocks = new Map();        // In-memory block cache
    currentUser = null;        // Current user ID
    currentTree = null;        // Active tree root ID
    path = [];                 // Navigation history
    painter = new Painter();   // Rendering engine
    blockRepository = null;    // IndexedDB wrapper
}
```

### Key Methods

```javascript
// Initialize with user data
await initUser(treeBlocks, userId);

// Save block to memory + IndexedDB
await saveBlock(block);

// Remove block and children recursively
await removeBlock(blockId);

// Navigate into block
openBlock({ id, parentHsl, isIframe, links });

// Trigger re-render
showBlocks();

// Handle WebSocket update
await webSocUpdateBlock(blocks);
```

## Event Handlers

LocalStateManager listens to these events:

| Event | Handler | Action |
|-------|---------|--------|
| `ShowBlocks` | `showBlocks()` | Re-render current view |
| `OpenBlock` | `openBlock()` | Navigate into block |
| `CreateBlock` | `createBlock()` | Create and sync |
| `MoveBlock` | `moveBlock()` | Move block |
| `TextUpdate` | `textUpdate()` | Update text with debounce |
| `TitleUpdate` | `titleUpdate()` | Update title |
| `WebSocUpdateBlock` | `webSocUpdateBlock()` | Handle real-time sync |
| `Login` | - | Reinitialize state |
| `Logout` | - | Clear state |

## BlockRepository

IndexedDB wrapper using localforage:

```javascript
class BlockRepository {
    // Key format: Block_{blockId}_{userId}
    getKey(blockId) {
        return `Block_${blockId}_${this.currentUser}`;
    }

    async saveBlock(block) {
        await localforage.setItem(key, blockData);
    }

    async loadBlock(blockId) {
        return await localforage.getItem(key);
    }

    async deleteBlock(blockId) {
        await localforage.removeItem(key);
    }
}
```

## Block CRUD Flow

### Create Block
```javascript
// 1. Generate temporary ID
// 2. Create optimistically in memory
// 3. Queue for sync (immediate for diagrams)
// 4. API call via offlineQueue
// 5. Replace temp ID with server ID

dispatch('CreateBlock', {
    parentId,
    title,
    data
});
```

### Update Block
```javascript
// Debounced sync (3s for normal, immediate for diagrams)
await this.saveBlock(block);
await offlineQueue.enqueue({
    type: 'updateBlock',
    data: { id: blockId, ...updates }
}, { immediate: isDiagram });
```

### Delete Block
```javascript
// Recursive deletion
await this.removeBlock(blockId);  // Removes children too
await api.removeTree(blockId);
```

## Sync Behavior

| Context | Sync Delay | Reason |
|---------|------------|--------|
| Normal blocks | 3 seconds | Batch rapid changes |
| Diagram blocks | Immediate | Avoid UI desync |
| Offline | Queued | Process when online |

## Tree Navigation

```javascript
// Current path stored in this.path
openBlock({ id }) {
    this.path.push(currentBlockId);
    this.showBlocks();
}

// Navigate back
navigateBack() {
    const previousId = this.path.pop();
    // Re-render with previous block
}
```

## Tree Validation

```javascript
import { treeValidator } from './treeValidator';

// Validate tree structure
const issues = treeValidator.validate(blocks, rootId);

// Auto-repair orphaned blocks
treeValidator.repair(blocks, rootId);
```

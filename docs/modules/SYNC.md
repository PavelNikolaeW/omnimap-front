# Synchronization Module

Real-time WebSocket sync and offline queue management.

**Location:** `src/js/sincManager/`

## Files

| File | Purpose |
|------|---------|
| `sincManager.js` | Main sync coordinator |
| `webSocket.js` | WebSocket client with reconnection |
| `offlineQueue.js` | Offline operation queue |
| `chatSync.js` | Chat-specific sync |
| `networkStatusUI.js` | Network status indicator |

## Architecture

```
┌─────────────┐     RabbitMQ      ┌─────────────┐     WebSocket     ┌─────────────┐
│omnimap-back │ ───────────────→ │ omnimap-sync│ ─────────────────→│omnimap-front│
│  (Django)   │                   │  (FastAPI)  │                   │    (JS)     │
└─────────────┘                   └─────────────┘                   └─────────────┘
```

## SincManager

Coordinates sync on connection:

```javascript
class SincManager {
    constructor() {
        this.webSocket = new UpdateServiceWebSocket(wsUrl);
        this.webSocket.eventListeners.open.push(this.online.bind(this));
    }

    // Request updates for all local blocks on reconnect
    async online() {
        const blocks = await this.getLocalBlocks();
        const toSend = blocks.map(b => ({
            id: b.id,
            updated_at: Math.floor(new Date(b.updated_at).getTime() / 1000)
        }));
        this.webSocket.getUpdates(toSend);
    }
}
```

## WebSocket Client

### Connection

```javascript
// URL format: wss://sync.omnimap.ru/ws?token={jwt}
this.ws = new WebSocket(`${url}?token=${encodeURIComponent(jwtToken)}`);
```

### Message Types

| Type | Direction | Purpose |
|------|-----------|---------|
| `block_updates` | Server → Client | Initial sync response |
| `block_update` | Server → Client | Single block change |
| `block_updates_batch` | Server → Client | Multiple blocks |
| `block_update_access` | Server → Client | Permission change |
| `get_updates` | Client → Server | Request sync |
| `ping`/`pong` | Bidirectional | Heartbeat |

### Debounce (50ms)

Accumulates rapid updates before dispatching:

```javascript
_queueBlockUpdates(blocks) {
    // Deduplicate by ID (last wins)
    for (const block of blocks) {
        const existingIdx = this._pendingBlockUpdates.findIndex(b => b.id === block.id);
        if (existingIdx !== -1) {
            this._pendingBlockUpdates.splice(existingIdx, 1);
        }
        this._pendingBlockUpdates.push(block);
    }

    // Debounce dispatch
    clearTimeout(this._blockUpdateTimer);
    this._blockUpdateTimer = setTimeout(() => {
        dispatch('WebSocUpdateBlock', this._pendingBlockUpdates);
        this._pendingBlockUpdates = [];
    }, 50);
}
```

### Reconnection

Exponential backoff with max 10 attempts:

```javascript
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_INTERVAL = 2000;
const MAX_RECONNECT_INTERVAL = 120000;

_getReconnectInterval() {
    const interval = BASE_RECONNECT_INTERVAL * Math.pow(2, this.reconnectAttempts);
    return Math.min(interval, MAX_RECONNECT_INTERVAL);
}
```

### Heartbeat

```javascript
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

// Miss 2 pongs = connection dead
if (this.missedPongs >= 2) {
    this.ws.close();
}
```

## Offline Queue

Queue operations when offline, sync when online.

```javascript
import { offlineQueue } from '../sincManager/offlineQueue';

// Add operation
await offlineQueue.enqueue({
    type: 'createBlock',
    data: { parentId, title, data }
}, { immediate: false });

// Immediate sync (for diagrams)
await offlineQueue.enqueue(operation, { immediate: true });

// Check pending count
const count = offlineQueue.getQueueLength();

// Check if block is pending sync
const isPending = offlineQueue.isPendingBlock(blockId);
```

### Sync Timing

| Context | Delay | Option |
|---------|-------|--------|
| Normal blocks | 3000ms | `immediate: false` |
| Diagram blocks | 0ms | `immediate: true` |
| Delete operations | 0ms | `immediate: true` |

### Queue Processing

```javascript
// Process all pending operations
await offlineQueue.processQueue();

// Events
window.addEventListener('BlockSynced', (e) => {
    // Block successfully synced
});

window.addEventListener('BatchImportCompleted', (e) => {
    // Bulk sync completed
});
```

## Events Dispatched

| Event | When | Data |
|-------|------|------|
| `WebSocketConnected` | Connection established | - |
| `WebSocketDisconnected` | Connection lost | `{ reason }` |
| `WebSocUpdateBlock` | Received block updates | `[blocks]` |
| `WebSocUpdateBlockAccess` | Permission changed | `{ block_uuids, permission }` |

## Usage Example

```javascript
// Initialize sync manager
const sincManager = new SincManager();

// Handle block updates
window.addEventListener('WebSocUpdateBlock', async (e) => {
    for (const block of e.detail) {
        await localStateManager.saveBlock(block);
    }
    dispatch('ShowBlocks');
});

// Cleanup
sincManager.destroy();
```

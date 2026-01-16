# API Module

HTTP client with JWT authentication and automatic token refresh.

**Location:** `src/js/api/`

## Files

| File | Purpose |
|------|---------|
| `api.js` | Main HTTP client (blocks, auth, access) |
| `chatApi.js` | P2P and group chat endpoints |
| `llmApi.js` | LLM Gateway integration |
| `importService.js` | Block import functionality |

## Usage

```javascript
import api from '../api/api';

// Create block
const response = await api.createBlock(parentId, title, data);

// Update block
await api.updateBlock(blockId, { title, data });

// Delete block/tree
await api.removeTree(blockId);
```

## Authentication

JWT tokens stored in cookies (`access`, `refresh`).

```javascript
// Auto-refresh on 401
this.api.interceptors.response.use(
    response => response,
    async error => {
        if (error.response?.status === 401) {
            await this.refreshToken();
            return this.api(originalRequest);
        }
    }
);

// Login
await api.login({ username, password });

// Logout (clears tokens)
api.logout();
```

## Block Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/new-block/{parentId}/` | Create block |
| POST | `/edit-block/{id}/` | Update block |
| DELETE | `/delete-tree/{id}/` | Delete block tree |
| POST | `/move-block/{old}/{new}/{id}/` | Move block |
| POST | `/copy-block/` | Copy block |
| GET | `/load-trees/` | Load all trees |
| POST | `/load-empty/` | Load empty blocks |
| GET | `/search-block/` | Search blocks |

## Access Control

```javascript
// Get access list
const { data } = await api.getAccessList(blockId);

// Update access
await api.updateAccess(blockId, {
    username: 'user',
    permission: 'edit'
});

// Sandbox mode
await api.setSandboxMode(blockId, 'open'); // 'none'|'open'|'private'
```

## File Upload

```javascript
// Upload image with progress
await api.uploadBlockImage(blockId, file, (progress) => {
    console.log(`${progress}%`);
});

// Get image info
const imageData = await api.getBlockImage(blockId);

// Delete image
await api.deleteBlockImage(blockId);
```

## Reminders & Subscriptions

```javascript
// Create reminder
await api.createReminder({
    block_id: blockId,
    remind_at: '2024-01-15T10:00:00Z',
    message: 'Check this'
});

// Create subscription (watch for changes)
await api.createSubscription({
    block_id: blockId,
    depth: 2,
    on_text_change: true
});
```

## Task Polling

For async operations (import):

```javascript
import { pollTaskStatus } from '../api/api';

const response = await api.importBlocks(payload);
await pollTaskStatus(response.data.task_id, 1000, 60000);
```

## Configuration

Backend URL from `config.js`:

```javascript
const backendUrl = config.APP_BACKEND_URL;
// Default: process.env.APP_BACKEND_URL or 'https://omnimap.ru'
```

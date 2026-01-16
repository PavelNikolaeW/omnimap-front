# Actions Module

Pure business logic functions for block operations.

**Location:** `src/js/actions/`

## Files

| File | Purpose |
|------|---------|
| `index.js` | Re-exports all actions |
| `blockActions.js` | Block CRUD operations |
| `navigationActions.js` | Tree navigation |
| `selectionActions.js` | Selection, modes, clipboard |

## Design Principles

1. **Pure functions** - no side effects except explicit API calls
2. **Return result objects** - `{ success, data?, error? }`
3. **Validation first** - check inputs before operations
4. **Composable** - can be combined for complex operations

## Block Actions

### Create

```javascript
import { createBlock, createIframeBlock, createBlockSmart } from '../actions/blockActions';

// Simple block
const result = await createBlock(parentId, 'Title', { text: 'Content' });

// Iframe block
const result = await createIframeBlock(parentId, 'https://example.com');

// Auto-detect (URL vs text)
const result = await createBlockSmart(parentId, input);
// result.type = 'block' | 'iframe'
```

### Update

```javascript
import { updateBlockTitle, updateBlockText, updateBlockData, updateBlockColor } from '../actions/blockActions';

// Update title
await updateBlockTitle(blockId, 'New Title');

// Update text content
await updateBlockText(blockId, 'New content');

// Update arbitrary data
await updateBlockData(blockId, {
    customStyles: { shape: 'diamond' }
});

// Update color (HSL)
await updateBlockColor(blockId, [180, 50, 50]);
```

### Delete

```javascript
import { deleteBlock } from '../actions/blockActions';

const result = await deleteBlock(blockId);
// result.parent = updated parent block
```

### Move & Copy

```javascript
import { moveBlock, copyBlocks, linkBlocks } from '../actions/blockActions';

// Move to new parent
await moveBlock(blockId, oldParentId, newParentId, childOrder, beforeId);

// Copy blocks
await copyBlocks(destId, [srcId1, srcId2]);

// Create links (references)
await linkBlocks(destId, [srcId1, srcId2]);
```

### Connections

```javascript
import { addConnection, removeConnection } from '../actions/blockActions';

// Add arrow connection
await addConnection(sourceId, targetId, {
    connector: 'Flowchart',
    paintStyle: { stroke: '#000', strokeWidth: 2 }
}, currentBlockData);

// Remove connection
await removeConnection(sourceId, targetId, currentBlockData);
```

### Grid & Layout

```javascript
import { updateBlockGrid } from '../actions/blockActions';

// Set custom grid (diagram mode)
await updateBlockGrid(blockId, {
    grid: { rows: 3, cols: 3 },
    cells: { 'child-1': { row: 1, col: 1, rowSpan: 1, colSpan: 1 } }
});
```

## Selection Actions

### Modes

```javascript
import { MODES, toggleMode, resetToNormalMode } from '../actions/selectionActions';

// Available modes
MODES.NORMAL            // Default
MODES.TEXT_EDIT         // Editing text
MODES.CONNECT_TO_BLOCK  // Selecting connection target
MODES.CONNECT_SELECT_SOURCE  // Selecting connection source
MODES.CUT_BLOCK         // Moving block
MODES.DIAGRAM           // Diagram editing
MODES.CHAT              // Chat panel open

// Toggle mode
const { newMode, changed } = toggleMode(currentMode, MODES.DIAGRAM);

// Reset to normal
const { newMode } = resetToNormalMode();
```

### Clipboard

```javascript
import {
    copyBlockId,
    copyMultipleBlockIds,
    getBlockIdFromClipboard,
    getBlockIdsFromClipboard
} from '../actions/selectionActions';

// Copy single ID
copyBlockId('uuid-123');

// Copy multiple (as JSON array)
copyMultipleBlockIds(['uuid-1', 'uuid-2']);

// Read from clipboard
const result = await getBlockIdFromClipboard();
// result.blockId = 'uuid-123'

const result = await getBlockIdsFromClipboard();
// result.blockIds = ['uuid-1', 'uuid-2']
```

### Cut/Paste Flow

```javascript
import { startCutBlock, completeCutBlock } from '../actions/selectionActions';

// Start cut
const { success, cutData } = startCutBlock(blockId, parentId);
// cutData = { block_id, old_parent_id }

// Complete cut
const { success, moveData } = completeCutBlock(cutData, newParentId, beforeId);
// moveData = { block_id, old_parent_id, new_parent_id, before? }
```

### Connect Flow

```javascript
import { startConnectBlocks, completeConnectBlocks } from '../actions/selectionActions';

// Start connection
const { success, sourceId } = startConnectBlocks(sourceBlockId);

// Complete connection
const { success, connection } = completeConnectBlocks(sourceId, targetId);
// connection = { sourceId, targetId }
```

### ID Extraction

```javascript
import { extractBlockId, extractParentId } from '../actions/selectionActions';

// Get block ID from DOM element
const blockId = extractBlockId(element, linkElement);

// Get parent ID
const parentId = extractParentId(element);
```

### Mode Checking

```javascript
import { isModeAllowed } from '../actions/selectionActions';

// Check if action allowed in current mode
if (isModeAllowed(currentMode, ['normal', 'diagram'])) {
    // Execute action
}
```

## Result Pattern

All actions return consistent result objects:

```javascript
// Success
{ success: true, block: {...} }
{ success: true, blocks: [...] }

// Failure
{ success: false, error: Error }
```

Usage:

```javascript
const result = await createBlock(parentId, title);

if (result.success) {
    dispatch('UpdateBlocks', { blocks: result.blocks });
} else {
    console.error(result.error);
}
```

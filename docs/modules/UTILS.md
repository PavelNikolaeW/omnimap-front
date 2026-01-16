# Utils Module

Helper functions and utilities.

**Location:** `src/js/utils/`

## Files

| File | Purpose |
|------|---------|
| `utils.js` | Core utilities (dispatch, sizing) |
| `functions.js` | General helper functions |
| `gridUtils.js` | Grid parsing and calculations |
| `permissionUtils.js` | Access control checks |
| `queue.js` | Async operation queue |
| `limitedQueue.js` | Size-limited queue |
| `custom-dialog.js` | Modal dialogs |

## Core Utils (utils.js)

### Event Dispatch

```javascript
import { dispatch } from '../utils/utils';

// Emit event
dispatch('EventName', { key: 'value' });

// Listen (anywhere in app)
window.addEventListener('EventName', (e) => {
    console.log(e.detail.key);
});
```

### Element Sizing

```javascript
import { getElementSizeClass } from '../utils/utils';

const { width, height, layout } = getElementSizeClass(element);
// layout = 'l-sq' (large square), 'm-w' (medium wide), etc.
```

Size classes based on screen area ratio:
- `xxl`, `xl`, `l`, `m`, `s`, `xs`, `xxs`, `xxxs`

Shape suffixes:
- `-sq` (square: 0.7-1.49)
- `-w` (wide: >1.49)
- `-h` (tall: <0.7)

### Performance Measurement

```javascript
import { measurePerformance, printTimer, resetTimer } from '../utils/utils';

// Wrap function
const measuredFn = measurePerformance('myFunction', originalFn);

// Execute (timing accumulated)
measuredFn();

// Print all timings
printTimer();

// Reset
resetTimer();
```

### HTML Safety

```javascript
import { escapeHtml, stripHtmlTags } from '../utils/utils';

// Escape for safe innerHTML
const safe = escapeHtml('<script>alert("xss")</script>');
// '&lt;script&gt;alert("xss")&lt;/script&gt;'

// Extract plain text
const text = stripHtmlTags('<p>Hello <b>World</b></p>');
// 'Hello World'
```

## Functions (functions.js)

### String Utilities

```javascript
import { truncate, normalizeParentId } from '../utils/functions';

// Truncate text
truncate('Long text...', 10); // 'Long te...'

// Normalize parent ID
normalizeParentId('parent*child'); // 'child'
normalizeParentId(false);          // null
```

### Validation

```javascript
import { validURL, isValidUUID, isExcludedElement } from '../utils/functions';

// URL check
validURL('https://example.com'); // true

// UUID check
isValidUUID('550e8400-e29b-41d4-a716-446655440000'); // true

// Check if element should be excluded from handlers
isExcludedElement(element, 'handlerName', ['input', 'textarea']);
```

### Clipboard

```javascript
import { copyToClipboard, getClipboardText } from '../utils/functions';

// Copy text
copyToClipboard('text to copy');

// Read (async, needs permission)
const text = await getClipboardText();
```

### Throttle/Debounce

```javascript
import { throttle, debounce } from '../utils/functions';

// Throttle: max once per 250ms
const throttled = throttle(fn, 250);

// Debounce: wait 300ms after last call
const debounced = debounce(fn, 300);
```

## Grid Utils (gridUtils.js)

```javascript
import { parseGridSize, validateGridCell } from '../utils/gridUtils';

// Parse grid size string
const { rows, cols } = parseGridSize('3x4');
// { rows: 3, cols: 4 }

// Validate cell position
const isValid = validateGridCell(cell, gridSize);
```

## Permission Utils (permissionUtils.js)

```javascript
import {
    canEdit,
    canDelete,
    isViewOnly,
    isForbidden,
    isInSandbox,
    canCreateInSandbox,
    canEditInSandbox,
    canDeleteInSandbox,
    getPermissionDataAttribute
} from '../utils/permissionUtils';

// Check permissions
if (canEdit(block)) {
    // Allow editing
}

if (canDelete(block)) {
    // Allow deletion
}

// View-only check (permission === 'view')
if (isViewOnly(block)) {
    // Hide edit buttons
}

// Forbidden (403)
if (isForbidden(block)) {
    // Show access denied
}

// Sandbox mode checks
if (isInSandbox(block)) {
    if (canCreateInSandbox(block, currentUserId)) {
        // Can create children
    }
}

// Get data attribute for UI
const attr = getPermissionDataAttribute(block);
// 'view-only', 'forbidden', null
```

## Queue (queue.js)

```javascript
import { Queue } from '../utils/queue';

const queue = new Queue(initialItems, maxSize, allowDuplicates);

queue.enqueue(item);
const item = queue.dequeue();
const isEmpty = queue.isEmpty();
const size = queue.size();
```

## Limited Queue (limitedQueue.js)

Auto-removes oldest items when limit reached:

```javascript
import { LimitedQueue } from '../utils/limitedQueue';

const queue = new LimitedQueue(100); // Max 100 items

queue.add(item);
// If over limit, oldest removed automatically
```

## Custom Dialog (custom-dialog.js)

```javascript
import { customConfirm, customPrompt } from '../utils/custom-dialog';

// Confirm dialog
const confirmed = await customConfirm('Are you sure?');
if (confirmed) {
    // User clicked OK
}

// Prompt dialog
const value = await customPrompt('Enter name:', 'Default');
if (value !== null) {
    // User entered value
}
```

## Common Patterns

### Safe Property Access

```javascript
// Block data access
const text = block.data?.text || '';
const childOrder = block.data?.childOrder || [];
const customGrid = block.data?.customGrid?.grid;
```

### ID Normalization

```javascript
// Handle composite IDs (parent*child format)
const cleanId = id.split('*').at(-1);

// Parent ID normalization
const parentId = element.parentElement?.id?.split('*').at(-1);
```

### Event Target Extraction

```javascript
// Get block from event target
const blockElement = event.target.closest('[block]');
const blockId = blockElement?.id?.split('*').at(-1);
```

# Home Page Initialization

Initial exocortex structure creation for new users.

**Location:** `src/js/services/homePageInitializer.js`

## Overview

When a new user signs up, the system creates:
1. **Root block** with 6 top-level organizational blocks
2. **Areas sub-blocks** (8 responsibility areas)
3. **Tutorial tree** (separate, accessible via Space+1)

## Grid Layout

Home page uses a **9 rows × 7 columns** grid:

```
┌─────────────────────────────────────────────────────────────────┐
│                          INBOX                                  │  rows 1-2
│                        (cols 1-7)                               │
├───────────────────────────────────┬─────────────────────────────┤
│                                   │                             │
│             FOCUS                 │          PROJECTS           │  rows 3-5
│           (cols 1-4)              │         (cols 5-7)          │
│                                   │                             │
├───────────────────────────────────┼─────────────────────────────┤
│                                   │                             │
│             AREAS                 │          SPACES             │  rows 6-8
│           (cols 1-4)              │         (cols 5-7)          │
│                                   │                             │
├───────────────────────────────────┴─────────────────────────────┤
│                          ARCHIVE                                │  row 9
│                        (cols 1-7)                               │
└─────────────────────────────────────────────────────────────────┘
```

## Block Configuration

### HOME_PAGE_BLOCKS

```javascript
export const HOME_PAGE_BLOCKS = [
    {
        id: 'inbox',
        title: '📥 Inbox',
        text: 'Входящие задачи и идеи',
        color: [45, 80, 60],              // HSL: Yellow
        gridPosition: { row: 1, col: 1, rowSpan: 2, colSpan: 7 }
    },
    {
        id: 'focus',
        title: '🎯 Focus',
        text: 'Текущие приоритеты',
        color: [200, 70, 55],             // HSL: Blue
        gridPosition: { row: 3, col: 1, rowSpan: 3, colSpan: 4 }
    },
    {
        id: 'projects',
        title: '📁 Projects',
        text: 'Активные проекты',
        color: [280, 60, 60],             // HSL: Purple
        gridPosition: { row: 3, col: 5, rowSpan: 3, colSpan: 3 }
    },
    {
        id: 'areas',
        title: '🌍 Areas',
        text: 'Зоны ответственности',
        color: [120, 50, 50],             // HSL: Green
        gridPosition: { row: 6, col: 1, rowSpan: 3, colSpan: 4 },
        children: AREAS_BLOCKS            // Has sub-blocks
    },
    {
        id: 'spaces',
        title: '🏢 Spaces',
        text: 'Командные пространства',
        color: [180, 50, 55],             // HSL: Cyan
        gridPosition: { row: 6, col: 5, rowSpan: 3, colSpan: 3 }
    },
    {
        id: 'archive',
        title: '📦 Archive',
        text: 'Завершённые проекты',
        color: [0, 0, 60],                // HSL: Gray
        gridPosition: { row: 9, col: 1, rowSpan: 1, colSpan: 7 }
    }
];
```

### AREAS_BLOCKS

8 responsibility areas inside Areas block:

```javascript
export const AREAS_BLOCKS = [
    { id: 'self', title: '🧘 Self', text: 'Здоровье, развитие', color: [0, 70, 60] },
    { id: 'relationships', title: '💝 Relationships', text: 'Семья, друзья', color: [330, 70, 60] },
    { id: 'work', title: '💼 Work', text: 'Карьера, работа', color: [220, 70, 55] },
    { id: 'finance', title: '💰 Finance', text: 'Финансы, инвестиции', color: [45, 80, 55] },
    { id: 'environment', title: '🏠 Environment', text: 'Дом, быт', color: [30, 60, 55] },
    { id: 'energy', title: '⚡ Energy', text: 'Энергия, мотивация', color: [60, 80, 55] },
    { id: 'creation', title: '🎨 Creation', text: 'Творчество, хобби', color: [280, 60, 60] },
    { id: 'world', title: '🌐 World', text: 'Общество, вклад', color: [200, 50, 55] }
];
```

Areas uses **2×4 grid** (2 rows, 4 columns) for its children.

## Initialization Functions

### checkAndInitializeOnboarding()

Entry point called from `index.js`:

```javascript
import { checkAndInitializeOnboarding } from './services/homePageInitializer';

// In init()
const user = await getCurrentUser();
if (user) {
    await checkAndInitializeOnboarding(user);
}
```

Flow:
1. Check if user has root block
2. If no → call `initializeHomePage()`
3. Call `initializeTutorialTree()`
4. Show welcome banner

### initializeHomePage()

Creates the main exocortex structure:

```javascript
async function initializeHomePage(user) {
    // 1. Create root block
    const rootBlock = await api.createBlock({
        title: `${user.username}'s OmniMap`,
        data: {
            childOrder: [],
            layoutCells: {
                gridSize: '9x7',
                cells: {}  // Will be populated
            }
        }
    });

    // 2. Create top-level blocks
    for (const blockConfig of HOME_PAGE_BLOCKS) {
        const block = await createBlockFromConfig(blockConfig, rootBlock.id);

        // 3. Add to layoutCells
        rootBlock.data.layoutCells.cells[block.id] = {
            row: blockConfig.gridPosition.row,
            col: blockConfig.gridPosition.col,
            rowSpan: blockConfig.gridPosition.rowSpan,
            colSpan: blockConfig.gridPosition.colSpan
        };

        // 4. Create children if any (Areas)
        if (blockConfig.children) {
            await createChildBlocks(block.id, blockConfig.children);
        }
    }

    // 5. Update root with layoutCells
    await api.updateBlock(rootBlock.id, {
        data: rootBlock.data
    });
}
```

### initializeTutorialTree()

Creates standalone tutorial tree:

```javascript
async function initializeTutorialTree() {
    const { treeIds, blocks } = getTutorialBlocks();

    // Import all tutorial blocks
    await importBlocks(Array.from(blocks.values()));

    // Store tutorial root ID for Space+1 access
    localStorage.setItem('omnimap_tutorial_root', treeIds[0]);
}
```

## API Integration

Uses `importService.js` for bulk creation:

```javascript
import { importBlocks, pollImportStatus } from '../api/importService';

// Create multiple blocks at once
const result = await importBlocks(blocksArray);

// Poll for completion
await pollImportStatus(result.importId, (progress) => {
    console.log(`Import progress: ${progress}%`);
});
```

### Block Format for Import

```javascript
{
    id: generateBlockId(),           // UUID v4
    title: 'Block Title',
    parent_id: parentUuid,           // null for root
    data: JSON.stringify({
        text: 'Block content',
        childOrder: [],
        color: [h, s, l],
        layoutCells: { ... }         // For parent blocks
    })
}
```

## Customization

### Adding New Top-Level Block

1. Add to `HOME_PAGE_BLOCKS`:
```javascript
{
    id: 'resources',
    title: '📚 Resources',
    text: 'Полезные ресурсы',
    color: [160, 50, 55],
    gridPosition: { row: 10, col: 1, rowSpan: 1, colSpan: 7 }
}
```

2. Update grid size in root block:
```javascript
layoutCells: {
    gridSize: '10x7',  // Was 9x7
    // ...
}
```

### Adding New Area

Add to `AREAS_BLOCKS`:
```javascript
{
    id: 'learning',
    title: '📖 Learning',
    text: 'Обучение, курсы',
    color: [100, 60, 55]
}
```

Areas grid auto-adjusts (2×4 → 3×3 if needed).

### Changing Grid Layout

Modify `gridPosition` values:
```javascript
// Make Focus smaller
focus: {
    gridPosition: { row: 3, col: 1, rowSpan: 2, colSpan: 3 }  // Was 3x4
}
```

### Changing Colors

HSL format `[hue, saturation, lightness]`:
```javascript
// More saturated blue for Focus
focus: {
    color: [200, 85, 50]  // Was [200, 70, 55]
}
```

## layoutCells Format

Root block stores layout in `data.layoutCells`:

```javascript
{
    gridSize: '9x7',           // rows × cols
    presetType: 'home',        // Optional preset identifier
    cells: {
        'uuid-inbox': {
            row: 1,
            col: 1,
            rowSpan: 2,
            colSpan: 7,
            color: [45, 80, 60]  // Optional override
        },
        'uuid-focus': {
            row: 3,
            col: 1,
            rowSpan: 3,
            colSpan: 4
        },
        // ... more cells
    }
}
```

## Events

| Event | When | Data |
|-------|------|------|
| `HomePageCreated` | After init complete | `{ rootId, blockIds }` |
| `TutorialTreeCreated` | Tutorial ready | `{ tutorialRootId }` |
| `OnboardingProgress` | During creation | `{ step, total }` |

## Error Handling

```javascript
try {
    await initializeHomePage(user);
} catch (error) {
    if (error.response?.status === 409) {
        // Root already exists - skip
        console.log('Home page already initialized');
    } else {
        // Real error
        dispatch('OnboardingError', { error: error.message });
        throw error;
    }
}
```

## Testing

### Reset Home Page

```bash
# In browser console - DANGEROUS: deletes all data
localStorage.clear();
indexedDB.deleteDatabase('omnimap');
location.reload();
```

### Create Fresh User

Use backend admin or API to create new user without blocks.

### Mock Home Page

```javascript
// For testing without API
const mockBlocks = HOME_PAGE_BLOCKS.map(config => ({
    id: generateBlockId(),
    title: config.title,
    data: { text: config.text, color: config.color }
}));
```

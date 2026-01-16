# Onboarding Module

User onboarding system with tutorial, contextual hints, and welcome flow.

**Location:** `src/js/onboarding/`

## Files

| File | Purpose |
|------|---------|
| `OnboardingManager.js` | Main onboarding orchestrator (singleton) |
| `tutorialGraph.js` | Tutorial block structure |
| `hints.js` | Contextual hints configuration |
| `welcomeBanner.js` | Welcome banner UI component |
| `index.js` | Module exports |

## OnboardingManager

Singleton managing onboarding state and user progression.

```javascript
import { onboardingManager } from './onboarding';

// Initialize (called from index.js)
onboardingManager.init();

// Check if user is new (no root block)
if (onboardingManager.isNewUser()) {
    // Show welcome flow
}

// Get tutorial data for rendering
const { treeIds, blocks } = onboardingManager.getTutorialData();

// Show contextual hint
onboardingManager.showHint('firstBlockCreate');

// Check if hint was shown
if (onboardingManager.hasShownHint('firstNavigation')) {
    // Skip hint
}

// Complete onboarding
onboardingManager.completeOnboarding();

// Reset for testing
onboardingManager.reset();
```

### Storage Keys

All state persisted in localStorage:

| Key | Purpose | Values |
|-----|---------|--------|
| `omnimap_onboarding_completed` | Full onboarding done | `'true'` / absent |
| `omnimap_shown_hints` | Shown hints array | `'["hint1","hint2"]'` |
| `omnimap_tutorial_completed` | Tutorial finished | `'true'` / absent |
| `omnimap_hint_level` | Current hint complexity | `'1'` - `'4'` |

### Key Methods

```javascript
class OnboardingManager {
    // State checks
    isNewUser()           // No root block exists
    isOnboardingComplete() // localStorage flag set
    isTutorialComplete()   // Tutorial flag set

    // Hint management
    showHint(hintId)       // Show if not shown before
    hasShownHint(hintId)   // Check shown status
    markHintShown(hintId)  // Persist as shown
    getHintLevel()         // Current complexity (1-4)
    setHintLevel(level)    // Advance complexity

    // Tutorial
    getTutorialData()      // Returns { treeIds, blocks }

    // Lifecycle
    init()                 // Initialize manager
    completeOnboarding()   // Mark complete
    reset()                // Clear all state
}
```

## Contextual Hints

Progressive hints shown based on user actions.

**File:** `hints.js`

### Hint Levels

| Level | Category | Hints |
|-------|----------|-------|
| 1 | Basic | firstBlockCreate, firstNavigation, firstSearch, firstTextEdit |
| 2 | Organization | firstColor, firstCopy, firstPaste, firstPasteLink, firstUndo |
| 3 | Visualization | firstConnection, connectionModeEnter, firstDiagram, firstLayoutEditor |
| 4 | Collaboration | firstAccess, firstChat, firstReminder, firstWatch |

### Hint Structure

```javascript
// hints.js
export const CONTEXTUAL_HINTS = {
    firstBlockCreate: {
        id: 'firstBlockCreate',
        level: 1,
        trigger: 'CreateBlock',           // Event that triggers hint
        title: 'Блок создан!',
        message: 'Нажмите Enter чтобы открыть блок...',
        position: 'bottom',               // Tooltip position
        duration: 5000,                   // Auto-hide (ms)
        nextHint: 'firstNavigation'       // Chain to next
    },
    // ...
};
```

### Triggering Hints

Hints are triggered by events:

```javascript
// In command execution
dispatch('CreateBlock', { blockId });

// OnboardingManager listens
window.addEventListener('CreateBlock', () => {
    onboardingManager.showHint('firstBlockCreate');
});
```

### Adding New Hint

1. Add to `CONTEXTUAL_HINTS` in `hints.js`:
```javascript
myNewHint: {
    id: 'myNewHint',
    level: 2,                    // When to show (1-4)
    trigger: 'MyEvent',          // Triggering event
    title: 'Заголовок',
    message: 'Описание действия...',
    position: 'top',             // top, bottom, left, right
    duration: 4000,
    nextHint: 'anotherHint'      // Optional chain
}
```

2. Add event listener in `OnboardingManager.init()`:
```javascript
window.addEventListener('MyEvent', () => {
    this.showHint('myNewHint');
});
```

## Tutorial Graph

Standalone tutorial tree accessible via `Space+1`.

**File:** `tutorialGraph.js`

### Structure

```javascript
export const TUTORIAL_BLOCKS = {
    root: {
        id: 'tutorial-root',
        title: '📚 Учебник OmniMap',
        children: ['tutorial-homepage', 'tutorial-nav', 'tutorial-create',
                   'tutorial-organize', 'tutorial-advanced']
    },
    homepage: {
        id: 'tutorial-homepage',
        title: '🏠 Главная страница',
        text: 'Описание структуры...',
        children: ['tutorial-inbox', 'tutorial-focus', 'tutorial-projects']
    },
    // ... 15 total blocks
};
```

### Sections

| Section | Blocks | Purpose |
|---------|--------|---------|
| root | 1 | Entry point |
| homepage | 4 | Home page explanation |
| nav | 3 | Navigation tutorial |
| create | 2 | Block creation |
| organize | 3 | Organization features |
| advanced | 2 | Advanced features |

### Getting Tutorial Data

```javascript
import { getTutorialBlocks } from './tutorialGraph';

const { treeIds, blocks } = getTutorialBlocks();
// treeIds = ['tutorial-root']
// blocks = Map<id, block>
```

### Adding Tutorial Section

1. Add blocks to `TUTORIAL_BLOCKS`:
```javascript
newSection: {
    id: 'tutorial-newsection',
    title: '🆕 New Section',
    text: 'Description...',
    children: ['tutorial-sub1', 'tutorial-sub2']
},
sub1: {
    id: 'tutorial-sub1',
    title: 'Subsection 1',
    text: 'Content...',
    children: []
}
```

2. Add to parent's `children` array:
```javascript
root: {
    // ...
    children: ['...existing', 'tutorial-newsection']
}
```

## Welcome Banner

First-time user welcome UI.

**File:** `welcomeBanner.js`

```javascript
import { WelcomeBanner } from './welcomeBanner';

const banner = new WelcomeBanner();
banner.init(containerElement);
banner.show();

// Events
banner.onStart = () => {
    // Start tutorial
};

banner.onSkip = () => {
    // Skip to main app
};
```

### Banner Content

- Welcome message
- Key hotkeys display
- "Start Tutorial" button
- "Skip" button

### Customization

```javascript
class WelcomeBanner {
    constructor() {
        this.hotkeys = [
            { key: 'Enter', desc: 'Открыть блок' },
            { key: 'n', desc: 'Создать блок' },
            { key: 'Backspace', desc: 'Назад' },
            { key: '?', desc: 'Все хоткеи' }
        ];
    }
}
```

## Integration Flow

### New User Detection

```javascript
// In index.js initialization
async function init() {
    const rootBlock = await localStateManager.getRootBlock();

    if (!rootBlock) {
        // New user - start onboarding
        await checkAndInitializeOnboarding(currentUser);
    }
}
```

### Onboarding Sequence

1. **New user detected** → No root block exists
2. **Home page created** → `initializeHomePage()`
3. **Tutorial tree created** → `initializeTutorialTree()`
4. **Welcome banner shown** → User choice: tutorial or skip
5. **Contextual hints begin** → Level 1 hints active
6. **Progress through levels** → As user performs actions
7. **Onboarding complete** → All level 4 hints shown

### Events

| Event | When | Purpose |
|-------|------|---------|
| `OnboardingStarted` | Init begins | Show loading |
| `OnboardingComplete` | All done | Hide UI, enable features |
| `HintShown` | Hint displayed | Analytics |
| `TutorialOpened` | Space+1 pressed | Track usage |

## Testing

### Reset Onboarding

```javascript
// In browser console
onboardingManager.reset();
localStorage.clear();
location.reload();
```

### Force Hint Display

```javascript
// Clear specific hint
const hints = JSON.parse(localStorage.getItem('omnimap_shown_hints') || '[]');
const filtered = hints.filter(h => h !== 'firstBlockCreate');
localStorage.setItem('omnimap_shown_hints', JSON.stringify(filtered));
```

### Skip to Level

```javascript
localStorage.setItem('omnimap_hint_level', '3');
```

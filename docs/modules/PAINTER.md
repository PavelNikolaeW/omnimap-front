# Painter Module

Queue-based recursive rendering engine for block hierarchy.

**Location:** `src/js/painter/`

## Files

| File | Purpose |
|------|---------|
| `painter.js` | Main render orchestrator |
| `blockCreator.js` | DOM element factory |
| `calcBlockColor.js` | HSL color calculation |
| `cssConverter.js` | Dynamic CSS class generation |
| `gridLayoutCalculator.js` | Grid position/size calculation |
| `gridClassManager.js` | CSS Grid class management |
| `gridSpaceChecker.js` | Grid space availability |
| `adaptivePresets.js` | Responsive layout presets |
| `layoutTypes.js` | Layout type definitions |
| `styles.js` | Style configuration |

## Painter

Orchestrates rendering with BFS queue:

```javascript
class Painter {
    config = { maxDepth: 40 };

    render(blocks, { color, blockId }) {
        const queue = new Queue([{
            block: blocks.get(blockId),
            depth: 0,
            parentBlock: rootConfig,
            parentElement: this.rootContainer
        }]);

        this._render(queue, blocks, this.config);
        dispatch('DrawArrows', { arrows: blockCreator.arrows });
    }
}
```

### Render Loop

```javascript
_render(queue, blocks, { maxDepth }) {
    const fragments = new Map();  // Parent → DocumentFragment

    while (!queue.isEmpty()) {
        const { block, depth, parentBlock, parentElement } = queue.dequeue();

        // Skip tiny blocks or max depth
        if (parentBlock.size.width < 40 || depth > maxDepth) continue;

        // Create element
        const element = blockCreator.createElement(block, parentBlock, screen, depth);
        fragment.appendChild(element);

        // Queue children
        block.data.childOrder?.forEach(childId => {
            queue.enqueue({
                block: blocks.get(childId),
                depth: depth + 1,
                parentBlock: block,
                parentElement: element
            });
        });
    }

    // Batch DOM updates
    fragments.appendInParent();
}
```

## BlockCreator

Creates DOM elements based on block type.

### Block Types

| Type | Method | View Property |
|------|--------|---------------|
| Regular | `create()` | `null` |
| Link | `createLink()` | `'link'` |
| Iframe | `createIframe()` | `'iframe'` |
| Empty | `createEmpty()` | (no data) |
| Custom | `createCustomView()` | `'auth'`, `'registration'` |

### Element Structure

```html
<div id="block-uuid" block layout="l-sq" draggable="true"
     data-block-shape="diamond"
     data-block-border="medium">
    <div class="defaultContent">
        <titleBlock><b>Title</b></titleBlock>
        <div class="block-image-container">
            <img src="..." class="block-image" />
        </div>
        <contentBlock>Text content</contentBlock>
    </div>
</div>
```

### Custom Styles

```javascript
_applyCustomStyles(element, customStyles) {
    if (!customStyles) return;

    // Shape: diamond, rounded, hexagon, etc.
    if (customStyles.shape) {
        element.setAttribute('data-block-shape', customStyles.shape);
    }

    // Border: thin, medium, thick, dashed
    if (customStyles.border) {
        element.setAttribute('data-block-border', customStyles.border);
    }

    // Colors via inline style
    if (customStyles.backgroundColor) {
        element.style.backgroundColor = customStyles.backgroundColor;
    }
}
```

## Color Calculation

HSL-based color inheritance:

```javascript
class CalcColor {
    calculateColor(element, block, parentColor) {
        // Use custom color if set
        if (block.data?.color) {
            return block.data.color;
        }

        // Calculate based on parent and position
        const [h, s, l] = parentColor;
        const hueShift = this.getHueShift(block, parent);
        return [h + hueShift, s, l];
    }
}
```

### Color Modes

| Mode | Source | Priority |
|------|--------|----------|
| Custom | `block.data.color` | Highest |
| Layout Cell | `layoutCells.cells[].color` | High |
| Inherited | Parent color + shift | Default |
| Exit block | Orange preset | Special |

## Grid Layout

### Size Classes

Based on area ratio to screen:

| Class | Area Ratio | Example |
|-------|------------|---------|
| `xxl` | > 45% | Full screen |
| `xl` | > 22.5% | Half screen |
| `l` | > 11.25% | Quarter |
| `m` | > 5.9% | Medium |
| `s` | > 2.4% | Small |
| `xs` | > 1.2% | Tiny |
| `xxs` | > 0.1% | Minimal |
| `xxxs` | < 0.1% | Hidden content |

### Shape Suffixes

| Suffix | Aspect Ratio |
|--------|--------------|
| `-sq` | 0.7 - 1.49 (square) |
| `-w` | > 1.49 (wide) |
| `-h` | < 0.7 (tall) |

### Grid Calculation

```javascript
// gridLayoutCalculator.js
function calculateGridLayout(block, parentBlock) {
    const childCount = block.children.length;

    // Determine columns/rows
    const cols = Math.ceil(Math.sqrt(childCount));
    const rows = Math.ceil(childCount / cols);

    // Generate grid template
    block.grid = [
        `grid-template-columns_repeat(${cols}, 1fr)`,
        `grid-template-rows_repeat(${rows}, 1fr)`
    ];

    // Calculate child positions
    block.childrenPositions = {};
    block.children.forEach((childId, i) => {
        const col = (i % cols) + 1;
        const row = Math.floor(i / cols) + 1;
        block.childrenPositions[childId] = [
            `grid-column_${col}`,
            `grid-row_${row}`
        ];
    });
}
```

## CSS Converter

Generates CSS classes dynamically:

```javascript
// cssConverter.js
const styleCache = new Set();

function generateStylesheet(styles) {
    styles.forEach(style => {
        if (styleCache.has(style)) return;
        styleCache.add(style);

        // Parse: "grid-template-columns_1fr 1fr"
        const [property, value] = style.split('_');
        const css = `.${style} { ${property}: ${value.replace(/_/g, ' ')}; }`;

        stylesheet.insertRule(css);
    });
}
```

## Usage

```javascript
import { Painter } from './painter/painter';

const painter = new Painter();

// Render block tree
painter.render(blocks, {
    blockId: currentBlockId,
    color: [180, 50, 50]  // Starting HSL
});

// After render, arrows are dispatched
window.addEventListener('DrawArrows', (e) => {
    arrowManager.draw(e.detail.arrows);
});
```

## Performance

- Document fragments for batch DOM updates
- CSS class caching
- Max depth limit (40)
- Skip rendering tiny blocks (< 40px)
- Lazy iframe positioning

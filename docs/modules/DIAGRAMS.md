# Diagrams Module

jsPlumb connections and diagram mode.

**Location:** `src/js/controller/`

## Files

| File | Purpose |
|------|---------|
| `arrowManager.js` | jsPlumb instance, connection drawing |
| `connectionTypes.js` | Connection type definitions |
| `connectionAnchorManager.js` | Anchor point UI |
| `connectionEditManager.js` | Connection editing |
| `diagramEditor.js` | Diagram mode controller |
| `diagramUtils.js` | Diagram utility functions |
| `blockStyleManager.js` | Block styling (shape, color) |

## Connection Types

```javascript
// connectionTypes.js
export const CONNECTION_TYPES = {
    DEFAULT: 'default',     // Flowchart connector
    DASHED: 'dashed',       // Dashed line
    DOTTED: 'dotted',       // Dotted line
    DOUBLE: 'double',       // Bidirectional arrow
    CURVED: 'curved',       // Bezier curve
    STRAIGHT: 'straight',   // Straight line
    // UML types
    DEPENDENCY: 'dependency',
    ASSOCIATION: 'association',
    AGGREGATION: 'aggregation',
    COMPOSITION: 'composition',
    INHERITANCE: 'inheritance',
    REALIZATION: 'realization'
};
```

### Connection Config

```javascript
export const CONNECTION_CONFIGS = {
    default: {
        connector: 'Flowchart',
        paintStyle: { stroke: '#333', strokeWidth: 2 },
        overlays: [['Arrow', { location: 1 }]]
    },
    dashed: {
        connector: 'Flowchart',
        paintStyle: { stroke: '#333', strokeWidth: 2, dashstyle: '4 2' }
    },
    curved: {
        connector: ['Bezier', { curviness: 50 }],
        paintStyle: { stroke: '#333', strokeWidth: 2 }
    }
    // ...
};
```

## Arrow Manager

```javascript
// arrowManager.js
import { newInstance } from '@jsplumb/browser-ui';

export const jsPlumbInstance = newInstance({
    container: document.getElementById('rootContainer')
});

class ArrowManager {
    draw(arrows) {
        arrows.forEach(({ connections, layout }) => {
            connections.forEach(conn => {
                this.createConnection(conn);
            });
        });
    }

    createConnection({ sourceId, targetId, type, ...options }) {
        jsPlumbInstance.connect({
            source: document.getElementById(sourceId),
            target: document.getElementById(targetId),
            ...CONNECTION_CONFIGS[type || 'default'],
            ...options
        });
    }

    deleteConnection(sourceId, targetId) {
        const connections = jsPlumbInstance.getConnections({
            source: sourceId,
            target: targetId
        });
        connections.forEach(conn => jsPlumbInstance.deleteConnection(conn));
    }
}
```

## Creating Connections

### Via Command

```javascript
// commands.js - connectBlock command
{
    id: 'connectBlock',
    defaultHotkey: 'a',
    mode: ['normal', 'diagram'],
    execute: (ctx) => {
        if (ctx.mode === 'connectSelectSource') {
            // Have source, clicked target
            const targetId = extractBlockId(ctx.blockElement);
            dispatch('AddConnectionBlock', {
                sourceId: ctx.connectSourceId,
                targetId,
                type: 'default'
            });
            ctx.mode = ctx.previousMode || 'normal';
        } else {
            // Start connection - select source
            ctx.previousMode = ctx.mode;
            ctx.mode = 'connectSelectSource';
            ctx.connectSourceId = extractBlockId(ctx.blockElement);
        }
    }
}
```

### Via Anchor Points

```javascript
// connectionAnchorManager.js
class ConnectionAnchorManager {
    init(container) {
        // Show anchor points on block hover in connect mode
        container.addEventListener('mouseover', (e) => {
            if (ctx.mode === 'connectSelectSource') {
                this.showAnchors(e.target);
            }
        });
    }

    showAnchors(blockElement) {
        // Create anchor point elements at edges
        const positions = ['top', 'right', 'bottom', 'left'];
        positions.forEach(pos => {
            const anchor = document.createElement('div');
            anchor.className = 'anchor-point';
            anchor.dataset.position = pos;
            anchor.dataset.blockId = blockElement.id;
            blockElement.appendChild(anchor);
        });
    }
}
```

## Diagram Mode

```javascript
// diagramEditor.js
class DiagramEditor {
    enable(blockElement) {
        this.element = blockElement;
        this.blockId = blockElement.id;

        // Enable free positioning
        blockElement.setAttribute('data-diagram-mode', '');

        // Make children draggable
        this.initChildDragging();

        // Show grid overlay
        this.showGrid();
    }

    disable() {
        this.element?.removeAttribute('data-diagram-mode');
        this.hideGrid();
        this.element = null;
    }

    // Save positions to block.data.customGrid
    savePositions() {
        const positions = {};
        this.children.forEach(child => {
            positions[child.id] = {
                row: child.dataset.gridRow,
                col: child.dataset.gridCol,
                rowSpan: child.dataset.rowSpan || 1,
                colSpan: child.dataset.colSpan || 1
            };
        });

        dispatch('UpdateCustomGridBlock', {
            blockId: this.blockId,
            customGrid: { grid: this.grid, cells: positions }
        });
    }
}
```

## Block Styling

```javascript
// blockStyleManager.js
class BlockStyleManager {
    presetShapes = {
        process: { shape: 'rounded' },        // Rectangle
        decision: { shape: 'diamond' },        // Diamond
        data: { shape: 'parallelogram' },      // Input/output
        database: { shape: 'cylinder' },       // Database
        document: { shape: 'document' },       // Document
        terminal: { shape: 'ellipse' },        // Start/end
        manual: { shape: 'trapezoid' },        // Manual input
        subprocess: { shape: 'rounded' }       // Subprocess
    };

    show(blockId, blockElement) {
        // Show style panel
        this.panel.style.display = 'block';
        this.currentBlockId = blockId;
    }

    applyShapePreset(presetName) {
        const preset = this.presetShapes[presetName];
        this.applyStyles(this.currentBlockId, preset);
    }

    applyStyles(blockId, styles) {
        dispatch('UpdateBlockStyles', {
            blockId,
            customStyles: styles
        });
    }
}

export const blockStyleManager = new BlockStyleManager();
```

## CSS Data Attributes

Styles applied via data attributes:

```css
/* Shape */
[data-block-shape="diamond"] {
    clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
}

[data-block-shape="hexagon"] {
    clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
}

/* Border */
[data-block-border="thin"] { border-width: 1px; }
[data-block-border="medium"] { border-width: 2px; }
[data-block-border="dashed"] { border-style: dashed; }

/* Shadow - use filter for clip-path shapes */
[data-block-shape="diamond"][data-block-shadow="md"] {
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1));
}
```

## Connection Commands

| Command | Type | Hotkey |
|---------|------|--------|
| `connectBlock` | default | `a` |
| `connectDashed` | dashed | - |
| `connectDouble` | double | - |
| `connectCurved` | curved | - |
| `connectStraight` | straight | - |
| `deleteConnectBlock` | delete | `shift+a` |

## Adding New Connection Type

1. Add to `CONNECTION_TYPES`:
```javascript
CUSTOM: 'custom'
```

2. Add config to `CONNECTION_CONFIGS`:
```javascript
custom: {
    connector: 'Flowchart',
    paintStyle: { stroke: 'red', strokeWidth: 3 },
    overlays: [['Diamond', { location: 0.5 }]]
}
```

3. Add command (optional):
```javascript
{
    id: 'connectCustom',
    mode: ['normal', 'diagram'],
    execute: (ctx) => {
        startConnection(ctx, 'custom');
    }
}
```

## Adding New Shape

1. Add CSS in `diagram-editor.css`:
```css
[data-block-shape="star"] {
    clip-path: polygon(
        50% 0%, 61% 35%, 98% 35%, 68% 57%,
        79% 91%, 50% 70%, 21% 91%, 32% 57%,
        2% 35%, 39% 35%
    );
}
```

2. Add preset in `BlockStyleManager.presetShapes`:
```javascript
star: { shape: 'star' }
```

3. Add shadow support if using clip-path:
```css
[data-block-shape="star"][data-block-shadow="md"] {
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1));
}
```

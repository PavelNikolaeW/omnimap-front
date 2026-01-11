/**
 * Tests for DragDropManager
 * Covers drag-and-drop functionality for moving blocks in the tree
 */

import { DragDropManager } from '../../controller/dragDropManager';

// Mock dispatch
jest.mock('../../utils/utils', () => ({
    dispatch: jest.fn()
}));

import { dispatch } from '../../utils/utils';

// Helper to create mock block element
const createMockBlockElement = (id, options = {}) => {
    const element = document.createElement('div');
    element.id = id;
    element.setAttribute('block', '');

    if (options.hasCustomGrid) {
        element.setAttribute('blockcustomgrid', '');
    }

    // Mock getBoundingClientRect for drop zone calculations
    element.getBoundingClientRect = jest.fn(() => ({
        top: options.top || 100,
        bottom: options.bottom || 200,
        left: options.left || 50,
        right: options.right || 250,
        width: options.width || 200,
        height: options.height || 100
    }));

    // Mock classList
    element.classList.add = jest.fn();
    element.classList.remove = jest.fn();

    return element;
};

// Helper to create mock parent with child
const createMockParentChild = (parentId, childId, parentOptions = {}) => {
    const parent = createMockBlockElement(parentId, parentOptions);
    const child = createMockBlockElement(childId);
    parent.appendChild(child);
    return { parent, child };
};

describe('DragDropManager', () => {
    let manager;
    let mockLocalStateManager;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create fresh instance for each test
        manager = new DragDropManager();

        // Mock localStateManager
        mockLocalStateManager = {
            blocks: new Map()
        };
        manager.localStateManager = mockLocalStateManager;
    });

    afterEach(() => {
        // Clean up any drop indicators
        const indicator = document.getElementById('drag-drop-indicator');
        if (indicator) indicator.remove();
    });

    describe('_extractBlockId', () => {
        test('extracts simple block ID', () => {
            const element = createMockBlockElement('block-123');
            expect(manager._extractBlockId(element)).toBe('block-123');
        });

        test('extracts block ID from link format (parentId*blockId)', () => {
            const element = createMockBlockElement('parent-1*child-2');
            expect(manager._extractBlockId(element)).toBe('child-2');
        });

        test('handles multiple asterisks in ID', () => {
            const element = createMockBlockElement('a*b*c*d');
            expect(manager._extractBlockId(element)).toBe('d');
        });

        test('returns original ID if no asterisk', () => {
            const element = createMockBlockElement('simple-uuid-format');
            expect(manager._extractBlockId(element)).toBe('simple-uuid-format');
        });
    });

    describe('canDrag', () => {
        test('returns false for null element', () => {
            expect(manager.canDrag(null)).toBe(false);
        });

        test('returns false for element without block attribute', () => {
            const element = document.createElement('div');
            expect(manager.canDrag(element)).toBe(false);
        });

        test('returns true for regular block', () => {
            const { parent, child } = createMockParentChild('parent-1', 'child-1');
            document.body.appendChild(parent);

            expect(manager.canDrag(child)).toBe(true);

            document.body.removeChild(parent);
        });

        test('returns false for block inside diagram (blockcustomgrid attribute)', () => {
            const { parent, child } = createMockParentChild('parent-1', 'child-1', { hasCustomGrid: true });
            document.body.appendChild(parent);

            expect(manager.canDrag(child)).toBe(false);

            document.body.removeChild(parent);
        });

        test('returns false for block inside diagram (data.customGrid.grid)', () => {
            const { parent, child } = createMockParentChild('parent-1', 'child-1');
            document.body.appendChild(parent);

            mockLocalStateManager.blocks.set('parent-1', {
                id: 'parent-1',
                data: { customGrid: { grid: ['grid-template-columns__1fr'] } }
            });

            expect(manager.canDrag(child)).toBe(false);

            document.body.removeChild(parent);
        });

        test('returns false for block inside layoutCells', () => {
            const { parent, child } = createMockParentChild('parent-1', 'child-1');
            document.body.appendChild(parent);

            mockLocalStateManager.blocks.set('parent-1', {
                id: 'parent-1',
                data: {
                    layout: 'cells',
                    layoutCells: { gridSize: { rows: 3, cols: 3 } }
                }
            });

            expect(manager.canDrag(child)).toBe(false);

            document.body.removeChild(parent);
        });

        test('returns true when parent has layout but no layoutCells', () => {
            const { parent, child } = createMockParentChild('parent-1', 'child-1');
            document.body.appendChild(parent);

            mockLocalStateManager.blocks.set('parent-1', {
                id: 'parent-1',
                data: { layout: 'cells' } // no layoutCells
            });

            expect(manager.canDrag(child)).toBe(true);

            document.body.removeChild(parent);
        });
    });

    describe('canDropInto', () => {
        beforeEach(() => {
            manager.draggedBlockId = 'dragged-block';
        });

        test('returns false for null element', () => {
            expect(manager.canDropInto(null)).toBe(false);
        });

        test('returns false for element without block attribute', () => {
            const element = document.createElement('div');
            expect(manager.canDropInto(element)).toBe(false);
        });

        test('returns false when dropping on self', () => {
            const element = createMockBlockElement('dragged-block');
            expect(manager.canDropInto(element)).toBe(false);
        });

        test('returns true for valid drop target', () => {
            const element = createMockBlockElement('target-block');
            mockLocalStateManager.blocks.set('target-block', {
                id: 'target-block',
                data: {}
            });

            expect(manager.canDropInto(element)).toBe(true);
        });

        test('returns false for diagram block target', () => {
            const element = createMockBlockElement('diagram-block', { hasCustomGrid: true });
            expect(manager.canDropInto(element)).toBe(false);
        });

        test('returns false for layoutCells block target', () => {
            const element = createMockBlockElement('layout-block');
            mockLocalStateManager.blocks.set('layout-block', {
                id: 'layout-block',
                data: { layout: 'cells', layoutCells: {} }
            });

            expect(manager.canDropInto(element)).toBe(false);
        });

        test('returns false for circular reference (drop into descendant)', () => {
            const element = createMockBlockElement('descendant-block');

            // Set up tree: dragged-block -> child -> descendant-block
            mockLocalStateManager.blocks.set('descendant-block', {
                id: 'descendant-block',
                parent_id: 'child-block',
                data: {}
            });
            mockLocalStateManager.blocks.set('child-block', {
                id: 'child-block',
                parent_id: 'dragged-block',
                data: {}
            });

            expect(manager.canDropInto(element)).toBe(false);
        });
    });

    describe('_isDescendant', () => {
        test('returns false when localStateManager not available', () => {
            manager.localStateManager = null;
            expect(manager._isDescendant('parent', 'child')).toBe(false);
        });

        test('returns false for unrelated blocks', () => {
            mockLocalStateManager.blocks.set('block-a', { id: 'block-a', parent_id: 'root' });
            mockLocalStateManager.blocks.set('block-b', { id: 'block-b', parent_id: 'root' });

            expect(manager._isDescendant('block-a', 'block-b')).toBe(false);
        });

        test('returns true for direct child', () => {
            mockLocalStateManager.blocks.set('child', { id: 'child', parent_id: 'parent' });

            expect(manager._isDescendant('parent', 'child')).toBe(true);
        });

        test('returns true for deep descendant', () => {
            mockLocalStateManager.blocks.set('level-3', { id: 'level-3', parent_id: 'level-2' });
            mockLocalStateManager.blocks.set('level-2', { id: 'level-2', parent_id: 'level-1' });
            mockLocalStateManager.blocks.set('level-1', { id: 'level-1', parent_id: 'root' });

            expect(manager._isDescendant('root', 'level-3')).toBe(true);
        });

        test('handles cycles in tree without infinite loop', () => {
            // Simulate corrupted data with cycle
            mockLocalStateManager.blocks.set('a', { id: 'a', parent_id: 'b' });
            mockLocalStateManager.blocks.set('b', { id: 'b', parent_id: 'a' });

            // Should return false without hanging
            expect(manager._isDescendant('c', 'a')).toBe(false);
        });

        test('returns false when block has no parent', () => {
            mockLocalStateManager.blocks.set('root', { id: 'root', parent_id: null });

            expect(manager._isDescendant('anything', 'root')).toBe(false);
        });
    });

    describe('_getNextSiblingId', () => {
        test('returns null when localStateManager not available', () => {
            manager.localStateManager = null;
            expect(manager._getNextSiblingId('block-1', 'parent')).toBeNull();
        });

        test('returns null when parent not found', () => {
            expect(manager._getNextSiblingId('block-1', 'non-existent')).toBeNull();
        });

        test('returns next sibling ID', () => {
            mockLocalStateManager.blocks.set('parent', {
                id: 'parent',
                data: { childOrder: ['child-1', 'child-2', 'child-3'] }
            });

            expect(manager._getNextSiblingId('child-1', 'parent')).toBe('child-2');
            expect(manager._getNextSiblingId('child-2', 'parent')).toBe('child-3');
        });

        test('returns null for last child', () => {
            mockLocalStateManager.blocks.set('parent', {
                id: 'parent',
                data: { childOrder: ['child-1', 'child-2'] }
            });

            expect(manager._getNextSiblingId('child-2', 'parent')).toBeNull();
        });

        test('returns null for non-existent child', () => {
            mockLocalStateManager.blocks.set('parent', {
                id: 'parent',
                data: { childOrder: ['child-1'] }
            });

            expect(manager._getNextSiblingId('non-existent', 'parent')).toBeNull();
        });

        test('falls back to children array if no childOrder', () => {
            mockLocalStateManager.blocks.set('parent', {
                id: 'parent',
                children: ['child-1', 'child-2'],
                data: {}
            });

            expect(manager._getNextSiblingId('child-1', 'parent')).toBe('child-2');
        });
    });

    describe('startDrag', () => {
        test('returns false and prevents default for non-draggable block', () => {
            const element = document.createElement('div'); // no block attribute
            const mockEvent = { preventDefault: jest.fn(), dataTransfer: {} };

            const result = manager.startDrag(mockEvent, element);

            expect(result).toBe(false);
            expect(mockEvent.preventDefault).toHaveBeenCalled();
        });

        test('initializes drag state for valid block', () => {
            const { parent, child } = createMockParentChild('parent-1', 'child-1');
            document.body.appendChild(parent);

            const mockEvent = {
                preventDefault: jest.fn(),
                dataTransfer: {
                    effectAllowed: null,
                    setData: jest.fn()
                }
            };

            const result = manager.startDrag(mockEvent, child);

            expect(result).toBe(true);
            expect(manager.isDragging).toBe(true);
            expect(manager.draggedBlockId).toBe('child-1');
            expect(manager.draggedElement).toBe(child);
            expect(manager.dragSourceParentId).toBe('parent-1');
            expect(mockEvent.dataTransfer.effectAllowed).toBe('move');
            expect(mockEvent.dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'child-1');
            expect(child.classList.add).toHaveBeenCalledWith('block-dragging');

            document.body.removeChild(parent);
        });
    });

    describe('handleDrop', () => {
        test('cleans up without dispatch when not dragging', () => {
            manager.isDragging = false;
            const mockEvent = { preventDefault: jest.fn() };

            manager.handleDrop(mockEvent, null);

            expect(dispatch).not.toHaveBeenCalled();
        });

        test('cleans up without dispatch when no drop target', () => {
            manager.isDragging = true;
            manager.lastDropTarget = null;
            const mockEvent = { preventDefault: jest.fn() };

            manager.handleDrop(mockEvent, null);

            expect(dispatch).not.toHaveBeenCalled();
        });

        test('does not dispatch when dropping in same location', () => {
            manager.isDragging = true;
            manager.draggedBlockId = 'block-1';
            manager.dragSourceParentId = 'parent-1';
            manager.lastDropTarget = { parentId: 'parent-1', beforeBlockId: null };

            const mockEvent = { preventDefault: jest.fn() };

            manager.handleDrop(mockEvent, null);

            expect(dispatch).not.toHaveBeenCalled();
        });

        test('dispatches MoveBlock event for valid drop', () => {
            manager.isDragging = true;
            manager.draggedBlockId = 'block-1';
            manager.dragSourceParentId = 'old-parent';
            manager.lastDropTarget = { parentId: 'new-parent', beforeBlockId: 'sibling' };
            manager.draggedElement = createMockBlockElement('block-1');

            const mockEvent = { preventDefault: jest.fn() };

            manager.handleDrop(mockEvent, null);

            expect(dispatch).toHaveBeenCalledWith('MoveBlock', {
                block_id: 'block-1',
                old_parent_id: 'old-parent',
                new_parent_id: 'new-parent',
                before: 'sibling'
            });
        });
    });

    describe('cleanup', () => {
        test('resets all state', () => {
            manager.isDragging = true;
            manager.draggedBlockId = 'block-1';
            manager.draggedElement = createMockBlockElement('block-1');
            manager.dragSourceParentId = 'parent-1';
            manager.lastDropTarget = { parentId: 'target' };

            manager.cleanup();

            expect(manager.isDragging).toBe(false);
            expect(manager.draggedBlockId).toBeNull();
            expect(manager.draggedElement).toBeNull();
            expect(manager.dragSourceParentId).toBeNull();
            expect(manager.lastDropTarget).toBeNull();
        });

        test('removes CSS classes from dragged element', () => {
            const element = createMockBlockElement('block-1');
            manager.draggedElement = element;

            manager.cleanup();

            expect(element.classList.remove).toHaveBeenCalledWith('block-dragging');
        });

        test('removes drop indicator from DOM', () => {
            const indicator = document.createElement('div');
            indicator.id = 'drag-drop-indicator';
            document.body.appendChild(indicator);
            manager.dropIndicator = indicator;

            manager.cleanup();

            expect(document.getElementById('drag-drop-indicator')).toBeNull();
            expect(manager.dropIndicator).toBeNull();
        });
    });

    describe('_calculateDropTarget', () => {
        let targetElement;

        beforeEach(() => {
            manager.draggedBlockId = 'dragged-block';

            // Create target with parent
            const { parent, child } = createMockParentChild('parent-1', 'target-1');
            targetElement = child;
            document.body.appendChild(parent);

            // Configure getBoundingClientRect
            targetElement.getBoundingClientRect = jest.fn(() => ({
                top: 100,
                bottom: 200,
                left: 50,
                right: 250,
                width: 200,
                height: 100
            }));
        });

        afterEach(() => {
            const parent = document.querySelector('[block][id="parent-1"]');
            if (parent) parent.remove();
        });

        test('returns null for null element', () => {
            const event = { clientY: 150 };
            expect(manager._calculateDropTarget(event, null)).toBeNull();
        });

        test('returns null for element without block attribute', () => {
            const event = { clientY: 150 };
            const div = document.createElement('div');
            expect(manager._calculateDropTarget(event, div)).toBeNull();
        });

        test('returns null when dropping on self', () => {
            manager.draggedBlockId = 'target-1';
            const event = { clientY: 150 };
            expect(manager._calculateDropTarget(event, targetElement)).toBeNull();
        });

        test('returns sibling-before for top zone (< 25%)', () => {
            // Top zone: 100-125 (25% of 100px height)
            const event = { clientY: 110 }; // 10% from top

            const result = manager._calculateDropTarget(event, targetElement);

            expect(result).toEqual({
                parentId: 'parent-1',
                beforeBlockId: 'target-1',
                type: 'sibling-before'
            });
        });

        test('returns sibling-after for bottom zone (> 75%)', () => {
            // Bottom zone: 175-200 (75% of 100px height)
            const event = { clientY: 190 }; // 90% from top

            mockLocalStateManager.blocks.set('parent-1', {
                id: 'parent-1',
                data: { childOrder: ['target-1', 'next-sibling'] }
            });

            const result = manager._calculateDropTarget(event, targetElement);

            expect(result.type).toBe('sibling-after');
            expect(result.parentId).toBe('parent-1');
            expect(result.beforeBlockId).toBe('next-sibling');
        });

        test('returns child for center zone (25-75%)', () => {
            // Center zone: 125-175
            const event = { clientY: 150 }; // 50% from top

            mockLocalStateManager.blocks.set('target-1', {
                id: 'target-1',
                data: {}
            });

            const result = manager._calculateDropTarget(event, targetElement);

            expect(result).toEqual({
                parentId: 'target-1',
                beforeBlockId: null,
                type: 'child'
            });
        });

        test('returns null for child zone when target is diagram', () => {
            const event = { clientY: 150 }; // center

            mockLocalStateManager.blocks.set('target-1', {
                id: 'target-1',
                data: { customGrid: { grid: ['1fr'] } }
            });

            const result = manager._calculateDropTarget(event, targetElement);

            expect(result).toBeNull();
        });
    });

    describe('_showDropIndicator', () => {
        test('creates sibling-before indicator at top of block', () => {
            const element = createMockBlockElement('block-1');
            element.getBoundingClientRect = () => ({
                top: 100, bottom: 200, left: 50, width: 200, height: 100
            });

            manager._showDropIndicator(element, { type: 'sibling-before' });

            const indicator = document.getElementById('drag-drop-indicator');
            expect(indicator).not.toBeNull();
            expect(indicator.style.top).toBe('98px'); // rect.top - 2
            expect(indicator.style.height).toBe('4px');
        });

        test('creates sibling-after indicator at bottom of block', () => {
            const element = createMockBlockElement('block-1');
            element.getBoundingClientRect = () => ({
                top: 100, bottom: 200, left: 50, width: 200, height: 100
            });

            manager._showDropIndicator(element, { type: 'sibling-after' });

            const indicator = document.getElementById('drag-drop-indicator');
            expect(indicator).not.toBeNull();
            expect(indicator.style.top).toBe('198px'); // rect.bottom - 2
        });

        test('creates child indicator covering entire block', () => {
            const element = createMockBlockElement('block-1');
            element.getBoundingClientRect = () => ({
                top: 100, bottom: 200, left: 50, width: 200, height: 100
            });

            manager._showDropIndicator(element, { type: 'child' });

            const indicator = document.getElementById('drag-drop-indicator');
            expect(indicator).not.toBeNull();
            expect(indicator.style.height).toBe('100px');
            expect(indicator.style.border).toContain('dashed');
        });

        test('removes previous indicator before creating new one', () => {
            const element = createMockBlockElement('block-1');
            element.getBoundingClientRect = () => ({
                top: 100, bottom: 200, left: 50, width: 200, height: 100
            });

            manager._showDropIndicator(element, { type: 'sibling-before' });
            manager._showDropIndicator(element, { type: 'sibling-after' });

            const indicators = document.querySelectorAll('#drag-drop-indicator');
            expect(indicators.length).toBe(1);
        });
    });

    describe('_removeDropIndicator', () => {
        test('removes indicator by reference', () => {
            const indicator = document.createElement('div');
            indicator.id = 'drag-drop-indicator';
            document.body.appendChild(indicator);
            manager.dropIndicator = indicator;

            manager._removeDropIndicator();

            expect(document.getElementById('drag-drop-indicator')).toBeNull();
            expect(manager.dropIndicator).toBeNull();
        });

        test('removes indicator by ID even if reference lost', () => {
            const indicator = document.createElement('div');
            indicator.id = 'drag-drop-indicator';
            document.body.appendChild(indicator);
            manager.dropIndicator = null; // reference lost

            manager._removeDropIndicator();

            expect(document.getElementById('drag-drop-indicator')).toBeNull();
        });
    });

    describe('endDrag', () => {
        test('calls cleanup', () => {
            const cleanupSpy = jest.spyOn(manager, 'cleanup');

            manager.endDrag();

            expect(cleanupSpy).toHaveBeenCalled();
        });
    });

    describe('handleDragOver', () => {
        test('does nothing when not dragging', () => {
            manager.isDragging = false;
            const mockEvent = { preventDefault: jest.fn() };

            manager.handleDragOver(mockEvent, null);

            expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        });

        test('does nothing when no target element', () => {
            manager.isDragging = true;
            const mockEvent = { preventDefault: jest.fn() };

            manager.handleDragOver(mockEvent, null);

            expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        });

        test('removes indicator when no valid drop target', () => {
            manager.isDragging = true;
            manager.draggedBlockId = 'block-1';

            const element = createMockBlockElement('block-1'); // same as dragged
            const mockEvent = { clientY: 150 };

            const removeIndicatorSpy = jest.spyOn(manager, '_removeDropIndicator');

            manager.handleDragOver(mockEvent, element);

            expect(removeIndicatorSpy).toHaveBeenCalled();
            expect(manager.lastDropTarget).toBeNull();
        });

        test('shows indicator and sets lastDropTarget for valid target', () => {
            manager.isDragging = true;
            manager.draggedBlockId = 'dragged-block';

            const { parent, child } = createMockParentChild('parent-1', 'target-1');
            document.body.appendChild(parent);

            child.getBoundingClientRect = () => ({
                top: 100, bottom: 200, left: 50, width: 200, height: 100
            });

            const mockEvent = {
                clientY: 110, // top zone
                preventDefault: jest.fn(),
                dataTransfer: { dropEffect: null }
            };

            manager.handleDragOver(mockEvent, child);

            expect(mockEvent.preventDefault).toHaveBeenCalled();
            expect(mockEvent.dataTransfer.dropEffect).toBe('move');
            expect(manager.lastDropTarget).not.toBeNull();
            expect(manager.lastDropTarget.type).toBe('sibling-before');

            document.body.removeChild(parent);
        });
    });
});

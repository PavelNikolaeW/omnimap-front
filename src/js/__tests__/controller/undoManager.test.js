/**
 * @jest-environment jsdom
 */

import { undoManager } from '../../controller/undoManager';

// Мокаем localforage
jest.mock('localforage', () => ({
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined)
}));

// Мокаем dispatch
jest.mock('../../utils/utils', () => ({
    dispatch: jest.fn()
}));

// Мокаем localStateManager
const mockBlocks = new Map();
const mockLocalStateManager = {
    blocks: mockBlocks,
    saveBlock: jest.fn().mockResolvedValue(undefined),
    removeBlock: jest.fn().mockResolvedValue(undefined)
};
jest.mock('../../stateLocal/localStateManager', () => ({
    localStateManager: {
        blocks: mockBlocks,
        getInstance: () => mockLocalStateManager
    }
}));

// Мокаем offlineQueue
jest.mock('../../sincManager/offlineQueue', () => ({
    offlineQueue: {
        enqueue: jest.fn().mockResolvedValue(undefined)
    }
}));

import localforage from 'localforage';
import { dispatch } from '../../utils/utils';

describe('UndoManager', () => {
    beforeEach(async () => {
        // Очищаем стеки перед каждым тестом
        undoManager.undoStack = [];
        undoManager.redoStack = [];
        undoManager.isApplying = false;
        undoManager.isInitialized = false;

        // Сбрасываем моки
        jest.clearAllMocks();
    });

    describe('init', () => {
        it('should initialize and load from storage', async () => {
            localforage.getItem.mockResolvedValueOnce({
                undoStack: [{ id: 'test-entry', type: 'edit', blockId: 'block-1' }]
            });

            await undoManager.init();

            expect(undoManager.isInitialized).toBe(true);
            expect(undoManager.undoStack).toHaveLength(1);
            expect(localforage.getItem).toHaveBeenCalledWith('undoStack');
        });

        it('should not reinitialize if already initialized', async () => {
            undoManager.isInitialized = true;

            await undoManager.init();

            expect(localforage.getItem).not.toHaveBeenCalled();
        });
    });

    describe('recordEdit', () => {
        it('should record edit operation', () => {
            const blockId = 'block-1';
            const before = { id: blockId, title: 'Old Title', data: {} };
            const after = { id: blockId, title: 'New Title', data: {} };

            undoManager.recordEdit(blockId, before, after);

            expect(undoManager.undoStack).toHaveLength(1);
            expect(undoManager.undoStack[0].type).toBe('edit');
            expect(undoManager.undoStack[0].blockId).toBe(blockId);
        });

        it('should not record when isApplying is true', () => {
            undoManager.isApplying = true;

            undoManager.recordEdit('block-1', {}, {});

            expect(undoManager.undoStack).toHaveLength(0);
        });

        it('should merge consecutive edits within merge window', () => {
            const blockId = 'block-1';

            undoManager.recordEdit(blockId, { title: 'A' }, { title: 'B' });
            undoManager.recordEdit(blockId, { title: 'B' }, { title: 'C' });

            // Should merge into single entry
            expect(undoManager.undoStack).toHaveLength(1);
            expect(undoManager.undoStack[0].changes.after.title).toBe('C');
        });

        it('should clear redo stack on new action', () => {
            undoManager.redoStack = [{ id: 'redo-entry' }];

            undoManager.recordEdit('block-1', {}, {});

            expect(undoManager.redoStack).toHaveLength(0);
        });
    });

    describe('recordCreate', () => {
        it('should record create operation', () => {
            const blockId = 'block-1';
            const parentId = 'parent-1';
            const blockData = { id: blockId, title: 'New Block' };

            undoManager.recordCreate(blockId, parentId, blockData);

            expect(undoManager.undoStack).toHaveLength(1);
            expect(undoManager.undoStack[0].type).toBe('create');
            expect(undoManager.undoStack[0].blockId).toBe(blockId);
            expect(undoManager.undoStack[0].parentId).toBe(parentId);
        });
    });

    describe('recordDelete', () => {
        it('should record delete operation', () => {
            const blockId = 'block-1';
            const parentId = 'parent-1';
            const blockData = { id: blockId, title: 'Deleted Block' };

            undoManager.recordDelete(blockId, parentId, blockData);

            expect(undoManager.undoStack).toHaveLength(1);
            expect(undoManager.undoStack[0].type).toBe('delete');
            expect(undoManager.undoStack[0].changes.before.title).toBe('Deleted Block');
        });
    });

    describe('recordDeleteTree', () => {
        it('should record tree deletion', () => {
            const subtree = new Map([
                ['block-1', { id: 'block-1', title: 'Root' }],
                ['block-2', { id: 'block-2', title: 'Child' }]
            ]);

            const result = undoManager.recordDeleteTree('block-1', 'parent-1', subtree);

            expect(result).toBe(true);
            expect(undoManager.undoStack).toHaveLength(1);
            expect(undoManager.undoStack[0].type).toBe('deleteTree');
        });

        it('should skip large trees (>500 blocks)', () => {
            const subtree = new Map();
            for (let i = 0; i < 501; i++) {
                subtree.set(`block-${i}`, { id: `block-${i}` });
            }

            const result = undoManager.recordDeleteTree('block-0', 'parent-1', subtree);

            expect(result).toBe(false);
            expect(undoManager.undoStack).toHaveLength(0);
            expect(dispatch).toHaveBeenCalledWith('ShowWarning', expect.any(Object));
        });
    });

    describe('recordMove', () => {
        it('should record move operation', () => {
            const blockId = 'block-1';
            const oldParentId = 'old-parent';
            const newParentId = 'new-parent';
            const before = { id: blockId, parent_id: oldParentId };
            const after = { id: blockId, parent_id: newParentId };

            undoManager.recordMove(blockId, oldParentId, newParentId, before, after, {}, {});

            expect(undoManager.undoStack).toHaveLength(1);
            expect(undoManager.undoStack[0].type).toBe('move');
            expect(undoManager.undoStack[0].oldParentId).toBe(oldParentId);
            expect(undoManager.undoStack[0].newParentId).toBe(newParentId);
        });
    });

    describe('undo', () => {
        it('should pop entry from undoStack and push to redoStack', async () => {
            // Добавляем мок для localStateManager.blocks
            const { localStateManager } = require('../../stateLocal/localStateManager');
            localStateManager.blocks.set('block-1', { id: 'block-1', title: 'Current', data: {} });

            undoManager.undoStack = [{
                id: 'entry-1',
                type: 'edit',
                blockId: 'block-1',
                changes: {
                    before: { title: 'Before' },
                    after: { title: 'After' }
                }
            }];

            await undoManager.undo();

            expect(undoManager.undoStack).toHaveLength(0);
            expect(undoManager.redoStack).toHaveLength(1);
        });

        it('should skip invalid entries', async () => {
            undoManager.undoStack = [
                { id: 'valid', type: 'edit', blockId: 'b1', changes: { before: {}, after: {} } },
                { id: 'invalid', type: 'edit', blockId: 'b2', invalid: true, changes: { before: {}, after: {} } }
            ];

            // Мок для блока
            const { localStateManager } = require('../../stateLocal/localStateManager');
            localStateManager.blocks.set('b1', { id: 'b1', data: {} });

            await undoManager.undo();
            await undoManager.undo();

            // Invalid entry should be skipped
            expect(undoManager.redoStack).toHaveLength(1);
            expect(undoManager.redoStack[0].id).toBe('valid');
        });

        it('should do nothing when undoStack is empty', async () => {
            undoManager.undoStack = [];

            await undoManager.undo();

            expect(undoManager.redoStack).toHaveLength(0);
        });
    });

    describe('redo', () => {
        it('should pop entry from redoStack and push to undoStack', async () => {
            const { localStateManager } = require('../../stateLocal/localStateManager');
            localStateManager.blocks.set('block-1', { id: 'block-1', title: 'Current', data: {} });

            undoManager.redoStack = [{
                id: 'entry-1',
                type: 'edit',
                blockId: 'block-1',
                changes: {
                    before: { title: 'Before' },
                    after: { title: 'After' }
                }
            }];

            await undoManager.redo();

            expect(undoManager.redoStack).toHaveLength(0);
            expect(undoManager.undoStack).toHaveLength(1);
        });
    });

    describe('invalidateEntriesForBlock', () => {
        it('should mark entries for block as invalid', () => {
            undoManager.undoStack = [
                { id: 'e1', blockId: 'block-1' },
                { id: 'e2', blockId: 'block-2' },
                { id: 'e3', blockId: 'block-1' }
            ];

            undoManager.invalidateEntriesForBlock('block-1');

            expect(undoManager.undoStack[0].invalid).toBe(true);
            expect(undoManager.undoStack[1].invalid).toBeUndefined();
            expect(undoManager.undoStack[2].invalid).toBe(true);
        });

        it('should also invalidate entries in redoStack', () => {
            undoManager.redoStack = [
                { id: 'e1', blockId: 'block-1' }
            ];

            undoManager.invalidateEntriesForBlock('block-1');

            expect(undoManager.redoStack[0].invalid).toBe(true);
        });

        it('should invalidate entries for deleteTree containing the block', () => {
            undoManager.undoStack = [{
                id: 'e1',
                type: 'deleteTree',
                blockId: 'root',
                changes: {
                    before: {
                        'root': {},
                        'child-1': {},
                        'child-2': {}
                    }
                }
            }];

            undoManager.invalidateEntriesForBlock('child-1');

            expect(undoManager.undoStack[0].invalid).toBe(true);
        });
    });

    describe('clear', () => {
        it('should clear both stacks', () => {
            jest.useFakeTimers();
            undoManager.undoStack = [{ id: 'e1' }];
            undoManager.redoStack = [{ id: 'e2' }];

            undoManager.clear();

            expect(undoManager.undoStack).toHaveLength(0);
            expect(undoManager.redoStack).toHaveLength(0);

            // Run debounce timer
            jest.advanceTimersByTime(300);
            expect(localforage.setItem).toHaveBeenCalled();
            jest.useRealTimers();
        });
    });

    describe('canUndo / canRedo', () => {
        it('should return true when there are valid entries', () => {
            undoManager.undoStack = [{ id: 'e1' }];
            undoManager.redoStack = [{ id: 'e2' }];

            expect(undoManager.canUndo()).toBe(true);
            expect(undoManager.canRedo()).toBe(true);
        });

        it('should return false when all entries are invalid', () => {
            undoManager.undoStack = [{ id: 'e1', invalid: true }];
            undoManager.redoStack = [{ id: 'e2', invalid: true }];

            expect(undoManager.canUndo()).toBe(false);
            expect(undoManager.canRedo()).toBe(false);
        });
    });

    describe('MAX_STACK_SIZE', () => {
        it('should limit stack size to 100', () => {
            for (let i = 0; i < 110; i++) {
                undoManager.recordEdit(`block-${i}`, { title: 'a' }, { title: 'b' });
            }

            expect(undoManager.undoStack.length).toBeLessThanOrEqual(100);
        });
    });

    describe('persistence', () => {
        it('should save to storage on push with debounce', () => {
            jest.useFakeTimers();
            undoManager.recordEdit('block-1', {}, {});

            // saveToStorage should schedule with debounce
            expect(undoManager._saveTimeout).not.toBeNull();

            // Run debounce timer
            jest.advanceTimersByTime(300);

            expect(localforage.setItem).toHaveBeenCalledWith('undoStack', {
                undoStack: expect.any(Array)
            });
            jest.useRealTimers();
        });
    });

    describe('destroy', () => {
        it('should remove event listeners and clear timeout', async () => {
            await undoManager.init();
            undoManager._saveTimeout = setTimeout(() => {}, 1000);

            undoManager.destroy();

            expect(undoManager.isInitialized).toBe(false);
            expect(undoManager._saveTimeout).toBeNull();
        });
    });

    describe('removeLastEntryForBlock', () => {
        it('should remove last entry for specified block', () => {
            undoManager.undoStack = [
                { id: 'e1', blockId: 'block-1' },
                { id: 'e2', blockId: 'block-2' },
                { id: 'e3', blockId: 'block-1' }
            ];

            const result = undoManager.removeLastEntryForBlock('block-1');

            expect(result).toBe(true);
            expect(undoManager.undoStack).toHaveLength(2);
            // Should remove last block-1 entry (e3), not first one (e1)
            expect(undoManager.undoStack[0].id).toBe('e1');
            expect(undoManager.undoStack[1].id).toBe('e2');
        });

        it('should return false when no entry found', () => {
            undoManager.undoStack = [{ id: 'e1', blockId: 'block-1' }];

            const result = undoManager.removeLastEntryForBlock('block-999');

            expect(result).toBe(false);
            expect(undoManager.undoStack).toHaveLength(1);
        });
    });

    describe('sortBlocksByHierarchy', () => {
        it('should return blocks in BFS order (parent before children)', () => {
            const subtreeData = {
                'root': { id: 'root', children: ['child-1', 'child-2'] },
                'child-1': { id: 'child-1', children: ['grandchild-1'] },
                'child-2': { id: 'child-2', children: [] },
                'grandchild-1': { id: 'grandchild-1', children: [] }
            };

            const result = undoManager.sortBlocksByHierarchy(subtreeData, 'root');

            expect(result).toHaveLength(4);
            expect(result[0].id).toBe('root');
            // Children should come after parent
            const rootIdx = result.findIndex(b => b.id === 'root');
            const child1Idx = result.findIndex(b => b.id === 'child-1');
            const grandchild1Idx = result.findIndex(b => b.id === 'grandchild-1');

            expect(rootIdx).toBeLessThan(child1Idx);
            expect(child1Idx).toBeLessThan(grandchild1Idx);
        });

        it('should include orphan blocks at the end', () => {
            const subtreeData = {
                'root': { id: 'root', children: ['child-1'] },
                'child-1': { id: 'child-1', children: [] },
                'orphan': { id: 'orphan', children: [] } // Not linked via children
            };

            const result = undoManager.sortBlocksByHierarchy(subtreeData, 'root');

            expect(result).toHaveLength(3);
            expect(result[2].id).toBe('orphan');
        });
    });
});

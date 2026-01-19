/**
 * Tests for GraphPatchApplier
 */

// Mock dispatch
jest.mock('../../utils/utils', () => ({
    dispatch: jest.fn()
}));

import { GraphPatchApplier } from '../../services/graphPatchApplier';
import { CONNECTION_TYPES } from '../../controller/connectionTypes';
import { dispatch } from '../../utils/utils';

describe('GraphPatchApplier', () => {
    let applier;
    let mockBlocks;
    let mockStateManager;
    let mockUndoManager;
    let reverseMap;

    // Helper to create mock blocks
    const createBlock = (id, parentId, title, options = {}) => ({
        id,
        parent_id: parentId,
        title,
        children: JSON.stringify(options.children || []),
        updated_at: Date.now(),
        data: {
            text: options.text || '',
            type: options.type || 'entity',
            childOrder: options.childOrder || [],
            connections: options.connections || [],
            color: [210, 80, 70, 0]
        }
    });

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock blocks
        mockBlocks = new Map([
            ['uuid-1', createBlock('uuid-1', null, 'Root', {
                childOrder: ['uuid-2', 'uuid-3'],
                type: 'group'
            })],
            ['uuid-2', createBlock('uuid-2', 'uuid-1', 'Child 1', {
                childOrder: ['uuid-4'],
                type: 'system'
            })],
            ['uuid-3', createBlock('uuid-3', 'uuid-1', 'Child 2', {
                type: 'component'
            })],
            ['uuid-4', createBlock('uuid-4', 'uuid-2', 'Grandchild', {
                type: 'task',
                connections: [{
                    id: 'conn-1',
                    sourceId: 'uuid-4',
                    targetId: 'uuid-3',
                    type: CONNECTION_TYPES.DEFAULT
                }]
            })]
        ]);

        // Create mock stateManager
        mockStateManager = {
            blocks: mockBlocks,
            saveBlock: jest.fn(async (block) => {
                mockBlocks.set(block.id, { ...block });
            })
        };

        // Create mock undoManager
        mockUndoManager = {
            recordEdit: jest.fn(),
            recordCreate: jest.fn(),
            recordDelete: jest.fn(),
            recordMove: jest.fn()
        };

        // Create reverse map (snapshot id -> uuid)
        reverseMap = {
            1: 'uuid-1',
            2: 'uuid-2',
            3: 'uuid-3',
            4: 'uuid-4'
        };

        applier = new GraphPatchApplier(mockStateManager, mockUndoManager);
    });

    describe('validatePatch', () => {
        it('should validate correct patch', () => {
            const patch = {
                v: 2,
                edit: [{ id: 1, title: 'New Title' }]
            };

            const result = applier.validatePatch(patch, reverseMap);

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should warn on version mismatch', () => {
            const patch = { v: 1 };

            const result = applier.validatePatch(patch, reverseMap);

            expect(result.valid).toBe(true);
            expect(result.warnings).toContainEqual(expect.stringContaining('version mismatch'));
        });

        it('should error on unknown edit block', () => {
            const patch = {
                v: 2,
                edit: [{ id: 99, title: 'Test' }]
            };

            const result = applier.validatePatch(patch, reverseMap);

            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(expect.stringContaining('unknown block 99'));
        });

        it('should error on unknown move parent', () => {
            const patch = {
                v: 2,
                move: [{ id: 2, parent: 99, pos: 0 }]
            };

            const result = applier.validatePatch(patch, reverseMap);

            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(expect.stringContaining('unknown parent 99'));
        });

        it('should error on self-parent move', () => {
            const patch = {
                v: 2,
                move: [{ id: 2, parent: 2, pos: 0 }]
            };

            const result = applier.validatePatch(patch, reverseMap);

            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(expect.stringContaining('cannot be its own parent'));
        });

        it('should validate create with consecutive IDs', () => {
            const patch = {
                v: 2,
                create: [
                    { id: 5, parent: 1, title: 'New 1' },
                    { id: 6, parent: 1, title: 'New 2' }
                ]
            };

            const result = applier.validatePatch(patch, reverseMap);

            expect(result.valid).toBe(true);
        });

        it('should error on non-consecutive create IDs', () => {
            const patch = {
                v: 2,
                create: [
                    { id: 5, parent: 1, title: 'New 1' },
                    { id: 7, parent: 1, title: 'New 2' } // Should be 6
                ]
            };

            const result = applier.validatePatch(patch, reverseMap);

            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(expect.stringContaining('consecutive'));
        });

        it('should allow create to reference earlier create as parent', () => {
            const patch = {
                v: 2,
                create: [
                    { id: 5, parent: 1, title: 'Parent' },
                    { id: 6, parent: 5, title: 'Child of new' }
                ]
            };

            const result = applier.validatePatch(patch, reverseMap);

            expect(result.valid).toBe(true);
        });

        it('should error on unknown link source', () => {
            const patch = {
                v: 2,
                link_add: [[99, 1, 'default']]
            };

            const result = applier.validatePatch(patch, reverseMap);

            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(expect.stringContaining('unknown source 99'));
        });
    });

    describe('previewChanges', () => {
        it('should generate preview for create', () => {
            const patch = {
                v: 2,
                create: [{ id: 5, parent: 1, title: 'New Block', type: 'task' }]
            };

            const changes = applier.previewChanges(patch, reverseMap);

            expect(changes).toHaveLength(1);
            expect(changes[0].type).toBe('create');
            expect(changes[0].icon).toBe('➕');
            expect(changes[0].description).toContain('New Block');
        });

        it('should generate preview for edit', () => {
            const patch = {
                v: 2,
                edit: [{ id: 2, title: 'Updated', text: 'New text' }]
            };

            const changes = applier.previewChanges(patch, reverseMap);

            expect(changes).toHaveLength(1);
            expect(changes[0].type).toBe('edit');
            expect(changes[0].description).toContain('название');
            expect(changes[0].description).toContain('текст');
        });

        it('should generate preview for move', () => {
            const patch = {
                v: 2,
                move: [{ id: 4, parent: 3, pos: 0 }]
            };

            const changes = applier.previewChanges(patch, reverseMap);

            expect(changes).toHaveLength(1);
            expect(changes[0].type).toBe('move');
            expect(changes[0].description).toContain('Переместить');
        });

        it('should generate preview for link operations', () => {
            const patch = {
                v: 2,
                link_add: [[1, 2, 'dependency']],
                link_del: [[4, 3]]
            };

            const changes = applier.previewChanges(patch, reverseMap);

            expect(changes).toHaveLength(2);
            expect(changes.find(c => c.type === 'link_add')).toBeDefined();
            expect(changes.find(c => c.type === 'link_del')).toBeDefined();
        });
    });

    describe('applyPatch', () => {
        it('should create new blocks', async () => {
            const patch = {
                v: 2,
                create: [{ id: 5, parent: 1, title: 'New Block', type: 'task', text: 'Content' }]
            };

            const result = await applier.applyPatch(patch, reverseMap);

            expect(result.success).toBe(true);
            expect(result.createdIds['5']).toBeDefined();

            // Check block was saved
            expect(mockStateManager.saveBlock).toHaveBeenCalled();

            // Check parent childOrder was updated
            const root = mockBlocks.get('uuid-1');
            expect(root.data.childOrder).toContain(result.createdIds['5']);
        });

        it('should edit existing blocks', async () => {
            const patch = {
                v: 2,
                edit: [{ id: 2, title: 'Updated Title', text: 'New text', type: 'component' }]
            };

            await applier.applyPatch(patch, reverseMap);

            const block = mockBlocks.get('uuid-2');
            expect(block.title).toBe('Updated Title');
            expect(block.data.text).toContain('New text');
            expect(block.data.type).toBe('component');
        });

        it('should move blocks', async () => {
            const patch = {
                v: 2,
                move: [{ id: 4, parent: 3, pos: 0 }]
            };

            await applier.applyPatch(patch, reverseMap);

            // Check block parent updated
            const block = mockBlocks.get('uuid-4');
            expect(block.parent_id).toBe('uuid-3');

            // Check old parent childOrder
            const oldParent = mockBlocks.get('uuid-2');
            expect(oldParent.data.childOrder).not.toContain('uuid-4');

            // Check new parent childOrder
            const newParent = mockBlocks.get('uuid-3');
            expect(newParent.data.childOrder).toContain('uuid-4');
        });

        it('should add connections', async () => {
            const patch = {
                v: 2,
                link_add: [[1, 2, 'dependency']]
            };

            await applier.applyPatch(patch, reverseMap);

            const block = mockBlocks.get('uuid-1');
            expect(block.data.connections).toHaveLength(1);
            expect(block.data.connections[0].sourceId).toBe('uuid-1');
            expect(block.data.connections[0].targetId).toBe('uuid-2');
            expect(block.data.connections[0].type).toBe('dependency');
        });

        it('should delete connections', async () => {
            const patch = {
                v: 2,
                link_del: [[4, 3]]
            };

            await applier.applyPatch(patch, reverseMap);

            const block = mockBlocks.get('uuid-4');
            expect(block.data.connections).toHaveLength(0);
        });

        it('should not add duplicate connections', async () => {
            // First add
            await applier.applyPatch({
                v: 2,
                link_add: [[1, 2, 'default']]
            }, reverseMap);

            // Try to add same connection again
            await applier.applyPatch({
                v: 2,
                link_add: [[1, 2, 'default']]
            }, reverseMap);

            const block = mockBlocks.get('uuid-1');
            expect(block.data.connections).toHaveLength(1);
        });

        it('should handle create with position', async () => {
            const patch = {
                v: 2,
                create: [{ id: 5, parent: 1, pos: 0, title: 'First' }]
            };

            const result = await applier.applyPatch(patch, reverseMap);

            expect(result.success).toBe(true);
            const root = mockBlocks.get('uuid-1');
            // The new block should be at position 0
            expect(root.data.childOrder[0]).toBe(result.createdIds['5']);
        });

        it('should handle errors gracefully', async () => {
            mockStateManager.saveBlock = jest.fn().mockRejectedValue(new Error('Save failed'));

            const patch = {
                v: 2,
                edit: [{ id: 1, title: 'Test' }]
            };

            const result = await applier.applyPatch(patch, reverseMap);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Save failed');
        });
    });

    describe('applyPatchWithUndo', () => {
        it('should record edit in undoManager', async () => {
            const patch = {
                v: 2,
                edit: [{ id: 2, title: 'Updated' }]
            };

            await applier.applyPatchWithUndo(patch, reverseMap);

            expect(mockUndoManager.recordEdit).toHaveBeenCalled();
        });

        it('should record create in undoManager', async () => {
            const patch = {
                v: 2,
                create: [{ id: 5, parent: 1, title: 'New' }]
            };

            await applier.applyPatchWithUndo(patch, reverseMap);

            expect(mockUndoManager.recordCreate).toHaveBeenCalled();
        });

        it('should dispatch ShowBlocks on success', async () => {
            const patch = {
                v: 2,
                edit: [{ id: 1, title: 'Test' }]
            };

            await applier.applyPatchWithUndo(patch, reverseMap);

            expect(dispatch).toHaveBeenCalledWith('ShowBlocks');
        });
    });

    describe('utility methods', () => {
        it('should convert text to HTML', () => {
            const text = 'Line 1\nLine 2\n<script>';
            const html = applier._textToHtml(text);

            expect(html).toBe('Line 1<br>Line 2<br>&lt;script&gt;');
        });

        it('should get block title', () => {
            expect(applier._getBlockTitle('uuid-1')).toBe('Root');
            expect(applier._getBlockTitle('uuid-999')).toBe('');
            expect(applier._getBlockTitle(null)).toBe('');
        });

        it('should get patch stats', () => {
            const patch = {
                v: 2,
                create: [{ id: 5 }],
                edit: [{ id: 1 }, { id: 2 }],
                move: [{ id: 3 }],
                link_add: [[1, 2], [2, 3]],
                link_del: [[4, 5]]
            };

            const stats = applier.getPatchStats(patch);

            expect(stats.creates).toBe(1);
            expect(stats.edits).toBe(2);
            expect(stats.moves).toBe(1);
            expect(stats.linksAdded).toBe(2);
            expect(stats.linksDeleted).toBe(1);
        });

        it('should create valid connection object', () => {
            const conn = applier._createConnection('src', 'tgt', 'dependency');

            expect(conn.id).toBeDefined();
            expect(conn.sourceId).toBe('src');
            expect(conn.targetId).toBe('tgt');
            expect(conn.type).toBe('dependency');
        });

        it('should use default connection type for invalid type', () => {
            const conn = applier._createConnection('src', 'tgt', 'invalid-type');

            expect(conn.type).toBe(CONNECTION_TYPES.DEFAULT);
        });
    });
});

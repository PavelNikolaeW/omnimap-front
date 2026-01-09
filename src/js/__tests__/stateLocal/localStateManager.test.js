import localforage from 'localforage';

// Mock api module - must be before imports that use it
jest.mock('../../api/api', () => ({
    __esModule: true,
    default: {
        getTreeBlocks: jest.fn(),
        createBlock: jest.fn(),
        updateBlock: jest.fn(),
        removeTree: jest.fn(),
        moveBlock: jest.fn(),
        pasteBlock: jest.fn(),
        pasteLinkBlock: jest.fn(),
        loadEmpty: jest.fn(),
        createTree: jest.fn(),
        createUrlLink: jest.fn(),
        loadBlockUrl: jest.fn()
    }
}));

import { LocalStateManager } from '../../stateLocal/localStateManager';
import api from '../../api/api';

// BlockRepository is not exported, but we can test it through LocalStateManager
describe('LocalStateManager', () => {
    let manager;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Setup default mock implementations
        localforage.getItem.mockResolvedValue(null);
        localforage.setItem.mockResolvedValue(undefined);
        localforage.removeItem.mockResolvedValue(undefined);
        localforage.keys.mockResolvedValue([]);

        // Create fresh instance
        manager = new LocalStateManager();
        manager.currentUser = 'testUser';
        manager.currentTree = 'tree-1';
        manager.blockRepository = {
            saveBlock: jest.fn().mockResolvedValue(undefined),
            loadBlock: jest.fn().mockResolvedValue(null),
            deleteBlock: jest.fn().mockResolvedValue(undefined),
            getKey: jest.fn((id) => `Block_${id}_testUser`)
        };
        // Mock showBlocks to prevent side effects
        manager.showBlocks = jest.fn().mockResolvedValue(undefined);
        // Mock painter
        manager.painter = { render: jest.fn() };
    });

    describe('saveBlock', () => {
        test('saves block to map and repository', async () => {
            const block = {
                id: 'block-1',
                title: 'Test Block',
                data: {},
                children: []
            };

            await manager.saveBlock(block);

            expect(manager.blocks.get('block-1')).toEqual(block);
            expect(manager.blockRepository.saveBlock).toHaveBeenCalledWith(block);
        });

        test('logs error for undefined block', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            await manager.saveBlock(undefined);

            expect(consoleSpy).toHaveBeenCalledWith('Save block undefined');
            consoleSpy.mockRestore();
        });

        test('logs error for null block', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            await manager.saveBlock(null);

            expect(consoleSpy).toHaveBeenCalledWith('Save block undefined');
            consoleSpy.mockRestore();
        });
    });

    describe('removeOneBlock', () => {
        test('removes block from map and repository', async () => {
            const block = {
                id: 'block-1',
                parent_id: null,
                children: []
            };
            manager.blocks.set('block-1', block);
            localforage.getItem.mockResolvedValue([]);

            await manager.removeOneBlock('block-1');

            expect(manager.blocks.has('block-1')).toBe(false);
            expect(manager.blockRepository.deleteBlock).toHaveBeenCalledWith('block-1');
        });

        test('updates parent children array when block has parent', async () => {
            const parentBlock = {
                id: 'parent-1',
                children: ['block-1', 'block-2'],
                data: { childOrder: ['block-1', 'block-2'] }
            };
            const childBlock = {
                id: 'block-1',
                parent_id: 'parent-1',
                children: []
            };

            manager.blocks.set('parent-1', parentBlock);
            manager.blocks.set('block-1', childBlock);
            localforage.getItem.mockResolvedValue([]);

            await manager.removeOneBlock('block-1');

            expect(parentBlock.children).toEqual(['block-2']);
            expect(parentBlock.data.childOrder).toEqual(['block-2']);
        });

        test('silently handles non-existent block (still attempts IndexedDB cleanup)', async () => {
            // removeOneBlock теперь не логирует предупреждение для несуществующего блока,
            // а просто пытается удалить из IndexedDB (полезно для синхронизации)
            await expect(manager.removeOneBlock('non-existent')).resolves.not.toThrow();
        });
    });

    describe('getAllChildIds', () => {
        test('returns only root id for block without children', () => {
            const block = { id: 'block-1', children: [] };
            manager.blocks.set('block-1', block);

            const result = manager.getAllChildIds(block);

            expect(result).toEqual(['block-1']);
        });

        test('returns all descendant ids', () => {
            const root = { id: 'root', children: ['child-1', 'child-2'] };
            const child1 = { id: 'child-1', children: ['grandchild-1'] };
            const child2 = { id: 'child-2', children: [] };
            const grandchild = { id: 'grandchild-1', children: [] };

            manager.blocks.set('root', root);
            manager.blocks.set('child-1', child1);
            manager.blocks.set('child-2', child2);
            manager.blocks.set('grandchild-1', grandchild);

            const result = manager.getAllChildIds(root);

            expect(result).toContain('root');
            expect(result).toContain('child-1');
            expect(result).toContain('child-2');
            expect(result).toContain('grandchild-1');
            expect(result.length).toBe(4);
        });
    });

    describe('removeBranch', () => {
        test('removes all children recursively', () => {
            const root = { id: 'root', children: ['child-1'] };
            const child = { id: 'child-1', children: ['grandchild-1'] };
            const grandchild = { id: 'grandchild-1', children: [] };

            manager.blocks.set('root', root);
            manager.blocks.set('child-1', child);
            manager.blocks.set('grandchild-1', grandchild);

            manager.removeBranch(root);

            expect(manager.blocks.has('child-1')).toBe(false);
            expect(manager.blocks.has('grandchild-1')).toBe(false);
            // root itself is not removed by removeBranch
            expect(manager.blocks.has('root')).toBe(true);
        });

        test('handles block without children array', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const block = { id: 'block-1' }; // no children property

            manager.removeBranch(block);

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        test('handles null block', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            manager.removeBranch(null);

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('initUser', () => {
        test('initializes user state correctly', async () => {
            const treeIds = ['tree-1', 'tree-2'];
            const blocksMap = new Map([
                ['tree-1', { id: 'tree-1', title: 'Tree 1', data: {}, children: [] }],
                ['tree-2', { id: 'tree-2', title: 'Tree 2', data: {}, children: [] }]
            ]);

            await manager.initUser({ treeIds, blocks: blocksMap }, 'newUser');

            expect(manager.currentUser).toBe('newUser');
            expect(manager.currentTree).toBe('tree-1');
            expect(localforage.setItem).toHaveBeenCalledWith('currentUser', 'newUser');
            expect(localforage.setItem).toHaveBeenCalledWith('currentTree', 'tree-1');
        });
    });

    describe('moveBlock', () => {
        test('does not move block to itself', async () => {
            await manager.moveBlock({
                block_id: 'block-1',
                old_parent_id: 'parent-1',
                new_parent_id: 'block-1',
                before: null
            });

            expect(api.moveBlock).not.toHaveBeenCalled();
        });

        test('calls api.moveBlock with correct parameters', async () => {
            // Setup blocks for Optimistic UI
            const block = {
                id: 'block-1',
                parent_id: 'old-parent',
                data: {},
                children: []
            };
            const oldParentBlock = {
                id: 'old-parent',
                data: { childOrder: ['block-1'] },
                children: ['block-1']
            };
            const newParentBlock = {
                id: 'new-parent',
                data: { childOrder: ['existing-1'] },
                children: ['existing-1']
            };
            manager.blocks.set('block-1', block);
            manager.blocks.set('old-parent', oldParentBlock);
            manager.blocks.set('new-parent', newParentBlock);

            api.moveBlock.mockResolvedValue({ status: 200, data: {} });

            await manager.moveBlock({
                block_id: 'block-1',
                old_parent_id: 'old-parent',
                new_parent_id: 'new-parent',
                before: 'existing-1'
            });

            expect(api.moveBlock).toHaveBeenCalledWith(
                'block-1',
                expect.objectContaining({
                    new_parent_id: 'new-parent',
                    old_parent_id: 'old-parent'
                })
            );
        });
    });

    describe('webSocUpdateBlock', () => {
        test('handles empty array', () => {
            manager.webSocUpdateBlock([]);
            // Should not throw
        });

        test('saves non-deleted blocks', () => {
            const saveBlockSpy = jest.spyOn(manager, 'saveBlock');
            const blocks = [{
                id: 'block-1',
                title: 'Test',
                updated_at: Date.now() / 1000,
                data: '{}',
                children: '[]',
                parent_id: 'parent-1'
            }];

            manager.webSocUpdateBlock(blocks);

            expect(saveBlockSpy).toHaveBeenCalled();
        });
    });

    describe('updateScreen', () => {
        test('does not call showBlocks when block element not in DOM', () => {
            const showBlocksSpy = jest.spyOn(manager, 'showBlocks');
            const blocks = [{ id: 'non-existent-block' }];

            manager.updateScreen(blocks);

            expect(showBlocksSpy).not.toHaveBeenCalled();
        });

        test('calls showBlocks when block element exists in DOM', () => {
            const showBlocksSpy = jest.spyOn(manager, 'showBlocks').mockImplementation();
            const el = document.createElement('div');
            el.id = 'existing-block';
            document.body.appendChild(el);

            manager.updateScreen([{ id: 'existing-block' }]);

            expect(showBlocksSpy).toHaveBeenCalled();
            document.body.removeChild(el);
        });
    });

    describe('createBlock', () => {
        test('creates block locally with real UUID and queues for sync', async () => {
            // Setup parent block for Optimistic UI
            const parentBlock = {
                id: 'parent-1',
                title: 'Parent',
                children: [],
                data: {}
            };
            manager.blocks.set('parent-1', parentBlock);

            await manager.createBlock({ parentId: 'parent-1', title: 'New Block' });

            // Block is created locally with real UUID (not temp_xxx)
            expect(manager.blockRepository.saveBlock).toHaveBeenCalled();

            // Parent block should have the new child
            const updatedParent = manager.blocks.get('parent-1');
            expect(updatedParent.children.length).toBe(1);
            expect(updatedParent.data.childOrder.length).toBe(1);

            // New block should be in blocks map
            const newBlockId = updatedParent.children[0];
            expect(manager.blocks.has(newBlockId)).toBe(true);

            // Block ID should be real UUID (not temp_xxx)
            expect(newBlockId).not.toMatch(/^temp_/);
        });

        test('creates block locally when parent not found', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            await manager.createBlock({ parentId: 'non-existent', title: 'New Block' });

            expect(consoleSpy).toHaveBeenCalledWith('Parent block not found:', 'non-existent');
            consoleSpy.mockRestore();
        });

        test('syncs childOrder with children on block creation', async () => {
            // Setup parent block
            const parentBlock = {
                id: 'parent-1',
                title: 'Parent',
                children: [],
                data: {}
            };
            manager.blocks.set('parent-1', parentBlock);

            await manager.createBlock({ parentId: 'parent-1', title: 'New Block' });

            const updatedParent = manager.blocks.get('parent-1');
            // children and childOrder should be in sync
            expect(updatedParent.children).toEqual(updatedParent.data.childOrder);
        });
    });
});

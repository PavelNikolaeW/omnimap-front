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

// Mock offlineQueue for moveBlock tests
jest.mock('../../sincManager/offlineQueue', () => {
    let mockIdCounter = 0;
    return {
        offlineQueue: {
            enqueue: jest.fn().mockResolvedValue(undefined),
            isNetworkOnline: jest.fn().mockReturnValue(true),
            markPullCompleted: jest.fn(),
            generateBlockId: jest.fn().mockImplementation(() => `test-block-${++mockIdCounter}`),
            registerPendingBlock: jest.fn().mockReturnValue({ resolve: jest.fn(), reject: jest.fn() }),
            resolvePendingBlock: jest.fn(),
            isPendingBlock: jest.fn().mockReturnValue(false)
        }
    };
});

import { LocalStateManager } from '../../stateLocal/localStateManager';
import api from '../../api/api';
import { offlineQueue } from '../../sincManager/offlineQueue';

// BlockRepository is not exported, but we can test it through LocalStateManager
describe('LocalStateManager', () => {
    let manager;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Re-setup offlineQueue mocks (clearAllMocks clears implementations)
        let idCounter = 0;
        offlineQueue.generateBlockId.mockImplementation(() => `test-block-${++idCounter}`);
        offlineQueue.enqueue.mockResolvedValue(undefined);
        offlineQueue.registerPendingBlock.mockReturnValue({ resolve: jest.fn(), reject: jest.fn() });

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

            // Should not queue anything when moving to self
            expect(offlineQueue.enqueue).not.toHaveBeenCalled();
        });

        test('queues moveBlock via offlineQueue with correct parameters', async () => {
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

            await manager.moveBlock({
                block_id: 'block-1',
                old_parent_id: 'old-parent',
                new_parent_id: 'new-parent',
                before: 'existing-1'
            });

            // moveBlock now uses offlineQueue.enqueue with batch import
            expect(offlineQueue.enqueue).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'moveBlock',
                    data: expect.objectContaining({
                        blockId: 'block-1',
                        oldParentId: 'old-parent',
                        newParentId: 'new-parent'
                    })
                }),
                { immediate: true }
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

    describe('WebSocUpdateBlockAccess', () => {
        test('logs warning for invalid message', async () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            await manager.WebSocUpdateBlockAccess({});
            await manager.WebSocUpdateBlockAccess({ start_block_ids: 'not-array' });

            expect(consoleSpy).toHaveBeenCalledWith('LocalStateManager: invalid WebSocUpdateBlockAccess message');
            consoleSpy.mockRestore();
        });

        test('replaces root with forbidden block and removes children when permission is deny', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            // Setup blocks
            const block1 = { id: 'block-1', children: ['child-1'] };
            const child1 = { id: 'child-1', children: [] };
            const block2 = { id: 'block-2', children: [] };

            manager.blocks.set('block-1', block1);
            manager.blocks.set('child-1', child1);
            manager.blocks.set('block-2', block2);
            // Mock treeIds in localforage
            localforage.getItem.mockImplementation((key) => {
                if (key === 'treeIdstestUser') return Promise.resolve(['block-1', 'block-2']);
                return Promise.resolve(null);
            });
            manager.path = [{ blockId: 'block-2', screenName: 'Block 2' }];

            await manager.WebSocUpdateBlockAccess({
                permission: 'deny',
                start_block_ids: [{
                    id: 'block-1',
                    title: 'block 403 forbidden',
                    updated_at: 946684801,
                    data: '{"color": [0, 100, 100, 0]}',
                    children: '[]'
                }],
                block_uuids: ['block-1', 'child-1']
            });

            // Root block should be replaced with forbidden version
            expect(manager.blocks.has('block-1')).toBe(true);
            const forbiddenBlock = manager.blocks.get('block-1');
            expect(forbiddenBlock.title).toBe('block 403 forbidden');
            expect(forbiddenBlock.forbidden).toBe(true);
            expect(forbiddenBlock.children).toEqual([]);

            // Child should be removed
            expect(manager.blocks.has('child-1')).toBe(false);

            // Other blocks should be intact
            expect(manager.blocks.has('block-2')).toBe(true);

            // showBlocks should be called
            expect(manager.showBlocks).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });

        test('navigates away when current block (child) access is revoked', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            // Setup: user is on child-1, access revoked for child-1 but not root
            const root = { id: 'root', title: 'Root', children: ['child-1'], data: {} };
            const child1 = { id: 'child-1', title: 'Child 1', children: [], data: {} };

            manager.blocks.set('root', root);
            manager.blocks.set('child-1', child1);
            manager.currentTree = 'root';
            // Mock treeIds in localforage
            localforage.getItem.mockImplementation((key) => {
                if (key === 'treeIdstestUser') return Promise.resolve(['root']);
                return Promise.resolve(null);
            });
            manager.path = [
                { blockId: 'root', screenName: 'Root' },
                { blockId: 'child-1', screenName: 'Child 1' }
            ];

            await manager.WebSocUpdateBlockAccess({
                permission: 'deny',
                start_block_ids: [{
                    id: 'root',
                    title: 'block 403 forbidden',
                    updated_at: 946684801,
                    data: '{}',
                    children: '[]'
                }],
                block_uuids: ['root', 'child-1']
            });

            // child-1 is removed, user should navigate to root (which is now forbidden)
            expect(manager.blocks.has('child-1')).toBe(false);
            expect(manager.path.length).toBe(1);
            expect(manager.path[0].blockId).toBe('root');

            consoleSpy.mockRestore();
        });

        test('stays on forbidden block when it is the current screen', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            // Setup: user is on block-1, which becomes forbidden
            const block1 = { id: 'block-1', title: 'Block 1', children: ['child-1'], data: {} };
            const child1 = { id: 'child-1', title: 'Child 1', children: [], data: {} };

            manager.blocks.set('block-1', block1);
            manager.blocks.set('child-1', child1);
            manager.currentTree = 'block-1';
            // Mock treeIds in localforage
            localforage.getItem.mockImplementation((key) => {
                if (key === 'treeIdstestUser') return Promise.resolve(['block-1']);
                return Promise.resolve(null);
            });
            manager.path = [{ blockId: 'block-1', screenName: 'Block 1' }];

            await manager.WebSocUpdateBlockAccess({
                permission: 'deny',
                start_block_ids: [{
                    id: 'block-1',
                    title: 'block 403 forbidden',
                    updated_at: 946684801,
                    data: '{}',
                    children: '[]'
                }],
                block_uuids: ['block-1', 'child-1']
            });

            // User should stay on block-1, but it's now forbidden
            expect(manager.path.length).toBe(1);
            expect(manager.path[0].blockId).toBe('block-1');
            expect(manager.blocks.get('block-1').forbidden).toBe(true);

            // Child should be removed
            expect(manager.blocks.has('child-1')).toBe(false);

            consoleSpy.mockRestore();
        });

        test('adds blocks when permission is grant', async () => {
            const message = {
                permission: 'grant',
                start_block_ids: [{
                    id: 'new-block',
                    title: 'New Block',
                    updated_at: 1704067200, // 2024-01-01T00:00:00
                    data: '{"color": [255, 0, 0, 1]}',
                    children: '[]'
                }],
                block_uuids: ['new-block']
            };

            // Mock updateScreen
            manager.updateScreen = jest.fn();

            await manager.WebSocUpdateBlockAccess(message);

            // Block should be saved
            expect(manager.blocks.has('new-block')).toBe(true);
            const savedBlock = manager.blocks.get('new-block');
            expect(savedBlock.title).toBe('New Block');
            expect(savedBlock.data.color).toEqual([255, 0, 0, 1]);

            // updateScreen should be called
            expect(manager.updateScreen).toHaveBeenCalledWith([expect.objectContaining({ id: 'new-block' })]);
        });

        test('grant removes forbidden flag from previously denied block', async () => {
            // Setup: block was previously forbidden
            const forbiddenBlock = {
                id: 'restored-block',
                title: 'block 403 forbidden',
                data: {},
                children: [],
                forbidden: true
            };
            manager.blocks.set('restored-block', forbiddenBlock);

            // Mock updateScreen
            manager.updateScreen = jest.fn();

            const message = {
                permission: 'grant',
                start_block_ids: [{
                    id: 'restored-block',
                    title: 'Restored Block',
                    updated_at: 1704067200,
                    data: '{"color": [0, 255, 0, 1]}',
                    children: '["child-1"]'
                }],
                block_uuids: ['restored-block']
            };

            await manager.WebSocUpdateBlockAccess(message);

            // Block should be updated with new data
            const restoredBlock = manager.blocks.get('restored-block');
            expect(restoredBlock.title).toBe('Restored Block');
            expect(restoredBlock.forbidden).toBe(false);
            expect(restoredBlock.children).toEqual(['child-1']);

            // deleteBlock should be called to remove old forbidden entry
            expect(manager.blockRepository.deleteBlock).toHaveBeenCalledWith('restored-block');

            // updateScreen should be called
            expect(manager.updateScreen).toHaveBeenCalled();
        });

        test('handles empty block_uuids gracefully on deny', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            manager.path = [{ blockId: 'some-block', screenName: 'Some' }];
            // Mock treeIds in localforage
            localforage.getItem.mockImplementation((key) => {
                if (key === 'treeIdstestUser') return Promise.resolve(['some-block']);
                return Promise.resolve(null);
            });

            await manager.WebSocUpdateBlockAccess({
                permission: 'deny',
                start_block_ids: [{
                    id: 'forbidden-block',
                    title: 'block 403 forbidden',
                    updated_at: 946684801,
                    data: '{}',
                    children: '[]'
                }],
                block_uuids: []
            });

            // Should not throw, showBlocks should be called
            expect(manager.showBlocks).toHaveBeenCalled();
            // Forbidden block should be saved
            expect(manager.blocks.get('forbidden-block').forbidden).toBe(true);

            consoleSpy.mockRestore();
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

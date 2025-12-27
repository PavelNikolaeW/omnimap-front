/**
 * Tests for TreeService
 */

// Store for mock data
let mockStorage = {};

// Mock localforage
jest.mock('localforage', () => ({
    getItem: jest.fn((key) => {
        // Access global mockStorage via closure
        const storage = require('./__mocks__/localforageStorage').storage;
        return Promise.resolve(storage[key]);
    }),
    setItem: jest.fn((key, value) => {
        const storage = require('./__mocks__/localforageStorage').storage;
        storage[key] = value;
        return Promise.resolve(value);
    }),
    removeItem: jest.fn((key) => {
        const storage = require('./__mocks__/localforageStorage').storage;
        delete storage[key];
        return Promise.resolve();
    })
}));

// Mock dispatch
jest.mock('../../utils/utils', () => ({
    dispatch: jest.fn()
}));

import localforage from 'localforage';
import { dispatch } from '../../utils/utils';

// Import after mocking
const { treeService } = require('../../services/treeService');

describe('TreeService', () => {
    beforeEach(() => {
        // Clear mocks
        jest.clearAllMocks();

        // Reset mock storage
        mockStorage = {};

        // Configure mock implementations using mockStorage directly
        localforage.getItem.mockImplementation((key) => Promise.resolve(mockStorage[key]));
        localforage.setItem.mockImplementation((key, value) => {
            mockStorage[key] = value;
            return Promise.resolve(value);
        });
        localforage.removeItem.mockImplementation((key) => {
            delete mockStorage[key];
            return Promise.resolve();
        });

        // Reset treeService internal state
        treeService._currentUser = null;
        treeService._treeIds = [];
        treeService._currentTree = null;
        treeService._initialized = false;
    });

    describe('initialize', () => {
        it('should load user and treeIds from localforage', async () => {
            mockStorage['currentUser'] = 'user1';
            mockStorage['treeIdsuser1'] = ['tree1', 'tree2'];
            mockStorage['currentTree'] = 'tree1';

            await treeService.initialize();

            expect(treeService.currentUser).toBe('user1');
            expect(treeService.treeIds).toEqual(['tree1', 'tree2']);
            expect(treeService.currentTree).toBe('tree1');
            expect(treeService.isInitialized).toBe(true);
        });

        it('should handle missing user', async () => {
            await treeService.initialize();

            // currentUser will be undefined when not set (localforage returns undefined for missing keys)
            expect(treeService.currentUser).toBeFalsy();
            expect(treeService.isInitialized).toBe(false);
        });
    });

    describe('getters', () => {
        beforeEach(async () => {
            mockStorage['currentUser'] = 'user1';
            mockStorage['treeIdsuser1'] = ['tree1', 'tree2', 'tree3'];
            mockStorage['currentTree'] = 'tree2';
            await treeService.initialize();
        });

        it('count should return number of trees', () => {
            expect(treeService.count).toBe(3);
        });

        it('treeIds should return copy of array', () => {
            const ids = treeService.treeIds;
            ids.push('modified');
            expect(treeService.treeIds).not.toContain('modified');
        });
    });

    describe('isRootTree', () => {
        beforeEach(async () => {
            mockStorage['currentUser'] = 'user1';
            mockStorage['treeIdsuser1'] = ['tree1', 'tree2'];
            await treeService.initialize();
        });

        it('should return true for root tree', () => {
            expect(treeService.isRootTree('tree1')).toBe(true);
        });

        it('should return false for non-root block', () => {
            expect(treeService.isRootTree('child-block')).toBe(false);
        });
    });

    describe('hasTree', () => {
        beforeEach(async () => {
            mockStorage['currentUser'] = 'user1';
            mockStorage['treeIdsuser1'] = ['tree1', 'tree2'];
            await treeService.initialize();
        });

        it('should return true if tree exists', () => {
            expect(treeService.hasTree('tree1')).toBe(true);
        });

        it('should return false if tree does not exist', () => {
            expect(treeService.hasTree('nonexistent')).toBe(false);
        });
    });

    describe('getTreeByIndex', () => {
        beforeEach(async () => {
            mockStorage['currentUser'] = 'user1';
            mockStorage['treeIdsuser1'] = ['tree1', 'tree2', 'tree3'];
            await treeService.initialize();
        });

        it('should return tree by 1-based index', () => {
            expect(treeService.getTreeByIndex(1)).toBe('tree1');
            expect(treeService.getTreeByIndex(2)).toBe('tree2');
            expect(treeService.getTreeByIndex(3)).toBe('tree3');
        });

        it('should return last tree for index 0', () => {
            expect(treeService.getTreeByIndex(0)).toBe('tree3');
        });

        it('should return null for out of range index', () => {
            expect(treeService.getTreeByIndex(10)).toBeNull();
        });

        it('should return null for empty treeIds', async () => {
            treeService._treeIds = [];
            expect(treeService.getTreeByIndex(1)).toBeNull();
        });
    });

    describe('switchTree', () => {
        beforeEach(async () => {
            mockStorage['currentUser'] = 'user1';
            mockStorage['treeIdsuser1'] = ['tree1', 'tree2'];
            mockStorage['currentTree'] = 'tree1';
            await treeService.initialize();
        });

        it('should switch to existing tree', async () => {
            const result = await treeService.switchTree('tree2');

            expect(result.success).toBe(true);
            expect(result.treeId).toBe('tree2');
            expect(treeService.currentTree).toBe('tree2');
            expect(localforage.setItem).toHaveBeenCalledWith('currentTree', 'tree2');
            expect(dispatch).toHaveBeenCalledWith('ShowBlocks');
        });

        it('should fail for non-existent tree', async () => {
            const result = await treeService.switchTree('nonexistent');

            expect(result.success).toBe(false);
            expect(result.error.message).toBe('Tree not found');
        });
    });

    describe('switchTreeByIndex', () => {
        beforeEach(async () => {
            mockStorage['currentUser'] = 'user1';
            mockStorage['treeIdsuser1'] = ['tree1', 'tree2', 'tree3'];
            await treeService.initialize();
        });

        it('should switch to tree by index', async () => {
            const result = await treeService.switchTreeByIndex(2);

            expect(result.success).toBe(true);
            expect(result.treeId).toBe('tree2');
        });

        it('should fail for out of range index', async () => {
            const result = await treeService.switchTreeByIndex(10);

            expect(result.success).toBe(false);
            expect(result.error.message).toBe('Tree index out of range');
        });
    });

    describe('addTree', () => {
        beforeEach(async () => {
            mockStorage['currentUser'] = 'user1';
            mockStorage['treeIdsuser1'] = ['tree1'];
            await treeService.initialize();
        });

        it('should add new tree', async () => {
            await treeService.addTree('tree2');

            expect(treeService.treeIds).toContain('tree2');
            expect(localforage.setItem).toHaveBeenCalledWith('treeIdsuser1', ['tree1', 'tree2']);
            expect(dispatch).toHaveBeenCalledWith('UpdateTreeNavigation');
        });

        it('should not add duplicate tree', async () => {
            await treeService.addTree('tree1');

            expect(treeService.treeIds).toEqual(['tree1']);
            expect(localforage.setItem).not.toHaveBeenCalled();
        });
    });

    describe('removeTree', () => {
        beforeEach(async () => {
            mockStorage['currentUser'] = 'user1';
            mockStorage['treeIdsuser1'] = ['tree1', 'tree2', 'tree3'];
            mockStorage['currentTree'] = 'tree1';
            await treeService.initialize();
        });

        it('should remove tree', async () => {
            const result = await treeService.removeTree('tree2');

            expect(result.success).toBe(true);
            expect(treeService.treeIds).not.toContain('tree2');
            expect(result.needSwitchTree).toBe(false);
        });

        it('should switch tree if current is removed', async () => {
            const result = await treeService.removeTree('tree1');

            expect(result.success).toBe(true);
            expect(result.needSwitchTree).toBe(true);
            expect(treeService.currentTree).toBe('tree2');
        });

        it('should fail to remove non-existent tree', async () => {
            const result = await treeService.removeTree('nonexistent');

            expect(result.success).toBe(false);
            expect(result.error.message).toBe('Tree not found');
        });

        it('should fail to remove last tree', async () => {
            treeService._treeIds = ['tree1'];
            const result = await treeService.removeTree('tree1');

            expect(result.success).toBe(false);
            expect(result.error.message).toBe('Cannot delete last tree');
        });
    });

    describe('removeMultipleTrees', () => {
        beforeEach(async () => {
            mockStorage['currentUser'] = 'user1';
            mockStorage['treeIdsuser1'] = ['tree1', 'tree2', 'tree3', 'tree4'];
            mockStorage['currentTree'] = 'tree1';
            await treeService.initialize();
        });

        it('should remove multiple trees', async () => {
            const result = await treeService.removeMultipleTrees(['tree2', 'tree3']);

            expect(result.success).toBe(true);
            expect(result.removedTrees).toEqual(['tree2', 'tree3']);
            expect(treeService.treeIds).toEqual(['tree1', 'tree4']);
        });

        it('should switch tree if current is among removed', async () => {
            const result = await treeService.removeMultipleTrees(['tree1', 'tree2']);

            expect(result.success).toBe(true);
            expect(result.needSwitchTree).toBe(true);
            expect(treeService.currentTree).toBe('tree3');
        });

        it('should not remove last tree even in batch', async () => {
            const result = await treeService.removeMultipleTrees(['tree1', 'tree2', 'tree3', 'tree4']);

            expect(result.success).toBe(true);
            // Should leave at least one tree
            expect(treeService.treeIds.length).toBe(1);
        });

        it('should skip non-existent trees', async () => {
            const result = await treeService.removeMultipleTrees(['nonexistent', 'tree2']);

            expect(result.success).toBe(true);
            expect(result.removedTrees).toEqual(['tree2']);
        });
    });

    describe('loadTreeBlocks', () => {
        beforeEach(async () => {
            mockStorage['currentUser'] = 'user1';
            mockStorage['treeIdsuser1'] = ['tree1', 'tree2', 'tree3'];
            mockStorage['Block_tree1_user1'] = { id: 'tree1', title: 'Tree 1' };
            mockStorage['Block_tree2_user1'] = { id: 'tree2', title: 'Tree 2' };
            // tree3 has no block
            await treeService.initialize();
        });

        it('should load blocks for all trees', async () => {
            const blocks = await treeService.loadTreeBlocks();

            expect(blocks.length).toBe(2);
            expect(blocks[0]).toEqual({ treeId: 'tree1', block: { id: 'tree1', title: 'Tree 1' } });
            expect(blocks[1]).toEqual({ treeId: 'tree2', block: { id: 'tree2', title: 'Tree 2' } });
        });

        it('should filter out trees without blocks', async () => {
            const blocks = await treeService.loadTreeBlocks();

            expect(blocks.some(b => b.treeId === 'tree3')).toBe(false);
        });
    });

    describe('event handlers', () => {
        it('should reset state on logout', () => {
            treeService._currentUser = 'user1';
            treeService._treeIds = ['tree1'];
            treeService._initialized = true;

            treeService._handleLogout();

            expect(treeService._currentUser).toBeNull();
            expect(treeService._treeIds).toEqual([]);
            expect(treeService._initialized).toBe(false);
        });
    });
});

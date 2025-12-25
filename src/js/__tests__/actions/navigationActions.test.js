/**
 * Тесты для navigationActions
 */

import {
    getCurrentUser,
    getCurrentTree,
    setCurrentTree,
    getTreeIds,
    saveTreeIds,
    addTreeId,
    removeTreeId,
    getPath,
    savePath,
    removePath,
    getBlock,
    getCurrentScreen,
    navigateInto,
    navigateBack,
    navigateToLevel,
    switchTree,
    switchTreeByIndex,
    initTreePath,
    extractParentHsl,
    extractLinkChain,
    resolveBlockId
} from '../../actions/navigationActions';

// Мокаем localforage
jest.mock('localforage', () => ({
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn()
}));

import localforage from 'localforage';

describe('navigationActions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getCurrentUser', () => {
        it('should return current user', async () => {
            localforage.getItem.mockResolvedValue('testuser');

            const result = await getCurrentUser();

            expect(result).toBe('testuser');
            expect(localforage.getItem).toHaveBeenCalledWith('currentUser');
        });

        it('should return anonim when no user', async () => {
            localforage.getItem.mockResolvedValue(null);

            const result = await getCurrentUser();

            expect(result).toBe('anonim');
        });
    });

    describe('getCurrentTree', () => {
        it('should return current tree', async () => {
            localforage.getItem.mockResolvedValue('tree-1');

            const result = await getCurrentTree();

            expect(result).toBe('tree-1');
            expect(localforage.getItem).toHaveBeenCalledWith('currentTree');
        });
    });

    describe('setCurrentTree', () => {
        it('should set current tree', async () => {
            await setCurrentTree('tree-1');

            expect(localforage.setItem).toHaveBeenCalledWith('currentTree', 'tree-1');
        });
    });

    describe('getTreeIds', () => {
        it('should get tree ids for current user', async () => {
            localforage.getItem
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce(['tree-1', 'tree-2']);

            const result = await getTreeIds();

            expect(result).toEqual(['tree-1', 'tree-2']);
        });

        it('should return empty array when no trees', async () => {
            localforage.getItem
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce(null);

            const result = await getTreeIds();

            expect(result).toEqual([]);
        });

        it('should use provided user', async () => {
            localforage.getItem.mockResolvedValue(['tree-1']);

            await getTreeIds('customuser');

            expect(localforage.getItem).toHaveBeenCalledWith('treeIdscustomuser');
        });
    });

    describe('saveTreeIds', () => {
        it('should save tree ids', async () => {
            localforage.getItem.mockResolvedValue('testuser');

            await saveTreeIds(['tree-1', 'tree-2']);

            expect(localforage.setItem).toHaveBeenCalledWith('treeIdstestuser', ['tree-1', 'tree-2']);
        });
    });

    describe('addTreeId', () => {
        it('should add new tree id', async () => {
            localforage.getItem
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce(['tree-1'])
                .mockResolvedValueOnce('testuser');

            const result = await addTreeId('tree-2');

            expect(result).toContain('tree-2');
            expect(localforage.setItem).toHaveBeenCalled();
        });

        it('should not duplicate existing tree id', async () => {
            localforage.getItem
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce(['tree-1']);

            const result = await addTreeId('tree-1');

            expect(result).toEqual(['tree-1']);
            expect(localforage.setItem).not.toHaveBeenCalled();
        });
    });

    describe('removeTreeId', () => {
        it('should remove tree id', async () => {
            localforage.getItem
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce(['tree-1', 'tree-2'])
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce('tree-1');

            const result = await removeTreeId('tree-2');

            expect(result.success).toBe(true);
            expect(result.treeIds).toEqual(['tree-1']);
        });

        it('should not remove last tree', async () => {
            localforage.getItem
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce(['tree-1']);

            const result = await removeTreeId('tree-1');

            expect(result.success).toBe(false);
            expect(result.error.message).toBe('Cannot remove last tree');
        });

        it('should switch to first tree when removing current', async () => {
            localforage.getItem
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce(['tree-1', 'tree-2'])
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce('tree-2'); // current tree

            await removeTreeId('tree-2');

            expect(localforage.setItem).toHaveBeenCalledWith('currentTree', 'tree-1');
        });
    });

    describe('getPath', () => {
        it('should get path for current tree', async () => {
            localforage.getItem
                .mockResolvedValueOnce('tree-1')
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce([{ blockId: 'block-1' }]);

            const result = await getPath();

            expect(result).toEqual([{ blockId: 'block-1' }]);
        });

        it('should return empty array when no path', async () => {
            localforage.getItem
                .mockResolvedValueOnce('tree-1')
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce(null);

            const result = await getPath();

            expect(result).toEqual([]);
        });
    });

    describe('savePath', () => {
        it('should save path', async () => {
            localforage.getItem
                .mockResolvedValueOnce('tree-1')
                .mockResolvedValueOnce('testuser');

            const path = [{ blockId: 'block-1' }];
            await savePath(path);

            expect(localforage.setItem).toHaveBeenCalledWith('Path_tree-1testuser', path);
        });
    });

    describe('removePath', () => {
        it('should remove path', async () => {
            localforage.getItem.mockResolvedValue('testuser');

            await removePath('tree-1');

            expect(localforage.removeItem).toHaveBeenCalledWith('Path_tree-1testuser');
        });
    });

    describe('getBlock', () => {
        it('should get block from storage', async () => {
            const mockBlock = { id: 'block-1', title: 'Test' };
            localforage.getItem
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce(mockBlock);

            const result = await getBlock('block-1');

            expect(result).toEqual(mockBlock);
            expect(localforage.getItem).toHaveBeenCalledWith('Block_block-1_testuser');
        });
    });

    describe('getCurrentScreen', () => {
        it('should return last path item', async () => {
            localforage.getItem
                .mockResolvedValueOnce('tree-1')
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce([
                    { blockId: 'block-1' },
                    { blockId: 'block-2' }
                ]);

            const result = await getCurrentScreen();

            expect(result).toEqual({ blockId: 'block-2' });
        });

        it('should return null when path is empty', async () => {
            localforage.getItem
                .mockResolvedValueOnce('tree-1')
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce([]);

            const result = await getCurrentScreen();

            expect(result).toBeNull();
        });
    });

    describe('navigateInto', () => {
        it('should navigate into block', async () => {
            const mockBlock = { id: 'block-2', title: 'Child Block' };
            localforage.getItem
                .mockResolvedValueOnce('tree-1')
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce([{ blockId: 'block-1' }])
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce(mockBlock)
                .mockResolvedValueOnce('tree-1')
                .mockResolvedValueOnce('testuser');

            const result = await navigateInto('block-2', [180, 50, 50]);

            expect(result.success).toBe(true);
            expect(result.path.length).toBe(2);
            expect(result.path[1].blockId).toBe('block-2');
        });

        it('should navigate back when opening current block', async () => {
            // getPath для navigateInto
            localforage.getItem
                .mockResolvedValueOnce('tree-1')
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce([
                    { blockId: 'block-1' },
                    { blockId: 'block-2' }
                ])
                // getPath для navigateBack (вызывается внутри navigateInto)
                .mockResolvedValueOnce('tree-1')
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce([
                    { blockId: 'block-1' },
                    { blockId: 'block-2' }
                ])
                // savePath для navigateBack
                .mockResolvedValueOnce('tree-1')
                .mockResolvedValueOnce('testuser');

            const result = await navigateInto('block-2');

            expect(result.success).toBe(true);
            expect(result.activeId).toBe('block-2');
        });

        it('should return error when block not found', async () => {
            localforage.getItem
                .mockResolvedValueOnce('tree-1')
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce([{ blockId: 'block-1' }])
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce(null);

            const result = await navigateInto('nonexistent');

            expect(result.success).toBe(false);
        });
    });

    describe('navigateBack', () => {
        it('should navigate back', async () => {
            localforage.getItem
                .mockResolvedValueOnce('tree-1')
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce([
                    { blockId: 'block-1' },
                    { blockId: 'block-2' }
                ])
                .mockResolvedValueOnce('tree-1')
                .mockResolvedValueOnce('testuser');

            const result = await navigateBack();

            expect(result.success).toBe(true);
            expect(result.activeId).toBe('block-2');
            expect(result.path.length).toBe(1);
        });

        it('should return error at root', async () => {
            localforage.getItem
                .mockResolvedValueOnce('tree-1')
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce([{ blockId: 'block-1' }]);

            const result = await navigateBack();

            expect(result.success).toBe(false);
            expect(result.error.message).toBe('Already at root');
        });
    });

    describe('navigateToLevel', () => {
        it('should navigate to specific level', async () => {
            localforage.getItem
                .mockResolvedValueOnce('tree-1')
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce([
                    { blockId: 'block-1' },
                    { blockId: 'block-2' },
                    { blockId: 'block-3' }
                ])
                .mockResolvedValueOnce('tree-1')
                .mockResolvedValueOnce('testuser');

            const result = await navigateToLevel(1);

            expect(result.success).toBe(true);
            expect(result.path.length).toBe(2);
        });

        it('should return error for invalid level', async () => {
            localforage.getItem
                .mockResolvedValueOnce('tree-1')
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce([{ blockId: 'block-1' }]);

            const result = await navigateToLevel(5);

            expect(result.success).toBe(false);
        });
    });

    describe('switchTree', () => {
        it('should switch to another tree', async () => {
            localforage.getItem
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce(['tree-1', 'tree-2']);

            const result = await switchTree('tree-2');

            expect(result.success).toBe(true);
            expect(localforage.setItem).toHaveBeenCalledWith('currentTree', 'tree-2');
        });

        it('should return error when tree not found', async () => {
            localforage.getItem
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce(['tree-1']);

            const result = await switchTree('nonexistent');

            expect(result.success).toBe(false);
        });
    });

    describe('switchTreeByIndex', () => {
        it('should switch to tree by index (1-based)', async () => {
            localforage.getItem
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce(['tree-1', 'tree-2', 'tree-3']);

            const result = await switchTreeByIndex(2);

            expect(result.success).toBe(true);
            expect(result.treeId).toBe('tree-2');
        });

        it('should switch to last tree when index is 0', async () => {
            localforage.getItem
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce(['tree-1', 'tree-2', 'tree-3']);

            const result = await switchTreeByIndex(0);

            expect(result.success).toBe(true);
            expect(result.treeId).toBe('tree-3');
        });

        it('should return error for out of range index', async () => {
            localforage.getItem
                .mockResolvedValueOnce('testuser')
                .mockResolvedValueOnce(['tree-1']);

            const result = await switchTreeByIndex(5);

            expect(result.success).toBe(false);
        });
    });

    describe('initTreePath', () => {
        it('should initialize path for root block', async () => {
            localforage.getItem
                .mockResolvedValueOnce('tree-1')
                .mockResolvedValueOnce('testuser');

            const rootBlock = {
                id: 'tree-1',
                title: 'Root Block',
                data: { color: [180, 50, 50] }
            };

            const result = await initTreePath(rootBlock);

            expect(result.length).toBe(1);
            expect(result[0].blockId).toBe('tree-1');
            expect(result[0].color).toEqual([180, 50, 50]);
        });

        it('should use empty color when default_color', async () => {
            localforage.getItem
                .mockResolvedValueOnce('tree-1')
                .mockResolvedValueOnce('testuser');

            const rootBlock = {
                id: 'tree-1',
                title: 'Root Block',
                data: { color: 'default_color' }
            };

            const result = await initTreePath(rootBlock);

            expect(result[0].color).toEqual([]);
        });
    });

    describe('extractParentHsl', () => {
        it('should extract HSL from block element', () => {
            const parent = document.createElement('div');
            parent.setAttribute('block', '');
            parent.setAttribute('hsl', '180,50,50');

            const result = extractParentHsl(parent);

            expect(result).toEqual([180, 50, 50]);
        });

        it('should extract HSL from blockLink grandparent', () => {
            const grandParent = document.createElement('div');
            grandParent.setAttribute('hsl', '200,60,60');

            const parent = document.createElement('div');
            parent.setAttribute('blockLink', '');
            grandParent.appendChild(parent);

            const result = extractParentHsl(parent);

            expect(result).toEqual([200, 60, 60]);
        });

        it('should return empty array when no HSL', () => {
            const parent = document.createElement('div');

            const result = extractParentHsl(parent);

            expect(result).toEqual([]);
        });

        it('should return empty array for null element', () => {
            const result = extractParentHsl(null);

            expect(result).toEqual([]);
        });
    });

    describe('extractLinkChain', () => {
        it('should extract chain of blockLinks', () => {
            const root = document.createElement('div');

            const link1 = document.createElement('div');
            link1.setAttribute('blockLink', '');
            link1.id = 'link-1';
            link1.setAttribute('blocklink', 'source-1');
            root.appendChild(link1);

            const link2 = document.createElement('div');
            link2.setAttribute('blockLink', '');
            link2.id = 'link-2';
            link2.setAttribute('blocklink', 'source-2');
            link1.appendChild(link2);

            const child = document.createElement('div');
            link2.appendChild(child);

            const result = extractLinkChain(child);

            expect(result.length).toBe(2);
            expect(result[0]).toEqual({ linkId: 'link-2', linkSource: 'source-2' });
            expect(result[1]).toEqual({ linkId: 'link-1', linkSource: 'source-1' });
        });

        it('should return empty array when no links', () => {
            const element = document.createElement('div');

            const result = extractLinkChain(element);

            expect(result).toEqual([]);
        });
    });

    describe('resolveBlockId', () => {
        it('should return blocklink attribute when blockLinkElement provided', () => {
            const blockElement = document.createElement('div');
            blockElement.id = 'wrapper*block-1';

            const linkElement = document.createElement('div');
            linkElement.setAttribute('blockLink', '');
            linkElement.setAttribute('blocklink', 'linked-block');

            const result = resolveBlockId(blockElement, linkElement);

            expect(result).toBe('linked-block');
        });

        it('should extract id from blockElement', () => {
            const blockElement = document.createElement('div');
            blockElement.id = 'wrapper*block-1';

            const result = resolveBlockId(blockElement);

            expect(result).toBe('block-1');
        });

        it('should return null for null element', () => {
            const result = resolveBlockId(null);

            expect(result).toBeNull();
        });
    });
});

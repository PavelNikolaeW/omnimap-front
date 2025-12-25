/**
 * Тесты для blockActions
 */

// Мокаем api
jest.mock('../../api/api', () => ({
    __esModule: true,
    default: {
        createBlock: jest.fn(),
        updateBlock: jest.fn(),
        removeTree: jest.fn(),
        moveBlock: jest.fn(),
        pasteBlock: jest.fn(),
        pasteLinkBlock: jest.fn(),
        createTree: jest.fn(),
        createUrlLink: jest.fn()
    }
}));

// Мокаем utils
jest.mock('../../utils/utils', () => ({
    dispatch: jest.fn()
}));

import {
    createBlock,
    createIframeBlock,
    createBlockSmart,
    updateBlockTitle,
    updateBlockText,
    updateBlockColor,
    updateBlockData,
    setBlockIframe,
    deleteBlock,
    moveBlock,
    copyBlocks,
    linkBlocks,
    createTree,
    createPublicLink,
    updateBlockGrid,
    addConnection,
    removeConnection
} from '../../actions/blockActions';

import api from '../../api/api';

describe('blockActions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createBlock', () => {
        it('should return error when parentId is missing', async () => {
            const result = await createBlock(null, 'Test');
            expect(result.success).toBe(false);
            expect(result.error.message).toBe('parentId is required');
        });

        it('should create block successfully', async () => {
            const mockBlocks = [{ id: 'block-1', title: 'Test' }];
            api.createBlock.mockResolvedValue({ status: 201, data: mockBlocks });

            const result = await createBlock('parent-1', 'Test');

            expect(result.success).toBe(true);
            expect(result.blocks).toEqual(mockBlocks);
            expect(api.createBlock).toHaveBeenCalledWith('parent-1', 'Test', null);
        });

        it('should handle API error', async () => {
            const error = new Error('Network error');
            api.createBlock.mockRejectedValue(error);

            const result = await createBlock('parent-1', 'Test');

            expect(result.success).toBe(false);
            expect(result.error).toBe(error);
        });

        it('should handle unexpected status', async () => {
            api.createBlock.mockResolvedValue({ status: 500, data: null });

            const result = await createBlock('parent-1', 'Test');

            expect(result.success).toBe(false);
            expect(result.error.message).toContain('Unexpected status');
        });
    });

    describe('createIframeBlock', () => {
        it('should return error when parentId or src is missing', async () => {
            const result1 = await createIframeBlock(null, 'http://example.com');
            expect(result1.success).toBe(false);

            const result2 = await createIframeBlock('parent-1', null);
            expect(result2.success).toBe(false);
        });

        it('should create iframe block with correct data', async () => {
            const mockBlocks = [{ id: 'block-1' }];
            api.createBlock.mockResolvedValue({ status: 201, data: mockBlocks });

            const result = await createIframeBlock('parent-1', 'http://example.com');

            expect(result.success).toBe(true);
            expect(api.createBlock).toHaveBeenCalledWith('parent-1', '', {
                view: 'iframe',
                attributes: [
                    { name: 'sandbox', value: 'allow-scripts allow-same-origin allow-forms' },
                    { name: 'src', value: 'http://example.com' }
                ]
            });
        });
    });

    describe('createBlockSmart', () => {
        it('should create iframe for URL input', async () => {
            api.createBlock.mockResolvedValue({ status: 201, data: [] });

            const result = await createBlockSmart('parent-1', 'https://example.com');

            expect(result.type).toBe('iframe');
        });

        it('should create regular block for non-URL input', async () => {
            api.createBlock.mockResolvedValue({ status: 201, data: [] });

            const result = await createBlockSmart('parent-1', 'Regular title');

            expect(result.type).toBe('block');
        });
    });

    describe('updateBlockTitle', () => {
        it('should return error when blockId is missing', async () => {
            const result = await updateBlockTitle(null, 'New title');
            expect(result.success).toBe(false);
        });

        it('should update title successfully', async () => {
            const mockBlock = { id: 'block-1', title: 'New title' };
            api.updateBlock.mockResolvedValue({ status: 200, data: mockBlock });

            const result = await updateBlockTitle('block-1', 'New title');

            expect(result.success).toBe(true);
            expect(result.block).toEqual(mockBlock);
            expect(api.updateBlock).toHaveBeenCalledWith('block-1', { title: 'New title' });
        });
    });

    describe('updateBlockText', () => {
        it('should update text successfully', async () => {
            const mockBlock = { id: 'block-1', data: { text: 'New text' } };
            api.updateBlock.mockResolvedValue({ status: 200, data: mockBlock });

            const result = await updateBlockText('block-1', 'New text');

            expect(result.success).toBe(true);
            expect(api.updateBlock).toHaveBeenCalledWith('block-1', { data: { text: 'New text' } });
        });
    });

    describe('updateBlockColor', () => {
        it('should update color successfully', async () => {
            const mockBlock = { id: 'block-1', data: { color: [180, 50, 50] } };
            api.updateBlock.mockResolvedValue({ status: 200, data: mockBlock });

            const result = await updateBlockColor('block-1', [180, 50, 50]);

            expect(result.success).toBe(true);
            expect(api.updateBlock).toHaveBeenCalledWith('block-1', { data: { color: [180, 50, 50] } });
        });
    });

    describe('updateBlockData', () => {
        it('should update data successfully', async () => {
            const mockBlock = { id: 'block-1', data: { custom: 'value' } };
            api.updateBlock.mockResolvedValue({ status: 200, data: mockBlock });

            const result = await updateBlockData('block-1', { custom: 'value' });

            expect(result.success).toBe(true);
            expect(api.updateBlock).toHaveBeenCalledWith('block-1', { data: { custom: 'value' } });
        });
    });

    describe('setBlockIframe', () => {
        it('should return error when blockId or src is missing', async () => {
            const result = await setBlockIframe(null, 'http://example.com');
            expect(result.success).toBe(false);
        });

        it('should set iframe successfully', async () => {
            const mockBlock = { id: 'block-1' };
            api.updateBlock.mockResolvedValue({ status: 200, data: mockBlock });

            const result = await setBlockIframe('block-1', 'http://example.com');

            expect(result.success).toBe(true);
            expect(api.updateBlock).toHaveBeenCalledWith('block-1', {
                data: {
                    view: 'iframe',
                    text: '',
                    attributes: [
                        { name: 'sandbox', value: 'allow-scripts allow-same-origin allow-forms' },
                        { name: 'src', value: 'http://example.com' }
                    ]
                }
            });
        });
    });

    describe('deleteBlock', () => {
        it('should return error when blockId is missing', async () => {
            const result = await deleteBlock(null);
            expect(result.success).toBe(false);
        });

        it('should delete block successfully', async () => {
            api.removeTree.mockResolvedValue({ status: 200, data: { parent: { id: 'parent-1' } } });

            const result = await deleteBlock('block-1');

            expect(result.success).toBe(true);
            expect(result.parent).toEqual({ id: 'parent-1' });
        });
    });

    describe('moveBlock', () => {
        it('should return error when blockId or newParentId is missing', async () => {
            const result = await moveBlock(null, 'old', 'new', []);
            expect(result.success).toBe(false);
        });

        it('should return error when moving block into itself', async () => {
            const result = await moveBlock('block-1', 'old', 'block-1', []);
            expect(result.success).toBe(false);
            expect(result.error.message).toBe('Cannot move block into itself');
        });

        it('should move block successfully', async () => {
            const mockBlocks = { parent: { id: 'parent-1' } };
            api.moveBlock.mockResolvedValue({ status: 200, data: mockBlocks });

            const result = await moveBlock('block-1', 'old-parent', 'new-parent', ['a', 'b']);

            expect(result.success).toBe(true);
            expect(api.moveBlock).toHaveBeenCalledWith('block-1', {
                new_parent_id: 'new-parent',
                old_parent_id: 'old-parent',
                childOrder: ['a', 'b']
            });
        });

        it('should include before parameter when provided', async () => {
            api.moveBlock.mockResolvedValue({ status: 200, data: {} });

            await moveBlock('block-1', 'old', 'new', [], 'before-block');

            expect(api.moveBlock).toHaveBeenCalledWith('block-1', {
                new_parent_id: 'new',
                old_parent_id: 'old',
                childOrder: [],
                before: 'before-block'
            });
        });
    });

    describe('copyBlocks', () => {
        it('should return error when destId or srcIds is missing', async () => {
            const result1 = await copyBlocks(null, ['id-1']);
            expect(result1.success).toBe(false);

            const result2 = await copyBlocks('dest', []);
            expect(result2.success).toBe(false);
        });

        it('should return error when no valid UUIDs provided', async () => {
            const result = await copyBlocks('dest', ['not-a-uuid']);
            expect(result.success).toBe(false);
            expect(result.error.message).toBe('No valid UUIDs provided');
        });

        it('should copy blocks successfully', async () => {
            const validUUID = '123e4567-e89b-12d3-a456-426614174000';
            const mockBlocks = { block1: { id: validUUID } };
            api.pasteBlock.mockResolvedValue({ status: 200, data: mockBlocks });

            const result = await copyBlocks('dest', [validUUID]);

            expect(result.success).toBe(true);
            expect(api.pasteBlock).toHaveBeenCalledWith({ dest: 'dest', src: [validUUID] });
        });
    });

    describe('linkBlocks', () => {
        it('should return error when destId or srcIds is missing', async () => {
            const result = await linkBlocks(null, ['id-1']);
            expect(result.success).toBe(false);
        });

        it('should return error when trying to link block to itself', async () => {
            const result = await linkBlocks('dest', ['dest']);
            expect(result.success).toBe(false);
            expect(result.error.message).toBe('Cannot link block to itself');
        });

        it('should link blocks successfully', async () => {
            const validUUID = '123e4567-e89b-12d3-a456-426614174000';
            const mockBlocks = [{ id: 'new-link' }];
            api.pasteLinkBlock.mockResolvedValue({ status: 201, data: mockBlocks });

            const result = await linkBlocks('dest', [validUUID]);

            expect(result.success).toBe(true);
            expect(api.pasteLinkBlock).toHaveBeenCalledWith({ dest: 'dest', src: [validUUID] });
        });
    });

    describe('createTree', () => {
        it('should return error when title is missing', async () => {
            const result = await createTree(null);
            expect(result.success).toBe(false);
        });

        it('should create tree successfully', async () => {
            const mockBlock = { id: 'tree-1', title: 'New Tree' };
            api.createTree.mockResolvedValue({ status: 201, data: mockBlock });

            const result = await createTree('New Tree');

            expect(result.success).toBe(true);
            expect(result.block).toEqual(mockBlock);
        });
    });

    describe('createPublicLink', () => {
        it('should return error when blockId is missing', async () => {
            const result = await createPublicLink(null);
            expect(result.success).toBe(false);
        });

        it('should create public link successfully', async () => {
            const mockBlock = { id: 'block-1', data: { publicUrl: 'abc123' } };
            api.createUrlLink.mockResolvedValue({ status: 200, data: mockBlock });

            const result = await createPublicLink('block-1');

            expect(result.success).toBe(true);
            expect(result.block).toEqual(mockBlock);
        });
    });

    describe('updateBlockGrid', () => {
        it('should update grid successfully', async () => {
            const mockBlock = { id: 'block-1' };
            api.updateBlock.mockResolvedValue({ status: 200, data: mockBlock });

            const customGrid = { columns: 3, rows: 2 };
            const result = await updateBlockGrid('block-1', customGrid);

            expect(result.success).toBe(true);
            expect(api.updateBlock).toHaveBeenCalledWith('block-1', { data: { customGrid } });
        });
    });

    describe('addConnection', () => {
        it('should return error when sourceId or targetId is missing', async () => {
            const result = await addConnection(null, 'target');
            expect(result.success).toBe(false);
        });

        it('should add new connection', async () => {
            const mockBlock = { id: 'source' };
            api.updateBlock.mockResolvedValue({ status: 200, data: mockBlock });

            const connectionData = { connector: 'Bezier' };
            const result = await addConnection('source', 'target', connectionData, {});

            expect(result.success).toBe(true);
            expect(api.updateBlock).toHaveBeenCalledWith('source', {
                data: {
                    connections: [{
                        sourceId: 'source',
                        targetId: 'target',
                        connector: 'Bezier'
                    }]
                }
            });
        });

        it('should update existing connection', async () => {
            const mockBlock = { id: 'source' };
            api.updateBlock.mockResolvedValue({ status: 200, data: mockBlock });

            const currentData = {
                connections: [{ sourceId: 'source', targetId: 'target', connector: 'Straight' }]
            };
            const connectionData = { connector: 'Bezier' };

            await addConnection('source', 'target', connectionData, currentData);

            expect(api.updateBlock).toHaveBeenCalledWith('source', {
                data: {
                    connections: [{
                        sourceId: 'source',
                        targetId: 'target',
                        connector: 'Bezier'
                    }]
                }
            });
        });
    });

    describe('removeConnection', () => {
        it('should return error when sourceId or targetId is missing', async () => {
            const result = await removeConnection(null, 'target');
            expect(result.success).toBe(false);
        });

        it('should remove connection', async () => {
            const mockBlock = { id: 'source' };
            api.updateBlock.mockResolvedValue({ status: 200, data: mockBlock });

            const currentData = {
                connections: [
                    { sourceId: 'source', targetId: 'target' },
                    { sourceId: 'source', targetId: 'other' }
                ]
            };

            await removeConnection('source', 'target', currentData);

            expect(api.updateBlock).toHaveBeenCalledWith('source', {
                data: {
                    connections: [{ sourceId: 'source', targetId: 'other' }]
                }
            });
        });
    });
});

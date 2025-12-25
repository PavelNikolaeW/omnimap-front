/**
 * Тесты для selectionActions
 */

// Мокаем functions (должен быть до импортов из-за hoisting)
jest.mock('../../utils/functions', () => ({
    copyToClipboard: jest.fn(),
    getClipboardText: jest.fn(),
    isValidUUID: (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}));

import {
    MODES,
    copyBlockId,
    getBlockIdFromClipboard,
    startCutBlock,
    completeCutBlock,
    startConnectBlocks,
    completeConnectBlocks,
    extractBlockId,
    extractParentId,
    isModeAllowed,
    toggleMode,
    resetToNormalMode,
    createSelectionState,
    updateSelectionOnClick,
    clearSelection
} from '../../actions/selectionActions';

import { copyToClipboard, getClipboardText } from '../../utils/functions';

describe('selectionActions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('MODES', () => {
        it('should have all required modes', () => {
            expect(MODES.NORMAL).toBe('normal');
            expect(MODES.TEXT_EDIT).toBe('textEdit');
            expect(MODES.CONNECT_TO_BLOCK).toBe('connectToBlock');
            expect(MODES.CUT_BLOCK).toBe('cutBlock');
            expect(MODES.DIAGRAM).toBe('diagram');
            expect(MODES.CHAT).toBe('chat');
        });
    });

    describe('copyBlockId', () => {
        it('should return error when blockId is missing', () => {
            const result = copyBlockId(null);

            expect(result.success).toBe(false);
            expect(result.error.message).toBe('blockId is required');
        });

        it('should copy clean block id', () => {
            const result = copyBlockId('wrapper*block-123');

            expect(result.success).toBe(true);
            expect(result.blockId).toBe('block-123');
            expect(copyToClipboard).toHaveBeenCalledWith('block-123');
        });

        it('should handle id without prefix', () => {
            const result = copyBlockId('block-123');

            expect(result.success).toBe(true);
            expect(result.blockId).toBe('block-123');
        });
    });

    describe('getBlockIdFromClipboard', () => {
        it('should return error when clipboard is empty', async () => {
            getClipboardText.mockResolvedValue(null);

            const result = await getBlockIdFromClipboard();

            expect(result.success).toBe(false);
            expect(result.error.message).toBe('Clipboard is empty');
        });

        it('should return error when clipboard contains invalid UUID', async () => {
            getClipboardText.mockResolvedValue('not-a-uuid');

            const result = await getBlockIdFromClipboard();

            expect(result.success).toBe(false);
            expect(result.error.message).toBe('Clipboard does not contain valid UUID');
        });

        it('should return block id when valid UUID', async () => {
            const validUUID = '123e4567-e89b-12d3-a456-426614174000';
            getClipboardText.mockResolvedValue(validUUID);

            const result = await getBlockIdFromClipboard();

            expect(result.success).toBe(true);
            expect(result.blockId).toBe(validUUID);
        });

        it('should handle clipboard error', async () => {
            const error = new Error('Clipboard access denied');
            getClipboardText.mockRejectedValue(error);

            const result = await getBlockIdFromClipboard();

            expect(result.success).toBe(false);
            expect(result.error).toBe(error);
        });
    });

    describe('startCutBlock', () => {
        it('should return error when blockId is missing', () => {
            const result = startCutBlock(null, 'parent-1');

            expect(result.success).toBe(false);
            expect(result.error.message).toBe('blockId is required');
        });

        it('should return error when parent is rootContainer', () => {
            const result = startCutBlock('block-1', 'rootContainer');

            expect(result.success).toBe(false);
            expect(result.error.message).toBe('Cannot cut root block');
        });

        it('should return error when parentId is missing', () => {
            const result = startCutBlock('block-1', null);

            expect(result.success).toBe(false);
        });

        it('should return cut data', () => {
            const result = startCutBlock('wrapper*block-1', 'wrapper*parent-1');

            expect(result.success).toBe(true);
            expect(result.cutData).toEqual({
                block_id: 'block-1',
                old_parent_id: 'parent-1'
            });
        });
    });

    describe('completeCutBlock', () => {
        it('should return error when cutData is missing', () => {
            const result = completeCutBlock(null, 'new-parent');

            expect(result.success).toBe(false);
            expect(result.error.message).toBe('No block is being cut');
        });

        it('should return error when newParentId is missing', () => {
            const cutData = { block_id: 'block-1', old_parent_id: 'old-parent' };
            const result = completeCutBlock(cutData, null);

            expect(result.success).toBe(false);
            expect(result.error.message).toBe('newParentId is required');
        });

        it('should return move data', () => {
            const cutData = { block_id: 'block-1', old_parent_id: 'old-parent' };
            const result = completeCutBlock(cutData, 'wrapper*new-parent');

            expect(result.success).toBe(true);
            expect(result.moveData).toEqual({
                block_id: 'block-1',
                old_parent_id: 'old-parent',
                new_parent_id: 'new-parent'
            });
        });

        it('should include before id when provided', () => {
            const cutData = { block_id: 'block-1', old_parent_id: 'old-parent' };
            const result = completeCutBlock(cutData, 'new-parent', 'before-block');

            expect(result.moveData.before).toBe('before-block');
        });
    });

    describe('startConnectBlocks', () => {
        it('should return error when sourceId is missing', () => {
            const result = startConnectBlocks(null);

            expect(result.success).toBe(false);
            expect(result.error.message).toBe('sourceId is required');
        });

        it('should return source id', () => {
            const result = startConnectBlocks('source-1');

            expect(result.success).toBe(true);
            expect(result.sourceId).toBe('source-1');
        });
    });

    describe('completeConnectBlocks', () => {
        it('should return error when sourceId or targetId is missing', () => {
            const result1 = completeConnectBlocks(null, 'target');
            expect(result1.success).toBe(false);

            const result2 = completeConnectBlocks('source', null);
            expect(result2.success).toBe(false);
        });

        it('should return error when connecting to self', () => {
            const result = completeConnectBlocks('block-1', 'block-1');

            expect(result.success).toBe(false);
            expect(result.error.message).toBe('Cannot connect block to itself');
        });

        it('should return connection data', () => {
            const result = completeConnectBlocks('source-1', 'target-1');

            expect(result.success).toBe(true);
            expect(result.connection).toEqual({
                sourceId: 'source-1',
                targetId: 'target-1'
            });
        });
    });

    describe('extractBlockId', () => {
        it('should extract id from blockLink element', () => {
            const blockElement = document.createElement('div');
            blockElement.id = 'wrapper*block-1';

            const linkElement = document.createElement('div');
            linkElement.setAttribute('blockLink', '');
            linkElement.setAttribute('blocklink', 'linked-block');

            const result = extractBlockId(blockElement, linkElement);

            expect(result).toBe('linked-block');
        });

        it('should extract id from element id', () => {
            const blockElement = document.createElement('div');
            blockElement.id = 'wrapper*block-1';

            const result = extractBlockId(blockElement);

            expect(result).toBe('block-1');
        });

        it('should return null for element without id', () => {
            const blockElement = document.createElement('div');

            const result = extractBlockId(blockElement);

            expect(result).toBeNull();
        });

        it('should return null for null element', () => {
            const result = extractBlockId(null);

            expect(result).toBeNull();
        });
    });

    describe('extractParentId', () => {
        it('should extract parent id', () => {
            const parent = document.createElement('div');
            parent.id = 'wrapper*parent-1';

            const child = document.createElement('div');
            parent.appendChild(child);

            const result = extractParentId(child);

            expect(result).toBe('parent-1');
        });

        it('should return null for rootContainer', () => {
            const parent = document.createElement('div');
            parent.id = 'rootContainer';

            const child = document.createElement('div');
            parent.appendChild(child);

            const result = extractParentId(child);

            expect(result).toBeNull();
        });

        it('should return null when no parent', () => {
            const element = document.createElement('div');

            const result = extractParentId(element);

            expect(result).toBeNull();
        });
    });

    describe('isModeAllowed', () => {
        it('should allow any mode when * is in allowedModes', () => {
            expect(isModeAllowed('normal', ['*'])).toBe(true);
            expect(isModeAllowed('textEdit', ['*'])).toBe(true);
            expect(isModeAllowed('custom', ['*'])).toBe(true);
        });

        it('should check if mode is in allowedModes', () => {
            expect(isModeAllowed('normal', ['normal', 'textEdit'])).toBe(true);
            expect(isModeAllowed('diagram', ['normal', 'textEdit'])).toBe(false);
        });
    });

    describe('toggleMode', () => {
        it('should toggle to normal when already in target mode', () => {
            const result = toggleMode('diagram', 'diagram');

            expect(result.newMode).toBe(MODES.NORMAL);
            expect(result.changed).toBe(true);
        });

        it('should switch to target mode', () => {
            const result = toggleMode('normal', 'diagram');

            expect(result.newMode).toBe('diagram');
            expect(result.changed).toBe(true);
        });
    });

    describe('resetToNormalMode', () => {
        it('should return normal mode', () => {
            const result = resetToNormalMode();

            expect(result.newMode).toBe(MODES.NORMAL);
        });
    });

    describe('createSelectionState', () => {
        it('should create default state', () => {
            const result = createSelectionState();

            expect(result).toEqual({
                mode: MODES.NORMAL,
                blockId: null,
                blockElement: null,
                blockLinkElement: null,
                cutData: null,
                connectSourceId: null,
                sourceElement: null
            });
        });

        it('should create state with options', () => {
            const options = {
                mode: MODES.CUT_BLOCK,
                blockId: 'block-1',
                cutData: { block_id: 'block-1' }
            };

            const result = createSelectionState(options);

            expect(result.mode).toBe(MODES.CUT_BLOCK);
            expect(result.blockId).toBe('block-1');
            expect(result.cutData).toEqual({ block_id: 'block-1' });
        });
    });

    describe('updateSelectionOnClick', () => {
        it('should update state with block info', () => {
            const state = createSelectionState();
            const blockElement = document.createElement('div');
            blockElement.id = 'wrapper*block-1';

            const result = updateSelectionOnClick(state, blockElement);

            expect(result.blockId).toBe('block-1');
            expect(result.blockElement).toBe(blockElement);
            expect(result.mode).toBe(MODES.NORMAL);
        });

        it('should use blockLink element when provided', () => {
            const state = createSelectionState();

            const blockElement = document.createElement('div');
            blockElement.id = 'wrapper*block-1';

            const linkElement = document.createElement('div');
            linkElement.setAttribute('blockLink', '');
            linkElement.setAttribute('blocklink', 'linked-block');

            const result = updateSelectionOnClick(state, blockElement, linkElement);

            expect(result.blockId).toBe('linked-block');
            expect(result.blockLinkElement).toBe(linkElement);
        });
    });

    describe('clearSelection', () => {
        it('should clear all selection state', () => {
            const state = {
                mode: MODES.CUT_BLOCK,
                blockId: 'block-1',
                blockElement: document.createElement('div'),
                blockLinkElement: document.createElement('div'),
                cutData: { block_id: 'block-1' },
                connectSourceId: 'source-1',
                sourceElement: document.createElement('div')
            };

            const result = clearSelection(state);

            expect(result.mode).toBe(MODES.NORMAL);
            expect(result.blockId).toBeNull();
            expect(result.blockElement).toBeNull();
            expect(result.blockLinkElement).toBeNull();
            expect(result.cutData).toBeNull();
            expect(result.connectSourceId).toBeNull();
            expect(result.sourceElement).toBeNull();
        });
    });
});

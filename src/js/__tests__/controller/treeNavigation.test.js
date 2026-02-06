jest.mock('../../services/treeService', () => ({
    treeService: {
        refresh: jest.fn(),
        switchTree: jest.fn(),
        loadTreeBlocks: jest.fn(),
        currentTree: null
    }
}));

jest.mock('../../utils/custom-dialog', () => ({
    customPrompt: jest.fn()
}));

jest.mock('../../utils/utils', () => ({
    dispatch: jest.fn()
}));

import { TreeNavigation } from '../../controller/treeNavigation';
import { treeService } from '../../services/treeService';
import { customPrompt } from '../../utils/custom-dialog';
import { dispatch } from '../../utils/utils';

describe('TreeNavigation mobile interactions', () => {
    let navigation;

    beforeEach(async () => {
        document.body.innerHTML = '<div id="tree-navigation"></div>';

        treeService.refresh.mockResolvedValue();
        treeService.switchTree.mockResolvedValue({ success: true });
        treeService.loadTreeBlocks.mockResolvedValue([
            { treeId: 'tree-1', block: { title: 'Tree 1' } },
            { treeId: 'tree-2', block: { title: 'Tree 2' } }
        ]);
        treeService.currentTree = 'tree-1';

        customPrompt.mockResolvedValue(null);
        dispatch.mockReset();

        navigation = new TreeNavigation();
        await navigation.render();
    });

    afterEach(() => {
        navigation?.destroy();
        jest.clearAllMocks();
    });

    test('switches tree on touch tap when click is not fired', async () => {
        const targetButton = document.querySelector('[data-testid="tree-button-tree-2"]');

        navigation._handleTouchStart({
            type: 'touchstart',
            touches: [{ clientX: 10, clientY: 10 }]
        });

        await navigation._handleTouchEnd({
            type: 'touchend',
            target: targetButton
        });

        expect(treeService.switchTree).toHaveBeenCalledTimes(1);
        expect(treeService.switchTree).toHaveBeenCalledWith('tree-2');
    });

    test('deduplicates synthetic click after touch tap', async () => {
        const targetButton = document.querySelector('[data-testid="tree-button-tree-2"]');

        navigation._handleTouchStart({
            type: 'touchstart',
            touches: [{ clientX: 10, clientY: 10 }]
        });

        await navigation._handleTouchEnd({
            type: 'touchend',
            target: targetButton
        });

        await navigation._handleTreeClick({
            type: 'click',
            target: targetButton
        });

        expect(treeService.switchTree).toHaveBeenCalledTimes(1);
    });

    test('does not trigger action when touch gesture is a swipe', async () => {
        const targetButton = document.querySelector('[data-testid="tree-button-tree-2"]');

        navigation._handleTouchStart({
            type: 'touchstart',
            touches: [{ clientX: 10, clientY: 10 }]
        });

        navigation._handleTouchMove({
            type: 'touchmove',
            touches: [{ clientX: 35, clientY: 10 }]
        });

        await navigation._handleTouchEnd({
            type: 'touchend',
            target: targetButton
        });

        expect(treeService.switchTree).not.toHaveBeenCalled();
    });
});

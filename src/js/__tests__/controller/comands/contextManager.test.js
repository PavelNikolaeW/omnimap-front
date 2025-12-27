// Mock DiagramUtils
jest.mock('../../../controller/diagramUtils', () => ({
    DiagramUtils: jest.fn().mockImplementation(() => ({
        showInputs: jest.fn(),
        hiddenInputs: jest.fn()
    }))
}));

import { ContextManager } from '../../../controller/comands/contextManager';

describe('ContextManager', () => {
    let manager;
    let mockRootContainer;
    let mockBreadcrumb;
    let mockTreeNavigation;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup DOM
        mockRootContainer = document.createElement('div');
        mockRootContainer.id = 'rootContainer';

        mockBreadcrumb = document.createElement('div');
        mockBreadcrumb.id = 'breadcrumb';

        mockTreeNavigation = document.createElement('div');
        mockTreeNavigation.id = 'treeNavigation';

        const activeBtnIndicator = document.createElement('div');
        activeBtnIndicator.id = 'active-button-info';

        document.body.appendChild(mockRootContainer);
        document.body.appendChild(mockBreadcrumb);
        document.body.appendChild(mockTreeNavigation);
        document.body.appendChild(activeBtnIndicator);

        manager = new ContextManager(mockRootContainer, mockBreadcrumb, mockTreeNavigation);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('constructor', () => {
        test('initializes with default values', () => {
            expect(manager.mode).toBe('normal');
            expect(manager.blockElement).toBeUndefined();
            expect(manager.cmdId).toBe('openBlock');
        });

        test('stores container references', () => {
            expect(manager.rootContainer).toBe(mockRootContainer);
            expect(manager.breadcrumb).toBe(mockBreadcrumb);
            expect(manager.treeNavigation).toBe(mockTreeNavigation);
        });
    });

    describe('setCmd', () => {
        test('sets command id from string', () => {
            manager.setCmd('testCommand');
            expect(manager.cmdId).toBe('testCommand');
        });

        test('sets command id from object', () => {
            const cmd = { id: 'objectCommand' };
            manager.setCmd(cmd);
            expect(manager.cmdId).toBe('objectCommand');
        });

        test('resets to openBlock when same command is set twice', () => {
            const cmd = { id: 'toggleCommand' };
            manager.setCmd(cmd);
            expect(manager.cmdId).toBe('toggleCommand');

            manager.setCmd(cmd);
            expect(manager.cmdId).toBe('openBlock');
        });

        test('calls btnExec if provided', () => {
            const btnExec = jest.fn();
            const cmd = { id: 'btnCommand', btnExec };

            manager.setCmd(cmd);

            expect(btnExec).toHaveBeenCalledWith(manager);
        });

        test('updates active button indicator text', () => {
            manager.setCmd('indicatorTest');
            expect(manager.activeBtnIndicator.innerText).toBe('indicatorTest');
        });
    });

    describe('getCmd', () => {
        test('returns current command id', () => {
            manager.cmdId = 'currentCmd';
            expect(manager.getCmd()).toBe('currentCmd');
        });
    });

    describe('setEvent', () => {
        test('stores event reference', () => {
            const event = { type: 'click' };
            manager.setEvent(event);
            expect(manager.event).toBe(event);
        });
    });

    describe('findParentWithAttribute', () => {
        test('finds parent element with specified attribute', () => {
            const parent = document.createElement('div');
            parent.setAttribute('block', 'true');

            const child = document.createElement('span');
            parent.appendChild(child);

            const result = manager.findParentWithAttribute(child, 'block');
            expect(result).toBe(parent);
        });

        test('returns element itself if it has attribute', () => {
            const element = document.createElement('div');
            element.setAttribute('block', 'true');

            const result = manager.findParentWithAttribute(element, 'block');
            expect(result).toBe(element);
        });

        test('returns null if no parent has attribute', () => {
            const element = document.createElement('div');
            document.body.appendChild(element);

            const result = manager.findParentWithAttribute(element, 'nonexistent');
            expect(result).toBeNull();
        });
    });

    describe('addActiveClass / removeActiveClass', () => {
        test('adds block-active class to blockElement', () => {
            const block = document.createElement('div');
            manager.blockElement = block;

            manager.addActiveClass();

            expect(block.classList.contains('block-active')).toBe(true);
        });

        test('adds block-link-active class to blockLinkElement', () => {
            const link = document.createElement('div');
            manager.blockLinkElement = link;

            manager.addActiveClass();

            expect(link.classList.contains('block-link-active')).toBe(true);
        });

        test('removes block-active class from blockElement', () => {
            const block = document.createElement('div');
            block.classList.add('block-active');
            manager.blockElement = block;

            manager.removeActiveClass();

            expect(block.classList.contains('block-active')).toBe(false);
        });

        test('removes block-link-active class from blockLinkElement', () => {
            const link = document.createElement('div');
            link.classList.add('block-link-active');
            manager.blockLinkElement = link;

            manager.removeActiveClass();

            expect(link.classList.contains('block-link-active')).toBe(false);
        });
    });

    describe('getActiveElement', () => {
        test('returns blockLinkElement if set', () => {
            const link = document.createElement('div');
            const block = document.createElement('div');
            manager.blockLinkElement = link;
            manager.blockElement = block;

            expect(manager.getActiveElement()).toBe(link);
        });

        test('returns blockElement if no link', () => {
            const block = document.createElement('div');
            manager.blockElement = block;

            expect(manager.getActiveElement()).toBe(block);
        });

        test('returns first child of rootContainer as fallback', () => {
            const child = document.createElement('div');
            mockRootContainer.appendChild(child);

            expect(manager.getActiveElement()).toBe(child);
        });
    });

    describe('toggleActiveButton', () => {
        test('adds active-button class to element', () => {
            const btn = document.createElement('button');
            btn.id = 'testBtn';
            document.body.appendChild(btn);

            manager.toggleActiveButton('testBtn');

            expect(btn.classList.contains('active-button')).toBe(true);
            expect(manager.activeBtnElem).toBe(btn);
        });

        test('removes active-button class from previous element', () => {
            const oldBtn = document.createElement('button');
            oldBtn.id = 'oldBtn';
            oldBtn.classList.add('active-button');

            const newBtn = document.createElement('button');
            newBtn.id = 'newBtn';

            document.body.appendChild(oldBtn);
            document.body.appendChild(newBtn);

            manager.activeBtnElem = oldBtn;
            manager.toggleActiveButton('newBtn');

            expect(oldBtn.classList.contains('active-button')).toBe(false);
            expect(newBtn.classList.contains('active-button')).toBe(true);
        });
    });

    describe('submitPopup / closePopups', () => {
        test('submitPopup calls handleSubmit and resets state', () => {
            const mockPopup = {
                handleSubmit: jest.fn()
            };
            manager.popup = mockPopup;
            manager.mode = 'popup';

            manager.submitPopup();

            expect(mockPopup.handleSubmit).toHaveBeenCalled();
            expect(manager.popup).toBeUndefined();
            expect(manager.mode).toBe('normal');
        });

        test('closePopups calls handleCancel and resets state', () => {
            const mockPopup = {
                handleCancel: jest.fn()
            };
            manager.popup = mockPopup;
            manager.mode = 'popup';

            manager.closePopups();

            expect(mockPopup.handleCancel).toHaveBeenCalled();
            expect(manager.popup).toBeUndefined();
            expect(manager.mode).toBe('normal');
        });

        test('submitPopup does nothing without popup', () => {
            manager.popup = undefined;
            expect(() => manager.submitPopup()).not.toThrow();
        });

        test('closePopups does nothing without popup', () => {
            manager.popup = undefined;
            expect(() => manager.closePopups()).not.toThrow();
        });
    });

    describe('keydown/keyup handlers', () => {
        test('keydownHandler sets shiftLock on Shift', () => {
            manager.keydownHandler({ key: 'Shift' });
            expect(manager.shiftLock).toBe(true);
        });

        test('keydownHandler sets shiftLock on minus', () => {
            manager.keydownHandler({ key: '-' });
            expect(manager.shiftLock).toBe(true);
        });

        test('keyupHandler clears shiftLock on Shift', () => {
            manager.shiftLock = true;
            manager.keyupHandler({ key: 'Shift' });
            expect(manager.shiftLock).toBe(false);
        });
    });

    describe('setActiveBlock', () => {
        test('sets blockElement when found', () => {
            const block = document.createElement('div');
            block.setAttribute('block', 'true');
            block.id = 'test-block';
            mockRootContainer.appendChild(block);

            const result = manager.setActiveBlock(block);

            expect(manager.blockElement).toBe(block);
            expect(result).toBe(block);
        });

        test('returns undefined for non-block element', () => {
            const div = document.createElement('div');
            mockRootContainer.appendChild(div);

            const result = manager.setActiveBlock(div);

            expect(result).toBeUndefined();
        });
    });

    describe('setDisActiveBlock', () => {
        test('clears blockElement and blockLinkElement', () => {
            manager.blockElement = document.createElement('div');
            manager.blockLinkElement = document.createElement('div');

            manager.setDisActiveBlock(null);

            expect(manager.blockElement).toBeUndefined();
            expect(manager.blockLinkElement).toBeUndefined();
        });
    });

    describe('multi-selection', () => {
        test('initializes with empty selectedBlocks and selectedElements', () => {
            expect(manager.selectedBlocks.size).toBe(0);
            expect(manager.selectedElements.size).toBe(0);
        });

        test('hasMultiSelection returns false when no blocks selected', () => {
            expect(manager.hasMultiSelection()).toBe(false);
        });

        test('hasMultiSelection returns true when blocks are selected', () => {
            manager.selectedBlocks.add('block-1');
            expect(manager.hasMultiSelection()).toBe(true);
        });

        test('getSelectedBlockIds returns array of selected block ids', () => {
            manager.selectedBlocks.add('block-1');
            manager.selectedBlocks.add('block-2');

            const ids = manager.getSelectedBlockIds();

            expect(ids).toContain('block-1');
            expect(ids).toContain('block-2');
            expect(ids.length).toBe(2);
        });

        test('addToSelection adds block to selection', () => {
            const block = document.createElement('div');
            block.id = 'block-1';

            manager.addToSelection('block-1', block, null);

            expect(manager.selectedBlocks.has('block-1')).toBe(true);
            expect(manager.selectedElements.get('block-1').element).toBe(block);
            expect(block.classList.contains('block-multi-selected')).toBe(true);
        });

        test('removeFromSelection removes block from selection', () => {
            const block = document.createElement('div');
            block.id = 'block-1';
            block.classList.add('block-multi-selected');

            manager.selectedBlocks.add('block-1');
            manager.selectedElements.set('block-1', { element: block, linkElement: null });

            manager.removeFromSelection('block-1');

            expect(manager.selectedBlocks.has('block-1')).toBe(false);
            expect(manager.selectedElements.has('block-1')).toBe(false);
            expect(block.classList.contains('block-multi-selected')).toBe(false);
        });

        test('clearSelection removes all selected blocks', () => {
            const block1 = document.createElement('div');
            block1.classList.add('block-multi-selected');
            const block2 = document.createElement('div');
            block2.classList.add('block-multi-selected');

            manager.selectedBlocks.add('block-1');
            manager.selectedBlocks.add('block-2');
            manager.selectedElements.set('block-1', { element: block1, linkElement: null });
            manager.selectedElements.set('block-2', { element: block2, linkElement: null });

            manager.clearSelection();

            expect(manager.selectedBlocks.size).toBe(0);
            expect(manager.selectedElements.size).toBe(0);
            expect(block1.classList.contains('block-multi-selected')).toBe(false);
            expect(block2.classList.contains('block-multi-selected')).toBe(false);
        });

        test('toggleBlockSelection adds block when not selected', () => {
            const parent = document.createElement('div');
            parent.id = 'parent-1';
            parent.setAttribute('block', 'true');

            const block = document.createElement('div');
            block.id = 'block-1';
            block.setAttribute('block', 'true');
            parent.appendChild(block);
            mockRootContainer.appendChild(parent);

            const result = manager.toggleBlockSelection(block, null);

            expect(result).toBe(true);
            expect(manager.selectedBlocks.has('block-1')).toBe(true);
        });

        test('toggleBlockSelection removes block when already selected', () => {
            const parent = document.createElement('div');
            parent.id = 'parent-1';
            parent.setAttribute('block', 'true');

            const block = document.createElement('div');
            block.id = 'block-1';
            block.setAttribute('block', 'true');
            parent.appendChild(block);
            mockRootContainer.appendChild(parent);

            manager.addToSelection('block-1', block, null);

            const result = manager.toggleBlockSelection(block, null);

            expect(result).toBe(false);
            expect(manager.selectedBlocks.has('block-1')).toBe(false);
        });

        test('toggleBlockSelection returns false for root block', () => {
            const block = document.createElement('div');
            block.id = 'root-block';
            block.setAttribute('block', 'true');
            mockRootContainer.appendChild(block);

            const result = manager.toggleBlockSelection(block, null);

            expect(result).toBe(false);
            expect(manager.selectedBlocks.size).toBe(0);
        });

        test('addSelectionClass adds class to linkElement if present', () => {
            const block = document.createElement('div');
            const link = document.createElement('div');

            manager.addSelectionClass(block, link);

            expect(link.classList.contains('block-multi-selected')).toBe(true);
            expect(block.classList.contains('block-multi-selected')).toBe(false);
        });

        test('removeSelectionClass removes class from both elements', () => {
            const block = document.createElement('div');
            block.classList.add('block-multi-selected');
            const link = document.createElement('div');
            link.classList.add('block-multi-selected');

            manager.removeSelectionClass(block, link);

            expect(block.classList.contains('block-multi-selected')).toBe(false);
            expect(link.classList.contains('block-multi-selected')).toBe(false);
        });

        test('refreshSelectionVisuals updates DOM references', () => {
            // Setup block in DOM
            const block = document.createElement('div');
            block.id = 'block-1';
            document.body.appendChild(block);

            manager.selectedBlocks.add('block-1');
            manager.selectedElements.set('block-1', { element: null, linkElement: null });

            manager.refreshSelectionVisuals();

            expect(manager.selectedElements.get('block-1').element).toBe(block);
            expect(block.classList.contains('block-multi-selected')).toBe(true);
        });

        test('refreshSelectionVisuals removes blocks no longer in DOM', () => {
            manager.selectedBlocks.add('missing-block');
            manager.selectedElements.set('missing-block', { element: null, linkElement: null });

            manager.refreshSelectionVisuals();

            expect(manager.selectedBlocks.has('missing-block')).toBe(false);
            expect(manager.selectedElements.has('missing-block')).toBe(false);
        });
    });
});

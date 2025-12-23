import hotkeys from 'hotkeys-js';

// Mock dependencies
jest.mock('hotkeys-js', () => {
    const mockHotkeys = jest.fn();
    mockHotkeys.unbind = jest.fn();
    mockHotkeys.filter = null;
    return mockHotkeys;
});

jest.mock('../../../controller/comands/commands.js', () => ({
    commands: [
        {
            id: 'testCommand1',
            mode: ['normal'],
            defaultHotkey: 'ctrl+t',
            description: 'Test command 1',
            execute: jest.fn()
        },
        {
            id: 'testCommand2',
            mode: ['edit'],
            defaultHotkey: 'ctrl+e',
            description: 'Test command 2',
            execute: jest.fn()
        },
        {
            id: 'escape',
            mode: ['*'],
            defaultHotkey: 'esc',
            description: 'Escape',
            execute: jest.fn()
        },
        {
            id: 'noHotkey',
            mode: ['normal'],
            description: 'Command without hotkey',
            execute: jest.fn()
        }
    ]
}));

jest.mock('../../../controller/comands/contextManager', () => ({
    ContextManager: jest.fn().mockImplementation(() => ({
        mode: 'normal',
        blockElement: null,
        setEvent: jest.fn(),
        setCmd: jest.fn(),
        getCmd: jest.fn().mockReturnValue('testCommand1')
    }))
}));

jest.mock('../../../controller/comands/uiManager', () => ({
    uiManager: {
        renderBtn: jest.fn(),
        reRenderBtn: jest.fn()
    }
}));

jest.mock('../../../utils/utils', () => ({
    dispatch: jest.fn()
}));

jest.mock('../../../utils/functions', () => ({
    isExcludedElement: jest.fn().mockReturnValue(false),
    throttle: jest.fn((fn) => fn)
}));

import { CommandManager } from '../../../controller/comands/comandManager';
import { ContextManager } from '../../../controller/comands/contextManager';
import { uiManager } from '../../../controller/comands/uiManager';
import { commands } from '../../../controller/comands/commands.js';
import { dispatch } from '../../../utils/utils';
import { isExcludedElement } from '../../../utils/functions';

describe('CommandManager', () => {
    let manager;
    let mockRootContainer;
    let mockBreadcrumb;
    let mockTreeNavigation;
    let mockControlPanel;
    let mockTopSidebar;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup DOM elements
        mockRootContainer = document.createElement('div');
        mockRootContainer.id = 'rootContainer';

        mockBreadcrumb = document.createElement('div');
        mockBreadcrumb.id = 'breadcrumb';

        mockTreeNavigation = document.createElement('div');
        mockTreeNavigation.id = 'treeNavigation';

        mockControlPanel = document.createElement('div');
        mockControlPanel.id = 'control-panel';

        mockTopSidebar = document.createElement('div');
        mockTopSidebar.id = 'topSidebar';

        document.body.appendChild(mockRootContainer);
        document.body.appendChild(mockBreadcrumb);
        document.body.appendChild(mockTreeNavigation);
        document.body.appendChild(mockControlPanel);
        document.body.appendChild(mockTopSidebar);

        manager = new CommandManager('rootContainer', 'breadcrumb', 'treeNavigation', {});
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('constructor', () => {
        test('initializes with correct properties', () => {
            expect(manager.rootContainer.id).toBe('rootContainer');
            expect(manager.commandsById).toBeDefined();
            expect(manager.hotkeysMap).toEqual({});
        });

        test('creates ContextManager instance', () => {
            expect(ContextManager).toHaveBeenCalledWith(
                mockRootContainer,
                mockBreadcrumb,
                mockTreeNavigation
            );
        });

        test('calls uiManager.renderBtn on init', () => {
            expect(uiManager.renderBtn).toHaveBeenCalledWith('normal', manager.commandsById);
        });
    });

    describe('registerCommand', () => {
        test('registers command with hotkey', () => {
            const cmd = {
                id: 'newCmd',
                mode: ['normal'],
                defaultHotkey: 'ctrl+n',
                execute: jest.fn()
            };

            manager.registerCommand(cmd);

            expect(manager.commandsById['newCmd']).toBe(cmd);
            expect(cmd.currentHotkey).toBe('ctrl+n');
        });

        test('uses custom hotkey from hotkeysMap if provided', () => {
            manager.hotkeysMap = { customCmd: 'ctrl+shift+c' };

            const cmd = {
                id: 'customCmd',
                mode: ['normal'],
                defaultHotkey: 'ctrl+c',
                execute: jest.fn()
            };

            manager.registerCommand(cmd);

            expect(cmd.currentHotkey).toBe('ctrl+shift+c');
        });

        test('does not register command without hotkey', () => {
            const cmd = {
                id: 'noHotkeyCmd',
                mode: ['normal'],
                execute: jest.fn()
            };

            manager.registerCommand(cmd);

            expect(manager.commandsById['noHotkeyCmd']).toBe(cmd);
            expect(cmd.currentHotkey).toBeUndefined();
        });

        test('skips registration for link page if regLink is false', () => {
            manager.isLink = true;

            const cmd = {
                id: 'noLinkCmd',
                mode: ['normal'],
                defaultHotkey: 'ctrl+l',
                regLink: false,
                execute: jest.fn()
            };

            manager.registerCommand(cmd);

            expect(manager.commandsById['noLinkCmd']).toBeUndefined();
        });

        test('registers command for link page if regLink is true', () => {
            manager.isLink = true;

            const cmd = {
                id: 'linkCmd',
                mode: ['normal'],
                defaultHotkey: 'ctrl+l',
                regLink: true,
                execute: jest.fn()
            };

            manager.registerCommand(cmd);

            expect(manager.commandsById['linkCmd']).toBe(cmd);
        });
    });

    describe('executeCommand', () => {
        test('executes command when mode matches', () => {
            const mockExecute = jest.fn();
            manager.commandsById['testCommand1'] = {
                id: 'testCommand1',
                mode: ['normal'],
                execute: mockExecute
            };

            const ctx = {
                getCmd: () => 'testCommand1',
                mode: 'normal'
            };

            manager.executeCommand(ctx);

            expect(mockExecute).toHaveBeenCalledWith(ctx);
        });

        test('executes command when mode is wildcard', () => {
            const mockExecute = jest.fn();
            manager.commandsById['wildcardCmd'] = {
                id: 'wildcardCmd',
                mode: ['*'],
                execute: mockExecute
            };

            const ctx = {
                getCmd: () => 'wildcardCmd',
                mode: 'anyMode'
            };

            manager.executeCommand(ctx);

            expect(mockExecute).toHaveBeenCalledWith(ctx);
        });

        test('does not execute command when mode does not match', () => {
            const mockExecute = jest.fn();
            manager.commandsById['editOnlyCmd'] = {
                id: 'editOnlyCmd',
                mode: ['edit'],
                execute: mockExecute
            };

            const ctx = {
                getCmd: () => 'editOnlyCmd',
                mode: 'normal',
                setCmd: jest.fn()
            };

            jest.useFakeTimers();
            manager.executeCommand(ctx);
            jest.advanceTimersByTime(100);

            expect(mockExecute).not.toHaveBeenCalled();
            expect(ctx.setCmd).toHaveBeenCalledWith('openBlock');

            jest.useRealTimers();
        });

        test('always executes escape command', () => {
            const mockExecute = jest.fn();
            manager.commandsById['escape'] = {
                id: 'escape',
                mode: ['*'],
                execute: mockExecute
            };

            const ctx = {
                getCmd: () => 'escape',
                mode: 'anyMode'
            };

            manager.executeCommand(ctx);

            expect(mockExecute).toHaveBeenCalledWith(ctx);
        });

        test('does nothing for non-existent command', () => {
            const ctx = {
                getCmd: () => 'nonExistent',
                mode: 'normal'
            };

            expect(() => manager.executeCommand(ctx)).not.toThrow();
        });
    });

    describe('resetAndReRegisterCommands', () => {
        test('unbinds old hotkeys and re-registers commands', async () => {
            manager.commandsById['oldCmd'] = {
                id: 'oldCmd',
                currentHotkey: 'ctrl+o'
            };

            await manager.resetAndReRegisterCommands({ testCommand1: 'ctrl+shift+t' });

            expect(hotkeys.unbind).toHaveBeenCalledWith('ctrl+o');
            expect(uiManager.reRenderBtn).toHaveBeenCalled();
        });
    });

    describe('clickOnRootContainerHandler', () => {
        test('opens external link in new tab', () => {
            const mockOpen = jest.spyOn(window, 'open').mockImplementation();
            const link = document.createElement('a');
            link.href = 'https://example.com';

            const event = {
                target: link,
                preventDefault: jest.fn()
            };

            manager.clickOnRootContainerHandler(event);

            expect(event.preventDefault).toHaveBeenCalled();
            expect(mockOpen).toHaveBeenCalledWith(expect.stringContaining('example.com'), '_blank');

            mockOpen.mockRestore();
        });

        test('dispatches OpenBlock for block-tag-link', () => {
            const link = document.createElement('a');
            link.href = 'block:/block-123';
            link.classList.add('block-tag-link');

            const event = {
                target: link,
                preventDefault: jest.fn()
            };

            manager.clickOnRootContainerHandler(event);

            expect(dispatch).toHaveBeenCalledWith('OpenBlock', {
                id: 'block-123',
                parentHsl: [],
                isIframe: false,
                links: []
            });
        });

        test('ignores click on excluded elements', () => {
            isExcludedElement.mockReturnValueOnce(true);

            const div = document.createElement('div');
            const event = { target: div };

            manager.clickOnRootContainerHandler(event);

            expect(isExcludedElement).toHaveBeenCalled();
        });
    });

    describe('clickOnControlPanel', () => {
        test('sets command when clicking on button', () => {
            // Mock setCmd on the actual instance
            manager.ctxManager.setCmd = jest.fn();

            const button = document.createElement('button');
            button.id = 'testCommand1';
            manager.commandsById['testCommand1'] = { id: 'testCommand1' };

            const event = { target: button };

            manager.clickOnControlPanel(event);

            expect(manager.ctxManager.setCmd).toHaveBeenCalled();
        });

        test('ignores non-button clicks', () => {
            manager.ctxManager.setCmd = jest.fn();

            const div = document.createElement('div');
            const event = { target: div };

            manager.clickOnControlPanel(event);

            expect(manager.ctxManager.setCmd).not.toHaveBeenCalled();
        });
    });

    describe('clickOnTopNavigation', () => {
        test('sets command when clicking on top-btn', () => {
            manager.ctxManager.setCmd = jest.fn();

            const button = document.createElement('div');
            button.id = 'testCommand1';
            button.classList.add('top-btn');
            manager.commandsById['testCommand1'] = { id: 'testCommand1' };

            const event = { target: button };

            manager.clickOnTopNavigation(event);

            expect(manager.ctxManager.setCmd).toHaveBeenCalled();
        });
    });
});

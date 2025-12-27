// Mock localforage before importing UIManager
jest.mock('localforage', () => ({
    getItem: jest.fn(() => Promise.resolve('testUser'))
}));

// Mock commands
jest.mock('../../../controller/comands/commands.js', () => ({
    commands: []
}));

import { UIManager, submenuConfig } from '../../../controller/comands/uiManager';
import localforage from 'localforage';

describe('UIManager', () => {
    let uiManager;
    let mockControlPanel;
    let mockTopBtnContainer;

    beforeEach(() => {
        // Setup DOM
        mockControlPanel = document.createElement('div');
        mockControlPanel.id = 'control-panel';

        mockTopBtnContainer = document.createElement('div');
        mockTopBtnContainer.id = 'top-btn-container';

        document.body.appendChild(mockControlPanel);
        document.body.appendChild(mockTopBtnContainer);

        uiManager = new UIManager();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        jest.clearAllMocks();
    });

    describe('submenuConfig', () => {
        test('has connections submenu configured', () => {
            expect(submenuConfig.connections).toBeDefined();
            expect(submenuConfig.connections.id).toBe('submenu-connections');
            expect(submenuConfig.connections.items).toContain('connectBlock');
            expect(submenuConfig.connections.items).toContain('deleteConnectBlock');
        });

        test('has extra submenu configured', () => {
            expect(submenuConfig.extra).toBeDefined();
            expect(submenuConfig.extra.id).toBe('submenu-extra');
            expect(submenuConfig.extra.items).toContain('createUrl');
            expect(submenuConfig.extra.items).toContain('editBlock');
        });

        test('has notifications submenu configured', () => {
            expect(submenuConfig.notifications).toBeDefined();
            expect(submenuConfig.notifications.id).toBe('submenu-notifications');
            expect(submenuConfig.notifications.items).toContain('notificationSettings');
            expect(submenuConfig.notifications.items).toContain('blockReminder');
            expect(submenuConfig.notifications.items).toContain('watchBlock');
        });
    });

    describe('createSubmenuButton', () => {
        test('creates button with correct attributes', () => {
            const button = uiManager.createSubmenuButton(submenuConfig.connections);

            expect(button.id).toBe('submenu-connections');
            expect(button.classList.contains('submenu-trigger')).toBe(true);
            expect(button.getAttribute('aria-haspopup')).toBe('true');
            expect(button.getAttribute('aria-expanded')).toBe('false');
            expect(button.getAttribute('aria-label')).toBe('Соединения');
        });

        test('creates button with correct icon class', () => {
            const button = uiManager.createSubmenuButton(submenuConfig.extra);

            expect(button.classList.contains('fa-bars')).toBe(true);
        });
    });

    describe('handleSubmenuClick', () => {
        test('returns true and closes submenu on back button click', () => {
            uiManager.activeSubmenu = 'submenu-connections';
            uiManager.commandsById = {};
            uiManager.mode = 'normal';
            // Mock reRenderBtn to avoid localforage call
            uiManager.reRenderBtn = jest.fn();

            const result = uiManager.handleSubmenuClick('submenu-back', {});

            expect(result).toBe(true);
            expect(uiManager.activeSubmenu).toBeNull();
            expect(uiManager.reRenderBtn).toHaveBeenCalled();
        });

        test('returns true and opens submenu on submenu trigger click', () => {
            uiManager.commandsById = {};

            const result = uiManager.handleSubmenuClick('submenu-connections', {});

            expect(result).toBe(true);
            expect(uiManager.activeSubmenu).toBe('submenu-connections');
        });

        test('returns false for non-submenu buttons', () => {
            const result = uiManager.handleSubmenuClick('someCommand', {});

            expect(result).toBe(false);
        });
    });

    describe('openSubmenu', () => {
        test('renders back button with ARIA attributes', () => {
            uiManager.commandsById = {};

            uiManager.openSubmenu('submenu-connections', {});

            const backBtn = mockControlPanel.querySelector('#submenu-back');
            expect(backBtn).not.toBeNull();
            expect(backBtn.getAttribute('aria-label')).toBe('Вернуться в главное меню');
        });

        test('sets menu role on container', () => {
            uiManager.commandsById = {};

            uiManager.openSubmenu('submenu-connections', {});

            expect(mockControlPanel.getAttribute('role')).toBe('menu');
            expect(mockControlPanel.getAttribute('aria-label')).toBe('Соединения');
        });

        test('renders command buttons with menuitem role', () => {
            uiManager.commandsById = {
                connectBlock: {
                    id: 'connectBlock',
                    btn: {
                        label: 'Test Label',
                        classes: ['sidebar-button', 'fas', 'fa-test']
                    },
                    currentHotkey: 'a'
                }
            };

            uiManager.openSubmenu('submenu-connections', {});

            const cmdBtn = mockControlPanel.querySelector('#connectBlock');
            expect(cmdBtn).not.toBeNull();
            expect(cmdBtn.getAttribute('role')).toBe('menuitem');
            expect(cmdBtn.getAttribute('aria-label')).toBe('Test Label');
        });

        test('renders nested submenu buttons', () => {
            uiManager.commandsById = {};

            uiManager.openSubmenu('submenu-extra', {});

            const nestedBtn = mockControlPanel.querySelector('#submenu-notifications');
            expect(nestedBtn).not.toBeNull();
            expect(nestedBtn.getAttribute('aria-haspopup')).toBe('true');
        });
    });

    describe('isSubmenuOpen', () => {
        test('returns false when no submenu is open', () => {
            expect(uiManager.isSubmenuOpen()).toBe(false);
        });

        test('returns true when submenu is open', () => {
            uiManager.activeSubmenu = 'submenu-connections';
            expect(uiManager.isSubmenuOpen()).toBe(true);
        });
    });

    describe('closeSubmenu', () => {
        test('resets activeSubmenu to null and calls reRenderBtn', () => {
            uiManager.activeSubmenu = 'submenu-connections';
            uiManager.commandsById = {};
            uiManager.mode = 'normal';
            // Mock reRenderBtn to avoid localforage call
            const originalReRenderBtn = uiManager.reRenderBtn;
            uiManager.reRenderBtn = jest.fn();

            uiManager.closeSubmenu();

            expect(uiManager.activeSubmenu).toBeNull();
            expect(uiManager.reRenderBtn).toHaveBeenCalledWith({});

            // Restore
            uiManager.reRenderBtn = originalReRenderBtn;
        });
    });
});

// Mock chatApi
jest.mock('../../api/chatApi.js', () => ({
    __esModule: true,
    default: {
        getUnreadCount: jest.fn()
    }
}));

import { chatBadgeManager } from '../../controller/chatBadgeManager.js';
import chatApi from '../../api/chatApi.js';

describe('ChatBadgeManager', () => {
    let originalGetElementById;

    beforeEach(() => {
        // Reset manager state
        chatBadgeManager.initialized = false;
        chatBadgeManager.initialLoadDone = false;
        chatBadgeManager.unreadCount = 0;

        // Clear DOM
        document.body.innerHTML = '';

        // Create mock button
        const button = document.createElement('button');
        button.id = 'unifiedChat';
        document.body.appendChild(button);

        // Reset mocks
        chatApi.getUnreadCount.mockReset();
        chatApi.getUnreadCount.mockResolvedValue({ data: { dm: 0, groups: 0 } });

        jest.useFakeTimers();
    });

    afterEach(() => {
        // Cleanup
        chatBadgeManager.destroy();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('init', () => {
        test('should set initialized flag', async () => {
            await chatBadgeManager.init();
            expect(chatBadgeManager.initialized).toBe(true);
        });

        test('should not init twice', async () => {
            await chatBadgeManager.init();
            const firstInit = chatBadgeManager.initialized;
            await chatBadgeManager.init();
            expect(chatBadgeManager.initialized).toBe(firstInit);
        });

        test('should create badge on fallback timeout if button exists', async () => {
            await chatBadgeManager.init();
            jest.advanceTimersByTime(100);

            const badge = document.getElementById('chat-unread-badge');
            expect(badge).not.toBeNull();
        });
    });

    describe('destroy', () => {
        test('should reset initialized flags', async () => {
            await chatBadgeManager.init();
            chatBadgeManager.destroy();

            expect(chatBadgeManager.initialized).toBe(false);
            expect(chatBadgeManager.initialLoadDone).toBe(false);
        });
    });

    describe('createBadge', () => {
        test('should create badge element', () => {
            chatBadgeManager.createBadge();

            const badge = document.getElementById('chat-unread-badge');
            expect(badge).not.toBeNull();
            expect(badge.className).toBe('chat-button-badge');
            expect(badge.getAttribute('data-testid')).toBe('chat-unread-badge');
        });

        test('should add class to button', () => {
            chatBadgeManager.createBadge();

            const button = document.getElementById('unifiedChat');
            expect(button.classList.contains('chat-button-with-badge')).toBe(true);
        });

        test('should not create duplicate badge', () => {
            chatBadgeManager.createBadge();
            chatBadgeManager.createBadge();

            const badges = document.querySelectorAll('#chat-unread-badge');
            expect(badges.length).toBe(1);
        });

        test('should handle missing button gracefully', () => {
            document.body.innerHTML = '';
            expect(() => chatBadgeManager.createBadge()).not.toThrow();
        });
    });

    describe('updateBadgeDisplay', () => {
        beforeEach(() => {
            chatBadgeManager.createBadge();
        });

        test('should show count when > 0', () => {
            chatBadgeManager.unreadCount = 5;
            chatBadgeManager.updateBadgeDisplay();

            const badge = document.getElementById('chat-unread-badge');
            expect(badge.textContent).toBe('5');
            expect(badge.style.display).toBe('');
        });

        test('should hide badge when count is 0', () => {
            chatBadgeManager.unreadCount = 0;
            chatBadgeManager.updateBadgeDisplay();

            const badge = document.getElementById('chat-unread-badge');
            expect(badge.style.display).toBe('none');
        });

        test('should show 99+ for counts over 99', () => {
            chatBadgeManager.unreadCount = 150;
            chatBadgeManager.updateBadgeDisplay();

            const badge = document.getElementById('chat-unread-badge');
            expect(badge.textContent).toBe('99+');
        });

        test('should handle invalid count gracefully', () => {
            chatBadgeManager.unreadCount = 'invalid';
            chatBadgeManager.updateBadgeDisplay();

            const badge = document.getElementById('chat-unread-badge');
            expect(badge.style.display).toBe('none');
        });
    });

    describe('handleUnreadUpdate', () => {
        beforeEach(() => {
            chatBadgeManager.createBadge();
        });

        test('should update count from total', () => {
            chatBadgeManager.handleUnreadUpdate({ total: 10 });

            expect(chatBadgeManager.unreadCount).toBe(10);
        });

        test('should calculate count from dm + groups', () => {
            chatBadgeManager.handleUnreadUpdate({ dm: 3, groups: 7 });

            expect(chatBadgeManager.unreadCount).toBe(10);
        });

        test('should handle missing values', () => {
            chatBadgeManager.handleUnreadUpdate({});

            expect(chatBadgeManager.unreadCount).toBe(0);
        });

        test('should parse string values', () => {
            chatBadgeManager.handleUnreadUpdate({ dm: '5', groups: '3' });

            expect(chatBadgeManager.unreadCount).toBe(8);
        });
    });

    describe('loadInitialCount', () => {
        beforeEach(() => {
            chatBadgeManager.createBadge();
        });

        test('should load count from API', async () => {
            chatApi.getUnreadCount.mockResolvedValue({
                data: { dm: 2, groups: 3 }
            });

            await chatBadgeManager.loadInitialCount();

            expect(chatBadgeManager.unreadCount).toBe(5);
        });

        test('should handle dm_unread format', async () => {
            chatApi.getUnreadCount.mockResolvedValue({
                data: { dm_unread: 4, groups_unread: 1 }
            });

            await chatBadgeManager.loadInitialCount();

            expect(chatBadgeManager.unreadCount).toBe(5);
        });

        test('should handle API error gracefully', async () => {
            chatApi.getUnreadCount.mockRejectedValue(new Error('Network error'));

            await expect(chatBadgeManager.loadInitialCount()).resolves.not.toThrow();
        });
    });

    describe('reset', () => {
        test('should reset count to 0', () => {
            chatBadgeManager.createBadge();
            chatBadgeManager.unreadCount = 10;
            chatBadgeManager.updateBadgeDisplay();

            chatBadgeManager.reset();

            expect(chatBadgeManager.unreadCount).toBe(0);
            const badge = document.getElementById('chat-unread-badge');
            expect(badge.style.display).toBe('none');
        });
    });

    describe('event handlers', () => {
        beforeEach(async () => {
            await chatBadgeManager.init();
            jest.advanceTimersByTime(100);
        });

        test('should reload count from server on NewDirectMessage (debounced)', async () => {
            chatApi.getUnreadCount.mockResolvedValue({
                data: { dm: 3, groups: 2 }
            });

            window.dispatchEvent(new CustomEvent('NewDirectMessage', {
                detail: { senderId: 1, message: {} }
            }));

            // Should not load immediately (debounced)
            expect(chatApi.getUnreadCount).toHaveBeenCalledTimes(1); // only initial call

            // Wait for debounce (300ms)
            jest.advanceTimersByTime(300);
            await Promise.resolve();

            expect(chatApi.getUnreadCount).toHaveBeenCalledTimes(2);
            expect(chatBadgeManager.unreadCount).toBe(5); // 3 + 2
        });

        test('should reload count from server on NewGroupMessage (debounced)', async () => {
            chatApi.getUnreadCount.mockResolvedValue({
                data: { dm: 1, groups: 4 }
            });

            window.dispatchEvent(new CustomEvent('NewGroupMessage', {
                detail: { groupId: 1, message: {} }
            }));

            // Wait for debounce (300ms)
            jest.advanceTimersByTime(300);
            await Promise.resolve();

            expect(chatBadgeManager.unreadCount).toBe(5); // 1 + 4
        });

        test('should reload count on ChatMessagesRead (debounced)', async () => {
            chatApi.getUnreadCount.mockResolvedValue({
                data: { dm: 1, groups: 0 }
            });

            window.dispatchEvent(new CustomEvent('ChatMessagesRead', {
                detail: { type: 'dm', id: 1 }
            }));

            // Wait for debounce (300ms)
            jest.advanceTimersByTime(300);
            await Promise.resolve();

            expect(chatApi.getUnreadCount).toHaveBeenCalled();
            expect(chatBadgeManager.unreadCount).toBe(1); // 1 + 0
        });

        test('should reset on Logout', () => {
            chatBadgeManager.unreadCount = 10;

            window.dispatchEvent(new CustomEvent('Logout'));

            expect(chatBadgeManager.unreadCount).toBe(0);
            expect(chatBadgeManager.initialLoadDone).toBe(false);
        });

        test('should update on ChatUnreadCountUpdate', () => {
            window.dispatchEvent(new CustomEvent('ChatUnreadCountUpdate', {
                detail: { dm: 3, groups: 2 }
            }));

            expect(chatBadgeManager.unreadCount).toBe(5);
        });
    });
});

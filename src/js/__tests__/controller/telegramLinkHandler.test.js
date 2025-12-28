// Create mock functions first
const mockConfirmTelegramLink = jest.fn();
const mockNotificationSettingsPopup = jest.fn();

// Mock modules
jest.mock('../../api/api.js', () => ({
    __esModule: true,
    default: {
        confirmTelegramLink: jest.fn()
    }
}));

jest.mock('../../controller/popups/notificationSettingsPopup.js', () => ({
    NotificationSettingsPopup: jest.fn()
}));

import { handleTelegramLinkCallback } from '../../controller/telegramLinkHandler.js';
import api from '../../api/api.js';
import { NotificationSettingsPopup } from '../../controller/popups/notificationSettingsPopup.js';

describe('telegramLinkHandler', () => {
    beforeEach(() => {
        // Mock window.history.replaceState
        jest.spyOn(window.history, 'replaceState').mockImplementation(() => {});

        // Clear DOM
        document.body.innerHTML = '';

        // Reset mocks - need to check if they exist
        if (api.confirmTelegramLink && api.confirmTelegramLink.mockReset) {
            api.confirmTelegramLink.mockReset();
        }
        if (NotificationSettingsPopup.mockReset) {
            NotificationSettingsPopup.mockReset();
        }
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    function createUrl(pathname, search = '') {
        return new URL(`http://localhost:3000${pathname}${search}`);
    }

    describe('handleTelegramLinkCallback', () => {
        test('ignores non-telegram URLs', () => {
            handleTelegramLinkCallback(createUrl('/'));

            expect(api.confirmTelegramLink).not.toHaveBeenCalled();
            expect(NotificationSettingsPopup).not.toHaveBeenCalled();
            expect(window.history.replaceState).not.toHaveBeenCalled();
        });

        test('ignores other settings URLs', () => {
            handleTelegramLinkCallback(createUrl('/settings/profile'));

            expect(api.confirmTelegramLink).not.toHaveBeenCalled();
            expect(NotificationSettingsPopup).not.toHaveBeenCalled();
        });

        test('handles /settings/telegram without link code', () => {
            handleTelegramLinkCallback(createUrl('/settings/telegram'));

            expect(api.confirmTelegramLink).not.toHaveBeenCalled();
            expect(NotificationSettingsPopup).toHaveBeenCalled();
            expect(window.history.replaceState).toHaveBeenCalledWith({}, expect.any(String), '/');
        });

        test('handles /settings/telegram/ with trailing slash', () => {
            handleTelegramLinkCallback(createUrl('/settings/telegram/'));

            expect(NotificationSettingsPopup).toHaveBeenCalled();
            expect(window.history.replaceState).toHaveBeenCalled();
        });

        test('calls confirmTelegramLink with link code', () => {
            api.confirmTelegramLink.mockResolvedValue({ data: { linked: true } });

            handleTelegramLinkCallback(createUrl('/settings/telegram', '?link=123456'));

            expect(api.confirmTelegramLink).toHaveBeenCalledWith('123456');
            expect(window.history.replaceState).toHaveBeenCalledWith({}, expect.any(String), '/');
        });

        test('shows loading status when confirming', () => {
            api.confirmTelegramLink.mockResolvedValue({ data: { linked: true } });

            handleTelegramLinkCallback(createUrl('/settings/telegram', '?link=123456'));

            const statusEl = document.getElementById('telegram-link-status');
            expect(statusEl).not.toBeNull();
            expect(statusEl.textContent).toContain('Привязка Telegram...');
        });

        test('shows success status and opens popup after confirmation', async () => {
            api.confirmTelegramLink.mockResolvedValue({ data: { linked: true } });

            handleTelegramLinkCallback(createUrl('/settings/telegram', '?link=123456'));

            // Wait for async confirmation
            await Promise.resolve();

            // Fast-forward timers
            jest.advanceTimersByTime(1500);

            // Check that popup was opened
            expect(NotificationSettingsPopup).toHaveBeenCalled();

            // Check status element was removed
            const statusEl = document.getElementById('telegram-link-status');
            expect(statusEl).toBeNull();
        });

        test('shows error status on failure', async () => {
            api.confirmTelegramLink.mockRejectedValue({
                response: { data: { detail: 'Invalid code' } }
            });

            handleTelegramLinkCallback(createUrl('/settings/telegram', '?link=invalid'));

            // Wait for async rejection
            await Promise.resolve();
            await Promise.resolve(); // Extra tick for catch block

            const statusEl = document.getElementById('telegram-link-status');
            expect(statusEl).not.toBeNull();
            expect(statusEl.classList.contains('telegram-link-status--error')).toBe(true);
        });

        test('cleans URL after handling', () => {
            api.confirmTelegramLink.mockResolvedValue({ data: { linked: true } });

            handleTelegramLinkCallback(createUrl('/settings/telegram', '?link=123456'));

            expect(window.history.replaceState).toHaveBeenCalledWith(
                {},
                expect.any(String),
                '/'
            );
        });

        test('status element has correct class for info type', () => {
            api.confirmTelegramLink.mockImplementation(() => new Promise(() => {})); // Never resolves

            handleTelegramLinkCallback(createUrl('/settings/telegram', '?link=123456'));

            const statusEl = document.getElementById('telegram-link-status');
            expect(statusEl.classList.contains('telegram-link-status')).toBe(true);
            expect(statusEl.classList.contains('telegram-link-status--info')).toBe(true);
        });

        test('handles multiple link parameters correctly', () => {
            api.confirmTelegramLink.mockResolvedValue({ data: { linked: true } });

            handleTelegramLinkCallback(createUrl('/settings/telegram', '?link=abc123&other=param'));

            expect(api.confirmTelegramLink).toHaveBeenCalledWith('abc123');
        });
    });
});

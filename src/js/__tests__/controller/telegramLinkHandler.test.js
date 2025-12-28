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
    const STORAGE_KEY = 'telegram_link_code';
    let mockRedirect;

    beforeEach(() => {
        // Create mock redirect function
        mockRedirect = jest.fn();

        // Clear DOM
        document.body.innerHTML = '';

        // Clear sessionStorage
        sessionStorage.clear();

        // Reset mocks
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
        sessionStorage.clear();
    });

    function createUrl(pathname, search = '') {
        return new URL(`http://localhost:3000${pathname}${search}`);
    }

    describe('handleTelegramLinkCallback - redirect phase', () => {
        test('ignores non-telegram URLs on home page', () => {
            handleTelegramLinkCallback(createUrl('/'), mockRedirect);

            expect(api.confirmTelegramLink).not.toHaveBeenCalled();
            expect(NotificationSettingsPopup).not.toHaveBeenCalled();
            expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
            expect(mockRedirect).not.toHaveBeenCalled();
        });

        test('ignores other settings URLs', () => {
            handleTelegramLinkCallback(createUrl('/settings/profile'), mockRedirect);

            expect(api.confirmTelegramLink).not.toHaveBeenCalled();
            expect(NotificationSettingsPopup).not.toHaveBeenCalled();
            expect(mockRedirect).not.toHaveBeenCalled();
        });

        test('saves code and redirects for /settings/telegram with link code', () => {
            handleTelegramLinkCallback(createUrl('/settings/telegram', '?link=123456'), mockRedirect);

            expect(sessionStorage.getItem(STORAGE_KEY)).toBe('123456');
            expect(mockRedirect).toHaveBeenCalledWith('/');
        });

        test('saves open_settings marker and redirects for /settings/telegram without link code', () => {
            handleTelegramLinkCallback(createUrl('/settings/telegram'), mockRedirect);

            expect(sessionStorage.getItem(STORAGE_KEY)).toBe('open_settings');
            expect(mockRedirect).toHaveBeenCalledWith('/');
        });

        test('handles /settings/telegram/ with trailing slash', () => {
            handleTelegramLinkCallback(createUrl('/settings/telegram/'), mockRedirect);

            expect(sessionStorage.getItem(STORAGE_KEY)).toBe('open_settings');
            expect(mockRedirect).toHaveBeenCalledWith('/');
        });

        test('handles link with trailing slash and code', () => {
            handleTelegramLinkCallback(createUrl('/settings/telegram/', '?link=abc789'), mockRedirect);

            expect(sessionStorage.getItem(STORAGE_KEY)).toBe('abc789');
            expect(mockRedirect).toHaveBeenCalledWith('/');
        });
    });

    describe('handleTelegramLinkCallback - home page processing', () => {
        test('opens settings popup for open_settings marker', () => {
            sessionStorage.setItem(STORAGE_KEY, 'open_settings');

            handleTelegramLinkCallback(createUrl('/'), mockRedirect);

            expect(NotificationSettingsPopup).toHaveBeenCalled();
            expect(api.confirmTelegramLink).not.toHaveBeenCalled();
            expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
        });

        test('calls confirmTelegramLink with saved code', () => {
            sessionStorage.setItem(STORAGE_KEY, '123456');
            api.confirmTelegramLink.mockResolvedValue({ data: { linked: true } });

            handleTelegramLinkCallback(createUrl('/'), mockRedirect);

            expect(api.confirmTelegramLink).toHaveBeenCalledWith('123456');
            expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
        });

        test('shows loading status when confirming', () => {
            sessionStorage.setItem(STORAGE_KEY, '123456');
            api.confirmTelegramLink.mockResolvedValue({ data: { linked: true } });

            handleTelegramLinkCallback(createUrl('/'), mockRedirect);

            const statusEl = document.getElementById('telegram-link-status');
            expect(statusEl).not.toBeNull();
            expect(statusEl.textContent).toContain('Привязка Telegram...');
        });

        test('shows success status and opens popup after confirmation', async () => {
            sessionStorage.setItem(STORAGE_KEY, '123456');
            api.confirmTelegramLink.mockResolvedValue({ data: { linked: true } });

            handleTelegramLinkCallback(createUrl('/'), mockRedirect);

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
            sessionStorage.setItem(STORAGE_KEY, 'invalid');
            api.confirmTelegramLink.mockRejectedValue({
                response: { data: { detail: 'Invalid code' } }
            });

            handleTelegramLinkCallback(createUrl('/'), mockRedirect);

            // Wait for async rejection
            await Promise.resolve();
            await Promise.resolve(); // Extra tick for catch block

            const statusEl = document.getElementById('telegram-link-status');
            expect(statusEl).not.toBeNull();
            expect(statusEl.classList.contains('telegram-link-status--error')).toBe(true);
        });

        test('status element has correct class for info type', () => {
            sessionStorage.setItem(STORAGE_KEY, '123456');
            api.confirmTelegramLink.mockImplementation(() => new Promise(() => {})); // Never resolves

            handleTelegramLinkCallback(createUrl('/'), mockRedirect);

            const statusEl = document.getElementById('telegram-link-status');
            expect(statusEl.classList.contains('telegram-link-status')).toBe(true);
            expect(statusEl.classList.contains('telegram-link-status--info')).toBe(true);
        });

        test('clears sessionStorage after processing', () => {
            sessionStorage.setItem(STORAGE_KEY, '123456');
            api.confirmTelegramLink.mockResolvedValue({ data: { linked: true } });

            handleTelegramLinkCallback(createUrl('/'), mockRedirect);

            expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
        });

        test('does nothing if no saved code', () => {
            handleTelegramLinkCallback(createUrl('/'), mockRedirect);

            expect(api.confirmTelegramLink).not.toHaveBeenCalled();
            expect(NotificationSettingsPopup).not.toHaveBeenCalled();
        });
    });
});

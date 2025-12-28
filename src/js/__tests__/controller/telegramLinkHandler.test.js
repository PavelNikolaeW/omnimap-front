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

import { handleTelegramLinkCallback, validateLinkCode } from '../../controller/telegramLinkHandler.js';
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

    describe('validateLinkCode', () => {
        test('returns valid numeric code', () => {
            expect(validateLinkCode('123456')).toBe('123456');
            expect(validateLinkCode('682531960')).toBe('682531960');
        });

        test('trims whitespace', () => {
            expect(validateLinkCode('  123456  ')).toBe('123456');
            expect(validateLinkCode('\t789\n')).toBe('789');
        });

        test('rejects empty or null input', () => {
            expect(validateLinkCode('')).toBeNull();
            expect(validateLinkCode(null)).toBeNull();
            expect(validateLinkCode(undefined)).toBeNull();
            expect(validateLinkCode('   ')).toBeNull();
        });

        test('rejects non-string input', () => {
            expect(validateLinkCode(123456)).toBeNull();
            expect(validateLinkCode({})).toBeNull();
            expect(validateLinkCode([])).toBeNull();
        });

        test('rejects codes with non-digit characters', () => {
            expect(validateLinkCode('abc123')).toBeNull();
            expect(validateLinkCode('123abc')).toBeNull();
            expect(validateLinkCode('12-34')).toBeNull();
            expect(validateLinkCode('12.34')).toBeNull();
            expect(validateLinkCode('<script>alert(1)</script>')).toBeNull();
        });

        test('rejects codes exceeding max length', () => {
            const longCode = '1'.repeat(65);
            expect(validateLinkCode(longCode)).toBeNull();
        });

        test('accepts code at max length', () => {
            const maxLengthCode = '1'.repeat(64);
            expect(validateLinkCode(maxLengthCode)).toBe(maxLengthCode);
        });
    });

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

        test('saves code and redirects for /settings/telegram with valid link code', () => {
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

        test('saves open_settings for invalid link code (non-numeric)', () => {
            handleTelegramLinkCallback(createUrl('/settings/telegram/', '?link=abc789'), mockRedirect);

            // Invalid code should result in open_settings
            expect(sessionStorage.getItem(STORAGE_KEY)).toBe('open_settings');
            expect(mockRedirect).toHaveBeenCalledWith('/');
        });

        test('saves open_settings for XSS attempt in link code', () => {
            handleTelegramLinkCallback(createUrl('/settings/telegram', '?link=<script>alert(1)</script>'), mockRedirect);

            // XSS attempt should be rejected
            expect(sessionStorage.getItem(STORAGE_KEY)).toBe('open_settings');
            expect(mockRedirect).toHaveBeenCalledWith('/');
        });

        test('saves valid numeric code with trailing slash', () => {
            handleTelegramLinkCallback(createUrl('/settings/telegram/', '?link=999888777'), mockRedirect);

            expect(sessionStorage.getItem(STORAGE_KEY)).toBe('999888777');
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
            sessionStorage.setItem(STORAGE_KEY, '999999');
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

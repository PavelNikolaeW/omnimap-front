// Mock API
jest.mock('../../../api/api.js', () => ({
    __esModule: true,
    default: {
        getNotificationSettings: jest.fn(),
        getTelegramStatus: jest.fn(),
        updateNotificationSettings: jest.fn(),
        getTelegramLink: jest.fn(),
        unlinkTelegram: jest.fn(),
        sendTestTelegram: jest.fn(),
        sendTestPush: jest.fn()
    }
}));

// We need to mock the Popup class before importing NotificationSettingsPopup
// The mock must use global for document access
jest.mock('../../../controller/popups/popup.js', () => ({
    Popup: class MockPopup {
        constructor(options) {
            this.options = options;
            // Create elements lazily using global
            this.contentArea = global.document.createElement('div');
            this.contentArea.className = 'popup-content';
            this.popupEl = global.document.createElement('div');
            this.popupEl.className = 'popup';
            this.popupEl.appendChild(this.contentArea);
            global.document.body.appendChild(this.popupEl);
        }
        showMessage(msg, type) {
            this.lastMessage = { msg, type };
        }
        close() {
            if (this.popupEl && this.popupEl.parentNode) {
                this.popupEl.remove();
            }
        }
        handleCancel() {
            this.close();
        }
        static createButton(text, type, onClick) {
            const btn = global.document.createElement('button');
            btn.textContent = text;
            btn.className = `popup-btn popup-btn--${type}`;
            btn.onclick = onClick;
            return btn;
        }
    }
}));

import { NotificationSettingsPopup } from '../../../controller/popups/notificationSettingsPopup.js';
import api from '../../../api/api.js';

describe('NotificationSettingsPopup', () => {
    let popup;

    beforeEach(() => {
        document.body.innerHTML = '';

        // Reset all mocks
        jest.clearAllMocks();

        // Default mock implementations
        api.getNotificationSettings.mockResolvedValue({
            data: {
                email_mode: 'fallback',
                quiet_hours_enabled: false,
                quiet_hours_start: '23:00',
                quiet_hours_end: '08:00',
                timezone: 'Europe/Moscow',
                chat_telegram_enabled: true,
                chat_dm_telegram: true,
                chat_groups_telegram: true,
                limits: { reminders: { used: 5, max: 100 }, subscriptions: { used: 2, max: 50 } }
            }
        });

        api.getTelegramStatus.mockResolvedValue({
            data: { linked: true, username: 'testuser' }
        });

        api.updateNotificationSettings.mockResolvedValue({ data: {} });
    });

    afterEach(() => {
        if (popup) {
            popup.close();
            popup = null;
        }
    });

    describe('getDefaultSettings', () => {
        test('should return correct default values', async () => {
            popup = new NotificationSettingsPopup();
            await flushPromises();

            const defaults = popup.getDefaultSettings();

            expect(defaults.email_enabled).toBe(false);
            expect(defaults.email_mode).toBe('fallback');
            expect(defaults.quiet_hours_enabled).toBe(false);
            expect(defaults.chat_telegram_enabled).toBe(true);
            expect(defaults.chat_dm_telegram).toBe(true);
            expect(defaults.chat_groups_telegram).toBe(true);
        });
    });

    describe('createChatNotificationsSection', () => {
        test('should create section with data-section-id attribute', async () => {
            popup = new NotificationSettingsPopup();
            await flushPromises();

            const section = popup.createChatNotificationsSection();

            expect(section.dataset.sectionId).toBe('chat-notifications');
            expect(section.className).toBe('popup-section');
        });

        test('should show checkboxes enabled when Telegram is linked', async () => {
            popup = new NotificationSettingsPopup();
            await flushPromises();

            const section = popup.createChatNotificationsSection();
            const mainCheckbox = section.querySelector('#chat-telegram-enabled');
            const dmCheckbox = section.querySelector('#chat-dm-telegram');
            const groupsCheckbox = section.querySelector('#chat-groups-telegram');

            expect(mainCheckbox.disabled).toBe(false);
            expect(dmCheckbox.disabled).toBe(false);
            expect(groupsCheckbox.disabled).toBe(false);
        });

        test('should show checkboxes disabled when Telegram is not linked', async () => {
            api.getTelegramStatus.mockResolvedValue({
                data: { linked: false }
            });

            popup = new NotificationSettingsPopup();
            await flushPromises();

            const section = popup.createChatNotificationsSection();
            const mainCheckbox = section.querySelector('#chat-telegram-enabled');
            const dmCheckbox = section.querySelector('#chat-dm-telegram');
            const groupsCheckbox = section.querySelector('#chat-groups-telegram');

            expect(mainCheckbox.disabled).toBe(true);
            expect(dmCheckbox.disabled).toBe(true);
            expect(groupsCheckbox.disabled).toBe(true);
        });

        test('should show warning when Telegram is not linked', async () => {
            api.getTelegramStatus.mockResolvedValue({
                data: { linked: false }
            });

            popup = new NotificationSettingsPopup();
            await flushPromises();

            const section = popup.createChatNotificationsSection();

            expect(section.textContent).toContain('Привяжите Telegram');
        });

        test('should reflect settings values in checkboxes', async () => {
            api.getNotificationSettings.mockResolvedValue({
                data: {
                    chat_telegram_enabled: false,
                    chat_dm_telegram: true,
                    chat_groups_telegram: false
                }
            });

            popup = new NotificationSettingsPopup();
            await flushPromises();

            const section = popup.createChatNotificationsSection();
            const mainCheckbox = section.querySelector('#chat-telegram-enabled');
            const dmCheckbox = section.querySelector('#chat-dm-telegram');
            const groupsCheckbox = section.querySelector('#chat-groups-telegram');

            expect(mainCheckbox.checked).toBe(false);
            expect(dmCheckbox.checked).toBe(true);
            expect(groupsCheckbox.checked).toBe(false);
        });
    });

    describe('createTelegramSection', () => {
        test('should create section with data-section-id attribute', async () => {
            popup = new NotificationSettingsPopup();
            await flushPromises();

            const section = popup.createTelegramSection();

            expect(section.dataset.sectionId).toBe('telegram');
        });
    });

    describe('updateTelegramDependentSections', () => {
        test('should find sections by data-section-id', async () => {
            popup = new NotificationSettingsPopup();
            await flushPromises();

            // Get initial sections
            const telegramBefore = popup.contentArea.querySelector('[data-section-id="telegram"]');
            const chatBefore = popup.contentArea.querySelector('[data-section-id="chat-notifications"]');

            expect(telegramBefore).not.toBeNull();
            expect(chatBefore).not.toBeNull();

            // Update status and refresh
            popup.telegramStatus = { linked: false };
            popup.updateTelegramDependentSections();

            // Sections should still exist with same data-section-id
            const telegramAfter = popup.contentArea.querySelector('[data-section-id="telegram"]');
            const chatAfter = popup.contentArea.querySelector('[data-section-id="chat-notifications"]');

            expect(telegramAfter).not.toBeNull();
            expect(chatAfter).not.toBeNull();
        });

        test('should update chat section based on Telegram status', async () => {
            popup = new NotificationSettingsPopup();
            await flushPromises();

            // Initially Telegram is linked, checkboxes should be enabled
            let chatSection = popup.contentArea.querySelector('[data-section-id="chat-notifications"]');
            let mainCheckbox = chatSection.querySelector('#chat-telegram-enabled');
            expect(mainCheckbox.disabled).toBe(false);

            // Unlink Telegram and refresh
            popup.telegramStatus = { linked: false };
            popup.updateTelegramDependentSections();

            // After update, checkboxes should be disabled
            chatSection = popup.contentArea.querySelector('[data-section-id="chat-notifications"]');
            mainCheckbox = chatSection.querySelector('#chat-telegram-enabled');
            expect(mainCheckbox.disabled).toBe(true);
        });
    });

    describe('event delegation for toggles', () => {
        test('should toggle sub-options opacity when main checkbox changes', async () => {
            popup = new NotificationSettingsPopup();
            await flushPromises();

            const mainCheckbox = popup.contentArea.querySelector('#chat-telegram-enabled');
            const optionsDiv = popup.contentArea.querySelector('#chat-notifications-options');

            // Initially checked, options should be visible
            expect(mainCheckbox.checked).toBe(true);
            expect(optionsDiv.style.opacity).not.toBe('0.5');

            // Uncheck main toggle
            mainCheckbox.checked = false;
            mainCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

            expect(optionsDiv.style.opacity).toBe('0.5');
            expect(optionsDiv.style.pointerEvents).toBe('none');

            // Check main toggle again
            mainCheckbox.checked = true;
            mainCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

            expect(optionsDiv.style.opacity).toBe('1');
            expect(optionsDiv.style.pointerEvents).toBe('auto');
        });

        test('should not add duplicate listeners on multiple bindFormEvents calls', async () => {
            popup = new NotificationSettingsPopup();
            await flushPromises();

            // Call bindFormEvents multiple times (simulating re-render)
            popup.bindFormEvents();
            popup.bindFormEvents();
            popup.bindFormEvents();

            // Flag should prevent duplicates
            expect(popup._toggleListenerAttached).toBe(true);

            // Trigger change and verify it only fires once
            const mainCheckbox = popup.contentArea.querySelector('#chat-telegram-enabled');
            const optionsDiv = popup.contentArea.querySelector('#chat-notifications-options');

            mainCheckbox.checked = false;
            mainCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

            // If duplicated, opacity might be wrong or event would fire multiple times
            expect(optionsDiv.style.opacity).toBe('0.5');
        });
    });

    describe('handleSubmit', () => {
        test('should collect chat notification settings', async () => {
            popup = new NotificationSettingsPopup();
            await flushPromises();

            // Set checkbox values
            popup.contentArea.querySelector('#chat-telegram-enabled').checked = true;
            popup.contentArea.querySelector('#chat-dm-telegram').checked = false;
            popup.contentArea.querySelector('#chat-groups-telegram').checked = true;

            await popup.handleSubmit();

            expect(api.updateNotificationSettings).toHaveBeenCalledWith(
                expect.objectContaining({
                    chat_telegram_enabled: true,
                    chat_dm_telegram: false,
                    chat_groups_telegram: true
                })
            );
        });

        test('should use default true when checkboxes not found', async () => {
            popup = new NotificationSettingsPopup();
            await flushPromises();

            // Remove checkboxes to simulate missing elements
            popup.contentArea.querySelector('#chat-telegram-enabled')?.remove();

            await popup.handleSubmit();

            expect(api.updateNotificationSettings).toHaveBeenCalledWith(
                expect.objectContaining({
                    chat_telegram_enabled: true // fallback to true
                })
            );
        });
    });

    describe('renderContent', () => {
        test('should render all sections in correct order', async () => {
            popup = new NotificationSettingsPopup();
            await flushPromises();

            const sections = popup.contentArea.querySelectorAll('.popup-section');

            // Should have 6 sections: Telegram, Chat, Email, Push, Quiet Hours, Limits
            expect(sections.length).toBe(6);
            expect(sections[0].dataset.sectionId).toBe('telegram');
            expect(sections[1].dataset.sectionId).toBe('chat-notifications');
        });
    });
});

// Helper to flush pending promises
function flushPromises() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

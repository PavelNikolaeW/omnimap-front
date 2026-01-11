import { Popup } from './popup.js';
import api from '../../api/api.js';

/**
 * Popup для настроек уведомлений
 * Включает: Telegram, Email, Push, Тихие часы, Лимиты
 */
export class NotificationSettingsPopup extends Popup {
    constructor(options = {}) {
        super({
            title: '⚙️ Настройки уведомлений',
            size: 'lg',
            modal: true,
            closeOnEsc: true,
            closeOnOverlay: true,
            ...options
        });

        this.onSave = options.onSave;
        this.settings = null;
        this.telegramStatus = null;
        this.pollingInterval = null;

        this.init();
    }

    async init() {
        this.showLoading();
        await this.loadData();
        this.renderContent();
        this.bindFormEvents();
    }

    showLoading() {
        this.contentArea.innerHTML = `
            <div class="popup-loading">
                <div class="popup-spinner"></div>
                Загрузка...
            </div>
        `;
    }

    async loadData() {
        try {
            const [settingsRes, telegramRes] = await Promise.all([
                api.getNotificationSettings().catch(() => ({ data: this.getDefaultSettings() })),
                api.getTelegramStatus().catch(() => ({ data: { linked: false } }))
            ]);
            this.settings = settingsRes.data || this.getDefaultSettings();
            this.telegramStatus = telegramRes.data;
        } catch (e) {
            console.error('Failed to load notification settings:', e);
            this.settings = this.getDefaultSettings();
            this.telegramStatus = { linked: false };
        }
    }

    getDefaultSettings() {
        return {
            email_enabled: false,
            email_mode: 'fallback',
            quiet_hours_enabled: false,
            quiet_hours_start: '23:00',
            quiet_hours_end: '08:00',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            limits: { reminders: { used: 0, max: 100 }, subscriptions: { used: 0, max: 50 } },
            // Настройки уведомлений о чате
            chat_telegram_enabled: true,
            chat_dm_telegram: true,
            chat_groups_telegram: true
        };
    }

    renderContent() {
        this.contentArea.innerHTML = '';

        // Telegram Section
        this.contentArea.appendChild(this.createTelegramSection());

        // Chat Notifications Section (depends on Telegram)
        this.contentArea.appendChild(this.createChatNotificationsSection());

        // Email Section
        this.contentArea.appendChild(this.createEmailSection());

        // Push Section
        this.contentArea.appendChild(this.createPushSection());

        // Quiet Hours Section
        this.contentArea.appendChild(this.createQuietHoursSection());

        // Limits Section
        this.contentArea.appendChild(this.createLimitsSection());
    }

    createTelegramSection() {
        const section = document.createElement('div');
        section.className = 'popup-section';
        section.dataset.sectionId = 'telegram';
        section.innerHTML = `<div class="popup-section__title">📱 Telegram</div>`;

        const content = document.createElement('div');
        content.className = 'popup-list';
        content.style.padding = '12px';
        content.id = 'telegram-section-content';

        if (this.telegramStatus?.linked) {
            content.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <span style="color: #10b981;">✅</span>
                    <span>Статус: Привязан</span>
                </div>
                ${this.telegramStatus.username ? `<div style="color: #6b7280; font-size: 13px;">Аккаунт: @${this.telegramStatus.username}</div>` : ''}
                ${this.telegramStatus.linked_at ? `<div style="color: #6b7280; font-size: 13px;">Привязан: ${new Date(this.telegramStatus.linked_at).toLocaleDateString()}</div>` : ''}
                <div style="margin-top: 12px; display: flex; gap: 8px;">
                    <button type="button" class="popup-btn popup-btn--secondary popup-btn--sm" id="btn-unlink-telegram">Отвязать</button>
                    <button type="button" class="popup-btn popup-btn--sm" id="btn-test-telegram">Тестовое сообщение</button>
                </div>
            `;
        } else {
            content.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <span style="color: #ef4444;">❌</span>
                    <span>Статус: Не привязан</span>
                </div>
                <p style="color: #6b7280; font-size: 13px; margin: 8px 0;">
                    Привяжите Telegram для получения напоминаний и уведомлений даже когда браузер закрыт.
                </p>
                <button type="button" class="popup-btn popup-btn--primary popup-btn--sm" id="btn-link-telegram">Привязать Telegram</button>
                <div id="telegram-linking-status" style="display: none; margin-top: 12px;"></div>
            `;
        }

        section.appendChild(content);
        return section;
    }

    createChatNotificationsSection() {
        const section = document.createElement('div');
        section.className = 'popup-section';
        section.dataset.sectionId = 'chat-notifications';

        const isLinked = this.telegramStatus?.linked;
        const mainEnabled = this.settings.chat_telegram_enabled ?? true;
        const dmEnabled = this.settings.chat_dm_telegram ?? true;
        const groupsEnabled = this.settings.chat_groups_telegram ?? true;

        section.innerHTML = `
            <div class="popup-section__title">💬 Уведомления о сообщениях</div>
            <div class="popup-list" style="padding: 12px;">
                ${!isLinked ? `
                    <div style="color: #6b7280; font-size: 13px; margin-bottom: 12px;">
                        ⚠️ Привяжите Telegram выше для получения уведомлений о сообщениях
                    </div>
                ` : ''}
                <label class="popup-checkbox-label" style="margin-bottom: 12px;">
                    <input type="checkbox" class="popup-checkbox" id="chat-telegram-enabled"
                        ${mainEnabled ? 'checked' : ''}
                        ${!isLinked ? 'disabled' : ''}>
                    Получать уведомления в Telegram
                </label>
                <div id="chat-notifications-options" style="margin-left: 24px; ${mainEnabled && isLinked ? '' : 'opacity: 0.5; pointer-events: none;'}">
                    <label class="popup-checkbox-label" style="margin-bottom: 8px;">
                        <input type="checkbox" class="popup-checkbox" id="chat-dm-telegram"
                            ${dmEnabled ? 'checked' : ''}
                            ${!isLinked ? 'disabled' : ''}>
                        Личные сообщения
                    </label>
                    <label class="popup-checkbox-label">
                        <input type="checkbox" class="popup-checkbox" id="chat-groups-telegram"
                            ${groupsEnabled ? 'checked' : ''}
                            ${!isLinked ? 'disabled' : ''}>
                        Групповые чаты
                    </label>
                </div>
            </div>
        `;

        return section;
    }

    createEmailSection() {
        const section = document.createElement('div');
        section.className = 'popup-section';
        section.innerHTML = `
            <div class="popup-section__title">📧 Email</div>
            <div class="popup-list" style="padding: 12px;">
                <div style="margin-bottom: 12px;">
                    <span style="color: #6b7280;">Адрес: </span>
                    <span>${this.settings.email || 'не указан'}</span>
                </div>
                <div class="popup-form-field">
                    <label class="popup-form-label">Уведомления на email:</label>
                    <select class="popup-select" id="email-mode">
                        <option value="off" ${this.settings.email_mode === 'off' ? 'selected' : ''}>Выключены</option>
                        <option value="fallback" ${this.settings.email_mode === 'fallback' ? 'selected' : ''}>Только если Telegram недоступен</option>
                        <option value="always" ${this.settings.email_mode === 'always' ? 'selected' : ''}>Всегда дублировать</option>
                    </select>
                </div>
            </div>
        `;
        return section;
    }

    createPushSection() {
        const section = document.createElement('div');
        section.className = 'popup-section';

        const pushSupported = 'Notification' in window;
        const pushPermission = pushSupported ? Notification.permission : 'denied';

        let statusHtml = '';
        let actionsHtml = '';

        if (!pushSupported) {
            statusHtml = '<span style="color: #6b7280;">⚠️ Браузер не поддерживает уведомления</span>';
        } else if (pushPermission === 'granted') {
            statusHtml = '<span style="color: #10b981;">✅ Разрешены</span>';
            actionsHtml = `
                <button type="button" class="popup-btn popup-btn--sm" id="btn-test-push">Тестовое уведомление</button>
            `;
        } else if (pushPermission === 'denied') {
            statusHtml = '<span style="color: #ef4444;">❌ Заблокированы (измените в настройках браузера)</span>';
        } else {
            statusHtml = '<span style="color: #f59e0b;">⚠️ Не разрешены</span>';
            actionsHtml = `
                <button type="button" class="popup-btn popup-btn--primary popup-btn--sm" id="btn-enable-push">Разрешить уведомления</button>
            `;
        }

        section.innerHTML = `
            <div class="popup-section__title">🔔 Браузерные уведомления (Push)</div>
            <div class="popup-list" style="padding: 12px;">
                <div style="margin-bottom: 8px;">Статус: ${statusHtml}</div>
                ${actionsHtml ? `<div style="margin-top: 12px;">${actionsHtml}</div>` : ''}
            </div>
        `;
        return section;
    }

    createQuietHoursSection() {
        const section = document.createElement('div');
        section.className = 'popup-section';
        section.innerHTML = `
            <div class="popup-section__title">🌙 Тихие часы</div>
            <div class="popup-list" style="padding: 12px;">
                <label class="popup-checkbox-label" style="margin-bottom: 12px;">
                    <input type="checkbox" class="popup-checkbox" id="quiet-hours-enabled"
                        ${this.settings.quiet_hours_enabled ? 'checked' : ''}>
                    Включить тихие часы
                </label>
                <div id="quiet-hours-fields" style="${this.settings.quiet_hours_enabled ? '' : 'opacity: 0.5; pointer-events: none;'}">
                    <div style="display: flex; gap: 16px; align-items: center; margin-bottom: 12px;">
                        <div class="popup-form-field" style="flex: 1;">
                            <label class="popup-form-label">С</label>
                            <input type="time" class="popup-input" id="quiet-hours-start" value="${this.settings.quiet_hours_start || '23:00'}">
                        </div>
                        <div class="popup-form-field" style="flex: 1;">
                            <label class="popup-form-label">До</label>
                            <input type="time" class="popup-input" id="quiet-hours-end" value="${this.settings.quiet_hours_end || '08:00'}">
                        </div>
                    </div>
                    <div class="popup-form-field">
                        <label class="popup-form-label">Часовой пояс</label>
                        <select class="popup-select" id="settings-timezone">
                            ${this.getTimezoneOptions()}
                        </select>
                        <small style="color: #6b7280; font-size: 12px;">Определён автоматически</small>
                    </div>
                </div>
            </div>
        `;
        return section;
    }

    createLimitsSection() {
        const limits = this.settings.limits || { reminders: { used: 0, max: 100 }, subscriptions: { used: 0, max: 50 } };
        const section = document.createElement('div');
        section.className = 'popup-section';
        section.innerHTML = `
            <div class="popup-section__title">📊 Лимиты</div>
            <div class="popup-list" style="padding: 12px;">
                <div style="margin-bottom: 8px;">
                    Напоминания: <strong>${limits.reminders?.used || 0}</strong> из <strong>${limits.reminders?.max || 100}</strong>
                </div>
                <div>
                    Подписки: <strong>${limits.subscriptions?.used || 0}</strong> из <strong>${limits.subscriptions?.max || 50}</strong>
                </div>
            </div>
        `;
        return section;
    }

    getTimezoneOptions() {
        const userTimezone = this.settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        const timezones = [
            'Europe/Moscow', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
            'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Shanghai',
            'Asia/Dubai', 'Australia/Sydney'
        ];

        if (!timezones.includes(userTimezone)) {
            timezones.unshift(userTimezone);
        }

        return timezones.map(tz =>
            `<option value="${tz}" ${userTimezone === tz ? 'selected' : ''}>${tz}</option>`
        ).join('');
    }

    bindFormEvents() {
        // Telegram link
        const linkBtn = this.contentArea.querySelector('#btn-link-telegram');
        if (linkBtn) {
            linkBtn.addEventListener('click', () => this.handleLinkTelegram());
        }

        // Telegram unlink
        const unlinkBtn = this.contentArea.querySelector('#btn-unlink-telegram');
        if (unlinkBtn) {
            unlinkBtn.addEventListener('click', () => this.handleUnlinkTelegram());
        }

        // Telegram test
        const testTelegramBtn = this.contentArea.querySelector('#btn-test-telegram');
        if (testTelegramBtn) {
            testTelegramBtn.addEventListener('click', () => this.handleTestTelegram());
        }

        // Push enable
        const enablePushBtn = this.contentArea.querySelector('#btn-enable-push');
        if (enablePushBtn) {
            enablePushBtn.addEventListener('click', () => this.handleEnablePush());
        }

        // Push test
        const testPushBtn = this.contentArea.querySelector('#btn-test-push');
        if (testPushBtn) {
            testPushBtn.addEventListener('click', () => this.handleTestPush());
        }

        // Event delegation for toggle checkboxes (prevents memory leaks on re-render)
        if (!this._toggleListenerAttached) {
            this.contentArea.addEventListener('change', (e) => {
                // Quiet hours toggle
                if (e.target.id === 'quiet-hours-enabled') {
                    const fields = this.contentArea.querySelector('#quiet-hours-fields');
                    if (fields) {
                        fields.style.opacity = e.target.checked ? '1' : '0.5';
                        fields.style.pointerEvents = e.target.checked ? 'auto' : 'none';
                    }
                }
                // Chat notifications toggle
                if (e.target.id === 'chat-telegram-enabled') {
                    const options = this.contentArea.querySelector('#chat-notifications-options');
                    if (options) {
                        options.style.opacity = e.target.checked ? '1' : '0.5';
                        options.style.pointerEvents = e.target.checked ? 'auto' : 'none';
                    }
                }
            });
            this._toggleListenerAttached = true;
        }
    }

    async handleLinkTelegram() {
        const linkBtn = this.contentArea.querySelector('#btn-link-telegram');
        const statusDiv = this.contentArea.querySelector('#telegram-linking-status');

        try {
            linkBtn.disabled = true;
            linkBtn.textContent = 'Загрузка...';

            const res = await api.getTelegramLink();
            const link = res.data.link;

            // Открываем Telegram
            window.open(link, '_blank');

            // Показываем статус
            statusDiv.style.display = 'block';
            statusDiv.innerHTML = `
                <div style="padding: 12px; background: #eff6ff; border-radius: 8px; border: 1px solid #bfdbfe;">
                    <p style="margin: 0 0 8px 0;">1. Нажмите кнопку "Start" в Telegram</p>
                    <p style="margin: 0 0 8px 0;">2. Вернитесь сюда</p>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div class="popup-spinner" style="width: 16px; height: 16px;"></div>
                        <span>Ожидание подтверждения...</span>
                    </div>
                </div>
            `;

            // Polling для проверки статуса
            this.startTelegramPolling();

        } catch (err) {
            console.error('Failed to get telegram link:', err);
            this.showMessage('Не удалось получить ссылку для привязки', 'error');
            linkBtn.disabled = false;
            linkBtn.textContent = 'Привязать Telegram';
        }
    }

    startTelegramPolling() {
        let attempts = 0;
        const maxAttempts = 60; // 2 минуты

        this.pollingInterval = setInterval(async () => {
            attempts++;

            try {
                const res = await api.getTelegramStatus();
                if (res.data?.linked) {
                    clearInterval(this.pollingInterval);
                    this.telegramStatus = res.data;
                    this.showMessage('Telegram успешно привязан!', 'success');

                    // Перерисовываем секции Telegram и Chat (зависит от статуса Telegram)
                    this.updateTelegramDependentSections();
                }
            } catch (e) {
                console.error('Polling error:', e);
            }

            if (attempts >= maxAttempts) {
                clearInterval(this.pollingInterval);
                const statusDiv = this.contentArea.querySelector('#telegram-linking-status');
                if (statusDiv) {
                    statusDiv.innerHTML = `
                        <div class="popup-message popup-message--warning">
                            Время ожидания истекло. Попробуйте ещё раз.
                        </div>
                    `;
                }
                const linkBtn = this.contentArea.querySelector('#btn-link-telegram');
                if (linkBtn) {
                    linkBtn.disabled = false;
                    linkBtn.textContent = 'Привязать Telegram';
                }
            }
        }, 2000);
    }

    /**
     * Обновляет секции, зависящие от статуса Telegram (Telegram + Chat notifications)
     */
    updateTelegramDependentSections() {
        const telegramSection = this.contentArea.querySelector('[data-section-id="telegram"]');
        const chatSection = this.contentArea.querySelector('[data-section-id="chat-notifications"]');

        if (telegramSection) {
            telegramSection.replaceWith(this.createTelegramSection());
        }
        if (chatSection) {
            chatSection.replaceWith(this.createChatNotificationsSection());
        }
        this.bindFormEvents();
    }

    async handleUnlinkTelegram() {
        if (!confirm('Вы уверены, что хотите отвязать Telegram?')) return;

        try {
            await api.unlinkTelegram();
            this.telegramStatus = { linked: false };

            // Перерисовываем секции Telegram и Chat (зависит от статуса Telegram)
            this.updateTelegramDependentSections();

            this.showMessage('Telegram успешно отвязан', 'success');
        } catch (err) {
            console.error('Failed to unlink telegram:', err);
            this.showMessage('Не удалось отвязать Telegram', 'error');
        }
    }

    async handleTestTelegram() {
        try {
            await api.sendTestTelegram();
            this.showMessage('Тестовое сообщение отправлено', 'success');
        } catch (err) {
            console.error('Failed to send test telegram:', err);
            this.showMessage('Не удалось отправить сообщение', 'error');
        }
    }

    async handleEnablePush() {
        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                // Перерисовать секцию
                const pushSection = this.contentArea.querySelectorAll('.popup-section')[2];
                if (pushSection) {
                    pushSection.replaceWith(this.createPushSection());
                    this.bindFormEvents();
                }
                this.showMessage('Push-уведомления включены', 'success');
            }
        } catch (err) {
            console.error('Failed to enable push:', err);
            this.showMessage('Не удалось включить уведомления', 'error');
        }
    }

    async handleTestPush() {
        try {
            await api.sendTestPush();
            this.showMessage('Тестовое уведомление отправлено', 'success');
        } catch (err) {
            console.error('Failed to send test push:', err);
            // Fallback: показать локальное уведомление
            if (Notification.permission === 'granted') {
                new Notification('OmniMap', {
                    body: 'Тестовое уведомление',
                    icon: '/favicon.ico'
                });
            }
        }
    }

    createButtons() {
        const container = document.createElement('div');
        container.className = 'popup-buttons';

        const cancelBtn = Popup.createButton('Закрыть', 'secondary', () => this.handleCancel());
        const saveBtn = Popup.createButton('Сохранить', 'primary', () => this.handleSubmit());

        container.appendChild(cancelBtn);
        container.appendChild(saveBtn);
        this.popupEl.appendChild(container);
    }

    async handleSubmit() {
        const data = {
            email_mode: this.contentArea.querySelector('#email-mode')?.value || 'off',
            quiet_hours_enabled: this.contentArea.querySelector('#quiet-hours-enabled')?.checked || false,
            quiet_hours_start: this.contentArea.querySelector('#quiet-hours-start')?.value || '23:00',
            quiet_hours_end: this.contentArea.querySelector('#quiet-hours-end')?.value || '08:00',
            timezone: this.contentArea.querySelector('#settings-timezone')?.value || Intl.DateTimeFormat().resolvedOptions().timeZone,
            // Chat notifications
            chat_telegram_enabled: this.contentArea.querySelector('#chat-telegram-enabled')?.checked ?? true,
            chat_dm_telegram: this.contentArea.querySelector('#chat-dm-telegram')?.checked ?? true,
            chat_groups_telegram: this.contentArea.querySelector('#chat-groups-telegram')?.checked ?? true
        };

        try {
            await api.updateNotificationSettings(data);
            if (typeof this.onSave === 'function') {
                this.onSave(data);
            }
            this.close();
        } catch (err) {
            console.error('Failed to save settings:', err);
            this.showMessage('Не удалось сохранить настройки', 'error');
        }
    }

    close() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        super.close();
    }
}

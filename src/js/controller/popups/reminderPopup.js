import { Popup } from './popup.js';
import api from '../../api/api.js';
import { dispatch } from '../../utils/utils.js';

/**
 * Popup для создания/редактирования напоминания о блоке
 */
export class ReminderPopup extends Popup {
    /**
     * @param {Object} options
     * @param {string} options.blockId - ID блока
     * @param {string} options.blockTitle - Название блока для отображения
     * @param {Object} options.existingReminder - Существующее напоминание (для редактирования)
     * @param {Function} options.onSave - Callback при сохранении
     * @param {Function} options.onDelete - Callback при удалении
     * @param {Function} options.onCancel - Callback при отмене
     */
    constructor(options = {}) {
        super({
            title: options.existingReminder ? '🔔 Редактирование напоминания' : '🔔 Новое напоминание',
            size: 'md',
            modal: true,
            closeOnEsc: true,
            closeOnOverlay: true,
            ...options
        });

        this.blockId = options.blockId;
        this.blockTitle = options.blockTitle || '';
        this.existingReminder = options.existingReminder;
        this.onSave = options.onSave;
        this.onDelete = options.onDelete;
        this.telegramLinked = false;
        this.emailEnabled = false;

        this.init();
    }

    async init() {
        await this.checkNotificationChannels();
        this.renderContent();
        this.bindFormEvents();
    }

    async checkNotificationChannels() {
        try {
            const [telegramRes, settingsRes] = await Promise.all([
                api.getTelegramStatus().catch(() => ({ data: { linked: false } })),
                api.getNotificationSettings().catch(() => ({ data: { email_enabled: false } }))
            ]);
            this.telegramLinked = telegramRes.data?.linked || false;
            this.emailEnabled = settingsRes.data?.email_enabled || false;
        } catch (e) {
            console.error('Failed to check notification channels:', e);
        }
    }

    renderContent() {
        this.contentArea.innerHTML = '';

        // Блок информация
        const blockInfo = document.createElement('div');
        blockInfo.className = 'popup-form-field';
        blockInfo.innerHTML = `
            <label class="popup-form-label">Блок</label>
            <div style="padding: 8px 12px; background: #f3f4f6; border-radius: 6px; font-size: 14px; color: #374151;">
                ${this.escapeHtml(this.blockTitle || 'Без названия')}
            </div>
        `;
        this.contentArea.appendChild(blockInfo);

        // Форма
        const form = document.createElement('div');
        form.className = 'popup-form';

        // Дата
        const dateField = this.createFormFieldWithIcon('date', 'Дата', '📅');
        const dateInput = dateField.querySelector('input');
        dateInput.type = 'date';
        dateInput.id = 'reminder-date';
        dateInput.required = true;
        if (this.existingReminder?.remind_at) {
            dateInput.value = this.existingReminder.remind_at.split('T')[0];
        } else {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            dateInput.value = tomorrow.toISOString().split('T')[0];
        }
        form.appendChild(dateField);

        // Время
        const timeField = this.createFormFieldWithIcon('time', 'Время', '🕐');
        const timeInput = timeField.querySelector('input');
        timeInput.type = 'time';
        timeInput.id = 'reminder-time';
        timeInput.required = true;
        if (this.existingReminder?.remind_at) {
            const time = new Date(this.existingReminder.remind_at);
            timeInput.value = time.toTimeString().slice(0, 5);
        } else {
            timeInput.value = '09:00';
        }
        form.appendChild(timeField);

        // Часовой пояс
        const tzField = document.createElement('div');
        tzField.className = 'popup-form-field';
        tzField.innerHTML = `
            <label class="popup-form-label">Часовой пояс</label>
            <select class="popup-select" id="reminder-timezone">
                ${this.getTimezoneOptions()}
            </select>
            <small style="color: #6b7280; font-size: 12px;">Определён автоматически</small>
        `;
        form.appendChild(tzField);

        // Комментарий
        const commentField = document.createElement('div');
        commentField.className = 'popup-form-field';
        commentField.innerHTML = `
            <label class="popup-form-label">Комментарий (опционально)</label>
            <textarea class="popup-textarea" id="reminder-message" rows="3"
                placeholder="Добавьте заметку к напоминанию...">${this.existingReminder?.message || ''}</textarea>
        `;
        form.appendChild(commentField);

        // Повтор
        const repeatField = document.createElement('div');
        repeatField.className = 'popup-form-field';
        repeatField.innerHTML = `
            <label class="popup-form-label">Повтор</label>
            <select class="popup-select" id="reminder-repeat">
                <option value="none" ${this.existingReminder?.repeat === 'none' ? 'selected' : ''}>Не повторять</option>
                <option value="daily" ${this.existingReminder?.repeat === 'daily' ? 'selected' : ''}>Ежедневно</option>
                <option value="weekly" ${this.existingReminder?.repeat === 'weekly' ? 'selected' : ''}>Еженедельно</option>
                <option value="monthly" ${this.existingReminder?.repeat === 'monthly' ? 'selected' : ''}>Ежемесячно</option>
            </select>
        `;
        form.appendChild(repeatField);

        this.contentArea.appendChild(form);

        // Предупреждение о каналах уведомлений
        if (!this.telegramLinked && !this.emailEnabled) {
            const warning = document.createElement('div');
            warning.className = 'popup-message popup-message--warning';
            warning.style.marginTop = '16px';
            warning.innerHTML = `
                ⚠️ Для получения напоминаний привяжите Telegram или включите email.
                <div style="margin-top: 8px;">
                    <button type="button" class="popup-btn popup-btn--sm" id="btn-link-telegram">Привязать Telegram</button>
                </div>
            `;
            this.contentArea.appendChild(warning);
        }

        // Контейнер сообщений об ошибках
        const messageContainer = document.createElement('div');
        messageContainer.id = 'reminder-error-container';
        this.contentArea.appendChild(messageContainer);
    }

    createFormFieldWithIcon(inputId, label, icon) {
        const field = document.createElement('div');
        field.className = 'popup-form-field';
        field.innerHTML = `
            <label class="popup-form-label">${label}</label>
            <div style="position: relative;">
                <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%);">${icon}</span>
                <input class="popup-input" style="padding-left: 36px;" />
            </div>
        `;
        return field;
    }

    getTimezoneOptions() {
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const timezones = [
            'Europe/Moscow',
            'Europe/London',
            'Europe/Paris',
            'Europe/Berlin',
            'America/New_York',
            'America/Los_Angeles',
            'Asia/Tokyo',
            'Asia/Shanghai',
            'Asia/Dubai',
            'Australia/Sydney'
        ];

        if (!timezones.includes(userTimezone)) {
            timezones.unshift(userTimezone);
        }

        return timezones.map(tz => {
            const selected = (this.existingReminder?.timezone || userTimezone) === tz ? 'selected' : '';
            return `<option value="${tz}" ${selected}>${tz}</option>`;
        }).join('');
    }

    bindFormEvents() {
        // Привязка Telegram
        const linkTelegramBtn = this.contentArea.querySelector('#btn-link-telegram');
        if (linkTelegramBtn) {
            linkTelegramBtn.addEventListener('click', () => {
                dispatch('OpenNotificationSettings');
                this.close();
            });
        }
    }

    createButtons() {
        const container = document.createElement('div');
        container.className = 'popup-buttons popup-buttons--space-between';

        const leftGroup = document.createElement('div');
        leftGroup.style.display = 'flex';
        leftGroup.style.gap = '8px';

        const rightGroup = document.createElement('div');
        rightGroup.style.display = 'flex';
        rightGroup.style.gap = '8px';

        // Кнопка удаления (только для редактирования)
        if (this.existingReminder) {
            const deleteBtn = Popup.createButton('🗑 Удалить', 'danger', () => this.handleDelete());
            leftGroup.appendChild(deleteBtn);
        }

        // Кнопки справа
        const cancelBtn = Popup.createButton('Отмена', 'secondary', () => this.handleCancel());
        const saveBtn = Popup.createButton(this.existingReminder ? 'Сохранить' : 'Создать', 'primary', () => this.handleSubmit());

        rightGroup.appendChild(cancelBtn);
        rightGroup.appendChild(saveBtn);

        container.appendChild(leftGroup);
        container.appendChild(rightGroup);
        this.popupEl.appendChild(container);
    }

    async handleSubmit() {
        const dateInput = this.contentArea.querySelector('#reminder-date');
        const timeInput = this.contentArea.querySelector('#reminder-time');
        const timezoneSelect = this.contentArea.querySelector('#reminder-timezone');
        const messageInput = this.contentArea.querySelector('#reminder-message');
        const repeatSelect = this.contentArea.querySelector('#reminder-repeat');

        // Валидация
        if (!dateInput.value || !timeInput.value) {
            this.showMessage('Укажите дату и время', 'error');
            return;
        }

        const remindAt = new Date(`${dateInput.value}T${timeInput.value}`);
        if (remindAt <= new Date()) {
            this.showMessage('Дата и время должны быть в будущем', 'error');
            return;
        }

        const data = {
            block_id: this.blockId,
            remind_at: remindAt.toISOString(),
            timezone: timezoneSelect.value,
            message: messageInput.value.trim(),
            repeat: repeatSelect.value
        };

        try {
            if (this.existingReminder) {
                await api.updateReminder(this.existingReminder.id, data);
            } else {
                await api.createReminder(data);
            }

            if (typeof this.onSave === 'function') {
                this.onSave(data);
            }
            dispatch('ReminderUpdated', { blockId: this.blockId });
            this.close();
        } catch (error) {
            console.error('Failed to save reminder:', error);
            const message = error.response?.data?.detail || 'Не удалось сохранить напоминание';
            this.showMessage(message, 'error');
        }
    }

    async handleDelete() {
        if (!this.existingReminder) return;

        try {
            await api.deleteReminder(this.existingReminder.id);
            if (typeof this.onDelete === 'function') {
                this.onDelete(this.existingReminder.id);
            }
            dispatch('ReminderUpdated', { blockId: this.blockId });
            this.close();
        } catch (error) {
            console.error('Failed to delete reminder:', error);
            this.showMessage('Не удалось удалить напоминание', 'error');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

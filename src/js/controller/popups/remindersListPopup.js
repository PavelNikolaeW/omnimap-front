import { Popup } from './popup.js';
import api from '../../api/api.js';
import { dispatch } from '../../utils/utils.js';
import { ReminderPopup } from './reminderPopup.js';

/**
 * Popup для отображения списка всех напоминаний пользователя
 */
export class RemindersListPopup extends Popup {
    constructor(options = {}) {
        super({
            title: '🔔 Мои напоминания',
            size: 'lg',
            modal: true,
            closeOnEsc: true,
            closeOnOverlay: true,
            ...options
        });

        this.onOpen = options.onOpen;
        this.reminders = [];
        this.filter = 'pending'; // 'pending' | 'sent' | 'all'

        this.init();
    }

    async init() {
        this.showLoading();
        await this.loadReminders();
        this.renderContent();
    }

    showLoading() {
        this.contentArea.innerHTML = `
            <div class="popup-loading">
                <div class="popup-spinner"></div>
                Загрузка...
            </div>
        `;
    }

    async loadReminders() {
        try {
            const status = this.filter === 'all' ? undefined : this.filter;
            const res = await api.getReminders(status);
            this.reminders = res.data || [];
        } catch (err) {
            console.error('Failed to load reminders:', err);
            this.reminders = [];
        }
    }

    renderContent() {
        this.contentArea.innerHTML = '';

        // Фильтры
        const filterSection = document.createElement('div');
        filterSection.style.cssText = 'display: flex; gap: 8px; margin-bottom: 16px;';
        filterSection.innerHTML = `
            <button type="button" class="popup-btn popup-btn--sm ${this.filter === 'pending' ? 'popup-btn--primary' : ''}" data-filter="pending">
                Предстоящие
            </button>
            <button type="button" class="popup-btn popup-btn--sm ${this.filter === 'sent' ? 'popup-btn--primary' : ''}" data-filter="sent">
                Прошедшие
            </button>
            <button type="button" class="popup-btn popup-btn--sm ${this.filter === 'all' ? 'popup-btn--primary' : ''}" data-filter="all">
                Все
            </button>
        `;

        filterSection.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', async () => {
                this.filter = btn.dataset.filter;
                this.showLoading();
                await this.loadReminders();
                this.renderContent();
            });
        });

        this.contentArea.appendChild(filterSection);

        // Список напоминаний
        const list = document.createElement('div');
        list.className = 'popup-list';
        list.style.maxHeight = '400px';
        list.style.overflowY = 'auto';

        if (this.reminders.length === 0) {
            list.innerHTML = `
                <div class="popup-list-empty">
                    ${this.filter === 'pending' ? 'Нет предстоящих напоминаний' :
                      this.filter === 'sent' ? 'Нет прошедших напоминаний' :
                      'Нет напоминаний'}
                </div>
            `;
        } else {
            this.reminders.forEach(reminder => {
                list.appendChild(this.createReminderItem(reminder));
            });
        }

        this.contentArea.appendChild(list);
    }

    createReminderItem(reminder) {
        const item = document.createElement('div');
        item.className = 'popup-list-item';
        item.style.cursor = 'pointer';

        const remindAt = new Date(reminder.remind_at);
        const isPast = remindAt < new Date();
        const dateStr = this.formatDate(remindAt);
        const timeStr = remindAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

        const repeatLabels = {
            'none': '',
            'daily': '🔄 ежедневно',
            'weekly': '🔄 еженедельно',
            'monthly': '🔄 ежемесячно'
        };

        item.innerHTML = `
            <div class="popup-list-item__content" style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span>${isPast ? '✅' : '📝'}</span>
                    <span style="font-weight: 500;">${this.escapeHtml(reminder.block_title || 'Без названия')}</span>
                </div>
                ${reminder.message ? `<div style="color: #6b7280; font-size: 13px; margin-top: 4px;">${this.escapeHtml(reminder.message)}</div>` : ''}
                <div style="color: #6b7280; font-size: 12px; margin-top: 4px;">
                    ${dateStr}, ${timeStr}
                    ${repeatLabels[reminder.repeat] || ''}
                </div>
            </div>
            <div class="popup-list-item__actions">
                <button type="button" class="popup-btn popup-btn--sm popup-btn--ghost" data-action="edit" title="Редактировать">✏️</button>
                <button type="button" class="popup-btn popup-btn--sm popup-btn--ghost" data-action="delete" title="Удалить">🗑</button>
            </div>
        `;

        // Клик на item — переход к блоку
        item.querySelector('.popup-list-item__content').addEventListener('click', () => {
            if (typeof this.onOpen === 'function' && reminder.block_id) {
                this.close();
                this.onOpen(reminder.block_id);
            }
        });

        // Кнопка редактирования
        item.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleEditReminder(reminder);
        });

        // Кнопка удаления
        item.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleDeleteReminder(reminder);
        });

        return item;
    }

    formatDate(date) {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        if (date.toDateString() === today.toDateString()) {
            return 'Сегодня';
        } else if (date.toDateString() === tomorrow.toDateString()) {
            return 'Завтра';
        } else {
            return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        }
    }

    async handleEditReminder(reminder) {
        // Закрываем текущий popup и открываем ReminderPopup для редактирования
        this.close();

        new ReminderPopup({
            blockId: reminder.block_id,
            blockTitle: reminder.block_title,
            existingReminder: reminder,
            onSave: () => {
                dispatch('ReminderUpdated', { blockId: reminder.block_id });
            },
            onDelete: () => {
                dispatch('ReminderUpdated', { blockId: reminder.block_id });
            },
            onCancel: () => {}
        });
    }

    async handleDeleteReminder(reminder) {
        if (!confirm('Удалить это напоминание?')) return;

        try {
            await api.deleteReminder(reminder.id);
            this.reminders = this.reminders.filter(r => r.id !== reminder.id);
            this.renderContent();
            dispatch('ReminderUpdated', { blockId: reminder.block_id });
        } catch (err) {
            console.error('Failed to delete reminder:', err);
            this.showMessage('Не удалось удалить напоминание', 'error');
        }
    }

    createButtons() {
        const container = document.createElement('div');
        container.className = 'popup-buttons';

        const closeBtn = Popup.createButton('Закрыть', 'secondary', () => this.handleCancel());
        container.appendChild(closeBtn);

        this.popupEl.appendChild(container);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

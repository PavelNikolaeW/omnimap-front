/**
 * Менеджер для отображения badge непрочитанных сообщений на кнопке чата
 */
import chatApi from '../api/chatApi';

class ChatBadgeManager {
    constructor() {
        this.buttonId = 'unifiedChat';
        this.badgeId = 'chat-unread-badge';
        this.unreadCount = 0;
        this.initialized = false;
    }

    /**
     * Инициализация менеджера
     * Вызывается после рендеринга кнопок UI
     */
    async init() {
        if (this.initialized) return;

        // Подписываемся на событие обновления непрочитанных
        window.addEventListener('ChatUnreadCountUpdate', (e) => {
            this.handleUnreadUpdate(e.detail);
        });

        // Также слушаем ChatUnreadUpdated от chatPanel
        window.addEventListener('ChatUnreadUpdated', (e) => {
            this.handleUnreadUpdate(e.detail);
        });

        // Слушаем событие рендеринга UI для добавления badge
        window.addEventListener('UIButtonsRendered', () => {
            this.createBadge();
            this.updateBadgeDisplay();
        });

        this.initialized = true;

        // Загружаем начальное количество (после небольшой задержки для UI)
        setTimeout(() => this.loadInitialCount(), 500);
    }

    /**
     * Загружает начальное количество непрочитанных сообщений
     */
    async loadInitialCount() {
        try {
            const response = await chatApi.getUnreadCount();
            if (response?.data) {
                const dm = response.data.dm || response.data.dm_unread || 0;
                const groups = response.data.groups || response.data.groups_unread || 0;
                this.unreadCount = dm + groups;
                this.updateBadgeDisplay();
            }
        } catch (error) {
            // Игнорируем ошибки (пользователь может быть не авторизован)
            console.debug('[ChatBadgeManager] Could not load unread count:', error.message);
        }
    }

    /**
     * Обрабатывает событие обновления непрочитанных
     * @param {Object} detail - { dm, groups, total }
     */
    handleUnreadUpdate(detail) {
        if (detail.total !== undefined) {
            this.unreadCount = detail.total;
        } else {
            const dm = detail.dm || 0;
            const groups = detail.groups || 0;
            this.unreadCount = dm + groups;
        }
        this.updateBadgeDisplay();
    }

    /**
     * Создаёт элемент badge если его ещё нет
     */
    createBadge() {
        const button = document.getElementById(this.buttonId);
        if (!button) return;

        // Добавляем класс для позиционирования
        button.classList.add('chat-button-with-badge');

        // Проверяем, есть ли уже badge
        let badge = button.querySelector(`#${this.badgeId}`);
        if (!badge) {
            badge = document.createElement('span');
            badge.id = this.badgeId;
            badge.className = 'chat-button-badge';
            button.appendChild(badge);
        }
    }

    /**
     * Обновляет отображение badge
     */
    updateBadgeDisplay() {
        const badge = document.getElementById(this.badgeId);
        if (!badge) {
            // Пробуем создать badge
            this.createBadge();
            return;
        }

        if (this.unreadCount > 0) {
            badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
            badge.style.display = '';
        } else {
            badge.style.display = 'none';
        }
    }

    /**
     * Сбрасывает счётчик непрочитанных
     */
    reset() {
        this.unreadCount = 0;
        this.updateBadgeDisplay();
    }
}

export const chatBadgeManager = new ChatBadgeManager();

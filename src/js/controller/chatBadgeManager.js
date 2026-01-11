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
        this.initialLoadDone = false;

        // Привязываем методы для корректного удаления listeners
        this._handleUnreadCountUpdate = this._handleUnreadCountUpdate.bind(this);
        this._handleUnreadUpdated = this._handleUnreadUpdated.bind(this);
        this._handleUIButtonsRendered = this._handleUIButtonsRendered.bind(this);
        this._handleLogout = this._handleLogout.bind(this);
        this._handleNewMessage = this._handleNewMessage.bind(this);
    }

    /**
     * Инициализация менеджера
     * Вызывается после рендеринга кнопок UI
     */
    async init() {
        if (this.initialized) return;

        // Подписываемся на событие обновления непрочитанных
        window.addEventListener('ChatUnreadCountUpdate', this._handleUnreadCountUpdate);

        // Также слушаем ChatUnreadUpdated от chatPanel
        window.addEventListener('ChatUnreadUpdated', this._handleUnreadUpdated);

        // Слушаем событие рендеринга UI для добавления badge
        window.addEventListener('UIButtonsRendered', this._handleUIButtonsRendered);

        // Сбрасываем badge при logout
        window.addEventListener('Logout', this._handleLogout);

        // Инкрементируем счётчик при получении новых сообщений через WebSocket
        window.addEventListener('NewDirectMessage', this._handleNewMessage);
        window.addEventListener('NewGroupMessage', this._handleNewMessage);

        this.initialized = true;

        // Fallback: если кнопка уже отрендерена (race condition),
        // пробуем создать badge с небольшой задержкой
        setTimeout(() => {
            const button = document.getElementById(this.buttonId);
            if (button && !this.initialLoadDone) {
                this._handleUIButtonsRendered();
            }
        }, 100);
    }

    /**
     * Очистка менеджера - удаляет все listeners
     */
    destroy() {
        window.removeEventListener('ChatUnreadCountUpdate', this._handleUnreadCountUpdate);
        window.removeEventListener('ChatUnreadUpdated', this._handleUnreadUpdated);
        window.removeEventListener('UIButtonsRendered', this._handleUIButtonsRendered);
        window.removeEventListener('Logout', this._handleLogout);
        window.removeEventListener('NewDirectMessage', this._handleNewMessage);
        window.removeEventListener('NewGroupMessage', this._handleNewMessage);

        this.initialized = false;
        this.initialLoadDone = false;
    }

    /**
     * Обработчик события ChatUnreadCountUpdate
     */
    _handleUnreadCountUpdate(e) {
        this.handleUnreadUpdate(e.detail);
    }

    /**
     * Обработчик события ChatUnreadUpdated
     */
    _handleUnreadUpdated(e) {
        this.handleUnreadUpdate(e.detail);
    }

    /**
     * Обработчик события UIButtonsRendered
     * Загружает начальное количество при первом рендере
     */
    _handleUIButtonsRendered() {
        this.createBadge();
        if (!this.initialLoadDone) {
            this.loadInitialCount();
            this.initialLoadDone = true;
        } else {
            this.updateBadgeDisplay();
        }
    }

    /**
     * Обработчик события Logout
     */
    _handleLogout() {
        this.reset();
        this.initialLoadDone = false;
    }

    /**
     * Обработчик новых сообщений (DM или Group)
     * Инкрементирует счётчик непрочитанных
     */
    _handleNewMessage() {
        this.unreadCount++;
        this.updateBadgeDisplay();
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
            this.unreadCount = parseInt(detail.total, 10) || 0;
        } else {
            const dm = parseInt(detail.dm, 10) || 0;
            const groups = parseInt(detail.groups, 10) || 0;
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
            badge.setAttribute('data-testid', 'chat-unread-badge');
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

        const count = parseInt(this.unreadCount, 10) || 0;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
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

/**
 * Менеджер для отображения badge запросов на доступ и обработки уведомлений
 */
import api from '../api/api';
import { toastManager } from './toastManager';
import { dispatch } from '../utils/utils';

class AccessRequestsBadgeManager {
    constructor() {
        this.buttonId = 'accessRequests';  // ID команды (используется как id кнопки)
        this.badgeId = 'access-requests-badge';
        this.requestsCount = 0;
        this.initialized = false;
        this.initialLoadDone = false;

        // Привязываем методы
        this._handleNewRequest = this._handleNewRequest.bind(this);
        this._handleRequestResponse = this._handleRequestResponse.bind(this);
        this._handleUIButtonsRendered = this._handleUIButtonsRendered.bind(this);
        this._handleLogout = this._handleLogout.bind(this);
        this._handleWebSocketConnected = this._handleWebSocketConnected.bind(this);
    }

    /**
     * Инициализация менеджера
     */
    async init() {
        if (this.initialized) return;

        // Слушаем WebSocket события
        window.addEventListener('AccessRequestNew', this._handleNewRequest);
        window.addEventListener('AccessRequestResponse', this._handleRequestResponse);

        // Слушаем событие рендеринга UI для добавления badge
        window.addEventListener('UIButtonsRendered', this._handleUIButtonsRendered);

        // Сбрасываем при logout
        window.addEventListener('Logout', this._handleLogout);

        // Перезагружаем счётчик при переподключении WebSocket
        window.addEventListener('WebSocketConnected', this._handleWebSocketConnected);

        this.initialized = true;

        // Пробуем создать badge с небольшой задержкой (если кнопка уже есть)
        setTimeout(() => {
            const button = document.getElementById(this.buttonId);
            if (button && !this.initialLoadDone) {
                this._handleUIButtonsRendered();
            }
        }, 100);
    }

    /**
     * Очистка менеджера
     */
    destroy() {
        window.removeEventListener('AccessRequestNew', this._handleNewRequest);
        window.removeEventListener('AccessRequestResponse', this._handleRequestResponse);
        window.removeEventListener('UIButtonsRendered', this._handleUIButtonsRendered);
        window.removeEventListener('Logout', this._handleLogout);
        window.removeEventListener('WebSocketConnected', this._handleWebSocketConnected);

        this.initialized = false;
        this.initialLoadDone = false;
    }

    /**
     * Обработчик нового запроса на доступ (для владельца блока)
     */
    _handleNewRequest(e) {
        const { requester, block } = e.detail;

        // Увеличиваем счётчик
        this.requestsCount++;
        this.updateBadgeDisplay();

        // Показываем toast уведомление
        toastManager.show({
            type: 'info',
            title: 'Новый запрос на доступ',
            message: `${requester?.username || 'Пользователь'} запрашивает доступ к "${block?.title || 'блоку'}"`,
            duration: 8000,
            action: {
                label: 'Посмотреть',
                callback: () => {
                    dispatch('OpenAccessRequestsPopup');
                }
            }
        });
    }

    /**
     * Обработчик ответа на запрос (для запрашивающего)
     */
    _handleRequestResponse(e) {
        const { approved, permission, block } = e.detail;

        if (approved) {
            toastManager.show({
                type: 'success',
                title: 'Доступ одобрен',
                message: `Вам предоставлен доступ "${this._getPermissionLabel(permission)}" к блоку "${block?.title || ''}"`,
                duration: 6000,
                action: {
                    label: 'Открыть',
                    callback: () => {
                        if (block?.id) {
                            dispatch('OpenBlock', { blockId: block.id });
                        }
                    }
                }
            });

            // Оповещаем о необходимости обновить блок (убрать pending статус)
            dispatch('AccessRequestApproved', { blockId: block?.id, permission });
        } else {
            toastManager.show({
                type: 'warning',
                title: 'Доступ отклонён',
                message: `Ваш запрос на доступ к "${block?.title || 'блоку'}" был отклонён`,
                duration: 6000
            });

            // Оповещаем о необходимости обновить UI блока
            dispatch('AccessRequestRejected', { blockId: block?.id });
        }
    }

    /**
     * Обработчик события UIButtonsRendered
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
     * Обработчик события WebSocketConnected
     */
    _handleWebSocketConnected() {
        // Перезагружаем счётчик при переподключении
        this.loadInitialCount();
    }

    /**
     * Загружает начальное количество запросов
     */
    async loadInitialCount() {
        try {
            const response = await api.getAccessRequestsCount();
            if (response?.data) {
                this.requestsCount = response.data.count || 0;
                this.updateBadgeDisplay();
            }
        } catch (error) {
            console.debug('[AccessRequestsBadgeManager] Could not load count:', error.message);
        }
    }

    /**
     * Создаёт элемент badge
     */
    createBadge() {
        const button = document.getElementById(this.buttonId);
        if (!button) return;

        button.classList.add('with-badge');

        let badge = button.querySelector(`#${this.badgeId}`);
        if (!badge) {
            badge = document.createElement('span');
            badge.id = this.badgeId;
            badge.className = 'access-requests-badge';
            badge.setAttribute('data-testid', 'access-requests-badge');
            button.appendChild(badge);
        }
    }

    /**
     * Обновляет отображение badge
     */
    updateBadgeDisplay() {
        const badge = document.getElementById(this.badgeId);
        if (!badge) {
            this.createBadge();
            return;
        }

        const count = parseInt(this.requestsCount, 10) || 0;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = '';
        } else {
            badge.style.display = 'none';
        }
    }

    /**
     * Уменьшает счётчик (после обработки запроса)
     */
    decrementCount() {
        if (this.requestsCount > 0) {
            this.requestsCount--;
            this.updateBadgeDisplay();
        }
    }

    /**
     * Сбрасывает счётчик
     */
    reset() {
        this.requestsCount = 0;
        this.updateBadgeDisplay();
    }

    /**
     * Возвращает человекочитаемое название права
     */
    _getPermissionLabel(permission) {
        const labels = {
            'view': 'просмотр',
            'sandbox': 'sandbox',
            'edit': 'редактирование',
            'edit_ac': 'управление правами',
            'delete': 'полный доступ'
        };
        return labels[permission] || permission;
    }
}

export const accessRequestsBadgeManager = new AccessRequestsBadgeManager();

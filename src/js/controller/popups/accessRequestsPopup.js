/**
 * Popup для управления запросами на доступ
 */
import { Popup } from './popup';
import api from '../../api/api';
import { accessRequestsBadgeManager } from '../accessRequestsBadgeManager';
import { toastManager } from '../toastManager';

// Уровни прав доступа
const PERMISSION_OPTIONS = [
    { value: 'view', label: 'Просмотр', description: 'Только просмотр содержимого' },
    { value: 'sandbox', label: 'Sandbox', description: 'Создание в sandbox режиме' },
    { value: 'edit', label: 'Редактирование', description: 'Редактирование блока' },
    { value: 'edit_ac', label: 'Управление правами', description: 'Редактирование + настройка прав' },
    { value: 'delete', label: 'Полный доступ', description: 'Все права включая удаление' }
];

export class AccessRequestsPopup extends Popup {
    constructor(options = {}) {
        super({
            title: 'Запросы на доступ',
            size: 'lg',
            modal: true,
            draggable: true,
            closeOnEsc: true,
            closeOnOverlay: true,
            inputs: [],
            ...options
        });

        this.incomingRequests = [];
        this.sentRequests = [];
        this.activeTab = 'incoming';
        this.isLoading = false;

        // Удаляем стандартные кнопки
        this.popupEl.querySelector('.popup-buttons')?.remove();

        // Создаём кастомный контент
        this.initContent();
        this.loadRequests();

        // Слушаем событие открытия попапа (для badge manager)
        this._handleOpenPopup = this._handleOpenPopup.bind(this);
        window.addEventListener('OpenAccessRequestsPopup', this._handleOpenPopup);
    }

    _handleOpenPopup() {
        // Перезагружаем данные при открытии
        this.loadRequests();
    }

    /**
     * Инициализация контента popup
     */
    initContent() {
        this.contentArea.innerHTML = '';

        // Табы
        const tabs = document.createElement('div');
        tabs.className = 'access-requests-tabs';
        tabs.innerHTML = `
            <button class="access-requests-tab active" data-tab="incoming">
                Входящие <span class="tab-count" id="incoming-count">0</span>
            </button>
            <button class="access-requests-tab" data-tab="sent">
                Отправленные <span class="tab-count" id="sent-count">0</span>
            </button>
        `;
        this.contentArea.appendChild(tabs);

        // Контейнер для списка
        this.listContainer = document.createElement('div');
        this.listContainer.className = 'access-requests-list';
        this.contentArea.appendChild(this.listContainer);

        // Обработка кликов по табам
        tabs.addEventListener('click', (e) => {
            const tab = e.target.closest('.access-requests-tab');
            if (!tab) return;

            tabs.querySelectorAll('.access-requests-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            this.activeTab = tab.dataset.tab;
            this.renderList();
        });

        // Кнопка закрытия
        const closeBtn = document.createElement('div');
        closeBtn.className = 'popup-buttons';
        closeBtn.innerHTML = `
            <button class="popup-btn popup-btn--secondary" data-testid="popup-close-btn">Закрыть</button>
        `;
        closeBtn.querySelector('button').addEventListener('click', () => this.close());
        this.popupEl.appendChild(closeBtn);
    }

    /**
     * Загрузка запросов
     */
    async loadRequests() {
        if (this.isLoading) return;
        this.isLoading = true;

        this.showLoading();

        try {
            const [incomingRes, sentRes] = await Promise.all([
                api.getAccessRequests(),
                api.getSentAccessRequests()
            ]);

            this.incomingRequests = incomingRes?.data || [];
            this.sentRequests = sentRes?.data || [];

            // Обновляем счётчики
            document.getElementById('incoming-count').textContent = this.incomingRequests.length;
            document.getElementById('sent-count').textContent = this.sentRequests.length;

            this.renderList();
        } catch (error) {
            console.error('Failed to load access requests:', error);
            this.showError('Не удалось загрузить запросы');
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Отображение загрузки
     */
    showLoading() {
        this.listContainer.innerHTML = `
            <div class="popup-loading">
                <div class="popup-spinner"></div>
                Загрузка...
            </div>
        `;
    }

    /**
     * Отображение ошибки
     */
    showError(message) {
        this.listContainer.innerHTML = `
            <div class="popup-list-empty" style="color: var(--popup-danger)">
                <i class="fas fa-exclamation-circle"></i> ${message}
            </div>
        `;
    }

    /**
     * Отрисовка списка запросов
     */
    renderList() {
        const requests = this.activeTab === 'incoming' ? this.incomingRequests : this.sentRequests;

        if (requests.length === 0) {
            this.listContainer.innerHTML = `
                <div class="popup-list-empty">
                    ${this.activeTab === 'incoming'
                        ? 'Нет входящих запросов на доступ'
                        : 'Вы не отправляли запросов на доступ'}
                </div>
            `;
            return;
        }

        this.listContainer.innerHTML = `<div class="popup-list"></div>`;
        const list = this.listContainer.querySelector('.popup-list');

        requests.forEach(request => {
            const item = this.createRequestItem(request);
            list.appendChild(item);
        });
    }

    /**
     * Создание элемента запроса
     */
    createRequestItem(request) {
        const item = document.createElement('div');
        item.className = 'popup-list-item access-request-item';
        item.dataset.requestId = request.id;

        const isIncoming = this.activeTab === 'incoming';
        const user = isIncoming ? request.requester : request.owner;
        const date = new Date(request.created_at).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        if (isIncoming) {
            // Входящий запрос - показываем кнопки одобрить/отклонить
            item.innerHTML = `
                <div class="popup-list-item__content">
                    <div class="access-request-user">
                        <i class="fas fa-user"></i>
                        <strong>${user?.username || 'Неизвестный пользователь'}</strong>
                    </div>
                    <div class="access-request-block">
                        <i class="fas fa-cube"></i>
                        ${request.block?.title || 'Блок без названия'}
                    </div>
                    <div class="access-request-date">
                        <i class="fas fa-clock"></i>
                        ${date}
                    </div>
                </div>
                <div class="popup-list-item__actions">
                    <select class="popup-select popup-select--sm permission-select">
                        ${PERMISSION_OPTIONS.map(opt => `
                            <option value="${opt.value}">${opt.label}</option>
                        `).join('')}
                    </select>
                    <button class="popup-btn popup-btn--success popup-btn--sm approve-btn" title="Одобрить">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="popup-btn popup-btn--danger popup-btn--sm reject-btn" title="Отклонить">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;

            // Обработчики кнопок
            item.querySelector('.approve-btn').addEventListener('click', () => {
                const permission = item.querySelector('.permission-select').value;
                this.handleApprove(request.id, permission, item);
            });

            item.querySelector('.reject-btn').addEventListener('click', () => {
                this.handleReject(request.id, item);
            });
        } else {
            // Отправленный запрос - показываем статус
            const statusInfo = this.getStatusInfo(request.status);

            item.innerHTML = `
                <div class="popup-list-item__content">
                    <div class="access-request-user">
                        <i class="fas fa-user"></i>
                        Владелец: <strong>${user?.username || 'Неизвестный'}</strong>
                    </div>
                    <div class="access-request-block">
                        <i class="fas fa-cube"></i>
                        ${request.block?.title || 'Блок без названия'}
                    </div>
                    <div class="access-request-date">
                        <i class="fas fa-clock"></i>
                        ${date}
                    </div>
                </div>
                <div class="popup-list-item__actions">
                    <span class="access-request-status access-request-status--${request.status}">
                        <i class="${statusInfo.icon}"></i>
                        ${statusInfo.label}
                        ${request.granted_permission ? ` (${this.getPermissionLabel(request.granted_permission)})` : ''}
                    </span>
                </div>
            `;
        }

        return item;
    }

    /**
     * Одобрение запроса
     */
    async handleApprove(requestId, permission, itemElement) {
        const btn = itemElement.querySelector('.approve-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            await api.approveAccessRequest(requestId, permission);

            // Удаляем из списка
            this.incomingRequests = this.incomingRequests.filter(r => r.id !== requestId);
            document.getElementById('incoming-count').textContent = this.incomingRequests.length;

            // Анимация удаления
            itemElement.style.opacity = '0.5';
            itemElement.style.transform = 'translateX(20px)';
            setTimeout(() => {
                itemElement.remove();
                if (this.incomingRequests.length === 0) {
                    this.renderList();
                }
            }, 200);

            // Уменьшаем счётчик в badge
            accessRequestsBadgeManager.decrementCount();

            toastManager.success('Запрос одобрен');
        } catch (error) {
            console.error('Failed to approve request:', error);
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i>';
            toastManager.error('Не удалось одобрить запрос');
        }
    }

    /**
     * Отклонение запроса
     */
    async handleReject(requestId, itemElement) {
        const btn = itemElement.querySelector('.reject-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            await api.rejectAccessRequest(requestId);

            // Удаляем из списка
            this.incomingRequests = this.incomingRequests.filter(r => r.id !== requestId);
            document.getElementById('incoming-count').textContent = this.incomingRequests.length;

            // Анимация удаления
            itemElement.style.opacity = '0.5';
            itemElement.style.transform = 'translateX(20px)';
            setTimeout(() => {
                itemElement.remove();
                if (this.incomingRequests.length === 0) {
                    this.renderList();
                }
            }, 200);

            // Уменьшаем счётчик в badge
            accessRequestsBadgeManager.decrementCount();

            toastManager.info('Запрос отклонён');
        } catch (error) {
            console.error('Failed to reject request:', error);
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-times"></i>';
            toastManager.error('Не удалось отклонить запрос');
        }
    }

    /**
     * Получение информации о статусе
     */
    getStatusInfo(status) {
        const statuses = {
            pending: { label: 'Ожидание', icon: 'fas fa-clock' },
            approved: { label: 'Одобрено', icon: 'fas fa-check-circle' },
            rejected: { label: 'Отклонено', icon: 'fas fa-times-circle' }
        };
        return statuses[status] || statuses.pending;
    }

    /**
     * Получение названия права
     */
    getPermissionLabel(permission) {
        const perm = PERMISSION_OPTIONS.find(p => p.value === permission);
        return perm ? perm.label : permission;
    }

    /**
     * Закрытие popup
     */
    close() {
        window.removeEventListener('OpenAccessRequestsPopup', this._handleOpenPopup);
        super.close();
    }
}

// CSS стили для компонента
const styles = `
    .access-requests-tabs {
        display: flex;
        gap: 4px;
        margin-bottom: 16px;
        border-bottom: 1px solid var(--popup-border);
        padding-bottom: 8px;
    }

    .access-requests-tab {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: transparent;
        border: none;
        border-radius: 6px 6px 0 0;
        font-size: 14px;
        font-weight: 500;
        color: var(--popup-muted);
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .access-requests-tab:hover {
        background: var(--popup-border);
        color: var(--popup-fg);
    }

    .access-requests-tab.active {
        background: var(--popup-primary);
        color: #fff;
    }

    .tab-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        font-size: 12px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 10px;
    }

    .access-requests-tab:not(.active) .tab-count {
        background: var(--popup-border);
    }

    .access-requests-list {
        min-height: 200px;
        max-height: 400px;
        overflow-y: auto;
    }

    .access-request-item {
        transition: all 0.2s ease;
    }

    .access-request-user,
    .access-request-block,
    .access-request-date {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
        font-size: 14px;
    }

    .access-request-user i,
    .access-request-block i,
    .access-request-date i {
        width: 16px;
        color: var(--popup-muted);
    }

    .access-request-date {
        font-size: 12px;
        color: var(--popup-muted);
    }

    .access-request-status {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        font-size: 13px;
        font-weight: 500;
        border-radius: 6px;
    }

    .access-request-status--pending {
        background: #fef3c7;
        color: #b45309;
    }

    .access-request-status--approved {
        background: #d1fae5;
        color: #047857;
    }

    .access-request-status--rejected {
        background: #fee2e2;
        color: #b91c1c;
    }

    .popup-select--sm {
        padding: 6px 28px 6px 10px;
        font-size: 13px;
        min-width: 120px;
    }

    .popup-btn--sm {
        padding: 6px 10px;
        font-size: 13px;
    }

    .popup-btn--sm i {
        font-size: 12px;
    }
`;

// Вставляем стили
if (typeof document !== 'undefined') {
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
}

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

/**
 * Экранирование HTML для предотвращения XSS
 * @param {string} text - текст для экранирования
 * @returns {string} - безопасный текст
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

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

        // Табы - создаём через DOM API для безопасности
        const tabs = document.createElement('div');
        tabs.className = 'access-requests-tabs';

        const incomingTab = document.createElement('button');
        incomingTab.className = 'access-requests-tab active';
        incomingTab.dataset.tab = 'incoming';
        incomingTab.dataset.testid = 'access-requests-tab-incoming';
        incomingTab.textContent = 'Входящие ';
        const incomingCount = document.createElement('span');
        incomingCount.className = 'tab-count';
        incomingCount.id = 'incoming-count';
        incomingCount.textContent = '0';
        incomingTab.appendChild(incomingCount);

        const sentTab = document.createElement('button');
        sentTab.className = 'access-requests-tab';
        sentTab.dataset.tab = 'sent';
        sentTab.dataset.testid = 'access-requests-tab-sent';
        sentTab.textContent = 'Отправленные ';
        const sentCount = document.createElement('span');
        sentCount.className = 'tab-count';
        sentCount.id = 'sent-count';
        sentCount.textContent = '0';
        sentTab.appendChild(sentCount);

        tabs.appendChild(incomingTab);
        tabs.appendChild(sentTab);
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
        const closeBtnEl = document.createElement('button');
        closeBtnEl.className = 'popup-btn popup-btn--secondary';
        closeBtnEl.dataset.testid = 'popup-close-btn';
        closeBtnEl.textContent = 'Закрыть';
        closeBtnEl.addEventListener('click', () => this.close());
        closeBtn.appendChild(closeBtnEl);
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
        this.listContainer.innerHTML = '';
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'popup-loading';
        const spinner = document.createElement('div');
        spinner.className = 'popup-spinner';
        loadingDiv.appendChild(spinner);
        loadingDiv.appendChild(document.createTextNode('Загрузка...'));
        this.listContainer.appendChild(loadingDiv);
    }

    /**
     * Отображение ошибки
     */
    showError(message) {
        this.listContainer.innerHTML = '';
        const errorDiv = document.createElement('div');
        errorDiv.className = 'popup-list-empty';
        errorDiv.style.color = 'var(--popup-danger)';
        const icon = document.createElement('i');
        icon.className = 'fas fa-exclamation-circle';
        errorDiv.appendChild(icon);
        errorDiv.appendChild(document.createTextNode(' ' + message));
        this.listContainer.appendChild(errorDiv);
    }

    /**
     * Отрисовка списка запросов
     */
    renderList() {
        const requests = this.activeTab === 'incoming' ? this.incomingRequests : this.sentRequests;

        if (requests.length === 0) {
            this.listContainer.innerHTML = '';
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'popup-list-empty';
            emptyDiv.textContent = this.activeTab === 'incoming'
                ? 'Нет входящих запросов на доступ'
                : 'Вы не отправляли запросов на доступ';
            this.listContainer.appendChild(emptyDiv);
            return;
        }

        this.listContainer.innerHTML = '';
        const list = document.createElement('div');
        list.className = 'popup-list';

        requests.forEach(request => {
            const item = this.createRequestItem(request);
            list.appendChild(item);
        });

        this.listContainer.appendChild(list);
    }

    /**
     * Создание элемента запроса (безопасно от XSS)
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

        // Контент
        const content = document.createElement('div');
        content.className = 'popup-list-item__content';

        // Пользователь
        const userDiv = document.createElement('div');
        userDiv.className = 'access-request-user';
        const userIcon = document.createElement('i');
        userIcon.className = 'fas fa-user';
        userDiv.appendChild(userIcon);
        if (!isIncoming) {
            userDiv.appendChild(document.createTextNode('Владелец: '));
        }
        const userStrong = document.createElement('strong');
        userStrong.textContent = user?.username || 'Неизвестный пользователь';
        userDiv.appendChild(userStrong);
        content.appendChild(userDiv);

        // Блок
        const blockDiv = document.createElement('div');
        blockDiv.className = 'access-request-block';
        const blockIcon = document.createElement('i');
        blockIcon.className = 'fas fa-cube';
        blockDiv.appendChild(blockIcon);
        blockDiv.appendChild(document.createTextNode(request.block?.title || 'Блок без названия'));
        content.appendChild(blockDiv);

        // Дата
        const dateDiv = document.createElement('div');
        dateDiv.className = 'access-request-date';
        const dateIcon = document.createElement('i');
        dateIcon.className = 'fas fa-clock';
        dateDiv.appendChild(dateIcon);
        dateDiv.appendChild(document.createTextNode(date));
        content.appendChild(dateDiv);

        item.appendChild(content);

        // Actions
        const actions = document.createElement('div');
        actions.className = 'popup-list-item__actions';

        if (isIncoming) {
            // Селект прав
            const select = document.createElement('select');
            select.className = 'popup-select popup-select--sm permission-select';
            PERMISSION_OPTIONS.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                select.appendChild(option);
            });
            actions.appendChild(select);

            // Кнопка одобрить
            const approveBtn = document.createElement('button');
            approveBtn.className = 'popup-btn popup-btn--success popup-btn--sm approve-btn';
            approveBtn.title = 'Одобрить';
            const approveIcon = document.createElement('i');
            approveIcon.className = 'fas fa-check';
            approveBtn.appendChild(approveIcon);
            approveBtn.addEventListener('click', () => {
                const permission = select.value;
                this.handleApprove(request.id, permission, item);
            });
            actions.appendChild(approveBtn);

            // Кнопка отклонить
            const rejectBtn = document.createElement('button');
            rejectBtn.className = 'popup-btn popup-btn--danger popup-btn--sm reject-btn';
            rejectBtn.title = 'Отклонить';
            const rejectIcon = document.createElement('i');
            rejectIcon.className = 'fas fa-times';
            rejectBtn.appendChild(rejectIcon);
            rejectBtn.addEventListener('click', () => {
                this.handleReject(request.id, item);
            });
            actions.appendChild(rejectBtn);
        } else {
            // Статус для отправленных
            const statusInfo = this.getStatusInfo(request.status);
            const statusSpan = document.createElement('span');
            statusSpan.className = `access-request-status access-request-status--${request.status}`;
            const statusIcon = document.createElement('i');
            statusIcon.className = statusInfo.icon;
            statusSpan.appendChild(statusIcon);
            let statusText = statusInfo.label;
            if (request.granted_permission) {
                statusText += ` (${this.getPermissionLabel(request.granted_permission)})`;
            }
            statusSpan.appendChild(document.createTextNode(' ' + statusText));
            actions.appendChild(statusSpan);
        }

        item.appendChild(actions);
        return item;
    }

    /**
     * Одобрение запроса
     */
    async handleApprove(requestId, permission, itemElement) {
        const btn = itemElement.querySelector('.approve-btn');
        btn.disabled = true;
        btn.innerHTML = '';
        const spinner = document.createElement('i');
        spinner.className = 'fas fa-spinner fa-spin';
        btn.appendChild(spinner);

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
            btn.innerHTML = '';
            const icon = document.createElement('i');
            icon.className = 'fas fa-check';
            btn.appendChild(icon);
            toastManager.error('Не удалось одобрить запрос');
        }
    }

    /**
     * Отклонение запроса
     */
    async handleReject(requestId, itemElement) {
        const btn = itemElement.querySelector('.reject-btn');
        btn.disabled = true;
        btn.innerHTML = '';
        const spinner = document.createElement('i');
        spinner.className = 'fas fa-spinner fa-spin';
        btn.appendChild(spinner);

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
            btn.innerHTML = '';
            const icon = document.createElement('i');
            icon.className = 'fas fa-times';
            btn.appendChild(icon);
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

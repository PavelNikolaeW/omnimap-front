import { runHealthChecks } from './healthCheck';
import { dispatch } from '../utils/utils';

/**
 * Компонент статус-индикаторов систем
 * Отображает состояние IndexedDB, Backend API, WebSocket, LLM Gateway как цветные диоды
 * Также показывает кнопку переподключения и статус синхронизации
 */
class StatusIndicators {
    constructor() {
        this.element = null;
        this.indicators = {};
        this.checkInterval = null;
        this.reconnectButton = null;
        this.syncStatusElement = null;

        // Bound event handlers для корректного удаления в destroy()
        this._handleWsConnected = this._onWsConnected.bind(this);
        this._handleWsDisconnected = this._onWsDisconnected.bind(this);
        this._handleWsReconnecting = this._onWsReconnecting.bind(this);
        this._handleSyncStarted = this._onSyncStarted.bind(this);
        this._handleSyncCompleted = this._onSyncCompleted.bind(this);
        this._handleSyncProgress = this._onSyncProgress.bind(this);
        this._handleNetworkStatus = this._onNetworkStatus.bind(this);
        this._handleLlmConnected = this._onLlmConnected.bind(this);
        this._handleLlmError = this._onLlmError.bind(this);
        this._handleLogin = this._onLogin.bind(this);
        this._handleApiError = this._onApiError.bind(this);
        this._handleApiSyncStarted = this._onApiSyncStarted.bind(this);
        this._handleApiSyncFinished = this._onApiSyncFinished.bind(this);
    }

    // Event handlers
    _onWsConnected() {
        this.setStatus('ws', 'ok');
        this.hideReconnectButton();
    }

    _onWsDisconnected(e) {
        this.setStatus('ws', 'error');
        if (e.detail?.canRetry) {
            this.showReconnectButton();
        }
    }

    _onWsReconnecting() {
        this.setStatus('ws', 'warning');
        this.hideReconnectButton();
    }

    _onSyncStarted(e) {
        this.showSyncStatus(e.detail?.phase, e.detail?.message);
    }

    _onSyncCompleted(e) {
        this.hideSyncStatus();
        if (e.detail?.error) {
            this.showSyncStatus('error', e.detail.error);
            setTimeout(() => this.hideSyncStatus(), 5000);
        }
    }

    _onSyncProgress(e) {
        const { completed, total, stage, message } = e.detail || {};
        if (message) {
            this.showSyncStatus(stage, message);
        } else if (total) {
            this.showSyncStatus(stage, `${completed}/${total}`);
        }
    }

    _onNetworkStatus(e) {
        if (!e.detail.online) {
            this.setStatus('api', 'error');
            this.setStatus('ws', 'error');
            this.setStatus('llm', 'error');
        } else {
            this._runInitialChecks();
        }
    }

    _onLlmConnected() {
        this.setStatus('llm', 'ok');
    }

    _onLlmError() {
        this.setStatus('llm', 'warning');
    }

    _onLogin() {
        this.setStatus('api', 'ok');
    }

    _onApiError() {
        this.setStatus('api', 'warning');
    }

    _onApiSyncStarted() {
        this.startSyncBlink('api');
    }

    _onApiSyncFinished() {
        this.stopSyncBlink('api');
    }

    /**
     * Инициализирует компонент и вставляет его между top-navigation и content-wrapper
     */
    init() {
        const topNavigation = document.getElementById('topSidebar');
        const contentWrapper = document.querySelector('.content-wrapper');

        if (!topNavigation || !contentWrapper) {
            console.warn('StatusIndicators: required elements not found');
            return;
        }

        this._createElement();
        // Вставляем между top-navigation и content-wrapper
        topNavigation.parentNode.insertBefore(this.element, contentWrapper);

        this._addEventListeners();
        this._runInitialChecks();
    }

    /**
     * Создаёт DOM элемент с индикаторами
     */
    _createElement() {
        this.element = document.createElement('div');
        this.element.className = 'status-indicators';
        this.element.innerHTML = `
            <span class="sync-status" style="display: none;"></span>
            <button class="reconnect-button" style="display: none;">Переподключиться</button>
            <span class="status-led" data-system="db" title="DB — проверка..."></span>
            <span class="status-led" data-system="api" title="API — проверка..."></span>
            <span class="status-led" data-system="ws" title="Sync — проверка..."></span>
            <span class="status-led" data-system="llm" title="LLM — проверка..."></span>
        `;

        // Сохраняем ссылки на индикаторы
        this.indicators = {
            db: this.element.querySelector('[data-system="db"]'),
            api: this.element.querySelector('[data-system="api"]'),
            ws: this.element.querySelector('[data-system="ws"]'),
            llm: this.element.querySelector('[data-system="llm"]')
        };

        // Сохраняем ссылки на дополнительные элементы
        this.reconnectButton = this.element.querySelector('.reconnect-button');
        this.syncStatusElement = this.element.querySelector('.sync-status');

        // Обработчик клика на кнопку переподключения
        this.reconnectButton.addEventListener('click', () => {
            this.hideReconnectButton();
            dispatch('ForceReconnect');
        });

        // Начальное состояние - серый (проверка)
        Object.values(this.indicators).forEach(led => {
            led.classList.add('checking');
        });
    }

    /**
     * Добавляет обработчики событий для обновления статусов
     */
    _addEventListeners() {
        window.addEventListener('WebSocketConnected', this._handleWsConnected);
        window.addEventListener('WebSocketDisconnected', this._handleWsDisconnected);
        window.addEventListener('WebSocketReconnecting', this._handleWsReconnecting);
        window.addEventListener('SyncStarted', this._handleSyncStarted);
        window.addEventListener('SyncCompleted', this._handleSyncCompleted);
        window.addEventListener('SyncProgress', this._handleSyncProgress);
        window.addEventListener('NetworkStatusChange', this._handleNetworkStatus);
        window.addEventListener('LLMGatewayConnected', this._handleLlmConnected);
        window.addEventListener('LLMGatewayError', this._handleLlmError);
        window.addEventListener('Login', this._handleLogin);
        window.addEventListener('ApiError', this._handleApiError);
        window.addEventListener('ApiSyncStarted', this._handleApiSyncStarted);
        window.addEventListener('ApiSyncFinished', this._handleApiSyncFinished);
    }

    /**
     * Удаляет обработчики событий
     */
    _removeEventListeners() {
        window.removeEventListener('WebSocketConnected', this._handleWsConnected);
        window.removeEventListener('WebSocketDisconnected', this._handleWsDisconnected);
        window.removeEventListener('WebSocketReconnecting', this._handleWsReconnecting);
        window.removeEventListener('SyncStarted', this._handleSyncStarted);
        window.removeEventListener('SyncCompleted', this._handleSyncCompleted);
        window.removeEventListener('SyncProgress', this._handleSyncProgress);
        window.removeEventListener('NetworkStatusChange', this._handleNetworkStatus);
        window.removeEventListener('LLMGatewayConnected', this._handleLlmConnected);
        window.removeEventListener('LLMGatewayError', this._handleLlmError);
        window.removeEventListener('Login', this._handleLogin);
        window.removeEventListener('ApiError', this._handleApiError);
        window.removeEventListener('ApiSyncStarted', this._handleApiSyncStarted);
        window.removeEventListener('ApiSyncFinished', this._handleApiSyncFinished);
    }

    /**
     * Запускает моргание индикатора для отображения активности синхронизации
     * @param {string} system - Система ('db', 'api', 'ws', 'llm')
     */
    startSyncBlink(system) {
        const led = this.indicators[system];
        if (!led) return;

        // Добавляем класс моргания
        led.classList.add('syncing');
    }

    /**
     * Останавливает моргание индикатора
     * @param {string} system - Система ('db', 'api', 'ws', 'llm')
     */
    stopSyncBlink(system) {
        const led = this.indicators[system];
        if (!led) return;

        // Убираем класс моргания
        led.classList.remove('syncing');
    }

    /**
     * Показывает кнопку переподключения
     */
    showReconnectButton() {
        if (this.reconnectButton) {
            this.reconnectButton.style.display = 'inline-block';
        }
    }

    /**
     * Скрывает кнопку переподключения
     */
    hideReconnectButton() {
        if (this.reconnectButton) {
            this.reconnectButton.style.display = 'none';
        }
    }

    /**
     * Показывает статус синхронизации
     * @param {string} phase - Фаза ('pull', 'push', 'importing', 'error')
     * @param {string} message - Сообщение для отображения
     */
    showSyncStatus(phase, message) {
        if (!this.syncStatusElement) return;

        const phaseIcons = {
            pull: '↓',
            push: '↑',
            importing: '⟳',
            error: '⚠'
        };

        const icon = phaseIcons[phase] || '⟳';
        this.syncStatusElement.textContent = `${icon} ${message || ''}`;
        this.syncStatusElement.style.display = 'inline-block';
        this.syncStatusElement.className = `sync-status ${phase || ''}`;
    }

    /**
     * Скрывает статус синхронизации
     */
    hideSyncStatus() {
        if (this.syncStatusElement) {
            this.syncStatusElement.style.display = 'none';
        }
    }

    /**
     * Выполняет начальные проверки систем
     */
    async _runInitialChecks() {
        const status = await runHealthChecks();

        status.checks.forEach(check => {
            if (check.name === 'IndexedDB') {
                this.setStatus('db', check.ok ? 'ok' : 'error');
            } else if (check.name === 'Backend API') {
                this.setStatus('api', check.ok ? 'ok' : (check.critical ? 'error' : 'warning'));
            } else if (check.name === 'WebSocket Service') {
                this.setStatus('ws', check.ok ? 'ok' : (check.critical ? 'error' : 'warning'));
            } else if (check.name === 'LLM Gateway') {
                this.setStatus('llm', check.ok ? 'ok' : (check.critical ? 'error' : 'warning'));
            }
        });
    }

    /**
     * Устанавливает статус индикатора
     * @param {string} system - Система ('db', 'api', 'ws', 'llm')
     * @param {string} status - Статус ('ok', 'warning', 'error', 'checking')
     */
    setStatus(system, status) {
        const led = this.indicators[system];
        if (!led) return;

        // Удаляем все классы статуса
        led.classList.remove('ok', 'warning', 'error', 'checking');
        led.classList.add(status);

        // Обновляем title для нативной браузерной подсказки
        const names = { db: 'DB', api: 'API', ws: 'Sync', llm: 'LLM' };
        const texts = { ok: 'работает', warning: 'проблемы', error: 'недоступен', checking: 'проверка...' };
        led.title = `${names[system]} — ${texts[status]}`;
    }

    /**
     * Показывает индикаторы
     */
    show() {
        if (this.element) {
            this.element.classList.remove('hidden');
        }
    }

    /**
     * Скрывает индикаторы
     */
    hide() {
        if (this.element) {
            this.element.classList.add('hidden');
        }
    }

    /**
     * Уничтожает компонент
     */
    destroy() {
        // Удаляем все event listeners для предотвращения memory leak
        this._removeEventListeners();

        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.element = null;
        this.indicators = {};
        this.reconnectButton = null;
        this.syncStatusElement = null;
    }
}

// Экспортируем singleton
export const statusIndicators = new StatusIndicators();

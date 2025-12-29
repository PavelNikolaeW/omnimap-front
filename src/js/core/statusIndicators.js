import { runHealthChecks } from './healthCheck';

/**
 * Компонент статус-индикаторов систем
 * Отображает состояние IndexedDB, Backend API, WebSocket как цветные диоды
 */
class StatusIndicators {
    constructor() {
        this.element = null;
        this.indicators = {};
        this.checkInterval = null;
    }

    /**
     * Инициализирует компонент и вставляет его в указанный контейнер
     * @param {string} containerId - ID контейнера для вставки
     */
    init(containerId = 'top-btn-container') {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn('StatusIndicators: container not found:', containerId);
            return;
        }

        this._createElement();
        container.insertBefore(this.element, container.firstChild);

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
            <div class="status-indicator" data-system="db" title="IndexedDB">
                <span class="status-led"></span>
            </div>
            <div class="status-indicator" data-system="api" title="Backend API">
                <span class="status-led"></span>
            </div>
            <div class="status-indicator" data-system="ws" title="WebSocket">
                <span class="status-led"></span>
            </div>
        `;

        // Сохраняем ссылки на индикаторы
        this.indicators = {
            db: this.element.querySelector('[data-system="db"] .status-led'),
            api: this.element.querySelector('[data-system="api"] .status-led'),
            ws: this.element.querySelector('[data-system="ws"] .status-led')
        };

        // Начальное состояние - жёлтый (проверка)
        Object.values(this.indicators).forEach(led => {
            led.classList.add('checking');
        });
    }

    /**
     * Добавляет обработчики событий для обновления статусов
     */
    _addEventListeners() {
        // Слушаем события синхронизации
        window.addEventListener('WebSocketConnected', () => {
            this.setStatus('ws', 'ok');
        });

        window.addEventListener('WebSocketDisconnected', () => {
            this.setStatus('ws', 'error');
        });

        window.addEventListener('WebSocketReconnecting', () => {
            this.setStatus('ws', 'warning');
        });

        // Слушаем статус сети
        window.addEventListener('NetworkStatusChange', (e) => {
            if (!e.detail.online) {
                this.setStatus('api', 'error');
                this.setStatus('ws', 'error');
            }
        });

        // Слушаем успешную авторизацию как признак работающего API
        window.addEventListener('Login', () => {
            this.setStatus('api', 'ok');
        });

        // При ошибках API
        window.addEventListener('ApiError', () => {
            this.setStatus('api', 'warning');
        });
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
            }
        });
    }

    /**
     * Устанавливает статус индикатора
     * @param {string} system - Система ('db', 'api', 'ws')
     * @param {string} status - Статус ('ok', 'warning', 'error', 'checking')
     */
    setStatus(system, status) {
        const led = this.indicators[system];
        if (!led) return;

        // Удаляем все классы статуса
        led.classList.remove('ok', 'warning', 'error', 'checking');
        led.classList.add(status);

        // Обновляем title
        const indicator = led.closest('.status-indicator');
        if (indicator) {
            const systemNames = {
                db: 'IndexedDB',
                api: 'Backend API',
                ws: 'WebSocket'
            };
            const statusTexts = {
                ok: 'Работает',
                warning: 'Проблемы',
                error: 'Недоступен',
                checking: 'Проверка...'
            };
            indicator.title = `${systemNames[system]}: ${statusTexts[status]}`;
        }
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
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.element = null;
        this.indicators = {};
    }
}

// Экспортируем singleton
export const statusIndicators = new StatusIndicators();

import { runHealthChecks } from './healthCheck';

/**
 * Компонент статус-индикаторов систем
 * Отображает состояние IndexedDB, Backend API, WebSocket, LLM Gateway как цветные диоды
 */
class StatusIndicators {
    constructor() {
        this.element = null;
        this.indicators = {};
        this.checkInterval = null;
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

        // Начальное состояние - серый (проверка)
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
                this.setStatus('llm', 'error');
            } else {
                // При восстановлении сети перепроверяем статусы
                this._runInitialChecks();
            }
        });

        // Слушаем события LLM Gateway
        window.addEventListener('LLMGatewayConnected', () => {
            this.setStatus('llm', 'ok');
        });

        window.addEventListener('LLMGatewayError', () => {
            this.setStatus('llm', 'warning');
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

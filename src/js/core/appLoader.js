import { runHealthChecks } from './healthCheck';

/**
 * Состояния загрузки приложения
 */
const LoaderState = {
    LOADING: 'loading',
    SUCCESS: 'success',
    ERROR: 'error'
};

/**
 * Компонент загрузочного экрана приложения
 */
class AppLoader {
    constructor() {
        this.element = null;
        this.state = LoaderState.LOADING;
        this.healthStatus = null;
    }

    /**
     * Создаёт DOM элемент загрузчика
     */
    _createElement() {
        this.element = document.createElement('div');
        this.element.id = 'app-loader';
        this.element.className = 'app-loader';
        this.element.innerHTML = `
            <div class="app-loader-content">
                <div class="app-loader-logo">
                    <svg viewBox="0 0 100 100" class="app-loader-spinner">
                        <circle cx="50" cy="50" r="40" stroke-width="8" fill="none" />
                    </svg>
                </div>
                <div class="app-loader-status">
                    <span class="app-loader-text">Загрузка...</span>
                </div>
                <div class="app-loader-checks"></div>
                <div class="app-loader-error" style="display: none;"></div>
                <button class="app-loader-retry" style="display: none;">Повторить</button>
            </div>
        `;

        // Стили загрузчика
        const style = document.createElement('style');
        style.textContent = `
            .app-loader {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: #1a1a2e;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                transition: opacity 0.3s ease-out;
            }

            .app-loader.hidden {
                opacity: 0;
                pointer-events: none;
            }

            .app-loader-content {
                text-align: center;
                color: #fff;
            }

            .app-loader-logo {
                width: 80px;
                height: 80px;
                margin: 0 auto 20px;
            }

            .app-loader-spinner {
                width: 100%;
                height: 100%;
                animation: spin 1.5s linear infinite;
            }

            .app-loader-spinner circle {
                stroke: #4a90d9;
                stroke-dasharray: 200;
                stroke-dashoffset: 50;
                stroke-linecap: round;
            }

            @keyframes spin {
                100% { transform: rotate(360deg); }
            }

            .app-loader-text {
                font-size: 18px;
                font-weight: 500;
            }

            .app-loader-checks {
                margin-top: 20px;
                font-size: 14px;
                color: #888;
            }

            .app-loader-check {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                margin: 8px 0;
            }

            .app-loader-check.ok { color: #4caf50; }
            .app-loader-check.warning { color: #ff9800; }
            .app-loader-check.error { color: #f44336; }

            .app-loader-check-icon {
                width: 16px;
                text-align: center;
            }

            .app-loader-error {
                margin-top: 20px;
                padding: 15px;
                background: rgba(244, 67, 54, 0.1);
                border: 1px solid #f44336;
                border-radius: 8px;
                color: #f44336;
                max-width: 400px;
            }

            .app-loader-retry {
                margin-top: 20px;
                padding: 12px 24px;
                background: #4a90d9;
                border: none;
                border-radius: 6px;
                color: #fff;
                font-size: 16px;
                cursor: pointer;
                transition: background 0.2s;
            }

            .app-loader-retry:hover {
                background: #3a7bc8;
            }

            .app-loader.success .app-loader-spinner {
                animation: none;
            }

            .app-loader.success .app-loader-spinner circle {
                stroke: #4caf50;
                stroke-dashoffset: 0;
                transition: stroke-dashoffset 0.5s ease-out;
            }
        `;

        document.head.appendChild(style);
        document.body.insertBefore(this.element, document.body.firstChild);
    }

    /**
     * Показывает загрузочный экран
     */
    show() {
        if (!this.element) {
            this._createElement();
        }
        this.element.classList.remove('hidden');
        this.state = LoaderState.LOADING;
    }

    /**
     * Скрывает загрузочный экран
     */
    hide() {
        if (this.element) {
            this.element.classList.add('hidden');
            // Удаляем элемент после анимации
            setTimeout(() => {
                if (this.element && this.element.parentNode) {
                    this.element.parentNode.removeChild(this.element);
                    this.element = null;
                }
            }, 300);
        }
    }

    /**
     * Обновляет текст статуса
     * @param {string} text - Текст статуса
     */
    setStatus(text) {
        const textEl = this.element?.querySelector('.app-loader-text');
        if (textEl) {
            textEl.textContent = text;
        }
    }

    /**
     * Отображает результаты проверок
     * @param {import('./healthCheck').HealthStatus} status - Результат проверок
     */
    showChecks(status) {
        const checksEl = this.element?.querySelector('.app-loader-checks');
        if (!checksEl) return;

        checksEl.innerHTML = status.checks.map(check => {
            let className = 'ok';
            let icon = '✓';

            if (!check.ok) {
                if (check.critical) {
                    className = 'error';
                    icon = '✗';
                } else {
                    className = 'warning';
                    icon = '!';
                }
            }

            return `
                <div class="app-loader-check ${className}">
                    <span class="app-loader-check-icon">${icon}</span>
                    <span>${check.name}</span>
                </div>
            `;
        }).join('');
    }

    /**
     * Показывает критическую ошибку
     * @param {string[]} errors - Список ошибок
     * @param {Function} onRetry - Callback для повторной попытки
     */
    showError(errors, onRetry) {
        this.state = LoaderState.ERROR;
        this.setStatus('Ошибка загрузки');

        const errorEl = this.element?.querySelector('.app-loader-error');
        const retryBtn = this.element?.querySelector('.app-loader-retry');

        if (errorEl) {
            errorEl.style.display = 'block';
            errorEl.innerHTML = errors.map(e => `<div>${e}</div>`).join('');
        }

        if (retryBtn && onRetry) {
            retryBtn.style.display = 'inline-block';
            retryBtn.onclick = () => {
                retryBtn.style.display = 'none';
                if (errorEl) errorEl.style.display = 'none';
                this.setStatus('Повторная проверка...');
                onRetry();
            };
        }
    }

    /**
     * Показывает успешную загрузку
     */
    showSuccess() {
        this.state = LoaderState.SUCCESS;
        this.element?.classList.add('success');
        this.setStatus('Готово');
    }

    /**
     * Выполняет проверки и управляет отображением
     * @returns {Promise<import('./healthCheck').HealthStatus>}
     */
    async runChecks() {
        this.setStatus('Проверка систем...');

        const status = await runHealthChecks();
        this.healthStatus = status;
        this.showChecks(status);

        return status;
    }
}

// Экспортируем singleton
export const appLoader = new AppLoader();

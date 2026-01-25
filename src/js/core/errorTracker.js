import * as Sentry from '@sentry/browser';
import { config } from '../config';

/**
 * Система отслеживания ошибок для OmniMap Frontend
 *
 * Собирает:
 * - Последние 30 событий dispatch() (breadcrumbs)
 * - Последние 10 действий пользователя из UndoManager
 * - Контекст приложения (режим, выбранный блок, путь навигации)
 *
 * Использует Sentry для отправки ошибок в production.
 */
class ErrorTracker {
    static MAX_BREADCRUMBS = 30;
    static MAX_UNDO_HISTORY = 10;
    static MAX_STRING_LENGTH = 500;

    // События, которые не нужно логировать (слишком частые)
    static IGNORED_EVENTS = new Set([
        'ShowedBlocks',      // Вызывается при каждом рендере
        'MouseMove',         // Движение мыши
        'Scroll',            // Скролл
    ]);

    // Поля, которые нужно удалять из данных (PII)
    // Все ключи в lowercase для сравнения через key.toLowerCase()
    static SENSITIVE_FIELDS = new Set([
        'password',
        'token',
        'access',
        'refresh',
        'email',
        'phone',
        'secret',
        'apikey',      // camelCase apiKey -> lowercase
        'api_key',
        'authorization',
    ]);

    constructor() {
        this.breadcrumbs = [];
        this.isInitialized = false;
        this._boundErrorHandler = this._onError.bind(this);
        this._boundUnhandledRejection = this._onUnhandledRejection.bind(this);
    }

    /**
     * Инициализация ErrorTracker
     * Настраивает Sentry и глобальные обработчики ошибок
     */
    init() {
        if (this.isInitialized) return;

        const runtimeConfig = window.__OMNIMAP_CONFIG__ || {};

        // Проверяем, включен ли error tracking
        const errorTrackingEnabled = runtimeConfig.ERROR_TRACKING_ENABLED !== false;
        const sentryDsn = runtimeConfig.SENTRY_DSN ||
            (typeof SENTRY_DSN !== 'undefined' ? SENTRY_DSN : '');

        if (!errorTrackingEnabled) {
            console.log('[ErrorTracker] Error tracking disabled');
            this._setupFallbackHandlers();
            this.isInitialized = true;
            return;
        }

        if (!sentryDsn) {
            console.log('[ErrorTracker] Sentry DSN not configured, using fallback');
            this._setupFallbackHandlers();
            this.isInitialized = true;
            return;
        }

        // Получаем версию приложения
        const appVersion = runtimeConfig.APP_VERSION ||
            (typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'dev');
        const appEnvironment = runtimeConfig.SENTRY_ENVIRONMENT ||
            runtimeConfig.APP_ENVIRONMENT ||
            (typeof APP_ENVIRONMENT !== 'undefined' ? APP_ENVIRONMENT : 'production');

        try {
            Sentry.init({
                dsn: sentryDsn,
                environment: appEnvironment,
                release: `omnimap-front@${appVersion}`,
                tracesSampleRate: 0.1, // 10% транзакций для производительности

                maxBreadcrumbs: 50,

                // Игнорируем известные безобидные ошибки
                ignoreErrors: [
                    'ResizeObserver loop limit exceeded',
                    'ResizeObserver loop completed with undelivered notifications',
                    /Network Error/i,
                    /Failed to fetch/i,
                    /Load failed/i,
                    /ChunkLoadError/i,
                    'AbortError',
                    // Safari-specific
                    /.*QuotaExceededError.*/i,
                ],

                // Фильтруем URL-ы (расширения браузера и т.д.)
                denyUrls: [
                    /extensions\//i,
                    /^chrome:\/\//i,
                    /^chrome-extension:\/\//i,
                    /^moz-extension:\/\//i,
                ],

                // Санитизация перед отправкой
                beforeSend: (event) => this._sanitizeEvent(event),

                // Добавляем кастомный контекст
                initialScope: {
                    tags: {
                        app: 'omnimap-front',
                    },
                },
            });

            console.log(`[ErrorTracker] Sentry initialized (${appEnvironment}, v${appVersion})`);
        } catch (error) {
            console.error('[ErrorTracker] Failed to initialize Sentry:', error);
            this._setupFallbackHandlers();
        }

        // Устанавливаем глобальные обработчики
        this._setupGlobalHandlers();

        // Делаем доступным глобально для интеграции с dispatch()
        window.__errorTracker = this;

        this.isInitialized = true;
    }

    /**
     * Настройка глобальных обработчиков ошибок
     * @private
     */
    _setupGlobalHandlers() {
        // window.onerror для синхронных ошибок
        window.addEventListener('error', this._boundErrorHandler);

        // Для необработанных Promise rejections
        window.addEventListener('unhandledrejection', this._boundUnhandledRejection);
    }

    /**
     * Fallback обработчики когда Sentry не доступен
     * @private
     */
    _setupFallbackHandlers() {
        window.addEventListener('error', (event) => {
            console.error('[ErrorTracker] Uncaught error:', event.error || event.message);
            this._logErrorLocally(event.error || new Error(event.message));
        });

        window.addEventListener('unhandledrejection', (event) => {
            console.error('[ErrorTracker] Unhandled rejection:', event.reason);
            this._logErrorLocally(event.reason);
        });

        window.__errorTracker = this;
    }

    /**
     * Локальное логирование ошибки (для dev режима или когда Sentry недоступен)
     * @private
     */
    _logErrorLocally(error) {
        const context = this._getAppContext();
        const undoHistory = this._getUndoHistory();

        console.group('[ErrorTracker] Error Details');
        console.error('Error:', error);
        console.log('App Context:', context);
        console.log('Recent Breadcrumbs:', this.breadcrumbs.slice(-10));
        console.log('Undo History:', undoHistory);
        console.groupEnd();
    }

    /**
     * Обработчик синхронных ошибок
     * @private
     */
    _onError(event) {
        // Игнорируем ошибки из расширений
        if (event.filename && (
            event.filename.includes('extension://') ||
            event.filename.includes('chrome://')
        )) {
            return;
        }

        this.captureError(event.error || new Error(event.message), {
            source: 'window.onerror',
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
        });
    }

    /**
     * Обработчик необработанных Promise rejections
     * @private
     */
    _onUnhandledRejection(event) {
        const error = event.reason instanceof Error
            ? event.reason
            : new Error(String(event.reason));

        this.captureError(error, {
            source: 'unhandledrejection',
        });
    }

    /**
     * Добавить событие в breadcrumbs
     * Вызывается из dispatch() для записи событий приложения
     *
     * @param {string} category - Категория ('event', 'navigation', 'user', 'http')
     * @param {string} message - Название события
     * @param {object} data - Дополнительные данные (будут санитизированы)
     */
    addBreadcrumb(category, message, data = {}) {
        // Игнорируем высокочастотные события
        if (ErrorTracker.IGNORED_EVENTS.has(message)) {
            return;
        }

        const breadcrumb = {
            timestamp: Date.now(),
            category,
            message,
            data: this._sanitizeData(data),
        };

        this.breadcrumbs.push(breadcrumb);

        // Ограничиваем размер очереди
        if (this.breadcrumbs.length > ErrorTracker.MAX_BREADCRUMBS) {
            this.breadcrumbs.shift();
        }

        // Также добавляем в Sentry (если инициализирован)
        if (typeof Sentry !== 'undefined' && Sentry.addBreadcrumb) {
            Sentry.addBreadcrumb({
                category,
                message,
                data: breadcrumb.data,
                level: 'info',
            });
        }
    }

    /**
     * Отправить ошибку с полным контекстом
     *
     * @param {Error} error - Объект ошибки
     * @param {object} extraContext - Дополнительный контекст
     */
    captureError(error, extraContext = {}) {
        const appContext = this._getAppContext();
        const undoHistory = this._getUndoHistory();

        // Объединяем весь контекст
        const fullContext = {
            ...extraContext,
            app: appContext,
            undoHistory,
            customBreadcrumbs: this.breadcrumbs.slice(-20), // Последние 20 для Sentry
        };

        // Отправляем в Sentry
        if (typeof Sentry !== 'undefined' && Sentry.captureException) {
            Sentry.withScope((scope) => {
                // Добавляем контекст приложения
                scope.setContext('app_state', appContext);
                scope.setContext('undo_history', { actions: undoHistory });
                scope.setContext('extra', extraContext);

                // Добавляем теги для фильтрации
                if (appContext.mode) {
                    scope.setTag('app_mode', appContext.mode);
                }
                if (appContext.hasSelectedBlock) {
                    scope.setTag('has_selected_block', 'true');
                }

                Sentry.captureException(error);
            });
        } else {
            // Fallback - логируем локально
            this._logErrorLocally(error);
        }
    }

    /**
     * Отправить сообщение (не ошибку) в Sentry
     *
     * @param {string} message - Сообщение
     * @param {string} level - Уровень ('info', 'warning', 'error')
     * @param {object} extraContext - Дополнительный контекст
     */
    captureMessage(message, level = 'info', extraContext = {}) {
        if (typeof Sentry !== 'undefined' && Sentry.captureMessage) {
            Sentry.withScope((scope) => {
                scope.setLevel(level);
                scope.setContext('extra', extraContext);
                Sentry.captureMessage(message);
            });
        } else {
            console.log(`[ErrorTracker] ${level.toUpperCase()}: ${message}`, extraContext);
        }
    }

    /**
     * Получить историю действий из UndoManager
     * @private
     */
    _getUndoHistory() {
        try {
            // UndoManager доступен как глобальный singleton
            const undoManager = window.__undoManager;
            if (!undoManager || !undoManager.undoStack) {
                return [];
            }

            // Берём последние N записей
            return undoManager.undoStack
                .slice(-ErrorTracker.MAX_UNDO_HISTORY)
                .map(entry => ({
                    type: entry.type,
                    blockId: entry.blockId ? this._truncateId(entry.blockId) : null,
                    timestamp: entry.timestamp,
                    invalid: entry.invalid || false,
                    // Для move добавляем информацию о родителях
                    ...(entry.type === 'move' ? {
                        oldParentId: entry.oldParentId ? this._truncateId(entry.oldParentId) : null,
                        newParentId: entry.newParentId ? this._truncateId(entry.newParentId) : null,
                    } : {}),
                }));
        } catch (error) {
            console.warn('[ErrorTracker] Failed to get undo history:', error);
            return [];
        }
    }

    /**
     * Получить текущий контекст приложения
     * @private
     */
    _getAppContext() {
        const context = {
            timestamp: Date.now(),
            url: window.location.href,
            online: navigator.onLine,
        };

        try {
            // Получаем режим приложения из contextManager
            const contextManager = window.__contextManager;
            if (contextManager) {
                context.mode = contextManager.mode || 'unknown';
                context.hasSelectedBlock = !!contextManager.selectedBlock;
                if (contextManager.selectedBlock) {
                    context.selectedBlockId = this._truncateId(contextManager.selectedBlock.id);
                }
            }

            // Получаем путь навигации из breadcrumbs (компонент UI)
            const breadcrumbsEl = document.getElementById('breadcrumb');
            if (breadcrumbsEl) {
                const links = breadcrumbsEl.querySelectorAll('a, span');
                context.navigationPath = Array.from(links)
                    .slice(0, 5) // Максимум 5 уровней
                    .map(el => el.textContent?.trim())
                    .filter(Boolean);
            }

            // Получаем количество блоков в памяти
            const localStateManager = window.__localStateManager;
            if (localStateManager && localStateManager.blocks) {
                context.blocksCount = localStateManager.blocks.size || 0;
            }

            // Получаем pending операции из offline queue
            const networkStatusUI = window.__networkStatusUI;
            if (networkStatusUI) {
                context.pendingOperations = networkStatusUI.getPendingCount?.() || 0;
            }

        } catch (error) {
            console.warn('[ErrorTracker] Failed to get app context:', error);
        }

        return context;
    }

    /**
     * Санитизация события перед отправкой в Sentry
     * @private
     */
    _sanitizeEvent(event) {
        if (!event) return event;

        // Санитизируем breadcrumbs
        if (event.breadcrumbs) {
            event.breadcrumbs = event.breadcrumbs.map(bc => ({
                ...bc,
                data: this._sanitizeData(bc.data),
            }));
        }

        // Санитизируем extra context
        if (event.contexts) {
            for (const key in event.contexts) {
                if (event.contexts[key]) {
                    event.contexts[key] = this._sanitizeData(event.contexts[key]);
                }
            }
        }

        // Санитизируем user data
        if (event.user) {
            delete event.user.email;
            delete event.user.ip_address;
        }

        return event;
    }

    /**
     * Санитизация данных - удаление PII и ограничение размера
     * @private
     */
    _sanitizeData(data) {
        if (!data || typeof data !== 'object') {
            return this._truncateString(data);
        }

        if (Array.isArray(data)) {
            return data.slice(0, 10).map(item => this._sanitizeData(item));
        }

        const sanitized = {};
        for (const key in data) {
            // Пропускаем чувствительные поля
            if (ErrorTracker.SENSITIVE_FIELDS.has(key.toLowerCase())) {
                sanitized[key] = '[REDACTED]';
                continue;
            }

            const value = data[key];

            if (typeof value === 'string') {
                sanitized[key] = this._truncateString(value);
            } else if (typeof value === 'object' && value !== null) {
                // Ограничиваем глубину вложенности
                sanitized[key] = this._sanitizeShallow(value);
            } else {
                sanitized[key] = value;
            }
        }

        return sanitized;
    }

    /**
     * Неглубокая санитизация (только первый уровень)
     * @private
     */
    _sanitizeShallow(obj) {
        if (Array.isArray(obj)) {
            return `[Array(${obj.length})]`;
        }

        const keys = Object.keys(obj);
        if (keys.length > 10) {
            return `[Object(${keys.length} keys)]`;
        }

        const shallow = {};
        for (const key of keys.slice(0, 10)) {
            const value = obj[key];
            if (typeof value === 'string') {
                shallow[key] = this._truncateString(value, 100);
            } else if (typeof value === 'object' && value !== null) {
                shallow[key] = Array.isArray(value)
                    ? `[Array(${value.length})]`
                    : `[Object]`;
            } else {
                shallow[key] = value;
            }
        }

        return shallow;
    }

    /**
     * Обрезать строку до максимальной длины
     * @private
     */
    _truncateString(str, maxLength = ErrorTracker.MAX_STRING_LENGTH) {
        if (typeof str !== 'string') return str;
        if (str.length <= maxLength) return str;
        return str.slice(0, maxLength) + '...';
    }

    /**
     * Обрезать UUID для читаемости (первые 8 символов)
     * @private
     */
    _truncateId(id) {
        if (typeof id !== 'string') return id;
        if (id.length <= 8) return id;
        return id.slice(0, 8);
    }

    /**
     * Установить информацию о пользователе
     * Вызывается при логине
     *
     * @param {object} user - Данные пользователя (id обязательно, без PII)
     */
    setUser(user) {
        if (typeof Sentry !== 'undefined' && Sentry.setUser) {
            // Не передаём email и другие PII
            Sentry.setUser({
                id: user?.id || 'anonymous',
            });
        }
    }

    /**
     * Очистить информацию о пользователе
     * Вызывается при логауте
     */
    clearUser() {
        if (typeof Sentry !== 'undefined' && Sentry.setUser) {
            Sentry.setUser(null);
        }
    }

    /**
     * Очистить breadcrumbs
     */
    clearBreadcrumbs() {
        this.breadcrumbs = [];
    }

    /**
     * Уничтожение ErrorTracker
     */
    destroy() {
        window.removeEventListener('error', this._boundErrorHandler);
        window.removeEventListener('unhandledrejection', this._boundUnhandledRejection);

        delete window.__errorTracker;

        this.breadcrumbs = [];
        this.isInitialized = false;
    }
}

// Singleton экземпляр
export const errorTracker = new ErrorTracker();

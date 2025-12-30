import localforage from "localforage";
import api from "../api/api";

/**
 * Результат проверки здоровья системы
 * @typedef {Object} HealthCheckResult
 * @property {boolean} ok - Успешна ли проверка
 * @property {string} name - Название проверки
 * @property {string} [error] - Сообщение об ошибке
 * @property {boolean} [critical] - Критическая ли ошибка (блокирует запуск)
 */

/**
 * Общий результат проверки здоровья
 * @typedef {Object} HealthStatus
 * @property {boolean} ready - Готово ли приложение к работе
 * @property {HealthCheckResult[]} checks - Результаты всех проверок
 * @property {string[]} errors - Критические ошибки
 * @property {string[]} warnings - Некритические предупреждения
 */

/**
 * Таймаут для проверок в миллисекундах
 */
const CHECK_TIMEOUT = 5000;

/**
 * Оборачивает промис в таймаут
 * @param {Promise} promise - Промис для выполнения
 * @param {number} ms - Таймаут в миллисекундах
 * @param {string} name - Название операции для ошибки
 * @returns {Promise}
 */
function withTimeout(promise, ms, name) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${name}: timeout after ${ms}ms`)), ms)
        )
    ]);
}

/**
 * Проверяет поддержку IndexedDB
 * @returns {Promise<HealthCheckResult>}
 */
async function checkIndexedDB() {
    const name = 'IndexedDB';
    try {
        if (!localforage.supports(localforage.INDEXEDDB)) {
            return {
                ok: false,
                name,
                error: 'IndexedDB не поддерживается браузером',
                critical: true
            };
        }

        // Пробуем выполнить операцию чтения/записи
        const testKey = '__health_check_test__';
        const testValue = Date.now();

        await withTimeout(
            localforage.setItem(testKey, testValue),
            CHECK_TIMEOUT,
            name
        );

        const readValue = await withTimeout(
            localforage.getItem(testKey),
            CHECK_TIMEOUT,
            name
        );

        await localforage.removeItem(testKey);

        if (readValue !== testValue) {
            return {
                ok: false,
                name,
                error: 'IndexedDB: ошибка чтения/записи',
                critical: true
            };
        }

        return { ok: true, name };
    } catch (error) {
        return {
            ok: false,
            name,
            error: error.message,
            critical: true
        };
    }
}

/**
 * Проверяет доступность backend API
 * @returns {Promise<HealthCheckResult>}
 */
async function checkBackendAPI() {
    const name = 'Backend API';

    // Если офлайн - это не критическая ошибка
    if (!navigator.onLine) {
        return {
            ok: true,
            name,
            error: 'Офлайн режим'
        };
    }

    try {
        const response = await withTimeout(
            api.healthCheck(),
            CHECK_TIMEOUT,
            name
        );

        if (response.status === 200) {
            return { ok: true, name };
        }

        return {
            ok: false,
            name,
            error: `Backend вернул статус ${response.status}`,
            critical: false
        };
    } catch (error) {
        // API недоступен - не критично, можно работать офлайн
        return {
            ok: false,
            name,
            error: error.message,
            critical: false
        };
    }
}

/**
 * Проверяет состояние WebSocket сервиса
 * @returns {Promise<HealthCheckResult>}
 */
async function checkWebSocketService() {
    const name = 'WebSocket Service';

    // Если офлайн - это не критическая ошибка
    if (!navigator.onLine) {
        return {
            ok: true,
            name,
            error: 'Офлайн режим'
        };
    }

    try {
        const wsUrl = typeof SINC_SERVICE_URL !== 'undefined'
            ? SINC_SERVICE_URL
            : 'wss://localhost:7999/ws';

        // Преобразуем ws:// в http:// для health check
        const httpUrl = wsUrl
            .replace('wss://', 'https://')
            .replace('ws://', 'http://')
            .replace('/ws', '/health');

        const response = await withTimeout(
            fetch(httpUrl, { method: 'GET' }),
            CHECK_TIMEOUT,
            name
        );

        if (response.ok) {
            return { ok: true, name };
        }

        return {
            ok: false,
            name,
            error: `WebSocket сервис вернул статус ${response.status}`,
            critical: false
        };
    } catch (error) {
        // WebSocket сервис недоступен - не критично
        return {
            ok: false,
            name,
            error: error.message,
            critical: false
        };
    }
}

/**
 * Проверяет состояние LLM Gateway сервиса
 * @returns {Promise<HealthCheckResult>}
 */
async function checkLLMGateway() {
    const name = 'LLM Gateway';

    // Если офлайн - это не критическая ошибка
    if (!navigator.onLine) {
        return {
            ok: true,
            name,
            error: 'Офлайн режим'
        };
    }

    try {
        const llmUrl = typeof LLM_GATEWAY_URL !== 'undefined'
            ? LLM_GATEWAY_URL
            : 'http://localhost:8001';

        const healthUrl = `${llmUrl}/health`;

        const response = await withTimeout(
            fetch(healthUrl, { method: 'GET' }),
            CHECK_TIMEOUT,
            name
        );

        if (response.ok) {
            return { ok: true, name };
        }

        return {
            ok: false,
            name,
            error: `LLM Gateway вернул статус ${response.status}`,
            critical: false
        };
    } catch (error) {
        // LLM Gateway недоступен - не критично
        return {
            ok: false,
            name,
            error: error.message,
            critical: false
        };
    }
}

/**
 * Проверяет наличие необходимых API браузера
 * @returns {Promise<HealthCheckResult>}
 */
async function checkBrowserAPIs() {
    const name = 'Browser APIs';
    const missing = [];

    if (!window.WebSocket) {
        missing.push('WebSocket');
    }

    if (!window.localStorage) {
        missing.push('localStorage');
    }

    if (!window.fetch) {
        missing.push('fetch');
    }

    if (!window.Promise) {
        missing.push('Promise');
    }

    if (missing.length > 0) {
        return {
            ok: false,
            name,
            error: `Отсутствуют API: ${missing.join(', ')}`,
            critical: true
        };
    }

    return { ok: true, name };
}

/**
 * Проверяет состояние сети
 * @returns {Promise<HealthCheckResult>}
 */
async function checkNetwork() {
    const name = 'Network';

    return {
        ok: true,
        name,
        error: navigator.onLine ? undefined : 'Офлайн режим'
    };
}

/**
 * Выполняет все проверки здоровья системы
 * @returns {Promise<HealthStatus>}
 */
export async function runHealthChecks() {
    const checks = await Promise.all([
        checkBrowserAPIs(),
        checkIndexedDB(),
        checkNetwork(),
        checkBackendAPI(),
        checkWebSocketService(),
        checkLLMGateway()
    ]);

    const errors = checks
        .filter(c => !c.ok && c.critical)
        .map(c => `${c.name}: ${c.error}`);

    const warnings = checks
        .filter(c => !c.ok && !c.critical)
        .map(c => `${c.name}: ${c.error}`);

    // Добавляем также non-critical ошибки как warnings
    checks
        .filter(c => c.ok && c.error)
        .forEach(c => warnings.push(`${c.name}: ${c.error}`));

    return {
        ready: errors.length === 0,
        checks,
        errors,
        warnings
    };
}

/**
 * Проверяет готовность приложения к запуску
 * @returns {Promise<boolean>}
 */
export async function isAppReady() {
    const status = await runHealthChecks();
    return status.ready;
}

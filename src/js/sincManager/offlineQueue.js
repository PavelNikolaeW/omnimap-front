import localforage from "localforage";
import { dispatch } from "../utils/utils";
import { v4 as uuidV4 } from 'uuid';
import { importBlocks, pollImportStatus } from '../api/importService.js';
import api from '../api/api.js';
import config from '../config.js';

/**
 * Менеджер синхронизации блоков для offline режима
 *
 * Принцип работы:
 * - Блоки создаются сразу с реальными UUID (v4)
 * - При офлайне изменения накапливаются локально
 * - При восстановлении сети:
 *   1. Сначала получаем обновления с сервера (pull)
 *   2. Мержим серверные данные с локальными
 *   3. Затем отправляем локальные изменения (push via import API)
 * - Import API: новый UUID → создаёт, существующий → обновляет
 * - Удаление: убираем ID из children/childOrder родителя
 */
class OfflineQueueManager {
    constructor() {
        this.QUEUE_KEY = 'offlineOperationsQueue';
        this.SYNC_TAG = 'omnimap-sync';
        this.isOnline = navigator.onLine;
        this.isSyncing = false;
        this.isPulling = false; // Флаг для фазы pull
        this.backgroundSyncSupported = false;
        this.cachedQueueLength = 0; // Для синхронной проверки в beforeunload
        this.pullCompleted = false; // Флаг завершения pull фазы
        this.syncDebounceTimer = null; // Таймер для debounce синхронизации
        this.lastPullTimestamp = 0; // Время последнего pull

        // Адаптивные debounce интервалы по типу операции
        this.DEBOUNCE_CONFIG = {
            createBlock: 500,      // Создание — быстро показать коллаборатору
            updateBlock: 1500,     // Редактирование текста — дать допечатать
            moveBlock: 0,          // Перемещение — сразу (immediate)
            deleteBlock: 0,        // Удаление — сразу
            createTree: 500,       // Создание дерева
            default: 1000          // Fallback
        };

        // Debounce для расшаренных блоков (минимальная задержка для батчинга)
        this.SHARED_DEBOUNCE_MS = 300;

        // Lazy-loaded reference для localStateManager (избежание circular dependency)
        this._localStateManager = null;
        this.PULL_COOLDOWN_MS = 30000; // Минимальный интервал между pull (30 сек)

        // Retry механизм для обработки ненадёжного navigator.onLine
        this.retryAttempts = 0;
        this.MAX_RETRY_ATTEMPTS = 5;
        this.RETRY_BASE_INTERVAL_MS = 5000; // Начальный интервал retry (5 сек)
        this.retryTimer = null;

        // Максимальный возраст операций в очереди (7 дней)
        // Офлайн-работа — киллер-фича, поэтому даём достаточно времени для синхронизации
        this.MAX_OPERATION_AGE_MS = 7 * 24 * 60 * 60 * 1000;

        // Константы для таймаутов
        this.MAX_RETRY_INTERVAL_MS = 60000; // Максимум 1 минута между retry
        this.NETWORK_CHECK_TIMEOUT_MS = 5000; // Таймаут проверки сети
        this.SYNC_STUCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 минут - время после которого считаем синхронизацию зависшей
        this.syncStartTimestamp = 0; // Время начала текущей синхронизации

        // Блоки, ожидающие синхронизации с сервером (созданы локально, но ещё не на сервере)
        // Map<blockId, Promise<void>> - промис резолвится когда блок синхронизирован
        this.pendingBlocks = new Map();
        // Map<blockId, {resolve: Function, reject: Function}> - функции для завершения Promise
        this.pendingBlocksResolvers = new Map();

        // Сохраняем ссылки на handlers для возможности удаления listeners
        this._handleOnline = this.handleOnline.bind(this);
        this._handleOffline = this.handleOffline.bind(this);
        this._handleBeforeUnload = this.handleBeforeUnload.bind(this);
        this._handleSWMessage = this.handleSWMessage.bind(this);
        this._handleVisibilityChange = this.handleVisibilityChange.bind(this);

        this.init();
    }

    /**
     * Генерирует реальный UUID для нового блока
     * @returns {string} UUID v4
     */
    generateBlockId() {
        return uuidV4();
    }

    /**
     * Lazy-загрузка localStateManager для избежания circular dependency
     * @returns {Promise<Object>} localStateManager instance
     */
    async _getLocalStateManager() {
        if (!this._localStateManager) {
            const { localStateManager } = await import('../stateLocal/localStateManager.js');
            this._localStateManager = localStateManager;
        }
        return this._localStateManager;
    }

    /**
     * Определяет debounce интервал для операции
     * Учитывает тип операции и shared статус блока
     * @param {Object} operation - Операция
     * @param {Object} options - Дополнительные опции
     * @returns {Promise<number>} Debounce в мс
     */
    async _getDebounceForOperation(operation, options) {
        // Если явно указан immediate — 0
        if (options.immediate) return 0;

        const blockId = operation.data?.blockId;
        const parentId = operation.data?.parentId;

        try {
            const localStateManager = await this._getLocalStateManager();

            const block = blockId ? localStateManager.blocks.get(blockId) : null;
            const parentBlock = parentId ? localStateManager.blocks.get(parentId) : null;

            // Блок считается расшаренным если у него или родителя есть permission
            const isShared = (block?.permission !== null && block?.permission !== undefined) ||
                             (parentBlock?.permission !== null && parentBlock?.permission !== undefined);

            if (isShared) {
                return this.SHARED_DEBOUNCE_MS;
            }
        } catch (error) {
            console.warn('Failed to check shared status:', error);
            // При ошибке используем стандартный debounce
        }

        // Используем debounce по типу операции (используем ?? чтобы 0 не считался falsy)
        return this.DEBOUNCE_CONFIG[operation.type] ?? this.DEBOUNCE_CONFIG.default;
    }

    /**
     * Проверяет, ожидает ли блок синхронизации (создан локально, но ещё не на сервере)
     * @param {string} blockId - ID блока
     * @returns {boolean}
     */
    isPendingBlock(blockId) {
        return this.pendingBlocks.has(blockId);
    }

    /**
     * Ожидает синхронизации блока с сервером
     * Если блок не pending - резолвится сразу
     * @param {string} blockId - ID блока
     * @param {number} timeout - Таймаут ожидания в мс (по умолчанию 60 сек)
     * @returns {Promise<void>}
     */
    async waitForBlock(blockId, timeout = 60000) {
        const pending = this.pendingBlocks.get(blockId);
        if (pending) {
            await Promise.race([
                pending,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Block sync timeout: ${blockId}`)), timeout)
                )
            ]);
        }
    }

    /**
     * Регистрирует блок как pending (ожидающий синхронизации)
     * @param {string} blockId - ID блока
     * @returns {{resolve: Function, reject: Function}} - Функции для завершения ожидания
     */
    registerPendingBlock(blockId) {
        let resolve, reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        this.pendingBlocks.set(blockId, promise);
        this.pendingBlocksResolvers.set(blockId, { resolve, reject });
        return { resolve, reject };
    }

    /**
     * Помечает блок как синхронизированный
     * @param {string} blockId - ID блока
     */
    resolvePendingBlock(blockId) {
        const resolvers = this.pendingBlocksResolvers.get(blockId);
        if (resolvers) {
            resolvers.resolve();
            this.pendingBlocksResolvers.delete(blockId);
        }
        this.pendingBlocks.delete(blockId);
    }

    /**
     * Отменяет ожидание всех pending блоков из списка
     * Резолвит Promise чтобы ожидающие await не зависли
     * Используется когда блоки были удалены до синхронизации
     * @param {Set<string>} blockIds - ID блоков для отмены
     */
    cancelPendingBlocks(blockIds) {
        for (const blockId of blockIds) {
            const resolvers = this.pendingBlocksResolvers.get(blockId);
            if (resolvers) {
                // Резолвим даже при отмене, чтобы await не зависал
                resolvers.resolve();
                this.pendingBlocksResolvers.delete(blockId);
            }
            this.pendingBlocks.delete(blockId);
        }
    }

    /**
     * Проверяет состояние сети
     */
    isNetworkOnline() {
        return this.isOnline;
    }

    /**
     * Вызывается когда данные успешно загружены с сервера (например при инициализации)
     * Сбрасывает cooldown для pull, так как данные уже актуальны
     */
    markPullCompleted() {
        this.lastPullTimestamp = Date.now();
        this.pullCompleted = true;
        console.log('📥 Pull completed externally, timestamp updated');
    }

    /**
     * Возвращает текущее состояние синхронизации для диагностики
     * @returns {Object} Объект с флагами состояния
     */
    getSyncState() {
        const now = Date.now();
        return {
            isOnline: this.isOnline,
            isSyncing: this.isSyncing,
            isPulling: this.isPulling,
            pullCompleted: this.pullCompleted,
            retryAttempts: this.retryAttempts,
            hasRetryTimer: this.retryTimer !== null,
            pendingBlocksCount: this.pendingBlocks.size,
            lastPullTimestamp: this.lastPullTimestamp,
            syncStartTimestamp: this.syncStartTimestamp,
            syncDurationMs: this.syncStartTimestamp > 0 ? now - this.syncStartTimestamp : 0
        };
    }

    /**
     * Логирует текущее состояние синхронизации (для отладки)
     */
    logSyncState() {
        const state = this.getSyncState();
        console.log('🔍 Sync State:', state);
        return state;
    }

    async init() {
        // Слушаем события сети (используем сохранённые ссылки для возможности удаления)
        window.addEventListener('online', this._handleOnline);
        window.addEventListener('offline', this._handleOffline);

        // Предупреждение при закрытии страницы с несохранёнными изменениями
        window.addEventListener('beforeunload', this._handleBeforeUnload);

        // Проверка очереди при возврате к вкладке
        document.addEventListener('visibilitychange', this._handleVisibilityChange);

        // Проверяем поддержку Background Sync
        this.backgroundSyncSupported = await this.checkBackgroundSyncSupport();
        if (this.backgroundSyncSupported) {
            console.log('Background Sync API supported');
        }

        // Слушаем сообщения от Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', this._handleSWMessage);
        }

        // imp4: Слушаем событие ручного повтора синхронизации
        window.addEventListener('RetrySync', () => {
            console.log('🔄 Manual sync retry requested');
            this.triggerManualSync();
        });

        // Инициализируем кэш длины очереди и очищаем устаревшие операции
        const queue = await this.getQueue();
        await this.cleanupStaleOperations(queue);
        this.cachedQueueLength = (await this.getQueue()).length;

        // Проверяем очередь при старте, если онлайн
        if (this.isOnline) {
            // При старте приложения запускаем pull-before-push
            this.startPullPhase();
        }
    }

    /**
     * Очищает устаревшие операции из очереди
     * Операции старше MAX_OPERATION_AGE_MS удаляются с предупреждением
     * @param {Array} queue - Текущая очередь операций
     */
    async cleanupStaleOperations(queue) {
        if (!queue || queue.length === 0) return;

        const now = Date.now();
        const freshOperations = [];
        const staleOperations = [];

        for (const operation of queue) {
            const age = now - (operation.timestamp || 0);
            if (age > this.MAX_OPERATION_AGE_MS) {
                staleOperations.push(operation);
            } else {
                freshOperations.push(operation);
            }
        }

        if (staleOperations.length > 0) {
            console.warn(`⚠️ Removing ${staleOperations.length} stale operations (older than 7 days):`,
                staleOperations.map(op => `${op.type}:${op.data?.blockId || op.data?.id}`));

            // Отменяем pending блоки для устаревших операций
            for (const op of staleOperations) {
                const blockId = op.data?.blockId || op.data?.id;
                if (blockId) {
                    this.pendingBlocks.delete(blockId);
                }
            }

            await this.saveQueue(freshOperations);

            dispatch('StaleOperationsRemoved', {
                count: staleOperations.length,
                operations: staleOperations.map(op => op.type)
            });
        }
    }

    /**
     * Предупреждение при закрытии страницы с несохранёнными изменениями
     * Используем кэшированное значение, так как beforeunload должен быть синхронным
     */
    handleBeforeUnload(e) {
        if (this.cachedQueueLength > 0) {
            // Стандартное предупреждение браузера
            e.preventDefault();
            e.returnValue = 'У вас есть несохранённые изменения. Вы уверены, что хотите уйти?';
            return e.returnValue;
        }
    }

    /**
     * Обработчик visibilitychange - проверяет очередь при возврате к вкладке
     * Если есть несинхронизированные операции и сеть доступна - запускает синхронизацию
     * Также восстанавливает застрявшую синхронизацию
     */
    async handleVisibilityChange() {
        if (document.visibilityState !== 'visible') {
            return;
        }

        // Проверяем не застряла ли синхронизация
        if ((this.isSyncing || this.isPulling) && this.syncStartTimestamp > 0) {
            const syncDuration = Date.now() - this.syncStartTimestamp;
            if (syncDuration > this.SYNC_STUCK_TIMEOUT_MS) {
                console.warn(`⚠️ Sync appears stuck (running for ${Math.round(syncDuration / 1000)}s), resetting state...`);
                this.isSyncing = false;
                this.isPulling = false;
                this.syncStartTimestamp = 0;
                dispatch('ApiSyncFinished');
                dispatch('SyncCompleted', {
                    successCount: 0,
                    failedCount: 0,
                    remainingCount: 0,
                    error: 'Синхронизация была прервана из-за таймаута'
                });
                // Продолжаем проверку очереди ниже
            } else {
                // Синхронизация идёт, но ещё не застряла
                console.log(`📱 Tab visible, sync in progress (${Math.round(syncDuration / 1000)}s)`);
                return;
            }
        }

        // Если уже идёт retry, не вмешиваемся
        if (this.retryTimer) {
            return;
        }

        // Проверяем есть ли операции в очереди
        const queue = await this.getQueue();
        if (queue.length === 0) {
            return;
        }

        // Проверяем реальное состояние сети
        const isReallyOnline = await this.checkRealNetworkStatus();
        if (!isReallyOnline) {
            console.log('📱 Tab visible, queue has items, but network unavailable');
            return;
        }

        console.log(`📱 Tab visible, found ${queue.length} pending operations, starting sync...`);
        this.isOnline = true;
        this.retryAttempts = 0;
        this.startPullPhase();
    }

    /**
     * Проверяет поддержку Background Sync API
     */
    async checkBackgroundSyncSupport() {
        if (!('serviceWorker' in navigator)) return false;
        if (!('SyncManager' in window)) return false;

        try {
            const registration = await navigator.serviceWorker.ready;
            return 'sync' in registration;
        } catch {
            return false;
        }
    }

    /**
     * Регистрирует Background Sync событие
     */
    async registerBackgroundSync() {
        if (!this.backgroundSyncSupported) return false;

        try {
            const registration = await navigator.serviceWorker.ready;
            await registration.sync.register(this.SYNC_TAG);
            console.log('Background Sync registered:', this.SYNC_TAG);
            return true;
        } catch (error) {
            console.warn('Background Sync registration failed:', error);
            return false;
        }
    }

    /**
     * Обрабатывает сообщения от Service Worker
     */
    handleSWMessage(event) {
        if (event.data && event.data.type === 'SYNC_COMPLETED') {
            console.log('Background sync completed:', event.data);
            dispatch('SyncCompleted', {
                successCount: event.data.successCount,
                failedCount: event.data.failedCount,
                remainingCount: event.data.failedCount,
                background: true
            });
            this.isSyncing = false;
        }
    }

    handleOnline() {
        console.log('🌐 Network: online event received');
        this.isOnline = true;
        this.pullCompleted = false;

        // Сбрасываем retry механизм — браузер сообщает что сеть доступна
        this.retryAttempts = 0;
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
            console.log('🌐 Cleared pending retry timer');
        }

        dispatch('NetworkStatusChange', { online: true });

        // Логируем состояние очереди
        this.getQueue().then(queue => {
            console.log(`🌐 Queue status: ${queue.length} pending operations`);
        });

        // Запускаем pull-before-push синхронизацию
        this.startPullPhase();
    }

    /**
     * Начинает фазу pull - получение обновлений с сервера
     * После завершения автоматически запускается push фаза
     */
    /**
     * Создаёт промис с таймаутом
     * @param {Promise} promise - Оригинальный промис
     * @param {number} ms - Таймаут в миллисекундах
     * @param {string} message - Сообщение об ошибке при таймауте
     */
    withTimeout(promise, ms, message = 'Operation timed out') {
        return Promise.race([
            promise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(message)), ms)
            )
        ]);
    }

    async startPullPhase() {
        if (this.isPulling) return;

        const queue = await this.getQueue();
        if (queue.length === 0) {
            // Нет локальных изменений - просто обновляем статус
            this.pullCompleted = true;
            return;
        }

        // Проверяем cooldown: если недавно делали pull, пропускаем его
        // WebSocket уже держит данные актуальными, поэтому частый pull не нужен
        const now = Date.now();
        const timeSinceLastPull = now - this.lastPullTimestamp;
        const skipPull = timeSinceLastPull < this.PULL_COOLDOWN_MS;

        if (skipPull) {
            console.log(`⏭️ Skipping pull phase (last pull ${Math.round(timeSinceLastPull / 1000)}s ago, cooldown ${this.PULL_COOLDOWN_MS / 1000}s)`);
            this.pullCompleted = true;
            await this.processQueue();
            return;
        }

        this.isPulling = true;
        this.syncStartTimestamp = Date.now();
        console.log('🔄 Starting pull phase before push...');

        dispatch('SyncStarted', {
            pendingCount: queue.length,
            phase: 'pull',
            message: 'Получение обновлений с сервера...'
        });

        try {
            // Получаем все блоки с сервера с таймаутом 15 секунд
            // Это защищает от зависания на медленных соединениях
            const { blocks: serverBlocks } = await this.withTimeout(
                api.getTreeBlocks(),
                15000,
                'Pull phase timed out'
            );

            console.log(`📥 Received ${serverBlocks.size} blocks from server`);

            // Мержим серверные данные с локальными
            await this.mergeServerBlocks(serverBlocks, queue);

            this.lastPullTimestamp = Date.now();
            this.pullCompleted = true;
            this.isPulling = false;

            console.log('✅ Pull phase completed, starting push phase...');

            // Теперь запускаем push фазу
            await this.processQueue();

        } catch (error) {
            console.error('❌ Pull phase failed:', error);
            this.isPulling = false;

            // Проверяем, является ли это сетевой ошибкой
            const isNetworkError = this.isNetworkError(error);

            if (isNetworkError) {
                // Сетевая ошибка - помечаем как офлайн и планируем retry
                console.log('⚠️ Network error detected, marking as offline and scheduling retry...');
                this.isOnline = false;
                dispatch('NetworkStatusChange', { online: false });
                this.scheduleRetry();
            } else {
                // Не сетевая ошибка - пытаемся push
                console.log('⚠️ Proceeding to push phase despite pull failure...');
                this.pullCompleted = true;
                await this.processQueue();
            }
        }
    }

    /**
     * Проверяет, является ли ошибка сетевой или транзиентной (требующей retry)
     * @param {Error} error - Ошибка
     * @returns {boolean}
     */
    isNetworkError(error) {
        if (!error) return false;

        const message = error.message?.toLowerCase() || '';
        const code = error.code || '';

        // Axios: если нет response, это сетевая ошибка (запрос не дошёл до сервера)
        // Типичные случаи: DNS failure, connection refused, network unreachable
        if (error.request && !error.response) {
            return true;
        }

        // HTTP статус коды (для ошибок от fetch/axios)
        const status = error.status || error.response?.status;
        if (status) {
            // 5xx - серверные ошибки, требуют retry
            // 408 - Request Timeout
            // 429 - Too Many Requests
            // 0 - сетевая ошибка (браузер не смог выполнить запрос)
            if (status >= 500 || status === 408 || status === 429 || status === 0) {
                return true;
            }
        }

        return (
            code === 'ERR_NETWORK' ||
            code === 'ERR_CANCELED' ||
            code === 'ECONNABORTED' ||
            code === 'ECONNREFUSED' ||
            code === 'ENOTFOUND' ||
            code === 'ETIMEDOUT' ||
            code === 'ECONNRESET' ||
            message.includes('network error') ||
            message.includes('failed to fetch') ||
            message.includes('timed out') ||
            message.includes('timeout') ||
            message.includes('net::') ||
            message.includes('connection refused') ||
            message.includes('502') ||
            message.includes('503') ||
            message.includes('504') ||
            message.includes('bad gateway') ||
            message.includes('service unavailable') ||
            message.includes('gateway timeout') ||
            message.includes('aborted')
        );
    }

    /**
     * Планирует повторную попытку синхронизации с экспоненциальным backoff
     */
    scheduleRetry() {
        // Отменяем предыдущий retry таймер
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }

        // Проверяем лимит попыток
        if (this.retryAttempts >= this.MAX_RETRY_ATTEMPTS) {
            console.warn(`⚠️ Max retry attempts (${this.MAX_RETRY_ATTEMPTS}) reached, waiting for online event`);
            this.retryAttempts = 0;
            return;
        }

        // Вычисляем интервал с exponential backoff
        const interval = this.RETRY_BASE_INTERVAL_MS * Math.pow(2, this.retryAttempts);
        const actualInterval = Math.min(interval, this.MAX_RETRY_INTERVAL_MS);

        this.retryAttempts++;

        console.log(`🔄 Scheduling retry #${this.retryAttempts} in ${actualInterval / 1000}s`);

        this.retryTimer = setTimeout(async () => {
            try {
                // Проверяем очередь перед retry
                const queue = await this.getQueue();
                if (queue.length === 0) {
                    console.log('✅ Queue empty, no retry needed');
                    this.retryTimer = null;
                    this.retryAttempts = 0;
                    return;
                }

                // Пытаемся сделать реальную проверку сети (fetch на известный URL)
                const isReallyOnline = await this.checkRealNetworkStatus();

                if (isReallyOnline) {
                    console.log('✅ Network is back, starting sync...');
                    this.retryTimer = null;
                    this.retryAttempts = 0; // Сбрасываем счётчик при успешном обнаружении сети
                    this.isOnline = true;
                    dispatch('NetworkStatusChange', { online: true });
                    await this.startPullPhase();
                } else {
                    console.log('❌ Network still unavailable');
                    this.retryTimer = null;
                    this.scheduleRetry();
                }
            } catch (error) {
                console.error('❌ Error in retry callback:', error);
                this.retryTimer = null;
                // При ошибке планируем следующую попытку
                this.scheduleRetry();
            }
        }, actualInterval);
    }

    /**
     * Проверяет реальное состояние сети через fetch
     * @returns {Promise<boolean>}
     */
    async checkRealNetworkStatus() {
        try {
            // Пытаемся сделать простой запрос к бэкенду
            const pingUrl = `${config.APP_BACKEND_URL}/api/v1/blocks/roots/`;
            await fetch(pingUrl, {
                method: 'HEAD',
                cache: 'no-store',
                credentials: 'include', // Для отправки JWT cookie
                signal: AbortSignal.timeout(this.NETWORK_CHECK_TIMEOUT_MS)
            });
            // Любой ответ (даже 401) означает что сеть работает
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Мержит блоки с сервера с локальными изменениями
     * Стратегия: серверные данные имеют приоритет для полей, которые не были изменены локально
     *
     * @param {Map} serverBlocks - Блоки с сервера
     * @param {Array} queue - Очередь локальных операций
     */
    async mergeServerBlocks(serverBlocks, queue) {
        const { localStateManager } = await import('../stateLocal/localStateManager.js');

        // Собираем ID блоков, которые были изменены локально
        const locallyModifiedIds = new Set();
        for (const operation of queue) {
            const { type, data } = operation;
            switch (type) {
                case 'createBlock':
                case 'createTree':
                    locallyModifiedIds.add(data.blockId);
                    if (data.parentId) locallyModifiedIds.add(data.parentId);
                    break;
                case 'updateBlock':
                    locallyModifiedIds.add(data.blockId || data.id);
                    break;
                case 'moveBlock':
                    locallyModifiedIds.add(data.blockId);
                    if (data.oldParentId) locallyModifiedIds.add(data.oldParentId);
                    if (data.newParentId) locallyModifiedIds.add(data.newParentId);
                    break;
                case 'deleteBlock':
                    // Удалённые блоки не мержим с сервера
                    locallyModifiedIds.add(data.blockId || data.id);
                    break;
            }
        }

        console.log(`📝 Locally modified blocks: ${locallyModifiedIds.size}`);

        // Обновляем локальные блоки серверными данными
        for (const [blockId, serverBlock] of serverBlocks) {
            const localBlock = localStateManager.blocks.get(blockId);

            if (!localBlock) {
                // Новый блок с сервера - просто сохраняем
                await localStateManager.getInstance().saveBlock(serverBlock);
                continue;
            }

            if (locallyModifiedIds.has(blockId)) {
                // Блок был изменён локально - мержим осторожно
                // Сохраняем локальные изменения, но обновляем updated_at с сервера если он новее
                const serverUpdatedAt = new Date(serverBlock.updated_at).getTime();
                const localUpdatedAt = new Date(localBlock.updated_at).getTime();

                if (serverUpdatedAt > localUpdatedAt) {
                    // Сервер имеет более новую версию - конфликт!
                    // Логируем конфликт, но сохраняем локальные изменения
                    // (они будут отправлены на сервер в push фазе)
                    console.warn(`⚠️ Conflict detected for block ${blockId}: server is newer`);
                }
                // Не перезаписываем локально изменённый блок
                continue;
            }

            // Блок не был изменён локально - обновляем серверными данными
            const mergedBlock = {
                ...serverBlock,
                // Синхронизируем childOrder с children
                data: {
                    ...serverBlock.data,
                    childOrder: serverBlock.data?.childOrder?.length > 0
                        ? serverBlock.data.childOrder
                        : (serverBlock.children || [])
                }
            };

            await localStateManager.getInstance().saveBlock(mergedBlock);
        }

        console.log('✅ Merge completed');
    }

    handleOffline() {
        console.log('Network: offline');
        this.isOnline = false;
        dispatch('NetworkStatusChange', { online: false });
    }

    /**
     * Добавляет операцию в очередь
     * @param {Object} operation - Операция для выполнения
     * @param {string} operation.type - Тип операции (createBlock, updateBlock, deleteBlock, moveBlock)
     * @param {Object} operation.data - Данные операции (blockId, parentId, etc.)
     * @param {Object} options - Дополнительные опции
     * @param {boolean} options.immediate - Если true, синхронизация запускается сразу без debounce
     */
    async enqueue(operation, options = {}) {
        const queue = await this.getQueue();

        operation.timestamp = Date.now();
        queue.push(operation);
        await this.saveQueue(queue);

        console.log('Operation queued:', operation.type, operation.data?.blockId);

        // Уведомляем UI о новой операции в очереди
        dispatch('OperationQueued', { count: queue.length });

        // Если онлайн, запускаем синхронизацию
        if (this.isOnline && !this.isSyncing && !this.isPulling) {
            // Определяем debounce на основе типа операции и shared статуса
            const debounceMs = await this._getDebounceForOperation(operation, options);

            if (debounceMs === 0 || options.immediate) {
                // Немедленная синхронизация без debounce
                // Отменяем существующий таймер
                if (this.syncDebounceTimer) {
                    clearTimeout(this.syncDebounceTimer);
                    this.syncDebounceTimer = null;
                }
                this.startPullPhase();
            } else {
                // Синхронизация с адаптивным debounce
                this.scheduleSyncWithDebounce(debounceMs);
            }
        } else if (!this.isOnline) {
            // Если offline, регистрируем Background Sync
            await this.registerBackgroundSync();
        }
    }

    /**
     * Запускает синхронизацию с задержкой (debounce)
     * Позволяет накопить несколько операций перед отправкой
     * @param {number} debounceMs - Задержка в мс (если не указан, используется default)
     */
    scheduleSyncWithDebounce(debounceMs = null) {
        // Используем переданный debounce или default
        const delay = debounceMs ?? this.DEBOUNCE_CONFIG.default;

        // Отменяем предыдущий таймер если есть
        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
        }

        // Запускаем новый таймер
        this.syncDebounceTimer = setTimeout(() => {
            this.syncDebounceTimer = null;
            if (this.isOnline && !this.isSyncing && !this.isPulling) {
                this.startPullPhase();
            }
        }, delay);
    }

    /**
     * Получает очередь из IndexedDB
     */
    async getQueue() {
        try {
            const queue = await localforage.getItem(this.QUEUE_KEY);
            return queue || [];
        } catch (error) {
            console.error('Error getting offline queue:', error);
            return [];
        }
    }

    /**
     * Сохраняет очередь в IndexedDB
     */
    async saveQueue(queue) {
        try {
            await localforage.setItem(this.QUEUE_KEY, queue);
            // Обновляем кэшированную длину для синхронной проверки в beforeunload
            this.cachedQueueLength = queue.length;
        } catch (error) {
            console.error('Error saving offline queue:', error);
        }
    }

    /**
     * Обрабатывает очередь операций через batch import API (push фаза)
     * Вызывается после завершения pull фазы
     */
    async processQueue() {
        // Не запускаем push пока идёт pull или синхронизация
        if (this.isSyncing || !this.isOnline || this.isPulling) return;

        const queue = await this.getQueue();
        if (queue.length === 0) return;

        this.isSyncing = true;
        dispatch('SyncStarted', {
            pendingCount: queue.length,
            phase: 'push',
            message: 'Отправка изменений на сервер...'
        });

        console.log(`📤 Push phase: processing ${queue.length} operations via batch import`);

        try {
            // Получаем функцию для загрузки блоков из LocalStateManager
            const getBlockById = async (id) => {
                const { localStateManager } = await import('../stateLocal/localStateManager.js');
                return localStateManager.blocks.get(id);
            };

            // Строим дерево изменений из текущего состояния блоков
            const { blocks, deletedIds } = await this.buildChangedBlocksTree(queue, getBlockById);

            if (blocks.length === 0) {
                console.log('No blocks to sync after merging operations');
                await this.saveQueue([]);
                this.isSyncing = false;
                dispatch('SyncCompleted', { successCount: queue.length, failedCount: 0, remainingCount: 0 });
                return;
            }

            console.log(`Merged ${queue.length} operations into ${blocks.length} blocks for import`);

            dispatch('SyncProgress', {
                completed: 0,
                total: blocks.length,
                stage: 'importing',
                message: `Синхронизация ${blocks.length} блоков...`
            });

            // Сигнализируем о начале синхронизации (моргание API индикатора)
            dispatch('ApiSyncStarted');

            // Отправляем на import (silent — без loading cursor)
            const { task_id } = await importBlocks(blocks, { silent: true });

            // Отслеживаем прогресс задачи импорта (silent — без loading cursor)
            const result = await pollImportStatus(task_id, (progress) => {
                dispatch('SyncProgress', {
                    completed: progress.processed,
                    total: progress.total,
                    percent: progress.percent,
                    stage: progress.stage
                });
            }, 500, 300000, { silent: true });

            // Обработка частичных ошибок 403 (Permission Denied)
            if (result.errors?.length > 0) {
                const forbiddenIds = result.errors
                    .filter(e => e.status === 403)
                    .map(e => e.block_id);

                if (forbiddenIds.length > 0) {
                    await this.handlePermissionError(forbiddenIds);
                }
            }

            // Обновляем локальное состояние с новыми блоками от сервера
            if (result.blocks) {
                dispatch('BatchImportCompleted', {
                    blocks: result.blocks,
                    deletedIds: Array.from(deletedIds)
                });
            }

            // Очищаем pending блоки - все синхронизированные блоки теперь на сервере
            const syncedBlockIds = new Set(blocks.map(b => b.id));
            for (const blockId of syncedBlockIds) {
                this.resolvePendingBlock(blockId);
            }

            // Отменяем pending для удалённых блоков
            this.cancelPendingBlocks(deletedIds);

            // Очищаем очередь
            await this.saveQueue([]);
            this.isSyncing = false;
            this.syncStartTimestamp = 0;

            // Сбрасываем retry счётчик при успешной синхронизации
            this.retryAttempts = 0;

            // Сигнализируем об окончании синхронизации
            dispatch('ApiSyncFinished');

            dispatch('SyncCompleted', {
                successCount: queue.length,
                failedCount: 0,
                remainingCount: 0
            });

        } catch (error) {
            console.error('Batch import failed:', error);
            this.isSyncing = false;
            this.syncStartTimestamp = 0;

            // Сигнализируем об окончании синхронизации (даже при ошибке)
            dispatch('ApiSyncFinished');

            // Проверяем, является ли это сетевой ошибкой
            const isNetworkError = this.isNetworkError(error);

            if (isNetworkError) {
                // Сетевая ошибка - помечаем как офлайн и планируем retry
                console.log('⚠️ Network error in push phase, marking as offline and scheduling retry...');
                this.isOnline = false;
                dispatch('NetworkStatusChange', { online: false });

                dispatch('SyncCompleted', {
                    successCount: 0,
                    failedCount: queue.length,
                    remainingCount: queue.length,
                    error: 'Нет подключения к сети'
                });

                this.scheduleRetry();
            } else {
                // Не сетевая ошибка - уведомляем и пробуем Background Sync или fallback retry
                dispatch('SyncCompleted', {
                    successCount: 0,
                    failedCount: queue.length,
                    remainingCount: queue.length,
                    error: error.message
                });

                // Пробуем Background Sync, если не поддерживается - fallback на retry
                const registered = await this.registerBackgroundSync();
                if (!registered) {
                    // Background Sync не поддерживается - используем fallback retry
                    console.log('⚠️ Background Sync not available, using fallback retry...');
                    this.scheduleRetry();
                }
            }
        }
    }

    /**
     * Собирает все изменённые блоки из очереди операций в формат для import API
     * Берёт финальное состояние блоков из localStateManager.blocks
     *
     * @param {Array} queue - Очередь операций
     * @param {Function} getBlockById - Функция для получения блока по ID
     * @returns {Promise<{blocks: Array, deletedIds: Set}>}
     */
    async buildChangedBlocksTree(queue, getBlockById) {
        // Set: ID всех затронутых блоков (включая родителей)
        const affectedBlockIds = new Set();
        // Set: удалённые блоки
        const deletedIds = new Set();

        // Собираем все затронутые блоки
        for (const operation of queue) {
            const { type, data } = operation;

            switch (type) {
                case 'createBlock': {
                    const { blockId } = data;
                    affectedBlockIds.add(blockId);
                    // Родитель НЕ добавляется - бэкенд сам обновит children родителя
                    // по parent_id нового блока. Это предотвращает race condition
                    // когда два клиента одновременно создают блоки в одном родителе.
                    break;
                }

                case 'createTree': {
                    const { blockId } = data;
                    affectedBlockIds.add(blockId);
                    break;
                }

                case 'updateBlock': {
                    // Поддерживаем оба варианта: blockId и id
                    const blockId = data.blockId || data.id;
                    if (blockId) affectedBlockIds.add(blockId);
                    break;
                }

                case 'moveBlock': {
                    const { blockId, oldParentId, newParentId } = data;
                    affectedBlockIds.add(blockId);
                    if (oldParentId) affectedBlockIds.add(oldParentId);
                    if (newParentId) affectedBlockIds.add(newParentId);
                    break;
                }

                case 'deleteBlock': {
                    const { blockId, parentId, id } = data;
                    deletedIds.add(blockId || id);
                    // Добавляем родителя - его children нужно обновить на сервере
                    if (parentId) {
                        affectedBlockIds.add(parentId);
                    }
                    break;
                }
            }
        }

        console.log('📦 Building changed blocks tree:');
        console.log('  - Affected blocks:', Array.from(affectedBlockIds));
        console.log('  - Deleted blocks:', Array.from(deletedIds));

        // Формируем массив блоков из финального состояния
        const blocks = [];

        for (const blockId of affectedBlockIds) {
            // Пропускаем удалённые блоки
            if (deletedIds.has(blockId)) continue;

            // Получаем финальное состояние блока из памяти
            const localBlock = await getBlockById(blockId);
            if (!localBlock) {
                console.warn('⚠️ Block not found in local state:', blockId);
                continue;
            }

            // Фильтруем удалённые из children и childOrder
            const finalChildren = (localBlock.children || [])
                .filter(cid => !deletedIds.has(cid));

            // Копируем data и фильтруем childOrder
            const finalData = {...(localBlock.data || {})};
            if (finalData.childOrder) {
                finalData.childOrder = finalData.childOrder.filter(cid => !deletedIds.has(cid));
            }

            // Синхронизируем childOrder с children если childOrder пустой
            if (!finalData.childOrder || finalData.childOrder.length === 0) {
                finalData.childOrder = [...finalChildren];
            }

            const blockPayload = {
                id: localBlock.id,
                parent_id: localBlock.parent_id || null,
                title: localBlock.title || '',
                children: finalChildren,
                data: finalData
            };

            console.log('  📄 Block payload:', blockPayload.id,
                'parent:', blockPayload.parent_id,
                'children:', finalChildren.length,
                'childOrder:', finalData.childOrder?.length || 0);

            blocks.push(blockPayload);
        }

        return {
            blocks,
            deletedIds
        };
    }

    /**
     * Возвращает количество операций в очереди
     */
    async getPendingCount() {
        const queue = await this.getQueue();
        return queue.length;
    }

    /**
     * Очищает очередь
     */
    async clearQueue() {
        await this.saveQueue([]);
    }

    /**
     * Проверяет, есть ли ожидающие операции
     */
    async hasPendingOperations() {
        const count = await this.getPendingCount();
        return count > 0;
    }

    /**
     * Проверяет, затронут ли блок pending операцией в очереди
     * Учитывает move, update, create и delete операции
     * @param {string} blockId - ID блока
     * @returns {Promise<boolean>}
     */
    async isBlockAffectedByPendingOperation(blockId) {
        const queue = await this.getQueue();

        for (const operation of queue) {
            const { type, data } = operation;
            switch (type) {
                case 'createBlock':
                case 'createTree':
                    // Create затрагивает сам блок и родителя (сервер обновит children родителя)
                    if (data.blockId === blockId || data.id === blockId || data.parentId === blockId) {
                        return true;
                    }
                    break;
                case 'updateBlock':
                case 'deleteBlock':
                    if (data.blockId === blockId || data.id === blockId) {
                        return true;
                    }
                    break;
                case 'moveBlock':
                    // Move затрагивает сам блок и оба родителя
                    if (data.blockId === blockId ||
                        data.oldParentId === blockId ||
                        data.newParentId === blockId) {
                        return true;
                    }
                    break;
            }
        }

        return false;
    }

    /**
     * Получает список блоков, затронутых pending операциями
     * @returns {Promise<Set<string>>}
     */
    async getBlocksAffectedByPendingOperations() {
        const queue = await this.getQueue();
        const affectedIds = new Set();

        for (const operation of queue) {
            const { type, data } = operation;
            switch (type) {
                case 'createBlock':
                case 'createTree':
                    if (data.blockId) affectedIds.add(data.blockId);
                    if (data.parentId) affectedIds.add(data.parentId);
                    break;
                case 'updateBlock':
                    affectedIds.add(data.blockId || data.id);
                    break;
                case 'moveBlock':
                    affectedIds.add(data.blockId);
                    if (data.oldParentId) affectedIds.add(data.oldParentId);
                    if (data.newParentId) affectedIds.add(data.newParentId);
                    break;
                case 'deleteBlock':
                    affectedIds.add(data.blockId || data.id);
                    break;
            }
        }

        return affectedIds;
    }

    /**
     * Проверяет, поддерживается ли Background Sync
     */
    isBackgroundSyncAvailable() {
        return this.backgroundSyncSupported;
    }

    /**
     * Принудительно запускает синхронизацию
     */
    async triggerManualSync() {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'TRIGGER_SYNC'
            });
        } else {
            await this.processQueue();
        }
    }

    /**
     * Очистка ресурсов при уничтожении экземпляра
     * Удаляет event listeners и очищает таймеры
     */
    destroy() {
        // Удаляем event listeners
        window.removeEventListener('online', this._handleOnline);
        window.removeEventListener('offline', this._handleOffline);
        window.removeEventListener('beforeunload', this._handleBeforeUnload);
        document.removeEventListener('visibilitychange', this._handleVisibilityChange);

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.removeEventListener('message', this._handleSWMessage);
        }

        // Очищаем таймеры
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }

        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
            this.syncDebounceTimer = null;
        }

        // Очищаем pending блоки
        this.pendingBlocks.clear();
    }

    /**
     * Обрабатывает ошибку 403 (Permission Denied) при синхронизации
     * Помечает затронутые блоки как forbidden и уведомляет пользователя
     * @param {string[]} failedBlockIds - массив ID блоков с ошибкой прав
     */
    async handlePermissionError(failedBlockIds) {
        if (!failedBlockIds || failedBlockIds.length === 0) return;

        try {
            // Динамический импорт для избежания циклических зависимостей
            const { localStateManager } = await import('../stateLocal/localStateManager.js');

            for (const blockId of failedBlockIds) {
                const block = localStateManager.blocks.get(blockId);
                if (block) {
                    block.forbidden = true;
                    await localStateManager.saveBlock(block);
                }
                // Убираем из pending - синхронизация для этого блока невозможна
                this.resolvePendingBlock(blockId);
            }

            // Перерисовываем UI
            dispatch('ShowBlocks');
        } catch (error) {
            console.error('Failed to handle permission error:', error);
            dispatch('ShowError', { message: 'Ошибка обновления прав доступа' });
            return;
        }

        // Уведомляем пользователя
        dispatch('ShowError', {
            message: `Права на ${failedBlockIds.length} блок(ов) были отозваны`
        });
    }
}

// Экспортируем singleton
export const offlineQueue = new OfflineQueueManager();

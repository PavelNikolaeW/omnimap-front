import localforage from "localforage";
import { dispatch } from "../utils/utils";
import { v4 as uuidV4 } from 'uuid';
import { importBlocks, pollImportStatus } from '../api/importService.js';
import api from '../api/api.js';

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
        this.SYNC_DEBOUNCE_MS = 3000; // Задержка перед началом синхронизации (3 сек)
        this.lastPullTimestamp = 0; // Время последнего pull
        this.PULL_COOLDOWN_MS = 30000; // Минимальный интервал между pull (30 сек)

        // Блоки, ожидающие синхронизации с сервером (созданы локально, но ещё не на сервере)
        // Map<blockId, Promise<void>> - промис резолвится когда блок синхронизирован
        this.pendingBlocks = new Map();

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
     * @returns {Promise<void>}
     */
    async waitForBlock(blockId) {
        const pending = this.pendingBlocks.get(blockId);
        if (pending) {
            await pending;
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
        return { resolve, reject };
    }

    /**
     * Помечает блок как синхронизированный
     * @param {string} blockId - ID блока
     */
    resolvePendingBlock(blockId) {
        this.pendingBlocks.delete(blockId);
    }

    /**
     * Отменяет ожидание всех pending блоков из списка
     * Используется когда блоки были удалены до синхронизации
     * @param {Set<string>} blockIds - ID блоков для отмены
     */
    cancelPendingBlocks(blockIds) {
        for (const blockId of blockIds) {
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

    async init() {
        // Слушаем события сети
        window.addEventListener('online', this.handleOnline.bind(this));
        window.addEventListener('offline', this.handleOffline.bind(this));

        // Предупреждение при закрытии страницы с несохранёнными изменениями
        window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));

        // Проверяем поддержку Background Sync
        this.backgroundSyncSupported = await this.checkBackgroundSyncSupport();
        if (this.backgroundSyncSupported) {
            console.log('Background Sync API supported');
        }

        // Слушаем сообщения от Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', this.handleSWMessage.bind(this));
        }

        // Проверяем очередь при старте, если онлайн
        if (this.isOnline) {
            // При старте приложения запускаем pull-before-push
            this.startPullPhase();
        }

        // Инициализируем кэш длины очереди
        this.getQueue().then(queue => {
            this.cachedQueueLength = queue.length;
        });
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
        console.log('Network: online');
        this.isOnline = true;
        this.pullCompleted = false;
        dispatch('NetworkStatusChange', { online: true });
        // Не вызываем processQueue сразу - ждём завершения pull фазы
        // Pull будет инициирован через WebSocket (SincManager.online)
        // После получения обновлений вызовется processSyncQueue
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

            // При ошибке pull (включая таймаут) всё равно пытаемся push
            // (локальные данные могут быть актуальнее)
            console.log('⚠️ Proceeding to push phase despite pull failure...');
            this.pullCompleted = true;
            await this.processQueue();
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
     */
    async enqueue(operation) {
        const queue = await this.getQueue();

        operation.timestamp = Date.now();
        queue.push(operation);
        await this.saveQueue(queue);

        console.log('Operation queued:', operation.type, operation.data?.blockId);

        // Уведомляем UI о новой операции в очереди
        dispatch('OperationQueued', { count: queue.length });

        // Если онлайн, запускаем синхронизацию с debounce
        // Это позволяет накопить несколько операций перед отправкой
        if (this.isOnline && !this.isSyncing && !this.isPulling) {
            this.scheduleSyncWithDebounce();
        } else if (!this.isOnline) {
            // Если offline, регистрируем Background Sync
            await this.registerBackgroundSync();
        }
    }

    /**
     * Запускает синхронизацию с задержкой (debounce)
     * Позволяет накопить несколько операций перед отправкой
     */
    scheduleSyncWithDebounce() {
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
        }, this.SYNC_DEBOUNCE_MS);
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

            // Сигнализируем об окончании синхронизации (даже при ошибке)
            dispatch('ApiSyncFinished');

            dispatch('SyncCompleted', {
                successCount: 0,
                failedCount: queue.length,
                remainingCount: queue.length,
                error: error.message
            });

            // Регистрируем Background Sync для повторной попытки
            await this.registerBackgroundSync();
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
}

// Экспортируем singleton
export const offlineQueue = new OfflineQueueManager();

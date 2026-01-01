import localforage from "localforage";
import { dispatch } from "../utils/utils";
import { v4 as uuidV4 } from 'uuid';
import { importBlocks, pollImportStatus } from '../api/importService.js';

/**
 * Префикс для временных ID созданных офлайн
 */
const TEMP_ID_PREFIX = 'temp_';

/**
 * Минимальное количество операций для использования batch import
 * При меньшем количестве используем старый подход с отдельными запросами
 */
const MIN_OPERATIONS_FOR_BATCH = 3;

/**
 * Менеджер очереди операций для offline режима
 * Сохраняет операции в IndexedDB при отсутствии сети
 * и синхронизирует их при восстановлении соединения.
 * Поддерживает Background Sync API для синхронизации в фоне.
 */
class OfflineQueueManager {
    constructor() {
        this.QUEUE_KEY = 'offlineOperationsQueue';
        this.TEMP_ID_MAP_KEY = 'tempIdMap';
        this.SYNC_TAG = 'omnimap-sync';
        this.isOnline = navigator.onLine;
        this.isSyncing = false;
        this.backgroundSyncSupported = false;

        // Throttling настройки
        this.BATCH_SIZE = 10;           // Максимум операций в одном батче
        this.BATCH_DELAY_MS = 100;      // Задержка между батчами (мс)
        this.OPERATION_DELAY_MS = 50;   // Задержка между операциями внутри батча

        this.init();
    }

    /**
     * Генерирует временный ID для блока, созданного офлайн
     * @returns {string} Временный UUID с префиксом temp_
     */
    generateTempId() {
        return `${TEMP_ID_PREFIX}${uuidV4()}`;
    }

    /**
     * Проверяет, является ли ID временным
     * @param {string} id - ID для проверки
     * @returns {boolean}
     */
    isTempId(id) {
        return id && typeof id === 'string' && id.startsWith(TEMP_ID_PREFIX);
    }

    /**
     * Сохраняет маппинг временного ID на реальный
     * @param {string} tempId - Временный ID
     * @param {string} realId - Реальный ID с сервера
     */
    async saveTempIdMapping(tempId, realId) {
        const map = await this.getTempIdMap();
        map[tempId] = realId;
        await localforage.setItem(this.TEMP_ID_MAP_KEY, map);
    }

    /**
     * Получает маппинг временных ID
     * @returns {Promise<Object>} Объект {tempId: realId}
     */
    async getTempIdMap() {
        try {
            const map = await localforage.getItem(this.TEMP_ID_MAP_KEY);
            return map || {};
        } catch (error) {
            console.error('Error getting temp ID map:', error);
            return {};
        }
    }

    /**
     * Получает реальный ID по временному
     * @param {string} tempId - Временный ID
     * @returns {Promise<string|null>} Реальный ID или null
     */
    async getRealId(tempId) {
        const map = await this.getTempIdMap();
        return map[tempId] || null;
    }

    /**
     * Очищает маппинг временных ID
     */
    async clearTempIdMap() {
        await localforage.removeItem(this.TEMP_ID_MAP_KEY);
    }

    /**
     * Проверяет, можно ли использовать batch import для операций
     * Batch import подходит когда:
     * - Есть createBlock, updateBlock операции
     * - Нет операций deleteBlock (для удаления нужен особый подход через parent.children)
     * @param {Array} queue - Очередь операций
     * @returns {boolean}
     */
    canUseBatchImport(queue) {
        if (queue.length < MIN_OPERATIONS_FOR_BATCH) return false;

        // Batch import поддерживает create, update и move
        // Delete обрабатывается через удаление из children родителя
        const supportedTypes = ['createBlock', 'updateBlock', 'moveBlock', 'deleteBlock'];
        return queue.every(op => supportedTypes.includes(op.type));
    }

    /**
     * Собирает все изменённые блоки из очереди операций в формат для import API
     * Берёт финальное состояние блоков из localStateManager.blocks
     *
     * @param {Array} queue - Очередь операций
     * @param {Function} getBlockById - Функция для получения блока по ID из локального состояния
     * @returns {Promise<{blocks: Array, deletedIds: Set, tempIdToRealId: Map}>}
     */
    async buildChangedBlocksTree(queue, getBlockById) {
        // Set: ID всех затронутых блоков (включая родителей)
        const affectedBlockIds = new Set();
        // Set: удалённые блоки
        const deletedIds = new Set();
        // Map: tempId -> realId (для новых блоков)
        const tempIdToRealId = new Map();

        // Первый проход: собираем temp ID и генерируем для них реальные UUID
        for (const operation of queue) {
            const { type, data } = operation;
            if (type === 'createBlock' && data.tempId) {
                const realId = uuidV4();
                tempIdToRealId.set(data.tempId, realId);
            }
        }

        // Второй проход: собираем все затронутые блоки
        for (const operation of queue) {
            const { type, data } = operation;

            switch (type) {
                case 'createBlock': {
                    const { tempId, parentId } = data;
                    affectedBlockIds.add(tempId);
                    if (parentId) affectedBlockIds.add(parentId);
                    break;
                }

                case 'updateBlock': {
                    const { id } = data;
                    affectedBlockIds.add(id);
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
                    const { id, parentId } = data;
                    const resolvedId = this.resolveId(id, tempIdToRealId);
                    deletedIds.add(resolvedId);
                    // Также добавляем temp ID в deleted, если это temp блок
                    if (this.isTempId(id)) {
                        deletedIds.add(id);
                    }
                    // Добавляем родителя - его children нужно обновить на сервере
                    if (parentId) {
                        affectedBlockIds.add(parentId);
                    }
                    break;
                }
            }
        }

        // Формируем массив блоков из финального состояния
        const blocks = [];

        for (const blockId of affectedBlockIds) {
            // Пропускаем удалённые блоки
            const resolvedId = this.resolveId(blockId, tempIdToRealId);
            if (deletedIds.has(resolvedId) || deletedIds.has(blockId)) continue;

            // Получаем финальное состояние блока из памяти
            const localBlock = await getBlockById(blockId);
            if (!localBlock) continue;

            // Определяем финальный ID блока
            const finalId = this.isTempId(blockId)
                ? tempIdToRealId.get(blockId)
                : blockId;

            // Резолвим parent_id
            const finalParentId = localBlock.parent_id
                ? this.resolveId(localBlock.parent_id, tempIdToRealId)
                : null;

            // Резолвим children и фильтруем удалённые
            const finalChildren = (localBlock.children || [])
                .map(cid => this.resolveId(cid, tempIdToRealId))
                .filter(cid => !deletedIds.has(cid));

            blocks.push({
                id: finalId,
                parent_id: finalParentId,
                title: localBlock.title || '',
                children: finalChildren,
                data: localBlock.data || {}
            });
        }

        return {
            blocks,
            deletedIds,
            tempIdToRealId
        };
    }

    /**
     * Резолвит ID: если это tempId и есть маппинг - возвращает realId
     * @param {string} id - ID для проверки
     * @param {Map} tempIdToRealId - Маппинг временных ID
     * @returns {string}
     */
    resolveId(id, tempIdToRealId) {
        if (!id) return id;
        if (tempIdToRealId.has(id)) {
            return tempIdToRealId.get(id);
        }
        return id;
    }

    /**
     * Мержит данные блока с новыми изменениями
     * @param {Object} block - Существующий блок
     * @param {Object} changes - Изменения для применения
     * @returns {Object}
     */
    mergeBlockData(block, changes) {
        const merged = { ...block };

        if (changes.title !== undefined) {
            merged.title = changes.title;
        }

        if (changes.data !== undefined) {
            merged.data = { ...(merged.data || {}), ...changes.data };
        }

        return merged;
    }

    async init() {
        // Слушаем события сети
        window.addEventListener('online', this.handleOnline.bind(this));
        window.addEventListener('offline', this.handleOffline.bind(this));

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
            this.processQueue();
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
        dispatch('NetworkStatusChange', { online: true });
        this.processQueue();
    }

    handleOffline() {
        console.log('Network: offline');
        this.isOnline = false;
        dispatch('NetworkStatusChange', { online: false });
    }

    /**
     * Добавляет операцию в очередь
     * @param {Object} operation - Операция для выполнения
     * @param {string} operation.type - Тип операции (createBlock, updateBlock, deleteBlock, etc.)
     * @param {Object} operation.data - Данные операции
     * @param {string} operation.id - Уникальный ID операции
     */
    async enqueue(operation) {
        const queue = await this.getQueue();

        operation.timestamp = Date.now();
        operation.retryCount = 0;

        queue.push(operation);
        await this.saveQueue(queue);

        console.log('Operation queued:', operation.type, operation.id);

        // Если онлайн, пытаемся сразу обработать
        if (this.isOnline && !this.isSyncing) {
            this.processQueue();
        } else if (!this.isOnline) {
            // Если offline, регистрируем Background Sync
            await this.registerBackgroundSync();
        }
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
        } catch (error) {
            console.error('Error saving offline queue:', error);
        }
    }

    /**
     * Задержка выполнения
     * @param {number} ms - Миллисекунды
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Сортирует операции для правильного порядка выполнения
     * createBlock должен идти перед updateBlock/moveBlock того же блока
     * deleteBlock должен идти последним
     * @param {Array} queue - Очередь операций
     * @returns {Array} Отсортированная очередь
     */
    sortOperations(queue) {
        const priority = {
            'createTree': 0,
            'createBlock': 1,
            'updateBlock': 2,
            'moveBlock': 3,
            'deleteBlock': 4
        };

        return [...queue].sort((a, b) => {
            const priorityA = priority[a.type] ?? 99;
            const priorityB = priority[b.type] ?? 99;
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }
            // При одинаковом приоритете сохраняем порядок по timestamp
            return (a.timestamp || 0) - (b.timestamp || 0);
        });
    }

    /**
     * Обрабатывает очередь операций
     * При достаточном количестве операций использует batch import для оптимизации
     */
    async processQueue() {
        if (this.isSyncing || !this.isOnline) return;

        const queue = await this.getQueue();
        if (queue.length === 0) return;

        this.isSyncing = true;
        dispatch('SyncStarted', { pendingCount: queue.length });

        // Проверяем, можно ли использовать batch import
        if (this.canUseBatchImport(queue)) {
            await this.processBatchImport(queue);
        } else {
            await this.processQueueSequentially(queue);
        }
    }

    /**
     * Обрабатывает очередь через batch import API
     * Объединяет все операции в одно дерево блоков и отправляет одним запросом
     * @param {Array} queue - Очередь операций
     */
    async processBatchImport(queue) {
        console.log(`Processing ${queue.length} operations via batch import`);

        try {
            // Получаем функцию для загрузки блоков из LocalStateManager
            const getBlockById = async (id) => {
                const { localStateManager } = await import('../stateLocal/localStateManager.js');
                return localStateManager.blocks.get(id);
            };

            // Строим дерево изменений
            const { blocks, deletedIds, tempIdToRealId } = await this.buildChangedBlocksTree(queue, getBlockById);

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

            // Отправляем на import
            const { task_id } = await importBlocks(blocks);

            // Отслеживаем прогресс задачи импорта
            const result = await pollImportStatus(task_id, (progress) => {
                dispatch('SyncProgress', {
                    completed: progress.processed,
                    total: progress.total,
                    percent: progress.percent,
                    stage: progress.stage
                });
            });

            // Сохраняем маппинги tempId -> realId
            for (const [tempId, realId] of tempIdToRealId) {
                await this.saveTempIdMapping(tempId, realId);

                // Уведомляем о замене ID
                dispatch('TempIdResolved', { tempId, realId });
            }

            // Обновляем локальное состояние с новыми блоками
            if (result.blocks) {
                dispatch('BatchImportCompleted', {
                    blocks: result.blocks,
                    tempIdToRealId: Object.fromEntries(tempIdToRealId),
                    deletedIds: Array.from(deletedIds)
                });
            }

            // Очищаем очередь
            await this.saveQueue([]);
            this.isSyncing = false;

            dispatch('SyncCompleted', {
                successCount: queue.length,
                failedCount: 0,
                remainingCount: 0,
                usedBatchImport: true
            });

        } catch (error) {
            console.error('Batch import failed, falling back to sequential processing:', error);

            // При ошибке batch import пробуем последовательную обработку
            await this.processQueueSequentially(queue);
        }
    }

    /**
     * Обрабатывает очередь операций последовательно с throttling
     * Используется как fallback или для малого количества операций
     * @param {Array} queue - Очередь операций
     */
    async processQueueSequentially(queue) {
        // Сортируем операции для правильного порядка
        const sortedQueue = this.sortOperations(queue);
        const failedOperations = [];
        let successCount = 0;

        // Разбиваем на батчи
        const batches = [];
        for (let i = 0; i < sortedQueue.length; i += this.BATCH_SIZE) {
            batches.push(sortedQueue.slice(i, i + this.BATCH_SIZE));
        }

        console.log(`Processing ${queue.length} operations in ${batches.length} batches (sequential mode)`);

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];

            // Задержка между батчами (кроме первого)
            if (batchIndex > 0) {
                await this.delay(this.BATCH_DELAY_MS);
            }

            // Проверяем, что всё ещё онлайн
            if (!this.isOnline) {
                console.log('Network lost during sync, pausing...');
                // Сохраняем оставшиеся операции
                const remaining = batches.slice(batchIndex).flat();
                await this.saveQueue([...failedOperations, ...remaining]);
                this.isSyncing = false;
                return;
            }

            // Выполняем операции в батче последовательно с небольшой задержкой
            for (let opIndex = 0; opIndex < batch.length; opIndex++) {
                const operation = batch[opIndex];

                // Задержка между операциями внутри батча (кроме первой)
                if (opIndex > 0) {
                    await this.delay(this.OPERATION_DELAY_MS);
                }

                try {
                    await this.executeOperation(operation);
                    successCount++;
                } catch (error) {
                    console.error('Operation failed:', operation.type, error);

                    operation.retryCount = (operation.retryCount || 0) + 1;
                    operation.lastError = error.message;

                    // Максимум 3 попытки
                    if (operation.retryCount < 3) {
                        failedOperations.push(operation);
                    } else {
                        console.error('Operation permanently failed after 3 retries:', operation);
                        dispatch('OperationFailed', { operation, error: error.message });
                    }
                }
            }

            // Обновляем прогресс после каждого батча
            dispatch('SyncProgress', {
                completed: successCount,
                total: queue.length,
                batchIndex: batchIndex + 1,
                totalBatches: batches.length
            });
        }

        await this.saveQueue(failedOperations);

        this.isSyncing = false;
        dispatch('SyncCompleted', {
            successCount,
            failedCount: failedOperations.length,
            remainingCount: failedOperations.length
        });

        // Если остались неудачные операции, регистрируем Background Sync для повторной попытки
        if (failedOperations.length > 0) {
            await this.registerBackgroundSync();
        }
    }

    /**
     * Выполняет отдельную операцию
     * @returns {Promise<Object|null>} Результат операции или null
     */
    async executeOperation(operation) {
        const { type, data } = operation;

        // Импортируем API динамически, чтобы избежать циклических зависимостей
        const { default: api } = await import('../api/api.js');

        // Резолвим временные ID в реальные перед отправкой на сервер
        const resolvedData = await this.resolveTemporaryIds(data);

        switch (type) {
            case 'createBlock': {
                const response = await api.createBlock(
                    resolvedData.parentId,
                    resolvedData.title,
                    resolvedData.blockData
                );
                if (response.status === 201 && data.tempId) {
                    // Сохраняем маппинг временного ID на реальный
                    const newBlocks = response.data;
                    if (newBlocks && newBlocks.length > 0) {
                        const newBlock = newBlocks.find(b => b.parent_id === resolvedData.parentId);
                        if (newBlock) {
                            await this.saveTempIdMapping(data.tempId, newBlock.id);
                            // Уведомляем о замене ID
                            dispatch('TempIdResolved', {
                                tempId: data.tempId,
                                realId: newBlock.id,
                                blocks: newBlocks
                            });
                        }
                    }
                }
                return response;
            }

            case 'updateBlock': {
                // Пропускаем обновления для удалённых блоков
                if (data.deleted) {
                    console.log('Skipping update for deleted block:', data.id);
                    return null;
                }
                const response = await api.updateBlock(resolvedData.id, resolvedData.blockData);
                if (response.status === 200) {
                    dispatch('BlockSynced', { block: response.data });
                }
                return response;
            }

            case 'deleteBlock': {
                const response = await api.removeTree(resolvedData.id);
                return response;
            }

            case 'moveBlock': {
                const response = await api.moveBlock(resolvedData.blockId, {
                    old_parent_id: resolvedData.oldParentId,
                    new_parent_id: resolvedData.newParentId,
                    childOrder: resolvedData.childOrder
                });
                return response;
            }

            case 'createTree': {
                const response = await api.createTree(resolvedData.title);
                if (response.status === 201 && data.tempId) {
                    const newBlock = response.data;
                    if (newBlock) {
                        await this.saveTempIdMapping(data.tempId, newBlock.id);
                        dispatch('TempIdResolved', {
                            tempId: data.tempId,
                            realId: newBlock.id,
                            block: newBlock
                        });
                    }
                }
                return response;
            }

            default:
                throw new Error(`Unknown operation type: ${type}`);
        }
    }

    /**
     * Резолвит временные ID в данных операции
     * @param {Object} data - Данные операции
     * @returns {Promise<Object>} Данные с реальными ID
     */
    async resolveTemporaryIds(data) {
        const resolved = { ...data };

        // Проверяем все поля которые могут содержать ID
        const idFields = ['id', 'parentId', 'blockId', 'oldParentId', 'newParentId'];

        for (const field of idFields) {
            if (resolved[field] && this.isTempId(resolved[field])) {
                const realId = await this.getRealId(resolved[field]);
                if (realId) {
                    resolved[field] = realId;
                } else {
                    console.warn(`Could not resolve temp ID: ${resolved[field]}`);
                }
            }
        }

        return resolved;
    }

    /**
     * Возвращает количество операций в очереди
     */
    async getPendingCount() {
        const queue = await this.getQueue();
        return queue.length;
    }

    /**
     * Очищает очередь (использовать с осторожностью)
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
     * Проверяет состояние сети
     */
    isNetworkOnline() {
        return this.isOnline;
    }

    /**
     * Проверяет, поддерживается ли Background Sync
     */
    isBackgroundSyncAvailable() {
        return this.backgroundSyncSupported;
    }

    /**
     * Принудительно запускает синхронизацию через Service Worker
     */
    async triggerManualSync() {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'TRIGGER_SYNC'
            });
        } else {
            // Fallback на обычную обработку очереди
            await this.processQueue();
        }
    }
}

// Экспортируем singleton
export const offlineQueue = new OfflineQueueManager();

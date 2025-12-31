import localforage from "localforage";
import { dispatch } from "../utils/utils";
import { v4 as uuidV4 } from 'uuid';

/**
 * Префикс для временных ID созданных офлайн
 */
const TEMP_ID_PREFIX = 'temp_';

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
     * Обрабатывает очередь операций
     */
    async processQueue() {
        if (this.isSyncing || !this.isOnline) return;

        const queue = await this.getQueue();
        if (queue.length === 0) return;

        this.isSyncing = true;
        dispatch('SyncStarted', { pendingCount: queue.length });

        const failedOperations = [];
        let successCount = 0;

        for (const operation of queue) {
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

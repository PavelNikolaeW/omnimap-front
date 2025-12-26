import localforage from "localforage";
import { dispatch } from "../utils/utils";

/**
 * Менеджер очереди операций для offline режима
 * Сохраняет операции в IndexedDB при отсутствии сети
 * и синхронизирует их при восстановлении соединения
 */
class OfflineQueueManager {
    constructor() {
        this.QUEUE_KEY = 'offlineOperationsQueue';
        this.isOnline = navigator.onLine;
        this.isSyncing = false;

        this.init();
    }

    init() {
        // Слушаем события сети
        window.addEventListener('online', this.handleOnline.bind(this));
        window.addEventListener('offline', this.handleOffline.bind(this));

        // Проверяем очередь при старте, если онлайн
        if (this.isOnline) {
            this.processQueue();
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
    }

    /**
     * Выполняет отдельную операцию
     */
    async executeOperation(operation) {
        const { type, data } = operation;

        // Импортируем API динамически, чтобы избежать циклических зависимостей
        const { default: api } = await import('../api/api.js');

        switch (type) {
            case 'createBlock':
                await api.createBlock(data.parentId, data.title, data.blockData);
                break;

            case 'updateBlock':
                await api.updateBlock(data.id, data.blockData);
                break;

            case 'deleteBlock':
                await api.removeTree(data.id);
                break;

            case 'moveBlock':
                await api.moveBlock(data.blockId, {
                    old_parent_id: data.oldParentId,
                    new_parent_id: data.newParentId,
                    childOrder: data.childOrder
                });
                break;

            case 'createTree':
                await api.createTree(data.title);
                break;

            default:
                throw new Error(`Unknown operation type: ${type}`);
        }
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
}

// Экспортируем singleton
export const offlineQueue = new OfflineQueueManager();

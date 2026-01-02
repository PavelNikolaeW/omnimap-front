import localforage from "localforage";
import { dispatch } from "../utils/utils";
import { v4 as uuidV4 } from 'uuid';
import { importBlocks, pollImportStatus } from '../api/importService.js';

/**
 * Менеджер синхронизации блоков для offline режима
 *
 * Принцип работы:
 * - Блоки создаются сразу с реальными UUID (v4)
 * - При офлайне изменения накапливаются локально
 * - При восстановлении сети отправляем все изменённые блоки через import API
 * - Import API: новый UUID → создаёт, существующий → обновляет
 * - Удаление: убираем ID из children/childOrder родителя
 */
class OfflineQueueManager {
    constructor() {
        this.QUEUE_KEY = 'offlineOperationsQueue';
        this.SYNC_TAG = 'omnimap-sync';
        this.isOnline = navigator.onLine;
        this.isSyncing = false;
        this.backgroundSyncSupported = false;
        this.cachedQueueLength = 0; // Для синхронной проверки в beforeunload

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
     * Проверяет состояние сети
     */
    isNetworkOnline() {
        return this.isOnline;
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
            this.processQueue();
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
            // Обновляем кэшированную длину для синхронной проверки в beforeunload
            this.cachedQueueLength = queue.length;
        } catch (error) {
            console.error('Error saving offline queue:', error);
        }
    }

    /**
     * Обрабатывает очередь операций через batch import API
     */
    async processQueue() {
        if (this.isSyncing || !this.isOnline) return;

        const queue = await this.getQueue();
        if (queue.length === 0) return;

        this.isSyncing = true;
        dispatch('SyncStarted', { pendingCount: queue.length });

        console.log(`Processing ${queue.length} operations via batch import`);

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

            // Обновляем локальное состояние с новыми блоками от сервера
            if (result.blocks) {
                dispatch('BatchImportCompleted', {
                    blocks: result.blocks,
                    deletedIds: Array.from(deletedIds)
                });
            }

            // Очищаем очередь
            await this.saveQueue([]);
            this.isSyncing = false;

            dispatch('SyncCompleted', {
                successCount: queue.length,
                failedCount: 0,
                remainingCount: 0
            });

        } catch (error) {
            console.error('Batch import failed:', error);
            this.isSyncing = false;

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
                    const { blockId, parentId } = data;
                    affectedBlockIds.add(blockId);
                    if (parentId) affectedBlockIds.add(parentId);
                    break;
                }

                case 'createTree': {
                    const { blockId } = data;
                    affectedBlockIds.add(blockId);
                    break;
                }

                case 'updateBlock': {
                    const { blockId } = data;
                    affectedBlockIds.add(blockId);
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
                    const { blockId, parentId } = data;
                    deletedIds.add(blockId);
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
            if (deletedIds.has(blockId)) continue;

            // Получаем финальное состояние блока из памяти
            const localBlock = await getBlockById(blockId);
            if (!localBlock) continue;

            // Фильтруем удалённые из children и childOrder
            const finalChildren = (localBlock.children || [])
                .filter(cid => !deletedIds.has(cid));

            // Копируем data и фильтруем childOrder
            const finalData = {...(localBlock.data || {})};
            if (finalData.childOrder) {
                finalData.childOrder = finalData.childOrder.filter(cid => !deletedIds.has(cid));
            }

            blocks.push({
                id: localBlock.id,
                parent_id: localBlock.parent_id || null,
                title: localBlock.title || '',
                children: finalChildren,
                data: finalData
            });
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

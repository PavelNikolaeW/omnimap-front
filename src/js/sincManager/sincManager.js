import {UpdateServiceWebSocket} from "./webSocket";
import localforage from "localforage";
import config from "../config";

/**
 * Экранирует специальные символы RegExp в строке
 * @param {string} string - Исходная строка
 * @returns {string} Экранированная строка
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class SincManager {
    constructor() {
        const wsUrl = config.SINC_SERVICE_URL;

        this.webSocket = new UpdateServiceWebSocket(wsUrl);
        this.webSocket.eventListeners.open.push(this.online.bind(this));
        this.webSocket.connect();

        // Время последней полной подгрузки дерева
        this.lastFullTreeLoad = 0;
        // Интервал полной подгрузки (5 минут)
        this.FULL_TREE_LOAD_INTERVAL = 5 * 60 * 1000;

        // Подписываемся на visibilitychange для проверки при возвращении на вкладку
        this._boundVisibilityHandler = this.handleVisibilityChange.bind(this);
        document.addEventListener('visibilitychange', this._boundVisibilityHandler);
    }

    /**
     * Обработчик visibilitychange - проверяет нужна ли подгрузка при возвращении на вкладку
     * Вызывается когда пользователь переключается на вкладку после долгого отсутствия
     */
    async handleVisibilityChange() {
        if (document.visibilityState !== 'visible') {
            return;
        }

        const username = await localforage.getItem('currentUser');
        if (!username) return;

        const now = Date.now();
        const timeSinceLastFullLoad = now - this.lastFullTreeLoad;

        // Если прошло больше интервала и WebSocket подключен
        if (timeSinceLastFullLoad > this.FULL_TREE_LOAD_INTERVAL && this.webSocket?.isConnected) {
            console.log('📱 SincManager: tab visible after', Math.round(timeSinceLastFullLoad / 1000), 'seconds, loading full tree');
            await this.loadFullTree();
            this.lastFullTreeLoad = now;
        }
    }

    /**
     * Обработчик восстановления соединения
     * Стратегия:
     * 1. Если прошло больше 5 минут с последней полной подгрузки → полная подгрузка
     * 2. Иначе → только обновления существующих блоков (get_updates)
     */
    async online() {
        try {
            const username = await localforage.getItem('currentUser');
            if (!username) return;

            const now = Date.now();
            const timeSinceLastFullLoad = now - this.lastFullTreeLoad;
            const shouldDoFullLoad = timeSinceLastFullLoad > this.FULL_TREE_LOAD_INTERVAL;

            if (shouldDoFullLoad) {
                console.log('🌳 SincManager: full tree load (last load', Math.round(timeSinceLastFullLoad / 1000), 'seconds ago)');
                await this.loadFullTree();
                this.lastFullTreeLoad = now;
            } else {
                console.log('🔄 SincManager: incremental updates (last full load', Math.round(timeSinceLastFullLoad / 1000), 'seconds ago)');
                await this.requestIncrementalUpdates();
            }
        } catch (err) {
            console.error('SincManager: sync error:', err.stack || err.message || err);
        }
    }

    /**
     * Полная подгрузка дерева с сервера
     * Используется при долгом офлайне чтобы получить новые деревья и блоки
     * @returns {Promise<void>} - Резолвится после завершения загрузки и сохранения блоков
     */
    async loadFullTree() {
        try {
            const [{ dispatch }, api] = await Promise.all([
                import('../utils/utils'),
                import('../api/api')
            ]);

            // Напрямую вызываем api.getTreeBlocks() чтобы дождаться завершения
            const treeBlocks = await api.default.getTreeBlocks();
            console.log(`📥 SincManager: loaded ${treeBlocks.blocks.size} blocks from server`);

            // Сохраняем блоки через localStateManager
            const { localStateManager } = await import('../stateLocal/localStateManager');

            // Обновляем treeIds
            if (localStateManager.currentUser) {
                await localforage.setItem(`treeIds${localStateManager.currentUser}`, treeBlocks.treeIds);
            }

            // Сохраняем все блоки
            for (const block of treeBlocks.blocks.values()) {
                await localStateManager.saveBlock(block);
            }

            // Обновляем UI
            dispatch('UpdateTreeNavigation');
            dispatch('ShowBlocks');

            console.log('✅ SincManager: full tree load completed');
        } catch (err) {
            console.error('SincManager: failed to load full tree:', err);
            // Fallback на инкрементальные обновления
            await this.requestIncrementalUpdates();
        }
    }

    /**
     * Запрашивает только обновления для существующих локальных блоков
     * Используется для быстрой синхронизации при частых переподключениях
     */
    async requestIncrementalUpdates() {
        try {
            const username = await localforage.getItem('currentUser');
            if (!username) return;

            // Убедимся, что username - строка (может быть объектом при некорректных данных)
            const usernameStr = typeof username === 'string' ? username : String(username);

            // Экранируем username для защиты от RegExp injection
            const escapedUsername = escapeRegExp(usernameStr);
            const pattern = new RegExp(`^Block_.*_${escapedUsername}$`);

            const keys = await localforage.keys();
            const matchingKeys = keys.filter(key => pattern.test(key));

            const blocks = await Promise.all(
                matchingKeys.map(key => localforage.getItem(key))
            );

            const toSend = blocks
                .filter(block => block?.id && block?.updated_at)
                .map(block => {
                    const timestamp = new Date(block.updated_at).getTime();
                    // Проверяем валидность даты
                    if (isNaN(timestamp)) {
                        console.warn('SincManager: invalid updated_at for block:', block.id);
                        return null;
                    }
                    return {
                        id: block.id,
                        updated_at: Math.floor(timestamp / 1000),
                    };
                })
                .filter(Boolean);

            if (toSend.length > 0) {
                this.webSocket.getUpdates(toSend);
                console.log(`🔄 SincManager: requested updates for ${toSend.length} blocks`);
            } else {
                console.log('🔄 SincManager: no local blocks, triggering full tree load');
                // Если нет локальных блоков - загружаем полное дерево
                await this.loadFullTree();
            }
        } catch (err) {
            console.error('SincManager: failed to request incremental updates:', err);
        }
    }

    /**
     * Очистка ресурсов
     */
    destroy() {
        if (this.webSocket) {
            this.webSocket.destroy();
            this.webSocket = null;
        }

        // Удаляем обработчик visibilitychange
        if (this._boundVisibilityHandler) {
            document.removeEventListener('visibilitychange', this._boundVisibilityHandler);
            this._boundVisibilityHandler = null;
        }
    }
}
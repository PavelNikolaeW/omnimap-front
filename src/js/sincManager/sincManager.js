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
    }

    /**
     * Обработчик восстановления соединения
     * Стратегия:
     * 1. Всегда делаем инкрементальное обновление (get_updates)
     * 2. Sync вернёт обновлённые блоки (updates) и новые блоки (new_blocks)
     * 3. Если нет локальных блоков - вызовется loadFullTree()
     */
    async online() {
        try {
            const username = await localforage.getItem('currentUser');
            if (!username) return;

            console.log('🔄 SincManager: incremental updates');
            await this.requestIncrementalUpdates();
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
    }
}
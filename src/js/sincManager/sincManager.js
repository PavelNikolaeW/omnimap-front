import {UpdateServiceWebSocket} from "./webSocket";
import localforage from "localforage";
import config from "../config";

/**
 * Запас в секундах для запроса инкрементальных обновлений.
 * Нужен чтобы не пропускать изменения с одинаковым updated_at (точность БД до секунды).
 */
const INCREMENTAL_TS_SAFETY_MARGIN_SEC = 1;

/**
 * Экранирует специальные символы RegExp в строке
 * @param {string} string - Исходная строка
 * @returns {string} Экранированная строка
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Преобразует updated_at в unix timestamp (секунды).
 * Поддерживает ISO строки, миллисекунды и секунды (числом/строкой).
 * @param {string|number|Date} updatedAt
 * @returns {number|null}
 */
function parseUpdatedAtToUnixSeconds(updatedAt) {
    if (updatedAt === null || updatedAt === undefined) return null;

    // Числовой формат: секунды или миллисекунды
    if (typeof updatedAt === 'number' && Number.isFinite(updatedAt)) {
        const millis = updatedAt > 1e12 ? updatedAt : updatedAt * 1000;
        return Math.floor(millis / 1000);
    }

    // Строковый числовой формат: "1730000000" или "1730000000000"
    if (typeof updatedAt === 'string') {
        const trimmed = updatedAt.trim();
        if (/^\d+(\.\d+)?$/.test(trimmed)) {
            const num = Number(trimmed);
            if (Number.isFinite(num)) {
                const millis = num > 1e12 ? num : num * 1000;
                return Math.floor(millis / 1000);
            }
        }
    }

    // ISO дата и прочие форматы Date.parse
    const timestamp = new Date(updatedAt).getTime();
    if (isNaN(timestamp)) return null;

    return Math.floor(timestamp / 1000);
}

export class SincManager {
    constructor() {
        const wsUrl = config.SINC_SERVICE_URL;

        // Дедупликация параллельных запросов incremental sync
        this._incrementalSyncPromise = null;

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
     * @param {boolean} allowFallbackToIncremental - Разрешить fallback на инкрементальные обновления при ошибке
     * @returns {Promise<void>} - Резолвится после завершения загрузки и сохранения блоков
     */
    async loadFullTree(allowFallbackToIncremental = true) {
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
            // Fallback на инкрементальные обновления только если разрешено (предотвращает рекурсию)
            if (allowFallbackToIncremental) {
                await this.requestIncrementalUpdates(false);
            }
        }
    }

    /**
     * Запрашивает только обновления для существующих локальных блоков
     * Используется для быстрой синхронизации при частых переподключениях
     * @param {boolean} allowFallbackToFull - Разрешить fallback на полную загрузку дерева при отсутствии блоков
     */
    async requestIncrementalUpdates(allowFallbackToFull = true) {
        if (this._incrementalSyncPromise) {
            console.log('⏭️ SincManager: incremental sync already in progress, joining existing request');
            return this._incrementalSyncPromise;
        }

        this._incrementalSyncPromise = this._requestIncrementalUpdatesInternal(allowFallbackToFull);

        try {
            return await this._incrementalSyncPromise;
        } finally {
            this._incrementalSyncPromise = null;
        }
    }

    async _requestIncrementalUpdatesInternal(allowFallbackToFull = true) {
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
                    const unixSeconds = parseUpdatedAtToUnixSeconds(block.updated_at);
                    // Проверяем валидность даты
                    if (unixSeconds === null) {
                        console.warn('SincManager: invalid updated_at for block:', block.id);
                        return null;
                    }
                    return {
                        id: block.id,
                        // Safety margin чтобы не пропускать апдейты в ту же секунду
                        updated_at: Math.max(0, unixSeconds - INCREMENTAL_TS_SAFETY_MARGIN_SEC),
                    };
                })
                .filter(Boolean);

            if (toSend.length > 0) {
                this.webSocket.getUpdates(toSend);
                console.log(`🔄 SincManager: requested updates for ${toSend.length} blocks`);
            } else if (allowFallbackToFull) {
                console.log('🔄 SincManager: no local blocks, triggering full tree load');
                // Если нет локальных блоков - загружаем полное дерево (предотвращаем рекурсию)
                await this.loadFullTree(false);
            } else {
                console.log('⏭️ SincManager: no local blocks and fallback disabled, skipping');
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

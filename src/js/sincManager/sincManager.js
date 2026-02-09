import {UpdateServiceWebSocket} from "./webSocket";
import localforage from "localforage";
import config from "../config";
import {parseUpdatedAtToUnixSeconds} from "../utils/functions";

const CURSOR_SYNC_MAX_PAGES = 20;
const SAVE_BATCH_SIZE = 50;

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

        // Дедупликация параллельных запросов incremental sync
        this._incrementalSyncPromise = null;
        this._fullResyncPromise = null;
        this._handleSyncFullResyncRequired = this._handleSyncFullResyncRequired.bind(this);

        this.webSocket = new UpdateServiceWebSocket(wsUrl);
        this.webSocket.eventListeners.open.push(this.online.bind(this));
        this.webSocket.connect();
        window.addEventListener('SyncFullResyncRequired', this._handleSyncFullResyncRequired);
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

            console.log(`🔄 SincManager: incremental updates (${config.SYNC_V2_ENABLED ? 'v2' : 'v1'})`);
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
            const lsm = localStateManager.getInstance();

            // Обновляем treeIds
            if (lsm.currentUser) {
                await localforage.setItem(`treeIds${lsm.currentUser}`, treeBlocks.treeIds);
            }

            // Сохраняем все блоки (батчами для производительности)
            const allBlocks = [...treeBlocks.blocks.values()];
            for (let i = 0; i < allBlocks.length; i += SAVE_BATCH_SIZE) {
                const batch = allBlocks.slice(i, i + SAVE_BATCH_SIZE);
                await Promise.all(batch.map(block => lsm.saveBlock(block)));
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
        const username = await localforage.getItem('currentUser');
        if (!username) return;

        const usernameStr = typeof username === 'string' ? username : String(username);

        // v2 cursor sync (with transparent fallback to v1)
        if (config.SYNC_V2_ENABLED) {
            try {
                await this._requestIncrementalUpdatesV2(usernameStr, allowFallbackToFull);
                return;
            } catch (err) {
                console.warn('SincManager: v2 sync failed, falling back to v1:', err?.message || err);
            }
        }

        await this._requestIncrementalUpdatesV1(usernameStr, allowFallbackToFull);
    }

    _getSyncCursorKey(username) {
        return `syncCursor:${username}`;
    }

    _getSyncSubVersionKey(username) {
        return `syncSubVer:${username}`;
    }

    async _loadCursorState(username) {
        const [cursorRaw, subVerRaw] = await Promise.all([
            localforage.getItem(this._getSyncCursorKey(username)),
            localforage.getItem(this._getSyncSubVersionKey(username)),
        ]);

        const cursor = Number.isFinite(Number(cursorRaw)) ? Math.max(0, Number(cursorRaw)) : 0;
        const subscriptionVersion = Number.isFinite(Number(subVerRaw)) ? Math.max(0, Number(subVerRaw)) : 0;
        return { cursor, subscriptionVersion };
    }

    async _saveCursorState(username, cursor, subscriptionVersion) {
        await Promise.all([
            localforage.setItem(this._getSyncCursorKey(username), Math.max(0, Number(cursor) || 0)),
            localforage.setItem(this._getSyncSubVersionKey(username), Math.max(0, Number(subscriptionVersion) || 0)),
        ]);
    }

    async _requestIncrementalUpdatesV2(usernameStr, allowFallbackToFull = true) {
        // Для пустого локального состояния загружаем полное дерево.
        // Это дешевле и надёжнее, чем строить состояние с нуля только по changelog.
        const treeIds = await localforage.getItem(`treeIds${usernameStr}`);
        if ((!Array.isArray(treeIds) || treeIds.length === 0) && allowFallbackToFull) {
            console.log('🔄 SincManager(v2): no local trees, triggering full tree load');
            await this.loadFullTree(false);
            return;
        }

        const { dispatch } = await import('../utils/utils');

        let { cursor, subscriptionVersion } = await this._loadCursorState(usernameStr);
        const limit = Math.max(1, Number(config.SYNC_V2_LIMIT) || 2000);

        let page = 0;
        while (page < CURSOR_SYNC_MAX_PAGES) {
            const response = await this.webSocket.getUpdatesV2({
                cursor,
                subscription_version: subscriptionVersion,
                limit,
            });

            if (response?.type !== 'block_updates_v2') {
                throw new Error('Invalid get_updates_v2 response');
            }

            const nextCursor = Math.max(0, Number(response.next_cursor) || cursor);
            const nextSubscriptionVersion = Math.max(0, Number(response.subscription_version) || subscriptionVersion);

            if (response.full_resync_required) {
                console.warn(`SincManager(v2): full resync required (${response.reason || 'unknown'})`);
                if (allowFallbackToFull) {
                    await this.loadFullTree(false);
                    // После loadFullTree subscription_version на сервере мог измениться
                    // (subscribe bumps version). Делаем повторный запрос чтобы получить
                    // актуальные cursor и subscription_version, иначе при следующем
                    // reconnect снова получим full_resync_required (бесконечный цикл).
                    try {
                        const freshResponse = await this.webSocket.getUpdatesV2({
                            cursor: nextCursor,
                            subscription_version: nextSubscriptionVersion,
                            limit,
                        });
                        if (freshResponse?.type === 'block_updates_v2') {
                            const freshCursor = Math.max(0, Number(freshResponse.next_cursor) || nextCursor);
                            const freshSubVer = Math.max(0, Number(freshResponse.subscription_version) || nextSubscriptionVersion);
                            if (freshResponse.full_resync_required) {
                                // Сервер снова требует resync — сохраняем cursor как есть,
                                // данные уже актуальны после loadFullTree
                                console.warn('SincManager(v2): fresh response still requires resync, saving cursor as-is');
                            } else {
                                // Применяем оставшиеся обновления если есть
                                const freshUpdates = Array.isArray(freshResponse.updates) ? freshResponse.updates : [];
                                if (freshUpdates.length > 0) {
                                    dispatch('WebSocUpdateBlock', { blocks: freshUpdates, isReconnect: true });
                                }
                            }
                            await this._saveCursorState(usernameStr, freshCursor, freshSubVer);
                        } else {
                            await this._saveCursorState(usernameStr, nextCursor, nextSubscriptionVersion);
                        }
                    } catch (e) {
                        console.warn('SincManager(v2): failed to refresh cursor after full resync:', e?.message || e);
                        await this._saveCursorState(usernameStr, nextCursor, nextSubscriptionVersion);
                    }
                }
                return;
            }

            const updates = Array.isArray(response.updates) ? response.updates : [];
            if (updates.length > 0) {
                dispatch('WebSocUpdateBlock', { blocks: updates, isReconnect: true });
            }

            const requestSizeBytes = JSON.stringify({
                action: 'get_updates_v2',
                cursor,
                subscription_version: subscriptionVersion,
                limit,
            }).length;
            const responseSizeBytes = JSON.stringify(response).length;
            console.log(
                `📊 SincManager(v2): page=${page + 1}, updates=${updates.length}, ` +
                `requestBytes=${requestSizeBytes}, responseBytes=${responseSizeBytes}, hasMore=${Boolean(response.has_more)}`
            );

            cursor = nextCursor;
            subscriptionVersion = nextSubscriptionVersion;
            await this._saveCursorState(usernameStr, cursor, subscriptionVersion);

            if (!response.has_more) {
                break;
            }
            page += 1;
        }

        if (page >= CURSOR_SYNC_MAX_PAGES) {
            console.warn(`SincManager(v2): pagination limit reached (${CURSOR_SYNC_MAX_PAGES} pages)`);
        }
    }

    async _requestIncrementalUpdatesV1(usernameStr, allowFallbackToFull = true) {
        try {
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
                        // Отправляем точный timestamp локального блока.
                        // Это исключает ложные обновления при reconnect.
                        updated_at: Math.max(0, unixSeconds),
                    };
                })
                .filter(Boolean);

            if (toSend.length > 0) {
                this.webSocket.getUpdates(toSend);
                const payloadBytes = JSON.stringify({ action: 'get_updates', blocks: toSend }).length;
                // Debug: показываем статистику по timestamps
                const timestamps = toSend.map(b => b.updated_at).sort((a, b) => a - b);
                const oldest = new Date(timestamps[0] * 1000).toISOString();
                const newest = new Date(timestamps[timestamps.length - 1] * 1000).toISOString();
                console.log(
                    `🔄 SincManager(v1): requested updates for ${toSend.length} blocks ` +
                    `(oldest: ${oldest}, newest: ${newest}, payloadBytes=${payloadBytes})`
                );
            } else if (allowFallbackToFull) {
                console.log('🔄 SincManager(v1): no local blocks, triggering full tree load');
                // Если нет локальных блоков - загружаем полное дерево (предотвращаем рекурсию)
                await this.loadFullTree(false);
            } else {
                console.log('⏭️ SincManager(v1): no local blocks and fallback disabled, skipping');
            }
        } catch (err) {
            console.error('SincManager: failed to request incremental updates (v1):', err);
        }
    }

    async _handleSyncFullResyncRequired(event) {
        const reason = event?.detail?.reason || 'unknown';
        if (this._fullResyncPromise) {
            console.log(`⏭️ SincManager: full resync already in progress (${reason})`);
            return this._fullResyncPromise;
        }

        console.warn(`🔄 SincManager: full resync requested by sync service (${reason})`);
        this._fullResyncPromise = this.loadFullTree(false)
            .catch((err) => {
                console.error('SincManager: full resync failed:', err);
            })
            .finally(() => {
                this._fullResyncPromise = null;
            });

        return this._fullResyncPromise;
    }

    /**
     * Очистка ресурсов
     */
    destroy() {
        window.removeEventListener('SyncFullResyncRequired', this._handleSyncFullResyncRequired);
        if (this.webSocket) {
            this.webSocket.destroy();
            this.webSocket = null;
        }
    }
}

import {UpdateServiceWebSocket} from "./webSocket";
import localforage from "localforage";

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
        const wsUrl = SINC_SERVICE_URL || 'wss://localhost:7999/ws';

        this.webSocket = new UpdateServiceWebSocket(wsUrl);
        this.webSocket.eventListeners.open.push(this.online.bind(this));
        this.webSocket.connect();
    }

    /**
     * Обработчик восстановления соединения
     * Запрашивает обновления для всех локальных блоков
     */
    async online() {
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
            }
        } catch (err) {
            console.error('SincManager: sync error:', err.stack || err.message || err);
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
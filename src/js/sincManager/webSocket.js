import Cookies from "js-cookie";
import {dispatch} from "../utils/utils";

export class UpdateServiceWebSocket {
    /**
     * Создает экземпляр класса UpdateServiceWebSocket.
     * @param {string} url - URL WebSocket-сервиса.
     * @param {string} jwtToken - JWT-токен авторизации.
     */
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.isConnected = false;
        this.eventListeners = {
            open: [],
            message: [],
            error: [],
            close: [],
        };
        this.reconnectInterval = 2000; // Интервал попыток переподключения в мс
        this.shouldReconnect = true;
        window.addEventListener('Login', () => {
            this.disconnect()
            this.connect()
        })
    }

    /**
     * Устанавливает подключение к WebSocket-сервису.
     */
    connect() {
        const jwtToken = Cookies.get('access');
        this.ws = new WebSocket(`${this.url}?token=${encodeURIComponent(jwtToken)}`);
        this.ws.onopen = () => {
            console.log('WebSocket подключен');
            this.isConnected = true;
            this.eventListeners.open.forEach(callback => callback());
        };

        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'block_updates') {
                dispatch('WebSocUpdateBlock', message.updates)
            } else if (message.type === 'block_update') {
                dispatch('WebSocUpdateBlock', [message.data])
            } else if (message.type === 'block_update_access') {
                dispatch('WebSocUpdateBlockAccess', message.data)
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket ошибка:', error);
            this.eventListeners.error.forEach(callback => callback(error));
        };

        this.ws.onclose = (event) => {
            console.warn(`WebSocket отключен: код=${event.code}, причина=${event.reason}`);
            this.isConnected = false;
            this.eventListeners.close.forEach(callback => callback(event));
            if (this.shouldReconnect) {
                setTimeout(() => {
                    console.log('Пытаемся переподключиться...');
                    this.connect();
                }, this.reconnectInterval);
            }
        };
    }

    /**
     * Отправляет UUID данных, на которые клиент подписан.
     * UUID передаются в виде массива.
     * @param {Array<{string:string}>} blocks - Массив UUID и даты последнего обновления.
     */
    getUpdates(blocks) {
        if (this.isConnected) {
            this.sendMessage({
                action: 'get_updates',
                blocks
            });
        } else {
            console.error('WebSocket error')
        }
    }

    /**
     * Отправляет сообщение через WebSocket.
     * @param {Object} message - Объект сообщения.
     */
    sendMessage(message) {
        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.error('WebSocket не подключен. Невозможно отправить сообщение:', message);
        }
    }

    /**
     * Добавляет обработчик события.
     * @param {string} event - Тип события ('open', 'message', 'error', 'close').
     * @param {Function} callback - Функция обратного вызова.
     */
    addEventListener(event, callback) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].push(callback);
        } else {
            console.warn(`Неизвестный тип события: ${event}`);
        }
    }

    /**
     * Закрывает WebSocket-подключение и прекращает попытки переподключения.
     */
    disconnect() {
        this.shouldReconnect = false;
        if (this.ws) {
            this.ws.close();
        }
    }
}

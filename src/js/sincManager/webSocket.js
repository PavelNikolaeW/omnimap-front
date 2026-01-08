import Cookies from "js-cookie";
import {dispatch} from "../utils/utils";
import chatSync from "./chatSync";
import api from "../api/api";

/**
 * Максимальное количество попыток переподключения
 */
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Базовый интервал переподключения в мс
 */
const BASE_RECONNECT_INTERVAL = 2000;

/**
 * Максимальный интервал переподключения в мс (2 минуты)
 */
const MAX_RECONNECT_INTERVAL = 120000;

/**
 * Интервал heartbeat в мс (30 секунд)
 */
const HEARTBEAT_INTERVAL = 30000;

/**
 * Debounce интервал для накопления block updates в мс
 */
const BLOCK_UPDATE_DEBOUNCE_MS = 50;

/**
 * Таймаут ожидания pong после ping при проверке соединения (мс)
 */
const CONNECTION_CHECK_TIMEOUT = 5000;

export class UpdateServiceWebSocket {
    /**
     * Создает экземпляр класса UpdateServiceWebSocket.
     * @param {string} url - URL WebSocket-сервиса.
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
        this.reconnectAttempts = 0;
        this.shouldReconnect = true;
        this.heartbeatTimer = null;
        this.missedPongs = 0;

        // Буфер для накопления block updates (debounce)
        this._pendingBlockUpdates = [];
        this._blockUpdateTimer = null;

        this._handleLogin = this._handleLogin.bind(this);
        this._handleLogout = this._handleLogout.bind(this);
        this._handleVisibilityChange = this._handleVisibilityChange.bind(this);
        this._handleOnline = this._handleOnline.bind(this);

        // Таймер для проверки соединения после visibility change
        this._connectionCheckTimer = null;
        // Флаг ожидания pong при проверке соединения
        this._awaitingConnectionCheck = false;

        window.addEventListener('Login', this._handleLogin);
        window.addEventListener('Logout', this._handleLogout);
        document.addEventListener('visibilitychange', this._handleVisibilityChange);
        window.addEventListener('online', this._handleOnline);
    }

    /**
     * Накапливает block updates и отправляет их одним батчем после debounce
     * @param {Array} blocks - массив блоков для обновления
     */
    _queueBlockUpdates(blocks) {
        if (!Array.isArray(blocks)) return;

        // Добавляем блоки в буфер (дедупликация по id - последний выигрывает)
        for (const block of blocks) {
            if (!block?.id) continue;
            // Удаляем предыдущую версию этого блока если есть
            const existingIdx = this._pendingBlockUpdates.findIndex(b => b.id === block.id);
            if (existingIdx !== -1) {
                this._pendingBlockUpdates.splice(existingIdx, 1);
            }
            this._pendingBlockUpdates.push(block);
        }

        // Сбрасываем таймер и запускаем новый
        if (this._blockUpdateTimer) {
            clearTimeout(this._blockUpdateTimer);
        }

        this._blockUpdateTimer = setTimeout(() => {
            if (this._pendingBlockUpdates.length > 0) {
                dispatch('WebSocUpdateBlock', this._pendingBlockUpdates);
                this._pendingBlockUpdates = [];
            }
            this._blockUpdateTimer = null;
        }, BLOCK_UPDATE_DEBOUNCE_MS);
    }

    /**
     * Обработчик события Login - переподключение с новым токеном
     */
    _handleLogin() {
        this.shouldReconnect = true;
        this.reconnectAttempts = 0;
        this._stopHeartbeat();
        if (this.ws) {
            this.ws.close();
        }
        this.connect();
    }

    /**
     * Обработчик события Logout - отключение
     */
    _handleLogout() {
        this.disconnect();
    }

    /**
     * Обработчик события visibilitychange - проверка соединения при возврате к вкладке
     * После sleep режима WebSocket может быть "мёртвым", но браузер этого не знает
     */
    _handleVisibilityChange() {
        if (document.visibilityState !== 'visible') {
            return;
        }

        // Если нет активного соединения, пробуем переподключиться
        if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
            console.log('WebSocket: tab visible, connection closed, reconnecting...');
            this.shouldReconnect = true;
            this.reconnectAttempts = 0;
            this.connect();
            return;
        }

        // Если соединение "открыто", проверяем его реальное состояние через ping
        if (this.ws.readyState === WebSocket.OPEN && this.isConnected) {
            this._checkConnectionHealth();
        }
    }

    /**
     * Обработчик события online - переподключение при восстановлении сети
     */
    _handleOnline() {
        console.log('WebSocket: network online, checking connection...');

        // Если соединение уже закрыто, просто переподключаемся
        if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
            this.shouldReconnect = true;
            this.reconnectAttempts = 0;
            this.connect();
            return;
        }

        // Если соединение "открыто", проверяем его здоровье
        if (this.ws.readyState === WebSocket.OPEN && this.isConnected) {
            this._checkConnectionHealth();
        }
    }

    /**
     * Проверяет здоровье соединения через ping/pong
     * Если pong не придёт в течение таймаута - переподключается
     */
    _checkConnectionHealth() {
        // Избегаем дублирующих проверок
        if (this._awaitingConnectionCheck) {
            return;
        }

        this._awaitingConnectionCheck = true;
        // Сбрасываем счётчик перед проверкой, чтобы не конфликтовать с heartbeat
        this.missedPongs = 0;

        // Отправляем ping с обработкой ошибок
        try {
            this.sendMessage({ action: 'ping' });
        } catch (error) {
            console.error('WebSocket: failed to send ping:', error);
            this._awaitingConnectionCheck = false;
            // Если не удалось отправить ping, соединение точно мёртвое
            this._stopHeartbeat();
            this.ws?.close();
            return;
        }

        // Устанавливаем таймаут на ожидание pong
        this._connectionCheckTimer = setTimeout(() => {
            // Если pong пришёл, флаг уже сброшен — выходим
            if (!this._awaitingConnectionCheck) {
                return;
            }

            // Проверяем что соединение всё ещё активно (не было disconnect)
            if (!this.isConnected || !this.ws) {
                this._awaitingConnectionCheck = false;
                return;
            }

            // Pong не пришёл в течение таймаута — соединение мёртвое
            this._awaitingConnectionCheck = false;
            console.warn('WebSocket: connection check timeout, reconnecting...');
            this._stopHeartbeat();
            this.ws?.close();
            // close event вызовет переподключение
        }, CONNECTION_CHECK_TIMEOUT);
    }

    /**
     * Вычисляет интервал переподключения с экспоненциальным backoff
     * @returns {number} Интервал в миллисекундах
     */
    _getReconnectInterval() {
        const interval = BASE_RECONNECT_INTERVAL * Math.pow(2, this.reconnectAttempts);
        return Math.min(interval, MAX_RECONNECT_INTERVAL);
    }

    /**
     * Пробует обновить токен и переподключиться
     * Если refresh не удался - вызывает logout
     * @param {number} interval - интервал перед переподключением
     */
    async _refreshTokenAndReconnect(interval) {
        try {
            const refreshed = await api.refreshToken();
            if (refreshed) {
                console.log(`WebSocket: token refreshed, reconnecting in ${interval}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                setTimeout(() => {
                    this.connect();
                }, interval);
            } else {
                // Refresh не удался - токены недействительны
                console.error('WebSocket: token refresh failed, logging out');
                this.shouldReconnect = false;
                api.logout();
            }
        } catch (error) {
            console.error('WebSocket: token refresh error:', error);
            this.shouldReconnect = false;
            api.logout();
        }
    }

    /**
     * Запускает heartbeat для проверки соединения
     */
    _startHeartbeat() {
        this._stopHeartbeat();
        this.missedPongs = 0;

        this.heartbeatTimer = setInterval(() => {
            if (!this.isConnected || this.ws?.readyState !== WebSocket.OPEN) {
                return;
            }

            // Если пропущено 2 pong подряд, считаем соединение разорванным
            if (this.missedPongs >= 2) {
                console.warn('WebSocket: heartbeat timeout, reconnecting...');
                this._stopHeartbeat();
                this.ws?.close();
                return;
            }

            this.missedPongs++;
            this.sendMessage({ action: 'ping' });
        }, HEARTBEAT_INTERVAL);
    }

    /**
     * Останавливает heartbeat
     */
    _stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        this.missedPongs = 0;
    }

    /**
     * Безопасно парсит JSON, возвращает null при ошибке
     * @param {string} data - JSON строка
     * @returns {Object|null} Распарсенный объект или null
     */
    _safeJsonParse(data) {
        try {
            return JSON.parse(data);
        } catch (error) {
            console.error('WebSocket: invalid JSON received:', error.message);
            return null;
        }
    }

    /**
     * Устанавливает подключение к WebSocket-сервису.
     */
    connect() {
        const jwtToken = Cookies.get('access');
        if (!jwtToken) {
            console.warn('WebSocket: no access token, skipping connection');
            return;
        }

        // Токен передаётся в query string (стандарт для WebSocket)
        // TODO: рассмотреть передачу через первое сообщение после подключения
        this.ws = new WebSocket(`${this.url}?token=${encodeURIComponent(jwtToken)}`);

        this.ws.onopen = () => {
            console.log('WebSocket подключен');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this._startHeartbeat();
            // Инициализация ChatSync и подписка на чат-события
            chatSync.init(this);
            chatSync.subscribe();
            // Оповещаем о подключении для statusIndicators и других компонентов
            dispatch('WebSocketConnected');
            this.eventListeners.open.forEach(callback => callback());
        };

        this.ws.onmessage = (event) => {
            const message = this._safeJsonParse(event.data);
            if (!message) return;

            // Обработка pong от сервера
            if (message.type === 'pong') {
                this.missedPongs = 0;
                // Сбрасываем флаг и таймер проверки соединения
                this._awaitingConnectionCheck = false;
                if (this._connectionCheckTimer) {
                    clearTimeout(this._connectionCheckTimer);
                    this._connectionCheckTimer = null;
                }
                return;
            }

            // Попытка обработки chat событий
            if (chatSync.handleMessage(message)) {
                return;
            }

            if (message.type === 'block_updates') {
                // Ответ на get_updates запрос: { type: 'block_updates', updates: [...] }
                // Этот тип приходит при начальной синхронизации - отправляем сразу без debounce
                if (Array.isArray(message.updates)) {
                    dispatch('WebSocUpdateBlock', message.updates);
                }
            } else if (message.type === 'block_updates_batch') {
                // Батч обновлений от сервера: { type: 'block_updates_batch', updates: [{type: 'block_update', data: ...}, ...] }
                if (Array.isArray(message.updates)) {
                    const blocks = message.updates
                        .filter(u => u.data && typeof u.data === 'object')
                        .map(u => u.data);
                    if (blocks.length > 0) {
                        this._queueBlockUpdates(blocks);
                    }
                }
            } else if (message.type === 'block_update') {
                // Одиночное обновление: { type: 'block_update', data: {...} }
                // Используем debounce для накопления нескольких одиночных обновлений
                if (message.data && typeof message.data === 'object') {
                    this._queueBlockUpdates([message.data]);
                }
            } else if (message.type === 'block_update_access') {
                dispatch('WebSocUpdateBlockAccess', message);
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket ошибка:', error);
            this.eventListeners.error.forEach(callback => callback(error));
        };

        this.ws.onclose = (event) => {
            console.warn(`WebSocket отключен: код=${event.code}, причина=${event.reason}`);
            this.isConnected = false;
            this._stopHeartbeat();
            this.eventListeners.close.forEach(callback => callback(event));

            if (this.shouldReconnect) {
                if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                    console.error('WebSocket: max reconnect attempts reached');
                    dispatch('WebSocketDisconnected', { reason: 'max_attempts' });
                    return;
                }

                const interval = this._getReconnectInterval();
                this.reconnectAttempts++;

                // Код 1008 (Policy Violation) означает ошибку авторизации
                // Сначала пробуем обновить токен, потом переподключаемся
                if (event.code === 1008) {
                    console.log('WebSocket: auth error, trying to refresh token...');
                    this._refreshTokenAndReconnect(interval);
                } else {
                    console.log(`WebSocket: reconnecting in ${interval}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                    setTimeout(() => {
                        this.connect();
                    }, interval);
                }
            }
        };
    }

    /**
     * Отправляет UUID блоков и их даты обновления
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
        this._stopHeartbeat();
        // Очищаем таймер проверки соединения
        if (this._connectionCheckTimer) {
            clearTimeout(this._connectionCheckTimer);
            this._connectionCheckTimer = null;
        }
        this._awaitingConnectionCheck = false;
        // Очищаем таймер debounce и буфер обновлений
        if (this._blockUpdateTimer) {
            clearTimeout(this._blockUpdateTimer);
            this._blockUpdateTimer = null;
        }
        this._pendingBlockUpdates = [];
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.reconnectAttempts = 0;
    }

    /**
     * Сбрасывает счётчик попыток переподключения
     * Полезно при ручном восстановлении соединения
     */
    resetReconnectAttempts() {
        this.reconnectAttempts = 0;
    }

    /**
     * Очистка ресурсов при уничтожении экземпляра
     */
    destroy() {
        this.disconnect();
        window.removeEventListener('Login', this._handleLogin);
        window.removeEventListener('Logout', this._handleLogout);
        document.removeEventListener('visibilitychange', this._handleVisibilityChange);
        window.removeEventListener('online', this._handleOnline);
        this.eventListeners = { open: [], message: [], error: [], close: [] };
    }
}

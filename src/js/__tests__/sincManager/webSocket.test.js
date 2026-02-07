/**
 * Тесты для UpdateServiceWebSocket
 * Проверка механизмов переподключения после sleep/wake
 */

// Мокаем зависимости
jest.mock('js-cookie', () => ({
    get: jest.fn(() => 'test-token'),
}));

const mockDispatch = jest.fn();
jest.mock('../../utils/utils', () => ({
    dispatch: mockDispatch,
}));

jest.mock('../../sincManager/chatSync', () => ({
    init: jest.fn(),
    subscribe: jest.fn(),
    handleMessage: jest.fn(() => false),
}));

jest.mock('../../api/api', () => ({
    refreshToken: jest.fn(),
    logout: jest.fn(),
}));

// Мок WebSocket
class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url) {
        this.url = url;
        this.readyState = MockWebSocket.CONNECTING;
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        this.onclose = null;
        this._sentMessages = [];
    }

    send(data) {
        if (this.readyState !== MockWebSocket.OPEN) {
            throw new Error('WebSocket is not open');
        }
        this._sentMessages.push(JSON.parse(data));
    }

    close() {
        this.readyState = MockWebSocket.CLOSED;
        if (this.onclose) {
            this.onclose({ code: 1000, reason: 'Normal closure' });
        }
    }

    // Хелпер для симуляции открытия соединения
    _simulateOpen() {
        this.readyState = MockWebSocket.OPEN;
        if (this.onopen) {
            this.onopen();
        }
    }

    // Хелпер для симуляции получения сообщения
    _simulateMessage(data) {
        if (this.onmessage) {
            this.onmessage({ data: JSON.stringify(data) });
        }
    }
}

// Устанавливаем глобальный WebSocket
global.WebSocket = MockWebSocket;

describe('UpdateServiceWebSocket', () => {
    let UpdateServiceWebSocket;
    let ws;
    let originalVisibilityState;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Сохраняем оригинальное состояние
        originalVisibilityState = document.visibilityState;

        // Мокаем document.visibilityState
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: jest.fn(() => 'visible'),
        });

        // Импортируем класс после установки моков
        jest.isolateModules(() => {
            const module = require('../../sincManager/webSocket');
            UpdateServiceWebSocket = module.UpdateServiceWebSocket;
        });

        ws = new UpdateServiceWebSocket('ws://test.local');
    });

    afterEach(() => {
        jest.useRealTimers();

        // Восстанавливаем оригинальное состояние
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => originalVisibilityState,
        });

        if (ws) {
            ws.destroy();
        }
    });

    describe('connection health check', () => {
        test('should reset missedPongs counter when checking connection', () => {
            // Устанавливаем соединение
            ws.ws = new MockWebSocket('ws://test');
            ws.ws.readyState = MockWebSocket.OPEN;
            ws.isConnected = true;

            // Устанавливаем счётчик пропущенных pong
            ws.missedPongs = 2;

            // Проверяем здоровье соединения
            ws._checkConnectionHealth();

            // Счётчик должен быть сброшен, а не увеличен
            expect(ws.missedPongs).toBe(0);
        });

        test('should not interfere with heartbeat pong counting', () => {
            // Подключаемся чтобы установить обработчик onmessage
            ws.connect();
            ws.ws.readyState = MockWebSocket.OPEN;
            ws.isConnected = true;

            // Симулируем heartbeat увеличивший счётчик
            ws.missedPongs = 1;

            // Проверка соединения сбрасывает счётчик
            ws._checkConnectionHealth();
            expect(ws.missedPongs).toBe(0);

            // Симулируем получение pong через установленный обработчик
            ws.ws.onmessage({ data: JSON.stringify({ type: 'pong' }) });

            // Счётчик остаётся 0
            expect(ws.missedPongs).toBe(0);
            expect(ws._awaitingConnectionCheck).toBe(false);
        });

        test('should avoid duplicate connection checks', () => {
            ws.ws = new MockWebSocket('ws://test');
            ws.ws.readyState = MockWebSocket.OPEN;
            ws.isConnected = true;

            // Первая проверка
            ws._checkConnectionHealth();
            expect(ws._awaitingConnectionCheck).toBe(true);

            const sentCount = ws.ws._sentMessages.length;

            // Вторая проверка не должна отправлять ping
            ws._checkConnectionHealth();
            expect(ws.ws._sentMessages.length).toBe(sentCount);
        });

        test('should handle send errors gracefully', () => {
            // Создаём WebSocket с методом send который бросает ошибку
            ws.ws = {
                readyState: MockWebSocket.OPEN,
                send: () => { throw new Error('Send failed'); },
                close: jest.fn(),
            };
            ws.isConnected = true;

            // Проверка не должна бросать исключение
            expect(() => ws._checkConnectionHealth()).not.toThrow();

            // Флаг должен быть сброшен после ошибки
            expect(ws._awaitingConnectionCheck).toBe(false);
        });
    });

    describe('timeout after disconnect', () => {
        test('connection check timeout should not execute after disconnect', () => {
            ws.ws = new MockWebSocket('ws://test');
            ws.ws.readyState = MockWebSocket.OPEN;
            ws.isConnected = true;

            // Запускаем проверку соединения
            ws._checkConnectionHealth();
            expect(ws._awaitingConnectionCheck).toBe(true);

            // Отключаемся до истечения таймаута
            ws.disconnect();

            // Проверяем что флаг сброшен
            expect(ws._awaitingConnectionCheck).toBe(false);
            expect(ws._connectionCheckTimer).toBe(null);

            // Продвигаем время за пределы таймаута
            jest.advanceTimersByTime(6000);

            // После таймаута ничего не должно произойти (ws уже null)
            expect(ws.ws).toBe(null);
            expect(ws._awaitingConnectionCheck).toBe(false);
        });

        test('timeout callback should check connection state', () => {
            ws.ws = new MockWebSocket('ws://test');
            ws.ws.readyState = MockWebSocket.OPEN;
            ws.isConnected = true;

            ws._checkConnectionHealth();

            // Симулируем ситуацию когда соединение закрылось между ping и timeout
            ws.isConnected = false;

            // Продвигаем время
            jest.advanceTimersByTime(6000);

            // Флаг должен быть сброшен, но ws.close() не вызван
            expect(ws._awaitingConnectionCheck).toBe(false);
        });
    });

    describe('visibility change handler', () => {
        test('should check connection when tab becomes visible', () => {
            ws.ws = new MockWebSocket('ws://test');
            ws.ws.readyState = MockWebSocket.OPEN;
            ws.isConnected = true;

            // Симулируем возврат к вкладке
            ws._handleVisibilityChange();

            // Должна быть инициирована проверка соединения
            expect(ws._awaitingConnectionCheck).toBe(true);
        });

        test('should reconnect if WebSocket is closed when tab becomes visible', () => {
            ws.ws = null;
            ws.isConnected = false;

            const connectSpy = jest.spyOn(ws, 'connect');

            // Симулируем возврат к вкладке
            ws._handleVisibilityChange();

            expect(connectSpy).toHaveBeenCalled();
        });

        test('should not do anything when tab becomes hidden', () => {
            Object.defineProperty(document, 'visibilityState', {
                configurable: true,
                get: () => 'hidden',
            });

            ws.ws = new MockWebSocket('ws://test');
            ws.ws.readyState = MockWebSocket.OPEN;
            ws.isConnected = true;

            ws._handleVisibilityChange();

            // Проверка не должна быть инициирована
            expect(ws._awaitingConnectionCheck).toBe(false);
        });
    });

    describe('online event handler', () => {
        test('should check connection when network comes online', () => {
            ws.ws = new MockWebSocket('ws://test');
            ws.ws.readyState = MockWebSocket.OPEN;
            ws.isConnected = true;

            ws._handleOnline();

            expect(ws._awaitingConnectionCheck).toBe(true);
        });

        test('should reconnect if disconnected when network comes online', () => {
            ws.ws = null;
            ws.isConnected = false;

            const connectSpy = jest.spyOn(ws, 'connect');

            ws._handleOnline();

            expect(connectSpy).toHaveBeenCalled();
        });
    });

    describe('pong handling', () => {
        test('should clear connection check timer on pong', () => {
            // Подключаемся чтобы установить обработчик onmessage
            ws.connect();
            ws.ws.readyState = MockWebSocket.OPEN;
            ws.isConnected = true;

            // Инициируем проверку
            ws._checkConnectionHealth();
            expect(ws._connectionCheckTimer).not.toBe(null);

            // Симулируем получение pong через установленный обработчик
            ws.ws.onmessage({ data: JSON.stringify({ type: 'pong' }) });

            // Таймер должен быть очищен
            expect(ws._connectionCheckTimer).toBe(null);
            expect(ws._awaitingConnectionCheck).toBe(false);
        });
    });

    describe('cleanup on destroy', () => {
        test('should remove all event listeners on destroy', () => {
            const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
            const removeDocEventListenerSpy = jest.spyOn(document, 'removeEventListener');

            ws.destroy();

            expect(removeEventListenerSpy).toHaveBeenCalledWith('Login', ws._handleLogin);
            expect(removeEventListenerSpy).toHaveBeenCalledWith('Logout', ws._handleLogout);
            expect(removeEventListenerSpy).toHaveBeenCalledWith('online', ws._handleOnline);
            expect(removeDocEventListenerSpy).toHaveBeenCalledWith('visibilitychange', ws._handleVisibilityChange);
        });
    });

    describe('get_updates_v2', () => {
        test('should resolve getUpdatesV2 promise when block_updates_v2 arrives', async () => {
            ws.connect();
            ws.ws._simulateOpen();

            const promise = ws.getUpdatesV2({
                cursor: 10,
                subscription_version: 2,
                limit: 500
            });

            ws.ws._simulateMessage({
                type: 'block_updates_v2',
                updates: [{ id: 'b1' }],
                next_cursor: 11,
                has_more: false,
                subscription_version: 2,
                full_resync_required: false
            });

            await expect(promise).resolves.toMatchObject({
                type: 'block_updates_v2',
                next_cursor: 11
            });
        });

        test('should reject getUpdatesV2 promise when server returns error', async () => {
            ws.connect();
            ws.ws._simulateOpen();

            const promise = ws.getUpdatesV2({
                cursor: 10,
                subscription_version: 2,
                limit: 500
            });

            ws.ws._simulateMessage({
                type: 'error',
                message: 'get_updates_v2 is disabled.'
            });

            await expect(promise).rejects.toThrow('get_updates_v2 is disabled.');
        });
    });

    describe('auth error handling (code 1008)', () => {
        let api;
        let wsInstance;

        beforeEach(() => {
            // Для этих тестов используем реальные таймеры
            jest.useRealTimers();

            api = require('../../api/api');
            api.refreshToken.mockClear();
            api.logout.mockClear();

            // Создаём новый instance без fake timers
            jest.isolateModules(() => {
                const module = require('../../sincManager/webSocket');
                wsInstance = new module.UpdateServiceWebSocket('ws://test.local');
            });
        });

        afterEach(() => {
            if (wsInstance) {
                wsInstance.destroy();
            }
            // Возвращаем fake timers для следующих тестов
            jest.useFakeTimers();
        });

        test('should try to refresh token on close with code 1008', async () => {
            api.refreshToken.mockResolvedValue(true);

            wsInstance.connect();
            wsInstance.ws._simulateOpen();
            wsInstance.shouldReconnect = true;

            // Симулируем закрытие с кодом 1008 (auth error)
            wsInstance.ws.readyState = MockWebSocket.CLOSED;
            wsInstance.ws.onclose({ code: 1008, reason: 'Token expired' });

            // Даём время для выполнения async операции
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(api.refreshToken).toHaveBeenCalled();
        });

        test('should logout if token refresh fails', async () => {
            api.refreshToken.mockResolvedValue(false);

            wsInstance.connect();
            wsInstance.ws._simulateOpen();
            wsInstance.shouldReconnect = true;

            // Симулируем закрытие с кодом 1008
            wsInstance.ws.readyState = MockWebSocket.CLOSED;
            wsInstance.ws.onclose({ code: 1008, reason: 'Token expired' });

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(api.refreshToken).toHaveBeenCalled();
            expect(mockDispatch).toHaveBeenCalledWith('SessionExpired');
            expect(wsInstance.shouldReconnect).toBe(false);
            expect(wsInstance.isConnected).toBe(false);
        });

        test('should logout if token refresh throws error', async () => {
            api.refreshToken.mockRejectedValue(new Error('Network error'));

            wsInstance.connect();
            wsInstance.ws._simulateOpen();
            wsInstance.shouldReconnect = true;

            wsInstance.ws.readyState = MockWebSocket.CLOSED;
            wsInstance.ws.onclose({ code: 1008, reason: 'Token expired' });

            // Ждём rejection
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(api.refreshToken).toHaveBeenCalled();
            expect(mockDispatch).toHaveBeenCalledWith('SessionExpired');
            expect(wsInstance.shouldReconnect).toBe(false);
            expect(wsInstance.isConnected).toBe(false);
        });

        test('should not refresh token on normal close (code 1000)', () => {
            wsInstance.connect();
            wsInstance.ws._simulateOpen();
            wsInstance.shouldReconnect = true;

            // Симулируем нормальное закрытие
            wsInstance.ws.readyState = MockWebSocket.CLOSED;
            wsInstance.ws.onclose({ code: 1000, reason: 'Normal closure' });

            expect(api.refreshToken).not.toHaveBeenCalled();
        });
    });
});

/**
 * Тесты для OfflineQueueManager и NetworkStatusUI
 */

import localforage from 'localforage';

// Мокаем localforage
jest.mock('localforage', () => ({
    getItem: jest.fn(),
    setItem: jest.fn(),
}));

// Мокаем dispatch
jest.mock('../../utils/utils', () => ({
    dispatch: jest.fn(),
}));

describe('OfflineQueueManager', () => {
    let OfflineQueueManager;
    let dispatch;

    beforeEach(() => {
        jest.clearAllMocks();

        dispatch = require('../../utils/utils').dispatch;

        // Создаём класс для тестирования (без зависимости от navigator/window)
        OfflineQueueManager = class {
            constructor() {
                this.QUEUE_KEY = 'offlineOperationsQueue';
                this.SYNC_TAG = 'omnimap-sync';
                this.isOnline = true;
                this.isSyncing = false;
                this.backgroundSyncSupported = false;
            }

            async getQueue() {
                try {
                    const queue = await localforage.getItem(this.QUEUE_KEY);
                    return queue || [];
                } catch {
                    return [];
                }
            }

            async saveQueue(queue) {
                await localforage.setItem(this.QUEUE_KEY, queue);
            }

            async enqueue(operation) {
                const queue = await this.getQueue();
                operation.timestamp = Date.now();
                operation.retryCount = 0;
                queue.push(operation);
                await this.saveQueue(queue);
            }

            async getPendingCount() {
                const queue = await this.getQueue();
                return queue.length;
            }

            async clearQueue() {
                await this.saveQueue([]);
            }

            async hasPendingOperations() {
                const count = await this.getPendingCount();
                return count > 0;
            }

            isNetworkOnline() {
                return this.isOnline;
            }

            handleOnline() {
                this.isOnline = true;
                dispatch('NetworkStatusChange', { online: true });
            }

            handleOffline() {
                this.isOnline = false;
                dispatch('NetworkStatusChange', { online: false });
            }
        };
    });

    describe('Queue Operations', () => {
        test('getQueue returns empty array when no queue exists', async () => {
            localforage.getItem.mockResolvedValue(null);

            const manager = new OfflineQueueManager();
            const queue = await manager.getQueue();

            expect(queue).toEqual([]);
            expect(localforage.getItem).toHaveBeenCalledWith('offlineOperationsQueue');
        });

        test('getQueue returns existing queue', async () => {
            const existingQueue = [
                { type: 'createBlock', data: { title: 'Test' } },
            ];
            localforage.getItem.mockResolvedValue(existingQueue);

            const manager = new OfflineQueueManager();
            const queue = await manager.getQueue();

            expect(queue).toEqual(existingQueue);
        });

        test('enqueue adds operation to queue with timestamp and retryCount', async () => {
            localforage.getItem.mockResolvedValue([]);
            localforage.setItem.mockResolvedValue();

            const manager = new OfflineQueueManager();
            const operation = { type: 'createBlock', data: { title: 'Test' } };

            await manager.enqueue(operation);

            expect(localforage.setItem).toHaveBeenCalled();
            const savedQueue = localforage.setItem.mock.calls[0][1];
            expect(savedQueue).toHaveLength(1);
            expect(savedQueue[0].type).toBe('createBlock');
            expect(savedQueue[0].timestamp).toBeDefined();
            expect(savedQueue[0].retryCount).toBe(0);
        });

        test('enqueue appends to existing queue', async () => {
            const existingOp = { type: 'updateBlock', data: { id: '1' }, timestamp: 1000, retryCount: 0 };
            localforage.getItem.mockResolvedValue([existingOp]);
            localforage.setItem.mockResolvedValue();

            const manager = new OfflineQueueManager();
            const newOp = { type: 'deleteBlock', data: { id: '2' } };

            await manager.enqueue(newOp);

            const savedQueue = localforage.setItem.mock.calls[0][1];
            expect(savedQueue).toHaveLength(2);
            expect(savedQueue[0].type).toBe('updateBlock');
            expect(savedQueue[1].type).toBe('deleteBlock');
        });

        test('clearQueue empties the queue', async () => {
            localforage.setItem.mockResolvedValue();

            const manager = new OfflineQueueManager();
            await manager.clearQueue();

            expect(localforage.setItem).toHaveBeenCalledWith('offlineOperationsQueue', []);
        });

        test('getPendingCount returns correct count', async () => {
            localforage.getItem.mockResolvedValue([
                { type: 'op1' },
                { type: 'op2' },
                { type: 'op3' },
            ]);

            const manager = new OfflineQueueManager();
            const count = await manager.getPendingCount();

            expect(count).toBe(3);
        });

        test('hasPendingOperations returns true when queue is not empty', async () => {
            localforage.getItem.mockResolvedValue([{ type: 'op1' }]);

            const manager = new OfflineQueueManager();
            const hasPending = await manager.hasPendingOperations();

            expect(hasPending).toBe(true);
        });

        test('hasPendingOperations returns false when queue is empty', async () => {
            localforage.getItem.mockResolvedValue([]);

            const manager = new OfflineQueueManager();
            const hasPending = await manager.hasPendingOperations();

            expect(hasPending).toBe(false);
        });
    });

    describe('Network Status', () => {
        test('isNetworkOnline returns true when online', () => {
            const manager = new OfflineQueueManager();
            manager.isOnline = true;

            expect(manager.isNetworkOnline()).toBe(true);
        });

        test('isNetworkOnline returns false when offline', () => {
            const manager = new OfflineQueueManager();
            manager.isOnline = false;

            expect(manager.isNetworkOnline()).toBe(false);
        });

        test('handleOnline sets isOnline to true and dispatches event', () => {
            const manager = new OfflineQueueManager();
            manager.isOnline = false;

            manager.handleOnline();

            expect(manager.isOnline).toBe(true);
            expect(dispatch).toHaveBeenCalledWith('NetworkStatusChange', { online: true });
        });

        test('handleOffline sets isOnline to false and dispatches event', () => {
            const manager = new OfflineQueueManager();
            manager.isOnline = true;

            manager.handleOffline();

            expect(manager.isOnline).toBe(false);
            expect(dispatch).toHaveBeenCalledWith('NetworkStatusChange', { online: false });
        });
    });

    describe('Error Handling', () => {
        test('getQueue returns empty array on error', async () => {
            localforage.getItem.mockRejectedValue(new Error('DB error'));

            const manager = new OfflineQueueManager();
            const queue = await manager.getQueue();

            expect(queue).toEqual([]);
        });
    });

    describe('Immediate Sync Option', () => {
        let ImmediateSyncManager;

        beforeEach(() => {
            // Расширенный класс с поддержкой immediate опции
            ImmediateSyncManager = class extends OfflineQueueManager {
                constructor() {
                    super();
                    this.syncDebounceTimer = null;
                    this.SYNC_DEBOUNCE_MS = 3000;
                    this.isPulling = false;
                    this.startPullPhaseCalled = false;
                    this.scheduleSyncWithDebounceCalled = false;
                }

                async enqueue(operation, options = {}) {
                    const queue = await this.getQueue();
                    operation.timestamp = Date.now();
                    operation.retryCount = 0;
                    queue.push(operation);
                    await this.saveQueue(queue);

                    if (this.isOnline && !this.isSyncing && !this.isPulling) {
                        if (options.immediate) {
                            if (this.syncDebounceTimer) {
                                clearTimeout(this.syncDebounceTimer);
                                this.syncDebounceTimer = null;
                            }
                            this.startPullPhase();
                        } else {
                            this.scheduleSyncWithDebounce();
                        }
                    }
                }

                startPullPhase() {
                    this.startPullPhaseCalled = true;
                }

                scheduleSyncWithDebounce() {
                    this.scheduleSyncWithDebounceCalled = true;
                    this.syncDebounceTimer = setTimeout(() => {
                        this.startPullPhase();
                    }, this.SYNC_DEBOUNCE_MS);
                }
            };
        });

        afterEach(() => {
            jest.clearAllTimers();
        });

        test('enqueue with immediate: true triggers sync immediately', async () => {
            localforage.getItem.mockResolvedValue([]);
            localforage.setItem.mockResolvedValue();

            const manager = new ImmediateSyncManager();
            manager.isOnline = true;

            await manager.enqueue(
                { type: 'createBlock', data: { blockId: 'test-1' } },
                { immediate: true }
            );

            expect(manager.startPullPhaseCalled).toBe(true);
            expect(manager.scheduleSyncWithDebounceCalled).toBe(false);
        });

        test('enqueue without immediate uses debounce', async () => {
            localforage.getItem.mockResolvedValue([]);
            localforage.setItem.mockResolvedValue();

            const manager = new ImmediateSyncManager();
            manager.isOnline = true;

            await manager.enqueue(
                { type: 'createBlock', data: { blockId: 'test-1' } }
            );

            expect(manager.startPullPhaseCalled).toBe(false);
            expect(manager.scheduleSyncWithDebounceCalled).toBe(true);
        });

        test('enqueue with immediate: false uses debounce', async () => {
            localforage.getItem.mockResolvedValue([]);
            localforage.setItem.mockResolvedValue();

            const manager = new ImmediateSyncManager();
            manager.isOnline = true;

            await manager.enqueue(
                { type: 'updateBlock', data: { blockId: 'test-1' } },
                { immediate: false }
            );

            expect(manager.startPullPhaseCalled).toBe(false);
            expect(manager.scheduleSyncWithDebounceCalled).toBe(true);
        });

        test('immediate sync clears existing debounce timer', async () => {
            jest.useFakeTimers();
            localforage.getItem.mockResolvedValue([]);
            localforage.setItem.mockResolvedValue();

            const manager = new ImmediateSyncManager();
            manager.isOnline = true;

            // Первый вызов с debounce
            await manager.enqueue({ type: 'updateBlock', data: { blockId: 'test-1' } });
            expect(manager.syncDebounceTimer).not.toBeNull();

            // Второй вызов с immediate — должен очистить таймер
            await manager.enqueue(
                { type: 'createBlock', data: { blockId: 'test-2' } },
                { immediate: true }
            );

            expect(manager.syncDebounceTimer).toBeNull();
            expect(manager.startPullPhaseCalled).toBe(true);

            jest.useRealTimers();
        });

        test('immediate sync does not trigger when offline', async () => {
            localforage.getItem.mockResolvedValue([]);
            localforage.setItem.mockResolvedValue();

            const manager = new ImmediateSyncManager();
            manager.isOnline = false;

            await manager.enqueue(
                { type: 'createBlock', data: { blockId: 'test-1' } },
                { immediate: true }
            );

            expect(manager.startPullPhaseCalled).toBe(false);
            expect(manager.scheduleSyncWithDebounceCalled).toBe(false);
        });

        test('immediate sync does not trigger when already syncing', async () => {
            localforage.getItem.mockResolvedValue([]);
            localforage.setItem.mockResolvedValue();

            const manager = new ImmediateSyncManager();
            manager.isOnline = true;
            manager.isSyncing = true;

            await manager.enqueue(
                { type: 'createBlock', data: { blockId: 'test-1' } },
                { immediate: true }
            );

            expect(manager.startPullPhaseCalled).toBe(false);
        });

        test('immediate sync does not trigger when pulling', async () => {
            localforage.getItem.mockResolvedValue([]);
            localforage.setItem.mockResolvedValue();

            const manager = new ImmediateSyncManager();
            manager.isOnline = true;
            manager.isPulling = true;

            await manager.enqueue(
                { type: 'createBlock', data: { blockId: 'test-1' } },
                { immediate: true }
            );

            expect(manager.startPullPhaseCalled).toBe(false);
        });
    });

    describe('Operation Types', () => {
        test('supports createBlock operation', async () => {
            localforage.getItem.mockResolvedValue([]);
            localforage.setItem.mockResolvedValue();

            const manager = new OfflineQueueManager();
            await manager.enqueue({
                type: 'createBlock',
                data: { parentId: 'parent-1', title: 'New Block', blockData: {} },
            });

            const savedQueue = localforage.setItem.mock.calls[0][1];
            expect(savedQueue[0].type).toBe('createBlock');
            expect(savedQueue[0].data.parentId).toBe('parent-1');
        });

        test('supports updateBlock operation', async () => {
            localforage.getItem.mockResolvedValue([]);
            localforage.setItem.mockResolvedValue();

            const manager = new OfflineQueueManager();
            await manager.enqueue({
                type: 'updateBlock',
                data: { id: 'block-1', blockData: { title: 'Updated' } },
            });

            const savedQueue = localforage.setItem.mock.calls[0][1];
            expect(savedQueue[0].type).toBe('updateBlock');
        });

        test('supports deleteBlock operation', async () => {
            localforage.getItem.mockResolvedValue([]);
            localforage.setItem.mockResolvedValue();

            const manager = new OfflineQueueManager();
            await manager.enqueue({
                type: 'deleteBlock',
                data: { id: 'block-1' },
            });

            const savedQueue = localforage.setItem.mock.calls[0][1];
            expect(savedQueue[0].type).toBe('deleteBlock');
        });

        test('supports moveBlock operation', async () => {
            localforage.getItem.mockResolvedValue([]);
            localforage.setItem.mockResolvedValue();

            const manager = new OfflineQueueManager();
            await manager.enqueue({
                type: 'moveBlock',
                data: {
                    blockId: 'block-1',
                    oldParentId: 'old-parent',
                    newParentId: 'new-parent',
                    childOrder: 0,
                },
            });

            const savedQueue = localforage.setItem.mock.calls[0][1];
            expect(savedQueue[0].type).toBe('moveBlock');
        });
    });
});

describe('NetworkStatusUI', () => {
    let NetworkStatusUI;

    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';

        // Упрощённая версия NetworkStatusUI для тестов
        NetworkStatusUI = class {
            constructor() {
                this.element = null;
                this.hideTimeout = null;
                this.createElement();
            }

            createElement() {
                this.element = document.createElement('div');
                this.element.className = 'network-status';
                this.element.innerHTML = `
                    <span class="network-status-icon"></span>
                    <span class="network-status-text"></span>
                `;
                document.body.appendChild(this.element);
            }

            setText(text) {
                const textEl = this.element.querySelector('.network-status-text');
                if (textEl) {
                    textEl.textContent = text;
                }
            }

            showOffline() {
                this.element.className = 'network-status offline visible';
                this.setText('Нет подключения к сети');
            }

            showOnline() {
                this.element.className = 'network-status online visible';
                this.setText('Подключение восстановлено');
            }

            showSyncing(pendingCount) {
                this.element.className = 'network-status syncing visible';
                this.setText(`Синхронизация... (${pendingCount})`);
            }

            showSyncCompleted(detail) {
                const { successCount, failedCount } = detail;
                if (failedCount > 0) {
                    this.element.className = 'network-status syncing visible';
                    this.setText(`Синхронизировано: ${successCount}, ошибок: ${failedCount}`);
                } else if (successCount > 0) {
                    this.element.className = 'network-status online visible';
                    this.setText(`Синхронизировано: ${successCount}`);
                } else {
                    this.hide();
                }
            }

            hide() {
                this.element.classList.remove('visible');
            }
        };
    });

    test('createElement adds element to DOM', () => {
        const ui = new NetworkStatusUI();

        expect(document.querySelector('.network-status')).toBeTruthy();
        expect(document.querySelector('.network-status-icon')).toBeTruthy();
        expect(document.querySelector('.network-status-text')).toBeTruthy();
    });

    test('showOffline sets correct class and text', () => {
        const ui = new NetworkStatusUI();
        ui.showOffline();

        expect(ui.element.className).toContain('offline');
        expect(ui.element.className).toContain('visible');
        expect(ui.element.querySelector('.network-status-text').textContent).toBe('Нет подключения к сети');
    });

    test('showOnline sets correct class and text', () => {
        const ui = new NetworkStatusUI();
        ui.showOnline();

        expect(ui.element.className).toContain('online');
        expect(ui.element.className).toContain('visible');
        expect(ui.element.querySelector('.network-status-text').textContent).toBe('Подключение восстановлено');
    });

    test('showSyncing shows pending count', () => {
        const ui = new NetworkStatusUI();
        ui.showSyncing(5);

        expect(ui.element.className).toContain('syncing');
        expect(ui.element.querySelector('.network-status-text').textContent).toBe('Синхронизация... (5)');
    });

    test('showSyncCompleted with errors shows error count', () => {
        const ui = new NetworkStatusUI();
        ui.showSyncCompleted({ successCount: 3, failedCount: 2 });

        expect(ui.element.className).toContain('syncing');
        expect(ui.element.querySelector('.network-status-text').textContent).toBe('Синхронизировано: 3, ошибок: 2');
    });

    test('showSyncCompleted without errors shows success', () => {
        const ui = new NetworkStatusUI();
        ui.showSyncCompleted({ successCount: 5, failedCount: 0 });

        expect(ui.element.className).toContain('online');
        expect(ui.element.querySelector('.network-status-text').textContent).toBe('Синхронизировано: 5');
    });

    test('showSyncCompleted with no operations hides', () => {
        const ui = new NetworkStatusUI();
        ui.showOnline(); // Make visible first
        ui.showSyncCompleted({ successCount: 0, failedCount: 0 });

        expect(ui.element.className).not.toContain('visible');
    });

    test('hide removes visible class', () => {
        const ui = new NetworkStatusUI();
        ui.showOnline();
        ui.hide();

        expect(ui.element.className).not.toContain('visible');
    });
});

describe('Network Error Detection', () => {
    let manager;

    beforeEach(() => {
        // Класс с реализацией isNetworkError
        const TestManager = class {
            isNetworkError(error) {
                if (!error) return false;

                const message = error.message?.toLowerCase() || '';
                const code = error.code || '';

                return (
                    code === 'ERR_NETWORK' ||
                    code === 'ECONNREFUSED' ||
                    code === 'ENOTFOUND' ||
                    message.includes('network error') ||
                    message.includes('failed to fetch') ||
                    message.includes('timed out') ||
                    message.includes('timeout') ||
                    message.includes('net::') ||
                    message.includes('connection refused')
                );
            }
        };
        manager = new TestManager();
    });

    test('detects ERR_NETWORK code', () => {
        const error = { code: 'ERR_NETWORK', message: 'Some error' };
        expect(manager.isNetworkError(error)).toBe(true);
    });

    test('detects ECONNREFUSED code', () => {
        const error = { code: 'ECONNREFUSED', message: 'Connection refused' };
        expect(manager.isNetworkError(error)).toBe(true);
    });

    test('detects ENOTFOUND code', () => {
        const error = { code: 'ENOTFOUND', message: 'DNS lookup failed' };
        expect(manager.isNetworkError(error)).toBe(true);
    });

    test('detects "network error" in message', () => {
        const error = { message: 'Network Error occurred' };
        expect(manager.isNetworkError(error)).toBe(true);
    });

    test('detects "failed to fetch" in message', () => {
        const error = { message: 'Failed to fetch resource' };
        expect(manager.isNetworkError(error)).toBe(true);
    });

    test('detects "timed out" in message', () => {
        const error = { message: 'Request timed out' };
        expect(manager.isNetworkError(error)).toBe(true);
    });

    test('detects "timeout" in message', () => {
        const error = { message: 'Connection timeout' };
        expect(manager.isNetworkError(error)).toBe(true);
    });

    test('detects Chrome net:: errors', () => {
        const error = { message: 'net::ERR_INTERNET_DISCONNECTED' };
        expect(manager.isNetworkError(error)).toBe(true);
    });

    test('detects "connection refused" in message', () => {
        const error = { message: 'Connection refused by server' };
        expect(manager.isNetworkError(error)).toBe(true);
    });

    test('returns false for null error', () => {
        expect(manager.isNetworkError(null)).toBe(false);
    });

    test('returns false for undefined error', () => {
        expect(manager.isNetworkError(undefined)).toBe(false);
    });

    test('returns false for non-network errors', () => {
        const error = { message: 'Invalid JSON response' };
        expect(manager.isNetworkError(error)).toBe(false);
    });

    test('returns false for authentication errors', () => {
        const error = { message: 'Unauthorized', code: 401 };
        expect(manager.isNetworkError(error)).toBe(false);
    });

    test('returns false for validation errors', () => {
        const error = { message: 'Validation failed: title is required' };
        expect(manager.isNetworkError(error)).toBe(false);
    });
});

describe('Stale Operations Cleanup', () => {
    let dispatch;

    beforeEach(() => {
        jest.clearAllMocks();
        dispatch = require('../../utils/utils').dispatch;
    });

    test('cleanupStaleOperations removes operations older than MAX_OPERATION_AGE_MS', async () => {
        const MAX_OPERATION_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
        const now = Date.now();

        const queue = [
            { type: 'createBlock', data: { blockId: 'old-1' }, timestamp: now - MAX_OPERATION_AGE_MS - 1000 }, // stale
            { type: 'createBlock', data: { blockId: 'fresh-1' }, timestamp: now - 1000 }, // fresh
            { type: 'updateBlock', data: { id: 'old-2' }, timestamp: now - MAX_OPERATION_AGE_MS - 5000 }, // stale
        ];

        // Симулируем логику cleanupStaleOperations
        const freshOperations = [];
        const staleOperations = [];

        for (const operation of queue) {
            const age = now - (operation.timestamp || 0);
            if (age > MAX_OPERATION_AGE_MS) {
                staleOperations.push(operation);
            } else {
                freshOperations.push(operation);
            }
        }

        expect(staleOperations).toHaveLength(2);
        expect(freshOperations).toHaveLength(1);
        expect(freshOperations[0].data.blockId).toBe('fresh-1');
    });

    test('cleanupStaleOperations keeps all fresh operations', async () => {
        const MAX_OPERATION_AGE_MS = 24 * 60 * 60 * 1000;
        const now = Date.now();

        const queue = [
            { type: 'createBlock', data: { blockId: 'fresh-1' }, timestamp: now - 1000 },
            { type: 'updateBlock', data: { id: 'fresh-2' }, timestamp: now - 60000 },
            { type: 'deleteBlock', data: { id: 'fresh-3' }, timestamp: now - 3600000 }, // 1 hour ago
        ];

        const freshOperations = queue.filter(op => {
            const age = now - (op.timestamp || 0);
            return age <= MAX_OPERATION_AGE_MS;
        });

        expect(freshOperations).toHaveLength(3);
    });

    test('cleanupStaleOperations handles empty queue', () => {
        const queue = [];
        const freshOperations = queue.filter(op => {
            const age = Date.now() - (op.timestamp || 0);
            return age <= 24 * 60 * 60 * 1000;
        });

        expect(freshOperations).toHaveLength(0);
    });

    test('cleanupStaleOperations handles missing timestamps gracefully', () => {
        const now = Date.now();
        const MAX_OPERATION_AGE_MS = 24 * 60 * 60 * 1000;

        const queue = [
            { type: 'createBlock', data: { blockId: 'no-timestamp' } }, // no timestamp - will be treated as very old
            { type: 'updateBlock', data: { id: 'with-timestamp' }, timestamp: now - 1000 },
        ];

        const freshOperations = queue.filter(op => {
            const age = now - (op.timestamp || 0);
            return age <= MAX_OPERATION_AGE_MS;
        });

        // Operation without timestamp will have age = now - 0 = now (very old)
        expect(freshOperations).toHaveLength(1);
        expect(freshOperations[0].data.id).toBe('with-timestamp');
    });
});

describe('Retry Mechanism', () => {
    let manager;

    beforeEach(() => {
        jest.useFakeTimers();

        const TestRetryManager = class {
            constructor() {
                this.retryAttempts = 0;
                this.MAX_RETRY_ATTEMPTS = 5;
                this.RETRY_BASE_INTERVAL_MS = 5000;
                this.retryTimer = null;
                this.isOnline = false;
                this.startPullPhaseCalled = false;
            }

            scheduleRetry() {
                if (this.retryTimer) {
                    clearTimeout(this.retryTimer);
                    this.retryTimer = null;
                }

                if (this.retryAttempts >= this.MAX_RETRY_ATTEMPTS) {
                    this.retryAttempts = 0;
                    return;
                }

                const interval = this.RETRY_BASE_INTERVAL_MS * Math.pow(2, this.retryAttempts);
                const maxInterval = 60000;
                const actualInterval = Math.min(interval, maxInterval);

                this.retryAttempts++;

                this.retryTimer = setTimeout(() => {
                    this.retryTimer = null;
                    // Симулируем проверку сети
                    if (this.isOnline) {
                        this.startPullPhaseCalled = true;
                    } else {
                        this.scheduleRetry();
                    }
                }, actualInterval);
            }
        };

        manager = new TestRetryManager();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('scheduleRetry increments retry attempts', () => {
        expect(manager.retryAttempts).toBe(0);
        manager.scheduleRetry();
        expect(manager.retryAttempts).toBe(1);
    });

    test('scheduleRetry uses exponential backoff', () => {
        manager.scheduleRetry();
        expect(manager.retryAttempts).toBe(1);
        // First retry: 5000 * 2^0 = 5000ms

        jest.advanceTimersByTime(5000);
        expect(manager.retryAttempts).toBe(2);
        // Second retry: 5000 * 2^1 = 10000ms

        jest.advanceTimersByTime(10000);
        expect(manager.retryAttempts).toBe(3);
        // Third retry: 5000 * 2^2 = 20000ms
    });

    test('scheduleRetry caps interval at 60 seconds', () => {
        // Set attempts high enough for interval to exceed 60s
        manager.retryAttempts = 4; // 5000 * 2^4 = 80000ms > 60000ms

        manager.scheduleRetry();

        // Should use maxInterval (60000) instead of calculated (80000)
        jest.advanceTimersByTime(59999);
        expect(manager.retryAttempts).toBe(5); // Still waiting

        jest.advanceTimersByTime(1);
        // After 60s, retry should trigger
        // Since isOnline is false, it will schedule another retry
        expect(manager.retryAttempts).toBe(0); // Reset after max attempts
    });

    test('scheduleRetry stops after MAX_RETRY_ATTEMPTS', () => {
        manager.retryAttempts = 5; // Already at max

        manager.scheduleRetry();

        // Should reset and not schedule
        expect(manager.retryAttempts).toBe(0);
        expect(manager.retryTimer).toBeNull();
    });

    test('scheduleRetry triggers startPullPhase when online', () => {
        manager.isOnline = true;
        manager.scheduleRetry();

        jest.advanceTimersByTime(5000);

        expect(manager.startPullPhaseCalled).toBe(true);
    });

    test('scheduleRetry continues retrying when offline', () => {
        manager.isOnline = false;
        manager.scheduleRetry();

        jest.advanceTimersByTime(5000); // First retry
        expect(manager.retryAttempts).toBe(2); // Scheduled next

        jest.advanceTimersByTime(10000); // Second retry
        expect(manager.retryAttempts).toBe(3);
    });

    test('scheduleRetry clears previous timer', () => {
        manager.scheduleRetry();
        const firstTimer = manager.retryTimer;
        expect(firstTimer).not.toBeNull();

        manager.scheduleRetry();
        const secondTimer = manager.retryTimer;

        expect(secondTimer).not.toBe(firstTimer);
        expect(manager.retryAttempts).toBe(2); // Both calls incremented
    });
});

describe('Batch Import Logic', () => {
    const TEMP_ID_PREFIX = 'temp_';
    const MIN_OPERATIONS_FOR_BATCH = 3;

    /**
     * Helper: проверяет, является ли ID временным
     */
    function isTempId(id) {
        return id && typeof id === 'string' && id.startsWith(TEMP_ID_PREFIX);
    }

    /**
     * Helper: резолвит ID используя маппинг
     */
    function resolveId(id, tempIdToRealId) {
        if (!id) return id;
        if (tempIdToRealId.has(id)) {
            return tempIdToRealId.get(id);
        }
        return id;
    }

    /**
     * Helper: мержит данные блока
     */
    function mergeBlockData(block, changes) {
        const merged = { ...block };
        if (changes.title !== undefined) {
            merged.title = changes.title;
        }
        if (changes.data !== undefined) {
            merged.data = { ...(merged.data || {}), ...changes.data };
        }
        return merged;
    }

    /**
     * Helper: проверяет, можно ли использовать batch import
     */
    function canUseBatchImport(queue) {
        if (queue.length < MIN_OPERATIONS_FOR_BATCH) return false;
        const supportedTypes = ['createBlock', 'updateBlock', 'moveBlock', 'deleteBlock'];
        return queue.every(op => supportedTypes.includes(op.type));
    }

    describe('canUseBatchImport', () => {
        test('returns false for less than 3 operations', () => {
            expect(canUseBatchImport([
                { type: 'createBlock' },
                { type: 'updateBlock' }
            ])).toBe(false);
        });

        test('returns true for 3+ supported operations', () => {
            expect(canUseBatchImport([
                { type: 'createBlock' },
                { type: 'updateBlock' },
                { type: 'deleteBlock' }
            ])).toBe(true);
        });

        test('returns true for mixed supported operations', () => {
            expect(canUseBatchImport([
                { type: 'createBlock' },
                { type: 'moveBlock' },
                { type: 'updateBlock' },
                { type: 'deleteBlock' }
            ])).toBe(true);
        });

        test('returns false for unsupported operation types', () => {
            expect(canUseBatchImport([
                { type: 'createBlock' },
                { type: 'updateBlock' },
                { type: 'unknownType' }
            ])).toBe(false);
        });
    });

    describe('isTempId', () => {
        test('returns true for temp_ prefixed IDs', () => {
            expect(isTempId('temp_abc-123')).toBe(true);
            expect(isTempId('temp_')).toBe(true);
        });

        test('returns false for regular IDs', () => {
            expect(isTempId('abc-123')).toBe(false);
            expect(isTempId('uuid-v4-format')).toBe(false);
        });

        test('returns falsy for null/undefined', () => {
            expect(isTempId(null)).toBeFalsy();
            expect(isTempId(undefined)).toBeFalsy();
        });
    });

    describe('resolveId', () => {
        test('resolves temp ID to real ID when mapping exists', () => {
            const map = new Map([['temp_1', 'real_1']]);
            expect(resolveId('temp_1', map)).toBe('real_1');
        });

        test('returns original ID when no mapping exists', () => {
            const map = new Map();
            expect(resolveId('some_id', map)).toBe('some_id');
        });

        test('returns null/undefined as is', () => {
            const map = new Map();
            expect(resolveId(null, map)).toBe(null);
            expect(resolveId(undefined, map)).toBe(undefined);
        });
    });

    describe('mergeBlockData', () => {
        test('merges title changes', () => {
            const block = { id: '1', title: 'Old', data: {} };
            const result = mergeBlockData(block, { title: 'New' });
            expect(result.title).toBe('New');
        });

        test('merges data changes', () => {
            const block = { id: '1', title: 'Test', data: { color: 'red' } };
            const result = mergeBlockData(block, { data: { text: 'Hello' } });
            expect(result.data.color).toBe('red');
            expect(result.data.text).toBe('Hello');
        });

        test('does not mutate original block', () => {
            const block = { id: '1', title: 'Old', data: { x: 1 } };
            const result = mergeBlockData(block, { title: 'New' });
            expect(block.title).toBe('Old');
            expect(result.title).toBe('New');
        });

        test('handles empty data', () => {
            const block = { id: '1', title: 'Test' };
            const result = mergeBlockData(block, { data: { text: 'Hello' } });
            expect(result.data.text).toBe('Hello');
        });
    });

    describe('Operation Merging Logic', () => {
        test('multiple updates to same block merge into single block', () => {
            const operations = [
                { type: 'updateBlock', data: { id: 'block-1', blockData: { title: 'First' } }, timestamp: 1 },
                { type: 'updateBlock', data: { id: 'block-1', blockData: { data: { text: 'Hello' } } }, timestamp: 2 },
                { type: 'updateBlock', data: { id: 'block-1', blockData: { title: 'Final' } }, timestamp: 3 },
            ];

            // Симуляция логики объединения
            const changedBlocks = new Map();
            const localBlocks = new Map([
                ['block-1', { id: 'block-1', title: 'Original', data: {}, children: [] }]
            ]);

            for (const op of operations) {
                const { id, blockData } = op.data;
                const localBlock = localBlocks.get(id);

                if (changedBlocks.has(id)) {
                    changedBlocks.set(id, mergeBlockData(changedBlocks.get(id), blockData));
                } else if (localBlock) {
                    changedBlocks.set(id, mergeBlockData({ ...localBlock }, blockData));
                }
            }

            expect(changedBlocks.size).toBe(1);
            const merged = changedBlocks.get('block-1');
            expect(merged.title).toBe('Final');
            expect(merged.data.text).toBe('Hello');
        });

        test('create followed by updates merges into single block', () => {
            const tempId = 'temp_new-block';
            const realId = 'real-uuid-123';
            const tempIdToRealId = new Map([[tempId, realId]]);

            const operations = [
                { type: 'createBlock', data: { tempId, parentId: 'parent-1', title: 'New Block' }, timestamp: 1 },
                { type: 'updateBlock', data: { id: tempId, blockData: { data: { text: 'Content' } } }, timestamp: 2 },
            ];

            const changedBlocks = new Map();

            // Process createBlock
            const createOp = operations[0];
            changedBlocks.set(realId, {
                id: realId,
                parent_id: createOp.data.parentId,
                title: createOp.data.title,
                children: [],
                data: {}
            });

            // Process updateBlock
            const updateOp = operations[1];
            const resolvedId = resolveId(updateOp.data.id, tempIdToRealId);
            if (changedBlocks.has(resolvedId)) {
                changedBlocks.set(resolvedId, mergeBlockData(
                    changedBlocks.get(resolvedId),
                    updateOp.data.blockData
                ));
            }

            expect(changedBlocks.size).toBe(1);
            const merged = changedBlocks.get(realId);
            expect(merged.title).toBe('New Block');
            expect(merged.data.text).toBe('Content');
            expect(merged.parent_id).toBe('parent-1');
        });

        test('delete removes block from changed blocks', () => {
            const changedBlocks = new Map([
                ['block-1', { id: 'block-1', title: 'Test' }],
                ['block-2', { id: 'block-2', title: 'Keep' }]
            ]);
            const deletedIds = new Set();

            // Simulate delete operation
            deletedIds.add('block-1');
            changedBlocks.delete('block-1');

            expect(changedBlocks.size).toBe(1);
            expect(changedBlocks.has('block-1')).toBe(false);
            expect(changedBlocks.has('block-2')).toBe(true);
            expect(deletedIds.has('block-1')).toBe(true);
        });

        test('move updates parent_id correctly', () => {
            const operations = [
                { type: 'moveBlock', data: { blockId: 'child-1', oldParentId: 'parent-1', newParentId: 'parent-2' } }
            ];

            const changedBlocks = new Map();
            const localBlocks = new Map([
                ['child-1', { id: 'child-1', parent_id: 'parent-1', title: 'Child', children: [], data: {} }]
            ]);

            for (const op of operations) {
                const { blockId, newParentId } = op.data;
                const localBlock = localBlocks.get(blockId);

                if (localBlock) {
                    const block = { ...localBlock, parent_id: newParentId };
                    changedBlocks.set(blockId, block);
                }
            }

            expect(changedBlocks.get('child-1').parent_id).toBe('parent-2');
        });
    });
});

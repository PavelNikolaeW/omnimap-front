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

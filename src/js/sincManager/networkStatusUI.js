import { offlineQueue } from './offlineQueue.js';

/**
 * UI компонент для отображения статуса сети
 */
class NetworkStatusUI {
    constructor() {
        this.element = null;
        this.offlineBar = null;
        this.hideTimeout = null;
        this.isOffline = !navigator.onLine;
        this.pendingCount = 0;
        this.init();
    }

    init() {
        this.createElement();
        this.createOfflineBar();
        this.addEventListeners();

        // Проверяем начальное состояние
        if (!navigator.onLine) {
            this.showOfflineBar();
        }
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

    /**
     * Создаёт постоянный индикатор офлайн режима
     */
    createOfflineBar() {
        this.offlineBar = document.createElement('div');
        this.offlineBar.className = 'offline-indicator-bar';
        this.offlineBar.innerHTML = `
            <i class="fas fa-wifi-slash"></i>
            <span class="offline-text">Нет подключения к сети</span>
            <span class="pending-count" style="display: none;"></span>
        `;
        document.body.appendChild(this.offlineBar);
    }

    addEventListeners() {
        window.addEventListener('NetworkStatusChange', (e) => {
            this.handleNetworkChange(e.detail.online);
        });

        // Синхронизация теперь показывается морганием API диода,
        // показываем network-status только при ошибках
        window.addEventListener('SyncCompleted', (e) => {
            // Показываем только ошибки синхронизации
            if (e.detail.failedCount > 0) {
                this.showSyncCompleted(e.detail);
            } else {
                this.hide();
            }
        });

        window.addEventListener('WebSocketDisconnected', (e) => {
            this.showWebSocketError(e.detail);
        });

        // Обновляем счётчик при добавлении операций в очередь (для offline bar)
        window.addEventListener('OperationQueued', async () => {
            await this.refreshPendingCount();
        });
    }

    handleNetworkChange(isOnline) {
        this.isOffline = !isOnline;

        if (isOnline) {
            this.hideOfflineBar();
            this.showOnline();
        } else {
            this.showOfflineBar();
            this.showOffline();
        }
    }

    /**
     * Показывает постоянный индикатор офлайн режима
     */
    showOfflineBar() {
        if (this.offlineBar) {
            this.offlineBar.classList.add('visible');
            this.refreshPendingCount();
        }
    }

    /**
     * Скрывает индикатор офлайн режима
     */
    hideOfflineBar() {
        if (this.offlineBar) {
            this.offlineBar.classList.remove('visible');
        }
    }

    /**
     * Обновляет счётчик ожидающих операций
     */
    async refreshPendingCount() {
        try {
            this.pendingCount = await offlineQueue.getPendingCount();
            this.updatePendingCountDisplay();
        } catch (err) {
            console.warn('Failed to get pending count:', err);
        }
    }

    /**
     * Устанавливает количество ожидающих операций
     */
    updatePendingCount(count) {
        this.pendingCount = count;
        this.updatePendingCountDisplay();
    }

    /**
     * Обновляет отображение счётчика
     */
    updatePendingCountDisplay() {
        if (!this.offlineBar) return;

        const countEl = this.offlineBar.querySelector('.pending-count');
        if (countEl) {
            if (this.pendingCount > 0) {
                countEl.textContent = `${this.pendingCount} изменений ждут синхронизации`;
                countEl.style.display = 'inline';
            } else {
                countEl.style.display = 'none';
            }
        }
    }

    showOffline() {
        this.clearHideTimeout();
        this.element.className = 'network-status offline visible';
        this.setText('Нет подключения к сети');
        // Не скрываем автоматически при офлайне
    }

    showOnline() {
        this.element.className = 'network-status online visible';
        this.setText('Подключение восстановлено');
        this.scheduleHide(3000);
    }

    showSyncing(detail) {
        this.clearHideTimeout();
        this.element.className = 'network-status syncing visible';

        const pendingCount = detail.pendingCount || detail;
        const phase = detail.phase;
        const message = detail.message;

        if (message) {
            this.setText(message);
        } else if (phase === 'pull') {
            this.setText(`Получение обновлений...`);
        } else if (phase === 'push') {
            this.setText(`Отправка изменений... (${pendingCount})`);
        } else {
            this.setText(`Синхронизация... (${pendingCount})`);
        }

        this.updatePendingCount(pendingCount);
    }

    showSyncCompleted(detail) {
        const { failedCount, remainingCount } = detail;

        // Обновляем счётчик ожидающих
        this.updatePendingCount(remainingCount || 0);

        // Показываем уведомление только при ошибках
        if (failedCount > 0) {
            this.element.className = 'network-status syncing visible';
            this.setText(`Ошибка синхронизации: ${failedCount}`);
            this.scheduleHide(5000);
        } else {
            // Успешная синхронизация - просто скрываем
            this.hide();
        }
    }

    setText(text) {
        const textEl = this.element.querySelector('.network-status-text');
        if (textEl) {
            textEl.textContent = text;
        }
    }

    scheduleHide(delay) {
        this.clearHideTimeout();
        this.hideTimeout = setTimeout(() => {
            this.hide();
        }, delay);
    }

    clearHideTimeout() {
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }
    }

    showWebSocketError(detail) {
        this.clearHideTimeout();
        this.element.className = 'network-status offline visible';
        if (detail?.reason === 'max_attempts') {
            this.setText('Не удалось подключиться к серверу');
        } else {
            this.setText('Соединение потеряно');
        }
    }

    hide() {
        this.element.classList.remove('visible');
    }

    show() {
        this.element.classList.add('visible');
    }

    /**
     * Проверяет, находимся ли в офлайн режиме
     */
    isCurrentlyOffline() {
        return this.isOffline;
    }

    /**
     * Возвращает количество ожидающих операций
     */
    getPendingCount() {
        return this.pendingCount;
    }
}

// Экспортируем singleton
export const networkStatusUI = new NetworkStatusUI();

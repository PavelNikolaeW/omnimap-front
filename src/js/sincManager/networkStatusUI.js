/**
 * UI компонент для отображения статуса сети
 */
class NetworkStatusUI {
    constructor() {
        this.element = null;
        this.hideTimeout = null;
        this.init();
    }

    init() {
        this.createElement();
        this.addEventListeners();
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

    addEventListeners() {
        window.addEventListener('NetworkStatusChange', (e) => {
            this.handleNetworkChange(e.detail.online);
        });

        window.addEventListener('SyncStarted', (e) => {
            this.showSyncing(e.detail.pendingCount);
        });

        window.addEventListener('SyncCompleted', (e) => {
            this.showSyncCompleted(e.detail);
        });
    }

    handleNetworkChange(isOnline) {
        if (isOnline) {
            this.showOnline();
        } else {
            this.showOffline();
        }
    }

    showOffline() {
        this.clearHideTimeout();
        this.element.className = 'network-status offline visible';
        this.setText('Нет подключения к сети');
    }

    showOnline() {
        this.element.className = 'network-status online visible';
        this.setText('Подключение восстановлено');
        this.scheduleHide(3000);
    }

    showSyncing(pendingCount) {
        this.clearHideTimeout();
        this.element.className = 'network-status syncing visible';
        this.setText(`Синхронизация... (${pendingCount})`);
    }

    showSyncCompleted(detail) {
        const { successCount, failedCount } = detail;

        if (failedCount > 0) {
            this.element.className = 'network-status syncing visible';
            this.setText(`Синхронизировано: ${successCount}, ошибок: ${failedCount}`);
            this.scheduleHide(5000);
        } else if (successCount > 0) {
            this.element.className = 'network-status online visible';
            this.setText(`Синхронизировано: ${successCount}`);
            this.scheduleHide(3000);
        } else {
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

    hide() {
        this.element.classList.remove('visible');
    }

    show() {
        this.element.classList.add('visible');
    }
}

// Экспортируем singleton
export const networkStatusUI = new NetworkStatusUI();

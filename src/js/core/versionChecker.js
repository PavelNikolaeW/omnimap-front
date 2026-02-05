/**
 * Проверка версии приложения и принудительное обновление
 * Решает проблему агрессивного кэширования на мобильных устройствах
 */

const CHECK_INTERVAL = 5 * 60 * 1000; // Проверять каждые 5 минут
const VERSION_STORAGE_KEY = 'omnimap_app_version';
const LAST_CHECK_KEY = 'omnimap_last_version_check';

class VersionChecker {
    constructor() {
        this.currentVersion = APP_VERSION || 'unknown';
        this.checkTimer = null;
        this.isChecking = false;
        this._isUpdating = false; // Защита от concurrent вызовов forceUpdate()
        // Сохраняем ссылки на обработчики для cleanup
        this._onOnline = null;
        this._onVisibilityChange = null;
        // Event listeners для scheduleUpdateAfterSync
        this._syncCompletedHandler = null;
        this._syncCompletedTimeout = null;
    }

    /**
     * Запускает периодическую проверку версии
     */
    start() {
        console.log('[VersionChecker] Starting version checker, current version:', this.currentVersion);

        // Проверяем URL параметр для принудительного обновления
        // Если обнаружен - выходим, т.к. будет redirect
        if (this.checkForceUpdateParam()) {
            return;
        }

        // Сохраняем текущую версию при первом запуске
        this.saveCurrentVersion();

        // Проверяем сразу при старте (если прошло достаточно времени)
        this.checkNow();

        // Запускаем периодическую проверку
        this.checkTimer = setInterval(() => {
            this.checkNow();
        }, CHECK_INTERVAL);

        // Проверяем при восстановлении соединения
        this._onOnline = () => {
            console.log('[VersionChecker] Network restored, checking for updates');
            this.checkNow();
        };
        window.addEventListener('online', this._onOnline);

        // Проверяем когда окно снова становится активным
        this._onVisibilityChange = () => {
            if (!document.hidden) {
                const lastCheck = localStorage.getItem(LAST_CHECK_KEY);
                const timeSinceLastCheck = Date.now() - (parseInt(lastCheck) || 0);

                // Если прошло больше 1 минуты - проверяем
                if (timeSinceLastCheck > 60 * 1000) {
                    console.log('[VersionChecker] App became visible, checking for updates');
                    this.checkNow();
                }
            }
        };
        document.addEventListener('visibilitychange', this._onVisibilityChange);
    }

    /**
     * Останавливает проверку версии и очищает все обработчики
     */
    stop() {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }

        // Очищаем event listeners
        if (this._onOnline) {
            window.removeEventListener('online', this._onOnline);
            this._onOnline = null;
        }
        if (this._onVisibilityChange) {
            document.removeEventListener('visibilitychange', this._onVisibilityChange);
            this._onVisibilityChange = null;
        }

        // Очищаем scheduleUpdateAfterSync handlers
        if (this._syncCompletedHandler) {
            window.removeEventListener('SyncCompleted', this._syncCompletedHandler);
            this._syncCompletedHandler = null;
        }
        if (this._syncCompletedTimeout) {
            clearTimeout(this._syncCompletedTimeout);
            this._syncCompletedTimeout = null;
        }
    }

    /**
     * Сохраняет текущую версию в localStorage
     */
    saveCurrentVersion() {
        try {
            localStorage.setItem(VERSION_STORAGE_KEY, this.currentVersion);
        } catch (e) {
            console.warn('[VersionChecker] Failed to save version:', e);
        }
    }

    /**
     * Проверяет версию сейчас
     */
    async checkNow() {
        if (this.isChecking) {
            return;
        }

        this.isChecking = true;

        try {
            const hasUpdate = await this.checkForUpdate();

            if (hasUpdate) {
                this.showUpdateNotification();
            }

            // Сохраняем время последней проверки
            localStorage.setItem(LAST_CHECK_KEY, Date.now().toString());
        } catch (error) {
            console.warn('[VersionChecker] Version check failed:', error);
        } finally {
            this.isChecking = false;
        }
    }

    /**
     * Проверяет URL параметры для принудительного обновления
     * Использование: добавьте ?forceUpdate=1 к URL
     * @returns {boolean} true если обнаружен параметр и начато обновление
     */
    checkForceUpdateParam() {
        const urlParams = new URLSearchParams(window.location.search);

        // Очищаем служебные параметры (_reload, _t) оставшиеся после предыдущих обновлений
        if (urlParams.has('_reload') || urlParams.has('_t')) {
            urlParams.delete('_reload');
            urlParams.delete('_t');
            const cleanUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
            window.history.replaceState({}, '', cleanUrl);
        }

        if (urlParams.get('forceUpdate') === '1') {
            // Защита от бесконечного цикла используя localStorage (надежнее sessionStorage)
            const updateAttempts = parseInt(localStorage.getItem('forceUpdateAttempts') || '0');
            const lastUpdateTimestamp = parseInt(localStorage.getItem('forceUpdateTimestamp') || '0');
            const now = Date.now();

            // Сбрасываем счетчик если прошло больше 5 минут с последней попытки
            if (now - lastUpdateTimestamp > 5 * 60 * 1000) {
                localStorage.setItem('forceUpdateAttempts', '0');
                localStorage.setItem('forceUpdateTimestamp', now.toString());
            }

            const currentAttempts = parseInt(localStorage.getItem('forceUpdateAttempts') || '0');
            if (currentAttempts >= 3) {
                console.warn('[VersionChecker] Too many force update attempts, aborting');
                localStorage.removeItem('forceUpdateAttempts');
                localStorage.removeItem('forceUpdateTimestamp');
                return false;
            }

            console.log('[VersionChecker] Force update parameter detected');

            // Инкрементируем счетчик ПЕРЕД вызовом forceUpdate()
            localStorage.setItem('forceUpdateAttempts', (currentAttempts + 1).toString());
            localStorage.setItem('forceUpdateTimestamp', now.toString());

            // Удаляем параметр из URL
            urlParams.delete('forceUpdate');
            const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
            window.history.replaceState({}, '', newUrl);
            // Принудительно обновляем
            this.forceUpdate();
            return true;
        } else {
            // Успешная загрузка без forceUpdate параметра - сбрасываем счетчик
            const lastUpdateTimestamp = parseInt(localStorage.getItem('forceUpdateTimestamp') || '0');
            const now = Date.now();
            // Сбрасываем только если прошло достаточно времени (30 сек) после последнего обновления
            if (now - lastUpdateTimestamp > 30 * 1000) {
                localStorage.removeItem('forceUpdateAttempts');
                localStorage.removeItem('forceUpdateTimestamp');
            }
            return false;
        }
    }

    /**
     * Проверяет, есть ли новая версия
     * Делает запрос к index.html и проверяет версию в мета-теге или через Service Worker
     */
    async checkForUpdate() {
        try {
            // КРИТИЧНО: добавляем timestamp чтобы минуя Service Worker и браузерный кеш
            const cacheBuster = `_v=${Date.now()}`;

            // Запрашиваем index.html с принудительным обновлением (bypass cache)
            const response = await fetch(`/?${cacheBuster}`, {
                method: 'GET',
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const html = await response.text();

            // Парсим версию из мета-тега (надежнее чем regex по JS коду)
            const versionMatch = html.match(/<meta\s+name="app-version"\s+content="([^"]+)"/i);

            if (versionMatch) {
                const serverVersion = versionMatch[1];

                if (serverVersion !== this.currentVersion && serverVersion !== 'dev') {
                    console.log('[VersionChecker] New version detected:', serverVersion, 'current:', this.currentVersion);
                    return true;
                }
            } else {
                console.warn('[VersionChecker] Could not parse version from HTML meta tag');
            }

            // Дополнительно проверяем Service Worker
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                const registration = await navigator.serviceWorker.getRegistration();
                if (registration && registration.waiting) {
                    console.log('[VersionChecker] Service Worker has an update waiting');
                    return true;
                }
            }

            return false;
        } catch (error) {
            console.warn('[VersionChecker] Failed to check version:', error);
            return false;
        }
    }

    /**
     * Показывает уведомление об обновлении
     */
    showUpdateNotification() {
        // Проверяем, не показывали ли мы уже уведомление недавно
        const lastNotification = sessionStorage.getItem('update_notification_shown');
        if (lastNotification) {
            const timeSinceNotification = Date.now() - parseInt(lastNotification);
            if (timeSinceNotification < 60000) { // Не показывать чаще раза в минуту
                return;
            }
        }

        const notification = document.createElement('div');
        notification.id = 'version-update-notification';
        notification.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: #4CAF50;
                color: white;
                padding: 16px 24px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 100000;
                max-width: 350px;
                font-family: Arial, sans-serif;
                font-size: 14px;
                animation: slideIn 0.3s ease-out;
            ">
                <div style="font-weight: bold; margin-bottom: 8px;">
                    🎉 Доступна новая версия!
                </div>
                <div style="margin-bottom: 12px; font-size: 13px;">
                    Для применения обновлений необходимо перезагрузить страницу
                </div>
                <div style="display: flex; gap: 8px;">
                    <button id="update-now-btn" style="
                        background: white;
                        color: #4CAF50;
                        border: none;
                        padding: 8px 16px;
                        border-radius: 4px;
                        font-weight: bold;
                        cursor: pointer;
                        flex: 1;
                    ">
                        Обновить сейчас
                    </button>
                    <button id="update-later-btn" style="
                        background: transparent;
                        color: white;
                        border: 1px solid white;
                        padding: 8px 16px;
                        border-radius: 4px;
                        cursor: pointer;
                        flex: 1;
                    ">
                        Позже
                    </button>
                </div>
            </div>
            <style>
                @keyframes slideIn {
                    from {
                        transform: translateX(400px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            </style>
        `;

        document.body.appendChild(notification);
        sessionStorage.setItem('update_notification_shown', Date.now().toString());

        // Обработчик кнопки "Обновить сейчас"
        document.getElementById('update-now-btn').addEventListener('click', () => {
            this.forceUpdate();
        });

        // Обработчик кнопки "Позже"
        document.getElementById('update-later-btn').addEventListener('click', () => {
            notification.remove();
        });

        // Автоматически скрываем через 30 секунд
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.transition = 'opacity 0.3s';
                notification.style.opacity = '0';
                setTimeout(() => notification.remove(), 300);
            }
        }, 30000);
    }

    /**
     * Принудительно обновляет приложение
     * КРИТИЧНО: Проверяет pending операции перед обновлением чтобы не потерять данные
     */
    async forceUpdate() {
        // Защита от concurrent вызовов
        if (this._isUpdating) {
            console.warn('[VersionChecker] Force update already in progress, ignoring');
            return;
        }

        this._isUpdating = true;
        console.log('[VersionChecker] Forcing update...');

        try {
            // КРИТИЧНО: Проверяем pending операции перед обновлением
            // Если есть несинхронизированные изменения - предупреждаем пользователя
            const hasPendingOperations = await this.checkPendingOperations();
            if (hasPendingOperations) {
                console.warn('[VersionChecker] Pending operations detected, waiting for sync...');

                // Показываем уведомление пользователю
                const shouldProceed = confirm(
                    'У вас есть несохранённые изменения, которые ещё синхронизируются с сервером.\n\n' +
                    'Рекомендуется дождаться завершения синхронизации перед обновлением.\n\n' +
                    'Обновить сейчас? (НЕ рекомендуется, можете потерять данные)'
                );

                if (!shouldProceed) {
                    console.log('[VersionChecker] Update cancelled by user, waiting for sync completion');
                    // Запускаем синхронизацию и повторяем попытку после завершения
                    this.scheduleUpdateAfterSync();
                    return;
                }
                // Пользователь подтвердил принудительное обновление несмотря на риск
                console.warn('[VersionChecker] User confirmed force update despite pending operations');
            }

            // Шаг 1: Очищаем все кеши ПЕРЕД активацией нового SW
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                console.log('[VersionChecker] Clearing caches:', cacheNames);
                await Promise.all(cacheNames.map(name => caches.delete(name)));
                console.log('[VersionChecker] All caches cleared');
            }

            // Шаг 2: Если есть Service Worker - активируем ожидающий
            if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.getRegistration();

                // Отменяем регистрацию старого SW для принудительного обновления
                if (registration) {
                    console.log('[VersionChecker] Unregistering old service worker...');
                    await registration.unregister();
                    console.log('[VersionChecker] Service worker unregistered');
                }
            }

            // Шаг 3: Hard reload с cache bypass
            // Примечание: инкремент счетчика попыток происходит в checkForceUpdateParam()
            // или в showUpdateNotification() ПЕРЕД вызовом forceUpdate()
            console.log('[VersionChecker] Performing hard reload...');

            // Для мобильных браузеров - используем location.replace с timestamp
            const timestamp = Date.now();
            window.location.replace(`${window.location.pathname}?_reload=${timestamp}`);

        } catch (error) {
            console.error('[VersionChecker] Force update failed:', error);
            // Fallback: просто перезагружаем
            window.location.reload();
        } finally {
            // Сбрасываем флаг если reload не произошёл (например, при раннем return)
            // Если reload произошёл - страница уже перезагрузилась и этот код не выполнится
            this._isUpdating = false;
        }
    }

    /**
     * Проверяет наличие pending операций в offlineQueue
     * @returns {Promise<boolean>}
     */
    async checkPendingOperations() {
        try {
            // Динамический импорт offlineQueue чтобы избежать circular dependency
            const { offlineQueue } = await import('../sincManager/offlineQueue.js');
            const pendingCount = await offlineQueue.getPendingCount();
            console.log(`[VersionChecker] Pending operations: ${pendingCount}`);
            return pendingCount > 0;
        } catch (error) {
            console.warn('[VersionChecker] Failed to check pending operations:', error);
            // Если не можем проверить - предполагаем что есть pending операции (безопаснее)
            return true;
        }
    }

    /**
     * Планирует обновление после завершения синхронизации
     */
    scheduleUpdateAfterSync() {
        console.log('[VersionChecker] Scheduling update after sync completion');

        // Очищаем предыдущий handler если был (защита от множественных вызовов)
        if (this._syncCompletedHandler) {
            window.removeEventListener('SyncCompleted', this._syncCompletedHandler);
            this._syncCompletedHandler = null;
        }
        if (this._syncCompletedTimeout) {
            clearTimeout(this._syncCompletedTimeout);
            this._syncCompletedTimeout = null;
        }

        // Слушаем событие завершения синхронизации
        this._syncCompletedHandler = async (e) => {
            const { remainingCount } = e.detail || {};

            // Если синхронизация завершилась успешно (remainingCount === 0)
            if (remainingCount === 0) {
                console.log('[VersionChecker] Sync completed, proceeding with update');
                window.removeEventListener('SyncCompleted', this._syncCompletedHandler);
                this._syncCompletedHandler = null;

                if (this._syncCompletedTimeout) {
                    clearTimeout(this._syncCompletedTimeout);
                    this._syncCompletedTimeout = null;
                }

                // Небольшая задержка чтобы пользователь увидел что синхронизация завершена
                setTimeout(() => {
                    this.forceUpdate();
                }, 1000);
            }
        };

        window.addEventListener('SyncCompleted', this._syncCompletedHandler);

        // Таймаут на случай если синхронизация зависла (5 минут)
        this._syncCompletedTimeout = setTimeout(() => {
            if (this._syncCompletedHandler) {
                window.removeEventListener('SyncCompleted', this._syncCompletedHandler);
                this._syncCompletedHandler = null;
            }
            this._syncCompletedTimeout = null;
            console.warn('[VersionChecker] Sync timeout, cancelling scheduled update');
        }, 5 * 60 * 1000);

        // Запускаем синхронизацию вручную если она не идёт
        import('../sincManager/offlineQueue.js').then(({ offlineQueue }) => {
            if (!offlineQueue.isSyncing) {
                console.log('[VersionChecker] Triggering manual sync before update');
                window.dispatchEvent(new CustomEvent('RetrySync'));
            }
        }).catch(error => {
            console.error('[VersionChecker] Failed to trigger sync:', error);
        });
    }
}

// Экспортируем singleton
export const versionChecker = new VersionChecker();

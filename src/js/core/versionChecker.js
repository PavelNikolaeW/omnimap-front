/**
 * Проверка версии приложения и принудительное обновление
 * Решает проблему агрессивного кэширования на мобильных устройствах
 */

const CHECK_INTERVAL = 5 * 60 * 1000; // Проверять каждые 5 минут
const VERSION_STORAGE_KEY = 'omnimap_app_version';
const LAST_CHECK_KEY = 'omnimap_last_version_check';
const FORCE_UPDATE_TIMESTAMP_KEY = 'forceUpdateTimestamp';
const FORCE_UPDATE_SETTLE_WINDOW_MS = 2 * 60 * 1000;
const FORCE_UPDATE_WATCHDOG_TIMEOUT_MS = 15 * 1000;
const SW_ACTIVATION_TIMEOUT = 4000;
const OFFLINE_QUEUE_IMPORT_TIMEOUT_MS = 4000;
const PENDING_COUNT_TIMEOUT_MS = 4000;
const DYNAMIC_IMPORT_FAILURE_PATTERNS = [
    'loading chunk',
    'failed to fetch dynamically imported module',
    'error loading dynamically imported module',
    'importing a module script failed',
];

class VersionChecker {
    constructor() {
        const metaVersion = document
            .querySelector('meta[name="app-version"]')
            ?.getAttribute('content');
        this.currentVersion = metaVersion || APP_VERSION || 'unknown';
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
     * Обёртка для async операций с таймаутом
     * @template T
     * @param {Promise<T>} promise
     * @param {number} timeoutMs
     * @param {string} timeoutMessage
     * @returns {Promise<T>}
     */
    withTimeout(promise, timeoutMs, timeoutMessage) {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error(timeoutMessage));
            }, timeoutMs);
        });

        return Promise.race([promise, timeoutPromise]).finally(() => {
            clearTimeout(timeoutId);
        });
    }

    /**
     * Проверяет, была ли недавно попытка принудительного обновления
     * @returns {boolean}
     */
    hasRecentForceUpdateAttempt() {
        const lastAttempt = parseInt(localStorage.getItem(FORCE_UPDATE_TIMESTAMP_KEY) || '0', 10);
        return lastAttempt > 0 && (Date.now() - lastAttempt) < FORCE_UPDATE_SETTLE_WINDOW_MS;
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
        const url = new URL(window.location.href);
        const queryParams = url.searchParams;

        const rawHash = window.location.hash.startsWith('#')
            ? window.location.hash.slice(1)
            : '';
        const hashParams = rawHash.includes('=') ? new URLSearchParams(rawHash) : null;

        const hasForceUpdateInQuery = queryParams.get('forceUpdate') === '1';
        const hasForceUpdateInHash = hashParams?.get('forceUpdate') === '1';
        const hasForceUpdate = hasForceUpdateInQuery || hasForceUpdateInHash;

        let shouldReplaceUrl = false;

        // Очищаем служебные параметры (_reload, _t) оставшиеся после предыдущих обновлений
        if (queryParams.has('_reload') || queryParams.has('_t')) {
            queryParams.delete('_reload');
            queryParams.delete('_t');
            shouldReplaceUrl = true;
        }
        if (hashParams && (hashParams.has('_reload') || hashParams.has('_t'))) {
            hashParams.delete('_reload');
            hashParams.delete('_t');
            shouldReplaceUrl = true;
        }

        if (hasForceUpdate) {
            // Параметр forceUpdate=1 означает что ранее был выполнен hard update
            // Очистка кешей и SW уже произошла, просто убираем параметр из URL
            console.log('[VersionChecker] Force update completed, cleaning URL');

            queryParams.delete('forceUpdate');
            if (hashParams) {
                hashParams.delete('forceUpdate');
            }
            shouldReplaceUrl = true;
        }

        if (shouldReplaceUrl) {
            const nextSearch = queryParams.toString();
            const nextHash = hashParams
                ? (hashParams.toString() ? `#${hashParams.toString()}` : '')
                : window.location.hash;
            const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${nextHash}`;
            window.history.replaceState({}, '', nextUrl);
        }

        if (hasForceUpdate) {
            // Сохраняем текущую версию
            this.saveCurrentVersion();
            localStorage.setItem(FORCE_UPDATE_TIMESTAMP_KEY, Date.now().toString());
            return true;
        }

        // Успешная загрузка без forceUpdate параметра - сбрасываем счетчик
        const lastUpdateTimestamp = parseInt(localStorage.getItem(FORCE_UPDATE_TIMESTAMP_KEY) || '0', 10);
        const now = Date.now();
        // Сбрасываем только после settle-window, чтобы не спровоцировать цикл уведомлений.
        if (now - lastUpdateTimestamp > FORCE_UPDATE_SETTLE_WINDOW_MS) {
            localStorage.removeItem('forceUpdateAttempts');
            localStorage.removeItem(FORCE_UPDATE_TIMESTAMP_KEY);
        }
        return false;
    }

    /**
     * Проверяет, есть ли новая версия
     * Делает запрос к index.html и проверяет версию в мета-теге или через Service Worker
     */
    async checkForUpdate() {
        try {
            // После клика "Обновить сейчас" даём странице "устаканиться", чтобы не попасть в цикл.
            if (this.hasRecentForceUpdateAttempt()) {
                console.log('[VersionChecker] Skipping version check during post-update settle window');
                return false;
            }

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
        if (this._isUpdating) {
            console.log('[VersionChecker] Update is already in progress, skipping notification');
            return;
        }

        if (this.hasRecentForceUpdateAttempt()) {
            console.log('[VersionChecker] Notification suppressed during post-update settle window');
            return;
        }

        // Проверяем, не показывали ли мы уже уведомление недавно
        const lastNotification = sessionStorage.getItem('update_notification_shown');
        if (lastNotification) {
            const timeSinceNotification = Date.now() - parseInt(lastNotification);
            if (timeSinceNotification < 60000) { // Не показывать чаще раза в минуту
                console.log('[VersionChecker] Notification shown recently, skipping');
                return;
            }
        }

        // Проверяем, не показано ли уже уведомление на экране
        const existingNotification = document.getElementById('version-update-notification');
        if (existingNotification) {
            console.log('[VersionChecker] Notification already visible, skipping');
            return;
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
        const updateNowBtn = notification.querySelector('#update-now-btn');
        const updateLaterBtn = notification.querySelector('#update-later-btn');
        if (!updateNowBtn || !updateLaterBtn) {
            console.error('[VersionChecker] Failed to bind update notification buttons');
            return;
        }

        updateNowBtn.addEventListener('click', async () => {
            if (updateNowBtn.disabled) {
                return;
            }

            try {
                localStorage.setItem(FORCE_UPDATE_TIMESTAMP_KEY, Date.now().toString());
            } catch (e) {
                console.warn('[VersionChecker] Failed to mark force update attempt:', e);
            }

            // Визуальный фидбек, чтобы клик не выглядел как "ничего не произошло"
            const initialNowLabel = updateNowBtn.textContent;
            updateNowBtn.disabled = true;
            updateNowBtn.textContent = 'Обновляем...';
            updateNowBtn.style.cursor = 'wait';
            updateNowBtn.style.opacity = '0.85';

            updateLaterBtn.disabled = true;
            updateLaterBtn.style.cursor = 'not-allowed';
            updateLaterBtn.style.opacity = '0.65';

            await this.forceUpdate();

            // Если перезагрузки не было (например, пользователь отменил второй confirm),
            // возвращаем кнопки в активное состояние.
            if (notification.parentNode && !this._isUpdating) {
                updateNowBtn.disabled = false;
                updateNowBtn.textContent = initialNowLabel;
                updateNowBtn.style.cursor = 'pointer';
                updateNowBtn.style.opacity = '1';

                updateLaterBtn.disabled = false;
                updateLaterBtn.style.cursor = 'pointer';
                updateLaterBtn.style.opacity = '1';
            }
        });

        // Обработчик кнопки "Позже"
        updateLaterBtn.addEventListener('click', () => {
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
        let watchdogTimer = null;

        try {
            try {
                localStorage.setItem(FORCE_UPDATE_TIMESTAMP_KEY, Date.now().toString());
            } catch (e) {
                console.warn('[VersionChecker] Failed to persist force update timestamp:', e);
            }

            // Watchdog: если какой-то шаг завис, уходим на dedicated страницу force update.
            watchdogTimer = setTimeout(() => {
                if (!this._isUpdating) {
                    return;
                }

                console.warn('[VersionChecker] Force update watchdog timeout, redirecting to force-update page');
                this.redirectToForceUpdatePage();
            }, FORCE_UPDATE_WATCHDOG_TIMEOUT_MS);

            // КРИТИЧНО: Проверяем pending операции перед обновлением
            // Если есть несинхронизированные изменения - предупреждаем пользователя
            const hasPendingOperations = await this.withTimeout(
                this.checkPendingOperations(),
                OFFLINE_QUEUE_IMPORT_TIMEOUT_MS + PENDING_COUNT_TIMEOUT_MS + 1000,
                'Pending operations check timeout'
            );
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

            // Сначала пробуем "мягкое" обновление через активацию waiting Service Worker
            // Это быстрее и не требует полной очистки кэшей.
            const fastUpdateSucceeded = await this.tryActivateWaitingServiceWorker();
            if (fastUpdateSucceeded) {
                console.log('[VersionChecker] Waiting Service Worker activated, reloading app');
                this.redirectToApp(false);
                return;
            }

            // Fallback: full reset (очистка cache storage + unregister SW + cache-busted reload)
            console.log('[VersionChecker] Waiting SW not available, running hard update');
            await this.runHardUpdateReset();
            this.redirectToApp(true);

        } catch (error) {
            console.error('[VersionChecker] Force update failed:', error);
            // Последний fallback: отдельная страница принудительного обновления
            // (на случай если обновление из текущего контекста не удалось)
            this.redirectToForceUpdatePage();
        } finally {
            if (watchdogTimer) {
                clearTimeout(watchdogTimer);
                watchdogTimer = null;
            }
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
            const { offlineQueue } = await this.withTimeout(
                import('../sincManager/offlineQueue.js'),
                OFFLINE_QUEUE_IMPORT_TIMEOUT_MS,
                'Offline queue import timeout'
            );
            const pendingCount = await this.withTimeout(
                offlineQueue.getPendingCount(),
                PENDING_COUNT_TIMEOUT_MS,
                'Pending operations timeout'
            );
            console.log(`[VersionChecker] Pending operations: ${pendingCount}`);
            return pendingCount > 0;
        } catch (error) {
            console.warn('[VersionChecker] Failed to check pending operations:', error);
            // После деплоя старая вкладка может не загрузить динамический chunk.
            // В таком случае не блокируем обновление, иначе кнопка выглядит "сломанной".
            const message = (error?.message || '').toLowerCase();
            const isDynamicImportFailure = DYNAMIC_IMPORT_FAILURE_PATTERNS.some(pattern => message.includes(pattern));

            if (isDynamicImportFailure) {
                console.warn('[VersionChecker] Pending check skipped due stale chunks, proceeding with update');
            } else {
                console.warn('[VersionChecker] Pending check unavailable, proceeding with update to avoid blocked flow');
            }

            return false;
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

    /**
     * Пытается активировать waiting Service Worker (если он есть)
     * @returns {Promise<boolean>} true если активация прошла успешно
     */
    async tryActivateWaitingServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            return false;
        }

        try {
            const registration = await navigator.serviceWorker.getRegistration();
            if (!registration) {
                return false;
            }

            // Проверяем обновления перед попыткой активации
            await registration.update().catch(() => {});

            let waitingWorker = registration.waiting;
            if (!waitingWorker) {
                return false;
            }

            console.log('[VersionChecker] Activating waiting Service Worker...');
            const didControllerChange = await new Promise(resolve => {
                const onControllerChange = () => {
                    cleanup();
                    resolve(true);
                };

                const timeoutId = setTimeout(() => {
                    cleanup();
                    resolve(false);
                }, SW_ACTIVATION_TIMEOUT);

                const cleanup = () => {
                    clearTimeout(timeoutId);
                    navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
                };

                navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
                waitingWorker.postMessage({ type: 'SKIP_WAITING' });
            });

            return didControllerChange;
        } catch (error) {
            console.warn('[VersionChecker] Failed to activate waiting SW:', error);
            return false;
        }
    }

    /**
     * Полный сброс клиентского кэша и Service Worker
     */
    async runHardUpdateReset() {
        // Очищаем CacheStorage
        if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
            console.log('[VersionChecker] Cache storage cleared:', cacheNames.length);
        }

        // Удаляем все Service Worker регистрации
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(registration => registration.unregister()));
            console.log('[VersionChecker] Service workers unregistered:', registrations.length);
        }

        // Сбрасываем служебные ключи версионирования
        localStorage.removeItem(VERSION_STORAGE_KEY);
        localStorage.removeItem(LAST_CHECK_KEY);
        localStorage.setItem(FORCE_UPDATE_TIMESTAMP_KEY, Date.now().toString());
    }

    /**
     * Переход на dedicated страницу принудительного обновления
     */
    redirectToForceUpdatePage() {
        const timestamp = Date.now();
        window.location.href = `/force-update.html?_t=${timestamp}`;
    }

    /**
     * Переход в приложение с cache buster параметрами
     * @param {boolean} withForceParam - добавить forceUpdate=1 в URL
     */
    redirectToApp(withForceParam = false) {
        const timestamp = Date.now();
        const nextUrl = new URL(window.location.origin + '/');

        if (withForceParam) {
            nextUrl.searchParams.set('forceUpdate', '1');
        }
        nextUrl.searchParams.set('_t', timestamp.toString());
        nextUrl.searchParams.set('_reload', '1');

        // КРИТИЧНО: используем query-параметры, а не hash.
        // Hash-only навигация может не перезагрузить документ (особенно на мобильных браузерах),
        // из-за чего кнопка "Обновить сейчас" выглядит как неработающая.
        window.location.replace(nextUrl.toString());
    }
}

// Экспортируем singleton
export const versionChecker = new VersionChecker();

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
    }

    /**
     * Запускает периодическую проверку версии
     */
    start() {
        console.log('[VersionChecker] Starting version checker, current version:', this.currentVersion);

        // Сохраняем текущую версию при первом запуске
        this.saveCurrentVersion();

        // Проверяем сразу при старте (если прошло достаточно времени)
        this.checkNow();

        // Запускаем периодическую проверку
        this.checkTimer = setInterval(() => {
            this.checkNow();
        }, CHECK_INTERVAL);

        // Проверяем при восстановлении соединения
        window.addEventListener('online', () => {
            console.log('[VersionChecker] Network restored, checking for updates');
            this.checkNow();
        });

        // Проверяем когда окно снова становится активным
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                const lastCheck = localStorage.getItem(LAST_CHECK_KEY);
                const timeSinceLastCheck = Date.now() - (parseInt(lastCheck) || 0);

                // Если прошло больше 1 минуты - проверяем
                if (timeSinceLastCheck > 60 * 1000) {
                    console.log('[VersionChecker] App became visible, checking for updates');
                    this.checkNow();
                }
            }
        });
    }

    /**
     * Останавливает проверку версии
     */
    stop() {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
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
     * Проверяет, есть ли новая версия
     * Делает запрос к index.html и проверяет версию в мета-теге или через Service Worker
     */
    async checkForUpdate() {
        try {
            // Запрашиваем index.html с принудительным обновлением (bypass cache)
            const response = await fetch('/', {
                method: 'GET',
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const html = await response.text();

            // Парсим версию из HTML (ищем APP_VERSION в webpack-инжектированном коде)
            const versionMatch = html.match(/APP_VERSION:\s*JSON\.stringify\("([^"]+)"\)/);

            if (versionMatch) {
                const serverVersion = versionMatch[1];

                if (serverVersion !== this.currentVersion && serverVersion !== 'dev') {
                    console.log('[VersionChecker] New version detected:', serverVersion, 'current:', this.currentVersion);
                    return true;
                }
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
     */
    async forceUpdate() {
        console.log('[VersionChecker] Forcing update...');

        try {
            // Если есть Service Worker - активируем ожидающий
            if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.getRegistration();
                if (registration && registration.waiting) {
                    // Отправляем сообщение waiting SW для активации
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });

                    // Ждём активации и перезагружаем
                    navigator.serviceWorker.addEventListener('controllerchange', () => {
                        window.location.reload();
                    });
                    return;
                }
            }

            // Очищаем кэш и перезагружаем
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(name => caches.delete(name)));
                console.log('[VersionChecker] Caches cleared');
            }

            // Hard reload (минуя кэш)
            window.location.reload(true);
        } catch (error) {
            console.error('[VersionChecker] Force update failed:', error);
            // Просто перезагружаем
            window.location.reload();
        }
    }
}

// Экспортируем singleton
export const versionChecker = new VersionChecker();

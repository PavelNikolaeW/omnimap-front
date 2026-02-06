/**
 * Утилита для управления кэшем в dev режиме
 * Помогает избежать проблем с устаревшим кэшем при разработке
 */

/**
 * Ключ для хранения версии сборки в localStorage
 */
const BUILD_VERSION_KEY = '__omnimap_build_version__';

/**
 * Получает версию текущей сборки
 * В dev режиме используем timestamp, в production - contenthash из webpack
 */
function getBuildVersion() {
    // В dev режиме webpack добавляет fullhash в имена файлов
    // Мы можем использовать время загрузки скрипта как уникальный идентификатор
    const scripts = document.getElementsByTagName('script');
    for (const script of scripts) {
        const src = script.src || '';
        // Ищем main bundle с hash в имени
        const match = src.match(/main\.([a-f0-9]+)\.bundle\.js/);
        if (match) {
            return match[1];
        }
    }
    // Fallback - используем время загрузки
    return Date.now().toString();
}

/**
 * Проверяет, изменилась ли версия сборки
 * @returns {boolean} true если версия изменилась
 */
function hasVersionChanged() {
    const currentVersion = getBuildVersion();
    const storedVersion = localStorage.getItem(BUILD_VERSION_KEY);

    if (!storedVersion) {
        // Первый запуск - сохраняем версию
        localStorage.setItem(BUILD_VERSION_KEY, currentVersion);
        return false;
    }

    if (storedVersion !== currentVersion) {
        // Версия изменилась - обновляем
        localStorage.setItem(BUILD_VERSION_KEY, currentVersion);
        return true;
    }

    return false;
}

/**
 * Очищает кэши браузера (Cache API)
 */
async function clearBrowserCaches() {
    if ('caches' in window) {
        try {
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames.map(cacheName => caches.delete(cacheName))
            );
            console.log('DevCacheManager: browser caches cleared');
        } catch (error) {
            console.warn('DevCacheManager: failed to clear caches:', error);
        }
    }
}

/**
 * Удаляет Service Worker (если есть)
 */
async function unregisterServiceWorkers() {
    if ('serviceWorker' in navigator) {
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                await registration.unregister();
                console.log('DevCacheManager: service worker unregistered');
            }
        } catch (error) {
            console.warn('DevCacheManager: failed to unregister service worker:', error);
        }
    }
}

/**
 * Показывает уведомление о необходимости перезагрузки
 */
function showReloadNotification() {
    const notification = document.createElement('div');
    notification.id = 'dev-cache-notification';
    notification.innerHTML = `
        <style>
            #dev-cache-notification {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: #1a1a2e;
                color: #fff;
                padding: 16px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                z-index: 99999;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                max-width: 320px;
                animation: slideIn 0.3s ease-out;
            }
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            #dev-cache-notification .title {
                font-weight: 600;
                margin-bottom: 8px;
                color: #4a90d9;
            }
            #dev-cache-notification .message {
                margin-bottom: 12px;
                line-height: 1.4;
                color: #ccc;
            }
            #dev-cache-notification .buttons {
                display: flex;
                gap: 8px;
            }
            #dev-cache-notification button {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
                transition: background 0.2s;
            }
            #dev-cache-notification .reload-btn {
                background: #4a90d9;
                color: #fff;
            }
            #dev-cache-notification .reload-btn:hover {
                background: #3a7bc8;
            }
            #dev-cache-notification .dismiss-btn {
                background: #333;
                color: #aaa;
            }
            #dev-cache-notification .dismiss-btn:hover {
                background: #444;
            }
        </style>
        <div class="title">Обнаружено обновление</div>
        <div class="message">Код приложения изменился. Рекомендуется перезагрузить страницу для применения изменений.</div>
        <div class="buttons">
            <button class="reload-btn" onclick="window.__clearAllCaches()">Перезагрузить</button>
            <button class="dismiss-btn" onclick="this.closest('#dev-cache-notification').remove()">Позже</button>
        </div>
    `;
    document.body.appendChild(notification);
}

/**
 * Инициализация менеджера кэша для dev режима
 * Вызывается при загрузке приложения
 */
export async function initDevCacheManager() {
    // КРИТИЧНО: Этот код должен работать ТОЛЬКО в dev режиме!
    // Двойная проверка для надежности (на случай если webpack не заменил переменную)
    if (process.env.NODE_ENV === 'production') {
        return;
    }

    // Дополнительная проверка через APP_VERSION (dev версия = 'dev')
    if (typeof APP_VERSION !== 'undefined' && APP_VERSION !== 'dev') {
        console.log('DevCacheManager: skipping in production build (APP_VERSION:', APP_VERSION, ')');
        return;
    }

    console.log('DevCacheManager: initializing...');

    // Удаляем Service Worker в dev режиме (он только мешает)
    await unregisterServiceWorkers();

    // Проверяем изменение версии
    if (hasVersionChanged()) {
        console.log('DevCacheManager: build version changed, clearing caches...');
        await clearBrowserCaches();
        showReloadNotification();
    }
}

/**
 * Принудительная очистка всего кэша
 * Можно вызвать из консоли: window.__clearAllCaches()
 */
export async function clearAllCaches() {
    console.log('DevCacheManager: starting full cache clear...');

    await clearBrowserCaches();
    await unregisterServiceWorkers();

    // Clear localStorage completely
    localStorage.clear();

    // Clear sessionStorage
    sessionStorage.clear();

    // Clear auth cookies to force re-login with fresh tokens
    document.cookie.split(';').forEach(cookie => {
        const name = cookie.split('=')[0].trim();
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    });

    // Clear IndexedDB (localforage uses it)
    if ('indexedDB' in window) {
        try {
            const databases = await indexedDB.databases();
            for (const db of databases) {
                if (db.name) {
                    indexedDB.deleteDatabase(db.name);
                    console.log('DevCacheManager: deleted IndexedDB:', db.name);
                }
            }
        } catch (e) {
            console.warn('DevCacheManager: could not clear IndexedDB:', e);
        }
    }

    console.log('DevCacheManager: all caches cleared, reloading...');
    window.location.href = window.location.origin;
}

// Экспортируем в window для отладки
if (typeof window !== 'undefined') {
    window.__clearAllCaches = clearAllCaches;
}

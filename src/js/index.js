import 'highlight.js/styles/github.css';
import '../style/index.css';
import '../style/toolbar.css';
import '../style/controls.css';
import '../style/auth.css';
import '../style/popup.css';
import '../style/hotKeyPopup.css';
import '../style/urlPopup.css';
import '../style/accessPopup.css';
import '../style/editBlock.css';
import '../style/historyPopup.css';
import '../style/importPopup.css';
import '../style/imageUpload.css';
import '../style/solid.css';
import '../style/fontawesome.css';
import '../style/chat.css';
import '../style/note-editor.css';
import '../style/layout.css';
import '../style/p2p-chat.css';
import '../style/diagram-editor.css';
import '../style/layout-editor.css';

import {dispatch} from "./utils/utils";
import {localStateManager} from "./stateLocal/localStateManager";
import {addedSizeStyles} from "./painter/styles";
import localforage from "localforage";
import api from "./api/api";
import {SincManager} from "./sincManager/sincManager";
import {CommandManager} from "./controller/comands/comandManager";
import {Breadcrumbs} from "./controller/breadcrumbs";
import {TreeNavigation} from "./controller/treeNavigation";
import {undoManager} from "./controller/undoManager";
import Cookies from "js-cookie";
import {isExcludedElement} from "./utils/functions";
import {authStateManager} from "./auth/authStateManager";
import {networkStatusUI} from "./sincManager/networkStatusUI";
import {handleTelegramLinkCallback} from "./controller/telegramLinkHandler";
import {statusIndicators} from "./core/statusIndicators";
import {initDevCacheManager} from "./core/devCacheManager";
import {chatBadgeManager} from "./controller/chatBadgeManager";
import {handleChatDeepLink, initChatEventListeners} from "./controller/chatDeepLinkHandler";

if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    // Храним ссылку на updatefound handler для возможности cleanup
    let updateFoundHandler = null;
    let swRegistration = null;
    let currentScope = null;
    // Debounce для online событий - предотвращает множественные проверки
    let updateCheckTimeout = null;
    let isCheckingUpdate = false;

    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register('/service-worker.js')
            .then(registration => {
                // Предотвращаем повторную регистрацию обработчиков (сравниваем по scope)
                if (currentScope === registration.scope) {
                    return;
                }
                // Удаляем старый обработчик если был
                if (updateFoundHandler && swRegistration) {
                    swRegistration.removeEventListener('updatefound', updateFoundHandler);
                }
                swRegistration = registration;
                currentScope = registration.scope;
                console.log('Service Worker зарегистрирован с объемом: ', registration.scope);

                // Слушаем обновления SW
                updateFoundHandler = () => {
                    const newWorker = registration.installing;
                    if (newWorker) {
                        let cleanupTimeout;
                        const stateChangeHandler = () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // Новая версия SW готова, уведомляем пользователя
                                console.log('Новая версия приложения доступна, обновите страницу');
                                dispatch('AppUpdateAvailable');
                            }
                            // Cleanup listener when SW reaches terminal state
                            if (newWorker.state === 'activated' || newWorker.state === 'redundant') {
                                clearTimeout(cleanupTimeout);
                                newWorker.removeEventListener('statechange', stateChangeHandler);
                            }
                        };
                        newWorker.addEventListener('statechange', stateChangeHandler);
                        // Fallback cleanup after 60 seconds if SW gets stuck
                        cleanupTimeout = setTimeout(() => {
                            newWorker.removeEventListener('statechange', stateChangeHandler);
                        }, 60000);
                    }
                };
                registration.addEventListener('updatefound', updateFoundHandler);
            })
            .catch(error => {
                console.log('Ошибка регистрации Service Worker: ', error);
            });
    });

    // Cleanup при выгрузке страницы
    window.addEventListener('beforeunload', () => {
        try {
            if (updateFoundHandler && swRegistration) {
                swRegistration.removeEventListener('updatefound', updateFoundHandler);
            }
            clearTimeout(updateCheckTimeout);
        } catch (e) {
            // Игнорируем ошибки cleanup при выгрузке страницы
        }
    });

    // При восстановлении соединения проверяем обновления с debounce
    let cooldownTimeout = null;
    window.addEventListener('online', () => {
        // Debounce: игнорируем повторные события пока идёт проверка или cooldown
        if (isCheckingUpdate) return;

        clearTimeout(updateCheckTimeout);
        updateCheckTimeout = setTimeout(() => {
            isCheckingUpdate = true;
            navigator.serviceWorker.ready
                .then(registration => {
                    if (registration.active) {
                        registration.active.postMessage({ type: 'CHECK_UPDATES' });
                    }
                })
                .catch(err => {
                    console.warn('SW ready failed:', err);
                })
                .finally(() => {
                    // Cooldown: разрешаем следующую проверку через 5 секунд
                    clearTimeout(cooldownTimeout);
                    cooldownTimeout = setTimeout(() => {
                        isCheckingUpdate = false;
                    }, 5000);
                });
        }, 1000); // Задержка 1 секунда перед проверкой
    });

    // Обработчик события обновления приложения - показываем уведомление
    window.addEventListener('AppUpdateAvailable', () => {
        // Проверяем, нет ли уже уведомления
        if (document.querySelector('.app-update-notification')) {
            return;
        }

        // Создаём уведомление безопасным способом (без innerHTML)
        const notification = document.createElement('div');
        notification.className = 'app-update-notification';

        const messageSpan = document.createElement('span');
        messageSpan.textContent = 'Доступна новая версия';

        const updateBtn = document.createElement('button');
        updateBtn.textContent = 'Обновить';
        updateBtn.addEventListener('click', () => {
            // Проверяем наличие несохранённых данных перед обновлением
            // networkStatusUI.getPendingCount() - синхронный метод с кэшированным значением
            const pendingCount = networkStatusUI.getPendingCount();
            if (pendingCount > 0) {
                if (!confirm(`У вас есть ${pendingCount} несохранённых изменений. Обновить страницу?`)) {
                    return;
                }
            }
            window.location.reload();
        });

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', () => notification.remove());

        notification.appendChild(messageSpan);
        notification.appendChild(updateBtn);
        notification.appendChild(closeBtn);
        document.body.appendChild(notification);
    });
}


document.addEventListener('DOMContentLoaded', async () => {
    // Показываем версию приложения
    // Приоритет: runtime config (ConfigMap) > build-time (webpack)
    const versionEl = document.getElementById('app-version');
    if (versionEl) {
        const runtimeConfig = window.__OMNIMAP_CONFIG__ || {};
        const version = runtimeConfig.APP_VERSION ||
            (typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'dev');
        const env = runtimeConfig.APP_ENVIRONMENT || '';
        versionEl.textContent = env && env !== 'production'
            ? `v${version} (${env})`
            : `v${version}`;
    }

    // Инициализируем менеджер кэша для dev режима
    await initDevCacheManager();

    // Быстрая инициализация без блокирующего экрана загрузки
    try {
        await fastInitialization();
    } catch (error) {
        console.error('Critical initialization error:', error);
        // При критической ошибке показываем сообщение в консоль и пробуем продолжить
        alert(`Ошибка инициализации: ${error.message}`);
    }
});

/**
 * Скрывает загрузочный экран и показывает основной контент
 */
function hideLoader() {
    const loader = document.getElementById('app-loader');
    const layout = document.querySelector('.layout');

    if (loader) {
        loader.classList.add('hidden');
        // Удаляем loader из DOM после анимации
        setTimeout(() => loader.remove(), 300);
    }

    if (layout) {
        layout.classList.add('loaded');
    }
}

/**
 * Быстрая инициализация приложения
 * Сразу рендерит данные из localforage без блокирующего экрана загрузки
 */
async function fastInitialization() {
    // Конфигурация localforage
    localforage.config({
        name: 'omniMap',
        storeName: 'omniMap',
        driver: [localforage.INDEXEDDB],
        version: 1.0,
        description: ''
    });
    await localforage.ready();

    // Инициализируем authStateManager после localforage
    await authStateManager.init();

    // Запрашиваем persistent storage в фоне
    if ('storage' in navigator && 'persist' in navigator.storage) {
        navigator.storage.persist().then(granted => {
            console.log('Persistent storage', granted ? 'granted' : 'denied');
        });
    }

    // Настройка viewport
    function setRealVh() {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }

    window.addEventListener('resize', setRealVh);
    window.addEventListener('orientationchange', setRealVh);
    setRealVh();

    // Инициализируем приложение
    await initApp();

    // Инициализируем статус-индикаторы после того как интерфейс готов
    statusIndicators.init();

    // Скрываем загрузочный экран после полной инициализации
    hideLoader();
}


/**
 * Проверяем токены и устанавливаем текущего пользователя
 * Генерируем событие ShowBlocks
 */
async function initApp() {

    addedSizeStyles()
    await localforage.getItem('hotkeysMap', (err, hotkeysMap) => {
        new CommandManager(
            'rootContainer',
            'breadcrumb',
            'tree-navigation',
            hotkeysMap ?? {},
        )
    })
    // Инициализируем singleton LocalStateManager
    localStateManager.getInstance();

    // Инициализируем менеджер badge для чата
    chatBadgeManager.init();

    const sincManager = new SincManager()
    const breadcrumbs = new Breadcrumbs()
    const treeNavigation = new TreeNavigation()

    // Инициализируем новый UndoManager (локальный undo/redo)
    await undoManager.init()


    const isAuth = await checkAuth()

    if (isAuth) {
        dispatch('ShowBlocks')
    }

    setInterface()

    // Обработка callback URL (например, привязка Telegram)
    handleTelegramLinkCallback()

    // Инициализация обработчиков событий чата (для push notifications)
    initChatEventListeners()

    // Обработка deep links для чатов (например, #chat/dm/123)
    handleChatDeepLink()
}

async function checkAuth() {
    let user = await localforage.getItem('currentUser')
    if (user == null) {
        dispatch('InitAnonimUser')
        return false
    }

    // Проверяем наличие refresh токена
    const hasRefreshToken = Cookies.get('refresh') !== undefined

    // Если anonim, но есть токены - удаляем их (несогласованное состояние)
    if (user === 'anonim' && hasRefreshToken) {
        console.warn('[checkAuth] Inconsistent state: anonim user with tokens, clearing tokens');
        Cookies.remove('access');
        Cookies.remove('refresh');
        return true
    }

    // Если пользователь авторизован, но токенов нет - logout
    if (user !== 'anonim' && !hasRefreshToken) {
        dispatch('Logout')
        return false
    }

    // Офлайн режим с валидным refresh токеном
    if (!navigator.onLine && hasRefreshToken) {
        return true
    }

    // Онлайн режим - пробуем обновить токен
    if (user !== 'anonim') {
        const refreshed = await api.refreshToken()
        if (!refreshed) {
            dispatch('Logout')
            return false
        }
        return true
    }

    return true
}


/**
 * Настраиваем интерфейс - теперь управляется через AuthStateManager
 */
function setInterface() {
    // AuthStateManager автоматически управляет видимостью панелей
    // на основе событий Login/Logout/InitAnonimUser
    authStateManager.refresh();
}

(() => {
    const TIME_THRESHOLD = 200;   // мс, ниже — быстрый клик
    const MOVE_THRESHOLD = 5;     // пикселей, ниже — без движения

    let clickStartTime = 0;
    let startX = 0;
    let startY = 0;

    /**
     * Проверяет, что клик произошёл по элементу, где ввод текста нужен:
     * - <textarea>
     * - <input type="text|email|password">
     * - <emoji-picker>
     * - любой элемент внутри .CodeMirror
     * - любой элемент с contenteditable="true"
     */

    document.addEventListener('mousedown', (e) => {
        clickStartTime = Date.now();
        startX = e.clientX;
        startY = e.clientY;
    });

    document.addEventListener('mouseup', (e) => {
        if (isExcludedElement(e.target, 'index')) {
            // стандартное поведение для полей ввода текста
            return;
        }

        const clickDuration = Date.now() - clickStartTime;
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        if (
            clickDuration < TIME_THRESHOLD &&
            Math.hypot(deltaX, deltaY) < MOVE_THRESHOLD
        ) {
            const sel = window.getSelection();
            if (!sel.isCollapsed) {
                sel.removeAllRanges();
                console.log('removed')
            }
        }
    });
})();


window.addEventListener('resize', () => {
  console.log(
    'resize',
    'innerHeight:', window.innerHeight,
    'visualViewport:', window.visualViewport?.height
  );
});

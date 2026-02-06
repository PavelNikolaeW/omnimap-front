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
import '../style/onboarding.css';
import '../style/toast.css';
import '../style/accessRequests.css';

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
import {errorTracker} from "./core/errorTracker";
import {initDevCacheManager} from "./core/devCacheManager";
import {chatBadgeManager} from "./controller/chatBadgeManager";
import {handleChatDeepLink, initChatEventListeners} from "./controller/chatDeepLinkHandler";
import {onboardingManager} from "./onboarding";
import {toastManager} from "./controller/toastManager";
import {accessRequestsBadgeManager} from "./controller/accessRequestsBadgeManager";
import {openFullsizeImage} from "./utils/imageUtils";
import {versionChecker} from "./core/versionChecker";

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

    // Обработчик события обновления приложения
    // Service Worker диспатчит это событие когда обнаруживает новую версию
    // Показываем уведомление через versionChecker для единообразного UX
    window.addEventListener('AppUpdateAvailable', () => {
        console.log('[App] Service Worker update detected, showing notification');
        versionChecker.showUpdateNotification();
    });
}


document.addEventListener('DOMContentLoaded', async () => {
    // Очищаем служебные URL параметры (_reload, _t) для чистоты адресной строки
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('_reload') || urlParams.has('_t')) {
        urlParams.delete('_reload');
        urlParams.delete('_t');
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        window.history.replaceState({}, '', newUrl);
    }

    // Инициализируем error tracking первым делом (до других компонентов)
    // чтобы перехватывать ошибки инициализации
    errorTracker.init();

    // Показываем версию приложения
    // Приоритет: runtime config (ConfigMap) > build-time (webpack)
    const versionEl = document.getElementById('app-version');
    if (versionEl) {
        const runtimeConfig = window.__OMNIMAP_CONFIG__ || {};
        const version = runtimeConfig.APP_VERSION ||
            (typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'dev');
        const env = runtimeConfig.APP_ENVIRONMENT || '';
        const vPrefix = version.startsWith('v') ? '' : 'v';
        versionEl.textContent = env && env !== 'production'
            ? `${vPrefix}${version} (${env})`
            : `${vPrefix}${version}`;
    }

    // Инициализируем менеджер кэша ТОЛЬКО для dev режима
    // Дополнительная проверка на уровне вызова для надежности
    if (process.env.NODE_ENV !== 'production') {
        await initDevCacheManager();
    }

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

    // Инициализируем онбординг для новых пользователей
    onboardingManager.init();

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

    // Запускаем проверку версии для автоматических обновлений
    versionChecker.start();

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

    // Инициализируем систему toast-уведомлений
    toastManager.init();

    // Инициализируем менеджер badge для запросов на доступ
    accessRequestsBadgeManager.init();

    const sincManager = new SincManager()
    const breadcrumbs = new Breadcrumbs()
    const treeNavigation = new TreeNavigation()

    // Инициализируем новый UndoManager (локальный undo/redo)
    await undoManager.init()

    // Делаем объекты доступными для errorTracker
    window.__undoManager = undoManager
    window.__networkStatusUI = networkStatusUI


    const isAuth = await checkAuth()

    if (isAuth) {
        // Показываем кэш мгновенно (если есть)
        dispatch('ShowBlocks')

        // КРИТИЧНО: Запускаем синхронизацию явно после логина
        // Защита от race condition: если WebSocket подключился ДО установки currentUser,
        // то online() handler пропустил синхронизацию (return на sincManager.js:33)
        // Явный вызов гарантирует получение обновлений
        console.log('🔄 index.js: triggering sync after login');
        await sincManager.requestIncrementalUpdates();
    }

    // Инициализируем обработчики двойного клика на изображениях в блоках
    // Для background-изображений (pointer-events: none) проверяем координаты клика
    const rootContainer = document.getElementById('rootContainer');
    if (rootContainer) {
        rootContainer.addEventListener('dblclick', (e) => {
            // Сначала пробуем найти обычное изображение (не background)
            let imageContainer = e.target.closest('.block-image-container');

            // Если не нашли - проверяем, не кликнули ли мы в область background-изображения
            if (!imageContainer) {
                const block = e.target.closest('.block, [block]');
                if (block) {
                    const bgImage = block.querySelector('.block-image-container[data-background="true"]');
                    if (bgImage) {
                        const rect = bgImage.getBoundingClientRect();
                        // Проверяем, попадает ли клик в область изображения
                        if (e.clientX >= rect.left && e.clientX <= rect.right &&
                            e.clientY >= rect.top && e.clientY <= rect.bottom) {
                            imageContainer = bgImage;
                        }
                    }
                }
            }

            if (!imageContainer) return;
            const fullsizeUrl = imageContainer.getAttribute('data-fullsize-url');
            if (!fullsizeUrl) return;
            e.preventDefault();
            e.stopPropagation();
            const img = imageContainer.querySelector('.block-image');
            openFullsizeImage(fullsizeUrl, img?.alt || 'Изображение блока');
        });
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

        // Если клик на текстовый элемент внутри draggable блока - временно отключаем drag
        // чтобы позволить выделение текста
        const textElement = e.target.closest('titleblock, contentblock');
        if (textElement) {
            const blockElement = textElement.closest('[draggable="true"]');
            if (blockElement) {
                blockElement.setAttribute('draggable', 'false');
                blockElement._wasTextSelection = true;
            }
        }
    });

    document.addEventListener('mouseup', (e) => {
        // Восстанавливаем draggable на блоках, которые были временно отключены для выделения текста
        document.querySelectorAll('[block][draggable="false"]').forEach(block => {
            if (block._wasTextSelection) {
                block.setAttribute('draggable', 'true');
                delete block._wasTextSelection;
            }
        });

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
            // Сбрасываем только случайное выделение (пустое или очень короткое)
            // Если пользователь выделил текст (тройной клик и т.д.) - не сбрасываем
            if (!sel.isCollapsed && sel.toString().trim().length === 0) {
                sel.removeAllRanges();
            }
        }
    });

    // Предотвращаем drag если он начинается с текстового элемента
    document.addEventListener('dragstart', (e) => {
        const textElement = e.target.closest('titleblock, contentblock');
        if (textElement) {
            e.preventDefault();
        }
    });

    // Сбрасываем выделение при обычном клике (не при выделении)
    let lastSelectionLength = 0;
    document.addEventListener('click', (e) => {
        const sel = window.getSelection();
        const currentLength = sel?.toString().trim().length || 0;

        // Не сбрасываем выделение если клик был на текстовом элементе
        // (пользователь мог выделять текст)
        const isTextElement = e.target.closest('titleblock, contentblock');

        // Если выделение не изменилось или уменьшилось - сбрасываем
        // (при тройном клике выделение увеличивается)
        // Но не сбрасываем если клик был на текстовом элементе
        if (currentLength > 0 && currentLength <= lastSelectionLength && !isTextElement) {
            sel.removeAllRanges();
        }

        lastSelectionLength = sel?.toString().trim().length || 0;
    }, true); // capture phase - до других обработчиков
})();


window.addEventListener('resize', () => {
  console.log(
    'resize',
    'innerHeight:', window.innerHeight,
    'visualViewport:', window.visualViewport?.height
  );
});

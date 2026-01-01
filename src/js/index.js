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

import {dispatch} from "./utils/utils";
import {LocalStateManager} from "./stateLocal/localStateManager";
import {addedSizeStyles} from "./painter/styles";
import localforage from "localforage";
import api from "./api/api";
import {SincManager} from "./sincManager/sincManager";
import {CommandManager} from "./controller/comands/comandManager";
import {Breadcrumbs} from "./controller/breadcrumbs";
import {TreeNavigation} from "./controller/treeNavigation";
import {RedoStack, UndoStack} from "./controller/undoStack";
import Cookies from "js-cookie";
import {isExcludedElement} from "./utils/functions";
import {authStateManager} from "./auth/authStateManager";
import {offlineQueue} from "./sincManager/offlineQueue";
import {networkStatusUI} from "./sincManager/networkStatusUI";
import {handleTelegramLinkCallback} from "./controller/telegramLinkHandler";
import {statusIndicators} from "./core/statusIndicators";
import {initDevCacheManager} from "./core/devCacheManager";

if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register('/service-worker.js')
            .then(registration => {
                console.log('Service Worker зарегистрирован с объемом: ', registration.scope);
            })
            .catch(error => {
                console.log('Ошибка регистрации Service Worker: ', error);
            });
    });
}


document.addEventListener('DOMContentLoaded', async () => {
    // Показываем версию приложения
    const versionEl = document.getElementById('app-version');
    if (versionEl && typeof APP_VERSION !== 'undefined') {
        versionEl.textContent = `v${APP_VERSION}`;
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
    const localState = new LocalStateManager()
    const sincManager = new SincManager()
    const breadcrumbs = new Breadcrumbs()
    const treeNavigation = new TreeNavigation()
    const undoStack = new UndoStack()
    const redoStack = new RedoStack()


    const isAuth = await checkAuth()

    if (isAuth) {
        dispatch('ShowBlocks')
    }

    setInterface()

    // Обработка callback URL (например, привязка Telegram)
    handleTelegramLinkCallback()
}

async function checkAuth() {
    let user = await localforage.getItem('currentUser')
    if (user == null) {
        dispatch('InitAnonimUser')
        return false
    }
    if (!navigator.onLine && Cookies.get('refresh') !== undefined) {
        return true
    }
    if (user !== 'anonim') {
        return await api.refreshToken()
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

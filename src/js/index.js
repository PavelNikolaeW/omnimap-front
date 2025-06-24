import 'highlight.js/styles/github.css';
import 'simplemde/dist/simplemde.min.css';
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
import '../style/solid.css';
import '../style/fontawesome.css';

import {dispatch} from "./utils/utils";
import {LocalStateManager} from "./stateLocal/localStateManager";
import {addedSizeStyles} from "./painter/styles";
import localforage from "localforage";
import api from "./api/api";
import {SincManager} from "./sincManager/sincManager";
import {CommandManager} from "./controller/comands/comandManager";
import {Breadcrumbs} from "./controller/breadcrumds";
import {TreeNavigation} from "./controller/treeNavigation";
import {RedoStack, UndoStack} from "./controller/undoStack";
import Cookies from "js-cookie";
import {isExcludedElement} from "./utils/functions";

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
    // Проверка поддержки IndexedDB и конфигурация localforage
    if (!localforage.supports(localforage.INDEXEDDB)) {
        alert('Ваш браузер не поддерживает IndexedDB. Пожалуйста, обновите браузер для полноценной работы сайта.');
    } else {
        if ('storage' in navigator && 'persist' in navigator.storage) {
            const granted = await navigator.storage.persist();
            console.log('Persistent storage', granted ? 'granted' : 'denied');
        }
        localforage.config({
            name: 'omniMap',
            storeName: 'omniMap',
            driver: [localforage.INDEXEDDB],
            version: 1.0,
            description: ''
        });
        await localforage.ready()
    }

    function setRealVh() {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }

    window.addEventListener('resize', setRealVh);
    window.addEventListener('orientationchange', setRealVh);
    setRealVh();

    await initApp()
})


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
 * TODO Настраиваем интрефейс если в хранилище есть настройки
 */
function setInterface() {
    const isLink = window.location.href.indexOf('/?')
    const sidebar = document.getElementById('sidebar')
    const topSidebar = document.getElementById('topSidebar')

    if (isLink != -1) {
        sidebar.classList.add('hidden')
        topSidebar.classList.add('hidden')
    }
    localforage.getItem('currentUser', (err, user) => {
        if (!user || user === 'anonim') {
            sidebar.classList.add('hidden')
            topSidebar.classList.add('hidden')
        }
    })
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

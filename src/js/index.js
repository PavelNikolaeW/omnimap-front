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

import {checkClass, dispatch} from "./utils/utils";
import {LocalStateManager} from "./stateLocal/localStateManager";
import {addedSizeStyles} from "./painter/styles";
import localforage from "localforage";
import api from "./api/api";
import {SincManager} from "./sincManager/sincManager";
import {CommandManager} from "./controller/comands/comandManager";
import {Breadcrumbs} from "./controller/breadcrumds";
import {TreeNavigation} from "./controller/treeNavigation";
import {RedoStack, UndoStack} from "./controller/undoStack";

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
    function setRealVh() {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }

    window.addEventListener('resize', setRealVh);
    window.addEventListener('orientationchange', setRealVh);
    setRealVh();
    await initApp()
})

async function checkAuth() {
    let user = await localforage.getItem('currentUser')
    if (user == null) {
        dispatch('InitAnonimUser')
        return false
    }
    if (user !== 'anonim') {
        return await api.refreshToken()
    }
    return true
}


/**
 * Проверяем токены и устанавливаем текущего пользователя
 * Генерируем событие ShowBlocks
 */
async function initApp() {
    addedSizeStyles()
    localforage.getItem('hotkeysMap', (err, hotkeysMap) => {
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
}

let clickStartTime = 0;
let startX = 0;
let startY = 0;
const timeThreshold = 200; // время в мс, ниже которого считаем клик быстрым
const moveThreshold = 5;   // порог перемещения в пикселях

document.addEventListener('mousedown', (e) => {
    clickStartTime = Date.now();
    startX = e.clientX;
    startY = e.clientY;
});

document.addEventListener('mouseup', (e) => {
    if (['text', 'email', 'password', 'textarea'].includes(e.target.type) ||
        e.target.localName === 'emoji-picker' ||
        checkClass(e.target, 'CodeMirror')) return
    const clickDuration = Date.now() - clickStartTime;
    const deltaX = Math.abs(e.clientX - startX);
    const deltaY = Math.abs(e.clientY - startY);

    // Если клик был быстрым и без значительного перемещения
    if (clickDuration < timeThreshold && deltaX < moveThreshold && deltaY < moveThreshold) {
        // Убираем выделение, если оно случайно произошло
        window.getSelection().removeAllRanges();
    }
});
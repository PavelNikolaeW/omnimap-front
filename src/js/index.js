import 'easymde/dist/easymde.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '../style/index.css';
import '../style/toolbar.css';
import '../style/controls.css';
import '../style/auth.css';
import '../style/accessWindow.css';
import '../style/searchWindow.css';
import '../style/popup.css';
import '../style/hotKeyPopup.css';
import '../style/urlPopup.css';
import '../style/accessPopup.css';


import {dispatch} from "./utils/utils";
import {LocalStateManager} from "./stateLocal/localStateManager";
import {ControllerBlock} from "./controller/controller";
import {addedSizeStyles} from "./painter/styles";
import {newInstance, EVENT_CONNECTION_CLICK} from "@jsplumb/browser-ui";
import localforage from "localforage";
import api from "./api/api";
import {SincManager} from "./sincManager/sincManager";
import {CommandManager} from "./controller/comandManager";
import {uiManager, UIManager} from "./controller/uiManager";

console.log(location.search.slice(1, ))
// что нужно доделать перед переходом к беку
// 1 редактор размеров и расположения блоков
// 2 текстовый редактор
// 3 добавление своих стилей к блокам и стрелкам
// 4 кнопки взаимодействия с интерфейсом (выделить несколько, копировать, вставить, переместить, сделать ссылку, открыть редактор(размеров, стилей, расположения), удалить блок)

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
    const localState = new LocalStateManager()
    // const controller = new ControllerBlock(jsPlumbInstance);
    const sincManager = new SincManager()


    const hotkeysMap = await localforage.getItem('hotkeysMap')
    const commandManager = new CommandManager(
        'rootContainer', 'breadcrumb', 'tree-navigation', hotkeysMap ?? {})

    const isAuth = await checkAuth()

    if (isAuth) {
        dispatch('ShowBlocks')
    }

    setInterface()
}

function setInterface() {
    const isHiddenSidebar = localStorage.getItem('sidebarIsHidden')
    const istopSidebarHidden = localStorage.getItem('topSidebarHidden')
    const sidebar = document.getElementById('sidebar')
    const topSidebar =  document.getElementById('topSidebar')
    if (isHiddenSidebar === 'true') {
        sidebar.classList.add('hidden')
    }
    if (istopSidebarHidden === 'true') {
        topSidebar.classList.add('hidden')
    }
    if (window.location.search.includes('path/')) {
        sidebar.classList.add('hidden')
        topSidebar.classList.add('hidden')
    }
}
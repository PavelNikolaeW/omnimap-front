import '../style/index.css';
import '../style/toolbar.css';
import '../style/controls.css';
import '../style/auth.css';
import '../style/registration.css';
import '../style/accessWindow.css';
import '../style/searchWindow.css';

import {auth} from "./auth/auth";
import {dispatch} from "./utils/utils";
import {LocalStateManager} from "./stateLocal/localStateManager";
import {ControllerBlock} from "./controller/controller";
import {addedSizeStyles} from "./painter/styles";
import {jsPlumb} from "jsplumb";
import localforage from "localforage";
import api from "./api/api";

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
    initSynchronisationBlocks()
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
    const jsPlumbInstance = jsPlumb.getInstance({
        Connector: 'Straight',
        Endpoint: 'Dot',
        Anchor: 'Continuous',
        PaintStyle: {stroke: '#456', strokeWidth: 2},
        EndpointStyle: {fill: '#456', radius: 2},
    });

    jsPlumbInstance.ready(() => {
        jsPlumbInstance.setContainer(document.body);
        // Дополнительная инициализация, если необходимо
    });
    addedSizeStyles()
    const localState = new LocalStateManager(jsPlumbInstance)
    const controller = new ControllerBlock(jsPlumbInstance);

    const isAuth = await checkAuth()

    if (isAuth) {
        console.log('drawBlocks')
        dispatch('ShowBlocks')
    }

}

/**
 * Инициализация управления синхронизацией блоков.
 */
function initSynchronisationBlocks() {

}

function logElementSizes(element) {
    if (!element) return;

    // Получаем размеры самого элемента
    const rect = element.getBoundingClientRect();
    console.log(element, `Размеры: Ширина - ${rect.width}px, Высота - ${rect.height}px`);

    // Рекурсивно проходим по всем дочерним элементам
    Array.from(element.children).forEach(child => {
        if (child.hasAttribute('block')) logElementSizes(child);
    });
}

// setTimeout(() => {
//     logElementSizes(document.getElementById('rootContainer'))
// }, 500)


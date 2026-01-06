import localforage from "localforage";
import Cookies from "js-cookie";
import { dispatch } from "../utils/utils";

/**
 * Интервал проверки токенов в миллисекундах (30 секунд)
 */
const TOKEN_CHECK_INTERVAL = 30000;

/**
 * Централизованный менеджер состояния аутентификации
 * Управляет видимостью UI элементов в зависимости от статуса авторизации
 */
class AuthStateManager {
    constructor() {
        this.isAuthenticated = false;
        this.currentUser = null;
        this.isLinkView = false;
        this.tokenCheckTimer = null;
        this._initialized = false;

        // UI элементы
        this.elements = {
            sidebar: null,
            topSidebar: null,
            breadcrumb: null,
            treeNavigation: null,
            controlPanel: null
        };

        // Подписываемся на события сразу (они могут прийти до init)
        this.addEventListeners();
    }

    /**
     * Инициализация менеджера
     * ВАЖНО: Вызывать только после localforage.ready()
     */
    async init() {
        if (this._initialized) return;
        this._initialized = true;

        // Кэшируем DOM элементы
        this.cacheElements();

        // Проверяем, открыта ли страница по ссылке
        this.isLinkView = window.location.search.includes('?');

        // Инициализируем состояние
        await this.checkAuthState();

        // Запускаем периодическую проверку токенов
        this.startTokenCheck();
    }

    cacheElements() {
        this.elements.sidebar = document.getElementById('sidebar');
        this.elements.topSidebar = document.getElementById('topSidebar');
        this.elements.breadcrumb = document.getElementById('breadcrumb');
        this.elements.treeNavigation = document.getElementById('tree-navigation');
        this.elements.controlPanel = document.getElementById('control-panel');
    }

    addEventListeners() {
        window.addEventListener('Login', this.handleLogin.bind(this));
        window.addEventListener('Logout', this.handleLogout.bind(this));
        window.addEventListener('InitAnonimUser', this.handleAnonimUser.bind(this));
        window.addEventListener('InitUser', this.handleInitUser.bind(this));
    }

    async checkAuthState() {
        const user = await localforage.getItem('currentUser');
        const hasTokens = Cookies.get('refresh') !== undefined;

        if (user && user !== 'anonim' && hasTokens) {
            this.isAuthenticated = true;
            this.currentUser = user;
        } else {
            this.isAuthenticated = false;
            this.currentUser = user === 'anonim' ? 'anonim' : null;
        }

        this.updateUI();
    }

    handleLogin(event) {
        const user = event.detail?.user;
        this.isAuthenticated = true;
        this.currentUser = user;
        this.updateUI();
    }

    handleLogout() {
        this.isAuthenticated = false;
        this.currentUser = null;
        this.updateUI();
    }

    handleAnonimUser() {
        this.isAuthenticated = false;
        this.currentUser = 'anonim';
        this.updateUI();
    }

    handleInitUser(event) {
        const user = event.detail?.user;
        this.isAuthenticated = true;
        this.currentUser = user;
        this.updateUI();
    }

    /**
     * Обновляет видимость UI элементов на основе состояния авторизации
     */
    updateUI() {
        const shouldHide = !this.isAuthenticated || this.isLinkView;

        // Sidebar (боковая панель)
        if (this.elements.sidebar) {
            this.toggleVisibility(this.elements.sidebar, !shouldHide);
        }

        // Top sidebar (верхняя панель навигации)
        if (this.elements.topSidebar) {
            this.toggleVisibility(this.elements.topSidebar, !shouldHide);
        }

        // Breadcrumbs
        if (this.elements.breadcrumb) {
            this.toggleVisibility(this.elements.breadcrumb, !shouldHide);
        }
    }

    /**
     * Переключает видимость элемента
     */
    toggleVisibility(element, isVisible) {
        if (isVisible) {
            element.classList.remove('hidden');
        } else {
            element.classList.add('hidden');
        }
    }

    /**
     * Проверяет, авторизован ли пользователь
     */
    isUserAuthenticated() {
        return this.isAuthenticated;
    }

    /**
     * Получает текущего пользователя
     */
    getUser() {
        return this.currentUser;
    }

    /**
     * Принудительно обновляет состояние
     */
    async refresh() {
        await this.checkAuthState();
    }

    /**
     * Запускает периодическую проверку токенов
     * Если токены были удалены (например, вручную из DevTools),
     * автоматически выполняет logout
     */
    startTokenCheck() {
        this.stopTokenCheck();

        this.tokenCheckTimer = setInterval(() => {
            this.verifyTokens();
        }, TOKEN_CHECK_INTERVAL);

        // Также проверяем при возвращении на вкладку
        document.addEventListener('visibilitychange', this._handleVisibilityChange.bind(this));
    }

    /**
     * Останавливает периодическую проверку токенов
     */
    stopTokenCheck() {
        if (this.tokenCheckTimer) {
            clearInterval(this.tokenCheckTimer);
            this.tokenCheckTimer = null;
        }
    }

    /**
     * Обработчик изменения видимости страницы
     * Проверяет токены при возвращении на вкладку
     */
    _handleVisibilityChange() {
        if (document.visibilityState === 'visible') {
            this.verifyTokens();
        }
    }

    /**
     * Проверяет наличие токенов и соответствие состоянию авторизации
     * Если пользователь был авторизован, но токены исчезли - выполняет logout
     */
    verifyTokens() {
        const hasAccessToken = Cookies.get('access') !== undefined;
        const hasRefreshToken = Cookies.get('refresh') !== undefined;

        // Если пользователь был авторизован, но токены пропали
        if (this.isAuthenticated && this.currentUser && this.currentUser !== 'anonim') {
            if (!hasAccessToken && !hasRefreshToken) {
                console.warn('AuthStateManager: tokens missing, logging out');
                dispatch('Logout');
            }
        }
    }

    /**
     * Очистка ресурсов
     */
    destroy() {
        this.stopTokenCheck();
        document.removeEventListener('visibilitychange', this._handleVisibilityChange);
    }
}

// Экспортируем singleton
export const authStateManager = new AuthStateManager();

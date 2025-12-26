import localforage from "localforage";
import Cookies from "js-cookie";

/**
 * Централизованный менеджер состояния аутентификации
 * Управляет видимостью UI элементов в зависимости от статуса авторизации
 */
class AuthStateManager {
    constructor() {
        this.isAuthenticated = false;
        this.currentUser = null;
        this.isLinkView = false;

        // UI элементы
        this.elements = {
            sidebar: null,
            topSidebar: null,
            breadcrumb: null,
            treeNavigation: null,
            controlPanel: null
        };

        this.init();
    }

    async init() {
        // Кэшируем DOM элементы
        this.cacheElements();

        // Проверяем, открыта ли страница по ссылке
        this.isLinkView = window.location.search.includes('?');

        // Подписываемся на события
        this.addEventListeners();

        // Инициализируем состояние
        await this.checkAuthState();
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
}

// Экспортируем singleton
export const authStateManager = new AuthStateManager();

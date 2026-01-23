import localforage from "localforage";
import Cookies from "js-cookie";
import { dispatch } from "../utils/utils";

/**
 * Интервал проверки токенов в миллисекундах (30 секунд)
 */
const TOKEN_CHECK_INTERVAL = 30000;

/**
 * Обновлять токен за 5 минут до истечения
 */
const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000;

/**
 * Декодирует payload JWT токена без верификации подписи
 * @param {string} token - JWT токен
 * @returns {object|null} - payload или null при ошибке
 */
function decodeJwtPayload(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = parts[1];
        // Base64Url decode
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split('')
                .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.warn('[AuthStateManager] Failed to decode JWT:', e);
        return null;
    }
}

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
        this._isRefreshing = false; // Флаг для предотвращения параллельных refresh

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
        console.log('[AuthStateManager] init called, _initialized:', this._initialized);
        if (this._initialized) return;
        this._initialized = true;

        // Кэшируем DOM элементы
        this.cacheElements();
        console.log('[AuthStateManager] elements:', this.elements);

        // Проверяем, открыта ли страница по ссылке
        this.isLinkView = window.location.search.includes('?');
        console.log('[AuthStateManager] isLinkView:', this.isLinkView);

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

        console.log('[AuthStateManager] checkAuthState:', { user, hasTokens });

        if (user && user !== 'anonim' && hasTokens) {
            this.isAuthenticated = true;
            this.currentUser = user;
        } else {
            this.isAuthenticated = false;
            this.currentUser = user === 'anonim' ? 'anonim' : null;
        }

        console.log('[AuthStateManager] state:', { isAuthenticated: this.isAuthenticated, currentUser: this.currentUser });
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
            this.verifyTokens().catch(e => console.error('[AuthStateManager] verifyTokens error:', e));
        }, TOKEN_CHECK_INTERVAL);

        // Также проверяем при возвращении на вкладку
        this._boundVisibilityHandler = this._handleVisibilityChange.bind(this);
        document.addEventListener('visibilitychange', this._boundVisibilityHandler);
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
            this.verifyTokens().catch(e => console.error('[AuthStateManager] verifyTokens error:', e));
        }
    }

    /**
     * Проверяет наличие токенов и соответствие состоянию авторизации
     * Если пользователь был авторизован, но токены исчезли - выполняет logout
     * Также проактивно обновляет токен до его истечения
     */
    async verifyTokens() {
        const accessToken = Cookies.get('access');
        const hasRefreshToken = Cookies.get('refresh') !== undefined;

        // Если пользователь был авторизован, но токены пропали
        if (this.isAuthenticated && this.currentUser && this.currentUser !== 'anonim') {
            if (!accessToken && !hasRefreshToken) {
                console.warn('[AuthStateManager] tokens missing, logging out');
                dispatch('Logout');
                return;
            }

            // Проактивное обновление токена до истечения
            if (accessToken && hasRefreshToken && !this._isRefreshing) {
                const payload = decodeJwtPayload(accessToken);
                if (payload && payload.exp) {
                    const expiresAt = payload.exp * 1000; // JWT exp в секундах
                    const now = Date.now();
                    const timeUntilExpiry = expiresAt - now;

                    // Обновляем токен за 5 минут до истечения
                    if (timeUntilExpiry > 0 && timeUntilExpiry < TOKEN_REFRESH_THRESHOLD) {
                        console.log('[AuthStateManager] Token expiring soon, refreshing proactively');
                        await this._refreshTokenProactively();
                    }
                }
            }
        }
    }

    /**
     * Проактивно обновляет access token
     */
    async _refreshTokenProactively() {
        if (this._isRefreshing) return;
        this._isRefreshing = true;

        try {
            // Динамический импорт для избежания циклических зависимостей
            const { default: api } = await import('../api/api.js');
            const success = await api.refreshToken();
            if (success) {
                console.log('[AuthStateManager] Token refreshed proactively');
            } else {
                console.warn('[AuthStateManager] Proactive token refresh failed');
            }
        } catch (error) {
            console.error('[AuthStateManager] Error during proactive refresh:', error);
        } finally {
            this._isRefreshing = false;
        }
    }

    /**
     * Очистка ресурсов
     */
    destroy() {
        this.stopTokenCheck();
        if (this._boundVisibilityHandler) {
            document.removeEventListener('visibilitychange', this._boundVisibilityHandler);
        }
    }
}

// Экспортируем singleton
export const authStateManager = new AuthStateManager();

import localforage from "localforage";
import Cookies from "js-cookie";
import { dispatch } from "../utils/utils";

/**
 * Обновлять токен за 5 минут до истечения
 */
const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000;

/**
 * Минимальная задержка для таймера (1 секунда)
 */
const MIN_TIMER_DELAY = 1000;

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
        this._refreshTimer = null;
        this._initialized = false;
        this._isRefreshing = false;

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

        // Планируем обновление токена
        this._scheduleTokenRefresh();

        // Проверяем токены при возвращении на вкладку
        this._boundVisibilityHandler = this._handleVisibilityChange.bind(this);
        document.addEventListener('visibilitychange', this._boundVisibilityHandler);
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
        // Планируем обновление нового токена
        this._scheduleTokenRefresh();
    }

    handleLogout() {
        this.isAuthenticated = false;
        this.currentUser = null;
        this.updateUI();
        // Отменяем запланированный refresh
        this._clearRefreshTimer();
    }

    handleAnonimUser() {
        this.isAuthenticated = false;
        this.currentUser = 'anonim';
        this.updateUI();
        this._clearRefreshTimer();
    }

    handleInitUser(event) {
        const user = event.detail?.user;
        this.isAuthenticated = true;
        this.currentUser = user;
        this.updateUI();
        this._scheduleTokenRefresh();
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
     * Планирует обновление токена за 5 минут до истечения
     */
    _scheduleTokenRefresh() {
        this._clearRefreshTimer();

        if (!this.isAuthenticated) return;

        const accessToken = Cookies.get('access');
        const hasRefreshToken = Cookies.get('refresh') !== undefined;

        if (!accessToken || !hasRefreshToken) return;

        const payload = decodeJwtPayload(accessToken);
        if (!payload || !payload.exp) return;

        const expiresAt = payload.exp * 1000;
        const now = Date.now();
        const timeUntilRefresh = expiresAt - now - TOKEN_REFRESH_THRESHOLD;

        if (timeUntilRefresh <= 0) {
            // Токен уже истекает или истёк - обновляем сейчас
            console.log('[AuthStateManager] Token expiring/expired, refreshing now');
            this._refreshTokenProactively();
        } else {
            // Планируем обновление
            const delay = Math.max(timeUntilRefresh, MIN_TIMER_DELAY);
            console.log(`[AuthStateManager] Scheduling token refresh in ${Math.round(delay / 1000 / 60)} min`);
            this._refreshTimer = setTimeout(() => {
                this._refreshTokenProactively();
            }, delay);
        }
    }

    /**
     * Отменяет запланированное обновление токена
     */
    _clearRefreshTimer() {
        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
            this._refreshTimer = null;
        }
    }

    /**
     * Обработчик изменения видимости страницы
     * При возвращении на вкладку проверяем, не пропустили ли время refresh
     */
    _handleVisibilityChange() {
        if (document.visibilityState === 'visible' && this.isAuthenticated) {
            // Перепланируем refresh - возможно пропустили пока вкладка была в фоне
            this._scheduleTokenRefresh();
        }
    }

    /**
     * Проактивно обновляет access token и планирует следующее обновление
     */
    async _refreshTokenProactively() {
        if (this._isRefreshing) return;
        this._isRefreshing = true;

        try {
            // Проверяем наличие токенов перед refresh
            const hasRefreshToken = Cookies.get('refresh') !== undefined;
            if (!hasRefreshToken) {
                console.warn('[AuthStateManager] No refresh token, logging out');
                dispatch('Logout');
                return;
            }

            // Динамический импорт для избежания циклических зависимостей
            const { default: api } = await import('../api/api.js');
            const success = await api.refreshToken();

            if (success) {
                console.log('[AuthStateManager] Token refreshed successfully');
                // Планируем следующее обновление с новым токеном
                this._scheduleTokenRefresh();
            } else {
                console.warn('[AuthStateManager] Token refresh failed');
                // Не делаем logout сразу - axios interceptor попробует при следующем запросе
            }
        } catch (error) {
            console.error('[AuthStateManager] Error during token refresh:', error);
        } finally {
            this._isRefreshing = false;
        }
    }

    /**
     * Очистка ресурсов
     */
    destroy() {
        this._clearRefreshTimer();
        if (this._boundVisibilityHandler) {
            document.removeEventListener('visibilitychange', this._boundVisibilityHandler);
        }
    }
}

// Экспортируем singleton
export const authStateManager = new AuthStateManager();

/**
 * Toast Notification Manager
 * Система всплывающих уведомлений
 */

const TOAST_TYPES = {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info'
};

const TOAST_ICONS = {
    success: '<i class="fas fa-check-circle"></i>',
    error: '<i class="fas fa-times-circle"></i>',
    warning: '<i class="fas fa-exclamation-triangle"></i>',
    info: '<i class="fas fa-info-circle"></i>'
};

const DEFAULT_DURATION = 5000;

class ToastManager {
    constructor() {
        this.container = null;
        this.toasts = new Map();
        this.toastCounter = 0;
    }

    /**
     * Инициализация менеджера
     */
    init() {
        if (this.container) return;

        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        this.container.setAttribute('role', 'alert');
        this.container.setAttribute('aria-live', 'polite');
        document.body.appendChild(this.container);

        // Слушаем события для показа toast
        window.addEventListener('ShowToast', (e) => {
            const { type, title, message, duration, action } = e.detail;
            this.show({ type, title, message, duration, action });
        });
    }

    /**
     * Показать toast уведомление
     * @param {Object} options - Параметры toast
     * @param {string} options.type - Тип: success, error, warning, info
     * @param {string} options.title - Заголовок (опционально)
     * @param {string} options.message - Сообщение
     * @param {number} options.duration - Время показа в мс (0 = без автоскрытия)
     * @param {Object} options.action - Действие { label, callback }
     * @returns {string} - ID toast
     */
    show({ type = TOAST_TYPES.INFO, title = '', message = '', duration = DEFAULT_DURATION, action = null }) {
        if (!this.container) this.init();

        const id = `toast-${++this.toastCounter}`;
        const toast = this._createToastElement(id, type, title, message, action);

        this.container.appendChild(toast);
        this.toasts.set(id, toast);

        // Автоскрытие
        if (duration > 0) {
            const timeoutId = setTimeout(() => {
                this.hide(id);
            }, duration);
            toast.dataset.timeoutId = timeoutId;
        }

        return id;
    }

    /**
     * Скрыть toast
     * @param {string} id - ID toast
     */
    hide(id) {
        const toast = this.toasts.get(id);
        if (!toast) return;

        // Очищаем таймаут если есть
        if (toast.dataset.timeoutId) {
            clearTimeout(parseInt(toast.dataset.timeoutId));
        }

        // Анимация скрытия
        toast.classList.add('toast--hiding');
        toast.addEventListener('animationend', () => {
            toast.remove();
            this.toasts.delete(id);
        }, { once: true });
    }

    /**
     * Скрыть все toast
     */
    hideAll() {
        this.toasts.forEach((_, id) => this.hide(id));
    }

    /**
     * Создать DOM элемент toast
     */
    _createToastElement(id, type, title, message, action) {
        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.id = id;

        // Иконка
        const icon = document.createElement('div');
        icon.className = 'toast__icon';
        icon.innerHTML = TOAST_ICONS[type] || TOAST_ICONS.info;
        toast.appendChild(icon);

        // Контент
        const content = document.createElement('div');
        content.className = 'toast__content';

        if (title) {
            const titleEl = document.createElement('div');
            titleEl.className = 'toast__title';
            titleEl.textContent = title;
            content.appendChild(titleEl);
        }

        if (message) {
            const messageEl = document.createElement('div');
            messageEl.className = 'toast__message';
            messageEl.textContent = message;
            content.appendChild(messageEl);
        }

        // Кнопка действия
        if (action && action.label && action.callback) {
            const actionBtn = document.createElement('button');
            actionBtn.className = 'toast__action';
            actionBtn.textContent = action.label;
            actionBtn.onclick = (e) => {
                e.stopPropagation();
                action.callback();
                this.hide(id);
            };
            content.appendChild(actionBtn);
        }

        toast.appendChild(content);

        // Кнопка закрытия
        const closeBtn = document.createElement('button');
        closeBtn.className = 'toast__close';
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.onclick = () => this.hide(id);
        toast.appendChild(closeBtn);

        return toast;
    }

    // Удобные методы
    success(message, options = {}) {
        return this.show({ ...options, type: TOAST_TYPES.SUCCESS, message });
    }

    error(message, options = {}) {
        return this.show({ ...options, type: TOAST_TYPES.ERROR, message });
    }

    warning(message, options = {}) {
        return this.show({ ...options, type: TOAST_TYPES.WARNING, message });
    }

    info(message, options = {}) {
        return this.show({ ...options, type: TOAST_TYPES.INFO, message });
    }
}

export const toastManager = new ToastManager();
export { TOAST_TYPES };

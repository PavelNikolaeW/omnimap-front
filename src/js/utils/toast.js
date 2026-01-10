/**
 * Toast система для уведомлений в приложении
 * Показывает всплывающие уведомления о новых сообщениях и других событиях
 */
class ToastManager {
    constructor() {
        this.container = null
        this.toasts = []
        this.maxToasts = 3
        this.defaultDuration = 5000
    }

    /**
     * Инициализация контейнера для toast-уведомлений
     */
    init() {
        if (this.container) return

        this.container = document.createElement('div')
        this.container.className = 'toast-container'
        document.body.appendChild(this.container)
    }

    /**
     * Показать toast-уведомление
     * @param {Object} options - Опции уведомления
     * @param {string} options.title - Заголовок
     * @param {string} options.message - Текст сообщения
     * @param {string} options.type - Тип (info, success, warning, error, chat)
     * @param {number} options.duration - Длительность показа в мс (0 = бесконечно)
     * @param {Function} options.onClick - Callback при клике
     */
    show(options) {
        this.init()

        const {
            title,
            message,
            type = 'info',
            duration = this.defaultDuration,
            onClick
        } = options

        const toast = document.createElement('div')
        toast.className = `toast toast--${type}`
        toast.innerHTML = `
            <div class="toast-icon">${this.getIcon(type)}</div>
            <div class="toast-content">
                <div class="toast-title">${this.escapeHtml(title)}</div>
                <div class="toast-message">${this.escapeHtml(message)}</div>
            </div>
            <button class="toast-close" type="button" aria-label="Закрыть">&times;</button>
        `

        // Use AbortController for centralized listener cleanup
        const ac = new AbortController()
        toast._abortController = ac

        if (onClick) {
            toast.style.cursor = 'pointer'
            toast.addEventListener('click', (e) => {
                if (!e.target.classList.contains('toast-close')) {
                    onClick()
                    this.hide(toast)
                }
            }, { signal: ac.signal })
        }

        toast.querySelector('.toast-close').addEventListener('click', (e) => {
            e.stopPropagation()
            this.hide(toast)
        }, { signal: ac.signal })

        this.container.appendChild(toast)
        this.toasts.push(toast)

        // Ограничение количества toast
        while (this.toasts.length > this.maxToasts) {
            this.hide(this.toasts[0])
        }

        // Анимация появления
        requestAnimationFrame(() => toast.classList.add('toast--visible'))

        // Auto-hide
        if (duration > 0) {
            toast._hideTimeout = setTimeout(() => this.hide(toast), duration)
        }

        return toast
    }

    /**
     * Скрыть toast-уведомление
     * @param {HTMLElement} toast - Элемент toast
     */
    hide(toast) {
        if (!toast || !toast.parentNode) return

        if (toast._hideTimeout) {
            clearTimeout(toast._hideTimeout)
        }

        // Cleanup all event listeners via AbortController
        if (toast._abortController) {
            toast._abortController.abort()
        }

        toast.classList.remove('toast--visible')
        toast.classList.add('toast--hiding')

        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove()
            }
            this.toasts = this.toasts.filter(t => t !== toast)
        }, 300)
    }

    /**
     * Получить иконку для типа уведомления
     * @param {string} type - Тип уведомления
     * @returns {string} - HTML/emoji иконки
     */
    getIcon(type) {
        const icons = {
            info: '<i class="fas fa-info-circle"></i>',
            success: '<i class="fas fa-check-circle"></i>',
            warning: '<i class="fas fa-exclamation-triangle"></i>',
            error: '<i class="fas fa-times-circle"></i>',
            chat: '<i class="fas fa-comment"></i>',
            dm: '<i class="fas fa-user"></i>',
            group: '<i class="fas fa-users"></i>'
        }
        return icons[type] || icons.info
    }

    /**
     * Экранирование HTML для предотвращения XSS
     * @param {string} text - Исходный текст
     * @returns {string} - Экранированный текст
     */
    escapeHtml(text) {
        const div = document.createElement('div')
        div.textContent = text || ''
        return div.innerHTML
    }

    /**
     * Показать уведомление о новом сообщении в чате
     * @param {Object} options - Опции
     * @param {string} options.senderName - Имя отправителя
     * @param {string} options.message - Текст сообщения
     * @param {boolean} options.isGroup - Групповой чат
     * @param {Function} options.onClick - Callback при клике
     */
    showChatMessage(options) {
        const { senderName, message, isGroup, onClick } = options
        const title = isGroup
            ? `Новое сообщение в группе`
            : `Сообщение от ${senderName}`

        const truncatedMessage = message && message.length > 80
            ? message.substring(0, 80) + '...'
            : message || 'Новое сообщение'

        this.show({
            title,
            message: truncatedMessage,
            type: isGroup ? 'group' : 'dm',
            duration: 5000,
            onClick
        })
    }
}

export const toastManager = new ToastManager()

import {commands} from "./commands";
import localforage from "localforage";

/**
 * Конфигурация подменю
 * @type {Object.<string, {id: string, label: string, icon: string, items: string[]}>}
 */
export const submenuConfig = {
    // Подменю "Соединения" - объединяет работу со стрелками
    connections: {
        id: 'submenu-connections',
        label: 'Соединения',
        icon: 'fa-project-diagram',
        items: ['connectBlock', 'deleteConnectBlock', 'connectDashed', 'connectDouble']
    },
    // Подменю "Дополнительно" - редактирование, ссылки, права, уведомления
    extra: {
        id: 'submenu-extra',
        label: 'Дополнительно',
        icon: 'fa-bars',
        items: ['createUrl', 'editBlock', 'editAccessBlock', 'submenu-notifications']
    },
    // Подменю "Уведомления" - вложено в "Дополнительно"
    notifications: {
        id: 'submenu-notifications',
        label: 'Уведомления',
        icon: 'fa-bell',
        items: ['notificationSettings', 'blockReminder', 'watchBlock']
    }
};

// Команды, которые теперь скрыты в подменю (не показываются в основной панели)
const hiddenInSubmenu = new Set([
    'connectBlock', 'deleteConnectBlock', 'connectDashed', 'connectDouble',
    'createUrl', 'editBlock', 'editAccessBlock',
    'notificationSettings', 'blockReminder', 'watchBlock',
    'options' // Заменяем старую кнопку options на submenu-extra
]);

export class UIManager {
    constructor() {
        this.mode = undefined
        this.elements = {
            'control-panel': document.getElementById('control-panel'),
            'top-btn-container': document.getElementById('top-btn-container'),
        }
        this.activeSubmenu = null
        this.commandsById = null
    }

    /**
     * Рендерит кнопки команд в боковую панель
     * @param {string} mode - Текущий режим приложения
     * @param {Object} commandsById - Объект команд по id
     */
    renderBtn(mode, commandsById) {
        this.mode = mode
        this.commandsById = commandsById
        localforage.getItem('currentUser').then(user => {
            if ((user && user !== 'anonim') || window.location.search) {
                // Используем DocumentFragment для оптимизации DOM-операций
                const fragment = document.createDocumentFragment()

                Object.values(commandsById).forEach((cmd) => {
                    // Пропускаем команды, скрытые в подменю (используем Set для O(1) поиска)
                    if (hiddenInSubmenu.has(cmd.id)) return

                    if (cmd.mode?.includes(mode) && cmd.btn) {
                        const btn = cmd.btn
                        const containerId = btn.containerId
                        const element = this.createCommandButton(cmd)

                        if (containerId === 'control-panel') {
                            fragment.appendChild(element)
                        } else {
                            this.elements[containerId]?.appendChild(element)
                        }
                    }
                })

                // Добавляем все кнопки одной операцией
                this.elements['control-panel']?.appendChild(fragment)

                // Добавляем кнопки подменю
                this.renderSubmenuButtons()
            }
        })
    }

    /**
     * Создаёт кнопку для команды
     * @param {Object} cmd - Объект команды
     * @returns {HTMLButtonElement}
     */
    createCommandButton(cmd) {
        const element = document.createElement('button')
        element.id = cmd.id
        element.classList.add(...cmd.btn.classes)
        if (cmd.btn.icons) {
            cmd.btn.icons.forEach((icon) => {
                const i = document.createElement('i')
                i.classList.add(...icon)
                element.appendChild(i)
            })
        }
        element.setAttribute('title', `${cmd.btn.label} [${cmd.currentHotkey || ''}]`)
        return element
    }

    renderSubmenuButtons() {
        const container = this.elements['control-panel']

        // Кнопка подменю "Соединения"
        const connectionsBtn = this.createSubmenuButton(submenuConfig.connections)
        container.appendChild(connectionsBtn)

        // Кнопка подменю "Дополнительно" (заменяет старую options)
        const extraBtn = this.createSubmenuButton(submenuConfig.extra)
        container.appendChild(extraBtn)
    }

    createSubmenuButton(config) {
        const button = document.createElement('button')
        button.id = config.id
        button.classList.add('sidebar-button', 'fas', config.icon, 'fas-lg', 'submenu-trigger')
        button.setAttribute('title', config.label)
        button.setAttribute('data-submenu', config.id)
        // ARIA атрибуты для доступности
        button.setAttribute('aria-haspopup', 'true')
        button.setAttribute('aria-expanded', 'false')
        button.setAttribute('aria-label', config.label)
        return button
    }

    /**
     * Открывает подменю по id
     * @param {string} submenuId - ID подменю (например, 'submenu-connections')
     * @param {Object} ctx - Контекст (опционально)
     */
    openSubmenu(submenuId, ctx) {
        const container = this.elements['control-panel']
        if (!container) {
            console.warn('UIManager: control-panel not found')
            return
        }

        const configKey = submenuId?.replace('submenu-', '')
        const config = submenuConfig[configKey]

        if (!config) {
            console.warn(`UIManager: submenu config not found for ${submenuId}`)
            return
        }

        // Сохраняем текущее состояние
        this.activeSubmenu = submenuId

        // Используем DocumentFragment для оптимизации
        const fragment = document.createDocumentFragment()

        // Кнопка "Назад"
        const backBtn = document.createElement('button')
        backBtn.id = 'submenu-back'
        backBtn.classList.add('sidebar-button', 'fas', 'fa-arrow-left', 'fas-lg', 'submenu-back')
        backBtn.setAttribute('title', 'Назад')
        backBtn.setAttribute('aria-label', 'Вернуться в главное меню')
        fragment.appendChild(backBtn)

        // Рендерим элементы подменю
        config.items.forEach(itemId => {
            if (!itemId) return

            // Проверяем, это вложенное подменю или команда
            if (itemId.startsWith('submenu-')) {
                const nestedConfigKey = itemId.replace('submenu-', '')
                const nestedConfig = submenuConfig[nestedConfigKey]
                if (nestedConfig) {
                    const nestedBtn = this.createSubmenuButton(nestedConfig)
                    fragment.appendChild(nestedBtn)
                }
            } else {
                const cmd = this.commandsById?.[itemId]
                if (cmd?.btn) {
                    const element = this.createCommandButton(cmd)
                    element.setAttribute('role', 'menuitem')
                    element.setAttribute('aria-label', cmd.btn.label)
                    fragment.appendChild(element)
                }
            }
        })

        // Очищаем и добавляем все элементы одной операцией
        container.innerHTML = ''
        container.appendChild(fragment)

        // Устанавливаем роль меню для контейнера
        container.setAttribute('role', 'menu')
        container.setAttribute('aria-label', config.label)
    }

    /**
     * Закрывает текущее подменю и возвращает к основному меню
     */
    closeSubmenu() {
        this.activeSubmenu = null
        this.reRenderBtn(this.commandsById)
    }

    /**
     * Проверяет, открыто ли подменю
     * @returns {boolean}
     */
    isSubmenuOpen() {
        return this.activeSubmenu !== null
    }

    /**
     * Обрабатывает клик по элементу подменю
     * @param {string} targetId - ID элемента, по которому кликнули
     * @param {Object} ctx - Контекст
     * @returns {boolean} true если клик был обработан как действие подменю
     */
    handleSubmenuClick(targetId, ctx) {
        if (!targetId) return false

        if (targetId === 'submenu-back') {
            this.closeSubmenu()
            return true
        }

        if (targetId.startsWith('submenu-')) {
            this.openSubmenu(targetId, ctx)
            return true
        }

        return false
    }

    /**
     * Перерисовывает все кнопки
     * @param {Object} commandsById - Объект команд по id
     */
    reRenderBtn(commandsById) {
        this.commandsById = commandsById
        // Очищаем все контейнеры, где расположены кнопки
        Object.keys(this.elements).forEach((containerId) => {
            const element = this.elements[containerId]
            if (element) element.innerHTML = ''
        });
        // Если открыто подменю, восстанавливаем его
        if (this.activeSubmenu) {
            this.openSubmenu(this.activeSubmenu)
        } else {
            // Перерисовываем кнопки, используя сохранённый режим (или 'normal' по умолчанию)
            this.renderBtn(this.mode || 'normal', commandsById);
        }
    }
}

export const uiManager = new UIManager()
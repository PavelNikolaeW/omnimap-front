import {commands} from "./commands";
import localforage from "localforage";

// Конфигурация подменю
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
const hiddenInSubmenu = [
    'connectBlock', 'deleteConnectBlock', 'connectDashed', 'connectDouble',
    'createUrl', 'editBlock', 'editAccessBlock',
    'notificationSettings', 'blockReminder', 'watchBlock',
    'options' // Заменяем старую кнопку options на submenu-extra
];

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

    renderBtn(mode, commandsById) {
        this.mode = mode
        this.commandsById = commandsById
        localforage.getItem('currentUser').then(user => {
            if ((user && user !== 'anonim') || window.location.search) {
                Object.values(commandsById).forEach((cmd) => {
                    // Пропускаем команды, скрытые в подменю
                    if (hiddenInSubmenu.includes(cmd.id)) return

                    if (cmd.mode.includes(mode) && cmd.btn) {
                        const btn = cmd.btn
                        const containerId = btn.containerId
                        const element = document.createElement('button')

                        element.id = cmd.id
                        element.classList.add(...btn.classes)
                        if (btn.icons) {
                            btn.icons.forEach((icon) => {
                                const i = document.createElement('i')
                                i.classList.add(...icon)
                                element.appendChild(i)
                            })
                        }
                        element.setAttribute('title', `${btn.label} [${cmd.currentHotkey || ''}]`)
                        this.elements[containerId].appendChild(element)
                    }
                })

                // Добавляем кнопки подменю
                this.renderSubmenuButtons()
            }
        })
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
        return button
    }

    openSubmenu(submenuId, ctx) {
        const container = this.elements['control-panel']
        const configKey = submenuId.replace('submenu-', '')
        const config = submenuConfig[configKey]

        if (!config) return

        // Сохраняем текущее состояние
        this.activeSubmenu = submenuId

        // Очищаем контейнер
        container.innerHTML = ''

        // Кнопка "Назад"
        const backBtn = document.createElement('button')
        backBtn.id = 'submenu-back'
        backBtn.classList.add('sidebar-button', 'fas', 'fa-arrow-left', 'fas-lg', 'submenu-back')
        backBtn.setAttribute('title', 'Назад')
        container.appendChild(backBtn)

        // Рендерим элементы подменю
        config.items.forEach(itemId => {
            // Проверяем, это вложенное подменю или команда
            if (itemId.startsWith('submenu-')) {
                const nestedConfigKey = itemId.replace('submenu-', '')
                const nestedConfig = submenuConfig[nestedConfigKey]
                if (nestedConfig) {
                    const nestedBtn = this.createSubmenuButton(nestedConfig)
                    container.appendChild(nestedBtn)
                }
            } else {
                const cmd = this.commandsById[itemId]
                if (cmd && cmd.btn) {
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
                    container.appendChild(element)
                }
            }
        })
    }

    closeSubmenu() {
        this.activeSubmenu = null
        this.reRenderBtn(this.commandsById)
    }

    isSubmenuOpen() {
        return this.activeSubmenu !== null
    }

    handleSubmenuClick(targetId, ctx) {
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

    reRenderBtn(commandsById) {
        this.commandsById = commandsById
        // Очищаем все контейнеры, где расположены кнопки
        Object.keys(this.elements).forEach((containerId) => {
            this.elements[containerId].innerHTML = '';
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
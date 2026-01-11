import {commands} from "./commands";
import localforage from "localforage";
import { MODES } from "../../actions/selectionActions";
import { dispatch } from "../../utils/utils";

/**
 * Конфигурация подменю
 * @type {Object.<string, {id: string, label: string, icon: string, items: string[], requiresDiagramMode?: boolean}>}
 */
export const submenuConfig = {
    // Подменю "Диаграмма" - редактирование диаграмм и стрелок
    diagram: {
        id: 'submenu-diagram',
        label: 'Диаграмма',
        icon: 'fa-diagram-project',
        requiresDiagramMode: true,  // Требует выбора блока-диаграммы
        items: [
            'diagramGridColPlus', 'diagramGridColMinus',
            'diagramGridRowPlus', 'diagramGridRowMinus',
            'diagramSizeXs', 'diagramSizeS', 'diagramSizeM', 'diagramSizeL',
            'diagramAddBlock', 'diagramDeleteBlock',
            'diagramBlockStyle', 'submenu-connections',
            'diagramReset'
        ]
    },
    // Подменю "Соединения" - вложено в "Диаграмма"
    connections: {
        id: 'submenu-connections',
        label: 'Соединения',
        icon: 'fa-bezier-curve',
        items: ['connectBlock', 'connectDashed', 'connectDouble', 'connectCurved', 'connectStraight', 'deleteConnectBlock']
    },
    // Подменю "Дополнительно" - редактирование, ссылки, права, уведомления
    extra: {
        id: 'submenu-extra',
        label: 'Дополнительно',
        icon: 'fa-bars',
        items: ['createUrl', 'editBlock', 'editAccessBlock', 'repairTree', 'submenu-notifications']
    },
    // Подменю "Уведомления" - вложено в "Дополнительно"
    notifications: {
        id: 'submenu-notifications',
        label: 'Уведомления',
        icon: 'fa-bell',
        items: ['setReminder', 'watchBlock', 'notificationSettings']
    }
};

// Команды, которые теперь скрыты в подменю (не показываются в основной панели)
const hiddenInSubmenu = new Set([
    // Diagram команды
    'diagramGridColPlus', 'diagramGridColMinus', 'diagramGridRowPlus', 'diagramGridRowMinus',
    'diagramSizeXs', 'diagramSizeS', 'diagramSizeM', 'diagramSizeL',
    'diagramAddBlock', 'diagramDeleteBlock', 'diagramBlockStyle', 'diagramResetBlockStyle',
    'diagramConnectionSettings', 'diagramReset',
    // Connections команды (теперь в подменю diagram)
    'connectBlock', 'deleteConnectBlock', 'connectDashed', 'connectDouble', 'connectCurved', 'connectStraight',
    // Extra команды
    'createUrl', 'editBlock', 'editAccessBlock',
    'notificationSettings', 'setReminder', 'watchBlock',
    'repairTree', // Перенесено в подменю "Дополнительно"
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
        this.submenuHistory = []  // Стек истории подменю для навигации назад
        this.commandsById = null
        // Состояние для режима диаграммы
        this.diagramMode = false
        this.diagramBlockId = null
        this.diagramElement = null
        this.pendingDiagramSubmenu = false  // Ожидает выбора блока
        this.isOffline = !navigator.onLine

        // Обработчик ESC для выхода из режимов
        this.handleEscKey = this.handleEscKey.bind(this)
        document.addEventListener('keydown', this.handleEscKey)

        // Слушаем изменения статуса сети
        window.addEventListener('NetworkStatusChange', (e) => {
            this.isOffline = !e.detail.online
            this.updateOfflineButtons()
        })
    }

    /**
     * Обновляет состояние кнопок, недоступных в офлайн режиме
     */
    updateOfflineButtons() {
        if (!this.commandsById) return

        Object.values(this.commandsById).forEach((cmd) => {
            if (cmd.offlineDisabled && cmd.btn) {
                const button = document.getElementById(cmd.id)
                if (button) {
                    if (this.isOffline) {
                        button.classList.add('offline-disabled')
                        button.setAttribute('title', `${cmd.btn.label} [только онлайн]`)
                    } else {
                        button.classList.remove('offline-disabled')
                        button.setAttribute('title', `${cmd.btn.label} [${cmd.currentHotkey || ''}]`)
                    }
                }
            }
        })
    }

    /**
     * Обработчик клавиши ESC
     */
    handleEscKey(e) {
        if (e.key !== 'Escape') return

        // Если в режиме ожидания выбора блока - отменяем
        if (this.pendingDiagramSubmenu) {
            this.pendingDiagramSubmenu = false
            this.hideDiagramSelectionHint()
            return
        }

        // Если открыто подменю - возвращаемся назад
        if (this.activeSubmenu) {
            this.goBackSubmenu()
            return
        }
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
                // Очищаем контейнеры перед рендерингом, чтобы избежать дублирования кнопок
                Object.values(this.elements).forEach(element => {
                    if (element) element.innerHTML = ''
                })

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

                // Обновляем состояние кнопок для офлайн режима
                this.updateOfflineButtons()

                // Уведомляем о завершении рендеринга кнопок
                dispatch('UIButtonsRendered')
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
        element.setAttribute('data-testid', `command-btn-${cmd.id}`)
        if (cmd.btn.icons) {
            cmd.btn.icons.forEach((icon) => {
                const i = document.createElement('i')
                i.classList.add(...icon)
                element.appendChild(i)
            })
        }
        // Поддержка текстовых кнопок (для размеров диаграммы)
        if (cmd.btn.text) {
            element.textContent = cmd.btn.text
        }
        element.setAttribute('title', `${cmd.btn.label} [${cmd.currentHotkey || ''}]`)
        return element
    }

    /**
     * Рендерит кнопки подменю в панель управления
     * Подменю вставляются после основных кнопок работы с блоками для лучшего UX
     * Fallback: если кнопок недостаточно, подменю добавляются в конец панели
     */
    renderSubmenuButtons() {
        const container = this.elements['control-panel']
        if (!container) {
            console.warn('UIManager: control-panel not found for submenu buttons')
            return
        }

        // Находим позицию после основных кнопок работы с блоками
        // Вставляем подменю после 5-й кнопки (newBlock, editBlockTitle, editBlockText, cutBlock, copyBlock)
        const existingButtons = container.querySelectorAll('.sidebar-button')
        // Fallback: если кнопок меньше 5, вставляем в конец
        const insertPosition = existingButtons.length > 5 ? existingButtons[5] : null

        // Кнопка подменю "Диаграмма"
        const diagramBtn = this.createSubmenuButton(submenuConfig.diagram)
        if (insertPosition) {
            container.insertBefore(diagramBtn, insertPosition)
        } else {
            container.appendChild(diagramBtn)
        }

        // Кнопка подменю "Дополнительно" (заменяет старую options)
        const extraBtn = this.createSubmenuButton(submenuConfig.extra)
        // Вставляем после кнопки диаграммы
        if (diagramBtn.nextSibling) {
            container.insertBefore(extraBtn, diagramBtn.nextSibling)
        } else {
            container.appendChild(extraBtn)
        }
    }

    createSubmenuButton(config) {
        const button = document.createElement('button')
        button.id = config.id
        button.classList.add('sidebar-button', 'fas', config.icon, 'fas-lg', 'submenu-trigger')
        button.setAttribute('title', config.label)
        button.setAttribute('data-submenu', config.id)
        button.setAttribute('data-testid', `submenu-btn-${config.id}`)
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

        // Сохраняем текущее подменю в историю перед открытием нового
        if (this.activeSubmenu && this.activeSubmenu !== submenuId) {
            this.submenuHistory.push(this.activeSubmenu)
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
        this.submenuHistory = []  // Очищаем историю
        this.reRenderBtn(this.commandsById)
    }

    /**
     * Возвращается на один уровень назад в истории подменю
     * Если история пуста - закрывает подменю полностью
     */
    goBackSubmenu(ctx) {
        // Если выходим из diagram подменю - деактивируем режим
        if (this.activeSubmenu === 'submenu-diagram') {
            this.exitDiagramMode(ctx)
        }

        // Проверяем, есть ли история
        if (this.submenuHistory.length > 0) {
            // Возвращаемся к предыдущему подменю
            const previousSubmenu = this.submenuHistory.pop()
            this.activeSubmenu = null  // Сбрасываем, чтобы openSubmenu не добавил в историю
            this.openSubmenu(previousSubmenu, ctx)
        } else {
            // История пуста - закрываем подменю
            this.closeSubmenu()
        }
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
            // Используем goBackSubmenu для правильной навигации по истории
            this.goBackSubmenu(ctx)
            return true
        }

        if (targetId.startsWith('submenu-')) {
            const configKey = targetId.replace('submenu-', '')
            const config = submenuConfig[configKey]

            // Проверяем, требует ли подменю выбора блока-диаграммы
            if (config?.requiresDiagramMode) {
                // Если уже есть выбранный блок под курсором - используем его
                if (ctx?.blockElement) {
                    const blockId = ctx.blockElement.id?.split('*').pop()
                    if (blockId) {
                        this.enterDiagramMode(ctx, blockId, ctx.blockElement)
                        this.openSubmenu(targetId, ctx)
                        return true
                    }
                }
                // Иначе переходим в режим ожидания выбора блока
                this.pendingDiagramSubmenu = true
                this.showDiagramSelectionHint()
                return true
            }

            this.openSubmenu(targetId, ctx)
            return true
        }

        return false
    }

    /**
     * Входит в режим редактирования диаграммы
     */
    enterDiagramMode(ctx, blockId, blockElement) {
        this.diagramMode = true
        this.diagramBlockId = blockId
        this.diagramElement = blockElement

        // Устанавливаем режим для корректной обработки ESC
        if (ctx) {
            ctx.mode = MODES.DIAGRAM
        }

        // Визуальная индикация выбранного блока-диаграммы
        blockElement.classList.add('diagram-target-block')

        // Активируем diagramUtils для этого блока
        if (ctx?.diagramUtils) {
            ctx.diagramUtils.showInputs(blockId, blockElement)
        }

        this.hideDiagramSelectionHint()
    }

    /**
     * Выходит из режима редактирования диаграммы
     */
    exitDiagramMode(ctx) {
        if (this.diagramElement) {
            this.diagramElement.classList.remove('diagram-target-block')
        }

        // Деактивируем diagramUtils
        if (ctx?.diagramUtils) {
            ctx.diagramUtils.hiddenInputs()
        }

        this.diagramMode = false
        this.diagramBlockId = null
        this.diagramElement = null
        this.pendingDiagramSubmenu = false
        this.hideDiagramSelectionHint()
    }

    /**
     * Обработчик выбора блока в режиме ожидания diagram
     * Вызывается из commandManager при клике на блок
     */
    handleDiagramBlockSelection(ctx, blockId, blockElement) {
        if (!this.pendingDiagramSubmenu) return false

        this.enterDiagramMode(ctx, blockId, blockElement)
        this.pendingDiagramSubmenu = false
        this.openSubmenu('submenu-diagram', ctx)
        return true
    }

    /**
     * Показать подсказку о выборе блока-диаграммы
     */
    showDiagramSelectionHint() {
        let hint = document.getElementById('diagram-selection-hint')
        if (!hint) {
            hint = document.createElement('div')
            hint.id = 'diagram-selection-hint'
            hint.className = 'diagram-selection-hint'
            hint.textContent = 'Выберите блок для редактирования диаграммы'
            document.body.appendChild(hint)
        }
        hint.classList.add('visible')

        // Включаем подсветку блоков при наведении
        document.body.classList.add('diagram-selection-mode')
    }

    /**
     * Скрыть подсказку о выборе блока-диаграммы
     */
    hideDiagramSelectionHint() {
        const hint = document.getElementById('diagram-selection-hint')
        if (hint) {
            hint.classList.remove('visible')
        }
        document.body.classList.remove('diagram-selection-mode')
    }

    /**
     * Проверить, находимся ли в режиме ожидания выбора diagram блока
     */
    isPendingDiagramSelection() {
        return this.pendingDiagramSubmenu
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
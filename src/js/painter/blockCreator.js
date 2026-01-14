import gridClassManager from "./gridClassManager";
import cssConverter from "./cssConverter";
import CalcColor from "./calcBlockColor"
import {auth} from './views/auth'
import {registration} from './views/registration'
import {styleConfig} from "./styles";
import {offlineQueue} from "../sincManager/offlineQueue";


const viewRenderers = {
    'auth': auth,
    'registration': registration,
};

class BlockCreator {
    constructor() {
        this.arrows = new Set()
        this.colorist = new CalcColor()
        this.iframes = new Set()
        this.AllIframes = new Set()
        this.emptyBlocks = new Set()
    }

    createElement(block, parentBlock, screen, depth) {
        const element = this._createElement(block, parentBlock, screen, depth)

        if (block.data?.connections) this.arrows.add({connections: block.data?.connections, layout: block.size.layout})
        return element
    }

    _createElement(block, parentBlock, screen, depth) {
        const view = block.data?.view
        block.data?.arrows?.forEach((arrow) => {
            this.arrows.add(arrow)
        })
        let element
        if (block.empty) {
            element = this.createEmpty(block, parentBlock, screen, depth)
            return element
        } else {
            if (view === 'link') {
                element = this.createLink(block, parentBlock, screen, depth)
            } else if (view === 'iframe') {
                element = this.createIframe(block, parentBlock)
            } else if (view) {
                element = this.createCustomView(block, parentBlock, screen, depth)
            } else {
                element = this.create(block, parentBlock, screen, depth)
            }

            // Добавляем индикатор синхронизации если блок pending
            this._addSyncIndicator(element, block.id)
            return element
        }
    }

    create(block, parentBlock, screen, depth) {
        const element = document.createElement('div');
        const customClasses = block.data?.customClasses ? block.data.customClasses : []
        try {
            if (!parentBlock.size.layout.startsWith('xxxs')) {
                block.contentEl = this.createContent(element, block)
            }
            this._setBlockGrid(block, parentBlock)  // с учетом размера контента поэтому он в начале создается

            if (block.size.width <= 40) {
                block.contentEl = null
            } else if (block.contentEl) {
                element.appendChild(block.contentEl)
            }
            // element.setAttribute('width', `${Math.floor(block.size.width)}`)
            // element.setAttribute('height', `${Math.floor(block.size.height)}`)
            element.id = parentBlock.data?.view === 'link' ? `${parentBlock.id}*${block.id}` : block.id;
            element.setAttribute('data-testid', `block-${block.id}`);

            if (block.data.customGrid && Object.keys(block.data.customGrid).length) element.setAttribute('blockCustomGrid', '')

            this._setAttributes(element, block)
            this._applyStyles(element, ['block', ...this.styleLayout(block), ...(block.grid || []), ...(parentBlock.childrenPositions?.[block.id] || []), ...customClasses])

            // Применить кастомные стили блока (цвет, форма, тень и т.д.)
            this._applyCustomStyles(element, block.data?.customStyles)

            // Применить data-атрибуты для layoutCells (календарь, kanban и т.д.)
            this._applyLayoutCellsData(element, block, parentBlock)

            // Делаем блок draggable для HTML5 drag-and-drop
            // Исключаем только layoutCells (календарь, kanban) - там свой механизм
            // Диаграммы теперь поддерживают Shift+drag для перемещения в дерево
            if (!(parentBlock.data?.layout === 'cells' && parentBlock.data?.layoutCells)) {
                element.setAttribute('draggable', 'true');
            }

            block.color = this.colorist.calculateColor(element, block, [...(parentBlock.color || [])])
            this._applyStyles(block.contentEl, block.contentPosition)
        } catch (e) {
            console.log(block)
            console.error(`Не получилось создать блок ${e} ${block.id} \n${e.stack}`)
            element.textContent = 'ERROR'
        }
        return element
    }

    styleLayout(block) {
        const [size, form] = block.size.layout.split('-')
        const gap = styleConfig[size][form ?? 'table'].gap
        if (block.data?.customGrid && Object.keys(block.data?.customGrid).length) return [block.size.layout, 'gap_0px']
        return [block.size.layout, `gap_${this._calculateGap(block.children.length, gap, 2, )}px`]
    }
    _calculateGap(numElements, gapMax, gapMin) {
        // Используем формулу с коэффициентом, определяющим кривую снижения.
        // Чем больше constant, тем медленнее снижается gap для больших блоков.
        const constant = 10;
        // Формула, гарантирующая, что при numElements = 0 будет gapMax, а при бесконечном числе элементов – gapMin.
        return  Math.floor(gapMax - (gapMax - gapMin) * (numElements / (numElements + constant)));
    }

    createLink(block, parentBlock, screen, depth) {
        const element = document.createElement('div');
        const grid = ["grid-template-columns_1fr", "grid-template-rows_1fr"]
        const sourceId = block.data.source
        gridClassManager.calcBlockSize(block, parentBlock)

        element.id = block.id
        element.setAttribute('data-testid', `block-link-${block.id}`)
        element.setAttribute('blockLink', block.data.source)
        element.setAttribute('layout', block.size.layout)

        this._applyStyles(element, ['block-link', ...grid, ...(parentBlock.childrenPositions[block.id])])

        block.data.childOrder = [sourceId]
        block.childrenPositions = {[sourceId]: ['grid-column_1', 'grid-row_1']}
        block.grid = grid
        block.contentEl = null
        block.color = [...(parentBlock.color || [])]
        return element
    }

    createIframe(block, parentBlock) {
        if (!this.AllIframes.has(`iframe${block.id}`)) {
            const iframeElement = document.createElement(`iframe`,)
            iframeElement.id = `iframe${block.id}`
            iframeElement.style.position = 'absolute'
            iframeElement.setAttribute('block', '')
            block.data.attributes?.forEach((attr) => {
                iframeElement.setAttribute(attr.name, attr.value)
            })
            document.body.appendChild(iframeElement)
            this.AllIframes.add(`iframe${block.id}`)
        }
        this.iframes.add(block.id)

        const element = document.createElement('div');
        this._setBlockGrid(block, parentBlock)

        element.classList.add('iframe', 'block')
        element.id = block.id
        element.setAttribute('block', '')
        block.color = this.colorist.calculateColor(element, block, [...(parentBlock.color || [])])
        this._applyStyles(element, ['block', block.size.layout, ...(block.grid || []), ...(parentBlock.childrenPositions?.[block.id] || [])])
        return element
    }

    createEmpty(block, parentBlock, screen, depth) {
        const element = document.createElement('div')

        gridClassManager.calcBlockSize(block, parentBlock)
        this._applyStyles(element, ['block-empty'])
        element.id = block.id;
        element.setAttribute('emptyBlock', '')
        this.emptyBlocks.add(block.id)
        return element
    }

    createContent(element, block) {
        if (block.data?.view === 'link') {
            return null
        }

        const contentElement = document.createElement('div');
        let title = `<titleBlock><b>${block.title}</b></titleBlock>`
        if (block.data.titleIsVisible === false) title = ''

        contentElement.classList.add('defaultContent');
        contentElement.setAttribute('defaultContent', block.title)
        contentElement.setAttribute('data-testid', `block-content-${block.id}`)
        const content = block.data.text ? `<contentBlock>${block.data?.text}</contentBlock>` : '<contentBlock></contentBlock>'

        // Добавляем изображение если есть
        const imageHtml = this._createImageHtml(block, contentElement)

        contentElement.innerHTML = title + imageHtml + content

        block.data.contentAttributes?.forEach(attr => contentElement.setAttribute(attr.name, attr.value))
        block.data.layoutAttributes?.[block.size.layout].forEach(attr => contentElement.setAttribute(attr.name, attr.value))

        return contentElement
    }

    /**
     * Создаёт HTML для изображения блока и настраивает режим отображения
     * @param {Object} block - объект блока с данными изображения
     * @param {HTMLElement} contentElement - элемент контента для установки атрибутов
     * @returns {string} HTML строка с изображением или пустая строка
     */
    _createImageHtml(block, contentElement) {
        const image = block.data?.image
        if (!image?.thumbnail_url) {
            return ''
        }

        const imageUrl = image.url || image.thumbnail_url
        const thumbnailUrl = image.thumbnail_url
        // Санитизация filename для предотвращения XSS
        const safeFilename = this._sanitizeText(image.filename || 'Block image')

        // Атрибут для индикации наличия картинки (для маленьких блоков где картинка скрыта)
        contentElement.setAttribute('data-has-image', 'true')

        // Определяем режим image-only: есть картинка, но нет заголовка и текста
        const hasTitle = block.data.titleIsVisible !== false && block.title
        const hasText = block.data.text
        if (!hasTitle && !hasText) {
            contentElement.classList.add('block-image-only')
        }

        return `<div class="block-image-container" data-testid="block-image-${block.id}" data-fullsize-url="${imageUrl}">
            <img src="${thumbnailUrl}" alt="${safeFilename}" class="block-image" data-testid="block-image-tag-${block.id}" loading="lazy" />
        </div>`
    }

    /**
     * Санитизирует текст для безопасного использования в HTML атрибутах
     * @param {string} text - исходный текст
     * @returns {string} безопасный текст
     */
    _sanitizeText(text) {
        if (!text) return ''
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
    }

    _setAttributes(element, block) {
        const layout = block.size.layout

        element.setAttribute('block', '')
        element.setAttribute('layout', layout)

        block.data.attributes?.forEach(attr => element.setAttribute(attr.name, attr.value))
        block.data.layoutAttributes?.[layout].forEach(attr => element.setAttribute(attr.name, attr.value))
    }

    _applyStyles(element, styles) {
        if (element) {
            element.classList.add(...styles)
            cssConverter.generateStylesheet(styles)
            cssConverter.applyCssClasses(element, styles)
        }
    }

    /**
     * Добавляет индикатор статуса синхронизации к блоку
     * Показывает "галочку" если блок ожидает синхронизации
     * @param {HTMLElement} element - DOM элемент блока
     * @param {string} blockId - ID блока
     */
    _addSyncIndicator(element, blockId) {
        if (!element || !blockId) return

        // Проверяем, является ли блок pending (ожидает синхронизации)
        if (offlineQueue.isPendingBlock(blockId)) {
            // Убеждаемся что у блока position: relative для абсолютного позиционирования индикатора
            element.style.position = 'relative'

            const indicator = document.createElement('div')
            indicator.className = 'block-sync-indicator pending'
            indicator.setAttribute('data-block-sync', blockId)
            element.appendChild(indicator)
        }
    }

    /**
     * Применить кастомные стили к элементу блока
     * @param {HTMLElement} element - DOM элемент блока
     * @param {Object} customStyles - Объект стилей
     */
    _applyCustomStyles(element, customStyles) {
        if (!element || !customStyles) return

        // Inline styles для цветов
        if (customStyles.background) {
            element.style.backgroundColor = customStyles.background
        }
        if (customStyles.borderColor) {
            element.style.borderColor = customStyles.borderColor
        }

        // Data-атрибуты для CSS селекторов
        if (customStyles.border) {
            element.setAttribute('data-block-border', customStyles.border)
        }
        if (customStyles.shape) {
            element.setAttribute('data-block-shape', customStyles.shape)
        }
        if (customStyles.shadow) {
            element.setAttribute('data-block-shadow', customStyles.shadow)
        }
    }

    /**
     * Применяет data-атрибуты для layoutCells (календарь, kanban и т.д.)
     * @param {HTMLElement} element - DOM элемент блока
     * @param {Object} block - данные блока
     * @param {Object} parentBlock - родительский блок
     */
    _applyLayoutCellsData(element, block, parentBlock) {
        if (!element || !block.data) return

        const presetType = parentBlock?.layoutPresetType

        // Календарь: подсветка текущего дня и выходных
        // Поддерживает как месячный календарь (presetType='calendar'), так и годовой (calendarType='day')
        if (presetType === 'calendar' || block.data.calendarDay || block.data.calendarType) {
            // Тип календарного элемента (year, quarter, month, week, day)
            if (block.data.calendarType) {
                element.setAttribute('data-calendar-type', block.data.calendarType)
            }

            if (block.data.calendarDay) {
                element.setAttribute('data-calendar-day', block.data.calendarDay)
            }

            // Динамическое вычисление isToday на основе isoDate
            // Это позволяет корректно подсвечивать текущий день даже после смены даты
            if (block.data.isoDate) {
                const today = new Date().toISOString().split('T')[0]
                if (block.data.isoDate === today) {
                    element.setAttribute('data-calendar-today', 'true')
                }
            } else if (block.data.isToday) {
                // Fallback для старого формата без isoDate
                element.setAttribute('data-calendar-today', 'true')
            }

            if (block.data.isWeekend) {
                element.setAttribute('data-calendar-weekend', 'true')
            }

            // Номер недели для отображения
            if (block.data.calendarWeekNumber) {
                element.setAttribute('data-calendar-week', block.data.calendarWeekNumber)
            }
        }

        // Kanban: статус колонки
        if (presetType === 'kanban' || block.data.kanbanStatus) {
            if (block.data.kanbanColumn) {
                element.setAttribute('data-kanban-column', block.data.kanbanColumn)
            }
            if (block.data.kanbanStatus) {
                element.setAttribute('data-kanban-status', block.data.kanbanStatus)
            }
        }

        // Dashboard: роль элемента
        if (presetType === 'dashboard' || block.data.dashboardRole) {
            if (block.data.dashboardRole) {
                element.setAttribute('data-dashboard-role', block.data.dashboardRole)
            }
        }

        // Holy Grail: роль элемента (header, sidebar, content, footer)
        if (presetType === 'holy-grail' || block.data.layoutRole) {
            if (block.data.layoutRole) {
                element.setAttribute('data-layout-role', block.data.layoutRole)
            }
        }

        // Применяем inline стили из data.style если есть
        if (block.data.style) {
            if (block.data.style.backgroundColor) {
                element.style.backgroundColor = block.data.style.backgroundColor
            }
            if (block.data.style.borderColor) {
                element.style.borderColor = block.data.style.borderColor
            }
        }
    }

    createCustomView(block, parent) {
        return viewRenderers[block.data.view](block, parent)
    }

    _setBlockGrid(block, parentBlock) {
        if (block.data?.customGrid?.grid) {
            const customGrid = block.data.customGrid

            block.childrenPositions = customGrid.childrenPositions
            block.grid = customGrid.grid
            block.contentPosition = customGrid.contentPosition
            gridClassManager.manager(block, parentBlock)
        } else {
            let [grid, contentPosition, childrenPositions] = gridClassManager.manager(block, parentBlock)

            block.grid = grid
            block.childrenPositions = childrenPositions
            block.contentPosition = contentPosition
        }
    }
}

const blockCreator = new BlockCreator();
export default blockCreator;

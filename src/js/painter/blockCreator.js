import gridClassManager from "./gridClassManager";
import cssConverter from "./cssConverter";
import CalcColor from "./calcBlockColor"
import {auth} from './views/auth'
import {registration} from './views/registration'
import {styleConfig} from "./styles";
import {offlineQueue} from "../sincManager/offlineQueue";
import {isForbidden, isViewOnly, getPermissionDataAttribute, isInSandbox, isBlockOwner, getSandboxPermissionAttribute, isContainerOwner} from "../utils/permissionUtils";
import {authStateManager} from "../auth/authStateManager";
import {dispatch} from "../utils/utils";
import {deduplicateChildOrder} from "../utils/childOrderUtils";
import {getSafeColor, clamp} from "../utils/imageSettingsDefaults";


/**
 * Маппинг размеров блока на варианты изображения
 * Ключ - префикс layout размера блока, значение - название варианта
 */
const LAYOUT_TO_VARIANT = {
    'xxxs': 'thumb',   // < 150px
    'xxs': 'thumb',    // ~150px
    'xs': 'small',     // ~200-400px
    's': 'small',      // ~400px
    'm': 'medium',     // ~500-800px
    'l': 'large',      // ~900-1200px
    'xl': 'xlarge',    // ~1300-1600px
    'xxl': 'original', // > 1700px
};

/**
 * Выбирает подходящий вариант изображения на основе размера блока
 * @param {Object} image - объект изображения с variants
 * @param {string} layout - layout размер блока (например 'm-table')
 * @returns {Object} - объект с url и размерами выбранного варианта
 */
function selectImageVariant(image, layout) {
    // Fallback на старый формат если variants нет
    if (!image?.variants) {
        return {
            url: image?.url || image?.thumbnail_url,
            thumbnailUrl: image?.thumbnail_url,
            width: image?.width,
            height: image?.height
        };
    }

    const variants = image.variants;
    const layoutSize = layout?.split('-')[0] || 'm';
    const variantKey = LAYOUT_TO_VARIANT[layoutSize] || 'medium';

    // Пробуем получить запрошенный вариант, иначе fallback
    const variant = variants[variantKey] ||
                    variants.medium ||
                    variants.original ||
                    { url: image.url };

    return {
        url: variant.url,
        thumbnailUrl: variants.thumb?.url || image.thumbnail_url,
        width: variant.width || image.width,
        height: variant.height || image.height,
        // Все варианты для srcset
        variants
    };
}

/**
 * Генерирует srcset атрибут для адаптивной загрузки изображений
 * @param {Object} variants - объект вариантов изображения
 * @returns {string} - srcset строка
 */
function generateSrcset(variants) {
    if (!variants) return '';

    const srcsetParts = [];
    const variantOrder = ['thumb', 'small', 'medium', 'large', 'xlarge', 'original'];

    for (const key of variantOrder) {
        const variant = variants[key];
        if (variant?.url && variant?.width) {
            srcsetParts.push(`${variant.url} ${variant.width}w`);
        }
    }

    return srcsetParts.join(', ');
}

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
        // Кэш для текущей даты (обновляется раз в минуту)
        this._cachedToday = null
        this._todayCacheTime = 0
    }

    /**
     * Возвращает текущую дату в формате YYYY-MM-DD с кэшированием
     * Кэш обновляется каждую минуту для оптимизации рендеринга календаря
     */
    _getToday() {
        const now = Date.now()
        if (!this._cachedToday || now - this._todayCacheTime > 60000) {
            this._cachedToday = new Date().toISOString().split('T')[0]
            this._todayCacheTime = now
        }
        return this._cachedToday
    }

    createElement(block, parentBlock, screen, depth, renderContext = {}) {
        // Сохраняем контекст рендера для использования в _setBlockGrid
        // visibleChildren - отфильтрованный список детей для private sandbox
        if (renderContext.visibleChildren) {
            block._renderVisibleChildren = renderContext.visibleChildren;
        }

        // Наследование renderingMode от родителя ДО рендеринга
        // Если у блока нет собственного renderingMode, наследуем от родителя (если inheritToChildren !== false)
        if (!block.data?.renderingMode && parentBlock?.data?.renderingMode?.inheritToChildren !== false) {
            const parentRM = parentBlock.data?.renderingMode || parentBlock._inheritedRenderingMode;
            if (parentRM?.forceDefault || parentRM?.hideConnections) {
                block._inheritedRenderingMode = {
                    forceDefault: parentRM?.forceDefault,
                    hideConnections: parentRM?.hideConnections
                };
            }
        }

        const element = this._createElement(block, parentBlock, screen, depth)

        // Восстанавливаем оригинальный childOrder после рендера (если был подменён)
        if (block._originalChildOrder !== undefined) {
            block.data.childOrder = block._originalChildOrder;
            delete block._originalChildOrder;
        }

        // Очищаем временные данные рендера
        delete block._renderVisibleChildren;

        // Проверяем renderingMode для скрытия соединений
        const effectiveRenderingMode = block.data?.renderingMode || block._inheritedRenderingMode;
        if (block.data?.connections && !effectiveRenderingMode?.hideConnections) {
            this.arrows.add({connections: block.data?.connections, layout: block.size.layout});
        }

        // Очищаем временное свойство наследования после рендера
        delete block._inheritedRenderingMode;

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
                delete block._backgroundImageHtml
                console.log('create: block too small, skipping background', block.id, 'width:', block.size.width);
            } else if (block.contentEl) {
                // Background image добавляется первым (под контентом)
                if (block._backgroundImageHtml) {
                    console.log('create: inserting background image for', block.id);
                    element.insertAdjacentHTML('beforeend', block._backgroundImageHtml)
                    element.setAttribute('data-has-background-image', 'true')
                    delete block._backgroundImageHtml
                }
                element.appendChild(block.contentEl)
            } else {
                console.log('create: no contentEl for block', block.id, 'parentLayout:', parentBlock.size?.layout);
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

            // Применить цвет рамки из data.borderColor (Shift+1..9)
            this._applyBorderColor(element, block.data?.borderColor, block.data?.customStyles)

            // Применить data-атрибуты для layoutCells (календарь, kanban и т.д.)
            this._applyLayoutCellsData(element, block, parentBlock)

            // Применить индикатор прав доступа (forbidden, view-only, sandbox)
            this._applyPermissionIndicator(element, block, parentBlock)

            // Применить индикатор sandbox режима для контейнера
            this._applySandboxContainerIndicator(element, block, parentBlock)

            // Делаем блок draggable для HTML5 drag-and-drop
            // Исключаем только layoutCells (календарь, kanban) - там свой механизм
            // Диаграммы теперь поддерживают Shift+drag для перемещения в дерево
            if (!(parentBlock.data?.layout === 'cells' && parentBlock.data?.layoutCells)) {
                element.setAttribute('draggable', 'true');
            }

            block.color = this.colorist.calculateColor(element, block, [...(parentBlock.color || [])])
            this._applyStyles(block.contentEl, block.contentPosition)

            // Пробрасываем sandbox_mode от родителя для детей на любой глубине
            // Если у блока нет собственного sandbox_mode, наследуем от родителя
            if (!block.sandbox_mode && parentBlock.sandbox_mode) {
                block.sandbox_mode = parentBlock.sandbox_mode
            }
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
        // Используем childOrder как источник истины для расчёта grid
        const childCount = block.data?.childOrder?.length || 0;
        return [block.size.layout, `gap_${this._calculateGap(childCount, gap, 2)}px`]
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

        // Позиция блока в родителе (с защитой от undefined)
        const blockPosition = parentBlock.childrenPositions?.[block.id] || []

        // Обработка pending ссылки (ожидание доступа)
        if (block.data.pending) {
            element.setAttribute('data-pending', 'true')
            element.setAttribute('data-request-id', block.data.request_id || '')
            this._applyStyles(element, ['block-link', 'block-link--pending', ...grid, ...blockPosition])

            // Создаём заглушку вместо контента
            const placeholder = this._createPendingPlaceholder(block)
            element.appendChild(placeholder)

            // Не добавляем source в childOrder - его нельзя отрендерить
            block.data.childOrder = []
            block.childrenPositions = {}
            block.grid = grid
            block.contentEl = null
            block.color = [...(parentBlock.color || [])]
            return element
        }

        // Обработка удалённого источника ссылки
        if (block.data.source_deleted) {
            element.setAttribute('data-source-deleted', 'true')
            this._applyStyles(element, ['block-link', 'block-link--source-deleted', ...grid, ...blockPosition])

            // Создаём баннер об удалённом источнике
            const banner = this._createSourceDeletedBanner(block)
            element.appendChild(banner)

            // Используем childOrder от сервера (содержит перенесённых потомков)
            // Не добавляем source в childOrder - он удалён
            block.data.childOrder = block.data.childOrder || []
            block.childrenPositions = {}
            block.grid = grid
            block.contentEl = null
            block.color = [...(parentBlock.color || [])]
            return element
        }

        this._applyStyles(element, ['block-link', ...grid, ...blockPosition])

        block.data.childOrder = [sourceId]
        block.childrenPositions = {[sourceId]: ['grid-column_1', 'grid-row_1']}
        block.grid = grid
        block.contentEl = null
        block.color = [...(parentBlock.color || [])]

        // Пробрасываем sandbox_mode от родителя к ссылке,
        // чтобы source-блок внутри мог проверить sandbox-контекст
        block.sandbox_mode = parentBlock.sandbox_mode || null

        return element
    }

    /**
     * Создаёт заглушку для pending ссылки
     * @param {Object} block - блок-ссылка с pending статусом
     * @returns {HTMLElement} - DOM элемент заглушки
     */
    _createPendingPlaceholder(block) {
        const placeholder = document.createElement('div')
        placeholder.className = 'block-link-pending-placeholder'
        placeholder.setAttribute('data-testid', `pending-placeholder-${block.id}`)

        placeholder.innerHTML = `
            <div class="pending-placeholder__icon">
                <i class="fas fa-clock"></i>
            </div>
            <div class="pending-placeholder__text">
                <div class="pending-placeholder__title">Ожидание доступа</div>
                <div class="pending-placeholder__description">Запрос отправлен владельцу блока</div>
            </div>
        `

        return placeholder
    }

    /**
     * Создаёт баннер для ссылки с удалённым источником
     * @param {Object} block - блок-ссылка с source_deleted статусом
     * @returns {HTMLElement} - DOM элемент баннера
     */
    _createSourceDeletedBanner(block) {
        const banner = document.createElement('div')
        banner.className = 'block-link-deleted-banner'
        banner.setAttribute('data-testid', `deleted-banner-${block.id}`)

        const deletedTitle = this._sanitizeText(block.data.source_deleted_title) || 'Неизвестный блок'

        banner.innerHTML = `
            <div class="deleted-banner__icon">
                <i class="fas fa-unlink"></i>
            </div>
            <div class="deleted-banner__text">
                <div class="deleted-banner__title">Ссылка удалена</div>
                <div class="deleted-banner__description">Блок «${deletedTitle}» был удалён владельцем</div>
            </div>
        `

        return banner
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

        // DEBUG: проверяем image данные при рендере
        if (block.data?.image) {
            console.log('createContent: block has image', block.id, block.data.image);
        }

        // Проверяем режим background для изображения
        // Парсим settings если бек вернул их как строку (баг бека)
        let imageSettings = block.data?.image?.settings;
        if (typeof imageSettings === 'string') {
            try {
                imageSettings = JSON.parse(imageSettings);
                // Обновляем в блоке чтобы не парсить повторно
                block.data.image.settings = imageSettings;
            } catch (e) {
                console.warn('Failed to parse image settings:', e);
                imageSettings = null;
            }
        }
        const bgSettings = imageSettings?.background
        const isBackgroundMode = bgSettings?.enabled

        // Добавляем изображение: для background режима - сохраняем отдельно для добавления в блок
        const imageResult = this._createImageHtml(block, contentElement)
        let imageHtml = ''

        if (isBackgroundMode) {
            // В background режиме картинка будет добавлена непосредственно в блок (в методе create)
            block._backgroundImageHtml = imageResult
            console.log('createContent: setting background image for', block.id, '_backgroundImageHtml length:', imageResult?.length);
        } else {
            // Обычный режим: картинка внутри content
            imageHtml = imageResult
        }

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
        // Проверяем наличие изображения (поддержка старого и нового формата)
        if (!image?.thumbnail_url && !image?.variants?.thumb?.url) {
            return ''
        }

        // Выбираем подходящий вариант изображения на основе размера блока
        const layout = block.size?.layout || 'm-table'
        const selectedVariant = selectImageVariant(image, layout)

        // URL для отображения (подобран под размер блока)
        const displayUrl = selectedVariant.url
        // URL оригинала для fullscreen/download
        const originalUrl = image.variants?.original?.url || image.url || displayUrl

        // Санитизация filename для предотвращения XSS
        const safeFilename = this._sanitizeText(image.filename || 'Block image')

        // Получаем настройки или дефолты
        // Парсим settings если бек вернул их как строку (баг бека)
        let settings = image.settings || {};
        if (typeof settings === 'string') {
            try {
                settings = JSON.parse(settings);
                image.settings = settings; // Обновляем чтобы не парсить повторно
            } catch (e) {
                settings = {};
            }
        }
        const fitMode = settings.fitMode || 'auto'
        const position = settings.position || 'center'
        const bgSettings = settings.background || {}

        // Атрибут для индикации наличия картинки (для маленьких блоков где картинка скрыта)
        contentElement.setAttribute('data-has-image', 'true')

        // Data-атрибуты для CSS
        contentElement.setAttribute('data-image-fit', fitMode)
        contentElement.setAttribute('data-image-position', position)

        // Определяем режим image-only: есть картинка, но нет заголовка и текста
        const hasTitle = block.data.titleIsVisible !== false && block.title
        const hasText = block.data.text
        if (!hasTitle && !hasText) {
            contentElement.classList.add('block-image-only')
        }

        // Background режим
        if (bgSettings.enabled) {
            contentElement.setAttribute('data-image-background', 'true')
        }

        // Определяем auto режим на основе пропорций изображения
        const imgWidth = selectedVariant.width || image.width
        const imgHeight = selectedVariant.height || image.height
        let effectiveFitMode = fitMode
        if (fitMode === 'auto' && imgWidth && imgHeight) {
            const imageRatio = imgWidth / imgHeight
            // Квадратные картинки (0.8-1.2) → cover, иначе contain
            effectiveFitMode = (imageRatio > 0.8 && imageRatio < 1.2) ? 'cover' : 'contain'
        }

        // Inline стили для изображения
        const imgStyles = []
        const containerAttrs = []

        // Fit mode
        if (effectiveFitMode !== 'auto') {
            containerAttrs.push(`data-fit="${effectiveFitMode}"`)
        }

        // Position
        containerAttrs.push(`data-position="${position}"`)

        // Background режим - добавляем стили с валидацией
        if (bgSettings.enabled) {
            containerAttrs.push('data-background="true"')
            // Ограничиваем значения в допустимых диапазонах
            const opacity = clamp(bgSettings.opacity ?? 100, 0, 100) / 100
            const blur = clamp(bgSettings.blur ?? 0, 0, 20)
            const brightness = clamp(bgSettings.brightness ?? 100, 0, 200) / 100
            const contrast = clamp(bgSettings.contrast ?? 100, 0, 200) / 100
            const saturation = clamp(bgSettings.saturation ?? 100, 0, 200) / 100

            if (opacity < 1) {
                imgStyles.push(`opacity: ${opacity}`)
            }

            // Собираем CSS filter из нескольких значений
            const filters = []
            if (blur > 0) filters.push(`blur(${blur}px)`)
            if (brightness !== 1) filters.push(`brightness(${brightness})`)
            if (contrast !== 1) filters.push(`contrast(${contrast})`)
            if (saturation !== 1) filters.push(`saturate(${saturation})`)

            if (filters.length > 0) {
                imgStyles.push(`filter: ${filters.join(' ')}`)
            }
        }

        const imgStyleAttr = imgStyles.length > 0 ? ` style="${imgStyles.join('; ')}"` : ''

        // Overlay для background режима с валидацией цвета (защита от XSS)
        let overlayHtml = ''
        if (bgSettings.enabled && bgSettings.overlayColor && bgSettings.overlayOpacity > 0) {
            const safeOverlayColor = getSafeColor(bgSettings.overlayColor, '#000000')
            const overlayOpacity = clamp(bgSettings.overlayOpacity, 0, 100) / 100
            overlayHtml = `<div class="block-image-overlay" style="background-color: ${safeOverlayColor}; opacity: ${overlayOpacity};"></div>`
        }

        // Генерируем srcset для адаптивной загрузки
        const srcset = generateSrcset(selectedVariant.variants)
        const srcsetAttr = srcset ? ` srcset="${srcset}"` : ''
        // sizes атрибут для подсказки браузеру какой размер использовать
        const sizesAttr = srcset ? ' sizes="(max-width: 400px) 150px, (max-width: 800px) 400px, (max-width: 1200px) 800px, 1200px"' : ''

        return `<div class="block-image-container" data-testid="block-image-${block.id}" data-fullsize-url="${originalUrl}" ${containerAttrs.join(' ')}>
            <img src="${displayUrl}" alt="${safeFilename}" class="block-image" data-testid="block-image-tag-${block.id}" loading="lazy"${srcsetAttr}${sizesAttr}${imgStyleAttr} />
            ${overlayHtml}
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
     * Применить цвет рамки из block.data.borderColor
     * @param {HTMLElement} element - DOM элемент блока
     * @param {string} borderColor - hex цвет рамки или пустая строка/undefined
     * @param {Object} customStyles - кастомные стили для fallback
     */
    _applyBorderColor(element, borderColor, customStyles) {
        if (!element) return

        if (borderColor) {
            element.style.borderColor = borderColor
            if (!element.hasAttribute('data-block-border')) {
                element.setAttribute('data-block-border', 'medium')
            }
        } else {
            // Восстанавливаем borderColor из customStyles или очищаем
            if (customStyles?.borderColor) {
                element.style.borderColor = customStyles.borderColor
            } else {
                element.style.borderColor = ''
            }
            // Убираем data-block-border только если он не задан через customStyles
            if (!customStyles?.border && element.getAttribute('data-block-border') === 'medium') {
                element.removeAttribute('data-block-border')
            }
        }
    }

    /**
     * Применяет индикатор прав доступа к блоку
     * @param {HTMLElement} element - DOM элемент блока
     * @param {Object} block - данные блока
     * @param {Object} parentBlock - родительский блок (для sandbox проверки)
     */
    _applyPermissionIndicator(element, block, parentBlock) {
        if (!element || !block) return

        // Получаем текущего пользователя для sandbox проверки
        const currentUserId = authStateManager.getUser();

        // Сначала проверяем sandbox контекст
        // Если пользователь не определён, показываем все блоки как readonly в sandbox
        if (isInSandbox(parentBlock)) {
            const sandboxAttr = getSandboxPermissionAttribute(block, parentBlock, currentUserId);

            if (sandboxAttr) {
                element.setAttribute('data-permission', sandboxAttr);

                if (sandboxAttr === 'sandbox-readonly') {
                    element.setAttribute('title', 'Блок другого пользователя');
                }
            } else {
                // Убираем атрибуты если это свой блок в sandbox
                element.removeAttribute('data-permission');
                element.removeAttribute('title');
            }

            // Помечаем блоки владельца в sandbox
            if (isBlockOwner(block, currentUserId)) {
                element.setAttribute('data-block-owner', 'true');
            } else {
                element.removeAttribute('data-block-owner');
            }

            return;
        }

        // Стандартная логика для не-sandbox блоков
        const permissionAttr = getPermissionDataAttribute(block)

        if (permissionAttr) {
            element.setAttribute('data-permission', permissionAttr)

            if (isForbidden(block)) {
                element.setAttribute('title', 'Доступ запрещён')
                // Запрещаем drag для forbidden блоков
                element.removeAttribute('draggable')
            } else if (isViewOnly(block)) {
                element.setAttribute('title', 'Только для чтения')
                // View-only блоки можно drag, но нельзя редактировать
            }
        } else {
            // Убираем атрибуты если блок с полными правами (для переиспользования элементов)
            element.removeAttribute('data-permission')
            element.removeAttribute('title')
        }

        // Убираем sandbox-specific атрибуты если не в sandbox
        element.removeAttribute('data-block-owner');
    }

    /**
     * Применяет индикатор sandbox режима для контейнера
     * Иконка sandbox показывается только на верхнем уровне (корневом блоке sandbox):
     * - Open sandbox: иконку видят все участники
     * - Private sandbox: иконку видит только владелец контейнера
     * @param {HTMLElement} element - DOM элемент блока
     * @param {Object} block - данные блока
     * @param {Object} parentBlock - родительский блок
     */
    _applySandboxContainerIndicator(element, block, parentBlock) {
        if (!element || !block) return

        if (block.sandbox_mode) {
            element.setAttribute('data-sandbox-mode', block.sandbox_mode);

            // Блок является корневым sandbox если у него есть sandbox_mode,
            // а у родителя нет (иначе sandbox_mode был бы унаследован)
            const isRootSandbox = !parentBlock?.sandbox_mode

            if (isRootSandbox) {
                // Для private sandbox показываем иконку только владельцу
                if (block.sandbox_mode === 'private') {
                    if (isContainerOwner(block)) {
                        element.setAttribute('data-sandbox-root', 'true');
                    } else {
                        element.removeAttribute('data-sandbox-root');
                    }
                } else {
                    // Для open sandbox показываем иконку всем
                    element.setAttribute('data-sandbox-root', 'true');
                }
            } else {
                element.removeAttribute('data-sandbox-root');
            }
        } else {
            element.removeAttribute('data-sandbox-mode');
            element.removeAttribute('data-sandbox-root');
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
                if (block.data.isoDate === this._getToday()) {
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
        // Defensive: валидация childOrder перед расчётом grid
        if (block.data?.childOrder) {
            const uniqueChildOrder = deduplicateChildOrder(block.data.childOrder);
            if (uniqueChildOrder.length !== block.data.childOrder.length) {
                console.warn(`⚠️ Duplicate IDs in childOrder for block ${block.id}, fixing...`);
                block.data.childOrder = uniqueChildOrder;
                // Персистим исправленный childOrder в IndexedDB
                dispatch('SaveBlockField', {
                    blockId: block.id,
                    field: 'data',
                    value: block.data
                });
            }
        }

        // Для private sandbox используем отфильтрованный список детей
        // _renderVisibleChildren устанавливается в createElement() и содержит только видимых детей
        const isPrivateSandbox = block.sandbox_mode === 'private';
        const visibleChildren = block._renderVisibleChildren;

        // Если это private sandbox и есть отфильтрованный список - используем его для grid
        if (isPrivateSandbox && visibleChildren) {
            // Сохраняем оригинальный childOrder для восстановления в createElement
            block._originalChildOrder = block.data?.childOrder;
            block.data.childOrder = visibleChildren;
            // Для private sandbox отключаем кэш grid (разные пользователи видят разное)
            delete block.childrenPositions;
            delete block.grid;
        }

        // Проверяем актуальность кэша childrenPositions
        // Если количество позиций не совпадает с childOrder — кэш устарел
        const expectedChildCount = block.data?.childOrder?.length || 0;
        const cachedPositionsCount = Object.keys(block.childrenPositions || {}).length;

        if (cachedPositionsCount !== expectedChildCount) {
            // Кэш устарел — пересчитываем
            delete block.childrenPositions;
            delete block.grid;
        }

        // Проверяем версию childOrder — если изменилась, пересчитываем grid
        if (block._childOrderVersion && block._childOrderVersion !== block._lastRenderedVersion) {
            delete block.childrenPositions;
            delete block.grid;
            block._lastRenderedVersion = block._childOrderVersion;

            // Сохраняем _lastRenderedVersion в IndexedDB асинхронно
            // чтобы не потерять при перезагрузке страницы
            dispatch('SaveBlockField', {
                blockId: block.id,
                field: '_lastRenderedVersion',
                value: block._lastRenderedVersion
            });
        }

        // Проверяем forceDefault из renderingMode (собственного или унаследованного)
        const effectiveRenderingMode = block.data?.renderingMode || block._inheritedRenderingMode;
        const forceDefault = effectiveRenderingMode?.forceDefault;

        if (!forceDefault && block.data?.customGrid?.grid) {
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
        // Восстановление childOrder происходит в createElement после завершения рендера
    }
}

const blockCreator = new BlockCreator();
export default blockCreator;

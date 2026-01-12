import { Popup } from '../popups/popup.js';
import { dispatch, escapeHtml, stripHtmlTags } from '../../utils/utils.js';
import { GridLayoutCalculator } from '../../painter/gridLayoutCalculator.js';
import { LayoutCellManager } from './LayoutCellManager.js';
import { LayoutPreview } from './LayoutPreview.js';
import { LayoutDragManager } from './LayoutDragManager.js';
import { LayoutDataConverter } from './LayoutDataConverter.js';
import { localStateManager } from '../../stateLocal/localStateManager.js';
import { extractBlockId } from '../../actions/selectionActions.js';
import { importBlocks, pollImportStatus, generateBlockId } from '../../api/importService.js';

// Singleton instance для предотвращения множественных окон
let currentInstance = null;

/**
 * Категории пресетов для группировки в табах
 */
const PRESET_CATEGORIES = {
    dynamic: { name: 'Динамические', icon: '↔', hasCustom: false },
    grids: { name: 'Сетки', icon: '⊞', hasCustom: true },
    layouts: { name: 'Лейауты', icon: '◫', hasCustom: false },
    special: { name: 'Специальные', icon: '✦', hasCustom: false }
};

/**
 * Конфигурация пресетов с информацией о вместимости, категории и превью
 * maxBlocks - максимальное количество блоков (null = расширяемый)
 * minBlocks - рекомендуемое минимальное количество
 * description - описание пресета
 * category - категория для группировки
 * preview - ASCII-схема для превью (3x3 символов)
 */
const PRESET_CONFIG = {
    'horizontal': {
        maxBlocks: null,
        minBlocks: 0,
        description: 'Все блоки в горизонтальный ряд',
        category: 'dynamic',
        label: 'Горизонтальный',
        layoutType: 'columns',  // Использует layout: 'columns' вместо layoutCells
        preview: [
            '┌─────────────┐',
            '│ □ □ □ □ ... │',
            '└─────────────┘'
        ]
    },
    'vertical': {
        maxBlocks: null,
        minBlocks: 0,
        description: 'Все блоки в вертикальный столбец',
        category: 'dynamic',
        label: 'Вертикальный',
        layoutType: 'rows',  // Использует layout: 'rows' вместо layoutCells
        preview: [
            '┌───┐',
            '│ □ │',
            '│ □ │',
            '│...│',
            '└───┘'
        ]
    },
    '2x2': {
        maxBlocks: 4,
        minBlocks: 0,
        description: 'Простая сетка 2×2',
        category: 'grids',
        label: '2×2',
        preview: [
            '┌─┬─┐',
            '├─┼─┤',
            '└─┴─┘'
        ]
    },
    '3x3': {
        maxBlocks: 9,
        minBlocks: 0,
        description: 'Простая сетка 3×3',
        category: 'grids',
        label: '3×3',
        preview: [
            '┌─┬─┬─┐',
            '├─┼─┼─┤',
            '└─┴─┴─┘'
        ]
    },
    '4x4': {
        maxBlocks: 16,
        minBlocks: 0,
        description: 'Простая сетка 4×4',
        category: 'grids',
        label: '4×4',
        preview: [
            '┌┬┬┬┐',
            '├┼┼┼┤',
            '└┴┴┴┘'
        ]
    },
    'sidebar': {
        maxBlocks: null,
        minBlocks: 1,
        description: 'Боковая панель слева',
        category: 'layouts',
        label: 'Сайдбар',
        preview: [
            '┌──┬────┐',
            '│  │    │',
            '└──┴────┘'
        ]
    },
    'sidebar-right': {
        maxBlocks: null,
        minBlocks: 1,
        description: 'Боковая панель справа',
        category: 'layouts',
        label: 'Сайдбар R',
        preview: [
            '┌────┬──┐',
            '│    │  │',
            '└────┴──┘'
        ]
    },
    'dashboard': {
        maxBlocks: null,
        minBlocks: 1,
        description: 'Главный блок + виджеты + метрики',
        category: 'layouts',
        label: 'Dashboard',
        preview: [
            '┌───┬───┐',
            '│   ├───┤',
            '├─┬─┴─┬─┤'
        ]
    },
    'holy-grail': {
        maxBlocks: null,
        minBlocks: 1,
        description: 'Header + Footer + 3 колонки',
        category: 'layouts',
        label: 'Holy Grail',
        preview: [
            '┌──────┐',
            '├─┬──┬─┤',
            '└─┴──┴─┘'
        ]
    },
    'kanban': {
        maxBlocks: 3,
        minBlocks: 0,
        description: 'Доска: To Do, In Progress, Done',
        category: 'special',
        label: 'Kanban',
        preview: [
            '┌──┬──┬──┐',
            '│📋│⚡│✓ │',
            '└──┴──┴──┘'
        ]
    },
    'gallery': {
        maxBlocks: null,
        minBlocks: 1,
        description: 'Большие и маленькие карточки',
        category: 'special',
        label: 'Галерея',
        preview: [
            '┌────┬──┐',
            '│    ├──┤',
            '└────┴──┘'
        ]
    },
    'calendar': {
        maxBlocks: 35,
        minBlocks: 0,
        description: 'Календарь на месяц (5 недель)',
        category: 'special',
        label: 'Календарь',
        preview: [
            '┌─┬─┬─┬─┬─┬─┬─┐',
            '├─┼─┼─┼─┼─┼─┼─┤',
            '└─┴─┴─┴─┴─┴─┴─┘'
        ]
    }
};

/**
 * Визуальный редактор раскладки блоков
 * Позволяет настраивать положение дочерних блоков через drag-and-drop
 */
export class LayoutEditorPanel extends Popup {
    constructor(options = {}) {
        super({
            title: 'Редактор раскладки',
            size: 'lg',
            width: 900,
            height: 650,
            modal: true,
            draggable: true,
            closeOnEsc: true,
            closeOnOverlay: false,
            ...options
        });

        this.ctx = options.ctx;
        this.blockId = options.blockId;
        this.block = null;
        this.childBlocks = [];

        // Состояние сетки
        this.gridSize = { rows: 3, cols: 12 };
        this.cells = {};  // {childId: {row, col, rowSpan, colSpan}}
        this.placeholders = [];  // [{row, col, rowSpan, colSpan, text}] - placeholder блоки для превью
        this.currentPresetType = null;  // Тип текущего пресета: 'calendar', 'kanban', 'dashboard', etc.
        this.activeTab = 'dynamic';  // Активный таб в галерее пресетов
        this.dynamicLayoutType = null;  // Тип динамической раскладки: 'rows', 'columns' или null

        // Менеджеры
        this.cellManager = null;
        this.preview = null;
        this.dragManager = null;
        this.dataConverter = new LayoutDataConverter();

        // Флаг для защиты при закрытии
        this._isDestroyed = false;

        this.init();
    }

    /**
     * Статический метод для открытия редактора
     */
    static show(ctx) {
        // Предотвращаем открытие нескольких окон
        if (currentInstance) {
            return currentInstance;
        }

        const blockElement = ctx.blockElement;
        if (!blockElement) {
            console.warn('LayoutEditorPanel: No block element in context');
            return null;
        }

        const blockId = extractBlockId(blockElement);
        if (!blockId) {
            console.warn('LayoutEditorPanel: Could not extract block ID');
            return null;
        }

        // Проверяем, не использует ли блок customGrid
        const block = localStateManager.blocks.get(blockId);
        if (block?.data?.customGrid) {
            console.warn('LayoutEditorPanel: Block uses customGrid positioning');
            return null;
        }

        currentInstance = new LayoutEditorPanel({ ctx, blockId });
        return currentInstance;
    }

    /**
     * Инициализация редактора
     */
    init() {
        try {
            this.loadBlockData();

            // Проверяем, не был ли редактор закрыт
            if (this._isDestroyed) return;

            this.initFromExistingLayout();
            this.renderEditor();
            this.initManagers();
        } catch (error) {
            // Игнорируем ошибки если редактор уже закрыт
            if (this._isDestroyed) return;

            console.error('LayoutEditorPanel init error:', error);
            this.showMessage('Ошибка загрузки данных блока', 'error');
        }
    }

    /**
     * Загружает данные блока и его детей
     */
    loadBlockData() {
        this.block = localStateManager.blocks.get(this.blockId);
        if (!this.block) {
            throw new Error(`Block not found: ${this.blockId}`);
        }

        const childOrder = this.block.data?.childOrder || [];
        this.childBlocks = [];

        for (const childId of childOrder) {
            const child = localStateManager.blocks.get(childId);
            if (child) {
                this.childBlocks.push(child);
            }
        }
    }

    /**
     * Инициализирует состояние из существующего layout
     */
    initFromExistingLayout() {
        const layout = this.block.data?.layout;
        const layoutCells = this.block.data?.layoutCells;

        // Используем childBlocks как единственный источник правды
        // Это согласовано с rebuildOccupancyGrid() и applyPreset()
        const childOrder = this.childBlocks.map(b => b.id);
        const validChildIds = new Set(childOrder);

        // Проверяем динамические layouts (rows/columns)
        if (layout === 'rows') {
            this.dynamicLayoutType = 'rows';
            this.currentPresetType = 'vertical';
            this.activeTab = 'dynamic';
            // Генерируем виртуальную сетку для превью (Math.max для защиты от 0 детей)
            this.gridSize = { rows: Math.max(1, childOrder.length), cols: 1 };
            this.cells = {};
            childOrder.forEach((id, i) => {
                this.cells[id] = { row: i + 1, col: 1, rowSpan: 1, colSpan: 1 };
            });
            return;
        }

        if (layout === 'columns') {
            this.dynamicLayoutType = 'columns';
            this.currentPresetType = 'horizontal';
            this.activeTab = 'dynamic';
            // Генерируем виртуальную сетку для превью (Math.max для защиты от 0 детей)
            this.gridSize = { rows: 1, cols: Math.max(1, childOrder.length) };
            this.cells = {};
            childOrder.forEach((id, i) => {
                this.cells[id] = { row: 1, col: i + 1, rowSpan: 1, colSpan: 1 };
            });
            return;
        }

        if (layout === 'cells' && layoutCells?.cells) {
            // Используем существующую конфигурацию cells, фильтруя удалённые блоки
            this.gridSize = layoutCells.gridSize || { rows: 3, cols: 12 };

            // Фильтруем cells - оставляем только существующие блоки
            this.cells = {};
            for (const [childId, cell] of Object.entries(layoutCells.cells)) {
                if (validChildIds.has(childId)) {
                    this.cells[childId] = { ...cell };
                }
            }

            this.currentPresetType = layoutCells.presetType || null;
        } else if (this.block.childrenPositions) {
            // Извлекаем текущую авто-раскладку из отрендеренного блока
            const extracted = this.extractCurrentLayout();
            this.gridSize = extracted.gridSize;
            this.cells = extracted.cells;
        } else if (this.block.data?.groupSizes) {
            // Конвертируем из groupSizes
            const converted = this.dataConverter.groupSizesToCells(
                this.block.data.groupSizes,
                childOrder
            );
            this.gridSize = converted.gridSize;
            this.cells = converted.cells;
        } else {
            // Генерируем начальную конфигурацию
            const initial = GridLayoutCalculator.generateInitialCells(childOrder);
            this.gridSize = initial.gridSize;
            this.cells = initial.cells;
        }
    }

    /**
     * Извлекает текущую авто-раскладку из childrenPositions блока
     * Учитывает что строка 1 в CSS Grid - это content row,
     * поэтому блоки начинаются со строки 2
     */
    extractCurrentLayout() {
        const childrenPositions = this.block.childrenPositions || {};
        const grid = this.block.grid || [];
        const cells = {};

        // Извлекаем размер сетки из grid классов
        // grid-template-rows_auto__1fr__1fr__ - auto это content, 1fr это строки блоков
        let rows = 2, cols = 12;
        for (const cls of grid) {
            if (cls.includes('grid-template-columns_')) {
                cols = (cls.match(/1fr/g) || []).length;
            } else if (cls.includes('grid-template-rows_')) {
                // Считаем только 1fr - это строки для блоков (auto - content row)
                rows = (cls.match(/1fr/g) || []).length;
            }
        }
        rows = Math.max(1, rows);

        // Парсим позиции детей
        for (const [childId, posClasses] of Object.entries(childrenPositions)) {
            let col = 1, colEnd = 2, gridRowStart = 2, gridRowEnd = 3;

            for (const cls of posClasses) {
                // grid-column_1__5 -> col=1, colEnd=5
                const colMatch = cls.match(/grid-column_(\d+)__(\d+)/);
                if (colMatch) {
                    col = parseInt(colMatch[1], 10);
                    colEnd = parseInt(colMatch[2], 10);
                }
                // grid-row_2__3 -> gridRowStart=2, gridRowEnd=3 (с end)
                const rowRangeMatch = cls.match(/grid-row_(\d+)__(\d+)/);
                if (rowRangeMatch) {
                    gridRowStart = parseInt(rowRangeMatch[1], 10);
                    gridRowEnd = parseInt(rowRangeMatch[2], 10);
                } else {
                    // grid-row_2 -> gridRowStart=2, gridRowEnd=3 (без end)
                    const rowSingleMatch = cls.match(/grid-row_(\d+)$/);
                    if (rowSingleMatch) {
                        gridRowStart = parseInt(rowSingleMatch[1], 10);
                        gridRowEnd = gridRowStart + 1;
                    }
                }
            }

            // Конвертируем CSS Grid координаты в layoutCells координаты
            // CSS Grid row 2 = layoutCells row 1 (потому что row 1 - content)
            const row = gridRowStart - 1;
            const rowSpan = gridRowEnd - gridRowStart;

            cells[childId] = {
                row: Math.max(1, row),
                col,
                rowSpan: Math.max(1, rowSpan),
                colSpan: colEnd - col
            };
        }

        return {
            gridSize: { rows, cols },
            cells
        };
    }

    /**
     * Рендерит интерфейс редактора
     */
    renderEditor() {
        // Очищаем контент
        this.contentArea.innerHTML = '';
        this.contentArea.classList.add('layout-editor');

        // Toolbar сверху
        this.toolbar = document.createElement('div');
        this.toolbar.className = 'layout-editor__toolbar';
        this.contentArea.appendChild(this.toolbar);

        // Создаём структуру
        this.editorContainer = document.createElement('div');
        this.editorContainer.className = 'layout-editor__container';

        // Область превью
        this.previewArea = document.createElement('div');
        this.previewArea.className = 'layout-editor__preview';

        // Панель настроек
        this.settingsPanel = document.createElement('div');
        this.settingsPanel.className = 'layout-editor__settings';

        this.editorContainer.appendChild(this.previewArea);
        this.editorContainer.appendChild(this.settingsPanel);
        this.contentArea.appendChild(this.editorContainer);

        // Status bar снизу
        this.statusBar = document.createElement('div');
        this.statusBar.className = 'layout-editor__status-bar';
        this.contentArea.appendChild(this.statusBar);

        // Рендерим компоненты
        this.renderToolbar();
        this.renderPreview();
        this.renderSettings();
        this.renderStatusBar();
        this.renderButtons();
    }

    /**
     * Рендерит toolbar
     */
    renderToolbar() {
        const presetLabel = this.currentPresetType
            ? PRESET_CONFIG[this.currentPresetType]?.label || this.currentPresetType
            : 'Без пресета';

        this.toolbar.innerHTML = `
            <div class="toolbar__section toolbar__section--grid">
                <span class="toolbar__label">Сетка:</span>
                <input type="number" id="toolbar-rows" value="${this.gridSize.rows}" min="1" max="20" class="toolbar__input" title="Строк">
                <span class="toolbar__separator">×</span>
                <input type="number" id="toolbar-cols" value="${this.gridSize.cols}" min="1" max="24" class="toolbar__input" title="Колонок">
            </div>
            <div class="toolbar__section toolbar__section--preset">
                <span class="toolbar__preset-badge" title="Текущий пресет">${presetLabel}</span>
            </div>
            <div class="toolbar__section toolbar__section--actions">
                <button class="toolbar__btn" id="toolbar-add-block" title="Добавить блок (Enter)">
                    <span class="toolbar__btn-icon">+</span>
                    <span class="toolbar__btn-text">Блок</span>
                </button>
                <button class="toolbar__btn toolbar__btn--secondary" id="toolbar-reset" title="Сбросить раскладку">
                    Сбросить
                </button>
            </div>
        `;

        this.bindToolbarEvents();
    }

    /**
     * Привязывает события toolbar
     */
    bindToolbarEvents() {
        const rowsInput = this.toolbar.querySelector('#toolbar-rows');
        const colsInput = this.toolbar.querySelector('#toolbar-cols');
        const addBlockBtn = this.toolbar.querySelector('#toolbar-add-block');
        const resetBtn = this.toolbar.querySelector('#toolbar-reset');

        rowsInput?.addEventListener('change', (e) => {
            this.gridSize.rows = parseInt(e.target.value, 10) || 3;
            this.refreshPreview();
            this.updateStatusBar();
        });

        colsInput?.addEventListener('change', (e) => {
            this.gridSize.cols = parseInt(e.target.value, 10) || 12;
            this.refreshPreview();
            this.updateStatusBar();
        });

        addBlockBtn?.addEventListener('click', () => {
            this.addNewBlock();
        });

        resetBtn?.addEventListener('click', () => {
            this.resetLayout();
        });
    }

    /**
     * Добавляет новый блок в свободную ячейку
     * @param {number} retryCount - Счётчик попыток (защита от бесконечной рекурсии)
     */
    addNewBlock(retryCount = 0) {
        // Защита от бесконечной рекурсии
        if (retryCount > 10) {
            console.warn('Layout Editor: Unable to find free cell after grid expansion');
            return;
        }

        const freeCell = this.cellManager?.findFreeCell();
        if (!freeCell) {
            // Расширяем сетку
            this.gridSize.rows += 1;
            this.refreshPreview();
            this.updateToolbarInputs();
            this.updateStatusBar();
            // Повторно ищем свободную ячейку с увеличенным счётчиком
            setTimeout(() => this.addNewBlock(retryCount + 1), 50);
            return;
        }

        // Создаём placeholder для нового блока
        const blockId = generateBlockId();
        this.placeholders.push({
            row: freeCell.row,
            col: freeCell.col,
            rowSpan: 1,
            colSpan: 1,
            blockId,
            text: '',
            data: { text: '' }
        });

        this.refreshPreview();
        this.updateFillBlocksSection();
        this.updateStatusBar();
    }

    /**
     * Обновляет inputs в toolbar
     */
    updateToolbarInputs() {
        const rowsInput = this.toolbar?.querySelector('#toolbar-rows');
        const colsInput = this.toolbar?.querySelector('#toolbar-cols');
        if (rowsInput) rowsInput.value = this.gridSize.rows;
        if (colsInput) colsInput.value = this.gridSize.cols;
    }

    /**
     * Рендерит status bar
     */
    renderStatusBar() {
        this.updateStatusBar();
    }

    /**
     * Обновляет status bar
     */
    updateStatusBar() {
        if (!this.statusBar) return;

        const blockCount = this.childBlocks.length;
        const placeholderCount = this.placeholders.length;
        const totalBlocks = blockCount + placeholderCount;
        const presetLabel = this.currentPresetType
            ? PRESET_CONFIG[this.currentPresetType]?.label || this.currentPresetType
            : null;

        const presetInfo = presetLabel ? `<span class="status-bar__preset">Пресет: ${presetLabel}</span>` : '';
        const newBlocksInfo = placeholderCount > 0
            ? `<span class="status-bar__new">+${placeholderCount} новых</span>`
            : '';

        this.statusBar.innerHTML = `
            <div class="status-bar__left">
                <span class="status-bar__blocks">${totalBlocks} блоков</span>
                ${newBlocksInfo}
                ${presetInfo}
            </div>
            <div class="status-bar__right">
                <span class="status-bar__shortcuts">
                    <kbd>Tab</kbd> выбор
                    <span class="status-bar__sep">•</span>
                    <kbd>↑↓←→</kbd> двигать
                    <span class="status-bar__sep">•</span>
                    <kbd>Shift+↑↓</kbd> размер
                    <span class="status-bar__sep">•</span>
                    <kbd>1-4</kbd> пресеты
                    <span class="status-bar__sep">•</span>
                    <kbd>R</kbd> сброс
                </span>
            </div>
        `;
    }

    /**
     * Рендерит превью сетки
     */
    renderPreview() {
        this.preview = new LayoutPreview(
            this.previewArea,
            this.gridSize,
            this.cells,
            this.childBlocks
        );
        this.preview.render();
    }

    /**
     * Проверяет, доступен ли пресет для текущего количества блоков
     * @param {string} presetName - Имя пресета
     * @returns {{available: boolean, reason: string|null}}
     */
    isPresetAvailable(presetName) {
        const config = PRESET_CONFIG[presetName];
        if (!config) return { available: true, reason: null };

        const childCount = this.childBlocks.length;

        if (config.maxBlocks !== null && childCount > config.maxBlocks) {
            return {
                available: false,
                reason: `Слишком много блоков (${childCount}). Максимум: ${config.maxBlocks}`
            };
        }

        return { available: true, reason: null };
    }

    /**
     * Генерирует HTML для карточки пресета в галерее
     * @param {string} presetName - Имя пресета
     */
    renderPresetCard(presetName) {
        const config = PRESET_CONFIG[presetName] || {};
        const { available, reason } = this.isPresetAvailable(presetName);
        const isActive = this.currentPresetType === presetName;

        const previewHtml = (config.preview || []).map(line =>
            `<div class="preset-card__preview-line">${escapeHtml(line)}</div>`
        ).join('');

        const disabledClass = available ? '' : 'preset-card--disabled';
        const activeClass = isActive ? 'preset-card--active' : '';
        const disabledAttr = available ? '' : 'disabled';

        const statusHtml = !available
            ? `<div class="preset-card__status preset-card__status--disabled" title="${reason}">✗</div>`
            : isActive
                ? `<div class="preset-card__status preset-card__status--active">✓</div>`
                : '';

        const capacityHtml = config.maxBlocks
            ? `<span class="preset-card__capacity">${config.maxBlocks}</span>`
            : `<span class="preset-card__capacity preset-card__capacity--unlimited">∞</span>`;

        return `
            <button class="preset-card ${disabledClass} ${activeClass}" data-preset="${presetName}" ${disabledAttr}>
                ${statusHtml}
                <div class="preset-card__preview">${previewHtml}</div>
                <div class="preset-card__info">
                    <div class="preset-card__label">${config.label || presetName}</div>
                    <div class="preset-card__meta">
                        ${capacityHtml}
                    </div>
                </div>
            </button>
        `;
    }

    /**
     * Генерирует HTML для табов пресетов
     */
    renderPresetTabs() {
        return Object.entries(PRESET_CATEGORIES).map(([key, category]) => {
            const activeClass = this.activeTab === key ? 'preset-tab--active' : '';
            return `
                <button class="preset-tab ${activeClass}" data-tab="${key}">
                    <span class="preset-tab__icon">${category.icon}</span>
                    <span class="preset-tab__name">${category.name}</span>
                </button>
            `;
        }).join('');
    }

    /**
     * Генерирует HTML для содержимого таба
     * @param {string} categoryKey - Ключ категории
     * @param {Array} presets - Список пресетов в категории
     */
    renderTabContent(categoryKey, presets) {
        const category = PRESET_CATEGORIES[categoryKey];
        if (!category) return '';

        const cardsHtml = presets.map(preset => this.renderPresetCard(preset)).join('');

        // Добавляем карточку "Custom" для категории grids
        const customCardHtml = category.hasCustom ? this.renderCustomGridCard() : '';

        return `
            <div class="preset-tab-content" data-tab-content="${categoryKey}">
                <div class="preset-cards-grid">
                    ${cardsHtml}
                    ${customCardHtml}
                </div>
            </div>
        `;
    }

    /**
     * Генерирует HTML для карточки custom сетки
     */
    renderCustomGridCard() {
        const isCustomActive = this.currentPresetType === 'custom';
        const activeClass = isCustomActive ? 'preset-card--active' : '';

        return `
            <div class="preset-card preset-card--custom ${activeClass}" data-preset="custom">
                <div class="preset-card__preview">
                    <div class="preset-card__preview-line">┌─?─?─┐</div>
                    <div class="preset-card__preview-line">├─?─?─┤</div>
                    <div class="preset-card__preview-line">└─?─?─┘</div>
                </div>
                <div class="preset-card__info">
                    <div class="preset-card__label">Custom</div>
                </div>
            </div>
            <div class="custom-grid-input ${isCustomActive ? 'custom-grid-input--visible' : ''}" id="custom-grid-input">
                <div class="custom-grid-input__row">
                    <input type="number" id="custom-rows" min="1" max="12" value="${this.gridSize.rows}" class="custom-grid-input__field" placeholder="R">
                    <span class="custom-grid-input__sep">×</span>
                    <input type="number" id="custom-cols" min="1" max="24" value="${this.gridSize.cols}" class="custom-grid-input__field" placeholder="C">
                    <button class="custom-grid-input__btn" id="apply-custom-grid" title="Применить">✓</button>
                </div>
            </div>
        `;
    }

    /**
     * Рендерит панель настроек
     */
    renderSettings() {
        // Группируем пресеты по категориям
        const presetsByCategory = {};
        for (const [presetName, config] of Object.entries(PRESET_CONFIG)) {
            const cat = config.category || 'other';
            if (!presetsByCategory[cat]) presetsByCategory[cat] = [];
            presetsByCategory[cat].push(presetName);
        }

        // Генерируем HTML для табов
        const tabsHtml = this.renderPresetTabs();

        // Генерируем HTML для содержимого активного таба
        const activeTabContent = this.renderTabContent(
            this.activeTab,
            presetsByCategory[this.activeTab] || []
        );

        this.settingsPanel.innerHTML = `
            <div class="layout-settings__section layout-settings__section--presets">
                <div class="preset-tabs">
                    ${tabsHtml}
                </div>
                <div class="preset-gallery">
                    ${activeTabContent}
                </div>
            </div>

            <div class="layout-settings__section">
                <h4 class="layout-settings__title">Выбранный блок</h4>
                <div id="selected-block-info" class="layout-settings__info">
                    Кликните на блок для выбора
                </div>
            </div>

            <div class="layout-settings__section" id="fill-blocks-section" style="display: none;">
                <h4 class="layout-settings__title">Новые блоки</h4>
                <div class="layout-settings__info">
                    <span id="placeholders-count">0</span> блоков будет создано
                </div>
                <button class="layout-preset-btn layout-preset-btn--primary" id="fill-blocks-btn">
                    Создать блоки
                </button>
            </div>
        `;

        this.bindSettingsEvents();
    }

    /**
     * Привязывает события настроек
     */
    bindSettingsEvents() {
        // Tab clicks
        const tabs = this.settingsPanel.querySelectorAll('.preset-tab[data-tab]');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.activeTab = tab.dataset.tab;
                this.renderSettings();
            });
        });

        // Preset cards (не включая custom)
        const presetCards = this.settingsPanel.querySelectorAll('.preset-card[data-preset]:not(.preset-card--custom)');
        presetCards.forEach(card => {
            card.addEventListener('click', () => {
                if (card.disabled) return;
                this.applyPreset(card.dataset.preset);
                this.updatePresetCardsState();
            });
        });

        // Custom grid card
        const customCard = this.settingsPanel.querySelector('.preset-card--custom');
        customCard?.addEventListener('click', () => {
            this.toggleCustomGridInput();
        });

        // Custom grid apply button
        const applyBtn = this.settingsPanel.querySelector('#apply-custom-grid');
        applyBtn?.addEventListener('click', () => {
            this.applyCustomGrid();
        });

        // Custom grid inputs - apply on Enter
        const customRowsInput = this.settingsPanel.querySelector('#custom-rows');
        const customColsInput = this.settingsPanel.querySelector('#custom-cols');
        [customRowsInput, customColsInput].forEach(input => {
            input?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.applyCustomGrid();
                }
            });
        });

        // Fill blocks button
        const fillBlocksBtn = this.settingsPanel.querySelector('#fill-blocks-btn');
        fillBlocksBtn?.addEventListener('click', () => {
            this.createPlaceholderBlocks();
        });
    }

    /**
     * Переключает видимость поля ввода custom сетки
     */
    toggleCustomGridInput() {
        const customInput = this.settingsPanel.querySelector('#custom-grid-input');
        const customCard = this.settingsPanel.querySelector('.preset-card--custom');

        if (customInput) {
            const isVisible = customInput.classList.contains('custom-grid-input--visible');
            customInput.classList.toggle('custom-grid-input--visible', !isVisible);
            customCard?.classList.toggle('preset-card--active', !isVisible);

            if (!isVisible) {
                // Фокус на первое поле
                const rowsInput = customInput.querySelector('#custom-rows');
                rowsInput?.focus();
                rowsInput?.select();
            }
        }
    }

    /**
     * Применяет custom сетку
     */
    applyCustomGrid() {
        const rowsInput = this.settingsPanel.querySelector('#custom-rows');
        const colsInput = this.settingsPanel.querySelector('#custom-cols');

        if (!rowsInput || !colsInput) return;

        const rows = Math.max(1, Math.min(12, parseInt(rowsInput.value) || 3));
        const cols = Math.max(1, Math.min(24, parseInt(colsInput.value) || 3));

        // Сбрасываем текущий пресет
        this.currentPresetType = 'custom';
        this.placeholders = [];

        // Устанавливаем размер сетки
        this.gridSize = { rows, cols };

        // Создаём пустые ячейки для каждого блока
        const totalCells = rows * cols;
        let cellIndex = 0;
        for (const childId of Object.keys(this.cells)) {
            if (cellIndex >= totalCells) break;
            const row = Math.floor(cellIndex / cols) + 1;
            const col = (cellIndex % cols) + 1;
            this.cells[childId] = { row, col, rowSpan: 1, colSpan: 1 };
            cellIndex++;
        }

        // Обновляем UI
        this.cellManager.rebuildOccupancyGrid();
        this.refreshPreview();
        this.updateToolbarInputs();
        this.updateStatusBar();
        this.updatePresetCardsState();
    }

    /**
     * Обновляет состояние карточек пресетов (активная/неактивная)
     */
    updatePresetCardsState() {
        const presetCards = this.settingsPanel.querySelectorAll('.preset-card[data-preset]:not(.preset-card--custom)');
        presetCards.forEach(card => {
            const presetName = card.dataset.preset;
            const isActive = this.currentPresetType === presetName;
            const { available } = this.isPresetAvailable(presetName);

            card.classList.toggle('preset-card--active', isActive);
            card.classList.toggle('preset-card--disabled', !available);
            card.disabled = !available;

            // Обновляем статус
            let statusEl = card.querySelector('.preset-card__status');
            if (isActive && available) {
                if (!statusEl) {
                    statusEl = document.createElement('div');
                    statusEl.className = 'preset-card__status preset-card__status--active';
                    card.insertBefore(statusEl, card.firstChild);
                }
                statusEl.textContent = '✓';
                statusEl.className = 'preset-card__status preset-card__status--active';
            } else if (!available) {
                if (!statusEl) {
                    statusEl = document.createElement('div');
                    statusEl.className = 'preset-card__status preset-card__status--disabled';
                    card.insertBefore(statusEl, card.firstChild);
                }
                statusEl.textContent = '✗';
                statusEl.className = 'preset-card__status preset-card__status--disabled';
            } else if (statusEl) {
                statusEl.remove();
            }
        });

        // Обновляем состояние custom карточки
        const customCard = this.settingsPanel.querySelector('.preset-card--custom');
        const customInput = this.settingsPanel.querySelector('#custom-grid-input');
        if (customCard && customInput) {
            const isCustomActive = this.currentPresetType === 'custom';
            customCard.classList.toggle('preset-card--active', isCustomActive);
            customInput.classList.toggle('custom-grid-input--visible', isCustomActive);
        }
    }

    /**
     * Показывает/скрывает секцию создания блоков
     */
    updateFillBlocksSection() {
        const section = this.settingsPanel?.querySelector('#fill-blocks-section');
        const countEl = this.settingsPanel?.querySelector('#placeholders-count');

        if (section && countEl) {
            if (this.placeholders.length > 0) {
                section.style.display = 'block';
                countEl.textContent = this.placeholders.length;
            } else {
                section.style.display = 'none';
            }
        }
    }

    /**
     * Создаёт блоки из placeholders через bulk import
     * Placeholders содержат полные данные блоков (id, title, data, position)
     */
    async createPlaceholderBlocks() {
        if (this.placeholders.length === 0) return;

        // Сохраняем ID новых блоков для обновления childOrder
        const newBlockIds = this.placeholders.map(ph => ph.blockId);

        // Формируем payload для импорта
        const blocksToImport = this.placeholders.map(ph => ({
            id: ph.blockId,
            parent_id: this.blockId,
            title: ph.text || '',
            data: ph.data || {}
        }));

        try {
            // Запускаем импорт
            const { task_id } = await importBlocks(blocksToImport);

            // Ждём завершения
            await pollImportStatus(task_id, (progress) => {
                console.log('Import progress:', progress);
            });

            // Добавляем позиции для новых блоков в cells
            for (const ph of this.placeholders) {
                this.cells[ph.blockId] = {
                    row: ph.row,
                    col: ph.col,
                    rowSpan: ph.rowSpan,
                    colSpan: ph.colSpan
                };
            }

            // Обновляем childOrder родителя, добавляя новые блоки
            const currentChildOrder = this.block.data?.childOrder || [];
            const updatedChildOrder = [...currentChildOrder, ...newBlockIds];

            // Обновляем родительский блок с новым childOrder и layoutCells
            dispatch('UpdateDataBlock', {
                blockId: this.blockId,
                data: {
                    childOrder: updatedChildOrder,
                    layout: 'cells',
                    layoutCells: {
                        gridSize: this.gridSize,
                        cells: this.cells,
                        presetType: this.currentPresetType || null
                    }
                }
            });

            // Ждём обновления и перезагружаем данные
            await new Promise(resolve => setTimeout(resolve, 300));
            this.loadBlockData();

            // Очищаем placeholders
            this.placeholders = [];

            if (this.cellManager) {
                this.cellManager.rebuildOccupancyGrid();
            }

            this.refreshPreview();
            this.updateFillBlocksSection();

            // Перерендер родительского блока
            dispatch('ShowBlocks');

        } catch (error) {
            console.error('Failed to create blocks:', error);
            this.showMessage(`Ошибка создания блоков: ${error.message}`, 'error');
        }
    }

    /**
     * Применяет пресет раскладки
     * Пресеты показывают placeholders для недостающих блоков
     */
    applyPreset(presetName) {
        // Используем childBlocks как источник правды (согласовано с rebuildOccupancyGrid)
        const childOrder = this.childBlocks.map(b => b.id);
        let result;

        // Проверяем, является ли пресет динамическим (rows/columns)
        const presetConfig = PRESET_CONFIG[presetName];
        if (presetConfig?.layoutType) {
            // Динамический пресет - не использует cells
            this.dynamicLayoutType = presetConfig.layoutType;
            this.currentPresetType = presetName;
            this.placeholders = [];

            // Генерируем виртуальную сетку для превью
            if (presetConfig.layoutType === 'rows') {
                this.gridSize = { rows: Math.max(1, childOrder.length), cols: 1 };
                this.cells = {};
                childOrder.forEach((id, i) => {
                    this.cells[id] = { row: i + 1, col: 1, rowSpan: 1, colSpan: 1 };
                });
            } else if (presetConfig.layoutType === 'columns') {
                this.gridSize = { rows: 1, cols: Math.max(1, childOrder.length) };
                this.cells = {};
                childOrder.forEach((id, i) => {
                    this.cells[id] = { row: 1, col: i + 1, rowSpan: 1, colSpan: 1 };
                });
            }

            // Перестраиваем occupancy grid
            if (this.cellManager) {
                this.cellManager.rebuildOccupancyGrid();
            }

            this.refreshPreview();
            this.updateToolbarInputs();
            this.renderToolbar();
            this.updateStatusBar();
            return;
        }

        // Сбрасываем динамический тип для не-динамических пресетов
        this.dynamicLayoutType = null;

        switch (presetName) {
            case '2x2':
                this.gridSize = { rows: 2, cols: 2 };
                result = this.generateGridCellsWithPlaceholders(childOrder, 2, 2);
                break;

            case '3x3':
                this.gridSize = { rows: 3, cols: 3 };
                result = this.generateGridCellsWithPlaceholders(childOrder, 3, 3);
                break;

            case '4x4':
                this.gridSize = { rows: 4, cols: 4 };
                result = this.generateGridCellsWithPlaceholders(childOrder, 4, 4);
                break;

            case 'sidebar':
                this.gridSize = { rows: 3, cols: 12 };
                result = this.generateSidebarCellsWithPlaceholders(childOrder, 'left');
                break;

            case 'sidebar-right':
                this.gridSize = { rows: 3, cols: 12 };
                result = this.generateSidebarCellsWithPlaceholders(childOrder, 'right');
                break;

            case 'dashboard':
                this.gridSize = { rows: 3, cols: 12 };
                result = this.generateDashboardCellsWithPlaceholders(childOrder);
                break;

            case 'kanban':
                this.gridSize = { rows: 2, cols: 3 };
                result = this.generateKanbanCellsWithPlaceholders(childOrder);
                break;

            case 'holy-grail':
                this.gridSize = { rows: 3, cols: 12 };
                result = this.generateHolyGrailCellsWithPlaceholders(childOrder);
                break;

            case 'gallery':
                this.gridSize = { rows: 2, cols: 12 };
                result = this.generateGalleryCellsWithPlaceholders(childOrder);
                break;

            case 'calendar':
                this.gridSize = { rows: 5, cols: 7 };
                result = this.generateCalendarCellsWithPlaceholders(childOrder);
                break;

            default:
                return;
        }

        this.cells = result.cells;
        this.placeholders = result.placeholders;
        this.currentPresetType = presetName;  // Сохраняем тип пресета

        // Перестраиваем occupancy grid после изменения cells
        if (this.cellManager) {
            this.cellManager.rebuildOccupancyGrid();
        }

        this.refreshPreview();
        this.updateToolbarInputs();
        this.renderToolbar();  // Обновляем preset badge
        this.updateStatusBar();
    }

    /**
     * Генерирует ячейки для grid пресета с placeholders
     */
    generateGridCellsWithPlaceholders(childOrder, rows, cols) {
        const cells = {};
        const placeholders = [];
        let blockIndex = 0;

        for (let r = 1; r <= rows; r++) {
            for (let c = 1; c <= cols; c++) {
                const position = { row: r, col: c, rowSpan: 1, colSpan: 1 };
                if (blockIndex < childOrder.length) {
                    cells[childOrder[blockIndex]] = position;
                } else {
                    placeholders.push({
                        ...position,
                        blockId: generateBlockId(),
                        text: '',
                        data: { text: '' }
                    });
                }
                blockIndex++;
            }
        }

        return { cells, placeholders };
    }

    /**
     * Генерирует ячейки для sidebar пресета с placeholders
     */
    generateSidebarCellsWithPlaceholders(childOrder, side = 'left') {
        const cells = {};
        const placeholders = [];

        const sidebarCol = side === 'left' ? 1 : 9;
        const contentCol = side === 'left' ? 5 : 1;
        const contentColSpan = 8;

        // Определяем позиции для sidebar layout (минимум 3 блока)
        const positions = [
            { row: 1, col: sidebarCol, rowSpan: 2, colSpan: 4, label: 'Сайдбар' },
            { row: 1, col: contentCol, rowSpan: 1, colSpan: contentColSpan, label: 'Контент 1' },
            { row: 2, col: contentCol, rowSpan: 1, colSpan: contentColSpan, label: 'Контент 2' },
        ];

        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            if (i < childOrder.length) {
                cells[childOrder[i]] = { row: pos.row, col: pos.col, rowSpan: pos.rowSpan, colSpan: pos.colSpan };
            } else {
                placeholders.push({
                    row: pos.row, col: pos.col, rowSpan: pos.rowSpan, colSpan: pos.colSpan,
                    blockId: generateBlockId(),
                    text: pos.label,
                    data: { text: pos.label }
                });
            }
        }

        // Лишние блоки размещаем под контентом
        for (let i = positions.length; i < childOrder.length; i++) {
            const row = Math.floor((i - positions.length) / 2) + 3;
            const col = ((i - positions.length) % 2) * 6 + 1;
            cells[childOrder[i]] = { row, col, rowSpan: 1, colSpan: 6 };
        }

        return { cells, placeholders };
    }

    /**
     * Генерирует ячейки для Kanban с placeholders (3 колонки)
     * Первый ряд - заголовки колонок (To Do, In Progress, Done)
     */
    generateKanbanCellsWithPlaceholders(childOrder) {
        const cells = {};
        const placeholders = [];

        // Kanban: 3 колонки, первый ряд - заголовки
        const kanbanColumns = [
            { name: 'To Do', color: '#fef3c7', borderColor: '#f59e0b' },
            { name: 'In Progress', color: '#dbeafe', borderColor: '#3b82f6' },
            { name: 'Done', color: '#dcfce7', borderColor: '#22c55e' }
        ];

        let blockIndex = 0;

        // Первый ряд - заголовки колонок (занимают всю высоту)
        for (let col = 1; col <= 3; col++) {
            const columnDef = kanbanColumns[col - 1];
            const position = { row: 1, col, rowSpan: 2, colSpan: 1 };

            if (blockIndex < childOrder.length) {
                cells[childOrder[blockIndex]] = position;
                blockIndex++;
            } else {
                const blockId = generateBlockId();
                placeholders.push({
                    ...position,
                    blockId,
                    text: columnDef.name,
                    data: {
                        text: columnDef.name,
                        kanbanColumn: col,
                        kanbanStatus: columnDef.name.toLowerCase().replace(' ', '_'),
                        style: {
                            backgroundColor: columnDef.color,
                            borderColor: columnDef.borderColor
                        }
                    }
                });
            }
        }

        return { cells, placeholders };
    }

    /**
     * Генерирует ячейки для Holy Grail layout с placeholders
     */
    generateHolyGrailCellsWithPlaceholders(childOrder) {
        const cells = {};
        const placeholders = [];

        // Позиции для Holy Grail (5 блоков)
        const positions = [
            { row: 1, col: 1, rowSpan: 1, colSpan: 12, label: 'Header', color: '#e0e7ff' },
            { row: 2, col: 1, rowSpan: 1, colSpan: 3, label: 'Левый сайдбар', color: '#fef3c7' },
            { row: 2, col: 4, rowSpan: 1, colSpan: 6, label: 'Контент', color: '#ffffff' },
            { row: 2, col: 10, rowSpan: 1, colSpan: 3, label: 'Правый сайдбар', color: '#fef3c7' },
            { row: 3, col: 1, rowSpan: 1, colSpan: 12, label: 'Footer', color: '#f3f4f6' },
        ];

        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            if (i < childOrder.length) {
                cells[childOrder[i]] = { row: pos.row, col: pos.col, rowSpan: pos.rowSpan, colSpan: pos.colSpan };
            } else {
                placeholders.push({
                    row: pos.row, col: pos.col, rowSpan: pos.rowSpan, colSpan: pos.colSpan,
                    blockId: generateBlockId(),
                    text: pos.label,
                    data: {
                        text: pos.label,
                        layoutRole: pos.label.toLowerCase().replace(' ', '_'),
                        style: { backgroundColor: pos.color }
                    }
                });
            }
        }

        // Лишние блоки - под footer
        for (let i = positions.length; i < childOrder.length; i++) {
            const col = ((i - positions.length) % 3) * 4 + 1;
            const row = Math.floor((i - positions.length) / 3) + 4;
            cells[childOrder[i]] = { row, col, rowSpan: 1, colSpan: 4 };
        }

        return { cells, placeholders };
    }

    /**
     * Генерирует ячейки для Gallery с placeholders
     */
    generateGalleryCellsWithPlaceholders(childOrder) {
        const cells = {};
        const placeholders = [];
        const patterns = [
            { colSpan: 6, rowSpan: 2, label: 'Большой', size: 'large' },
            { colSpan: 3, rowSpan: 1, label: 'Маленький', size: 'small' },
            { colSpan: 3, rowSpan: 1, label: 'Маленький', size: 'small' },
        ];

        // Целевое количество - заполняем по паттерну
        const targetCount = 3;

        let currentRow = 1;
        let currentCol = 1;
        const maxCols = 12;

        for (let i = 0; i < Math.max(targetCount, childOrder.length); i++) {
            const pattern = patterns[i % patterns.length];

            if (currentCol + pattern.colSpan > maxCols + 1) {
                currentRow += 2;
                currentCol = 1;
            }

            const position = {
                row: currentRow,
                col: currentCol,
                rowSpan: pattern.rowSpan,
                colSpan: pattern.colSpan
            };

            if (i < childOrder.length) {
                cells[childOrder[i]] = position;
            } else if (i < targetCount) {
                placeholders.push({
                    ...position,
                    blockId: generateBlockId(),
                    text: pattern.label,
                    data: {
                        text: pattern.label,
                        gallerySize: pattern.size
                    }
                });
            }

            currentCol += pattern.colSpan;
        }

        return { cells, placeholders };
    }

    /**
     * Генерирует ячейки для календаря с placeholders
     * Создаёт блоки с актуальными датами текущего месяца
     */
    generateCalendarCellsWithPlaceholders(childOrder) {
        const cells = {};
        const placeholders = [];

        // Получаем первый день текущего месяца
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const startDayOfWeek = firstDay.getDay(); // 0 = воскресенье

        // Сдвиг для начала с понедельника (0 = пн, 6 = вс)
        const mondayOffset = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

        // Количество дней в месяце
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

        // Названия месяцев
        const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                           'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        const monthName = monthNames[today.getMonth()];

        let blockIndex = 0;
        const daysNeeded = 35; // 5 недель × 7 дней

        for (let i = 0; i < daysNeeded; i++) {
            const row = Math.floor(i / 7) + 1;
            const col = (i % 7) + 1;
            const position = { row, col, rowSpan: 1, colSpan: 1 };

            // Вычисляем день месяца
            const dayNum = i - mondayOffset + 1;
            const isValidDay = dayNum >= 1 && dayNum <= daysInMonth;
            const isWeekend = col === 6 || col === 7; // Сб, Вс
            const isToday = isValidDay && dayNum === today.getDate();

            if (blockIndex < childOrder.length) {
                cells[childOrder[blockIndex]] = position;
                blockIndex++;
            } else {
                // Создаём placeholder с полными данными
                const blockId = generateBlockId();
                const dayText = isValidDay ? `${dayNum}` : '';
                const fullDate = isValidDay
                    ? `${dayNum} ${monthName}`
                    : '';

                placeholders.push({
                    ...position,
                    blockId,
                    text: dayText,
                    data: {
                        text: fullDate,
                        calendarDay: isValidDay ? dayNum : null,
                        calendarMonth: today.getMonth() + 1,
                        calendarYear: today.getFullYear(),
                        isWeekend,
                        isToday,
                        // Цвета выходных вычисляются автоматически в CalcColor.applyWeekendShift()
                        // isToday подсвечивается через CSS [data-calendar-today]
                    }
                });
            }
        }

        return { cells, placeholders };
    }

    /**
     * Генерирует ячейки для dashboard пресета с placeholders
     */
    generateDashboardCellsWithPlaceholders(childOrder) {
        const cells = {};
        const placeholders = [];

        // Позиции для Dashboard (6 блоков)
        const positions = [
            { row: 1, col: 1, rowSpan: 2, colSpan: 6, label: 'Главный', role: 'main', color: '#dbeafe' },
            { row: 1, col: 7, rowSpan: 1, colSpan: 6, label: 'Виджет 1', role: 'widget', color: '#fef3c7' },
            { row: 2, col: 7, rowSpan: 1, colSpan: 6, label: 'Виджет 2', role: 'widget', color: '#dcfce7' },
            { row: 3, col: 1, rowSpan: 1, colSpan: 4, label: 'Метрика 1', role: 'metric', color: '#fce7f3' },
            { row: 3, col: 5, rowSpan: 1, colSpan: 4, label: 'Метрика 2', role: 'metric', color: '#e0e7ff' },
            { row: 3, col: 9, rowSpan: 1, colSpan: 4, label: 'Метрика 3', role: 'metric', color: '#fef9c3' },
        ];

        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            if (i < childOrder.length) {
                cells[childOrder[i]] = { row: pos.row, col: pos.col, rowSpan: pos.rowSpan, colSpan: pos.colSpan };
            } else {
                placeholders.push({
                    row: pos.row, col: pos.col, rowSpan: pos.rowSpan, colSpan: pos.colSpan,
                    blockId: generateBlockId(),
                    text: pos.label,
                    data: {
                        text: pos.label,
                        dashboardRole: pos.role,
                        style: { backgroundColor: pos.color }
                    }
                });
            }
        }

        // Лишние блоки - добавляем строки снизу
        for (let i = positions.length; i < childOrder.length; i++) {
            const row = Math.floor((i - positions.length) / 3) + 4;
            const col = ((i - positions.length) % 3) * 4 + 1;
            cells[childOrder[i]] = { row, col, rowSpan: 1, colSpan: 4 };
        }

        return { cells, placeholders };
    }

    /**
     * Обновляет превью
     */
    refreshPreview() {
        if (this.preview) {
            this.preview.update(this.gridSize, this.cells, this.placeholders, this.childBlocks);
        }
        this.updateFillBlocksSection();
    }

    /**
     * Инициализирует менеджеры
     */
    initManagers() {
        this.cellManager = new LayoutCellManager(this);
        this.dragManager = new LayoutDragManager(this);
    }

    /**
     * Рендерит кнопки действий
     */
    renderButtons() {
        // Удаляем старые кнопки если есть
        const existingButtons = this.popupEl.querySelector('.popup-buttons');
        if (existingButtons) {
            existingButtons.remove();
        }

        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'popup-buttons';

        const applyBtn = document.createElement('button');
        applyBtn.className = 'popup-button-submit';
        applyBtn.textContent = 'Применить';
        applyBtn.addEventListener('click', () => this.applyLayout());

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'popup-button-cancel';
        cancelBtn.textContent = 'Отмена';
        cancelBtn.addEventListener('click', () => this.close());

        const resetBtn = document.createElement('button');
        resetBtn.className = 'popup-button-cancel';
        resetBtn.textContent = 'Сбросить';
        resetBtn.addEventListener('click', () => this.resetLayout());

        buttonsContainer.appendChild(resetBtn);
        buttonsContainer.appendChild(cancelBtn);
        buttonsContainer.appendChild(applyBtn);

        this.popupEl.appendChild(buttonsContainer);
    }

    /**
     * Применяет раскладку
     * Валидирует что все childBlocks имеют позиции
     */
    applyLayout() {
        // Проверяем, используется ли динамический layout (rows/columns)
        if (this.dynamicLayoutType) {
            dispatch('UpdateDataBlock', {
                blockId: this.blockId,
                data: {
                    layout: this.dynamicLayoutType,  // 'rows' или 'columns'
                    layoutCells: null  // Убираем layoutCells для динамических layouts
                }
            });

            this.close();

            // Перерендер блока
            setTimeout(() => {
                dispatch('ShowBlocks');
            }, 100);
            return;
        }

        // Стандартная логика для cells layouts
        // Валидация: убеждаемся что все childBlocks имеют позиции
        const missingBlocks = this.childBlocks.filter(b => !this.cells[b.id]);

        if (missingBlocks.length > 0) {
            // Автоматически размещаем блоки без позиций в свободные ячейки
            for (const block of missingBlocks) {
                const freeCell = this.cellManager?.findFreeCell();
                if (freeCell) {
                    this.cells[block.id] = {
                        row: freeCell.row,
                        col: freeCell.col,
                        rowSpan: 1,
                        colSpan: 1
                    };
                    // Обновляем occupancy grid
                    this.cellManager?.rebuildOccupancyGrid();
                } else {
                    // Нет свободного места - добавляем новую строку
                    this.gridSize.rows += 1;
                    this.cells[block.id] = {
                        row: this.gridSize.rows,
                        col: 1,
                        rowSpan: 1,
                        colSpan: this.gridSize.cols
                    };
                }
            }
        }

        dispatch('UpdateDataBlock', {
            blockId: this.blockId,
            data: {
                layout: 'cells',
                layoutCells: {
                    gridSize: this.gridSize,
                    cells: this.cells,
                    presetType: this.currentPresetType || null
                }
            }
        });

        this.close();

        // Перерендер блока
        setTimeout(() => {
            dispatch('ShowBlocks');
        }, 100);
    }

    /**
     * Сбрасывает раскладку к авто-режиму (удаляет layoutCells)
     */
    resetLayout() {
        // Сбрасываем внутреннее состояние
        this.dynamicLayoutType = null;
        this.currentPresetType = null;

        // Удаляем кастомную раскладку из блока
        dispatch('UpdateDataBlock', {
            blockId: this.blockId,
            data: {
                layout: null,
                layoutCells: null
            }
        });

        this.close();

        // Перерендер блока
        setTimeout(() => {
            dispatch('ShowBlocks');
        }, 100);
    }

    /**
     * Обновляет информацию о выбранном блоке
     */
    updateSelectedBlockInfo(childId) {
        const infoEl = this.settingsPanel.querySelector('#selected-block-info');
        if (!infoEl) return;

        if (!childId) {
            infoEl.innerHTML = 'Кликните на блок для выбора';
            return;
        }

        const cell = this.cells[childId];
        const block = this.childBlocks.find(b => b.id === childId);
        const rawTitle = stripHtmlTags(block?.data?.text || '').substring(0, 30) || 'Без названия';
        const title = escapeHtml(rawTitle);

        infoEl.innerHTML = `
            <div class="selected-block__title">${title}</div>
            <div class="selected-block__controls">
                <div class="control-row">
                    <label>Строка:</label>
                    <input type="number" value="${cell?.row || 1}" min="1" data-field="row" class="span-input">
                </div>
                <div class="control-row">
                    <label>Колонка:</label>
                    <input type="number" value="${cell?.col || 1}" min="1" data-field="col" class="span-input">
                </div>
                <div class="control-row">
                    <label>Высота:</label>
                    <input type="number" value="${cell?.rowSpan || 1}" min="1" data-field="rowSpan" class="span-input">
                </div>
                <div class="control-row">
                    <label>Ширина:</label>
                    <input type="number" value="${cell?.colSpan || 1}" min="1" data-field="colSpan" class="span-input">
                </div>
            </div>
        `;

        // Bind span input events
        const spanInputs = infoEl.querySelectorAll('.span-input');
        spanInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                const field = e.target.dataset.field;
                const value = parseInt(e.target.value, 10) || 1;

                const currentCell = this.cells[childId] || { row: 1, col: 1, rowSpan: 1, colSpan: 1 };
                const newCell = { ...currentCell, [field]: value };

                // Валидируем через cellManager перед применением
                if (this.cellManager && this.cellManager.canPlace(
                    childId,
                    newCell.row,
                    newCell.col,
                    newCell.rowSpan,
                    newCell.colSpan
                )) {
                    this.cellManager.place(childId, newCell.row, newCell.col, newCell.rowSpan, newCell.colSpan);
                    this.cellManager.rebuildOccupancyGrid();
                    this.refreshPreview();
                } else {
                    // Возвращаем старое значение если валидация не прошла
                    e.target.value = currentCell[field];
                }
            });
        });
    }

    /**
     * Закрытие редактора
     */
    close() {
        // Устанавливаем флаг для прерывания операций
        this._isDestroyed = true;

        if (this.dragManager) {
            this.dragManager.destroy();
            this.dragManager = null;
        }

        // Clean up preview to remove any active mouse listeners
        if (this.preview) {
            this.preview.destroy();
            this.preview = null;
        }

        this.cellManager = null;

        // Очищаем singleton
        currentInstance = null;

        super.close();
    }
}

export default LayoutEditorPanel;

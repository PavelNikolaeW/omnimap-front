import { Popup } from '../popups/popup.js';
import { dispatch, escapeHtml } from '../../utils/utils.js';
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
 * Конфигурация пресетов с информацией о вместимости и описанием
 * maxBlocks - максимальное количество блоков (null = расширяемый)
 * minBlocks - рекомендуемое минимальное количество
 * description - описание пресета
 */
const PRESET_CONFIG = {
    '2x2': { maxBlocks: 4, minBlocks: 0, description: 'Сетка 2×2 для 4 блоков' },
    '3x3': { maxBlocks: 9, minBlocks: 0, description: 'Сетка 3×3 для 9 блоков' },
    '4x4': { maxBlocks: 16, minBlocks: 0, description: 'Сетка 4×4 для 16 блоков' },
    'sidebar': { maxBlocks: null, minBlocks: 1, description: 'Сайдбар слева + контент' },
    'sidebar-right': { maxBlocks: null, minBlocks: 1, description: 'Сайдбар справа + контент' },
    'dashboard': { maxBlocks: null, minBlocks: 1, description: 'Главный блок + виджеты + метрики' },
    'kanban': { maxBlocks: 3, minBlocks: 0, description: 'Доска с 3 колонками (To Do, In Progress, Done)' },
    'holy-grail': { maxBlocks: null, minBlocks: 1, description: 'Header + Footer + 3 колонки' },
    'gallery': { maxBlocks: null, minBlocks: 1, description: 'Галерея: большие и маленькие карточки' },
    'calendar': { maxBlocks: 35, minBlocks: 0, description: 'Календарь на месяц (5 недель)' },
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
            width: 800,
            height: 600,
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
        const childOrder = this.block.data?.childOrder || [];

        // Используем childBlocks как источник правды (уже отфильтрованы в loadBlockData)
        // Это согласовано с rebuildOccupancyGrid() который тоже использует childBlocks
        const validChildIds = new Set(this.childBlocks.map(b => b.id));

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

        // Рендерим превью
        this.renderPreview();
        this.renderSettings();
        this.renderButtons();
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
     * Генерирует HTML для кнопки пресета
     * @param {string} presetName - Имя пресета
     * @param {string} label - Текст кнопки
     */
    renderPresetButton(presetName, label) {
        const config = PRESET_CONFIG[presetName] || {};
        const { available, reason } = this.isPresetAvailable(presetName);
        const description = config.description || '';
        const maxInfo = config.maxBlocks ? ` (макс. ${config.maxBlocks})` : ' (расширяемый)';

        const tooltip = available
            ? `${description}${maxInfo}`
            : reason;

        const disabledAttr = available ? '' : 'disabled';
        const disabledClass = available ? '' : 'layout-preset-btn--disabled';

        return `<button class="layout-preset-btn ${disabledClass}" data-preset="${presetName}" title="${tooltip}" ${disabledAttr}>${label}</button>`;
    }

    /**
     * Рендерит панель настроек
     */
    renderSettings() {
        const childCount = this.childBlocks.length;

        this.settingsPanel.innerHTML = `
            <div class="layout-settings__section layout-settings__hint">
                <div class="layout-hint">
                    <span class="layout-hint__icon">💡</span>
                    <span class="layout-hint__text">Перетаскивайте блоки для изменения положения. Тяните за углы для изменения размера.</span>
                </div>
            </div>

            <div class="layout-settings__section">
                <h4 class="layout-settings__title">Размер сетки</h4>
                <div class="layout-settings__row">
                    <label>Строк:</label>
                    <input type="number" id="grid-rows" value="${this.gridSize.rows}" min="1" max="20" class="layout-settings__input">
                </div>
                <div class="layout-settings__row">
                    <label>Колонок:</label>
                    <input type="number" id="grid-cols" value="${this.gridSize.cols}" min="1" max="24" class="layout-settings__input">
                </div>
            </div>

            <div class="layout-settings__section">
                <h4 class="layout-settings__title">Пресеты</h4>
                <div class="layout-settings__info layout-settings__info--small">
                    Блоков: <strong>${childCount}</strong>. Недоступные пресеты не могут вместить все блоки.
                </div>
                <div class="layout-settings__presets">
                    ${this.renderPresetButton('2x2', '2×2')}
                    ${this.renderPresetButton('3x3', '3×3')}
                    ${this.renderPresetButton('4x4', '4×4')}
                    ${this.renderPresetButton('sidebar', 'Сайдбар')}
                    ${this.renderPresetButton('sidebar-right', 'Сайдбар R')}
                    ${this.renderPresetButton('dashboard', 'Dashboard')}
                    ${this.renderPresetButton('kanban', 'Kanban')}
                    ${this.renderPresetButton('holy-grail', 'Holy Grail')}
                    ${this.renderPresetButton('gallery', 'Галерея')}
                    ${this.renderPresetButton('calendar', 'Календарь')}
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
        // Grid size inputs
        const rowsInput = this.settingsPanel.querySelector('#grid-rows');
        const colsInput = this.settingsPanel.querySelector('#grid-cols');

        rowsInput?.addEventListener('change', (e) => {
            this.gridSize.rows = parseInt(e.target.value, 10) || 3;
            this.refreshPreview();
        });

        colsInput?.addEventListener('change', (e) => {
            this.gridSize.cols = parseInt(e.target.value, 10) || 12;
            this.refreshPreview();
        });

        // Preset buttons
        const presetBtns = this.settingsPanel.querySelectorAll('.layout-preset-btn[data-preset]');
        presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.applyPreset(btn.dataset.preset);
            });
        });

        // Fill blocks button
        const fillBlocksBtn = this.settingsPanel.querySelector('#fill-blocks-btn');
        fillBlocksBtn?.addEventListener('click', () => {
            this.createPlaceholderBlocks();
        });
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

            // Обновляем данные блока
            await new Promise(resolve => setTimeout(resolve, 500));
            this.loadBlockData();

            // Добавляем позиции для новых блоков
            for (const ph of this.placeholders) {
                this.cells[ph.blockId] = {
                    row: ph.row,
                    col: ph.col,
                    rowSpan: ph.rowSpan,
                    colSpan: ph.colSpan
                };
            }

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
        this.updateSettingsInputs();
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
     * Обновляет inputs настроек
     */
    updateSettingsInputs() {
        const rowsInput = this.settingsPanel.querySelector('#grid-rows');
        const colsInput = this.settingsPanel.querySelector('#grid-cols');
        if (rowsInput) rowsInput.value = this.gridSize.rows;
        if (colsInput) colsInput.value = this.gridSize.cols;
    }

    /**
     * Обновляет превью
     */
    refreshPreview() {
        if (this.preview) {
            this.preview.update(this.gridSize, this.cells, this.placeholders);
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
        applyBtn.className = 'popup-button popup-button--primary';
        applyBtn.textContent = 'Применить';
        applyBtn.addEventListener('click', () => this.applyLayout());

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'popup-button popup-button--secondary';
        cancelBtn.textContent = 'Отмена';
        cancelBtn.addEventListener('click', () => this.close());

        const resetBtn = document.createElement('button');
        resetBtn.className = 'popup-button popup-button--secondary';
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
        const rawTitle = block?.data?.text?.substring(0, 30) || 'Без названия';
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

        this.cellManager = null;
        this.preview = null;

        // Очищаем singleton
        currentInstance = null;

        super.close();
    }
}

export default LayoutEditorPanel;

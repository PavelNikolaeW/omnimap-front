import { Popup } from '../popups/popup.js';
import { dispatch } from '../../utils/utils.js';
import { GridLayoutCalculator } from '../../painter/gridLayoutCalculator.js';
import { LayoutCellManager } from './LayoutCellManager.js';
import { LayoutPreview } from './LayoutPreview.js';
import { LayoutDragManager } from './LayoutDragManager.js';
import { LayoutDataConverter } from './LayoutDataConverter.js';
import { localStateManager } from '../../stateLocal/localStateManager.js';
import { extractBlockId } from '../../actions/selectionActions.js';

/**
 * Экранирует HTML символы для безопасного отображения
 * @param {string} text - Текст для экранирования
 * @returns {string} - Экранированный текст
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Singleton instance для предотвращения множественных окон
let currentInstance = null;

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

        if (layout === 'cells' && layoutCells?.cells) {
            // Используем существующую конфигурацию cells
            this.gridSize = layoutCells.gridSize || { rows: 3, cols: 12 };
            this.cells = { ...layoutCells.cells };
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
     * Рендерит панель настроек
     */
    renderSettings() {
        this.settingsPanel.innerHTML = `
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
                <div class="layout-settings__presets">
                    <button class="layout-preset-btn" data-preset="2x2">2x2</button>
                    <button class="layout-preset-btn" data-preset="3x3">3x3</button>
                    <button class="layout-preset-btn" data-preset="4x4">4x4</button>
                    <button class="layout-preset-btn" data-preset="sidebar">Сайдбар</button>
                    <button class="layout-preset-btn" data-preset="sidebar-right">Сайдбар R</button>
                    <button class="layout-preset-btn" data-preset="dashboard">Dashboard</button>
                    <button class="layout-preset-btn" data-preset="kanban">Kanban</button>
                    <button class="layout-preset-btn" data-preset="holy-grail">Holy Grail</button>
                    <button class="layout-preset-btn" data-preset="gallery">Галерея</button>
                    <button class="layout-preset-btn" data-preset="calendar" title="Создаст недостающие блоки">Календарь</button>
                </div>
            </div>

            <div class="layout-settings__section">
                <h4 class="layout-settings__title">Выбранный блок</h4>
                <div id="selected-block-info" class="layout-settings__info">
                    Кликните на блок для выбора
                </div>
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
        const presetBtns = this.settingsPanel.querySelectorAll('.layout-preset-btn');
        presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.applyPreset(btn.dataset.preset);
            });
        });
    }

    /**
     * Применяет пресет раскладки
     */
    async applyPreset(presetName) {
        const childOrder = this.block.data?.childOrder || [];
        const n = childOrder.length;

        switch (presetName) {
            case '2x2':
                this.gridSize = { rows: 2, cols: 2 };
                this.cells = this.generateGridCells(childOrder, 2, 2);
                break;

            case '3x3':
                this.gridSize = { rows: 3, cols: 3 };
                this.cells = this.generateGridCells(childOrder, 3, 3);
                break;

            case '4x4':
                this.gridSize = { rows: 4, cols: 4 };
                this.cells = this.generateGridCells(childOrder, 4, 4);
                break;

            case 'sidebar':
                this.gridSize = { rows: Math.max(2, n - 1), cols: 12 };
                this.cells = this.generateSidebarCells(childOrder, 'left');
                break;

            case 'sidebar-right':
                this.gridSize = { rows: Math.max(2, n - 1), cols: 12 };
                this.cells = this.generateSidebarCells(childOrder, 'right');
                break;

            case 'dashboard':
                this.gridSize = { rows: 3, cols: 12 };
                this.cells = this.generateDashboardCells(childOrder);
                break;

            case 'kanban':
                this.gridSize = { rows: Math.max(1, Math.ceil(n / 3)), cols: 3 };
                this.cells = this.generateKanbanCells(childOrder);
                break;

            case 'holy-grail':
                this.gridSize = { rows: 3, cols: 12 };
                this.cells = this.generateHolyGrailCells(childOrder);
                break;

            case 'gallery':
                this.gridSize = { rows: Math.ceil(n / 4), cols: 12 };
                this.cells = this.generateGalleryCells(childOrder);
                break;

            case 'calendar':
                await this.applyCalendarPreset();
                return; // applyCalendarPreset handles refresh
        }

        // Перестраиваем occupancy grid после изменения cells
        if (this.cellManager) {
            this.cellManager.rebuildOccupancyGrid();
        }

        this.refreshPreview();
        this.updateSettingsInputs();
    }

    /**
     * Генерирует ячейки для grid пресета
     */
    generateGridCells(childOrder, rows, cols) {
        const cells = {};
        let i = 0;
        for (let r = 1; r <= rows && i < childOrder.length; r++) {
            for (let c = 1; c <= cols && i < childOrder.length; c++) {
                cells[childOrder[i]] = { row: r, col: c, rowSpan: 1, colSpan: 1 };
                i++;
            }
        }
        return cells;
    }

    /**
     * Генерирует ячейки для sidebar пресета
     * @param {Array} childOrder - порядок блоков
     * @param {string} side - 'left' или 'right'
     */
    generateSidebarCells(childOrder, side = 'left') {
        const cells = {};
        if (childOrder.length === 0) return cells;

        const sidebarCol = side === 'left' ? 1 : 9;
        const contentCol = side === 'left' ? 5 : 1;
        const contentColSpan = 8;

        // Первый блок - сайдбар (4 колонки, все строки)
        cells[childOrder[0]] = {
            row: 1,
            col: sidebarCol,
            rowSpan: Math.max(1, childOrder.length - 1),
            colSpan: 4
        };

        // Остальные блоки - контент
        for (let i = 1; i < childOrder.length; i++) {
            cells[childOrder[i]] = {
                row: i,
                col: contentCol,
                rowSpan: 1,
                colSpan: contentColSpan
            };
        }

        return cells;
    }

    /**
     * Генерирует ячейки для Kanban (3 колонки)
     */
    generateKanbanCells(childOrder) {
        const cells = {};
        const cols = 3;

        for (let i = 0; i < childOrder.length; i++) {
            const col = (i % cols) + 1;
            const row = Math.floor(i / cols) + 1;
            cells[childOrder[i]] = { row, col, rowSpan: 1, colSpan: 1 };
        }

        return cells;
    }

    /**
     * Генерирует ячейки для Holy Grail layout
     * Header (full width), Sidebar + Content + Sidebar, Footer (full width)
     */
    generateHolyGrailCells(childOrder) {
        const cells = {};
        const n = childOrder.length;

        // Header - первый блок на всю ширину
        if (childOrder[0]) {
            cells[childOrder[0]] = { row: 1, col: 1, rowSpan: 1, colSpan: 12 };
        }

        // Средний ряд: sidebar-left, content, sidebar-right
        if (childOrder[1]) {
            cells[childOrder[1]] = { row: 2, col: 1, rowSpan: 1, colSpan: 3 };
        }
        if (childOrder[2]) {
            cells[childOrder[2]] = { row: 2, col: 4, rowSpan: 1, colSpan: 6 };
        }
        if (childOrder[3]) {
            cells[childOrder[3]] = { row: 2, col: 10, rowSpan: 1, colSpan: 3 };
        }

        // Footer - на всю ширину
        if (childOrder[4]) {
            cells[childOrder[4]] = { row: 3, col: 1, rowSpan: 1, colSpan: 12 };
        }

        // Остальные блоки - под footer
        for (let i = 5; i < n; i++) {
            const col = ((i - 5) % 3) * 4 + 1;
            const row = Math.floor((i - 5) / 3) + 4;
            cells[childOrder[i]] = { row, col, rowSpan: 1, colSpan: 4 };
        }

        return cells;
    }

    /**
     * Генерирует ячейки для Gallery (разные размеры)
     */
    generateGalleryCells(childOrder) {
        const cells = {};
        const patterns = [
            { colSpan: 6, rowSpan: 2 },  // большой
            { colSpan: 3, rowSpan: 1 },  // маленький
            { colSpan: 3, rowSpan: 1 },  // маленький
            { colSpan: 4, rowSpan: 1 },  // средний
            { colSpan: 4, rowSpan: 1 },  // средний
            { colSpan: 4, rowSpan: 1 },  // средний
        ];

        let currentRow = 1;
        let currentCol = 1;
        const maxCols = 12;

        for (let i = 0; i < childOrder.length; i++) {
            const pattern = patterns[i % patterns.length];

            // Если не помещается в строку - переходим на новую
            if (currentCol + pattern.colSpan > maxCols + 1) {
                currentRow++;
                currentCol = 1;
            }

            cells[childOrder[i]] = {
                row: currentRow,
                col: currentCol,
                rowSpan: pattern.rowSpan,
                colSpan: pattern.colSpan
            };

            currentCol += pattern.colSpan;
        }

        return cells;
    }

    /**
     * Применяет пресет календаря (создаёт недостающие блоки)
     */
    async applyCalendarPreset() {
        const childOrder = this.block.data?.childOrder || [];
        const daysNeeded = 35; // 5 недель × 7 дней
        const currentCount = childOrder.length;

        // Спрашиваем подтверждение если нужно создать блоки
        if (currentCount < daysNeeded) {
            const toCreate = daysNeeded - currentCount;
            if (!confirm(`Для календаря нужно ${daysNeeded} блоков. Создать ${toCreate} новых блоков?`)) {
                return;
            }

            // Создаём недостающие блоки
            for (let i = 0; i < toCreate; i++) {
                const dayNum = currentCount + i + 1;
                dispatch('CreateNewChildBlock', {
                    parentId: this.blockId,
                    text: `${dayNum}`
                });
            }

            // Ждём создания блоков и обновляем данные
            await new Promise(resolve => setTimeout(resolve, 500));
            this.loadBlockData();
        }

        // Генерируем раскладку 5×7
        const updatedChildOrder = this.block.data?.childOrder || [];
        this.gridSize = { rows: 5, cols: 7 };
        this.cells = this.generateGridCells(updatedChildOrder, 5, 7);

        if (this.cellManager) {
            this.cellManager.rebuildOccupancyGrid();
        }

        this.refreshPreview();
        this.updateSettingsInputs();
    }

    /**
     * Генерирует ячейки для dashboard пресета
     */
    generateDashboardCells(childOrder) {
        const cells = {};
        if (childOrder.length === 0) return cells;

        // Первый блок - большой (2x2)
        if (childOrder[0]) {
            cells[childOrder[0]] = { row: 1, col: 1, rowSpan: 2, colSpan: 6 };
        }

        // Следующие блоки - справа
        if (childOrder[1]) {
            cells[childOrder[1]] = { row: 1, col: 7, rowSpan: 1, colSpan: 6 };
        }
        if (childOrder[2]) {
            cells[childOrder[2]] = { row: 2, col: 7, rowSpan: 1, colSpan: 6 };
        }

        // Нижний ряд
        let col = 1;
        for (let i = 3; i < childOrder.length && i < 6; i++) {
            cells[childOrder[i]] = { row: 3, col, rowSpan: 1, colSpan: 4 };
            col += 4;
        }

        return cells;
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
            this.preview.update(this.gridSize, this.cells);
        }
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
     */
    applyLayout() {
        dispatch('UpdateDataBlock', {
            blockId: this.blockId,
            data: {
                layout: 'cells',
                layoutCells: {
                    gridSize: this.gridSize,
                    cells: this.cells
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

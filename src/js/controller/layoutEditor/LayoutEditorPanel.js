import { Popup } from '../popups/popup.js';
import { dispatch } from '../../utils/utils.js';
import { GridLayoutCalculator } from '../../painter/gridLayoutCalculator.js';
import { LayoutCellManager } from './LayoutCellManager.js';
import { LayoutPreview } from './LayoutPreview.js';
import { LayoutDragManager } from './LayoutDragManager.js';
import { LayoutDataConverter } from './LayoutDataConverter.js';
import { localStateManager } from '../../stateLocal/localStateManager.js';

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

        // Флаг для защиты от race conditions при закрытии
        this._isDestroyed = false;
        this._initPromise = null;

        this._initPromise = this.init();
    }

    /**
     * Статический метод для открытия редактора
     */
    static show(ctx) {
        const blockElement = ctx.blockElement;
        if (!blockElement) {
            console.warn('LayoutEditorPanel: No block element in context');
            return null;
        }

        const blockId = blockElement.id;
        return new LayoutEditorPanel({ ctx, blockId });
    }

    /**
     * Инициализация редактора
     */
    async init() {
        try {
            await this.loadBlockData();

            // Проверяем, не был ли редактор закрыт пока загружались данные
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
    async loadBlockData() {
        this.block = await localStateManager.getBlock(this.blockId);
        if (!this.block) {
            throw new Error(`Block not found: ${this.blockId}`);
        }

        const childOrder = this.block.data?.childOrder || [];
        this.childBlocks = [];

        for (const childId of childOrder) {
            const child = await localStateManager.getBlock(childId);
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
                    <button class="layout-preset-btn" data-preset="sidebar">Сайдбар</button>
                    <button class="layout-preset-btn" data-preset="dashboard">Dashboard</button>
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
    applyPreset(presetName) {
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

            case 'sidebar':
                this.gridSize = { rows: Math.max(2, n - 1), cols: 12 };
                this.cells = this.generateSidebarCells(childOrder);
                break;

            case 'dashboard':
                this.gridSize = { rows: 3, cols: 12 };
                this.cells = this.generateDashboardCells(childOrder);
                break;
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
     */
    generateSidebarCells(childOrder) {
        const cells = {};
        if (childOrder.length === 0) return cells;

        // Первый блок - сайдбар слева (4 колонки, все строки)
        cells[childOrder[0]] = {
            row: 1,
            col: 1,
            rowSpan: Math.max(1, childOrder.length - 1),
            colSpan: 4
        };

        // Остальные блоки справа
        for (let i = 1; i < childOrder.length; i++) {
            cells[childOrder[i]] = {
                row: i,
                col: 5,
                rowSpan: 1,
                colSpan: 8
            };
        }

        return cells;
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
     * Сбрасывает раскладку
     */
    resetLayout() {
        const childOrder = this.block.data?.childOrder || [];
        const initial = GridLayoutCalculator.generateInitialCells(childOrder);
        this.gridSize = initial.gridSize;
        this.cells = initial.cells;
        this.refreshPreview();
        this.updateSettingsInputs();
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
        const title = block?.data?.text?.substring(0, 30) || 'Без названия';

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

                if (!this.cells[childId]) {
                    this.cells[childId] = { row: 1, col: 1, rowSpan: 1, colSpan: 1 };
                }
                this.cells[childId][field] = value;
                this.refreshPreview();
            });
        });
    }

    /**
     * Закрытие редактора
     */
    close() {
        // Устанавливаем флаг для прерывания асинхронных операций
        this._isDestroyed = true;

        if (this.dragManager) {
            this.dragManager.destroy();
            this.dragManager = null;
        }

        this.cellManager = null;
        this.preview = null;

        super.close();
    }
}

export default LayoutEditorPanel;

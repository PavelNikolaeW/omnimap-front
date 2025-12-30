import { dispatch } from "../utils/utils";
import localforage from "localforage";

/**
 * DiagramEditor - интерактивный редактор диаграммы
 * Обеспечивает:
 * - Drag-and-drop перемещение блоков в грид-сетке
 * - Resize handles для изменения размера блоков
 * - Визуализацию грид-линий
 * - Настройку грид-сетки
 */
export class DiagramEditor {
    constructor() {
        this.isActive = false;
        this.parentBlockId = null;
        this.parentElement = null;
        this.customGrid = null;

        // Drag state
        this.isDragging = false;
        this.draggedBlockId = null;
        this.dragStartCell = null;
        this.dragGhost = null;

        // Resize state
        this.isResizing = false;
        this.resizingBlockId = null;
        this.resizeDirection = null;
        this.resizeStartPos = null;

        // Grid overlay
        this.gridOverlay = null;

        // Bind methods
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
    }

    /**
     * Активировать режим редактирования диаграммы для блока
     */
    async activate(blockId, blockElement) {
        if (this.isActive) {
            this.deactivate();
        }

        this.parentBlockId = blockId;
        this.parentElement = blockElement;

        const block = await this.getBlock(blockId);
        if (!block?.data?.customGrid || !Object.keys(block.data.customGrid).length) {
            console.warn('Block has no customGrid, cannot activate diagram editor');
            return false;
        }

        this.customGrid = block.data.customGrid;
        this.isActive = true;

        // Добавить визуальные элементы
        this.createGridOverlay();
        this.addResizeHandles();
        this.attachEventListeners();

        // Добавить класс для стилизации
        this.parentElement.classList.add('diagram-edit-mode');

        return true;
    }

    /**
     * Деактивировать режим редактирования
     */
    deactivate() {
        if (!this.isActive) return;

        this.removeGridOverlay();
        this.removeResizeHandles();
        this.detachEventListeners();

        if (this.parentElement) {
            this.parentElement.classList.remove('diagram-edit-mode');
        }

        this.isActive = false;
        this.parentBlockId = null;
        this.parentElement = null;
        this.customGrid = null;
    }

    /**
     * Получить блок из localforage
     */
    async getBlock(id) {
        const user = await localforage.getItem('currentUser');
        return await localforage.getItem(`Block_${id}_${user}`);
    }

    /**
     * Парсинг грид-классов для получения размеров сетки
     */
    parseGridSize() {
        if (!this.customGrid?.grid) return { cols: 1, rows: 1 };

        const grid = this.customGrid.grid;
        const colsClass = grid.find(cls => cls.startsWith('grid-template-columns_'));
        const rowsClass = grid.find(cls => cls.startsWith('grid-template-rows_'));

        const cols = colsClass ? (colsClass.split('__').length - 1) : 1;
        const rows = rowsClass ? (rowsClass.split('__').length - 1) : 1;

        return { cols, rows };
    }

    /**
     * Парсинг позиции блока из customGrid.childrenPositions
     */
    parseBlockPosition(blockId) {
        const positions = this.customGrid?.childrenPositions?.[blockId];
        if (!positions) return null;

        const parseRange = (str) => {
            const match = str.match(/_(\d+)(?:__(\d+))?/);
            if (!match) return [1, 2];
            const start = parseInt(match[1], 10);
            const end = match[2] ? parseInt(match[2], 10) : start + 1;
            return [start, end];
        };

        const colStr = positions.find(p => p.startsWith('grid-column_'));
        const rowStr = positions.find(p => p.startsWith('grid-row_'));

        const [colStart, colEnd] = colStr ? parseRange(colStr) : [1, 2];
        const [rowStart, rowEnd] = rowStr ? parseRange(rowStr) : [2, 3];

        return { colStart, colEnd, rowStart, rowEnd };
    }

    /**
     * Создать оверлей с грид-линиями
     */
    createGridOverlay() {
        if (this.gridOverlay) return;

        const { cols, rows } = this.parseGridSize();

        this.gridOverlay = document.createElement('div');
        this.gridOverlay.className = 'diagram-grid-overlay';
        this.gridOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            pointer-events: none;
            z-index: 10;
            display: grid;
            grid-template-columns: repeat(${cols}, 1fr);
            grid-template-rows: auto repeat(${rows}, 1fr);
        `;

        // Создать ячейки для визуализации сетки
        // Первая строка - контент (auto)
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement('div');
            cell.className = 'diagram-grid-cell diagram-grid-cell-header';
            cell.dataset.col = c + 1;
            cell.dataset.row = 1;
            this.gridOverlay.appendChild(cell);
        }

        // Остальные строки
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = document.createElement('div');
                cell.className = 'diagram-grid-cell';
                cell.dataset.col = c + 1;
                cell.dataset.row = r + 2; // +2 потому что первая строка - контент
                this.gridOverlay.appendChild(cell);
            }
        }

        this.parentElement.style.position = 'relative';
        this.parentElement.appendChild(this.gridOverlay);
    }

    /**
     * Удалить грид-оверлей
     */
    removeGridOverlay() {
        if (this.gridOverlay) {
            this.gridOverlay.remove();
            this.gridOverlay = null;
        }
    }

    /**
     * Добавить resize handles к дочерним блокам
     */
    addResizeHandles() {
        if (!this.parentElement) return;

        const children = this.parentElement.querySelectorAll(':scope > [block], :scope > [blocklink]');
        children.forEach(child => {
            this.addResizeHandlesToElement(child);
        });
    }

    /**
     * Добавить resize handles к конкретному элементу
     */
    addResizeHandlesToElement(element) {
        // Удалить старые handles если есть
        element.querySelectorAll('.resize-handle').forEach(h => h.remove());

        const directions = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

        directions.forEach(dir => {
            const handle = document.createElement('div');
            handle.className = `resize-handle resize-handle-${dir}`;
            handle.dataset.direction = dir;
            handle.dataset.blockId = element.id;
            element.appendChild(handle);
        });

        // Добавить класс для позиционирования
        element.classList.add('diagram-resizable');
    }

    /**
     * Удалить resize handles
     */
    removeResizeHandles() {
        if (!this.parentElement) return;

        this.parentElement.querySelectorAll('.resize-handle').forEach(h => h.remove());
        this.parentElement.querySelectorAll('.diagram-resizable').forEach(el => {
            el.classList.remove('diagram-resizable');
        });
    }

    /**
     * Прикрепить обработчики событий
     */
    attachEventListeners() {
        if (!this.parentElement) return;

        this.parentElement.addEventListener('mousedown', this.handleMouseDown);
        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);

        // Touch events
        this.parentElement.addEventListener('touchstart', this.handleTouchStart, { passive: false });
        document.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd);
    }

    /**
     * Отсоединить обработчики событий
     */
    detachEventListeners() {
        if (!this.parentElement) return;

        this.parentElement.removeEventListener('mousedown', this.handleMouseDown);
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);

        this.parentElement.removeEventListener('touchstart', this.handleTouchStart);
        document.removeEventListener('touchmove', this.handleTouchMove);
        document.removeEventListener('touchend', this.handleTouchEnd);
    }

    /**
     * Обработчик mousedown
     */
    handleMouseDown(e) {
        // Проверить, нажали ли на resize handle
        if (e.target.classList.contains('resize-handle')) {
            this.startResize(e, e.target.dataset.blockId, e.target.dataset.direction);
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // Проверить, нажали ли на блок для drag
        const blockEl = this.findBlockElement(e.target);
        if (blockEl && blockEl.parentElement === this.parentElement) {
            this.startDrag(e, blockEl);
            e.preventDefault();
            e.stopPropagation();
        }
    }

    /**
     * Обработчик mousemove
     */
    handleMouseMove(e) {
        if (this.isDragging) {
            this.updateDrag(e);
        } else if (this.isResizing) {
            this.updateResize(e);
        }
    }

    /**
     * Обработчик mouseup
     */
    handleMouseUp(e) {
        if (this.isDragging) {
            this.endDrag(e);
        } else if (this.isResizing) {
            this.endResize(e);
        }
    }

    /**
     * Touch event handlers
     */
    handleTouchStart(e) {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY, target: touch.target };
        this.handleMouseDown(fakeEvent);
        if (this.isDragging || this.isResizing) {
            e.preventDefault();
        }
    }

    handleTouchMove(e) {
        if (!this.isDragging && !this.isResizing) return;
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY };
        this.handleMouseMove(fakeEvent);
        e.preventDefault();
    }

    handleTouchEnd(e) {
        const fakeEvent = {};
        this.handleMouseUp(fakeEvent);
    }

    /**
     * Найти родительский элемент блока
     */
    findBlockElement(target) {
        let el = target;
        while (el && el !== this.parentElement) {
            if (el.hasAttribute('block') || el.hasAttribute('blocklink')) {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    }

    /**
     * Получить ячейку грида по координатам мыши
     */
    getCellFromPoint(clientX, clientY) {
        const rect = this.parentElement.getBoundingClientRect();
        const { cols, rows } = this.parseGridSize();

        // Учитываем первую строку (контент) - она auto
        const contentRow = this.parentElement.querySelector('.defaultContent');
        const contentHeight = contentRow ? contentRow.offsetHeight : 0;

        const relX = clientX - rect.left;
        const relY = clientY - rect.top - contentHeight;

        const cellWidth = rect.width / cols;
        const cellHeight = (rect.height - contentHeight) / rows;

        const col = Math.max(1, Math.min(cols, Math.floor(relX / cellWidth) + 1));
        const row = Math.max(2, Math.min(rows + 1, Math.floor(relY / cellHeight) + 2));

        return { col, row };
    }

    /**
     * Начать drag блока
     */
    startDrag(e, blockElement) {
        this.isDragging = true;
        this.draggedBlockId = blockElement.id;
        this.dragStartCell = this.getCellFromPoint(e.clientX, e.clientY);

        // Создать ghost элемент
        this.dragGhost = document.createElement('div');
        this.dragGhost.className = 'diagram-drag-ghost';
        const rect = blockElement.getBoundingClientRect();
        this.dragGhost.style.width = rect.width + 'px';
        this.dragGhost.style.height = rect.height + 'px';
        this.dragGhost.style.left = e.clientX + 'px';
        this.dragGhost.style.top = e.clientY + 'px';
        document.body.appendChild(this.dragGhost);

        blockElement.classList.add('diagram-dragging');
    }

    /**
     * Обновить drag
     */
    updateDrag(e) {
        if (!this.dragGhost) return;

        this.dragGhost.style.left = e.clientX + 'px';
        this.dragGhost.style.top = e.clientY + 'px';

        // Подсветить ячейку под курсором
        const cell = this.getCellFromPoint(e.clientX, e.clientY);
        this.highlightCell(cell.col, cell.row);
    }

    /**
     * Завершить drag
     */
    async endDrag(e) {
        if (!this.isDragging) return;

        const endCell = this.getCellFromPoint(e.clientX, e.clientY);
        const blockEl = document.getElementById(this.draggedBlockId);

        if (blockEl) {
            blockEl.classList.remove('diagram-dragging');
        }

        if (this.dragGhost) {
            this.dragGhost.remove();
            this.dragGhost = null;
        }

        this.clearHighlight();

        // Вычислить смещение
        const deltaCol = endCell.col - this.dragStartCell.col;
        const deltaRow = endCell.row - this.dragStartCell.row;

        if (deltaCol !== 0 || deltaRow !== 0) {
            await this.moveBlockByDelta(this.draggedBlockId, deltaCol, deltaRow);
        }

        this.isDragging = false;
        this.draggedBlockId = null;
        this.dragStartCell = null;
    }

    /**
     * Начать resize блока
     */
    startResize(e, blockId, direction) {
        this.isResizing = true;
        this.resizingBlockId = blockId;
        this.resizeDirection = direction;
        this.resizeStartPos = { x: e.clientX, y: e.clientY };
        this.resizeStartCell = this.getCellFromPoint(e.clientX, e.clientY);

        const blockEl = document.getElementById(blockId);
        if (blockEl) {
            blockEl.classList.add('diagram-resizing');
        }
    }

    /**
     * Обновить resize
     */
    updateResize(e) {
        const cell = this.getCellFromPoint(e.clientX, e.clientY);
        this.highlightResizeArea(cell);
    }

    /**
     * Завершить resize
     */
    async endResize(e) {
        if (!this.isResizing) return;

        const endCell = this.getCellFromPoint(e.clientX, e.clientY);
        const blockEl = document.getElementById(this.resizingBlockId);

        if (blockEl) {
            blockEl.classList.remove('diagram-resizing');
        }

        this.clearHighlight();

        await this.resizeBlock(this.resizingBlockId, this.resizeDirection, endCell);

        this.isResizing = false;
        this.resizingBlockId = null;
        this.resizeDirection = null;
        this.resizeStartPos = null;
        this.resizeStartCell = null;
    }

    /**
     * Подсветить ячейку
     */
    highlightCell(col, row) {
        this.clearHighlight();

        if (!this.gridOverlay) return;

        const cell = this.gridOverlay.querySelector(`[data-col="${col}"][data-row="${row}"]`);
        if (cell) {
            cell.classList.add('diagram-grid-cell-highlight');
        }
    }

    /**
     * Подсветить область resize
     */
    highlightResizeArea(endCell) {
        this.clearHighlight();

        const pos = this.parseBlockPosition(this.resizingBlockId);
        if (!pos || !this.gridOverlay) return;

        let { colStart, colEnd, rowStart, rowEnd } = pos;

        // Вычислить новые границы в зависимости от направления
        const dir = this.resizeDirection;
        if (dir.includes('n')) rowStart = Math.min(endCell.row, rowEnd - 1);
        if (dir.includes('s')) rowEnd = Math.max(endCell.row + 1, rowStart + 1);
        if (dir.includes('w')) colStart = Math.min(endCell.col, colEnd - 1);
        if (dir.includes('e')) colEnd = Math.max(endCell.col + 1, colStart + 1);

        // Подсветить всю область
        for (let r = rowStart; r < rowEnd; r++) {
            for (let c = colStart; c < colEnd; c++) {
                const cell = this.gridOverlay.querySelector(`[data-col="${c}"][data-row="${r}"]`);
                if (cell) {
                    cell.classList.add('diagram-grid-cell-highlight');
                }
            }
        }
    }

    /**
     * Убрать подсветку
     */
    clearHighlight() {
        if (!this.gridOverlay) return;
        this.gridOverlay.querySelectorAll('.diagram-grid-cell-highlight').forEach(cell => {
            cell.classList.remove('diagram-grid-cell-highlight');
        });
    }

    /**
     * Переместить блок на delta ячеек
     */
    async moveBlockByDelta(blockId, deltaCol, deltaRow) {
        // Извлечь чистый blockId (без prefix от родителя)
        const cleanBlockId = blockId.includes('*') ? blockId.split('*').pop() : blockId;

        const pos = this.parseBlockPosition(cleanBlockId);
        if (!pos) return;

        const { cols, rows } = this.parseGridSize();

        // Вычислить новую позицию с границами
        let newColStart = Math.max(1, pos.colStart + deltaCol);
        let newColEnd = pos.colEnd + deltaCol;
        let newRowStart = Math.max(2, pos.rowStart + deltaRow);
        let newRowEnd = pos.rowEnd + deltaRow;

        // Ограничить по границам сетки
        if (newColEnd > cols + 1) {
            const overflow = newColEnd - (cols + 1);
            newColStart -= overflow;
            newColEnd -= overflow;
        }
        if (newRowEnd > rows + 2) {
            const overflow = newRowEnd - (rows + 2);
            newRowStart -= overflow;
            newRowEnd -= overflow;
        }

        newColStart = Math.max(1, newColStart);
        newRowStart = Math.max(2, newRowStart);

        // Обновить customGrid
        this.customGrid.childrenPositions[cleanBlockId] = [
            `grid-column_${newColStart}__${newColEnd}`,
            `grid-row_${newRowStart}__${newRowEnd}`
        ];

        dispatch('UpdateCustomGridBlock', {
            blockId: this.parentBlockId,
            customGrid: this.customGrid
        });
    }

    /**
     * Изменить размер блока
     */
    async resizeBlock(blockId, direction, endCell) {
        const cleanBlockId = blockId.includes('*') ? blockId.split('*').pop() : blockId;

        const pos = this.parseBlockPosition(cleanBlockId);
        if (!pos) return;

        const { cols, rows } = this.parseGridSize();

        let { colStart, colEnd, rowStart, rowEnd } = pos;

        // Изменить границы в зависимости от направления
        if (direction.includes('n')) {
            rowStart = Math.max(2, Math.min(endCell.row, rowEnd - 1));
        }
        if (direction.includes('s')) {
            rowEnd = Math.min(rows + 2, Math.max(endCell.row + 1, rowStart + 1));
        }
        if (direction.includes('w')) {
            colStart = Math.max(1, Math.min(endCell.col, colEnd - 1));
        }
        if (direction.includes('e')) {
            colEnd = Math.min(cols + 1, Math.max(endCell.col + 1, colStart + 1));
        }

        // Минимальный размер 1x1
        if (colEnd - colStart < 1) colEnd = colStart + 1;
        if (rowEnd - rowStart < 1) rowEnd = rowStart + 1;

        this.customGrid.childrenPositions[cleanBlockId] = [
            `grid-column_${colStart}__${colEnd}`,
            `grid-row_${rowStart}__${rowEnd}`
        ];

        dispatch('UpdateCustomGridBlock', {
            blockId: this.parentBlockId,
            customGrid: this.customGrid
        });
    }

    /**
     * Обновить размер сетки
     */
    async updateGridSize(newCols, newRows) {
        if (!this.customGrid) return;

        this.customGrid.grid = [
            `grid-template-columns_${'1fr__'.repeat(newCols)}`,
            `grid-template-rows_auto__${'1fr__'.repeat(newRows)}`
        ];

        // Обновить contentPosition
        this.customGrid.contentPosition = [`grid-column_1_sl_${newCols + 1}`];

        dispatch('UpdateCustomGridBlock', {
            blockId: this.parentBlockId,
            customGrid: this.customGrid
        });

        // Обновить оверлей
        this.removeGridOverlay();
        this.createGridOverlay();
    }

    /**
     * Добавить строку в сетку
     */
    async addRow() {
        const { cols, rows } = this.parseGridSize();
        await this.updateGridSize(cols, rows + 1);
    }

    /**
     * Удалить строку из сетки
     */
    async removeRow() {
        const { cols, rows } = this.parseGridSize();
        if (rows > 1) {
            await this.updateGridSize(cols, rows - 1);
        }
    }

    /**
     * Добавить колонку в сетку
     */
    async addColumn() {
        const { cols, rows } = this.parseGridSize();
        await this.updateGridSize(cols + 1, rows);
    }

    /**
     * Удалить колонку из сетки
     */
    async removeColumn() {
        const { cols, rows } = this.parseGridSize();
        if (cols > 1) {
            await this.updateGridSize(cols - 1, rows);
        }
    }
}

export const diagramEditor = new DiagramEditor();

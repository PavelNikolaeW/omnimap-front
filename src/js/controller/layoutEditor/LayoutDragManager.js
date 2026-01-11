// Максимальные размеры сетки
const MAX_GRID_ROWS = 12;
const MAX_GRID_COLS = 24;

/**
 * Управляет drag-and-drop операциями в редакторе раскладки
 */
export class LayoutDragManager {
    constructor(panel) {
        this.panel = panel;
        this.isDragging = false;
        this.draggedBlockId = null;

        this.init();
    }

    /**
     * Получает данные ячейки для блока (из cells или placeholders)
     * @param {string} blockId - ID блока
     * @returns {{ cell: object, isPlaceholder: boolean } | null}
     */
    getCellData(blockId) {
        // Сначала ищем в обычных блоках
        if (this.panel.cells[blockId]) {
            return { cell: this.panel.cells[blockId], isPlaceholder: false };
        }
        // Затем в placeholders
        const placeholder = this.panel.placeholders.find(p => p.blockId === blockId);
        if (placeholder) {
            return { cell: placeholder, isPlaceholder: true };
        }
        return null;
    }

    /**
     * Проверяет, является ли блок placeholder
     * @param {string} blockId - ID блока
     * @returns {boolean}
     */
    isPlaceholder(blockId) {
        return this.panel.placeholders.some(p => p.blockId === blockId);
    }

    /**
     * Инициализация
     */
    init() {
        // Keyboard shortcuts - всегда регистрируем, даже если preview ещё нет
        this.boundKeyHandler = this.handleKeyDown.bind(this);
        document.addEventListener('keydown', this.boundKeyHandler);

        this.bindPreviewCallbacks();
    }

    /**
     * Привязывает callbacks к preview (можно вызвать повторно после обновления preview)
     */
    bindPreviewCallbacks() {
        if (!this.panel.preview) return;

        // Подписываемся на события превью
        this.panel.preview.onBlockSelect = (blockId) => {
            this.panel.updateSelectedBlockInfo(blockId);
        };

        this.panel.preview.onBlockDragStart = (blockId) => {
            this.startDrag(blockId);
        };

        this.panel.preview.onBlockDragEnd = (blockId, targetRow, targetCol) => {
            this.endDrag(blockId, targetRow, targetCol);
        };

        this.panel.preview.onBlockResize = (blockId, newColSpan, newRowSpan) => {
            this.handleResize(blockId, newColSpan, newRowSpan);
        };
    }

    /**
     * Обработка resize блока
     */
    handleResize(blockId, newColSpan, newRowSpan) {
        const cellData = this.getCellData(blockId);
        if (!cellData) return;

        const { cell, isPlaceholder } = cellData;

        if (isPlaceholder) {
            // Для placeholder - проверяем можно ли разместить и обновляем напрямую
            if (this.canPlacePlaceholder(blockId, cell.row, cell.col, newRowSpan, newColSpan)) {
                cell.rowSpan = newRowSpan;
                cell.colSpan = newColSpan;
                this.panel.refreshPreview();
                this.panel.updateSelectedBlockInfo(blockId);
            } else {
                this.panel.refreshPreview();
            }
        } else {
            // Пробуем разместить с новыми размерами через cellManager
            const success = this.panel.cellManager.place(
                blockId,
                cell.row,
                cell.col,
                newRowSpan,
                newColSpan
            );

            if (success) {
                this.panel.cellManager.rebuildOccupancyGrid();
                this.panel.refreshPreview();
                this.panel.updateSelectedBlockInfo(blockId);
            } else {
                // Если не удалось - просто обновляем превью со старыми значениями
                this.panel.refreshPreview();
            }
        }
    }

    /**
     * Проверяет можно ли разместить placeholder в указанной позиции
     * @param {string} blockId - ID placeholder блока
     * @param {number} row - Строка
     * @param {number} col - Колонка
     * @param {number} rowSpan - Высота
     * @param {number} colSpan - Ширина
     * @returns {boolean}
     */
    canPlacePlaceholder(blockId, row, col, rowSpan, colSpan) {
        // Проверяем границы сетки
        if (row < 1 || col < 1) return false;
        if (row + rowSpan - 1 > this.panel.gridSize.rows) return false;
        if (col + colSpan - 1 > this.panel.gridSize.cols) return false;

        // Проверяем пересечение с обычными блоками
        for (let r = row; r < row + rowSpan; r++) {
            for (let c = col; c < col + colSpan; c++) {
                if (this.panel.cellManager.occupancyGrid[r]?.[c]) {
                    return false;
                }
            }
        }

        // Проверяем пересечение с другими placeholders
        for (const p of this.panel.placeholders) {
            if (p.blockId === blockId) continue;
            // Проверяем пересечение прямоугольников
            const pRight = p.col + p.colSpan - 1;
            const pBottom = p.row + p.rowSpan - 1;
            const right = col + colSpan - 1;
            const bottom = row + rowSpan - 1;

            if (!(right < p.col || col > pRight || bottom < p.row || row > pBottom)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Начало drag
     */
    startDrag(blockId) {
        this.isDragging = true;
        this.draggedBlockId = blockId;
    }

    /**
     * Окончание drag
     */
    endDrag(blockId, targetRow, targetCol) {
        if (!this.isDragging || this.draggedBlockId !== blockId) return;

        const cellData = this.getCellData(blockId);
        if (!cellData) {
            this.isDragging = false;
            this.draggedBlockId = null;
            return;
        }

        const { cell, isPlaceholder } = cellData;

        if (isPlaceholder) {
            // Для placeholder - проверяем и обновляем напрямую
            if (this.canPlacePlaceholder(blockId, targetRow, targetCol, cell.rowSpan, cell.colSpan)) {
                cell.row = targetRow;
                cell.col = targetCol;
                this.panel.refreshPreview();
                this.panel.updateSelectedBlockInfo(blockId);
            } else {
                // Возвращаем на место
                this.panel.refreshPreview();
            }
        } else {
            // Проверяем можно ли разместить
            if (this.panel.cellManager.canPlace(blockId, targetRow, targetCol, cell.rowSpan, cell.colSpan)) {
                this.panel.cellManager.place(blockId, targetRow, targetCol, cell.rowSpan, cell.colSpan);
                this.panel.refreshPreview();
            }
        }

        this.isDragging = false;
        this.draggedBlockId = null;
    }

    /**
     * Обработка клавиатуры
     */
    handleKeyDown(e) {
        // Пропускаем если фокус в input/textarea
        const isInputFocused = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

        // === Глобальные хоткеи (работают всегда) ===

        // Enter для добавления нового блока
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !isInputFocused) {
            e.preventDefault();
            this.panel.addNewBlock();
            return;
        }

        // Быстрые пресеты: 1-4
        if (!isInputFocused && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const presetMap = { '1': '2x2', '2': '3x3', '3': '4x4', '4': 'sidebar' };
            if (presetMap[e.key]) {
                e.preventDefault();
                this.panel.applyPreset(presetMap[e.key]);
                this.panel.updatePresetCardsState();
                return;
            }
        }

        // +/- для изменения строк, [/] для колонок
        if (!isInputFocused && !e.ctrlKey && !e.metaKey) {
            if (e.key === '=' || e.key === '+') {
                e.preventDefault();
                this.adjustGridSize(1, 0);
                return;
            }
            if (e.key === '-' || e.key === '_') {
                e.preventDefault();
                this.adjustGridSize(-1, 0);
                return;
            }
            if (e.key === ']' || e.key === '}') {
                e.preventDefault();
                this.adjustGridSize(0, 1);
                return;
            }
            if (e.key === '[' || e.key === '{') {
                e.preventDefault();
                this.adjustGridSize(0, -1);
                return;
            }
        }

        // R для сброса раскладки
        if (e.key === 'r' && !isInputFocused && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            this.panel.resetLayout();
            return;
        }

        // Tab для переключения между блоками
        if (e.key === 'Tab' && !isInputFocused) {
            e.preventDefault();
            this.cycleBlockSelection(e.shiftKey ? -1 : 1);
            return;
        }

        const selectedId = this.panel.preview?.getSelectedBlockId();
        if (!selectedId) return;

        const cellData = this.getCellData(selectedId);
        if (!cellData) return;

        const { cell, isPlaceholder } = cellData;
        let handled = false;
        let needsGridExpansion = false;

        // Delete/Backspace для удаления placeholder блоков
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                handled = this.tryDeletePlaceholder(selectedId);
                if (handled) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
            }
        }

        // Arrow keys для перемещения
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
            switch (e.key) {
                case 'ArrowUp':
                    handled = isPlaceholder
                        ? this.movePlaceholder(selectedId, -1, 0)
                        : this.panel.cellManager.move(selectedId, -1, 0);
                    break;
                case 'ArrowDown':
                    handled = isPlaceholder
                        ? this.movePlaceholder(selectedId, 1, 0)
                        : this.panel.cellManager.move(selectedId, 1, 0);
                    if (!handled) {
                        needsGridExpansion = this.tryExpandGridDown(selectedId);
                        handled = needsGridExpansion;
                    }
                    break;
                case 'ArrowLeft':
                    handled = isPlaceholder
                        ? this.movePlaceholder(selectedId, 0, -1)
                        : this.panel.cellManager.move(selectedId, 0, -1);
                    break;
                case 'ArrowRight':
                    handled = isPlaceholder
                        ? this.movePlaceholder(selectedId, 0, 1)
                        : this.panel.cellManager.move(selectedId, 0, 1);
                    if (!handled) {
                        needsGridExpansion = this.tryExpandGridRight(selectedId);
                        handled = needsGridExpansion;
                    }
                    break;
            }
        }

        // Shift + Arrow для изменения размера
        if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
            switch (e.key) {
                case 'ArrowUp':
                    handled = isPlaceholder
                        ? this.resizePlaceholder(selectedId, 'up', -1)
                        : this.panel.cellManager.expandSpan(selectedId, 'up', -1);
                    break;
                case 'ArrowDown':
                    handled = isPlaceholder
                        ? this.resizePlaceholder(selectedId, 'down', 1)
                        : this.panel.cellManager.expandSpan(selectedId, 'down', 1);
                    if (!handled) {
                        needsGridExpansion = this.tryExpandGridDownForResize(selectedId);
                        handled = needsGridExpansion;
                    }
                    break;
                case 'ArrowLeft':
                    handled = isPlaceholder
                        ? this.resizePlaceholder(selectedId, 'left', -1)
                        : this.panel.cellManager.expandSpan(selectedId, 'left', -1);
                    break;
                case 'ArrowRight':
                    handled = isPlaceholder
                        ? this.resizePlaceholder(selectedId, 'right', 1)
                        : this.panel.cellManager.expandSpan(selectedId, 'right', 1);
                    if (!handled) {
                        needsGridExpansion = this.tryExpandGridRightForResize(selectedId);
                        handled = needsGridExpansion;
                    }
                    break;
            }
        }

        // Ctrl + Arrow для увеличения размера от центра
        if (e.ctrlKey && !e.shiftKey) {
            switch (e.key) {
                case 'ArrowUp':
                    handled = isPlaceholder
                        ? this.resizePlaceholder(selectedId, 'up', 1)
                        : this.panel.cellManager.expandSpan(selectedId, 'up', 1);
                    break;
                case 'ArrowDown':
                    handled = isPlaceholder
                        ? this.resizePlaceholder(selectedId, 'down', 1)
                        : this.panel.cellManager.expandSpan(selectedId, 'down', 1);
                    if (!handled) {
                        needsGridExpansion = this.tryExpandGridDownForResize(selectedId);
                        handled = needsGridExpansion;
                    }
                    break;
                case 'ArrowLeft':
                    handled = isPlaceholder
                        ? this.resizePlaceholder(selectedId, 'left', 1)
                        : this.panel.cellManager.expandSpan(selectedId, 'left', 1);
                    break;
                case 'ArrowRight':
                    handled = isPlaceholder
                        ? this.resizePlaceholder(selectedId, 'right', 1)
                        : this.panel.cellManager.expandSpan(selectedId, 'right', 1);
                    if (!handled) {
                        needsGridExpansion = this.tryExpandGridRightForResize(selectedId);
                        handled = needsGridExpansion;
                    }
                    break;
            }
        }

        if (handled) {
            e.preventDefault();
            e.stopPropagation();
            if (!isPlaceholder) {
                this.panel.cellManager.rebuildOccupancyGrid();
            }
            this.panel.refreshPreview();
            this.panel.updateSelectedBlockInfo(selectedId);
            if (needsGridExpansion) {
                this.panel.updateToolbarInputs();
                this.panel.updateStatusBar();
            }
        }

        // Escape для снятия выделения
        if (e.key === 'Escape') {
            this.panel.preview.deselectAll();
            this.panel.updateSelectedBlockInfo(null);
        }
    }

    /**
     * Перемещает placeholder на указанное смещение
     * @param {string} blockId - ID placeholder
     * @param {number} dRow - Смещение по строкам
     * @param {number} dCol - Смещение по колонкам
     * @returns {boolean}
     */
    movePlaceholder(blockId, dRow, dCol) {
        const placeholder = this.panel.placeholders.find(p => p.blockId === blockId);
        if (!placeholder) return false;

        const newRow = placeholder.row + dRow;
        const newCol = placeholder.col + dCol;

        if (this.canPlacePlaceholder(blockId, newRow, newCol, placeholder.rowSpan, placeholder.colSpan)) {
            placeholder.row = newRow;
            placeholder.col = newCol;
            return true;
        }
        return false;
    }

    /**
     * Изменяет размер placeholder
     * @param {string} blockId - ID placeholder
     * @param {string} direction - Направление: 'up', 'down', 'left', 'right'
     * @param {number} delta - Изменение размера (+1 увеличить, -1 уменьшить)
     * @returns {boolean}
     */
    resizePlaceholder(blockId, direction, delta) {
        const placeholder = this.panel.placeholders.find(p => p.blockId === blockId);
        if (!placeholder) return false;

        let newRow = placeholder.row;
        let newCol = placeholder.col;
        let newRowSpan = placeholder.rowSpan;
        let newColSpan = placeholder.colSpan;

        switch (direction) {
            case 'up':
                if (delta > 0) {
                    // Расширяем вверх
                    newRow -= 1;
                    newRowSpan += 1;
                } else {
                    // Сжимаем снизу
                    if (newRowSpan <= 1) return false;
                    newRowSpan -= 1;
                }
                break;
            case 'down':
                if (delta > 0) {
                    // Расширяем вниз
                    newRowSpan += 1;
                } else {
                    // Сжимаем сверху
                    if (newRowSpan <= 1) return false;
                    newRow += 1;
                    newRowSpan -= 1;
                }
                break;
            case 'left':
                if (delta > 0) {
                    // Расширяем влево
                    newCol -= 1;
                    newColSpan += 1;
                } else {
                    // Сжимаем справа
                    if (newColSpan <= 1) return false;
                    newColSpan -= 1;
                }
                break;
            case 'right':
                if (delta > 0) {
                    // Расширяем вправо
                    newColSpan += 1;
                } else {
                    // Сжимаем слева
                    if (newColSpan <= 1) return false;
                    newCol += 1;
                    newColSpan -= 1;
                }
                break;
        }

        if (this.canPlacePlaceholder(blockId, newRow, newCol, newRowSpan, newColSpan)) {
            placeholder.row = newRow;
            placeholder.col = newCol;
            placeholder.rowSpan = newRowSpan;
            placeholder.colSpan = newColSpan;
            return true;
        }
        return false;
    }

    /**
     * Пытается удалить placeholder блок
     * @param {string} blockId - ID блока
     * @returns {boolean} - Удалён ли блок
     */
    tryDeletePlaceholder(blockId) {
        // Ищем в placeholders
        const placeholderIndex = this.panel.placeholders.findIndex(p => p.blockId === blockId);
        if (placeholderIndex !== -1) {
            this.panel.placeholders.splice(placeholderIndex, 1);
            this.panel.preview.deselectAll();
            this.panel.updateSelectedBlockInfo(null);
            this.panel.refreshPreview();
            this.panel.updateFillBlocksSection();
            this.panel.updateStatusBar();
            return true;
        }
        return false;
    }

    /**
     * Расширяет сетку вниз и перемещает блок
     * @param {string} blockId - ID блока
     * @returns {boolean}
     */
    tryExpandGridDown(blockId) {
        const cellData = this.getCellData(blockId);
        if (!cellData) return false;

        const { cell, isPlaceholder } = cellData;

        // Проверяем что блок на нижнем краю
        if (cell.row + cell.rowSpan - 1 < this.panel.gridSize.rows) return false;

        // Расширяем сетку
        this.panel.gridSize.rows += 1;

        // Пробуем переместить
        if (isPlaceholder) {
            return this.movePlaceholder(blockId, 1, 0);
        }
        return this.panel.cellManager.move(blockId, 1, 0);
    }

    /**
     * Расширяет сетку вправо и перемещает блок
     * @param {string} blockId - ID блока
     * @returns {boolean}
     */
    tryExpandGridRight(blockId) {
        const cellData = this.getCellData(blockId);
        if (!cellData) return false;

        const { cell, isPlaceholder } = cellData;

        // Проверяем что блок на правом краю
        if (cell.col + cell.colSpan - 1 < this.panel.gridSize.cols) return false;

        // Расширяем сетку (максимум MAX_GRID_COLS колонок)
        if (this.panel.gridSize.cols >= MAX_GRID_COLS) return false;
        this.panel.gridSize.cols += 1;

        // Пробуем переместить
        if (isPlaceholder) {
            return this.movePlaceholder(blockId, 0, 1);
        }
        return this.panel.cellManager.move(blockId, 0, 1);
    }

    /**
     * Расширяет сетку вниз для увеличения размера блока
     * @param {string} blockId - ID блока
     * @returns {boolean}
     */
    tryExpandGridDownForResize(blockId) {
        const cellData = this.getCellData(blockId);
        if (!cellData) return false;

        const { isPlaceholder } = cellData;

        // Расширяем сетку
        this.panel.gridSize.rows += 1;

        // Пробуем увеличить размер
        if (isPlaceholder) {
            return this.resizePlaceholder(blockId, 'down', 1);
        }
        return this.panel.cellManager.expandSpan(blockId, 'down', 1);
    }

    /**
     * Расширяет сетку вправо для увеличения размера блока
     * @param {string} blockId - ID блока
     * @returns {boolean}
     */
    tryExpandGridRightForResize(blockId) {
        const cellData = this.getCellData(blockId);
        if (!cellData) return false;

        const { isPlaceholder } = cellData;

        // Максимум MAX_GRID_COLS колонок
        if (this.panel.gridSize.cols >= MAX_GRID_COLS) return false;
        this.panel.gridSize.cols += 1;

        // Пробуем увеличить размер
        if (isPlaceholder) {
            return this.resizePlaceholder(blockId, 'right', 1);
        }
        return this.panel.cellManager.expandSpan(blockId, 'right', 1);
    }

    /**
     * Изменяет размер сетки
     * @param {number} dRows - Изменение строк
     * @param {number} dCols - Изменение колонок
     */
    adjustGridSize(dRows, dCols) {
        const newRows = Math.max(1, Math.min(MAX_GRID_ROWS, this.panel.gridSize.rows + dRows));
        const newCols = Math.max(1, Math.min(MAX_GRID_COLS, this.panel.gridSize.cols + dCols));

        if (newRows === this.panel.gridSize.rows && newCols === this.panel.gridSize.cols) {
            return;
        }

        this.panel.gridSize.rows = newRows;
        this.panel.gridSize.cols = newCols;

        this.panel.cellManager.rebuildOccupancyGrid();
        this.panel.refreshPreview();
        this.panel.updateToolbarInputs();
        this.panel.updateStatusBar();
    }

    /**
     * Переключает выделение между блоками
     * @param {number} direction - Направление: 1 вперёд, -1 назад
     */
    cycleBlockSelection(direction) {
        // Собираем все ID блоков (обычные + placeholders)
        const blockIds = [
            ...Object.keys(this.panel.cells),
            ...this.panel.placeholders.map(p => p.blockId)
        ];

        if (blockIds.length === 0) return;

        const currentId = this.panel.preview?.getSelectedBlockId();
        let currentIndex = currentId ? blockIds.indexOf(currentId) : -1;

        // Вычисляем следующий индекс
        let nextIndex;
        if (currentIndex === -1) {
            nextIndex = direction > 0 ? 0 : blockIds.length - 1;
        } else {
            nextIndex = (currentIndex + direction + blockIds.length) % blockIds.length;
        }

        const nextId = blockIds[nextIndex];
        this.panel.preview.selectBlock(nextId);
        this.panel.updateSelectedBlockInfo(nextId);
    }

    /**
     * Уничтожение менеджера
     */
    destroy() {
        if (this.boundKeyHandler) {
            document.removeEventListener('keydown', this.boundKeyHandler);
            this.boundKeyHandler = null;
        }

        // Очищаем callbacks на preview чтобы избежать утечек памяти
        if (this.panel.preview) {
            this.panel.preview.onBlockSelect = null;
            this.panel.preview.onBlockDragStart = null;
            this.panel.preview.onBlockDragEnd = null;
            this.panel.preview.onBlockResize = null;
        }

        this.isDragging = false;
        this.draggedBlockId = null;
    }
}

export default LayoutDragManager;

/**
 * Управляет ячейками сетки и валидирует span
 */
export class LayoutCellManager {
    constructor(panel) {
        this.panel = panel;
        this.occupancyGrid = new Map();  // "row-col" → childId

        this.rebuildOccupancyGrid();
    }

    /**
     * Перестраивает карту занятости из текущих cells
     * Автоматически очищает orphan cells (для удалённых блоков)
     */
    rebuildOccupancyGrid() {
        this.occupancyGrid.clear();

        // Получаем актуальные ID дочерних блоков
        const validChildIds = new Set(this.panel.childBlocks.map(b => b.id));

        // Собираем orphan cells для удаления
        const orphanIds = [];

        for (const [childId, cell] of Object.entries(this.panel.cells)) {
            // Пропускаем orphan cells (блоки которые были удалены)
            if (!validChildIds.has(childId)) {
                orphanIds.push(childId);
                continue;
            }

            if (!cell) continue;

            for (let r = cell.row; r < cell.row + (cell.rowSpan || 1); r++) {
                for (let c = cell.col; c < cell.col + (cell.colSpan || 1); c++) {
                    this.occupancyGrid.set(`${r}-${c}`, childId);
                }
            }
        }

        // Удаляем orphan cells
        for (const orphanId of orphanIds) {
            delete this.panel.cells[orphanId];
        }
    }

    /**
     * Проверяет, можно ли разместить блок в позиции
     * @param {string} childId - ID блока
     * @param {number} row - Строка
     * @param {number} col - Колонка
     * @param {number} rowSpan - Высота
     * @param {number} colSpan - Ширина
     * @returns {boolean}
     */
    canPlace(childId, row, col, rowSpan = 1, colSpan = 1) {
        const { rows, cols } = this.panel.gridSize;

        // Проверяем границы сетки
        if (row < 1 || col < 1) return false;
        if (row + rowSpan - 1 > rows) return false;
        if (col + colSpan - 1 > cols) return false;

        // Проверяем занятость ячеек
        for (let r = row; r < row + rowSpan; r++) {
            for (let c = col; c < col + colSpan; c++) {
                const key = `${r}-${c}`;
                const occupant = this.occupancyGrid.get(key);
                if (occupant && occupant !== childId) {
                    return false;  // Ячейка занята другим блоком
                }
            }
        }

        return true;
    }

    /**
     * Размещает блок, обновляя occupancy grid
     * @param {string} childId - ID блока
     * @param {number} row - Строка
     * @param {number} col - Колонка
     * @param {number} rowSpan - Высота
     * @param {number} colSpan - Ширина
     * @returns {boolean} - Успешно ли размещён
     */
    place(childId, row, col, rowSpan = 1, colSpan = 1) {
        if (!this.canPlace(childId, row, col, rowSpan, colSpan)) {
            return false;
        }

        // Сначала очищаем старую позицию
        this.remove(childId);

        // Занимаем новые ячейки
        for (let r = row; r < row + rowSpan; r++) {
            for (let c = col; c < col + colSpan; c++) {
                this.occupancyGrid.set(`${r}-${c}`, childId);
            }
        }

        // Обновляем cells
        this.panel.cells[childId] = { row, col, rowSpan, colSpan };

        return true;
    }

    /**
     * Удаляет блок из карты занятости
     * @param {string} childId - ID блока
     */
    remove(childId) {
        const cell = this.panel.cells[childId];
        if (!cell) return;

        for (let r = cell.row; r < cell.row + (cell.rowSpan || 1); r++) {
            for (let c = cell.col; c < cell.col + (cell.colSpan || 1); c++) {
                const key = `${r}-${c}`;
                if (this.occupancyGrid.get(key) === childId) {
                    this.occupancyGrid.delete(key);
                }
            }
        }
    }

    /**
     * Перемещает блок на delta ячеек
     * @param {string} childId - ID блока
     * @param {number} deltaRow - Смещение по строкам
     * @param {number} deltaCol - Смещение по колонкам
     * @returns {boolean} - Успешно ли перемещён
     */
    move(childId, deltaRow, deltaCol) {
        const cell = this.panel.cells[childId];
        if (!cell) return false;

        const newRow = cell.row + deltaRow;
        const newCol = cell.col + deltaCol;

        return this.place(childId, newRow, newCol, cell.rowSpan, cell.colSpan);
    }

    /**
     * Изменяет span блока
     * @param {string} childId - ID блока
     * @param {string} direction - 'right' | 'down' | 'left' | 'up'
     * @param {number} delta - Изменение (положительное - увеличить, отрицательное - уменьшить)
     * @returns {boolean} - Успешно ли изменён
     */
    expandSpan(childId, direction, delta) {
        const cell = this.panel.cells[childId];
        if (!cell) return false;

        // Валидация входных параметров
        if (!Number.isFinite(delta)) return false;

        const { rows, cols } = this.panel.gridSize;
        let newCell = { ...cell };

        switch (direction) {
            case 'right':
                newCell.colSpan = Math.max(1, Math.min(cols, cell.colSpan + delta));
                break;
            case 'down':
                newCell.rowSpan = Math.max(1, Math.min(rows, cell.rowSpan + delta));
                break;
            case 'left':
                if (delta > 0) {
                    const actualDelta = Math.min(delta, cell.col - 1);
                    newCell.col = cell.col - actualDelta;
                    newCell.colSpan = cell.colSpan + actualDelta;
                } else {
                    newCell.col = Math.min(cols, cell.col - delta);
                    newCell.colSpan = Math.max(1, cell.colSpan + delta);
                }
                break;
            case 'up':
                if (delta > 0) {
                    const actualDelta = Math.min(delta, cell.row - 1);
                    newCell.row = cell.row - actualDelta;
                    newCell.rowSpan = cell.rowSpan + actualDelta;
                } else {
                    newCell.row = Math.min(rows, cell.row - delta);
                    newCell.rowSpan = Math.max(1, cell.rowSpan + delta);
                }
                break;
            default:
                return false;
        }

        // Финальная валидация границ
        newCell.row = Math.max(1, Math.min(rows, newCell.row));
        newCell.col = Math.max(1, Math.min(cols, newCell.col));
        newCell.rowSpan = Math.max(1, Math.min(rows - newCell.row + 1, newCell.rowSpan));
        newCell.colSpan = Math.max(1, Math.min(cols - newCell.col + 1, newCell.colSpan));

        return this.place(childId, newCell.row, newCell.col, newCell.rowSpan, newCell.colSpan);
    }

    /**
     * Получает блок в указанной ячейке
     * @param {number} row - Строка
     * @param {number} col - Колонка
     * @returns {string|null} - ID блока или null
     */
    getBlockAt(row, col) {
        return this.occupancyGrid.get(`${row}-${col}`) || null;
    }

    /**
     * Находит первую свободную ячейку
     * @returns {{row: number, col: number}|null}
     */
    findFreeCell() {
        const { rows, cols } = this.panel.gridSize;

        for (let r = 1; r <= rows; r++) {
            for (let c = 1; c <= cols; c++) {
                if (!this.occupancyGrid.has(`${r}-${c}`)) {
                    return { row: r, col: c };
                }
            }
        }

        return null;
    }

    /**
     * Проверяет, есть ли конфликты в текущей конфигурации
     * @returns {Array<{childId: string, conflictWith: string, cell: string}>}
     */
    findConflicts() {
        const conflicts = [];
        const seen = new Map();

        // Используем только валидные блоки (исключаем orphan cells)
        const validChildIds = new Set(this.panel.childBlocks.map(b => b.id));

        for (const [childId, cell] of Object.entries(this.panel.cells)) {
            if (!cell) continue;
            if (!validChildIds.has(childId)) continue;  // Пропускаем orphan cells

            for (let r = cell.row; r < cell.row + (cell.rowSpan || 1); r++) {
                for (let c = cell.col; c < cell.col + (cell.colSpan || 1); c++) {
                    const key = `${r}-${c}`;
                    const existing = seen.get(key);
                    if (existing && existing !== childId) {
                        conflicts.push({
                            childId,
                            conflictWith: existing,
                            cell: key
                        });
                    } else {
                        seen.set(key, childId);
                    }
                }
            }
        }

        return conflicts;
    }

    /**
     * Автоматически распределяет блоки без конфликтов
     */
    autoArrange() {
        const childOrder = this.panel.block?.data?.childOrder || [];
        const { cols } = this.panel.gridSize;

        this.occupancyGrid.clear();
        this.panel.cells = {};

        let currentRow = 1;
        let currentCol = 1;
        const colSpan = Math.floor(cols / Math.min(3, childOrder.length || 1));

        for (const childId of childOrder) {
            if (currentCol + colSpan > cols + 1) {
                currentCol = 1;
                currentRow++;
            }

            this.panel.cells[childId] = {
                row: currentRow,
                col: currentCol,
                rowSpan: 1,
                colSpan: colSpan
            };

            // Добавляем в occupancy
            for (let c = currentCol; c < currentCol + colSpan; c++) {
                this.occupancyGrid.set(`${currentRow}-${c}`, childId);
            }

            currentCol += colSpan;
        }

        // Обновляем количество строк
        this.panel.gridSize.rows = Math.max(this.panel.gridSize.rows, currentRow);
    }
}

export default LayoutCellManager;

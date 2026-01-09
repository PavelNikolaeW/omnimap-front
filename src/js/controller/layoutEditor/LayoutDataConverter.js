/**
 * Конвертирует между различными форматами раскладки
 */
export class LayoutDataConverter {
    /**
     * Конвертирует groupSizes в cells формат
     * @param {Array} groupSizes - Массив групп ["3", "2:2", "4;2,1,1"]
     * @param {Array<string>} childOrder - Порядок дочерних блоков
     * @returns {Object} - {gridSize: {rows, cols}, cells: {}}
     */
    groupSizesToCells(groupSizes, childOrder) {
        const cells = {};
        let blockIndex = 0;
        let currentRow = 1;
        const cols = 12;  // Нормализуем к 12-колоночной сетке

        for (const group of groupSizes) {
            const parsed = this.parseGroupSize(group);
            const { blocks, rows, widths } = parsed;

            // Вычисляем ширину каждого блока в колонках
            const totalWidthUnits = widths?.reduce((a, b) => a + b, 0) || blocks;
            const colUnit = cols / totalWidthUnits;

            let col = 1;
            for (let i = 0; i < blocks && blockIndex < childOrder.length; i++) {
                const childId = childOrder[blockIndex++];
                const widthUnits = widths?.[i] || 1;
                const colSpan = Math.round(widthUnits * colUnit);

                cells[childId] = {
                    row: currentRow,
                    col: col,
                    rowSpan: rows,
                    colSpan: colSpan
                };

                col += colSpan;
            }

            currentRow += rows;
        }

        // Добавляем оставшиеся блоки если есть
        while (blockIndex < childOrder.length) {
            const childId = childOrder[blockIndex++];
            cells[childId] = {
                row: currentRow,
                col: 1,
                rowSpan: 1,
                colSpan: cols
            };
            currentRow++;
        }

        return {
            gridSize: { rows: currentRow - 1, cols },
            cells
        };
    }

    /**
     * Парсит строку groupSize
     * @param {string|number} item - "3", "2:2", "4;2,1,1"
     * @returns {{blocks: number, rows: number, widths: number[]|null}}
     */
    parseGroupSize(item) {
        if (typeof item === 'number') {
            return { blocks: item, rows: 1, widths: null };
        }

        if (typeof item !== 'string') {
            return { blocks: 1, rows: 1, widths: null };
        }

        let blocks, rows = 1, widths = null;

        // Формат: "blocks[:rows][;w1,w2,...]"
        const [mainPart, widthPart] = item.split(';');
        const [blocksPart, rowsPart] = mainPart.split(':');

        blocks = parseInt(blocksPart, 10) || 1;
        if (rowsPart) {
            rows = parseInt(rowsPart, 10) || 1;
        }

        if (widthPart) {
            widths = widthPart.split(',').map(w => parseInt(w, 10) || 1);
            // Дополняем до нужного количества блоков
            while (widths.length < blocks) {
                widths.push(1);
            }
        }

        return { blocks, rows, widths };
    }

    /**
     * Конвертирует cells в groupSizes формат
     * @param {Object} cells - {childId: {row, col, rowSpan, colSpan}}
     * @param {Array<string>} childOrder - Порядок дочерних блоков
     * @param {Object} gridSize - {rows, cols}
     * @returns {Array<string>}
     */
    cellsToGroupSizes(cells, childOrder, gridSize) {
        // Группируем блоки по строкам
        const rowGroups = new Map();

        for (const childId of childOrder) {
            const cell = cells[childId];
            if (!cell) continue;

            const row = cell.row;
            if (!rowGroups.has(row)) {
                rowGroups.set(row, []);
            }
            rowGroups.get(row).push({ childId, cell });
        }

        // Сортируем строки
        const sortedRows = [...rowGroups.keys()].sort((a, b) => a - b);
        const groupSizes = [];

        for (const row of sortedRows) {
            const blocksInRow = rowGroups.get(row);
            // Сортируем блоки в строке по колонке
            blocksInRow.sort((a, b) => a.cell.col - b.cell.col);

            const blocks = blocksInRow.length;
            const rowSpan = blocksInRow[0]?.cell.rowSpan || 1;

            // Вычисляем пропорции ширины
            const widths = blocksInRow.map(b => b.cell.colSpan);
            const allSameWidth = widths.every(w => w === widths[0]);

            let groupStr = String(blocks);

            if (rowSpan > 1) {
                groupStr += `:${rowSpan}`;
            }

            if (!allSameWidth) {
                groupStr += `;${widths.join(',')}`;
            }

            groupSizes.push(groupStr);
        }

        return groupSizes;
    }

    /**
     * Создаёт пресет раскладки
     * @param {string} presetName - Название пресета
     * @param {Array<string>} childOrder - Порядок дочерних блоков
     * @returns {Object} - {gridSize, cells}
     */
    createPreset(presetName, childOrder) {
        const n = childOrder.length;
        const cols = 12;

        switch (presetName) {
            case 'equal-rows':
                return this.createEqualRowsPreset(childOrder, cols);

            case 'equal-cols':
                return this.createEqualColsPreset(childOrder, cols);

            case 'pyramid':
                return this.createPyramidPreset(childOrder, cols);

            case 'inverted-pyramid':
                return this.createInvertedPyramidPreset(childOrder, cols);

            case 'sidebar-left':
                return this.createSidebarPreset(childOrder, cols, 'left');

            case 'sidebar-right':
                return this.createSidebarPreset(childOrder, cols, 'right');

            case 'featured':
                return this.createFeaturedPreset(childOrder, cols);

            default:
                return this.createEqualGridPreset(childOrder, cols);
        }
    }

    /**
     * Равные строки (каждый блок на всю ширину)
     */
    createEqualRowsPreset(childOrder, cols) {
        const cells = {};
        childOrder.forEach((id, i) => {
            cells[id] = { row: i + 1, col: 1, rowSpan: 1, colSpan: cols };
        });
        return { gridSize: { rows: childOrder.length, cols }, cells };
    }

    /**
     * Равные колонки (все в одну строку)
     */
    createEqualColsPreset(childOrder, cols) {
        const n = childOrder.length;
        const colSpan = Math.floor(cols / n);
        const cells = {};

        childOrder.forEach((id, i) => {
            cells[id] = { row: 1, col: i * colSpan + 1, rowSpan: 1, colSpan };
        });

        return { gridSize: { rows: 1, cols }, cells };
    }

    /**
     * Пирамида (1 сверху, 2 в середине, 3 снизу и т.д.)
     */
    createPyramidPreset(childOrder, cols) {
        const cells = {};
        let blockIndex = 0;
        let row = 1;
        let blocksInRow = 1;

        while (blockIndex < childOrder.length) {
            const actualBlocks = Math.min(blocksInRow, childOrder.length - blockIndex);
            const colSpan = Math.floor(cols / actualBlocks);

            for (let i = 0; i < actualBlocks; i++) {
                const id = childOrder[blockIndex++];
                cells[id] = {
                    row,
                    col: i * colSpan + 1,
                    rowSpan: 1,
                    colSpan
                };
            }

            row++;
            blocksInRow++;
        }

        return { gridSize: { rows: row - 1, cols }, cells };
    }

    /**
     * Перевёрнутая пирамида
     */
    createInvertedPyramidPreset(childOrder, cols) {
        // Сначала определяем сколько строк нужно
        let totalBlocks = childOrder.length;
        let blocksInRow = 1;
        let rows = 0;

        while (totalBlocks > 0) {
            rows++;
            blocksInRow++;
            totalBlocks -= blocksInRow - 1;
        }

        // Теперь распределяем в обратном порядке
        const cells = {};
        let blockIndex = 0;
        blocksInRow = rows;

        for (let row = 1; row <= rows && blockIndex < childOrder.length; row++) {
            const actualBlocks = Math.min(blocksInRow, childOrder.length - blockIndex);
            const colSpan = Math.floor(cols / actualBlocks);

            for (let i = 0; i < actualBlocks; i++) {
                const id = childOrder[blockIndex++];
                cells[id] = {
                    row,
                    col: i * colSpan + 1,
                    rowSpan: 1,
                    colSpan
                };
            }

            blocksInRow--;
        }

        return { gridSize: { rows, cols }, cells };
    }

    /**
     * Сайдбар слева или справа
     */
    createSidebarPreset(childOrder, cols, side) {
        if (childOrder.length === 0) {
            return { gridSize: { rows: 1, cols }, cells: {} };
        }

        const cells = {};
        const sidebarWidth = 4;
        const contentWidth = cols - sidebarWidth;
        const rows = Math.max(1, childOrder.length - 1);

        // Первый блок - сайдбар
        const sidebarCol = side === 'left' ? 1 : contentWidth + 1;
        const contentCol = side === 'left' ? sidebarWidth + 1 : 1;

        cells[childOrder[0]] = {
            row: 1,
            col: sidebarCol,
            rowSpan: rows,
            colSpan: sidebarWidth
        };

        // Остальные блоки
        for (let i = 1; i < childOrder.length; i++) {
            cells[childOrder[i]] = {
                row: i,
                col: contentCol,
                rowSpan: 1,
                colSpan: contentWidth
            };
        }

        return { gridSize: { rows, cols }, cells };
    }

    /**
     * Featured (большой блок + маленькие)
     */
    createFeaturedPreset(childOrder, cols) {
        if (childOrder.length === 0) {
            return { gridSize: { rows: 1, cols }, cells: {} };
        }

        const cells = {};

        // Первый блок - большой (2x2)
        cells[childOrder[0]] = {
            row: 1,
            col: 1,
            rowSpan: 2,
            colSpan: Math.floor(cols / 2)
        };

        // Остальные блоки справа и снизу
        const remaining = childOrder.slice(1);
        const rightColStart = Math.floor(cols / 2) + 1;
        const rightColSpan = cols - Math.floor(cols / 2);

        for (let i = 0; i < remaining.length; i++) {
            if (i < 2) {
                // Справа от большого блока
                cells[remaining[i]] = {
                    row: i + 1,
                    col: rightColStart,
                    rowSpan: 1,
                    colSpan: rightColSpan
                };
            } else {
                // Снизу
                const bottomCols = Math.min(3, remaining.length - 2);
                const colSpan = Math.floor(cols / bottomCols);
                const colIndex = (i - 2) % bottomCols;

                cells[remaining[i]] = {
                    row: 3 + Math.floor((i - 2) / bottomCols),
                    col: colIndex * colSpan + 1,
                    rowSpan: 1,
                    colSpan
                };
            }
        }

        const maxRow = Math.max(...Object.values(cells).map(c => c.row + c.rowSpan - 1));
        return { gridSize: { rows: maxRow, cols }, cells };
    }

    /**
     * Равномерная сетка
     */
    createEqualGridPreset(childOrder, cols) {
        const n = childOrder.length;
        const gridCols = Math.ceil(Math.sqrt(n));
        const colSpan = Math.floor(cols / gridCols);
        const cells = {};

        childOrder.forEach((id, i) => {
            const row = Math.floor(i / gridCols) + 1;
            const col = (i % gridCols) * colSpan + 1;

            cells[id] = { row, col, rowSpan: 1, colSpan };
        });

        const rows = Math.ceil(n / gridCols);
        return { gridSize: { rows, cols }, cells };
    }
}

export default LayoutDataConverter;

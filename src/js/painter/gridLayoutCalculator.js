export class GridLayoutCalculator {
    /**
     * Вычисляет параметры групповой раскладки CSS Grid.
     * @param {number} N - Общее число блоков.
     * @param {Object} options - Опции конфигурации.
     * @returns {Object} - Параметры для отрисовки сетки.
     */
    static computeGridLayoutGroups(N, options = {}) {
        // Шаг 0: Установка базовых опций.
        const minArea = options.minArea || 1;
        let rawGroupSizes;
        // Определяем исходный формат групп.
        if (options.groupSizes && options.groupSizes.length) {
            rawGroupSizes = options.groupSizes;
        } else if (options.desiredGroupCount) {
            rawGroupSizes = GridLayoutCalculator.partitionNumber(N, options.desiredGroupCount);
        } else {
            const half = (N / 2) | 0;
            rawGroupSizes = [N - half, half];
        }

        // Шаг 1: Парсинг rawGroupSizes в массив объектов групп.
        const len = rawGroupSizes.length;
        const groupDefs = new Array(len);
        for (let i = 0; i < len; i++) {
            const item = rawGroupSizes[i];
            if (typeof item === 'string') {
                // Формат: "blocks[:rows][;w1,w2,...]"
                let blocks, rows = 1, customWidths;
                const semi = item.indexOf(';');
                let mainPart, widthPart;
                if (semi !== -1) {
                    mainPart = item.substring(0, semi);
                    widthPart = item.substring(semi + 1);
                } else {
                    mainPart = item;
                }
                const colon = mainPart.indexOf(':');
                if (colon !== -1) {
                    blocks = parseInt(mainPart.substring(0, colon), 10);
                    rows = parseInt(mainPart.substring(colon + 1), 10);
                } else {
                    blocks = parseInt(mainPart, 10);
                }
                if (widthPart) {
                    const parts = widthPart.split(',');
                    let partsLen = parts.length;
                    customWidths = new Array(blocks);
                    for (let j = 0; j < partsLen; j++) {
                        customWidths[j] = parseInt(parts[j], 10);
                    }
                    for (; blocks > partsLen; partsLen++) {
                        customWidths[partsLen] = 1
                    }
                }
                groupDefs[i] = {blocks, rows, customWidths};
            } else if (typeof item === 'number') {
                groupDefs[i] = {blocks: item, rows: item};
            } else {
                throw new Error("Invalid groupSizes format. Must be number or 'blocks[:rows][;w1,w2,...]' string.");
            }
        }

        // Шаг 2: Корректировка общего числа блоков до ровного N.
        let totalBlocks = 0;
        for (let i = 0, l = groupDefs.length; i < l; i++) {
            totalBlocks += groupDefs[i].blocks;
        }
        if (totalBlocks < N) {
            groupDefs.push({blocks: N - totalBlocks, rows: 1});
        } else if (totalBlocks > N) {
            let count = 0, newLen = 0;
            for (let i = 0, l = groupDefs.length; i < l; i++) {
                const g = groupDefs[i];
                if (count + g.blocks <= N) {
                    groupDefs[newLen++] = g;
                    count += g.blocks;
                } else {
                    const remaining = N - count;
                    if (remaining > 0) groupDefs[newLen++] = {
                        blocks: remaining,
                        rows: g.rows,
                        customWidths: g.customWidths
                    };
                    break;
                }
            }
            groupDefs.length = newLen;
        }

        // Удаляем группы с нулевыми значениями.
        let newLen = 0;
        for (let i = 0, l = groupDefs.length; i < l; i++) {
            const g = groupDefs[i];
            if (g.blocks > 0 && g.rows > 0) groupDefs[newLen++] = g;
        }
        groupDefs.length = newLen;

        // Шаг 3: Вычисляем LCM (наименьшее общее кратное) для числа блоков.
        let L = 1;
        for (let i = 0, l = groupDefs.length; i < l; i++) {
            L = GridLayoutCalculator.lcm(L, groupDefs[i].blocks);
        }
        const k = Math.ceil(minArea / L);
        let gridColumns = L ? k * L : 1;

        // Шаг 3.1: Корректировка gridColumns с учётом customWidths.
        let maxRatioSum = 0;
        for (let i = 0, l = groupDefs.length; i < l; i++) {
            const g = groupDefs[i];
            if (g.customWidths) {
                let sum = 0;
                for (let j = 0, l2 = g.customWidths.length; j < l2; j++) {
                    sum += g.customWidths[j];
                }
                if (sum > maxRatioSum) maxRatioSum = sum;
            }
        }
        if (maxRatioSum > 0) {
            let attempt = 0, bestFit = gridColumns;
            const maxAttempts = 1, scaleFactor = 10;
            while (attempt < maxAttempts) {
                const testColumns = maxRatioSum * scaleFactor * (attempt + 1);
                let allFit = true;
                for (let i = 0, l = groupDefs.length; i < l; i++) {
                    const g = groupDefs[i];
                    if (g.customWidths) {
                        let sumRatios = 0;
                        for (let j = 0, l2 = g.customWidths.length; j < l2; j++) {
                            sumRatios += g.customWidths[j];
                        }
                        let sumAllocated = 0;
                        for (let j = 0, l2 = g.customWidths.length; j < l2; j++) {
                            sumAllocated += Math.round(testColumns * (g.customWidths[j] / sumRatios));
                        }
                        if (Math.abs(sumAllocated - testColumns) > g.blocks) {
                            allFit = false;
                            break;
                        }
                    }
                }
                if (allFit) {
                    bestFit = testColumns;
                    break;
                }
                attempt++;
            }
            if (bestFit > gridColumns) gridColumns = bestFit;
        }

        // Шаг 4: Разметка блоков в сетке.
        const rectangles = [];
        let contentRows = 1, currentRow = contentRows + 1;
        for (let i = 0, l = groupDefs.length; i < l; i++) {
            const g = groupDefs[i];
            const blocks = g.blocks;
            const widths = new Array(blocks);
            if (g.customWidths) {
                let sumRatios = 0;
                for (let j = 0, l2 = g.customWidths.length; j < l2; j++) {
                    sumRatios += g.customWidths[j];
                }
                for (let j = 0; j < blocks; j++) {
                    widths[j] = Math.round(gridColumns * (g.customWidths[j] / sumRatios));
                }
            } else {
                const base = (gridColumns / blocks) | 0;
                const remainder = gridColumns % blocks;
                for (let j = 0; j < blocks; j++) {
                    widths[j] = base + (j < remainder ? 1 : 0);
                }
            }
            let colStart = 1;
            for (let j = 0; j < blocks; j++) {
                const w = widths[j];
                rectangles.push({
                    gridRowStart: currentRow,
                    gridRowEnd: currentRow + g.rows,
                    gridColumnStart: colStart,
                    gridColumnEnd: colStart + w,
                    label: 'G' + (i + 1) + '-B' + (j + 1)
                });
                colStart += w;
            }
            currentRow += g.rows;
        }
        const totalGridRows = currentRow - 1;
        return {gridColumns, totalGridRows, contentRows, groupSizes: rawGroupSizes, k, rectangles};
    }

    // Разбивает число total на почти равные части.
    static partitionNumber(total, parts) {
        const base = (total / parts) | 0;
        const remainder = total % parts;
        const result = new Array(parts);
        for (let i = 0; i < parts; i++) {
            result[i] = base + (i < remainder ? 1 : 0);
        }
        return result;
    }

    // Вычисляет НОК для двух чисел.
    static lcm(a, b) {
        if (!a || !b) return 0;
        // Перемножение с делением для избежания переполнения
        return (a / GridLayoutCalculator.gcd(a, b)) * b;
    }

    // Вычисляет НОД (алгоритм Евклида).
    static gcd(a, b) {
        while (b) {
            const t = b;
            b = a % b;
            a = t;
        }
        return a;
    }

    /**
     * Вычисляет CSS Grid позиции из layoutCells формата.
     * Поддерживает индивидуальный rowSpan/colSpan для каждого блока.
     *
     * @param {Object} layoutCells - Конфигурация ячеек
     * @param {Object} layoutCells.gridSize - {rows: number, cols: number}
     * @param {Object} layoutCells.cells - {childId: {row, col, rowSpan, colSpan}}
     * @param {Array<string>} childOrder - Порядок дочерних блоков
     * @returns {Object} - {gridColumns, totalGridRows, contentRows, rectangles}
     */
    static computeGridLayoutCells(layoutCells, childOrder) {
        const { gridSize, cells } = layoutCells;
        const rectangles = [];

        // Создаём rectangles для каждого дочернего блока
        for (let i = 0; i < childOrder.length; i++) {
            const childId = childOrder[i];
            const cell = cells[childId];

            if (cell) {
                // Есть явная позиция в cells
                rectangles.push({
                    childId,
                    gridRowStart: cell.row + 1,  // +1 для content row
                    gridRowEnd: cell.row + 1 + (cell.rowSpan || 1),
                    gridColumnStart: cell.col,
                    gridColumnEnd: cell.col + (cell.colSpan || 1),
                    label: `Cell-${i + 1}`
                });
            } else {
                // Нет позиции - авто-размещение в конце
                // Находим первую свободную позицию
                const autoPos = GridLayoutCalculator._findFreePosition(
                    gridSize, cells, childOrder.slice(0, i)
                );
                rectangles.push({
                    childId,
                    gridRowStart: autoPos.row + 1,
                    gridRowEnd: autoPos.row + 2,
                    gridColumnStart: autoPos.col,
                    gridColumnEnd: autoPos.col + 1,
                    label: `Cell-${i + 1}`
                });
            }
        }

        return {
            gridColumns: gridSize.cols,
            totalGridRows: gridSize.rows + 1,  // +1 для content
            contentRows: 1,
            rectangles
        };
    }

    /**
     * Находит первую свободную позицию в сетке
     * @private
     */
    static _findFreePosition(gridSize, cells, placedChildren) {
        const occupied = new Set();

        // Отмечаем занятые ячейки
        for (const childId of placedChildren) {
            const cell = cells[childId];
            if (cell) {
                for (let r = cell.row; r < cell.row + (cell.rowSpan || 1); r++) {
                    for (let c = cell.col; c < cell.col + (cell.colSpan || 1); c++) {
                        occupied.add(`${r}-${c}`);
                    }
                }
            }
        }

        // Ищем первую свободную ячейку
        for (let r = 1; r <= gridSize.rows; r++) {
            for (let c = 1; c <= gridSize.cols; c++) {
                if (!occupied.has(`${r}-${c}`)) {
                    return { row: r, col: c };
                }
            }
        }

        // Все занято - расширяем сетку
        return { row: gridSize.rows + 1, col: 1 };
    }

    /**
     * Генерирует начальную конфигурацию cells из текущего childOrder
     * Распределяет блоки равномерно по сетке
     *
     * @param {Array<string>} childOrder - Порядок дочерних блоков
     * @param {Object} options - Опции
     * @param {number} options.cols - Количество колонок (по умолчанию 12)
     * @param {number} options.blocksPerRow - Блоков в строке (по умолчанию авто)
     * @returns {Object} - layoutCells конфигурация
     */
    static generateInitialCells(childOrder, options = {}) {
        const cols = options.cols || 12;
        const n = childOrder.length;

        // Определяем количество блоков в строке
        let blocksPerRow = options.blocksPerRow;
        if (!blocksPerRow) {
            // Авто-расчёт: квадратная форма
            blocksPerRow = Math.ceil(Math.sqrt(n));
            if (blocksPerRow > 4) blocksPerRow = 4;
        }

        const colSpan = Math.floor(cols / blocksPerRow);
        const cells = {};
        let currentRow = 1;
        let currentCol = 1;

        for (let i = 0; i < n; i++) {
            const childId = childOrder[i];

            cells[childId] = {
                row: currentRow,
                col: currentCol,
                rowSpan: 1,
                colSpan: colSpan
            };

            currentCol += colSpan;
            if (currentCol > cols) {
                currentCol = 1;
                currentRow++;
            }
        }

        return {
            gridSize: { rows: currentRow, cols },
            cells
        };
    }
}
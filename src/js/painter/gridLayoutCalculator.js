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
}
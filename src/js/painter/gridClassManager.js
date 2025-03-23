import {findLCM, findNearestRoots} from '../utils/functions'
import {getElementSizeClass, measurePerformance} from "../utils/utils"
import {styleConfig} from "./styles";
import {log} from "@jsplumb/browser-ui";


class GridClassManager {

    constructor() {
    }

    manager(block, parentBlock) {
        this.calcBlockSize(block, parentBlock)
        const layout = block.size.layout

        const len = block.children.length
        const layoutOptions = this.calc_optionsLayout(layout, len, block.data?.groupSizes)
        if (layout === 'table') {
            return GridClassManager.table(block)
        }
        const {totalGridRows, gridColumns, rectangles} = GridClassManager.computeGridLayoutGroups(len, layoutOptions)
        return GridClassManager.returnClasses(block, totalGridRows, gridColumns, rectangles)
    }

    calcBlockSize(block, parentBlock) {
        const {width: parentWidth, height: parentHeight, layout: parentLayout} = parentBlock.size;
        const [totalRows, totalCols] = this._calcParentGrid(parentBlock.grid);
        const [childRows, childCols] = this._calcChildGrid(parentBlock.childrenPositions[block.id]);
        let {padding, gapCol, gapRow, content} = this._styleCorrection(parentBlock, totalRows, totalCols);
        if (block.data?.view === 'link') {
            padding = 0
        }
        const calculatedSize = {
            width: Number((parentWidth - padding - gapCol) / totalCols * childCols),
            height: Number((parentHeight - content - padding - gapRow) / totalRows * childRows)
        }

        block.size = getElementSizeClass(null, calculatedSize); // todo если размеры кастомные нужно использовать дефолтный класс размера так как теряется адаптивность
        if (block.data?.customLayout && block.data.customLayout !== 'default') {
            block.size.layout = block.data.customLayout
        }
    }

    calc_optionsLayout(layout, len, groupSizes = []) {
        const groupCount = this.calc_group(layout, len)
        return {
            minArea: 1,
            desiredGroupCount: groupCount,
            groupSizes: groupSizes
        }
    }

    calc_group(layout, n) {
        const [size, form] = layout.split('-')
        if (form === 'sq') {
            if (n < 4) return 2
            return Math.floor(Math.sqrt(n))
        }
        if (form === 'w') {
            if (size === 'xxl')
                if (n === 3) return 2
                else return Math.max(Math.floor(Math.sqrt(n)), 1)
            if (size === 'xl')
                return Math.max(Math.floor(Math.sqrt(n / 3)), 1)
            if (n < 6) return 1
            if (n < 20) return 2
            if (n < 32) return 4

            return Math.floor(Math.sqrt(n / 2))
        }
        if (form === 'h') {
            if (size === 'xxl' || size === 'xl') {
                return Math.floor(Math.sqrt(n * 2))
            }
            if (size === 'l') {
                if (n < 6) return n
                else if (n < 12) return Math.floor(n / 2)
                else return Math.floor(Math.sqrt(n * 2))
            }
            if (size === 'm' || size === 's' || size === 'xs' || size === 'xxs') {
                if (n < 6) return n
                else if (n < 12) return Math.floor(n / 2)
                else return Math.floor(Math.sqrt(n * 2))
            }
        }
        return 2
    }

    static returnClasses(block, totalGridRows, gridColumns, rectangles) {
        return [
            GridClassManager._setBlockGrid(totalGridRows, gridColumns),
            GridClassManager._setContentPosition(totalGridRows, gridColumns),
            GridClassManager._setChildrenPosition(block, totalGridRows, gridColumns, rectangles),
        ]
    }

    static table(block) {
        const gridSize = Math.ceil(Math.sqrt(block.children.length))
        const childrenPosition = {}

        let childIndex = 0;
        let currentRow = 2; // Инициализация счетчика строк, начиная со второй строки

        // Переменная для определения количества колонок, занимаемых каждым дочерним элементом
        const columnsPerChild = 1;

        // Итерация по каждой позиции дочернего элемента в объекте
        for (let i = 0; i < block.children.length; i++) {
            const id = block.data.childOrder[i]
            // Проверка, нужно ли переходить на новую строку
            if (childIndex !== 0 && childIndex % gridSize === 0) {
                currentRow++;
                childIndex = 0;
            }

            // Вычисление начальной и конечной колонок для текущего дочернего элемента
            let startCol = childIndex * columnsPerChild + 1;
            let endCol = startCol + columnsPerChild;

            // Назначение стилей сетки для дочернего элемента
            childrenPosition[id] = [
                `grid-column_${startCol}__${endCol}`,
                `grid-row_${currentRow}`
            ]
            childIndex++;
        }
        return [
            GridClassManager._setBlockGrid(block, gridSize, gridSize),
            GridClassManager._setContentPosition(block, gridSize, gridSize),
            childrenPosition,
        ]
    }

    static _setContentPosition(row, col) {
        return [
            `grid-column_1_sl_${col + 1}`,
            `grid-row_auto`
        ]
    }

    static _setBlockGrid(row, col) {
        if (row > 1) row--
        return [
            `grid-template-columns_${'1fr__'.repeat(Math.max(col, 1))}`,
            `grid-template-rows_auto__${'1fr__'.repeat(row)}`
        ]
    }

    /**
     * Распределяет дочерние элементы блока по сетке, основываясь на заданном количестве строк и колонок.
     *
     * @param {Object} block - объект блока, содержащий дочерние элементы.
     * @param {number} row - количество строк, на которые нужно распределить элементы.
     * @param {number} col - общее количество колонок в сетке.
     */
    static _setChildrenPosition(block, row, col, rectangles = []) {
        if (rectangles.length) {
            const children_position = {row: row + 1, col}
            const totalChildren = block.children.length;
            for (let i = 0; i < totalChildren; i++) {
                const id = block.data.childOrder[i]
                const rect = rectangles[i]
                children_position[id] = [
                    `grid-column_${rect.gridColumnStart}__${rect.gridColumnEnd}`,
                    `grid-row_${rect.gridRowStart}__${rect.gridRowEnd}`
                ]
            }
            return children_position
        }
    }

    _calcParentGrid(grids) {
        let row, col
        grids.forEach(item => {
            if (item.includes('grid-template-columns_')) {
                col = item.split('1fr').length - 1
            } else if (item.includes('grid-template-rows_')) {
                row = item.split('1fr').length - 1
            }
        })
        return [row, col]
    }

    _calcChildGrid(rowCols) {
        let row = 1, col = 1; // Инициализируем с 1 как дефолтное значение
        rowCols?.forEach(item => {
            const [type, ...positions] = item.split('_');

            // Проверка на span
            if (positions[0] === 'span') {
                const spanValue = parseInt(positions[1], 10);
                if (type === 'grid-column') {
                    col = spanValue;
                } else if (type === 'grid-row') {
                    row = spanValue;
                }
            } else {
                // Обработка диапазона
                const ranges = positions.map(pos => pos.split('__').map(Number));
                const [start, _, end = start] = ranges;

                if (type === 'grid-column') {
                    col = Math.abs(start - end) + (ranges.length === 1 ? 1 : 0);
                } else if (type === 'grid-row') {
                    row = Math.abs(start - end) + (ranges.length === 1 ? 1 : 0);
                }
            }
        });

        return [row, col];
    }

    _styleCorrection(parentBlock, row, col) {
        const layout = parentBlock.size.layout
        const [size, form] = layout.split('-')
        const style = styleConfig[size][form ?? 'table']
        const padding = parentBlock.id === 'rootContainer' ? 0 : style.padding
        const gap = this._calculateGap(parentBlock.children.length, style.gap, 2,)
        row = parentBlock.id === 'rootContainer' ? row : row + 1
        const gapColCorrection = col > 1 ? gap * (col - 1) : 0
        const gapRowCorrection = row > 1 ? gap * (row - 1) : 0
        if (!parentBlock.contentHeight) {
            parentBlock.contentHeight = parentBlock.contentEl ? parentBlock.contentEl.clientHeight : 0;
            parentBlock.contentEl = undefined
        }

        return {
            padding: (padding * 2),
            gapCol: gapColCorrection,
            gapRow: gapRowCorrection,
            content: parentBlock.contentHeight
        }
    }

    _calculateGap(numElements, gapMax, gapMin) {
        // Используем формулу с коэффициентом, определяющим кривую снижения.
        // Чем больше constant, тем медленнее снижается gap для больших блоков.
        const constant = 5;
        // Формула, гарантирующая, что при numElements = 0 будет gapMax, а при бесконечном числе элементов – gapMin.
        return Math.floor(gapMax - (gapMax - gapMin) * (numElements / (numElements + constant)));
    }

    static lcmArray(arr) {
        return arr.reduce((acc, val) => findLCM(acc, val), 1);
    }

    /**
     * Функция разбивает число total на count групп как можно равномернее.
     * Дополнительное условие: первые группы получают +1, если не делится поровну.
     * Пример: partitionNumber(3, 2) => [2, 1]; partitionNumber(7, 2) => [4, 3].
     */
    static partitionNumber(total, count) {
        const base = Math.floor(total / count);
        const remainder = total % count;
        const groups = [];
        for (let i = 0; i < count; i++) {
            groups.push(base + (i < remainder ? 1 : 0));
        }
        return groups;
    }

    /**
     * Функция computeGridLayoutGroups рассчитывает расположение блоков в гриде.
     * Входные параметры:
     *   - N: общее число блоков.
     *   - options:
     *       minArea: минимальная площадь блока (в ячейках), по умолчанию 1.
     *       desiredGroupCount: желаемое число групп (рядов для блоков).
     *       groupSizes: массив чисел, суммарно равный N (приоритет выше, чем desiredGroupCount).
     *
     * Вычисления:
     *   - Если groupSizes не заданы, то вычисляем их через partitionNumber(N, desiredGroupCount).
     *   - Вычисляем L = LCM(groupSizes).
     *   - Выбираем k = ceil(minArea / L).
     *   - gridColumns = k * L.
     *   - Для каждой группы i с n_i блоками:
     *         блок шириной = gridColumns / n_i,
     *         высотой = n_i (в грид-рядов),
     *         таким образом, площадь блока = n_i * (k*L/n_i) = k*L.
     *   - Контентная область сверху занимает contentRows = k рядов.
     *   - Блоки располагаются последовательно ниже контента.
     * Возвращается объект с:
     *   gridColumns, totalGridRows, contentRows, groupSizes, k и массивом rectangles.
     * Каждый rectangle имеет gridRowStart, gridRowEnd, gridColumnStart, gridColumnEnd и label.
     */
    static computeGridLayoutGroups(N, options = {}) {
        const minArea = options.minArea || 1;
        let groupSizes;
        if (options.groupSizes && options.groupSizes.length > 0) {
            groupSizes = options.groupSizes;
        } else if (options.desiredGroupCount) {
            groupSizes = this.partitionNumber(N, options.desiredGroupCount);
        } else {
            // По умолчанию два ряда: [ceil(N/2), floor(N/2)]
            groupSizes = [Math.ceil(N / 2), Math.floor(N / 2)];
        }

        // Вычисляем LCM для групп
        const L = this.lcmArray(groupSizes);
        // Выбираем коэффициент масштабирования k так, чтобы k*L >= minArea
        const k = Math.ceil(minArea / L);

        const gridColumns = L ? k * L : 1;
        const contentRows = 1; // контентная область занимает k рядов
        const groupCount = groupSizes.length;
        const rectangles = [];

        // Начинаем размещать группы ниже контента
        let currentRow = contentRows + 1;
        for (let i = 0; i < groupCount; i++) {
            const nBlocks = groupSizes[i]; // число блоков в группе i
            const groupHeight = nBlocks;   // выделяем nBlocks рядов для группы
            const blockWidth = gridColumns / nBlocks; // должно получаться целое число, т.к. L делится на nBlocks

            // Для каждого блока в группе
            for (let j = 0; j < nBlocks; j++) {
                rectangles.push({
                    gridRowStart: currentRow,
                    gridRowEnd: currentRow + groupHeight,
                    gridColumnStart: j * blockWidth + 1,
                    gridColumnEnd: (j + 1) * blockWidth + 1,
                });
            }
            currentRow += groupHeight; // переходим к следующей группе
        }

        const totalBlockRows = groupSizes.reduce((a, b) => a + b);
        const totalGridRows = contentRows + totalBlockRows;

        return {
            gridColumns,
            totalGridRows,
            contentRows,
            groupSizes,
            k,
            rectangles
        };
    }
}

const gridClassManager = new GridClassManager()

export default gridClassManager

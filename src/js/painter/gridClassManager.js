import {findLCM, findNearestRoots} from '../utils/functions'
import {getElementSizeClass, measurePerformance} from "../utils/utils"
import {styleConfig} from "./styles";


class GridClassManager {

    constructor() {
        this.layoutHandlers = {
            "xxs-sq": GridClassManager.l_sq,
            "xs-sq": GridClassManager.l_sq,
            "s-sq": GridClassManager.l_sq,
            "m-sq": GridClassManager.l_sq,
            "l-sq": GridClassManager.l_sq,
            "xl-sq": GridClassManager.l_sq,
            "xxl-sq": GridClassManager.l_sq,
            "xxxs-w": GridClassManager.xxxs_w,
            "xxs-w": GridClassManager.xxxs_w,
            "xs-w": GridClassManager.s_w,
            "s-w": GridClassManager.s_w,
            "m-w": GridClassManager.l_sq,
            "l-w": GridClassManager.l_sq,
            "xl-w": GridClassManager.l_sq,
            "xxl-w": GridClassManager.xxl_w,
            "xxxs-h": GridClassManager.xxxs_h,
            "xxs-h": GridClassManager.xxs_h,
            "xs-h": GridClassManager.xxl_h,
            "s-h": GridClassManager.xxl_h,
            "m-h": GridClassManager.xxl_h,
            "l-h": GridClassManager.xxl_h,
            "xl-h": GridClassManager.xxl_h,
            "xxl-h": GridClassManager.xxl_h,
            'table': GridClassManager.table,
        }
    }

    manager(block, parentBlock) {
        this.calcBlockSize(block, parentBlock)
        const layout = block.size.layout

        if (typeof this.layoutHandlers[layout] === 'function') {
            return this.layoutHandlers[layout](block);
        } else {
            throw new Error(`Layout method ${layout} not found`);
        }
    }

    calcBlockSize(block, parentBlock) {
        const {width: parentWidth, height: parentHeight, layout: parentLayout} = parentBlock.size;
        const [totalRows, totalCols] = this._calcParentGrid(parentBlock.grid);
        const [childRows, childCols] = this._calcChildGrid(parentBlock.childrenPositions[block.id]);
        const {padding, gapCol, gapRow, content} = this._styleCorrection(parentBlock);
        const calculatedSize = {
            width: Number((parentWidth - padding - gapCol) / totalCols * childCols),
            height: Number((parentHeight - content - padding - gapRow) / totalRows * childRows)
        }

        block.size = getElementSizeClass(null, calculatedSize); // todo если размеры кастомные нужно использовать дефолтный класс размера так как теряется адаптивность
        if (block.data?.customLayout && block.data.customLayout !== 'default') {
            block.size.layout = block.data.customLayout
        }
    }

    static xxs_sq() {

    }

    static xs_sq() {

    }

    static x_sq() {

    }

    static m_sq() {

    }

    static l_sq(block) {
        let row, col;
        if (block.children.length === 3) [row, col] = [2, 2]
        else [row, col] = GridClassManager._calculateBlocksLayout(block.children.length) // без учета контента

        return [
            GridClassManager._setBlockGrid(block, row, col),
            GridClassManager._setContentPosition(block, row, col),
            GridClassManager._setChildrenPosition(block, row, col),
        ]
    }

    static xxl_w(block) {
        let [row, col] = GridClassManager._calculateBlocksLayout(block.children.length) // без учета контента
        return [
            GridClassManager._setBlockGrid(block, row, col),
            GridClassManager._setContentPosition(block, row, col),
            GridClassManager._setChildrenPosition(block, row, col),
        ]
    }

    static xxxs_w(block) {
        const col = block.children.length
        const children_position = {row: 2, col: col}

        for (let i = 0; i < col; i++) {
            children_position[block.data.childOrder[i]] = [
                `grid-column_${i + 1}`,
                `grid_row_2`
            ]
        }
        return [
            GridClassManager._setBlockGrid(block, 1, col),
            GridClassManager._setContentPosition(block, 1, col),
            children_position
        ]
    }


    static s_w(block) {
        const totalChildren = block.children.length;
        const children_position = {row: 2, col: totalChildren};

        let rowCounter = 2;
        let colCounter = 1;

        // Если дочерних элементов больше 5, расставляем в 2 ряда
        if (totalChildren > 4) {
            const maxCols = Math.ceil(totalChildren / 2); // Количество колонок в каждом ряду
            for (let i = 0; i < totalChildren; i++) {
                // Если это последний элемент и общее количество нечетное
                if (i === totalChildren - 1 && totalChildren % 2 !== 0) {
                    // Последний элемент занимает две колонки
                    children_position[block.data.childOrder[i]] = [
                        `grid-column_${colCounter}__${colCounter + 2}`,  // Растягиваем на две колонки
                        `grid-row_${rowCounter}`   // Оставляем в текущем ряду
                    ];
                } else {
                    children_position[block.data.childOrder[i]] = [
                        `grid-column_${colCounter}`,  // Позиция по колонке
                        `grid-row_${rowCounter}`      // Позиция по ряду
                    ];
                }

                colCounter++; // Переходим к следующей колонке
                if (colCounter > maxCols) {
                    colCounter = 1;  // Сбрасываем колонку на 1
                    rowCounter++;    // Переходим на следующий ряд
                }
            }

            return [
                GridClassManager._setBlockGrid(block, 2, maxCols),  // Устанавливаем 2 ряда
                GridClassManager._setContentPosition(block, 2, maxCols), // Для содержимого
                children_position
            ];

        } else {
            // Если элементов 5 или меньше, расставляем в один ряд
            for (let i = 0; i < totalChildren; i++) {
                children_position[block.data.childOrder[i]] = [
                    `grid-column_${i + 1}`,  // Одна колонка для каждого
                    `grid_row_2`             // В одной строке
                ];
            }

            return [
                GridClassManager._setBlockGrid(block, 1, totalChildren),  // 1 ряд, n колонок
                GridClassManager._setContentPosition(block, 1, totalChildren), // Для содержимого
                children_position
            ];
        }
    }


    static m_w() {

    }

    static xxxs_h(block) {
        return GridClassManager.xxs_h(block)
    }

    static xxs_h(block) {
        const row = block.data.childOrder.length
        const children_position = {row: row + 1, col: 1}

        let rowCounter = 2
        for (let i = 0; i < row; i++) {
            children_position[block.data.childOrder[i]] = [
                `grid-column_1`,
                `grid-row_${rowCounter++}`
            ]
        }
        return [
            GridClassManager._setBlockGrid(block, row, 1),
            GridClassManager._setContentPosition(block, row, 1),
            children_position
        ]
    }

    static xs_h(block) {
        return GridClassManager.xxs_h(block)
    }

    static s_h(block) {
        return GridClassManager.xxs_h(block)
    }

    static m_h(block) {
        return GridClassManager.xxs_h(block)
    }

    static l_h(block) {
        return GridClassManager.xxs_h(block)
    }

    static xl_h(block) {
        return GridClassManager.xxs_h(block)
    }

    static xxl_h(block) {
        const totalChildren = block.data.childOrder.length;
        const children_position = {row: totalChildren + 1, col: 1};

        let rowCounter = 2;
        let colCounter = 1;

        // Если дочерних элементов больше 5, расставляем в 2 колонки
        if (totalChildren > 4) {
            const row = Math.ceil(totalChildren / 2); // Количество строк для 2 колонок
            children_position.row = row + 1;

            for (let i = 0; i < totalChildren; i++) {
                // Проверяем, не последний ли это блок и нечетное ли общее количество
                if (i === totalChildren - 1 && totalChildren % 2 !== 0) {
                    // Последний блок при нечетном количестве занимает две колонки
                    children_position[block.data.childOrder[i]] = [
                        `grid-column_1__3`,  // Растягиваем на две колонки
                        `grid-row_${rowCounter}`   // Строка для последнего элемента
                    ];
                } else {
                    children_position[block.data.childOrder[i]] = [
                        `grid-column_${colCounter}`,  // Колонка 1 или 2
                        `grid-row_${rowCounter}`     // Строка
                    ];

                    // Чередуем колонки (1 -> 2), сбрасываем на 1 после второй колонки
                    colCounter++;
                    if (colCounter > 2) {
                        colCounter = 1;
                        rowCounter++; // Переход на новую строку после каждой второй колонки
                    }
                }
            }

            return [
                GridClassManager._setBlockGrid(block, row, 2),  // Устанавливаем 2 колонки
                GridClassManager._setContentPosition(block, row, 2), // Для содержимого
                children_position
            ];
        } else {
            // Расставляем в одну колонку, если дочерних элементов 5 или меньше
            for (let i = 0; i < totalChildren; i++) {
                children_position[block.data.childOrder[i]] = [
                    `grid-column_1`,             // Одна колонка
                    `grid-row_${rowCounter++}`   // Каждому элементу своя строка
                ];
            }

            return [
                GridClassManager._setBlockGrid(block, totalChildren, 1),  // 1 колонка
                GridClassManager._setContentPosition(block, totalChildren, 1), // Для содержимого
                children_position
            ];
        }
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

    static _setContentPosition(block, row, col) {
        return [
            `grid-column_1_sl_${col + 1}`,
            `grid-row_auto`
        ]
    }

    static _setBlockGrid(block, row, col) {
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
    static _setChildrenPosition(block, row, col) {
        // Общее количество дочерних элементов
        const totalChildren = block.children.length;
        // Максимальное количество блоков в одной строке
        const maxBlocksInRow = Math.ceil(totalChildren / row);
        // Минимальное количество блоков в последней строке
        const minBlocksInRow = totalChildren - (maxBlocksInRow * (row - 1));
        const children_position = {row: row + 1, col}

        let childIndex = 0;
        let currentRow = 2; // Начинаем со второй строки, так как первая занята текстовым контентом
        row++;
        for (let i = 0; i < totalChildren; i++) {
            const id = block.data.childOrder[i]
            if (childIndex !== 0 && childIndex % maxBlocksInRow === 0) {
                currentRow++; // Переход на новую строку
                childIndex = 0; // Сброс счетчика блоков в текущей строке
            }

            let columnsPerChild;
            if (currentRow < row) {
                // Определение количества колонок на блок в обычных строках
                columnsPerChild = Math.floor(col / maxBlocksInRow);
            } else {
                // Определение количества колонок на блок в последней строке
                columnsPerChild = Math.floor(col / minBlocksInRow);
            }

            // Начальная и конечная колонки для текущего дочернего элемента
            let startCol = childIndex * columnsPerChild + 1;
            let endCol = startCol + columnsPerChild;

            children_position[id] = [
                `grid-column_${startCol}__${endCol}`,
                `grid-row_${currentRow}`
            ]
            childIndex++; // Инкремент индекса в текущей строке
        }
        return children_position;
    }

    /**
     * Вычисляет количество столбцов и колонок
     * @param {number} number - Количество дочерних блоков
     * @returns {Array} Массив, содержащий размеры для ряда и столбца.
     */
    static _calculateBlocksLayout(number) {
        let [row, col] = findNearestRoots(number);
        if (row * col === number) {
            return [row, col];
        }

        const blocksInRow = number / row;
        const maxBlocksInRow = Math.ceil(blocksInRow);
        const minBlocksInRow = number - ((row - 1) * maxBlocksInRow);

        const lcm = findLCM(minBlocksInRow, maxBlocksInRow); // Находим НОК для minBlocksInRow и maxBlocksInRow

        col = Math.max(col, lcm); // Начинаем с максимального из col или lcm

        // Используем НОК для определения подходящего col
        while (col % minBlocksInRow !== 0 || col % maxBlocksInRow !== 0) {
            col += lcm; // Увеличиваем col на НОК, гарантируя, что новое значение будет кратно обоим числам
        }
        return [row, col];
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
        rowCols.forEach(item => {
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

    _styleCorrection(parentBlock) {
        const layout = parentBlock.size.layout
        const [size, form] = layout.split('-')
        const style = styleConfig[size][form ?? 'table']
        const padding = style.padding
        const gap = style.gap
        const orientation = style.writingMode
        const gapColCorrection = parentBlock.childrenPositions.col > 1 ? gap * (parentBlock.childrenPositions.col - 1) : 0
        const gapRowCorrection = parentBlock.childrenPositions.row > 1 ? gap * (parentBlock.childrenPositions.row - 1) : 0
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
}

const gridClassManager = new GridClassManager()

export default gridClassManager

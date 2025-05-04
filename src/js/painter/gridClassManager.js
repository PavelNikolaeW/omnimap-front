import {getElementSizeClass, measurePerformance} from "../utils/utils"
import {styleConfig} from "./styles";
import {GridLayoutCalculator} from "./gridLayoutCalculator";


class GridClassManager {

    constructor() {
    }

    manager(block, parentBlock) {
        this.calcBlockSize(block, parentBlock)
        const layout = block.size.layout
        const len = block.children.length

        if (block.data.layout === 'table') {
            return GridClassManager.table(block)
        }
        const layoutOptions = this.calc_optionsLayout(layout, len, block.data?.groupSizes)
        const rez = GridLayoutCalculator.computeGridLayoutGroups(len, layoutOptions)
        return GridClassManager.returnClasses(block, rez.totalGridRows, rez.gridColumns, rez.rectangles, rez.groupSizes)
    }

    calcBlockSize(block, parentBlock) {
        const blockPosition = parentBlock?.data?.childOrder.findIndex(el => el === block.id)
        const {width: parentWidth, height: parentHeight, layout: parentLayout} = parentBlock.size;
        const [totalRows, totalCols] = this._calcParentGrid(parentBlock.grid);
        const [childRows, childCols] = this._calcChildGrid(parentBlock.childrenPositions[block.id]);
        let {
            padding,
            gapCol,
            gapRow,
            content
        } = this._styleCorrection(block, parentBlock, totalRows, totalCols, blockPosition);
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
            groupSizes: groupSizes,
            relativeRows: true
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

    static returnClasses(block, totalGridRows, gridColumns, rectangles, groupSizes) {
        block.groupSizes = groupSizes
        return [
            GridClassManager._setBlockGrid(totalGridRows, gridColumns),
            GridClassManager._setContentPosition(totalGridRows, gridColumns),
            GridClassManager._setChildrenPosition(block, totalGridRows, gridColumns, rectangles),
        ]
    }

    static table(block) {
        const gridSize = Math.ceil(Math.sqrt(block.children.length))
        let [row, col] = [gridSize + 1, gridSize]
        if (block.data.table) {
            [row, col] = [block.data.table.row, block.data.table.col]
        }
        const childrenPosition = {}

        let childIndex = 0;
        let currentRow = 2; // Инициализация счетчика строк, начиная со второй строки

        // Переменная для определения количества колонок, занимаемых каждым дочерним элементом
        const columnsPerChild = 1;

        // Итерация по каждой позиции дочернего элемента в объекте
        for (let i = 0; i < block.children.length; i++) {
            const id = block.data.childOrder[i]
            // Проверка, нужно ли переходить на новую строку
            if (childIndex !== 0 && childIndex % col === 0) {
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
            GridClassManager._setBlockGrid(row, col),
            GridClassManager._setContentPosition(row, col),
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
     * @param rectangles
     */
    static _setChildrenPosition(block, row, col, rectangles = []) {
        const children_position = {}
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

    _styleCorrection(block, parentBlock, row, col, blockPosition) {
        const layout = parentBlock.size.layout
        const [size, form] = layout.split('-')
        const style = styleConfig[size][form ?? 'table']
        const padding = parentBlock.id === 'rootContainer' ? 0 : style.padding
        let gap = (!block.data?.customGrid?.grid) ? this._calculateGap(parentBlock.children.length, style.gap, 2,) : 0
        if (parentBlock.data?.groupSizes) {
            let acc = 0
            for (let i = 0; i < parentBlock.data.groupSizes.length; i++) {
                const group = parentBlock.data.groupSizes[i]
                const blocksInGroup = parseInt(group)
                acc = acc + blocksInGroup
                if (blockPosition < acc) {
                    col = blocksInGroup
                    break
                }
            }
            row = parentBlock.data.groupSizes.length - 1
        }
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
}


const gridClassManager = new GridClassManager()

export default gridClassManager

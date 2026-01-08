import {getElementSizeClass, measurePerformance} from "../utils/utils"
import {styleConfig} from "./styles";
import {GridLayoutCalculator} from "./gridLayoutCalculator";
import {
    LAYOUT_TYPES,
    parseLayoutType,
    DEFAULT_GRID_CONFIG,
    DEFAULT_MASONRY_CONFIG
} from "./layoutTypes";
import { layoutTemplateService } from "../services/layoutTemplateService";
import { calculateGap } from "./config/gapConfig";


class GridClassManager {

    constructor() {
    }

    manager(block, parentBlock) {
        this.calcBlockSize(block, parentBlock)
        const sizeLayout = block.size.layout
        const len = block.children.length
        const blockLayout = block.data?.layout || 'default'

        // Парсим тип layout и конфигурацию
        const { type, config } = parseLayoutType(blockLayout)

        switch (type) {
            case LAYOUT_TYPES.TABLE:
                return GridClassManager.table(block)

            case LAYOUT_TYPES.ROWS:
                return GridClassManager.layoutVertical(block)

            case LAYOUT_TYPES.COLUMNS:
                return GridClassManager.layoutHorizontal(block)

            case LAYOUT_TYPES.GRID:
                return this.layoutGrid(block, config)

            case LAYOUT_TYPES.MASONRY:
                return this.layoutMasonry(block, config)

            case LAYOUT_TYPES.TEMPLATE:
                return this.layoutFromTemplate(block, config, parentBlock)

            case LAYOUT_TYPES.DEFAULT:
            default:
                // Авто-расчёт (существующая логика)
                const layoutOptions = this.calc_optionsLayout(sizeLayout, len, block.data?.groupSizes)
                const rez = GridLayoutCalculator.computeGridLayoutGroups(len, layoutOptions)
                return GridClassManager.returnClasses(block, rez.totalGridRows, rez.gridColumns, rez.rectangles, rez.groupSizes)
        }
    }

    static layoutVertical(block) {
        const lenChildren = block.children.length
        const childrenPosition = {}
        let startRow = 2
        for (let i = 0; i < lenChildren; i++) {
            let childId = block.data.childOrder[i]
            childrenPosition[childId] = [
                `grid-column_0__1`,
                `grid-row_${startRow + i}`
            ]
        }
        return [
            GridClassManager._setBlockGrid(lenChildren + 1, 1),
            GridClassManager._setContentPosition(lenChildren + 1, 1),
            childrenPosition,
        ]
    }

    static layoutHorizontal(block) {
        const lenChildren = block.children.length
        const childrenPosition = {}
        let startCol = 0
        let endCol = 1
        for (let i = 0; i < lenChildren; i++) {
            let childId = block.data.childOrder[i]
            childrenPosition[childId] = [
                `grid-column_${startCol + i}__${endCol + i}`,
                `grid-row_2`
            ]
        }
        return [
            GridClassManager._setBlockGrid(2, lenChildren),
            GridClassManager._setContentPosition(2, lenChildren),
            childrenPosition,
        ]
    }

    /**
     * Раскладка grid-NxM - фиксированная сетка с заданным числом строк и колонок
     * @param {Object} block - блок
     * @param {Object} config - конфигурация {rows, columns}
     */
    layoutGrid(block, config) {
        const gridConfig = config || block.data?.gridConfig || DEFAULT_GRID_CONFIG
        const { rows, columns } = gridConfig
        const lenChildren = block.children.length
        const childrenPosition = {}

        // Рассчитываем реальное число строк (может быть больше чем задано, если детей много)
        const actualRows = Math.max(rows, Math.ceil(lenChildren / columns))

        let childIndex = 0
        for (let r = 0; r < actualRows && childIndex < lenChildren; r++) {
            for (let c = 0; c < columns && childIndex < lenChildren; c++) {
                const childId = block.data.childOrder[childIndex]
                childrenPosition[childId] = [
                    `grid-column_${c + 1}__${c + 2}`,
                    `grid-row_${r + 2}`
                ]
                childIndex++
            }
        }

        const totalRows = actualRows + 1 // +1 для контента

        return [
            GridClassManager._setBlockGrid(totalRows, columns),
            GridClassManager._setContentPosition(totalRows, columns),
            childrenPosition
        ]
    }

    /**
     * Раскладка masonry - умное заполнение пустот (как Pinterest)
     * Дети распределяются по колонкам, заполняя самую короткую
     * @param {Object} block - блок
     * @param {Object} config - конфигурация {minChildWidth, maxColumns}
     */
    layoutMasonry(block, config) {
        const masonryConfig = config || block.data?.masonryConfig || DEFAULT_MASONRY_CONFIG
        const { minChildWidth, maxColumns } = masonryConfig
        const lenChildren = block.children.length
        const childrenPosition = {}

        // Рассчитываем оптимальное число колонок на основе ширины блока
        const blockWidth = block.size?.width || 400
        const calculatedColumns = Math.max(1, Math.floor(blockWidth / minChildWidth))
        const columns = Math.min(maxColumns, calculatedColumns, lenChildren)

        // Отслеживаем высоту каждой колонки для masonry эффекта
        const columnHeights = new Array(columns).fill(0)

        for (let i = 0; i < lenChildren; i++) {
            const childId = block.data.childOrder[i]

            // Находим самую короткую колонку
            const minHeight = Math.min(...columnHeights)
            const minCol = columnHeights.indexOf(minHeight)

            // Размещаем ребёнка в самой короткой колонке
            const startRow = columnHeights[minCol] + 2 // +2 для контента

            childrenPosition[childId] = [
                `grid-column_${minCol + 1}__${minCol + 2}`,
                `grid-row_${startRow}`
            ]

            // Увеличиваем высоту колонки
            columnHeights[minCol]++
        }

        const totalRows = Math.max(...columnHeights) + 1 // +1 для контента

        return [
            GridClassManager._setBlockGrid(totalRows, columns),
            GridClassManager._setContentPosition(totalRows, columns),
            childrenPosition
        ]
    }

    /**
     * Раскладка из шаблона
     * @param {Object} block - блок
     * @param {Object} config - конфигурация {templateId}
     * @param {Object} parentBlock - родительский блок
     */
    layoutFromTemplate(block, config, parentBlock) {
        const templateId = config?.templateId;

        if (!templateId) {
            // Fallback на default если templateId не указан
            return this.layoutDefault(block);
        }

        const blockSize = {
            width: block.size?.width || 400,
            height: block.size?.height || 300
        };

        const result = layoutTemplateService.applyTemplate(templateId, block, blockSize);

        if (!result) {
            // Если шаблон не найден или не применился, fallback на default
            return this.layoutDefault(block);
        }

        return [
            result.grid,
            result.contentPosition,
            result.childrenPositions
        ];
    }

    /**
     * Fallback метод для default layout
     * @param {Object} block - блок
     */
    layoutDefault(block) {
        const sizeLayout = block.size.layout;
        const len = block.children.length;
        const layoutOptions = this.calc_optionsLayout(sizeLayout, len, block.data?.groupSizes);
        const rez = GridLayoutCalculator.computeGridLayoutGroups(len, layoutOptions);
        return GridClassManager.returnClasses(block, rez.totalGridRows, rez.gridColumns, rez.rectangles, rez.groupSizes);
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
        let gap = (!block.data?.customGrid?.grid) ? calculateGap(parentBlock.children.length, style.gap) : 0
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
}


const gridClassManager = new GridClassManager()

export default gridClassManager

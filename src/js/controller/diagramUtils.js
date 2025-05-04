import localforage from "localforage";
import {dispatch} from "../utils/utils";

export class DiagramUtils {
    constructor() {
        this.inputs = document.getElementById('diagram-inputs')
        this.row = this.inputs.querySelector('#diagramRow')
        this.col = this.inputs.querySelector('#diagramCol')
        this.connections = this.inputs.querySelector('#CerateConnections')
        this.addButton = this.inputs.querySelector('#addDiagram')
        this.sizeSelector = this.inputs.querySelector('#sizeSelector')
        this.resetBtn = this.inputs.querySelector('#reset')
        this.block = undefined
        this.bindEvents()
    }

    bindEvents() {
        this.row.addEventListener('input', () => this.inputHandler())
        this.col.addEventListener('input', () => this.inputHandler())
        this.addButton.addEventListener('click', (e) => this.addBtnHandler(e))
        this.sizeSelector.addEventListener('change', (e) => this.selectSizeHandler(e))
        this.resetBtn.addEventListener('click', () => this.resetHandler())
    }

    async resetHandler() {
        let block = await this.getBlock(this.blockId)
        block.data.customGrid = {}
        dispatch("UpdateDataBlock", {blockId: this.blockId, data: block.data})
    }

    async inputHandler() {
        const block = await this.getBlock(this.blockId)
        block.data.customGrid.grid = [
            `grid-template-columns_${'1fr__'.repeat(parseInt(this.col.value))}`,
            `grid-template-rows_auto__${'1fr__'.repeat(parseInt(this.row.value) - 1)}`
        ]
        dispatch('UpdateCustomGridBlock', {
            blockId: this.blockId,
            customGrid: block.data.customGrid
        })
    }

    addBtnHandler(e) {
        dispatch('CreateBlock', {parentId: this.blockId, title: ''})
    }

    async selectSizeHandler() {
        const selectedSize = this.sizeSelector.value
        const block = await this.getBlock(this.blockId)
        if (selectedSize === '-') return
        if (selectedSize === 'default') {
            dispatch('UpdateDataBlock', {
                blockId: this.blockId,
                data: {customGrid: {}}
            })
            this.showRowCol([])
            return
        }
        const {
            connections,
            customGrid
        } = this.generateGrid(block.data.childOrder, selectedSize, this.connections.checked)
        dispatch('UpdateDataBlock', {
            blockId: this.blockId,
            data: {customGrid, connections}
        })
        this.showRowCol(customGrid.grid)
    }

    async getBlock(id) {
        const user = await localforage.getItem('currentUser')
        return await localforage.getItem(`Block_${id}_${user}`)
    }

    showRowCol(grid) {
        const gridData = this.parseGridClasses(grid)
        if (gridData?.rows) {
            this.row.parentNode.classList.remove('hidden')
            this.col.parentNode.classList.remove('hidden')
            this.row.value = gridData.rows || ''
            this.col.value = gridData.cols || ''
            this.row.focus()
        } else {
            this.row.parentNode.classList.add('hidden')
            this.col.parentNode.classList.add('hidden')
        }
    }

    async showInputs(blockId, element) {
        this.blockId = blockId
        this.element = element

        this.inputs.classList.remove('hidden')
        const block = await this.getBlock(blockId)
        this.sizeSelector.focus()
        if (block.data.customGrid?.grid) {
            this.showRowCol(block.data.customGrid?.grid)
        }

    }

    hiddenInputs() {
        this.inputs.classList.add('hidden')
        this.row.parentNode.classList.add('hidden')
        this.col.parentNode.classList.add('hidden')
    }

    parseGridClasses(classList) {
        const classArray = Array.from(classList)
        const colsClass = classArray.find(cls => cls.startsWith('grid-template-columns_'))
        const rowsClass = classArray.find(cls => cls.startsWith('grid-template-rows_'))
        const cols = colsClass ? (colsClass.split('__')?.length - 1 || 0) : 0
        const rows = rowsClass ? (rowsClass.split('__')?.length - 1 || 0) : 0

        return {cols, rows}
    }

    moveBlock(blockId, direction, customGrid, parentId) {
        customGrid.childrenPositions[blockId] = this._moveBlock(blockId, direction, customGrid)
        dispatch('UpdateCustomGridBlock', {
            blockId: parentId,
            customGrid: customGrid
        })
    }

    // Возвращает новые координаты блока после попытки перемещения
    _moveBlock(blockId, direction, customGrid) {
        const columns = customGrid.grid[0].split('__').length - 1;
        const rows = customGrid.grid[1].split('__').length - 1;

        const parseRange = (str) => str.match(/_(\d+)__?(\d+)?/).slice(1, 3).map(Number);

        const [colStart, colEnd] = parseRange(customGrid.childrenPositions[blockId][0]);
        const [rowStart, rowEnd] = parseRange(customGrid.childrenPositions[blockId][1]);

        let newColStart = colStart;
        let newColEnd = colEnd;
        let newRowStart = rowStart;
        let newRowEnd = rowEnd;

        switch (direction) {
            case 'left':
                if (colStart > 1) {
                    newColStart--;
                    newColEnd--;
                }
                break;
            case 'right':
                if (colEnd <= columns) {
                    if (newColEnd + 1 <= columns + 1) {
                        newColStart++;
                        newColEnd++;
                    }
                }
                break;
            case 'up':
                if (rowStart > 2) {
                    newRowStart--;
                    newRowEnd--;
                }
                break;
            case 'down':
                if (rowEnd <= rows) {
                    if (newRowEnd + 1 <= rows + 1) {
                        newRowStart++;
                        newRowEnd++;
                    }
                }
                break;
        }

        return [
            `grid-column_${newColStart}__${newColEnd}`,
            `grid-row_${newRowStart}__${newRowEnd}`
        ];
    }

    stretchBlock(blockId, direction, customGrid, parentId, stretchMode) {
        customGrid.childrenPositions[blockId] = this._stretchBlock(blockId, direction, customGrid, stretchMode)
        dispatch('UpdateCustomGridBlock', {
            blockId: parentId,
            customGrid: customGrid
        })
    }

    _stretchBlock(blockId, direction, customGrid, stretchMode = true) {
        const columns = customGrid.grid[0].split('__').length - 1;
        const rows = customGrid.grid[1].split('__').length - 1;

        const parseRange = (str) =>
            str.match(/_(\d+)__?(\d+)?/).slice(1, 3).map(Number);

        const [colStart, colEnd] = parseRange(customGrid.childrenPositions[blockId][0]);
        const [rowStart, rowEnd] = parseRange(customGrid.childrenPositions[blockId][1]);

        let newColStart = colStart;
        let newColEnd = colEnd;
        let newRowStart = rowStart;
        let newRowEnd = rowEnd;

        switch (direction) {
            case 'left':
                if (stretchMode) {
                    if (newColStart > 2) newColStart--; // не позволяем дойти до первой линии
                } else {
                    if (newColEnd - newColStart > 1) newColStart++;
                }
                break;
            case 'right':
                if (stretchMode) {
                    if (newColEnd <= columns) newColEnd++;
                } else {
                    if (newColEnd - newColStart > 1) newColEnd--;
                }
                break;
            case 'up':
                if (stretchMode) {
                    if (newRowStart > 2) newRowStart--; // не позволяем дойти до первой линии
                } else {
                    if (newRowEnd - newRowStart > 1) newRowStart++;
                }
                break;
            case 'down':
                if (stretchMode) {
                    if (newRowEnd <= rows) newRowEnd++;
                } else {
                    if (newRowEnd - newRowStart > 1) newRowEnd--;
                }
                break;
        }

        return [
            `grid-column_${newColStart}__${newColEnd}`,
            `grid-row_${newRowStart}__${newRowEnd}`
        ];
    }

    generateGrid(childOrder, size = 'm', createConnections = false) {
        const sizeMap = {
            xs: {blockWidth: 3, blockHeight: 3},
            s: {blockWidth: 4, blockHeight: 4},
            m: {blockWidth: 5, blockHeight: 5},
            l: {blockWidth: 6, blockHeight: 6}
        };

        const densityFactorMap = {
            xs: 1,
            s: 1.5,
            m: 2,
            l: 2.5
        };

        const {blockWidth: BLOCK_WIDTH, blockHeight: BLOCK_HEIGHT} = sizeMap[size] || sizeMap['m'];
        const densityFactor = densityFactorMap[size] || 1.0;
        const ASPECT_RATIO = 16 / 10; // ширина / высота

        const totalBlocks = childOrder.length;

        // Рассчитываем количество строк и колонок с учетом аспектного соотношения
        const approxGridHeight = Math.sqrt(totalBlocks / ASPECT_RATIO);
        const numRows = Math.ceil(approxGridHeight);
        const blocksPerRow = Math.ceil(totalBlocks / numRows);

        const GRID_COLUMNS = Math.ceil(blocksPerRow * (BLOCK_WIDTH + 1) * densityFactor);
        const GRID_ROWS = Math.ceil(numRows * (BLOCK_HEIGHT + 1) * densityFactor);

        const grid = [
            "grid-template-columns_" + "1fr__".repeat(GRID_COLUMNS),
            "grid-template-rows_auto__" + "1fr__".repeat(GRID_ROWS)
        ];

        const contentPosition = [`grid-column_1_sl_${GRID_COLUMNS + 1}`];

        const childrenPositions = {};

        let rowIndex = 0;
        let colIndex = 0;

        childOrder.forEach((uuid) => {
            if ((colIndex + 1) * (BLOCK_WIDTH + 1) > GRID_COLUMNS) {
                rowIndex++;
                colIndex = 0;
            }

            const columnStart = colIndex * (BLOCK_WIDTH + 1) + 1;
            const columnEnd = columnStart + BLOCK_WIDTH - 1;

            const rowStart = 1 + rowIndex * (BLOCK_HEIGHT + 1) + 1;
            const rowEnd = rowStart + BLOCK_HEIGHT - 1;

            childrenPositions[uuid] = [
                `grid-column_${columnStart}__${columnEnd}`,
                `grid-row_${rowStart}__${rowEnd}`
            ];

            colIndex++;
        });

        const connections = createConnections
            ? childOrder.slice(0, -1).map((uuid, i) => ({
                sourceId: uuid,
                targetId: childOrder[i + 1],
                connector: {
                    type: "Flowchart",
                    options: {
                        stub: 50,
                        alwaysRespectStubs: true,
                        cornerRadius: 5
                    }
                },
                label: ""
            }))
            : [];

        return {
            customGrid: {
                grid,
                contentPosition,
                childrenPositions
            },
            connections
        };
    }
}

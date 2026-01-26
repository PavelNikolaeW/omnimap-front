import localforage from "localforage";
import {dispatch} from "../utils/utils";
import {parseGridSize} from "../utils/gridUtils";
import {diagramEditor} from "./diagramEditor";
import {blockStyleManager, connectionStyleManager} from "./blockStyleManager";
import {contextManager} from "./comands/contextManager";

export class DiagramUtils {
    constructor() {
        // Старые элементы (для обратной совместимости)
        this.inputs = document.getElementById('diagram-inputs')
        this.connections = this.inputs?.querySelector('#CerateConnections')
        this.sizeSelector = this.inputs?.querySelector('#sizeSelector')
        this.resetBtn = this.inputs?.querySelector('#reset')
        this.openStylePanelBtn = document.getElementById('openStylePanel')
        this.openConnectionPanelBtn = document.getElementById('openConnectionPanel')

        this.block = undefined
        this.diagramEditor = diagramEditor
        this.blockStyleManager = blockStyleManager
        this.connectionStyleManager = connectionStyleManager
        this.bindEvents()
        this.createGridControls()
    }

    /**
     * Начать режим создания соединения определённого типа
     */
    startConnectionMode(type) {
        const ctx = contextManager.getContext()
        const activeElement = ctx.blockElement || ctx.blockLinkElement

        if (!activeElement) {
            console.warn('Выберите блок-источник перед созданием соединения')
            return
        }

        // Сохраняем тип соединения и запускаем режим
        this.connectionType = type
        this.connectionStyleManager.connectionType = type
        this.connectionStyleManager.startConnectionMode()
    }

    bindEvents() {
        // Примечание: обработчик для добавления блока теперь в командной системе (diagramAddBlock)
        // Старый #addDiagram больше не используется
        this.sizeSelector?.addEventListener('change', (e) => this.selectSizeHandler(e))
        this.resetBtn?.addEventListener('click', () => this.resetHandler())

        // Кнопки панелей стилей и соединений
        this.openStylePanelBtn?.addEventListener('click', () => {
            // Получить выбранный блок из contextManager
            const selectedBlockId = this.getSelectedChildBlockId()
            if (selectedBlockId) {
                const selectedElement = document.getElementById(selectedBlockId)
                this.blockStyleManager.toggle(selectedBlockId, selectedElement)
            } else {
                // Если нет выбранного блока, показать уведомление
                console.warn('Выберите блок для применения стилей')
            }
            this.connectionStyleManager.hide()
        })
        this.openConnectionPanelBtn?.addEventListener('click', () => {
            this.connectionStyleManager.toggle()
            this.blockStyleManager.hide()
        })
    }

    /**
     * Создать дополнительные элементы управления сеткой
     */
    createGridControls() {
        // Кнопки +/- для строк
        const rowControl = document.createElement('div')
        rowControl.className = 'grid-size-control'
        rowControl.innerHTML = `
            <button class="diagram-btn grid-size-btn" id="rowMinus">-</button>
            <span id="rowDisplay">R: 0</span>
            <button class="diagram-btn grid-size-btn" id="rowPlus">+</button>
        `

        // Кнопки +/- для колонок
        const colControl = document.createElement('div')
        colControl.className = 'grid-size-control'
        colControl.innerHTML = `
            <button class="diagram-btn grid-size-btn" id="colMinus">-</button>
            <span id="colDisplay">C: 0</span>
            <button class="diagram-btn grid-size-btn" id="colPlus">+</button>
        `

        // Разделитель
        const separator = document.createElement('div')
        separator.className = 'diagram-separator'

        // Вставить после sizeSelector
        const sizeLabel = this.sizeSelector.previousElementSibling
        sizeLabel.after(separator)
        separator.after(rowControl)
        rowControl.after(colControl)

        // Привязать обработчики
        this.rowDisplay = document.getElementById('rowDisplay')
        this.colDisplay = document.getElementById('colDisplay')

        document.getElementById('rowPlus').addEventListener('click', () => this.adjustGridSize('row', 1))
        document.getElementById('rowMinus').addEventListener('click', () => this.adjustGridSize('row', -1))
        document.getElementById('colPlus').addEventListener('click', () => this.adjustGridSize('col', 1))
        document.getElementById('colMinus').addEventListener('click', () => this.adjustGridSize('col', -1))
    }

    /**
     * Установить размер сетки по пресету (xs, s, m, l)
     * Вызывается из команд подменю диаграммы
     */
    async setGridSize(size) {
        if (!size || size === '-') return

        if (size === 'default') {
            dispatch('UpdateDataBlock', {
                blockId: this.blockId,
                data: {customGrid: {}}
            })
            this.diagramEditor.deactivate()
            return
        }

        const block = await this.getBlock(this.blockId)
        if (!block?.data?.childOrder) return

        const createConnections = this.connections?.checked || false
        const { connections, customGrid } = this.generateGrid(block.data.childOrder, size, createConnections)

        dispatch('UpdateDataBlock', {
            blockId: this.blockId,
            data: {customGrid, connections}
        })

        await this.activateDiagramWithGrid(customGrid)
    }

    /**
     * Активировать редактор диаграммы с переданным customGrid
     * Вспомогательный метод для избежания дублирования кода
     */
    async activateDiagramWithGrid(customGrid) {
        const gridData = this.parseGridClasses(customGrid.grid)
        this.updateGridDisplay(gridData.rows, gridData.cols)

        try {
            if (this.diagramEditor.isActive) {
                this.diagramEditor.customGrid = customGrid
                this.diagramEditor.removeGridOverlay()
                this.diagramEditor.createGridOverlay()
            } else {
                await this.diagramEditor.activate(this.blockId, this.element, customGrid)
            }
        } catch (error) {
            console.error('Failed to activate diagram editor:', error)
        }
    }

    /**
     * Изменить размер сетки на delta
     */
    async adjustGridSize(dimension, delta) {
        if (!this.blockId) {
            console.warn('DiagramUtils: blockId не установлен')
            return
        }

        const block = await this.getBlock(this.blockId)
        if (!block?.data) return

        // Инициализируем customGrid если его нет
        if (!block.data.customGrid || !block.data.customGrid.grid) {
            // Создаём минимальную сетку 3x3
            block.data.customGrid = {
                grid: [
                    'grid-template-columns_1fr__1fr__1fr__',
                    'grid-template-rows_auto__1fr__1fr__1fr__'
                ],
                contentPosition: ['grid-column_1_sl_4'],
                childrenPositions: {}
            }
        }

        const gridData = this.parseGridClasses(block.data.customGrid.grid)
        let newRows = gridData.rows || 3
        let newCols = gridData.cols || 3

        if (dimension === 'row') {
            newRows = Math.max(1, newRows + delta)
        } else {
            newCols = Math.max(1, newCols + delta)
        }

        block.data.customGrid.grid = [
            `grid-template-columns_${'1fr__'.repeat(newCols)}`,
            `grid-template-rows_auto__${'1fr__'.repeat(newRows)}`
        ]
        block.data.customGrid.contentPosition = [`grid-column_1_sl_${newCols + 1}`]

        dispatch('UpdateCustomGridBlock', {
            blockId: this.blockId,
            customGrid: block.data.customGrid
        })

        this.updateGridDisplay(newRows, newCols)

        // Обновить редактор если активен
        if (this.diagramEditor.isActive) {
            this.diagramEditor.customGrid = block.data.customGrid
            this.diagramEditor.removeGridOverlay()
            this.diagramEditor.createGridOverlay()
        } else {
            // Активируем редактор если он не был активен
            await this.diagramEditor.activate(this.blockId, this.element)
        }
    }

    /**
     * Обновить отображение размеров сетки
     */
    updateGridDisplay(rows, cols) {
        if (this.rowDisplay) this.rowDisplay.textContent = `R: ${rows}`
        if (this.colDisplay) this.colDisplay.textContent = `C: ${cols}`
    }

    /**
     * Получить ID выбранного дочернего блока внутри диаграммы
     * Возвращает ID активного блока, если он является дочерним текущего блока диаграммы
     */
    getSelectedChildBlockId() {
        const ctx = contextManager.getContext()
        const activeBlockId = ctx.blockId

        // Проверить, что активный блок является дочерним блоком диаграммы
        if (activeBlockId && this.element) {
            const activeElement = document.getElementById(activeBlockId)
            if (activeElement && this.element.contains(activeElement)) {
                return activeBlockId
            }
        }

        // Проверить мульти-выделение
        const selectedBlocks = ctx.selectedBlocks
        if (selectedBlocks && selectedBlocks.length > 0) {
            // Взять первый выбранный блок, который является дочерним диаграммы
            for (const blockId of selectedBlocks) {
                const el = document.getElementById(blockId)
                if (el && this.element?.contains(el)) {
                    return blockId
                }
            }
        }

        return null
    }

    async resetHandler() {
        let block = await this.getBlock(this.blockId)
        block.data.customGrid = {}
        dispatch("UpdateDataBlock", {blockId: this.blockId, data: block.data})
    }

    addBtnHandler(e) {
        console.trace('🔨 addBtnHandler called')
        dispatch('CreateBlock', {parentId: this.blockId, title: ''})
    }

    async selectSizeHandler() {
        const selectedSize = this.sizeSelector?.value || this.sidebarSizeSelector?.value
        const block = await this.getBlock(this.blockId)
        if (!selectedSize || selectedSize === '-') return
        if (selectedSize === 'default') {
            dispatch('UpdateDataBlock', {
                blockId: this.blockId,
                data: {customGrid: {}}
            })
            this.diagramEditor.deactivate()
            return
        }
        const createConnections = this.connections?.checked || false
        const {
            connections,
            customGrid
        } = this.generateGrid(block.data.childOrder, selectedSize, createConnections)
        dispatch('UpdateDataBlock', {
            blockId: this.blockId,
            data: {customGrid, connections}
        })

        await this.activateDiagramWithGrid(customGrid)
    }

    async getBlock(id) {
        const user = await localforage.getItem('currentUser')
        return await localforage.getItem(`Block_${id}_${user}`)
    }

    async showInputs(blockId, element) {
        this.blockId = blockId
        this.element = element

        const block = await this.getBlock(blockId)

        if (block.data.customGrid?.grid) {
            const gridData = this.parseGridClasses(block.data.customGrid.grid)
            this.updateGridDisplay(gridData.rows, gridData.cols)

            // Активировать интерактивный редактор
            await this.diagramEditor.activate(blockId, element)
        } else {
            this.updateGridDisplay(0, 0)
        }
    }

    hiddenInputs() {
        // Удалить класс выделения блока-диаграммы
        if (this.element) {
            this.element.classList.remove('diagram-target-block')
        }

        // Деактивировать интерактивный редактор
        this.diagramEditor.deactivate()

        // Закрыть панели стилей
        this.blockStyleManager.hide()
        this.connectionStyleManager.hide()

        // Сбросить ссылки
        this.blockId = undefined
        this.element = undefined
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
        const { cols: columns, rows } = parseGridSize(customGrid.grid, { cols: 3, rows: 3 });

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
                // Можно двигать вправо если правый край не достиг границы сетки
                if (colEnd < columns + 1) {
                    newColStart++;
                    newColEnd++;
                }
                break;
            case 'up':
                if (rowStart > 2) {
                    newRowStart--;
                    newRowEnd--;
                }
                break;
            case 'down':
                // Можно двигать вниз если нижний край не достиг границы сетки
                if (rowEnd < rows + 2) {
                    newRowStart++;
                    newRowEnd++;
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
        const { cols: columns, rows } = parseGridSize(customGrid.grid, { cols: 3, rows: 3 });

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
                endpoint: {type: 'Dot', options: {radius: 4}},
                paintStyle: {
                    stroke: "#516077",
                    strokeWidth: 2,
                    outlineStroke: "transparent",
                    outlineWidth: 10
                },
                anchors: ["Continuous", "Continuous"],
                overlays: [
                    {type: "Arrow", options: {width: 10, length: 10, location: 1}},
                    {type: "Label", options: {label: "", location: 0.5, cssClass: "connection-label", id: "label"}}
                ],
                endpointStyle: {
                    "fill": "#456",
                    "outlineWidth": 0
                }
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

import { escapeHtml, stripHtmlTags } from '../../utils/utils.js';

/**
 * Рендерит превью сетки с блоками
 */
export class LayoutPreview {
    constructor(container, gridSize, cells, childBlocks, placeholders = []) {
        this.container = container;
        this.gridSize = gridSize;
        this.cells = cells;
        this.childBlocks = childBlocks;
        this.placeholders = placeholders;

        this.gridElement = null;
        this.blockElements = new Map();  // childId → element
        this.selectedBlockId = null;
        this.onBlockSelect = null;
        this.onBlockDragStart = null;
        this.onBlockDragEnd = null;
        this.onBlockResize = null;  // callback(blockId, newColSpan, newRowSpan)
        this._activeResizeCleanup = null;  // Cleanup function for active resize
    }

    /**
     * Рендерит превью
     */
    render() {
        this.container.innerHTML = '';

        // Создаём grid контейнер
        this.gridElement = document.createElement('div');
        this.gridElement.className = 'layout-preview-grid';
        this.updateGridStyles();

        // Рендерим ячейки сетки (для визуализации)
        this.renderGridCells();

        // Рендерим блоки
        this.renderBlocks();

        // Рендерим placeholder'ы для новых блоков
        this.renderPlaceholders();

        this.container.appendChild(this.gridElement);
    }

    /**
     * Обновляет превью
     * @param {Object} gridSize - размер сетки {rows, cols}
     * @param {Object} cells - позиции блоков {childId: {row, col, rowSpan, colSpan}}
     * @param {Array} placeholders - placeholder'ы для новых блоков
     * @param {Array} childBlocks - массив дочерних блоков (опционально)
     */
    update(gridSize, cells, placeholders = [], childBlocks = null) {
        this.gridSize = gridSize;
        this.cells = cells;
        this.placeholders = placeholders;
        if (childBlocks !== null) {
            this.childBlocks = childBlocks;
        }
        this.render();
    }

    /**
     * Обновляет CSS Grid стили
     */
    updateGridStyles() {
        const { rows, cols } = this.gridSize;

        this.gridElement.style.display = 'grid';
        this.gridElement.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        this.gridElement.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        this.gridElement.style.gap = '4px';
        this.gridElement.style.padding = '8px';
        this.gridElement.style.height = '100%';
        this.gridElement.style.minHeight = '300px';
    }

    /**
     * Рендерит фоновые ячейки сетки
     */
    renderGridCells() {
        const { rows, cols } = this.gridSize;

        for (let r = 1; r <= rows; r++) {
            for (let c = 1; c <= cols; c++) {
                const cell = document.createElement('div');
                cell.className = 'layout-preview-cell';
                cell.dataset.row = r;
                cell.dataset.col = c;
                cell.style.gridRow = r;
                cell.style.gridColumn = c;

                // Drop zone для drag-and-drop
                cell.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    cell.classList.add('layout-preview-cell--dragover');
                });

                cell.addEventListener('dragleave', () => {
                    cell.classList.remove('layout-preview-cell--dragover');
                });

                cell.addEventListener('drop', (e) => {
                    e.preventDefault();
                    cell.classList.remove('layout-preview-cell--dragover');
                    if (this.onBlockDragEnd) {
                        this.onBlockDragEnd(
                            e.dataTransfer.getData('text/plain'),
                            parseInt(cell.dataset.row, 10),
                            parseInt(cell.dataset.col, 10)
                        );
                    }
                });

                this.gridElement.appendChild(cell);
            }
        }
    }

    /**
     * Рендерит блоки
     */
    renderBlocks() {
        this.blockElements.clear();

        for (const block of this.childBlocks) {
            const cell = this.cells[block.id];
            if (!cell) continue;

            const blockEl = this.createBlockElement(block, cell);
            this.gridElement.appendChild(blockEl);
            this.blockElements.set(block.id, blockEl);
        }
    }

    /**
     * Рендерит placeholder'ы для новых блоков
     */
    renderPlaceholders() {
        if (!this.placeholders || this.placeholders.length === 0) return;

        for (let i = 0; i < this.placeholders.length; i++) {
            const placeholder = this.placeholders[i];
            const el = document.createElement('div');
            el.className = 'layout-preview-block layout-preview-block--placeholder';
            el.dataset.placeholderIndex = i;
            el.dataset.blockId = placeholder.blockId;
            el.draggable = true;

            // Позиционирование в grid
            el.style.gridRow = `${placeholder.row} / ${placeholder.row + (placeholder.rowSpan || 1)}`;
            el.style.gridColumn = `${placeholder.col} / ${placeholder.col + (placeholder.colSpan || 1)}`;

            // Контент
            const text = escapeHtml(placeholder.text || `Новый блок ${i + 1}`);
            const spanInfo = placeholder.rowSpan > 1 || placeholder.colSpan > 1
                ? ` <span class="span-badge">${placeholder.colSpan}x${placeholder.rowSpan}</span>`
                : '';

            el.innerHTML = `
                <div class="layout-preview-block__title">${text}${spanInfo}</div>
                <div class="layout-preview-block__new-icon">+</div>
                <div class="layout-preview-block__resize-handles">
                    <div class="resize-handle resize-handle--e" data-direction="right"></div>
                    <div class="resize-handle resize-handle--s" data-direction="down"></div>
                    <div class="resize-handle resize-handle--se" data-direction="both"></div>
                </div>
            `;

            // Выделение по клику
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectBlock(placeholder.blockId);
                // Также сохраняем в blockElements для консистентности
                this.blockElements.set(placeholder.blockId, el);
            });

            // Drag events
            el.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', placeholder.blockId);
                el.classList.add('layout-preview-block--dragging');

                if (this.onBlockDragStart) {
                    this.onBlockDragStart(placeholder.blockId);
                }
            });

            el.addEventListener('dragend', () => {
                el.classList.remove('layout-preview-block--dragging');
            });

            // Resize handles для placeholder
            this.bindPlaceholderResizeHandles(el, placeholder.blockId, i);

            this.gridElement.appendChild(el);
            // Добавляем в blockElements для выделения
            this.blockElements.set(placeholder.blockId, el);
        }
    }

    /**
     * Привязывает события resize для placeholder
     */
    bindPlaceholderResizeHandles(blockEl, blockId, placeholderIndex) {
        const handles = blockEl.querySelectorAll('.resize-handle');

        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.startPlaceholderResize(blockId, placeholderIndex, handle.dataset.direction, e);
            });
        });
    }

    /**
     * Начинает resize placeholder блока
     */
    startPlaceholderResize(blockId, placeholderIndex, direction, startEvent) {
        const placeholder = this.placeholders[placeholderIndex];
        if (!placeholder) return;

        const startX = startEvent.clientX;
        const startY = startEvent.clientY;
        const startColSpan = placeholder.colSpan || 1;
        const startRowSpan = placeholder.rowSpan || 1;

        const gridRect = this.gridElement.getBoundingClientRect();
        const cellWidth = gridRect.width / this.gridSize.cols;
        const cellHeight = gridRect.height / this.gridSize.rows;

        const blockEl = this.blockElements.get(blockId);

        const onMouseMove = (e) => {
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            let newColSpan = startColSpan;
            let newRowSpan = startRowSpan;

            if (direction === 'right' || direction === 'both') {
                newColSpan = Math.max(1, startColSpan + Math.round(deltaX / cellWidth));
                newColSpan = Math.min(newColSpan, this.gridSize.cols - placeholder.col + 1);
            }

            if (direction === 'down' || direction === 'both') {
                newRowSpan = Math.max(1, startRowSpan + Math.round(deltaY / cellHeight));
                newRowSpan = Math.min(newRowSpan, this.gridSize.rows - placeholder.row + 1);
            }

            if (blockEl) {
                blockEl.style.gridColumn = `${placeholder.col} / ${placeholder.col + newColSpan}`;
                blockEl.style.gridRow = `${placeholder.row} / ${placeholder.row + newRowSpan}`;
                blockEl._tempColSpan = newColSpan;
                blockEl._tempRowSpan = newRowSpan;
            }
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            if (blockEl && (blockEl._tempColSpan || blockEl._tempRowSpan)) {
                placeholder.colSpan = blockEl._tempColSpan || placeholder.colSpan;
                placeholder.rowSpan = blockEl._tempRowSpan || placeholder.rowSpan;
                delete blockEl._tempColSpan;
                delete blockEl._tempRowSpan;
            }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        // Store cleanup function for panel close
        this._activeResizeCleanup = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }

    /**
     * Создаёт элемент блока
     */
    createBlockElement(block, cell) {
        const el = document.createElement('div');
        el.className = 'layout-preview-block';
        el.dataset.blockId = block.id;
        el.draggable = true;

        // Позиционирование в grid
        el.style.gridRow = `${cell.row} / ${cell.row + (cell.rowSpan || 1)}`;
        el.style.gridColumn = `${cell.col} / ${cell.col + (cell.colSpan || 1)}`;

        // Контент - используем escapeHtml для защиты от XSS
        const rawTitle = stripHtmlTags(block.data?.text || '').substring(0, 40) || 'Блок';
        const title = escapeHtml(rawTitle);
        const spanInfo = cell.rowSpan > 1 || cell.colSpan > 1
            ? ` <span class="span-badge">${cell.colSpan}x${cell.rowSpan}</span>`
            : '';

        el.innerHTML = `
            <div class="layout-preview-block__title">${title}${spanInfo}</div>
            <div class="layout-preview-block__resize-handles">
                <div class="resize-handle resize-handle--e" data-direction="right"></div>
                <div class="resize-handle resize-handle--s" data-direction="down"></div>
                <div class="resize-handle resize-handle--se" data-direction="both"></div>
            </div>
        `;

        // Выделение по клику
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectBlock(block.id);
        });

        // Drag events
        el.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', block.id);
            el.classList.add('layout-preview-block--dragging');

            // Делаем все блоки "прозрачными" для событий мыши, чтобы drop работал на ячейках
            this.blockElements.forEach(blockEl => {
                blockEl.style.pointerEvents = 'none';
            });

            if (this.onBlockDragStart) {
                this.onBlockDragStart(block.id);
            }
        });

        el.addEventListener('dragend', () => {
            el.classList.remove('layout-preview-block--dragging');

            // Восстанавливаем pointer-events
            this.blockElements.forEach(blockEl => {
                blockEl.style.pointerEvents = '';
            });
        });

        // Resize handles
        this.bindResizeHandles(el, block.id);

        return el;
    }

    /**
     * Привязывает события resize handles
     */
    bindResizeHandles(blockEl, blockId) {
        const handles = blockEl.querySelectorAll('.resize-handle');

        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.startResize(blockId, handle.dataset.direction, e);
            });
        });
    }

    /**
     * Начинает resize блока
     */
    startResize(blockId, direction, startEvent) {
        const cell = this.cells[blockId];
        if (!cell) return;

        const startX = startEvent.clientX;
        const startY = startEvent.clientY;
        const startColSpan = cell.colSpan || 1;
        const startRowSpan = cell.rowSpan || 1;

        // Размер одной ячейки
        const gridRect = this.gridElement.getBoundingClientRect();
        const cellWidth = gridRect.width / this.gridSize.cols;
        const cellHeight = gridRect.height / this.gridSize.rows;

        const onMouseMove = (e) => {
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            let newColSpan = startColSpan;
            let newRowSpan = startRowSpan;

            if (direction === 'right' || direction === 'both') {
                newColSpan = Math.max(1, startColSpan + Math.round(deltaX / cellWidth));
                newColSpan = Math.min(newColSpan, this.gridSize.cols - cell.col + 1);
            }

            if (direction === 'down' || direction === 'both') {
                newRowSpan = Math.max(1, startRowSpan + Math.round(deltaY / cellHeight));
                newRowSpan = Math.min(newRowSpan, this.gridSize.rows - cell.row + 1);
            }

            // Обновляем визуально
            const blockEl = this.blockElements.get(blockId);
            if (blockEl) {
                blockEl.style.gridColumn = `${cell.col} / ${cell.col + newColSpan}`;
                blockEl.style.gridRow = `${cell.row} / ${cell.row + newRowSpan}`;
            }

            // Сохраняем временные значения
            blockEl._tempColSpan = newColSpan;
            blockEl._tempRowSpan = newRowSpan;
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            const blockEl = this.blockElements.get(blockId);
            if (blockEl && (blockEl._tempColSpan || blockEl._tempRowSpan)) {
                const newColSpan = blockEl._tempColSpan || cell.colSpan;
                const newRowSpan = blockEl._tempRowSpan || cell.rowSpan;

                delete blockEl._tempColSpan;
                delete blockEl._tempRowSpan;

                // Используем callback вместо прямой мутации cells
                if (this.onBlockResize) {
                    this.onBlockResize(blockId, newColSpan, newRowSpan);
                }
            }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        // Store cleanup function for panel close
        this._activeResizeCleanup = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }

    /**
     * Выделяет блок
     */
    selectBlock(blockId) {
        // Снимаем предыдущее выделение
        if (this.selectedBlockId) {
            const prevEl = this.blockElements.get(this.selectedBlockId);
            if (prevEl) {
                prevEl.classList.remove('layout-preview-block--selected');
            }
        }

        // Выделяем новый
        this.selectedBlockId = blockId;
        const el = this.blockElements.get(blockId);
        if (el) {
            el.classList.add('layout-preview-block--selected');
        }

        // Callback
        if (this.onBlockSelect) {
            this.onBlockSelect(blockId);
        }
    }

    /**
     * Снимает выделение
     */
    deselectAll() {
        if (this.selectedBlockId) {
            const el = this.blockElements.get(this.selectedBlockId);
            if (el) {
                el.classList.remove('layout-preview-block--selected');
            }
            this.selectedBlockId = null;
        }
    }

    /**
     * Получает выделенный блок
     */
    getSelectedBlockId() {
        return this.selectedBlockId;
    }

    /**
     * Подсвечивает ячейку
     */
    highlightCell(row, col, highlight = true) {
        const cells = this.gridElement.querySelectorAll('.layout-preview-cell');
        cells.forEach(cell => {
            if (parseInt(cell.dataset.row, 10) === row &&
                parseInt(cell.dataset.col, 10) === col) {
                if (highlight) {
                    cell.classList.add('layout-preview-cell--highlight');
                } else {
                    cell.classList.remove('layout-preview-cell--highlight');
                }
            }
        });
    }

    /**
     * Очищает все подсветки
     */
    clearHighlights() {
        const cells = this.gridElement.querySelectorAll('.layout-preview-cell');
        cells.forEach(cell => {
            cell.classList.remove('layout-preview-cell--highlight');
            cell.classList.remove('layout-preview-cell--dragover');
        });
    }

    /**
     * Уничтожает превью и очищает все event listeners
     */
    destroy() {
        // Clean up any active resize operation
        if (this._activeResizeCleanup) {
            this._activeResizeCleanup();
            this._activeResizeCleanup = null;
        }

        // Clear callbacks
        this.onBlockSelect = null;
        this.onBlockDragStart = null;
        this.onBlockDragEnd = null;
        this.onBlockResize = null;

        // Clear elements
        this.blockElements.clear();
        this.selectedBlockId = null;

        // Clear container
        if (this.container) {
            this.container.innerHTML = '';
        }
        this.gridElement = null;
    }
}

export default LayoutPreview;

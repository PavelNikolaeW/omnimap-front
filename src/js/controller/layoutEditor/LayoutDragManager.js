/**
 * Управляет drag-and-drop операциями в редакторе раскладки
 */
export class LayoutDragManager {
    constructor(panel) {
        this.panel = panel;
        this.isDragging = false;
        this.draggedBlockId = null;

        this.init();
    }

    /**
     * Инициализация
     */
    init() {
        if (!this.panel.preview) return;

        // Подписываемся на события превью
        this.panel.preview.onBlockSelect = (blockId) => {
            this.panel.updateSelectedBlockInfo(blockId);
        };

        this.panel.preview.onBlockDragStart = (blockId) => {
            this.startDrag(blockId);
        };

        this.panel.preview.onBlockDragEnd = (blockId, targetRow, targetCol) => {
            this.endDrag(blockId, targetRow, targetCol);
        };

        // Keyboard shortcuts
        this.boundKeyHandler = this.handleKeyDown.bind(this);
        document.addEventListener('keydown', this.boundKeyHandler);
    }

    /**
     * Начало drag
     */
    startDrag(blockId) {
        this.isDragging = true;
        this.draggedBlockId = blockId;
    }

    /**
     * Окончание drag
     */
    endDrag(blockId, targetRow, targetCol) {
        if (!this.isDragging || this.draggedBlockId !== blockId) return;

        const cell = this.panel.cells[blockId];
        if (!cell) return;

        // Проверяем можно ли разместить
        if (this.panel.cellManager.canPlace(blockId, targetRow, targetCol, cell.rowSpan, cell.colSpan)) {
            this.panel.cellManager.place(blockId, targetRow, targetCol, cell.rowSpan, cell.colSpan);
            this.panel.refreshPreview();
        }

        this.isDragging = false;
        this.draggedBlockId = null;
    }

    /**
     * Обработка клавиатуры
     */
    handleKeyDown(e) {
        const selectedId = this.panel.preview?.getSelectedBlockId();
        if (!selectedId) return;

        const cell = this.panel.cells[selectedId];
        if (!cell) return;

        let handled = false;

        // Arrow keys для перемещения
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
            switch (e.key) {
                case 'ArrowUp':
                    handled = this.panel.cellManager.move(selectedId, -1, 0);
                    break;
                case 'ArrowDown':
                    handled = this.panel.cellManager.move(selectedId, 1, 0);
                    break;
                case 'ArrowLeft':
                    handled = this.panel.cellManager.move(selectedId, 0, -1);
                    break;
                case 'ArrowRight':
                    handled = this.panel.cellManager.move(selectedId, 0, 1);
                    break;
            }
        }

        // Shift + Arrow для изменения размера
        if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
            switch (e.key) {
                case 'ArrowUp':
                    handled = this.panel.cellManager.expandSpan(selectedId, 'up', -1);
                    break;
                case 'ArrowDown':
                    handled = this.panel.cellManager.expandSpan(selectedId, 'down', 1);
                    break;
                case 'ArrowLeft':
                    handled = this.panel.cellManager.expandSpan(selectedId, 'left', -1);
                    break;
                case 'ArrowRight':
                    handled = this.panel.cellManager.expandSpan(selectedId, 'right', 1);
                    break;
            }
        }

        // Ctrl + Arrow для увеличения размера от центра
        if (e.ctrlKey && !e.shiftKey) {
            switch (e.key) {
                case 'ArrowUp':
                    handled = this.panel.cellManager.expandSpan(selectedId, 'up', 1);
                    break;
                case 'ArrowDown':
                    handled = this.panel.cellManager.expandSpan(selectedId, 'down', 1);
                    break;
                case 'ArrowLeft':
                    handled = this.panel.cellManager.expandSpan(selectedId, 'left', 1);
                    break;
                case 'ArrowRight':
                    handled = this.panel.cellManager.expandSpan(selectedId, 'right', 1);
                    break;
            }
        }

        if (handled) {
            e.preventDefault();
            e.stopPropagation();
            this.panel.cellManager.rebuildOccupancyGrid();
            this.panel.refreshPreview();
            this.panel.updateSelectedBlockInfo(selectedId);
        }

        // Escape для снятия выделения
        if (e.key === 'Escape') {
            this.panel.preview.deselectAll();
            this.panel.updateSelectedBlockInfo(null);
        }
    }

    /**
     * Уничтожение менеджера
     */
    destroy() {
        if (this.boundKeyHandler) {
            document.removeEventListener('keydown', this.boundKeyHandler);
        }
    }
}

export default LayoutDragManager;

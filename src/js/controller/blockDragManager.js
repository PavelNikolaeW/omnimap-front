/**
 * BlockDragManager - drag-and-drop для обычных блоков (не диаграмм)
 *
 * Активируется: Shift + mousedown на блоке без customGrid родителя
 * Визуализация: полупрозрачный блок следует за курсором
 * Drop zones: при наведении показывается зона вставки (before или into)
 *
 * Взаимодействие с diagramEditor:
 * - Если блок внутри диаграммы (родитель с customGrid) — пропускаем, диаграммы обрабатывает diagramEditor
 */

import { dispatch } from "../utils/utils";
import { extractBlockId, extractParentId } from "../actions/selectionActions";

class BlockDragManager {
    constructor() {
        // Drag state
        this.isDragging = false;
        this.draggedBlockId = null;
        this.draggedParentId = null;
        this.draggedElement = null;

        // Potential drag (ждём порог 5px)
        this.potentialDrag = null;

        // Drag indicator (visual)
        this.dragIndicator = null;

        // Drop target
        this.dropTarget = null;
        this.dropPosition = null; // 'before' | 'into'
        this.dropZoneElement = null;

        // Bind методы для addEventListener/removeEventListener
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);

        this.init();
    }

    init() {
        // Глобальные слушатели
        document.addEventListener('mousedown', this.handleMouseDown, true);
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
    }

    /**
     * Очистка слушателей (для тестов и корректного уничтожения)
     */
    destroy() {
        document.removeEventListener('mousedown', this.handleMouseDown, true);
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);

        this.cancelDrag();
        this.cancelPotentialDrag();
    }

    /**
     * Обработка нажатия Shift — готовность к drag
     */
    handleKeyDown(e) {
        if (e.key === 'Shift' && !this.isDragging) {
            document.body.classList.add('shift-drag-ready');
        }
    }

    /**
     * Обработка отпускания Shift — отмена если не начали drag
     */
    handleKeyUp(e) {
        if (e.key === 'Shift') {
            document.body.classList.remove('shift-drag-ready');
            if (this.potentialDrag && !this.isDragging) {
                this.cancelPotentialDrag();
            }
            if (this.isDragging) {
                this.cancelDrag();
            }
        }
        if (e.key === 'Escape' && this.isDragging) {
            this.cancelDrag();
        }
    }

    /**
     * Обработка mousedown
     */
    handleMouseDown(e) {
        // Только с зажатым Shift
        if (!e.shiftKey) return;

        // Найти блок
        const blockElement = this.findBlockElement(e.target);
        if (!blockElement) return;

        // Проверить что это НЕ блок внутри диаграммы
        if (this.isInsideDiagram(blockElement)) {
            return; // Диаграммы обрабатывает diagramEditor
        }

        // Проверить что это не root блок
        const blockId = extractBlockId(blockElement);
        const parentId = extractParentId(blockElement);
        if (!parentId) {
            return; // Нельзя перетащить root блок
        }

        // Сохранить данные для потенциального drag
        this.potentialDrag = {
            blockId,
            parentId,
            element: blockElement,
            startX: e.clientX,
            startY: e.clientY
        };

        // Добавить слушатели
        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);

        e.preventDefault();
        e.stopPropagation();
    }

    /**
     * Обработка mousemove
     */
    handleMouseMove(e) {
        // Проверка порога 5px для начала drag
        if (this.potentialDrag && !this.isDragging) {
            const dx = e.clientX - this.potentialDrag.startX;
            const dy = e.clientY - this.potentialDrag.startY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 5) {
                this.startDrag();
            } else {
                return;
            }
        }

        if (!this.isDragging) return;

        // Обновить позицию drag indicator
        this.updateDragIndicator(e.clientX, e.clientY);

        // Найти drop target
        this.updateDropTarget(e.clientX, e.clientY);
    }

    /**
     * Обработка mouseup
     */
    handleMouseUp(e) {
        // Убрать слушатели
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);

        if (this.isDragging) {
            this.endDrag();
        }

        this.cancelPotentialDrag();
    }

    /**
     * Начать drag
     */
    startDrag() {
        if (!this.potentialDrag) return;

        this.isDragging = true;
        this.draggedBlockId = this.potentialDrag.blockId;
        this.draggedParentId = this.potentialDrag.parentId;
        this.draggedElement = this.potentialDrag.element;

        // Визуальный индикатор на исходном блоке
        this.draggedElement.classList.add('block-dragging-source');

        // Создать drag indicator
        this.createDragIndicator(
            this.potentialDrag.element,
            this.potentialDrag.startX,
            this.potentialDrag.startY
        );
    }

    /**
     * Создать визуальный индикатор перетаскивания
     */
    createDragIndicator(blockElement, startX, startY) {
        const rect = blockElement.getBoundingClientRect();

        this.dragIndicator = document.createElement('div');
        this.dragIndicator.className = 'block-drag-indicator';

        // Копируем содержимое блока
        const titleEl = blockElement.querySelector('.defaultContent');
        if (titleEl) {
            this.dragIndicator.textContent = titleEl.textContent.substring(0, 50);
            if (titleEl.textContent.length > 50) {
                this.dragIndicator.textContent += '...';
            }
        }

        // Стили
        this.dragIndicator.style.cssText = `
            position: fixed;
            left: ${startX - 60}px;
            top: ${startY - 20}px;
            width: ${Math.min(rect.width, 200)}px;
            min-height: 40px;
            padding: 8px 12px;
            background: rgba(79, 70, 229, 0.9);
            color: white;
            border-radius: 8px;
            pointer-events: none;
            z-index: 10000;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            font-size: 14px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        `;

        document.body.appendChild(this.dragIndicator);
    }

    /**
     * Обновить позицию drag indicator
     */
    updateDragIndicator(x, y) {
        if (!this.dragIndicator) return;
        this.dragIndicator.style.left = `${x - 60}px`;
        this.dragIndicator.style.top = `${y - 20}px`;
    }

    /**
     * Удалить drag indicator
     */
    removeDragIndicator() {
        if (this.dragIndicator) {
            this.dragIndicator.remove();
            this.dragIndicator = null;
        }
    }

    /**
     * Найти drop target под курсором
     */
    updateDropTarget(x, y) {
        // Скрыть indicator чтобы он не блокировал elementFromPoint
        if (this.dragIndicator) {
            this.dragIndicator.style.display = 'none';
        }

        const elementUnderCursor = document.elementFromPoint(x, y);

        if (this.dragIndicator) {
            this.dragIndicator.style.display = '';
        }

        if (!elementUnderCursor) {
            this.hideDropZone();
            return;
        }

        // Найти блок под курсором
        const targetBlock = this.findBlockElement(elementUnderCursor);

        if (!targetBlock) {
            this.hideDropZone();
            return;
        }

        // Не можем drop на себя
        const targetId = extractBlockId(targetBlock);
        if (targetId === this.draggedBlockId) {
            this.hideDropZone();
            return;
        }

        // Не можем drop на свои дочерние (предотвращаем циклы)
        if (this.isDescendant(targetBlock, this.draggedElement)) {
            this.hideDropZone();
            return;
        }

        // Определить позицию: before или into
        const rect = targetBlock.getBoundingClientRect();
        const relativeX = x - rect.left;
        const isBeforeZone = relativeX < rect.width * 0.25;

        // Проверить можно ли вставить before (нужен родитель)
        const targetParentId = extractParentId(targetBlock);
        const position = (isBeforeZone && targetParentId) ? 'before' : 'into';

        // Показать drop zone
        this.showDropZone(targetBlock, position, targetId, targetParentId);
    }

    /**
     * Показать drop zone
     */
    showDropZone(targetBlock, position, targetId, targetParentId) {
        // Если тот же target и позиция — ничего не делаем
        if (this.dropTarget === targetBlock && this.dropPosition === position) {
            return;
        }

        // Убрать предыдущую зону
        this.hideDropZone();

        this.dropTarget = targetBlock;
        this.dropPosition = position;

        if (position === 'before') {
            // Вертикальная линия слева от блока
            this.dropZoneElement = document.createElement('div');
            this.dropZoneElement.className = 'block-drop-before';

            const rect = targetBlock.getBoundingClientRect();
            const parentRect = targetBlock.parentElement.getBoundingClientRect();

            this.dropZoneElement.style.cssText = `
                position: absolute;
                left: ${targetBlock.offsetLeft - 8}px;
                top: ${targetBlock.offsetTop - 4}px;
                width: 4px;
                height: ${rect.height + 8}px;
                background: rgba(79, 70, 229, 0.8);
                border-radius: 2px;
                pointer-events: none;
                z-index: 1000;
            `;

            targetBlock.parentElement.style.position = 'relative';
            targetBlock.parentElement.appendChild(this.dropZoneElement);
        } else {
            // Подсветка целевого блока для вставки внутрь
            targetBlock.classList.add('block-drop-into');
        }
    }

    /**
     * Скрыть drop zone
     */
    hideDropZone() {
        if (this.dropZoneElement) {
            this.dropZoneElement.remove();
            this.dropZoneElement = null;
        }

        if (this.dropTarget) {
            this.dropTarget.classList.remove('block-drop-into');
        }

        this.dropTarget = null;
        this.dropPosition = null;
    }

    /**
     * Завершить drag и выполнить перемещение
     */
    endDrag() {
        if (!this.isDragging) return;

        // Удалить визуальные индикаторы
        this.removeDragIndicator();
        if (this.draggedElement) {
            this.draggedElement.classList.remove('block-dragging-source');
        }

        // Выполнить перемещение если есть valid drop target
        if (this.dropTarget && this.dropPosition) {
            const targetId = extractBlockId(this.dropTarget);
            const targetParentId = extractParentId(this.dropTarget);

            const moveData = {
                block_id: this.draggedBlockId,
                old_parent_id: this.draggedParentId
            };

            if (this.dropPosition === 'before') {
                // Вставить перед целевым блоком (в того же родителя)
                moveData.new_parent_id = targetParentId;
                moveData.before = targetId;
            } else {
                // Вставить внутрь целевого блока
                moveData.new_parent_id = targetId;
                // before = undefined — добавится в конец
            }

            dispatch('MoveBlock', moveData);
        }

        this.hideDropZone();
        this.isDragging = false;
        this.draggedBlockId = null;
        this.draggedParentId = null;
        this.draggedElement = null;
    }

    /**
     * Отменить drag
     */
    cancelDrag() {
        if (!this.isDragging) return;

        this.removeDragIndicator();
        this.hideDropZone();

        if (this.draggedElement) {
            this.draggedElement.classList.remove('block-dragging-source');
        }

        this.isDragging = false;
        this.draggedBlockId = null;
        this.draggedParentId = null;
        this.draggedElement = null;

        // Убрать слушатели
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
    }

    /**
     * Отменить потенциальный drag (до порога 5px)
     */
    cancelPotentialDrag() {
        this.potentialDrag = null;
    }

    // ========== Utility методы ==========

    /**
     * Найти родительский элемент с атрибутом block
     */
    findBlockElement(el) {
        while (el && el !== document.documentElement) {
            if (el.hasAttribute && el.hasAttribute('block')) {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    }

    /**
     * Проверить находится ли блок внутри диаграммы (родитель с customGrid)
     */
    isInsideDiagram(blockElement) {
        let parent = blockElement.parentElement;
        while (parent && parent !== document.documentElement) {
            if (parent.hasAttribute && parent.hasAttribute('blockCustomGrid')) {
                return true;
            }
            parent = parent.parentElement;
        }
        return false;
    }

    /**
     * Проверить является ли element потомком ancestor
     */
    isDescendant(element, ancestor) {
        if (!element || !ancestor) return false;
        let parent = element.parentElement;
        while (parent && parent !== document.documentElement) {
            if (parent === ancestor) {
                return true;
            }
            parent = parent.parentElement;
        }
        return false;
    }
}

// Singleton экземпляр
export const blockDragManager = new BlockDragManager();

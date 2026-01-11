/**
 * DragDropManager - управление drag-and-drop для перемещения блоков в дереве и диаграммах
 *
 * Использует HTML5 Drag and Drop API.
 * Поддерживает перемещение между:
 * - Обычными блоками (дерево)
 * - Блоками в диаграммах (customGrid)
 * Исключает блоки внутри layoutCells (календарь, kanban и т.д.)
 */

import { dispatch } from '../utils/utils';

export class DragDropManager {
    constructor() {
        this.isDragging = false;
        this.draggedBlockId = null;
        this.draggedElement = null;
        this.dragSourceParentId = null;
        this.dropIndicator = null;
        this.lastDropTarget = null;

        // Источник - диаграмма?
        this.dragFromDiagram = false;
        // customGrid старого родителя (если drag из диаграммы)
        this.dragSourceCustomGrid = null;

        // Порог для определения зоны drop (верх/центр/низ блока)
        this.DROP_ZONE_THRESHOLD = 0.25; // 25% сверху и снизу для sibling, остальное - child

        // Bound handler для cleanup на Escape
        this._handleEscapeKey = this._handleEscapeKey.bind(this);
    }

    /**
     * Обработчик Escape для отмены drag
     */
    _handleEscapeKey(e) {
        if (e.key === 'Escape' && this.isDragging) {
            this.cleanup();
        }
    }

    /**
     * Инициализация - получение доступа к localStateManager
     * Вызывается после загрузки приложения
     */
    async init() {
        const { localStateManager } = await import('../stateLocal/localStateManager.js');
        this.localStateManager = localStateManager;
    }

    /**
     * Проверяет, можно ли перетаскивать блок
     * Разрешает drag из диаграмм (customGrid), исключает layoutCells (календарь, kanban и т.д.)
     * @param {HTMLElement} element - DOM элемент блока
     * @returns {boolean}
     */
    canDrag(element) {
        if (!element || !element.hasAttribute('block')) return false;

        const parentBlock = element.parentElement?.closest('[block]');

        // Проверяем через данные блока
        if (this.localStateManager && parentBlock) {
            const parentId = this._extractBlockId(parentBlock);
            const parentData = this.localStateManager.blocks.get(parentId);

            // LayoutCells (календарь, kanban и т.д.) - запрещаем drag
            if (parentData?.data?.layout === 'cells' && parentData?.data?.layoutCells) {
                return false;
            }

            // Diagram - разрешаем drag
            // (будет обработан как перемещение из диаграммы)
        }

        return true;
    }

    /**
     * Проверяет, является ли родительский блок диаграммой
     * @param {string} parentId - ID родительского блока
     * @returns {boolean}
     */
    _isDiagramParent(parentId) {
        if (!this.localStateManager || !parentId) return false;
        const parentData = this.localStateManager.blocks.get(parentId);
        return !!parentData?.data?.customGrid?.grid;
    }

    /**
     * Проверяет, можно ли сделать drop в указанный блок
     * Разрешает drop в диаграммы (customGrid), исключает layoutCells
     * @param {HTMLElement} targetElement - DOM элемент целевого блока
     * @returns {boolean}
     */
    canDropInto(targetElement) {
        if (!targetElement || !targetElement.hasAttribute('block')) return false;

        // Нельзя drop в себя
        if (this._extractBlockId(targetElement) === this.draggedBlockId) {
            return false;
        }

        if (this.localStateManager) {
            const targetId = this._extractBlockId(targetElement);
            const targetData = this.localStateManager.blocks.get(targetId);

            // LayoutCells (календарь, kanban и т.д.) - запрещаем drop
            if (targetData?.data?.layout === 'cells' && targetData?.data?.layoutCells) {
                return false;
            }

            // Diagram - разрешаем drop (будет рассчитана позиция)
            // customGrid разрешён

            // Проверяем circular reference - нельзя drop в потомка
            if (this._isDescendant(this.draggedBlockId, targetId)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Начало перетаскивания
     * @param {DragEvent} e - событие dragstart
     * @param {HTMLElement} element - DOM элемент блока
     */
    startDrag(e, element) {
        if (!this.canDrag(element)) {
            e.preventDefault();
            return false;
        }

        this.isDragging = true;
        this.draggedBlockId = this._extractBlockId(element);
        this.draggedElement = element;

        // Находим родителя
        const parentElement = element.parentElement?.closest('[block]');
        this.dragSourceParentId = parentElement ? this._extractBlockId(parentElement) : null;

        // Проверяем, drag ли это из диаграммы
        this.dragFromDiagram = this._isDiagramParent(this.dragSourceParentId);
        if (this.dragFromDiagram && this.localStateManager) {
            const parentData = this.localStateManager.blocks.get(this.dragSourceParentId);
            this.dragSourceCustomGrid = parentData?.data?.customGrid || null;
        } else {
            this.dragSourceCustomGrid = null;
        }

        // Настраиваем dataTransfer
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.draggedBlockId);

        // Визуальный feedback - добавляем класс после небольшой задержки
        // чтобы не мешать браузеру создать drag image
        requestAnimationFrame(() => {
            element.classList.add('block-dragging');
        });

        // Добавляем listener для отмены по Escape
        document.addEventListener('keydown', this._handleEscapeKey);

        return true;
    }

    /**
     * Обработка dragover для показа индикатора drop
     * @param {DragEvent} e - событие dragover
     * @param {HTMLElement} targetElement - целевой блок
     */
    handleDragOver(e, targetElement) {
        if (!this.isDragging || !targetElement) return;

        const dropTarget = this._calculateDropTarget(e, targetElement);
        if (!dropTarget) {
            this._removeDropIndicator();
            this.lastDropTarget = null;
            return;
        }

        // Проверяем можно ли drop
        if (dropTarget.type === 'child' && !this.canDropInto(targetElement)) {
            this._removeDropIndicator();
            this.lastDropTarget = null;
            return;
        }

        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        // Показываем индикатор
        this._showDropIndicator(targetElement, dropTarget);
        this.lastDropTarget = dropTarget;
    }

    /**
     * Обработка drop
     * @param {DragEvent} e - событие drop
     * @param {HTMLElement} targetElement - целевой блок
     */
    handleDrop(e, targetElement) {
        if (!this.isDragging || !this.lastDropTarget) {
            this.cleanup();
            return;
        }

        e.preventDefault();

        const { parentId, beforeBlockId, dropToDiagram, diagramPosition } = this.lastDropTarget;

        // Не перемещаем если ничего не изменилось (и это не drop в диаграмму)
        if (parentId === this.dragSourceParentId && !beforeBlockId && !dropToDiagram) {
            this.cleanup();
            return;
        }

        // Dispatch событие MoveBlock с дополнительными данными о диаграммах
        dispatch('MoveBlock', {
            block_id: this.draggedBlockId,
            old_parent_id: this.dragSourceParentId,
            new_parent_id: parentId,
            before: beforeBlockId,
            // Информация о диаграммах
            fromDiagram: this.dragFromDiagram,
            toDiagram: dropToDiagram || false,
            diagramPosition: diagramPosition || null
        });

        this.cleanup();
    }

    /**
     * Завершение drag (успешное или отмененное)
     */
    endDrag() {
        this.cleanup();
    }

    /**
     * Очистка состояния и visual feedback
     */
    cleanup() {
        // Удаляем класс с сохраненного элемента
        if (this.draggedElement) {
            this.draggedElement.classList.remove('block-dragging');
        }

        // Также удаляем .block-dragging со всех блоков на случай если элемент был пересоздан
        document.querySelectorAll('[block].block-dragging').forEach(el => {
            el.classList.remove('block-dragging');
        });

        this._removeDropIndicator();

        // Удаляем listener для Escape
        document.removeEventListener('keydown', this._handleEscapeKey);

        this.isDragging = false;
        this.draggedBlockId = null;
        this.draggedElement = null;
        this.dragSourceParentId = null;
        this.lastDropTarget = null;
        this.dragFromDiagram = false;
        this.dragSourceCustomGrid = null;
    }

    /**
     * Вычисляет куда будет сделан drop
     * @param {DragEvent} e - событие
     * @param {HTMLElement} targetElement - целевой блок
     * @returns {Object|null} { parentId, beforeBlockId, type, dropToDiagram?, diagramPosition? }
     */
    _calculateDropTarget(e, targetElement) {
        if (!targetElement || !targetElement.hasAttribute('block')) return null;

        const targetId = this._extractBlockId(targetElement);

        // Нельзя drop на себя
        if (targetId === this.draggedBlockId) return null;

        const rect = targetElement.getBoundingClientRect();
        const relativeY = (e.clientY - rect.top) / rect.height;

        // Проверяем, является ли target диаграммой
        const targetIsDiagram = this._isDiagramParent(targetId);

        // Определяем тип drop зоны
        if (relativeY < this.DROP_ZONE_THRESHOLD) {
            // Верхняя часть - вставить ДО этого блока (как sibling)
            const parentElement = targetElement.parentElement?.closest('[block]');
            if (!parentElement) return null;

            const parentId = this._extractBlockId(parentElement);
            // Если родитель - диаграмма, нужно вычислить позицию
            const parentIsDiagram = this._isDiagramParent(parentId);

            return {
                parentId: parentId,
                beforeBlockId: targetId,
                type: 'sibling-before',
                dropToDiagram: parentIsDiagram,
                diagramPosition: parentIsDiagram ? this._calculateDiagramPosition(e, parentElement, parentId) : null
            };
        } else if (relativeY > (1 - this.DROP_ZONE_THRESHOLD)) {
            // Нижняя часть - вставить ПОСЛЕ этого блока (как sibling)
            const parentElement = targetElement.parentElement?.closest('[block]');
            if (!parentElement) return null;

            // Находим следующий sibling
            const parentId = this._extractBlockId(parentElement);
            const nextSiblingId = this._getNextSiblingId(targetId, parentId);
            const parentIsDiagram = this._isDiagramParent(parentId);

            return {
                parentId: parentId,
                beforeBlockId: nextSiblingId, // null если последний - добавится в конец
                type: 'sibling-after',
                dropToDiagram: parentIsDiagram,
                diagramPosition: parentIsDiagram ? this._calculateDiagramPosition(e, parentElement, parentId) : null
            };
        } else {
            // Центр - вставить ВНУТРЬ как child
            if (!this.canDropInto(targetElement)) return null;

            // Если target - диаграмма, вычисляем позицию в grid
            if (targetIsDiagram) {
                return {
                    parentId: targetId,
                    beforeBlockId: null,
                    type: 'child',
                    dropToDiagram: true,
                    diagramPosition: this._calculateDiagramPosition(e, targetElement, targetId)
                };
            }

            return {
                parentId: targetId,
                beforeBlockId: null, // В конец списка детей
                type: 'child',
                dropToDiagram: false,
                diagramPosition: null
            };
        }
    }

    /**
     * Вычисляет позицию в grid диаграммы по координатам мыши
     * @param {DragEvent} e - событие
     * @param {HTMLElement} diagramElement - DOM элемент диаграммы
     * @param {string} diagramId - ID диаграммы
     * @returns {Object|null} { col, row } - позиция в grid (1-based)
     */
    _calculateDiagramPosition(e, diagramElement, diagramId) {
        if (!this.localStateManager) return null;

        const diagramData = this.localStateManager.blocks.get(diagramId);
        const customGrid = diagramData?.data?.customGrid;
        if (!customGrid?.grid) return null;

        // Парсим размер grid
        const colsClass = customGrid.grid.find(cls => cls.startsWith('grid-template-columns_'));
        const rowsClass = customGrid.grid.find(cls => cls.startsWith('grid-template-rows_'));
        const cols = colsClass ? (colsClass.split('__').length - 1) : 1;
        const rows = rowsClass ? (rowsClass.split('__').length - 1) : 1;

        const rect = diagramElement.getBoundingClientRect();

        // Учитываем первую строку (контент) - она auto
        const contentRow = diagramElement.querySelector('.defaultContent');
        const contentHeight = contentRow ? contentRow.offsetHeight : 0;

        const relX = e.clientX - rect.left;
        const relY = e.clientY - rect.top - contentHeight;

        const cellWidth = rect.width / cols;
        const cellHeight = (rect.height - contentHeight) / rows;

        const col = Math.max(1, Math.min(cols, Math.floor(relX / cellWidth) + 1));
        const row = Math.max(2, Math.min(rows + 1, Math.floor(relY / cellHeight) + 2));

        return { col, row, cols, rows };
    }

    /**
     * Показывает индикатор drop позиции
     * @param {HTMLElement} targetElement - целевой блок
     * @param {Object} dropTarget - информация о позиции
     */
    _showDropIndicator(targetElement, dropTarget) {
        this._removeDropIndicator();

        const indicator = document.createElement('div');
        indicator.className = 'drop-indicator';
        indicator.id = 'drag-drop-indicator';

        const rect = targetElement.getBoundingClientRect();

        if (dropTarget.type === 'sibling-before') {
            // Горизонтальная линия сверху блока
            indicator.style.cssText = `
                position: fixed;
                left: ${rect.left - 4}px;
                top: ${rect.top - 3}px;
                width: ${rect.width + 8}px;
                height: 6px;
                background: linear-gradient(90deg, #3b82f6, #8b5cf6);
                border-radius: 3px;
                pointer-events: none;
                z-index: 10000;
                box-shadow: 0 0 8px rgba(59, 130, 246, 0.6);
            `;
        } else if (dropTarget.type === 'sibling-after') {
            // Горизонтальная линия снизу блока
            indicator.style.cssText = `
                position: fixed;
                left: ${rect.left - 4}px;
                top: ${rect.bottom - 3}px;
                width: ${rect.width + 8}px;
                height: 6px;
                background: linear-gradient(90deg, #3b82f6, #8b5cf6);
                border-radius: 3px;
                pointer-events: none;
                z-index: 10000;
                box-shadow: 0 0 8px rgba(59, 130, 246, 0.6);
            `;
        } else if (dropTarget.type === 'child') {
            // Подсветка всего блока (как контейнера)
            indicator.style.cssText = `
                position: fixed;
                left: ${rect.left}px;
                top: ${rect.top}px;
                width: ${rect.width}px;
                height: ${rect.height}px;
                background: rgba(59, 130, 246, 0.2);
                border: 3px dashed #3b82f6;
                border-radius: 6px;
                pointer-events: none;
                z-index: 9999;
                box-shadow: inset 0 0 12px rgba(59, 130, 246, 0.3);
            `;
        }

        document.body.appendChild(indicator);
        this.dropIndicator = indicator;
    }

    /**
     * Удаляет индикатор drop
     */
    _removeDropIndicator() {
        if (this.dropIndicator) {
            this.dropIndicator.remove();
            this.dropIndicator = null;
        }
        // Также удаляем по ID на случай если ссылка потерялась
        const existing = document.getElementById('drag-drop-indicator');
        if (existing) existing.remove();
    }

    /**
     * Извлекает ID блока из элемента
     * Учитывает формат для block links: parentId*blockId
     * @param {HTMLElement} element
     * @returns {string}
     */
    _extractBlockId(element) {
        const id = element.id;
        // Для block links формат parentId*blockId
        if (id.includes('*')) {
            return id.split('*').pop();
        }
        return id;
    }

    /**
     * Получает ID следующего sibling блока
     * @param {string} blockId - текущий блок
     * @param {string} parentId - родитель
     * @returns {string|null}
     */
    _getNextSiblingId(blockId, parentId) {
        if (!this.localStateManager) return null;

        const parent = this.localStateManager.blocks.get(parentId);
        if (!parent) return null;

        const childOrder = parent.data?.childOrder || parent.children || [];
        const index = childOrder.indexOf(blockId);

        if (index === -1 || index === childOrder.length - 1) {
            return null; // Последний или не найден
        }

        return childOrder[index + 1];
    }

    /**
     * Проверяет, является ли potentialDescendantId потомком blockId
     * @param {string} blockId - предполагаемый предок
     * @param {string} potentialDescendantId - проверяемый потомок
     * @returns {boolean}
     */
    _isDescendant(blockId, potentialDescendantId) {
        if (!this.localStateManager) return false;

        const visited = new Set();
        let current = this.localStateManager.blocks.get(potentialDescendantId);

        while (current && current.parent_id) {
            if (visited.has(current.id)) return false; // Цикл в дереве
            if (current.parent_id === blockId) return true;
            visited.add(current.id);
            current = this.localStateManager.blocks.get(current.parent_id);
        }

        return false;
    }
}

// Singleton instance
export const dragDropManager = new DragDropManager();
export default dragDropManager;

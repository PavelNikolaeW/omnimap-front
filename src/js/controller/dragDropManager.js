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
import { parseGridSize } from '../utils/gridUtils';
import { diagramEditor } from './diagramEditor';

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

        // Диаграмма-индикаторы при drop в диаграмму
        this.diagramDragIndicator = null;
        this.currentDiagramElement = null;

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
            this._removeDiagramIndicators();
            this.lastDropTarget = null;
            return;
        }

        // Проверяем можно ли drop
        if (dropTarget.type === 'child' && !this.canDropInto(targetElement)) {
            this._removeDropIndicator();
            this._removeDiagramIndicators();
            this.lastDropTarget = null;
            return;
        }

        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        // Если drop в диаграмму - показываем сетку и индикатор позиции
        if (dropTarget.dropToDiagram && dropTarget.diagramPosition) {
            const diagramElement = dropTarget.type === 'child'
                ? targetElement
                : targetElement.parentElement?.closest('[block]');

            if (diagramElement) {
                this._showDiagramGridOverlay(diagramElement, dropTarget.parentId);
                this._showDiagramDragIndicator(diagramElement, dropTarget.diagramPosition, dropTarget.parentId);
            }
            // Скрываем обычный индикатор для диаграмм
            this._removeDropIndicator();
        } else {
            // Обычный индикатор для дерева
            this._removeDiagramIndicators();
            this._showDropIndicator(targetElement, dropTarget);
        }

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
        this._removeDiagramIndicators();

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

        const { cols, rows } = parseGridSize(customGrid.grid);

        const rect = diagramElement.getBoundingClientRect();

        // Учитываем первую строку (контент) - она auto
        const contentRow = diagramElement.querySelector('.defaultContent');
        const contentHeight = contentRow ? contentRow.offsetHeight : 0;

        const relX = e.clientX - rect.left;
        const relY = e.clientY - rect.top - contentHeight;

        const cellWidth = rect.width / cols;
        const cellHeight = (rect.height - contentHeight) / rows;

        const col = Math.max(1, Math.min(cols, Math.floor(relX / cellWidth) + 1));
        const row = Math.max(2, Math.min(rows + 2, Math.floor(relY / cellHeight) + 2));

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

    /**
     * Показывает сетку диаграммы при перетаскивании (использует DiagramEditor)
     * @param {HTMLElement} diagramElement - элемент диаграммы
     * @param {string} diagramId - ID диаграммы
     */
    _showDiagramGridOverlay(diagramElement, diagramId) {
        // Если уже показана для этой диаграммы - пропускаем
        if (this.currentDiagramElement === diagramElement && diagramEditor.gridOverlay) {
            return;
        }

        // Удаляем старую сетку если была
        this._removeDiagramGridOverlay();

        if (!this.localStateManager) return;

        const diagramData = this.localStateManager.blocks.get(diagramId);
        const customGrid = diagramData?.data?.customGrid;
        if (!customGrid?.grid) return;

        // Используем DiagramEditor для показа сетки
        diagramEditor.showGridForExternalDrag(diagramElement, customGrid);
        this.currentDiagramElement = diagramElement;
    }

    /**
     * Удаляет сетку диаграммы
     */
    _removeDiagramGridOverlay() {
        diagramEditor.hideGridForExternalDrag();
    }

    /**
     * Показывает индикатор позиции блока в диаграмме
     * @param {HTMLElement} diagramElement - элемент диаграммы
     * @param {Object} position - позиция {col, row, cols, rows}
     * @param {string} diagramId - ID диаграммы
     */
    _showDiagramDragIndicator(diagramElement, position, diagramId) {
        // Удаляем старый индикатор
        this._removeDiagramDragIndicator();

        if (!position || !position.col || !position.row) return;

        const rect = diagramElement.getBoundingClientRect();

        // Получаем контент высоту (первая строка auto)
        const contentRow = diagramElement.querySelector('.defaultContent');
        const contentHeight = contentRow ? contentRow.offsetHeight : 0;

        const cols = position.cols || 3;
        const rows = position.rows || 3;

        const cellWidth = rect.width / cols;
        const cellHeight = (rect.height - contentHeight) / rows;

        // Получаем минимальный размер блока из диаграммы
        const { width: blockWidth, height: blockHeight } = this._getMinBlockSizeInDiagram(diagramId);

        // Позиция блока (1-based индексация, строка 2 - первая после контента)
        const left = (position.col - 1) * cellWidth;
        const top = contentHeight + (position.row - 2) * cellHeight;

        this.diagramDragIndicator = document.createElement('div');
        this.diagramDragIndicator.className = 'diagram-drop-indicator';
        this.diagramDragIndicator.style.cssText = `
            position: absolute;
            width: ${cellWidth * blockWidth}px;
            height: ${cellHeight * blockHeight}px;
            left: ${left}px;
            top: ${top}px;
            border: 2px dashed #4f46e5;
            background: rgba(99, 102, 241, 0.2);
            border-radius: 4px;
            pointer-events: none;
            z-index: 60;
            transition: left 0.1s ease-out, top 0.1s ease-out;
        `;

        diagramElement.appendChild(this.diagramDragIndicator);
    }

    /**
     * Получает минимальный размер блока среди существующих в диаграмме
     * @param {string} diagramId - ID диаграммы
     * @returns {Object} - {width, height}
     */
    _getMinBlockSizeInDiagram(diagramId) {
        if (!this.localStateManager) return { width: 1, height: 1 };

        const diagramData = this.localStateManager.blocks.get(diagramId);
        const customGrid = diagramData?.data?.customGrid;

        if (!customGrid?.childrenPositions) return { width: 1, height: 1 };

        let minWidth = 1;
        let minHeight = 1;
        let hasBlocks = false;

        for (const [, position] of Object.entries(customGrid.childrenPositions)) {
            if (!position || !Array.isArray(position)) continue;

            const colStr = position.find(p => p?.startsWith('grid-column_'));
            const rowStr = position.find(p => p?.startsWith('grid-row_'));

            if (!colStr || !rowStr) continue;

            const colMatch = colStr.match(/_(\d+)(?:__(\d+))?/);
            const rowMatch = rowStr.match(/_(\d+)(?:__(\d+))?/);

            if (!colMatch || !rowMatch) continue;

            const colStart = parseInt(colMatch[1], 10);
            const colEnd = colMatch[2] ? parseInt(colMatch[2], 10) : colStart + 1;
            const rowStart = parseInt(rowMatch[1], 10);
            const rowEnd = rowMatch[2] ? parseInt(rowMatch[2], 10) : rowStart + 1;

            const width = colEnd - colStart;
            const height = rowEnd - rowStart;

            if (!hasBlocks) {
                minWidth = width;
                minHeight = height;
                hasBlocks = true;
            } else {
                if (width < minWidth) minWidth = width;
                if (height < minHeight) minHeight = height;
            }
        }

        return { width: minWidth, height: minHeight };
    }

    /**
     * Удаляет индикатор позиции блока
     */
    _removeDiagramDragIndicator() {
        if (this.diagramDragIndicator) {
            this.diagramDragIndicator.remove();
            this.diagramDragIndicator = null;
        }
        // Также удаляем по классу
        document.querySelectorAll('.diagram-drop-indicator').forEach(el => el.remove());
    }

    /**
     * Удаляет все диаграмма-индикаторы
     */
    _removeDiagramIndicators() {
        this._removeDiagramGridOverlay();
        this._removeDiagramDragIndicator();
        this.currentDiagramElement = null;
    }
}

// Singleton instance
export const dragDropManager = new DragDropManager();
export default dragDropManager;

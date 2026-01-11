/**
 * DragDropManager - управление drag-and-drop для перемещения блоков в дереве
 *
 * Использует HTML5 Drag and Drop API.
 * Исключает блоки внутри customGrid (диаграммы) и layoutCells (календарь, kanban и т.д.)
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
     * Исключает блоки внутри diagram (customGrid) и layoutCells
     * @param {HTMLElement} element - DOM элемент блока
     * @returns {boolean}
     */
    canDrag(element) {
        if (!element || !element.hasAttribute('block')) return false;

        // Проверяем по DOM атрибуту (быстрый путь)
        const parentBlock = element.parentElement?.closest('[block]');
        if (parentBlock?.hasAttribute('blockcustomgrid')) {
            return false;
        }

        // Проверяем через данные блока
        if (this.localStateManager && parentBlock) {
            const parentId = this._extractBlockId(parentBlock);
            const parentData = this.localStateManager.blocks.get(parentId);

            // Diagram
            if (parentData?.data?.customGrid?.grid) {
                return false;
            }

            // LayoutCells (календарь, kanban и т.д.)
            if (parentData?.data?.layout === 'cells' && parentData?.data?.layoutCells) {
                return false;
            }
        }

        return true;
    }

    /**
     * Проверяет, можно ли сделать drop в указанный блок
     * @param {HTMLElement} targetElement - DOM элемент целевого блока
     * @returns {boolean}
     */
    canDropInto(targetElement) {
        if (!targetElement || !targetElement.hasAttribute('block')) return false;

        // Нельзя drop в себя
        if (this._extractBlockId(targetElement) === this.draggedBlockId) {
            return false;
        }

        // Проверяем diagram/layoutCells у целевого блока
        if (targetElement.hasAttribute('blockcustomgrid')) {
            return false;
        }

        if (this.localStateManager) {
            const targetId = this._extractBlockId(targetElement);
            const targetData = this.localStateManager.blocks.get(targetId);

            if (targetData?.data?.customGrid?.grid) {
                return false;
            }

            if (targetData?.data?.layout === 'cells' && targetData?.data?.layoutCells) {
                return false;
            }

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
        console.log('🎯 startDrag called', { element: element?.id, canDrag: this.canDrag(element) });

        if (!this.canDrag(element)) {
            console.log('❌ canDrag returned false');
            e.preventDefault();
            return false;
        }

        this.isDragging = true;
        console.log('✅ isDragging set to true');
        this.draggedBlockId = this._extractBlockId(element);
        this.draggedElement = element;

        // Находим родителя
        const parentElement = element.parentElement?.closest('[block]');
        this.dragSourceParentId = parentElement ? this._extractBlockId(parentElement) : null;

        // Настраиваем dataTransfer
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.draggedBlockId);

        // Визуальный feedback - используем специальный класс для drag
        element.classList.add('block-dragging');

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

        const { parentId, beforeBlockId } = this.lastDropTarget;

        // Не перемещаем если ничего не изменилось
        if (parentId === this.dragSourceParentId && !beforeBlockId) {
            this.cleanup();
            return;
        }

        // Dispatch событие MoveBlock
        dispatch('MoveBlock', {
            block_id: this.draggedBlockId,
            old_parent_id: this.dragSourceParentId,
            new_parent_id: parentId,
            before: beforeBlockId
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
    }

    /**
     * Вычисляет куда будет сделан drop
     * @param {DragEvent} e - событие
     * @param {HTMLElement} targetElement - целевой блок
     * @returns {Object|null} { parentId, beforeBlockId, type: 'sibling-before'|'sibling-after'|'child' }
     */
    _calculateDropTarget(e, targetElement) {
        if (!targetElement || !targetElement.hasAttribute('block')) return null;

        const targetId = this._extractBlockId(targetElement);

        // Нельзя drop на себя
        if (targetId === this.draggedBlockId) return null;

        const rect = targetElement.getBoundingClientRect();
        const relativeY = (e.clientY - rect.top) / rect.height;

        // Определяем тип drop зоны
        if (relativeY < this.DROP_ZONE_THRESHOLD) {
            // Верхняя часть - вставить ДО этого блока (как sibling)
            const parentElement = targetElement.parentElement?.closest('[block]');
            if (!parentElement) return null;

            return {
                parentId: this._extractBlockId(parentElement),
                beforeBlockId: targetId,
                type: 'sibling-before'
            };
        } else if (relativeY > (1 - this.DROP_ZONE_THRESHOLD)) {
            // Нижняя часть - вставить ПОСЛЕ этого блока (как sibling)
            const parentElement = targetElement.parentElement?.closest('[block]');
            if (!parentElement) return null;

            // Находим следующий sibling
            const parentId = this._extractBlockId(parentElement);
            const nextSiblingId = this._getNextSiblingId(targetId, parentId);

            return {
                parentId: parentId,
                beforeBlockId: nextSiblingId, // null если последний - добавится в конец
                type: 'sibling-after'
            };
        } else {
            // Центр - вставить ВНУТРЬ как child
            if (!this.canDropInto(targetElement)) return null;

            return {
                parentId: targetId,
                beforeBlockId: null, // В конец списка детей
                type: 'child'
            };
        }
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
                left: ${rect.left}px;
                top: ${rect.top - 2}px;
                width: ${rect.width}px;
                height: 4px;
                background: #3b82f6;
                border-radius: 2px;
                pointer-events: none;
                z-index: 10000;
            `;
        } else if (dropTarget.type === 'sibling-after') {
            // Горизонтальная линия снизу блока
            indicator.style.cssText = `
                position: fixed;
                left: ${rect.left}px;
                top: ${rect.bottom - 2}px;
                width: ${rect.width}px;
                height: 4px;
                background: #3b82f6;
                border-radius: 2px;
                pointer-events: none;
                z-index: 10000;
            `;
        } else if (dropTarget.type === 'child') {
            // Подсветка всего блока (как контейнера)
            indicator.style.cssText = `
                position: fixed;
                left: ${rect.left}px;
                top: ${rect.top}px;
                width: ${rect.width}px;
                height: ${rect.height}px;
                background: rgba(59, 130, 246, 0.1);
                border: 2px dashed #3b82f6;
                border-radius: 4px;
                pointer-events: none;
                z-index: 9999;
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

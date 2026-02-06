/**
 * TreeNavigation - компонент навигации по деревьям
 * Отображает кнопки для переключения между корневыми блоками
 */
import { truncate, normalizeParentId } from '../utils/functions';
import { dispatch } from '../utils/utils';
import { treeService } from '../services/treeService';
import { customPrompt } from '../utils/custom-dialog';

const TOUCH_TAP_THRESHOLD_PX = 10;
const TOUCH_CLICK_DEDUP_MS = 450;

export class TreeNavigation {
    constructor() {
        this.element = document.getElementById('tree-navigation');
        this.currentTree = null;

        // Drag and drop state
        this.isDragging = false;
        this.draggedButton = null;
        this.draggedTreeId = null;
        this.dropIndicator = null;
        this._touchStartPoint = null;
        this._touchMoved = false;
        this._lastTouchTapAt = 0;

        // Bound handlers for proper cleanup
        this._handleShowedBlocks = this._handleShowedBlocks.bind(this);
        this._handleTreeClick = this._handleTreeClick.bind(this);
        this._handleWebSocketUpdate = this._handleWebSocketUpdate.bind(this);
        this._handleUpdateNavigation = this._handleUpdateNavigation.bind(this);
        this._handleDragStart = this._handleDragStart.bind(this);
        this._handleDragOver = this._handleDragOver.bind(this);
        this._handleDragLeave = this._handleDragLeave.bind(this);
        this._handleDragEnd = this._handleDragEnd.bind(this);
        this._handleDrop = this._handleDrop.bind(this);
        this._handleTouchStart = this._handleTouchStart.bind(this);
        this._handleTouchMove = this._handleTouchMove.bind(this);
        this._handleTouchEnd = this._handleTouchEnd.bind(this);

        this._init();
    }

    /**
     * Инициализация компонента
     */
    _init() {
        // Event listeners
        window.addEventListener('ShowedBlocks', this._handleShowedBlocks);
        window.addEventListener('WebSocUpdateBlock', this._handleWebSocketUpdate);
        window.addEventListener('UpdateTreeNavigation', this._handleUpdateNavigation);
        window.addEventListener('Login', this._handleUpdateNavigation);

        // Click handler on container (event delegation)
        this.element.addEventListener('click', this._handleTreeClick);
        // Mobile fallback: click может не сработать в scrollable контейнере
        this.element.addEventListener('touchstart', this._handleTouchStart, { passive: true });
        this.element.addEventListener('touchmove', this._handleTouchMove, { passive: true });
        this.element.addEventListener('touchend', this._handleTouchEnd, { passive: true });

        // Drag and drop handlers
        this.element.addEventListener('dragstart', this._handleDragStart);
        this.element.addEventListener('dragover', this._handleDragOver);
        this.element.addEventListener('dragleave', this._handleDragLeave);
        this.element.addEventListener('dragend', this._handleDragEnd);
        this.element.addEventListener('drop', this._handleDrop);
    }

    /**
     * Очистка event listeners (для тестов)
     */
    destroy() {
        window.removeEventListener('ShowedBlocks', this._handleShowedBlocks);
        window.removeEventListener('WebSocUpdateBlock', this._handleWebSocketUpdate);
        window.removeEventListener('UpdateTreeNavigation', this._handleUpdateNavigation);
        window.removeEventListener('Login', this._handleUpdateNavigation);
        this.element.removeEventListener('click', this._handleTreeClick);
        this.element.removeEventListener('touchstart', this._handleTouchStart);
        this.element.removeEventListener('touchmove', this._handleTouchMove);
        this.element.removeEventListener('touchend', this._handleTouchEnd);

        // Drag and drop handlers
        this.element.removeEventListener('dragstart', this._handleDragStart);
        this.element.removeEventListener('dragover', this._handleDragOver);
        this.element.removeEventListener('dragleave', this._handleDragLeave);
        this.element.removeEventListener('dragend', this._handleDragEnd);
        this.element.removeEventListener('drop', this._handleDrop);

        this._cleanupDrag();
    }

    /**
     * Обработчик события ShowedBlocks
     */
    async _handleShowedBlocks() {
        await this.render();
    }

    /**
     * Обработчик обновления навигации
     */
    async _handleUpdateNavigation() {
        await treeService.refresh();
        await this.render();
    }

    /**
     * Обработчик WebSocket обновлений
     * Перерисовывает, если изменились корневые блоки
     */
    async _handleWebSocketUpdate(event) {
        const updates = event.detail;
        if (!updates?.length) return;

        // Проверяем, есть ли среди обновлений корневые блоки (без parent_id)
        const hasTreeUpdate = updates.some(block => !normalizeParentId(block.parent_id));
        if (hasTreeUpdate) {
            await treeService.refresh();
            await this.render();
        }
    }

    /**
     * Обработчик кликов (event delegation)
     */
    async _handleTreeClick(event) {
        // Предотвращаем двойной запуск после touchend -> click
        if (event.type === 'click' && Date.now() - this._lastTouchTapAt < TOUCH_CLICK_DEDUP_MS) {
            return;
        }

        const target = event.target;
        if (!(target instanceof Element)) return;

        const button = target.closest('button');
        if (!button) return;

        // Клик на кнопку дерева
        if (button.classList.contains('tree-button')) {
            const treeId = button.dataset.treeId;
            if (treeId && treeId !== this.currentTree) {
                await treeService.switchTree(treeId);
            }
            return;
        }

        // Клик на кнопку создания дерева
        if (button.classList.contains('tree-add-button')) {
            event.stopPropagation();
            const title = await customPrompt('Введите название');
            if (title) {
                dispatch('CreateTree', { title });
            }
        }
    }

    _handleTouchStart(event) {
        const touch = event.touches?.[0];
        if (!touch) {
            this._touchStartPoint = null;
            this._touchMoved = false;
            return;
        }

        this._touchStartPoint = { x: touch.clientX, y: touch.clientY };
        this._touchMoved = false;
    }

    _handleTouchMove(event) {
        if (!this._touchStartPoint) return;
        const touch = event.touches?.[0];
        if (!touch) return;

        const deltaX = Math.abs(touch.clientX - this._touchStartPoint.x);
        const deltaY = Math.abs(touch.clientY - this._touchStartPoint.y);
        if (deltaX > TOUCH_TAP_THRESHOLD_PX || deltaY > TOUCH_TAP_THRESHOLD_PX) {
            this._touchMoved = true;
        }
    }

    async _handleTouchEnd(event) {
        if (!this._touchStartPoint) return;

        const moved = this._touchMoved;
        this._touchStartPoint = null;
        this._touchMoved = false;

        if (moved) return;

        this._lastTouchTapAt = Date.now();
        await this._handleTreeClick(event);
    }

    /**
     * Рендеринг навигации
     */
    async render() {
        await treeService.refresh();

        this.currentTree = treeService.currentTree;
        const treeBlocks = await treeService.loadTreeBlocks();

        // Очищаем контейнер
        this.element.textContent = '';

        // Рендерим кнопки деревьев
        treeBlocks.forEach(({ treeId, block }) => {
            const button = this._createTreeButton(treeId, block);
            this.element.appendChild(button);
        });

        // Кнопка добавления нового дерева
        this.element.appendChild(this._createAddButton());
    }

    /**
     * Создание кнопки дерева
     */
    _createTreeButton(treeId, block) {
        const button = document.createElement('button');
        button.className = 'tree-button';
        button.dataset.treeId = treeId;
        button.setAttribute('blockId', treeId);
        button.setAttribute('data-testid', `tree-button-${treeId}`);
        button.id = `treeBtn_${treeId}`;
        button.draggable = true;

        const title = block?.title || 'Без имени';
        button.textContent = truncate(title, 15);
        button.setAttribute('title', title);

        if (treeId === this.currentTree) {
            button.classList.add('selected');
        }

        return button;
    }

    /**
     * Создание кнопки добавления дерева
     */
    _createAddButton() {
        const button = document.createElement('button');
        button.className = 'tree-add-button';
        button.textContent = '+';
        button.setAttribute('title', 'Создать новое дерево');
        button.setAttribute('aria-label', 'Создать новое дерево');
        button.setAttribute('data-testid', 'tree-add-button');
        return button;
    }

    // ==================== Drag and Drop ====================

    /**
     * Обработчик начала перетаскивания
     */
    _handleDragStart(e) {
        const button = e.target.closest('.tree-button');
        if (!button) return;

        this.isDragging = true;
        this.draggedButton = button;
        this.draggedTreeId = button.dataset.treeId;

        button.classList.add('tree-button-dragging');

        // Установить данные для drag
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.draggedTreeId);
    }

    /**
     * Обработчик dragover - показывает индикатор drop позиции
     */
    _handleDragOver(e) {
        if (!this.isDragging) return;

        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const target = e.target.closest('.tree-button');
        if (!target || target === this.draggedButton) {
            this._removeDropIndicator();
            return;
        }

        // Определяем позицию вставки (до или после target)
        const rect = target.getBoundingClientRect();
        const midPoint = rect.left + rect.width / 2;
        const insertBefore = e.clientX < midPoint;

        this._showDropIndicator(target, insertBefore);
    }

    /**
     * Обработчик dragleave - очищает индикатор при выходе из контейнера
     */
    _handleDragLeave(e) {
        if (!this.isDragging) return;

        // Проверяем, что действительно покинули контейнер, а не перешли на дочерний элемент
        if (!this.element.contains(e.relatedTarget)) {
            this._removeDropIndicator();
        }
    }

    /**
     * Обработчик drop - выполняет перемещение
     */
    async _handleDrop(e) {
        if (!this.isDragging || !this.draggedTreeId) return;

        e.preventDefault();
        this._removeDropIndicator();

        const target = e.target.closest('.tree-button');
        if (!target || target === this.draggedButton) {
            this._cleanupDrag();
            return;
        }

        const targetTreeId = target.dataset.treeId;
        const treeIds = treeService.treeIds;
        const targetIndex = treeIds.indexOf(targetTreeId);

        if (targetIndex === -1) {
            this._cleanupDrag();
            return;
        }

        // Определяем позицию вставки
        const rect = target.getBoundingClientRect();
        const midPoint = rect.left + rect.width / 2;
        const insertBefore = e.clientX < midPoint;

        // Вычисляем новый индекс
        const currentIndex = treeIds.indexOf(this.draggedTreeId);
        let newIndex = insertBefore ? targetIndex : targetIndex + 1;

        // Корректируем индекс если перемещаем вправо
        if (currentIndex < newIndex) {
            newIndex--;
        }

        // Выполняем перемещение
        const result = await treeService.moveTree(this.draggedTreeId, newIndex);
        if (!result.success) {
            console.warn('Failed to move tree:', result.error?.message);
        }

        this._cleanupDrag();
    }

    /**
     * Обработчик окончания drag
     */
    _handleDragEnd() {
        this._cleanupDrag();
    }

    /**
     * Показать индикатор позиции drop
     */
    _showDropIndicator(target, insertBefore) {
        this._removeDropIndicator();

        const indicator = document.createElement('div');
        indicator.className = 'tree-drop-indicator';
        this.dropIndicator = indicator;

        const rect = target.getBoundingClientRect();
        const containerRect = this.element.getBoundingClientRect();

        // Позиционируем индикатор
        const left = insertBefore
            ? rect.left - containerRect.left - 2
            : rect.right - containerRect.left + 2;

        indicator.style.left = `${left}px`;
        indicator.style.top = `${rect.top - containerRect.top}px`;

        this.element.appendChild(indicator);
    }

    /**
     * Удалить индикатор позиции drop
     */
    _removeDropIndicator() {
        if (this.dropIndicator) {
            this.dropIndicator.remove();
            this.dropIndicator = null;
        }
    }

    /**
     * Очистка состояния drag
     */
    _cleanupDrag() {
        if (this.draggedButton) {
            this.draggedButton.classList.remove('tree-button-dragging');
        }

        this.isDragging = false;
        this.draggedButton = null;
        this.draggedTreeId = null;
        this._removeDropIndicator();
    }
}

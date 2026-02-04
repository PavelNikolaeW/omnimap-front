import { dispatch } from "../utils/utils";
import { parseGridSize } from "../utils/gridUtils";
import localforage from "localforage";

/**
 * DiagramEditor - интерактивный редактор диаграммы
 * Обеспечивает:
 * - Drag-and-drop перемещение блоков в грид-сетке
 * - Resize handles для изменения размера блоков
 * - Визуализацию грид-линий
 * - Настройку грид-сетки
 * - Drag-and-drop создание соединений через anchor points
 * - Shift+drag quick mode для быстрого перемещения без входа в режим редактирования
 */
export class DiagramEditor {
    constructor() {
        this.isActive = false;
        this.parentBlockId = null;
        this.parentElement = null;
        this.customGrid = null;

        // Drag state
        this.isDragging = false;
        this.draggedBlockId = null;
        this.dragStartCell = null;

        // Resize state
        this.isResizing = false;
        this.resizingBlockId = null;
        this.resizeDirection = null;
        this.resizeStartPos = null;

        // Grid overlay (CSS gradient - no DOM cells)
        // Note: Cell highlighting disabled for performance. Grid uses CSS gradients instead of DOM elements.
        this.gridOverlay = null;
        this.cachedGridSize = null;  // Кэш размера сетки

        // Connection drag state (для anchor points)
        this.isConnecting = false;
        this.connectionSourceId = null;
        this.connectionSourceAnchor = null;
        this.connectionLine = null;
        this.connectionType = 'default';  // Тип соединения
        this.justFinishedConnection = false;  // Флаг для предотвращения клика после соединения
        this.justFinishedDrag = false;  // Флаг для предотвращения клика после drag

        // Shift+drag quick mode state
        this.quickModeActive = false;
        this.quickModeBlockId = null;
        this.quickModeElement = null;

        // Performance optimization
        this.rafId = null;
        this.pendingMouseEvent = null;

        // Bind methods
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
        this.handleShowedBlocks = this.handleShowedBlocks.bind(this);
        this.handleGlobalMouseDown = this.handleGlobalMouseDown.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);

        // Слушаем событие ре-рендера для восстановления UI
        window.addEventListener('ShowedBlocks', this.handleShowedBlocks);

        // Глобальные слушатели для Shift+drag quick mode
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
        document.addEventListener('mousedown', this.handleGlobalMouseDown);
    }

    /**
     * Обработчик нажатия клавиш для Shift+drag quick mode
     */
    handleKeyDown(e) {
        if (e.key === 'Shift' && !this.isActive) {
            // Показать подсказку что можно перетаскивать блоки
            document.body.classList.add('shift-drag-ready');
        }
    }

    /**
     * Обработчик отпускания клавиш
     */
    handleKeyUp(e) {
        if (e.key === 'Shift') {
            document.body.classList.remove('shift-drag-ready');

            // Если был активен quick mode, деактивируем
            if (this.quickModeActive && !this.isDragging && !this.isResizing) {
                this.deactivateQuickMode();
            }
        }
    }

    /**
     * Глобальный обработчик mousedown для Shift+drag quick mode
     * НЕ перехватывает событие если блок draggable - даём HTML5 drag работать
     * для перемещения блоков между деревом и диаграммами
     */
    async handleGlobalMouseDown(e) {
        // Только если редактор не активен и зажат Shift
        if (this.isActive || !e.shiftKey) return;

        // Предотвратить повторную активацию если уже в процессе
        if (this.quickModeActivating) return;

        // Найти блок под курсором
        const blockEl = this.findBlockWithCustomGrid(e.target);
        if (!blockEl) return;

        // Если блок имеет draggable="true" - пропускаем для HTML5 drag-and-drop
        // (перемещение между деревом и диаграммами)
        if (blockEl.getAttribute('draggable') === 'true') {
            return;
        }

        // Найти родительский блок с customGrid
        const parentEl = blockEl.parentElement?.closest('[blockcustomgrid]');
        if (!parentEl) return;

        // Активировать quick mode и дождаться завершения
        this.quickModeActivating = true;
        try {
            const activated = await this.activateQuickMode(parentEl.id.split('*').pop(), parentEl);
            if (!activated) {
                this.quickModeActivating = false;
                return;
            }
        } catch (err) {
            console.warn('Failed to activate quick mode:', err);
            this.quickModeActivating = false;
            return;
        }
        this.quickModeActivating = false;

        // Проверить, нажали ли на resize handle (добавленный в quick mode)
        if (e.target.classList.contains('resize-handle')) {
            this.startResize(e, e.target.dataset.blockId, e.target.dataset.direction);
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // Начать drag
        this.startDrag(e, blockEl);
        e.preventDefault();
        e.stopPropagation();
    }

    /**
     * Найти блок с customGrid (дочерний блок диаграммы)
     */
    findBlockWithCustomGrid(target) {
        let el = target;
        while (el && el !== document.documentElement) {
            if ((el.hasAttribute('block') || el.hasAttribute('blocklink'))) {
                // Проверить, что родитель имеет customGrid
                const parent = el.parentElement?.closest('[blockcustomgrid]');
                if (parent) {
                    return el;
                }
            }
            el = el.parentElement;
        }
        return null;
    }

    /**
     * Активировать quick mode для быстрого перетаскивания
     * @returns {Promise<boolean>} - true если активация успешна
     */
    async activateQuickMode(blockId, blockElement) {
        if (this.quickModeActive) return false;

        this.quickModeActive = true;
        this.quickModeBlockId = blockId;
        this.quickModeElement = blockElement;

        // Загрузить customGrid
        const block = await this.getBlock(blockId);

        // Проверить что quick mode всё ещё активен после async операции
        // (пользователь мог отпустить Shift пока мы ждали)
        if (!this.quickModeActive) {
            return false;
        }

        if (!block?.data?.customGrid || !Object.keys(block.data.customGrid).length) {
            this.deactivateQuickMode();
            return false;
        }

        // Временно установить состояние как в activate()
        this.parentBlockId = blockId;
        this.parentElement = blockElement;
        this.customGrid = block.data.customGrid;
        this.isActive = true;

        // Добавить resize handles к дочерним блокам
        this.addResizeHandles();

        // Добавить класс для стилизации quick mode
        this.parentElement.classList.add('diagram-quick-mode');

        // Глобальные слушатели уже есть, добавляем mousemove и mouseup
        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);

        return true;
    }

    /**
     * Деактивировать quick mode
     */
    deactivateQuickMode() {
        if (!this.quickModeActive) return;

        this.quickModeActive = false;
        this.quickModeBlockId = null;

        // Удалить resize handles и anchor points
        this.removeResizeHandles();
        if (this.parentElement) {
            this.parentElement.querySelectorAll('.anchor-point').forEach(el => el.remove());
        }

        if (this.quickModeElement) {
            this.quickModeElement.classList.remove('diagram-quick-mode');
        }
        this.quickModeElement = null;

        // Очистить состояние соединения если активно
        if (this.isConnecting) {
            this.cleanupConnection();
        }

        // Убрать глобальные слушатели mousemove/mouseup (используем bound методы)
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);

        // Сбросить состояние
        this.isActive = false;
        this.parentBlockId = null;
        this.parentElement = null;
        this.customGrid = null;
        this.isDragging = false;
        this.isResizing = false;
        this.draggedBlockId = null;
        this.resizingBlockId = null;
    }

    /**
     * Обработчик события ShowedBlocks - восстанавливает UI после ре-рендера
     */
    async handleShowedBlocks() {
        if (!this.isActive || !this.parentBlockId) return;

        // Сохранить старый элемент для удаления слушателей
        const oldParentElement = this.parentElement;

        // Извлечь чистый blockId (без prefix родителя)
        const cleanBlockId = this.parentBlockId.includes('*')
            ? this.parentBlockId.split('*').pop()
            : this.parentBlockId;

        // Найти новый элемент родительского блока после ре-рендера
        // Сначала пробуем найти по сохранённому полному ID
        let newParentElement = document.getElementById(this.parentBlockId);

        // Если не найден - ищем по чистому ID
        if (!newParentElement) {
            newParentElement = document.getElementById(cleanBlockId);
        }

        // Если всё ещё не найден - ищем элемент, ID которого заканчивается на чистый blockId
        if (!newParentElement) {
            newParentElement = document.querySelector(`[id$="*${cleanBlockId}"]`);
        }

        if (!newParentElement) {
            // Блок больше не существует - деактивируем редактор
            this.deactivate();
            return;
        }

        // Обновляем parentBlockId на актуальный ID из DOM
        this.parentBlockId = newParentElement.id;

        // Удалить слушатели со старого элемента (если он еще существует)
        if (oldParentElement && oldParentElement !== newParentElement) {
            oldParentElement.removeEventListener('mousedown', this.handleMouseDown);
            oldParentElement.removeEventListener('touchstart', this.handleTouchStart);
        }

        // Обновить ссылку на элемент
        this.parentElement = newParentElement;

        // Обновить customGrid из хранилища
        const block = await this.getBlock(cleanBlockId);
        if (block?.data?.customGrid) {
            this.customGrid = block.data.customGrid;
        }

        // Восстановить визуальные элементы
        this.removeGridOverlay();
        this.createGridOverlay();
        this.addResizeHandles();

        // Восстановить класс режима редактирования
        this.parentElement.classList.add('diagram-edit-mode');

        // Подключить слушатели событий к новому элементу
        this.parentElement.addEventListener('mousedown', this.handleMouseDown);
        this.parentElement.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    }

    /**
     * Активировать режим редактирования диаграммы для блока
     * @param {string} blockId - ID блока
     * @param {HTMLElement} blockElement - DOM элемент блока
     * @param {Object} customGridData - опционально, customGrid для немедленной активации без чтения из localforage
     */
    async activate(blockId, blockElement, customGridData = null) {
        if (this.isActive) {
            this.deactivate();
        }

        this.parentBlockId = blockId;
        this.parentElement = blockElement;

        // Если customGrid передан напрямую, используем его, иначе читаем из localforage
        let customGrid = customGridData;
        if (!customGrid) {
            const block = await this.getBlock(blockId);
            if (!block?.data?.customGrid || !Object.keys(block.data.customGrid).length) {
                console.warn('Block has no customGrid, cannot activate diagram editor');
                return false;
            }
            customGrid = block.data.customGrid;
        }

        this.customGrid = customGrid;
        this.isActive = true;

        // Добавить визуальные элементы
        this.createGridOverlay();
        this.addResizeHandles();
        this.attachEventListeners();

        // Добавить класс для стилизации
        this.parentElement.classList.add('diagram-edit-mode');

        return true;
    }

    /**
     * Деактивировать режим редактирования
     */
    deactivate() {
        if (!this.isActive) return;

        this.removeGridOverlay();
        this.removeResizeHandles();
        this.detachEventListeners();

        if (this.parentElement) {
            this.parentElement.classList.remove('diagram-edit-mode');
        }

        // Очистить выделение блока
        if (this.selectedBlock) {
            this.selectedBlock.classList.remove('diagram-block-selected');
            this.selectedBlock = null;
        }

        this.isActive = false;
        this.parentBlockId = null;
        this.parentElement = null;
        this.customGrid = null;
    }

    /**
     * Получить блок из localforage
     * @param {string} id - ID блока (может быть полным вида "parentId*blockId" или чистым)
     */
    async getBlock(id) {
        // Извлекаем чистый blockId если передан полный ID
        const cleanId = id.includes('*') ? id.split('*').pop() : id;
        const user = await localforage.getItem('currentUser');
        return await localforage.getItem(`Block_${cleanId}_${user}`);
    }

    /**
     * Парсинг грид-классов для получения размеров сетки
     */
    parseGridSize() {
        return parseGridSize(this.customGrid?.grid);
    }

    /**
     * Парсинг позиции блока из customGrid.childrenPositions
     */
    parseBlockPosition(blockId) {
        const positions = this.customGrid?.childrenPositions?.[blockId];
        if (!positions) return null;

        const parseRange = (str) => {
            const match = str.match(/_(\d+)(?:__(\d+))?/);
            if (!match) return [1, 2];
            const start = parseInt(match[1], 10);
            const end = match[2] ? parseInt(match[2], 10) : start + 1;
            return [start, end];
        };

        const colStr = positions.find(p => p.startsWith('grid-column_'));
        const rowStr = positions.find(p => p.startsWith('grid-row_'));

        const [colStart, colEnd] = colStr ? parseRange(colStr) : [1, 2];
        const [rowStart, rowEnd] = rowStr ? parseRange(rowStr) : [2, 3];

        return { colStart, colEnd, rowStart, rowEnd };
    }

    /**
     * Создать оверлей с грид-линиями (CSS gradient - 0 DOM элементов)
     * Адаптивное количество линий: целевой размер ячейки ~60px
     */
    createGridOverlay() {
        if (this.gridOverlay) return;

        const { cols, rows } = this.parseGridSize();

        // Кэшируем размер сетки для getCellFromPoint()
        this.cachedGridSize = { cols, rows };

        const rect = this.parentElement?.getBoundingClientRect();

        // Целевой размер ячейки для комфортного восприятия
        const TARGET_CELL_SIZE = 60;
        const MIN_LINES = 3;
        const MAX_LINES = 12;

        // Вычисляем оптимальное количество линий на основе размера блока
        let visibleCols = cols;
        let visibleRows = rows;

        if (rect) {
            visibleCols = Math.min(MAX_LINES, Math.max(MIN_LINES, Math.floor(rect.width / TARGET_CELL_SIZE)));
            visibleRows = Math.min(MAX_LINES, Math.max(MIN_LINES, Math.floor(rect.height / TARGET_CELL_SIZE)));
        }

        const lineColor = 'rgba(100, 100, 200, 0.25)';

        this.gridOverlay = document.createElement('div');
        this.gridOverlay.className = 'diagram-grid-overlay';
        this.gridOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            pointer-events: none;
            z-index: 10;
            background-image:
                linear-gradient(to right, ${lineColor} 1px, transparent 1px),
                linear-gradient(to bottom, ${lineColor} 1px, transparent 1px);
            background-size:
                calc(100% / ${visibleCols}) 100%,
                100% calc(100% / ${visibleRows});
            background-position: 0 0;
        `;

        this.parentElement.style.position = 'relative';
        this.parentElement.appendChild(this.gridOverlay);
    }

    /**
     * Удалить грид-оверлей
     */
    removeGridOverlay() {
        if (this.gridOverlay) {
            this.gridOverlay.remove();
            this.gridOverlay = null;
        }
        this.cachedGridSize = null;
    }

    /**
     * Показать сетку для внешнего drag-and-drop (без активации редактора)
     * @param {HTMLElement} element - элемент диаграммы
     * @param {Object} customGrid - customGrid диаграммы
     */
    showGridForExternalDrag(element, customGrid) {
        if (!element || !customGrid?.grid) return;

        // Сохраняем текущие значения
        const prevParent = this.parentElement;
        const prevGrid = this.customGrid;

        // Временно устанавливаем для createGridOverlay
        this.parentElement = element;
        this.customGrid = customGrid;

        // Удаляем старую сетку если есть
        this.removeGridOverlay();

        // Создаём сетку
        this.createGridOverlay();

        // Восстанавливаем (но оставляем сетку видимой)
        this.parentElement = prevParent;
        this.customGrid = prevGrid;
    }

    /**
     * Скрыть сетку после внешнего drag-and-drop
     */
    hideGridForExternalDrag() {
        this.removeGridOverlay();
    }

    /**
     * Добавить resize handles к дочерним блокам
     */
    addResizeHandles() {
        if (!this.parentElement) return;

        const children = this.parentElement.querySelectorAll(':scope > [block], :scope > [blocklink]');
        children.forEach(child => {
            this.addResizeHandlesToElement(child);
        });
    }

    /**
     * Добавить resize handles к конкретному элементу
     * В режиме диаграммы - только resize handles, без anchor points
     */
    addResizeHandlesToElement(element) {
        // Удалить старые handles если есть
        element.querySelectorAll('.resize-handle').forEach(h => h.remove());
        element.querySelectorAll('.anchor-point').forEach(a => a.remove());

        const directions = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

        directions.forEach(dir => {
            const handle = document.createElement('div');
            handle.className = `resize-handle resize-handle-${dir}`;
            handle.dataset.direction = dir;
            handle.dataset.blockId = element.id;
            element.appendChild(handle);
        });

        // Anchor points НЕ добавляем - они теперь показываются при hover в режиме connect
        // через ConnectionAnchorManager

        // Добавить класс для позиционирования
        element.classList.add('diagram-resizable');
    }

    /**
     * Добавить anchor points для соединений к элементу
     * 12 точек: по 3 на каждой стороне
     */
    addAnchorPointsToElement(element) {
        const anchors = [
            // Верхняя сторона
            'top-left', 'top-center', 'top-right',
            // Правая сторона
            'right-top', 'right-center', 'right-bottom',
            // Нижняя сторона
            'bottom-right', 'bottom-center', 'bottom-left',
            // Левая сторона
            'left-bottom', 'left-center', 'left-top'
        ];

        anchors.forEach(position => {
            const anchor = document.createElement('div');
            anchor.className = `anchor-point anchor-point-${position}`;
            anchor.dataset.position = position;
            anchor.dataset.blockId = element.id;
            anchor.title = 'Кликните или перетащите для создания соединения';
            element.appendChild(anchor);
        });
    }

    /**
     * Удалить resize handles
     */
    removeResizeHandles() {
        if (!this.parentElement) return;

        this.parentElement.querySelectorAll('.resize-handle').forEach(h => h.remove());
        this.parentElement.querySelectorAll('.diagram-resizable').forEach(el => {
            el.classList.remove('diagram-resizable');
        });
    }

    /**
     * Прикрепить обработчики событий
     */
    attachEventListeners() {
        if (!this.parentElement) return;

        this.parentElement.addEventListener('mousedown', this.handleMouseDown);
        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);

        // Touch events
        this.parentElement.addEventListener('touchstart', this.handleTouchStart, { passive: false });
        document.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd);
    }

    /**
     * Отсоединить обработчики событий
     */
    detachEventListeners() {
        if (!this.parentElement) return;

        this.parentElement.removeEventListener('mousedown', this.handleMouseDown);
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);

        this.parentElement.removeEventListener('touchstart', this.handleTouchStart);
        document.removeEventListener('touchmove', this.handleTouchMove);
        document.removeEventListener('touchend', this.handleTouchEnd);
    }

    /**
     * Обработчик mousedown
     */
    handleMouseDown(e) {
        // При зажатом Shift - пропускаем для HTML5 drag-and-drop (перемещение между деревом и диаграммой)
        if (e.shiftKey) {
            return;
        }

        // Проверить, нажали ли на anchor point для создания соединения
        if (e.target.classList.contains('anchor-point')) {
            this.startConnection(e, e.target.dataset.blockId, e.target.dataset.position);
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // Проверить, нажали ли на resize handle
        if (e.target.classList.contains('resize-handle')) {
            this.startResize(e, e.target.dataset.blockId, e.target.dataset.direction);
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // Проверить, нажали ли на блок
        const blockEl = this.findBlockElement(e.target);
        if (blockEl && blockEl.parentElement === this.parentElement) {
            // Сохранить данные для потенциального drag или click
            this.potentialDragBlock = blockEl;
            this.potentialDragStartPos = { x: e.clientX, y: e.clientY };
            this.potentialDragStartTime = Date.now();
            e.preventDefault();
            e.stopPropagation();
        }
    }

    /**
     * Обработчик mousemove с requestAnimationFrame для оптимизации
     */
    handleMouseMove(e) {
        // Проверить, нужно ли начать drag (если есть потенциальный drag блок)
        if (this.potentialDragBlock && !this.isDragging) {
            const dx = e.clientX - this.potentialDragStartPos.x;
            const dy = e.clientY - this.potentialDragStartPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Начать drag только если смещение больше 5 пикселей
            if (distance > 5) {
                this.startDrag({
                    clientX: this.potentialDragStartPos.x,
                    clientY: this.potentialDragStartPos.y
                }, this.potentialDragBlock);
                this.potentialDragBlock = null;
                this.potentialDragStartPos = null;
                this.potentialDragStartTime = null;
            }
        }

        if (!this.isDragging && !this.isResizing && !this.isConnecting) return;

        // Сохраняем последнее событие
        this.pendingMouseEvent = e;

        // Если уже запланирован RAF, пропускаем
        if (this.rafId) return;

        this.rafId = requestAnimationFrame(() => {
            this.rafId = null;
            const event = this.pendingMouseEvent;
            if (!event) return;

            if (this.isDragging) {
                this.updateDrag(event);
            } else if (this.isResizing) {
                this.updateResize(event);
            } else if (this.isConnecting) {
                this.updateConnection(event);
            }
        });
    }

    /**
     * Обработчик mouseup
     */
    handleMouseUp(e) {
        // Если был потенциальный drag, но drag не начался - это клик (выбор блока)
        if (this.potentialDragBlock && !this.isDragging) {
            this.selectBlock(this.potentialDragBlock);
            this.potentialDragBlock = null;
            this.potentialDragStartPos = null;
            this.potentialDragStartTime = null;
            return;
        }

        if (this.isDragging) {
            this.endDrag(e);
        } else if (this.isResizing) {
            this.endResize(e);
        } else if (this.isConnecting) {
            this.endConnection(e);
        }
    }

    /**
     * Выбрать блок (для применения стилей, соединений и т.д.)
     */
    selectBlock(blockElement) {
        // Снять выделение с предыдущего блока
        if (this.selectedBlock && this.selectedBlock !== blockElement) {
            this.selectedBlock.classList.remove('diagram-block-selected');
        }

        // Выбрать новый блок
        this.selectedBlock = blockElement;
        blockElement.classList.add('diagram-block-selected');

        // Обновить контекст для команд
        const blockId = blockElement.id;
        const cleanBlockId = blockId.includes('*') ? blockId.split('*').pop() : blockId;

        // Dispatch событие для обновления контекста
        window.dispatchEvent(new CustomEvent('DiagramBlockSelected', {
            detail: { blockId: cleanBlockId, element: blockElement, fullId: blockId }
        }));
    }

    /**
     * Touch event handlers
     */
    handleTouchStart(e) {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY, target: touch.target };
        this.handleMouseDown(fakeEvent);
        if (this.isDragging || this.isResizing) {
            e.preventDefault();
        }
    }

    handleTouchMove(e) {
        if (!this.isDragging && !this.isResizing) return;
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY };
        this.handleMouseMove(fakeEvent);
        e.preventDefault();
    }

    handleTouchEnd(e) {
        const fakeEvent = {};
        this.handleMouseUp(fakeEvent);
    }

    /**
     * Найти родительский элемент блока
     */
    findBlockElement(target) {
        let el = target;
        while (el && el !== this.parentElement) {
            if (el.hasAttribute('block') || el.hasAttribute('blocklink')) {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    }

    /**
     * Получить ячейку грида по координатам мыши
     */
    getCellFromPoint(clientX, clientY) {
        const rect = this.parentElement.getBoundingClientRect();
        const { cols, rows } = this.parseGridSize();

        // Учитываем первую строку (контент) - она auto
        const contentRow = this.parentElement.querySelector('.defaultContent');
        const contentHeight = contentRow ? contentRow.offsetHeight : 0;

        const relX = clientX - rect.left;
        const relY = clientY - rect.top - contentHeight;

        const cellWidth = rect.width / cols;
        const cellHeight = (rect.height - contentHeight) / rows;

        const col = Math.max(1, Math.min(cols, Math.floor(relX / cellWidth) + 1));
        const row = Math.max(2, Math.min(rows + 1, Math.floor(relY / cellHeight) + 2));

        return { col, row };
    }

    /**
     * Начать drag блока
     */
    startDrag(e, blockElement) {
        this.isDragging = true;
        this.draggedBlockId = blockElement.id;

        // Сохранить размеры и позицию блока
        const cleanBlockId = blockElement.id.includes('*') ? blockElement.id.split('*').pop() : blockElement.id;
        const pos = this.parseBlockPosition(cleanBlockId);
        if (pos) {
            this.dragBlockSize = {
                cols: pos.colEnd - pos.colStart,
                rows: pos.rowEnd - pos.rowStart
            };
            // Сохранить начальную позицию блока в grid
            this.dragStartBlockPos = {
                colStart: pos.colStart,
                rowStart: pos.rowStart
            };
        } else {
            this.dragBlockSize = { cols: 1, rows: 1 };
            this.dragStartBlockPos = { colStart: 1, rowStart: 2 };
        }

        // Сохранить начальную позицию курсора
        this.dragStartCell = this.getCellFromPoint(e.clientX, e.clientY);

        // Создать легковесный индикатор drag (один элемент вместо множества ячеек)
        this.createDragIndicator(blockElement);

        blockElement.classList.add('diagram-dragging');
    }

    /**
     * Создать индикатор перетаскивания
     */
    createDragIndicator(blockElement) {
        // Удалить старый если есть
        this.removeDragIndicator();

        const rect = blockElement.getBoundingClientRect();
        const parentRect = this.parentElement.getBoundingClientRect();

        this.dragIndicator = document.createElement('div');
        this.dragIndicator.className = 'diagram-drag-indicator';
        this.dragIndicator.style.cssText = `
            position: absolute;
            width: ${rect.width}px;
            height: ${rect.height}px;
            left: ${rect.left - parentRect.left}px;
            top: ${rect.top - parentRect.top}px;
            border: 2px dashed #4f46e5;
            background: rgba(99, 102, 241, 0.15);
            border-radius: 4px;
            pointer-events: none;
            z-index: 100;
            transition: left 0.1s ease-out, top 0.1s ease-out;
        `;
        this.parentElement.appendChild(this.dragIndicator);

        // Кэшировать размеры ячеек для быстрого позиционирования
        this.cachedCellSize = this.calculateCellSize();
    }

    /**
     * Вычислить размер ячейки grid
     */
    calculateCellSize() {
        if (!this.parentElement) return { width: 100, height: 100, contentHeight: 0 };

        const rect = this.parentElement.getBoundingClientRect();
        const { cols, rows } = this.cachedGridSize || this.parseGridSize();
        const contentRow = this.parentElement.querySelector('.defaultContent');
        const contentHeight = contentRow ? contentRow.offsetHeight : 0;

        return {
            width: rect.width / cols,
            height: (rect.height - contentHeight) / rows,
            contentHeight
        };
    }

    /**
     * Удалить индикатор перетаскивания
     */
    removeDragIndicator() {
        if (this.dragIndicator) {
            this.dragIndicator.remove();
            this.dragIndicator = null;
        }
        this.cachedCellSize = null;
    }

    /**
     * Обновить drag
     */
    updateDrag(e) {
        // Вычислить смещение курсора от начальной позиции
        const currentCell = this.getCellFromPoint(e.clientX, e.clientY);
        const deltaCol = currentCell.col - this.dragStartCell.col;
        const deltaRow = currentCell.row - this.dragStartCell.row;

        // Обновить позицию индикатора
        const newColStart = this.dragStartBlockPos.colStart + deltaCol;
        const newRowStart = this.dragStartBlockPos.rowStart + deltaRow;
        this.updateDragIndicator(newColStart, newRowStart);
    }

    /**
     * Обновить позицию индикатора перетаскивания
     */
    updateDragIndicator(startCol, startRow) {
        if (!this.dragIndicator || !this.cachedCellSize) return;

        // Оптимизация: пропустить если позиция не изменилась
        const posKey = `${startCol}-${startRow}`;
        if (this.lastHighlightPos === posKey) return;
        this.lastHighlightPos = posKey;

        const { width, height, contentHeight } = this.cachedCellSize;

        // Вычислить новую позицию (row-2 потому что первая строка - контент)
        const left = (startCol - 1) * width;
        const top = contentHeight + (startRow - 2) * height;

        // Обновить позицию через transform для лучшей производительности
        this.dragIndicator.style.left = `${left}px`;
        this.dragIndicator.style.top = `${top}px`;
    }

    /**
     * Завершить drag
     */
    async endDrag(e) {
        if (!this.isDragging) return;

        // Отменить pending RAF
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.pendingMouseEvent = null;

        const endCell = this.getCellFromPoint(e.clientX, e.clientY);
        const blockEl = document.getElementById(this.draggedBlockId);

        if (blockEl) {
            blockEl.classList.remove('diagram-dragging');
        }

        // Удалить индикатор перетаскивания
        this.removeDragIndicator();

        // Вычислить смещение
        const deltaCol = endCell.col - this.dragStartCell.col;
        const deltaRow = endCell.row - this.dragStartCell.row;

        if (deltaCol !== 0 || deltaRow !== 0) {
            await this.moveBlockByDelta(this.draggedBlockId, deltaCol, deltaRow);
        }

        // Установить флаг для предотвращения клика ТОЛЬКО если блок реально двигался
        const wasMoved = deltaCol !== 0 || deltaRow !== 0;
        if (wasMoved) {
            this.justFinishedDrag = true;
            // Адаптивный debounce: дольше для мобильных устройств (300ms) и короче для desktop (150ms)
            const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            const debounceTime = isMobile ? 300 : 150;
            setTimeout(() => {
                this.justFinishedDrag = false;
            }, debounceTime);
        }

        this.isDragging = false;
        this.draggedBlockId = null;
        this.dragStartCell = null;
        this.dragBlockSize = null;
        this.dragStartBlockPos = null;
        this.lastHighlightPos = null;  // Сбросить для следующего drag

        // Деактивировать quick mode после завершения drag
        if (this.quickModeActive) {
            this.deactivateQuickMode();
        }
    }

    /**
     * Начать resize блока
     */
    startResize(e, blockId, direction) {
        this.isResizing = true;
        this.resizingBlockId = blockId;
        this.resizeDirection = direction;
        this.resizeStartPos = { x: e.clientX, y: e.clientY };
        this.resizeStartCell = this.getCellFromPoint(e.clientX, e.clientY);

        const blockEl = document.getElementById(blockId);
        if (blockEl) {
            blockEl.classList.add('diagram-resizing');
        }
    }

    /**
     * Обновить resize
     */
    updateResize(e) {
        const cell = this.getCellFromPoint(e.clientX, e.clientY);
        this.highlightResizeArea(cell);
    }

    /**
     * Завершить resize
     */
    async endResize(e) {
        if (!this.isResizing) return;

        // Отменить pending RAF
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.pendingMouseEvent = null;

        const endCell = this.getCellFromPoint(e.clientX, e.clientY);
        const blockEl = document.getElementById(this.resizingBlockId);

        if (blockEl) {
            blockEl.classList.remove('diagram-resizing');
        }

        this.clearHighlight();

        await this.resizeBlock(this.resizingBlockId, this.resizeDirection, endCell);

        this.isResizing = false;
        this.resizingBlockId = null;

        // Деактивировать quick mode после завершения resize
        if (this.quickModeActive) {
            this.deactivateQuickMode();
        }
        this.resizeDirection = null;
        this.resizeStartPos = null;
        this.resizeStartCell = null;
    }

    /**
     * Подсветить ячейку (no-op: CSS gradient не поддерживает подсветку ячеек)
     * Отключено для производительности - используется CSS gradient вместо DOM ячеек
     */
    highlightCell(col, row) {
        // No-op: cell highlighting disabled for CSS gradient performance
    }

    /**
     * Подсветить область resize (no-op: CSS gradient не поддерживает подсветку)
     */
    highlightResizeArea(endCell) {
        // No-op: cell highlighting disabled for CSS gradient performance
    }

    /**
     * Убрать подсветку (no-op)
     */
    clearHighlight() {
        // No-op: cell highlighting disabled for CSS gradient performance
    }

    /**
     * Переместить блок на delta ячеек
     */
    async moveBlockByDelta(blockId, deltaCol, deltaRow) {
        // Извлечь чистый blockId (без prefix от родителя)
        const cleanBlockId = blockId.includes('*') ? blockId.split('*').pop() : blockId;

        const pos = this.parseBlockPosition(cleanBlockId);
        if (!pos) return;

        const { cols, rows } = this.parseGridSize();
        const blockWidth = pos.colEnd - pos.colStart;
        const blockHeight = pos.rowEnd - pos.rowStart;

        // Вычислить новую позицию
        let newColStart = pos.colStart + deltaCol;
        let newColEnd = pos.colEnd + deltaCol;
        let newRowStart = pos.rowStart + deltaRow;
        let newRowEnd = pos.rowEnd + deltaRow;

        // Ограничить по левому/верхнему краю (сохраняя размер блока)
        if (newColStart < 1) {
            newColStart = 1;
            newColEnd = 1 + blockWidth;
        }
        if (newRowStart < 2) {
            newRowStart = 2;
            newRowEnd = 2 + blockHeight;
        }

        // Ограничить по правому/нижнему краю (сохраняя размер блока)
        if (newColEnd > cols + 1) {
            newColEnd = cols + 1;
            newColStart = cols + 1 - blockWidth;
        }
        if (newRowEnd > rows + 2) {
            newRowEnd = rows + 2;
            newRowStart = rows + 2 - blockHeight;
        }

        // Финальная проверка границ
        newColStart = Math.max(1, newColStart);
        newRowStart = Math.max(2, newRowStart);
        newColEnd = Math.min(cols + 1, newColEnd);
        newRowEnd = Math.min(rows + 2, newRowEnd);

        // Обновить customGrid
        this.customGrid.childrenPositions[cleanBlockId] = [
            `grid-column_${newColStart}__${newColEnd}`,
            `grid-row_${newRowStart}__${newRowEnd}`
        ];

        dispatch('UpdateCustomGridBlock', {
            blockId: this.parentBlockId,
            customGrid: this.customGrid
        });
    }

    /**
     * Изменить размер блока
     */
    async resizeBlock(blockId, direction, endCell) {
        const cleanBlockId = blockId.includes('*') ? blockId.split('*').pop() : blockId;

        const pos = this.parseBlockPosition(cleanBlockId);
        if (!pos) return;

        const { cols, rows } = this.parseGridSize();

        let { colStart, colEnd, rowStart, rowEnd } = pos;

        // Изменить границы в зависимости от направления
        if (direction.includes('n')) {
            rowStart = Math.max(2, Math.min(endCell.row, rowEnd - 1));
        }
        if (direction.includes('s')) {
            rowEnd = Math.min(rows + 2, Math.max(endCell.row + 1, rowStart + 1));
        }
        if (direction.includes('w')) {
            colStart = Math.max(1, Math.min(endCell.col, colEnd - 1));
        }
        if (direction.includes('e')) {
            colEnd = Math.min(cols + 1, Math.max(endCell.col + 1, colStart + 1));
        }

        // Минимальный размер 1x1
        if (colEnd - colStart < 1) colEnd = colStart + 1;
        if (rowEnd - rowStart < 1) rowEnd = rowStart + 1;

        this.customGrid.childrenPositions[cleanBlockId] = [
            `grid-column_${colStart}__${colEnd}`,
            `grid-row_${rowStart}__${rowEnd}`
        ];

        dispatch('UpdateCustomGridBlock', {
            blockId: this.parentBlockId,
            customGrid: this.customGrid
        });
    }

    /**
     * Обновить размер сетки
     */
    async updateGridSize(newCols, newRows) {
        if (!this.customGrid) return;

        this.customGrid.grid = [
            `grid-template-columns_${'1fr__'.repeat(newCols)}`,
            `grid-template-rows_auto__${'1fr__'.repeat(newRows)}`
        ];

        // Обновить contentPosition
        this.customGrid.contentPosition = [`grid-column_1_sl_${newCols + 1}`];

        dispatch('UpdateCustomGridBlock', {
            blockId: this.parentBlockId,
            customGrid: this.customGrid
        });

        // Обновить оверлей
        this.removeGridOverlay();
        this.createGridOverlay();
    }

    /**
     * Добавить строку в сетку
     */
    async addRow() {
        const { cols, rows } = this.parseGridSize();
        await this.updateGridSize(cols, rows + 1);
    }

    /**
     * Удалить строку из сетки
     */
    async removeRow() {
        const { cols, rows } = this.parseGridSize();
        if (rows > 1) {
            await this.updateGridSize(cols, rows - 1);
        }
    }

    /**
     * Добавить колонку в сетку
     */
    async addColumn() {
        const { cols, rows } = this.parseGridSize();
        await this.updateGridSize(cols + 1, rows);
    }

    /**
     * Удалить колонку из сетки
     */
    async removeColumn() {
        const { cols, rows } = this.parseGridSize();
        if (cols > 1) {
            await this.updateGridSize(cols - 1, rows);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONNECTION METHODS - drag-and-drop создание соединений через anchor points
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Установить тип соединения для создания
     */
    setConnectionType(type) {
        this.connectionType = type || 'default';
    }

    /**
     * Начать создание соединения от anchor point
     */
    startConnection(e, blockId, anchorPosition) {
        this.isConnecting = true;
        this.connectionSourceId = blockId;
        this.connectionSourceAnchor = anchorPosition;

        // Получить центр anchor point для начала линии
        const sourceElement = document.getElementById(blockId);
        const anchorElement = sourceElement?.querySelector(`.anchor-point-${anchorPosition}`);

        if (!anchorElement) return;

        const anchorRect = anchorElement.getBoundingClientRect();
        this.connectionStartPoint = {
            x: anchorRect.left + anchorRect.width / 2,
            y: anchorRect.top + anchorRect.height / 2
        };

        // Создать SVG линию для визуализации
        this.createConnectionLine();
        this.updateConnectionLine(e.clientX, e.clientY);

        // Подсветить источник
        sourceElement.classList.add('connection-source');
        anchorElement.classList.add('anchor-active');

        // Показать все anchor points на других блоках
        this.showAllAnchorPoints();
    }

    /**
     * Обновить линию соединения при перемещении мыши
     */
    updateConnection(e) {
        if (!this.connectionLine) return;

        this.updateConnectionLine(e.clientX, e.clientY);

        // Подсветить anchor point под курсором
        this.highlightTargetAnchor(e.clientX, e.clientY);
    }

    /**
     * Завершить создание соединения
     */
    endConnection(e) {
        if (!this.isConnecting) return;

        // Установить флаг для предотвращения последующего клика
        this.justFinishedConnection = true;
        setTimeout(() => {
            this.justFinishedConnection = false;
        }, 100);

        // Найти anchor point под курсором
        const targetAnchor = this.getAnchorAtPoint(e.clientX, e.clientY);

        if (targetAnchor && targetAnchor.blockId !== this.connectionSourceId) {
            // Создать соединение через arrowManager
            const sourceId = this.connectionSourceId;
            const targetId = targetAnchor.blockId;

            dispatch('CreateConnectionFromAnchors', {
                sourceId,
                targetId,
                sourceAnchor: this.connectionSourceAnchor,
                targetAnchor: targetAnchor.position,
                connectionType: this.connectionType
            });
        }

        // Очистить состояние
        this.cleanupConnection();
    }

    /**
     * Создать SVG элемент для линии соединения
     */
    createConnectionLine() {
        if (this.connectionLine) {
            this.connectionLine.remove();
        }

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'connection-preview-svg';
        svg.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 10000;
        `;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.id = 'connection-preview-line';
        line.setAttribute('stroke', '#4f46e5');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '5,5');

        // Маркер стрелки
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'arrowhead');
        marker.setAttribute('markerWidth', '10');
        marker.setAttribute('markerHeight', '7');
        marker.setAttribute('refX', '9');
        marker.setAttribute('refY', '3.5');
        marker.setAttribute('orient', 'auto');

        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
        polygon.setAttribute('fill', '#4f46e5');

        marker.appendChild(polygon);
        defs.appendChild(marker);
        svg.appendChild(defs);

        line.setAttribute('marker-end', 'url(#arrowhead)');
        svg.appendChild(line);

        document.body.appendChild(svg);
        this.connectionLine = svg;
    }

    /**
     * Обновить позицию линии соединения
     */
    updateConnectionLine(targetX, targetY) {
        if (!this.connectionLine || !this.connectionStartPoint) return;

        const line = this.connectionLine.querySelector('#connection-preview-line');
        if (!line) return;

        line.setAttribute('x1', this.connectionStartPoint.x);
        line.setAttribute('y1', this.connectionStartPoint.y);
        line.setAttribute('x2', targetX);
        line.setAttribute('y2', targetY);
    }

    /**
     * Показать все anchor points на блоках
     */
    showAllAnchorPoints() {
        if (!this.parentElement) return;

        this.parentElement.querySelectorAll('.anchor-point').forEach(anchor => {
            anchor.classList.add('anchor-visible');
        });
    }

    /**
     * Скрыть все anchor points
     */
    hideAllAnchorPoints() {
        if (!this.parentElement) return;

        this.parentElement.querySelectorAll('.anchor-point').forEach(anchor => {
            anchor.classList.remove('anchor-visible', 'anchor-highlight');
        });
    }

    /**
     * Подсветить anchor point под курсором
     */
    highlightTargetAnchor(x, y) {
        // Убрать подсветку со всех
        this.parentElement?.querySelectorAll('.anchor-highlight').forEach(el => {
            el.classList.remove('anchor-highlight');
        });

        const target = this.getAnchorAtPoint(x, y);
        if (target && target.blockId !== this.connectionSourceId) {
            const element = document.getElementById(target.blockId);
            const anchor = element?.querySelector(`.anchor-point-${target.position}`);
            anchor?.classList.add('anchor-highlight');
        }
    }

    /**
     * Получить anchor point по координатам
     */
    getAnchorAtPoint(x, y) {
        const elements = document.elementsFromPoint(x, y);

        for (const el of elements) {
            if (el.classList.contains('anchor-point')) {
                return {
                    blockId: el.dataset.blockId,
                    position: el.dataset.position
                };
            }
        }

        return null;
    }

    /**
     * Очистить состояние соединения
     */
    cleanupConnection() {
        // Удалить линию
        if (this.connectionLine) {
            this.connectionLine.remove();
            this.connectionLine = null;
        }

        // Убрать подсветку
        const sourceElement = this.connectionSourceId
            ? document.getElementById(this.connectionSourceId)
            : null;
        if (sourceElement) {
            sourceElement.classList.remove('connection-source');
            sourceElement.querySelectorAll('.anchor-active').forEach(el => {
                el.classList.remove('anchor-active');
            });
        }

        // Скрыть anchor points
        this.hideAllAnchorPoints();

        // Сбросить состояние
        this.isConnecting = false;
        this.connectionSourceId = null;
        this.connectionSourceAnchor = null;
        this.connectionStartPoint = null;
    }

    /**
     * Полностью уничтожить редактор и освободить ресурсы
     * Вызывать при unmount компонента
     */
    destroy() {
        // Деактивировать все режимы
        this.deactivate();
        this.deactivateQuickMode();

        // Удалить глобальные слушатели
        window.removeEventListener('ShowedBlocks', this.handleShowedBlocks);
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
        document.removeEventListener('mousedown', this.handleGlobalMouseDown);
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
        document.removeEventListener('touchmove', this.handleTouchMove);
        document.removeEventListener('touchend', this.handleTouchEnd);

        // Очистить все ссылки
        this.parentElement = null;
        this.quickModeElement = null;
        this.gridOverlay = null;
        this.connectionLine = null;
    }
}

export const diagramEditor = new DiagramEditor();

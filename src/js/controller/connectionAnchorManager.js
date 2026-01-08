/**
 * ConnectionAnchorManager - показывает anchor points при наведении на блок
 * в режимах создания соединений (connectToBlock, connectSelectSource)
 */

class ConnectionAnchorManager {
    constructor() {
        this.isActive = false;
        this.currentHoveredBlock = null;
        this.rootContainer = null;

        // Позиции anchor points (12 точек)
        this.anchorPositions = [
            'top-left', 'top-center', 'top-right',
            'right-top', 'right-center', 'right-bottom',
            'bottom-right', 'bottom-center', 'bottom-left',
            'left-bottom', 'left-center', 'left-top'
        ];

        // Привязываем методы
        this.handleMouseEnter = this.handleMouseEnter.bind(this);
        this.handleMouseLeave = this.handleMouseLeave.bind(this);
    }

    /**
     * Инициализация
     */
    init(rootContainer) {
        this.rootContainer = rootContainer || document.getElementById('rootContainer');
    }

    /**
     * Активировать режим показа якорей
     * Вызывается при входе в режим connectToBlock или connectSelectSource
     */
    activate() {
        if (this.isActive) return;
        this.isActive = true;

        // Добавляем обработчики на все блоки
        this.addEventListeners();

        // Добавляем класс к body для CSS
        document.body.classList.add('connection-mode-active');
    }

    /**
     * Деактивировать режим показа якорей
     * Вызывается при выходе из режима создания соединений
     */
    deactivate() {
        if (!this.isActive) return;
        this.isActive = false;

        // Удаляем якоря с текущего блока
        this.removeAnchorsFromBlock(this.currentHoveredBlock);
        this.currentHoveredBlock = null;

        // Удаляем обработчики
        this.removeEventListeners();

        // Удаляем класс
        document.body.classList.remove('connection-mode-active');
    }

    /**
     * Добавить обработчики событий
     */
    addEventListeners() {
        if (!this.rootContainer) return;

        // Используем делегирование событий
        this.rootContainer.addEventListener('mouseenter', this.handleMouseEnter, true);
        this.rootContainer.addEventListener('mouseleave', this.handleMouseLeave, true);
    }

    /**
     * Удалить обработчики событий
     */
    removeEventListeners() {
        if (!this.rootContainer) return;

        this.rootContainer.removeEventListener('mouseenter', this.handleMouseEnter, true);
        this.rootContainer.removeEventListener('mouseleave', this.handleMouseLeave, true);
    }

    /**
     * Обработчик наведения мыши
     */
    handleMouseEnter(e) {
        if (!this.isActive) return;

        const block = this.getBlockFromTarget(e.target);
        if (!block || block === this.currentHoveredBlock) return;

        // Убираем якоря с предыдущего блока
        if (this.currentHoveredBlock) {
            this.removeAnchorsFromBlock(this.currentHoveredBlock);
        }

        // Добавляем якоря к новому блоку
        this.currentHoveredBlock = block;
        this.addAnchorsToBlock(block);
    }

    /**
     * Обработчик ухода мыши
     */
    handleMouseLeave(e) {
        if (!this.isActive) return;

        const block = this.getBlockFromTarget(e.target);
        if (!block) return;

        // Проверяем, не перешли ли мы на дочерний элемент того же блока
        const relatedBlock = this.getBlockFromTarget(e.relatedTarget);
        if (relatedBlock === block) return;

        // Проверяем, не перешли ли на anchor point
        if (e.relatedTarget?.classList?.contains('anchor-point')) return;

        // Убираем якоря
        if (block === this.currentHoveredBlock) {
            this.removeAnchorsFromBlock(block);
            this.currentHoveredBlock = null;
        }
    }

    /**
     * Получить блок из target элемента
     */
    getBlockFromTarget(target) {
        if (!target || target === document) return null;

        // Ищем ближайший блок
        const block = target.closest('[block], [blocklink]');
        return block;
    }

    /**
     * Добавить anchor points к блоку
     */
    addAnchorsToBlock(block) {
        if (!block) return;

        // Удалить существующие если есть
        block.querySelectorAll('.anchor-point').forEach(a => a.remove());

        this.anchorPositions.forEach(position => {
            const anchor = document.createElement('div');
            anchor.className = `anchor-point anchor-point-${position} anchor-visible`;
            anchor.dataset.position = position;
            anchor.dataset.blockId = block.id;
            anchor.title = 'Кликните для соединения';
            block.appendChild(anchor);
        });

        // Добавить класс для стилизации
        block.classList.add('connection-target');
    }

    /**
     * Удалить anchor points с блока
     */
    removeAnchorsFromBlock(block) {
        if (!block) return;

        block.querySelectorAll('.anchor-point').forEach(a => a.remove());
        block.classList.remove('connection-target');
    }

    /**
     * Подсветить конкретный anchor
     */
    highlightAnchor(blockId, position) {
        const block = document.getElementById(blockId);
        if (!block) return;

        const anchor = block.querySelector(`.anchor-point-${position}`);
        anchor?.classList.add('anchor-highlight');
    }

    /**
     * Убрать подсветку со всех anchors
     */
    clearHighlights() {
        document.querySelectorAll('.anchor-highlight').forEach(a => {
            a.classList.remove('anchor-highlight');
        });
    }
}

export const connectionAnchorManager = new ConnectionAnchorManager();

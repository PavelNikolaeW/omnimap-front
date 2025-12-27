/**
 * TreeNavigation - компонент навигации по деревьям
 * Отображает кнопки для переключения между корневыми блоками
 */
import { truncate } from '../utils/functions';
import { dispatch } from '../utils/utils';
import { treeService } from '../services/treeService';
import { customPrompt } from '../utils/custom-dialog';

export class TreeNavigation {
    constructor() {
        this.element = document.getElementById('tree-navigation');
        this.currentTree = null;

        // Bound handlers for proper cleanup
        this._handleShowedBlocks = this._handleShowedBlocks.bind(this);
        this._handleTreeClick = this._handleTreeClick.bind(this);
        this._handleWebSocketUpdate = this._handleWebSocketUpdate.bind(this);
        this._handleUpdateNavigation = this._handleUpdateNavigation.bind(this);

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
        const hasTreeUpdate = updates.some(block => !block.parent_id);
        if (hasTreeUpdate) {
            await treeService.refresh();
            await this.render();
        }
    }

    /**
     * Обработчик кликов (event delegation)
     */
    async _handleTreeClick(event) {
        const button = event.target.closest('button');
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
        button.id = `treeBtn_${treeId}`;

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
        return button;
    }
}

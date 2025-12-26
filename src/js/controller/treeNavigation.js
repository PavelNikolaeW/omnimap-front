// src/controllers/treeNavigation.js
import { truncate } from "../utils/functions";
import localforage from "localforage";
import { BaseController } from "./baseController";
import { dispatch } from "../utils/utils";
import {customPrompt} from "../utils/custom-dialog";

export class TreeNavigation extends BaseController {
    constructor() {
        super();
        this.treeNavigation = document.getElementById('tree-navigation');
        this.user = undefined;
        this.boundClickHandler = this.handleTreeClick.bind(this);
        this.boundShowHandler = this.handleShowedBlocks.bind(this);
        this.init();
    }

    init() {
        window.removeEventListener('ShowedBlocks', this.boundShowHandler);
        window.addEventListener('ShowedBlocks', this.boundShowHandler);

        // Подписываемся на обновления через WebSocket
        window.addEventListener('WebSocUpdateBlock', this.handleWebSocketUpdate.bind(this));
        window.addEventListener('UpdateTreeNavigation', () => this.renderTreeNavigation());
    }

    /**
     * Обрабатывает обновления блоков через WebSocket
     * Перерисовывает навигацию, если изменились корневые блоки (деревья)
     */
    async handleWebSocketUpdate(event) {
        const updates = event.detail;
        if (!updates || !updates.length) return;

        // Проверяем, есть ли среди обновлений корневые блоки (без parent_id)
        const hasTreeUpdate = updates.some(block => !block.parent_id);

        if (hasTreeUpdate) {
            await this.renderTreeNavigation();
        }
    }

    async handleShowedBlocks() {
        await this.renderTreeNavigation();
        this.treeNavigation.removeEventListener('click', this.boundClickHandler);
        this.treeNavigation.addEventListener('click', this.boundClickHandler);
    }

    async handleTreeClick(e) {
        const button = e.target.closest('button');
        if (button?.id?.startsWith('treeBtn_')) {
            const blockId = button.id.slice(8);
            await localforage.setItem('currentTree', blockId);
            dispatch('ShowBlocks');
        }
    }

    async renderTreeNavigation() {
        if (!this.user || this.user === 'anonim') {
            this.user = await this.getCurrentUser();
        }
        await this._renderTreeNavigation();
    }

    async _renderTreeNavigation() {
        const currentTree = await localforage.getItem('currentTree');
        const trees = await localforage.getItem(`treeIds${this.user}`);
        if (!trees) return;
        const treeBlocks = await Promise.all(
            trees.map(tree => localforage.getItem(`Block_${tree}_${this.user}`))
        );

        this.treeNavigation.textContent = '';
        treeBlocks.forEach((block, index) => {
            if (block) {
                const tree = trees[index];
                const treeBtn = this.createTreeButton(tree, block, currentTree);
                this.treeNavigation.appendChild(treeBtn);
            }
        });

        this.treeNavigation.appendChild(this.btnCreateTree());
    }

    btnCreateTree() {
        const treeBtn = document.createElement('button');
        treeBtn.classList.add('tree-add-button');
        treeBtn.textContent = "+";
        treeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            customPrompt('Введите название').then(title => {
                if (title) {
                    dispatch('CreateTree', { title });
                }
            })
        });
        return treeBtn;
    }

    createTreeButton(tree, block, currentTree) {
        const treeBtn = document.createElement('button');
        treeBtn.classList.add('tree-button');
        treeBtn.setAttribute('blockId', block.id);
        if (tree === currentTree) treeBtn.classList.add('selected');
        treeBtn.id = `treeBtn_${tree}`;
        treeBtn.setAttribute('title', block?.title || 'Нет названия');
        treeBtn.textContent = block?.title ? truncate(block.title, 15) : 'Без имени';
        return treeBtn;
    }
    render() {
        this.renderTreeNavigation()
    }
}

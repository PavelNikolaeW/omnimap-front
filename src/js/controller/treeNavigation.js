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
}

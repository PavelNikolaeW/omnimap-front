import {truncate} from "../utils/functions";
import localforage from "localforage";
import {BaseController} from "./baseController";
import {dispatch} from "../utils/utils";
import api from "../api/api"

export class TreeNavigation extends BaseController {
    constructor() {
        super()
        this.treeNavigation = document.getElementById('tree-navigation');
        this.user = undefined
        this.init()
    }

    init() {
        window.addEventListener('ShowedBlocks', this.renderTreeNavigation.bind(this))
        this.treeNavigation.addEventListener('click', async (e) => {
            const idBtn = e.target.id;
            if (idBtn.startsWith('treeBtn_')) {
                const blockId = idBtn.slice(8);
                await localforage.setItem('currentTree', blockId, () => dispatch('ShowBlocks') );

            }
        });
    }


    renderTreeNavigation() {
        if (!this.user) {
            this.setCurrentUser(this._renderTreeNavigation.bind(this))
        } else this._renderTreeNavigation()
    }

    _renderTreeNavigation() {
        localforage.getItem('currentTree', (err, currentTree) => {
            localforage.getItem(`treeIds${this.user}`, (err, trees) => {
                if (!trees) return
                Promise.all(
                    trees.map(tree => localforage.getItem(`Block_${tree}_${this.user}`))
                ).then((treeBlocks) => {
                    this.treeNavigation.textContent = '';
                    treeBlocks.forEach((block, index) => {
                        const tree = trees[index];
                        const treeBtn = this.createTreeButton(tree, block, currentTree);
                        this.treeNavigation.appendChild(treeBtn);
                    });
                    this.treeNavigation.appendChild(this.btnCreatTree())
                })
            })
        })
    }

    btnCreatTree() {
        const treeBtn = document.createElement('button');
        treeBtn.classList.add('tree-add-button');
        treeBtn.textContent = "+"
        treeBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            e.preventDefault()
            const title = prompt('Введите название')
            if (title && title.trim()) {
                dispatch('CreateTree', {title: title.trim()})
            }
        })
        return treeBtn
    }

    createTreeButton(tree, block, currentTree) {
        const treeBtn = document.createElement('button');
        treeBtn.classList.add('tree-button');
        treeBtn.setAttribute('blockId', block.id)
        if (tree === currentTree) treeBtn.classList.add('selected');
        treeBtn.id = `treeBtn_${tree}`;
        treeBtn.setAttribute('title', block?.title || 'Нет названия');
        if (!block?.title || block.title === '') treeBtn.textContent = 'Без имени'
        else treeBtn.textContent = truncate(block.title, 15);
        return treeBtn;
    }
}
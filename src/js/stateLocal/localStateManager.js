import localforage from "localforage";
import {dispatch, printTimer, resetTimer} from "../utils/utils";
import {Painter} from "../painter/painter";
import api from "../api/api";
import LZString from 'lz-string'
import {truncate} from '../utils/functions'
import {Queue} from "../utils/queue";
import {log} from "@jsplumb/browser-ui";

// Проверка поддержки IndexedDB и конфигурация localforage
if (!localforage.supports(localforage.INDEXEDDB)) {
    alert('Ваш браузер не поддерживает IndexedDB. Пожалуйста, обновите браузер для полноценной работы сайта.');
} else {
    localforage.config({
        name: 'omniMap',
        storeName: 'omniMap',
        driver: [localforage.INDEXEDDB],
        version: 1.0,
        description: ''
    });
}

class BlockRepository {
    constructor(currentUser) {
        this.currentUser = currentUser;
    }

    getKey(blockId) {
        return `Block_${blockId}_${this.currentUser}`;
    }

    async saveBlock(block) {
        const key = this.getKey(block.id);
        await localforage.setItem(key, block);
    }

    async loadBlock(blockId) {
        const key = this.getKey(blockId);
        return await localforage.getItem(key);
    }

    async deleteBlock(blockId) {
        const key = this.getKey(blockId);
        await localforage.removeItem(key);
    }
}


export class LocalStateManager {
    constructor(jsPlumbInstance) {
        this.rootContainer = document.getElementById('rootContainer');
        this.currentUser = null;
        this.path = [];
        this.blocks = new Map();
        this.jsPlumbInstance = jsPlumbInstance;
        this.painter = new Painter(jsPlumbInstance);
        this.blockRepository = null;
        this.treeNavigation = document.getElementById('tree-navigation');


        // Initialize event handlers
        this.registerEventHandlers();
    }

    registerEventHandlers() {
        window.addEventListener('ShowBlocks', () => this.showBlocks());
        window.addEventListener('LoadEmptyBlocks', async (e) => {
            await this.loadEmptyBlocks(e.detail)
            dispatch('ShowBlocks');
        });

        window.addEventListener('InitAnonimUser', async () => {
            const publicTreeBlocks = await api.getTreeBlocks();
            await this.initUser(publicTreeBlocks, 'anonim');
            dispatch('ShowBlocks');
        });

        window.addEventListener('InitUser', async (e) => {
            const treeBlocks = await api.getTreeBlocks();
            await this.initUser(treeBlocks, e.detail.user);
            dispatch('ShowBlocks');
        });

        window.addEventListener('OpenBlock', (e) => {
            this.openBlock(e.detail);
            printTimer();
            resetTimer();
        });

        window.addEventListener('UpdateDataBlock', (e) => {
            this.updateDataBlock(e.detail);
        });
        window.addEventListener('MoveBlock', (e) => {
            this.moveBlock(e.detail);
        });

        window.addEventListener('AddConnectionBlock', (e) => {
            this.addConnectionBlock(e.detail);
        });

        window.addEventListener('RemoveConnectionBlock', (e) => {
            this.removeConnectionBlock(e.detail);
        });

        window.addEventListener('UpdateCustomGridBlock', (e) => {
            this.updateCustomGridBlock(e.detail);
        });

        window.addEventListener('CreateBlock', (e) => {
            this.createBlock(e.detail);
        });
        window.addEventListener('IframeCreate', (e) => {
            this.iframeCreate(e.detail);
        });

        window.addEventListener('DeleteBlock', (e) => {
            this.removeBlockHandler(e.detail);
        });

        window.addEventListener('Login', async (e) => {
            const treeBlocks = await api.getTreeBlocks();
            await this.initUser(treeBlocks, e.detail.user);
            dispatch('ShowBlocks');
        });

        window.addEventListener('Logout', async () => {
            dispatch('InitAnonimUser')
        });

        window.addEventListener('PasteBlock', async (e) => {
            this.pasteBlock(e.detail);
        });

        window.addEventListener('PasteLinkBlock', async (e) => {
            this.pasteLinkBlock(e.detail);
        });

        window.addEventListener('TextUpdate', async (e) => {
            this.textUpdate(e.detail);
        });

        window.addEventListener('TitleUpdate', async (e) => {
            this.titleUpdate(e.detail);
        });

        window.addEventListener('SetHueBlock', async (e) => {
            this.hueUpdate(e.detail);
        });
        window.addEventListener('SetIframe', async (e) => {
            this.SetIframe(e.detail);
        });
        window.addEventListener('ShowedBlocks', (e) => {
            this.paintPath(e.detail)
        });
        window.addEventListener('DeleteTreeBlock', (e) => {
            this.deleteTreeBlock(e.detail)
        });

        window.addEventListener('resize', () => this.onResize());
        window.addEventListener('ShowError', (e) => {
            const errorPopup = document.getElementById("error-popup");
            const errorMessage = document.getElementById("error-message");
            if (e.detail.response?.data?.detail) errorMessage.textContent = e.detail.response.data.detail;
            else errorMessage.textContent = e.detail.message

            errorPopup.classList.remove("hidden");
            errorPopup.classList.add("visible");

            setTimeout(() => {
                errorPopup.classList.remove("visible");
                errorPopup.classList.add("hidden");
            }, 3000);
        });
        window.addEventListener('SetLoading', (e) => {
            if (e.detail) document.body.classList.add('loading-cursor');
            else document.body.classList.remove('loading-cursor');
        })
        window.addEventListener('WebSocUpdateBlock', (e) => {
            this.webSocUpdateBlock(e.detail)
        })
        window.addEventListener('WebSocUpdateBlockAccess', async (e) => {
            await this.WebSocUpdateBlockAccess(e.detail)
        })
        window.addEventListener('ResetState', async (e) => {
            await this.resetState()
        })
        window.addEventListener('CreateLink', async (e) => {
            if (confirm('Блок и все его дочерние блоки станут доступными для тех у кого есть ссылка или id блоков')) {
                const id = e.detail.id
                api.createUrlLink(id,).then(res => {
                    if (res.status === 200) {
                        const block = res.data
                        this.saveBlock(block)
                        this.showBlocks()
                    }
                })
            }
        })
        this.treeNavigation.addEventListener('click', async (e) => {
            const idBtn = e.target.id;
            if (idBtn.startsWith('treeBtn_')) {
                const blockId = idBtn.slice(8);
                await localforage.setItem('currentTree', blockId);
                this.showBlocks(); // Переключаемся на новое дерево
            }
        });
    }

    async deleteTreeBlock({blockId}) {
        if (!confirm(`Вы уверены, что хотите удалить блок ${blockId} и всех его потомков?`)) return

        const treeIds = await localforage.getItem(`treeIds${this.currentUser}`)
        let newTreeIds = undefined
        const currentTree = await localforage.getItem(`currentTree`)

        if (treeIds.includes(blockId)) {
            newTreeIds = treeIds.filter(el => el !== blockId)

            if (currentTree === blockId && treeIds.length === 1) {
                alert('Нельзя удалить последнее дерево')
                return
            }
        }
        api.removeTree(blockId).then(async (res) => {
            if (res.status === 200) {
                await localforage.removeItem(`Path_${blockId}${this.currentUser}`)
                if (newTreeIds) {
                    localforage.setItem(`treeIds${this.currentUser}`, newTreeIds)
                }
                if (currentTree === blockId) {
                    await localforage.setItem(`currentTree`, newTreeIds[0])
                }
                if (res.data.parent) {
                    await this.saveBlock(res.data.parent)
                }
                this.getAllChildIds(blockId).forEach((id) => {
                    console.log(id)
                    this.blockRepository.deleteBlock(id);
                    this.blocks.delete(id);
                })
                this.showBlocks()
            }
        })

    }

    async WebSocUpdateBlockAccess(data) {
        const newBlock = {
            id: data.id,
            updated_at: new Date(data.updated_at * 1000).toISOString(),
            title: data.title,
            data: JSON.parse(data.data),
            children: JSON.parse(data.children)
        }
        if (data.updated_at === 946684801) {
            //     права забрали, удаляем дочерние блоки
            this.removeChildrenBlocks(this.blocks.get(data.id))
        }
        await this.saveBlock(newBlock)
        this.updateScreen([newBlock])
    }

    removeChildrenBlocks(block) {
        const removesIds =
            removesIds.forEach(id => this.removeBlock(id))
    }

    webSocUpdateBlock(newBlocks) {
        console.log(newBlocks)
        if (newBlocks.length) {
            newBlocks.forEach((block) => {
                this.saveBlock({
                    id: block.id,
                    updated_at: new Date(block.updated_at * 1000).toISOString(),
                    title: block.title,
                    data: JSON.parse(block.data),
                    children: JSON.parse(block.children)
                })
            })
            this.updateScreen(newBlocks)
        }
    }

    updateScreen(newBlocks) {
        for (let i = 0; i < newBlocks.length; i++) {
            const id = newBlocks[i].id
            const element = document.getElementById(id)
            if (element || document.querySelector(`[blocklink="${id}"]`)) {
                this.showBlocks()
                return null
            }
        }
    }

    resetState() {
        // todo сделать сброс состояния для одного юзера а не для всех.
        localforage.getItem('currentUser').then((user) => {
            localforage.clear().then(() => {
                dispatch('Login', {user})
            }).catch((err) => {
                console.error('Произошла ошибка при очистке localForage:', err);
            });
        })
    }

    moveBlock({block_id, old_parent_id, new_parent_id, before}) {
        if (block_id === new_parent_id) return

        function insertBefore(list, item, before) {
            const newList = list.slice();
            const itemIndex = newList.indexOf(item);

            if (itemIndex !== -1) {
                newList.splice(itemIndex, 1);
            }
            const beforeIndex = newList.indexOf(before);

            if (beforeIndex !== -1) {
                newList.splice(beforeIndex, 0, item);
            } else {
                newList.push(item);
            }

            return newList;
        }

        const parent = this.blocks.get(new_parent_id)
        const newOrder = insertBefore(parent.data.childOrder, block_id, before)
        api.moveBlock(block_id, {new_parent_id, old_parent_id, childOrder: newOrder})
            .then((res) => {
                if (res.status === 200) {
                    Object.values(res.data).forEach((block) => {
                        this.saveBlock(block)
                    })
                    dispatch('ShowBlocks');
                }
            })
    }

    async loadEmptyBlocks({emptyBlocks}) {
        await api.loadEmpty(emptyBlocks).then((res) => {
            if (res.status === 200) {
                Object.values(res.data).forEach((block) => {
                    this.saveBlock(block)
                })
            }
        })
    }


    async saveBlock(block) {
        console.log(block)
        this.blocks.set(block.id, block)
        await this.blockRepository.saveBlock(block);
    }

    async removeBlock(blockId) {
        const removedBlock = this.blocks.get(blockId)
        if (removedBlock.children) {
            const treeIds = await localforage.getItem(`treeIds${this.currentUser}`)
            await localforage.setItem(`treeIds${this.currentUser}`, [...treeIds, ...removedBlock.children])
        }
        await this.blockRepository.deleteBlock(blockId);
        this.blocks.delete(blockId);
    }

    // Initialization
    async initUser({treeIds, blocks}, user) {
        this.currentUser = user;
        this.blockRepository = new BlockRepository(this.currentUser);
        this.currentTree = treeIds[0]

        delete this.blocks
        this.blocks = new Map()

        await localforage.setItem('currentUser', user);
        await localforage.setItem('currentTree', this.currentTree)
        await localforage.setItem(`treeIds${user}`, treeIds)

        // Assuming blocks is a Map or an array of block objects
        for (const block of blocks.values()) {
            this.saveBlock(block);
        }

        // Initialize path with the root block
        for (let i = 0; i < treeIds.length; i++) {
            const tree = treeIds[i]
            const rootBlock = blocks.get(tree);
            const color = rootBlock.data?.color && rootBlock.data.color !== 'default_color' ? rootBlock.data.color : [];
            const titleBlock = rootBlock.title;

            const path = [{screenName: truncate(titleBlock, 10), color: color, blockId: rootBlock.id}];
            await localforage.setItem(`Path_${tree}${this.currentUser}`, path);
        }
        this.path = await localforage.getItem(`Path_${this.currentTree}${this.currentUser}`)
    }

    async showTrees(currentTree, user) {
        const trees = await localforage.getItem(`treeIds${user}`) || [];
        this.treeNavigation.textContent = '';
        const treeBlocks = await Promise.all(
            trees.map(tree => localforage.getItem(`Block_${tree}_${user}`))
        );
        // Отображаем кнопки деревьев
        treeBlocks.forEach((block, index) => {
            const tree = trees[index];
            const treeBtn = this.createTreeButton(tree, block, currentTree);
            this.treeNavigation.appendChild(treeBtn);
        });
    }

    createTreeButton(tree, block, currentTree) {
        const treeBtn = document.createElement('button');
        treeBtn.classList.add('tree-button');
        if (tree === currentTree) treeBtn.classList.add('selected');
        treeBtn.id = `treeBtn_${tree}`;
        treeBtn.setAttribute('title', block?.title || 'Нет названия');
        if (!block?.title || block.title === '') treeBtn.textContent = 'Без имени'
        else treeBtn.textContent = truncate(block.title, 10);
        return treeBtn;
    }

    async getAllBlocksForUser(username) {
        const keys = await localforage.keys();
        const pattern = new RegExp(`^Block_.*_${username}$`);
        const blockKeys = keys.filter((key) => pattern.test(key));
        const blocks = await Promise.all(
            blockKeys.map(key => localforage.getItem(key))
        );

        this.blocks = new Map();
        blocks.forEach(block => {
            if (block && block.id) {
                this.blocks.set(block.id, block);
            }
        });
    }


    async initShowLink(linkSlug) {
        let treeId = await localforage.getItem(`linkSlugTreeId${this.currentUser}:${linkSlug}`)
        if (!treeId) {
            const res = await api.loadBlockUrl(linkSlug)

            if (res.status === 200 && res.data) {
                const blocks =  Object.values(res.data)
                const block = blocks[0]
                const color = block.data?.color && block.data.color !== 'default_color' ? block.data.color : [];
                await localforage.setItem(`linkSlugTreeId${this.currentUser}:${linkSlug}`, block.id)
                console.log(`Path_${block.id}${this.currentUser}`)
                await localforage.setItem(`Path_${block.id}${this.currentUser}`, [
                    {screenName: truncate(block.title, 10), color: color, blockId: block.id}
                ])
                for (let i = 0; i < blocks.length; i++) {
                    const block = blocks[i]
                    await this.saveBlock(block)
                }
                return block.id
            }
        } else {
            return treeId
        }
    }

    async showBlocks() {
        this.currentUser = await localforage.getItem('currentUser') || 'anonim';
        this.blockRepository = new BlockRepository(this.currentUser);

        if (window.location.search.includes('path')) {
            this.currentTree = await this.initShowLink(window.location.search.split('path/')[1])
        } else {
            this.currentTree = await localforage.getItem('currentTree');
        }
        console.log(this.currentTree)
        console.log(this.blocks)

        if (!this.blocks || this.blocks.size === 0) {
            await this.getAllBlocksForUser(this.currentUser);
        }
        this.path = await localforage.getItem(`Path_${this.currentTree}${this.currentUser}`) || [];
        console.log(`Path_${this.currentTree}${this.currentUser}`)
        let screenObj = this.path.at(-1);
        console.log(screenObj)
        if (!screenObj) {
            const block = this.blocks.get(this.currentTree)
            screenObj = {
                screenName: truncate(block.title, 10),
                color: block.data?.color && block.data.color !== 'default_color' ? block.data.color : [],
                blockId: block.id
            }
            this.path.push(screenObj)
            await localforage.setItem(`Path_${this.currentTree}${this.currentUser}`, this.path)
        }
        this.painter.render(this.blocks, screenObj);
        dispatch('ShowedBlocks', this.path);

        await this.showTrees(this.currentTree, this.currentUser);
    }

    openBlock({id, parentHsl, isIframe}) {
        const currentScreen = this.path.at(-1);
        const block = this.blocks.get(id);
        const title = block.title;

        if (currentScreen.blockId === block.id) {
            if (this.path.length === 1) return;
            this.path.pop();
        } else {
            this.path.push({screenName: truncate(title, 10), color: parentHsl, blockId: id});
        }

        if (!isIframe) {
            this.painter.render(this.blocks, this.path.at(-1));
        } else {
            // Handle iframe logic if necessary
        }
        localforage.setItem(`Path_${this.currentTree}${this.currentUser}`, this.path)
        dispatch("ShowedBlocks", this.path)
    }

    async createBlock({parentId, title}) {
        try {
            const response = await api.createBlock(parentId, title);
            if (response.status === 201) {
                const newBlocks = response.data;
                for (const block of newBlocks) {
                    await this.saveBlock(block);
                }
                dispatch('ShowBlocks');
            }
        } catch (err) {
            console.error(err);
        }
    }

    iframeCreate({parentId, src}) {
        api.createBlock(parentId, '', {
            view: 'iframe',
            attributes: [
                {name: 'sandbox', value: 'allow-scripts allow-same-origin allow-forms'},
                {name: 'src', value: src}
            ]
        }).then(async (res) => {
            if (res.status === 201) {
                const newBlocks = res.data;
                for (const block of newBlocks) {
                    await this.saveBlock(block);
                }
                dispatch('ShowBlocks');
            }
        }).catch((err) => {
            console.error(err)
        })
    }

    async removeBlockHandler({removeId, parentId}) {
        try {
            const response = await api.removeBlock({removeId, parentId});
            if (response.status === 200) {
                await this.saveBlock(response.data);
                dispatch('ShowBlocks');
                this.removeBlock(removeId)
            }
        } catch (err) {
            console.error(err);
        }
    }

    async pasteBlock(data) {
        if (data.src.length > 0) {
            try {
                const response = await api.pasteBlock(data);
                if (response.status === 200) {
                    const newBlocks = response.data;
                    for (const block of Object.values(newBlocks)) {
                        await this.saveBlock(block);
                    }
                    dispatch('ShowBlocks');
                }
            } catch (err) {
                console.error(err);
            }
        }
    }

    async pasteLinkBlock(data) {
        try {
            const response = await api.pasteLinkBlock(data);
            if (response.status === 201) {
                const newBlocks = response.data;
                for (const block of newBlocks) {
                    await this.saveBlock(block);
                }
                dispatch('ShowBlocks');
            }
        } catch (err) {
            console.error(err);
        }
    }

    async updateCustomGridBlock({blockId, customGrid}) {
        try {
            const block = this.blocks.get(blockId);

            if (Object.values(customGrid.childrenPositions).length === 0) {
                customGrid.childrenPositions = block.childrenPositions;
            } else {
                const {id, childPosition} = customGrid.childrenPositions;

                block.childrenPositions[id] = childPosition;
                customGrid.childrenPositions = block.childrenPositions;
            }
            if (!customGrid.grid) customGrid.grid = block.grid;
            if (!customGrid.contentPosition) customGrid.contentPosition = block.contentPosition;
            const response = await api.updateBlock(blockId, {data: {customGrid}});
            if (response.status === 200) {
                const updatedBlock = response.data;
                await this.saveBlock(updatedBlock);
                dispatch('ShowBlocks');
            }
        } catch (err) {
            console.error(err);
        }
    }

    async updateDataBlock({blockId, data}) {
        try {
            const block = this.blocks.get(blockId);

            if (!block.data.customClasses) block.data.customClasses = [];
            if (data.gap) {
                block.data.customClasses = block.data.customClasses.filter((cls) => !cls.startsWith('gap_'));
                block.data.customClasses.push(data.gap);
            }
            if (data.color) {
                block.data.color = data.color;
            }
            if (data.customGrid) {
                block.data.customGrid = data.customGrid;
            }

            const response = await api.updateBlock(blockId, {data: block.data});
            if (response.status === 200) {
                const updatedBlock = response.data;
                await this.saveBlock(updatedBlock);
                dispatch('ShowBlocks');
                this.jsPlumbInstance.repaintEverything();
            }
        } catch (err) {
            console.error(err);
        }
    }

    async textUpdate({blockId, text}) {
        try {
            const response = await api.updateBlock(blockId, {data: {text}});
            if (response.status === 200) {
                const updatedBlock = response.data;
                await this.saveBlock(updatedBlock);
                dispatch('ShowBlocks');
            }
        } catch (err) {
            console.error(err);
        }
    }

    async titleUpdate({blockId, title}) {
        try {
            const response = await api.updateBlock(blockId, {title});
            if (response.status === 200) {
                const updatedBlock = response.data;
                await this.saveBlock(updatedBlock);
                dispatch('ShowBlocks');
            }
        } catch (err) {
            console.error(err);
        }
    }


    SetIframe({blockId, src}) {
        api.updateBlock(blockId, {
            data: {
                view: 'iframe',
                text: '',
                attributes: [
                    {name: 'sandbox', value: 'allow-scripts allow-same-origin allow-forms'},
                    {name: 'src', value: src}
                ],
            }
        }).then((res) => {
            if (res.status === 200) {
                const updatedBlock = res.data;
                this.saveBlock(updatedBlock);
                dispatch('ShowBlocks');
            }
        })

    }

    async hueUpdate({blockId, hue}) {
        try {
            const color = hue === 'default_color' ? hue : [hue, 0, 0, 0];
            const response = await api.updateBlock(blockId, {data: {color}});
            if (response.status === 200) {
                const updatedBlock = response.data;
                await this.saveBlock(updatedBlock);
                dispatch('ShowBlocks');
            }
        } catch (err) {
            console.error(err);
        }
    }

    async addConnectionBlock({sourceId, targetId, connector, label}) {
        try {
            const sourceBlock = this.blocks.get(sourceId);
            if (!sourceBlock.data.connections) sourceBlock.data.connections = [];

            // Проверяем, существует ли уже соединение с такими же sourceId и targetId
            const existingConnection = sourceBlock.data.connections.find(
                connection => connection.sourceId === sourceId && connection.targetId === targetId
            );

            if (existingConnection) {
                // Если соединение существует, обновляем его свойства
                existingConnection.connector = connector;
                existingConnection.label = label;
            } else {
                // Если соединение не найдено, добавляем новое
                sourceBlock.data.connections.push({sourceId, targetId, connector, label});
            }

            const response = await api.updateBlock(sourceId, {data: sourceBlock.data});
            if (response.status === 200) {
                const updatedBlock = response.data;
                await this.saveBlock(updatedBlock);
                dispatch('ShowBlocks');
            }
        } catch (err) {
            console.error(err);
        }
    }

    async removeConnectionBlock({sourceId, targetId}) {
        console.log(sourceId, targetId)
        try {
            const sourceBlock = this.blocks.get(sourceId);
            sourceBlock.data.connections = sourceBlock.data.connections.filter((el) => el.targetId !== targetId);

            const response = await api.updateBlock(sourceId, {data: sourceBlock.data});
            if (response.status === 200) {
                const updatedBlock = response.data;
                await this.saveBlock(updatedBlock);
                // No need to emit 'ShowBlocks' if the UI updates connections separately
            }
        } catch (err) {
            console.error(err);
        }
    }

    // Event handling methods
    onResize() {
        if (!this.timeoutId) {
            this.timeoutId = setTimeout(() => {
                this.jsPlumbInstance.repaintEverything();
                this.painter.render(this.blocks, this.path.at(-1));
                this.timeoutId = null;
            }, 100);
        }
    }

    paintPath(path) {
        const navElem = document.getElementById('breadcrumb')
        navElem.innerHTML = ''
        const list = generateBreadcrumbs(path)
        navElem.appendChild(list)
    }

    getAllChildIds(block) {
        const removesIds = [];

        const traverse = (currentBlock) => {
            if (!currentBlock || !currentBlock.children) return;
            for (const childId of currentBlock.children) {
                removesIds.push(childId);
                traverse(this.blocks.get(childId));
            }
        };

        traverse(block);
        return removesIds;
    }

}


function generateBreadcrumbs(items) {
    const list = document.createElement('ul');

    items.forEach((item, index) => {
        const listItem = document.createElement('li');
        const link = document.createElement('div');
        link.elementId = item.id;
        link.textContent = item.screenName;
        listItem.appendChild(link)
        list.appendChild(listItem);
    });

    return list;
}

import localforage from "localforage";
import {dispatch, printTimer, resetTimer} from "../utils/utils";
import {Painter} from "../painter/painter";
import api from "../api/api";

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
            const publicBlocks = await api.getRootBlock();
            await this.initUser(publicBlocks, 'anonim');
            dispatch('ShowBlocks');
        });

        window.addEventListener('InitUser', async (e) => {
            const blocks = await api.getRootBlock();
            await this.initUser(blocks, e.detail.user);
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
            this.removeBlock(e.detail);
        });

        window.addEventListener('Login', async (e) => {
            const blocks = await api.getRootBlock();
            await this.initUser(blocks, e.detail.user);
            dispatch('ShowBlocks');
        });

        window.addEventListener('Logout', async () => {
            await localforage.setItem('currentUser', 'anonim');
            dispatch('ShowBlocks');
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

        window.addEventListener('resize', () => this.onResize());
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
        this.blocks.set(block.id, block)
        this.blockRepository.saveBlock(block);
    }

    async deleteBlock(blockId) {
        await this.blockRepository.deleteBlock(blockId);
        this.blocks.delete(blockId);
    }

    // Initialization
    async initUser(blocks, user) {
        this.currentUser = user;
        this.blockRepository = new BlockRepository(this.currentUser);

        await localforage.setItem('currentUser', user);

        // Assuming blocks is a Map or an array of block objects
        for (const block of blocks.values()) {
            this.saveBlock(block);
        }

        // Initialize path with the root block
        const rootBlock = blocks.get('root');
        const color = rootBlock.data?.color !== 'default_color' ? rootBlock.data.color : [];
        const titleBlock = rootBlock.title;

        this.path = [{screenName: titleBlock, color: color, blockId: rootBlock.id}];
        await localforage.setItem(`Path_${this.currentUser}`, this.path);
    }

    async getAllBlocksForUser(username) {
        const keys = await localforage.keys();
        const pattern = new RegExp(`^Block_.*_${username}$`);
        const blockKeys = keys.filter((key) => pattern.test(key));
        const blockPromises = blockKeys.map((key) => localforage.getItem(key));
        const blocks = await Promise.all(blockPromises);

        blocks.forEach((block) => {
            this.blocks.set(block.id, block)
        })
    }

    async showBlocks() {
        this.currentUser = await localforage.getItem('currentUser') || 'anonim';
        this.blockRepository = new BlockRepository(this.currentUser);
        if (!this.blocks.size) {
            await this.getAllBlocksForUser(this.currentUser)
        }
        this.path = await localforage.getItem(`Path_${this.currentUser}`) || [];
        const screenObj = this.path.at(-1);

        // Load blocks for the current screen
        // await this.loadBlocksForScreen(screenObj);
        this.painter.render(this.blocks, screenObj);

        dispatch('ShowedBlocks');
    }

    // Block manipulation methods
    async openBlock({id, parentHsl, isIframe}) {
        const currentScreen = this.path.at(-1);
        const block = this.blocks.get(id);
        const title = block.title;

        if (currentScreen.blockId === block.id) {
            if (this.path.length === 1) return;
            this.path.pop();
        } else {
            this.path.push({screenName: title, color: parentHsl, blockId: id});
        }

        if (!isIframe) {
            // await this.loadBlocksForScreen(this.path.at(-1));
            this.painter.render(this.blocks, this.path.at(-1));
        } else {
            // Handle iframe logic if necessary
        }
        await this.savePath();
    }

    async savePath() {
        await localforage.setItem(`Path_${this.currentUser}`, this.path);
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

    async removeBlock({removeId, parentId}) {
        try {
            const response = await api.removeBlock({removeId, parentId});
            if (response.status === 200) {
                await this.saveBlock(response.data);
                dispatch('ShowBlocks');
            }
        } catch (err) {
            console.error(err);
        }
    }

    async pasteBlock({dest, src}) {
        try {
            const response = await api.pasteBlock({dest, src});
            if (response.status === 200) {
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

    async pasteLinkBlock(data) {
        try {
            const response = await api.pasteLinkBlock(data);
            if (response.status === 200) {
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

    async addConnectionBlock({sourceId, targetId, arrowType, label}) {
        try {
            const sourceBlock = this.blocks.get(sourceId);
            console.log(sourceBlock)
            if (!sourceBlock.data.connections) sourceBlock.data.connections = [];
            sourceBlock.data.connections.push({sourceId, targetId, arrowType, label});

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
}

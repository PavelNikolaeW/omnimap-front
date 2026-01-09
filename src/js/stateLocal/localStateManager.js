import localforage from "localforage";
import {dispatch} from "../utils/utils";
import {Painter} from "../painter/painter";
import api from "../api/api";

import {isExcludedElement, truncate, normalizeParentId} from '../utils/functions'
import {jsPlumbInstance} from "../controller/arrowManager";
import {customConfirm} from "../utils/custom-dialog";
import {treeService} from "../services/treeService";
import {treeValidator} from "./treeValidator";
import {offlineQueue} from "../sincManager/offlineQueue";

/**
 * Экранирует специальные символы RegExp в строке
 * @param {string} string - Исходная строка
 * @returns {string} Экранированная строка
 */
function escapeRegExp(string) {
    if (typeof string !== 'string') {
        return String(string ?? '');
    }
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
        await localforage.setItem(key, {
            id: block.id,
            data: block.data,
            children: block.children,
            parent_id: block.parent_id,
            title: block.title,
            updated_at: block.updated_at
        });
    }

    async loadBlock(blockId) {
        const key = this.getKey(blockId);
        return await localforage.getItem(key);
    }

    async deleteBlock(blockId) {
        const key = this.getKey(blockId);
        console.log('remove', key)
        await localforage.removeItem(key);
    }
}


export class LocalStateManager {
    constructor() {
        this.rootContainer = document.getElementById('rootContainer');
        this.currentUser = null;
        this.path = [];
        this.blocks = new Map();
        this.jsPlumbInstance = jsPlumbInstance;
        this.painter = new Painter();
        this.blockRepository = null;
        this.debounceTimer = undefined
        // Инициализация слушателей событий
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

        window.addEventListener('LoadTrees', async (e) => {
            const treeBlocks = await api.getTreeBlocks();

            // Обновляем treeIds в localforage
            if (this.currentUser) {
                await localforage.setItem(`treeIds${this.currentUser}`, treeBlocks.treeIds);
            }

            // Сохраняем все блоки
            for (const block of treeBlocks.blocks.values()) {
                await this.saveBlock(block);
            }
            dispatch('ShowBlocks');
        })

        window.addEventListener('OpenBlock', (e) => {
            this.openBlock(e.detail);
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

        window.addEventListener('UpdateConnectionBlock', (e) => {
            this.updateConnectionBlock(e.detail);
        });

        window.addEventListener('UpdateCustomGridBlock', (e) => {
            this.updateCustomGridBlock(e.detail);
        });

        window.addEventListener('UpdateBlockStyles', (e) => {
            this.updateBlockStyles(e.detail);
        });

        window.addEventListener('CreateBlock', (e) => {
            this.createBlock(e.detail);
        });
        window.addEventListener('IframeCreate', (e) => {
            this.iframeCreate(e.detail);
        });

        window.addEventListener('Login', async (e) => {
            const treeBlocks = await api.getTreeBlocks();
            console.log(treeBlocks)
            await this.initUser(treeBlocks, e.detail.user);
            dispatch('ShowBlocks');
            const sidebar = document.getElementById('sidebar')
            const topSidebar = document.getElementById('topSidebar')
            sidebar.classList.remove('hidden')
            topSidebar.classList.remove('hidden')
        });

        window.addEventListener('Logout', async () => {
            // Очищаем URL если есть параметры
            if (window.location.search || window.location.hash) {
                window.history.replaceState({}, '', window.location.pathname);
            }

            // Очищаем данные текущего пользователя из памяти
            this.blocks.clear();
            this.currentUser = null;
            this.currentTree = null;
            this.path = [];

            // Очищаем данные из IndexedDB
            await localforage.removeItem('currentTree');
            await localforage.removeItem('currentUser');

            // Скрываем UI элементы
            const sidebar = document.getElementById('sidebar');
            const topSidebar = document.getElementById('topSidebar');
            if (sidebar) sidebar.classList.add('hidden');
            if (topSidebar) topSidebar.classList.add('hidden');

            // Проверяем, онлайн ли мы
            const isOnline = navigator.onLine;

            if (isOnline) {
                // Онлайн: загружаем публичные блоки
                dispatch('InitAnonimUser');
            } else {
                // Офлайн: показываем пустой экран с сообщением
                this.showOfflineLogoutScreen();
            }
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
            this.setIframe(e.detail);
        });
        window.addEventListener('DeleteTreeBlock', (e) => {
            this.deleteTreeBlock(e.detail)
        });
        window.addEventListener('DeleteMultipleTreeBlocks', (e) => {
            this.deleteMultipleTreeBlocks(e.detail)
        });
        window.addEventListener('CreateTree', (e) => {
            this.createTree(e.detail)
        });

        window.addEventListener('HistoryRevert', (e) => {
            this.historyRevert(e.detail)
        })

        window.addEventListener('resize', () => {
            if (! isExcludedElement(document.activeElement, 'localStateManager')) {
                console.log('resize')
                this.onResize();
            }
        });
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
        window.addEventListener('WebSocUpdateBlock', async (e) => {
            await this.webSocUpdateBlock(e.detail);
        })
        window.addEventListener('WebSocUpdateBlockAccess', async (e) => {
            await this.WebSocUpdateBlockAccess(e.detail)
        })
        window.addEventListener('ResetState', async (e) => this.resetState())
        window.addEventListener('CreateLink', async (e) => {
            if (await customConfirm('Блок и все его дочерние блоки станут доступными для тех у кого есть ссылка или id блоков')) {
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
        window.addEventListener('UpdateBlocks', (e) => {
            const data = e.detail
            data.blocks?.forEach(async (block) => {
                // Защита: пропускаем блоки без id
                if (!block?.id) {
                    console.warn('⚠️ UpdateBlocks: skipping block without id:', block);
                    return;
                }
                await this.saveBlock(block)
            })
            data.removed?.forEach(async (blockId) => {
                await this.removeBlock(blockId)

            })
            this.showBlocks()
        })
        window.addEventListener('UpdateBlockImage', (e) => {
            this.updateBlockImage(e.detail)
        })
        window.addEventListener('ValidateTree', () => {
            this.validateTree()
        })
        window.addEventListener('RepairTree', () => {
            this.repairTree()
        })
        // Обработка синхронизированного блока
        window.addEventListener('BlockSynced', (e) => {
            this.handleBlockSynced(e.detail)
        })
        // Обработка завершения batch import после офлайн синхронизации
        window.addEventListener('BatchImportCompleted', (e) => {
            this.handleBatchImportCompleted(e.detail)
        })
    }

    /**
     * Обрабатывает синхронизированный блок с сервера
     * @param {Object} detail - {block}
     */
    async handleBlockSynced({block}) {
        if (block) {
            await this.saveBlock(block);
            // Не вызываем ShowBlocks здесь, чтобы избежать лишних перерисовок
        }
    }

    /**
     * Обрабатывает завершение batch import после офлайн синхронизации
     * Мержит данные с сервера с локальными данными
     * @param {Object} detail - {blocks, deletedIds}
     */
    async handleBatchImportCompleted({blocks, deletedIds}) {
        console.group('🔄 BatchImportCompleted');
        console.log('Blocks from server:', blocks?.length || 0);
        console.log('Deleted IDs:', deletedIds);

        // Удаляем блоки, которые были удалены офлайн
        for (const id of (deletedIds || [])) {
            if (this.blocks.has(id)) {
                console.log('Deleting block:', id);
                this.blocks.delete(id);
                await this.blockRepository.deleteBlock(id);
            }
        }

        // Мержим данные с сервера с локальными
        if (blocks && Array.isArray(blocks)) {
            for (const serverBlock of blocks) {
                // Пропускаем блоки без id
                if (!serverBlock?.id) {
                    console.warn('⚠️ Skipping block without id from server:', serverBlock);
                    continue;
                }
                const localBlock = this.blocks.get(serverBlock.id);

                if (localBlock) {
                    // Мержим: сервер имеет приоритет для основных полей,
                    // но сохраняем локальный childOrder если сервер его не прислал
                    const mergedBlock = {
                        ...localBlock,
                        ...serverBlock,
                        data: {
                            ...localBlock.data,
                            ...serverBlock.data,
                            // Сохраняем локальный childOrder если серверный пустой или отсутствует
                            childOrder: (serverBlock.data?.childOrder?.length > 0)
                                ? serverBlock.data.childOrder
                                : (localBlock.data?.childOrder || serverBlock.children || [])
                        }
                    };

                    // Синхронизируем childOrder с children
                    if (mergedBlock.children && mergedBlock.data.childOrder) {
                        // childOrder должен содержать только те ID, которые есть в children
                        mergedBlock.data.childOrder = mergedBlock.data.childOrder
                            .filter(id => mergedBlock.children.includes(id));
                        // Добавляем недостающие children в конец childOrder
                        for (const childId of mergedBlock.children) {
                            if (!mergedBlock.data.childOrder.includes(childId)) {
                                mergedBlock.data.childOrder.push(childId);
                            }
                        }
                    }

                    console.log('Merging block:', serverBlock.id,
                        'children:', mergedBlock.children?.length || 0,
                        'childOrder:', mergedBlock.data?.childOrder?.length || 0);
                    await this.saveBlock(mergedBlock);
                } else {
                    // Новый блок - сохраняем как есть
                    console.log('Saving new block:', serverBlock.id);
                    await this.saveBlock(serverBlock);
                }
            }
        }

        console.groupEnd();
        dispatch('ShowBlocks');
    }

    async updateBlockImage({blockId, imageData}) {
        try {
            const block = this.blocks.get(blockId);
            if (!block) {
                console.warn(`Block ${blockId} not found`);
                return;
            }

            // Обновляем данные блока с информацией об изображении
            if (imageData) {
                block.data.image = {
                    url: imageData.url,
                    thumbnail_url: imageData.thumbnail_url,
                    filename: imageData.filename,
                    width: imageData.width,
                    height: imageData.height,
                    size: imageData.size
                };
            } else {
                // Удаляем информацию об изображении
                delete block.data.image;
            }

            await this.saveBlock(block);
            dispatch('ShowBlocks');
        } catch (err) {
            console.error('Ошибка обновления изображения блока:', err);
        }
    }

    /**
     * Создание нового дерева
     */
    async createTree({title}) {
        // Офлайн режим
        if (!offlineQueue.isNetworkOnline()) {
            await this.createTreeOffline({title});
            return;
        }

        try {
            const res = await api.createTree(title)
            if (res.status === 201) {
                const block = res.data
                await treeService.addTree(block.id)
                await this.saveBlock(block)
                this.showBlocks()
            }
        } catch (error) {
            // При ошибке сети создаём локально
            if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
                await this.createTreeOffline({title});
            } else {
                console.error('Failed to create tree:', error)
            }
        }
    }

    /**
     * Создаёт дерево локально в офлайн режиме
     */
    async createTreeOffline({title}) {
        // Генерируем реальный UUID сразу
        const blockId = offlineQueue.generateBlockId();

        // Регистрируем блок как pending (ожидающий синхронизации)
        offlineQueue.registerPendingBlock(blockId);

        // Создаём блок-дерево с реальным ID
        const newBlock = {
            id: blockId,
            title: title || 'Новое дерево',
            parent_id: null,
            children: [],
            data: {},
            updated_at: new Date().toISOString()
        };

        // Сохраняем блок
        await this.saveBlock(newBlock);

        // Добавляем в treeService
        await treeService.addTree(blockId);

        // Добавляем в очередь синхронизации
        await offlineQueue.enqueue({
            type: 'createTree',
            data: { blockId, title }
        });

        this.showBlocks();
        console.log('Tree created:', blockId, offlineQueue.isNetworkOnline() ? '(syncing)' : '(offline)');
    }

    /**
     * Удаление блока и всех его потомков (Optimistic UI)
     */
    async deleteTreeBlock({blockId}) {
        if (!await customConfirm(`Вы уверены, что хотите удалить блок и всех его потомков?`)) return

        await treeService.refresh()
        const isRootTree = treeService.isRootTree(blockId)

        // Нельзя удалить последнее дерево
        if (isRootTree && treeService.count === 1) {
            alert('Нельзя удалить последнее дерево')
            return
        }

        const block = this.blocks.get(blockId)
        if (!block) return

        // Проверяем, является ли блок pending (создан локально, но не на сервере)
        const isPending = offlineQueue.isPendingBlock(blockId);

        // Optimistic UI: сначала удаляем локально для мгновенного отклика
        const deletedBlocks = new Map(); // Сохраняем для возможного rollback
        const allChildIds = this.getAllChildIds(block);

        // Собираем все pending блоки среди удаляемых
        const pendingBlockIds = new Set();
        for (const id of allChildIds) {
            if (offlineQueue.isPendingBlock(id)) {
                pendingBlockIds.add(id);
            }
        }

        // Сохраняем копии для rollback
        for (const id of allChildIds) {
            const b = this.blocks.get(id);
            if (b) deletedBlocks.set(id, {...b});
        }

        // Сохраняем родительский блок для rollback
        const parentBlock = this.blocks.get(block.parent_id);
        const parentBackup = parentBlock ? {
            ...parentBlock,
            children: [...(parentBlock.children || [])],
            data: {...parentBlock.data, childOrder: [...(parentBlock.data?.childOrder || [])]}
        } : null;

        // Удаляем из treeService если это корневой блок
        if (isRootTree) {
            await treeService.removeTree(blockId)
        }

        // Обновляем родительский блок (удаляем из children и childOrder)
        if (parentBlock) {
            if (parentBlock.children) {
                parentBlock.children = parentBlock.children.filter(id => id !== blockId);
            }
            if (parentBlock.data?.childOrder) {
                parentBlock.data.childOrder = parentBlock.data.childOrder.filter(id => id !== blockId);
            }
            await this.saveBlock(parentBlock);
        }

        // Удаляем блок и всех потомков из кеша
        for (const id of allChildIds) {
            this.blockRepository.deleteBlock(id);
            this.blocks.delete(id);
        }

        // Отменяем pending статус для удаляемых блоков
        offlineQueue.cancelPendingBlocks(pendingBlockIds);

        dispatch('ShowBlocks');

        // Если блок pending - не вызываем API, просто добавляем в очередь удаления
        // Import API обработает это: блок не будет создан, родитель обновится
        if (isPending) {
            console.log('Block is pending, skipping API delete:', blockId);
            await offlineQueue.enqueue({
                id: `delete_${blockId}_${Date.now()}`,
                type: 'deleteBlock',
                data: { id: blockId, parentId: block.parent_id }
            });
            return;
        }

        // Проверяем сеть
        if (!offlineQueue.isNetworkOnline()) {
            await offlineQueue.enqueue({
                id: `delete_${blockId}_${Date.now()}`,
                type: 'deleteBlock',
                data: { id: blockId, parentId: block.parent_id }
            });
            console.log('Block delete queued for sync:', blockId);
            return;
        }

        // Синхронизируем с сервером
        try {
            const res = await api.removeTree(blockId)
            if (res.status === 200) {
                // Обновляем родительский блок данными с сервера
                if (res.data.parent?.id) {
                    await this.saveBlock(res.data.parent)
                    dispatch('ShowBlocks');
                }
            }
        } catch (error) {
            if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
                await offlineQueue.enqueue({
                    id: `delete_${blockId}_${Date.now()}`,
                    type: 'deleteBlock',
                    data: { id: blockId, parentId: block.parent_id }
                });
                console.log('Block delete queued for sync:', blockId);
            } else {
                // Rollback при других ошибках
                console.error('Delete failed, rolling back:', error);
                await this.rollbackDeleteBlock(deletedBlocks, parentBackup, isRootTree, blockId);
            }
        }
    }

    /**
     * Откатывает удаление блока при ошибке
     */
    async rollbackDeleteBlock(deletedBlocks, parentBackup, isRootTree, blockId) {
        // Восстанавливаем все удалённые блоки
        for (const [id, block] of deletedBlocks) {
            await this.saveBlock(block);
        }

        // Восстанавливаем родительский блок
        if (parentBackup) {
            await this.saveBlock(parentBackup);
        }

        // Восстанавливаем в treeService если это было дерево
        if (isRootTree) {
            await treeService.addTree(blockId);
        }

        dispatch('ShowBlocks');
        dispatch('ShowError', { message: 'Не удалось удалить блок' });
    }

    /**
     * Удаление нескольких блоков с одним подтверждением
     * @param {Object} params
     * @param {Array<string>} params.blockIds - массив ID блоков для удаления
     */
    async deleteMultipleTreeBlocks({blockIds}) {
        if (!blockIds || blockIds.length === 0) return

        const count = blockIds.length
        const message = count === 1
            ? `Вы уверены, что хотите удалить блок и всех его потомков?`
            : `Вы уверены, что хотите удалить ${count} блоков и всех их потомков?`

        if (!await customConfirm(message)) return

        try {
            await treeService.refresh()

            // Собираем ID корневых деревьев для batch-удаления
            const rootTreeIds = blockIds.filter(id => treeService.isRootTree(id))

            // Отслеживаем успешные и неуспешные удаления
            const results = {success: [], failed: []}

            // Удаляем каждый блок с сервера и из кеша
            for (const blockId of blockIds) {
                const success = await this._deleteBlockFromServer(blockId)
                if (success) {
                    results.success.push(blockId)
                } else {
                    results.failed.push(blockId)
                }
            }

            // Batch-удаление корневых деревьев через treeService
            // Удаляем только те, которые успешно удалены с сервера
            const successfulRootTreeIds = rootTreeIds.filter(id => results.success.includes(id))
            if (successfulRootTreeIds.length > 0) {
                await treeService.removeMultipleTrees(successfulRootTreeIds)
            }

            // Логируем результаты
            if (results.failed.length > 0) {
                console.warn(`Не удалось удалить ${results.failed.length} блоков:`, results.failed)
            }

            this.showBlocks()
        } catch (error) {
            console.error('Ошибка при batch-удалении блоков:', error)
            // Показываем блоки в любом случае, чтобы обновить UI
            this.showBlocks()
        }
    }

    /**
     * Удаление блока с сервера и из локального кеша
     * @param {string} blockId - ID блока для удаления
     * @returns {Promise<boolean>} - true если удаление успешно
     * @private
     */
    async _deleteBlockFromServer(blockId) {
        const block = this.blocks.get(blockId)
        // Блок мог быть уже удалён как дочерний другого блока
        if (!block) {
            return true // Считаем успехом, так как блока уже нет
        }

        try {
            const res = await api.removeTree(blockId)
            if (res.status === 200) {
                // Обновляем родительский блок
                if (res.data.parent?.id) {
                    await this.saveBlock(res.data.parent)
                }

                // Удаляем блок и всех потомков из локального кеша
                const childIds = this.getAllChildIds(block)
                for (const id of childIds) {
                    await this.blockRepository.deleteBlock(id)
                    this.blocks.delete(id)
                }

                return true
            }
            console.warn(`Неожиданный статус ответа при удалении блока ${blockId}:`, res.status)
        } catch (error) {
            console.error(`Ошибка при удалении блока ${blockId}:`, error)
        }

        return false
    }

    /**
     * Безопасно парсит JSON, возвращает значение по умолчанию при ошибке
     * @param {string} jsonString - JSON строка
     * @param {*} defaultValue - Значение по умолчанию
     * @returns {*} Распарсенный объект или значение по умолчанию
     */
    _safeJsonParse(jsonString, defaultValue = null) {
        if (typeof jsonString !== 'string') {
            return jsonString ?? defaultValue;
        }
        try {
            return JSON.parse(jsonString);
        } catch (error) {
            console.error('LocalStateManager: invalid JSON:', error.message);
            return defaultValue;
        }
    }

    async WebSocUpdateBlockAccess(message) {
        if (!message?.start_block_ids || !Array.isArray(message.start_block_ids)) {
            console.warn('LocalStateManager: invalid WebSocUpdateBlockAccess message');
            return;
        }

        const start_block_ids = message.start_block_ids;
        const newBlocks = [];

        for (let i = 0; i < start_block_ids.length; i++) {
            const block = start_block_ids[i];
            if (!block?.id) continue;

            const data = this._safeJsonParse(block.data, {});
            const children = this._safeJsonParse(block.children, []);

            const newBlock = {
                id: block.id,
                updated_at: new Date(block.updated_at * 1000).toISOString(),
                title: block.title,
                data,
                children
            };

            await this.saveBlock(newBlock);
            newBlocks.push(newBlock);
        }

        if (newBlocks.length > 0) {
            this.updateScreen(newBlocks);
        }
    }

    async webSocUpdateBlock(newBlocks) {
        if (!Array.isArray(newBlocks) || newBlocks.length === 0) return;

        const processedBlocks = [];

        for (const block of newBlocks) {
            if (!block?.id) continue;

            try {
                if (block.deleted) {
                    // Получаем блок до удаления чтобы найти родителя
                    const localBlock = this.blocks.get(block.id);
                    const parentId = localBlock?.parent_id;

                    // Проверяем, находится ли пользователь на удаляемом блоке
                    const currentScreen = this.path?.at(-1);
                    const isOnDeletedBlock = currentScreen?.blockId === block.id;

                    // Удаляем только этот блок (дети придут отдельными deleted событиями)
                    await this.removeOneBlock(block.id);

                    // Если пользователь был на удалённом блоке — переходим к родителю
                    if (isOnDeletedBlock) {
                        console.log(`📍 Current block ${block.id} was deleted, navigating to parent`);
                        // Удаляем текущий экран из path
                        this.path.pop();

                        if (parentId && this.blocks.has(parentId)) {
                            // Переходим к родителю
                            const parentBlock = this.blocks.get(parentId);
                            const color = parentBlock.data?.color && parentBlock.data.color !== 'default_color' ? parentBlock.data.color : [];
                            this.path.push({
                                screenName: truncate(parentBlock.title, 10),
                                color: color,
                                blockId: parentId
                            });
                        } else if (this.path.length === 0 && this.currentTree) {
                            // Если path пустой, переходим к корню дерева
                            const rootBlock = this.blocks.get(this.currentTree);
                            if (rootBlock) {
                                const color = rootBlock.data?.color && rootBlock.data.color !== 'default_color' ? rootBlock.data.color : [];
                                this.path.push({
                                    screenName: truncate(rootBlock.title, 10),
                                    color: color,
                                    blockId: this.currentTree
                                });
                            }
                        }

                        // Сохраняем обновлённый path
                        await localforage.setItem(`Path_${this.currentTree}${this.currentUser}`, this.path);
                    }

                    // Удаляем удалённый блок из path (может быть выше по иерархии)
                    const deletedInPath = this.path.findIndex(p => p.blockId === block.id);
                    if (deletedInPath !== -1) {
                        // Обрезаем path до удалённого блока (не включая его)
                        this.path = this.path.slice(0, deletedInPath);
                        if (this.path.length === 0 && this.currentTree) {
                            const rootBlock = this.blocks.get(this.currentTree);
                            if (rootBlock) {
                                const color = rootBlock.data?.color && rootBlock.data.color !== 'default_color' ? rootBlock.data.color : [];
                                this.path.push({
                                    screenName: truncate(rootBlock.title, 10),
                                    color: color,
                                    blockId: this.currentTree
                                });
                            }
                        }
                        await localforage.setItem(`Path_${this.currentTree}${this.currentUser}`, this.path);
                    }

                    // Обновляем родительский блок локально (убираем удалённого ребёнка)
                    if (parentId) {
                        const parentBlock = this.blocks.get(parentId);
                        if (parentBlock) {
                            // Убираем из children
                            if (Array.isArray(parentBlock.children)) {
                                parentBlock.children = parentBlock.children.filter(id => id !== block.id);
                            }
                            // Убираем из childOrder
                            if (parentBlock.data?.childOrder) {
                                parentBlock.data.childOrder = parentBlock.data.childOrder.filter(id => id !== block.id);
                            }
                            await this.saveBlock(parentBlock);
                            // Добавляем родителя в processedBlocks чтобы перерисовать
                            processedBlocks.push(parentBlock);
                        }
                    }
                } else {
                    // Получаем локальный блок для проверки
                    const localBlock = this.blocks.get(block.id);
                    const isPending = offlineQueue.isPendingBlock(block.id);
                    const serverData = this._safeJsonParse(block.data, {});
                    const serverChildren = this._safeJsonParse(block.children, []);

                    // Если блок pending — проверяем, наше ли это изменение или чужое
                    if (isPending && localBlock) {
                        const isSameTitle = localBlock.title === block.title;
                        // Сортируем ключи для корректного сравнения (порядок свойств может отличаться)
                        const sortedStringify = (obj) => JSON.stringify(obj, Object.keys(obj || {}).sort());
                        const isSameData = sortedStringify(localBlock.data || {}) === sortedStringify(serverData);

                        // Сравниваем title и весь data объект
                        const isOwnUpdate = isSameTitle && isSameData;

                        if (isOwnUpdate) {
                            // Это наше изменение вернулось с сервера — пропускаем рендер
                            offlineQueue.resolvePendingBlock(block.id);

                            await this.saveBlock({
                                id: block.id,
                                updated_at: new Date(block.updated_at * 1000).toISOString(),
                                title: block.title,
                                data: serverData,
                                children: serverChildren,
                                parent_id: normalizeParentId(block.parent_id)
                            });

                            console.log(`⏭️ Own update confirmed, skipping render: ${block.id}`);
                            continue;
                        } else {
                            // Данные отличаются — это изменение от другого пользователя
                            // Снимаем pending и рендерим (last write wins)
                            offlineQueue.resolvePendingBlock(block.id);
                            console.warn(`⚠️ Concurrent edit detected for block ${block.id}, applying server version`);
                            // Продолжаем выполнение — блок будет сохранён и отрендерен ниже
                        }
                    }

                    // Если это корневой блок (дерево), добавляем через treeService
                    if (!block.parent_id) {
                        await treeService.refresh();
                        if (!treeService.hasTree(block.id)) {
                            await treeService.addTree(block.id);
                        }
                    }

                    const localData = localBlock?.data || {};

                    // Мёржим data: сервер имеет приоритет, но сохраняем локальный childOrder если серверный пустой
                    const mergedData = {
                        ...localData,
                        ...serverData,
                        // childOrder: берём серверный если он есть и не пустой, иначе локальный
                        childOrder: (serverData.childOrder?.length > 0)
                            ? serverData.childOrder
                            : (localData.childOrder || [])
                    };

                    // Синхронизируем childOrder с children
                    if (serverChildren.length > 0) {
                        // Фильтруем childOrder — только те ID, которые есть в children
                        mergedData.childOrder = mergedData.childOrder.filter(id => serverChildren.includes(id));
                        // Добавляем недостающие children в конец childOrder
                        for (const childId of serverChildren) {
                            if (!mergedData.childOrder.includes(childId)) {
                                mergedData.childOrder.push(childId);
                            }
                        }
                    }

                    await this.saveBlock({
                        id: block.id,
                        updated_at: new Date(block.updated_at * 1000).toISOString(),
                        title: block.title,
                        data: mergedData,
                        children: serverChildren,
                        parent_id: normalizeParentId(block.parent_id)
                    });
                }
                processedBlocks.push(block);
            } catch (error) {
                console.error('LocalStateManager: error processing block:', block.id, error);
            }
        }

        if (processedBlocks.length > 0) {
            this.updateScreen(processedBlocks);
        }
    }

    updateScreen(newBlocks) {
        for (let i = 0; i < newBlocks.length; i++) {
            const id = newBlocks[i].id
            const element = document.getElementById(id)
            if (element || document.querySelector(`[blocklink="${id}"]`)) {
                this.showBlocks()
                break
            }
        }
    }

    async resetState() {
        try {
            const user = await localforage.getItem('currentUser');
            if (!user) {
                console.warn('No current user found, cannot reset state');
                return;
            }

            // Экранируем username для защиты от RegExp injection
            const escapedUser = escapeRegExp(user);

            // Удаляем только данные текущего пользователя
            const keys = await localforage.keys();

            // Паттерны ключей для удаления
            const userPatterns = [
                new RegExp(`^Block_.*_${escapedUser}$`),     // Блоки пользователя
                new RegExp(`^Path_.*${escapedUser}$`),       // Пути навигации
                new RegExp(`^treeIds${escapedUser}$`),       // Список деревьев
                new RegExp(`^linkSlugTreeId${escapedUser}:`) // Ссылки
            ];

            const keysToRemove = keys.filter(key =>
                userPatterns.some(pattern => pattern.test(key))
            );

            // Удаляем все найденные ключи
            await Promise.all(keysToRemove.map(key => localforage.removeItem(key)));

            console.log(`Cleared ${keysToRemove.length} keys for user ${user}`);

            // Перезагружаем данные пользователя
            dispatch('Login', {user: user});
        } catch (err) {
            console.error('Ошибка при сбросе состояния:', err);
        }
    }

    /**
     * Валидация дерева блоков без исправления
     * @returns {Object} результат валидации
     */
    validateTree() {
        const result = treeValidator.validate(this.blocks);
        const cycles = treeValidator.detectCycles(this.blocks);

        console.group('🔍 Валидация дерева блоков');
        if (result.valid && cycles.length === 0) {
            console.log('✓ Дерево валидно');
        } else {
            if (result.issues.length > 0) {
                console.warn(`Найдено проблем: ${result.issues.length}`);
                console.table(result.issues.map(i => ({
                    type: i.type,
                    severity: i.severity,
                    blockId: i.blockId || '-',
                    message: i.message
                })));
            }
            if (cycles.length > 0) {
                console.error(`Найдено циклов: ${cycles.length}`);
                cycles.forEach((cycle, i) => {
                    console.error(`  Цикл ${i + 1}: ${cycle.join(' -> ')}`);
                });
            }
        }
        console.groupEnd();

        return { ...result, cycles };
    }

    /**
     * Валидация и автоматическое восстановление дерева блоков
     * @returns {Promise<Object>} результат восстановления с информацией о синхронизации
     */
    async repairTree() {
        console.group('🔧 Восстановление дерева блоков');

        // Удаляем блоки с undefined/null ключами (ошибочные записи)
        if (this.blocks.has(undefined)) {
            console.warn('⚠️ Удаляю блок с undefined ключом');
            this.blocks.delete(undefined);
        }
        if (this.blocks.has(null)) {
            console.warn('⚠️ Удаляю блок с null ключом');
            this.blocks.delete(null);
        }
        if (this.blocks.has('undefined')) {
            console.warn('⚠️ Удаляю блок с "undefined" ключом');
            this.blocks.delete('undefined');
        }

        const result = treeValidator.validateAndRepair(this.blocks);
        console.log(treeValidator.formatReport(result));

        // Добавляем результаты синхронизации в результат
        result.syncResult = { synced: 0, failed: 0, failedBlockIds: [] };

        if (result.repaired && result.repairs.modifiedBlocks.size > 0) {
            // Сохраняем исправленные блоки в IndexedDB
            console.log('Сохранение исправленных блоков...');
            const modifiedBlocks = [];
            for (const blockId of result.repairs.modifiedBlocks) {
                const block = this.blocks.get(blockId);
                if (block) {
                    if (this.blockRepository) {
                        await this.blockRepository.saveBlock(block);
                    }
                    modifiedBlocks.push(block);
                }
            }
            console.log(`✓ Сохранено ${result.repairs.modifiedBlocks.size} блоков в IndexedDB`);

            // Синхронизируем исправленные блоки с сервером
            console.log('Синхронизация с сервером...');
            for (const block of modifiedBlocks) {
                try {
                    const response = await api.updateBlock(block.id, {
                        data: block.data,
                        title: block.title
                    });
                    if (response.status === 200) {
                        result.syncResult.synced++;
                    } else {
                        result.syncResult.failed++;
                        result.syncResult.failedBlockIds.push(block.id);
                        console.warn(`Неожиданный статус ${response.status} для блока ${block.id}`);
                    }
                } catch (err) {
                    result.syncResult.failed++;
                    result.syncResult.failedBlockIds.push(block.id);
                    console.error(`Ошибка синхронизации блока ${block.id}:`, err.message || err);
                }
            }

            // Логируем результат синхронизации
            if (result.syncResult.failed > 0) {
                console.warn(`⚠ Не удалось синхронизировать ${result.syncResult.failed} блоков:`, result.syncResult.failedBlockIds);
                dispatch('ShowError', {message: `Восстановлено, но ${result.syncResult.failed} блоков не синхронизированы с сервером`});
            } else {
                console.log(`✓ Синхронизировано ${result.syncResult.synced} блоков с сервером`);
            }

            // Перерисовываем
            this.showBlocks();
        } else if (!result.repaired) {
            console.log('✓ Дерево блоков валидно, исправления не требуются');
        }

        console.groupEnd();
        return result;
    }

    /**
     * Автоматическая проверка и восстановление при загрузке
     * Вызывается в фоне, не блокирует UI
     */
    async autoRepairIfNeeded() {
        const validation = treeValidator.validate(this.blocks);
        if (!validation.valid) {
            console.warn(`⚠ Обнаружены проблемы в дереве блоков (${validation.issues.length}). Запускаем автовосстановление...`);
            await this.repairTree();
        }
    }

    async moveBlock({block_id, old_parent_id, new_parent_id, before}) {
        if (block_id === new_parent_id) return
        const newParent = this.blocks.get(new_parent_id)

        function reorderList(ids, id, idBefore) {
            const filteredIds = ids.filter(item => item !== id);
            const index = filteredIds.indexOf(idBefore);
            if (index !== -1) {
                filteredIds.splice(index, 0, id);
            } else {
                filteredIds.push(id);
            }
            return filteredIds;
        }

        if (!newParent) {
            console.error('New parent not found:', new_parent_id);
            return;
        }

        if (!newParent.data) newParent.data = {};
        const newOrder = reorderList(newParent.data.childOrder || [], block_id, before);

        // Optimistic UI: сначала перемещаем локально
        const block = this.blocks.get(block_id);
        const oldParent = this.blocks.get(old_parent_id);

        if (!block) {
            console.error('Block not found:', block_id);
            return;
        }

        // Сохраняем backup для rollback
        const blockBackup = {...block, parent_id: block.parent_id};
        const oldParentBackup = oldParent ? {...oldParent, children: [...(oldParent.children || [])], data: {...oldParent.data}} : null;
        const newParentBackup = {...newParent, children: [...(newParent.children || [])], data: {...newParent.data}};

        // Обновляем parent_id блока
        block.parent_id = new_parent_id;
        block.updated_at = new Date().toISOString();

        // Удаляем из старого родителя
        if (oldParent && oldParent.children) {
            oldParent.children = oldParent.children.filter(id => id !== block_id);
            if (oldParent.data?.childOrder) {
                oldParent.data.childOrder = oldParent.data.childOrder.filter(id => id !== block_id);
            }
            await this.saveBlock(oldParent);
        }

        // Добавляем в нового родителя и синхронизируем children с childOrder
        if (!newParent.children) newParent.children = [];
        if (!newParent.children.includes(block_id)) {
            newParent.children.push(block_id);
        }
        newParent.data.childOrder = newOrder;
        // Синхронизируем children с childOrder для правильного порядка
        newParent.children = newOrder.filter(id => newParent.children.includes(id));
        newParent.updated_at = new Date().toISOString();

        await this.saveBlock(block);
        await this.saveBlock(newParent);
        dispatch('ShowBlocks');

        // Проверяем сеть
        if (!offlineQueue.isNetworkOnline()) {
            await offlineQueue.enqueue({
                id: `move_${block_id}_${Date.now()}`,
                type: 'moveBlock',
                data: { blockId: block_id, oldParentId: old_parent_id, newParentId: new_parent_id, childOrder: newOrder }
            });
            console.log('Block move queued for sync:', block_id);
            return;
        }

        // Синхронизируем с сервером
        try {
            const res = await api.moveBlock(block_id, {new_parent_id, old_parent_id, childOrder: newOrder});
            if (res.status === 200) {
                // Обновляем блоки данными с сервера
                for (const serverBlock of Object.values(res.data)) {
                    // Защита: пропускаем блоки без id
                    if (!serverBlock?.id) {
                        console.warn('⚠️ moveBlock: skipping block without id:', serverBlock);
                        continue;
                    }
                    await this.saveBlock(serverBlock);
                }
                dispatch('ShowBlocks');
            }
        } catch (err) {
            if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
                await offlineQueue.enqueue({
                    id: `move_${block_id}_${Date.now()}`,
                    type: 'moveBlock',
                    data: { blockId: block_id, oldParentId: old_parent_id, newParentId: new_parent_id, childOrder: newOrder }
                });
                console.log('Block move queued for sync:', block_id);
            } else {
                // Rollback при других ошибках
                console.error('Move failed, rolling back:', err);
                await this.rollbackMoveBlock(blockBackup, oldParentBackup, newParentBackup);
            }
        }
    }

    /**
     * Откатывает перемещение блока при ошибке
     */
    async rollbackMoveBlock(blockBackup, oldParentBackup, newParentBackup) {
        await this.saveBlock(blockBackup);
        if (oldParentBackup) await this.saveBlock(oldParentBackup);
        await this.saveBlock(newParentBackup);
        dispatch('ShowBlocks');
        dispatch('ShowError', { message: 'Не удалось переместить блок' });
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
        if (!block) {
            console.error('Save block undefined');
            console.trace('saveBlock called with undefined');
            return;
        }
        if (!block.id) {
            console.error('Save block without id:', block);
            console.trace('saveBlock called without id');
            return;
        }
        this.blocks.set(block.id, block);
        if (this.blockRepository) {
            await this.blockRepository.saveBlock(block);
        } else {
            console.warn('BlockRepository not initialized, block saved only in memory:', block.id);
        }
    }

    async removeOneBlock(blockId) {
        const block = this.blocks.get(blockId);

        // Обновляем родителя если блок найден в памяти
        if (block) {
            const parentId = block.parent_id;
            if (parentId) {
                const parentBlock = this.blocks.get(parentId);
                if (parentBlock) {
                    if (Array.isArray(parentBlock.children)) {
                        parentBlock.children = parentBlock.children.filter(id => id !== blockId);
                    }
                    if (parentBlock.data?.childOrder) {
                        parentBlock.data.childOrder = parentBlock.data.childOrder.filter(id => id !== blockId);
                    }
                    this.blockRepository.saveBlock(parentBlock)
                }
            }
        }

        // Удаляем из treeIds если это корневой блок
        let treeIds = await localforage.getItem(`treeIds${this.currentUser}`);
        if (Array.isArray(treeIds)) {
            treeIds = treeIds.filter(id => id !== blockId);
            await localforage.setItem(`treeIds${this.currentUser}`, treeIds);
        }

        // Удаляем из памяти
        this.blocks.delete(blockId);

        // Всегда пытаемся удалить из IndexedDB (даже если блока нет в памяти)
        await this.blockRepository.deleteBlock(blockId);
    }

    // Corrected block and branch removal logic with parent update
    async removeBlock(blockId) {
        const block = this.blocks.get(blockId);
        if (!block) {
            console.warn(`Block ${blockId} not found`);
            return;
        }

        // Recursively remove children first
        this.removeBranch(block);

        // Attempt to update parent block using parent_id
        const parentId = block.parent_id;
        if (parentId) {
            const parentBlock = this.blocks.get(parentId);
            if (parentBlock) {
                if (Array.isArray(parentBlock.children)) {
                    parentBlock.children = parentBlock.children.filter(id => id !== blockId);
                }
                if (Array.isArray(parentBlock.childOrder)) {
                    parentBlock.data.childOrder = parentBlock.data.childOrder.filter(id => id !== blockId);
                }
            }
        }

        // Remove from treeIds in localforage
        let treeIds = await localforage.getItem(`treeIds${this.currentUser}`);
        if (Array.isArray(treeIds)) {
            treeIds = treeIds.filter(id => id !== blockId);
            await localforage.setItem(`treeIds${this.currentUser}`, treeIds);
        }

        // Remove from internal map and delete from repository
        this.blocks.delete(blockId);
        await this.blockRepository.deleteBlock(blockId);
    }

    removeBranch(block) {
        if (!block || !Array.isArray(block.children)) {
            console.warn(`Block ${block?.id} is invalid or has no children`);
            return;
        }

        for (const childId of block.children) {
            const childBlock = this.blocks.get(childId);
            this.removeBranch(childBlock);

            // Remove child from internal map and repository
            this.blocks.delete(childId);
            this.blockRepository.deleteBlock(childId).catch(err => {
                console.error(`Ошибка при удалении блока ${childId}:`, err);
            });
        }
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

        // Получаем существующие ключи блоков для этого пользователя
        const keys = await localforage.keys();
        const escapedUser = escapeRegExp(user);
        const pattern = new RegExp(`^Block_.*_${escapedUser}$`);
        const existingBlockKeys = new Set(keys.filter(key => pattern.test(key)));

        // Новые ключи с сервера
        const newBlockIds = new Set(blocks.keys());

        // Удаляем блоки, которых нет на сервере (stale blocks)
        const keysToDelete = [];
        for (const key of existingBlockKeys) {
            // Извлекаем blockId из ключа формата Block_{blockId}_{user}
            const match = key.match(/^Block_(.+)_[^_]+$/);
            if (match) {
                const blockId = match[1];
                if (!newBlockIds.has(blockId)) {
                    keysToDelete.push(key);
                }
            }
        }

        // Удаляем устаревшие блоки из IndexedDB
        if (keysToDelete.length > 0) {
            console.log(`🧹 Cleaning ${keysToDelete.length} stale blocks from IndexedDB`);
            await Promise.all(keysToDelete.map(key => localforage.removeItem(key)));
        }

        // Сохраняем блоки с await для гарантии записи в IndexedDB
        for (const block of blocks.values()) {
            await this.saveBlock(block);
        }

        // Initialize path with the root block
        for (let i = 0; i < treeIds.length; i++) {
            const tree = treeIds[i]
            const rootBlock = blocks.get(tree);
            if (!rootBlock) {
                console.warn(`Root block ${tree} not found in blocks`);
                continue;
            }
            const color = rootBlock.data?.color && rootBlock.data.color !== 'default_color' ? rootBlock.data.color : [];
            const titleBlock = rootBlock.title;

            const path = [{screenName: truncate(titleBlock, 10), color: color, blockId: rootBlock.id}];
            await localforage.setItem(`Path_${tree}${this.currentUser}`, path);
        }
        this.path = await localforage.getItem(`Path_${this.currentTree}${this.currentUser}`)

        // Уведомляем offlineQueue что данные загружены — следующий pull можно пропустить
        offlineQueue.markPullCompleted();
    }


    async getAllBlocksForUser(username) {
        const keys = await localforage.keys();
        // Экранируем username для защиты от RegExp injection
        const escapedUsername = escapeRegExp(username);
        const pattern = new RegExp(`^Block_.*_${escapedUsername}$`);
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

    async initShowLink(linkSlug, user) {
        let treeId = await localforage.getItem(`linkSlugTreeId${user}:${linkSlug}`)
        if (!treeId) {
            const res = await api.loadBlockUrl(linkSlug)

            if (res.status === 200 && res.data) {
                const blocks = Object.values(res.data)
                const block = blocks[0]
                const color = block.data?.color && block.data.color !== 'default_color' ? block.data.color : [];
                await localforage.setItem(`linkSlugTreeId${user}:${linkSlug}`, block.id)
                await localforage.setItem(`Path_${block.id}${user}`, [
                    {screenName: truncate(block.title, 10), color: color, blockId: block.id}
                ])

                for (let i = 0; i < blocks.length; i++) {
                    const block = blocks[i]
                    await this.saveBlock(block)
                }
                return block.id
            }
            if (res.status === 404) {
                console.error('Url не найден')
            }
        } else {
            return treeId
        }
    }

    async showBlocks() {
        this.currentUser = await localforage.getItem('currentUser') || 'anonim';
        this.blockRepository = new BlockRepository(this.currentUser);

        const isLinkView = window.location.search.length > 0;

        if (isLinkView) {
            // Просмотр по ссылке
            this.currentTree = await this.initShowLink(window.location.search.slice(1,), this.currentUser)
        } else {
            // Обычный режим — загружаем деревья пользователя
            const treeIds = await localforage.getItem(`treeIds${this.currentUser}`);
            const savedTree = await localforage.getItem('currentTree');

            // Проверяем, что сохранённое дерево принадлежит пользователю
            if (savedTree && treeIds && treeIds.includes(savedTree)) {
                this.currentTree = savedTree;
            } else if (treeIds && treeIds.length > 0) {
                // Используем первое дерево пользователя
                this.currentTree = treeIds[0];
                await localforage.setItem('currentTree', this.currentTree);
            } else {
                // Нет деревьев — нужна повторная инициализация
                this.currentTree = null;
            }
        }

        // Всегда загружаем блоки из IndexedDB если память пуста или блок текущего дерева отсутствует
        if (!this.blocks || this.blocks.size === 0 || (this.currentTree && !this.blocks.has(this.currentTree))) {
            await this.getAllBlocksForUser(this.currentUser);
            // Автоматическая проверка и восстановление после загрузки
            this.autoRepairIfNeeded();
        }

        this.path = await localforage.getItem(`Path_${this.currentTree}${this.currentUser}`) || [];
        let screenObj = this.path.at(-1);

        if (!screenObj) {
            const block = this.blocks.get(this.currentTree);
            // Если блок всё ещё не найден после загрузки, попробуем перезагрузить с сервера
            if (!block) {
                console.warn('Block not found in cache, reloading from server...');
                dispatch('LoadTrees');
                return;
            }
            screenObj = {
                screenName: truncate(block.title, 10),
                color: block.data?.color && block.data.color !== 'default_color' ? block.data.color : [],
                blockId: block.id
            }
            this.path.push(screenObj)
            await localforage.setItem(`Path_${this.currentTree}${this.currentUser}`, this.path)
        }

        // Проверяем наличие блока и перезагружаем если нужно
        if (!this.blocks.has(screenObj.blockId)) {
            await this.getAllBlocksForUser(this.currentUser);
            // Если блок всё ещё не найден, перезагружаем с сервера
            if (!this.blocks.has(screenObj.blockId)) {
                console.warn('Block still not found after cache reload, fetching from server...');
                dispatch('LoadTrees');
                return;
            }
        }

        this.painter.render(this.blocks, screenObj);
        dispatch('ShowedBlocks', {path: this.path, activeId: undefined});
    }

    async getPathPromise() {
        const tree = await localforage.getItem('currentTree')
        const user = await localforage.getItem('currentUser')
        if (window.location.href.indexOf('/?') !== -1) {
            const linkTree = await localforage.getItem(`linkSlugTreeId${user}:${window.location.search.slice(1,)}`)
            return await localforage.getItem(`Path_${linkTree}${user}`)
        } else {
            return await localforage.getItem(`Path_${tree}${user}`)
        }
    }

    getPath(callback) {
        localforage.getItem('currentTree', (err, tree) => {
            localforage.getItem('currentUser', (err, user) => {
                if (window.location.href.indexOf('/?') !== -1) {
                    localforage.getItem(`linkSlugTreeId${user}:${window.location.search.slice(1,)}`, (err, linkTree) => {
                        localforage.getItem(`Path_${linkTree}${user}`, callback)
                    })
                } else {
                    localforage.getItem(`Path_${tree}${user}`, callback)
                }
            })
        })
    }

    openBlock({id, parentHsl, isIframe, links}) {
        this.getPath((err, path) => {
            const currentScreen = path.at(-1)
            const block = this.blocks.get(id);
            const title = block.title;
            let activeId = undefined
            if (currentScreen.blockId === block.id) {
                if (path.length === 1) return;
                activeId = path.pop().blockId;
            } else {
                path.push({screenName: truncate(title, 10), color: parentHsl, blockId: id, links});
            }
            if (!isIframe) {
                this.painter.render(this.blocks, path.at(-1));
            } else {
                // Handle iframe logic if necessary
            }
            localforage.setItem(`Path_${this.currentTree}${this.currentUser}`, path)
            dispatch("ShowedBlocks", {path, activeId})
        })
    }

    async createBlock({parentId, title}) {
        // Генерируем реальный UUID сразу (не временный)
        const blockId = offlineQueue.generateBlockId();

        const parentBlock = this.blocks.get(parentId);
        if (!parentBlock) {
            console.error('Parent block not found:', parentId);
            return;
        }

        // Регистрируем блок как pending (ожидающий синхронизации)
        offlineQueue.registerPendingBlock(blockId);

        // Создаём блок с реальным ID
        const newBlock = {
            id: blockId,
            title: title || '',
            parent_id: parentId,
            children: [],
            data: { childOrder: [] },
            updated_at: new Date().toISOString()
        };

        // Обновляем родительский блок
        if (!parentBlock.children) parentBlock.children = [];
        if (!parentBlock.data) parentBlock.data = {};
        if (!parentBlock.data.childOrder) parentBlock.data.childOrder = [];

        // ВАЖНО: добавляем blockId в оба массива синхронно
        parentBlock.children.push(blockId);
        parentBlock.data.childOrder.push(blockId);

        // Обновляем timestamp родителя
        parentBlock.updated_at = new Date().toISOString();

        // Сохраняем локально и показываем сразу (мгновенный отклик)
        await this.saveBlock(newBlock);
        await this.saveBlock(parentBlock);
        dispatch('ShowBlocks');

        // Добавляем в очередь синхронизации (отправится через batch import)
        await offlineQueue.enqueue({
            type: 'createBlock',
            data: { blockId, parentId }
        });

        console.log('Block created:', blockId, offlineQueue.isNetworkOnline() ? '(syncing)' : '(offline)');
    }

    /**
     * Откатывает создание блока при ошибке
     */
    async rollbackCreateBlock(blockId, parentId) {
        // Удаляем блок
        this.blocks.delete(blockId);
        await this.blockRepository.deleteBlock(blockId);

        // Убираем из родительского блока (из children и childOrder)
        const parentBlock = this.blocks.get(parentId);
        if (parentBlock && parentBlock.children) {
            parentBlock.children = parentBlock.children.filter(id => id !== blockId);

            // Также убираем из childOrder
            if (parentBlock.data?.childOrder) {
                parentBlock.data.childOrder = parentBlock.data.childOrder.filter(id => id !== blockId);
            }
            await this.saveBlock(parentBlock);
        }

        dispatch('ShowBlocks');
        dispatch('ShowError', { message: 'Не удалось создать блок' });
    }

    async iframeCreate({parentId, src}) {
        const blockData = {
            view: 'iframe',
            attributes: [
                {name: 'sandbox', value: 'allow-scripts allow-same-origin allow-forms'},
                {name: 'src', value: src}
            ]
        };

        // Генерируем реальный UUID сразу
        const blockId = offlineQueue.generateBlockId();

        const parentBlock = this.blocks.get(parentId);
        if (!parentBlock) {
            console.error('Parent block not found:', parentId);
            return;
        }

        // Регистрируем блок как pending (ожидающий синхронизации)
        offlineQueue.registerPendingBlock(blockId);

        // Создаём iframe блок с реальным ID
        const newBlock = {
            id: blockId,
            title: '',
            parent_id: parentId,
            children: [],
            data: blockData,
            updated_at: new Date().toISOString()
        };

        // Обновляем родительский блок
        if (!parentBlock.children) parentBlock.children = [];
        parentBlock.children.push(blockId);

        // Синхронизируем childOrder с children
        if (!parentBlock.data) parentBlock.data = {};
        if (!parentBlock.data.childOrder) parentBlock.data.childOrder = [];
        parentBlock.data.childOrder.push(blockId);

        await this.saveBlock(newBlock);
        await this.saveBlock(parentBlock);
        dispatch('ShowBlocks');

        // Добавляем в очередь синхронизации
        await offlineQueue.enqueue({
            type: 'createBlock',
            data: { blockId, parentId }
        });

        console.log('Iframe created:', blockId, offlineQueue.isNetworkOnline() ? '(syncing)' : '(offline)');
    }

    async pasteBlock(data) {
        // Копирование недоступно в офлайн режиме
        if (!offlineQueue.isNetworkOnline()) {
            dispatch('ShowError', { message: 'Копирование блоков доступно только в онлайн режиме' });
            return;
        }

        if (data.src.length > 0) {
            try {
                const response = await api.pasteBlock(data);
                if (response.status === 200) {
                    const newBlocks = response.data;
                    for (const block of Object.values(newBlocks)) {
                        // Защита: пропускаем блоки без id
                        if (!block?.id) {
                            console.warn('⚠️ pasteBlock: skipping block without id:', block);
                            continue;
                        }
                        await this.saveBlock(block);
                    }
                    dispatch('ShowBlocks');
                }
            } catch (err) {
                if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
                    dispatch('ShowError', { message: 'Копирование блоков доступно только в онлайн режиме' });
                } else {
                    console.error(err);
                }
            }
        }
    }

    async pasteLinkBlock(data) {
        // Создание ссылок недоступно в офлайн режиме
        if (!offlineQueue.isNetworkOnline()) {
            dispatch('ShowError', { message: 'Создание ссылок доступно только в онлайн режиме' });
            return;
        }

        try {
            const response = await api.pasteLinkBlock(data);
            if (response.status === 201) {
                const newBlocks = response.data;
                for (const block of newBlocks) {
                    // Защита: пропускаем блоки без id
                    if (!block?.id) {
                        console.warn('⚠️ pasteLinkBlock: skipping block without id:', block);
                        continue;
                    }
                    await this.saveBlock(block);
                }
                dispatch('ShowBlocks');
            }
        } catch (err) {
            if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
                dispatch('ShowError', { message: 'Создание ссылок доступно только в онлайн режиме' });
            } else {
                console.error(err);
            }
        }
    }

    async updateCustomGridBlock({blockId, customGrid}) {
        // Optimistic UI: обновляем локально, синхронизация через batch import
        const block = await this.blockRepository.loadBlock(blockId);
        if (!block) {
            console.error(`Block ${blockId} not found`);
            return;
        }

        block.data.customGrid = customGrid;
        block.updated_at = new Date().toISOString();
        await this.saveBlock(block);

        // Регистрируем блок как pending для индикатора
        offlineQueue.registerPendingBlock(blockId);

        // Добавляем в очередь синхронизации
        await offlineQueue.enqueue({
            type: 'updateBlock',
            data: { id: blockId }
        });

        dispatch('ShowBlocks');
    }

    /**
     * Обновить кастомные стили блока
     * @param {string} blockId - ID блока
     * @param {Object} customStyles - Объект стилей (background, borderColor, border, shape, shadow)
     */
    async updateBlockStyles({blockId, customStyles}) {
        // Optimistic UI: обновляем локально, синхронизация через batch import
        const block = await this.blockRepository.loadBlock(blockId);
        if (!block) {
            console.error(`Block ${blockId} not found`);
            return;
        }

        block.data.customStyles = customStyles;
        block.updated_at = new Date().toISOString();
        await this.saveBlock(block);

        // Регистрируем блок как pending для индикатора
        offlineQueue.registerPendingBlock(blockId);

        // Добавляем в очередь синхронизации
        await offlineQueue.enqueue({
            type: 'updateBlock',
            data: { id: blockId }
        });

        dispatch('ShowBlocks');
    }

    updateDataBlock({blockId, data}) {
        try {
            const block = this.blocks.get(blockId);
            if (!block) throw new Error(`Block with id ${blockId} not found.`);

            api.updateBlock(blockId, {data: data}).then(res => {
                if (res.status === 200) {
                    const updatedBlock = res.data;
                    console.log(updatedBlock)
                    this.saveBlock(updatedBlock).then(() => dispatch('ShowBlocks'));
                }
            });

        } catch (err) {
            console.error(err);
        }
    }

    async textUpdate({blockId, text}) {
        // Optimistic UI: обновляем локально, синхронизация через batch import
        const block = this.blocks.get(blockId);
        if (!block) return;

        if (!block.data) block.data = {};
        block.data.text = text;
        block.updated_at = new Date().toISOString();
        await this.saveBlock(block);

        // Регистрируем блок как pending для индикатора
        offlineQueue.registerPendingBlock(blockId);

        // Добавляем в очередь синхронизации
        await offlineQueue.enqueue({
            type: 'updateBlock',
            data: { id: blockId }
        });

        dispatch('ShowBlocks');
    }


    historyRevert({block}) {
        console.log(block)
        this.saveBlock(block)
        this.showBlocks()
    }

    async titleUpdate({blockId, title}) {
        // Optimistic UI: обновляем локально, синхронизация через batch import
        const block = this.blocks.get(blockId);
        if (!block) return;

        block.title = title;
        block.updated_at = new Date().toISOString();
        await this.saveBlock(block);

        // Регистрируем блок как pending для индикатора
        offlineQueue.registerPendingBlock(blockId);

        // Добавляем в очередь синхронизации
        await offlineQueue.enqueue({
            type: 'updateBlock',
            data: { id: blockId }
        });

        dispatch('ShowBlocks');
    }

    async setIframe({blockId, src}) {
        // Optimistic UI: обновляем локально, синхронизация через batch import
        const block = this.blocks.get(blockId);
        if (!block) return;

        if (!block.data) block.data = {};
        block.data.view = 'iframe';
        block.data.text = '';
        block.data.attributes = [
            {name: 'sandbox', value: 'allow-scripts allow-same-origin allow-forms'},
            {name: 'src', value: src}
        ];
        block.updated_at = new Date().toISOString();
        await this.saveBlock(block);

        // Регистрируем блок как pending для индикатора
        offlineQueue.registerPendingBlock(blockId);

        // Добавляем в очередь синхронизации
        await offlineQueue.enqueue({
            type: 'updateBlock',
            data: { id: blockId }
        });

        dispatch('ShowBlocks');
    }

    async hueUpdate({blockId, hue}) {
        // Optimistic UI: обновляем локально, синхронизация через batch import
        const block = this.blocks.get(blockId);
        if (!block) return;

        if (!block.data) block.data = {};
        block.data.color = hue;
        block.updated_at = new Date().toISOString();
        await this.saveBlock(block);

        // Регистрируем блок как pending для индикатора
        offlineQueue.registerPendingBlock(blockId);

        // Добавляем в очередь синхронизации
        await offlineQueue.enqueue({
            type: 'updateBlock',
            data: { id: blockId }
        });

        dispatch('ShowBlocks');
    }

    async addConnectionBlock({
                                 id,  // ID соединения (генерируется в arrowManager)
                                 sourceId,
                                 targetId,
                                 connector,
                                 paintStyle,
                                 overlays,
                                 anchors,
                                 endpoint,
                                 endpointStyle,
                                 sourceAnchor,
                                 targetAnchor
                             }) {
        const sourceBlock = this.blocks.get(sourceId);
        if (!sourceBlock) {
            console.error('Source block not found:', sourceId);
            return;
        }
        if (!sourceBlock.data) sourceBlock.data = {};
        if (!sourceBlock.data.connections) sourceBlock.data.connections = [];

        // Используем переданный ID или генерируем новый (для обратной совместимости)
        const connectionId = id || (
            (typeof crypto !== 'undefined' && crypto.randomUUID)
                ? crypto.randomUUID()
                : `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        );

        const connectionData = {
            id: connectionId,
            sourceId,
            targetId,
            connector,
            paintStyle,
            overlays,
            anchors,
            endpoint,
            endpointStyle,
            sourceAnchor,
            targetAnchor
        };

        // Проверяем уникальность по source + target + anchors
        // Это позволяет создавать несколько соединений между одной парой блоков
        // если они подключены к разным anchor points
        const existingConnection = sourceBlock.data.connections.find(
            connection => connection.sourceId === sourceId &&
                         connection.targetId === targetId &&
                         connection.sourceAnchor === sourceAnchor &&
                         connection.targetAnchor === targetAnchor
        );

        if (existingConnection) {
            // Сохраняем оригинальный ID при обновлении
            connectionData.id = existingConnection.id || connectionId;
            Object.assign(existingConnection, connectionData);
        } else {
            sourceBlock.data.connections.push(connectionData);
        }

        sourceBlock.updated_at = new Date().toISOString();
        await this.saveBlock(sourceBlock);
        dispatch('ShowBlocks');

        // Офлайн режим: добавляем в очередь
        if (!offlineQueue.isNetworkOnline()) {
            await offlineQueue.enqueue({
                id: `add_connection_${sourceId}_${targetId}_${Date.now()}`,
                type: 'updateBlock',
                data: {
                    id: sourceId,
                    blockData: {data: sourceBlock.data}
                }
            });
            return;
        }

        try {
            const response = await api.updateBlock(sourceId, {data: sourceBlock.data});
            if (response.status === 200 && response.data?.id) {
                await this.saveBlock(response.data);
            }
        } catch (err) {
            if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
                await offlineQueue.enqueue({
                    id: `add_connection_${sourceId}_${targetId}_${Date.now()}`,
                    type: 'updateBlock',
                    data: {
                        id: sourceId,
                        blockData: {data: sourceBlock.data}
                    }
                });
            } else {
                console.error(err);
            }
        }
    }

    async removeConnectionBlock({connectionId, sourceId, targetId, sourceAnchor, targetAnchor}) {
        const sourceBlock = this.blocks.get(sourceId);
        if (!sourceBlock || !sourceBlock.data?.connections) {
            console.error('Source block or connections not found:', sourceId);
            return;
        }

        // Приоритет 1: Удаление по уникальному connectionId (самый надёжный способ)
        if (connectionId) {
            sourceBlock.data.connections = sourceBlock.data.connections.filter(
                (el) => el.id !== connectionId
            );
        }
        // Приоритет 2: Удаление по anchors (для старых соединений без ID)
        else if (sourceAnchor !== undefined && sourceAnchor !== null &&
                 targetAnchor !== undefined && targetAnchor !== null) {
            sourceBlock.data.connections = sourceBlock.data.connections.filter(
                (el) => !(el.targetId === targetId &&
                         el.sourceAnchor === sourceAnchor &&
                         el.targetAnchor === targetAnchor)
            );
        }
        // Приоритет 3: Удаление всех соединений к target (обратная совместимость)
        else {
            sourceBlock.data.connections = sourceBlock.data.connections.filter((el) => el.targetId !== targetId);
        }
        sourceBlock.updated_at = new Date().toISOString();
        await this.saveBlock(sourceBlock);

        // Офлайн режим: добавляем в очередь
        if (!offlineQueue.isNetworkOnline()) {
            await offlineQueue.enqueue({
                id: `remove_connection_${sourceId}_${targetId}_${Date.now()}`,
                type: 'updateBlock',
                data: {
                    id: sourceId,
                    blockData: {data: sourceBlock.data}
                }
            });
            return;
        }

        try {
            const response = await api.updateBlock(sourceId, {data: sourceBlock.data});
            if (response.status === 200 && response.data?.id) {
                await this.saveBlock(response.data);
            }
        } catch (err) {
            if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
                await offlineQueue.enqueue({
                    id: `remove_connection_${sourceId}_${targetId}_${Date.now()}`,
                    type: 'updateBlock',
                    data: {
                        id: sourceId,
                        blockData: {data: sourceBlock.data}
                    }
                });
            } else {
                console.error(err);
            }
        }
    }

    /**
     * Обновляет существующее соединение между блоками
     * @param {Object} connectionData - Данные соединения
     */
    async updateConnectionBlock({sourceId, targetId, connector, paintStyle, overlays, anchors, ...rest}) {
        // Извлекаем чистый ID блока (без префиксов)
        const cleanSourceId = sourceId?.split('*').pop() || sourceId;

        const sourceBlock = this.blocks.get(cleanSourceId);
        if (!sourceBlock || !sourceBlock.data?.connections) {
            console.error('Source block or connections not found:', cleanSourceId);
            return;
        }

        // Находим существующее соединение
        const connIndex = sourceBlock.data.connections.findIndex(
            c => c.sourceId === sourceId && c.targetId === targetId
        );

        if (connIndex === -1) {
            console.warn('Connection not found for update:', sourceId, '->', targetId);
            return;
        }

        // Обновляем данные соединения
        sourceBlock.data.connections[connIndex] = {
            sourceId,
            targetId,
            connector,
            paintStyle,
            overlays,
            anchors,
            ...rest
        };

        sourceBlock.updated_at = new Date().toISOString();
        await this.saveBlock(sourceBlock);

        // Примечание: не добавляем в undo stack, т.к. стили соединений
        // не поддерживают формат операций для undo/redo

        // Офлайн режим: добавляем в очередь
        if (!offlineQueue.isNetworkOnline()) {
            await offlineQueue.enqueue({
                id: `update_connection_${cleanSourceId}_${targetId}_${Date.now()}`,
                type: 'updateBlock',
                data: {
                    id: cleanSourceId,
                    blockData: {data: sourceBlock.data}
                }
            });
            return;
        }

        try {
            const response = await api.updateBlock(cleanSourceId, {data: sourceBlock.data});
            if (response.status === 200 && response.data?.id) {
                await this.saveBlock(response.data);
            }
        } catch (err) {
            if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
                await offlineQueue.enqueue({
                    id: `update_connection_${cleanSourceId}_${targetId}_${Date.now()}`,
                    type: 'updateBlock',
                    data: {
                        id: cleanSourceId,
                        blockData: {data: sourceBlock.data}
                    }
                });
            } else {
                console.error(err);
            }
        }
    }

    // Event handling methods
    async onResize() {
        if (this._pendingResize) return;
        this._pendingResize = true;

        if (!this.blocks || this.blocks.size === 0) {
            await this.getAllBlocksForUser(this.currentUser ?? 'anonim');
        }
        const path = await this.getPathPromise();

        if (path?.length) {
            this.jsPlumbInstance.repaintEverything();
            this.painter.render(this.blocks, path.at(-1));
        }
        this._pendingResize = false;
    }

    getAllChildIds(block) {
        const removesIds = [block.id];

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

    /**
     * Показывает экран выхода в офлайн режиме
     */
    showOfflineLogoutScreen() {
        // Очищаем rootContainer
        if (this.rootContainer) {
            this.rootContainer.innerHTML = '';
        }

        // Показываем сообщение о офлайн выходе
        const offlineScreen = document.createElement('div');
        offlineScreen.className = 'offline-logout-screen';
        offlineScreen.innerHTML = `
            <div class="offline-logout-content">
                <i class="fas fa-wifi-slash offline-logout-icon"></i>
                <h2>Вы вышли из системы</h2>
                <p>Подключитесь к интернету и обновите страницу для входа.</p>
                <button class="offline-refresh-btn" onclick="window.location.reload()">
                    <i class="fas fa-sync-alt"></i> Обновить страницу
                </button>
            </div>
        `;

        if (this.rootContainer) {
            this.rootContainer.appendChild(offlineScreen);
        }
    }

}

// Ленивый singleton для использования в других модулях
let _localStateManagerInstance = null;

export const localStateManager = {
    get blocks() {
        if (!_localStateManagerInstance) {
            _localStateManagerInstance = new LocalStateManager();
        }
        return _localStateManagerInstance.blocks;
    },
    getInstance() {
        if (!_localStateManagerInstance) {
            _localStateManagerInstance = new LocalStateManager();
        }
        return _localStateManagerInstance;
    }
};

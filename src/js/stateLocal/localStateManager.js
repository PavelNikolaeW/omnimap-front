import localforage from "localforage";
import {dispatch} from "../utils/utils";
import {Painter} from "../painter/painter";
import api from "../api/api";

import {isExcludedElement, truncate, normalizeParentId} from '../utils/functions'
import {jsPlumbInstance} from "../controller/arrowManager";
import {customConfirm} from "../utils/custom-dialog";
import {treeService} from "../services/treeService";
import {treeValidator} from "./treeValidator";

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

        window.addEventListener('UpdateCustomGridBlock', (e) => {
            this.updateCustomGridBlock(e.detail);
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

            dispatch('InitAnonimUser');

            const sidebar = document.getElementById('sidebar');
            const topSidebar = document.getElementById('topSidebar');
            if (sidebar) sidebar.classList.add('hidden');
            if (topSidebar) topSidebar.classList.add('hidden');

            // Показываем начальный экран для анонимного пользователя
            this.showBlocks();
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
        try {
            const res = await api.createTree(title)
            if (res.status === 201) {
                const block = res.data
                await treeService.addTree(block.id)
                await this.saveBlock(block)
                this.showBlocks()
            }
        } catch (error) {
            console.error('Failed to create tree:', error)
        }
    }

    /**
     * Удаление блока и всех его потомков
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

        try {
            const res = await api.removeTree(blockId)
            if (res.status === 200) {
                // Удаляем из treeService если это корневой блок
                if (isRootTree) {
                    await treeService.removeTree(blockId)
                }

                // Обновляем родительский блок
                if (res.data.parent) {
                    await this.saveBlock(res.data.parent)
                }

                // Удаляем блок и всех потомков из кеша
                this.getAllChildIds(block).forEach((id) => {
                    this.blockRepository.deleteBlock(id)
                    this.blocks.delete(id)
                })

                this.showBlocks()
            }
        } catch (error) {
            console.error('Failed to delete tree block:', error)
        }
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
                if (res.data.parent) {
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
                    await this.removeOneBlock(block.id);
                } else {
                    // Если это корневой блок (дерево), добавляем через treeService
                    if (!block.parent_id) {
                        await treeService.refresh();
                        if (!treeService.hasTree(block.id)) {
                            await treeService.addTree(block.id);
                        }
                    }

                    const data = this._safeJsonParse(block.data, {});
                    const children = this._safeJsonParse(block.children, []);

                    await this.saveBlock({
                        id: block.id,
                        updated_at: new Date(block.updated_at * 1000).toISOString(),
                        title: block.title,
                        data,
                        children,
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

    moveBlock({block_id, old_parent_id, new_parent_id, before}) {
        if (block_id === new_parent_id) return
        const parent = this.blocks.get(new_parent_id)

        function reorderList(ids, id, idBefore) {
            // Удаляем id из списка, если он уже есть
            const filteredIds = ids.filter(item => item !== id);
            // Находим индекс idBefore
            const index = filteredIds.indexOf(idBefore);
            if (index !== -1) {
                // Вставляем id перед idBefore
                filteredIds.splice(index, 0, id);
            } else {
                // Если idBefore нет, добавляем id в конец
                filteredIds.push(id);
            }

            return filteredIds;
        }

        if (parent && parent.data) {
            const newOrder = reorderList(parent.data.childOrder || [], block_id, before)
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
        if (block) {
            this.blocks.set(block.id, block)
            if (this.blockRepository) {
                await this.blockRepository.saveBlock(block);
            } else {
                console.warn('BlockRepository not initialized, block saved only in memory:', block.id);
            }
        } else {
            console.error('Save block undefined')
        }
    }

    async removeOneBlock(blockId) {
        const block = this.blocks.get(blockId);
        if (!block) {
            console.warn(`Block ${blockId} not found`);
            return;
        }
        const parentId = block.parent_id;
        if (parentId) {
            const parentBlock = this.blocks.get(parentId);
            if (parentBlock) {
                parentBlock.children = parentBlock.children.filter(id => id !== blockId);
                parentBlock.data.childOrder = parentBlock.data.childOrder.filter(id => id !== blockId);
                this.blockRepository.saveBlock(parentBlock)
            }
        }

        let treeIds = await localforage.getItem(`treeIds${this.currentUser}`);

        if (Array.isArray(treeIds)) {
            treeIds = treeIds.filter(id => id !== blockId);
            await localforage.setItem(`treeIds${this.currentUser}`, treeIds);
        }

        // Remove from internal map and delete from repository
        this.blocks.delete(blockId);
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
        const block = await this.blockRepository.loadBlock(blockId)
        console.log(block)
        block.data.customGrid = customGrid
        await this.saveBlock(block).then(() => dispatch('ShowBlocks'))

        if (this.debounceTimer) clearTimeout(this.debounceTimer);

        this.debounceTimer = setTimeout(async () => {
            try {
                const response = await api.updateBlock(blockId, {data: {customGrid}});
                if (response.status === 200) {
                    const updatedBlock = response.data;
                    await this.saveBlock(updatedBlock);
                }
            } catch (err) {
                console.error(err);
            }
        }, 1000);
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


    historyRevert({block}) {
        console.log(block)
        this.saveBlock(block)
        this.showBlocks()
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

    setIframe({blockId, src}) {
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
            const response = await api.updateBlock(blockId, {data: {color: hue}});
            if (response.status === 200) {
                const updatedBlock = response.data;
                await this.saveBlock(updatedBlock);
                dispatch('ShowBlocks');
            }
        } catch (err) {
            console.error(err);
        }
    }

    async addConnectionBlock({
                                 sourceId,
                                 targetId,
                                 connector,
                                 paintStyle,
                                 overlays,
                                 anchors,
                                 endpoint,
                                 endpointStyle
                             }) {
        try {
            const sourceBlock = this.blocks.get(sourceId);
            if (!sourceBlock.data.connections) sourceBlock.data.connections = [];

            const existingConnection = sourceBlock.data.connections.find(
                connection => connection.sourceId === sourceId && connection.targetId === targetId
            );

            if (existingConnection) {
                // Обновляем все свойства соединения
                Object.assign(existingConnection, {
                    connector,
                    paintStyle,
                    overlays,
                    anchors,
                    endpoint,
                    endpointStyle
                });
            } else {
                // Добавляем новое соединение
                sourceBlock.data.connections.push({
                    sourceId,
                    targetId,
                    connector,
                    paintStyle,
                    overlays,
                    anchors,
                    endpoint,
                    endpointStyle
                });
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
        try {
            const sourceBlock = this.blocks.get(sourceId);
            sourceBlock.data.connections = sourceBlock.data.connections.filter((el) => el.targetId !== targetId);

            const response = await api.updateBlock(sourceId, {data: sourceBlock.data});
            if (response.status === 200) {
                const updatedBlock = response.data;
                await this.saveBlock(updatedBlock);
            }
        } catch (err) {
            console.error(err);
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

}

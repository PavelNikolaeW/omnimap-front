/**
 * TreeService - сервис для управления деревьями (корневыми блоками)
 * Централизует логику работы с treeIds, currentTree, переключением деревьев
 */
import localforage from 'localforage';
import { dispatch } from '../utils/utils';

class TreeService {
    constructor() {
        this._currentUser = null;
        this._treeIds = [];
        this._currentTree = null;
        this._initialized = false;

        // Bind event handlers
        this._handleLogin = this._handleLogin.bind(this);
        this._handleLogout = this._handleLogout.bind(this);

        this._addListeners();
    }

    _addListeners() {
        window.addEventListener('Login', this._handleLogin);
        window.addEventListener('Logout', this._handleLogout);
    }

    async _handleLogin() {
        await this.initialize();
    }

    _handleLogout() {
        this._currentUser = null;
        this._treeIds = [];
        this._currentTree = null;
        this._initialized = false;
    }

    /**
     * Инициализация сервиса - загрузка данных из localforage
     */
    async initialize() {
        this._currentUser = await localforage.getItem('currentUser');
        if (!this._currentUser) return;

        this._treeIds = await localforage.getItem(`treeIds${this._currentUser}`) || [];
        this._currentTree = await localforage.getItem('currentTree');
        this._initialized = true;
    }

    /**
     * Получить текущего пользователя
     */
    get currentUser() {
        return this._currentUser;
    }

    /**
     * Получить массив ID деревьев
     */
    get treeIds() {
        return [...this._treeIds];
    }

    /**
     * Получить ID текущего дерева
     */
    get currentTree() {
        return this._currentTree;
    }

    /**
     * Количество деревьев
     */
    get count() {
        return this._treeIds.length;
    }

    /**
     * Проверить, инициализирован ли сервис
     */
    get isInitialized() {
        return this._initialized;
    }

    /**
     * Загрузить treeIds из localforage (для синхронизации)
     */
    async refresh() {
        if (!this._currentUser) {
            this._currentUser = await localforage.getItem('currentUser');
        }
        if (this._currentUser) {
            this._treeIds = await localforage.getItem(`treeIds${this._currentUser}`) || [];
            this._currentTree = await localforage.getItem('currentTree');
        }
    }

    /**
     * Получить treeIds из localforage (асинхронно)
     */
    async getTreeIds() {
        if (!this._currentUser) {
            this._currentUser = await localforage.getItem('currentUser');
        }
        return await localforage.getItem(`treeIds${this._currentUser}`) || [];
    }

    /**
     * Получить currentTree из localforage (асинхронно)
     */
    async getCurrentTree() {
        return await localforage.getItem('currentTree');
    }

    /**
     * Проверить, является ли блок корневым деревом
     */
    isRootTree(blockId) {
        return this._treeIds.includes(blockId);
    }

    /**
     * Проверить, существует ли дерево
     */
    hasTree(treeId) {
        return this._treeIds.includes(treeId);
    }

    /**
     * Получить индекс дерева (0-based)
     */
    getTreeIndex(treeId) {
        return this._treeIds.indexOf(treeId);
    }

    /**
     * Получить дерево по индексу
     * @param {number} index - индекс (1-based, 0 = последнее)
     */
    getTreeByIndex(index) {
        if (this._treeIds.length === 0) return null;

        if (index === 0) {
            return this._treeIds[this._treeIds.length - 1];
        }
        if (index > 0 && index <= this._treeIds.length) {
            return this._treeIds[index - 1];
        }
        return null;
    }

    /**
     * Переключиться на дерево
     */
    async switchTree(treeId) {
        if (!this._treeIds.includes(treeId)) {
            return { success: false, error: new Error('Tree not found') };
        }

        this._currentTree = treeId;
        await localforage.setItem('currentTree', treeId);
        dispatch('ShowBlocks');

        return { success: true, treeId };
    }

    /**
     * Переключиться на дерево по индексу
     * @param {number} index - индекс (1-based, 0 = последнее)
     */
    async switchTreeByIndex(index) {
        const treeId = this.getTreeByIndex(index);
        if (!treeId) {
            return { success: false, error: new Error('Tree index out of range') };
        }
        return this.switchTree(treeId);
    }

    /**
     * Добавить новое дерево
     */
    async addTree(treeId) {
        if (this._treeIds.includes(treeId)) return;

        this._treeIds.push(treeId);
        await localforage.setItem(`treeIds${this._currentUser}`, this._treeIds);
        dispatch('UpdateTreeNavigation');
    }

    /**
     * Удалить дерево из списка
     * Не удаляет последнее дерево
     * @returns {Object} - результат с newTreeIds и needSwitchTree
     */
    async removeTree(treeId) {
        const index = this._treeIds.indexOf(treeId);
        if (index === -1) {
            return { success: false, error: new Error('Tree not found') };
        }

        // Нельзя удалить последнее дерево
        if (this._treeIds.length === 1) {
            return { success: false, error: new Error('Cannot delete last tree') };
        }

        const needSwitchTree = this._currentTree === treeId;
        this._treeIds = this._treeIds.filter(id => id !== treeId);
        await localforage.setItem(`treeIds${this._currentUser}`, this._treeIds);

        // Удаляем путь для дерева
        await localforage.removeItem(`Path_${treeId}${this._currentUser}`);

        // Если удалили текущее дерево - переключаемся на первое
        if (needSwitchTree && this._treeIds.length > 0) {
            this._currentTree = this._treeIds[0];
            await localforage.setItem('currentTree', this._currentTree);
        }

        dispatch('UpdateTreeNavigation');

        return {
            success: true,
            newTreeIds: this._treeIds,
            needSwitchTree,
            newCurrentTree: needSwitchTree ? this._currentTree : null
        };
    }

    /**
     * Удалить несколько деревьев (batch операция)
     * @param {Array<string>} treeIdsToRemove - массив ID деревьев для удаления
     */
    async removeMultipleTrees(treeIdsToRemove) {
        let needSwitchTree = false;
        const removedTrees = [];

        for (const treeId of treeIdsToRemove) {
            if (!this._treeIds.includes(treeId)) continue;

            // Нельзя удалить последнее дерево
            if (this._treeIds.length === 1) break;

            if (this._currentTree === treeId) {
                needSwitchTree = true;
            }

            this._treeIds = this._treeIds.filter(id => id !== treeId);
            await localforage.removeItem(`Path_${treeId}${this._currentUser}`);
            removedTrees.push(treeId);
        }

        // Сохраняем итоговый массив
        await localforage.setItem(`treeIds${this._currentUser}`, this._treeIds);

        // Переключаемся на первое доступное дерево
        if (needSwitchTree && this._treeIds.length > 0) {
            this._currentTree = this._treeIds[0];
            await localforage.setItem('currentTree', this._currentTree);
        }

        dispatch('UpdateTreeNavigation');

        return {
            success: true,
            removedTrees,
            newTreeIds: this._treeIds,
            needSwitchTree,
            newCurrentTree: needSwitchTree ? this._currentTree : null
        };
    }

    /**
     * Установить текущее дерево (без dispatch)
     */
    async setCurrentTree(treeId) {
        this._currentTree = treeId;
        await localforage.setItem('currentTree', treeId);
    }

    /**
     * Загрузить данные блоков для всех деревьев
     * @returns {Promise<Array<{treeId, block}>>}
     */
    async loadTreeBlocks() {
        if (!this._currentUser) {
            await this.refresh();
        }

        const blocks = await Promise.all(
            this._treeIds.map(async (treeId) => {
                const block = await localforage.getItem(`Block_${treeId}_${this._currentUser}`);
                return { treeId, block };
            })
        );

        return blocks.filter(item => item.block);
    }
}

// Singleton instance
export const treeService = new TreeService();

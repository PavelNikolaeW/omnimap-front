import localforage from 'localforage';
import { v4 as uuidv4 } from 'uuid';
import { dispatch } from '../utils/utils.js';

/**
 * Менеджер Undo/Redo операций
 *
 * Локальный подход: сохраняем снапшоты состояния блоков до/после изменений.
 * Работает offline, не зависит от backend.
 *
 * Принципы:
 * - Каждое действие пользователя записывается как UndoEntry
 * - Быстрые последовательные правки одного блока объединяются (merge window)
 * - При WebSocket обновлениях от других пользователей записи инвалидируются
 * - Undo stack сохраняется в IndexedDB между сессиями
 * - Redo stack очищается при новом действии и не сохраняется
 */
class UndoManager {
    static STORAGE_KEY = 'undoStack';
    static MAX_STACK_SIZE = 100;      // Максимум 100 записей
    static MERGE_WINDOW_MS = 2000;    // Объединять правки в течение 2 сек
    static MAX_TREE_SIZE = 500;       // Максимум блоков для сохранения удалённого дерева

    constructor() {
        /**
         * @type {UndoEntry[]}
         *
         * UndoEntry {
         *   id: string,              // UUID записи
         *   timestamp: number,       // Время создания
         *   type: 'edit' | 'create' | 'delete' | 'move' | 'deleteTree',
         *   blockId: string,         // ID затронутого блока
         *   parentId?: string,       // ID родителя (для create/delete)
         *   oldParentId?: string,    // Старый родитель (для move)
         *   newParentId?: string,    // Новый родитель (для move)
         *   changes: {
         *     before: object|null,   // Состояние ДО
         *     after: object|null     // Состояние ПОСЛЕ
         *   },
         *   invalid?: boolean        // Помечено как невалидное (конфликт)
         * }
         */
        this.undoStack = [];
        this.redoStack = [];
        this.isApplying = false;      // Флаг для предотвращения рекурсии
        this.isInitialized = false;   // Флаг инициализации

        // Не вызываем init() в конструкторе - будет вызван извне после загрузки приложения
    }

    /**
     * Инициализация менеджера
     * Загружает сохранённый стек и подписывается на события
     */
    async init() {
        if (this.isInitialized) return;

        await this.loadFromStorage();

        // Слушаем события Undo/Redo от команд
        window.addEventListener('Undo', () => this.undo());
        window.addEventListener('Redo', () => this.redo());

        // Очищаем при logout
        window.addEventListener('Logout', () => this.clear());

        this.isInitialized = true;

        // Уведомляем о состоянии стека
        this.dispatchStackState();

        console.log(`UndoManager initialized: ${this.undoStack.length} entries loaded`);
    }

    /**
     * Записать изменение блока (edit)
     *
     * @param {string} blockId - ID блока
     * @param {object} beforeState - Состояние ДО изменения
     * @param {object} afterState - Состояние ПОСЛЕ изменения
     */
    recordEdit(blockId, beforeState, afterState) {
        if (this.isApplying) return;

        const entry = {
            id: uuidv4(),
            timestamp: Date.now(),
            type: 'edit',
            blockId,
            changes: {
                before: this.cloneState(beforeState),
                after: this.cloneState(afterState)
            }
        };

        this.pushEntry(entry);
    }

    /**
     * Записать создание блока
     *
     * @param {string} blockId - ID созданного блока
     * @param {string} parentId - ID родителя
     * @param {object} blockData - Данные блока
     */
    recordCreate(blockId, parentId, blockData) {
        if (this.isApplying) return;

        const entry = {
            id: uuidv4(),
            timestamp: Date.now(),
            type: 'create',
            blockId,
            parentId,
            changes: {
                before: null,
                after: this.cloneState(blockData)
            }
        };

        this.pushEntry(entry);
    }

    /**
     * Записать удаление блока
     *
     * @param {string} blockId - ID удаляемого блока
     * @param {string} parentId - ID родителя
     * @param {object} blockData - Данные блока (для восстановления)
     */
    recordDelete(blockId, parentId, blockData) {
        if (this.isApplying) return;

        const entry = {
            id: uuidv4(),
            timestamp: Date.now(),
            type: 'delete',
            blockId,
            parentId,
            changes: {
                before: this.cloneState(blockData),
                after: null
            }
        };

        this.pushEntry(entry);
    }

    /**
     * Записать удаление поддерева
     *
     * @param {string} rootBlockId - ID корневого блока поддерева
     * @param {string} parentId - ID родителя
     * @param {Map<string, object>} subtree - Map блоков поддерева
     * @returns {boolean} - true если записано, false если слишком большое
     */
    recordDeleteTree(rootBlockId, parentId, subtree) {
        if (this.isApplying) return true;

        // Проверяем размер поддерева
        const blockCount = subtree.size;

        if (blockCount > UndoManager.MAX_TREE_SIZE) {
            console.warn(`Skipping undo for large tree deletion (${blockCount} blocks > ${UndoManager.MAX_TREE_SIZE})`);
            dispatch('ShowWarning', {
                message: `Удаление дерева из ${blockCount} блоков не может быть отменено`
            });
            return false;
        }

        // Конвертируем Map в объект для сериализации
        const subtreeData = {};
        for (const [id, block] of subtree) {
            subtreeData[id] = this.cloneState(block);
        }

        const entry = {
            id: uuidv4(),
            timestamp: Date.now(),
            type: 'deleteTree',
            blockId: rootBlockId,
            parentId,
            changes: {
                before: subtreeData,
                after: null
            }
        };

        this.pushEntry(entry);
        return true;
    }

    /**
     * Записать перемещение блока
     *
     * @param {string} blockId - ID перемещаемого блока
     * @param {string} oldParentId - ID старого родителя
     * @param {string} newParentId - ID нового родителя
     * @param {object} beforeState - Состояние блока ДО перемещения
     * @param {object} afterState - Состояние блока ПОСЛЕ перемещения
     * @param {object} oldParentBefore - Состояние старого родителя ДО
     * @param {object} newParentBefore - Состояние нового родителя ДО
     */
    recordMove(blockId, oldParentId, newParentId, beforeState, afterState, oldParentBefore, newParentBefore) {
        if (this.isApplying) return;

        const entry = {
            id: uuidv4(),
            timestamp: Date.now(),
            type: 'move',
            blockId,
            oldParentId,
            newParentId,
            changes: {
                before: {
                    block: this.cloneState(beforeState),
                    oldParent: this.cloneState(oldParentBefore),
                    newParent: oldParentId !== newParentId ? this.cloneState(newParentBefore) : null
                },
                after: {
                    block: this.cloneState(afterState)
                    // Состояние родителей после не нужно - восстановим из before
                }
            }
        };

        this.pushEntry(entry);
    }

    /**
     * Добавить запись в стек
     * @private
     */
    pushEntry(entry) {
        // Очищаем redo при новом действии
        if (this.redoStack.length > 0) {
            this.redoStack = [];
        }

        // Пробуем объединить с предыдущей записью
        if (this.shouldMerge(entry)) {
            const prev = this.undoStack[this.undoStack.length - 1];
            prev.changes.after = entry.changes.after;
            prev.timestamp = entry.timestamp;
        } else {
            this.undoStack.push(entry);

            // Ограничиваем размер стека
            if (this.undoStack.length > UndoManager.MAX_STACK_SIZE) {
                this.undoStack.shift();
            }
        }

        this.saveToStorage();
        this.dispatchStackState();
    }

    /**
     * Проверить, нужно ли объединять с предыдущей записью
     * @private
     */
    shouldMerge(entry) {
        if (this.undoStack.length === 0) return false;
        if (entry.type !== 'edit') return false;

        const prev = this.undoStack[this.undoStack.length - 1];

        return (
            prev.type === 'edit' &&
            prev.blockId === entry.blockId &&
            !prev.invalid &&
            entry.timestamp - prev.timestamp < UndoManager.MERGE_WINDOW_MS
        );
    }

    /**
     * Отменить последнее действие
     */
    async undo() {
        if (this.undoStack.length === 0) return;
        if (this.isApplying) return;

        // Находим первую валидную запись
        let entry = null;
        while (this.undoStack.length > 0) {
            const candidate = this.undoStack.pop();
            if (!candidate.invalid) {
                entry = candidate;
                break;
            }
            // Invalid записи просто удаляем
            console.log(`Skipping invalid undo entry for block ${candidate.blockId}`);
        }

        if (!entry) {
            this.dispatchStackState();
            return;
        }

        this.isApplying = true;

        try {
            await this.applyEntry(entry, 'undo');
            this.redoStack.push(entry);

            this.saveToStorage();
            this.dispatchStackState();
        } catch (error) {
            console.error('Undo failed:', error);
            // Возвращаем запись обратно в стек при ошибке
            this.undoStack.push(entry);
        } finally {
            this.isApplying = false;
        }
    }

    /**
     * Повторить отменённое действие
     */
    async redo() {
        if (this.redoStack.length === 0) return;
        if (this.isApplying) return;

        // Находим первую валидную запись
        let entry = null;
        while (this.redoStack.length > 0) {
            const candidate = this.redoStack.pop();
            if (!candidate.invalid) {
                entry = candidate;
                break;
            }
            console.log(`Skipping invalid redo entry for block ${candidate.blockId}`);
        }

        if (!entry) {
            this.dispatchStackState();
            return;
        }

        this.isApplying = true;

        try {
            await this.applyEntry(entry, 'redo');
            this.undoStack.push(entry);

            this.saveToStorage();
            this.dispatchStackState();
        } catch (error) {
            console.error('Redo failed:', error);
            // Возвращаем запись обратно
            this.redoStack.push(entry);
        } finally {
            this.isApplying = false;
        }
    }

    /**
     * Применить запись (undo или redo)
     * @private
     */
    async applyEntry(entry, direction) {
        // Динамический импорт для избежания циклических зависимостей
        const { localStateManager } = await import('../stateLocal/localStateManager.js');
        const { offlineQueue } = await import('../sincManager/offlineQueue.js');

        const isUndo = direction === 'undo';

        switch (entry.type) {
            case 'edit': {
                const changes = isUndo ? entry.changes.before : entry.changes.after;
                const block = localStateManager.blocks.get(entry.blockId);

                if (!block) {
                    console.warn(`Block ${entry.blockId} not found for ${direction}`);
                    return;
                }

                // Применяем изменения
                const updatedBlock = { ...block, ...changes };
                if (changes.data) {
                    updatedBlock.data = { ...block.data, ...changes.data };
                }

                await localStateManager.saveBlock(updatedBlock);

                // Синхронизируем
                await offlineQueue.enqueue({
                    type: 'updateBlock',
                    data: { blockId: entry.blockId }
                });
                break;
            }

            case 'create': {
                if (isUndo) {
                    // Undo создания = удаляем блок
                    await this.removeBlockWithChildren(localStateManager, entry.blockId);

                    await offlineQueue.enqueue({
                        type: 'deleteBlock',
                        data: { blockId: entry.blockId, parentId: entry.parentId }
                    });
                } else {
                    // Redo создания = восстанавливаем блок
                    const blockData = {
                        ...entry.changes.after,
                        id: entry.blockId,
                        parent_id: entry.parentId
                    };
                    await localStateManager.saveBlock(blockData);

                    // Добавляем в children родителя
                    await this.addChildToParent(localStateManager, entry.parentId, entry.blockId);

                    await offlineQueue.enqueue({
                        type: 'createBlock',
                        data: { blockId: entry.blockId, parentId: entry.parentId }
                    });
                }
                break;
            }

            case 'delete': {
                if (isUndo) {
                    // Undo удаления = восстанавливаем блок
                    const blockData = {
                        ...entry.changes.before,
                        id: entry.blockId,
                        parent_id: entry.parentId
                    };
                    await localStateManager.saveBlock(blockData);

                    // Добавляем в children родителя
                    await this.addChildToParent(localStateManager, entry.parentId, entry.blockId);

                    await offlineQueue.enqueue({
                        type: 'createBlock',
                        data: { blockId: entry.blockId, parentId: entry.parentId }
                    });
                } else {
                    // Redo удаления = удаляем блок
                    await this.removeBlockWithChildren(localStateManager, entry.blockId);

                    await offlineQueue.enqueue({
                        type: 'deleteBlock',
                        data: { blockId: entry.blockId, parentId: entry.parentId }
                    });
                }
                break;
            }

            case 'deleteTree': {
                if (isUndo) {
                    // Undo удаления дерева = восстанавливаем все блоки
                    const subtreeData = entry.changes.before;

                    // Сначала восстанавливаем все блоки
                    for (const [blockId, blockData] of Object.entries(subtreeData)) {
                        await localStateManager.saveBlock(blockData);
                    }

                    // Добавляем корень в children родителя
                    await this.addChildToParent(localStateManager, entry.parentId, entry.blockId);

                    // Синхронизируем - нужно отправить все блоки
                    for (const blockId of Object.keys(subtreeData)) {
                        await offlineQueue.enqueue({
                            type: 'createBlock',
                            data: { blockId, parentId: subtreeData[blockId].parent_id }
                        });
                    }
                } else {
                    // Redo удаления дерева = удаляем все блоки
                    const subtreeData = entry.changes.before;

                    for (const blockId of Object.keys(subtreeData)) {
                        await localStateManager.removeBlock(blockId);
                    }

                    // Удаляем из children родителя
                    await this.removeChildFromParent(localStateManager, entry.parentId, entry.blockId);

                    await offlineQueue.enqueue({
                        type: 'deleteBlock',
                        data: { blockId: entry.blockId, parentId: entry.parentId }
                    });
                }
                break;
            }

            case 'move': {
                const block = localStateManager.blocks.get(entry.blockId);
                if (!block) {
                    console.warn(`Block ${entry.blockId} not found for move ${direction}`);
                    return;
                }

                if (isUndo) {
                    // Восстанавливаем старое состояние
                    const beforeData = entry.changes.before;

                    // Восстанавливаем блок
                    await localStateManager.saveBlock(beforeData.block);

                    // Восстанавливаем старого родителя
                    if (beforeData.oldParent) {
                        await localStateManager.saveBlock(beforeData.oldParent);
                    }

                    // Восстанавливаем нового родителя (если отличается от старого)
                    if (beforeData.newParent && entry.oldParentId !== entry.newParentId) {
                        await localStateManager.saveBlock(beforeData.newParent);
                    }

                    await offlineQueue.enqueue({
                        type: 'moveBlock',
                        data: {
                            blockId: entry.blockId,
                            oldParentId: entry.newParentId,
                            newParentId: entry.oldParentId
                        }
                    });
                } else {
                    // Применяем новое состояние
                    const afterData = entry.changes.after;
                    await localStateManager.saveBlock(afterData.block);

                    // Обновляем родителей через перемещение
                    await offlineQueue.enqueue({
                        type: 'moveBlock',
                        data: {
                            blockId: entry.blockId,
                            oldParentId: entry.oldParentId,
                            newParentId: entry.newParentId
                        }
                    });
                }
                break;
            }
        }

        dispatch('ShowBlocks');
    }

    /**
     * Удалить блок и его дочерние элементы
     * @private
     */
    async removeBlockWithChildren(localStateManager, blockId) {
        const block = localStateManager.blocks.get(blockId);
        if (!block) return;

        // Рекурсивно удаляем детей
        const children = block.children || [];
        for (const childId of children) {
            await this.removeBlockWithChildren(localStateManager, childId);
        }

        // Удаляем сам блок
        await localStateManager.removeBlock(blockId);

        // Удаляем из children родителя
        if (block.parent_id) {
            await this.removeChildFromParent(localStateManager, block.parent_id, blockId);
        }
    }

    /**
     * Добавить блок в children родителя
     * @private
     */
    async addChildToParent(localStateManager, parentId, childId) {
        if (!parentId) return;

        const parent = localStateManager.blocks.get(parentId);
        if (!parent) return;

        const children = parent.children || [];
        if (!children.includes(childId)) {
            parent.children = [...children, childId];

            // Обновляем childOrder
            const childOrder = parent.data?.childOrder || [];
            if (!childOrder.includes(childId)) {
                parent.data = {
                    ...parent.data,
                    childOrder: [...childOrder, childId]
                };
            }

            await localStateManager.saveBlock(parent);
        }
    }

    /**
     * Удалить блок из children родителя
     * @private
     */
    async removeChildFromParent(localStateManager, parentId, childId) {
        if (!parentId) return;

        const parent = localStateManager.blocks.get(parentId);
        if (!parent) return;

        const children = parent.children || [];
        if (children.includes(childId)) {
            parent.children = children.filter(id => id !== childId);

            // Обновляем childOrder
            const childOrder = parent.data?.childOrder || [];
            if (childOrder.includes(childId)) {
                parent.data = {
                    ...parent.data,
                    childOrder: childOrder.filter(id => id !== childId)
                };
            }

            await localStateManager.saveBlock(parent);
        }
    }

    /**
     * Инвалидировать записи для блока (при конфликте с другим пользователем)
     *
     * @param {string} blockId - ID блока
     */
    invalidateEntriesForBlock(blockId) {
        let invalidated = false;

        for (const entry of this.undoStack) {
            if (this.entryAffectsBlock(entry, blockId) && !entry.invalid) {
                entry.invalid = true;
                invalidated = true;
            }
        }

        for (const entry of this.redoStack) {
            if (this.entryAffectsBlock(entry, blockId) && !entry.invalid) {
                entry.invalid = true;
                invalidated = true;
            }
        }

        if (invalidated) {
            console.log(`Invalidated undo/redo entries for block ${blockId} (external update)`);
            this.saveToStorage();
            this.dispatchStackState();
        }
    }

    /**
     * Проверить, затрагивает ли запись указанный блок
     * @private
     */
    entryAffectsBlock(entry, blockId) {
        if (entry.blockId === blockId) return true;

        // Для move проверяем родителей
        if (entry.type === 'move') {
            if (entry.oldParentId === blockId || entry.newParentId === blockId) {
                return true;
            }
        }

        // Для deleteTree проверяем все блоки в поддереве
        if (entry.type === 'deleteTree' && entry.changes.before) {
            if (blockId in entry.changes.before) {
                return true;
            }
        }

        return false;
    }

    /**
     * Инвалидировать все записи после синхронизации
     * Вызывается когда данные полностью обновлены с сервера
     */
    invalidateAllPending() {
        let invalidated = false;

        for (const entry of this.undoStack) {
            if (!entry.invalid) {
                entry.invalid = true;
                invalidated = true;
            }
        }

        if (invalidated) {
            console.log('Invalidated all pending undo entries after full sync');
            this.saveToStorage();
            this.dispatchStackState();
        }
    }

    /**
     * Очистить стеки
     */
    clear() {
        this.undoStack = [];
        this.redoStack = [];
        this.saveToStorage();
        this.dispatchStackState();
        console.log('Undo stack cleared');
    }

    /**
     * Загрузить стек из IndexedDB
     * @private
     */
    async loadFromStorage() {
        try {
            const data = await localforage.getItem(UndoManager.STORAGE_KEY);
            if (data && data.undoStack) {
                this.undoStack = data.undoStack;
                // RedoStack не восстанавливаем - он валиден только в рамках сессии
            }
        } catch (error) {
            console.error('Failed to load undo stack:', error);
        }
    }

    /**
     * Сохранить стек в IndexedDB
     * @private
     */
    async saveToStorage() {
        try {
            await localforage.setItem(UndoManager.STORAGE_KEY, {
                undoStack: this.undoStack
                // redoStack не сохраняем
            });
        } catch (error) {
            console.error('Failed to save undo stack:', error);
        }
    }

    /**
     * Отправить событие о состоянии стека
     * @private
     */
    dispatchStackState() {
        // Считаем только валидные записи
        const validUndoCount = this.undoStack.filter(e => !e.invalid).length;
        const validRedoCount = this.redoStack.filter(e => !e.invalid).length;

        dispatch('UndoStackChanged', {
            canUndo: validUndoCount > 0,
            canRedo: validRedoCount > 0,
            undoCount: validUndoCount,
            redoCount: validRedoCount
        });
    }

    /**
     * Глубокое клонирование состояния
     * @private
     */
    cloneState(state) {
        if (!state) return null;
        try {
            return JSON.parse(JSON.stringify(state));
        } catch (error) {
            console.error('Failed to clone state:', error);
            return null;
        }
    }

    /**
     * Получить количество валидных записей для undo
     */
    getUndoCount() {
        return this.undoStack.filter(e => !e.invalid).length;
    }

    /**
     * Получить количество валидных записей для redo
     */
    getRedoCount() {
        return this.redoStack.filter(e => !e.invalid).length;
    }

    /**
     * Проверить, можно ли выполнить undo
     */
    canUndo() {
        return this.getUndoCount() > 0;
    }

    /**
     * Проверить, можно ли выполнить redo
     */
    canRedo() {
        return this.getRedoCount() > 0;
    }
}

// Singleton экземпляр
export const undoManager = new UndoManager();

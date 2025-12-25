/**
 * Navigation Actions - чистые функции для навигации по блокам
 *
 * Управляет перемещением по дереву блоков, путями и деревьями.
 */

import localforage from 'localforage';
import { truncate } from '../utils/functions';

/**
 * Получение текущего пользователя
 * @returns {Promise<string>}
 */
export async function getCurrentUser() {
    return await localforage.getItem('currentUser') || 'anonim';
}

/**
 * Получение текущего дерева
 * @returns {Promise<string|null>}
 */
export async function getCurrentTree() {
    return await localforage.getItem('currentTree');
}

/**
 * Установка текущего дерева
 * @param {string} treeId - ID дерева
 * @returns {Promise<void>}
 */
export async function setCurrentTree(treeId) {
    await localforage.setItem('currentTree', treeId);
}

/**
 * Получение списка ID всех деревьев пользователя
 * @param {string} [user] - Имя пользователя (если не указано, берётся текущий)
 * @returns {Promise<Array<string>>}
 */
export async function getTreeIds(user = null) {
    const currentUser = user || await getCurrentUser();
    return await localforage.getItem(`treeIds${currentUser}`) || [];
}

/**
 * Сохранение списка ID деревьев
 * @param {Array<string>} treeIds - Массив ID деревьев
 * @param {string} [user] - Имя пользователя
 * @returns {Promise<void>}
 */
export async function saveTreeIds(treeIds, user = null) {
    const currentUser = user || await getCurrentUser();
    await localforage.setItem(`treeIds${currentUser}`, treeIds);
}

/**
 * Добавление дерева в список
 * @param {string} treeId - ID дерева
 * @returns {Promise<Array<string>>} - Обновлённый список
 */
export async function addTreeId(treeId) {
    const treeIds = await getTreeIds();
    if (!treeIds.includes(treeId)) {
        treeIds.push(treeId);
        await saveTreeIds(treeIds);
    }
    return treeIds;
}

/**
 * Удаление дерева из списка
 * @param {string} treeId - ID дерева
 * @returns {Promise<{success: boolean, treeIds: Array<string>, error?: Error}>}
 */
export async function removeTreeId(treeId) {
    const treeIds = await getTreeIds();

    if (treeIds.length === 1 && treeIds[0] === treeId) {
        return {
            success: false,
            treeIds,
            error: new Error('Cannot remove last tree')
        };
    }

    const newTreeIds = treeIds.filter(id => id !== treeId);
    await saveTreeIds(newTreeIds);

    // Если удаляем текущее дерево, переключаемся на первое доступное
    const currentTree = await getCurrentTree();
    if (currentTree === treeId && newTreeIds.length > 0) {
        await setCurrentTree(newTreeIds[0]);
    }

    return { success: true, treeIds: newTreeIds };
}

/**
 * Получение пути для дерева
 * @param {string} [treeId] - ID дерева (если не указано, берётся текущее)
 * @param {string} [user] - Имя пользователя
 * @returns {Promise<Array<Object>>}
 */
export async function getPath(treeId = null, user = null) {
    const currentTree = treeId || await getCurrentTree();
    const currentUser = user || await getCurrentUser();
    return await localforage.getItem(`Path_${currentTree}${currentUser}`) || [];
}

/**
 * Сохранение пути для дерева
 * @param {Array<Object>} path - Массив объектов пути
 * @param {string} [treeId] - ID дерева
 * @param {string} [user] - Имя пользователя
 * @returns {Promise<void>}
 */
export async function savePath(path, treeId = null, user = null) {
    const currentTree = treeId || await getCurrentTree();
    const currentUser = user || await getCurrentUser();
    await localforage.setItem(`Path_${currentTree}${currentUser}`, path);
}

/**
 * Удаление пути для дерева
 * @param {string} treeId - ID дерева
 * @param {string} [user] - Имя пользователя
 * @returns {Promise<void>}
 */
export async function removePath(treeId, user = null) {
    const currentUser = user || await getCurrentUser();
    await localforage.removeItem(`Path_${treeId}${currentUser}`);
}

/**
 * Получение блока из локального хранилища
 * @param {string} blockId - ID блока
 * @param {string} [user] - Имя пользователя
 * @returns {Promise<Object|null>}
 */
export async function getBlock(blockId, user = null) {
    const currentUser = user || await getCurrentUser();
    return await localforage.getItem(`Block_${blockId}_${currentUser}`);
}

/**
 * Получение текущего экрана (последний элемент пути)
 * @returns {Promise<Object|null>}
 */
export async function getCurrentScreen() {
    const path = await getPath();
    return path.length > 0 ? path[path.length - 1] : null;
}

/**
 * Навигация вглубь - открытие блока
 * @param {string} blockId - ID блока для открытия
 * @param {Array} parentHsl - Цвет родителя
 * @param {Array} [links] - Массив ссылок
 * @returns {Promise<{success: boolean, path: Array, activeId?: string}>}
 */
export async function navigateInto(blockId, parentHsl = [], links = []) {
    const path = await getPath();
    const currentScreen = path[path.length - 1];

    // Если пытаемся открыть текущий экран - идём назад
    if (currentScreen && currentScreen.blockId === blockId) {
        return navigateBack();
    }

    const block = await getBlock(blockId);
    if (!block) {
        return {
            success: false,
            path,
            error: new Error(`Block ${blockId} not found`)
        };
    }

    const newPathItem = {
        screenName: truncate(block.title || '', 10),
        color: parentHsl,
        blockId: blockId,
        links: links
    };

    path.push(newPathItem);
    await savePath(path);

    return { success: true, path };
}

/**
 * Навигация назад
 * @returns {Promise<{success: boolean, path: Array, activeId?: string}>}
 */
export async function navigateBack() {
    const path = await getPath();

    if (path.length <= 1) {
        return { success: false, path, error: new Error('Already at root') };
    }

    const removedItem = path.pop();
    await savePath(path);

    return {
        success: true,
        path,
        activeId: removedItem.blockId
    };
}

/**
 * Навигация к конкретному уровню пути
 * @param {number} level - Индекс уровня (0 = корень)
 * @returns {Promise<{success: boolean, path: Array}>}
 */
export async function navigateToLevel(level) {
    const path = await getPath();

    if (level < 0 || level >= path.length) {
        return { success: false, path, error: new Error('Invalid level') };
    }

    const newPath = path.slice(0, level + 1);
    await savePath(newPath);

    return { success: true, path: newPath };
}

/**
 * Переключение на другое дерево
 * @param {string} treeId - ID дерева
 * @returns {Promise<{success: boolean, treeId: string}>}
 */
export async function switchTree(treeId) {
    const treeIds = await getTreeIds();

    if (!treeIds.includes(treeId)) {
        return { success: false, error: new Error('Tree not found') };
    }

    await setCurrentTree(treeId);
    return { success: true, treeId };
}

/**
 * Переключение на дерево по индексу (1-9, 0 = последнее)
 * @param {number} index - Индекс дерева (1-based, 0 = last)
 * @returns {Promise<{success: boolean, treeId?: string, error?: Error}>}
 */
export async function switchTreeByIndex(index) {
    const treeIds = await getTreeIds();

    if (treeIds.length === 0) {
        return { success: false, error: new Error('No trees available') };
    }

    let treeId;
    if (index === 0) {
        treeId = treeIds[treeIds.length - 1];
    } else if (index > 0 && index <= treeIds.length) {
        treeId = treeIds[index - 1];
    } else {
        return { success: false, error: new Error('Tree index out of range') };
    }

    await setCurrentTree(treeId);
    return { success: true, treeId };
}

/**
 * Инициализация пути для нового дерева
 * @param {Object} rootBlock - Корневой блок дерева
 * @returns {Promise<Array>}
 */
export async function initTreePath(rootBlock) {
    const color = rootBlock.data?.color && rootBlock.data.color !== 'default_color'
        ? rootBlock.data.color
        : [];

    const path = [{
        screenName: truncate(rootBlock.title || '', 10),
        color: color,
        blockId: rootBlock.id
    }];

    await savePath(path, rootBlock.id);
    return path;
}

/**
 * Получение HSL цвета из DOM-элемента родителя
 * @param {HTMLElement} parentElement - DOM-элемент родителя
 * @returns {Array<number>}
 */
export function extractParentHsl(parentElement) {
    if (!parentElement) return [];

    if (parentElement.hasAttribute('block')) {
        const hslAttr = parentElement.getAttribute('hsl');
        return hslAttr ? hslAttr.split(',').map(Number) : [];
    }

    if (parentElement.hasAttribute('blockLink')) {
        const grandParent = parentElement.parentNode;
        if (grandParent && grandParent.hasAttribute) {
            const hslAttr = grandParent.getAttribute('hsl');
            return hslAttr ? hslAttr.split(',').map(Number) : [];
        }
    }

    return [];
}

/**
 * Извлечение цепочки ссылок из DOM
 * @param {HTMLElement} element - Начальный элемент
 * @returns {Array<{linkId: string, linkSource: string}>}
 */
export function extractLinkChain(element) {
    const links = [];
    let parent = element?.parentElement;

    while (parent) {
        if (parent.tagName === 'DIV' && parent.hasAttribute('blockLink')) {
            links.push({
                linkId: parent.id,
                linkSource: parent.getAttribute('blocklink')
            });
        }
        parent = parent.parentNode;
    }

    return links;
}

/**
 * Получение ID блока с учётом blockLink
 * @param {HTMLElement} blockElement - DOM-элемент блока
 * @param {HTMLElement} [blockLinkElement] - DOM-элемент ссылки на блок
 * @returns {string|null}
 */
export function resolveBlockId(blockElement, blockLinkElement = null) {
    if (blockLinkElement?.hasAttribute('blockLink')) {
        return blockLinkElement.getAttribute('blocklink');
    }
    return blockElement?.id?.split('*').at(-1) || null;
}

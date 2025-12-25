/**
 * Block Actions - чистые функции для операций с блоками
 *
 * Этот слой отделяет бизнес-логику от UI.
 * Все функции принимают необходимые данные и возвращают результат операции.
 * Побочные эффекты (API вызовы, dispatch событий) инкапсулированы здесь.
 */

import api from '../api/api';
import { dispatch } from '../utils/utils';
import { validURL, isValidUUID } from '../utils/functions';

/**
 * Создание нового блока
 * @param {string} parentId - ID родительского блока
 * @param {string} title - Заголовок блока
 * @param {Object} [data] - Дополнительные данные блока
 * @returns {Promise<{success: boolean, blocks?: Array, error?: Error}>}
 */
export async function createBlock(parentId, title, data = null) {
    if (!parentId) {
        return { success: false, error: new Error('parentId is required') };
    }

    try {
        const response = await api.createBlock(parentId, title, data);
        if (response.status === 201) {
            return { success: true, blocks: response.data };
        }
        return { success: false, error: new Error(`Unexpected status: ${response.status}`) };
    } catch (error) {
        return { success: false, error };
    }
}

/**
 * Создание блока на основе URL (iframe)
 * @param {string} parentId - ID родительского блока
 * @param {string} src - URL для iframe
 * @returns {Promise<{success: boolean, blocks?: Array, error?: Error}>}
 */
export async function createIframeBlock(parentId, src) {
    if (!parentId || !src) {
        return { success: false, error: new Error('parentId and src are required') };
    }

    const data = {
        view: 'iframe',
        attributes: [
            { name: 'sandbox', value: 'allow-scripts allow-same-origin allow-forms' },
            { name: 'src', value: src }
        ]
    };

    try {
        const response = await api.createBlock(parentId, '', data);
        if (response.status === 201) {
            return { success: true, blocks: response.data };
        }
        return { success: false, error: new Error(`Unexpected status: ${response.status}`) };
    } catch (error) {
        return { success: false, error };
    }
}

/**
 * Универсальная функция создания блока - определяет тип по содержимому
 * @param {string} parentId - ID родительского блока
 * @param {string} input - Заголовок или URL
 * @returns {Promise<{success: boolean, blocks?: Array, error?: Error, type: 'block'|'iframe'}>}
 */
export async function createBlockSmart(parentId, input) {
    if (validURL(input)) {
        const result = await createIframeBlock(parentId, input);
        return { ...result, type: 'iframe' };
    }
    const result = await createBlock(parentId, input);
    return { ...result, type: 'block' };
}

/**
 * Обновление заголовка блока
 * @param {string} blockId - ID блока
 * @param {string} title - Новый заголовок
 * @returns {Promise<{success: boolean, block?: Object, error?: Error}>}
 */
export async function updateBlockTitle(blockId, title) {
    if (!blockId) {
        return { success: false, error: new Error('blockId is required') };
    }

    try {
        const response = await api.updateBlock(blockId, { title });
        if (response.status === 200) {
            return { success: true, block: response.data };
        }
        return { success: false, error: new Error(`Unexpected status: ${response.status}`) };
    } catch (error) {
        return { success: false, error };
    }
}

/**
 * Обновление текста блока
 * @param {string} blockId - ID блока
 * @param {string} text - Новый текст
 * @returns {Promise<{success: boolean, block?: Object, error?: Error}>}
 */
export async function updateBlockText(blockId, text) {
    if (!blockId) {
        return { success: false, error: new Error('blockId is required') };
    }

    try {
        const response = await api.updateBlock(blockId, { data: { text } });
        if (response.status === 200) {
            return { success: true, block: response.data };
        }
        return { success: false, error: new Error(`Unexpected status: ${response.status}`) };
    } catch (error) {
        return { success: false, error };
    }
}

/**
 * Обновление цвета блока
 * @param {string} blockId - ID блока
 * @param {Array|string} hue - Цвет (HSL массив или строка)
 * @returns {Promise<{success: boolean, block?: Object, error?: Error}>}
 */
export async function updateBlockColor(blockId, hue) {
    if (!blockId) {
        return { success: false, error: new Error('blockId is required') };
    }

    try {
        const response = await api.updateBlock(blockId, { data: { color: hue } });
        if (response.status === 200) {
            return { success: true, block: response.data };
        }
        return { success: false, error: new Error(`Unexpected status: ${response.status}`) };
    } catch (error) {
        return { success: false, error };
    }
}

/**
 * Обновление данных блока
 * @param {string} blockId - ID блока
 * @param {Object} data - Данные для обновления
 * @returns {Promise<{success: boolean, block?: Object, error?: Error}>}
 */
export async function updateBlockData(blockId, data) {
    if (!blockId) {
        return { success: false, error: new Error('blockId is required') };
    }

    try {
        const response = await api.updateBlock(blockId, { data });
        if (response.status === 200) {
            return { success: true, block: response.data };
        }
        return { success: false, error: new Error(`Unexpected status: ${response.status}`) };
    } catch (error) {
        return { success: false, error };
    }
}

/**
 * Установка iframe для существующего блока
 * @param {string} blockId - ID блока
 * @param {string} src - URL для iframe
 * @returns {Promise<{success: boolean, block?: Object, error?: Error}>}
 */
export async function setBlockIframe(blockId, src) {
    if (!blockId || !src) {
        return { success: false, error: new Error('blockId and src are required') };
    }

    const data = {
        view: 'iframe',
        text: '',
        attributes: [
            { name: 'sandbox', value: 'allow-scripts allow-same-origin allow-forms' },
            { name: 'src', value: src }
        ]
    };

    try {
        const response = await api.updateBlock(blockId, { data });
        if (response.status === 200) {
            return { success: true, block: response.data };
        }
        return { success: false, error: new Error(`Unexpected status: ${response.status}`) };
    } catch (error) {
        return { success: false, error };
    }
}

/**
 * Удаление блока и всех дочерних элементов
 * @param {string} blockId - ID блока для удаления
 * @returns {Promise<{success: boolean, parent?: Object, error?: Error}>}
 */
export async function deleteBlock(blockId) {
    if (!blockId) {
        return { success: false, error: new Error('blockId is required') };
    }

    try {
        const response = await api.removeTree(blockId);
        if (response.status === 200) {
            return { success: true, parent: response.data.parent };
        }
        return { success: false, error: new Error(`Unexpected status: ${response.status}`) };
    } catch (error) {
        return { success: false, error };
    }
}

/**
 * Перемещение блока в новое место
 * @param {string} blockId - ID блока для перемещения
 * @param {string} oldParentId - ID старого родителя
 * @param {string} newParentId - ID нового родителя
 * @param {Array} childOrder - Новый порядок дочерних элементов
 * @param {string} [before] - ID блока, перед которым вставить
 * @returns {Promise<{success: boolean, blocks?: Object, error?: Error}>}
 */
export async function moveBlock(blockId, oldParentId, newParentId, childOrder, before = null) {
    if (!blockId || !newParentId) {
        return { success: false, error: new Error('blockId and newParentId are required') };
    }

    if (blockId === newParentId) {
        return { success: false, error: new Error('Cannot move block into itself') };
    }

    try {
        const payload = { new_parent_id: newParentId, old_parent_id: oldParentId, childOrder };
        if (before) {
            payload.before = before;
        }

        const response = await api.moveBlock(blockId, payload);
        if (response.status === 200) {
            return { success: true, blocks: response.data };
        }
        return { success: false, error: new Error(`Unexpected status: ${response.status}`) };
    } catch (error) {
        return { success: false, error };
    }
}

/**
 * Копирование блока в новое место
 * @param {string} destId - ID блока-назначения (родителя)
 * @param {Array<string>} srcIds - Массив ID блоков для копирования
 * @returns {Promise<{success: boolean, blocks?: Object, error?: Error}>}
 */
export async function copyBlocks(destId, srcIds) {
    if (!destId || !srcIds || srcIds.length === 0) {
        return { success: false, error: new Error('destId and srcIds are required') };
    }

    // Валидация UUID
    const validIds = srcIds.filter(id => isValidUUID(id));
    if (validIds.length === 0) {
        return { success: false, error: new Error('No valid UUIDs provided') };
    }

    try {
        const response = await api.pasteBlock({ dest: destId, src: validIds });
        if (response.status === 200) {
            return { success: true, blocks: response.data };
        }
        return { success: false, error: new Error(`Unexpected status: ${response.status}`) };
    } catch (error) {
        return { success: false, error };
    }
}

/**
 * Вставка блока как ссылки
 * @param {string} destId - ID блока-назначения
 * @param {Array<string>} srcIds - Массив ID блоков для связывания
 * @returns {Promise<{success: boolean, blocks?: Array, error?: Error}>}
 */
export async function linkBlocks(destId, srcIds) {
    if (!destId || !srcIds || srcIds.length === 0) {
        return { success: false, error: new Error('destId and srcIds are required') };
    }

    // Нельзя создать ссылку на самого себя
    if (srcIds.includes(destId)) {
        return { success: false, error: new Error('Cannot link block to itself') };
    }

    const validIds = srcIds.filter(id => isValidUUID(id));
    if (validIds.length === 0) {
        return { success: false, error: new Error('No valid UUIDs provided') };
    }

    try {
        const response = await api.pasteLinkBlock({ dest: destId, src: validIds });
        if (response.status === 201) {
            return { success: true, blocks: response.data };
        }
        return { success: false, error: new Error(`Unexpected status: ${response.status}`) };
    } catch (error) {
        return { success: false, error };
    }
}

/**
 * Создание нового дерева
 * @param {string} title - Заголовок дерева
 * @returns {Promise<{success: boolean, block?: Object, error?: Error}>}
 */
export async function createTree(title) {
    if (!title) {
        return { success: false, error: new Error('title is required') };
    }

    try {
        const response = await api.createTree(title);
        if (response.status === 201) {
            return { success: true, block: response.data };
        }
        return { success: false, error: new Error(`Unexpected status: ${response.status}`) };
    } catch (error) {
        return { success: false, error };
    }
}

/**
 * Создание публичной ссылки на блок
 * @param {string} blockId - ID блока
 * @returns {Promise<{success: boolean, block?: Object, error?: Error}>}
 */
export async function createPublicLink(blockId) {
    if (!blockId) {
        return { success: false, error: new Error('blockId is required') };
    }

    try {
        const response = await api.createUrlLink(blockId);
        if (response.status === 200) {
            return { success: true, block: response.data };
        }
        return { success: false, error: new Error(`Unexpected status: ${response.status}`) };
    } catch (error) {
        return { success: false, error };
    }
}

/**
 * Обновление кастомной сетки блока
 * @param {string} blockId - ID блока
 * @param {Object} customGrid - Настройки сетки
 * @returns {Promise<{success: boolean, block?: Object, error?: Error}>}
 */
export async function updateBlockGrid(blockId, customGrid) {
    if (!blockId) {
        return { success: false, error: new Error('blockId is required') };
    }

    try {
        const response = await api.updateBlock(blockId, { data: { customGrid } });
        if (response.status === 200) {
            return { success: true, block: response.data };
        }
        return { success: false, error: new Error(`Unexpected status: ${response.status}`) };
    } catch (error) {
        return { success: false, error };
    }
}

/**
 * Добавление соединения между блоками
 * @param {string} sourceId - ID исходного блока
 * @param {string} targetId - ID целевого блока
 * @param {Object} connectionData - Данные соединения (connector, paintStyle, etc.)
 * @param {Object} currentData - Текущие данные блока
 * @returns {Promise<{success: boolean, block?: Object, error?: Error}>}
 */
export async function addConnection(sourceId, targetId, connectionData, currentData = {}) {
    if (!sourceId || !targetId) {
        return { success: false, error: new Error('sourceId and targetId are required') };
    }

    const connections = currentData.connections || [];
    const existingIndex = connections.findIndex(
        conn => conn.sourceId === sourceId && conn.targetId === targetId
    );

    const newConnection = {
        sourceId,
        targetId,
        ...connectionData
    };

    if (existingIndex >= 0) {
        connections[existingIndex] = newConnection;
    } else {
        connections.push(newConnection);
    }

    try {
        const response = await api.updateBlock(sourceId, {
            data: { ...currentData, connections }
        });
        if (response.status === 200) {
            return { success: true, block: response.data };
        }
        return { success: false, error: new Error(`Unexpected status: ${response.status}`) };
    } catch (error) {
        return { success: false, error };
    }
}

/**
 * Удаление соединения между блоками
 * @param {string} sourceId - ID исходного блока
 * @param {string} targetId - ID целевого блока
 * @param {Object} currentData - Текущие данные блока
 * @returns {Promise<{success: boolean, block?: Object, error?: Error}>}
 */
export async function removeConnection(sourceId, targetId, currentData = {}) {
    if (!sourceId || !targetId) {
        return { success: false, error: new Error('sourceId and targetId are required') };
    }

    const connections = (currentData.connections || []).filter(
        conn => conn.targetId !== targetId
    );

    try {
        const response = await api.updateBlock(sourceId, {
            data: { ...currentData, connections }
        });
        if (response.status === 200) {
            return { success: true, block: response.data };
        }
        return { success: false, error: new Error(`Unexpected status: ${response.status}`) };
    } catch (error) {
        return { success: false, error };
    }
}

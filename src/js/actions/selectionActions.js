/**
 * Selection Actions - функции для работы с выделением блоков
 *
 * Управляет выделением, режимами редактирования и буфером обмена.
 */

import { copyToClipboard, getClipboardText, isValidUUID } from '../utils/functions';

/**
 * Режимы работы приложения
 */
export const MODES = {
    NORMAL: 'normal',
    TEXT_EDIT: 'textEdit',
    CONNECT_TO_BLOCK: 'connectToBlock',
    CUT_BLOCK: 'cutBlock',
    DIAGRAM: 'diagram',
    CHAT: 'chat'
};

/**
 * Копирование ID блока в буфер обмена
 * @param {string} blockId - ID блока
 * @returns {{success: boolean, blockId?: string, error?: Error}}
 */
export function copyBlockId(blockId) {
    if (!blockId) {
        return { success: false, error: new Error('blockId is required') };
    }

    const cleanId = blockId.split('*').at(-1);
    copyToClipboard(cleanId);

    return { success: true, blockId: cleanId };
}

/**
 * Получение ID блока из буфера обмена
 * @returns {Promise<{success: boolean, blockId?: string, error?: Error}>}
 */
export async function getBlockIdFromClipboard() {
    try {
        const text = await getClipboardText();

        if (!text) {
            return { success: false, error: new Error('Clipboard is empty') };
        }

        if (!isValidUUID(text)) {
            return { success: false, error: new Error('Clipboard does not contain valid UUID') };
        }

        return { success: true, blockId: text };
    } catch (error) {
        return { success: false, error };
    }
}

/**
 * Начало режима вырезания блока
 * @param {string} blockId - ID блока для вырезания
 * @param {string} parentId - ID родительского блока
 * @returns {{success: boolean, cutData?: Object, error?: Error}}
 */
export function startCutBlock(blockId, parentId) {
    if (!blockId) {
        return { success: false, error: new Error('blockId is required') };
    }

    if (!parentId || parentId === 'rootContainer') {
        return { success: false, error: new Error('Cannot cut root block') };
    }

    const cleanBlockId = blockId.split('*').at(-1);
    const cleanParentId = parentId.split('*').at(-1);

    return {
        success: true,
        cutData: {
            block_id: cleanBlockId,
            old_parent_id: cleanParentId
        }
    };
}

/**
 * Завершение вырезания - перемещение блока
 * @param {Object} cutData - Данные о вырезанном блоке
 * @param {string} newParentId - ID нового родителя
 * @param {string} [beforeId] - ID блока, перед которым вставить
 * @returns {{success: boolean, moveData?: Object, error?: Error}}
 */
export function completeCutBlock(cutData, newParentId, beforeId = null) {
    if (!cutData || !cutData.block_id) {
        return { success: false, error: new Error('No block is being cut') };
    }

    if (!newParentId) {
        return { success: false, error: new Error('newParentId is required') };
    }

    const cleanNewParentId = newParentId.split('*').at(-1);

    const moveData = {
        ...cutData,
        new_parent_id: cleanNewParentId
    };

    if (beforeId) {
        moveData.before = beforeId;
    }

    return { success: true, moveData };
}

/**
 * Начало режима соединения блоков
 * @param {string} sourceId - ID исходного блока
 * @returns {{success: boolean, sourceId?: string, error?: Error}}
 */
export function startConnectBlocks(sourceId) {
    if (!sourceId) {
        return { success: false, error: new Error('sourceId is required') };
    }

    return { success: true, sourceId };
}

/**
 * Завершение соединения блоков
 * @param {string} sourceId - ID исходного блока
 * @param {string} targetId - ID целевого блока
 * @returns {{success: boolean, connection?: Object, error?: Error}}
 */
export function completeConnectBlocks(sourceId, targetId) {
    if (!sourceId || !targetId) {
        return { success: false, error: new Error('sourceId and targetId are required') };
    }

    if (sourceId === targetId) {
        return { success: false, error: new Error('Cannot connect block to itself') };
    }

    return {
        success: true,
        connection: { sourceId, targetId }
    };
}

/**
 * Извлечение ID блока из DOM-элемента
 * @param {HTMLElement} element - DOM-элемент
 * @param {HTMLElement} [linkElement] - Элемент ссылки (если есть)
 * @returns {string|null}
 */
export function extractBlockId(element, linkElement = null) {
    if (linkElement?.hasAttribute('blockLink')) {
        return linkElement.getAttribute('blocklink');
    }

    if (!element?.id) {
        return null;
    }

    return element.id.split('*').at(-1);
}

/**
 * Извлечение ID родителя из DOM-элемента
 * @param {HTMLElement} element - DOM-элемент
 * @returns {string|null}
 */
export function extractParentId(element) {
    const parent = element?.parentElement;
    if (!parent?.id || parent.id === 'rootContainer') {
        return null;
    }

    return parent.id.split('*').at(-1);
}

/**
 * Проверка, можно ли выполнить операцию в текущем режиме
 * @param {string} currentMode - Текущий режим
 * @param {Array<string>} allowedModes - Разрешённые режимы
 * @returns {boolean}
 */
export function isModeAllowed(currentMode, allowedModes) {
    if (allowedModes.includes('*')) {
        return true;
    }
    return allowedModes.includes(currentMode);
}

/**
 * Переключение режима
 * @param {string} currentMode - Текущий режим
 * @param {string} targetMode - Целевой режим
 * @returns {{newMode: string, changed: boolean}}
 */
export function toggleMode(currentMode, targetMode) {
    if (currentMode === targetMode) {
        return { newMode: MODES.NORMAL, changed: true };
    }
    return { newMode: targetMode, changed: true };
}

/**
 * Сброс в нормальный режим
 * @returns {{newMode: string}}
 */
export function resetToNormalMode() {
    return { newMode: MODES.NORMAL };
}

/**
 * Создание объекта состояния выделения
 * @param {Object} options - Опции
 * @returns {Object}
 */
export function createSelectionState(options = {}) {
    return {
        mode: options.mode || MODES.NORMAL,
        blockId: options.blockId || null,
        blockElement: options.blockElement || null,
        blockLinkElement: options.blockLinkElement || null,
        cutData: options.cutData || null,
        connectSourceId: options.connectSourceId || null,
        sourceElement: options.sourceElement || null
    };
}

/**
 * Обновление состояния выделения при клике на блок
 * @param {Object} state - Текущее состояние
 * @param {HTMLElement} blockElement - DOM-элемент блока
 * @param {HTMLElement} [blockLinkElement] - DOM-элемент ссылки
 * @returns {Object} - Новое состояние
 */
export function updateSelectionOnClick(state, blockElement, blockLinkElement = null) {
    const blockId = extractBlockId(blockElement, blockLinkElement);

    return {
        ...state,
        blockId,
        blockElement,
        blockLinkElement
    };
}

/**
 * Очистка состояния выделения
 * @param {Object} state - Текущее состояние
 * @returns {Object} - Очищенное состояние
 */
export function clearSelection(state) {
    return {
        ...state,
        blockId: null,
        blockElement: null,
        blockLinkElement: null,
        cutData: null,
        connectSourceId: null,
        sourceElement: null,
        mode: MODES.NORMAL
    };
}

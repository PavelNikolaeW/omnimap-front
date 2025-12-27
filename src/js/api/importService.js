import api from './api.js';

/**
 * Генерирует UUID v4 для нового блока
 * @returns {string} UUID
 */
export function generateBlockId() {
    return crypto.randomUUID();
}

/**
 * Коды ошибок импорта -> человекочитаемые сообщения
 */
const ERROR_MESSAGES = {
    parent_not_found: 'Родительский блок не найден',
    creator_missing: 'Не указан создатель блока',
    cycle_detected: 'Обнаружен цикл в иерархии блоков',
    permission_denied: 'Нет прав на изменение блока',
    invalid_uuid: 'Некорректный UUID блока',
    duplicate_id: 'Дублирующийся ID блока',
    invalid_data: 'Некорректные данные блока',
    unknown: 'Неизвестная ошибка'
};

/**
 * Форматирует код ошибки в читаемое сообщение
 * @param {string} code - Код ошибки
 * @returns {string} Человекочитаемое сообщение
 */
export function formatErrorMessage(code) {
    return ERROR_MESSAGES[code] || ERROR_MESSAGES.unknown;
}

/**
 * Валидирует payload блока перед отправкой
 * @param {Object} block - Объект блока
 * @returns {{valid: boolean, error?: string}}
 */
export function validateBlockPayload(block) {
    if (!block.id) {
        return { valid: false, error: 'Отсутствует id блока' };
    }

    // Проверка формата UUID (v4, v6, v7)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(block.id)) {
        return { valid: false, error: `Некорректный формат UUID: ${block.id}` };
    }

    if (block.parent_id && block.parent_id !== null && !uuidRegex.test(block.parent_id)) {
        return { valid: false, error: `Некорректный формат parent_id: ${block.parent_id}` };
    }

    return { valid: true };
}

/**
 * Валидирует массив блоков
 * @param {Array} blocks - Массив блоков для импорта
 * @returns {{valid: boolean, errors: Array}}
 */
export function validateBlocksPayload(blocks) {
    const errors = [];
    const MAX_BLOCKS = 1000;

    if (!Array.isArray(blocks)) {
        return { valid: false, errors: ['Payload должен быть массивом'] };
    }

    if (blocks.length === 0) {
        return { valid: false, errors: ['Массив блоков пуст'] };
    }

    if (blocks.length > MAX_BLOCKS) {
        return { valid: false, errors: [`Превышен лимит: максимум ${MAX_BLOCKS} блоков`] };
    }

    const seenIds = new Set();
    blocks.forEach((block, index) => {
        const result = validateBlockPayload(block);
        if (!result.valid) {
            errors.push(`Блок #${index + 1}: ${result.error}`);
        }

        if (seenIds.has(block.id)) {
            errors.push(`Блок #${index + 1}: Дублирующийся id ${block.id}`);
        }
        seenIds.add(block.id);
    });

    return { valid: errors.length === 0, errors };
}

/**
 * Отправляет блоки на импорт
 * @param {Array} blocks - Массив блоков для импорта
 * @returns {Promise<{task_id: string}>}
 */
export async function importBlocks(blocks) {
    const validation = validateBlocksPayload(blocks);
    if (!validation.valid) {
        throw new Error(validation.errors.join('\n'));
    }

    const response = await api.importBlocks(blocks);
    if (response.status !== 202) {
        throw new Error(response.data?.detail || 'Ошибка запуска импорта');
    }

    return response.data;
}

/**
 * Опрашивает статус задачи импорта с колбэком прогресса
 * @param {string} taskId - ID задачи
 * @param {Function} onProgress - Колбэк прогресса (stage, percent, processed, total)
 * @param {number} interval - Интервал опроса в мс (по умолчанию 500)
 * @param {number} timeout - Таймаут в мс (по умолчанию 300000 = 5 минут)
 * @returns {Promise<Object>} Результат импорта
 */
export async function pollImportStatus(taskId, onProgress, interval = 500, timeout = 300000) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
        const checkStatus = async () => {
            try {
                // Проверяем таймаут
                if (Date.now() - startTime >= timeout) {
                    reject(new Error('Превышено время ожидания импорта'));
                    return;
                }

                const response = await api.checkStatusTask(taskId);
                const data = response.data;

                // Обработка прогресса
                if (data.status === 'PROGRESS' && onProgress) {
                    const progress = data.progress || {};
                    onProgress({
                        stage: progress.stage || 'processing',
                        percent: progress.percent || 0,
                        processed: progress.processed_blocks || 0,
                        total: progress.total_blocks || 0
                    });
                }

                // Обработка завершения
                if (data.status === 'SUCCESS') {
                    resolve(data.result || {});
                    return;
                }

                // Обработка ошибки
                if (data.status === 'FAILURE') {
                    const errorMsg = data.result?.error || 'Импорт завершился с ошибкой';
                    reject(new Error(errorMsg));
                    return;
                }

                // Продолжаем опрос
                setTimeout(checkStatus, interval);

            } catch (error) {
                reject(new Error(`Ошибка проверки статуса: ${error.message}`));
            }
        };

        checkStatus();
    });
}

/**
 * Парсит JSON из строки с обработкой ошибок
 * @param {string} jsonString - JSON строка
 * @returns {{success: boolean, data?: Array, error?: string}}
 */
export function parseImportJson(jsonString) {
    try {
        const data = JSON.parse(jsonString);
        return { success: true, data };
    } catch (error) {
        return { success: false, error: `Ошибка парсинга JSON: ${error.message}` };
    }
}

/**
 * Утилиты для работы с childOrder массивами.
 * Предотвращают дублирование UUID и валидируют порядок дочерних блоков.
 */

/**
 * Удаляет дубликаты из childOrder, сохраняя порядок.
 * Первое вхождение каждого ID сохраняется.
 * @param {Array<string>} childOrder - Массив ID
 * @returns {Array<string>} Массив без дубликатов
 */
export function deduplicateChildOrder(childOrder) {
    if (!Array.isArray(childOrder)) return [];
    return [...new Set(childOrder)];
}

/**
 * Безопасно добавляет id в childOrder без дубликатов.
 * @param {Array<string>} childOrder - Массив ID (мутируется)
 * @param {string} id - ID для добавления
 * @returns {boolean} true если ID был добавлен, false если уже существовал
 */
export function safeAddToChildOrder(childOrder, id) {
    if (!Array.isArray(childOrder) || !id) return false;
    if (!childOrder.includes(id)) {
        childOrder.push(id);
        return true;
    }
    return false;
}

/**
 * Безопасно добавляет id в childOrder в указанную позицию без дубликатов.
 * @param {Array<string>} childOrder - Массив ID (мутируется)
 * @param {string} id - ID для добавления
 * @param {number} index - Позиция для вставки
 * @returns {boolean} true если ID был добавлен, false если уже существовал
 */
export function safeInsertToChildOrder(childOrder, id, index) {
    if (!Array.isArray(childOrder) || !id) return false;
    if (!childOrder.includes(id)) {
        // Валидируем индекс
        const validIndex = Math.max(0, Math.min(index, childOrder.length));
        childOrder.splice(validIndex, 0, id);
        return true;
    }
    return false;
}

/**
 * Валидирует childOrder — удаляет дубликаты и несуществующие ID.
 * @param {Array<string>} childOrder - Массив ID для валидации
 * @param {Set<string>|Map<string,any>} existingBlockIds - Set или Map существующих ID блоков
 * @returns {Array<string>} Очищенный массив
 */
export function validateChildOrder(childOrder, existingBlockIds) {
    if (!Array.isArray(childOrder)) return [];

    const seen = new Set();
    const hasId = existingBlockIds instanceof Set
        ? (id) => existingBlockIds.has(id)
        : existingBlockIds instanceof Map
            ? (id) => existingBlockIds.has(id)
            : () => true; // Если не передан, не фильтруем по существованию

    return childOrder.filter(id => {
        if (!id || seen.has(id)) return false;
        if (!hasId(id)) return false;
        seen.add(id);
        return true;
    });
}

/**
 * Проверяет childOrder на наличие дубликатов.
 * @param {Array<string>} childOrder - Массив ID
 * @returns {boolean} true если есть дубликаты
 */
export function hasDuplicates(childOrder) {
    if (!Array.isArray(childOrder)) return false;
    return new Set(childOrder).size !== childOrder.length;
}

/**
 * Находит дубликаты в childOrder.
 * @param {Array<string>} childOrder - Массив ID
 * @returns {Array<string>} Массив дублирующихся ID
 */
export function findDuplicates(childOrder) {
    if (!Array.isArray(childOrder)) return [];

    const seen = new Set();
    const duplicates = new Set();

    for (const id of childOrder) {
        if (seen.has(id)) {
            duplicates.add(id);
        }
        seen.add(id);
    }

    return [...duplicates];
}

/**
 * Утилиты для проверки прав доступа к блокам
 *
 * Блоки могут иметь флаг `forbidden: true`, который устанавливается
 * при отзыве прав доступа через WebSocket (block_update_access с permission: 'deny')
 */

/**
 * Проверяет, может ли пользователь редактировать блок
 * @param {Object} block - объект блока
 * @returns {boolean} true если блок можно редактировать
 */
export function canEdit(block) {
    if (!block) return false;
    if (block.forbidden) return false;
    return true;
}

/**
 * Проверяет, запрещён ли доступ к блоку
 * @param {Object} block - объект блока
 * @returns {boolean} true если доступ к блоку запрещён
 */
export function isForbidden(block) {
    return block?.forbidden === true;
}

/**
 * Утилиты для проверки прав доступа к блокам
 *
 * Блоки могут иметь:
 * - `forbidden: true` - флаг для полной блокировки (legacy, устанавливается при отзыве прав)
 * - `permission` - уровень прав доступа: 'view', 'edit', 'edit_ac', 'delete', null (собственный блок)
 */

/**
 * Уровни прав доступа
 */
export const PERMISSIONS = {
    VIEW: 'view',
    EDIT: 'edit',
    EDIT_AC: 'edit_ac',
    DELETE: 'delete',
    FORBIDDEN: 'forbidden'
};

/**
 * Иерархия уровней прав (больше = больше прав)
 * null означает собственный блок с полными правами
 */
const HIERARCHY = {
    'forbidden': 0,
    'view': 1,
    'edit': 2,
    'edit_ac': 3,
    'delete': 4,
    [null]: 5,  // собственный блок - полные права
    [undefined]: 5  // для обратной совместимости
};

/**
 * Получает числовой уровень прав для блока
 * @param {Object} block - объект блока
 * @returns {number} уровень прав (0-5)
 */
function getPermissionLevel(block) {
    if (!block) return 0;
    if (block.forbidden) return HIERARCHY['forbidden'];
    return HIERARCHY[block.permission] ?? 5;
}

/**
 * Проверяет, может ли пользователь редактировать блок
 * @param {Object} block - объект блока
 * @returns {boolean} true если блок можно редактировать
 */
export function canEdit(block) {
    if (!block) return false;
    if (block.forbidden) return false;
    const level = getPermissionLevel(block);
    return level >= HIERARCHY['edit'];
}

/**
 * Проверяет, может ли пользователь удалять блок
 * @param {Object} block - объект блока
 * @returns {boolean} true если блок можно удалить
 */
export function canDelete(block) {
    if (!block) return false;
    if (block.forbidden) return false;
    const level = getPermissionLevel(block);
    return level >= HIERARCHY['delete'];
}

/**
 * Проверяет, может ли пользователь управлять правами доступа к блоку
 * @param {Object} block - объект блока
 * @returns {boolean} true если можно изменять права доступа
 */
export function canEditAccess(block) {
    if (!block) return false;
    if (block.forbidden) return false;
    const level = getPermissionLevel(block);
    return level >= HIERARCHY['edit_ac'];
}

/**
 * Проверяет, доступен ли блок только для чтения
 * @param {Object} block - объект блока
 * @returns {boolean} true если блок только для чтения
 */
export function isViewOnly(block) {
    if (!block) return false;
    return block.permission === PERMISSIONS.VIEW;
}

/**
 * Проверяет, запрещён ли доступ к блоку
 * @param {Object} block - объект блока
 * @returns {boolean} true если доступ к блоку запрещён
 */
export function isForbidden(block) {
    return block?.forbidden === true;
}

/**
 * Получает строковое представление прав для data-атрибута
 * @param {Object} block - объект блока
 * @returns {string|null} значение для data-permission атрибута
 */
export function getPermissionDataAttribute(block) {
    if (!block) return null;
    if (block.forbidden) return 'forbidden';
    if (block.permission === PERMISSIONS.VIEW) return 'view-only';
    return null;
}

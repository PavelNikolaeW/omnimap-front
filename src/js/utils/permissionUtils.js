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
    SANDBOX: 'sandbox',
    EDIT: 'edit',
    EDIT_AC: 'edit_ac',
    DELETE: 'delete',
    FORBIDDEN: 'forbidden'
};

/**
 * Режимы sandbox
 */
export const SANDBOX_MODES = {
    NONE: null,
    OPEN: 'open',
    PRIVATE: 'private'
};

/**
 * Иерархия уровней прав (больше = больше прав)
 * null означает собственный блок с полными правами
 */
const HIERARCHY = {
    'forbidden': 0,
    'view': 1,
    'sandbox': 1.5,  // между view и edit - может создавать, но не редактировать чужие
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

// ==========================================
// Sandbox Mode Functions
// ==========================================

/**
 * Проверяет, находится ли родительский блок в sandbox режиме
 * @param {Object} parentBlock - родительский блок
 * @returns {boolean} true если родитель в sandbox режиме
 */
export function isInSandbox(parentBlock) {
    if (!parentBlock) return false;
    return parentBlock.sandbox_mode === SANDBOX_MODES.OPEN ||
           parentBlock.sandbox_mode === SANDBOX_MODES.PRIVATE;
}

/**
 * Проверяет, является ли пользователь создателем блока
 * @param {Object} block - блок с creator_id
 * @param {number|string} currentUserId - ID текущего пользователя
 * @returns {boolean} true если пользователь создал блок
 */
export function isBlockOwner(block, currentUserId) {
    if (!block?.creator_id || !currentUserId) return false;
    // Приводим к числу для сравнения
    return Number(block.creator_id) === Number(currentUserId);
}

/**
 * Проверяет, является ли пользователь владельцем контейнера (имеет delete права)
 * @param {Object} parentBlock - родительский sandbox контейнер
 * @returns {boolean} true если пользователь владелец контейнера
 */
export function isContainerOwner(parentBlock) {
    if (!parentBlock) return false;
    const level = getPermissionLevel(parentBlock);
    // delete (4) или собственный блок (5)
    return level >= HIERARCHY['delete'];
}

/**
 * Проверяет, может ли пользователь создавать блоки в sandbox
 * @param {Object} parentBlock - родительский блок
 * @returns {boolean} true если можно создавать блоки
 */
export function canCreateInSandbox(parentBlock) {
    if (!parentBlock) return false;

    // Если не sandbox - используем стандартную проверку на edit
    if (!isInSandbox(parentBlock)) {
        return canEdit(parentBlock);
    }

    // В sandbox: нужно минимум sandbox право или выше
    const level = getPermissionLevel(parentBlock);
    return level >= HIERARCHY['sandbox'];
}

/**
 * Проверяет, может ли пользователь редактировать блок в sandbox контексте
 * @param {Object} block - блок для редактирования
 * @param {Object} parentBlock - родительский контейнер
 * @param {number|string} currentUserId - ID текущего пользователя
 * @returns {boolean} true если можно редактировать
 */
export function canEditInSandbox(block, parentBlock, currentUserId) {
    if (!block) return false;
    if (block.forbidden) return false;

    // Если не в sandbox - стандартная проверка
    if (!isInSandbox(parentBlock)) {
        return canEdit(block);
    }

    // В sandbox: владелец блока ИЛИ владелец контейнера
    return isBlockOwner(block, currentUserId) || isContainerOwner(parentBlock);
}

/**
 * Проверяет, может ли пользователь удалять блок в sandbox контексте
 * @param {Object} block - блок для удаления
 * @param {Object} parentBlock - родительский контейнер
 * @param {number|string} currentUserId - ID текущего пользователя
 * @returns {boolean} true если можно удалить
 */
export function canDeleteInSandbox(block, parentBlock, currentUserId) {
    if (!block) return false;
    if (block.forbidden) return false;

    // Если не в sandbox - стандартная проверка
    if (!isInSandbox(parentBlock)) {
        return canDelete(block);
    }

    // В sandbox: владелец блока ИЛИ владелец контейнера
    return isBlockOwner(block, currentUserId) || isContainerOwner(parentBlock);
}

/**
 * Получает data-permission атрибут для блока в sandbox контексте
 * @param {Object} block - блок
 * @param {Object} parentBlock - родительский контейнер
 * @param {number|string} currentUserId - ID текущего пользователя
 * @returns {string|null} значение для data-permission атрибута
 */
export function getSandboxPermissionAttribute(block, parentBlock, currentUserId) {
    // Сначала проверяем стандартные ограничения
    const standardAttr = getPermissionDataAttribute(block);
    if (standardAttr) return standardAttr;

    // Если не в sandbox - нет дополнительных ограничений
    if (!isInSandbox(parentBlock)) {
        return null;
    }

    // В sandbox: помечаем блоки которые нельзя редактировать
    if (!canEditInSandbox(block, parentBlock, currentUserId)) {
        return 'sandbox-readonly';
    }

    return null;
}

/**
 * Проверяет, виден ли блок в private sandbox режиме
 * В private sandbox пользователь видит только:
 * - Свои созданные блоки (creator_id === currentUserId)
 * - Если он владелец контейнера - все блоки
 *
 * @param {Object} block - блок для проверки
 * @param {Object} parentBlock - родительский контейнер (sandbox)
 * @param {number|string} currentUserId - ID текущего пользователя
 * @returns {boolean} true если блок виден пользователю
 */
export function canViewInPrivateSandbox(block, parentBlock, currentUserId) {
    if (!block) return false;

    // Если не в sandbox или это open sandbox - видны все блоки
    if (!parentBlock || parentBlock.sandbox_mode !== SANDBOX_MODES.PRIVATE) {
        return true;
    }

    // Владелец контейнера видит все блоки
    if (isContainerOwner(parentBlock)) {
        return true;
    }

    // В private sandbox: видны только свои блоки
    return isBlockOwner(block, currentUserId);
}

/**
 * Фильтрует список ID детей для отображения в private sandbox
 * @param {Array<string>} childIds - список ID детей
 * @param {Map} blocks - Map всех блоков
 * @param {Object} parentBlock - родительский контейнер (sandbox)
 * @param {number|string} currentUserId - ID текущего пользователя
 * @returns {Array<string>} отфильтрованный список ID
 */
export function filterChildrenForPrivateSandbox(childIds, blocks, parentBlock, currentUserId) {
    if (!childIds || !Array.isArray(childIds)) return [];

    // Если не private sandbox - возвращаем всех детей
    if (!parentBlock || parentBlock.sandbox_mode !== SANDBOX_MODES.PRIVATE) {
        return childIds;
    }

    // Владелец контейнера видит все блоки
    if (isContainerOwner(parentBlock)) {
        return childIds;
    }

    // Фильтруем только видимые блоки для private sandbox
    return childIds.filter(childId => {
        const childBlock = blocks.get(childId);
        return canViewInPrivateSandbox(childBlock, parentBlock, currentUserId);
    });
}

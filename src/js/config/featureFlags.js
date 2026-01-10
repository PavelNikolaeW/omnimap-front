/**
 * Feature Flags - флаги для постепенного внедрения новых функций
 *
 * Использование:
 *   import { featureFlags } from './config/featureFlags';
 *   if (featureFlags.UNIFIED_GROUPS) { ... }
 *
 * Переключение через localStorage:
 *   localStorage.setItem('ff_unified_groups', 'true');
 *   location.reload();
 */

// Читаем флаги из localStorage (для тестирования)
function getFlag(name, defaultValue = false) {
    const stored = localStorage.getItem(`ff_${name}`);
    if (stored !== null) {
        return stored === 'true';
    }
    return defaultValue;
}

export const featureFlags = {
    /**
     * UNIFIED_GROUPS - объединённые группы доступа и чаты
     *
     * Когда true:
     * - Вкладка "Группы" загружает группы доступа через api.getGroups()
     * - Сообщения групп через /groups/{id}/messages/
     * - Нет отдельного создания чат-групп
     *
     * Когда false (текущее поведение):
     * - Отдельные чат-группы через chatApi.getChatGroups()
     * - Можно создавать независимые чат-группы
     */
    UNIFIED_GROUPS: getFlag('unified_groups', false),
};

// Для отладки в консоли
if (typeof window !== 'undefined') {
    window.__featureFlags = featureFlags;
    window.__setFeatureFlag = (name, value) => {
        localStorage.setItem(`ff_${name}`, String(value));
        console.log(`Feature flag '${name}' set to ${value}. Reload to apply.`);
    };
}

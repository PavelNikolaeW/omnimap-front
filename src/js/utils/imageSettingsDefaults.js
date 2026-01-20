/**
 * Дефолтные настройки отображения изображения в блоке
 * Централизованное хранение для избежания дублирования
 */

export const DEFAULT_IMAGE_SETTINGS = {
    fitMode: 'auto',
    position: 'center',
    background: {
        enabled: false,
        opacity: 100,
        blur: 0,
        overlayColor: '#000000',
        overlayOpacity: 0
    }
};

/**
 * Возвращает глубокую копию дефолтных настроек
 * @returns {Object} копия DEFAULT_IMAGE_SETTINGS
 */
export function getDefaultImageSettings() {
    return JSON.parse(JSON.stringify(DEFAULT_IMAGE_SETTINGS));
}

/**
 * Валидирует hex цвет
 * @param {string} color - цвет для проверки
 * @returns {boolean} true если валидный hex
 */
export function isValidHexColor(color) {
    if (!color || typeof color !== 'string') return false;
    return /^#[0-9A-Fa-f]{6}$/.test(color) || /^#[0-9A-Fa-f]{3}$/.test(color);
}

/**
 * Возвращает безопасный цвет (валидный или дефолтный)
 * @param {string} color - цвет для проверки
 * @param {string} defaultColor - дефолтный цвет
 * @returns {string} валидный hex цвет
 */
export function getSafeColor(color, defaultColor = '#000000') {
    return isValidHexColor(color) ? color : defaultColor;
}

/**
 * Ограничивает число в заданном диапазоне
 * @param {number} value - значение
 * @param {number} min - минимум
 * @param {number} max - максимум
 * @returns {number} значение в диапазоне
 */
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

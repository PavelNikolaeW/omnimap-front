import { SHAPES } from './config/sizeConfig.js';

/**
 * Базовые стили для каждого размера
 * Вместо 21 блока (7 размеров × 3 формы) храним только базовые значения
 */
const SIZE_STYLES = {
    table: { padding: 2, gap: 4, fontSize: '12px', fontWeight: 'bold' },
    xxxs:  { padding: 3, gap: 2, fontSize: '8px', fontWeight: 'bold' },
    xxs:   { padding: 4, gap: 2, fontSize: '10px', fontWeight: 'bold' },
    xs:    { padding: 6, gap: 5, fontSize: '14px', fontWeight: 'normal' },
    s:     { padding: 6, gap: 6, fontSize: '14px', fontWeight: 'normal' },
    m:     { padding: 6, gap: 6, fontSize: '14px', fontWeight: 'normal' },
    l:     { padding: 7, gap: 7, fontSize: '14px', fontWeight: 'normal' },
    xl:    { padding: 8, gap: 8, fontSize: '14px', fontWeight: 'normal' },
    xxl:   { padding: 10, gap: 9, fontSize: '14px', fontWeight: 'normal' },
};

/**
 * Переопределения стилей для конкретных форм (только там, где отличается)
 * Большинство форм используют одинаковые стили
 */
const SHAPE_OVERRIDES = {
    xxxs: {
        [SHAPES.WIDE]: { textAlign: 'center' },
    },
    xxs: {
        [SHAPES.WIDE]: { textAlign: 'center' },
    },
};

/**
 * Значения по умолчанию для всех размеров
 */
const DEFAULTS = {
    textAlign: 'left',
    writingMode: 'horizontal-tb',
};

/**
 * Генерация полной конфигурации стилей из базовых значений
 * Сохраняет обратную совместимость с существующим форматом
 *
 * @returns {Object} styleConfig в формате { size: { shape: {...styles} } }
 */
function generateStyleConfig() {
    const config = {
        table: {
            table: { ...SIZE_STYLES.table, ...DEFAULTS }
        }
    };

    const shapes = [SHAPES.SQUARE, SHAPES.WIDE, SHAPES.TALL];
    const sizes = ['xxxs', 'xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl'];

    for (const size of sizes) {
        config[size] = {};
        const baseStyle = SIZE_STYLES[size];

        for (const shape of shapes) {
            const override = SHAPE_OVERRIDES[size]?.[shape] || {};
            config[size][shape] = {
                ...baseStyle,
                ...DEFAULTS,
                ...override,
            };
        }
    }

    return config;
}

/**
 * Конфигурация стилей для размеров и форм блоков
 * Используется в gridClassManager и blockCreator
 */
export const styleConfig = generateStyleConfig();

/**
 * Генерация CSS строки из конфигурации
 * @param {Object} config - styleConfig
 * @returns {string} CSS строка
 */
function generateStyles(config) {
    let styles = '';

    for (const size of Object.keys(config)) {
        for (const form of Object.keys(config[size])) {
            const { padding, gap, fontSize, fontWeight, textAlign, writingMode } = config[size][form];
            styles += `
                .${size}-${form} {
                    font-weight: ${fontWeight};
                    gap: ${gap}px;
                    padding: ${padding}px;
                    font-size: ${fontSize};
                    text-align: ${textAlign};
                    writing-mode: ${writingMode};
                }
            `;
        }
    }

    return styles;
}

/**
 * Добавить CSS стили размеров в документ
 */
export function addedSizeStyles() {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(generateStyles(styleConfig));
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

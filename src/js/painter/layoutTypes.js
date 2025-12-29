/**
 * Типы раскладки блоков и их метаданные
 */

// Основные типы layout
export const LAYOUT_TYPES = {
    DEFAULT: 'default',           // Авто-расчёт (текущее поведение)
    ROWS: 'rows',                 // Вертикальный стек
    COLUMNS: 'columns',           // Горизонтальный ряд
    TABLE: 'table',               // Таблица (существующий)
    GRID: 'grid',                 // Настраиваемая сетка NxM
    MASONRY: 'masonry',           // Умное заполнение пустот
    TEMPLATE: 'template'          // Кастомный шаблон
};

// Алиасы для обратной совместимости
export const LAYOUT_ALIASES = {
    'vertical': LAYOUT_TYPES.ROWS,
    'horizontal': LAYOUT_TYPES.COLUMNS
};

// Метки для UI
export const LAYOUT_LABELS = {
    [LAYOUT_TYPES.DEFAULT]: 'Авто',
    [LAYOUT_TYPES.ROWS]: 'Строки',
    [LAYOUT_TYPES.COLUMNS]: 'Колонки',
    [LAYOUT_TYPES.TABLE]: 'Таблица',
    [LAYOUT_TYPES.GRID]: 'Сетка',
    [LAYOUT_TYPES.MASONRY]: 'Masonry',
    [LAYOUT_TYPES.TEMPLATE]: 'Шаблон'
};

// Иконки FontAwesome для UI
export const LAYOUT_ICONS = {
    [LAYOUT_TYPES.DEFAULT]: 'fa-th',
    [LAYOUT_TYPES.ROWS]: 'fa-grip-lines',
    [LAYOUT_TYPES.COLUMNS]: 'fa-grip-lines-vertical',
    [LAYOUT_TYPES.TABLE]: 'fa-table-cells',
    [LAYOUT_TYPES.GRID]: 'fa-border-all',
    [LAYOUT_TYPES.MASONRY]: 'fa-th-large',
    [LAYOUT_TYPES.TEMPLATE]: 'fa-clone'
};

// Описания для подсказок
export const LAYOUT_DESCRIPTIONS = {
    [LAYOUT_TYPES.DEFAULT]: 'Автоматический расчёт раскладки на основе числа детей и размера блока',
    [LAYOUT_TYPES.ROWS]: 'Дочерние блоки выстраиваются вертикально друг под другом',
    [LAYOUT_TYPES.COLUMNS]: 'Дочерние блоки выстраиваются горизонтально в ряд',
    [LAYOUT_TYPES.TABLE]: 'Табличная раскладка с настраиваемым числом строк и колонок',
    [LAYOUT_TYPES.GRID]: 'Фиксированная сетка NxM с равномерным распределением',
    [LAYOUT_TYPES.MASONRY]: 'Умное заполнение пустот как в Pinterest',
    [LAYOUT_TYPES.TEMPLATE]: 'Использовать сохранённый шаблон раскладки'
};

// Конфигурация по умолчанию для grid
export const DEFAULT_GRID_CONFIG = {
    rows: 2,
    columns: 2,
    gap: null  // null = использовать стандартный gap
};

// Конфигурация по умолчанию для masonry
export const DEFAULT_MASONRY_CONFIG = {
    minChildWidth: 100,   // Минимальная ширина дочернего блока
    maxColumns: 4         // Максимальное число колонок
};

/**
 * Парсит строку layout и возвращает тип и конфигурацию
 * @param {string} layoutString - Строка layout из block.data.layout
 * @returns {{type: string, config: object|null}}
 */
export function parseLayoutType(layoutString) {
    if (!layoutString || layoutString === 'default') {
        return { type: LAYOUT_TYPES.DEFAULT, config: null };
    }

    // Проверяем алиасы (vertical -> rows, horizontal -> columns)
    if (LAYOUT_ALIASES[layoutString]) {
        return { type: LAYOUT_ALIASES[layoutString], config: null };
    }

    // grid-NxM формат (например grid-3x2)
    const gridMatch = layoutString.match(/^grid-(\d+)x(\d+)$/);
    if (gridMatch) {
        return {
            type: LAYOUT_TYPES.GRID,
            config: {
                rows: parseInt(gridMatch[1], 10),
                columns: parseInt(gridMatch[2], 10)
            }
        };
    }

    // template:templateId формат
    if (layoutString.startsWith('template:')) {
        return {
            type: LAYOUT_TYPES.TEMPLATE,
            config: { templateId: layoutString.slice(9) }
        };
    }

    // Простые типы (rows, columns, table, masonry)
    if (Object.values(LAYOUT_TYPES).includes(layoutString)) {
        return { type: layoutString, config: null };
    }

    // Неизвестный тип - fallback на default
    return { type: LAYOUT_TYPES.DEFAULT, config: null };
}

/**
 * Формирует строку layout из типа и конфигурации
 * @param {string} type - Тип layout
 * @param {object} config - Конфигурация (опционально)
 * @returns {string}
 */
export function formatLayoutString(type, config = null) {
    if (type === LAYOUT_TYPES.GRID && config?.rows && config?.columns) {
        return `grid-${config.rows}x${config.columns}`;
    }

    if (type === LAYOUT_TYPES.TEMPLATE && config?.templateId) {
        return `template:${config.templateId}`;
    }

    return type;
}

/**
 * Проверяет, является ли layout допустимым
 * @param {string} layoutString
 * @returns {boolean}
 */
export function isValidLayout(layoutString) {
    const { type } = parseLayoutType(layoutString);
    return type !== LAYOUT_TYPES.DEFAULT || layoutString === 'default' || !layoutString;
}

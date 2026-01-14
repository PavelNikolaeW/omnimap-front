/**
 * adaptivePresets.js
 *
 * Адаптивные пресеты раскладки блоков.
 * Генерируют конфигурацию grid динамически на основе формы блока.
 *
 * Формат blockShape: "size-form" (например "xl-h", "md-sq", "l-w")
 * - size: xxxs, xxs, xs, s, m, l, xl, xxl
 * - form: w (wide), h (high), sq (square)
 */

// ============ HELPERS ============

function parseShape(blockShape) {
    const [size, form] = (blockShape || 'md-sq').split('-');
    return { size: size || 'md', form: form || 'sq' };
}

// ============ AUTO-GRID ============

const autoGridPreset = {
    name: 'Авто-сетка',

    generate: (childOrder, blockShape) => {
        const { form } = parseShape(blockShape);
        const n = childOrder.length;
        const cells = {};

        if (n === 0) {
            return { gridSize: { rows: 1, cols: 1 }, cells };
        }

        // Высокий → столбец
        if (form === 'h') {
            for (let i = 0; i < n; i++) {
                cells[childOrder[i]] = { row: i + 1, col: 1, rowSpan: 1, colSpan: 1 };
            }
            return { gridSize: { rows: n, cols: 1 }, cells };
        }

        // Широкий → ряд
        if (form === 'w') {
            for (let i = 0; i < n; i++) {
                cells[childOrder[i]] = { row: 1, col: i + 1, rowSpan: 1, colSpan: 1 };
            }
            return { gridSize: { rows: 1, cols: n }, cells };
        }

        // Квадрат → оптимальная сетка
        const cols = Math.ceil(Math.sqrt(n));
        const rows = Math.ceil(n / cols);

        for (let i = 0; i < n; i++) {
            cells[childOrder[i]] = {
                row: Math.floor(i / cols) + 1,
                col: (i % cols) + 1,
                rowSpan: 1,
                colSpan: 1
            };
        }

        return { gridSize: { rows, cols }, cells };
    }
};

// ============ SIDEBAR ============

const sidebarPreset = {
    name: 'Сайдбар',

    generate: (childOrder, blockShape, options = {}) => {
        const { form } = parseShape(blockShape);
        const side = options.side || 'left';
        const n = childOrder.length;
        const cells = {};

        if (n === 0) {
            return { gridSize: { rows: 1, cols: 6 }, cells };
        }

        // Высокий → sidebar становится header
        if (form === 'h') {
            const cols = 6;

            if (n > 0) {
                cells[childOrder[0]] = { row: 1, col: 1, rowSpan: 1, colSpan: cols };
            }

            for (let i = 1; i < n; i++) {
                cells[childOrder[i]] = { row: i + 1, col: 1, rowSpan: 1, colSpan: cols };
            }

            return { gridSize: { rows: Math.max(n, 2), cols }, cells };
        }

        // Широкий/квадрат → горизонтальный sidebar
        const cols = 12;
        const sidebarWidth = form === 'sq' ? 4 : 3;
        const sidebarCol = side === 'left' ? 1 : cols - sidebarWidth + 1;
        const contentCol = side === 'left' ? sidebarWidth + 1 : 1;
        const contentWidth = cols - sidebarWidth;
        const contentRows = Math.max(n - 1, 1);

        if (n > 0) {
            cells[childOrder[0]] = {
                row: 1, col: sidebarCol,
                rowSpan: contentRows, colSpan: sidebarWidth
            };
        }

        for (let i = 1; i < n; i++) {
            cells[childOrder[i]] = {
                row: i, col: contentCol,
                rowSpan: 1, colSpan: contentWidth
            };
        }

        return { gridSize: { rows: contentRows, cols }, cells };
    }
};

// ============ KANBAN ============

const kanbanPreset = {
    name: 'Kanban',

    generate: (childOrder, blockShape, options = {}) => {
        const { form } = parseShape(blockShape);
        const targetColumns = options.columns || 3;
        const n = childOrder.length;
        const cells = {};

        if (n === 0) {
            return { gridSize: { rows: 1, cols: targetColumns }, cells };
        }

        // Высокий → строки вместо колонок
        if (form === 'h') {
            const cols = 6;

            for (let i = 0; i < n; i++) {
                cells[childOrder[i]] = { row: i + 1, col: 1, rowSpan: 1, colSpan: cols };
            }

            return { gridSize: { rows: n, cols }, cells };
        }

        // Широкий/квадрат → колонки
        const cols = form === 'sq' ? 6 : 12;
        const actualColumns = Math.min(n, targetColumns);
        const colSpan = Math.floor(cols / actualColumns);

        for (let i = 0; i < n; i++) {
            const colIndex = i % actualColumns;
            const rowIndex = Math.floor(i / actualColumns);

            cells[childOrder[i]] = {
                row: rowIndex + 1,
                col: colIndex * colSpan + 1,
                rowSpan: 1,
                colSpan
            };
        }

        return {
            gridSize: { rows: Math.ceil(n / actualColumns), cols },
            cells
        };
    }
};

// ============ DASHBOARD ============

const dashboardPreset = {
    name: 'Dashboard',

    generate: (childOrder, blockShape) => {
        const { form } = parseShape(blockShape);
        const n = childOrder.length;
        const cells = {};

        if (n === 0) {
            return { gridSize: { rows: 3, cols: 12 }, cells };
        }

        // Высокий → вертикальный dashboard
        if (form === 'h') {
            const cols = 6;

            // Main - 2 строки
            if (n > 0) {
                cells[childOrder[0]] = { row: 1, col: 1, rowSpan: 2, colSpan: cols };
            }

            // Остальные - по одному
            for (let i = 1; i < n; i++) {
                cells[childOrder[i]] = { row: i + 2, col: 1, rowSpan: 1, colSpan: cols };
            }

            return { gridSize: { rows: Math.max(n + 1, 3), cols }, cells };
        }

        // Квадрат → main сверху, виджеты снизу
        if (form === 'sq') {
            const cols = 6;

            if (n > 0) {
                cells[childOrder[0]] = { row: 1, col: 1, rowSpan: 2, colSpan: cols };
            }

            for (let i = 1; i < n; i++) {
                const idx = i - 1;
                cells[childOrder[i]] = {
                    row: 3 + Math.floor(idx / 2),
                    col: (idx % 2) * 3 + 1,
                    rowSpan: 1,
                    colSpan: 3
                };
            }

            return { gridSize: { rows: 2 + Math.ceil((n - 1) / 2), cols }, cells };
        }

        // Широкий → классический dashboard
        const cols = 12;

        if (n > 0) cells[childOrder[0]] = { row: 1, col: 1, rowSpan: 2, colSpan: 8 };
        if (n > 1) cells[childOrder[1]] = { row: 1, col: 9, rowSpan: 1, colSpan: 4 };
        if (n > 2) cells[childOrder[2]] = { row: 2, col: 9, rowSpan: 1, colSpan: 4 };

        // Метрики
        const metricCount = Math.max(n - 3, 0);
        const metricCols = Math.min(metricCount, 4);
        const metricWidth = metricCols > 0 ? Math.floor(cols / metricCols) : 3;

        for (let i = 3; i < n; i++) {
            const idx = i - 3;
            cells[childOrder[i]] = {
                row: 3 + Math.floor(idx / 4),
                col: (idx % 4) * metricWidth + 1,
                rowSpan: 1,
                colSpan: metricWidth
            };
        }

        return { gridSize: { rows: 3 + Math.ceil(metricCount / 4), cols }, cells };
    }
};

// ============ HOLY GRAIL ============

const holyGrailPreset = {
    name: 'Holy Grail',

    generate: (childOrder, blockShape) => {
        const { form } = parseShape(blockShape);
        const n = childOrder.length;
        const cells = {};

        // Высокий или мало блоков → стек
        if (form === 'h' || n <= 3) {
            const cols = 6;

            for (let i = 0; i < n; i++) {
                cells[childOrder[i]] = { row: i + 1, col: 1, rowSpan: 1, colSpan: cols };
            }

            return { gridSize: { rows: Math.max(n, 3), cols }, cells };
        }

        // Квадрат → упрощённый (header, content, footer)
        if (form === 'sq') {
            const cols = 6;

            if (n > 0) cells[childOrder[0]] = { row: 1, col: 1, rowSpan: 1, colSpan: cols };

            // Середина
            for (let i = 1; i < n - 1; i++) {
                cells[childOrder[i]] = { row: i + 1, col: 1, rowSpan: 1, colSpan: cols };
            }

            if (n > 1) {
                cells[childOrder[n - 1]] = { row: n, col: 1, rowSpan: 1, colSpan: cols };
            }

            return { gridSize: { rows: n, cols }, cells };
        }

        // Широкий → полный holy grail
        const cols = 12;

        // Header
        if (n > 0) cells[childOrder[0]] = { row: 1, col: 1, rowSpan: 1, colSpan: cols };
        // Nav
        if (n > 1) cells[childOrder[1]] = { row: 2, col: 1, rowSpan: 1, colSpan: 2 };
        // Content
        if (n > 2) cells[childOrder[2]] = { row: 2, col: 3, rowSpan: 1, colSpan: 8 };
        // Aside
        if (n > 3) cells[childOrder[3]] = { row: 2, col: 11, rowSpan: 1, colSpan: 2 };
        // Footer
        if (n > 4) cells[childOrder[4]] = { row: 3, col: 1, rowSpan: 1, colSpan: cols };

        // Лишние
        for (let i = 5; i < n; i++) {
            const idx = i - 5;
            cells[childOrder[i]] = {
                row: 4 + Math.floor(idx / 3),
                col: (idx % 3) * 4 + 1,
                rowSpan: 1,
                colSpan: 4
            };
        }

        return { gridSize: { rows: 3 + Math.ceil(Math.max(n - 5, 0) / 3), cols }, cells };
    }
};

// ============ GALLERY ============

const galleryPreset = {
    name: 'Галерея',

    generate: (childOrder, blockShape) => {
        const { form } = parseShape(blockShape);
        const n = childOrder.length;
        const cells = {};

        if (n === 0) {
            return { gridSize: { rows: 2, cols: 6 }, cells };
        }

        // Высокий → вертикальная галерея
        if (form === 'h') {
            const cols = 6;

            cells[childOrder[0]] = { row: 1, col: 1, rowSpan: 2, colSpan: cols };

            for (let i = 1; i < n; i++) {
                cells[childOrder[i]] = { row: i + 2, col: 1, rowSpan: 1, colSpan: cols };
            }

            return { gridSize: { rows: n + 1, cols }, cells };
        }

        // Квадрат → big сверху, small в 2 колонки
        if (form === 'sq') {
            const cols = 6;

            cells[childOrder[0]] = { row: 1, col: 1, rowSpan: 2, colSpan: cols };

            for (let i = 1; i < n; i++) {
                const idx = i - 1;
                cells[childOrder[i]] = {
                    row: 3 + Math.floor(idx / 2),
                    col: (idx % 2) * 3 + 1,
                    rowSpan: 1,
                    colSpan: 3
                };
            }

            return { gridSize: { rows: 2 + Math.ceil((n - 1) / 2), cols }, cells };
        }

        // Широкий → big слева, small справа
        const cols = 12;

        cells[childOrder[0]] = { row: 1, col: 1, rowSpan: 2, colSpan: 8 };

        for (let i = 1; i < n; i++) {
            if (i <= 2) {
                cells[childOrder[i]] = { row: i, col: 9, rowSpan: 1, colSpan: 4 };
            } else {
                const idx = i - 3;
                cells[childOrder[i]] = {
                    row: 3 + Math.floor(idx / 3),
                    col: (idx % 3) * 4 + 1,
                    rowSpan: 1,
                    colSpan: 4
                };
            }
        }

        return { gridSize: { rows: 2 + Math.ceil(Math.max(n - 3, 0) / 3), cols }, cells };
    }
};

// ============ GRID NxN ============

function createGridPreset(targetRows, targetCols) {
    return {
        name: `${targetRows}×${targetCols}`,

        generate: (childOrder, blockShape) => {
            const { form } = parseShape(blockShape);
            const n = childOrder.length;
            const cells = {};

            if (n === 0) {
                return { gridSize: { rows: targetRows, cols: targetCols }, cells };
            }

            let rows, cols;

            if (form === 'h') {
                // Высокий → больше строк
                cols = Math.max(1, Math.ceil(targetCols / 2));
                rows = Math.ceil(n / cols);
            } else if (form === 'w') {
                // Широкий → больше колонок
                cols = targetRows * targetCols;
                rows = Math.ceil(n / cols);
                if (rows === 1 && n > 4) {
                    cols = Math.ceil(n / 2);
                    rows = 2;
                }
            } else {
                // Квадрат → как задано
                cols = targetCols;
                rows = Math.ceil(n / cols);
            }

            for (let i = 0; i < n; i++) {
                cells[childOrder[i]] = {
                    row: Math.floor(i / cols) + 1,
                    col: (i % cols) + 1,
                    rowSpan: 1,
                    colSpan: 1
                };
            }

            return { gridSize: { rows: Math.max(rows, targetRows), cols }, cells };
        }
    };
}

// ============ CALENDAR PRESETS ============

/**
 * Пресет для недели календаря
 * План + Итоги слева, Дни справа
 * В высоком блоке: План, Итоги, Дни вертикально
 */
const weekCalendarPreset = {
    name: 'Неделя',

    generate: (childOrder, blockShape) => {
        const { form } = parseShape(blockShape);
        const n = childOrder.length;
        const cells = {};

        if (n === 0) {
            return { gridSize: { rows: 2, cols: 2 }, cells };
        }

        // Высокий → всё в столбец
        if (form === 'h') {
            const cols = 1;

            for (let i = 0; i < n; i++) {
                cells[childOrder[i]] = { row: i + 1, col: 1, rowSpan: 1, colSpan: cols };
            }

            return { gridSize: { rows: n, cols }, cells };
        }

        // Широкий/квадрат → План+Итоги слева, Дни справа
        const cols = 2;

        // План
        if (n > 0) cells[childOrder[0]] = { row: 1, col: 1, rowSpan: 1, colSpan: 1 };
        // Итоги
        if (n > 1) cells[childOrder[1]] = { row: 2, col: 1, rowSpan: 1, colSpan: 1 };
        // Дни (контейнер)
        if (n > 2) cells[childOrder[2]] = { row: 1, col: 2, rowSpan: 2, colSpan: 1 };

        // Лишние блоки
        for (let i = 3; i < n; i++) {
            cells[childOrder[i]] = { row: i, col: 1, rowSpan: 1, colSpan: cols };
        }

        return { gridSize: { rows: Math.max(2, n - 1), cols }, cells };
    }
};

/**
 * Пресет для месяца календаря
 * План + Итоги слева, Недели справа
 */
const monthCalendarPreset = {
    name: 'Месяц',

    generate: (childOrder, blockShape) => {
        const { form } = parseShape(blockShape);
        const n = childOrder.length;
        const cells = {};

        if (n === 0) {
            return { gridSize: { rows: 2, cols: 2 }, cells };
        }

        // Высокий → всё в столбец
        if (form === 'h') {
            const cols = 1;

            for (let i = 0; i < n; i++) {
                cells[childOrder[i]] = { row: i + 1, col: 1, rowSpan: 1, colSpan: cols };
            }

            return { gridSize: { rows: n, cols }, cells };
        }

        // Широкий/квадрат → План+Итоги слева, Недели справа
        const cols = 2;

        // План
        if (n > 0) cells[childOrder[0]] = { row: 1, col: 1, rowSpan: 1, colSpan: 1 };
        // Итоги
        if (n > 1) cells[childOrder[1]] = { row: 2, col: 1, rowSpan: 1, colSpan: 1 };
        // Недели (контейнер)
        if (n > 2) cells[childOrder[2]] = { row: 1, col: 2, rowSpan: 2, colSpan: 1 };

        // Лишние блоки
        for (let i = 3; i < n; i++) {
            cells[childOrder[i]] = { row: i, col: 1, rowSpan: 1, colSpan: cols };
        }

        return { gridSize: { rows: Math.max(2, n - 1), cols }, cells };
    }
};

/**
 * Пресет для квартала календаря
 * План + Итоги слева, 3 месяца справа
 */
const quarterCalendarPreset = {
    name: 'Квартал',

    generate: (childOrder, blockShape) => {
        const { form } = parseShape(blockShape);
        const n = childOrder.length;
        const cells = {};

        if (n === 0) {
            return { gridSize: { rows: 2, cols: 4 }, cells };
        }

        // Высокий → всё в столбец
        if (form === 'h') {
            const cols = 1;

            for (let i = 0; i < n; i++) {
                cells[childOrder[i]] = { row: i + 1, col: 1, rowSpan: 1, colSpan: cols };
            }

            return { gridSize: { rows: n, cols }, cells };
        }

        // Широкий → План+Итоги слева, месяцы горизонтально
        if (form === 'w') {
            const cols = 4;

            // План
            if (n > 0) cells[childOrder[0]] = { row: 1, col: 1, rowSpan: 1, colSpan: 1 };
            // Итоги
            if (n > 1) cells[childOrder[1]] = { row: 2, col: 1, rowSpan: 1, colSpan: 1 };
            // Месяцы
            if (n > 2) cells[childOrder[2]] = { row: 1, col: 2, rowSpan: 2, colSpan: 1 };
            if (n > 3) cells[childOrder[3]] = { row: 1, col: 3, rowSpan: 2, colSpan: 1 };
            if (n > 4) cells[childOrder[4]] = { row: 1, col: 4, rowSpan: 2, colSpan: 1 };

            return { gridSize: { rows: 2, cols }, cells };
        }

        // Квадрат → 2x2 с месяцами
        const cols = 2;

        // План
        if (n > 0) cells[childOrder[0]] = { row: 1, col: 1, rowSpan: 1, colSpan: 1 };
        // Итоги
        if (n > 1) cells[childOrder[1]] = { row: 1, col: 2, rowSpan: 1, colSpan: 1 };
        // Месяцы в ряд
        for (let i = 2; i < n; i++) {
            const idx = i - 2;
            cells[childOrder[i]] = {
                row: 2 + Math.floor(idx / 2),
                col: (idx % 2) + 1,
                rowSpan: 1,
                colSpan: 1
            };
        }

        return { gridSize: { rows: 2 + Math.ceil((n - 2) / 2), cols }, cells };
    }
};

/**
 * Пресет для года календаря
 * План + Итоги слева, 4 квартала справа (2x2)
 */
const yearCalendarPreset = {
    name: 'Год',

    generate: (childOrder, blockShape) => {
        const { form } = parseShape(blockShape);
        const n = childOrder.length;
        const cells = {};

        if (n === 0) {
            return { gridSize: { rows: 2, cols: 3 }, cells };
        }

        // Высокий → всё в столбец
        if (form === 'h') {
            const cols = 1;

            for (let i = 0; i < n; i++) {
                cells[childOrder[i]] = { row: i + 1, col: 1, rowSpan: 1, colSpan: cols };
            }

            return { gridSize: { rows: n, cols }, cells };
        }

        // Широкий/квадрат → План+Итоги слева, кварталы 2x2 справа
        const cols = 3;

        // План
        if (n > 0) cells[childOrder[0]] = { row: 1, col: 1, rowSpan: 1, colSpan: 1 };
        // Итоги
        if (n > 1) cells[childOrder[1]] = { row: 2, col: 1, rowSpan: 1, colSpan: 1 };
        // Q1
        if (n > 2) cells[childOrder[2]] = { row: 1, col: 2, rowSpan: 1, colSpan: 1 };
        // Q2
        if (n > 3) cells[childOrder[3]] = { row: 1, col: 3, rowSpan: 1, colSpan: 1 };
        // Q3
        if (n > 4) cells[childOrder[4]] = { row: 2, col: 2, rowSpan: 1, colSpan: 1 };
        // Q4
        if (n > 5) cells[childOrder[5]] = { row: 2, col: 3, rowSpan: 1, colSpan: 1 };

        return { gridSize: { rows: 2, cols }, cells };
    }
};

// ============ EXPORT ============

export const ADAPTIVE_PRESETS = {
    // Универсальные
    'auto-grid': autoGridPreset,
    'days-column': autoGridPreset,    // alias для дней недели
    'weeks-column': autoGridPreset,   // alias для недель месяца

    // Layouts
    'sidebar': sidebarPreset,
    'sidebar-right': {
        ...sidebarPreset,
        name: 'Сайдбар справа',
        generate: (c, s, o = {}) => sidebarPreset.generate(c, s, { ...o, side: 'right' })
    },
    'kanban': kanbanPreset,
    'dashboard': dashboardPreset,
    'holy-grail': holyGrailPreset,
    'gallery': galleryPreset,

    // Grids
    '2x2': createGridPreset(2, 2),
    '3x3': createGridPreset(3, 3),
    '4x4': createGridPreset(4, 4),

    // Calendar
    'week-calendar': weekCalendarPreset,
    'month-calendar': monthCalendarPreset,
    'quarter-calendar': quarterCalendarPreset,
    'year-calendar': yearCalendarPreset,
};

/**
 * Проверяет, является ли пресет адаптивным
 * @param {string|null|undefined} presetType - тип пресета
 * @returns {boolean}
 */
export function isAdaptivePreset(presetType) {
    if (!presetType) return false;
    return Object.prototype.hasOwnProperty.call(ADAPTIVE_PRESETS, presetType);
}

/**
 * Генерирует адаптивную раскладку
 * @param {string} presetType - тип пресета
 * @param {string[]} childOrder - порядок дочерних блоков
 * @param {string} blockShape - форма блока (например "xl-h")
 * @param {Object} options - дополнительные опции пресета
 * @returns {Object|null} - { gridSize, cells } или null
 */
export function generateAdaptiveLayout(presetType, childOrder, blockShape, options = {}) {
    const preset = ADAPTIVE_PRESETS[presetType];
    if (!preset) return null;

    return preset.generate(childOrder, blockShape, options);
}

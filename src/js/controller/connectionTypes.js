/**
 * Типы соединений для блок-схем
 * Каждый тип определяет внешний вид стрелки
 */

/**
 * Базовые типы соединений
 */
export const CONNECTION_TYPES = {
    DEFAULT: 'default',      // Стандартное соединение
    DASHED: 'dashed',        // Пунктирная линия
    DOTTED: 'dotted',        // Точечная линия
    DOUBLE: 'double',        // Двусторонняя стрелка
    THICK: 'thick',          // Толстая линия
    THIN: 'thin',            // Тонкая линия
    CURVED: 'curved',        // Изогнутая линия (Bezier)
    STRAIGHT: 'straight',    // Прямая линия
    ELBOW: 'elbow',          // Ломаная линия (Flowchart)
    DEPENDENCY: 'dependency', // Зависимость (пунктир со стрелкой)
    INHERITANCE: 'inheritance', // Наследование (пустой треугольник)
    COMPOSITION: 'composition', // Композиция (закрашенный ромб)
    AGGREGATION: 'aggregation', // Агрегация (пустой ромб)
    ORTHOGONAL: 'orthogonal',   // Ортогональное (прямые углы)
    STATEMACHINE: 'statemachine' // Петля (self-loop)
};

/**
 * Метки для типов соединений
 */
export const CONNECTION_LABELS = {
    [CONNECTION_TYPES.DEFAULT]: 'Стандартное',
    [CONNECTION_TYPES.DASHED]: 'Пунктирное',
    [CONNECTION_TYPES.DOTTED]: 'Точечное',
    [CONNECTION_TYPES.DOUBLE]: 'Двустороннее',
    [CONNECTION_TYPES.THICK]: 'Толстое',
    [CONNECTION_TYPES.THIN]: 'Тонкое',
    [CONNECTION_TYPES.CURVED]: 'Изогнутое',
    [CONNECTION_TYPES.STRAIGHT]: 'Прямое',
    [CONNECTION_TYPES.ELBOW]: 'Ломаное',
    [CONNECTION_TYPES.DEPENDENCY]: 'Зависимость',
    [CONNECTION_TYPES.INHERITANCE]: 'Наследование',
    [CONNECTION_TYPES.COMPOSITION]: 'Композиция',
    [CONNECTION_TYPES.AGGREGATION]: 'Агрегация',
    [CONNECTION_TYPES.ORTHOGONAL]: 'Ортогональное',
    [CONNECTION_TYPES.STATEMACHINE]: 'Петля'
};

/**
 * Иконки для типов соединений
 */
export const CONNECTION_ICONS = {
    [CONNECTION_TYPES.DEFAULT]: 'fa-arrow-right',
    [CONNECTION_TYPES.DASHED]: 'fa-ellipsis',
    [CONNECTION_TYPES.DOTTED]: 'fa-ellipsis-h',
    [CONNECTION_TYPES.DOUBLE]: 'fa-arrows-left-right',
    [CONNECTION_TYPES.THICK]: 'fa-grip-lines',
    [CONNECTION_TYPES.THIN]: 'fa-minus',
    [CONNECTION_TYPES.CURVED]: 'fa-bezier-curve',
    [CONNECTION_TYPES.STRAIGHT]: 'fa-ruler',
    [CONNECTION_TYPES.ELBOW]: 'fa-turn-down-right',
    [CONNECTION_TYPES.DEPENDENCY]: 'fa-link',
    [CONNECTION_TYPES.INHERITANCE]: 'fa-sitemap',
    [CONNECTION_TYPES.COMPOSITION]: 'fa-diamond',
    [CONNECTION_TYPES.AGGREGATION]: 'fa-square',
    [CONNECTION_TYPES.ORTHOGONAL]: 'fa-right-left',
    [CONNECTION_TYPES.STATEMACHINE]: 'fa-rotate'
};

/**
 * Базовые стили линий
 */
const BASE_PAINT_STYLES = {
    stroke: "#516077",
    strokeWidth: 2,
    outlineStroke: "transparent",
    outlineWidth: 10
};

/**
 * Конфигурации соединений по типам
 * Содержит настройки для jsPlumb
 */
export const CONNECTION_CONFIGS = {
    [CONNECTION_TYPES.DEFAULT]: {
        connector: {
            type: "Flowchart",
            options: { stub: 30, alwaysRespectStubs: false, cornerRadius: 5, midpoint: 0.5 }
        },
        paintStyle: { ...BASE_PAINT_STYLES },
        overlays: [
            { type: "Arrow", options: { width: 10, length: 10, location: 1 } }
        ]
    },

    [CONNECTION_TYPES.DASHED]: {
        connector: {
            type: "Flowchart",
            options: { stub: 50, alwaysRespectStubs: true, cornerRadius: 5 }
        },
        paintStyle: {
            ...BASE_PAINT_STYLES,
            dashstyle: "4 2" // Пунктирная линия
        },
        overlays: [
            { type: "Arrow", options: { width: 10, length: 10, location: 1 } }
        ]
    },

    [CONNECTION_TYPES.DOTTED]: {
        connector: {
            type: "Flowchart",
            options: { stub: 50, alwaysRespectStubs: true, cornerRadius: 5 }
        },
        paintStyle: {
            ...BASE_PAINT_STYLES,
            dashstyle: "1 3" // Точечная линия
        },
        overlays: [
            { type: "Arrow", options: { width: 10, length: 10, location: 1 } }
        ]
    },

    [CONNECTION_TYPES.DOUBLE]: {
        connector: {
            type: "Flowchart",
            options: { stub: 50, alwaysRespectStubs: true, cornerRadius: 5 }
        },
        paintStyle: { ...BASE_PAINT_STYLES },
        overlays: [
            { type: "Arrow", options: { width: 10, length: 10, location: 1 } },
            { type: "Arrow", options: { width: 10, length: 10, location: 0, direction: -1 } }
        ]
    },

    [CONNECTION_TYPES.THICK]: {
        connector: {
            type: "Flowchart",
            options: { stub: 50, alwaysRespectStubs: true, cornerRadius: 5 }
        },
        paintStyle: {
            ...BASE_PAINT_STYLES,
            strokeWidth: 4
        },
        overlays: [
            { type: "Arrow", options: { width: 14, length: 14, location: 1 } }
        ]
    },

    [CONNECTION_TYPES.THIN]: {
        connector: {
            type: "Flowchart",
            options: { stub: 50, alwaysRespectStubs: true, cornerRadius: 5 }
        },
        paintStyle: {
            ...BASE_PAINT_STYLES,
            strokeWidth: 1
        },
        overlays: [
            { type: "Arrow", options: { width: 6, length: 6, location: 1 } }
        ]
    },

    [CONNECTION_TYPES.CURVED]: {
        connector: {
            type: "Bezier",
            options: { curviness: 100 }
        },
        paintStyle: { ...BASE_PAINT_STYLES },
        overlays: [
            { type: "Arrow", options: { width: 10, length: 10, location: 1 } }
        ]
    },

    [CONNECTION_TYPES.STRAIGHT]: {
        connector: {
            type: "Straight"
        },
        paintStyle: { ...BASE_PAINT_STYLES },
        overlays: [
            { type: "Arrow", options: { width: 10, length: 10, location: 1 } }
        ]
    },

    [CONNECTION_TYPES.ELBOW]: {
        connector: {
            type: "Flowchart",
            options: { stub: 30, alwaysRespectStubs: true, cornerRadius: 0 }
        },
        paintStyle: { ...BASE_PAINT_STYLES },
        overlays: [
            { type: "Arrow", options: { width: 10, length: 10, location: 1 } }
        ]
    },

    [CONNECTION_TYPES.DEPENDENCY]: {
        connector: {
            type: "Flowchart",
            options: { stub: 50, alwaysRespectStubs: true, cornerRadius: 5 }
        },
        paintStyle: {
            ...BASE_PAINT_STYLES,
            dashstyle: "6 3"
        },
        overlays: [
            { type: "Arrow", options: { width: 10, length: 10, location: 1, foldback: 1 } }
        ]
    },

    [CONNECTION_TYPES.INHERITANCE]: {
        connector: {
            type: "Flowchart",
            options: { stub: 50, alwaysRespectStubs: true, cornerRadius: 5 }
        },
        paintStyle: { ...BASE_PAINT_STYLES },
        overlays: [
            {
                type: "Arrow",
                options: {
                    width: 14,
                    length: 12,
                    location: 1,
                    foldback: 0.7,
                    paintStyle: { fill: "white", stroke: "#516077", strokeWidth: 2 }
                }
            }
        ]
    },

    [CONNECTION_TYPES.COMPOSITION]: {
        connector: {
            type: "Flowchart",
            options: { stub: 50, alwaysRespectStubs: true, cornerRadius: 5 }
        },
        paintStyle: { ...BASE_PAINT_STYLES },
        overlays: [
            { type: "Arrow", options: { width: 10, length: 10, location: 1 } },
            {
                type: "Diamond",
                options: {
                    width: 12,
                    length: 12,
                    location: 0,
                    paintStyle: { fill: "#516077" }
                }
            }
        ]
    },

    [CONNECTION_TYPES.AGGREGATION]: {
        connector: {
            type: "Flowchart",
            options: { stub: 50, alwaysRespectStubs: true, cornerRadius: 5 }
        },
        paintStyle: { ...BASE_PAINT_STYLES },
        overlays: [
            { type: "Arrow", options: { width: 10, length: 10, location: 1 } },
            {
                type: "Diamond",
                options: {
                    width: 12,
                    length: 12,
                    location: 0,
                    paintStyle: { fill: "white", stroke: "#516077", strokeWidth: 2 }
                }
            }
        ]
    },

    // ORTHOGONAL - используем Flowchart с меньшим stub для близких блоков
    [CONNECTION_TYPES.ORTHOGONAL]: {
        connector: {
            type: "Flowchart",
            options: { stub: 15, cornerRadius: 5, alwaysRespectStubs: false, midpoint: 0.5 }
        },
        paintStyle: { ...BASE_PAINT_STYLES },
        overlays: [
            { type: "Arrow", options: { width: 10, length: 10, location: 1 } }
        ]
    },

    [CONNECTION_TYPES.STATEMACHINE]: {
        connector: {
            type: "StateMachine",
            options: { margin: 5, curviness: 10, proximityLimit: 80 }
        },
        paintStyle: { ...BASE_PAINT_STYLES },
        overlays: [
            { type: "Arrow", options: { width: 10, length: 10, location: 1 } }
        ]
    }
};

/**
 * Получает конфигурацию соединения по типу
 * @param {string} connectionType - тип соединения
 * @returns {Object} конфигурация
 */
export function getConnectionConfig(connectionType) {
    return CONNECTION_CONFIGS[connectionType] || CONNECTION_CONFIGS[CONNECTION_TYPES.DEFAULT];
}

/**
 * Проверяет, является ли тип соединения допустимым
 * @param {string} type - тип соединения
 * @returns {boolean}
 */
export function isValidConnectionType(type) {
    return Object.values(CONNECTION_TYPES).includes(type);
}

/**
 * Получает все доступные типы соединений для UI
 * @returns {Array<{type: string, label: string, icon: string}>}
 */
export function getAllConnectionTypes() {
    return Object.values(CONNECTION_TYPES).map(type => ({
        type,
        label: CONNECTION_LABELS[type],
        icon: CONNECTION_ICONS[type]
    }));
}

/**
 * Цвета для соединений
 */
export const CONNECTION_COLORS = {
    default: '#516077',
    red: '#dc3545',
    green: '#28a745',
    blue: '#007bff',
    yellow: '#ffc107',
    purple: '#6f42c1',
    orange: '#fd7e14',
    cyan: '#17a2b8',
    gray: '#6c757d'
};

/**
 * Применяет цвет к конфигурации соединения
 * @param {Object} config - конфигурация соединения
 * @param {string} color - цвет (hex или ключ из CONNECTION_COLORS)
 * @returns {Object} новая конфигурация с применённым цветом
 */
export function applyColorToConfig(config, color) {
    const colorValue = CONNECTION_COLORS[color] || color;
    const newConfig = JSON.parse(JSON.stringify(config));

    // Применяем цвет к paintStyle
    if (newConfig.paintStyle) {
        newConfig.paintStyle.stroke = colorValue;
    }

    // Применяем цвет к overlay стрелкам
    if (newConfig.overlays) {
        newConfig.overlays = newConfig.overlays.map(overlay => {
            if (overlay.type === 'Arrow' || overlay.type === 'Diamond') {
                return {
                    ...overlay,
                    options: {
                        ...overlay.options,
                        paintStyle: {
                            ...(overlay.options?.paintStyle || {}),
                            stroke: colorValue,
                            fill: overlay.options?.paintStyle?.fill === 'white'
                                ? 'white'
                                : colorValue
                        }
                    }
                };
            }
            return overlay;
        });
    }

    return newConfig;
}

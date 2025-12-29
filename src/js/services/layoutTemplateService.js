/**
 * Сервис для работы с шаблонами layout
 * Шаблоны определяют фиксированные позиции для дочерних блоков
 */

/**
 * Встроенные шаблоны layout
 * Каждый шаблон определяет:
 * - id: уникальный идентификатор
 * - name: отображаемое имя
 * - description: описание шаблона
 * - minChildren: минимальное количество детей
 * - maxChildren: максимальное количество детей (null = без ограничения)
 * - getLayout: функция, возвращающая конфигурацию grid для заданного числа детей
 */
export const BUILT_IN_TEMPLATES = {
    /**
     * Карточка задачи: заголовок сверху, основной контент слева, метаданные справа
     * [  Заголовок  ]
     * [ Контент | Мета ]
     */
    'task-card': {
        id: 'task-card',
        name: 'Карточка задачи',
        description: 'Заголовок сверху, контент слева, метаданные справа',
        icon: 'fa-tasks',
        minChildren: 2,
        maxChildren: 3,
        getLayout(childCount, blockSize) {
            const positions = {};
            const childOrder = ['header', 'content', 'meta'];

            if (childCount >= 1) {
                // Первый ребёнок - заголовок (вся ширина)
                positions[0] = {
                    gridColumn: '1 / 3',
                    gridRow: '2'
                };
            }
            if (childCount >= 2) {
                // Второй ребёнок - основной контент (левая колонка)
                positions[1] = {
                    gridColumn: '1 / 2',
                    gridRow: '3'
                };
            }
            if (childCount >= 3) {
                // Третий ребёнок - метаданные (правая колонка)
                positions[2] = {
                    gridColumn: '2 / 3',
                    gridRow: '3'
                };
            }

            return {
                gridTemplateColumns: '2fr 1fr',
                gridTemplateRows: 'auto 1fr 2fr',
                totalRows: 3,
                totalColumns: 2,
                positions
            };
        }
    },

    /**
     * Обзор проекта: широкий заголовок, три равные колонки снизу
     * [      Заголовок      ]
     * [ Кол1 | Кол2 | Кол3  ]
     */
    'project-overview': {
        id: 'project-overview',
        name: 'Обзор проекта',
        description: 'Широкий заголовок и три колонки',
        icon: 'fa-project-diagram',
        minChildren: 1,
        maxChildren: 4,
        getLayout(childCount, blockSize) {
            const positions = {};

            if (childCount >= 1) {
                // Первый ребёнок - заголовок (вся ширина)
                positions[0] = {
                    gridColumn: '1 / 4',
                    gridRow: '2'
                };
            }
            // Остальные дети распределяются по колонкам
            for (let i = 1; i < childCount && i <= 3; i++) {
                positions[i] = {
                    gridColumn: `${i} / ${i + 1}`,
                    gridRow: '3'
                };
            }

            return {
                gridTemplateColumns: '1fr 1fr 1fr',
                gridTemplateRows: 'auto 1fr 2fr',
                totalRows: 3,
                totalColumns: 3,
                positions
            };
        }
    },

    /**
     * Канбан-доска: горизонтальные колонки
     * [ Кол1 | Кол2 | Кол3 | Кол4 ]
     */
    'kanban': {
        id: 'kanban',
        name: 'Канбан-доска',
        description: 'Горизонтальные колонки для статусов',
        icon: 'fa-columns',
        minChildren: 1,
        maxChildren: 6,
        getLayout(childCount, blockSize) {
            const positions = {};
            const columns = Math.min(childCount, 6);

            for (let i = 0; i < childCount; i++) {
                positions[i] = {
                    gridColumn: `${(i % columns) + 1} / ${(i % columns) + 2}`,
                    gridRow: `${Math.floor(i / columns) + 2}`
                };
            }

            const rows = Math.ceil(childCount / columns);
            return {
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                gridTemplateRows: `auto ${Array(rows).fill('1fr').join(' ')}`,
                totalRows: rows + 1,
                totalColumns: columns,
                positions
            };
        }
    },

    /**
     * Сайдбар: основной контент слева, сайдбар справа
     * [ Контент | Сайдбар ]
     */
    'sidebar-layout': {
        id: 'sidebar-layout',
        name: 'С сайдбаром',
        description: 'Основной контент и боковая панель',
        icon: 'fa-window-maximize',
        minChildren: 1,
        maxChildren: null,
        getLayout(childCount, blockSize) {
            const positions = {};

            if (childCount >= 1) {
                // Первый ребёнок - основной контент (70% ширины)
                positions[0] = {
                    gridColumn: '1 / 2',
                    gridRow: '2'
                };
            }
            // Остальные дети идут в сайдбар (стекаются вертикально)
            for (let i = 1; i < childCount; i++) {
                positions[i] = {
                    gridColumn: '2 / 3',
                    gridRow: `${i + 1}`
                };
            }

            const sidebarRows = Math.max(1, childCount - 1);
            return {
                gridTemplateColumns: '3fr 1fr',
                gridTemplateRows: `auto ${Array(sidebarRows).fill('1fr').join(' ')}`,
                totalRows: sidebarRows + 1,
                totalColumns: 2,
                positions
            };
        }
    },

    /**
     * Hero-секция: большой блок сверху, маленькие снизу
     * [      Hero       ]
     * [ Item1 | Item2 | Item3 ]
     */
    'hero-section': {
        id: 'hero-section',
        name: 'Hero-секция',
        description: 'Большой блок сверху, элементы снизу',
        icon: 'fa-image',
        minChildren: 1,
        maxChildren: 7,
        getLayout(childCount, blockSize) {
            const positions = {};
            const bottomColumns = Math.min(childCount - 1, 4);

            if (childCount >= 1) {
                // Первый ребёнок - hero (вся ширина, 2 строки)
                positions[0] = {
                    gridColumn: `1 / ${bottomColumns + 1}`,
                    gridRow: '2 / 3'
                };
            }

            // Остальные дети распределяются снизу
            for (let i = 1; i < childCount && i <= bottomColumns; i++) {
                positions[i] = {
                    gridColumn: `${i} / ${i + 1}`,
                    gridRow: '3'
                };
            }

            // Дополнительные дети идут на следующую строку
            for (let i = bottomColumns + 1; i < childCount; i++) {
                const col = ((i - bottomColumns - 1) % bottomColumns) + 1;
                const row = Math.floor((i - bottomColumns - 1) / bottomColumns) + 4;
                positions[i] = {
                    gridColumn: `${col} / ${col + 1}`,
                    gridRow: `${row}`
                };
            }

            const extraRows = childCount > bottomColumns + 1
                ? Math.ceil((childCount - bottomColumns - 1) / bottomColumns)
                : 0;

            return {
                gridTemplateColumns: `repeat(${Math.max(bottomColumns, 1)}, 1fr)`,
                gridTemplateRows: `auto 2fr 1fr ${Array(extraRows).fill('1fr').join(' ')}`.trim(),
                totalRows: 3 + extraRows,
                totalColumns: Math.max(bottomColumns, 1),
                positions
            };
        }
    },

    /**
     * Dashboard: сетка виджетов разного размера
     * [ Widget1 (2x2) | Widget2 ]
     * [              | Widget3 ]
     */
    'dashboard': {
        id: 'dashboard',
        name: 'Dashboard',
        description: 'Сетка виджетов разного размера',
        icon: 'fa-th-large',
        minChildren: 1,
        maxChildren: 8,
        getLayout(childCount, blockSize) {
            const positions = {};

            // Первый виджет занимает 2x2
            if (childCount >= 1) {
                positions[0] = {
                    gridColumn: '1 / 3',
                    gridRow: '2 / 4'
                };
            }

            // Второй и третий виджеты справа
            if (childCount >= 2) {
                positions[1] = {
                    gridColumn: '3 / 4',
                    gridRow: '2'
                };
            }
            if (childCount >= 3) {
                positions[2] = {
                    gridColumn: '3 / 4',
                    gridRow: '3'
                };
            }

            // Остальные виджеты распределяются внизу
            for (let i = 3; i < childCount; i++) {
                const col = ((i - 3) % 3) + 1;
                positions[i] = {
                    gridColumn: `${col} / ${col + 1}`,
                    gridRow: '4'
                };
            }

            const hasBottomRow = childCount > 3;
            return {
                gridTemplateColumns: '1fr 1fr 1fr',
                gridTemplateRows: hasBottomRow ? 'auto 1fr 1fr 1fr' : 'auto 1fr 1fr',
                totalRows: hasBottomRow ? 4 : 3,
                totalColumns: 3,
                positions
            };
        }
    }
};

/**
 * Класс для работы с шаблонами layout
 */
class LayoutTemplateService {
    constructor() {
        this.templates = { ...BUILT_IN_TEMPLATES };
        this.customTemplates = new Map();
    }

    /**
     * Получает шаблон по ID
     * @param {string} templateId
     * @returns {Object|null}
     */
    getTemplate(templateId) {
        return this.templates[templateId] || this.customTemplates.get(templateId) || null;
    }

    /**
     * Получает все доступные шаблоны
     * @returns {Array<Object>}
     */
    getAllTemplates() {
        const builtIn = Object.values(this.templates);
        const custom = Array.from(this.customTemplates.values());
        return [...builtIn, ...custom];
    }

    /**
     * Регистрирует пользовательский шаблон
     * @param {Object} template
     */
    registerTemplate(template) {
        if (!template.id || !template.getLayout) {
            console.warn('LayoutTemplateService: Invalid template', template);
            return;
        }
        this.customTemplates.set(template.id, template);
    }

    /**
     * Удаляет пользовательский шаблон
     * @param {string} templateId
     */
    removeTemplate(templateId) {
        this.customTemplates.delete(templateId);
    }

    /**
     * Применяет шаблон к блоку и возвращает позиции детей
     * @param {string} templateId - ID шаблона
     * @param {Object} block - блок с детьми
     * @param {Object} blockSize - размер блока { width, height }
     * @returns {Object|null} - { grid, contentPosition, childrenPositions }
     */
    applyTemplate(templateId, block, blockSize) {
        const template = this.getTemplate(templateId);
        if (!template) {
            console.warn(`LayoutTemplateService: Template "${templateId}" not found`);
            return null;
        }

        const childCount = block.children?.length || 0;

        // Проверяем ограничения
        if (template.minChildren && childCount < template.minChildren) {
            console.warn(`LayoutTemplateService: Template requires at least ${template.minChildren} children`);
        }

        const layout = template.getLayout(childCount, blockSize);
        if (!layout) {
            return null;
        }

        // Конвертируем позиции в формат gridClassManager
        const childrenPositions = {};
        const childOrder = block.data?.childOrder || [];

        Object.entries(layout.positions).forEach(([index, pos]) => {
            const childId = childOrder[parseInt(index, 10)];
            if (childId && pos) {
                childrenPositions[childId] = this.convertPositionToClasses(pos);
            }
        });

        // Генерируем классы для grid
        const gridClasses = this.generateGridClasses(layout);
        const contentPosition = this.generateContentPosition(layout);

        return {
            grid: gridClasses,
            contentPosition,
            childrenPositions,
            templateLayout: layout
        };
    }

    /**
     * Конвертирует CSS позицию в классы grid
     * @param {Object} pos - { gridColumn: '1 / 3', gridRow: '2' }
     * @returns {Array<string>}
     */
    convertPositionToClasses(pos) {
        const classes = [];

        if (pos.gridColumn) {
            const [start, end] = pos.gridColumn.split(' / ').map(s => s.trim());
            if (end) {
                classes.push(`grid-column_${start}__${end}`);
            } else {
                classes.push(`grid-column_${start}`);
            }
        }

        if (pos.gridRow) {
            const [start, end] = pos.gridRow.split(' / ').map(s => s.trim());
            if (end) {
                classes.push(`grid-row_${start}__${end}`);
            } else {
                classes.push(`grid-row_${start}`);
            }
        }

        return classes;
    }

    /**
     * Генерирует классы для grid контейнера
     * @param {Object} layout
     * @returns {Array<string>}
     */
    generateGridClasses(layout) {
        const cols = layout.totalColumns || 1;
        const rows = layout.totalRows || 1;

        return [
            `grid-template-columns_${'1fr__'.repeat(cols)}`,
            `grid-template-rows_auto__${'1fr__'.repeat(rows - 1)}`
        ];
    }

    /**
     * Генерирует позицию для контента блока
     * @param {Object} layout
     * @returns {Array<string>}
     */
    generateContentPosition(layout) {
        const cols = layout.totalColumns || 1;
        return [
            `grid-column_1_sl_${cols + 1}`,
            `grid-row_auto`
        ];
    }
}

// Синглтон
export const layoutTemplateService = new LayoutTemplateService();
export default layoutTemplateService;

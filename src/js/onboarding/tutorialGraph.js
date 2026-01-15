/**
 * Туториальный граф блоков для пользователей
 *
 * Структура демонстрирует основные возможности OmniMap:
 * - Иерархия блоков
 * - Цвета для организации
 * - Текстовое содержимое
 *
 * Туториал создаётся как отдельное дерево, доступное всегда через Space+1
 */

/**
 * Генерирует UUID v4
 * @returns {string}
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Определение туториальных блоков
 * Ключ — идентификатор блока (будет заменён на UUID)
 */
const TUTORIAL_BLOCKS = {
    // ═══════════════════════════════════════════════════════════════════════════
    // Корневой блок туториала
    // ═══════════════════════════════════════════════════════════════════════════
    root: {
        title: 'Обучение OmniMap',
        data: {
            text: `<h2>Ваш персональный экзокортекс</h2>
<p>OmniMap — это инструмент для организации знаний, идей и проектов.</p>
<p>Изучите разделы ниже, чтобы узнать основные возможности.</p>
<p><strong>Совет:</strong> Нажмите <kbd>Enter</kbd> или кликните на блок, чтобы войти в него.</p>
<p><em>Переключайтесь между деревьями: <kbd>Space</kbd> + цифра (0-9)</em></p>`,
            color: [210, 80, 70] // Синий
        },
        children: ['nav', 'create', 'organize', 'advanced']
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // Раздел: Навигация
    // ═══════════════════════════════════════════════════════════════════════════
    nav: {
        title: 'Навигация',
        data: {
            text: `<h3>Как перемещаться по блокам</h3>
<ul>
<li><kbd>Enter</kbd> или клик — войти в блок</li>
<li><kbd>Backspace</kbd> — вернуться назад</li>
<li><kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> — перемещение между блоками</li>
<li><kbd>F</kbd> — поиск по всем блокам</li>
</ul>`,
            color: [120, 70, 60] // Зелёный
        },
        children: ['nav-search', 'nav-tabs']
    },

    'nav-search': {
        title: 'Поиск (F)',
        data: {
            text: `<p>Нажмите <kbd>F</kbd> чтобы открыть поиск.</p>
<p>Поиск работает по названиям и содержимому всех блоков.</p>
<p>Результаты показываются в реальном времени.</p>`,
            color: [120, 70, 65]
        },
        children: []
    },

    'nav-tabs': {
        title: 'Вкладки (Space + 0-9)',
        data: {
            text: `<p>У вас может быть несколько деревьев блоков.</p>
<p>Переключайтесь между ними: <kbd>Space</kbd> + цифра (0-9).</p>
<p><strong>Сейчас у вас два дерева:</strong></p>
<ul>
<li><kbd>Space+0</kbd> — Мои заметки (ваше основное дерево)</li>
<li><kbd>Space+1</kbd> — Обучение OmniMap (это дерево)</li>
</ul>`,
            color: [120, 70, 65]
        },
        children: []
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // Раздел: Создание блоков
    // ═══════════════════════════════════════════════════════════════════════════
    create: {
        title: 'Создание блоков',
        data: {
            text: `<h3>Как создавать и редактировать</h3>
<ul>
<li><kbd>N</kbd> — создать новый блок</li>
<li><kbd>T</kbd> — изменить название блока</li>
<li><kbd>W</kbd> — редактировать текст блока</li>
<li><kbd>I</kbd> — добавить изображение</li>
</ul>
<p><strong>Попробуйте:</strong> Переключитесь на "Мои заметки" (<kbd>Space+0</kbd>) и создайте свой первый блок!</p>`,
            color: [45, 80, 65] // Жёлтый/оранжевый
        },
        children: ['create-text', 'create-undo']
    },

    'create-text': {
        title: 'Редактор текста (W)',
        data: {
            text: `<p>Редактор поддерживает форматирование:</p>
<ul>
<li><strong>Жирный</strong>, <em>курсив</em>, <u>подчёркнутый</u></li>
<li>Заголовки разных уровней</li>
<li>Нумерованные и маркированные списки</li>
<li>Ссылки на другие блоки и внешние URL</li>
<li>Код и цитаты</li>
</ul>`,
            color: [45, 80, 70]
        },
        children: []
    },

    'create-undo': {
        title: 'Отмена действий',
        data: {
            text: `<p>Не бойтесь экспериментировать!</p>
<ul>
<li><kbd>Shift+Z</kbd> — отменить последнее действие</li>
<li><kbd>Shift+Ctrl+Z</kbd> — повторить отменённое</li>
</ul>`,
            color: [45, 80, 70]
        },
        children: []
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // Раздел: Организация
    // ═══════════════════════════════════════════════════════════════════════════
    organize: {
        title: 'Организация',
        data: {
            text: `<h3>Как структурировать знания</h3>
<ul>
<li><kbd>1-9</kbd> — установить цвет блока</li>
<li><kbd>Shift+C</kbd> — копировать ID блока</li>
<li><kbd>Shift+V</kbd> — вставить копию блока</li>
<li><kbd>Shift+L</kbd> — вставить ссылку на блок</li>
<li><kbd>Shift+X</kbd> — вырезать блок</li>
<li><kbd>Shift+D</kbd> — удалить блок</li>
</ul>`,
            color: [280, 70, 60] // Фиолетовый
        },
        children: ['organize-colors', 'organize-links']
    },

    'organize-colors': {
        title: 'Цвета (1-9)',
        data: {
            text: `<p>Используйте цвета для категоризации:</p>
<ul>
<li><kbd>1</kbd> — красный (важное, срочное)</li>
<li><kbd>2</kbd> — оранжевый (внимание)</li>
<li><kbd>3</kbd> — жёлтый (идеи)</li>
<li><kbd>4</kbd> — зелёный (готово, одобрено)</li>
<li><kbd>5</kbd> — бирюзовый</li>
<li><kbd>6</kbd> — синий (информация)</li>
<li><kbd>7</kbd> — фиолетовый (творчество)</li>
<li><kbd>0</kbd> или <kbd>-</kbd> — сбросить цвет</li>
</ul>`,
            color: [280, 70, 65]
        },
        children: []
    },

    'organize-links': {
        title: 'Ссылки между блоками',
        data: {
            text: `<p>Блоки можно связывать:</p>
<ul>
<li><kbd>Shift+L</kbd> — вставить ссылку (изменения синхронизируются)</li>
<li><kbd>Shift+V</kbd> — вставить копию (независимая копия)</li>
</ul>
<p>Ссылки полезны, когда один блок относится к нескольким категориям.</p>`,
            color: [280, 70, 65]
        },
        children: []
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // Раздел: Продвинутые функции
    // ═══════════════════════════════════════════════════════════════════════════
    advanced: {
        title: 'Продвинутые функции',
        data: {
            text: `<h3>Для опытных пользователей</h3>
<p>Когда освоите базовые функции, попробуйте:</p>
<ul>
<li>Диаграммы и визуальные схемы</li>
<li>Соединения между блоками</li>
<li>Совместную работу с коллегами</li>
<li>AI-помощник для генерации идей</li>
</ul>`,
            color: [330, 70, 60] // Розовый
        },
        children: ['advanced-diagrams', 'advanced-collab']
    },

    'advanced-diagrams': {
        title: 'Диаграммы',
        data: {
            text: `<h4>Визуальные схемы</h4>
<ul>
<li><kbd>L+E</kbd> — редактор раскладки (сетка для блоков)</li>
<li><kbd>A</kbd> — создать соединение (стрелку)</li>
<li><kbd>Shift+A</kbd> — удалить соединение</li>
</ul>
<p>Диаграммы отлично подходят для:</p>
<ul>
<li>Блок-схем и процессов</li>
<li>Mind maps</li>
<li>Архитектурных схем</li>
</ul>`,
            color: [330, 70, 65]
        },
        children: []
    },

    'advanced-collab': {
        title: 'Совместная работа',
        data: {
            text: `<h4>Работайте вместе</h4>
<ul>
<li><kbd>Shift+P</kbd> — настройки доступа</li>
<li><kbd>Shift+M</kbd> — чаты и AI-помощник</li>
<li><kbd>R</kbd> — установить напоминание</li>
<li><kbd>Shift+W</kbd> — подписаться на изменения</li>
</ul>
<p>Изменения синхронизируются в реальном времени!</p>`,
            color: [330, 70, 65]
        },
        children: []
    }
};

/**
 * Генерирует блоки для одного дерева из определения
 * @param {Object} blockDefinitions - Определения блоков
 * @param {Map} blocks - Map для добавления блоков
 * @returns {string} - ID корневого блока
 */
function generateTreeBlocks(blockDefinitions, blocks) {
    // Генерируем UUID для каждого блока
    const idMap = {};
    Object.keys(blockDefinitions).forEach(key => {
        idMap[key] = generateUUID();
    });

    const rootId = idMap['root'];

    // Преобразуем блоки
    Object.entries(blockDefinitions).forEach(([key, block]) => {
        const id = idMap[key];
        const parentKey = findParentKey(key, blockDefinitions);
        const parentId = parentKey ? idMap[parentKey] : false;

        // Преобразуем children из ключей в UUID
        const childrenIds = block.children.map(childKey => idMap[childKey]);

        blocks.set(id, {
            id,
            title: block.title,
            parent_id: parentId,
            children: childrenIds,
            data: {
                ...block.data,
                childOrder: childrenIds,
                // Помечаем как туториальный блок (только для туториала)
                isTutorial: block.data?.isTutorial || false
            },
            updated_at: new Date().toISOString()
        });
    });

    return rootId;
}

/**
 * Находит родительский ключ для блока
 * @param {string} childKey
 * @param {Object} blockDefinitions
 * @returns {string|null}
 */
function findParentKey(childKey, blockDefinitions) {
    if (childKey === 'root') return null;

    for (const [key, block] of Object.entries(blockDefinitions)) {
        if (block.children.includes(childKey)) {
            return key;
        }
    }
    return null;
}

/**
 * Генерирует начальные блоки для нового пользователя:
 * 1. Пустое дерево "Мои заметки" (основное)
 * 2. Туториальное дерево "Обучение OmniMap"
 *
 * @returns {{treeIds: string[], blocks: Map<string, Object>}}
 */
export function getTutorialBlocks() {
    const blocks = new Map();

    // 1. Создаём пустое дерево пользователя "Мои заметки"
    const userRootId = generateUUID();
    blocks.set(userRootId, {
        id: userRootId,
        title: 'Мои заметки',
        parent_id: false,
        children: [],
        data: {
            text: '<p>Это ваше основное дерево для заметок и идей.</p><p>Нажмите <kbd>N</kbd> чтобы создать первый блок!</p>',
            childOrder: [],
            color: [210, 70, 65]
        },
        updated_at: new Date().toISOString()
    });

    // 2. Создаём туториальное дерево
    // Помечаем все блоки туториала
    const tutorialBlocksWithFlag = {};
    Object.entries(TUTORIAL_BLOCKS).forEach(([key, block]) => {
        tutorialBlocksWithFlag[key] = {
            ...block,
            data: {
                ...block.data,
                isTutorial: true
            }
        };
    });

    const tutorialRootId = generateTreeBlocks(tutorialBlocksWithFlag, blocks);

    // Возвращаем: сначала пользовательское дерево (Space+0), потом туториал (Space+1)
    return {
        treeIds: [userRootId, tutorialRootId],
        blocks
    };
}

/**
 * Экспортируем структуру туториала для справки/документации
 */
export const TUTORIAL_STRUCTURE = TUTORIAL_BLOCKS;

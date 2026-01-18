/**
 * Туториальный граф блоков для пользователей
 *
 * Структура:
 * - Root: Обучение OmniMap
 * - 7 разделов: Быстрый старт, Главная страница, Focus система,
 *   Права доступа, Редактор раскладки, Организация, Совместная работа
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
            text: `<h5>Ваш персональный экзокортекс</h5>
<p>OmniMap — инструмент для организации знаний, идей и проектов.</p>
<p><strong>Клик</strong> или <kbd>Enter</kbd> — войти в блок</p>
<p><strong>Клик на открытый блок</strong> или <kbd>Backspace</kbd> — закрыть/вернуться</p>
<p><kbd>Space</kbd> + цифра (0-9) — переключение между деревьями</p>`,
            color: [210, 80, 70]
        },
        children: ['quickStart', 'homePage', 'focusSystem', 'permissions', 'layoutEditor', 'organization', 'collaboration']
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // Раздел 1: Быстрый старт
    // ═══════════════════════════════════════════════════════════════════════════
    quickStart: {
        title: '1. Быстрый старт',
        data: {
            text: `<h5>Освойте базовые операции</h5>
<p>Три ключевых навыка для начала работы: навигация, создание и поиск.</p>`,
            color: [120, 70, 60]
        },
        children: ['navigation', 'creation', 'search']
    },

    navigation: {
        title: 'Навигация',
        data: {
            text: `<h6>Перемещение по блокам</h6>
<p><strong>Открытие блока:</strong></p>
<ul>
<li><strong>Клик</strong> или <kbd>Enter</kbd> — войти в блок</li>
</ul>
<p><strong>Закрытие блока:</strong></p>
<ul>
<li><strong>Клик на открытый блок</strong> или <kbd>Backspace</kbd> — вернуться</li>
</ul>
<p><strong>Перемещение:</strong></p>
<ul>
<li>Стрелки <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> — между блоками</li>
<li><kbd>Tab</kbd> — к следующему блоку</li>
<li><kbd>Shift+Tab</kbd> — к предыдущему блоку</li>
</ul>
<p><strong>Переключение деревьев:</strong></p>
<ul>
<li><kbd>Space</kbd> + цифра (0-9) — быстрый переход</li>
</ul>`,
            color: [120, 60, 70]
        },
        children: []
    },

    creation: {
        title: 'Создание блоков',
        data: {
            text: `<h6>Создание и редактирование</h6>
<p><strong>Создание:</strong></p>
<ul>
<li><kbd>N</kbd> — новый блок в текущем контейнере</li>
</ul>
<p><strong>Редактирование:</strong></p>
<ul>
<li><kbd>T</kbd> — изменить название блока</li>
<li><kbd>W</kbd> — редактировать текст (форматирование, списки, ссылки)</li>
<li><kbd>I</kbd> — добавить изображение</li>
</ul>
<p><strong>В режиме редактирования:</strong></p>
<ul>
<li><kbd>Ctrl+B</kbd> — жирный текст</li>
<li><kbd>Ctrl+I</kbd> — курсив</li>
<li><kbd>Ctrl+K</kbd> — вставить ссылку</li>
</ul>`,
            color: [120, 60, 70]
        },
        children: []
    },

    search: {
        title: 'Поиск',
        data: {
            text: `<h6>Глобальный поиск</h6>
<p><kbd>F</kbd> — открыть поиск</p>
<p><strong>Возможности:</strong></p>
<ul>
<li>Поиск по названиям блоков</li>
<li>Поиск по содержимому текста</li>
<li>Результаты в реальном времени</li>
</ul>
<p><strong>В результатах:</strong></p>
<ul>
<li><kbd>↑</kbd> <kbd>↓</kbd> — навигация по результатам</li>
<li><kbd>Enter</kbd> — перейти к блоку</li>
<li><kbd>Esc</kbd> — закрыть поиск</li>
</ul>`,
            color: [120, 60, 70]
        },
        children: []
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // Раздел 2: Главная страница
    // ═══════════════════════════════════════════════════════════════════════════
    homePage: {
        title: '2. Главная страница',
        data: {
            text: `<h5>Структура рабочего пространства</h5>
<p>Home — ваша точка входа со специальными блоками.</p>`,
            color: [180, 70, 60]
        },
        children: ['inbox', 'homeStructure']
    },

    inbox: {
        title: 'Inbox',
        data: {
            text: `<h6>Входящие</h6>
<p><strong>Inbox</strong> — место для быстрого захвата идей.</p>
<ul>
<li>Новые блоки попадают сюда по умолчанию</li>
<li>Быстро добавляйте мысли, сортируйте позже</li>
<li>Регулярно разбирайте и перемещайте блоки</li>
</ul>`,
            color: [180, 60, 70]
        },
        children: []
    },

    homeStructure: {
        title: 'Структура Home',
        data: {
            text: `<h6>Стандартные разделы</h6>
<p><strong>Focus</strong> — текущие приоритеты и задачи на неделю</p>
<p><strong>Archive</strong> — календарь и архив</p>
<p><strong>Inbox</strong> — входящие идеи</p>
<p><strong>Projects</strong> — долгосрочные проекты</p>
<p><strong>Areas</strong> — области ответственности</p>
<p><strong>Resources</strong> — справочные материалы</p>`,
            color: [180, 60, 70]
        },
        children: []
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // Раздел 3: Focus система ⭐ NEW
    // ═══════════════════════════════════════════════════════════════════════════
    focusSystem: {
        title: '3. Focus система',
        data: {
            text: `<h5>Управление приоритетами</h5>
<p>Focus помогает концентрироваться на важном здесь и сейчас.</p>
<p>Блок Focus на главной странице автоматически показывает текущую неделю.</p>`,
            color: [30, 80, 65]
        },
        children: ['addToFocus', 'focusContainers', 'calendar']
    },

    addToFocus: {
        title: 'Добавление в Focus',
        data: {
            text: `<h6>Shift+K — добавить блок в Focus</h6>
<p><strong>Как это работает:</strong></p>
<ol>
<li>Выберите блок, который хотите добавить</li>
<li>Нажмите <kbd>Shift+K</kbd></li>
<li>Появится popup с выбором контейнера</li>
<li>Выберите куда добавить (день, неделя, месяц)</li>
</ol>
<p><strong>Важно:</strong></p>
<ul>
<li>Блок добавляется как <strong>ссылка</strong></li>
<li>Изменения синхронизируются с оригиналом</li>
<li>Можно добавить в несколько мест одновременно</li>
</ul>`,
            color: [30, 70, 75]
        },
        children: []
    },

    focusContainers: {
        title: 'Focus-контейнеры',
        data: {
            text: `<h6>Создание своих Focus-контейнеров</h6>
<p><kbd>Shift+Ctrl+K</kbd> — пометить блок как контейнер</p>
<p><strong>После этого:</strong></p>
<ul>
<li>Блок появится в списке выбора при <kbd>Shift+K</kbd></li>
<li>Можно быстро добавлять задачи в этот контейнер</li>
</ul>
<p><strong>Примеры использования:</strong></p>
<ul>
<li>Список "Сделать сегодня"</li>
<li>Спринт на неделю</li>
<li>Цели на месяц</li>
</ul>`,
            color: [30, 70, 75]
        },
        children: []
    },

    calendar: {
        title: 'Календарь',
        data: {
            text: `<h6>Иерархия времени</h6>
<p>Календарь находится в <strong>Archive</strong>.</p>
<p><strong>Структура:</strong></p>
<ul>
<li>Год → Кварталы → Месяцы → Недели → Дни</li>
</ul>
<p><strong>Каждый уровень содержит:</strong></p>
<ul>
<li><strong>Plan</strong> — планирование на период</li>
<li><strong>Retro</strong> — ретроспектива (что получилось, что нет)</li>
</ul>
<p><strong>Генерация:</strong></p>
<ul>
<li>Используйте пресет Calendar в редакторе раскладки</li>
<li>Автоматически создаётся ~350 блоков на год</li>
</ul>`,
            color: [30, 70, 75]
        },
        children: []
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // Раздел 4: Права доступа ⭐ NEW
    // ═══════════════════════════════════════════════════════════════════════════
    permissions: {
        title: '4. Права доступа',
        data: {
            text: `<h5>Управление доступом к блокам</h5>
<p>Гибкая система прав для совместной работы.</p>
<p><kbd>Shift+P</kbd> — открыть настройки прав</p>`,
            color: [280, 70, 60]
        },
        children: ['accessSettings', 'sandboxMode', 'groups']
    },

    accessSettings: {
        title: 'Настройка доступа',
        data: {
            text: `<h6>Типы прав (от минимальных к максимальным)</h6>
<ul>
<li>👁 <strong>view</strong> — только просмотр</li>
<li>📦 <strong>sandbox</strong> — создание блоков (редактировать/удалять только свои)</li>
<li>✏️ <strong>edit</strong> — редактирование любых блоков</li>
<li>🔐 <strong>edit_ac</strong> — редактирование + управление правами</li>
<li>🗑 <strong>delete</strong> — полный доступ (администратор)</li>
</ul>
<p><strong>В настройках (Shift+P):</strong></p>
<ul>
<li>Добавление пользователей по username</li>
<li>Выбор уровня прав для каждого</li>
<li>Права наследуются дочерними блоками</li>
</ul>`,
            color: [280, 60, 70]
        },
        children: []
    },

    sandboxMode: {
        title: 'Sandbox режим',
        data: {
            text: `<h6>Режимы песочницы</h6>
<p><strong>Открытый sandbox:</strong></p>
<ul>
<li>Все видят все блоки</li>
<li>Редактировать/удалять можно только свои</li>
</ul>
<p><strong>Приватный sandbox:</strong></p>
<ul>
<li>Каждый видит только свои блоки</li>
<li>Полная изоляция пользователей</li>
</ul>
<p><strong>Отключён:</strong></p>
<ul>
<li>Стандартные права на основе ролей</li>
</ul>
<p>Полезно для: обучения, сбора идей от команды, опросов.</p>`,
            color: [280, 60, 70]
        },
        children: []
    },

    groups: {
        title: 'Группы',
        data: {
            text: `<h6>Управление группами пользователей</h6>
<p><strong>Возможности:</strong></p>
<ul>
<li>Создание групп пользователей</li>
<li>Назначение прав всей группе сразу</li>
<li>Управление членством в группах</li>
</ul>
<p><strong>Примеры групп:</strong></p>
<ul>
<li>Команда проекта</li>
<li>Редакторы</li>
<li>Только чтение</li>
</ul>`,
            color: [280, 60, 70]
        },
        children: []
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // Раздел 5: Редактор раскладки ⭐ NEW
    // ═══════════════════════════════════════════════════════════════════════════
    layoutEditor: {
        title: '5. Редактор раскладки',
        data: {
            text: `<h5>Визуальная настройка расположения блоков</h5>
<p><kbd>L</kbd> затем <kbd>E</kbd> — открыть редактор раскладки</p>
<p>Появится панель с превью и галереей пресетов.</p>`,
            color: [210, 70, 60]
        },
        children: ['presets', 'dragAndDrop', 'specialPresets']
    },

    presets: {
        title: 'Пресеты раскладок',
        data: {
            text: `<h6>Готовые шаблоны</h6>
<p><strong>Динамические (↔):</strong></p>
<ul>
<li>Горизонтальный — блоки в ряд</li>
<li>Вертикальный — блоки в столбец</li>
</ul>
<p><strong>Сетки (⊞):</strong></p>
<ul>
<li>2×2, 3×3, 4×4</li>
<li>Кастомный размер</li>
</ul>
<p><strong>Лейауты (◫):</strong></p>
<ul>
<li>Sidebar — боковая панель + контент</li>
<li>Dashboard — заголовок + виджеты</li>
<li>Holy Grail — шапка, контент, футер</li>
</ul>`,
            color: [210, 60, 70]
        },
        children: []
    },

    dragAndDrop: {
        title: 'Drag & Drop',
        data: {
            text: `<h6>Перетаскивание и изменение размера</h6>
<p><strong>Мышью:</strong></p>
<ul>
<li>Перетаскивание блоков на сетке</li>
<li>Resize за углы или стороны блока</li>
</ul>
<p><strong>Клавиатурой:</strong></p>
<ul>
<li>Стрелки <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> — перемещение</li>
<li><kbd>Shift</kbd> + стрелки — изменение размера</li>
</ul>
<p><strong>Подсказки:</strong></p>
<ul>
<li>Сетка подсвечивает доступные позиции</li>
<li>Блоки автоматически выравниваются</li>
</ul>`,
            color: [210, 60, 70]
        },
        children: []
    },

    specialPresets: {
        title: 'Специальные пресеты',
        data: {
            text: `<h6>Продвинутые шаблоны</h6>
<p><strong>Kanban (✦):</strong></p>
<ul>
<li>3 колонки: To Do, In Progress, Done</li>
<li>Для управления задачами</li>
</ul>
<p><strong>Dashboard (✦):</strong></p>
<ul>
<li>Главный блок + виджеты + метрики</li>
<li>Для обзорных панелей</li>
</ul>
<p><strong>Calendar (✦):</strong></p>
<ul>
<li>Генерация полного года</li>
<li>~350 блоков: кварталы, месяцы, недели, дни</li>
<li>Каждый уровень с Plan и Retro</li>
</ul>`,
            color: [210, 60, 70]
        },
        children: []
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // Раздел 6: Организация
    // ═══════════════════════════════════════════════════════════════════════════
    organization: {
        title: '6. Организация',
        data: {
            text: `<h5>Управление блоками</h5>
<p>Инструменты для структурирования информации.</p>`,
            color: [45, 80, 65]
        },
        children: ['selection', 'copyPaste', 'moveBlock', 'links', 'colors', 'deletion']
    },

    selection: {
        title: 'Выделение блоков',
        data: {
            text: `<h6>Работа с несколькими блоками</h6>
<p><strong>Выделение:</strong></p>
<ul>
<li><strong>Клик</strong> — выбрать один блок</li>
<li><kbd>Shift</kbd> + клик — добавить к выделению</li>
<li><kbd>Ctrl/Cmd</kbd> + <kbd>A</kbd> — выделить все блоки</li>
</ul>
<p><strong>После выделения:</strong></p>
<ul>
<li>Операции применяются ко всем выбранным</li>
<li>Можно перемещать, копировать, удалять группой</li>
</ul>`,
            color: [45, 70, 75]
        },
        children: []
    },

    copyPaste: {
        title: 'Копирование и вставка',
        data: {
            text: `<h6>Дублирование блоков</h6>
<p><strong>Копирование ID:</strong></p>
<ul>
<li><kbd>Shift+C</kbd> — скопировать ID блока в буфер</li>
</ul>
<p><strong>Вставка копии:</strong></p>
<ul>
<li><kbd>Shift+V</kbd> — вставить полную копию</li>
<li>Создаётся независимая копия со всеми детьми</li>
</ul>
<p><strong>Вставка ссылки:</strong></p>
<ul>
<li><kbd>Shift+L</kbd> — вставить ссылку на блок</li>
<li>Изменения синхронизируются с оригиналом</li>
</ul>`,
            color: [45, 70, 75]
        },
        children: []
    },

    moveBlock: {
        title: 'Перенос блока',
        data: {
            text: `<h6>Перемещение между контейнерами</h6>
<p><strong>Вырезать и вставить:</strong></p>
<ul>
<li><kbd>Shift+X</kbd> — вырезать блок</li>
<li><kbd>Shift+V</kbd> — вставить в новое место</li>
</ul>
<p><strong>Перетаскивание:</strong></p>
<ul>
<li>В режиме раскладки (<kbd>L</kbd>, <kbd>E</kbd>)</li>
<li>Перетащите блок мышью</li>
</ul>`,
            color: [45, 70, 75]
        },
        children: []
    },

    links: {
        title: 'Ссылки на блоки',
        data: {
            text: `<h6>Зеркала блоков</h6>
<p><strong>Что такое ссылка:</strong></p>
<ul>
<li>Ссылка — это "зеркало" блока в другом месте</li>
<li>Изменения в оригинале отражаются в ссылках</li>
<li>Изменения в ссылке отражаются в оригинале</li>
</ul>
<p><strong>Когда использовать:</strong></p>
<ul>
<li>Блок относится к нескольким категориям</li>
<li>Нужен быстрый доступ из разных мест</li>
<li>Задача актуальна для нескольких проектов</li>
</ul>
<p><strong>Создание:</strong> <kbd>Shift+L</kbd> после копирования</p>`,
            color: [45, 70, 75]
        },
        children: []
    },

    colors: {
        title: 'Цвета',
        data: {
            text: `<h6>Цветовая маркировка (клавиши 1-9)</h6>
<ul>
<li><kbd>1</kbd> — красный (важное, срочное)</li>
<li><kbd>2</kbd> — оранжевый (внимание)</li>
<li><kbd>3</kbd> — жёлтый (идеи)</li>
<li><kbd>4</kbd> — зелёный (готово)</li>
<li><kbd>5</kbd> — бирюзовый</li>
<li><kbd>6</kbd> — синий (информация)</li>
<li><kbd>7</kbd> — фиолетовый (творчество)</li>
<li><kbd>0</kbd> или <kbd>-</kbd> — сбросить цвет</li>
</ul>
<p>Цвета помогают быстро визуально сканировать блоки.</p>`,
            color: [45, 70, 75]
        },
        children: []
    },

    deletion: {
        title: 'Удаление',
        data: {
            text: `<h6>Удаление и отмена</h6>
<p><strong>Удаление:</strong></p>
<ul>
<li><kbd>Shift+D</kbd> — удалить выбранный блок</li>
<li>Удаляются также все дочерние блоки</li>
</ul>
<p><strong>Отмена:</strong></p>
<ul>
<li><kbd>Shift+Z</kbd> — отменить последнее действие</li>
<li><kbd>Shift+Ctrl+Z</kbd> — повторить отменённое</li>
</ul>
<p><strong>Важно:</strong> Отмена работает для большинства операций.</p>`,
            color: [45, 70, 75]
        },
        children: []
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // Раздел 7: Совместная работа
    // ═══════════════════════════════════════════════════════════════════════════
    collaboration: {
        title: '7. Совместная работа',
        data: {
            text: `<h5>Инструменты для команды</h5>
<p>Возможности для эффективной совместной работы.</p>`,
            color: [180, 70, 60]
        },
        children: ['aiAssistant', 'reminders', 'subscriptions']
    },

    aiAssistant: {
        title: 'AI-помощник',
        data: {
            text: `<h6>Интеграция с ИИ</h6>
<p><kbd>A</kbd> — открыть AI-помощника</p>
<p><strong>Возможности:</strong></p>
<ul>
<li>Генерация текста и идей</li>
<li>Суммаризация содержимого</li>
<li>Ответы на вопросы по контексту</li>
<li>Помощь в структурировании</li>
</ul>
<p><strong>Контекст:</strong></p>
<ul>
<li>AI видит текущий блок и его окружение</li>
<li>Можно задавать вопросы по содержимому</li>
</ul>`,
            color: [180, 60, 70]
        },
        children: []
    },

    reminders: {
        title: 'Напоминания',
        data: {
            text: `<h6>Уведомления по времени</h6>
<p><kbd>R</kbd> — установить напоминание</p>
<p><strong>Настройка:</strong></p>
<ul>
<li>Выберите дату и время</li>
<li>Добавьте заметку (опционально)</li>
</ul>
<p><strong>Уведомления:</strong></p>
<ul>
<li>Push-уведомление в браузере</li>
<li>Клик по уведомлению открывает блок</li>
</ul>`,
            color: [180, 60, 70]
        },
        children: []
    },

    subscriptions: {
        title: 'Подписка на изменения',
        data: {
            text: `<h6>Отслеживание обновлений</h6>
<p><kbd>Shift+W</kbd> — подписаться на блок</p>
<p><strong>Что происходит:</strong></p>
<ul>
<li>Вы получаете уведомления об изменениях</li>
<li>Видите кто и когда редактировал</li>
<li>Полезно для отслеживания важных блоков</li>
</ul>
<p><strong>Отписка:</strong></p>
<ul>
<li>Повторно нажмите <kbd>Shift+W</kbd></li>
</ul>`,
            color: [180, 60, 70]
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

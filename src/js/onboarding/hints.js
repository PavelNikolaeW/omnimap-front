/**
 * Конфигурация контекстных подсказок для онбординга
 *
 * Каждая подсказка имеет:
 * - trigger: имя события window для активации
 * - message: текст подсказки
 * - showOnce: показывать только один раз (сохраняется в localStorage)
 * - level: уровень сложности (1-базовый, 2-организация, 3-визуализация, 4-совместная работа)
 * - condition: опциональная функция для проверки условия показа
 * - duration: опциональная длительность показа в мс
 */

export const CONTEXTUAL_HINTS = {
    // ═══════════════════════════════════════════════════════════════════════════
    // Уровень 1: Базовые операции
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Первое создание блока
     */
    firstBlockCreate: {
        trigger: 'CreateBlock',
        message: 'Отлично! Используйте Enter или клик чтобы войти в блок',
        showOnce: true,
        level: 1
    },

    /**
     * Первый вход в блок (показываем как вернуться)
     * Условие: путь должен быть глубже 1 уровня
     */
    firstNavigation: {
        trigger: 'OpenBlock',
        message: 'Нажмите Backspace чтобы вернуться назад или кликните на тот же блок',
        showOnce: true,
        level: 1,
        condition: (detail) => detail?.path?.length > 1
    },

    /**
     * Первое использование поиска
     */
    firstSearch: {
        trigger: 'OpenSearchPopup',
        message: 'Введите текст для поиска по всем блокам',
        showOnce: true,
        level: 1
    },

    /**
     * Первое редактирование текста блока
     */
    firstTextEdit: {
        trigger: 'OpenNoteEditor',
        message: 'Используйте форматирование: жирный, курсив, списки, ссылки',
        showOnce: true,
        level: 1,
        duration: 3000
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // Уровень 2: Организация
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Первое использование цвета
     */
    firstColor: {
        trigger: 'SetHueBlock',
        message: 'Цвета помогают визуально группировать блоки',
        showOnce: true,
        level: 2
    },

    /**
     * Первое копирование блока
     */
    firstCopy: {
        trigger: 'CopyBlockId',
        message: 'ID скопирован! Shift+V — вставить копию, Shift+L — вставить ссылку',
        showOnce: true,
        level: 2
    },

    /**
     * Первая вставка копии блока
     */
    firstPaste: {
        trigger: 'PasteBlock',
        message: 'Копия блока создана со всеми дочерними элементами',
        showOnce: true,
        level: 2,
        duration: 3000
    },

    /**
     * Первая вставка ссылки на блок
     */
    firstPasteLink: {
        trigger: 'PasteBlockLink',
        message: 'Ссылка на блок создана — изменения в оригинале отразятся здесь',
        showOnce: true,
        level: 2,
        duration: 4000
    },

    /**
     * Первое использование Undo
     */
    firstUndo: {
        trigger: 'UndoAction',
        message: 'Действие отменено! Shift+Ctrl+Z — повторить',
        showOnce: true,
        level: 2,
        duration: 2500
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // Уровень 3: Визуализация (диаграммы, соединения)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Первое создание соединения
     */
    firstConnection: {
        trigger: 'AddConnectionBlock',
        message: 'Соединение создано! Shift+A для удаления',
        showOnce: true,
        level: 3,
        duration: 3000
    },

    /**
     * Вход в режим создания соединения
     */
    connectionModeEnter: {
        trigger: 'EnterConnectMode',
        message: 'Кликните на блок-источник, затем на блок-цель',
        showOnce: true,
        level: 3
    },

    /**
     * Первый вход в режим диаграммы
     */
    firstDiagram: {
        trigger: 'EnterDiagramMode',
        message: 'Перетаскивайте блоки мышью для создания диаграммы',
        showOnce: true,
        level: 3
    },

    /**
     * Первое использование редактора раскладки
     */
    firstLayoutEditor: {
        trigger: 'OpenLayoutEditor',
        message: 'Выбирайте пресеты или перетаскивайте блоки в нужные ячейки',
        showOnce: true,
        level: 3
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // Уровень 4: Совместная работа
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Первое открытие настроек доступа
     */
    firstAccess: {
        trigger: 'OpenAccessPopup',
        message: 'Здесь можно настроить права доступа для других пользователей',
        showOnce: true,
        level: 4
    },

    /**
     * Первое открытие чата
     */
    firstChat: {
        trigger: 'OpenUnifiedChat',
        message: 'Общайтесь с коллегами или используйте AI-помощника',
        showOnce: true,
        level: 4
    },

    /**
     * Первая установка напоминания
     */
    firstReminder: {
        trigger: 'OpenReminderPopup',
        message: 'Напоминание будет отправлено в указанное время',
        showOnce: true,
        level: 4
    },

    /**
     * Первая подписка на блок
     */
    firstWatch: {
        trigger: 'WatchBlock',
        message: 'Вы будете получать уведомления об изменениях в этом блоке',
        showOnce: true,
        level: 4
    }
};

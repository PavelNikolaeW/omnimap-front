/**
 * CalendarGenerator.js
 *
 * Генерирует иерархическую структуру календаря на год:
 * Год (План+Итоги) → Кварталы (План+Итоги) → Месяцы (План+Итоги+НеделиКонтейнер) → Недели (План+Итоги+ДниКонтейнер)
 *
 * Особенности:
 * - Все блоки генерируются за один проход и импортируются одним запросом
 * - Link-блоки для граничных недель включены в payload (не требуют отдельных API вызовов)
 * - WeeksContainer и DaysContainer позволяют шарить части календаря без раскрытия планов
 * - Использует ISO 8601 для определения принадлежности недель к месяцам
 */

import { generateBlockId } from '../../api/importService.js';

const MONTH_NAMES = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const MONTH_NAMES_SHORT = [
    'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
    'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'
];

const WEEKDAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// Шаблоны для блоков Итоги на разных уровнях
const RETRO_TEMPLATES = {
    year: '• Главные достижения года:\n• Что не удалось:\n• Уроки и выводы:\n• Благодарности:',
    quarter: '• Ключевые результаты:\n• Что не получилось:\n• Что улучшить в следующем квартале:',
    month: '• Выполненные задачи:\n• Незавершённое:\n• Выводы:',
    week: '• Что получилось:\n• Что не получилось:\n• Что улучшить:'
};

/**
 * Возвращает понедельник недели для указанной даты
 */
function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Возвращает номер недели ISO 8601
 */
function getISOWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Возвращает ключ недели в формате "YYYY-Www"
 */
function getISOWeekKey(date) {
    const monday = getMonday(date);
    const weekNum = getISOWeekNumber(monday);
    const thursday = new Date(monday);
    thursday.setDate(thursday.getDate() + 3);
    const weekYear = thursday.getFullYear();
    return `${weekYear}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Форматирует дату в ISO формат YYYY-MM-DD
 */
function formatISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Считает количество дней недели в указанном месяце
 */
function countDaysInMonth(weekStart, monthNum, year) {
    let count = 0;
    const d = new Date(weekStart);
    for (let i = 0; i < 7; i++) {
        if (d.getMonth() + 1 === monthNum && d.getFullYear() === year) {
            count++;
        }
        d.setDate(d.getDate() + 1);
    }
    return count;
}

/**
 * Возвращает номера месяцев в квартале
 */
function getMonthsInQuarter(quarter) {
    const start = (quarter - 1) * 3 + 1;
    return [start, start + 1, start + 2];
}

/**
 * Определяет, является ли день выходным (Сб или Вс)
 */
function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
}

/**
 * Генерирует блок План
 */
function generatePlanBlock(parentId, level, context) {
    const titles = {
        year: `План ${context.year}`,
        quarter: `План Q${context.quarter}`,
        month: `План ${MONTH_NAMES_SHORT[context.month - 1]}`,
        week: 'План'
    };

    return {
        id: generateBlockId(),
        parent_id: parentId,
        title: titles[level],
        data: {
            calendarType: `${level}Plan`,
            calendarYear: context.year,
            ...(context.quarter && { calendarQuarter: context.quarter }),
            ...(context.month && { calendarMonth: context.month }),
            ...(context.weekNumber && { calendarWeekNumber: context.weekNumber }),
            text: ''
        }
    };
}

/**
 * Генерирует блок Итоги
 */
function generateRetroBlock(parentId, level, context) {
    const titles = {
        year: `Итоги ${context.year}`,
        quarter: `Итоги Q${context.quarter}`,
        month: `Итоги ${MONTH_NAMES_SHORT[context.month - 1]}`,
        week: 'Итоги'
    };

    return {
        id: generateBlockId(),
        parent_id: parentId,
        title: titles[level],
        data: {
            calendarType: `${level}Retro`,
            calendarYear: context.year,
            ...(context.quarter && { calendarQuarter: context.quarter }),
            ...(context.month && { calendarMonth: context.month }),
            ...(context.weekNumber && { calendarWeekNumber: context.weekNumber }),
            text: RETRO_TEMPLATES[level]
        }
    };
}

/**
 * Генерирует блок дня
 */
function generateDayBlock(date, daysContainerId) {
    const dayOfMonth = date.getDate();
    const monthNum = date.getMonth() + 1;
    const year = date.getFullYear();
    const weekday = date.getDay() === 0 ? 7 : date.getDay();

    return {
        id: generateBlockId(),
        parent_id: daysContainerId,
        title: String(dayOfMonth),
        data: {
            calendarType: 'day',
            calendarDay: dayOfMonth,
            calendarMonth: monthNum,
            calendarYear: year,
            calendarWeekday: weekday,
            calendarWeekNumber: getISOWeekNumber(date),
            isWeekend: isWeekend(date),
            isoDate: formatISODate(date),
            weekdayName: WEEKDAY_NAMES[weekday - 1]
        }
    };
}

/**
 * Генерирует контейнер дней с лейаутом
 *
 * Лейаут DaysContainer (7 rows × 1 col):
 * +------+
 * | Пн   |
 * | Вт   |
 * | Ср   |
 * | Чт   |
 * | Пт   |
 * | Сб   |
 * | Вс   |
 * +------+
 */
function generateDaysContainer(weekBlockId, weekStart, context) {
    const containerId = generateBlockId();
    const dayBlocks = [];
    const childOrder = [];
    const cells = {};

    const currentDay = new Date(weekStart);
    for (let i = 0; i < 7; i++) {
        const dayBlock = generateDayBlock(currentDay, containerId);
        dayBlocks.push(dayBlock);
        childOrder.push(dayBlock.id);
        cells[dayBlock.id] = { row: i + 1, col: 1, rowSpan: 1, colSpan: 1 };
        currentDay.setDate(currentDay.getDate() + 1);
    }

    const container = {
        id: containerId,
        parent_id: weekBlockId,
        title: 'Дни',
        data: {
            calendarType: 'daysContainer',
            calendarYear: context.year,
            calendarMonth: context.month,
            calendarWeekNumber: context.weekNumber,
            layout: 'cells',
            layoutCells: {
                gridSize: { rows: 7, cols: 1 },
                presetType: 'days-column',
                cells
            },
            childOrder
        }
    };

    return { container, dayBlocks };
}

/**
 * Генерирует блок недели с планом, итогами и контейнером дней
 *
 * Лейаут недели (2 rows × 2 cols) - равное распределение:
 * +------------------+------------------+
 * | План (1,1)       | Дни (1-2, 2)     |
 * |                  | rowSpan=2        |
 * +------------------+                  |
 * | Итоги (2,1)      |                  |
 * +------------------+------------------+
 */
function generateWeekBlock(weekStart, weeksContainerId, primaryMonth, year, weekRegistry) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weekNumber = getISOWeekNumber(weekStart);
    const isoWeekKey = getISOWeekKey(weekStart);

    const weekBlockId = generateBlockId();
    const allBlocks = [];
    const childOrder = [];
    const cells = {};

    const context = { year, month: primaryMonth, weekNumber };

    // 1. План
    const planBlock = generatePlanBlock(weekBlockId, 'week', context);
    allBlocks.push(planBlock);
    childOrder.push(planBlock.id);
    cells[planBlock.id] = { row: 1, col: 1, rowSpan: 1, colSpan: 1 };

    // 2. Итоги
    const retroBlock = generateRetroBlock(weekBlockId, 'week', context);
    allBlocks.push(retroBlock);
    childOrder.push(retroBlock.id);
    cells[retroBlock.id] = { row: 2, col: 1, rowSpan: 1, colSpan: 1 };

    // 3. Контейнер дней
    const { container: daysContainer, dayBlocks } = generateDaysContainer(weekBlockId, weekStart, context);
    allBlocks.push(daysContainer);
    allBlocks.push(...dayBlocks);
    childOrder.push(daysContainer.id);
    cells[daysContainer.id] = { row: 1, col: 2, rowSpan: 2, colSpan: 1 };

    const daysInPrimaryMonth = countDaysInMonth(weekStart, primaryMonth, year);
    const isBoundaryWeek = daysInPrimaryMonth < 7;

    const weekBlock = {
        id: weekBlockId,
        parent_id: weeksContainerId,
        title: `Неделя ${weekNumber}`,
        data: {
            layout: 'cells',
            layoutCells: {
                gridSize: { rows: 2, cols: 2 },
                presetType: 'week-calendar',
                cells
            },
            calendarType: 'week',
            calendarWeekNumber: weekNumber,
            calendarYear: year,
            calendarMonth: primaryMonth,
            weekStartDate: formatISODate(weekStart),
            weekEndDate: formatISODate(weekEnd),
            isBoundaryWeek,
            isoWeekKey,
            childOrder
        }
    };

    // Регистрируем неделю для создания ссылок
    weekRegistry.set(isoWeekKey, {
        blockId: weekBlockId,
        ownerMonth: primaryMonth
    });

    return { weekBlock, childBlocks: allBlocks };
}

/**
 * Генерирует link-блок для граничной недели
 *
 * Link-блок позволяет отображать неделю в месяце, которому она не принадлежит.
 * Формат данных соответствует требованиям import API.
 */
function generateWeekLinkBlock(weeksContainerId, sourceWeekId, isoWeekKey, context) {
    return {
        id: generateBlockId(),
        parent_id: weeksContainerId,
        title: `Неделя (ссылка)`,
        data: {
            view: 'link',
            source: sourceWeekId,
            calendarType: 'weekLink',
            isoWeekKey,
            calendarYear: context.year,
            calendarMonth: context.month
        }
    };
}

/**
 * Генерирует контейнер недель для месяца
 *
 * Лейаут WeeksContainer (N rows × 1 col):
 * +--------+
 * | Нед.1  |
 * | Нед.2  |
 * | ...    |
 * | Нед.N  |
 * +--------+
 */
function generateWeeksContainer(monthBlockId, monthNum, year, weekRegistry) {
    const containerId = generateBlockId();
    const allBlocks = [];
    const childOrder = [];
    const cells = {};
    const pendingLinks = []; // Ссылки, которые нужно создать после регистрации всех недель

    // Собираем недели месяца
    const firstDay = new Date(year, monthNum - 1, 1);
    const lastDay = new Date(year, monthNum, 0);
    let weekStart = getMonday(firstDay);
    let rowIndex = 1;

    while (weekStart <= lastDay) {
        const isoWeekKey = getISOWeekKey(weekStart);
        const daysInThisMonth = countDaysInMonth(weekStart, monthNum, year);

        if (daysInThisMonth > 0) {
            const thursday = new Date(weekStart);
            thursday.setDate(thursday.getDate() + 3);
            const isOwner = thursday.getMonth() + 1 === monthNum && thursday.getFullYear() === year;

            if (isOwner) {
                // Этот месяц владеет неделей - создаём блок
                const { weekBlock, childBlocks } = generateWeekBlock(
                    weekStart,
                    containerId,
                    monthNum,
                    year,
                    weekRegistry
                );
                allBlocks.push(weekBlock);
                allBlocks.push(...childBlocks);
                childOrder.push(weekBlock.id);
                cells[weekBlock.id] = { row: rowIndex, col: 1, rowSpan: 1, colSpan: 1 };
            } else {
                // Неделя принадлежит другому месяцу - создадим ссылку позже
                pendingLinks.push({
                    isoWeekKey,
                    row: rowIndex,
                    context: { year, month: monthNum }
                });
            }
            rowIndex++;
        }

        weekStart.setDate(weekStart.getDate() + 7);
    }

    const totalRows = rowIndex - 1;

    const container = {
        id: containerId,
        parent_id: monthBlockId,
        title: 'Недели',
        data: {
            calendarType: 'weeksContainer',
            calendarMonth: monthNum,
            calendarYear: year,
            layout: 'cells',
            layoutCells: {
                gridSize: { rows: Math.max(totalRows, 1), cols: 1 },
                presetType: 'weeks-column',
                cells
            },
            childOrder
        },
        _pendingLinks: pendingLinks // Временное поле для второго прохода
    };

    return { container, allBlocks };
}

/**
 * Генерирует блок месяца с планом, итогами и контейнером недель
 *
 * Лейаут месяца (2 rows × 2 cols):
 * +------------------+------------------+
 * | План (1,1)       | Недели (1-2, 2)  |
 * |                  | rowSpan=2        |
 * +------------------+                  |
 * | Итоги (2,1)      |                  |
 * +------------------+------------------+
 */
function generateMonthBlock(quarterBlockId, monthNum, year, weekRegistry) {
    const monthBlockId = generateBlockId();
    const allBlocks = [];
    const childOrder = [];
    const cells = {};

    const context = { year, month: monthNum };

    // 1. План месяца
    const planBlock = generatePlanBlock(monthBlockId, 'month', context);
    allBlocks.push(planBlock);
    childOrder.push(planBlock.id);
    cells[planBlock.id] = { row: 1, col: 1, rowSpan: 1, colSpan: 1 };

    // 2. Итоги месяца
    const retroBlock = generateRetroBlock(monthBlockId, 'month', context);
    allBlocks.push(retroBlock);
    childOrder.push(retroBlock.id);
    cells[retroBlock.id] = { row: 2, col: 1, rowSpan: 1, colSpan: 1 };

    // 3. Контейнер недель
    const { container: weeksContainer, allBlocks: weekBlocks } = generateWeeksContainer(
        monthBlockId,
        monthNum,
        year,
        weekRegistry
    );
    allBlocks.push(weeksContainer);
    allBlocks.push(...weekBlocks);
    childOrder.push(weeksContainer.id);
    cells[weeksContainer.id] = { row: 1, col: 2, rowSpan: 2, colSpan: 1 };

    const monthBlock = {
        id: monthBlockId,
        parent_id: quarterBlockId,
        title: MONTH_NAMES[monthNum - 1],
        data: {
            layout: 'cells',
            layoutCells: {
                gridSize: { rows: 2, cols: 2 },
                presetType: 'month-calendar',
                cells
            },
            calendarType: 'month',
            calendarMonth: monthNum,
            calendarYear: year,
            monthNameShort: MONTH_NAMES_SHORT[monthNum - 1],
            childOrder
        }
    };

    return { monthBlock, allBlocks, weeksContainer };
}

/**
 * Генерирует полную иерархию календаря на год
 *
 * Лейаут года (2 rows × 3 cols):
 * +--------+--------+--------+
 * | План   | Q1     | Q2     |
 * +--------+--------+--------+
 * | Итоги  | Q3     | Q4     |
 * +--------+--------+--------+
 *
 * Лейаут квартала (2 rows × 4 cols):
 * +--------+--------+--------+--------+
 * | План Q | Месяц1 | Месяц2 | Месяц3 |
 * +--------+        |        |        |
 * | Итоги Q|        |        |        |
 * +--------+--------+--------+--------+
 */
export function generateYearCalendar(year, parentBlockId) {
    const blocks = [];
    const weekRegistry = new Map();
    const weeksContainers = []; // Для второго прохода - создания ссылок

    // === ГОД ===
    const yearBlockId = generateBlockId();
    const yearContext = { year };

    // План и Итоги года
    const yearPlanBlock = generatePlanBlock(yearBlockId, 'year', yearContext);
    const yearRetroBlock = generateRetroBlock(yearBlockId, 'year', yearContext);

    blocks.push(yearPlanBlock);
    blocks.push(yearRetroBlock);

    const yearChildOrder = [yearPlanBlock.id, yearRetroBlock.id];
    const yearCells = {
        [yearPlanBlock.id]: { row: 1, col: 1, rowSpan: 1, colSpan: 1 },
        [yearRetroBlock.id]: { row: 2, col: 1, rowSpan: 1, colSpan: 1 }
    };

    // === КВАРТАЛЫ ===
    const quarterBlocks = [];
    for (let q = 1; q <= 4; q++) {
        const quarterBlockId = generateBlockId();
        const quarterContext = { year, quarter: q };

        // План и Итоги квартала
        const qPlanBlock = generatePlanBlock(quarterBlockId, 'quarter', quarterContext);
        const qRetroBlock = generateRetroBlock(quarterBlockId, 'quarter', quarterContext);

        blocks.push(qPlanBlock);
        blocks.push(qRetroBlock);

        const quarterBlock = {
            id: quarterBlockId,
            parent_id: yearBlockId,
            title: `Q${q}`,
            data: {
                layout: 'cells',
                layoutCells: {
                    gridSize: { rows: 2, cols: 4 },
                    presetType: 'quarter-calendar',
                    cells: {
                        [qPlanBlock.id]: { row: 1, col: 1, rowSpan: 1, colSpan: 1 },
                        [qRetroBlock.id]: { row: 2, col: 1, rowSpan: 1, colSpan: 1 }
                    }
                },
                calendarType: 'quarter',
                calendarQuarter: q,
                calendarYear: year,
                childOrder: [qPlanBlock.id, qRetroBlock.id]
            }
        };

        quarterBlocks.push(quarterBlock);
        blocks.push(quarterBlock);

        // Добавляем квартал в год
        yearChildOrder.push(quarterBlockId);
        const qRow = q <= 2 ? 1 : 2;
        const qCol = q <= 2 ? q + 1 : q - 1;
        yearCells[quarterBlockId] = { row: qRow, col: qCol, rowSpan: 1, colSpan: 1 };
    }

    // Блок года
    const yearBlock = {
        id: yearBlockId,
        parent_id: parentBlockId,
        title: `${year}`,
        data: {
            layout: 'cells',
            layoutCells: {
                gridSize: { rows: 2, cols: 3 },
                presetType: 'year-calendar',
                cells: yearCells
            },
            calendarType: 'year',
            calendarYear: year,
            childOrder: yearChildOrder
        }
    };
    blocks.unshift(yearBlock);

    // === МЕСЯЦЫ ===
    let totalWeeks = 0;
    let totalDays = 0;
    let totalDaysContainers = 0;
    let totalWeeksContainers = 0;

    for (let monthNum = 1; monthNum <= 12; monthNum++) {
        const quarterIndex = Math.floor((monthNum - 1) / 3);
        const quarterBlock = quarterBlocks[quarterIndex];

        const { monthBlock, allBlocks: monthBlocks, weeksContainer } = generateMonthBlock(
            quarterBlock.id,
            monthNum,
            year,
            weekRegistry
        );

        blocks.push(monthBlock);
        blocks.push(...monthBlocks);
        weeksContainers.push(weeksContainer);

        // Добавляем месяц в квартал
        quarterBlock.data.childOrder.push(monthBlock.id);
        const colIndex = ((monthNum - 1) % 3) + 2;
        quarterBlock.data.layoutCells.cells[monthBlock.id] = {
            row: 1, col: colIndex, rowSpan: 2, colSpan: 1
        };

        totalWeeksContainers++;
    }

    // === ВТОРОЙ ПРОХОД: создаём link-блоки для граничных недель ===
    let totalLinks = 0;

    for (const weeksContainer of weeksContainers) {
        const pendingLinks = weeksContainer._pendingLinks || [];

        for (const { isoWeekKey, row, context } of pendingLinks) {
            const weekInfo = weekRegistry.get(isoWeekKey);
            if (weekInfo) {
                // Создаём link-блок
                const linkBlock = generateWeekLinkBlock(
                    weeksContainer.id,
                    weekInfo.blockId,
                    isoWeekKey,
                    context
                );
                blocks.push(linkBlock);

                // Добавляем в childOrder и cells контейнера
                weeksContainer.data.childOrder.push(linkBlock.id);
                weeksContainer.data.layoutCells.cells[linkBlock.id] = {
                    row, col: 1, rowSpan: 1, colSpan: 1
                };

                totalLinks++;
            }
        }

        // Сортируем childOrder по позиции row, чтобы порядок соответствовал визуальному расположению
        const cells = weeksContainer.data.layoutCells.cells;
        weeksContainer.data.childOrder.sort((a, b) => {
            const rowA = cells[a]?.row || 0;
            const rowB = cells[b]?.row || 0;
            return rowA - rowB;
        });

        // Удаляем временное поле
        delete weeksContainer._pendingLinks;
    }

    // Считаем статистику
    const weeks = blocks.filter(b => b.data?.calendarType === 'week');
    const days = blocks.filter(b => b.data?.calendarType === 'day');
    const daysContainers = blocks.filter(b => b.data?.calendarType === 'daysContainer');

    totalWeeks = weeks.length;
    totalDays = days.length;
    totalDaysContainers = daysContainers.length;

    // Статистика
    const stats = {
        years: 1,
        quarters: 4,
        months: 12,
        weeksContainers: totalWeeksContainers,
        weeks: totalWeeks,
        daysContainers: totalDaysContainers,
        days: totalDays,
        yearPlanRetro: 2,
        quarterPlanRetro: 8,
        monthPlanRetro: 24,
        weekPlanRetro: totalWeeks * 2,
        links: totalLinks
    };

    // Больше не нужны linkRequests - все ссылки уже в blocks
    return { blocks, linkRequests: [], stats };
}

/**
 * Возвращает количество блоков которые будут созданы для года
 */
export function estimateYearCalendarSize(year) {
    const firstDay = new Date(year, 0, 1);
    const lastDay = new Date(year, 11, 31);

    let weekStart = getMonday(firstDay);
    let weekCount = 0;

    while (weekStart <= lastDay) {
        const thursday = new Date(weekStart);
        thursday.setDate(thursday.getDate() + 3);
        if (thursday.getFullYear() === year) {
            weekCount++;
        }
        weekStart.setDate(weekStart.getDate() + 7);
    }

    const daysInYear = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;

    // Считаем ссылки (граничные недели)
    // Примерно 10-12 ссылок в год (по 1-2 на месяц где есть граничные недели)
    const estimatedLinks = 12;

    const breakdown = {
        year: 1,
        quarters: 4,
        months: 12,
        weeksContainers: 12,
        weeks: weekCount,
        daysContainers: weekCount,
        days: daysInYear,
        yearPlanRetro: 2,
        quarterPlanRetro: 8,
        monthPlanRetro: 24,
        weekPlanRetro: weekCount * 2,
        links: estimatedLinks
    };

    return {
        total: breakdown.year + breakdown.quarters + breakdown.months +
               breakdown.weeksContainers + breakdown.weeks +
               breakdown.daysContainers + breakdown.days +
               breakdown.yearPlanRetro + breakdown.quarterPlanRetro +
               breakdown.monthPlanRetro + breakdown.weekPlanRetro +
               breakdown.links,
        breakdown
    };
}

// Экспорт для тестирования
export {
    getMonday,
    getISOWeekNumber,
    getISOWeekKey,
    getMonthsInQuarter,
    MONTH_NAMES,
    MONTH_NAMES_SHORT,
    WEEKDAY_NAMES
};

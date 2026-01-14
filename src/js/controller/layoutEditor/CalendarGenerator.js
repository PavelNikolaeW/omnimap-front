/**
 * CalendarGenerator.js
 *
 * Генерирует иерархическую структуру календаря на год:
 * Год (План+Итоги) → Кварталы (План+Итоги) → Месяцы (План+Итоги) → Недели (План+Итоги+Дни)
 *
 * Каждый уровень иерархии имеет блоки План и Итоги для планирования и ретроспективы.
 * Использует ISO 8601 для определения принадлежности недель к месяцам.
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
 * @param {Date} date
 * @returns {Date}
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
 * @param {Date} date
 * @returns {number}
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
 * @param {Date} date
 * @returns {string}
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
 * @param {Date} date
 * @returns {string}
 */
function formatISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Считает количество дней недели в указанном месяце
 * @param {Date} weekStart - Понедельник недели
 * @param {number} monthNum - Номер месяца (1-12)
 * @param {number} year
 * @returns {number}
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
 * @param {number} quarter - Номер квартала (1-4)
 * @returns {number[]}
 */
function getMonthsInQuarter(quarter) {
    const start = (quarter - 1) * 3 + 1;
    return [start, start + 1, start + 2];
}

/**
 * Определяет, является ли день выходным (Сб или Вс)
 * @param {Date} date
 * @returns {boolean}
 */
function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
}

/**
 * Генерирует блок План
 * @param {string} parentId - ID родительского блока
 * @param {string} level - Уровень: 'year', 'quarter', 'month', 'week'
 * @param {Object} context - Контекст (год, квартал, месяц, номер недели)
 * @returns {Object}
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
 * @param {string} parentId - ID родительского блока
 * @param {string} level - Уровень: 'year', 'quarter', 'month', 'week'
 * @param {Object} context - Контекст (год, квартал, месяц, номер недели)
 * @returns {Object}
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
 * @param {Date} date
 * @param {string} weekBlockId
 * @returns {Object}
 */
function generateDayBlock(date, weekBlockId) {
    const dayOfMonth = date.getDate();
    const monthNum = date.getMonth() + 1;
    const year = date.getFullYear();
    const weekday = date.getDay() === 0 ? 7 : date.getDay();

    return {
        id: generateBlockId(),
        parent_id: weekBlockId,
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
 * Генерирует блок недели с планом, ретроспективой и днями
 *
 * Лейаут недели (7 rows × 3 cols):
 * +------------------+------+
 * | План (1-5, 1-2)  | Пн   | row 1, col 3
 * | rowSpan=5        | Вт   | row 2, col 3
 * | colSpan=2        | Ср   | row 3, col 3
 * |                  | Чт   | row 4, col 3
 * |                  | Пт   | row 5, col 3
 * +------------------+------+
 * | Итоги (6-7, 1-2) | Сб   | row 6, col 3
 * | rowSpan=2        | Вс   | row 7, col 3
 * +------------------+------+
 */
function generateWeekBlock(weekStart, monthBlockId, primaryMonth, year) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weekNumber = getISOWeekNumber(weekStart);
    const isoWeekKey = getISOWeekKey(weekStart);

    const weekBlockId = generateBlockId();
    const childBlocks = [];
    const childOrder = [];
    const cells = {};

    const context = { year, month: primaryMonth, weekNumber };

    // 1. План
    const planBlock = generatePlanBlock(weekBlockId, 'week', context);
    childBlocks.push(planBlock);
    childOrder.push(planBlock.id);
    cells[planBlock.id] = { row: 1, col: 1, rowSpan: 5, colSpan: 2 };

    // 2. Итоги
    const retroBlock = generateRetroBlock(weekBlockId, 'week', context);
    childBlocks.push(retroBlock);
    childOrder.push(retroBlock.id);
    cells[retroBlock.id] = { row: 6, col: 1, rowSpan: 2, colSpan: 2 };

    // 3. Дни (Пн-Вс)
    const currentDay = new Date(weekStart);
    for (let i = 0; i < 7; i++) {
        const dayBlock = generateDayBlock(currentDay, weekBlockId);
        childBlocks.push(dayBlock);
        childOrder.push(dayBlock.id);
        cells[dayBlock.id] = { row: i + 1, col: 3, rowSpan: 1, colSpan: 1 };
        currentDay.setDate(currentDay.getDate() + 1);
    }

    const daysInPrimaryMonth = countDaysInMonth(weekStart, primaryMonth, year);
    const isBoundaryWeek = daysInPrimaryMonth < 7;

    const weekBlock = {
        id: weekBlockId,
        parent_id: monthBlockId,
        title: `Неделя ${weekNumber}`,
        data: {
            layout: 'cells',
            layoutCells: {
                gridSize: { rows: 7, cols: 3 },
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

    return { weekBlock, childBlocks };
}

/**
 * Собирает информацию о неделях месяца
 */
function getWeeksOfMonth(year, monthNum, weekRegistry) {
    const weeks = [];
    const firstDay = new Date(year, monthNum - 1, 1);
    const lastDay = new Date(year, monthNum, 0);

    let weekStart = getMonday(firstDay);

    while (weekStart <= lastDay) {
        const isoWeekKey = getISOWeekKey(weekStart);
        const daysInThisMonth = countDaysInMonth(weekStart, monthNum, year);

        const thursday = new Date(weekStart);
        thursday.setDate(thursday.getDate() + 3);
        const isOwner = thursday.getMonth() + 1 === monthNum && thursday.getFullYear() === year;

        if (daysInThisMonth > 0) {
            weeks.push({
                weekStart: new Date(weekStart),
                isoWeekKey,
                isOwner,
                daysInMonth: daysInThisMonth
            });
        }

        weekStart.setDate(weekStart.getDate() + 7);
    }

    return weeks;
}

/**
 * Генерирует блоки месяцев с планами, итогами и неделями
 *
 * Лейаут месяца (N+1 rows × 2 cols):
 * +--------+--------+
 * | План   | Нед.1  | row 1
 * | месяца | Нед.2  | row 2
 * | (span) | Нед.3  | row 3
 * +--------+ Нед.4  | row 4
 * | Итоги  | Нед.5  | row 5
 * | (span) | Нед.6  | row 6 (if exists)
 * +--------+--------+
 */
function generateAllMonths(year, quarterBlocks, weekRegistry) {
    const allBlocks = [];
    const allLinkRequests = [];
    const monthBlocksMap = new Map();
    let totalWeeks = 0;
    let totalDays = 0;
    let totalWeekPlanRetro = 0;

    // Первый проход: создаём месяцы и недели-владельцы
    for (let monthNum = 1; monthNum <= 12; monthNum++) {
        const quarterIndex = Math.floor((monthNum - 1) / 3);
        const quarterBlockId = quarterBlocks[quarterIndex].id;

        const monthBlockId = generateBlockId();
        const monthChildBlocks = [];
        const weekBlocks = [];
        const allWeekChildren = [];
        const weekIds = [];

        const weeks = getWeeksOfMonth(year, monthNum, weekRegistry);
        const totalWeeksInMonth = weeks.length;

        // Считаем owned и link недели
        let ownedCount = 0;
        let linkCount = 0;
        for (const week of weeks) {
            if (week.isOwner) ownedCount++;
            else linkCount++;
        }

        // Высота сетки = недели (owned) + 2 строки для план/итоги
        // План занимает верхнюю часть, Итоги - нижнюю
        const gridRows = Math.max(totalWeeksInMonth, 4); // минимум 4 строки

        // Позиции для План и Итоги
        const planRowSpan = Math.ceil(gridRows * 0.6); // 60% для плана
        const retroRowSpan = gridRows - planRowSpan; // остальное для итогов

        const context = { year, month: monthNum };

        // 1. План месяца
        const planBlock = generatePlanBlock(monthBlockId, 'month', context);
        monthChildBlocks.push(planBlock);

        // 2. Итоги месяца
        const retroBlock = generateRetroBlock(monthBlockId, 'month', context);
        monthChildBlocks.push(retroBlock);

        // 3. Недели
        let weekRowIndex = 1;
        for (const week of weeks) {
            if (week.isOwner) {
                const { weekBlock, childBlocks } = generateWeekBlock(
                    week.weekStart,
                    monthBlockId,
                    monthNum,
                    year
                );
                weekBlocks.push(weekBlock);
                allWeekChildren.push(...childBlocks);
                weekIds.push({ type: 'block', id: weekBlock.id, row: weekRowIndex });

                weekRegistry.set(week.isoWeekKey, {
                    blockId: weekBlock.id,
                    ownerMonth: monthNum
                });

                totalWeeks++;
                totalDays += 7;
                totalWeekPlanRetro += 2;
            } else {
                weekIds.push({ type: 'link', isoWeekKey: week.isoWeekKey, row: weekRowIndex });
            }
            weekRowIndex++;
        }

        // Строим childOrder и cells
        const childOrder = [planBlock.id, retroBlock.id];
        const cells = {};

        // План: col 1, rows 1 to planRowSpan
        cells[planBlock.id] = { row: 1, col: 1, rowSpan: planRowSpan, colSpan: 1 };

        // Итоги: col 1, rows planRowSpan+1 to end
        cells[retroBlock.id] = { row: planRowSpan + 1, col: 1, rowSpan: retroRowSpan, colSpan: 1 };

        // Недели: col 2
        for (const weekRef of weekIds) {
            if (weekRef.type === 'block') {
                childOrder.push(weekRef.id);
                cells[weekRef.id] = { row: weekRef.row, col: 2, rowSpan: 1, colSpan: 1 };
            }
        }

        const monthBlock = {
            id: monthBlockId,
            parent_id: quarterBlockId,
            title: MONTH_NAMES[monthNum - 1],
            data: {
                layout: 'cells',
                layoutCells: {
                    gridSize: { rows: gridRows, cols: 2 },
                    presetType: 'month-calendar',
                    cells
                },
                calendarType: 'month',
                calendarMonth: monthNum,
                calendarYear: year,
                monthNameShort: MONTH_NAMES_SHORT[monthNum - 1],
                childOrder
            },
            _weekIds: weekIds,
            _weekBlocks: weekBlocks,
            _monthChildBlocks: monthChildBlocks,
            _allWeekChildren: allWeekChildren
        };

        monthBlocksMap.set(monthNum, monthBlock);
    }

    // Второй проход: создаём linkRequests
    for (let monthNum = 1; monthNum <= 12; monthNum++) {
        const monthBlock = monthBlocksMap.get(monthNum);

        for (const weekRef of monthBlock._weekIds) {
            if (weekRef.type === 'link') {
                const weekInfo = weekRegistry.get(weekRef.isoWeekKey);
                if (weekInfo) {
                    allLinkRequests.push({
                        destBlockId: monthBlock.id,
                        srcBlockId: weekInfo.blockId,
                        isoWeekKey: weekRef.isoWeekKey,
                        row: weekRef.row,
                        col: 2
                    });
                }
            }
        }

        // Добавляем блоки
        allBlocks.push(monthBlock);
        allBlocks.push(...monthBlock._monthChildBlocks);
        allBlocks.push(...monthBlock._weekBlocks);
        allBlocks.push(...monthBlock._allWeekChildren);

        // Очищаем временные поля
        delete monthBlock._weekIds;
        delete monthBlock._weekBlocks;
        delete monthBlock._monthChildBlocks;
        delete monthBlock._allWeekChildren;
    }

    return {
        allBlocks,
        allLinkRequests,
        totalWeeks,
        totalDays,
        totalWeekPlanRetro,
        monthPlanRetro: 24 // 12 месяцев × 2
    };
}

/**
 * Генерирует полную иерархию календаря на год
 *
 * Лейаут года (2 rows × 3 cols):
 * +--------+--------+--------+
 * | План   | Q1     | Q2     |
 * | года   |        |        |
 * +--------+--------+--------+
 * | Итоги  | Q3     | Q4     |
 * | года   |        |        |
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
    blocks.unshift(yearBlock); // Год первым

    // === МЕСЯЦЫ И НЕДЕЛИ ===
    const { allBlocks, allLinkRequests, totalWeeks, totalDays, totalWeekPlanRetro, monthPlanRetro } =
        generateAllMonths(year, quarterBlocks, weekRegistry);

    blocks.push(...allBlocks);

    // Обновляем childOrder и cells кварталов
    for (let q = 1; q <= 4; q++) {
        const quarterBlock = quarterBlocks[q - 1];
        const monthsInQuarter = getMonthsInQuarter(q);

        for (let i = 0; i < 3; i++) {
            const monthNum = monthsInQuarter[i];
            const monthBlock = allBlocks.find(b =>
                b.data?.calendarType === 'month' && b.data?.calendarMonth === monthNum
            );
            if (monthBlock) {
                quarterBlock.data.childOrder.push(monthBlock.id);
                quarterBlock.data.layoutCells.cells[monthBlock.id] = {
                    row: 1, col: i + 2, rowSpan: 2, colSpan: 1
                };
            }
        }
    }

    // Статистика
    const stats = {
        years: 1,
        quarters: 4,
        months: 12,
        weeks: totalWeeks,
        days: totalDays,
        yearPlanRetro: 2,
        quarterPlanRetro: 8, // 4 квартала × 2
        monthPlanRetro,
        weekPlanRetro: totalWeekPlanRetro,
        links: allLinkRequests.length
    };

    return { blocks, linkRequests: allLinkRequests, stats };
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

    const breakdown = {
        year: 1,
        quarters: 4,
        months: 12,
        weeks: weekCount,
        days: daysInYear,
        yearPlanRetro: 2,
        quarterPlanRetro: 8,
        monthPlanRetro: 24,
        weekPlanRetro: weekCount * 2
    };

    return {
        total: breakdown.year + breakdown.quarters + breakdown.months +
               breakdown.weeks + breakdown.days +
               breakdown.yearPlanRetro + breakdown.quarterPlanRetro +
               breakdown.monthPlanRetro + breakdown.weekPlanRetro,
        breakdown
    };
}

// Экспорт для тестирования
export {
    getMonday,
    getISOWeekNumber,
    getISOWeekKey,
    getWeeksOfMonth,
    getMonthsInQuarter,
    MONTH_NAMES,
    MONTH_NAMES_SHORT,
    WEEKDAY_NAMES
};

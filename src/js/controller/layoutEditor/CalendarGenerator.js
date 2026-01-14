/**
 * CalendarGenerator.js
 *
 * Генерирует иерархическую структуру календаря на год:
 * Год → 4 квартала → 12 месяцев → ~52 недели → (План + Ретро + 7 дней)
 *
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
    // Год недели может отличаться от года даты (для граничных недель)
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
    return day === 0 || day === 6; // 0 = воскресенье, 6 = суббота
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
    const weekday = date.getDay() === 0 ? 7 : date.getDay(); // 1=Пн, 7=Вс

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
 * Генерирует блок плана недели
 * @param {string} weekBlockId
 * @param {number} weekNumber
 * @returns {Object}
 */
function generatePlanBlock(weekBlockId, weekNumber) {
    return {
        id: generateBlockId(),
        parent_id: weekBlockId,
        title: 'План',
        data: {
            calendarType: 'weekPlan',
            calendarWeekNumber: weekNumber,
            text: ''
        }
    };
}

/**
 * Генерирует блок ретроспективы недели
 * @param {string} weekBlockId
 * @param {number} weekNumber
 * @returns {Object}
 */
function generateRetroBlock(weekBlockId, weekNumber) {
    return {
        id: generateBlockId(),
        parent_id: weekBlockId,
        title: 'Итоги',
        data: {
            calendarType: 'weekRetro',
            calendarWeekNumber: weekNumber,
            text: '• Что получилось:\n• Что не получилось:\n• Что улучшить:'
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
 *
 * @param {Date} weekStart - Понедельник недели
 * @param {string} monthBlockId
 * @param {number} primaryMonth - Основной месяц
 * @param {number} year
 * @returns {{weekBlock: Object, childBlocks: Object[]}}
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

    // 1. Генерируем блок Плана
    const planBlock = generatePlanBlock(weekBlockId, weekNumber);
    childBlocks.push(planBlock);
    childOrder.push(planBlock.id);
    cells[planBlock.id] = {
        row: 1,
        col: 1,
        rowSpan: 5,
        colSpan: 2
    };

    // 2. Генерируем блок Ретроспективы
    const retroBlock = generateRetroBlock(weekBlockId, weekNumber);
    childBlocks.push(retroBlock);
    childOrder.push(retroBlock.id);
    cells[retroBlock.id] = {
        row: 6,
        col: 1,
        rowSpan: 2,
        colSpan: 2
    };

    // 3. Генерируем 7 дней (Пн-Вс) в правой колонке
    const currentDay = new Date(weekStart);
    for (let i = 0; i < 7; i++) {
        const dayBlock = generateDayBlock(currentDay, weekBlockId);
        childBlocks.push(dayBlock);
        childOrder.push(dayBlock.id);
        cells[dayBlock.id] = {
            row: i + 1,
            col: 3,
            rowSpan: 1,
            colSpan: 1
        };
        currentDay.setDate(currentDay.getDate() + 1);
    }

    // Определяем является ли неделя граничной
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
 * @param {number} year
 * @param {number} monthNum - Номер месяца (1-12)
 * @param {Map<string, {blockId: string, ownerMonth: number}>} weekRegistry - Реестр недель
 * @returns {Array<{weekStart: Date, isoWeekKey: string, isOwner: boolean, daysInMonth: number}>}
 */
function getWeeksOfMonth(year, monthNum, weekRegistry) {
    const weeks = [];
    const firstDay = new Date(year, monthNum - 1, 1);
    const lastDay = new Date(year, monthNum, 0);

    // Начинаем с понедельника недели, содержащей 1-е число
    let weekStart = getMonday(firstDay);

    while (weekStart <= lastDay) {
        const isoWeekKey = getISOWeekKey(weekStart);
        const daysInThisMonth = countDaysInMonth(weekStart, monthNum, year);

        // Неделя принадлежит месяцу где находится четверг (ISO 8601)
        const thursday = new Date(weekStart);
        thursday.setDate(thursday.getDate() + 3);
        const isOwner = thursday.getMonth() + 1 === monthNum && thursday.getFullYear() === year;

        // Добавляем все недели у которых есть хотя бы 1 день в этом месяце
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
 * Генерирует блоки месяцев с неделями
 * Использует двухпроходный алгоритм:
 * 1. Проход: создаём недели и регистрируем их
 * 2. Проход: создаём ссылки для не-владельцев с позициями в сетке
 */
function generateAllMonths(year, quarterBlocks, weekRegistry) {
    const allBlocks = [];
    const allLinkRequests = [];
    const monthBlocksMap = new Map(); // monthNum -> monthBlock
    let totalWeeks = 0;
    let totalDays = 0;
    let totalPlanRetro = 0;

    // Первый проход: создаём все месяцы и недели-владельцы
    for (let monthNum = 1; monthNum <= 12; monthNum++) {
        const quarterIndex = Math.floor((monthNum - 1) / 3);
        const quarterBlockId = quarterBlocks[quarterIndex].id;

        const monthBlockId = generateBlockId();
        const weekBlocks = [];
        const childBlocks = [];
        const weekIds = [];

        const weeks = getWeeksOfMonth(year, monthNum, weekRegistry);
        const totalWeeksInMonth = weeks.length; // Включая ссылки

        let rowIndex = 1;
        for (const week of weeks) {
            if (week.isOwner) {
                // Этот месяц владеет неделей - создаём реальный блок
                const { weekBlock, childBlocks: children } = generateWeekBlock(
                    week.weekStart,
                    monthBlockId,
                    monthNum,
                    year
                );
                weekBlocks.push(weekBlock);
                childBlocks.push(...children);
                weekIds.push({ type: 'block', id: weekBlock.id, row: rowIndex });

                // Регистрируем неделю
                weekRegistry.set(week.isoWeekKey, {
                    blockId: weekBlock.id,
                    ownerMonth: monthNum
                });

                totalWeeks++;
                // 7 дней + 1 план + 1 ретро = 9 дочерних блоков
                totalDays += 7;
                totalPlanRetro += 2;
            } else {
                // Не владелец - будет ссылка (обработаем во втором проходе)
                weekIds.push({ type: 'link', isoWeekKey: week.isoWeekKey, row: rowIndex });
            }
            rowIndex++;
        }

        const monthBlock = {
            id: monthBlockId,
            parent_id: quarterBlockId,
            title: MONTH_NAMES[monthNum - 1],
            data: {
                layout: 'cells',
                layoutCells: {
                    gridSize: { rows: totalWeeksInMonth, cols: 1 },
                    presetType: 'month-calendar',
                    cells: {}
                },
                calendarType: 'month',
                calendarMonth: monthNum,
                calendarYear: year,
                monthNameShort: MONTH_NAMES_SHORT[monthNum - 1],
                childOrder: [] // Заполним после второго прохода
            },
            _weekIds: weekIds, // Временное поле для второго прохода
            _weekBlocks: weekBlocks,
            _childBlocks: childBlocks
        };

        monthBlocksMap.set(monthNum, monthBlock);
    }

    // Второй проход: создаём ссылки и финализируем childOrder и cells
    for (let monthNum = 1; monthNum <= 12; monthNum++) {
        const monthBlock = monthBlocksMap.get(monthNum);
        const finalWeekIds = [];

        for (const weekRef of monthBlock._weekIds) {
            if (weekRef.type === 'block') {
                finalWeekIds.push(weekRef.id);
                monthBlock.data.layoutCells.cells[weekRef.id] = {
                    row: weekRef.row,
                    col: 1,
                    rowSpan: 1,
                    colSpan: 1
                };
            } else if (weekRef.type === 'link') {
                // Ищем реальную неделю в registry
                const weekInfo = weekRegistry.get(weekRef.isoWeekKey);
                if (weekInfo) {
                    allLinkRequests.push({
                        destBlockId: monthBlock.id,
                        srcBlockId: weekInfo.blockId,
                        isoWeekKey: weekRef.isoWeekKey,
                        row: weekRef.row // Позиция в сетке месяца
                    });
                    // Ссылка будет добавлена в childOrder и cells после создания
                }
            }
        }

        monthBlock.data.childOrder = finalWeekIds;

        // Добавляем блоки в итоговый массив
        allBlocks.push(monthBlock);
        allBlocks.push(...monthBlock._weekBlocks);
        allBlocks.push(...monthBlock._childBlocks);

        // Удаляем временные поля
        delete monthBlock._weekIds;
        delete monthBlock._weekBlocks;
        delete monthBlock._childBlocks;
    }

    return { allBlocks, allLinkRequests, totalWeeks, totalDays, totalPlanRetro };
}

/**
 * Генерирует полную иерархию календаря на год
 * @param {number} year - Год для генерации
 * @param {string} parentBlockId - ID родительского блока
 * @returns {{blocks: Object[], linkRequests: Object[], stats: Object}}
 */
export function generateYearCalendar(year, parentBlockId) {
    const blocks = [];
    const weekRegistry = new Map(); // isoWeekKey -> {blockId, ownerMonth}

    // 1. Создаём блок года
    const yearBlockId = generateBlockId();
    const quarterIds = [];

    blocks.push({
        id: yearBlockId,
        parent_id: parentBlockId,
        title: `${year}`,
        data: {
            layout: 'cells',
            layoutCells: {
                gridSize: { rows: 2, cols: 2 },
                presetType: 'year-calendar',
                cells: {}
            },
            calendarType: 'year',
            calendarYear: year,
            childOrder: [] // Заполним после создания кварталов
        }
    });

    // 2. Создаём 4 квартала
    const quarterBlocks = [];
    for (let q = 1; q <= 4; q++) {
        const quarterBlockId = generateBlockId();
        quarterIds.push(quarterBlockId);

        const quarterBlock = {
            id: quarterBlockId,
            parent_id: yearBlockId,
            title: `Q${q}`,
            data: {
                layout: 'cells',
                layoutCells: {
                    gridSize: { rows: 1, cols: 3 },
                    presetType: 'quarter',
                    cells: {}
                },
                calendarType: 'quarter',
                calendarQuarter: q,
                calendarYear: year,
                childOrder: [] // Заполним после создания месяцев
            }
        };

        quarterBlocks.push(quarterBlock);
        blocks.push(quarterBlock);
    }

    // 3. Генерируем месяцы с двухпроходным алгоритмом
    const { allBlocks, allLinkRequests, totalWeeks, totalDays, totalPlanRetro } =
        generateAllMonths(year, quarterBlocks, weekRegistry);

    blocks.push(...allBlocks);

    // 4. Обновляем childOrder кварталов
    for (let q = 1; q <= 4; q++) {
        const quarterBlock = quarterBlocks[q - 1];
        const monthsInQuarter = getMonthsInQuarter(q);
        const monthIds = [];

        for (const monthNum of monthsInQuarter) {
            const monthBlock = allBlocks.find(b =>
                b.data?.calendarType === 'month' && b.data?.calendarMonth === monthNum
            );
            if (monthBlock) {
                monthIds.push(monthBlock.id);
                // Добавляем в cells квартала
                const colIndex = monthsInQuarter.indexOf(monthNum) + 1;
                quarterBlock.data.layoutCells.cells[monthBlock.id] = {
                    row: 1,
                    col: colIndex,
                    rowSpan: 1,
                    colSpan: 1
                };
            }
        }
        quarterBlock.data.childOrder = monthIds;
    }

    // 5. Обновляем cells и childOrder года
    const yearBlock = blocks[0];
    quarterIds.forEach((id, i) => {
        yearBlock.data.layoutCells.cells[id] = {
            row: Math.floor(i / 2) + 1,
            col: (i % 2) + 1,
            rowSpan: 1,
            colSpan: 1
        };
    });
    yearBlock.data.childOrder = quarterIds;

    // Статистика
    const stats = {
        years: 1,
        quarters: 4,
        months: 12,
        weeks: totalWeeks,
        days: totalDays,
        planRetro: totalPlanRetro,
        links: allLinkRequests.length
    };

    return { blocks, linkRequests: allLinkRequests, stats };
}

/**
 * Возвращает количество блоков которые будут созданы для года
 * @param {number} year
 * @returns {{total: number, breakdown: Object}}
 */
export function estimateYearCalendarSize(year) {
    // Подсчитываем точное количество недель
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
    const planRetro = weekCount * 2; // По одному на неделю

    const breakdown = {
        year: 1,
        quarters: 4,
        months: 12,
        weeks: weekCount,
        days: daysInYear,
        planRetro
    };

    return {
        total: breakdown.year + breakdown.quarters + breakdown.months +
               breakdown.weeks + breakdown.days + breakdown.planRetro,
        breakdown
    };
}

// Экспорт вспомогательных функций для тестирования
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

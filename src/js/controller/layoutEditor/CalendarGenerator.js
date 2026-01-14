/**
 * CalendarGenerator.js
 *
 * Генерирует иерархическую структуру календаря на год:
 * Год → 4 квартала → 12 месяцев → ~52 недели → 365 дней
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
 * Определяет, является ли день выходным
 * @param {Date} date
 * @returns {boolean}
 */
function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
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
            text: `${dayOfMonth} ${MONTH_NAMES_SHORT[monthNum - 1]}`,
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
 * Генерирует блок недели с днями
 * @param {Date} weekStart - Понедельник недели
 * @param {string} monthBlockId
 * @param {number} primaryMonth - Основной месяц (для title)
 * @param {number} year
 * @returns {{weekBlock: Object, dayBlocks: Object[]}}
 */
function generateWeekBlock(weekStart, monthBlockId, primaryMonth, year) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weekNumber = getISOWeekNumber(weekStart);
    const isoWeekKey = getISOWeekKey(weekStart);

    const weekBlockId = generateBlockId();
    const dayBlocks = [];
    const dayIds = [];

    // Генерируем 7 дней
    const currentDay = new Date(weekStart);
    for (let i = 0; i < 7; i++) {
        const dayBlock = generateDayBlock(currentDay, weekBlockId);
        dayBlocks.push(dayBlock);
        dayIds.push(dayBlock.id);
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
            text: `Нед. ${weekNumber}`,
            layout: 'columns',
            calendarType: 'week',
            calendarWeekNumber: weekNumber,
            calendarYear: year,
            calendarMonth: primaryMonth,
            weekStartDate: formatISODate(weekStart),
            weekEndDate: formatISODate(weekEnd),
            isBoundaryWeek,
            isoWeekKey,
            childOrder: dayIds
        }
    };

    return { weekBlock, dayBlocks };
}

/**
 * Собирает информацию о неделях месяца
 * @param {number} year
 * @param {number} monthNum - Номер месяца (1-12)
 * @param {Map<string, string>} weekRegistry - Реестр созданных недель
 * @returns {Array<{weekStart: Date, isoWeekKey: string, isLinkWeek: boolean, existingWeekId?: string}>}
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

        // Неделя принадлежит месяцу если там >= 4 дней (ISO 8601 правило с четвергом)
        const thursday = new Date(weekStart);
        thursday.setDate(thursday.getDate() + 3);
        const ownsWeek = thursday.getMonth() + 1 === monthNum && thursday.getFullYear() === year;

        if (ownsWeek) {
            // Этот месяц владеет неделей - создаём реальный блок
            weeks.push({
                weekStart: new Date(weekStart),
                isoWeekKey,
                isLinkWeek: false,
                daysInMonth: daysInThisMonth
            });
        } else if (weekRegistry.has(isoWeekKey)) {
            // Неделя уже создана в другом месяце - создаём ссылку
            weeks.push({
                weekStart: new Date(weekStart),
                isoWeekKey,
                isLinkWeek: true,
                existingWeekId: weekRegistry.get(isoWeekKey),
                daysInMonth: daysInThisMonth
            });
        }
        // Если неделя не наша и ещё не создана - пропускаем (будет создана позже)

        weekStart.setDate(weekStart.getDate() + 7);
    }

    return weeks;
}

/**
 * Генерирует блок месяца с неделями и днями
 * @param {number} year
 * @param {number} monthNum - Номер месяца (1-12)
 * @param {string} quarterBlockId
 * @param {Map<string, string>} weekRegistry - Реестр созданных недель
 * @returns {{monthBlock: Object, weekBlocks: Object[], dayBlocks: Object[], linkRequests: Object[]}}
 */
function generateMonthBlock(year, monthNum, quarterBlockId, weekRegistry) {
    const monthBlockId = generateBlockId();
    const weekBlocks = [];
    const dayBlocks = [];
    const linkRequests = [];
    const weekIds = [];

    const weeks = getWeeksOfMonth(year, monthNum, weekRegistry);

    for (const week of weeks) {
        if (week.isLinkWeek) {
            // Создаём запрос на ссылку
            linkRequests.push({
                destBlockId: monthBlockId,
                srcBlockId: week.existingWeekId,
                isoWeekKey: week.isoWeekKey
            });
            // Placeholder для childOrder - будет заменён после создания ссылки
            weekIds.push({ isLink: true, srcId: week.existingWeekId });
        } else {
            // Создаём реальную неделю
            const { weekBlock, dayBlocks: days } = generateWeekBlock(
                week.weekStart,
                monthBlockId,
                monthNum,
                year
            );
            weekBlocks.push(weekBlock);
            dayBlocks.push(...days);
            weekIds.push(weekBlock.id);

            // Регистрируем неделю для потенциальных ссылок
            weekRegistry.set(week.isoWeekKey, weekBlock.id);
        }
    }

    // Фильтруем только реальные ID для childOrder
    const realWeekIds = weekIds.filter(id => typeof id === 'string');

    const monthBlock = {
        id: monthBlockId,
        parent_id: quarterBlockId,
        title: MONTH_NAMES[monthNum - 1],
        data: {
            text: MONTH_NAMES[monthNum - 1],
            layout: 'cells',
            layoutCells: {
                gridSize: { rows: realWeekIds.length, cols: 1 },
                presetType: 'month-calendar',
                cells: {}
            },
            calendarType: 'month',
            calendarMonth: monthNum,
            calendarYear: year,
            monthName: MONTH_NAMES[monthNum - 1],
            monthNameShort: MONTH_NAMES_SHORT[monthNum - 1],
            childOrder: realWeekIds
        }
    };

    // Заполняем cells для недель (вертикально)
    realWeekIds.forEach((id, i) => {
        monthBlock.data.layoutCells.cells[id] = {
            row: i + 1,
            col: 1,
            rowSpan: 1,
            colSpan: 1
        };
    });

    return { monthBlock, weekBlocks, dayBlocks, linkRequests };
}

/**
 * Генерирует полную иерархию календаря на год
 * @param {number} year - Год для генерации
 * @param {string} parentBlockId - ID родительского блока
 * @returns {{blocks: Object[], linkRequests: Object[], stats: {years: number, quarters: number, months: number, weeks: number, days: number}}}
 */
export function generateYearCalendar(year, parentBlockId) {
    const blocks = [];
    const linkRequests = [];
    const weekRegistry = new Map(); // isoWeekKey -> blockId

    // Статистика
    const stats = { years: 1, quarters: 4, months: 12, weeks: 0, days: 0 };

    // 1. Создаём блок года
    const yearBlockId = generateBlockId();
    const quarterIds = [];

    blocks.push({
        id: yearBlockId,
        parent_id: parentBlockId,
        title: `${year}`,
        data: {
            text: `Календарь ${year}`,
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
    for (let q = 1; q <= 4; q++) {
        const quarterBlockId = generateBlockId();
        quarterIds.push(quarterBlockId);

        const monthsInQuarter = getMonthsInQuarter(q);
        const monthIds = [];

        blocks.push({
            id: quarterBlockId,
            parent_id: yearBlockId,
            title: `Q${q}`,
            data: {
                text: `${q} квартал`,
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
        });

        // 3. Создаём 3 месяца в квартале
        for (const monthNum of monthsInQuarter) {
            const { monthBlock, weekBlocks, dayBlocks, linkRequests: monthLinks } =
                generateMonthBlock(year, monthNum, quarterBlockId, weekRegistry);

            monthIds.push(monthBlock.id);
            blocks.push(monthBlock, ...weekBlocks, ...dayBlocks);
            linkRequests.push(...monthLinks);

            stats.weeks += weekBlocks.length;
            stats.days += dayBlocks.length;
        }

        // Обновляем cells и childOrder квартала
        const quarterBlock = blocks.find(b => b.id === quarterBlockId);
        monthIds.forEach((id, i) => {
            quarterBlock.data.layoutCells.cells[id] = {
                row: 1,
                col: i + 1,
                rowSpan: 1,
                colSpan: 1
            };
        });
        quarterBlock.data.childOrder = monthIds;
    }

    // Обновляем cells и childOrder года
    const yearBlock = blocks.find(b => b.id === yearBlockId);
    quarterIds.forEach((id, i) => {
        yearBlock.data.layoutCells.cells[id] = {
            row: Math.floor(i / 2) + 1,
            col: (i % 2) + 1,
            rowSpan: 1,
            colSpan: 1
        };
    });
    yearBlock.data.childOrder = quarterIds;

    return { blocks, linkRequests, stats };
}

/**
 * Возвращает количество блоков которые будут созданы для года
 * @param {number} year
 * @returns {{total: number, breakdown: {year: number, quarters: number, months: number, weeks: number, days: number}}}
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

    const breakdown = {
        year: 1,
        quarters: 4,
        months: 12,
        weeks: weekCount,
        days: daysInYear
    };

    return {
        total: breakdown.year + breakdown.quarters + breakdown.months + breakdown.weeks + breakdown.days,
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

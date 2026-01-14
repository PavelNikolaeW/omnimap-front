/**
 * Tests for CalendarGenerator.js
 *
 * Full calendar structure with Plan & Retro at all levels:
 * Year (Plan+Retro) → Quarters (Plan+Retro) → Months (Plan+Retro) → Weeks (Plan+Retro+Days)
 */

import {
    generateYearCalendar,
    estimateYearCalendarSize,
    getMonday,
    getISOWeekNumber,
    getISOWeekKey,
    getWeeksOfMonth,
    getMonthsInQuarter,
    MONTH_NAMES,
    MONTH_NAMES_SHORT,
    WEEKDAY_NAMES
} from '../../../controller/layoutEditor/CalendarGenerator.js';

describe('CalendarGenerator', () => {
    describe('Helper functions', () => {
        describe('getMonday', () => {
            it('should return Monday for a Monday date', () => {
                const monday = new Date(2026, 0, 5);
                const result = getMonday(monday);
                expect(result.getDay()).toBe(1);
                expect(result.getDate()).toBe(5);
            });

            it('should return previous Monday for a Wednesday', () => {
                const wednesday = new Date(2026, 0, 7);
                const result = getMonday(wednesday);
                expect(result.getDay()).toBe(1);
                expect(result.getDate()).toBe(5);
            });

            it('should return previous Monday for a Sunday', () => {
                const sunday = new Date(2026, 0, 11);
                const result = getMonday(sunday);
                expect(result.getDay()).toBe(1);
                expect(result.getDate()).toBe(5);
            });
        });

        describe('getISOWeekNumber', () => {
            it('should return week 1 for first week of year', () => {
                const jan1 = new Date(2026, 0, 1);
                expect(getISOWeekNumber(jan1)).toBe(1);
            });

            it('should return week 53 for last week of some years', () => {
                const dec31_2020 = new Date(2020, 11, 31);
                expect(getISOWeekNumber(dec31_2020)).toBe(53);
            });
        });

        describe('getISOWeekKey', () => {
            it('should return formatted week key', () => {
                const date = new Date(2026, 0, 5);
                const key = getISOWeekKey(date);
                expect(key).toMatch(/^\d{4}-W\d{2}$/);
            });
        });

        describe('getMonthsInQuarter', () => {
            it('should return correct months for Q1', () => {
                expect(getMonthsInQuarter(1)).toEqual([1, 2, 3]);
            });

            it('should return correct months for Q2', () => {
                expect(getMonthsInQuarter(2)).toEqual([4, 5, 6]);
            });

            it('should return correct months for Q3', () => {
                expect(getMonthsInQuarter(3)).toEqual([7, 8, 9]);
            });

            it('should return correct months for Q4', () => {
                expect(getMonthsInQuarter(4)).toEqual([10, 11, 12]);
            });
        });
    });

    describe('getWeeksOfMonth', () => {
        it('should return weeks for January 2026', () => {
            const weekRegistry = new Map();
            const weeks = getWeeksOfMonth(2026, 1, weekRegistry);

            expect(weeks.length).toBeGreaterThan(0);
            expect(weeks.length).toBeLessThanOrEqual(6);

            weeks.forEach(week => {
                expect(week.weekStart.getDay()).toBe(1);
            });
        });

        it('should mark owned weeks correctly', () => {
            const weekRegistry = new Map();
            const weeks = getWeeksOfMonth(2026, 1, weekRegistry);

            const ownedWeeks = weeks.filter(w => w.isOwner);
            expect(ownedWeeks.length).toBeGreaterThan(0);

            weeks.forEach(w => {
                expect(w.daysInMonth).toBeGreaterThanOrEqual(1);
                expect(w.daysInMonth).toBeLessThanOrEqual(7);
            });
        });
    });

    describe('estimateYearCalendarSize', () => {
        it('should estimate correct number of blocks including all Plan/Retro', () => {
            const { total, breakdown } = estimateYearCalendarSize(2026);

            expect(breakdown.year).toBe(1);
            expect(breakdown.quarters).toBe(4);
            expect(breakdown.months).toBe(12);
            expect(breakdown.weeks).toBeGreaterThan(50);
            expect(breakdown.weeks).toBeLessThanOrEqual(53);
            expect(breakdown.days).toBe(365);

            // Plan/Retro at all levels
            expect(breakdown.yearPlanRetro).toBe(2);
            expect(breakdown.quarterPlanRetro).toBe(8);
            expect(breakdown.monthPlanRetro).toBe(24);
            expect(breakdown.weekPlanRetro).toBe(breakdown.weeks * 2);

            // Total should include all Plan/Retro
            const expectedTotal = breakdown.year + breakdown.quarters + breakdown.months +
                breakdown.weeks + breakdown.days +
                breakdown.yearPlanRetro + breakdown.quarterPlanRetro +
                breakdown.monthPlanRetro + breakdown.weekPlanRetro;
            expect(total).toBe(expectedTotal);
            expect(total).toBeGreaterThan(530);
        });

        it('should account for leap year', () => {
            const { breakdown: leap } = estimateYearCalendarSize(2024);
            const { breakdown: nonLeap } = estimateYearCalendarSize(2025);

            expect(leap.days).toBe(366);
            expect(nonLeap.days).toBe(365);
        });
    });

    describe('generateYearCalendar', () => {
        describe('Year level', () => {
            it('should generate year block with Plan and Retro', () => {
                const { blocks } = generateYearCalendar(2026, 'parent-123');

                const yearBlock = blocks.find(b => b.data.calendarType === 'year');
                expect(yearBlock).toBeDefined();
                expect(yearBlock.title).toBe('2026');
                expect(yearBlock.data.layout).toBe('cells');
                expect(yearBlock.data.layoutCells.gridSize).toEqual({ rows: 2, cols: 3 });

                // Year should have Plan and Retro as children
                const yearPlan = blocks.find(b => b.data.calendarType === 'yearPlan');
                const yearRetro = blocks.find(b => b.data.calendarType === 'yearRetro');
                expect(yearPlan).toBeDefined();
                expect(yearRetro).toBeDefined();
                expect(yearPlan.title).toBe('План 2026');
                expect(yearRetro.title).toBe('Итоги 2026');
                expect(yearRetro.data.text).toContain('Главные достижения');
            });

            it('should position Year Plan and Retro correctly', () => {
                const { blocks } = generateYearCalendar(2026, 'parent-123');

                const yearBlock = blocks.find(b => b.data.calendarType === 'year');
                const yearPlan = blocks.find(b => b.data.calendarType === 'yearPlan');
                const yearRetro = blocks.find(b => b.data.calendarType === 'yearRetro');

                const cells = yearBlock.data.layoutCells.cells;
                expect(cells[yearPlan.id]).toEqual({ row: 1, col: 1, rowSpan: 1, colSpan: 1 });
                expect(cells[yearRetro.id]).toEqual({ row: 2, col: 1, rowSpan: 1, colSpan: 1 });
            });
        });

        describe('Quarter level', () => {
            it('should generate 4 quarters with Plan and Retro each', () => {
                const { blocks } = generateYearCalendar(2026, 'parent-123');

                const quarters = blocks.filter(b => b.data.calendarType === 'quarter');
                expect(quarters.length).toBe(4);

                const quarterPlans = blocks.filter(b => b.data.calendarType === 'quarterPlan');
                const quarterRetros = blocks.filter(b => b.data.calendarType === 'quarterRetro');
                expect(quarterPlans.length).toBe(4);
                expect(quarterRetros.length).toBe(4);

                quarters.forEach((q, i) => {
                    expect(q.title).toBe(`Q${i + 1}`);
                    expect(q.data.layout).toBe('cells');
                    expect(q.data.layoutCells.gridSize).toEqual({ rows: 2, cols: 4 });
                });

                // Check titles
                expect(quarterPlans[0].title).toBe('План Q1');
                expect(quarterRetros[0].title).toBe('Итоги Q1');
                expect(quarterRetros[0].data.text).toContain('Ключевые результаты');
            });

            it('should position quarters correctly in year grid', () => {
                const { blocks } = generateYearCalendar(2026, 'parent-123');

                const yearBlock = blocks.find(b => b.data.calendarType === 'year');
                const quarters = blocks.filter(b => b.data.calendarType === 'quarter');
                const cells = yearBlock.data.layoutCells.cells;

                // Q1 at row 1, col 2
                expect(cells[quarters[0].id]).toEqual({ row: 1, col: 2, rowSpan: 1, colSpan: 1 });
                // Q2 at row 1, col 3
                expect(cells[quarters[1].id]).toEqual({ row: 1, col: 3, rowSpan: 1, colSpan: 1 });
                // Q3 at row 2, col 2
                expect(cells[quarters[2].id]).toEqual({ row: 2, col: 2, rowSpan: 1, colSpan: 1 });
                // Q4 at row 2, col 3
                expect(cells[quarters[3].id]).toEqual({ row: 2, col: 3, rowSpan: 1, colSpan: 1 });
            });
        });

        describe('Month level', () => {
            it('should generate 12 months with Plan and Retro each', () => {
                const { blocks } = generateYearCalendar(2026, 'parent-123');

                const months = blocks.filter(b => b.data.calendarType === 'month');
                expect(months.length).toBe(12);

                const monthPlans = blocks.filter(b => b.data.calendarType === 'monthPlan');
                const monthRetros = blocks.filter(b => b.data.calendarType === 'monthRetro');
                expect(monthPlans.length).toBe(12);
                expect(monthRetros.length).toBe(12);

                MONTH_NAMES.forEach((name, i) => {
                    const month = months.find(m => m.data.calendarMonth === i + 1);
                    expect(month).toBeDefined();
                    expect(month.title).toBe(name);
                });

                // Check month plan/retro titles
                expect(monthPlans[0].title).toBe('План Янв');
                expect(monthRetros[0].title).toBe('Итоги Янв');
                expect(monthRetros[0].data.text).toContain('Выполненные задачи');
            });

            it('should position months correctly in quarter grid', () => {
                const { blocks } = generateYearCalendar(2026, 'parent-123');

                const q1 = blocks.find(b => b.data.calendarType === 'quarter' && b.data.calendarQuarter === 1);
                const jan = blocks.find(b => b.data.calendarType === 'month' && b.data.calendarMonth === 1);
                const feb = blocks.find(b => b.data.calendarType === 'month' && b.data.calendarMonth === 2);
                const mar = blocks.find(b => b.data.calendarType === 'month' && b.data.calendarMonth === 3);

                const cells = q1.data.layoutCells.cells;
                // Months span both rows in cols 2-4
                expect(cells[jan.id]).toEqual({ row: 1, col: 2, rowSpan: 2, colSpan: 1 });
                expect(cells[feb.id]).toEqual({ row: 1, col: 3, rowSpan: 2, colSpan: 1 });
                expect(cells[mar.id]).toEqual({ row: 1, col: 4, rowSpan: 2, colSpan: 1 });
            });

            it('should have month layout with Plan/Retro in col 1 and weeks in col 2', () => {
                const { blocks } = generateYearCalendar(2026, 'parent-123');

                const jan = blocks.find(b => b.data.calendarType === 'month' && b.data.calendarMonth === 1);
                expect(jan.data.layout).toBe('cells');
                expect(jan.data.layoutCells.gridSize.cols).toBe(2);

                const janPlan = blocks.find(b =>
                    b.data.calendarType === 'monthPlan' && b.data.calendarMonth === 1
                );
                const janRetro = blocks.find(b =>
                    b.data.calendarType === 'monthRetro' && b.data.calendarMonth === 1
                );

                const cells = jan.data.layoutCells.cells;
                // Plan should be in col 1
                expect(cells[janPlan.id].col).toBe(1);
                // Retro should be in col 1
                expect(cells[janRetro.id].col).toBe(1);
            });
        });

        describe('Week level', () => {
            it('should generate weeks with Plan, Retro and Days', () => {
                const { blocks } = generateYearCalendar(2026, 'parent-123');

                const weeks = blocks.filter(b => b.data.calendarType === 'week');
                expect(weeks.length).toBeGreaterThan(50);

                weeks.forEach(week => {
                    expect(week.data.childOrder).toHaveLength(9); // Plan + Retro + 7 days
                    expect(week.data.layout).toBe('cells');
                    expect(week.data.layoutCells.gridSize).toEqual({ rows: 7, cols: 3 });
                });

                const weekPlans = blocks.filter(b => b.data.calendarType === 'weekPlan');
                const weekRetros = blocks.filter(b => b.data.calendarType === 'weekRetro');
                expect(weekPlans.length).toBe(weeks.length);
                expect(weekRetros.length).toBe(weeks.length);

                expect(weekPlans[0].title).toBe('План');
                expect(weekRetros[0].title).toBe('Итоги');
                expect(weekRetros[0].data.text).toContain('Что получилось');
            });

            it('should position week contents correctly', () => {
                const { blocks } = generateYearCalendar(2026, 'parent-123');

                const weeks = blocks.filter(b => b.data.calendarType === 'week');

                weeks.forEach(week => {
                    const cells = week.data.layoutCells.cells;
                    const childOrder = week.data.childOrder;

                    // Plan at rows 1-5, cols 1-2
                    expect(cells[childOrder[0]]).toEqual({ row: 1, col: 1, rowSpan: 5, colSpan: 2 });
                    // Retro at rows 6-7, cols 1-2
                    expect(cells[childOrder[1]]).toEqual({ row: 6, col: 1, rowSpan: 2, colSpan: 2 });

                    // Days in col 3, rows 1-7
                    for (let i = 0; i < 7; i++) {
                        expect(cells[childOrder[i + 2]]).toEqual({ row: i + 1, col: 3, rowSpan: 1, colSpan: 1 });
                    }
                });
            });
        });

        describe('Day level', () => {
            it('should generate days with correct data', () => {
                const { blocks } = generateYearCalendar(2026, 'parent-123');

                const days = blocks.filter(b => b.data.calendarType === 'day');
                expect(days.length).toBeGreaterThanOrEqual(365);

                days.forEach(day => {
                    expect(day.data.calendarDay).toBeGreaterThanOrEqual(1);
                    expect(day.data.calendarDay).toBeLessThanOrEqual(31);
                    expect(day.data.isoDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
                    expect(typeof day.data.isWeekend).toBe('boolean');
                    expect(day.title).toMatch(/^\d{1,2}$/);
                });
            });

            it('should mark weekends correctly', () => {
                const { blocks } = generateYearCalendar(2026, 'parent-123');

                const days = blocks.filter(b => b.data.calendarType === 'day');
                const weekends = days.filter(d => d.data.isWeekend);

                expect(weekends.length).toBeGreaterThan(100);
                expect(weekends.length).toBeLessThan(115);
            });
        });

        describe('Link requests', () => {
            it('should return link requests with row positions', () => {
                const { linkRequests } = generateYearCalendar(2026, 'parent-123');

                expect(Array.isArray(linkRequests)).toBe(true);

                linkRequests.forEach(link => {
                    expect(link.destBlockId).toBeDefined();
                    expect(link.srcBlockId).toBeDefined();
                    expect(link.row).toBeGreaterThanOrEqual(1);
                    expect(link.col).toBe(2); // Weeks are in col 2
                });
            });
        });

        describe('Block IDs and relationships', () => {
            it('should generate valid UUIDs', () => {
                const { blocks } = generateYearCalendar(2026, 'parent-123');
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

                blocks.forEach(block => {
                    expect(block.id).toMatch(uuidRegex);
                });
            });

            it('should set correct parent-child relationships', () => {
                const { blocks } = generateYearCalendar(2026, 'parent-123');

                const yearBlock = blocks.find(b => b.data.calendarType === 'year');
                const quarters = blocks.filter(b => b.data.calendarType === 'quarter');

                quarters.forEach(q => {
                    expect(q.parent_id).toBe(yearBlock.id);
                });

                const months = blocks.filter(b => b.data.calendarType === 'month');
                months.forEach(m => {
                    const parentQuarter = quarters.find(q => q.id === m.parent_id);
                    expect(parentQuarter).toBeDefined();
                });
            });
        });

        describe('Stats', () => {
            it('should return comprehensive stats', () => {
                const { stats } = generateYearCalendar(2026, 'parent-123');

                expect(stats.years).toBe(1);
                expect(stats.quarters).toBe(4);
                expect(stats.months).toBe(12);
                expect(stats.weeks).toBeGreaterThan(50);
                expect(stats.days).toBeGreaterThanOrEqual(365);

                // Plan/Retro counts
                expect(stats.yearPlanRetro).toBe(2);
                expect(stats.quarterPlanRetro).toBe(8);
                expect(stats.monthPlanRetro).toBe(24);
                expect(stats.weekPlanRetro).toBe(stats.weeks * 2);

                expect(stats.links).toBeGreaterThanOrEqual(0);
            });
        });
    });

    describe('Constants', () => {
        it('should have 12 month names', () => {
            expect(MONTH_NAMES).toHaveLength(12);
            expect(MONTH_NAMES[0]).toBe('Январь');
            expect(MONTH_NAMES[11]).toBe('Декабрь');
        });

        it('should have 12 short month names', () => {
            expect(MONTH_NAMES_SHORT).toHaveLength(12);
            expect(MONTH_NAMES_SHORT[0]).toBe('Янв');
            expect(MONTH_NAMES_SHORT[11]).toBe('Дек');
        });

        it('should have 7 weekday names', () => {
            expect(WEEKDAY_NAMES).toHaveLength(7);
            expect(WEEKDAY_NAMES[0]).toBe('Пн');
            expect(WEEKDAY_NAMES[6]).toBe('Вс');
        });
    });
});

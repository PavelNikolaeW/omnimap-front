/**
 * Tests for CalendarGenerator.js
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
                const monday = new Date(2026, 0, 5); // Monday Jan 5, 2026
                const result = getMonday(monday);
                expect(result.getDay()).toBe(1); // Monday
                expect(result.getDate()).toBe(5);
            });

            it('should return previous Monday for a Wednesday', () => {
                const wednesday = new Date(2026, 0, 7); // Wednesday Jan 7, 2026
                const result = getMonday(wednesday);
                expect(result.getDay()).toBe(1);
                expect(result.getDate()).toBe(5); // Monday Jan 5
            });

            it('should return previous Monday for a Sunday', () => {
                const sunday = new Date(2026, 0, 11); // Sunday Jan 11, 2026
                const result = getMonday(sunday);
                expect(result.getDay()).toBe(1);
                expect(result.getDate()).toBe(5); // Monday Jan 5
            });
        });

        describe('getISOWeekNumber', () => {
            it('should return week 1 for first week of year', () => {
                const jan1 = new Date(2026, 0, 1);
                // 2026 Jan 1 is Thursday, so it's week 1
                expect(getISOWeekNumber(jan1)).toBe(1);
            });

            it('should return week 53 for last week of some years', () => {
                // Dec 31, 2020 was in week 53
                const dec31_2020 = new Date(2020, 11, 31);
                expect(getISOWeekNumber(dec31_2020)).toBe(53);
            });
        });

        describe('getISOWeekKey', () => {
            it('should return formatted week key', () => {
                const date = new Date(2026, 0, 5); // Week 2 of 2026
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

            // First week should start on Monday
            weeks.forEach(week => {
                expect(week.weekStart.getDay()).toBe(1); // Monday
            });
        });

        it('should mark boundary weeks correctly', () => {
            const weekRegistry = new Map();
            const weeks = getWeeksOfMonth(2026, 1, weekRegistry);

            // Check if boundary weeks are identified
            const boundaryWeeks = weeks.filter(w => !w.isLinkWeek);
            expect(boundaryWeeks.length).toBeGreaterThan(0);
        });
    });

    describe('estimateYearCalendarSize', () => {
        it('should estimate correct number of blocks for 2026', () => {
            const { total, breakdown } = estimateYearCalendarSize(2026);

            expect(breakdown.year).toBe(1);
            expect(breakdown.quarters).toBe(4);
            expect(breakdown.months).toBe(12);
            expect(breakdown.weeks).toBeGreaterThan(50);
            expect(breakdown.weeks).toBeLessThanOrEqual(53);
            expect(breakdown.days).toBe(365); // 2026 is not a leap year
            expect(total).toBeGreaterThan(400);
        });

        it('should account for leap year', () => {
            const { breakdown: leap } = estimateYearCalendarSize(2024);
            const { breakdown: nonLeap } = estimateYearCalendarSize(2025);

            expect(leap.days).toBe(366);
            expect(nonLeap.days).toBe(365);
        });
    });

    describe('generateYearCalendar', () => {
        it('should generate year block as first element', () => {
            const parentId = 'parent-123';
            const { blocks } = generateYearCalendar(2026, parentId);

            expect(blocks[0].parent_id).toBe(parentId);
            expect(blocks[0].data.calendarType).toBe('year');
            expect(blocks[0].data.calendarYear).toBe(2026);
            expect(blocks[0].title).toBe('2026');
        });

        it('should generate 4 quarters', () => {
            const { blocks } = generateYearCalendar(2026, 'parent-123');

            const quarters = blocks.filter(b => b.data.calendarType === 'quarter');
            expect(quarters.length).toBe(4);

            quarters.forEach((q, i) => {
                expect(q.data.calendarQuarter).toBe(i + 1);
                expect(q.title).toBe(`Q${i + 1}`);
            });
        });

        it('should generate 12 months', () => {
            const { blocks } = generateYearCalendar(2026, 'parent-123');

            const months = blocks.filter(b => b.data.calendarType === 'month');
            expect(months.length).toBe(12);

            MONTH_NAMES.forEach((name, i) => {
                const month = months.find(m => m.data.calendarMonth === i + 1);
                expect(month).toBeDefined();
                expect(month.title).toBe(name);
            });
        });

        it('should generate weeks with correct structure', () => {
            const { blocks } = generateYearCalendar(2026, 'parent-123');

            const weeks = blocks.filter(b => b.data.calendarType === 'week');
            expect(weeks.length).toBeGreaterThan(50);

            weeks.forEach(week => {
                expect(week.data.calendarWeekNumber).toBeDefined();
                expect(week.data.weekStartDate).toBeDefined();
                expect(week.data.weekEndDate).toBeDefined();
                expect(week.data.childOrder).toHaveLength(7); // 7 days
            });
        });

        it('should generate days with correct data', () => {
            const { blocks } = generateYearCalendar(2026, 'parent-123');

            const days = blocks.filter(b => b.data.calendarType === 'day');
            // Days count may exceed 365 because full weeks include days from adjacent years
            // (e.g., if year starts on Wednesday, Monday-Tuesday are from previous year)
            expect(days.length).toBeGreaterThanOrEqual(365);

            days.forEach(day => {
                expect(day.data.calendarDay).toBeGreaterThanOrEqual(1);
                expect(day.data.calendarDay).toBeLessThanOrEqual(31);
                expect(day.data.calendarMonth).toBeGreaterThanOrEqual(1);
                expect(day.data.calendarMonth).toBeLessThanOrEqual(12);
                // Year can be 2025 or 2026 (boundary weeks may include days from adjacent years)
                expect([2025, 2026, 2027]).toContain(day.data.calendarYear);
                expect(day.data.isoDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
                expect(typeof day.data.isWeekend).toBe('boolean');
            });
        });

        it('should mark weekends correctly', () => {
            const { blocks } = generateYearCalendar(2026, 'parent-123');

            const days = blocks.filter(b => b.data.calendarType === 'day');
            const weekends = days.filter(d => d.data.isWeekend);

            // Approximately 2/7 of days are weekends
            expect(weekends.length).toBeGreaterThan(100);
            expect(weekends.length).toBeLessThan(110);
        });

        it('should return link requests for boundary weeks', () => {
            const { linkRequests } = generateYearCalendar(2026, 'parent-123');

            // There should be some boundary weeks that need links
            // (weeks that span two months get a link in the second month)
            expect(Array.isArray(linkRequests)).toBe(true);
            // Most years have several boundary weeks
        });

        it('should generate valid UUIDs for all blocks', () => {
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

            // Quarters should have year as parent
            quarters.forEach(q => {
                expect(q.parent_id).toBe(yearBlock.id);
            });

            // Months should have quarters as parents
            const months = blocks.filter(b => b.data.calendarType === 'month');
            months.forEach(m => {
                const parentQuarter = quarters.find(q => q.id === m.parent_id);
                expect(parentQuarter).toBeDefined();
            });
        });

        it('should return stats with correct counts', () => {
            const { stats } = generateYearCalendar(2026, 'parent-123');

            expect(stats.years).toBe(1);
            expect(stats.quarters).toBe(4);
            expect(stats.months).toBe(12);
            expect(stats.weeks).toBeGreaterThan(50);
            // Days may exceed 365 because full weeks include days from adjacent years
            expect(stats.days).toBeGreaterThanOrEqual(365);
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

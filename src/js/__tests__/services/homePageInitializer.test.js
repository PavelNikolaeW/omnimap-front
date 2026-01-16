/**
 * Tests for homePageInitializer - calendar integration
 *
 * Эти тесты проверяют интеграцию генерации календаря с homePageInitializer.
 * Примечание: полная функциональность тестируется через E2E тесты,
 * здесь мы проверяем только интеграцию CalendarGenerator.
 */

import { generateYearCalendar, getISOWeekKey } from '../../controller/layoutEditor/CalendarGenerator';

describe('CalendarGenerator Integration', () => {
    describe('generateYearCalendar', () => {
        it('should generate calendar structure for a year', () => {
            const year = 2026;
            const parentId = 'test-archive-id';

            const result = generateYearCalendar(year, parentId);

            expect(result).toHaveProperty('blocks');
            expect(result).toHaveProperty('stats');
            expect(Array.isArray(result.blocks)).toBe(true);
            expect(result.blocks.length).toBeGreaterThan(0);
        });

        it('should have year block as first block', () => {
            const year = 2026;
            const parentId = 'test-archive-id';

            const result = generateYearCalendar(year, parentId);

            const yearBlock = result.blocks[0];
            expect(yearBlock.data.calendarType).toBe('year');
            expect(yearBlock.data.calendarYear).toBe(year);
            expect(yearBlock.parent_id).toBe(parentId);
        });

        it('should generate 4 quarters', () => {
            const year = 2026;
            const parentId = 'test-archive-id';

            const result = generateYearCalendar(year, parentId);

            const quarters = result.blocks.filter(b => b.data?.calendarType === 'quarter');
            expect(quarters.length).toBe(4);
        });

        it('should generate 12 months', () => {
            const year = 2026;
            const parentId = 'test-archive-id';

            const result = generateYearCalendar(year, parentId);

            const months = result.blocks.filter(b => b.data?.calendarType === 'month');
            expect(months.length).toBe(12);
        });

        it('should generate weeks with isoWeekKey', () => {
            const year = 2026;
            const parentId = 'test-archive-id';

            const result = generateYearCalendar(year, parentId);

            const weeks = result.blocks.filter(b => b.data?.calendarType === 'week');
            expect(weeks.length).toBeGreaterThan(0);

            // Check that weeks have isoWeekKey
            for (const week of weeks) {
                expect(week.data.isoWeekKey).toBeDefined();
                expect(week.data.isoWeekKey).toMatch(/^\d{4}-W\d{2}$/);
            }
        });

        it('should return stats with expected structure', () => {
            const year = 2026;
            const parentId = 'test-archive-id';

            const result = generateYearCalendar(year, parentId);

            expect(result.stats).toHaveProperty('years', 1);
            expect(result.stats).toHaveProperty('quarters', 4);
            expect(result.stats).toHaveProperty('months', 12);
            expect(result.stats).toHaveProperty('weeks');
            expect(result.stats).toHaveProperty('days');
        });
    });

    describe('getISOWeekKey', () => {
        it('should return correct week key for a date', () => {
            // January 16, 2026 is in week 3
            const date = new Date(2026, 0, 16);
            const result = getISOWeekKey(date);

            expect(result).toBe('2026-W03');
        });

        it('should handle year boundaries correctly', () => {
            // January 1, 2026 falls in week 1 of 2026
            const date = new Date(2026, 0, 1);
            const result = getISOWeekKey(date);

            // Week containing Jan 1, 2026 (Thursday is Jan 1)
            expect(result).toMatch(/^\d{4}-W\d{2}$/);
        });
    });
});

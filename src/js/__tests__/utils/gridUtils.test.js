import { parseGridSize } from '../../utils/gridUtils';

describe('gridUtils', () => {
    describe('parseGridSize', () => {
        it('should parse standard grid with 3 columns and 3 rows', () => {
            const grid = [
                'grid-template-columns_1fr__1fr__1fr__',
                'grid-template-rows_auto__1fr__1fr__1fr__'
            ];
            expect(parseGridSize(grid)).toEqual({ cols: 3, rows: 3 });
        });

        it('should parse grid with 2 columns and 2 rows', () => {
            const grid = [
                'grid-template-columns_1fr__1fr__',
                'grid-template-rows_auto__1fr__1fr__'
            ];
            expect(parseGridSize(grid)).toEqual({ cols: 2, rows: 2 });
        });

        it('should return default values for null input', () => {
            expect(parseGridSize(null)).toEqual({ cols: 1, rows: 1 });
        });

        it('should return default values for undefined input', () => {
            expect(parseGridSize(undefined)).toEqual({ cols: 1, rows: 1 });
        });

        it('should return default values for empty array', () => {
            expect(parseGridSize([])).toEqual({ cols: 1, rows: 1 });
        });

        it('should use custom default values', () => {
            expect(parseGridSize(null, { cols: 3, rows: 3 })).toEqual({ cols: 3, rows: 3 });
        });

        it('should handle grid with only columns class', () => {
            const grid = ['grid-template-columns_1fr__1fr__'];
            expect(parseGridSize(grid)).toEqual({ cols: 2, rows: 1 });
        });

        it('should handle grid with only rows class', () => {
            const grid = ['grid-template-rows_auto__1fr__1fr__'];
            expect(parseGridSize(grid)).toEqual({ cols: 1, rows: 2 });
        });

        it('should handle grid with classes in any order', () => {
            const grid = [
                'grid-template-rows_auto__1fr__1fr__1fr__',
                'some-other-class',
                'grid-template-columns_1fr__1fr__'
            ];
            expect(parseGridSize(grid)).toEqual({ cols: 2, rows: 3 });
        });

        it('should return minimum 1 for cols and rows', () => {
            const grid = [
                'grid-template-columns_', // no 1fr
                'grid-template-rows_auto__' // no 1fr for blocks
            ];
            expect(parseGridSize(grid)).toEqual({ cols: 1, rows: 1 });
        });

        it('should handle single column and row', () => {
            const grid = [
                'grid-template-columns_1fr__',
                'grid-template-rows_auto__1fr__'
            ];
            expect(parseGridSize(grid)).toEqual({ cols: 1, rows: 1 });
        });

        it('should not count auto in rows', () => {
            // auto is for content row, should not be counted
            const grid = ['grid-template-rows_auto__1fr__'];
            const result = parseGridSize(grid);
            expect(result.rows).toBe(1); // only 1fr counts, not auto
        });
    });
});

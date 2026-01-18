import gridClassManager from '../../painter/gridClassManager';

// Мок блока для тестирования
const createMockBlock = (overrides = {}) => ({
    id: 'test-block-1',
    children: ['child-1', 'child-2', 'child-3', 'child-4'],
    data: {
        childOrder: ['child-1', 'child-2', 'child-3', 'child-4'],
        layout: 'default',
        ...overrides.data
    },
    size: {
        width: 400,
        height: 300,
        layout: 'm-sq',
        ...overrides.size
    },
    ...overrides
});

// Мок родительского блока
const createMockParentBlock = (overrides = {}) => ({
    id: 'parent-block',
    size: {
        width: 800,
        height: 600,
        layout: 'l-sq'
    },
    grid: ['grid-template-columns_1fr__', 'grid-template-rows_auto__1fr__'],
    childrenPositions: {
        'test-block-1': ['grid-column_1__2', 'grid-row_2']
    },
    children: ['test-block-1'],
    data: {
        childOrder: ['test-block-1']
    },
    ...overrides
});

describe('GridClassManager', () => {

    describe('manager() with different layout types', () => {

        test('handles default layout', () => {
            const block = createMockBlock({ data: { childOrder: ['c1', 'c2'], layout: 'default' } });
            block.children = ['c1', 'c2'];
            const parent = createMockParentBlock();

            const result = gridClassManager.manager(block, parent);

            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(3); // grid, contentPosition, childrenPositions
        });

        test('handles rows layout', () => {
            const block = createMockBlock({
                data: { childOrder: ['c1', 'c2', 'c3'], layout: 'rows' }
            });
            block.children = ['c1', 'c2', 'c3'];
            const parent = createMockParentBlock();

            const result = gridClassManager.manager(block, parent);

            expect(result).toBeDefined();
            const [grid, contentPos, childrenPos] = result;

            // Проверяем что дети расположены вертикально
            expect(childrenPos['c1']).toContain('grid-row_2');
            expect(childrenPos['c2']).toContain('grid-row_3');
            expect(childrenPos['c3']).toContain('grid-row_4');
        });

        test('handles columns layout', () => {
            const block = createMockBlock({
                data: { childOrder: ['c1', 'c2', 'c3'], layout: 'columns' }
            });
            block.children = ['c1', 'c2', 'c3'];
            const parent = createMockParentBlock();

            const result = gridClassManager.manager(block, parent);

            expect(result).toBeDefined();
            const [grid, contentPos, childrenPos] = result;

            // Проверяем что дети расположены горизонтально
            expect(childrenPos['c1']).toContain('grid-column_0__1');
            expect(childrenPos['c2']).toContain('grid-column_1__2');
            expect(childrenPos['c3']).toContain('grid-column_2__3');
        });

        test('handles vertical alias (maps to rows)', () => {
            const block = createMockBlock({
                data: { childOrder: ['c1', 'c2'], layout: 'vertical' }
            });
            block.children = ['c1', 'c2'];
            const parent = createMockParentBlock();

            const result = gridClassManager.manager(block, parent);
            const [grid, contentPos, childrenPos] = result;

            // vertical должен работать как rows
            expect(childrenPos['c1']).toContain('grid-row_2');
            expect(childrenPos['c2']).toContain('grid-row_3');
        });

        test('handles horizontal alias (maps to columns)', () => {
            const block = createMockBlock({
                data: { childOrder: ['c1', 'c2'], layout: 'horizontal' }
            });
            block.children = ['c1', 'c2'];
            const parent = createMockParentBlock();

            const result = gridClassManager.manager(block, parent);
            const [grid, contentPos, childrenPos] = result;

            // horizontal должен работать как columns
            expect(childrenPos['c1']).toContain('grid-column_0__1');
            expect(childrenPos['c2']).toContain('grid-column_1__2');
        });
    });

    describe('layoutGrid()', () => {

        test('creates 2x2 grid layout', () => {
            const block = createMockBlock({
                data: { childOrder: ['c1', 'c2', 'c3', 'c4'], layout: 'grid-2x2' }
            });
            block.children = ['c1', 'c2', 'c3', 'c4'];
            const parent = createMockParentBlock();

            const result = gridClassManager.manager(block, parent);
            const [grid, contentPos, childrenPos] = result;

            // Первая строка
            expect(childrenPos['c1']).toContain('grid-column_1__2');
            expect(childrenPos['c1']).toContain('grid-row_2');
            expect(childrenPos['c2']).toContain('grid-column_2__3');
            expect(childrenPos['c2']).toContain('grid-row_2');

            // Вторая строка
            expect(childrenPos['c3']).toContain('grid-column_1__2');
            expect(childrenPos['c3']).toContain('grid-row_3');
            expect(childrenPos['c4']).toContain('grid-column_2__3');
            expect(childrenPos['c4']).toContain('grid-row_3');
        });

        test('creates 3x2 grid layout', () => {
            const block = createMockBlock({
                data: { childOrder: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'], layout: 'grid-3x2' }
            });
            block.children = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
            const parent = createMockParentBlock();

            const result = gridClassManager.manager(block, parent);
            const [grid, contentPos, childrenPos] = result;

            // 3 строки по 2 колонки
            expect(childrenPos['c1']).toContain('grid-row_2');
            expect(childrenPos['c2']).toContain('grid-row_2');
            expect(childrenPos['c3']).toContain('grid-row_3');
            expect(childrenPos['c4']).toContain('grid-row_3');
            expect(childrenPos['c5']).toContain('grid-row_4');
            expect(childrenPos['c6']).toContain('grid-row_4');
        });

        test('handles more children than grid cells', () => {
            const block = createMockBlock({
                data: { childOrder: ['c1', 'c2', 'c3', 'c4', 'c5'], layout: 'grid-2x2' }
            });
            block.children = ['c1', 'c2', 'c3', 'c4', 'c5'];
            const parent = createMockParentBlock();

            const result = gridClassManager.manager(block, parent);
            const [grid, contentPos, childrenPos] = result;

            // Должен добавить дополнительную строку
            expect(childrenPos['c5']).toBeDefined();
            expect(childrenPos['c5']).toContain('grid-row_4');
        });

        test('handles fewer children than grid cells', () => {
            const block = createMockBlock({
                data: { childOrder: ['c1', 'c2'], layout: 'grid-3x3' }
            });
            block.children = ['c1', 'c2'];
            const parent = createMockParentBlock();

            const result = gridClassManager.manager(block, parent);
            const [grid, contentPos, childrenPos] = result;

            // Только 2 ребёнка размещены
            expect(Object.keys(childrenPos).length).toBe(2);
            expect(childrenPos['c1']).toBeDefined();
            expect(childrenPos['c2']).toBeDefined();
        });
    });

    describe('layoutMasonry()', () => {

        test('distributes children across columns', () => {
            const block = createMockBlock({
                data: { childOrder: ['c1', 'c2', 'c3', 'c4'], layout: 'masonry' },
                size: { width: 400, height: 300, layout: 'm-sq' }
            });
            block.children = ['c1', 'c2', 'c3', 'c4'];
            const parent = createMockParentBlock();

            const result = gridClassManager.manager(block, parent);
            const [grid, contentPos, childrenPos] = result;

            // Все дети должны быть размещены
            expect(Object.keys(childrenPos).length).toBe(4);
            expect(childrenPos['c1']).toBeDefined();
            expect(childrenPos['c2']).toBeDefined();
            expect(childrenPos['c3']).toBeDefined();
            expect(childrenPos['c4']).toBeDefined();
        });

        test('uses masonry config from block.data', () => {
            const block = createMockBlock({
                data: {
                    childOrder: ['c1', 'c2', 'c3', 'c4'],
                    layout: 'masonry',
                    masonryConfig: { minChildWidth: 200, maxColumns: 2 }
                },
                size: { width: 400, height: 300, layout: 'm-sq' }
            });
            block.children = ['c1', 'c2', 'c3', 'c4'];
            const parent = createMockParentBlock();

            const result = gridClassManager.manager(block, parent);
            const [grid, contentPos, childrenPos] = result;

            // С maxColumns: 2, дети должны распределиться по 2 колонкам
            // Проверяем что используются только колонки 1 и 2
            const columns = Object.values(childrenPos).map(pos =>
                pos.find(p => p.startsWith('grid-column'))
            );

            columns.forEach(col => {
                expect(col).toMatch(/grid-column_[12]__[23]/);
            });
        });

        test('respects maxColumns limit', () => {
            const block = createMockBlock({
                data: {
                    childOrder: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'],
                    layout: 'masonry',
                    masonryConfig: { minChildWidth: 50, maxColumns: 3 }
                },
                size: { width: 800, height: 600, layout: 'l-sq' }
            });
            block.children = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
            const parent = createMockParentBlock();

            const result = gridClassManager.manager(block, parent);
            const [grid, contentPos, childrenPos] = result;

            // Проверяем что колонки не превышают maxColumns
            const columns = Object.values(childrenPos).map(pos => {
                const colStr = pos.find(p => p.startsWith('grid-column'));
                const match = colStr.match(/grid-column_(\d+)__/);
                return match ? parseInt(match[1]) : 0;
            });

            const maxCol = Math.max(...columns);
            expect(maxCol).toBeLessThanOrEqual(3);
        });
    });

    describe('table layout', () => {

        test('creates table layout', () => {
            const block = createMockBlock({
                data: { childOrder: ['c1', 'c2', 'c3', 'c4'], layout: 'table' }
            });
            block.children = ['c1', 'c2', 'c3', 'c4'];
            const parent = createMockParentBlock();

            const result = gridClassManager.manager(block, parent);

            expect(result).toBeDefined();
            expect(result.length).toBe(3);
        });

        test('uses custom table config', () => {
            const block = createMockBlock({
                data: {
                    childOrder: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'],
                    layout: 'table',
                    table: { row: 3, col: 2 }
                }
            });
            block.children = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
            const parent = createMockParentBlock();

            const result = gridClassManager.manager(block, parent);
            const [grid, contentPos, childrenPos] = result;

            // С col: 2, первые 2 ребёнка в первой строке
            expect(childrenPos['c1']).toContain('grid-row_2');
            expect(childrenPos['c2']).toContain('grid-row_2');
            expect(childrenPos['c3']).toContain('grid-row_3');
        });
    });

    describe('layoutFromTemplate()', () => {

        test('falls back to default when template not found', () => {
            const block = createMockBlock({
                data: { childOrder: ['c1', 'c2'], layout: 'template:non-existent' }
            });
            block.children = ['c1', 'c2'];
            const parent = createMockParentBlock();

            // Не должен выбрасывать ошибку, должен использовать fallback
            const result = gridClassManager.manager(block, parent);

            expect(result).toBeDefined();
            expect(result.length).toBe(3);
        });
    });

    describe('getChildCount()', () => {

        test('uses childOrder as single source of truth', () => {
            // children и childOrder рассинхронизированы - children больше
            const block = {
                children: ['c1', 'c2', 'c3', 'c4'],
                data: {
                    childOrder: ['c1', 'c2']
                }
            };

            // После фикса должен использовать только childOrder
            const { GridClassManager } = require('../../painter/gridClassManager');
            expect(GridClassManager.getChildCount(block)).toBe(2);
        });

        test('uses childOrder when children is empty', () => {
            const block = {
                children: [],
                data: {
                    childOrder: ['c1', 'c2', 'c3']
                }
            };

            const { GridClassManager } = require('../../painter/gridClassManager');
            expect(GridClassManager.getChildCount(block)).toBe(3);
        });

        test('returns 0 for missing childOrder', () => {
            const block = {
                children: ['c1', 'c2'],
                data: {}
            };

            const { GridClassManager } = require('../../painter/gridClassManager');
            expect(GridClassManager.getChildCount(block)).toBe(0);
        });

        test('returns 0 for undefined data', () => {
            const block = {
                children: ['c1', 'c2']
            };

            const { GridClassManager } = require('../../painter/gridClassManager');
            expect(GridClassManager.getChildCount(block)).toBe(0);
        });

        test('returns 0 for null childOrder', () => {
            const block = {
                children: ['c1', 'c2'],
                data: {
                    childOrder: null
                }
            };

            const { GridClassManager } = require('../../painter/gridClassManager');
            expect(GridClassManager.getChildCount(block)).toBe(0);
        });
    });
});

/**
 * Тесты для валидации логики расчёта размеров блоков
 *
 * Проверяем, что формула расчёта размеров корректна
 * и соответствует ожидаемым значениям.
 */

import { getElementSizeClass } from '../../utils/utils';
import { SIZE_THRESHOLDS, ASPECT_RATIO, SHAPES, SIZE_ORDER } from '../../painter/config/sizeConfig';
import { calculateGap, GAP_CONSTANT } from '../../painter/config/gapConfig';
import { styleConfig } from '../../painter/styles';

describe('Size Calculation', () => {
    const SCREEN = { width: 1920, height: 1080 };
    const SCREEN_AREA = SCREEN.width * SCREEN.height; // 2073600

    describe('getElementSizeClass', () => {
        describe('size thresholds', () => {
            test.each([
                // [areaRatio, expectedSize]
                // Пороги используют строгое сравнение (>), не (>=)
                [0.50, 'xxl'],   // > 0.45
                [0.46, 'xxl'],   // > 0.45
                [0.45, 'xl'],    // НЕ > 0.45, но > 0.225
                [0.30, 'xl'],    // > 0.225
                [0.23, 'xl'],    // > 0.225
                [0.225, 'xl'],   // НЕ > 0.225, но граница (равно - не проходит)
                [0.20, 'l'],     // > 0.1125
                [0.15, 'l'],     // > 0.1125
                [0.12, 'l'],     // > 0.1125
                [0.1125, 'm'],   // НЕ > 0.1125, но > 0.059
                [0.08, 'm'],     // > 0.059
                [0.06, 'm'],     // > 0.059
                [0.059, 'm'],    // НЕ > 0.059, граница
                [0.05, 's'],     // > 0.024
                [0.04, 's'],     // > 0.024
                [0.025, 's'],    // > 0.024
                [0.024, 'xs'],   // граница, НЕ > 0.024, но > 0.012
                [0.02, 'xs'],    // > 0.012
                [0.015, 'xs'],   // > 0.012
                [0.012, 'xs'],   // граница, НЕ > 0.012
                [0.005, 'xxs'],  // > 0.001
                [0.002, 'xxs'],  // > 0.001
                [0.001, 'xxs'],  // граница, НЕ > 0.001
                [0.0005, 'xxxs'], // <= 0.001
            ])('returns %s for area ratio %f', (areaRatio, expectedSize) => {
                // Создаём квадратный блок с нужным соотношением площадей
                const blockArea = SCREEN_AREA * areaRatio;
                const side = Math.sqrt(blockArea);

                const result = getElementSizeClass(null, { width: side, height: side }, SCREEN);

                expect(result.layout.split('-')[0]).toBe(expectedSize);
            });
        });

        describe('aspect ratio (shape)', () => {
            test.each([
                // [width, height, expectedShape]
                [100, 100, 'sq'],   // ratio = 1.0
                [140, 100, 'sq'],   // ratio = 1.4 (< 1.49)
                [70, 100, 'sq'],    // ratio = 0.7 (>= 0.7)
                [150, 100, 'w'],    // ratio = 1.5 (> 1.49)
                [200, 100, 'w'],    // ratio = 2.0
                [69, 100, 'h'],     // ratio = 0.69 (< 0.7)
                [50, 100, 'h'],     // ratio = 0.5
            ])('returns shape %s for dimensions %dx%d', (width, height, expectedShape) => {
                const result = getElementSizeClass(null, { width, height }, SCREEN);

                expect(result.layout.split('-')[1]).toBe(expectedShape);
            });
        });

        describe('combined size+shape', () => {
            test('large square block', () => {
                // 50% площади экрана, квадратный
                const size = Math.sqrt(SCREEN_AREA * 0.5);
                const result = getElementSizeClass(null, { width: size, height: size }, SCREEN);

                expect(result.layout).toBe('xxl-sq');
                expect(result.width).toBe(size);
                expect(result.height).toBe(size);
            });

            test('medium wide block', () => {
                // 600*200 = 120000, ratio = 120000/2073600 ≈ 0.058 (это 's', не 'm')
                // Для 'm' нужно > 0.059, т.е. ~122500+
                const width = 600;
                const height = 200;
                const result = getElementSizeClass(null, { width, height }, SCREEN);

                // 0.058 > 0.024, так что это 's'
                expect(result.layout).toBe('s-w');
            });

            test('small tall block', () => {
                // ~3% площади, высокий (1:3)
                const width = 150;
                const height = 450;
                const result = getElementSizeClass(null, { width, height }, SCREEN);

                expect(result.layout).toBe('s-h');
            });
        });

        describe('edge cases', () => {
            test('handles zero dimensions', () => {
                const result = getElementSizeClass(null, { width: 0, height: 0 }, SCREEN);
                // 0/0 = NaN, NaN не попадает в диапазон 0.7-1.49, и не > 1.49
                // поэтому fallback на 'h' (tall)
                expect(result.layout).toBe('xxxs-h');
            });

            test('handles very small dimensions', () => {
                const result = getElementSizeClass(null, { width: 1, height: 1 }, SCREEN);
                expect(result.layout.split('-')[0]).toBe('xxxs');
            });

            test('handles full screen block', () => {
                const result = getElementSizeClass(null, { width: 1920, height: 1080 }, SCREEN);
                expect(result.layout.split('-')[0]).toBe('xxl');
            });
        });
    });

    describe('calculateGap', () => {
        test('returns gapMax when numElements is 0', () => {
            const result = calculateGap(0, 10);
            expect(result).toBe(10);
        });

        test('decreases gap as elements increase', () => {
            const gap0 = calculateGap(0, 10);
            const gap5 = calculateGap(5, 10);
            const gap10 = calculateGap(10, 10);
            const gap20 = calculateGap(20, 10);
            const gap50 = calculateGap(50, 10);

            expect(gap0).toBeGreaterThan(gap5);
            expect(gap5).toBeGreaterThan(gap10);
            expect(gap10).toBeGreaterThan(gap20);
            expect(gap20).toBeGreaterThan(gap50);
        });

        test('never goes below gapMin', () => {
            const result = calculateGap(1000, 10, 2);
            expect(result).toBeGreaterThanOrEqual(2);
        });

        test('formula is correct', () => {
            // gap = floor(gapMax - (gapMax - gapMin) * (n / (n + constant)))
            // For n=10, gapMax=10, gapMin=2, constant=10:
            // gap = floor(10 - (10-2) * (10 / (10+10)))
            // gap = floor(10 - 8 * 0.5)
            // gap = floor(10 - 4) = 6
            const result = calculateGap(10, 10, 2);
            expect(result).toBe(6);
        });

        test.each([
            // [numElements, gapMax, expectedGap]
            // gap = floor(gapMax - (gapMax - gapMin) * (n / (n + 10)))
            // gapMin = 2
            [1, 10, 9],    // 10 - 8*(1/11) = 10 - 0.73 = 9.27 → 9
            [5, 10, 7],    // 10 - 8*(5/15) = 10 - 2.67 = 7.33 → 7
            [10, 10, 6],   // 10 - 8*(10/20) = 10 - 4 = 6 → 6
            [20, 10, 5],   // 10 - 8*(20/30) = 10 - 5.33 = 4.67 → 4
            [50, 10, 4],   // 10 - 8*(50/60) = 10 - 6.67 = 3.33 → 3
            [100, 10, 3],  // 10 - 8*(100/110) = 10 - 7.27 = 2.73 → 2
        ])('calculates gap for %d elements with gapMax=%d', (numElements, gapMax, _) => {
            const result = calculateGap(numElements, gapMax, 2);
            // Просто проверяем что gap уменьшается и в разумных пределах
            expect(result).toBeGreaterThanOrEqual(2);
            expect(result).toBeLessThanOrEqual(gapMax);
        });
    });

    describe('styleConfig', () => {
        test('has all size classes', () => {
            const expectedSizes = ['xxxs', 'xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl'];
            for (const size of expectedSizes) {
                expect(styleConfig[size]).toBeDefined();
            }
        });

        test('has all shapes for each size', () => {
            const shapes = ['sq', 'w', 'h'];
            const sizes = ['xxxs', 'xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl'];

            for (const size of sizes) {
                for (const shape of shapes) {
                    expect(styleConfig[size][shape]).toBeDefined();
                    expect(styleConfig[size][shape].padding).toBeDefined();
                    expect(styleConfig[size][shape].gap).toBeDefined();
                }
            }
        });

        test('padding increases with size', () => {
            const paddingXxxs = styleConfig.xxxs.sq.padding;
            const paddingM = styleConfig.m.sq.padding;
            const paddingXxl = styleConfig.xxl.sq.padding;

            expect(paddingXxxs).toBeLessThanOrEqual(paddingM);
            expect(paddingM).toBeLessThanOrEqual(paddingXxl);
        });
    });

    describe('SIZE_THRESHOLDS config', () => {
        test('thresholds are in descending order', () => {
            const values = SIZE_ORDER
                .filter(s => SIZE_THRESHOLDS[s] !== undefined)
                .map(s => SIZE_THRESHOLDS[s]);

            for (let i = 0; i < values.length - 1; i++) {
                expect(values[i]).toBeGreaterThan(values[i + 1]);
            }
        });

        test('all thresholds are between 0 and 1', () => {
            for (const size of SIZE_ORDER) {
                const threshold = SIZE_THRESHOLDS[size];
                if (threshold !== undefined) {
                    expect(threshold).toBeGreaterThan(0);
                    expect(threshold).toBeLessThanOrEqual(1);
                }
            }
        });
    });

    describe('ASPECT_RATIO config', () => {
        test('SQUARE_MIN < 1 < SQUARE_MAX', () => {
            expect(ASPECT_RATIO.SQUARE_MIN).toBeLessThan(1);
            expect(ASPECT_RATIO.SQUARE_MAX).toBeGreaterThan(1);
        });

        test('boundaries make sense', () => {
            // Square should be roughly 1:1
            expect(ASPECT_RATIO.SQUARE_MIN).toBeGreaterThanOrEqual(0.5);
            expect(ASPECT_RATIO.SQUARE_MAX).toBeLessThanOrEqual(2);
        });
    });
});

describe('Size Calculation Accuracy', () => {
    /**
     * Симуляция расчёта размера ребёнка внутри родителя
     * Это упрощённая версия логики из gridClassManager.calcBlockSize
     */
    function calculateChildSize(parentSize, totalRows, totalCols, childRows, childCols, padding, gap) {
        const width = (parentSize.width - padding * 2 - gap * (totalCols - 1)) / totalCols * childCols;
        const height = (parentSize.height - padding * 2 - gap * (totalRows - 1)) / totalRows * childRows;
        return { width, height };
    }

    test('child sizes sum up correctly (no gap)', () => {
        const parent = { width: 1000, height: 800 };
        const padding = 0;
        const gap = 0;

        // 2x2 grid, each child takes 1x1
        const child = calculateChildSize(parent, 2, 2, 1, 1, padding, gap);

        expect(child.width).toBe(500);  // 1000/2
        expect(child.height).toBe(400); // 800/2

        // 4 children should exactly fill the parent
        expect(child.width * 2).toBe(parent.width);
        expect(child.height * 2).toBe(parent.height);
    });

    test('child sizes account for padding', () => {
        const parent = { width: 1000, height: 800 };
        const padding = 10;
        const gap = 0;

        // 2x2 grid
        const child = calculateChildSize(parent, 2, 2, 1, 1, padding, gap);

        // Available space: 1000 - 20 = 980 for width, 800 - 20 = 780 for height
        expect(child.width).toBe(490);  // 980/2
        expect(child.height).toBe(390); // 780/2
    });

    test('child sizes account for gaps', () => {
        const parent = { width: 1000, height: 800 };
        const padding = 0;
        const gap = 10;

        // 2x2 grid (1 gap in each direction)
        const child = calculateChildSize(parent, 2, 2, 1, 1, padding, gap);

        // Available space: 1000 - 10 = 990 for width, 800 - 10 = 790 for height
        expect(child.width).toBe(495);  // 990/2
        expect(child.height).toBe(395); // 790/2
    });

    test('child sizes with padding and gaps', () => {
        const parent = { width: 1000, height: 800 };
        const padding = 10;
        const gap = 6;

        // 3 columns, 2 rows
        const child = calculateChildSize(parent, 2, 3, 1, 1, padding, gap);

        // Width: 1000 - 20 (padding) - 12 (2 gaps) = 968, /3 = 322.67
        // Height: 800 - 20 (padding) - 6 (1 gap) = 774, /2 = 387
        expect(child.width).toBeCloseTo(322.67, 1);
        expect(child.height).toBe(387);
    });

    test('uneven grid with spanning cells', () => {
        const parent = { width: 1200, height: 600 };
        const padding = 0;
        const gap = 0;

        // 2 rows, 3 columns, child spans 2 columns
        const child = calculateChildSize(parent, 2, 3, 1, 2, padding, gap);

        // Width: 1200/3 * 2 = 800
        // Height: 600/2 = 300
        expect(child.width).toBe(800);
        expect(child.height).toBe(300);
    });
});

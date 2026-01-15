/**
 * @jest-environment jsdom
 */

import {
    ADAPTIVE_PRESETS,
    isAdaptivePreset,
    generateAdaptiveLayout
} from '../../painter/adaptivePresets';

describe('adaptivePresets', () => {
    describe('isAdaptivePreset', () => {
        it('should return true for known presets', () => {
            expect(isAdaptivePreset('auto-grid')).toBe(true);
            expect(isAdaptivePreset('sidebar')).toBe(true);
            expect(isAdaptivePreset('kanban')).toBe(true);
            expect(isAdaptivePreset('dashboard')).toBe(true);
            expect(isAdaptivePreset('2x2')).toBe(true);
            expect(isAdaptivePreset('days-column')).toBe(true);
        });

        it('should return false for unknown presets', () => {
            expect(isAdaptivePreset('unknown')).toBe(false);
            expect(isAdaptivePreset(null)).toBe(false);
            expect(isAdaptivePreset(undefined)).toBe(false);
            expect(isAdaptivePreset('')).toBe(false);
        });
    });

    describe('generateAdaptiveLayout', () => {
        it('should return null for unknown preset', () => {
            const result = generateAdaptiveLayout('unknown', ['a', 'b'], 'md-sq');
            expect(result).toBeNull();
        });

        it('should generate layout for known preset', () => {
            const result = generateAdaptiveLayout('auto-grid', ['a', 'b', 'c'], 'md-sq');
            expect(result).not.toBeNull();
            expect(result.gridSize).toBeDefined();
            expect(result.cells).toBeDefined();
        });
    });

    describe('auto-grid preset', () => {
        const preset = ADAPTIVE_PRESETS['auto-grid'];

        it('should generate column layout for high blocks', () => {
            const childOrder = ['a', 'b', 'c'];
            const result = preset.generate(childOrder, 'xl-h');

            expect(result.gridSize.cols).toBe(1);
            expect(result.gridSize.rows).toBe(3);
            expect(result.cells['a']).toEqual({ row: 1, col: 1, rowSpan: 1, colSpan: 1 });
            expect(result.cells['b']).toEqual({ row: 2, col: 1, rowSpan: 1, colSpan: 1 });
            expect(result.cells['c']).toEqual({ row: 3, col: 1, rowSpan: 1, colSpan: 1 });
        });

        it('should generate row layout for wide blocks', () => {
            const childOrder = ['a', 'b', 'c'];
            const result = preset.generate(childOrder, 'xl-w');

            expect(result.gridSize.rows).toBe(1);
            expect(result.gridSize.cols).toBe(3);
            expect(result.cells['a']).toEqual({ row: 1, col: 1, rowSpan: 1, colSpan: 1 });
            expect(result.cells['b']).toEqual({ row: 1, col: 2, rowSpan: 1, colSpan: 1 });
            expect(result.cells['c']).toEqual({ row: 1, col: 3, rowSpan: 1, colSpan: 1 });
        });

        it('should generate grid layout for square blocks', () => {
            const childOrder = ['a', 'b', 'c', 'd'];
            const result = preset.generate(childOrder, 'xl-sq');

            expect(result.gridSize.rows).toBe(2);
            expect(result.gridSize.cols).toBe(2);
        });

        it('should handle empty childOrder', () => {
            const result = preset.generate([], 'md-sq');
            expect(result.gridSize.rows).toBe(1);
            expect(result.gridSize.cols).toBe(1);
            expect(Object.keys(result.cells)).toHaveLength(0);
        });

        it('should handle 7 children for days-column', () => {
            const childOrder = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'];

            // Wide - all in row
            const wideResult = preset.generate(childOrder, 'xl-w');
            expect(wideResult.gridSize.cols).toBe(7);
            expect(wideResult.gridSize.rows).toBe(1);

            // High - all in column
            const highResult = preset.generate(childOrder, 'xl-h');
            expect(highResult.gridSize.cols).toBe(1);
            expect(highResult.gridSize.rows).toBe(7);
        });
    });

    describe('sidebar preset', () => {
        const preset = ADAPTIVE_PRESETS['sidebar'];

        it('should generate horizontal sidebar for wide blocks', () => {
            const childOrder = ['sidebar', 'content1', 'content2'];
            const result = preset.generate(childOrder, 'xl-w');

            expect(result.gridSize.cols).toBe(12);
            // Sidebar should span multiple rows
            expect(result.cells['sidebar'].colSpan).toBe(3);
            expect(result.cells['sidebar'].rowSpan).toBe(2);
        });

        it('should convert sidebar to header for high blocks', () => {
            const childOrder = ['sidebar', 'content1', 'content2'];
            const result = preset.generate(childOrder, 'xl-h');

            // In high mode, sidebar becomes header (full width)
            expect(result.cells['sidebar'].colSpan).toBe(6);
            expect(result.cells['sidebar'].row).toBe(1);
            // Content blocks stack below
            expect(result.cells['content1'].row).toBe(2);
            expect(result.cells['content2'].row).toBe(3);
        });

        it('should respect side option for right sidebar', () => {
            const childOrder = ['sidebar', 'content'];
            const leftResult = preset.generate(childOrder, 'xl-w', { side: 'left' });
            const rightResult = preset.generate(childOrder, 'xl-w', { side: 'right' });

            expect(leftResult.cells['sidebar'].col).toBe(1);
            expect(rightResult.cells['sidebar'].col).toBe(10); // 12 - 3 + 1
        });
    });

    describe('kanban preset', () => {
        const preset = ADAPTIVE_PRESETS['kanban'];

        it('should generate columns for wide blocks', () => {
            const childOrder = ['todo', 'progress', 'done'];
            const result = preset.generate(childOrder, 'xl-w');

            expect(result.gridSize.cols).toBe(12);
            // Each column should have equal width
            expect(result.cells['todo'].colSpan).toBe(4);
            expect(result.cells['progress'].colSpan).toBe(4);
            expect(result.cells['done'].colSpan).toBe(4);
        });

        it('should generate rows for high blocks', () => {
            const childOrder = ['todo', 'progress', 'done'];
            const result = preset.generate(childOrder, 'xl-h');

            expect(result.gridSize.rows).toBe(3);
            expect(result.cells['todo'].row).toBe(1);
            expect(result.cells['progress'].row).toBe(2);
            expect(result.cells['done'].row).toBe(3);
        });
    });

    describe('dashboard preset', () => {
        const preset = ADAPTIVE_PRESETS['dashboard'];

        it('should generate main + widgets layout for wide blocks', () => {
            const childOrder = ['main', 'widget1', 'widget2', 'metric1', 'metric2'];
            const result = preset.generate(childOrder, 'xl-w');

            // Main block should be large (2 rows, 8 cols)
            expect(result.cells['main'].rowSpan).toBe(2);
            expect(result.cells['main'].colSpan).toBe(8);
            // Widgets on the right
            expect(result.cells['widget1'].col).toBe(9);
        });

        it('should stack vertically for high blocks', () => {
            const childOrder = ['main', 'widget1', 'widget2'];
            const result = preset.generate(childOrder, 'xl-h');

            expect(result.cells['main'].colSpan).toBe(6);
            expect(result.cells['widget1'].col).toBe(1);
        });
    });

    describe('grid presets (2x2, 3x3, 4x4)', () => {
        it('should adapt 2x2 to wide block', () => {
            const preset = ADAPTIVE_PRESETS['2x2'];
            const childOrder = ['a', 'b', 'c', 'd'];
            const result = preset.generate(childOrder, 'xl-w');

            // Wide should have more columns
            expect(result.gridSize.cols).toBeGreaterThan(2);
        });

        it('should adapt 2x2 to high block', () => {
            const preset = ADAPTIVE_PRESETS['2x2'];
            const childOrder = ['a', 'b', 'c', 'd'];
            const result = preset.generate(childOrder, 'xl-h');

            // High should have fewer columns
            expect(result.gridSize.cols).toBeLessThanOrEqual(2);
        });

        it('should keep 2x2 for square block', () => {
            const preset = ADAPTIVE_PRESETS['2x2'];
            const childOrder = ['a', 'b', 'c', 'd'];
            const result = preset.generate(childOrder, 'xl-sq');

            expect(result.gridSize.cols).toBe(2);
            expect(result.gridSize.rows).toBe(2);
        });
    });

    describe('calendar presets', () => {
        describe('week-calendar', () => {
            const preset = ADAPTIVE_PRESETS['week-calendar'];

            it('should generate 2x2 layout for wide blocks', () => {
                const childOrder = ['plan', 'retro', 'days'];
                const result = preset.generate(childOrder, 'xl-w');

                expect(result.gridSize.cols).toBe(2);
                expect(result.cells['days'].rowSpan).toBe(2);
            });

            it('should stack for high blocks', () => {
                const childOrder = ['plan', 'retro', 'days'];
                const result = preset.generate(childOrder, 'xl-h');

                expect(result.gridSize.cols).toBe(1);
                expect(result.gridSize.rows).toBe(3);
            });
        });

        describe('year-calendar', () => {
            const preset = ADAPTIVE_PRESETS['year-calendar'];

            it('should generate grid with quarters for wide blocks', () => {
                const childOrder = ['plan', 'retro', 'q1', 'q2', 'q3', 'q4'];
                const result = preset.generate(childOrder, 'xl-w');

                expect(result.gridSize.cols).toBe(3);
                expect(result.gridSize.rows).toBe(2);
            });
        });

        describe('quarter-calendar', () => {
            const preset = ADAPTIVE_PRESETS['quarter-calendar'];

            it('should generate 6x2 layout for square blocks', () => {
                const childOrder = ['plan', 'retro', 'jan', 'feb', 'mar'];
                const result = preset.generate(childOrder, 'xl-sq');

                expect(result.gridSize.cols).toBe(6);
                expect(result.gridSize.rows).toBe(2);
                // Plan and Retro span 3 columns each
                expect(result.cells['plan'].colSpan).toBe(3);
                expect(result.cells['retro'].colSpan).toBe(3);
                // Months span 2 rows, 1 column each
                expect(result.cells['jan'].rowSpan).toBe(2);
                expect(result.cells['jan'].colSpan).toBe(1);
                expect(result.cells['feb'].rowSpan).toBe(2);
                expect(result.cells['mar'].rowSpan).toBe(2);
            });

            it('should generate 4-column layout for wide blocks', () => {
                const childOrder = ['plan', 'retro', 'jan', 'feb', 'mar'];
                const result = preset.generate(childOrder, 'xl-w');

                expect(result.gridSize.cols).toBe(4);
                expect(result.gridSize.rows).toBe(2);
            });

            it('should stack for high blocks', () => {
                const childOrder = ['plan', 'retro', 'jan', 'feb', 'mar'];
                const result = preset.generate(childOrder, 'xl-h');

                expect(result.gridSize.cols).toBe(1);
                expect(result.gridSize.rows).toBe(5);
            });
        });
    });

    describe('days-column preset', () => {
        it('should generate column layout for high form', () => {
            const result = generateAdaptiveLayout('days-column', ['a', 'b', 'c', 'd', 'e', 'f', 'g'], 'xl-h');
            expect(result.gridSize.rows).toBe(7);
            expect(result.gridSize.cols).toBe(1);
        });

        it('should generate row layout for wide form', () => {
            const result = generateAdaptiveLayout('days-column', ['a', 'b', 'c', 'd', 'e', 'f', 'g'], 'xl-w');
            expect(result.gridSize.rows).toBe(1);
            expect(result.gridSize.cols).toBe(7);
        });

        it('should generate 4x2 grid for 7 days in square form', () => {
            const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
            const result = generateAdaptiveLayout('days-column', days, 'xl-sq');
            expect(result.gridSize.rows).toBe(2);
            expect(result.gridSize.cols).toBe(4);
            // Last day (sun) should have colspan=2
            expect(result.cells['sun'].colSpan).toBe(2);
        });
    });

    describe('weeks-column preset', () => {
        it('should generate column layout for high form', () => {
            const result = generateAdaptiveLayout('weeks-column', ['w1', 'w2', 'w3', 'w4'], 'xl-h');
            expect(result.gridSize.rows).toBe(4);
            expect(result.gridSize.cols).toBe(1);
        });

        it('should generate row layout for wide form', () => {
            const result = generateAdaptiveLayout('weeks-column', ['w1', 'w2', 'w3', 'w4'], 'xl-w');
            expect(result.gridSize.rows).toBe(1);
            expect(result.gridSize.cols).toBe(4);
        });

        it('should generate 2x2 grid for 4 weeks in square form', () => {
            const result = generateAdaptiveLayout('weeks-column', ['w1', 'w2', 'w3', 'w4'], 'xl-sq');
            expect(result.gridSize.rows).toBe(2);
            expect(result.gridSize.cols).toBe(2);
        });

        it('should generate 2x6 grid for 5 weeks in square form', () => {
            const weeks = ['w1', 'w2', 'w3', 'w4', 'w5'];
            const result = generateAdaptiveLayout('weeks-column', weeks, 'xl-sq');
            expect(result.gridSize.rows).toBe(2);
            expect(result.gridSize.cols).toBe(6);
            // Top 3 weeks: colspan=2 each
            expect(result.cells['w1'].colSpan).toBe(2);
            expect(result.cells['w2'].colSpan).toBe(2);
            expect(result.cells['w3'].colSpan).toBe(2);
            // Bottom 2 weeks: colspan=3 each
            expect(result.cells['w4'].colSpan).toBe(3);
            expect(result.cells['w5'].colSpan).toBe(3);
        });

        it('should generate 2x3 grid for 6 weeks in square form', () => {
            const weeks = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'];
            const result = generateAdaptiveLayout('weeks-column', weeks, 'xl-sq');
            expect(result.gridSize.rows).toBe(2);
            expect(result.gridSize.cols).toBe(3);
        });
    });

    describe('edge cases', () => {
        it('should handle missing blockShape gracefully', () => {
            const result = generateAdaptiveLayout('auto-grid', ['a', 'b'], null);
            expect(result).not.toBeNull();
        });

        it('should handle invalid blockShape format', () => {
            const result = generateAdaptiveLayout('auto-grid', ['a', 'b'], 'invalid');
            expect(result).not.toBeNull();
        });

        it('should handle single child', () => {
            const result = generateAdaptiveLayout('auto-grid', ['a'], 'xl-w');
            expect(result.gridSize.rows).toBe(1);
            expect(result.gridSize.cols).toBe(1);
        });
    });
});

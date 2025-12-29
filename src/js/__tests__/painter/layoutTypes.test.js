import {
    LAYOUT_TYPES,
    LAYOUT_ALIASES,
    LAYOUT_LABELS,
    LAYOUT_ICONS,
    parseLayoutType,
    formatLayoutString,
    isValidLayout,
    DEFAULT_GRID_CONFIG,
    DEFAULT_MASONRY_CONFIG
} from '../../painter/layoutTypes';

describe('layoutTypes.js', () => {

    describe('LAYOUT_TYPES', () => {
        test('contains all required layout types', () => {
            expect(LAYOUT_TYPES.DEFAULT).toBe('default');
            expect(LAYOUT_TYPES.ROWS).toBe('rows');
            expect(LAYOUT_TYPES.COLUMNS).toBe('columns');
            expect(LAYOUT_TYPES.TABLE).toBe('table');
            expect(LAYOUT_TYPES.GRID).toBe('grid');
            expect(LAYOUT_TYPES.MASONRY).toBe('masonry');
            expect(LAYOUT_TYPES.TEMPLATE).toBe('template');
        });
    });

    describe('LAYOUT_ALIASES', () => {
        test('vertical maps to rows', () => {
            expect(LAYOUT_ALIASES['vertical']).toBe(LAYOUT_TYPES.ROWS);
        });

        test('horizontal maps to columns', () => {
            expect(LAYOUT_ALIASES['horizontal']).toBe(LAYOUT_TYPES.COLUMNS);
        });
    });

    describe('LAYOUT_LABELS', () => {
        test('has labels for all types', () => {
            Object.values(LAYOUT_TYPES).forEach(type => {
                expect(LAYOUT_LABELS[type]).toBeDefined();
                expect(typeof LAYOUT_LABELS[type]).toBe('string');
            });
        });
    });

    describe('LAYOUT_ICONS', () => {
        test('has icons for all types', () => {
            Object.values(LAYOUT_TYPES).forEach(type => {
                expect(LAYOUT_ICONS[type]).toBeDefined();
                expect(LAYOUT_ICONS[type]).toMatch(/^fa-/);
            });
        });
    });

    describe('parseLayoutType', () => {
        test('returns default for null/undefined', () => {
            expect(parseLayoutType(null)).toEqual({ type: 'default', config: null });
            expect(parseLayoutType(undefined)).toEqual({ type: 'default', config: null });
            expect(parseLayoutType('')).toEqual({ type: 'default', config: null });
        });

        test('returns default for "default" string', () => {
            expect(parseLayoutType('default')).toEqual({ type: 'default', config: null });
        });

        test('handles simple types', () => {
            expect(parseLayoutType('rows')).toEqual({ type: 'rows', config: null });
            expect(parseLayoutType('columns')).toEqual({ type: 'columns', config: null });
            expect(parseLayoutType('table')).toEqual({ type: 'table', config: null });
            expect(parseLayoutType('masonry')).toEqual({ type: 'masonry', config: null });
        });

        test('handles aliases (vertical -> rows, horizontal -> columns)', () => {
            expect(parseLayoutType('vertical')).toEqual({ type: 'rows', config: null });
            expect(parseLayoutType('horizontal')).toEqual({ type: 'columns', config: null });
        });

        test('parses grid-NxM format', () => {
            expect(parseLayoutType('grid-2x2')).toEqual({
                type: 'grid',
                config: { rows: 2, columns: 2 }
            });
            expect(parseLayoutType('grid-3x4')).toEqual({
                type: 'grid',
                config: { rows: 3, columns: 4 }
            });
            expect(parseLayoutType('grid-10x5')).toEqual({
                type: 'grid',
                config: { rows: 10, columns: 5 }
            });
        });

        test('parses template:id format', () => {
            expect(parseLayoutType('template:task-card')).toEqual({
                type: 'template',
                config: { templateId: 'task-card' }
            });
            expect(parseLayoutType('template:my-custom-layout')).toEqual({
                type: 'template',
                config: { templateId: 'my-custom-layout' }
            });
        });

        test('returns default for unknown types', () => {
            expect(parseLayoutType('unknown-type')).toEqual({ type: 'default', config: null });
            expect(parseLayoutType('invalid')).toEqual({ type: 'default', config: null });
        });
    });

    describe('formatLayoutString', () => {
        test('formats simple types', () => {
            expect(formatLayoutString('default')).toBe('default');
            expect(formatLayoutString('rows')).toBe('rows');
            expect(formatLayoutString('columns')).toBe('columns');
            expect(formatLayoutString('table')).toBe('table');
            expect(formatLayoutString('masonry')).toBe('masonry');
        });

        test('formats grid type with config', () => {
            expect(formatLayoutString('grid', { rows: 2, columns: 3 })).toBe('grid-2x3');
            expect(formatLayoutString('grid', { rows: 4, columns: 4 })).toBe('grid-4x4');
        });

        test('formats grid type without config returns type', () => {
            expect(formatLayoutString('grid')).toBe('grid');
            expect(formatLayoutString('grid', null)).toBe('grid');
            expect(formatLayoutString('grid', {})).toBe('grid');
        });

        test('formats template type with config', () => {
            expect(formatLayoutString('template', { templateId: 'task-card' })).toBe('template:task-card');
        });

        test('formats template type without config returns type', () => {
            expect(formatLayoutString('template')).toBe('template');
            expect(formatLayoutString('template', null)).toBe('template');
        });
    });

    describe('isValidLayout', () => {
        test('returns true for valid layouts', () => {
            expect(isValidLayout('default')).toBe(true);
            expect(isValidLayout('rows')).toBe(true);
            expect(isValidLayout('columns')).toBe(true);
            expect(isValidLayout('table')).toBe(true);
            expect(isValidLayout('masonry')).toBe(true);
            expect(isValidLayout('grid-2x2')).toBe(true);
            expect(isValidLayout('template:test')).toBe(true);
        });

        test('returns true for aliases', () => {
            expect(isValidLayout('vertical')).toBe(true);
            expect(isValidLayout('horizontal')).toBe(true);
        });

        test('returns true for null/undefined (defaults)', () => {
            expect(isValidLayout(null)).toBe(true);
            expect(isValidLayout(undefined)).toBe(true);
            expect(isValidLayout('')).toBe(true);
        });
    });

    describe('DEFAULT_GRID_CONFIG', () => {
        test('has default values', () => {
            expect(DEFAULT_GRID_CONFIG.rows).toBe(2);
            expect(DEFAULT_GRID_CONFIG.columns).toBe(2);
            expect(DEFAULT_GRID_CONFIG.gap).toBe(null);
        });
    });

    describe('DEFAULT_MASONRY_CONFIG', () => {
        test('has default values', () => {
            expect(DEFAULT_MASONRY_CONFIG.minChildWidth).toBe(100);
            expect(DEFAULT_MASONRY_CONFIG.maxColumns).toBe(4);
        });
    });
});

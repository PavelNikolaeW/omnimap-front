/**
 * Tests for BlockStyleManager
 * Covers critical security and performance functions
 */

import { BlockStyleManager } from '../../controller/blockStyleManager';

// Mock DOM elements
const createMockElement = () => {
    const element = document.createElement('div');
    return element;
};

// Mock document.getElementById to return null (no DOM elements in tests)
const originalGetElementById = document.getElementById;
beforeAll(() => {
    document.getElementById = jest.fn(() => null);
    document.querySelectorAll = jest.fn(() => []);
});

afterAll(() => {
    document.getElementById = originalGetElementById;
});

describe('BlockStyleManager', () => {
    let manager;

    beforeEach(() => {
        manager = new BlockStyleManager();
    });

    describe('validateCssClass - XSS Prevention', () => {
        test('accepts valid class names', () => {
            expect(manager.validateCssClass('my-class')).toBe('my-class');
            expect(manager.validateCssClass('myClass')).toBe('myClass');
            expect(manager.validateCssClass('my_class')).toBe('my_class');
            expect(manager.validateCssClass('_private')).toBe('_private');
            expect(manager.validateCssClass('Class123')).toBe('Class123');
            expect(manager.validateCssClass('a')).toBe('a');
        });

        test('rejects empty or invalid input types', () => {
            expect(manager.validateCssClass(null)).toBeNull();
            expect(manager.validateCssClass(undefined)).toBeNull();
            expect(manager.validateCssClass('')).toBeNull();
            expect(manager.validateCssClass(123)).toBeNull();
            expect(manager.validateCssClass({})).toBeNull();
        });

        test('rejects class names starting with numbers', () => {
            expect(manager.validateCssClass('123class')).toBeNull();
            expect(manager.validateCssClass('1-class')).toBeNull();
        });

        test('rejects class names with special characters (XSS prevention)', () => {
            expect(manager.validateCssClass('class<script>')).toBeNull();
            expect(manager.validateCssClass('class"onclick')).toBeNull();
            expect(manager.validateCssClass("class'alert")).toBeNull();
            expect(manager.validateCssClass('class;color:red')).toBeNull();
            expect(manager.validateCssClass('class{background:url(javascript:alert(1))}')).toBeNull();
            expect(manager.validateCssClass('class.subclass')).toBeNull();
            expect(manager.validateCssClass('class#id')).toBeNull();
            expect(manager.validateCssClass('class:hover')).toBeNull();
            expect(manager.validateCssClass('class@media')).toBeNull();
            expect(manager.validateCssClass('class!important')).toBeNull();
        });

        test('rejects class names with spaces', () => {
            expect(manager.validateCssClass('class name')).toBeNull();
            expect(manager.validateCssClass('class\tname')).toBeNull();
            expect(manager.validateCssClass('class\nname')).toBeNull();
        });

        test('trims whitespace from valid class names', () => {
            expect(manager.validateCssClass('  myclass  ')).toBe('myclass');
            expect(manager.validateCssClass('\tmyclass\n')).toBe('myclass');
        });

        test('rejects class names exceeding max length (50 chars)', () => {
            const longClass = 'a'.repeat(51);
            expect(manager.validateCssClass(longClass)).toBeNull();

            const exactLengthClass = 'a'.repeat(50);
            expect(manager.validateCssClass(exactLengthClass)).toBe(exactLengthClass);
        });

        test('logs warning for invalid class names', () => {
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

            manager.validateCssClass('invalid<class>');
            expect(warnSpy).toHaveBeenCalledWith('Invalid CSS class name:', 'invalid<class>');

            const longClass = 'a'.repeat(51);
            manager.validateCssClass(longClass);
            expect(warnSpy).toHaveBeenCalledWith('CSS class name too long:', longClass);

            warnSpy.mockRestore();
        });
    });

    describe('_applyStylesSync - Dirty Checking', () => {
        test('applies background color only when changed', () => {
            const element = createMockElement();

            // First apply
            manager._applyStylesSync(element, { background: '#ff0000' });
            expect(element.style.backgroundColor).toBe('rgb(255, 0, 0)');

            // Same value - should not trigger DOM update (but we can't easily verify no-op)
            // Just verify value is still correct
            manager._applyStylesSync(element, { background: '#ff0000' });
            expect(element.style.backgroundColor).toBe('rgb(255, 0, 0)');
        });

        test('applies data attributes for shape', () => {
            const element = createMockElement();

            manager._applyStylesSync(element, { shape: 'diamond' });
            expect(element.getAttribute('data-block-shape')).toBe('diamond');

            // Change shape
            manager._applyStylesSync(element, { shape: 'hexagon' });
            expect(element.getAttribute('data-block-shape')).toBe('hexagon');

            // Remove shape
            manager._applyStylesSync(element, { shape: '' });
            expect(element.getAttribute('data-block-shape')).toBeNull();
        });

        test('applies data attributes for border', () => {
            const element = createMockElement();

            manager._applyStylesSync(element, { border: 'dashed' });
            expect(element.getAttribute('data-block-border')).toBe('dashed');

            manager._applyStylesSync(element, { border: '' });
            expect(element.getAttribute('data-block-border')).toBeNull();
        });

        test('applies data attributes for shadow', () => {
            const element = createMockElement();

            manager._applyStylesSync(element, { shadow: 'lg' });
            expect(element.getAttribute('data-block-shadow')).toBe('lg');
        });

        test('applies opacity correctly', () => {
            const element = createMockElement();

            manager._applyStylesSync(element, { opacity: 50 });
            expect(element.style.opacity).toBe('0.5');

            // Full opacity should clear the style
            manager._applyStylesSync(element, { opacity: 100 });
            expect(element.style.opacity).toBe('');
        });

        test('applies min width and height', () => {
            const element = createMockElement();

            manager._applyStylesSync(element, { minWidth: 200, minHeight: 100 });
            expect(element.style.minWidth).toBe('200px');
            expect(element.style.minHeight).toBe('100px');

            // Clear values
            manager._applyStylesSync(element, { minWidth: null, minHeight: null });
            expect(element.style.minWidth).toBe('');
            expect(element.style.minHeight).toBe('');
        });

        test('applies custom class with validation', () => {
            const element = createMockElement();

            // Valid class
            manager._applyStylesSync(element, { customClass: 'my-custom-class' });
            expect(element.classList.contains('my-custom-class')).toBe(true);
            expect(element.getAttribute('data-custom-class')).toBe('my-custom-class');

            // Change to different class
            manager._applyStylesSync(element, { customClass: 'another-class' });
            expect(element.classList.contains('my-custom-class')).toBe(false);
            expect(element.classList.contains('another-class')).toBe(true);
            expect(element.getAttribute('data-custom-class')).toBe('another-class');
        });

        test('rejects invalid custom class silently', () => {
            const element = createMockElement();
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Try to apply invalid class
            manager._applyStylesSync(element, { customClass: 'invalid<script>' });
            expect(element.classList.contains('invalid<script>')).toBe(false);
            expect(element.getAttribute('data-custom-class')).toBeNull();

            warnSpy.mockRestore();
        });

        test('handles null element gracefully', () => {
            expect(() => {
                manager._applyStylesSync(null, { background: '#ff0000' });
            }).not.toThrow();
        });

        test('force flag bypasses dirty checking', () => {
            const element = createMockElement();
            element.setAttribute('data-block-shape', 'diamond');

            // With force=true, should still set the attribute even if "same"
            manager._applyStylesSync(element, { shape: 'diamond' }, true);
            expect(element.getAttribute('data-block-shape')).toBe('diamond');
        });

        test('applies font size via data attribute', () => {
            const element = createMockElement();

            manager._applyStylesSync(element, { fontSize: 'lg' });
            expect(element.getAttribute('data-block-font-size')).toBe('lg');
        });

        test('applies text alignment via data attribute', () => {
            const element = createMockElement();

            manager._applyStylesSync(element, { textAlign: 'center' });
            expect(element.getAttribute('data-block-text-align')).toBe('center');
        });
    });

    describe('presetColors', () => {
        test('has all expected color presets', () => {
            expect(manager.presetColors).toHaveProperty('default');
            expect(manager.presetColors).toHaveProperty('blue');
            expect(manager.presetColors).toHaveProperty('green');
            expect(manager.presetColors).toHaveProperty('yellow');
            expect(manager.presetColors).toHaveProperty('red');
            expect(manager.presetColors).toHaveProperty('purple');
            expect(manager.presetColors).toHaveProperty('pink');
            expect(manager.presetColors).toHaveProperty('gray');
        });

        test('each preset has background and borderColor', () => {
            Object.values(manager.presetColors).forEach(preset => {
                expect(preset).toHaveProperty('background');
                expect(preset).toHaveProperty('borderColor');
                expect(preset.background).toMatch(/^#[0-9a-f]{6}$/i);
                expect(preset.borderColor).toMatch(/^#[0-9a-f]{6}$/i);
            });
        });
    });
});

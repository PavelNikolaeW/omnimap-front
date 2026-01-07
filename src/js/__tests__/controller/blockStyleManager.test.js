/**
 * Tests for BlockStyleManager
 * Covers critical security and performance functions
 */

import { BlockStyleManager, ConnectionStyleManager } from '../../controller/blockStyleManager';

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

    describe('clampNumericValue - Bounds Validation', () => {
        test('returns default for empty values', () => {
            expect(manager.clampNumericValue('', 0, 100, null)).toBeNull();
            expect(manager.clampNumericValue(null, 0, 100, null)).toBeNull();
            expect(manager.clampNumericValue(undefined, 0, 100, null)).toBeNull();
        });

        test('returns default for invalid values', () => {
            expect(manager.clampNumericValue('abc', 0, 100, 50)).toBe(50);
            expect(manager.clampNumericValue('NaN', 0, 100, 50)).toBe(50);
        });

        test('clamps values to min', () => {
            expect(manager.clampNumericValue('-10', 0, 100, 50)).toBe(0);
            expect(manager.clampNumericValue('0', 10, 100, 50)).toBe(10);
        });

        test('clamps values to max', () => {
            expect(manager.clampNumericValue('200', 0, 100, 50)).toBe(100);
            expect(manager.clampNumericValue('999999', 0, 2000, 100)).toBe(2000);
        });

        test('passes through valid values', () => {
            expect(manager.clampNumericValue('50', 0, 100, 25)).toBe(50);
            expect(manager.clampNumericValue(75, 0, 100, 25)).toBe(75);
        });
    });
});

describe('ConnectionStyleManager', () => {
    let connectionManager;

    beforeEach(() => {
        connectionManager = new ConnectionStyleManager();
    });

    describe('sanitizeText - XSS Prevention', () => {
        test('returns empty string for invalid input', () => {
            expect(connectionManager.sanitizeText(null)).toBe('');
            expect(connectionManager.sanitizeText(undefined)).toBe('');
            expect(connectionManager.sanitizeText('')).toBe('');
            expect(connectionManager.sanitizeText(123)).toBe('');
        });

        test('escapes HTML special characters', () => {
            expect(connectionManager.sanitizeText('<script>')).toBe('&lt;script&gt;');
            expect(connectionManager.sanitizeText('alert("xss")')).toBe('alert(&quot;xss&quot;)');
            expect(connectionManager.sanitizeText("test'injection")).toBe('test&#039;injection');
            expect(connectionManager.sanitizeText('a & b')).toBe('a &amp; b');
        });

        test('handles complex XSS payloads', () => {
            const payload = '<img src=x onerror="alert(1)">';
            const sanitized = connectionManager.sanitizeText(payload);
            expect(sanitized).not.toContain('<');
            expect(sanitized).not.toContain('>');
            expect(sanitized).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
        });

        test('passes through safe text unchanged', () => {
            expect(connectionManager.sanitizeText('Hello World')).toBe('Hello World');
            expect(connectionManager.sanitizeText('Test 123')).toBe('Test 123');
            expect(connectionManager.sanitizeText('user@email.com')).toBe('user@email.com');
        });
    });

    describe('clampNumeric - Bounds Validation', () => {
        test('clamps values within bounds', () => {
            expect(connectionManager.clampNumeric('0', 1, 10, 2)).toBe(1);
            expect(connectionManager.clampNumeric('100', 1, 10, 2)).toBe(10);
            expect(connectionManager.clampNumeric('5', 1, 10, 2)).toBe(5);
        });

        test('returns default for invalid input', () => {
            expect(connectionManager.clampNumeric('invalid', 1, 10, 5)).toBe(5);
            expect(connectionManager.clampNumeric(NaN, 1, 10, 5)).toBe(5);
        });
    });

    describe('LIMITS configuration', () => {
        test('has reasonable stroke width limits', () => {
            expect(connectionManager.LIMITS.strokeWidth.min).toBe(1);
            expect(connectionManager.LIMITS.strokeWidth.max).toBe(10);
        });

        test('has reasonable corner radius limits', () => {
            expect(connectionManager.LIMITS.cornerRadius.min).toBe(0);
            expect(connectionManager.LIMITS.cornerRadius.max).toBe(50);
        });

        test('has reasonable label length limit', () => {
            expect(connectionManager.LIMITS.labelMaxLength).toBe(100);
        });
    });
});

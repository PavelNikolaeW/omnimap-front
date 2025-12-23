import {
    findLCM,
    findNearestRoots,
    sleep,
    validURL,
    truncate,
    isValidUUID,
    hexToHSL,
    throttle,
    isExcludedElement
} from '../../utils/functions';

describe('functions.js', () => {

    describe('findLCM', () => {
        test('returns correct LCM for 4 and 6', () => {
            expect(findLCM(4, 6)).toBe(12);
        });

        test('returns correct LCM for 3 and 5', () => {
            expect(findLCM(3, 5)).toBe(15);
        });

        test('returns correct LCM for same numbers', () => {
            expect(findLCM(7, 7)).toBe(7);
        });

        test('returns correct LCM when one number is 1', () => {
            expect(findLCM(1, 5)).toBe(5);
        });
    });

    describe('findNearestRoots', () => {
        test('returns same values for perfect square', () => {
            expect(findNearestRoots(16)).toEqual([4, 4]);
        });

        test('returns floor and ceil for non-perfect square', () => {
            expect(findNearestRoots(10)).toEqual([3, 4]);
        });

        test('returns correct roots for 1', () => {
            expect(findNearestRoots(1)).toEqual([1, 1]);
        });

        test('returns correct roots for large number', () => {
            expect(findNearestRoots(100)).toEqual([10, 10]);
        });
    });

    describe('sleep', () => {
        test('resolves after specified time', async () => {
            const start = Date.now();
            await sleep(50);
            const elapsed = Date.now() - start;
            expect(elapsed).toBeGreaterThanOrEqual(45);
        });
    });

    describe('validURL', () => {
        test('returns true for valid http URL', () => {
            expect(validURL('http://example.com')).toBe(true);
        });

        test('returns true for valid https URL', () => {
            expect(validURL('https://example.com/path?query=1')).toBe(true);
        });

        test('returns false for invalid URL', () => {
            expect(validURL('not a url')).toBe(false);
        });

        test('returns false for empty string', () => {
            expect(validURL('')).toBe(false);
        });
    });

    describe('truncate', () => {
        test('returns original string if shorter than maxLen', () => {
            expect(truncate('hello', 10)).toBe('hello');
        });

        test('truncates string and adds dot', () => {
            expect(truncate('hello world', 5)).toBe('hello.');
        });

        test('returns empty string for null input', () => {
            expect(truncate(null, 10)).toBe('');
        });

        test('returns empty string for undefined input', () => {
            expect(truncate(undefined, 10)).toBe('');
        });

        test('returns original string if equal to maxLen', () => {
            expect(truncate('hello', 5)).toBe('hello');
        });
    });

    describe('isValidUUID', () => {
        test('returns true for valid UUID v4', () => {
            expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
        });

        test('returns true for valid UUID v1', () => {
            expect(isValidUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
        });

        test('returns false for invalid UUID', () => {
            expect(isValidUUID('not-a-uuid')).toBe(false);
        });

        test('returns false for empty string', () => {
            expect(isValidUUID('')).toBe(false);
        });

        test('returns false for UUID with wrong format', () => {
            expect(isValidUUID('550e8400e29b41d4a716446655440000')).toBe(false);
        });
    });

    describe('hexToHSL', () => {
        test('converts white correctly', () => {
            expect(hexToHSL('#ffffff')).toBe('hsl(0, 0%, 100%)');
        });

        test('converts black correctly', () => {
            expect(hexToHSL('#000000')).toBe('hsl(0, 0%, 0%)');
        });

        test('converts red correctly', () => {
            expect(hexToHSL('#ff0000')).toBe('hsl(0, 100%, 50%)');
        });

        test('works without # prefix', () => {
            expect(hexToHSL('00ff00')).toBe('hsl(120, 100%, 50%)');
        });
    });

    describe('throttle', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('calls function immediately on first call', () => {
            const fn = jest.fn();
            const throttled = throttle(fn, 100);

            throttled();
            expect(fn).toHaveBeenCalledTimes(1);
        });

        test('does not call function within delay period', () => {
            const fn = jest.fn();
            const throttled = throttle(fn, 100);

            throttled();
            throttled();
            throttled();

            expect(fn).toHaveBeenCalledTimes(1);
        });

        test('calls function again after delay', () => {
            const fn = jest.fn();
            const throttled = throttle(fn, 100);

            throttled();
            jest.advanceTimersByTime(100);
            throttled();

            expect(fn).toHaveBeenCalledTimes(2);
        });
    });

    describe('isExcludedElement', () => {
        test('returns true for body element', () => {
            const el = document.createElement('body');
            Object.defineProperty(el, 'tagName', { value: 'BODY' });
            expect(isExcludedElement(el)).toBe(true);
        });

        test('returns true for textarea', () => {
            const el = document.createElement('textarea');
            expect(isExcludedElement(el)).toBe(true);
        });

        test('returns true for input', () => {
            const el = document.createElement('input');
            expect(isExcludedElement(el)).toBe(true);
        });

        test('returns true for contentEditable element', () => {
            const el = document.createElement('div');
            Object.defineProperty(el, 'isContentEditable', { value: true });
            expect(isExcludedElement(el)).toBe(true);
        });

        test('returns false for regular div', () => {
            const el = document.createElement('div');
            expect(isExcludedElement(el)).toBe(false);
        });

        test('returns true for element inside CodeMirror', () => {
            const container = document.createElement('div');
            container.className = 'CodeMirror';
            const el = document.createElement('span');
            container.appendChild(el);
            document.body.appendChild(container);

            expect(isExcludedElement(el)).toBe(true);

            document.body.removeChild(container);
        });
    });
});

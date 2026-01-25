/**
 * @jest-environment jsdom
 */

// Мокаем @sentry/browser до импорта errorTracker
jest.mock('@sentry/browser', () => ({
    init: jest.fn(),
    addBreadcrumb: jest.fn(),
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    withScope: jest.fn((callback) => callback({
        setContext: jest.fn(),
        setTag: jest.fn(),
        setLevel: jest.fn()
    })),
    setUser: jest.fn()
}));

// Мокаем config
jest.mock('../../config', () => ({
    config: {
        SENTRY_DSN: '',
        ERROR_TRACKING_ENABLED: true
    }
}));

import { errorTracker } from '../../core/errorTracker';
import * as Sentry from '@sentry/browser';

describe('ErrorTracker', () => {
    beforeEach(() => {
        // Сбрасываем состояние
        errorTracker.breadcrumbs = [];
        errorTracker.isInitialized = false;
        delete window.__errorTracker;
        delete window.__undoManager;
        delete window.__contextManager;
        delete window.__localStateManager;
        delete window.__networkStatusUI;
        jest.clearAllMocks();
    });

    afterEach(() => {
        // Очистка
        if (errorTracker.isInitialized) {
            errorTracker.destroy();
        }
    });

    describe('init', () => {
        it('should initialize without Sentry DSN (fallback mode)', () => {
            errorTracker.init();

            expect(errorTracker.isInitialized).toBe(true);
            expect(window.__errorTracker).toBe(errorTracker);
        });

        it('should not reinitialize if already initialized', () => {
            errorTracker.init();
            const spy = jest.spyOn(errorTracker, '_setupFallbackHandlers');

            errorTracker.init();

            expect(spy).not.toHaveBeenCalled();
        });
    });

    describe('addBreadcrumb', () => {
        beforeEach(() => {
            errorTracker.init();
        });

        it('should add breadcrumb to internal queue', () => {
            errorTracker.addBreadcrumb('event', 'TestEvent', { key: 'value' });

            expect(errorTracker.breadcrumbs).toHaveLength(1);
            expect(errorTracker.breadcrumbs[0]).toMatchObject({
                category: 'event',
                message: 'TestEvent',
                data: { key: 'value' }
            });
            expect(errorTracker.breadcrumbs[0].timestamp).toBeDefined();
        });

        it('should ignore high-frequency events', () => {
            errorTracker.addBreadcrumb('event', 'ShowedBlocks', {});
            errorTracker.addBreadcrumb('event', 'MouseMove', {});

            expect(errorTracker.breadcrumbs).toHaveLength(0);
        });

        it('should limit breadcrumbs to MAX_BREADCRUMBS', () => {
            for (let i = 0; i < 35; i++) {
                errorTracker.addBreadcrumb('event', `Event${i}`, {});
            }

            expect(errorTracker.breadcrumbs.length).toBeLessThanOrEqual(30);
        });

        it('should sanitize sensitive data', () => {
            errorTracker.addBreadcrumb('event', 'TestEvent', {
                password: 'secret123',
                token: 'abc123',
                safeData: 'visible'
            });

            expect(errorTracker.breadcrumbs[0].data).toMatchObject({
                password: '[REDACTED]',
                token: '[REDACTED]',
                safeData: 'visible'
            });
        });

        it('should truncate long strings', () => {
            const longString = 'a'.repeat(600);
            errorTracker.addBreadcrumb('event', 'TestEvent', { text: longString });

            expect(errorTracker.breadcrumbs[0].data.text.length).toBeLessThanOrEqual(503); // 500 + '...'
        });
    });

    describe('captureError', () => {
        beforeEach(() => {
            errorTracker.init();
        });

        it('should capture error with context', () => {
            const error = new Error('Test error');

            errorTracker.captureError(error, { custom: 'context' });

            // В fallback режиме логирует в консоль
            // Проверяем что ошибка не пробрасывается
            expect(() => errorTracker.captureError(error)).not.toThrow();
        });

        it('should include undo history when available', () => {
            // Мокаем undoManager
            window.__undoManager = {
                undoStack: [
                    { type: 'edit', blockId: 'block-1', timestamp: Date.now(), invalid: false },
                    { type: 'create', blockId: 'block-2', timestamp: Date.now(), invalid: false }
                ]
            };

            const history = errorTracker._getUndoHistory();

            expect(history).toHaveLength(2);
            expect(history[0].type).toBe('edit');
        });
    });

    describe('_sanitizeData', () => {
        it('should redact sensitive fields', () => {
            const data = {
                email: 'test@example.com',
                password: 'secret',
                apiKey: 'key123',
                normalField: 'visible'
            };

            const result = errorTracker._sanitizeData(data);

            expect(result.email).toBe('[REDACTED]');
            expect(result.password).toBe('[REDACTED]');
            expect(result.apiKey).toBe('[REDACTED]');
            expect(result.normalField).toBe('visible');
        });

        it('should handle nested objects', () => {
            const data = {
                nested: { deep: { field: 'value' } }
            };

            const result = errorTracker._sanitizeData(data);

            expect(result.nested).toBeDefined();
        });

        it('should convert nested arrays to string representation', () => {
            const data = {
                items: Array(20).fill('item')
            };

            const result = errorTracker._sanitizeData(data);

            // Nested arrays are converted to string representation for shallow sanitization
            expect(result.items).toBe('[Array(20)]');
        });

        it('should limit top-level array size', () => {
            const data = Array(20).fill('item');

            const result = errorTracker._sanitizeData(data);

            expect(result.length).toBeLessThanOrEqual(10);
        });

        it('should handle null and undefined', () => {
            expect(errorTracker._sanitizeData(null)).toBeNull();
            expect(errorTracker._sanitizeData(undefined)).toBeUndefined();
        });
    });

    describe('_getAppContext', () => {
        beforeEach(() => {
            errorTracker.init();
        });

        it('should return basic context', () => {
            const context = errorTracker._getAppContext();

            expect(context.timestamp).toBeDefined();
            expect(context.url).toBeDefined();
            expect(context.online).toBeDefined();
        });

        it('should include mode from contextManager', () => {
            window.__contextManager = {
                mode: 'diagram',
                selectedBlock: { id: 'test-block-123' }
            };

            const context = errorTracker._getAppContext();

            expect(context.mode).toBe('diagram');
            expect(context.hasSelectedBlock).toBe(true);
            expect(context.selectedBlockId).toBe('test-blo'); // Truncated to 8 chars
        });

        it('should include blocks count from localStateManager', () => {
            window.__localStateManager = {
                blocks: { size: 42 }
            };

            const context = errorTracker._getAppContext();

            expect(context.blocksCount).toBe(42);
        });
    });

    describe('setUser / clearUser', () => {
        beforeEach(() => {
            errorTracker.init();
        });

        it('should set user for error tracking', () => {
            errorTracker.setUser({ id: 'user-123' });

            // В fallback режиме просто не падает
            expect(() => errorTracker.setUser({ id: 'test' })).not.toThrow();
        });

        it('should clear user', () => {
            errorTracker.clearUser();

            expect(() => errorTracker.clearUser()).not.toThrow();
        });
    });

    describe('destroy', () => {
        it('should clean up resources', () => {
            errorTracker.init();

            errorTracker.destroy();

            expect(errorTracker.isInitialized).toBe(false);
            expect(errorTracker.breadcrumbs).toHaveLength(0);
            expect(window.__errorTracker).toBeUndefined();
        });
    });

    describe('_truncateId', () => {
        it('should truncate UUIDs to 8 characters', () => {
            const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

            const result = errorTracker._truncateId(uuid);

            expect(result).toBe('a1b2c3d4');
        });

        it('should return short ids unchanged', () => {
            const shortId = 'abc';

            const result = errorTracker._truncateId(shortId);

            expect(result).toBe('abc');
        });

        it('should handle non-string input', () => {
            expect(errorTracker._truncateId(null)).toBeNull();
            expect(errorTracker._truncateId(123)).toBe(123);
        });
    });
});

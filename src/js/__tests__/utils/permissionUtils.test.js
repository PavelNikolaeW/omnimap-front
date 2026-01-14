import { canEdit, isForbidden } from '../../utils/permissionUtils';

describe('permissionUtils', () => {
    describe('canEdit', () => {
        test('returns false for null block', () => {
            expect(canEdit(null)).toBe(false);
        });

        test('returns false for undefined block', () => {
            expect(canEdit(undefined)).toBe(false);
        });

        test('returns false for forbidden block', () => {
            const block = { id: 'block-1', forbidden: true };
            expect(canEdit(block)).toBe(false);
        });

        test('returns true for normal block without forbidden flag', () => {
            const block = { id: 'block-1' };
            expect(canEdit(block)).toBe(true);
        });

        test('returns true for block with forbidden: false', () => {
            const block = { id: 'block-1', forbidden: false };
            expect(canEdit(block)).toBe(true);
        });

        test('returns true for block with forbidden: undefined', () => {
            const block = { id: 'block-1', forbidden: undefined };
            expect(canEdit(block)).toBe(true);
        });
    });

    describe('isForbidden', () => {
        test('returns false for null block', () => {
            expect(isForbidden(null)).toBe(false);
        });

        test('returns false for undefined block', () => {
            expect(isForbidden(undefined)).toBe(false);
        });

        test('returns true for forbidden block', () => {
            const block = { id: 'block-1', forbidden: true };
            expect(isForbidden(block)).toBe(true);
        });

        test('returns false for normal block', () => {
            const block = { id: 'block-1' };
            expect(isForbidden(block)).toBe(false);
        });

        test('returns false for block with forbidden: false', () => {
            const block = { id: 'block-1', forbidden: false };
            expect(isForbidden(block)).toBe(false);
        });

        test('returns false for block with forbidden: "true" (string)', () => {
            const block = { id: 'block-1', forbidden: 'true' };
            expect(isForbidden(block)).toBe(false);
        });
    });
});

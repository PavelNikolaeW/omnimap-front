import {
    PERMISSIONS,
    canEdit,
    canDelete,
    canEditAccess,
    isViewOnly,
    isForbidden,
    getPermissionDataAttribute
} from '../../utils/permissionUtils';

describe('permissionUtils', () => {
    describe('PERMISSIONS constants', () => {
        test('has correct values', () => {
            expect(PERMISSIONS.VIEW).toBe('view');
            expect(PERMISSIONS.EDIT).toBe('edit');
            expect(PERMISSIONS.EDIT_AC).toBe('edit_ac');
            expect(PERMISSIONS.DELETE).toBe('delete');
            expect(PERMISSIONS.FORBIDDEN).toBe('forbidden');
        });
    });

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

        test('returns false for view-only block', () => {
            const block = { id: 'block-1', permission: 'view' };
            expect(canEdit(block)).toBe(false);
        });

        test('returns true for edit permission block', () => {
            const block = { id: 'block-1', permission: 'edit' };
            expect(canEdit(block)).toBe(true);
        });

        test('returns true for edit_ac permission block', () => {
            const block = { id: 'block-1', permission: 'edit_ac' };
            expect(canEdit(block)).toBe(true);
        });

        test('returns true for delete permission block', () => {
            const block = { id: 'block-1', permission: 'delete' };
            expect(canEdit(block)).toBe(true);
        });

        test('returns true for own block (permission: null)', () => {
            const block = { id: 'block-1', permission: null };
            expect(canEdit(block)).toBe(true);
        });
    });

    describe('canDelete', () => {
        test('returns false for null block', () => {
            expect(canDelete(null)).toBe(false);
        });

        test('returns false for forbidden block', () => {
            const block = { id: 'block-1', forbidden: true };
            expect(canDelete(block)).toBe(false);
        });

        test('returns false for view-only block', () => {
            const block = { id: 'block-1', permission: 'view' };
            expect(canDelete(block)).toBe(false);
        });

        test('returns false for edit permission block', () => {
            const block = { id: 'block-1', permission: 'edit' };
            expect(canDelete(block)).toBe(false);
        });

        test('returns false for edit_ac permission block', () => {
            const block = { id: 'block-1', permission: 'edit_ac' };
            expect(canDelete(block)).toBe(false);
        });

        test('returns true for delete permission block', () => {
            const block = { id: 'block-1', permission: 'delete' };
            expect(canDelete(block)).toBe(true);
        });

        test('returns true for own block (permission: null)', () => {
            const block = { id: 'block-1', permission: null };
            expect(canDelete(block)).toBe(true);
        });

        test('returns true for block without permission (own block)', () => {
            const block = { id: 'block-1' };
            expect(canDelete(block)).toBe(true);
        });
    });

    describe('canEditAccess', () => {
        test('returns false for null block', () => {
            expect(canEditAccess(null)).toBe(false);
        });

        test('returns false for forbidden block', () => {
            const block = { id: 'block-1', forbidden: true };
            expect(canEditAccess(block)).toBe(false);
        });

        test('returns false for view-only block', () => {
            const block = { id: 'block-1', permission: 'view' };
            expect(canEditAccess(block)).toBe(false);
        });

        test('returns false for edit permission block', () => {
            const block = { id: 'block-1', permission: 'edit' };
            expect(canEditAccess(block)).toBe(false);
        });

        test('returns true for edit_ac permission block', () => {
            const block = { id: 'block-1', permission: 'edit_ac' };
            expect(canEditAccess(block)).toBe(true);
        });

        test('returns true for delete permission block', () => {
            const block = { id: 'block-1', permission: 'delete' };
            expect(canEditAccess(block)).toBe(true);
        });

        test('returns true for own block (permission: null)', () => {
            const block = { id: 'block-1', permission: null };
            expect(canEditAccess(block)).toBe(true);
        });
    });

    describe('isViewOnly', () => {
        test('returns false for null block', () => {
            expect(isViewOnly(null)).toBe(false);
        });

        test('returns false for undefined block', () => {
            expect(isViewOnly(undefined)).toBe(false);
        });

        test('returns true for view permission block', () => {
            const block = { id: 'block-1', permission: 'view' };
            expect(isViewOnly(block)).toBe(true);
        });

        test('returns false for edit permission block', () => {
            const block = { id: 'block-1', permission: 'edit' };
            expect(isViewOnly(block)).toBe(false);
        });

        test('returns false for own block', () => {
            const block = { id: 'block-1' };
            expect(isViewOnly(block)).toBe(false);
        });

        test('returns false for forbidden block', () => {
            const block = { id: 'block-1', forbidden: true };
            expect(isViewOnly(block)).toBe(false);
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

    describe('getPermissionDataAttribute', () => {
        test('returns null for null block', () => {
            expect(getPermissionDataAttribute(null)).toBe(null);
        });

        test('returns null for undefined block', () => {
            expect(getPermissionDataAttribute(undefined)).toBe(null);
        });

        test('returns "forbidden" for forbidden block', () => {
            const block = { id: 'block-1', forbidden: true };
            expect(getPermissionDataAttribute(block)).toBe('forbidden');
        });

        test('returns "view-only" for view permission block', () => {
            const block = { id: 'block-1', permission: 'view' };
            expect(getPermissionDataAttribute(block)).toBe('view-only');
        });

        test('returns null for edit permission block', () => {
            const block = { id: 'block-1', permission: 'edit' };
            expect(getPermissionDataAttribute(block)).toBe(null);
        });

        test('returns null for own block', () => {
            const block = { id: 'block-1' };
            expect(getPermissionDataAttribute(block)).toBe(null);
        });

        test('returns null for delete permission block', () => {
            const block = { id: 'block-1', permission: 'delete' };
            expect(getPermissionDataAttribute(block)).toBe(null);
        });

        test('forbidden takes precedence over view permission', () => {
            const block = { id: 'block-1', forbidden: true, permission: 'view' };
            expect(getPermissionDataAttribute(block)).toBe('forbidden');
        });
    });
});

import {
    PERMISSIONS,
    SANDBOX_MODES,
    canEdit,
    canDelete,
    canEditAccess,
    isViewOnly,
    isForbidden,
    getPermissionDataAttribute,
    isInSandbox,
    isBlockOwner,
    isContainerOwner,
    canCreateInSandbox,
    canEditInSandbox,
    canDeleteInSandbox,
    getSandboxPermissionAttribute,
    canViewInPrivateSandbox,
    filterChildrenForPrivateSandbox
} from '../../utils/permissionUtils';

describe('permissionUtils', () => {
    describe('PERMISSIONS constants', () => {
        test('has correct values', () => {
            expect(PERMISSIONS.VIEW).toBe('view');
            expect(PERMISSIONS.SANDBOX).toBe('sandbox');
            expect(PERMISSIONS.EDIT).toBe('edit');
            expect(PERMISSIONS.EDIT_AC).toBe('edit_ac');
            expect(PERMISSIONS.DELETE).toBe('delete');
            expect(PERMISSIONS.FORBIDDEN).toBe('forbidden');
        });
    });

    describe('SANDBOX_MODES constants', () => {
        test('has correct values', () => {
            expect(SANDBOX_MODES.NONE).toBe(null);
            expect(SANDBOX_MODES.OPEN).toBe('open');
            expect(SANDBOX_MODES.PRIVATE).toBe('private');
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

    // ==========================================
    // Sandbox Mode Tests
    // ==========================================

    describe('isInSandbox', () => {
        test('returns false for null parentBlock', () => {
            expect(isInSandbox(null)).toBe(false);
        });

        test('returns false for undefined parentBlock', () => {
            expect(isInSandbox(undefined)).toBe(false);
        });

        test('returns false for parentBlock without sandbox_mode', () => {
            const parentBlock = { id: 'parent-1' };
            expect(isInSandbox(parentBlock)).toBe(false);
        });

        test('returns false for parentBlock with sandbox_mode: null', () => {
            const parentBlock = { id: 'parent-1', sandbox_mode: null };
            expect(isInSandbox(parentBlock)).toBe(false);
        });

        test('returns true for parentBlock with sandbox_mode: "open"', () => {
            const parentBlock = { id: 'parent-1', sandbox_mode: 'open' };
            expect(isInSandbox(parentBlock)).toBe(true);
        });

        test('returns true for parentBlock with sandbox_mode: "private"', () => {
            const parentBlock = { id: 'parent-1', sandbox_mode: 'private' };
            expect(isInSandbox(parentBlock)).toBe(true);
        });
    });

    describe('isBlockOwner', () => {
        test('returns false for null block', () => {
            expect(isBlockOwner(null, 123)).toBe(false);
        });

        test('returns false for block without creator_id', () => {
            const block = { id: 'block-1' };
            expect(isBlockOwner(block, 123)).toBe(false);
        });

        test('returns false for null currentUserId', () => {
            const block = { id: 'block-1', creator_id: 123 };
            expect(isBlockOwner(block, null)).toBe(false);
        });

        test('returns true when creator_id matches currentUserId', () => {
            const block = { id: 'block-1', creator_id: 123 };
            expect(isBlockOwner(block, 123)).toBe(true);
        });

        test('returns false when creator_id does not match currentUserId', () => {
            const block = { id: 'block-1', creator_id: 123 };
            expect(isBlockOwner(block, 456)).toBe(false);
        });

        test('handles string currentUserId', () => {
            const block = { id: 'block-1', creator_id: 123 };
            expect(isBlockOwner(block, '123')).toBe(true);
        });

        test('handles string creator_id', () => {
            const block = { id: 'block-1', creator_id: '123' };
            expect(isBlockOwner(block, 123)).toBe(true);
        });
    });

    describe('isContainerOwner', () => {
        test('returns false for null parentBlock', () => {
            expect(isContainerOwner(null)).toBe(false);
        });

        test('returns false for view permission', () => {
            const parentBlock = { id: 'parent-1', permission: 'view' };
            expect(isContainerOwner(parentBlock)).toBe(false);
        });

        test('returns false for sandbox permission', () => {
            const parentBlock = { id: 'parent-1', permission: 'sandbox' };
            expect(isContainerOwner(parentBlock)).toBe(false);
        });

        test('returns false for edit permission', () => {
            const parentBlock = { id: 'parent-1', permission: 'edit' };
            expect(isContainerOwner(parentBlock)).toBe(false);
        });

        test('returns false for edit_ac permission', () => {
            const parentBlock = { id: 'parent-1', permission: 'edit_ac' };
            expect(isContainerOwner(parentBlock)).toBe(false);
        });

        test('returns true for delete permission', () => {
            const parentBlock = { id: 'parent-1', permission: 'delete' };
            expect(isContainerOwner(parentBlock)).toBe(true);
        });

        test('returns true for own block (permission: null)', () => {
            const parentBlock = { id: 'parent-1', permission: null };
            expect(isContainerOwner(parentBlock)).toBe(true);
        });

        test('returns true for block without permission (own block)', () => {
            const parentBlock = { id: 'parent-1' };
            expect(isContainerOwner(parentBlock)).toBe(true);
        });
    });

    describe('canCreateInSandbox', () => {
        test('returns false for null parentBlock', () => {
            expect(canCreateInSandbox(null)).toBe(false);
        });

        test('returns canEdit result for non-sandbox parent', () => {
            const parentBlock = { id: 'parent-1', permission: 'edit' };
            expect(canCreateInSandbox(parentBlock)).toBe(true);
        });

        test('returns false for view permission in sandbox', () => {
            const parentBlock = { id: 'parent-1', sandbox_mode: 'open', permission: 'view' };
            expect(canCreateInSandbox(parentBlock)).toBe(false);
        });

        test('returns true for sandbox permission in sandbox', () => {
            const parentBlock = { id: 'parent-1', sandbox_mode: 'open', permission: 'sandbox' };
            expect(canCreateInSandbox(parentBlock)).toBe(true);
        });

        test('returns true for edit permission in sandbox', () => {
            const parentBlock = { id: 'parent-1', sandbox_mode: 'open', permission: 'edit' };
            expect(canCreateInSandbox(parentBlock)).toBe(true);
        });

        test('returns true for own sandbox container', () => {
            const parentBlock = { id: 'parent-1', sandbox_mode: 'private', permission: null };
            expect(canCreateInSandbox(parentBlock)).toBe(true);
        });
    });

    describe('canEditInSandbox', () => {
        const currentUserId = 123;

        test('returns false for null block', () => {
            const parentBlock = { id: 'parent-1', sandbox_mode: 'open' };
            expect(canEditInSandbox(null, parentBlock, currentUserId)).toBe(false);
        });

        test('returns false for forbidden block', () => {
            const block = { id: 'block-1', forbidden: true, creator_id: currentUserId };
            const parentBlock = { id: 'parent-1', sandbox_mode: 'open' };
            expect(canEditInSandbox(block, parentBlock, currentUserId)).toBe(false);
        });

        test('returns canEdit result for non-sandbox context', () => {
            const block = { id: 'block-1', permission: 'edit' };
            const parentBlock = { id: 'parent-1' };
            expect(canEditInSandbox(block, parentBlock, currentUserId)).toBe(true);
        });

        test('returns true for block owner in sandbox', () => {
            const block = { id: 'block-1', creator_id: currentUserId };
            const parentBlock = { id: 'parent-1', sandbox_mode: 'open', permission: 'sandbox' };
            expect(canEditInSandbox(block, parentBlock, currentUserId)).toBe(true);
        });

        test('returns false for non-owner in sandbox', () => {
            const block = { id: 'block-1', creator_id: 456 };
            const parentBlock = { id: 'parent-1', sandbox_mode: 'open', permission: 'sandbox' };
            expect(canEditInSandbox(block, parentBlock, currentUserId)).toBe(false);
        });

        test('returns true for container owner (delete permission)', () => {
            const block = { id: 'block-1', creator_id: 456 };
            const parentBlock = { id: 'parent-1', sandbox_mode: 'open', permission: 'delete' };
            expect(canEditInSandbox(block, parentBlock, currentUserId)).toBe(true);
        });

        test('returns true for container owner (own sandbox)', () => {
            const block = { id: 'block-1', creator_id: 456 };
            const parentBlock = { id: 'parent-1', sandbox_mode: 'open', permission: null };
            expect(canEditInSandbox(block, parentBlock, currentUserId)).toBe(true);
        });
    });

    describe('canDeleteInSandbox', () => {
        const currentUserId = 123;

        test('returns false for null block', () => {
            const parentBlock = { id: 'parent-1', sandbox_mode: 'open' };
            expect(canDeleteInSandbox(null, parentBlock, currentUserId)).toBe(false);
        });

        test('returns false for forbidden block', () => {
            const block = { id: 'block-1', forbidden: true, creator_id: currentUserId };
            const parentBlock = { id: 'parent-1', sandbox_mode: 'open' };
            expect(canDeleteInSandbox(block, parentBlock, currentUserId)).toBe(false);
        });

        test('returns canDelete result for non-sandbox context', () => {
            const block = { id: 'block-1', permission: 'delete' };
            const parentBlock = { id: 'parent-1' };
            expect(canDeleteInSandbox(block, parentBlock, currentUserId)).toBe(true);
        });

        test('returns true for block owner in sandbox', () => {
            const block = { id: 'block-1', creator_id: currentUserId };
            const parentBlock = { id: 'parent-1', sandbox_mode: 'open', permission: 'sandbox' };
            expect(canDeleteInSandbox(block, parentBlock, currentUserId)).toBe(true);
        });

        test('returns false for non-owner in sandbox', () => {
            const block = { id: 'block-1', creator_id: 456 };
            const parentBlock = { id: 'parent-1', sandbox_mode: 'open', permission: 'sandbox' };
            expect(canDeleteInSandbox(block, parentBlock, currentUserId)).toBe(false);
        });

        test('returns true for container owner', () => {
            const block = { id: 'block-1', creator_id: 456 };
            const parentBlock = { id: 'parent-1', sandbox_mode: 'open', permission: 'delete' };
            expect(canDeleteInSandbox(block, parentBlock, currentUserId)).toBe(true);
        });
    });

    describe('getSandboxPermissionAttribute', () => {
        const currentUserId = 123;

        test('returns standard attribute for non-sandbox', () => {
            const block = { id: 'block-1', permission: 'view' };
            const parentBlock = { id: 'parent-1' };
            expect(getSandboxPermissionAttribute(block, parentBlock, currentUserId)).toBe('view-only');
        });

        test('returns forbidden for forbidden block in sandbox', () => {
            const block = { id: 'block-1', forbidden: true };
            const parentBlock = { id: 'parent-1', sandbox_mode: 'open' };
            expect(getSandboxPermissionAttribute(block, parentBlock, currentUserId)).toBe('forbidden');
        });

        test('returns null for own block in sandbox', () => {
            const block = { id: 'block-1', creator_id: currentUserId };
            const parentBlock = { id: 'parent-1', sandbox_mode: 'open', permission: 'sandbox' };
            expect(getSandboxPermissionAttribute(block, parentBlock, currentUserId)).toBe(null);
        });

        test('returns "sandbox-readonly" for other user block in sandbox', () => {
            const block = { id: 'block-1', creator_id: 456 };
            const parentBlock = { id: 'parent-1', sandbox_mode: 'open', permission: 'sandbox' };
            expect(getSandboxPermissionAttribute(block, parentBlock, currentUserId)).toBe('sandbox-readonly');
        });

        test('returns null for container owner viewing other block', () => {
            const block = { id: 'block-1', creator_id: 456 };
            const parentBlock = { id: 'parent-1', sandbox_mode: 'open', permission: 'delete' };
            expect(getSandboxPermissionAttribute(block, parentBlock, currentUserId)).toBe(null);
        });

        test('returns null for non-sandbox parent', () => {
            const block = { id: 'block-1', creator_id: 456 };
            const parentBlock = { id: 'parent-1', permission: 'edit' };
            expect(getSandboxPermissionAttribute(block, parentBlock, currentUserId)).toBe(null);
        });
    });

    // ==========================================
    // Private Sandbox Visibility Tests
    // ==========================================

    describe('canViewInPrivateSandbox', () => {
        const currentUserId = 123;

        test('returns false for null block', () => {
            const parentBlock = { id: 'parent-1', sandbox_mode: 'private' };
            expect(canViewInPrivateSandbox(null, parentBlock, currentUserId)).toBe(false);
        });

        test('returns true for non-sandbox parent (no filtering)', () => {
            const block = { id: 'block-1', creator_id: 456 };
            const parentBlock = { id: 'parent-1' };
            expect(canViewInPrivateSandbox(block, parentBlock, currentUserId)).toBe(true);
        });

        test('returns true for open sandbox (all visible)', () => {
            const block = { id: 'block-1', creator_id: 456 };
            const parentBlock = { id: 'parent-1', sandbox_mode: 'open', permission: 'sandbox' };
            expect(canViewInPrivateSandbox(block, parentBlock, currentUserId)).toBe(true);
        });

        test('returns true for own block in private sandbox', () => {
            const block = { id: 'block-1', creator_id: currentUserId };
            const parentBlock = { id: 'parent-1', sandbox_mode: 'private', permission: 'sandbox' };
            expect(canViewInPrivateSandbox(block, parentBlock, currentUserId)).toBe(true);
        });

        test('returns false for other user block in private sandbox', () => {
            const block = { id: 'block-1', creator_id: 456 };
            const parentBlock = { id: 'parent-1', sandbox_mode: 'private', permission: 'sandbox' };
            expect(canViewInPrivateSandbox(block, parentBlock, currentUserId)).toBe(false);
        });

        test('returns true for container owner in private sandbox (sees all)', () => {
            const block = { id: 'block-1', creator_id: 456 };
            const parentBlock = { id: 'parent-1', sandbox_mode: 'private', permission: 'delete' };
            expect(canViewInPrivateSandbox(block, parentBlock, currentUserId)).toBe(true);
        });

        test('returns true for own sandbox container (sees all)', () => {
            const block = { id: 'block-1', creator_id: 456 };
            const parentBlock = { id: 'parent-1', sandbox_mode: 'private', permission: null };
            expect(canViewInPrivateSandbox(block, parentBlock, currentUserId)).toBe(true);
        });

        test('returns true when parentBlock is null', () => {
            const block = { id: 'block-1', creator_id: 456 };
            expect(canViewInPrivateSandbox(block, null, currentUserId)).toBe(true);
        });
    });

    describe('filterChildrenForPrivateSandbox', () => {
        const currentUserId = 123;

        // Создаём Map блоков для тестирования
        const createBlocksMap = () => {
            const blocks = new Map();
            blocks.set('child-1', { id: 'child-1', creator_id: 123 }); // Свой блок
            blocks.set('child-2', { id: 'child-2', creator_id: 456 }); // Чужой блок
            blocks.set('child-3', { id: 'child-3', creator_id: 123 }); // Свой блок
            blocks.set('child-4', { id: 'child-4', creator_id: 789 }); // Чужой блок
            return blocks;
        };

        test('returns empty array for null childIds', () => {
            const blocks = createBlocksMap();
            const parentBlock = { id: 'parent-1', sandbox_mode: 'private' };
            expect(filterChildrenForPrivateSandbox(null, blocks, parentBlock, currentUserId)).toEqual([]);
        });

        test('returns empty array for non-array childIds', () => {
            const blocks = createBlocksMap();
            const parentBlock = { id: 'parent-1', sandbox_mode: 'private' };
            expect(filterChildrenForPrivateSandbox('invalid', blocks, parentBlock, currentUserId)).toEqual([]);
        });

        test('returns all children for non-sandbox parent', () => {
            const blocks = createBlocksMap();
            const parentBlock = { id: 'parent-1' };
            const childIds = ['child-1', 'child-2', 'child-3', 'child-4'];
            expect(filterChildrenForPrivateSandbox(childIds, blocks, parentBlock, currentUserId))
                .toEqual(['child-1', 'child-2', 'child-3', 'child-4']);
        });

        test('returns all children for open sandbox', () => {
            const blocks = createBlocksMap();
            const parentBlock = { id: 'parent-1', sandbox_mode: 'open', permission: 'sandbox' };
            const childIds = ['child-1', 'child-2', 'child-3', 'child-4'];
            expect(filterChildrenForPrivateSandbox(childIds, blocks, parentBlock, currentUserId))
                .toEqual(['child-1', 'child-2', 'child-3', 'child-4']);
        });

        test('filters to only own blocks in private sandbox', () => {
            const blocks = createBlocksMap();
            const parentBlock = { id: 'parent-1', sandbox_mode: 'private', permission: 'sandbox' };
            const childIds = ['child-1', 'child-2', 'child-3', 'child-4'];
            expect(filterChildrenForPrivateSandbox(childIds, blocks, parentBlock, currentUserId))
                .toEqual(['child-1', 'child-3']);
        });

        test('returns all children for container owner in private sandbox', () => {
            const blocks = createBlocksMap();
            const parentBlock = { id: 'parent-1', sandbox_mode: 'private', permission: 'delete' };
            const childIds = ['child-1', 'child-2', 'child-3', 'child-4'];
            expect(filterChildrenForPrivateSandbox(childIds, blocks, parentBlock, currentUserId))
                .toEqual(['child-1', 'child-2', 'child-3', 'child-4']);
        });

        test('returns all children for own sandbox in private mode', () => {
            const blocks = createBlocksMap();
            const parentBlock = { id: 'parent-1', sandbox_mode: 'private', permission: null };
            const childIds = ['child-1', 'child-2', 'child-3', 'child-4'];
            expect(filterChildrenForPrivateSandbox(childIds, blocks, parentBlock, currentUserId))
                .toEqual(['child-1', 'child-2', 'child-3', 'child-4']);
        });

        test('handles missing blocks in Map', () => {
            const blocks = createBlocksMap();
            const parentBlock = { id: 'parent-1', sandbox_mode: 'private', permission: 'sandbox' };
            const childIds = ['child-1', 'missing-id', 'child-3'];
            // missing-id вернёт undefined из Map, canViewInPrivateSandbox вернёт false для null/undefined
            expect(filterChildrenForPrivateSandbox(childIds, blocks, parentBlock, currentUserId))
                .toEqual(['child-1', 'child-3']);
        });

        test('returns empty array when no own blocks in private sandbox', () => {
            const blocks = new Map();
            blocks.set('child-1', { id: 'child-1', creator_id: 456 });
            blocks.set('child-2', { id: 'child-2', creator_id: 789 });

            const parentBlock = { id: 'parent-1', sandbox_mode: 'private', permission: 'sandbox' };
            const childIds = ['child-1', 'child-2'];
            expect(filterChildrenForPrivateSandbox(childIds, blocks, parentBlock, currentUserId))
                .toEqual([]);
        });
    });
});

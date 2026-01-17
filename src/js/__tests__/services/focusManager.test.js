/**
 * Tests for FocusManager
 */

// Mock localStateManager
const mockBlocks = new Map();

jest.mock('../../stateLocal/localStateManager', () => ({
    localStateManager: {
        blocks: mockBlocks
    }
}));

// Mock dispatch
jest.mock('../../utils/utils', () => ({
    dispatch: jest.fn()
}));

// Mock CalendarGenerator
jest.mock('../../controller/layoutEditor/CalendarGenerator', () => ({
    getISOWeekKey: jest.fn((date) => {
        const d = new Date(date);
        const dayNum = d.getDay() || 7;
        d.setDate(d.getDate() + 4 - dayNum);
        const yearStart = new Date(d.getFullYear(), 0, 1);
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
    })
}));

import { dispatch } from '../../utils/utils';
import { getISOWeekKey } from '../../controller/layoutEditor/CalendarGenerator';

// Import after mocking
const { focusManager } = require('../../services/focusManager');

describe('FocusManager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockBlocks.clear();

        // Reset internal cache
        focusManager.invalidateCache();
    });

    describe('findHomeFocusBlock', () => {
        it('should find block with homePageRole="focus"', () => {
            const focusBlock = {
                id: 'focus-block-id',
                title: 'Focus',
                data: { homePageRole: 'focus' }
            };
            mockBlocks.set('focus-block-id', focusBlock);
            mockBlocks.set('other-block', { id: 'other-block', title: 'Other' });

            const result = focusManager.findHomeFocusBlock();

            expect(result).toBe(focusBlock);
            expect(focusManager._homeFocusBlockId).toBe('focus-block-id');
        });

        it('should return null if no focus block exists', () => {
            mockBlocks.set('other-block', { id: 'other-block', title: 'Other' });

            const result = focusManager.findHomeFocusBlock();

            expect(result).toBeNull();
        });
    });

    describe('findCurrentWeekBlock', () => {
        it('should find week block by current ISO week key', () => {
            const currentWeekKey = getISOWeekKey(new Date());
            const weekBlock = {
                id: 'week-block-id',
                title: 'Week 3',
                data: {
                    calendarType: 'week',
                    isoWeekKey: currentWeekKey
                }
            };
            mockBlocks.set('week-block-id', weekBlock);

            const result = focusManager.findCurrentWeekBlock();

            expect(result).toBe(weekBlock);
            expect(focusManager._currentWeekBlockId).toBe('week-block-id');
        });

        it('should return null if current week block not found', () => {
            const weekBlock = {
                id: 'old-week',
                title: 'Week 1',
                data: {
                    calendarType: 'week',
                    isoWeekKey: '2020-W01' // Old week
                }
            };
            mockBlocks.set('old-week', weekBlock);

            const result = focusManager.findCurrentWeekBlock();

            expect(result).toBeNull();
        });
    });

    describe('findAllFocusContainers', () => {
        it('should find all blocks with isFocusContainer=true', () => {
            mockBlocks.set('container1', {
                id: 'container1',
                title: 'Work',
                data: { isFocusContainer: true, focusContainerName: 'Work' }
            });
            mockBlocks.set('container2', {
                id: 'container2',
                title: 'Personal',
                data: { isFocusContainer: true }
            });
            mockBlocks.set('regular-block', {
                id: 'regular-block',
                title: 'Regular'
            });

            const result = focusManager.findAllFocusContainers();

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                id: 'container1',
                title: 'Work',
                name: 'Work'
            });
            expect(result[1]).toEqual({
                id: 'container2',
                title: 'Personal',
                name: 'Personal'
            });
        });

        it('should return empty array if no containers exist', () => {
            mockBlocks.set('regular-block', { id: 'regular-block', title: 'Regular' });

            const result = focusManager.findAllFocusContainers();

            expect(result).toEqual([]);
        });
    });

    describe('getAllAvailableContainers', () => {
        it('should return both user containers and home focus', () => {
            mockBlocks.set('container1', {
                id: 'container1',
                title: 'Work',
                data: { isFocusContainer: true, focusContainerName: 'Work' }
            });
            mockBlocks.set('focus-block', {
                id: 'focus-block',
                title: 'Focus',
                data: { homePageRole: 'focus' }
            });

            const result = focusManager.getAllAvailableContainers();

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                id: 'container1',
                title: 'Work',
                isHomeFocus: false
            });
            expect(result[1]).toEqual({
                id: 'focus-block',
                title: 'Focus (Home)',
                isHomeFocus: true
            });
        });
    });

    describe('addBlockToFocusContainer', () => {
        it('should dispatch PasteLinkBlock event', () => {
            focusManager.addBlockToFocusContainer('block-id', 'container-id');

            expect(dispatch).toHaveBeenCalledWith('PasteLinkBlock', {
                dest: 'container-id',
                src: ['block-id']
            });
        });

        it('should not dispatch if blockId is missing', () => {
            focusManager.addBlockToFocusContainer(null, 'container-id');

            expect(dispatch).not.toHaveBeenCalled();
        });

        it('should not dispatch if containerId is missing', () => {
            focusManager.addBlockToFocusContainer('block-id', null);

            expect(dispatch).not.toHaveBeenCalled();
        });

        it('should not add block to itself', () => {
            focusManager.addBlockToFocusContainer('same-id', 'same-id');

            expect(dispatch).not.toHaveBeenCalled();
        });
    });

    describe('markAsFocusContainer', () => {
        it('should dispatch UpdateDataBlock with isFocusContainer=true', () => {
            mockBlocks.set('block-id', {
                id: 'block-id',
                title: 'My Block',
                data: { text: 'Some text' }
            });

            focusManager.markAsFocusContainer('block-id', 'Custom Name');

            expect(dispatch).toHaveBeenCalledWith('UpdateDataBlock', {
                blockId: 'block-id',
                data: {
                    text: 'Some text',
                    isFocusContainer: true,
                    focusContainerName: 'Custom Name'
                }
            });
        });

        it('should use block title if name not provided', () => {
            mockBlocks.set('block-id', {
                id: 'block-id',
                title: 'My Block',
                data: {}
            });

            focusManager.markAsFocusContainer('block-id');

            expect(dispatch).toHaveBeenCalledWith('UpdateDataBlock', {
                blockId: 'block-id',
                data: {
                    isFocusContainer: true,
                    focusContainerName: 'My Block'
                }
            });
        });

        it('should not dispatch if block not found', () => {
            focusManager.markAsFocusContainer('nonexistent-id');

            expect(dispatch).not.toHaveBeenCalled();
        });
    });

    describe('unmarkAsFocusContainer', () => {
        it('should remove isFocusContainer and focusContainerName', () => {
            mockBlocks.set('block-id', {
                id: 'block-id',
                title: 'Container',
                data: {
                    text: 'Keep this',
                    isFocusContainer: true,
                    focusContainerName: 'Container'
                }
            });

            focusManager.unmarkAsFocusContainer('block-id');

            expect(dispatch).toHaveBeenCalledWith('UpdateDataBlock', {
                blockId: 'block-id',
                data: { text: 'Keep this' }
            });
        });
    });

    describe('isFocusContainer', () => {
        it('should return true for focus containers', () => {
            mockBlocks.set('container', {
                id: 'container',
                data: { isFocusContainer: true }
            });

            expect(focusManager.isFocusContainer('container')).toBe(true);
        });

        it('should return false for regular blocks', () => {
            mockBlocks.set('regular', {
                id: 'regular',
                data: {}
            });

            expect(focusManager.isFocusContainer('regular')).toBe(false);
        });

        it('should return false for nonexistent blocks', () => {
            expect(focusManager.isFocusContainer('nonexistent')).toBe(false);
        });
    });

    describe('updateCurrentWeekLink', () => {
        it('should skip if no home focus block', async () => {
            await focusManager.updateCurrentWeekLink();

            expect(dispatch).not.toHaveBeenCalled();
        });

        it('should skip if no current week block in calendar', async () => {
            mockBlocks.set('focus-block', {
                id: 'focus-block',
                title: 'Focus',
                data: { homePageRole: 'focus', childOrder: [] }
            });

            await focusManager.updateCurrentWeekLink();

            expect(dispatch).not.toHaveBeenCalled();
        });

        it('should add link to current week if not present', async () => {
            const currentWeekKey = getISOWeekKey(new Date());

            mockBlocks.set('focus-block', {
                id: 'focus-block',
                title: 'Focus',
                data: { homePageRole: 'focus', childOrder: [] }
            });
            mockBlocks.set('current-week', {
                id: 'current-week',
                title: 'Week',
                data: {
                    calendarType: 'week',
                    isoWeekKey: currentWeekKey
                }
            });

            await focusManager.updateCurrentWeekLink();

            expect(dispatch).toHaveBeenCalledWith('PasteLinkBlock', {
                dest: 'focus-block',
                src: ['current-week']
            });
        });

        it('should not add duplicate link if already exists', async () => {
            const currentWeekKey = getISOWeekKey(new Date());

            mockBlocks.set('focus-block', {
                id: 'focus-block',
                title: 'Focus',
                data: { homePageRole: 'focus', childOrder: ['existing-link'] }
            });
            mockBlocks.set('existing-link', {
                id: 'existing-link',
                data: {
                    view: 'link',
                    source: 'current-week'
                }
            });
            mockBlocks.set('current-week', {
                id: 'current-week',
                title: 'Week',
                data: {
                    calendarType: 'week',
                    isoWeekKey: currentWeekKey
                }
            });

            await focusManager.updateCurrentWeekLink();

            // Should not create a new link
            expect(dispatch).not.toHaveBeenCalledWith('PasteLinkBlock', expect.anything());
        });

        it('should remove old week links and add current week', async () => {
            const currentWeekKey = getISOWeekKey(new Date());

            mockBlocks.set('focus-block', {
                id: 'focus-block',
                title: 'Focus',
                data: { homePageRole: 'focus', childOrder: ['old-week-link'] }
            });
            mockBlocks.set('old-week-link', {
                id: 'old-week-link',
                data: {
                    view: 'link',
                    calendarType: 'weekLink',
                    isoWeekKey: '2020-W01' // Old week
                }
            });
            mockBlocks.set('current-week', {
                id: 'current-week',
                title: 'Week',
                data: {
                    calendarType: 'week',
                    isoWeekKey: currentWeekKey
                }
            });

            await focusManager.updateCurrentWeekLink();

            // Should delete old link
            expect(dispatch).toHaveBeenCalledWith('DeleteTreeBlock', {
                blockId: 'old-week-link'
            });
            // Should create new link
            expect(dispatch).toHaveBeenCalledWith('PasteLinkBlock', {
                dest: 'focus-block',
                src: ['current-week']
            });
        });
    });

    describe('initializeWeekLinkIfNeeded', () => {
        it('should call updateCurrentWeekLink for empty home focus', async () => {
            const currentWeekKey = getISOWeekKey(new Date());

            mockBlocks.set('focus-block', {
                id: 'focus-block',
                title: 'Focus',
                data: { homePageRole: 'focus', childOrder: [] }
            });
            mockBlocks.set('current-week', {
                id: 'current-week',
                data: {
                    calendarType: 'week',
                    isoWeekKey: currentWeekKey
                }
            });

            await focusManager.initializeWeekLinkIfNeeded();

            expect(dispatch).toHaveBeenCalledWith('PasteLinkBlock', expect.anything());
        });

        it('should skip if no home focus block', async () => {
            await focusManager.initializeWeekLinkIfNeeded();

            expect(dispatch).not.toHaveBeenCalled();
        });
    });

    describe('caching behavior', () => {
        it('should return cached value on second call to findHomeFocusBlock', () => {
            const focusBlock = {
                id: 'focus-id',
                data: { homePageRole: 'focus' }
            };
            mockBlocks.set('focus-id', focusBlock);

            const result1 = focusManager.findHomeFocusBlock();
            const result2 = focusManager.findHomeFocusBlock();

            expect(result1).toBe(result2);
            expect(focusManager._homeFocusBlockId).toBe('focus-id');
        });

        it('should return cached value on second call to findAllFocusContainers', () => {
            mockBlocks.set('container1', {
                id: 'container1',
                title: 'Work',
                data: { isFocusContainer: true }
            });

            const result1 = focusManager.findAllFocusContainers();
            const result2 = focusManager.findAllFocusContainers();

            expect(result1).toEqual(result2);
            expect(focusManager._focusContainersCache).not.toBeNull();
        });

        it('should invalidate cache when block is deleted from cache', () => {
            const focusBlock = {
                id: 'focus-id',
                data: { homePageRole: 'focus' }
            };
            mockBlocks.set('focus-id', focusBlock);

            // Prime the cache
            focusManager.findHomeFocusBlock();
            expect(focusManager._homeFocusBlockId).toBe('focus-id');

            // Delete the block
            mockBlocks.delete('focus-id');

            // Should detect invalid cache and return null
            const result = focusManager.findHomeFocusBlock();
            expect(result).toBeNull();
            expect(focusManager._homeFocusBlockId).toBeNull();
        });

        it('should invalidate containers cache when markAsFocusContainer is called', () => {
            mockBlocks.set('block-id', {
                id: 'block-id',
                title: 'Block',
                data: {}
            });

            // Prime the cache
            focusManager.findAllFocusContainers();
            expect(focusManager._focusContainersCache).not.toBeNull();

            // Mark as container should invalidate
            focusManager.markAsFocusContainer('block-id');
            expect(focusManager._focusContainersCache).toBeNull();
        });

        it('should invalidate containers cache when unmarkAsFocusContainer is called', () => {
            mockBlocks.set('container-id', {
                id: 'container-id',
                title: 'Container',
                data: { isFocusContainer: true }
            });

            // Prime the cache
            focusManager.findAllFocusContainers();
            expect(focusManager._focusContainersCache).not.toBeNull();

            // Unmark should invalidate
            focusManager.unmarkAsFocusContainer('container-id');
            expect(focusManager._focusContainersCache).toBeNull();
        });

        it('should invalidate cache via invalidateCache method', () => {
            mockBlocks.set('focus-id', {
                id: 'focus-id',
                data: { homePageRole: 'focus' }
            });
            mockBlocks.set('container-id', {
                id: 'container-id',
                data: { isFocusContainer: true }
            });

            // Prime all caches
            focusManager.findHomeFocusBlock();
            focusManager.findAllFocusContainers();

            expect(focusManager._homeFocusBlockId).toBe('focus-id');
            expect(focusManager._focusContainersCache).not.toBeNull();

            // Invalidate all
            focusManager.invalidateCache();

            expect(focusManager._homeFocusBlockId).toBeNull();
            expect(focusManager._currentWeekBlockId).toBeNull();
            expect(focusManager._currentWeekKey).toBeNull();
            expect(focusManager._focusContainersCache).toBeNull();
        });

        it('should detect new containers added externally', () => {
            // Start with one container
            mockBlocks.set('container1', {
                id: 'container1',
                data: { isFocusContainer: true }
            });

            const result1 = focusManager.findAllFocusContainers();
            expect(result1).toHaveLength(1);

            // Add another container externally (simulating WebSocket update)
            mockBlocks.set('container2', {
                id: 'container2',
                data: { isFocusContainer: true }
            });

            // Invalidate cache (as would happen via WebSocket event)
            focusManager.invalidateContainersCache();

            const result2 = focusManager.findAllFocusContainers();
            expect(result2).toHaveLength(2);
        });
    });
});

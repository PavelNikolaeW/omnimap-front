const mockGetUpdates = jest.fn();

jest.mock('localforage', () => ({
    getItem: jest.fn(),
    keys: jest.fn(),
    setItem: jest.fn(),
}));

const localforage = require('localforage');
const { SincManager } = require('../../sincManager/sincManager');
const config = require('../../config').default;

describe('SincManager.requestIncrementalUpdates', () => {
    const initialSyncV2Enabled = config.SYNC_V2_ENABLED;

    function createManager() {
        const manager = Object.create(SincManager.prototype);
        manager.webSocket = { getUpdates: mockGetUpdates, getUpdatesV2: jest.fn() };
        manager.loadFullTree = jest.fn();
        manager._incrementalSyncPromise = null;
        manager._fullResyncPromise = null;
        return manager;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        config.SYNC_V2_ENABLED = initialSyncV2Enabled;
    });

    afterAll(() => {
        config.SYNC_V2_ENABLED = initialSyncV2Enabled;
    });

    test('sends exact timestamp for ISO updated_at', async () => {
        const updatedAt = '2026-02-06T12:34:56.999Z';

        localforage.getItem.mockImplementation(async (key) => {
            if (key === 'currentUser') return 'user1';
            if (key === 'Block_block-1_user1') {
                return { id: 'block-1', updated_at: updatedAt };
            }
            return null;
        });
        localforage.keys.mockResolvedValue(['Block_block-1_user1']);

        const manager = createManager();
        await manager.requestIncrementalUpdates();

        const expectedTs = Math.floor(new Date(updatedAt).getTime() / 1000);
        expect(mockGetUpdates).toHaveBeenCalledWith([
            { id: 'block-1', updated_at: expectedTs }
        ]);

    });

    test('parses numeric seconds string updated_at without safety margin', async () => {
        localforage.getItem.mockImplementation(async (key) => {
            if (key === 'currentUser') return 'user2';
            if (key === 'Block_block-2_user2') {
                return { id: 'block-2', updated_at: '1730000000' };
            }
            return null;
        });
        localforage.keys.mockResolvedValue(['Block_block-2_user2']);

        const manager = createManager();
        await manager.requestIncrementalUpdates();

        expect(mockGetUpdates).toHaveBeenCalledWith([
            { id: 'block-2', updated_at: 1730000000 }
        ]);

    });

    test('skips invalid updated_at values when fallback is disabled', async () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        localforage.getItem.mockImplementation(async (key) => {
            if (key === 'currentUser') return 'user3';
            if (key === 'Block_bad_user3') {
                return { id: 'bad', updated_at: 'not-a-date' };
            }
            return null;
        });
        localforage.keys.mockResolvedValue(['Block_bad_user3']);

        const manager = createManager();
        await manager.requestIncrementalUpdates(false);

        expect(mockGetUpdates).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith('SincManager: invalid updated_at for block:', 'bad');

        warnSpy.mockRestore();
    });

    test('deduplicates parallel incremental sync calls', async () => {
        let resolveCurrentUser;
        let resolveKeys;
        localforage.getItem.mockImplementation((key) => {
            if (key === 'currentUser') {
                return new Promise((resolve) => {
                    resolveCurrentUser = resolve;
                });
            }
            if (key === 'Block_block-4_user4') {
                return Promise.resolve({ id: 'block-4', updated_at: '2026-02-06T12:00:00Z' });
            }
            return Promise.resolve(null);
        });
        localforage.keys.mockImplementation(() => new Promise((resolve) => {
            resolveKeys = resolve;
        }));

        const manager = createManager();

        const p1 = manager.requestIncrementalUpdates();
        const p2 = manager.requestIncrementalUpdates();

        resolveCurrentUser('user4');
        await Promise.resolve();
        resolveKeys(['Block_block-4_user4']);
        await Promise.all([p1, p2]);

        expect(localforage.keys).toHaveBeenCalledTimes(1);
        expect(mockGetUpdates).toHaveBeenCalledTimes(1);
        expect(mockGetUpdates).toHaveBeenCalledWith([
            { id: 'block-4', updated_at: 1770379200 }
        ]);
    });

    test('uses v2 path when SYNC_V2_ENABLED is true', async () => {
        config.SYNC_V2_ENABLED = true;

        localforage.getItem.mockImplementation(async (key) => {
            if (key === 'currentUser') return 'user-v2';
            return null;
        });

        const manager = createManager();
        manager._requestIncrementalUpdatesV2 = jest.fn().mockResolvedValue(undefined);

        await manager.requestIncrementalUpdates();

        expect(manager._requestIncrementalUpdatesV2).toHaveBeenCalledWith('user-v2', true);
        expect(mockGetUpdates).not.toHaveBeenCalled();
    });

    test('falls back to v1 when v2 path fails', async () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        config.SYNC_V2_ENABLED = true;

        localforage.getItem.mockImplementation(async (key) => {
            if (key === 'currentUser') return 'user-fallback';
            if (key === 'Block_block-5_user-fallback') {
                return { id: 'block-5', updated_at: '2026-02-06T12:00:00Z' };
            }
            return null;
        });
        localforage.keys.mockResolvedValue(['Block_block-5_user-fallback']);

        const manager = createManager();
        manager._requestIncrementalUpdatesV2 = jest.fn().mockRejectedValue(new Error('v2 failed'));

        await manager.requestIncrementalUpdates();

        expect(manager._requestIncrementalUpdatesV2).toHaveBeenCalledWith('user-fallback', true);
        expect(mockGetUpdates).toHaveBeenCalledTimes(1);

        warnSpy.mockRestore();
    });

    test('handles full resync request from sync service', async () => {
        const manager = createManager();
        manager.loadFullTree = jest.fn().mockResolvedValue(undefined);

        await manager._handleSyncFullResyncRequired({
            detail: { reason: 'no_subscriptions' },
        });

        expect(manager.loadFullTree).toHaveBeenCalledWith(false);
    });

    test('deduplicates parallel full resync requests', async () => {
        const manager = createManager();
        let resolveResync;
        manager.loadFullTree = jest.fn().mockImplementation(() => new Promise((resolve) => {
            resolveResync = resolve;
        }));

        const p1 = manager._handleSyncFullResyncRequired({ detail: { reason: 'no_subscriptions' } });
        const p2 = manager._handleSyncFullResyncRequired({ detail: { reason: 'no_subscriptions' } });

        expect(manager.loadFullTree).toHaveBeenCalledTimes(1);
        resolveResync();
        await Promise.all([p1, p2]);
    });
});

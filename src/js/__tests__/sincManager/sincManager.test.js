const mockGetUpdates = jest.fn();

jest.mock('localforage', () => ({
    getItem: jest.fn(),
    keys: jest.fn(),
    setItem: jest.fn(),
}));

const localforage = require('localforage');
const { SincManager } = require('../../sincManager/sincManager');

describe('SincManager.requestIncrementalUpdates', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('adds 1-second safety margin for ISO updated_at timestamps', async () => {
        const updatedAt = '2026-02-06T12:34:56.999Z';

        localforage.getItem.mockImplementation(async (key) => {
            if (key === 'currentUser') return 'user1';
            if (key === 'Block_block-1_user1') {
                return { id: 'block-1', updated_at: updatedAt };
            }
            return null;
        });
        localforage.keys.mockResolvedValue(['Block_block-1_user1']);

        const manager = Object.create(SincManager.prototype);
        manager.webSocket = { getUpdates: mockGetUpdates };
        manager.loadFullTree = jest.fn();
        await manager.requestIncrementalUpdates();

        const expectedTs = Math.floor(new Date(updatedAt).getTime() / 1000) - 1;
        expect(mockGetUpdates).toHaveBeenCalledWith([
            { id: 'block-1', updated_at: expectedTs }
        ]);

    });

    test('parses numeric seconds string updated_at correctly', async () => {
        localforage.getItem.mockImplementation(async (key) => {
            if (key === 'currentUser') return 'user2';
            if (key === 'Block_block-2_user2') {
                return { id: 'block-2', updated_at: '1730000000' };
            }
            return null;
        });
        localforage.keys.mockResolvedValue(['Block_block-2_user2']);

        const manager = Object.create(SincManager.prototype);
        manager.webSocket = { getUpdates: mockGetUpdates };
        manager.loadFullTree = jest.fn();
        await manager.requestIncrementalUpdates();

        expect(mockGetUpdates).toHaveBeenCalledWith([
            { id: 'block-2', updated_at: 1729999999 }
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

        const manager = Object.create(SincManager.prototype);
        manager.webSocket = { getUpdates: mockGetUpdates };
        manager.loadFullTree = jest.fn();
        await manager.requestIncrementalUpdates(false);

        expect(mockGetUpdates).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith('SincManager: invalid updated_at for block:', 'bad');

        warnSpy.mockRestore();
    });
});

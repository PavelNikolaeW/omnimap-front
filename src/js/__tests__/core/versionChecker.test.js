/**
 * @jest-environment jsdom
 */

describe('VersionChecker checkPendingOperations', () => {
    beforeEach(() => {
        jest.resetModules();
        global.APP_VERSION = 'test-version';
    });

    afterEach(() => {
        delete global.APP_VERSION;
        jest.clearAllMocks();
    });

    it('returns false when offlineQueue dynamic import fails with stale chunk error', async () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        jest.doMock('../../sincManager/offlineQueue.js', () => {
            throw new Error('Loading chunk 123 failed');
        });

        const { versionChecker } = await import('../../core/versionChecker');
        await expect(versionChecker.checkPendingOperations()).resolves.toBe(false);

        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('returns true when offline queue has pending operations', async () => {
        const getPendingCount = jest.fn().mockResolvedValue(2);

        jest.doMock('../../sincManager/offlineQueue.js', () => ({
            offlineQueue: {
                getPendingCount,
            },
        }));

        const { versionChecker } = await import('../../core/versionChecker');
        await expect(versionChecker.checkPendingOperations()).resolves.toBe(true);
        expect(getPendingCount).toHaveBeenCalledTimes(1);
    });
});

import { Page, BrowserContext, test as base, expect } from '@playwright/test';

/**
 * Хелпер для тестирования offline-функциональности
 *
 * Позволяет:
 * - Переключать состояние сети
 * - Ожидать появления индикаторов offline/online
 * - Проверять данные в IndexedDB
 * - Работать с очередью offline-операций
 */
export class OfflineHelper {
  constructor(
    private page: Page,
    private context: BrowserContext
  ) {}

  /**
   * Переводит браузер в offline режим
   */
  async goOffline(): Promise<void> {
    await this.context.setOffline(true);
  }

  /**
   * Возвращает браузер в online режим
   */
  async goOnline(): Promise<void> {
    await this.context.setOffline(false);
  }

  /**
   * Проверяет текущий статус сети
   */
  async isOffline(): Promise<boolean> {
    return await this.page.evaluate(() => !navigator.onLine);
  }

  /**
   * Ожидает появления индикатора offline
   */
  async waitForOfflineIndicator(timeout = 5000): Promise<void> {
    const indicator = this.page.locator('.network-status.offline, [data-testid="offline-indicator"]');
    await expect(indicator).toBeVisible({ timeout });
  }

  /**
   * Ожидает появления индикатора online (восстановление связи)
   */
  async waitForOnlineIndicator(timeout = 5000): Promise<void> {
    const indicator = this.page.locator('.network-status:not(.offline), [data-testid="online-indicator"]');
    await expect(indicator).toBeVisible({ timeout });
  }

  /**
   * Ожидает скрытия индикатора статуса сети
   */
  async waitForStatusHidden(timeout = 10000): Promise<void> {
    const indicator = this.page.locator('.network-status');
    await expect(indicator).not.toBeVisible({ timeout });
  }

  /**
   * Получает данные из IndexedDB через localforage
   */
  async getFromIndexedDB<T>(key: string): Promise<T | null> {
    return await this.page.evaluate(async (k) => {
      const localforage = (window as any).localforage;
      if (!localforage) return null;
      return await localforage.getItem(k);
    }, key);
  }

  /**
   * Сохраняет данные в IndexedDB через localforage
   */
  async setInIndexedDB(key: string, value: any): Promise<void> {
    await this.page.evaluate(
      async ({ k, v }) => {
        const localforage = (window as any).localforage;
        if (!localforage) return;
        await localforage.setItem(k, v);
      },
      { k: key, v: value }
    );
  }

  /**
   * Получает все ключи из IndexedDB
   */
  async getIndexedDBKeys(): Promise<string[]> {
    return await this.page.evaluate(async () => {
      const localforage = (window as any).localforage;
      if (!localforage) return [];
      return await localforage.keys();
    });
  }

  /**
   * Получает все блоки из IndexedDB
   */
  async getBlocksFromIndexedDB(): Promise<any[]> {
    return await this.page.evaluate(async () => {
      const localforage = (window as any).localforage;
      if (!localforage) return [];

      const keys = await localforage.keys();
      const blockKeys = keys.filter((k: string) => k.startsWith('Block_'));
      const blocks = [];

      for (const key of blockKeys) {
        const block = await localforage.getItem(key);
        if (block) blocks.push(block);
      }

      return blocks;
    });
  }

  /**
   * Получает очередь offline-операций
   */
  async getOfflineQueue(): Promise<any[]> {
    const queue = await this.getFromIndexedDB<any[]>('offlineOperationsQueue');
    return queue || [];
  }

  /**
   * Очищает очередь offline-операций
   */
  async clearOfflineQueue(): Promise<void> {
    await this.setInIndexedDB('offlineOperationsQueue', []);
  }

  /**
   * Проверяет, что блок с указанным ID существует в IndexedDB
   */
  async blockExistsInIndexedDB(blockId: string): Promise<boolean> {
    const block = await this.getFromIndexedDB(`Block_${blockId}`);
    return block !== null;
  }

  /**
   * Проверяет, что блок с указанным названием существует в IndexedDB
   */
  async blockWithTitleExistsInIndexedDB(title: string): Promise<boolean> {
    const blocks = await this.getBlocksFromIndexedDB();
    return blocks.some((b) => b.title === title);
  }

  /**
   * Симулирует быстрое переключение online/offline
   * Полезно для тестирования edge cases
   */
  async rapidNetworkToggle(count: number, delayMs = 100): Promise<void> {
    for (let i = 0; i < count; i++) {
      await this.goOffline();
      await this.page.waitForTimeout(delayMs);
      await this.goOnline();
      await this.page.waitForTimeout(delayMs);
    }
  }

  /**
   * Ожидает синхронизации очереди (очередь пуста или обработана)
   */
  async waitForQueueSync(timeout = 10000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const queue = await this.getOfflineQueue();
      if (queue.length === 0) {
        return;
      }
      await this.page.waitForTimeout(500);
    }

    throw new Error('Timeout waiting for offline queue sync');
  }

  /**
   * Получает текущего пользователя из IndexedDB
   */
  async getCurrentUser(): Promise<string | null> {
    return await this.getFromIndexedDB<string>('currentUser');
  }

  /**
   * Получает treeIds текущего пользователя
   */
  async getTreeIds(): Promise<string[] | null> {
    const currentUser = await this.getCurrentUser();
    if (!currentUser) return null;
    return await this.getFromIndexedDB<string[]>(`treeIds${currentUser}`);
  }
}

/**
 * Fixture с offline хелпером
 */
type OfflineFixtures = {
  offlineHelper: OfflineHelper;
};

export const test = base.extend<OfflineFixtures>({
  offlineHelper: async ({ page, context }, use) => {
    const helper = new OfflineHelper(page, context);
    await use(helper);
  },
});

export { expect };

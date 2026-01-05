import { Page, expect } from '@playwright/test';

/**
 * Структура блока в IndexedDB
 */
export interface StoredBlock {
  id: string;
  title: string;
  parent_id: string | null;
  children: string[];
  data: {
    text?: string;
    color?: string[];
    childOrder?: string[];
    connections?: any[];
    customStyles?: any;
    [key: string]: any;
  };
  updated_at: string;
}

/**
 * Хелпер для работы с локальным хранилищем (IndexedDB через localforage)
 *
 * Позволяет:
 * - Читать блоки из IndexedDB
 * - Проверять, что блок сохранён корректно
 * - Сравнивать локальные данные с ожидаемыми
 */
export class StorageHelper {
  constructor(private page: Page) {}

  /**
   * Получает текущего пользователя из IndexedDB
   */
  async getCurrentUser(): Promise<string | null> {
    return await this.page.evaluate(async () => {
      const localforage = (window as any).localforage;
      if (!localforage) return null;
      return await localforage.getItem('currentUser');
    });
  }

  /**
   * Получает блок из IndexedDB по ID
   * Использует нативный IndexedDB API если localforage недоступен
   */
  async getBlock(blockId: string): Promise<StoredBlock | null> {
    return await this.page.evaluate(async (id) => {
      // Пробуем через localforage если доступен
      const localforage = (window as any).localforage;
      if (localforage) {
        const user = await localforage.getItem('currentUser');
        if (!user) return null;
        const key = `Block_${id}_${user}`;
        return await localforage.getItem(key);
      }

      // Fallback: напрямую через IndexedDB
      return new Promise((resolve) => {
        const request = indexedDB.open('localforage');
        request.onerror = () => resolve(null);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('keyvaluepairs')) {
            resolve(null);
            return;
          }
          const tx = db.transaction('keyvaluepairs', 'readonly');
          const store = tx.objectStore('keyvaluepairs');

          // Сначала получаем currentUser
          const userRequest = store.get('currentUser');
          userRequest.onsuccess = () => {
            const user = userRequest.result;
            if (!user) {
              resolve(null);
              return;
            }
            // Теперь получаем блок
            const key = `Block_${id}_${user}`;
            const blockRequest = store.get(key);
            blockRequest.onsuccess = () => resolve(blockRequest.result || null);
            blockRequest.onerror = () => resolve(null);
          };
          userRequest.onerror = () => resolve(null);
        };
      });
    }, blockId);
  }

  /**
   * Получает все блоки текущего пользователя
   */
  async getAllBlocks(): Promise<StoredBlock[]> {
    return await this.page.evaluate(async () => {
      const localforage = (window as any).localforage;
      if (!localforage) return [];

      const user = await localforage.getItem('currentUser');
      if (!user) return [];

      const keys = await localforage.keys();
      const pattern = new RegExp(`^Block_.*_${user}$`);
      const blockKeys = keys.filter((key: string) => pattern.test(key));

      const blocks: any[] = [];
      for (const key of blockKeys) {
        const block = await localforage.getItem(key);
        if (block) blocks.push(block);
      }

      return blocks;
    });
  }

  /**
   * Получает список ID деревьев пользователя
   */
  async getTreeIds(): Promise<string[]> {
    return await this.page.evaluate(async () => {
      const localforage = (window as any).localforage;
      if (!localforage) return [];

      const user = await localforage.getItem('currentUser');
      if (!user) return [];

      const treeIds = await localforage.getItem(`treeIds${user}`);
      return treeIds || [];
    });
  }

  /**
   * Получает текущее активное дерево
   */
  async getCurrentTree(): Promise<string | null> {
    return await this.page.evaluate(async () => {
      const localforage = (window as any).localforage;
      if (!localforage) return null;
      return await localforage.getItem('currentTree');
    });
  }

  /**
   * Получает путь навигации для текущего дерева
   */
  async getCurrentPath(): Promise<any[] | null> {
    return await this.page.evaluate(async () => {
      const localforage = (window as any).localforage;
      if (!localforage) return null;

      const user = await localforage.getItem('currentUser');
      const tree = await localforage.getItem('currentTree');
      if (!user || !tree) return null;

      return await localforage.getItem(`Path_${tree}${user}`);
    });
  }

  /**
   * Проверяет, что блок существует в хранилище
   */
  async assertBlockExists(blockId: string): Promise<void> {
    const block = await this.getBlock(blockId);
    expect(block).not.toBeNull();
  }

  /**
   * Проверяет, что блок НЕ существует в хранилище
   */
  async assertBlockNotExists(blockId: string): Promise<void> {
    const block = await this.getBlock(blockId);
    expect(block).toBeNull();
  }

  /**
   * Проверяет, что блок сохранён с правильным названием
   */
  async assertBlockTitle(blockId: string, expectedTitle: string): Promise<void> {
    const block = await this.getBlock(blockId);
    expect(block).not.toBeNull();
    expect(block!.title).toBe(expectedTitle);
  }

  /**
   * Проверяет, что блок имеет правильного родителя
   */
  async assertBlockParent(blockId: string, expectedParentId: string | null): Promise<void> {
    const block = await this.getBlock(blockId);
    expect(block).not.toBeNull();
    expect(block!.parent_id).toBe(expectedParentId);
  }

  /**
   * Проверяет, что блок содержит ожидаемый текст
   */
  async assertBlockText(blockId: string, expectedText: string): Promise<void> {
    const block = await this.getBlock(blockId);
    expect(block).not.toBeNull();
    // Текст может быть обёрнут в HTML, проверяем содержимое
    expect(block!.data?.text || '').toContain(expectedText);
  }

  /**
   * Проверяет, что у блока есть указанные дочерние блоки
   */
  async assertBlockChildren(blockId: string, expectedChildIds: string[]): Promise<void> {
    const block = await this.getBlock(blockId);
    expect(block).not.toBeNull();
    expect(block!.children).toEqual(expect.arrayContaining(expectedChildIds));
  }

  /**
   * Проверяет полное соответствие блока ожидаемым данным
   * @param blockId - ID блока
   * @param expected - Ожидаемые поля блока (частичное соответствие)
   */
  async assertBlockMatches(
    blockId: string,
    expected: Partial<StoredBlock>
  ): Promise<void> {
    const block = await this.getBlock(blockId);
    expect(block).not.toBeNull();

    if (expected.title !== undefined) {
      expect(block!.title).toBe(expected.title);
    }
    if (expected.parent_id !== undefined) {
      expect(block!.parent_id).toBe(expected.parent_id);
    }
    if (expected.children !== undefined) {
      expect(block!.children).toEqual(expect.arrayContaining(expected.children));
    }
    if (expected.data !== undefined) {
      // Проверяем каждое поле data отдельно
      for (const [key, value] of Object.entries(expected.data)) {
        if (key === 'text') {
          // Текст может быть в HTML, проверяем содержимое
          expect(block!.data?.text || '').toContain(value);
        } else {
          expect(block!.data?.[key]).toEqual(value);
        }
      }
    }
  }

  /**
   * Ожидает сохранения блока в IndexedDB
   */
  async waitForBlockSaved(
    blockId: string,
    options: { timeout?: number; pollInterval?: number } = {}
  ): Promise<StoredBlock> {
    const { timeout = 10000, pollInterval = 200 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const block = await this.getBlock(blockId);
      if (block) return block;
      await this.page.waitForTimeout(pollInterval);
    }

    // Для отладки: выводим состояние IndexedDB
    const debugInfo = await this.page.evaluate(async () => {
      const lf = (window as any).localforage;
      if (!lf) return { error: 'localforage not available' };
      const user = await lf.getItem('currentUser');
      const keys = await lf.keys();
      return { user, totalKeys: keys.length, sampleKeys: keys.slice(0, 10) };
    });
    console.log(`[Storage] Debug info:`, JSON.stringify(debugInfo));
    console.log(`[Storage] Looking for Block_${blockId}`);

    throw new Error(`Block ${blockId} not saved to IndexedDB within ${timeout}ms`);
  }

  /**
   * Ожидает обновления блока (по updated_at)
   */
  async waitForBlockUpdated(
    blockId: string,
    afterTimestamp: number,
    options: { timeout?: number; pollInterval?: number } = {}
  ): Promise<StoredBlock> {
    const { timeout = 10000, pollInterval = 200 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const block = await this.getBlock(blockId);
      if (block) {
        const blockTimestamp = new Date(block.updated_at).getTime();
        if (blockTimestamp > afterTimestamp) return block;
      }
      await this.page.waitForTimeout(pollInterval);
    }

    throw new Error(`Block ${blockId} not updated after ${afterTimestamp} within ${timeout}ms`);
  }

  /**
   * Ожидает удаления блока из IndexedDB
   */
  async waitForBlockDeleted(
    blockId: string,
    options: { timeout?: number; pollInterval?: number } = {}
  ): Promise<void> {
    const { timeout = 10000, pollInterval = 200 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const block = await this.getBlock(blockId);
      if (!block) return;
      await this.page.waitForTimeout(pollInterval);
    }

    throw new Error(`Block ${blockId} not deleted from IndexedDB within ${timeout}ms`);
  }

  /**
   * Очищает все данные пользователя из хранилища
   */
  async clearUserData(): Promise<void> {
    await this.page.evaluate(async () => {
      const localforage = (window as any).localforage;
      if (!localforage) return;

      const user = await localforage.getItem('currentUser');
      if (!user) return;

      const keys = await localforage.keys();
      const pattern = new RegExp(`.*${user}.*`);
      const userKeys = keys.filter((key: string) => pattern.test(key));

      for (const key of userKeys) {
        await localforage.removeItem(key);
      }
    });
  }

  /**
   * Получает все ключи из IndexedDB
   */
  async getAllKeys(): Promise<string[]> {
    return await this.page.evaluate(async () => {
      // Пробуем через localforage
      const localforage = (window as any).localforage;
      if (localforage) {
        return await localforage.keys();
      }

      // Fallback: напрямую через IndexedDB
      return new Promise((resolve) => {
        const request = indexedDB.open('localforage');
        request.onerror = () => resolve([]);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('keyvaluepairs')) {
            resolve([]);
            return;
          }
          const tx = db.transaction('keyvaluepairs', 'readonly');
          const store = tx.objectStore('keyvaluepairs');
          const keysRequest = store.getAllKeys();
          keysRequest.onsuccess = () => resolve(keysRequest.result as string[]);
          keysRequest.onerror = () => resolve([]);
        };
      });
    });
  }

  /**
   * Получает значение по ключу
   */
  async getValue(key: string): Promise<any> {
    return await this.page.evaluate(async (k) => {
      const localforage = (window as any).localforage;
      if (!localforage) return null;
      return await localforage.getItem(k);
    }, key);
  }
}

/**
 * Фабрика для создания StorageHelper
 */
export function createStorageHelper(page: Page): StorageHelper {
  return new StorageHelper(page);
}

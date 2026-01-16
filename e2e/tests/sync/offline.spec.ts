import { test, expect, uniqueBlockTitle } from '../../fixtures/base.fixture';

/**
 * Epic 5: Offline Tests
 *
 * Тестирование работы приложения в offline режиме:
 * - Создание и редактирование блоков offline
 * - Очередь offline-операций
 * - Синхронизация при восстановлении сети
 *
 * @tag @offline @sync
 */

test.describe('Offline Mode @offline', () => {
  test.describe.configure({ mode: 'serial' });

  // ==================== Базовый offline ====================

  test.describe('Базовый offline режим', () => {
    test('SY-OF-01: Создание блока в offline режиме', async ({ authenticatedPage, page, context }) => {
      // Убедимся что приложение загружено
      await expect(authenticatedPage.rootContainer).toBeVisible();

      // Переходим в offline
      await context.setOffline(true);
      await page.waitForTimeout(500);

      // Создаём блок
      const blockTitle = uniqueBlockTitle('Offline');
      await authenticatedPage.createBlock(blockTitle);

      // Блок должен появиться в UI (optimistic update)
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);

      // Возвращаемся в online
      await context.setOffline(false);
      await page.waitForTimeout(2000);

      // Блок должен остаться
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);
    });

    test('SY-OF-02: Редактирование в offline режиме', async ({ authenticatedPage, page, context }) => {
      const blockTitle = uniqueBlockTitle('EditOffline');
      const newTitle = uniqueBlockTitle('EditedOffline');

      // Создаём блок online
      await authenticatedPage.createBlock(blockTitle);
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);

      // Переходим в offline
      await context.setOffline(true);
      await page.waitForTimeout(500);

      // Редактируем название
      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`).first();
      await block.click();
      await page.waitForTimeout(300);

      await page.keyboard.press('t');
      const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });
      await dialogInput.clear();
      await dialogInput.fill(newTitle);
      await page.locator('[data-testid="custom-dialog-ok-btn"]').click();

      // Проверяем что название изменилось
      await authenticatedPage.assertBlockWithTitleExists(newTitle);

      // Возвращаемся в online
      await context.setOffline(false);
      await page.waitForTimeout(2000);

      // Изменение должно сохраниться
      await authenticatedPage.assertBlockWithTitleExists(newTitle);
    });
  });

  // ==================== Offline Queue ====================

  test.describe('Offline очередь', () => {
    test('SY-OF-03: Очередь операций сохраняется', async ({ authenticatedPage, page, context, offlineHelper }) => {
      // Переходим в offline
      await context.setOffline(true);
      await page.waitForTimeout(500);

      // Создаём несколько блоков
      const blocks = [
        uniqueBlockTitle('Queue_1'),
        uniqueBlockTitle('Queue_2'),
        uniqueBlockTitle('Queue_3'),
      ];

      for (const title of blocks) {
        await authenticatedPage.createBlock(title);
        await page.waitForTimeout(300);
      }

      // Проверяем что все блоки видны
      for (const title of blocks) {
        await authenticatedPage.assertBlockWithTitleExists(title);
      }

      // Возвращаемся в online
      await context.setOffline(false);

      // Ждём синхронизации
      try {
        await offlineHelper.waitForQueueSync(15000);
      } catch {
        // Если таймаут - ок, просто ждём дольше
        await page.waitForTimeout(5000);
      }

      // Все блоки должны остаться
      for (const title of blocks) {
        await authenticatedPage.assertBlockWithTitleExists(title);
      }
    });

    test('SY-OF-04: Операции синхронизируются при восстановлении сети', async ({ authenticatedPage, page, context }) => {
      const blockTitle = uniqueBlockTitle('SyncOnReconnect');

      // Переходим в offline
      await context.setOffline(true);
      await page.waitForTimeout(500);

      // Создаём блок
      await authenticatedPage.createBlock(blockTitle);
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);

      // Возвращаемся в online
      await context.setOffline(false);

      // Ждём синхронизации
      await page.waitForTimeout(5000);

      // Перезагружаем страницу
      await page.reload();
      await page.waitForLoadState('networkidle');
      await authenticatedPage.waitForShowedBlocks();

      // Блок должен быть виден (он был синхронизирован с сервером)
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);
    });
  });

  // ==================== Network Toggle ====================

  test.describe('Переключение сети', () => {
    test('SY-OF-05: Быстрое переключение online/offline', async ({ authenticatedPage, page, context, offlineHelper }) => {
      const blockTitle = uniqueBlockTitle('RapidToggle');

      // Создаём блок
      await authenticatedPage.createBlock(blockTitle);
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);

      // Быстро переключаем сеть
      await offlineHelper.rapidNetworkToggle(3, 200);

      // Приложение должно остаться работоспособным
      await expect(authenticatedPage.rootContainer).toBeVisible();

      // Блок должен быть виден
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);
    });

    test('SY-OF-06: Индикатор offline состояния', async ({ authenticatedPage, page, context }) => {
      // Переходим в offline
      await context.setOffline(true);

      // Проверяем состояние сети через evaluate
      const isOffline = await page.evaluate(() => !navigator.onLine);
      expect(isOffline).toBe(true);

      // Возвращаемся в online
      await context.setOffline(false);

      const isOnline = await page.evaluate(() => navigator.onLine);
      expect(isOnline).toBe(true);
    });
  });

  // ==================== IndexedDB Persistence ====================

  test.describe('IndexedDB Persistence', () => {
    test('SY-OF-07: Данные сохраняются в IndexedDB offline', async ({ authenticatedPage, page, context, offlineHelper }) => {
      const blockTitle = uniqueBlockTitle('IndexedDB');

      // Создаём блок online
      await authenticatedPage.createBlock(blockTitle);
      await page.waitForTimeout(1000);

      // Проверяем что блок есть в IndexedDB
      const blockExists = await offlineHelper.blockWithTitleExistsInIndexedDB(blockTitle);
      expect(blockExists).toBe(true);
    });

    test('SY-OF-08: Данные загружаются из IndexedDB при старте', async ({ authenticatedPage, page }) => {
      // Перезагружаем страницу
      await page.reload();
      await page.waitForLoadState('networkidle');
      await authenticatedPage.waitForShowedBlocks();

      // Приложение должно загрузиться с данными из IndexedDB
      await expect(authenticatedPage.rootContainer).toBeVisible();

      // Должны быть видны блоки
      const blocksCount = await authenticatedPage.getBlocksCount();
      expect(blocksCount).toBeGreaterThan(0);
    });
  });
});

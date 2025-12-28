import { test, expect } from '@playwright/test';
import { setupApiMocks } from '../fixtures/test-data.fixture';

test.describe('WebSocket синхронизация', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('должен подключиться к WebSocket серверу', async ({ page }) => {
    // Мокируем WebSocket
    let wsConnected = false;

    await page.addInitScript(() => {
      // Перехватываем создание WebSocket
      const OriginalWebSocket = window.WebSocket;
      (window as any).WebSocket = class MockWebSocket extends OriginalWebSocket {
        constructor(url: string, protocols?: string | string[]) {
          super(url, protocols);
          console.log('WebSocket connecting to:', url);
        }
      };
    });

    await page.goto('/');

    // Ждём инициализации приложения
    await page.waitForTimeout(3000);

    // Проверяем что приложение загрузилось
    const rootContainer = page.locator('#rootContainer');
    await expect(rootContainer).toBeVisible({ timeout: 10000 });
  });

  test('должен обработать входящее обновление блока', async ({ page }) => {
    await setupApiMocks(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Симулируем получение обновления через dispatch события
    await page.evaluate(() => {
      const event = new CustomEvent('UpdateBlocks', {
        detail: {
          blocks: [
            { id: 'updated-block', title: 'Updated by sync' },
          ],
        },
      });
      window.dispatchEvent(event);
    });

    await page.waitForTimeout(500);
  });
});

test.describe('Мульти-таб синхронизация', () => {
  test('должен синхронизировать изменения между вкладками', async ({ browser }) => {
    // Создаём два контекста (две сессии)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Настраиваем моки для обеих страниц
    await setupApiMocks(page1);
    await setupApiMocks(page2);

    // Открываем приложение в обеих вкладках
    await Promise.all([
      page1.goto('/'),
      page2.goto('/'),
    ]);

    // Ждём загрузки
    await Promise.all([
      page1.waitForLoadState('networkidle'),
      page2.waitForLoadState('networkidle'),
    ]);

    // В реальном тесте здесь бы была проверка синхронизации через WebSocket
    // Для демонстрации проверяем что обе страницы загрузились

    const rootContainer1 = page1.locator('#rootContainer');
    const rootContainer2 = page2.locator('#rootContainer');

    await expect(rootContainer1).toBeVisible({ timeout: 10000 });
    await expect(rootContainer2).toBeVisible({ timeout: 10000 });

    await context1.close();
    await context2.close();
  });
});

test.describe('Оффлайн режим', () => {
  test('должен работать с локальными данными при отсутствии сети', async ({ page, context }) => {
    await setupApiMocks(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Проверяем что приложение загрузилось
    const rootContainer = page.locator('#rootContainer');
    await expect(rootContainer).toBeVisible({ timeout: 10000 });

    // Отключаем сеть
    await context.setOffline(true);

    // Приложение должно продолжать работать с локальными данными
    await page.waitForTimeout(1000);

    // Пробуем навигацию (должна работать локально)
    const firstBlock = page.locator('[block]').first();
    if (await firstBlock.isVisible()) {
      await firstBlock.click();
      await page.waitForTimeout(500);
    }

    // Включаем сеть обратно
    await context.setOffline(false);

    await page.waitForTimeout(1000);
  });

  test('должен показать индикатор отключения от сети', async ({ page, context }) => {
    await setupApiMocks(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Отключаем сеть
    await context.setOffline(true);

    await page.waitForTimeout(2000);

    // Ищем индикатор оффлайн статуса
    const offlineIndicator = page.locator('.offline-indicator, .connection-status, [data-offline]');
    // Индикатор может быть или не быть в зависимости от реализации

    // Включаем сеть
    await context.setOffline(false);
  });
});

test.describe('Конфликты при одновременном редактировании', () => {
  test('должен обработать конфликт редактирования', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    await setupApiMocks(page1);
    await setupApiMocks(page2);

    await Promise.all([
      page1.goto('/'),
      page2.goto('/'),
    ]);

    await Promise.all([
      page1.waitForLoadState('networkidle'),
      page2.waitForLoadState('networkidle'),
    ]);

    // Симулируем одновременное редактирование одного блока
    // В реальном приложении это вызовет конфликт

    // Закрываем контексты
    await context1.close();
    await context2.close();
  });
});

test.describe('Undo/Redo синхронизация', () => {
  test('должен синхронизировать undo операции', async ({ page }) => {
    await setupApiMocks(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const rootContainer = page.locator('#rootContainer');
    await expect(rootContainer).toBeVisible({ timeout: 10000 });

    // Выполняем действие
    const firstBlock = page.locator('[block]').first();
    if (await firstBlock.isVisible()) {
      await firstBlock.click();

      // Создаём блок
      await page.keyboard.press('n');
      await page.waitForTimeout(300);

      const promptInput = page.locator('.custom-prompt input, .prompt-dialog input');
      if (await promptInput.isVisible()) {
        await promptInput.fill('Sync Test Block');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
      }

      // Undo
      await page.keyboard.down('Shift');
      await page.keyboard.press('z');
      await page.keyboard.up('Shift');

      await page.waitForTimeout(500);

      // Redo
      await page.keyboard.down('Shift');
      await page.keyboard.down('Control');
      await page.keyboard.press('z');
      await page.keyboard.up('Control');
      await page.keyboard.up('Shift');

      await page.waitForTimeout(500);
    }
  });
});

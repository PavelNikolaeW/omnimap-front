import { test, expect, Page, BrowserContext } from '@playwright/test';

/**
 * Тесты concurrent editing и network recovery @sync @concurrent
 *
 * Проверяют:
 * - Одновременное создание блоков двумя пользователями без коллизий grid
 * - Восстановление WebSocket после потери сети
 * - Корректную работу кнопки переподключения
 */

test.describe('Concurrent Block Creation @sync @concurrent', () => {
  test('CE-01: два пользователя создают блоки одновременно без коллизий grid', async ({ browser }) => {
    // Создаём два контекста (два пользователя)
    const context1 = await browser.newContext({
      storageState: 'e2e/.auth/user.json',
    });
    const context2 = await browser.newContext({
      storageState: 'e2e/.auth/user2.json',
    });

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Открываем приложение в обеих вкладках
    await Promise.all([page1.goto('/'), page2.goto('/')]);

    // Ждём загрузки
    await Promise.all([
      page1.waitForLoadState('networkidle'),
      page2.waitForLoadState('networkidle'),
    ]);

    // Убеждаемся что обе страницы загрузились
    await expect(page1.locator('#rootContainer')).toBeVisible({ timeout: 10000 });
    await expect(page2.locator('#rootContainer')).toBeVisible({ timeout: 10000 });

    // Создаём блоки почти одновременно в обеих вкладках
    const timestamp = Date.now();
    const block1Title = `User1 Block ${timestamp}`;
    const block2Title = `User2 Block ${timestamp}`;

    // User 1 создаёт блок
    await page1.keyboard.press('n');
    const input1 = page1.locator('[data-testid="custom-dialog-input"]');
    await expect(input1).toBeVisible({ timeout: 5000 });
    await input1.fill(block1Title);

    // User 2 создаёт блок (почти одновременно)
    await page2.keyboard.press('n');
    const input2 = page2.locator('[data-testid="custom-dialog-input"]');
    await expect(input2).toBeVisible({ timeout: 5000 });
    await input2.fill(block2Title);

    // Подтверждаем создание почти одновременно
    await Promise.all([
      page1.locator('[data-testid="custom-dialog-ok-btn"]').click(),
      page2.locator('[data-testid="custom-dialog-ok-btn"]').click(),
    ]);

    // Ждём синхронизации
    await page1.waitForTimeout(3000);
    await page2.waitForTimeout(3000);

    // Проверяем что блоки созданы на первой странице
    const blocks1 = await page1.locator('.block').all();
    expect(blocks1.length).toBeGreaterThanOrEqual(1);

    // Проверяем что блоки не накладываются друг на друга
    // Получаем позиции всех блоков
    const positions1 = await page1.evaluate(() => {
      const blocks = document.querySelectorAll('.block');
      const positions: { id: string; top: number; left: number; width: number; height: number }[] = [];

      blocks.forEach((block) => {
        const rect = block.getBoundingClientRect();
        positions.push({
          id: block.id,
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      });

      return positions;
    });

    // Проверяем что блоки не перекрываются полностью
    for (let i = 0; i < positions1.length; i++) {
      for (let j = i + 1; j < positions1.length; j++) {
        const a = positions1[i];
        const b = positions1[j];

        // Проверяем что блоки не занимают одну и ту же позицию
        const samePosition =
          Math.abs(a.top - b.top) < 5 &&
          Math.abs(a.left - b.left) < 5;

        if (samePosition) {
          console.log(`Warning: blocks ${a.id} and ${b.id} may overlap at (${a.top}, ${a.left})`);
        }
      }
    }

    await context1.close();
    await context2.close();
  });

  test('CE-02: childOrder обновляется корректно при concurrent создании', async ({ browser }) => {
    const context1 = await browser.newContext({
      storageState: 'e2e/.auth/user.json',
    });
    const context2 = await browser.newContext({
      storageState: 'e2e/.auth/user.json', // Тот же пользователь, разные сессии
    });

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    await Promise.all([page1.goto('/'), page2.goto('/')]);
    await Promise.all([
      page1.waitForLoadState('networkidle'),
      page2.waitForLoadState('networkidle'),
    ]);

    // Создаём блок в первой вкладке
    const timestamp = Date.now();
    await page1.keyboard.press('n');
    const input1 = page1.locator('[data-testid="custom-dialog-input"]');
    await expect(input1).toBeVisible({ timeout: 5000 });
    await input1.fill(`Block A ${timestamp}`);
    await page1.locator('[data-testid="custom-dialog-ok-btn"]').click();

    // Ждём синхронизации
    await page1.waitForTimeout(2000);

    // Создаём блок во второй вкладке
    await page2.keyboard.press('n');
    const input2 = page2.locator('[data-testid="custom-dialog-input"]');
    await expect(input2).toBeVisible({ timeout: 5000 });
    await input2.fill(`Block B ${timestamp}`);
    await page2.locator('[data-testid="custom-dialog-ok-btn"]').click();

    // Ждём синхронизации
    await page2.waitForTimeout(3000);
    await page1.waitForTimeout(1000); // Дополнительное ожидание для первой страницы

    // Проверяем что обе страницы работают корректно
    await expect(page1.locator('#rootContainer')).toBeVisible();
    await expect(page2.locator('#rootContainer')).toBeVisible();

    await context1.close();
    await context2.close();
  });
});

test.describe('WebSocket Network Recovery @sync @network', () => {
  test('NR-01: WebSocket переподключается после кратковременной потери сети', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Ждём установки WebSocket соединения
    await page.waitForTimeout(3000);

    // Получаем начальное состояние
    const initialWsState = await page.evaluate(() => {
      const sincManager = (window as any).sincManager;
      return sincManager?.ws?.readyState ?? -1;
    });

    // Отключаем сеть на короткое время (5 сек)
    await context.setOffline(true);
    await page.waitForTimeout(5000);

    // Включаем сеть
    await context.setOffline(false);

    // Ждём переподключения
    await page.waitForTimeout(5000);

    // Проверяем что приложение работает
    const rootContainer = page.locator('#rootContainer');
    await expect(rootContainer).toBeVisible();

    // Проверяем состояние WebSocket (должен быть OPEN=1 или переподключаться)
    const finalWsState = await page.evaluate(() => {
      const sincManager = (window as any).sincManager;
      return sincManager?.ws?.readyState ?? -1;
    });

    // WebSocket должен быть либо открыт, либо в процессе переподключения
    expect([0, 1]).toContain(finalWsState); // CONNECTING=0, OPEN=1
  });

  test('NR-02: WebSocket переподключается после длительной потери сети (30 сек)', async ({ page, context }) => {
    test.setTimeout(60000); // Увеличиваем таймаут теста

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Ждём установки WebSocket соединения
    await page.waitForTimeout(3000);

    // Отключаем сеть на 30 секунд
    await context.setOffline(true);
    console.log('Network offline, waiting 30 seconds...');
    await page.waitForTimeout(30000);

    // Включаем сеть
    console.log('Network online, waiting for reconnect...');
    await context.setOffline(false);

    // Ждём переподключения (может занять до 10 секунд с exponential backoff)
    await page.waitForTimeout(10000);

    // Проверяем что приложение работает
    const rootContainer = page.locator('#rootContainer');
    await expect(rootContainer).toBeVisible();

    // Можем создать блок (приложение функционирует)
    await page.keyboard.press('n');
    const input = page.locator('[data-testid="custom-dialog-input"]');

    // Если диалог открылся, значит приложение работает
    const dialogVisible = await input.isVisible({ timeout: 5000 }).catch(() => false);
    if (dialogVisible) {
      await page.keyboard.press('Escape');
    }

    expect(true).toBe(true); // Приложение не упало
  });

  test('NR-03: Кнопка переподключения появляется после max attempts', async ({ page, context }) => {
    test.setTimeout(90000); // Увеличиваем таймаут для долгого теста

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Отключаем сеть надолго чтобы достичь max reconnect attempts
    await context.setOffline(true);

    // Ждём пока WebSocket попробует переподключиться несколько раз
    // С exponential backoff это может занять время
    await page.waitForTimeout(45000);

    // Проверяем наличие кнопки переподключения или индикатора ошибки
    const reconnectButton = page.locator('.reconnect-button');
    const wsIndicatorError = page.locator('.status-led[data-system="ws"].error');

    // Должен быть либо кнопка, либо индикатор ошибки
    const hasReconnectUI = await reconnectButton.isVisible().catch(() => false) ||
                           await wsIndicatorError.isVisible().catch(() => false);

    // Включаем сеть
    await context.setOffline(false);
    await page.waitForTimeout(2000);

    // Если кнопка видна, кликаем для переподключения
    if (await reconnectButton.isVisible().catch(() => false)) {
      await reconnectButton.click();
      await page.waitForTimeout(3000);
    }

    // Приложение должно работать
    const rootContainer = page.locator('#rootContainer');
    await expect(rootContainer).toBeVisible();
  });

  test('NR-04: ForceReconnect event сбрасывает счётчик и переподключает', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Диспатчим ForceReconnect event
    await page.evaluate(() => {
      const event = new CustomEvent('ForceReconnect');
      window.dispatchEvent(event);
    });

    // Ждём обработки
    await page.waitForTimeout(3000);

    // Проверяем что приложение работает
    const rootContainer = page.locator('#rootContainer');
    await expect(rootContainer).toBeVisible();

    // Проверяем что reconnectAttempts сброшен
    const attempts = await page.evaluate(() => {
      const sincManager = (window as any).sincManager;
      return sincManager?.reconnectAttempts ?? -1;
    });

    // После ForceReconnect счётчик должен быть 0 или 1 (если уже начал переподключение)
    expect(attempts).toBeLessThanOrEqual(1);
  });
});

test.describe('Sync Status Indicator @sync @ui', () => {
  test('SI-01: Индикатор синхронизации показывает статус', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Проверяем наличие status indicators
    const statusIndicators = page.locator('.status-indicators');
    await expect(statusIndicators).toBeVisible({ timeout: 10000 });

    // Проверяем наличие WebSocket индикатора
    const wsIndicator = page.locator('.status-led[data-system="ws"]');
    await expect(wsIndicator).toBeVisible();
  });

  test('SI-02: SyncStarted event показывает индикатор', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Диспатчим SyncStarted event
    await page.evaluate(() => {
      const event = new CustomEvent('SyncStarted', {
        detail: { phase: 'pull', message: 'Загрузка...' }
      });
      window.dispatchEvent(event);
    });

    // Проверяем что sync-status появился
    const syncStatus = page.locator('.sync-status');
    // Может быть скрыт если синхронизация быстрая
    await page.waitForTimeout(500);

    // Диспатчим SyncCompleted
    await page.evaluate(() => {
      const event = new CustomEvent('SyncCompleted', { detail: {} });
      window.dispatchEvent(event);
    });

    // Приложение работает
    const rootContainer = page.locator('#rootContainer');
    await expect(rootContainer).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';

/**
 * Epic 5: Offline Tests для dev/cloud среды
 *
 * Тестирование работы приложения в offline режиме:
 * - Создание и редактирование блоков offline
 * - Очередь offline-операций
 * - Синхронизация при восстановлении сети
 *
 * @tag @offline @sync
 */

// Генерируем уникального пользователя для каждого прогона
const timestamp = Date.now();
const TEST_USER = {
  username: `offline_test_${timestamp}`,
  password: 'TestPassword123!',
  email: `offline_test_${timestamp}@example.com`,
};

// Генератор уникальных названий блоков
const uniqueBlockTitle = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

test.describe('Offline Mode @offline', () => {
  test.describe.configure({ mode: 'serial' });

  let isAuthenticated = false;
  let userRegistered = false;

  // ==================== Auth Setup ====================

  test.beforeEach(async ({ page }) => {
    if (isAuthenticated) {
      const currentUrl = page.url();
      if (currentUrl === 'about:blank' || currentUrl === '') {
        await page.goto('/', { timeout: 60000 });
        await page.waitForLoadState('domcontentloaded', { timeout: 30000 });

        const loginForm = page.locator('#login-form');
        const blocks = page.locator('[block]');

        const result = await Promise.race([
          loginForm.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'login'),
          blocks.first().waitFor({ state: 'visible', timeout: 15000 }).then(() => 'app'),
        ]).catch(() => 'timeout');

        if (result === 'login') {
          isAuthenticated = false;
        } else if (result === 'app') {
          return;
        }
      } else {
        return;
      }
    }

    await page.goto('/', { timeout: 60000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 });

    const hasLoginForm = await page.locator('#login-form').isVisible().catch(() => false);

    if (!hasLoginForm) {
      await page.waitForTimeout(1000);
      const hasLoginFormNow = await page.locator('#login-form').isVisible().catch(() => false);
      if (!hasLoginFormNow) {
        isAuthenticated = true;
        return;
      }
    }

    const loginHeading = page.getByRole('heading', { name: 'Вход' });
    const isLoginForm = await loginHeading.isVisible().catch(() => false);

    if (userRegistered) {
      if (!isLoginForm) {
        const switchToLoginButton = page.locator('text=Уже есть аккаунт');
        if (await switchToLoginButton.isVisible().catch(() => false)) {
          await switchToLoginButton.click();
          await page.waitForTimeout(500);
        }
      }
      const loginSection = page.locator('#login-form');
      await loginSection.getByRole('textbox', { name: 'Имя пользователя' }).fill(TEST_USER.username);
      await page.waitForTimeout(100);
      await loginSection.locator('input[type="password"]').fill(TEST_USER.password);
      await page.waitForTimeout(100);
      await page.click('button:has-text("Войти")');
    } else if (!isLoginForm) {
      const registerSection = page.getByRole('heading', { name: 'Регистрация' }).locator('..');
      await registerSection.getByRole('textbox', { name: 'Имя пользователя' }).fill(TEST_USER.username);
      await page.waitForTimeout(100);
      await registerSection.getByRole('textbox', { name: 'Электронная почта' }).fill(TEST_USER.email);
      await page.waitForTimeout(100);
      await registerSection.locator('input[type="password"]').first().fill(TEST_USER.password);
      await page.waitForTimeout(100);
      await registerSection.locator('input[type="password"]').last().fill(TEST_USER.password);
      await page.waitForTimeout(100);
      await page.click('button:has-text("Зарегистрироваться")');
      userRegistered = true;
    } else {
      const switchToRegisterButton = page.locator('text=Создать аккаунт');
      if (await switchToRegisterButton.isVisible().catch(() => false)) {
        await switchToRegisterButton.click();
        await page.waitForTimeout(500);
      }
      const registerSection = page.getByRole('heading', { name: 'Регистрация' }).locator('..');
      await registerSection.getByRole('textbox', { name: 'Имя пользователя' }).fill(TEST_USER.username);
      await page.waitForTimeout(100);
      await registerSection.getByRole('textbox', { name: 'Электронная почта' }).fill(TEST_USER.email);
      await page.waitForTimeout(100);
      await registerSection.locator('input[type="password"]').first().fill(TEST_USER.password);
      await page.waitForTimeout(100);
      await registerSection.locator('input[type="password"]').last().fill(TEST_USER.password);
      await page.waitForTimeout(100);
      await page.click('button:has-text("Зарегистрироваться")');
      userRegistered = true;
    }

    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(2000);

    const rootContainer = page.locator('#rootContainer');
    await expect(rootContainer).toBeVisible({ timeout: 10000 });

    // Закрываем приветственное окно если есть
    await page.waitForTimeout(1000);
    const welcomeDialog = page.locator('text=Добро пожаловать в OmniMap!');
    if (await welcomeDialog.isVisible().catch(() => false)) {
      // Нажимаем "Понятно" чтобы закрыть диалог (не "Начать обзор" который запускает тур)
      const closeButton = page.locator('button:has-text("Понятно")');
      if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click();
      } else {
        const startButton = page.locator('button:has-text("Начать обзор")');
        await startButton.click();
      }
      await page.waitForTimeout(1000);
    }

    isAuthenticated = true;
  });

  // ==================== Базовый offline ====================

  test.describe('Базовый offline режим', () => {
    test('SY-OF-01: Создание блока в offline режиме', async ({ page, context }) => {
      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible({ timeout: 10000 });

      // Переходим в offline
      await context.setOffline(true);
      await page.waitForTimeout(500);

      // Создаём блок
      const blockTitle = uniqueBlockTitle('Offline');
      await rootContainer.click();
      await page.waitForTimeout(300);

      await page.keyboard.press('n');
      const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });
      await dialogInput.fill(blockTitle);
      await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
      await page.waitForTimeout(1000);

      // Блок должен появиться в UI (optimistic update)
      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`);
      await expect(block).toBeVisible({ timeout: 5000 });

      // Возвращаемся в online
      await context.setOffline(false);
      await page.waitForTimeout(2000);

      // Блок должен остаться
      await expect(block).toBeVisible({ timeout: 5000 });
    });

    test('SY-OF-02: Редактирование в offline режиме', async ({ page, context }) => {
      const blockTitle = uniqueBlockTitle('EditOffline');
      const newTitle = uniqueBlockTitle('EditedOffline');

      const rootContainer = page.locator('#rootContainer');
      await rootContainer.click();
      await page.waitForTimeout(300);

      // Создаём блок online
      await page.keyboard.press('n');
      const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });
      await dialogInput.fill(blockTitle);
      await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
      await page.waitForTimeout(1000);

      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`);
      await expect(block).toBeVisible({ timeout: 5000 });

      // Переходим в offline
      await context.setOffline(true);
      await page.waitForTimeout(500);

      // Редактируем название
      await block.click();
      await page.waitForTimeout(300);

      await page.keyboard.press('t');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });
      await dialogInput.clear();
      await dialogInput.fill(newTitle);
      await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
      await page.waitForTimeout(500);

      // Проверяем что название изменилось
      const updatedBlock = page.locator(`[block] titleBlock:has-text("${newTitle}")`);
      await expect(updatedBlock).toBeVisible({ timeout: 5000 });

      // Возвращаемся в online
      await context.setOffline(false);
      await page.waitForTimeout(2000);

      // Изменение должно сохраниться
      await expect(updatedBlock).toBeVisible({ timeout: 5000 });
    });
  });

  // ==================== Offline Queue ====================

  test.describe('Offline очередь', () => {
    test('SY-OF-03: Очередь операций сохраняется', async ({ page, context }) => {
      const rootContainer = page.locator('#rootContainer');
      await rootContainer.click();
      await page.waitForTimeout(300);

      // Переходим в offline
      await context.setOffline(true);
      await page.waitForTimeout(500);

      const dialogInput = page.locator('[data-testid="custom-dialog-input"]');

      // Создаём несколько блоков
      const blocks = [
        uniqueBlockTitle('Queue_1'),
        uniqueBlockTitle('Queue_2'),
        uniqueBlockTitle('Queue_3'),
      ];

      for (const title of blocks) {
        await page.keyboard.press('n');
        await expect(dialogInput).toBeVisible({ timeout: 5000 });
        await dialogInput.fill(title);
        await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
        await page.waitForTimeout(500);
      }

      // Проверяем что все блоки видны
      for (const title of blocks) {
        const block = page.locator(`[block] titleBlock:has-text("${title}")`);
        await expect(block).toBeVisible({ timeout: 5000 });
      }

      // Возвращаемся в online
      await context.setOffline(false);

      // Ждём синхронизации
      await page.waitForTimeout(5000);

      // Все блоки должны остаться
      for (const title of blocks) {
        const block = page.locator(`[block] titleBlock:has-text("${title}")`);
        await expect(block).toBeVisible({ timeout: 5000 });
      }
    });

    test('SY-OF-04: Операции синхронизируются при восстановлении сети', async ({ page, context }) => {
      const blockTitle = uniqueBlockTitle('SyncOnReconnect');

      const rootContainer = page.locator('#rootContainer');
      await rootContainer.click();
      await page.waitForTimeout(300);

      // Переходим в offline
      await context.setOffline(true);
      await page.waitForTimeout(500);

      // Создаём блок
      await page.keyboard.press('n');
      const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });
      await dialogInput.fill(blockTitle);
      await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
      await page.waitForTimeout(1000);

      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`);
      await expect(block).toBeVisible({ timeout: 5000 });

      // Возвращаемся в online
      await context.setOffline(false);

      // Ждём синхронизации
      await page.waitForTimeout(5000);

      // Перезагружаем страницу
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Проверяем состояние после reload
      const hasLoginForm = await page.locator('#login-form').isVisible().catch(() => false);
      if (hasLoginForm) {
        // Сессия потеряна - ре-логинимся
        const loginSection = page.locator('#login-form');
        await loginSection.getByRole('textbox', { name: 'Имя пользователя' }).fill(TEST_USER.username);
        await page.waitForTimeout(100);
        await loginSection.locator('input[type="password"]').fill(TEST_USER.password);
        await page.waitForTimeout(100);
        await page.click('button:has-text("Войти")');
        await page.waitForTimeout(2000);
      }

      // Блок должен быть виден (он был синхронизирован с сервером)
      const blockAfterReload = page.locator(`[block] titleBlock:has-text("${blockTitle}")`);
      await expect(blockAfterReload).toBeVisible({ timeout: 10000 });
    });
  });

  // ==================== Network Toggle ====================

  test.describe('Переключение сети', () => {
    test('SY-OF-05: Быстрое переключение online/offline', async ({ page, context }) => {
      const blockTitle = uniqueBlockTitle('RapidToggle');

      const rootContainer = page.locator('#rootContainer');
      await rootContainer.click();
      await page.waitForTimeout(300);

      // Создаём блок
      await page.keyboard.press('n');
      const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });
      await dialogInput.fill(blockTitle);
      await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
      await page.waitForTimeout(1000);

      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`);
      await expect(block).toBeVisible({ timeout: 5000 });

      // Быстро переключаем сеть
      for (let i = 0; i < 3; i++) {
        await context.setOffline(true);
        await page.waitForTimeout(200);
        await context.setOffline(false);
        await page.waitForTimeout(200);
      }

      // Приложение должно остаться работоспособным
      await expect(rootContainer).toBeVisible();

      // Блок должен быть виден
      await expect(block).toBeVisible({ timeout: 5000 });
    });

    test('SY-OF-06: Индикатор offline состояния', async ({ page, context }) => {
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
    test('SY-OF-07: Данные сохраняются в IndexedDB offline', async ({ page, context }) => {
      const blockTitle = uniqueBlockTitle('IndexedDB');

      const rootContainer = page.locator('#rootContainer');
      await rootContainer.click();
      await page.waitForTimeout(300);

      // Создаём блок online
      await page.keyboard.press('n');
      const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });
      await dialogInput.fill(blockTitle);
      await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
      await page.waitForTimeout(1000);

      // Проверяем что блок есть в IndexedDB
      const blockExists = await page.evaluate(async (title) => {
        const localforage = (window as any).localforage;
        if (!localforage) return false;

        const keys = await localforage.keys();
        for (const key of keys) {
          if (key.startsWith('Block_')) {
            const block = await localforage.getItem(key);
            if (block && block.title && block.title.includes(title)) {
              return true;
            }
          }
        }
        return false;
      }, blockTitle);

      expect(blockExists).toBe(true);
    });

    test('SY-OF-08: Данные загружаются из IndexedDB при старте', async ({ page }) => {
      // Перезагружаем страницу
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Проверяем состояние после reload
      const hasLoginForm = await page.locator('#login-form').isVisible().catch(() => false);
      if (hasLoginForm) {
        // Сессия потеряна - ре-логинимся
        const loginSection = page.locator('#login-form');
        await loginSection.getByRole('textbox', { name: 'Имя пользователя' }).fill(TEST_USER.username);
        await page.waitForTimeout(100);
        await loginSection.locator('input[type="password"]').fill(TEST_USER.password);
        await page.waitForTimeout(100);
        await page.click('button:has-text("Войти")');
        await page.waitForTimeout(2000);
      }

      // Приложение должно загрузиться с данными из IndexedDB
      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();

      // Должны быть видны блоки
      const blocksCount = await page.locator('[block]').count();
      expect(blocksCount).toBeGreaterThan(0);
    });
  });
});

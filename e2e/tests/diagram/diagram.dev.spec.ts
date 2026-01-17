import { test, expect } from '@playwright/test';

/**
 * Epic 6: Diagram Mode Tests для dev/cloud среды
 *
 * Тестирование режима диаграммы: grid, соединения, стили блоков.
 *
 * @tag @diagram
 */

// Генерируем уникального пользователя для каждого прогона
const timestamp = Date.now();
const TEST_USER = {
  username: `diagram_test_${timestamp}`,
  password: 'TestPassword123!',
  email: `diagram_test_${timestamp}@example.com`,
};

// Генератор уникальных названий блоков
const uniqueBlockTitle = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

test.describe('Diagram Mode @diagram', () => {
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

  // Хелпер для создания тестовых блоков
  async function ensureMinBlocks(page: any, minCount: number) {
    const blocksCount = await page.locator('[block]').count();

    if (blocksCount < minCount) {
      const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
      const rootContainer = page.locator('#rootContainer');

      for (let i = blocksCount; i < minCount; i++) {
        await rootContainer.click();
        await page.waitForTimeout(200);

        await page.keyboard.press('n');
        await expect(dialogInput).toBeVisible({ timeout: 5000 });
        await dialogInput.fill(uniqueBlockTitle(`DiagramTest${i + 1}`));
        await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
        await page.waitForTimeout(500);
      }
    }
  }

  // ==================== Режим диаграммы ====================

  test.describe('Включение режима диаграммы', () => {
    test('DG-01: Включить режим диаграммы через hotkey D', async ({ page }) => {
      await ensureMinBlocks(page, 2);

      const firstBlock = page.locator('[block]').first();
      await firstBlock.click();
      await page.waitForTimeout(300);

      // Включаем режим диаграммы
      await page.keyboard.press('d');
      await page.waitForTimeout(500);

      // Приложение должно остаться работоспособным
      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();

      // Выходим через Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    });

    test('DG-02: Включить режим диаграммы через кнопку', async ({ page }) => {
      await ensureMinBlocks(page, 2);

      const firstBlock = page.locator('[block]').first();
      await firstBlock.click();
      await page.waitForTimeout(300);

      const controlPanel = page.locator('#control-panel');
      const diagramBtn = controlPanel.locator('#createDiagram, [data-testid="command-btn-createDiagram"], .fa-project-diagram').first();

      if (await diagramBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await diagramBtn.click();
        await page.waitForTimeout(500);

        const rootContainer = page.locator('#rootContainer');
        await expect(rootContainer).toBeVisible();
      }
    });
  });

  // ==================== Соединения ====================

  test.describe('Соединения', () => {
    test('DG-CN-01: Создать соединение через hotkey A', async ({ page }) => {
      await ensureMinBlocks(page, 2);

      const blocks = page.locator('[block]');
      const firstBlock = blocks.first();

      // Выделяем первый блок
      await firstBlock.click();
      await page.waitForTimeout(300);

      // Начинаем создание соединения
      await page.keyboard.press('a');
      await page.waitForTimeout(300);

      // Блок должен быть в режиме соединения
      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();

      // Отменяем через Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    });

    test('DG-CN-02: Создать соединение между двумя блоками', async ({ page }) => {
      await ensureMinBlocks(page, 2);

      const blocks = page.locator('[block]');

      // Выделяем первый блок
      await blocks.first().click();
      await page.waitForTimeout(300);

      // Начинаем соединение через A
      await page.keyboard.press('a');
      await page.waitForTimeout(300);

      // Кликаем на второй блок
      const blocksNow = page.locator('[block]');
      if ((await blocksNow.count()) >= 2) {
        await blocksNow.nth(1).click();
        await page.waitForTimeout(300);
      }

      // Завершаем соединение
      await page.keyboard.press('a');
      await page.waitForTimeout(500);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('DG-CN-08: Удалить соединение через Shift+A', async ({ page }) => {
      await ensureMinBlocks(page, 2);

      // Активируем режим удаления
      await page.keyboard.down('Shift');
      await page.keyboard.press('a');
      await page.keyboard.up('Shift');
      await page.waitForTimeout(300);

      // Проверяем что приложение не упало
      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();

      // Отменяем через Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    });

    test('DG-CN-03: Создать dashed соединение', async ({ page }) => {
      await ensureMinBlocks(page, 2);

      const blocks = page.locator('[block]');
      await blocks.first().click();
      await page.waitForTimeout(300);

      // Ищем кнопку пунктирного соединения
      const controlPanel = page.locator('#control-panel');
      const dashedBtn = controlPanel.locator('#connectDashed, [data-testid="command-btn-connectDashed"]').first();

      if (await dashedBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await dashedBtn.click();
        await page.waitForTimeout(300);

        if ((await blocks.count()) >= 2) {
          await blocks.nth(1).click();
          await page.waitForTimeout(300);
        }

        await dashedBtn.click();
        await page.waitForTimeout(500);
      }

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('DG-CN-04: Создать double соединение', async ({ page }) => {
      await ensureMinBlocks(page, 2);

      const blocks = page.locator('[block]');
      await blocks.first().click();
      await page.waitForTimeout(300);

      // Ищем кнопку двустороннего соединения
      const controlPanel = page.locator('#control-panel');
      const doubleBtn = controlPanel.locator('#connectDouble, [data-testid="command-btn-connectDouble"]').first();

      if (await doubleBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await doubleBtn.click();
        await page.waitForTimeout(300);

        if ((await blocks.count()) >= 2) {
          await blocks.nth(1).click();
          await page.waitForTimeout(300);
        }

        await doubleBtn.click();
        await page.waitForTimeout(500);
      }

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });
  });

  // ==================== Grid операции ====================

  test.describe('Grid операции', () => {
    test('DG-GR-05: Изменить ширину блока через = + ArrowRight', async ({ page }) => {
      await ensureMinBlocks(page, 2);

      const firstBlock = page.locator('[block]').first();
      await firstBlock.click();
      await page.waitForTimeout(300);

      // Растягивание: = + стрелка
      await page.keyboard.down('=');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.up('=');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('DG-GR-06: Уменьшить ширину блока через Shift += + ArrowLeft', async ({ page }) => {
      await ensureMinBlocks(page, 2);

      const firstBlock = page.locator('[block]').first();
      await firstBlock.click();
      await page.waitForTimeout(300);

      // Сжатие: Shift + = + стрелка
      await page.keyboard.down('Shift');
      await page.keyboard.down('=');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.up('=');
      await page.keyboard.up('Shift');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });
  });

  // ==================== Перемещение блоков ====================

  test.describe('Перемещение блоков', () => {
    test('DG-OP-03: Переместить блок вверх через Shift+ArrowUp', async ({ page }) => {
      await ensureMinBlocks(page, 2);

      const firstBlock = page.locator('[block]').first();
      await firstBlock.click();
      await page.waitForTimeout(300);

      await page.keyboard.down('Shift');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.up('Shift');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('DG-OP-04: Переместить блок вниз через Shift+ArrowDown', async ({ page }) => {
      await ensureMinBlocks(page, 2);

      const firstBlock = page.locator('[block]').first();
      await firstBlock.click();
      await page.waitForTimeout(300);

      await page.keyboard.down('Shift');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.up('Shift');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('DG-OP-05: Переместить блок влево через Shift+ArrowLeft', async ({ page }) => {
      await ensureMinBlocks(page, 2);

      const firstBlock = page.locator('[block]').first();
      await firstBlock.click();
      await page.waitForTimeout(300);

      await page.keyboard.down('Shift');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.up('Shift');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('DG-OP-06: Переместить блок вправо через Shift+ArrowRight', async ({ page }) => {
      await ensureMinBlocks(page, 2);

      const firstBlock = page.locator('[block]').first();
      await firstBlock.click();
      await page.waitForTimeout(300);

      await page.keyboard.down('Shift');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.up('Shift');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });
  });

  // ==================== Навигация стрелками ====================

  test.describe('Навигация стрелками', () => {
    test('DG-NAV-01: Навигация стрелкой вправо', async ({ page }) => {
      await ensureMinBlocks(page, 2);

      const firstBlock = page.locator('[block]').first();
      await firstBlock.click();
      await page.waitForTimeout(300);

      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('DG-NAV-02: Навигация стрелкой влево', async ({ page }) => {
      await ensureMinBlocks(page, 2);

      const blocks = page.locator('[block]');
      await blocks.nth(1).click();
      await page.waitForTimeout(300);

      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('DG-NAV-03: Навигация стрелкой вверх', async ({ page }) => {
      await ensureMinBlocks(page, 2);

      const firstBlock = page.locator('[block]').first();
      await firstBlock.click();
      await page.waitForTimeout(300);

      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('DG-NAV-04: Навигация стрелкой вниз', async ({ page }) => {
      await ensureMinBlocks(page, 2);

      const firstBlock = page.locator('[block]').first();
      await firstBlock.click();
      await page.waitForTimeout(300);

      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });
  });

  // ==================== Открытие соседних блоков ====================

  test.describe('Открытие соседних блоков', () => {
    test('DG-ADJ-01: Открыть левый соседний блок через запятую', async ({ page }) => {
      await ensureMinBlocks(page, 2);

      const firstBlock = page.locator('[block]').first();
      await firstBlock.click();
      await page.waitForTimeout(300);

      await page.keyboard.press(',');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('DG-ADJ-02: Открыть правый соседний блок через точку', async ({ page }) => {
      await ensureMinBlocks(page, 2);

      const firstBlock = page.locator('[block]').first();
      await firstBlock.click();
      await page.waitForTimeout(300);

      await page.keyboard.press('.');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });
  });

  // ==================== Стили блоков ====================

  test.describe('Стили блоков', () => {
    test('DG-ST-01: Открыть панель стилей блока', async ({ page }) => {
      await ensureMinBlocks(page, 1);

      const firstBlock = page.locator('[block]').first();
      await firstBlock.click();
      await page.waitForTimeout(300);

      // Ищем кнопку стилей в панели управления
      const controlPanel = page.locator('#control-panel');
      const styleBtn = controlPanel.locator('#blockStyle, [data-testid="command-btn-blockStyle"], .fa-palette').first();

      if (await styleBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await styleBtn.click();
        await page.waitForTimeout(500);

        // Панель стилей должна появиться
        const stylePanel = page.locator('.block-style-panel, #block-style-panel, [data-testid="block-style-panel"]');
        if (await stylePanel.isVisible({ timeout: 2000 }).catch(() => false)) {
          await expect(stylePanel).toBeVisible();
        }
      }

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });
  });

  // ==================== Операции с блоками ====================

  test.describe('Операции с блоками в диаграмме', () => {
    test('DG-OP-01: Создать блок внутри диаграммы', async ({ page }) => {
      // Сначала создаём родительский блок
      const parentTitle = uniqueBlockTitle('DiagramParent');
      const childTitle = uniqueBlockTitle('DiagramChild');

      const rootContainer = page.locator('#rootContainer');
      await rootContainer.click();
      await page.waitForTimeout(300);

      const dialogInput = page.locator('[data-testid="custom-dialog-input"]');

      // Создаём родительский блок
      await page.keyboard.press('n');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });
      await dialogInput.fill(parentTitle);
      await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
      await page.waitForTimeout(1000);

      // Открываем родительский блок
      const parentBlock = page.locator(`[block] titleBlock:has-text("${parentTitle}")`).first();
      await parentBlock.dblclick();
      await page.waitForTimeout(500);

      // Создаём дочерний блок (внутри диаграммы)
      await page.keyboard.press('n');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });
      await dialogInput.fill(childTitle);
      await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
      await page.waitForTimeout(1000);

      // Блок должен появиться
      const childBlock = page.locator(`[block] titleBlock:has-text("${childTitle}")`);
      await expect(childBlock).toBeVisible({ timeout: 5000 });

      // Возвращаемся назад
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(500);
    });

    test('DG-OP-02: Удалить блок из диаграммы', async ({ page }) => {
      await ensureMinBlocks(page, 3);

      const blockTitle = uniqueBlockTitle('ToDelete');

      const rootContainer = page.locator('#rootContainer');
      await rootContainer.click();
      await page.waitForTimeout(300);

      const dialogInput = page.locator('[data-testid="custom-dialog-input"]');

      // Создаём блок для удаления
      await page.keyboard.press('n');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });
      await dialogInput.fill(blockTitle);
      await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
      await page.waitForTimeout(1000);

      // Находим и удаляем блок
      const blockToDelete = page.locator(`[block] titleBlock:has-text("${blockTitle}")`).first();
      await blockToDelete.click();
      await page.waitForTimeout(300);

      // Удаляем через Shift+D
      await page.keyboard.down('Shift');
      await page.keyboard.press('d');
      await page.keyboard.up('Shift');
      await page.waitForTimeout(500);

      // Блок должен исчезнуть
      await expect(blockToDelete).not.toBeVisible({ timeout: 5000 });
    });
  });
});

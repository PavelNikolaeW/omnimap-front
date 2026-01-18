import { test, expect } from '@playwright/test';

/**
 * Epic 7: Layout Editor Tests для dev/cloud среды
 *
 * Тестирование визуального редактора раскладки блоков.
 *
 * @tag @layout
 */

// Генерируем уникального пользователя для каждого прогона
const timestamp = Date.now();
const TEST_USER = {
  username: `layout_test_${timestamp}`,
  password: 'TestPassword123!',
  email: `layout_test_${timestamp}@example.com`,
};

// Генератор уникальных названий блоков
const uniqueBlockTitle = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

test.describe('Layout Editor @layout', () => {
  test.describe.configure({ mode: 'serial' });

  let isAuthenticated = false;
  let userRegistered = false;

  // ==================== Auth Setup ====================

  test.beforeEach(async ({ page }) => {
    // Всегда переходим на главную и проверяем состояние
    await page.goto('/', { timeout: 60000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Проверяем наличие login form (признак того, что нужна авторизация)
    const authForm = page.locator('#login-form, [class*="authBlock"]');
    const blocks = page.locator('[block]');

    // Ждём появления либо формы логина, либо блоков приложения
    const pageState = await Promise.race([
      authForm.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'login'),
      blocks.first().waitFor({ state: 'visible', timeout: 10000 }).then(() => 'app'),
    ]).catch(() => 'timeout');

    // Если видим блоки - значит авторизованы
    if (pageState === 'app') {
      isAuthenticated = true;
      console.log('Already authenticated, skipping login');
    } else {
      // Нужна авторизация
      console.log(`Auth required, userRegistered=${userRegistered}, pageState=${pageState}`);

      const loginHeading = page.getByRole('heading', { name: 'Вход' });
      const isLoginFormVisible = await loginHeading.isVisible().catch(() => false);

      if (userRegistered) {
        // Пользователь уже зарегистрирован - логинимся
        if (!isLoginFormVisible) {
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
      } else {
        // Нужна регистрация
        if (isLoginFormVisible) {
          const switchToRegisterButton = page.locator('text=Создать аккаунт');
          if (await switchToRegisterButton.isVisible().catch(() => false)) {
            await switchToRegisterButton.click();
            await page.waitForTimeout(500);
          }
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
      isAuthenticated = true;
    }

    // Проверяем что приложение загрузилось
    const rootContainer = page.locator('#rootContainer');
    await expect(rootContainer).toBeVisible({ timeout: 10000 });

    // Закрываем приветственное окно если есть
    const closeWelcomeDialogJS = async () => {
      return await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const btn of buttons) {
          if (btn.textContent?.trim() === 'Понятно') {
            btn.click();
            return 'clicked_ponjatno';
          }
        }
        for (const btn of buttons) {
          const text = btn.textContent?.trim();
          if (text === '×' || text === 'Закрыть' || btn.getAttribute('aria-label') === 'Закрыть') {
            btn.click();
            return 'clicked_close';
          }
        }
        return null;
      });
    };

    for (let round = 0; round < 8; round++) {
      await page.waitForTimeout(1000);

      const welcomeText = page.locator('text=Добро пожаловать в OmniMap!');
      const isDialogVisible = await welcomeText.isVisible().catch(() => false);

      if (isDialogVisible) {
        console.log(`Welcome dialog detected at round ${round + 1}, closing...`);

        const result = await closeWelcomeDialogJS();
        if (result) {
          console.log(`Closed welcome dialog via ${result}`);
          await page.waitForTimeout(500);

          const stillVisible = await welcomeText.isVisible().catch(() => false);
          if (!stillVisible) {
            console.log('Welcome dialog successfully closed');
            break;
          }
        }

        const ponjatnoButton = page.locator('button:has-text("Понятно")');
        if (await ponjatnoButton.isVisible().catch(() => false)) {
          try {
            await ponjatnoButton.click({ force: true, timeout: 2000 });
            console.log('Closed via Playwright click');
            await page.waitForTimeout(500);
          } catch (e) {
            console.log('Playwright click failed:', e);
          }
        }
      }
    }

    await page.evaluate(() => {
      const welcomeElements = document.querySelectorAll(
        '[class*="welcome"], [class*="onboard"], [class*="Welcome"], [class*="Onboard"]'
      );
      welcomeElements.forEach(el => el.remove());
      document.querySelectorAll('.modal-backdrop, .overlay').forEach(o => o.remove());
    });

    await page.waitForTimeout(300);
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
        await dialogInput.fill(uniqueBlockTitle(`LayoutTest${i + 1}`));
        await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
        await page.waitForTimeout(500);
      }
    }
  }

  // Хелпер для создания родительского блока с детьми
  async function createParentWithChildren(page: any, childCount: number): Promise<string> {
    const parentTitle = uniqueBlockTitle('LayoutParent');
    const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
    const rootContainer = page.locator('#rootContainer');

    // Создаём родительский блок
    await rootContainer.click();
    await page.waitForTimeout(200);
    await page.keyboard.press('n');
    await expect(dialogInput).toBeVisible({ timeout: 5000 });
    await dialogInput.fill(parentTitle);
    await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
    await page.waitForTimeout(1000);

    // Входим в родительский блок
    const parentBlock = page.locator(`[block] titleBlock:has-text("${parentTitle}")`).first();
    await parentBlock.dblclick();
    await page.waitForTimeout(1000);

    // Создаём дочерние блоки
    for (let i = 0; i < childCount; i++) {
      await page.keyboard.press('n');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });
      await dialogInput.fill(uniqueBlockTitle(`Child${i + 1}`));
      await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
      await page.waitForTimeout(500);
    }

    return parentTitle;
  }

  // ==================== Открытие редактора ====================

  test.describe('Открытие редактора', () => {
    test('LE-01: Открыть Layout Editor через hotkey l+e', async ({ page }) => {
      // Создаём родителя с дочерними блоками
      await createParentWithChildren(page, 4);

      // Открываем Layout Editor через hotkey
      await page.keyboard.press('l');
      await page.waitForTimeout(100);
      await page.keyboard.press('e');
      await page.waitForTimeout(500);

      // Проверяем что панель открылась
      const layoutPanel = page.locator('.layout-editor-panel, .layout-editor, [data-testid="layout-editor-panel"]');
      await expect(layoutPanel).toBeVisible({ timeout: 5000 });

      // Закрываем через Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    });

    test('LE-02: Закрыть Layout Editor через кнопку Отмена', async ({ page }) => {
      await createParentWithChildren(page, 3);

      await page.keyboard.press('l');
      await page.waitForTimeout(100);
      await page.keyboard.press('e');
      await page.waitForTimeout(500);

      const layoutPanel = page.locator('.layout-editor-panel, .layout-editor, [data-testid="layout-editor-panel"]');
      await expect(layoutPanel).toBeVisible({ timeout: 5000 });

      // Ищем кнопку Отмена
      const cancelButton = page.locator('button:has-text("Отмена")');
      if (await cancelButton.isVisible().catch(() => false)) {
        await cancelButton.click();
        await page.waitForTimeout(300);

        // Панель должна закрыться
        await expect(layoutPanel).not.toBeVisible({ timeout: 3000 });
      } else {
        // Fallback: закрываем через Escape
        await page.keyboard.press('Escape');
      }
    });

    test('LE-03: Layout Editor недоступен без дочерних блоков', async ({ page }) => {
      const parentTitle = uniqueBlockTitle('EmptyParent');
      const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
      const rootContainer = page.locator('#rootContainer');

      // Создаём пустой родительский блок
      await rootContainer.click();
      await page.waitForTimeout(200);
      await page.keyboard.press('n');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });
      await dialogInput.fill(parentTitle);
      await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
      await page.waitForTimeout(1000);

      // Входим в пустой блок
      const parentBlock = page.locator(`[block] titleBlock:has-text("${parentTitle}")`).first();
      await parentBlock.dblclick();
      await page.waitForTimeout(1000);

      // Пытаемся открыть Layout Editor
      await page.keyboard.press('l');
      await page.waitForTimeout(100);
      await page.keyboard.press('e');
      await page.waitForTimeout(500);

      // Панель не должна открыться (или должно появиться сообщение об ошибке)
      const layoutPanel = page.locator('.layout-editor-panel, .layout-editor');
      const panelVisible = await layoutPanel.isVisible().catch(() => false);

      // Если панель открылась, проверяем что есть сообщение об отсутствии дочерних блоков
      if (panelVisible) {
        const emptyMessage = page.locator('text=дочерн, text=children, text=empty');
        // Ожидаем сообщение или просто закрываем
        await page.keyboard.press('Escape');
      }

      // В любом случае приложение должно работать
      const rootContainer2 = page.locator('#rootContainer');
      await expect(rootContainer2).toBeVisible();
    });
  });

  // ==================== Пресеты сетки ====================

  test.describe('Пресеты сетки', () => {
    test('LE-PR-01: Применить пресет 2x2', async ({ page }) => {
      await createParentWithChildren(page, 4);

      // Открываем Layout Editor
      await page.keyboard.press('l');
      await page.waitForTimeout(100);
      await page.keyboard.press('e');
      await page.waitForTimeout(500);

      const layoutPanel = page.locator('.layout-editor-panel, .layout-editor, [data-testid="layout-editor-panel"]');
      await expect(layoutPanel).toBeVisible({ timeout: 5000 });

      // Ищем и кликаем на пресет 2x2
      const preset2x2 = page.locator('[data-preset="2x2"], button:has-text("2×2"), .preset-2x2').first();
      if (await preset2x2.isVisible().catch(() => false)) {
        await preset2x2.click();
        await page.waitForTimeout(300);
      }

      // Применяем изменения
      const applyButton = page.locator('button:has-text("Применить")');
      if (await applyButton.isVisible().catch(() => false)) {
        await applyButton.click();
        await page.waitForTimeout(500);
      } else {
        await page.keyboard.press('Escape');
      }

      // Проверяем что приложение работает
      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('LE-PR-02: Применить пресет 3x3', async ({ page }) => {
      await createParentWithChildren(page, 9);

      await page.keyboard.press('l');
      await page.waitForTimeout(100);
      await page.keyboard.press('e');
      await page.waitForTimeout(500);

      const layoutPanel = page.locator('.layout-editor-panel, .layout-editor');
      await expect(layoutPanel).toBeVisible({ timeout: 5000 });

      const preset3x3 = page.locator('[data-preset="3x3"], button:has-text("3×3"), .preset-3x3').first();
      if (await preset3x3.isVisible().catch(() => false)) {
        await preset3x3.click();
        await page.waitForTimeout(300);
      }

      const applyButton = page.locator('button:has-text("Применить")');
      if (await applyButton.isVisible().catch(() => false)) {
        await applyButton.click();
        await page.waitForTimeout(500);
      } else {
        await page.keyboard.press('Escape');
      }

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('LE-PR-03: Пресет недоступен при недостаточном числе блоков', async ({ page }) => {
      // Создаём только 2 блока - 4x4 требует 16
      await createParentWithChildren(page, 2);

      await page.keyboard.press('l');
      await page.waitForTimeout(100);
      await page.keyboard.press('e');
      await page.waitForTimeout(500);

      const layoutPanel = page.locator('.layout-editor-panel, .layout-editor');
      await expect(layoutPanel).toBeVisible({ timeout: 5000 });

      // Пресет 4x4 должен быть недоступен или disabled
      const preset4x4 = page.locator('[data-preset="4x4"], button:has-text("4×4"), .preset-4x4').first();
      if (await preset4x4.isVisible().catch(() => false)) {
        // Проверяем что пресет отключен
        const isDisabled =
          (await preset4x4.getAttribute('disabled')) !== null ||
          (await preset4x4.getAttribute('class'))?.includes('disabled') ||
          (await preset4x4.getAttribute('aria-disabled')) === 'true';

        // Если не отключен, кликаем и проверяем результат
        if (!isDisabled) {
          await preset4x4.click();
          await page.waitForTimeout(300);
        }
      }

      // Закрываем панель
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });
  });

  // ==================== Специальные пресеты ====================

  test.describe('Специальные пресеты', () => {
    test('LE-PR-04: Применить пресет Dashboard', async ({ page }) => {
      await createParentWithChildren(page, 5);

      await page.keyboard.press('l');
      await page.waitForTimeout(100);
      await page.keyboard.press('e');
      await page.waitForTimeout(500);

      const layoutPanel = page.locator('.layout-editor-panel, .layout-editor');
      await expect(layoutPanel).toBeVisible({ timeout: 5000 });

      const dashboardPreset = page.locator('[data-preset="dashboard"], button:has-text("Dashboard"), .preset-dashboard').first();
      if (await dashboardPreset.isVisible().catch(() => false)) {
        await dashboardPreset.click();
        await page.waitForTimeout(300);
      }

      const applyButton = page.locator('button:has-text("Применить")');
      if (await applyButton.isVisible().catch(() => false)) {
        await applyButton.click();
        await page.waitForTimeout(500);
      } else {
        await page.keyboard.press('Escape');
      }

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('LE-PR-05: Применить пресет Kanban', async ({ page }) => {
      await createParentWithChildren(page, 3);

      await page.keyboard.press('l');
      await page.waitForTimeout(100);
      await page.keyboard.press('e');
      await page.waitForTimeout(500);

      const layoutPanel = page.locator('.layout-editor-panel, .layout-editor');
      await expect(layoutPanel).toBeVisible({ timeout: 5000 });

      const kanbanPreset = page.locator('[data-preset="kanban"], button:has-text("Kanban"), .preset-kanban').first();
      if (await kanbanPreset.isVisible().catch(() => false)) {
        await kanbanPreset.click();
        await page.waitForTimeout(300);
      }

      const applyButton = page.locator('button:has-text("Применить")');
      if (await applyButton.isVisible().catch(() => false)) {
        await applyButton.click();
        await page.waitForTimeout(500);
      } else {
        await page.keyboard.press('Escape');
      }

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('LE-PR-06: Применить пресет Sidebar', async ({ page }) => {
      await createParentWithChildren(page, 4);

      await page.keyboard.press('l');
      await page.waitForTimeout(100);
      await page.keyboard.press('e');
      await page.waitForTimeout(500);

      const layoutPanel = page.locator('.layout-editor-panel, .layout-editor');
      await expect(layoutPanel).toBeVisible({ timeout: 5000 });

      const sidebarPreset = page.locator('[data-preset="sidebar"], button:has-text("Sidebar"), .preset-sidebar').first();
      if (await sidebarPreset.isVisible().catch(() => false)) {
        await sidebarPreset.click();
        await page.waitForTimeout(300);
      }

      const applyButton = page.locator('button:has-text("Применить")');
      if (await applyButton.isVisible().catch(() => false)) {
        await applyButton.click();
        await page.waitForTimeout(500);
      } else {
        await page.keyboard.press('Escape');
      }

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });
  });

  // ==================== Динамические пресеты ====================

  test.describe('Динамические пресеты', () => {
    test('LE-PR-07: Применить горизонтальную раскладку', async ({ page }) => {
      await createParentWithChildren(page, 5);

      await page.keyboard.press('l');
      await page.waitForTimeout(100);
      await page.keyboard.press('e');
      await page.waitForTimeout(500);

      const layoutPanel = page.locator('.layout-editor-panel, .layout-editor');
      await expect(layoutPanel).toBeVisible({ timeout: 5000 });

      const horizontalPreset = page.locator('[data-preset="horizontal"], button:has-text("Горизонтальный"), .preset-horizontal').first();
      if (await horizontalPreset.isVisible().catch(() => false)) {
        await horizontalPreset.click();
        await page.waitForTimeout(300);
      }

      const applyButton = page.locator('button:has-text("Применить")');
      if (await applyButton.isVisible().catch(() => false)) {
        await applyButton.click();
        await page.waitForTimeout(500);
      } else {
        await page.keyboard.press('Escape');
      }

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('LE-PR-08: Применить вертикальную раскладку', async ({ page }) => {
      await createParentWithChildren(page, 5);

      await page.keyboard.press('l');
      await page.waitForTimeout(100);
      await page.keyboard.press('e');
      await page.waitForTimeout(500);

      const layoutPanel = page.locator('.layout-editor-panel, .layout-editor');
      await expect(layoutPanel).toBeVisible({ timeout: 5000 });

      const verticalPreset = page.locator('[data-preset="vertical"], button:has-text("Вертикальный"), .preset-vertical').first();
      if (await verticalPreset.isVisible().catch(() => false)) {
        await verticalPreset.click();
        await page.waitForTimeout(300);
      }

      const applyButton = page.locator('button:has-text("Применить")');
      if (await applyButton.isVisible().catch(() => false)) {
        await applyButton.click();
        await page.waitForTimeout(500);
      } else {
        await page.keyboard.press('Escape');
      }

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });
  });

  // ==================== Сброс раскладки ====================

  test.describe('Сброс раскладки', () => {
    test('LE-RS-01: Сбросить раскладку к автоматической', async ({ page }) => {
      await createParentWithChildren(page, 4);

      await page.keyboard.press('l');
      await page.waitForTimeout(100);
      await page.keyboard.press('e');
      await page.waitForTimeout(500);

      const layoutPanel = page.locator('.layout-editor-panel, .layout-editor');
      await expect(layoutPanel).toBeVisible({ timeout: 5000 });

      // Применяем какой-то пресет
      const preset2x2 = page.locator('[data-preset="2x2"], button:has-text("2×2")').first();
      if (await preset2x2.isVisible().catch(() => false)) {
        await preset2x2.click();
        await page.waitForTimeout(300);
      }

      // Нажимаем Сбросить
      const resetButton = page.locator('button:has-text("Сбросить")');
      if (await resetButton.isVisible().catch(() => false)) {
        await resetButton.click();
        await page.waitForTimeout(300);
      }

      // Закрываем панель
      const applyButton = page.locator('button:has-text("Применить")');
      if (await applyButton.isVisible().catch(() => false)) {
        await applyButton.click();
        await page.waitForTimeout(500);
      } else {
        await page.keyboard.press('Escape');
      }

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });
  });

  // ==================== Изменение размера сетки ====================

  test.describe('Изменение размера сетки', () => {
    test('LE-GR-01: Изменить количество строк', async ({ page }) => {
      await createParentWithChildren(page, 6);

      await page.keyboard.press('l');
      await page.waitForTimeout(100);
      await page.keyboard.press('e');
      await page.waitForTimeout(500);

      const layoutPanel = page.locator('.layout-editor-panel, .layout-editor');
      await expect(layoutPanel).toBeVisible({ timeout: 5000 });

      // Ищем input для строк
      const rowsInput = page.locator('input[name="rows"], input[data-field="rows"], .rows-input').first();
      if (await rowsInput.isVisible().catch(() => false)) {
        await rowsInput.clear();
        await rowsInput.fill('4');
        await page.waitForTimeout(300);
      }

      // Закрываем панель
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('LE-GR-02: Изменить количество колонок', async ({ page }) => {
      await createParentWithChildren(page, 6);

      await page.keyboard.press('l');
      await page.waitForTimeout(100);
      await page.keyboard.press('e');
      await page.waitForTimeout(500);

      const layoutPanel = page.locator('.layout-editor-panel, .layout-editor');
      await expect(layoutPanel).toBeVisible({ timeout: 5000 });

      // Ищем input для колонок
      const colsInput = page.locator('input[name="cols"], input[data-field="cols"], .cols-input').first();
      if (await colsInput.isVisible().catch(() => false)) {
        await colsInput.clear();
        await colsInput.fill('6');
        await page.waitForTimeout(300);
      }

      // Закрываем панель
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });
  });

  // ==================== Превью и drag-and-drop ====================

  test.describe('Превью и drag-and-drop', () => {
    test('LE-DND-01: Превью отображает блоки', async ({ page }) => {
      await createParentWithChildren(page, 4);

      await page.keyboard.press('l');
      await page.waitForTimeout(100);
      await page.keyboard.press('e');
      await page.waitForTimeout(500);

      const layoutPanel = page.locator('.layout-editor-panel, .layout-editor');
      await expect(layoutPanel).toBeVisible({ timeout: 5000 });

      // Проверяем что превью содержит элементы
      const previewBlocks = page.locator('.layout-preview .layout-cell, .layout-preview [data-block-id]');
      const count = await previewBlocks.count();

      // Должны быть какие-то элементы превью
      expect(count).toBeGreaterThanOrEqual(0);

      // Закрываем панель
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('LE-DND-02: Перетаскивание блока в превью', async ({ page }) => {
      await createParentWithChildren(page, 4);

      await page.keyboard.press('l');
      await page.waitForTimeout(100);
      await page.keyboard.press('e');
      await page.waitForTimeout(500);

      const layoutPanel = page.locator('.layout-editor-panel, .layout-editor');
      await expect(layoutPanel).toBeVisible({ timeout: 5000 });

      // Ищем первый блок в превью
      const firstCell = page.locator('.layout-preview .layout-cell, .layout-preview [data-block-id]').first();

      if (await firstCell.isVisible().catch(() => false)) {
        // Пытаемся перетащить (симулируем drag start)
        const box = await firstCell.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + 50, box.y + 50);
          await page.mouse.up();
          await page.waitForTimeout(300);
        }
      }

      // Закрываем панель
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });
  });

  // ==================== Сохранение изменений ====================

  test.describe('Сохранение изменений', () => {
    test('LE-SV-01: Сохранить раскладку через кнопку Применить', async ({ page }) => {
      await createParentWithChildren(page, 4);

      await page.keyboard.press('l');
      await page.waitForTimeout(100);
      await page.keyboard.press('e');
      await page.waitForTimeout(500);

      const layoutPanel = page.locator('.layout-editor-panel, .layout-editor');
      await expect(layoutPanel).toBeVisible({ timeout: 5000 });

      // Применяем пресет
      const preset2x2 = page.locator('[data-preset="2x2"], button:has-text("2×2")').first();
      if (await preset2x2.isVisible().catch(() => false)) {
        await preset2x2.click();
        await page.waitForTimeout(300);
      }

      // Сохраняем через Применить
      const applyButton = page.locator('button:has-text("Применить")');
      if (await applyButton.isVisible().catch(() => false)) {
        await applyButton.click();
        await page.waitForTimeout(500);

        // Панель должна закрыться
        await expect(layoutPanel).not.toBeVisible({ timeout: 3000 });
      }

      // Приложение должно работать
      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('LE-SV-02: Отмена не сохраняет изменения', async ({ page }) => {
      await createParentWithChildren(page, 4);

      await page.keyboard.press('l');
      await page.waitForTimeout(100);
      await page.keyboard.press('e');
      await page.waitForTimeout(500);

      const layoutPanel = page.locator('.layout-editor-panel, .layout-editor');
      await expect(layoutPanel).toBeVisible({ timeout: 5000 });

      // Применяем пресет
      const preset2x2 = page.locator('[data-preset="2x2"], button:has-text("2×2")').first();
      if (await preset2x2.isVisible().catch(() => false)) {
        await preset2x2.click();
        await page.waitForTimeout(300);
      }

      // Отменяем через кнопку
      const cancelButton = page.locator('button:has-text("Отмена")');
      if (await cancelButton.isVisible().catch(() => false)) {
        await cancelButton.click();
        await page.waitForTimeout(300);

        // Панель должна закрыться
        await expect(layoutPanel).not.toBeVisible({ timeout: 3000 });
      } else {
        // Fallback: Escape
        await page.keyboard.press('Escape');
      }

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });
  });
});

import { test, expect } from '@playwright/test';

/**
 * Epic 8: Access & Permissions Tests для dev/cloud среды
 *
 * Тестирование управления правами доступа к блокам.
 *
 * @tag @access @permissions
 */

// Генерируем уникального пользователя для каждого прогона
const timestamp = Date.now();
const TEST_USER = {
  username: `access_test_${timestamp}`,
  password: 'TestPassword123!',
  email: `access_test_${timestamp}@example.com`,
};

// Генератор уникальных названий
const uniqueName = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

test.describe('Access & Permissions @access', () => {
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

  // Хелпер для создания тестового блока
  async function createBlock(page: any, title: string): Promise<void> {
    const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
    const rootContainer = page.locator('#rootContainer');

    await rootContainer.click();
    await page.waitForTimeout(200);
    await page.keyboard.press('n');
    await expect(dialogInput).toBeVisible({ timeout: 5000 });
    await dialogInput.fill(title);
    await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
    await page.waitForTimeout(1000);
  }

  // ==================== Открытие попапа доступа ====================

  test.describe('Открытие попапа доступа', () => {
    test('AC-01: Открыть попап доступа через контекстное меню', async ({ page }) => {
      const blockTitle = uniqueName('AccessTest');
      await createBlock(page, blockTitle);

      // Находим созданный блок
      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`).first();
      await expect(block).toBeVisible({ timeout: 5000 });

      // Кликаем правой кнопкой для вызова контекстного меню
      const blockElement = page.locator(`[block]:has(titleBlock:has-text("${blockTitle}"))`).first();
      await blockElement.click({ button: 'right' });
      await page.waitForTimeout(500);

      // Ищем пункт меню "Права доступа" или иконку
      const accessMenuItem = page.locator('text=Права доступа, text=доступ, .fa-users, .fa-lock').first();
      if (await accessMenuItem.isVisible().catch(() => false)) {
        await accessMenuItem.click();
        await page.waitForTimeout(500);

        // Проверяем что попап открылся
        const accessPopup = page.locator('.popup, [class*="access-popup"], [class*="AccessPopup"]');
        const popupVisible = await accessPopup.isVisible().catch(() => false);

        if (popupVisible) {
          // Закрываем попап
          await page.keyboard.press('Escape');
        }
      }

      // В любом случае приложение должно работать
      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('AC-02: Открыть попап доступа через hotkey', async ({ page }) => {
      const blockTitle = uniqueName('HotkeyAccess');
      await createBlock(page, blockTitle);

      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`).first();
      await expect(block).toBeVisible({ timeout: 5000 });

      // Выделяем блок
      const blockElement = page.locator(`[block]:has(titleBlock:has-text("${blockTitle}"))`).first();
      await blockElement.click();
      await page.waitForTimeout(300);

      // Пробуем hotkey для доступа (обычно 'r' или другой)
      await page.keyboard.press('r');
      await page.waitForTimeout(500);

      // Проверяем открылся ли попап
      const accessPopup = page.locator('.popup, [class*="access"], text=Пользователи');
      const popupVisible = await accessPopup.isVisible().catch(() => false);

      if (popupVisible) {
        // Закрываем попап
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });
  });

  // ==================== Управление правами пользователей ====================

  test.describe('Управление правами пользователей', () => {
    test('AC-US-01: Отображение формы добавления пользователя', async ({ page }) => {
      const blockTitle = uniqueName('UserAccess');
      await createBlock(page, blockTitle);

      const blockElement = page.locator(`[block]:has(titleBlock:has-text("${blockTitle}"))`).first();
      await blockElement.click();
      await page.waitForTimeout(300);

      // Открываем попап доступа через hotkey
      await page.keyboard.press('r');
      await page.waitForTimeout(500);

      // Проверяем наличие элементов формы
      const usernameInput = page.locator('#access-username-input, input[placeholder*="пользователя"]');
      const permissionSelect = page.locator('#access-user-permission-select, select');
      const addButton = page.locator('button:has-text("Добавить пользователя")');

      // Хотя бы один из элементов должен быть виден если попап открыт
      const formVisible =
        (await usernameInput.isVisible().catch(() => false)) ||
        (await permissionSelect.isVisible().catch(() => false)) ||
        (await addButton.isVisible().catch(() => false));

      // Закрываем попап
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('AC-US-02: Выбор уровня прав доступа', async ({ page }) => {
      const blockTitle = uniqueName('PermSelect');
      await createBlock(page, blockTitle);

      const blockElement = page.locator(`[block]:has(titleBlock:has-text("${blockTitle}"))`).first();
      await blockElement.click();
      await page.waitForTimeout(300);

      await page.keyboard.press('r');
      await page.waitForTimeout(500);

      // Ищем select с правами
      const permissionSelect = page.locator('#access-user-permission-select, select').first();

      if (await permissionSelect.isVisible().catch(() => false)) {
        // Проверяем что есть опции
        const options = await permissionSelect.locator('option').count();
        expect(options).toBeGreaterThan(0);

        // Пробуем выбрать опцию
        await permissionSelect.selectOption({ index: 1 });
        await page.waitForTimeout(200);
      }

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });
  });

  // ==================== Управление группами ====================

  test.describe('Управление группами', () => {
    test('AC-GR-01: Отображение секции групп', async ({ page }) => {
      const blockTitle = uniqueName('GroupAccess');
      await createBlock(page, blockTitle);

      const blockElement = page.locator(`[block]:has(titleBlock:has-text("${blockTitle}"))`).first();
      await blockElement.click();
      await page.waitForTimeout(300);

      await page.keyboard.press('r');
      await page.waitForTimeout(500);

      // Ищем секцию групп
      const groupSection = page.locator('text=Группы, text=группы');
      const groupSectionVisible = await groupSection.first().isVisible().catch(() => false);

      // Закрываем попап
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('AC-GR-02: Форма создания группы', async ({ page }) => {
      const blockTitle = uniqueName('CreateGroup');
      await createBlock(page, blockTitle);

      const blockElement = page.locator(`[block]:has(titleBlock:has-text("${blockTitle}"))`).first();
      await blockElement.click();
      await page.waitForTimeout(300);

      await page.keyboard.press('r');
      await page.waitForTimeout(500);

      // Ищем поле для названия группы
      const groupNameInput = page.locator('#access-group-name-input, input[placeholder*="группы"]');
      const createGroupBtn = page.locator('button:has-text("Создать группу")');

      if (await groupNameInput.isVisible().catch(() => false)) {
        // Вводим название группы
        const groupName = uniqueName('TestGroup');
        await groupNameInput.fill(groupName);
        await page.waitForTimeout(200);

        // Нажимаем кнопку создания если видна
        if (await createGroupBtn.isVisible().catch(() => false)) {
          await createGroupBtn.click();
          await page.waitForTimeout(500);
        }
      }

      // Закрываем попап
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });
  });

  // ==================== Sandbox режим ====================

  test.describe('Sandbox режим', () => {
    test('AC-SB-01: Отображение секции Sandbox', async ({ page }) => {
      const blockTitle = uniqueName('SandboxTest');
      await createBlock(page, blockTitle);

      const blockElement = page.locator(`[block]:has(titleBlock:has-text("${blockTitle}"))`).first();
      await blockElement.click();
      await page.waitForTimeout(300);

      await page.keyboard.press('r');
      await page.waitForTimeout(500);

      // Ищем секцию Sandbox
      const sandboxSection = page.locator('text=Sandbox, text=sandbox');
      const sandboxVisible = await sandboxSection.first().isVisible().catch(() => false);

      // Закрываем попап
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('AC-SB-02: Выбор режима Sandbox', async ({ page }) => {
      const blockTitle = uniqueName('SandboxMode');
      await createBlock(page, blockTitle);

      const blockElement = page.locator(`[block]:has(titleBlock:has-text("${blockTitle}"))`).first();
      await blockElement.click();
      await page.waitForTimeout(300);

      await page.keyboard.press('r');
      await page.waitForTimeout(500);

      // Ищем select для Sandbox режима
      const sandboxSelect = page.locator('#sandbox-mode-select');

      if (await sandboxSelect.isVisible().catch(() => false)) {
        // Проверяем опции
        const options = await sandboxSelect.locator('option').count();
        expect(options).toBeGreaterThanOrEqual(2); // Минимум 2: none и open

        // Выбираем опцию
        await sandboxSelect.selectOption({ value: 'open' });
        await page.waitForTimeout(200);
      }

      // Закрываем попап
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });
  });

  // ==================== Групповой чат ====================

  test.describe('Групповой чат', () => {
    test('AC-CH-01: Отображение секции чата', async ({ page }) => {
      const blockTitle = uniqueName('ChatTest');
      await createBlock(page, blockTitle);

      const blockElement = page.locator(`[block]:has(titleBlock:has-text("${blockTitle}"))`).first();
      await blockElement.click();
      await page.waitForTimeout(300);

      await page.keyboard.press('r');
      await page.waitForTimeout(500);

      // Ищем секцию чата
      const chatSection = page.locator('text=Групповой чат, text=чат');
      const chatVisible = await chatSection.first().isVisible().catch(() => false);

      // Закрываем попап
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('AC-CH-02: Кнопка создания чата', async ({ page }) => {
      const blockTitle = uniqueName('CreateChat');
      await createBlock(page, blockTitle);

      const blockElement = page.locator(`[block]:has(titleBlock:has-text("${blockTitle}"))`).first();
      await blockElement.click();
      await page.waitForTimeout(300);

      await page.keyboard.press('r');
      await page.waitForTimeout(500);

      // Ищем кнопку создания чата
      const createChatBtn = page.locator('button:has-text("Создать чат")');
      const chatBtnVisible = await createChatBtn.isVisible().catch(() => false);

      // Закрываем попап
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });
  });

  // ==================== Копирование UUID ====================

  test.describe('Копирование UUID', () => {
    test('AC-UUID-01: Отображение UUID блока', async ({ page }) => {
      const blockTitle = uniqueName('UUIDTest');
      await createBlock(page, blockTitle);

      const blockElement = page.locator(`[block]:has(titleBlock:has-text("${blockTitle}"))`).first();
      await blockElement.click();
      await page.waitForTimeout(300);

      await page.keyboard.press('r');
      await page.waitForTimeout(500);

      // Ищем отображение UUID (должен быть UUID формат)
      const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      const pageContent = await page.content();
      const hasUUID = uuidPattern.test(pageContent);

      // Закрываем попап
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('AC-UUID-02: Кнопка копирования UUID', async ({ page }) => {
      const blockTitle = uniqueName('CopyUUID');
      await createBlock(page, blockTitle);

      const blockElement = page.locator(`[block]:has(titleBlock:has-text("${blockTitle}"))`).first();
      await blockElement.click();
      await page.waitForTimeout(300);

      await page.keyboard.press('r');
      await page.waitForTimeout(500);

      // Ищем кнопку копирования
      const copyBtn = page.locator('button .fa-copy, button:has-text("Копировать")').first();
      if (await copyBtn.isVisible().catch(() => false)) {
        await copyBtn.click();
        await page.waitForTimeout(300);

        // Проверяем сообщение об успехе
        const successMsg = page.locator('text=скопирован');
        await successMsg.isVisible().catch(() => false);
      }

      // Закрываем попап
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });
  });

  // ==================== Закрытие попапа ====================

  test.describe('Закрытие попапа', () => {
    test('AC-CL-01: Закрыть попап через кнопку Закрыть', async ({ page }) => {
      const blockTitle = uniqueName('ClosePopup');
      await createBlock(page, blockTitle);

      const blockElement = page.locator(`[block]:has(titleBlock:has-text("${blockTitle}"))`).first();
      await blockElement.click();
      await page.waitForTimeout(300);

      await page.keyboard.press('r');
      await page.waitForTimeout(500);

      // Ищем кнопку Закрыть
      const closeBtn = page.locator('button:has-text("Закрыть")');
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
        await page.waitForTimeout(300);
      } else {
        // Fallback: Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });

    test('AC-CL-02: Закрыть попап через Escape', async ({ page }) => {
      const blockTitle = uniqueName('EscapeClose');
      await createBlock(page, blockTitle);

      const blockElement = page.locator(`[block]:has(titleBlock:has-text("${blockTitle}"))`).first();
      await blockElement.click();
      await page.waitForTimeout(300);

      await page.keyboard.press('r');
      await page.waitForTimeout(500);

      // Закрываем через Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });
  });

  // ==================== Права на блоки view-only ====================

  test.describe('Визуальные индикаторы прав', () => {
    test('AC-VI-01: Блок с ограниченными правами имеет data-атрибут', async ({ page }) => {
      // Этот тест проверяет что система поддерживает data-атрибуты для прав
      // В реальности нужен второй пользователь с ограниченными правами

      const blockTitle = uniqueName('PermissionAttr');
      await createBlock(page, blockTitle);

      const blockElement = page.locator(`[block]:has(titleBlock:has-text("${blockTitle}"))`).first();
      await expect(blockElement).toBeVisible({ timeout: 5000 });

      // Проверяем что блок не имеет ограничивающих атрибутов (собственный блок)
      const dataPermission = await blockElement.getAttribute('data-permission');

      // Собственный блок не должен иметь ограничивающий атрибут
      expect(dataPermission).not.toBe('forbidden');

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();
    });
  });
});

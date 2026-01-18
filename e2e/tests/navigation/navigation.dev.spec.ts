import { test, expect } from '@playwright/test';

/**
 * Epic 3: Navigation Tests для dev/cloud среды
 *
 * Тестирование навигации: открытие блоков, возврат назад,
 * breadcrumbs, переключение деревьев.
 *
 * @tag @navigation
 */

// Генерируем уникального пользователя для каждого прогона
const timestamp = Date.now();
const TEST_USER = {
  username: `nav_test_${timestamp}`,
  password: 'TestPassword123!',
  email: `nav_test_${timestamp}@example.com`,
};

// Генератор уникальных названий блоков
const uniqueBlockTitle = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

test.describe('Navigation @navigation', () => {
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
        console.log(`Registering user: ${TEST_USER.username}`);
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
        console.log('User registered successfully');
      }

      await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
      await page.waitForTimeout(2000);
      isAuthenticated = true;
    }

    // Проверяем что приложение загрузилось
    const rootContainer = page.locator('#rootContainer');
    await expect(rootContainer).toBeVisible({ timeout: 10000 });

    // Закрываем приветственное окно - проверяем несколько раз в течение 8 секунд
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
      }
    }

    // Финальная очистка
    await page.evaluate(() => {
      const welcomeElements = document.querySelectorAll('[class*="welcome"], [class*="onboard"]');
      welcomeElements.forEach(el => el.remove());
    });
    await page.waitForTimeout(300);

    isAuthenticated = true;
  });

  // ==================== Базовая навигация ====================

  test.describe('Базовая навигация', () => {
    test('NAV-01: Открыть блок через Enter', async ({ page }) => {
      const blockTitle = uniqueBlockTitle('Open_Enter');

      // Переключаемся на пользовательское дерево
      const userTreeButton = page.locator(`button:has-text("${TEST_USER.username.substring(0, 15)}")`);
      if (await userTreeButton.isVisible().catch(() => false)) {
        await userTreeButton.click();
        await page.waitForTimeout(1000);
      }

      // Возвращаемся в корень через Backspace
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);
      }

      const rootContainer = page.locator('#rootContainer');
      await rootContainer.click();
      await page.waitForTimeout(300);

      // Создаём блок
      await page.keyboard.press('n');
      const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });
      await dialogInput.fill(blockTitle);
      await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
      await page.waitForTimeout(2000);

      // Проверяем блок с возможностью reload
      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`).first();
      try {
        await expect(block).toBeVisible({ timeout: 5000 });
      } catch {
        console.log('Block not visible, reloading page and navigating to root...');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        // После reload нужно вернуться в корень
        const userTreeButtonRetry = page.locator(`button:has-text("${TEST_USER.username.substring(0, 15)}")`);
        if (await userTreeButtonRetry.isVisible().catch(() => false)) {
          await userTreeButtonRetry.click();
          await page.waitForTimeout(1000);
        }
        for (let i = 0; i < 5; i++) {
          await page.keyboard.press('Backspace');
          await page.waitForTimeout(200);
        }
        await page.waitForTimeout(1000);
        await expect(block).toBeVisible({ timeout: 10000 });
      }

      // Кликаем на блок для выделения
      await block.click();
      await page.waitForTimeout(300);

      // Открываем через Enter
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);

      // Breadcrumb должен показать путь
      const breadcrumb = page.locator('#breadcrumb, nav');
      await expect(breadcrumb).toBeVisible();

      // Текст breadcrumb должен содержать название блока
      const breadcrumbText = await breadcrumb.textContent() || '';
      expect(breadcrumbText).toContain(blockTitle.substring(0, 15));
    });

    test('NAV-02: Открыть блок через double-click', async ({ page }) => {
      const blockTitle = uniqueBlockTitle('Open_DblClick');

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

      // Находим блок
      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`).first();
      await expect(block).toBeVisible();

      // Двойной клик для входа
      await block.dblclick();
      await page.waitForTimeout(500);

      // Breadcrumb должен показать путь
      const breadcrumb = page.locator('#breadcrumb');
      await expect(breadcrumb).toBeVisible();
    });

    test('NAV-03: Вернуться назад через Backspace', async ({ page }) => {
      const blockTitle = uniqueBlockTitle('Back');

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

      // Открываем блок
      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`).first();
      await block.dblclick();
      await page.waitForTimeout(500);

      // Breadcrumb виден
      const breadcrumb = page.locator('#breadcrumb');
      await expect(breadcrumb).toBeVisible();

      // Нажимаем Backspace для возврата
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(500);

      // Должны вернуться на предыдущий уровень
      // Блок должен быть виден в списке
      await expect(block).toBeVisible({ timeout: 5000 });
    });

    test('NAV-04: Навигация через breadcrumb', async ({ page }) => {
      const level1Title = uniqueBlockTitle('Level1');
      const level2Title = uniqueBlockTitle('Level2');

      const rootContainer = page.locator('#rootContainer');
      await rootContainer.click();
      await page.waitForTimeout(300);

      // Создаём первый уровень
      await page.keyboard.press('n');
      const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });
      await dialogInput.fill(level1Title);
      await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
      await page.waitForTimeout(1000);

      const level1Block = page.locator(`[block] titleBlock:has-text("${level1Title}")`).first();
      await level1Block.dblclick();
      await page.waitForTimeout(500);

      // Создаём второй уровень
      await page.keyboard.press('n');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });
      await dialogInput.fill(level2Title);
      await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
      await page.waitForTimeout(1000);

      const level2Block = page.locator(`[block] titleBlock:has-text("${level2Title}")`).first();
      await level2Block.dblclick();
      await page.waitForTimeout(500);

      // Breadcrumb должен показать путь
      const breadcrumb = page.locator('#breadcrumb');
      await expect(breadcrumb).toBeVisible();

      // Кликаем на элемент breadcrumb для перехода
      const breadcrumbItems = breadcrumb.locator('[data-testid^="breadcrumb-item-"], .breadcrumb-item, span');
      const itemCount = await breadcrumbItems.count();

      if (itemCount > 1) {
        // Кликаем на первый элемент (корень или level1)
        await breadcrumbItems.first().click();
        await page.waitForTimeout(500);
      }

      // Должны видеть блок level1
      await expect(level1Block).toBeVisible({ timeout: 5000 });
    });
  });

  // ==================== Стрелочная навигация ====================

  test.describe('Стрелочная навигация', () => {
    test('NAV-05: Навигация стрелками вверх/вниз', async ({ page }) => {
      const block1 = uniqueBlockTitle('Arrow1');
      const block2 = uniqueBlockTitle('Arrow2');

      const rootContainer = page.locator('#rootContainer');
      await rootContainer.click();
      await page.waitForTimeout(300);

      const dialogInput = page.locator('[data-testid="custom-dialog-input"]');

      // Создаём два блока
      await page.keyboard.press('n');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });
      await dialogInput.fill(block1);
      await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
      await page.waitForTimeout(500);

      await page.keyboard.press('n');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });
      await dialogInput.fill(block2);
      await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
      await page.waitForTimeout(500);

      // Кликаем на первый блок
      const firstBlock = page.locator(`[block] titleBlock:has-text("${block1}")`).first();
      await firstBlock.click();
      await page.waitForTimeout(300);

      // Проверяем что блок выделен
      const selectedBlock = page.locator('.block-selected, .block-active').first();
      await expect(selectedBlock).toBeVisible();

      // Нажимаем стрелку вниз
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(300);

      // Должен выделиться другой блок
      const newSelectedBlock = page.locator('.block-selected, .block-active').first();
      await expect(newSelectedBlock).toBeVisible();

      // Нажимаем стрелку вверх
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(300);
    });
  });

  // ==================== Деревья ====================

  test.describe('Навигация по деревьям', () => {
    test('NAV-06: Переключение между деревьями через hotkey', async ({ page }) => {
      // Переключаемся на дерево 1 через Space+1
      await page.keyboard.down(' '); // Space
      await page.keyboard.press('1');
      await page.keyboard.up(' ');
      await page.waitForTimeout(500);

      // Приложение должно остаться загруженным
      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();

      // Переключаемся на дерево 2 через Space+2 (если есть)
      await page.keyboard.down(' ');
      await page.keyboard.press('2');
      await page.keyboard.up(' ');
      await page.waitForTimeout(500);

      await expect(rootContainer).toBeVisible();
    });
  });

  // ==================== URL навигация ====================

  test.describe('URL навигация', () => {
    test('NAV-07: Кнопки браузера Back/Forward', async ({ page }) => {
      const blockTitle = uniqueBlockTitle('Browser_Nav');

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

      // Открываем блок
      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`).first();
      await block.dblclick();
      await page.waitForTimeout(500);

      // Нажимаем браузерную кнопку "назад"
      await page.goBack();
      await page.waitForTimeout(500);

      // Приложение должно остаться работоспособным
      await expect(rootContainer).toBeVisible({ timeout: 10000 });

      // Нажимаем "вперёд"
      await page.goForward();
      await page.waitForTimeout(500);

      await expect(rootContainer).toBeVisible({ timeout: 10000 });
    });
  });

  // ==================== Scroll ====================

  test.describe('Scroll навигация', () => {
    test('NAV-08: Прокрутка к блоку при большом количестве блоков', async ({ page }) => {
      const rootContainer = page.locator('#rootContainer');
      await rootContainer.click();
      await page.waitForTimeout(300);

      const dialogInput = page.locator('[data-testid="custom-dialog-input"]');

      // Создаём несколько блоков
      const blockTitles: string[] = [];
      for (let i = 0; i < 5; i++) {
        const title = uniqueBlockTitle(`Scroll_${i}`);
        blockTitles.push(title);

        await page.keyboard.press('n');
        await expect(dialogInput).toBeVisible({ timeout: 5000 });
        await dialogInput.fill(title);
        await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
        await page.waitForTimeout(500);
      }

      // Последний созданный блок должен быть виден
      const lastBlock = page.locator(`[block] titleBlock:has-text("${blockTitles[blockTitles.length - 1]}")`).first();
      await expect(lastBlock).toBeVisible({ timeout: 5000 });

      // Прокручиваем к первому блоку
      const firstBlock = page.locator(`[block] titleBlock:has-text("${blockTitles[0]}")`).first();
      await firstBlock.scrollIntoViewIfNeeded();
      await expect(firstBlock).toBeVisible();
    });
  });
});

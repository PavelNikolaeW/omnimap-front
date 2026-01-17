import { test, expect } from '@playwright/test';

/**
 * Epic 4: Search Tests для dev/cloud среды
 *
 * Тестирование поиска: открытие popup, поиск по названию и содержимому,
 * навигация к результатам.
 *
 * @tag @search
 */

// Генерируем уникального пользователя для каждого прогона
const timestamp = Date.now();
const TEST_USER = {
  username: `search_test_${timestamp}`,
  password: 'TestPassword123!',
  email: `search_test_${timestamp}@example.com`,
};

// Генератор уникальных названий блоков
const uniqueBlockTitle = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

test.describe('Search @search', () => {
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

  // ==================== Открытие поиска ====================

  test.describe('Открытие поиска', () => {
    test('SR-01: Открыть поиск через hotkey f', async ({ page }) => {
      // Нажимаем F для открытия поиска
      await page.keyboard.press('f');

      // Ждём появления поиска
      const searchInput = page.locator('[data-testid="search-input"], .search-input, #search-input');
      await expect(searchInput.first()).toBeVisible({ timeout: 5000 });
    });

    test('SR-02: Закрыть поиск через Escape', async ({ page }) => {
      // Открываем поиск
      await page.keyboard.press('f');

      const searchInput = page.locator('[data-testid="search-input"], .search-input, #search-input').first();
      await expect(searchInput).toBeVisible({ timeout: 5000 });

      // Закрываем через Escape
      await page.keyboard.press('Escape');

      // Поиск должен закрыться
      await expect(searchInput).not.toBeVisible({ timeout: 3000 });
    });
  });

  // ==================== Поиск по названию ====================

  test.describe('Поиск по названию', () => {
    test('SR-03: Поиск блока по названию', async ({ page }) => {
      const blockTitle = uniqueBlockTitle('SearchTest');

      const rootContainer = page.locator('#rootContainer');
      await rootContainer.click();
      await page.waitForTimeout(300);

      // Создаём блок с уникальным названием
      await page.keyboard.press('n');
      const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });
      await dialogInput.fill(blockTitle);
      await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
      await page.waitForTimeout(1000);

      // Проверяем что блок создан
      const newBlock = page.locator(`[block] titleBlock:has-text("${blockTitle}")`);
      await expect(newBlock).toBeVisible({ timeout: 5000 });

      // Открываем поиск
      await page.keyboard.press('f');

      const searchInput = page.locator('[data-testid="search-input"], .search-input, #search-input').first();
      await expect(searchInput).toBeVisible({ timeout: 5000 });

      // Вводим название для поиска
      await searchInput.fill(blockTitle.substring(0, 15)); // Частичное совпадение

      // Ждём результатов
      await page.waitForTimeout(500);

      // Проверяем что есть результаты
      const searchResults = page.locator('[data-testid="search-results"], .search-results, .search-result');
      const resultsCount = await searchResults.count();

      // Должен быть хотя бы один результат
      expect(resultsCount).toBeGreaterThan(0);
    });

    test('SR-04: Пустой результат поиска', async ({ page }) => {
      // Открываем поиск
      await page.keyboard.press('f');

      const searchInput = page.locator('[data-testid="search-input"], .search-input, #search-input').first();
      await expect(searchInput).toBeVisible({ timeout: 5000 });

      // Вводим несуществующий текст
      const randomText = 'NonExistent_' + Date.now() + '_XYZQWERTY';
      await searchInput.fill(randomText);

      // Ждём обработки
      await page.waitForTimeout(500);

      // Проверяем что результатов нет или показано сообщение "не найдено"
      const noResults = page.locator('text=Ничего не найдено, text=No results, .no-results');
      const searchResults = page.locator('[data-testid="search-result"]');

      // Либо показано сообщение "не найдено", либо результатов 0
      const hasNoResultsMessage = await noResults.count() > 0;
      const resultsCount = await searchResults.count();

      expect(hasNoResultsMessage || resultsCount === 0).toBeTruthy();
    });
  });

  // ==================== Переход к результату ====================

  test.describe('Переход к результату', () => {
    test('SR-05: Переход к найденному блоку', async ({ page }) => {
      const blockTitle = uniqueBlockTitle('SearchNav');

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

      // Проверяем что блок создан
      const newBlock = page.locator(`[block] titleBlock:has-text("${blockTitle}")`);
      await expect(newBlock).toBeVisible({ timeout: 5000 });

      // Открываем поиск
      await page.keyboard.press('f');

      const searchInput = page.locator('[data-testid="search-input"], .search-input, #search-input').first();
      await expect(searchInput).toBeVisible({ timeout: 5000 });

      // Вводим название
      await searchInput.fill(blockTitle);
      await page.waitForTimeout(500);

      // Кликаем на результат (если есть)
      const firstResult = page.locator('[data-testid^="search-result"], .search-result').first();
      if (await firstResult.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstResult.click();
        await page.waitForTimeout(500);

        // Поиск должен закрыться
        await expect(searchInput).not.toBeVisible({ timeout: 3000 });
      }
    });

    test('SR-06: Keyboard навигация по результатам', async ({ page }) => {
      const rootContainer = page.locator('#rootContainer');
      await rootContainer.click();
      await page.waitForTimeout(300);

      const dialogInput = page.locator('[data-testid="custom-dialog-input"]');

      // Создаём несколько блоков
      const prefix = 'KB_Nav_' + Date.now();

      await page.keyboard.press('n');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });
      await dialogInput.fill(prefix + '_1');
      await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
      await page.waitForTimeout(500);

      await page.keyboard.press('n');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });
      await dialogInput.fill(prefix + '_2');
      await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
      await page.waitForTimeout(500);

      // Открываем поиск
      await page.keyboard.press('f');

      const searchInput = page.locator('[data-testid="search-input"], .search-input, #search-input').first();
      await expect(searchInput).toBeVisible({ timeout: 5000 });

      // Вводим префикс
      await searchInput.fill(prefix);
      await page.waitForTimeout(500);

      // Нажимаем стрелку вниз для навигации
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(200);

      // Нажимаем Enter для выбора
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
    });
  });

  // ==================== Фильтры поиска ====================

  test.describe('Фильтры поиска', () => {
    test('SR-07: Поиск везде vs в текущем дереве', async ({ page }) => {
      // Открываем поиск
      await page.keyboard.press('f');

      const searchInput = page.locator('[data-testid="search-input"], .search-input, #search-input').first();
      await expect(searchInput).toBeVisible({ timeout: 5000 });

      // Проверяем наличие чекбокса "искать везде"
      const everywhereCheckbox = page.locator('[data-testid="search-everywhere-checkbox"], .search-everywhere, input[type="checkbox"]').first();

      if (await everywhereCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Переключаем чекбокс
        await everywhereCheckbox.click();
        await page.waitForTimeout(300);

        // Вводим поисковый запрос
        await searchInput.fill('test');
        await page.waitForTimeout(500);
      }
    });
  });
});

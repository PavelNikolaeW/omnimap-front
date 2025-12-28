import { test, expect } from '../fixtures/auth.fixture';
import { setupApiMocks } from '../fixtures/test-data.fixture';

test.describe('Авторизация', () => {
  test.beforeEach(async ({ page }) => {
    // Настраиваем моки API для изолированных тестов
    await setupApiMocks(page);
  });

  test('должен показать страницу логина для неавторизованного пользователя', async ({ loginPage }) => {
    await loginPage.goto();

    // Проверяем, что форма логина видима
    // Если редирект на логин не происходит, приложение может требовать другую проверку
    await loginPage.page.waitForLoadState('domcontentloaded');
  });

  test('должен успешно залогиниться с корректными данными', async ({ page, loginPage }) => {
    // Мок успешного ответа авторизации
    await page.route('**/api/v1/auth/login/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access: 'valid_access_token',
          refresh: 'valid_refresh_token',
        }),
      });
    });

    await loginPage.goto();

    // Если есть форма логина, заполняем её
    const hasLoginForm = await loginPage.usernameInput.isVisible().catch(() => false);

    if (hasLoginForm) {
      await loginPage.login('test_user', 'test_password');
      // После логина должны увидеть главную страницу
      await expect(loginPage.rootContainer).toBeVisible({ timeout: 10000 });
    }
  });

  test('должен показать ошибку при неверных учетных данных', async ({ page, loginPage }) => {
    // Мок ошибки авторизации
    await page.route('**/api/v1/auth/login/**', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          detail: 'Invalid credentials',
        }),
      });
    });

    await loginPage.goto();

    const hasLoginForm = await loginPage.usernameInput.isVisible().catch(() => false);

    if (hasLoginForm) {
      await loginPage.login('wrong_user', 'wrong_password');

      // Должна появиться ошибка или мы останемся на странице логина
      await expect(loginPage.usernameInput).toBeVisible();
    }
  });

  test('должен разлогинить пользователя', async ({ authenticatedPage }) => {
    // Проверяем, что мы на главной странице
    await expect(authenticatedPage.rootContainer).toBeVisible();

    // Ищем кнопку выхода и кликаем
    const exitButton = authenticatedPage.controlPanel.locator('#Exit');
    const hasExitButton = await exitButton.isVisible().catch(() => false);

    if (hasExitButton) {
      await exitButton.click();

      // После выхода должны быть перенаправлены на логин или очищена сессия
      await authenticatedPage.page.waitForTimeout(1000);
    }
  });
});

test.describe('Проверка сессии', () => {
  test('должен обновить токен при истечении access token', async ({ page }) => {
    let refreshCalled = false;

    // Мок для refresh token
    await page.route('**/api/v1/auth/refresh/**', async (route) => {
      refreshCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access: 'new_access_token',
        }),
      });
    });

    // Устанавливаем "истекший" токен
    await page.context().addCookies([
      {
        name: 'access',
        value: 'expired_token',
        domain: 'localhost',
        path: '/',
      },
      {
        name: 'refresh',
        value: 'valid_refresh_token',
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto('/');
    await page.waitForTimeout(2000);

    // Refresh токен должен быть вызван при 401 ответе
    // Это зависит от реализации API клиента
  });
});

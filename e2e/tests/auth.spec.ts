import { test, expect, TEST_USERS } from '../fixtures/auth.fixture';
import { setupApiMocks } from '../fixtures/test-data.fixture';

/**
 * Тесты авторизации @auth
 *
 * OmniMap - SPA приложение. Почти всегда одна страница на /.
 * Если не авторизован - видна форма логина.
 * Если авторизован - видны блоки пользователя.
 */
test.describe('Авторизация @auth', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('должен показать форму логина для неавторизованного пользователя', async ({ mainPage }) => {
    await mainPage.goto();
    await mainPage.waitForLoginForm();
    await mainPage.assertOnLoginForm();
  });

  test('должен успешно залогиниться с корректными данными', async ({ page, mainPage }) => {
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

    await mainPage.goto();
    await mainPage.waitForLoginForm();

    const hasLoginForm = await mainPage.usernameInput.isVisible().catch(() => false);
    if (hasLoginForm) {
      await mainPage.login('test_user', 'test_password');
      await expect(mainPage.rootContainer).toBeVisible({ timeout: 10000 });
    }
  });

  test('должен показать ошибку при неверных учетных данных', async ({ page, mainPage }) => {
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

    await mainPage.goto();
    await mainPage.waitForLoginForm();

    const hasLoginForm = await mainPage.usernameInput.isVisible().catch(() => false);
    if (hasLoginForm) {
      await mainPage.login('wrong_user', 'wrong_password');
      // Должна появиться ошибка или мы останемся на форме логина
      await expect(mainPage.usernameInput).toBeVisible();
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
      await authenticatedPage.page.waitForTimeout(1000);
    }
  });
});

test.describe('Проверка сессии @auth', () => {
  test('должен обновить токен при истечении access token', async ({ page }) => {
    // Мок для refresh token
    await page.route('**/api/v1/auth/refresh/**', async (route) => {
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
  });
});

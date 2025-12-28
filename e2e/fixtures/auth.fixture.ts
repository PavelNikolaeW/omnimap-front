import { test as base, expect } from '@playwright/test';
import { MainPage } from '../pages/main.page';
import { LoginPage } from '../pages/login.page';

// Тестовые учетные данные (можно переопределить через env)
const TEST_USER = {
  username: process.env.E2E_TEST_USERNAME || 'test_user',
  password: process.env.E2E_TEST_PASSWORD || 'test_password',
};

/**
 * Расширенные fixtures с авторизацией и page objects
 */
type AuthFixtures = {
  mainPage: MainPage;
  loginPage: LoginPage;
  authenticatedPage: MainPage;
};

export const test = base.extend<AuthFixtures>({
  /**
   * Page Object для главной страницы (без авторизации)
   */
  mainPage: async ({ page }, use) => {
    const mainPage = new MainPage(page);
    await use(mainPage);
  },

  /**
   * Page Object для страницы логина
   */
  loginPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await use(loginPage);
  },

  /**
   * Авторизованная страница с готовой сессией
   * Для тестов, требующих авторизации
   */
  authenticatedPage: async ({ page, context }, use) => {
    const mainPage = new MainPage(page);

    // Проверяем, есть ли сохраненное состояние сессии
    const cookies = await context.cookies();
    const hasAccessToken = cookies.some(c => c.name === 'access');

    if (!hasAccessToken) {
      // Мокируем авторизацию через установку cookie
      // В реальных тестах можно выполнить логин через API
      await setupMockedAuth(page);
    }

    await mainPage.goto();
    await mainPage.waitForAppLoad();

    await use(mainPage);
  },
});

/**
 * Настройка мокированной авторизации
 * Устанавливает необходимые cookies и localStorage
 */
async function setupMockedAuth(page: any) {
  // Устанавливаем mock токены
  await page.context().addCookies([
    {
      name: 'access',
      value: 'mock_access_token_for_e2e_tests',
      domain: 'localhost',
      path: '/',
    },
    {
      name: 'refresh',
      value: 'mock_refresh_token_for_e2e_tests',
      domain: 'localhost',
      path: '/',
    },
  ]);

  // Устанавливаем mock данные пользователя в IndexedDB
  // Это делается через evaluate, так как IndexedDB не доступна напрямую
  await page.goto('/');
  await page.evaluate(() => {
    // Мок данные пользователя
    const mockUser = {
      id: 'test-user-id',
      username: 'test_user',
      email: 'test@example.com',
    };
    localStorage.setItem('currentUser', JSON.stringify(mockUser));
  });
}

/**
 * Выполнить реальный логин через UI
 * Используется когда нужен настоящий токен от backend
 */
export async function performLogin(
  loginPage: LoginPage,
  username: string = TEST_USER.username,
  password: string = TEST_USER.password
) {
  await loginPage.goto();
  await loginPage.login(username, password);
  await loginPage.assertLoginSuccess();
}

/**
 * Создать состояние сессии для переиспользования
 * Сохраняет cookies и localStorage в файл
 */
export async function createAuthState(page: any, storageStatePath: string) {
  const loginPage = new LoginPage(page);
  await performLogin(loginPage);
  await page.context().storageState({ path: storageStatePath });
}

export { expect };

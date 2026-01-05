import { test as base, expect, Page, BrowserContext } from '@playwright/test';
import { MainPage } from '../pages/main.page';
import { LoginPage } from '../pages/login.page';
import * as fs from 'fs';

/**
 * Тестовые учетные данные
 * Для реальных E2E тестов задайте через переменные окружения:
 *   E2E_TEST_USERNAME - логин тестового пользователя
 *   E2E_TEST_PASSWORD - пароль тестового пользователя
 *   E2E_USE_REAL_AUTH - установите в 'true' для использования реальной авторизации
 */
const TEST_USER = {
  username: process.env.E2E_TEST_USERNAME || 'e2e_test_user',
  password: process.env.E2E_TEST_PASSWORD || 'e2e_test_password',
};

const USE_REAL_AUTH = process.env.E2E_USE_REAL_AUTH === 'true';
const AUTH_FILE = 'e2e/.auth/user.json';

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
   *
   * Если storageState уже загружен (через playwright.config.ts),
   * просто переходим на главную. Иначе выполняем логин.
   */
  authenticatedPage: async ({ page, context }, use) => {
    const mainPage = new MainPage(page);

    // Проверяем, есть ли уже авторизация через storageState
    const hasStorageState = fs.existsSync(AUTH_FILE);
    const cookies = await context.cookies();
    const hasAuthCookie = cookies.some(c => c.name === 'access' || c.name === 'refresh');

    if (hasStorageState && hasAuthCookie) {
      // StorageState уже загружен - просто переходим на главную
      await mainPage.goto();
      await mainPage.waitForAppLoad();
    } else if (USE_REAL_AUTH) {
      // Реальная авторизация через UI (fallback)
      await performRealAuth(page);
    } else {
      // Мокированная авторизация для быстрых тестов
      await setupMockedAuth(page, context);
      await mainPage.goto();
      await mainPage.waitForAppLoad();
    }

    await use(mainPage);
  },
});

/**
 * Реальная авторизация через backend API
 * Получает настоящие JWT токены
 */
async function performRealAuth(page: Page) {
  const loginPage = new LoginPage(page);

  console.log(`[Auth] Starting real auth with user: ${TEST_USER.username}`);

  // Переходим на главную и ждём форму логина
  await loginPage.goto();
  console.log('[Auth] Login form appeared');

  // Выполняем вход
  await loginPage.login(TEST_USER.username, TEST_USER.password);
  console.log('[Auth] Credentials submitted, waiting for success...');

  // Ждём успешного входа
  await loginPage.assertLoginSuccess();
  console.log('[Auth] Login successful');
}

/**
 * Настройка мокированной авторизации
 * Устанавливает необходимые cookies и localStorage
 */
async function setupMockedAuth(page: Page, context: BrowserContext) {
  // Устанавливаем mock токены
  await context.addCookies([
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

  // Устанавливаем mock данные пользователя в IndexedDB через localforage
  await page.goto('/');
  await page.evaluate(() => {
    // Мок данные пользователя для localforage/IndexedDB
    const mockUser = 'e2e_test_user';

    // localforage хранит данные асинхронно, используем localStorage как fallback
    localStorage.setItem('currentUser', JSON.stringify(mockUser));

    // Также устанавливаем в IndexedDB если localforage доступен
    if (typeof (window as any).localforage !== 'undefined') {
      (window as any).localforage.setItem('currentUser', mockUser);
    }
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
 *
 * Использование:
 *   npx playwright test --project=setup
 *
 * Затем в других тестах:
 *   use: { storageState: 'e2e/.auth/user.json' }
 */
export async function createAuthState(page: Page, storageStatePath: string) {
  const loginPage = new LoginPage(page);
  await performLogin(loginPage);
  await page.context().storageState({ path: storageStatePath });
}

/**
 * Хелпер для получения тестовых учётных данных
 */
export function getTestCredentials() {
  return {
    username: TEST_USER.username,
    password: TEST_USER.password,
    isRealAuth: USE_REAL_AUTH,
  };
}

export { expect };

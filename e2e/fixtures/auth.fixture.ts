import { test as base, expect, BrowserContext } from '@playwright/test';
import { MainPage } from '../pages/main.page';
import * as fs from 'fs';

/**
 * Тестовые учетные данные E2E пользователей
 *
 * Структура пользователей на бэкенде:
 * - e2e_admin (owner) - имеет корневой блок с дочерними блоками
 * - e2e_editor - имеет свой корневой блок + ссылку на shared блок admin'а
 * - e2e_viewer - имеет свой корневой блок + ссылку на shared блок (только просмотр)
 */
export const TEST_USERS = {
  admin: {
    username: process.env.E2E_TEST_USERNAME || 'e2e_admin',
    password: process.env.E2E_TEST_PASSWORD || 'e2e_admin_password',
  },
  editor: {
    username: process.env.E2E_EDITOR_USERNAME || 'e2e_editor',
    password: process.env.E2E_EDITOR_PASSWORD || 'e2e_editor_password',
  },
  viewer: {
    username: process.env.E2E_VIEWER_USERNAME || 'e2e_viewer',
    password: process.env.E2E_VIEWER_PASSWORD || 'e2e_viewer_password',
  },
};

const AUTH_FILE = 'e2e/.auth/user.json';

/**
 * Fixtures для E2E тестов
 */
type AuthFixtures = {
  /** MainPage без авторизации */
  mainPage: MainPage;
  /** MainPage с авторизацией (через storageState или логин) */
  authenticatedPage: MainPage;
};

/**
 * Хелпер: дождаться появления sidebar (признак что IndexedDB загружен)
 */
async function waitForSidebarVisible(page: any, timeout = 10000): Promise<boolean> {
  try {
    await page.waitForSelector('#sidebar:not(.hidden)', { state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

export const test = base.extend<AuthFixtures>({
  /**
   * MainPage без авторизации - для тестов формы логина
   * Очищаем cookies чтобы показать форму логина
   */
  mainPage: async ({ page, context }, use) => {
    // Очищаем авторизационные cookies для теста неавторизованного состояния
    await context.clearCookies();
    const mainPage = new MainPage(page);
    await use(mainPage);
  },

  /**
   * MainPage с авторизацией
   *
   * Стратегия:
   * 1. Если cookies есть и sidebar виден → IndexedDB в порядке, используем
   * 2. Если cookies есть но sidebar скрыт → IndexedDB пустой, нужен логин
   * 3. Если cookies нет → нужен логин
   *
   * После успешного логина приложение сохраняет данные в IndexedDB.
   * IndexedDB сохраняется между тестами в рамках одного worker.
   */
  authenticatedPage: async ({ page, context }, use) => {
    const mainPage = new MainPage(page);

    // Переходим на главную
    await mainPage.goto();

    // Ждём начальной загрузки (либо форма логина, либо блоки)
    const loginFormVisible = await page
      .waitForSelector('#login-form', { state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (loginFormVisible) {
      // Форма логина видна → нужен логин
      await mainPage.login(TEST_USERS.admin.username, TEST_USERS.admin.password);
      await mainPage.assertLoginSuccess();
    } else {
      // Форма не появилась - проверяем sidebar (признак что IndexedDB загружен)
      const sidebarVisible = await waitForSidebarVisible(page, 3000);

      if (!sidebarVisible) {
        // Sidebar скрыт - возможно IndexedDB пустой, перезагружаем и логинимся
        console.log('[E2E] Sidebar not visible, attempting re-login...');
        await context.clearCookies();
        await page.reload();

        // Ждём форму логина
        await page.waitForSelector('#login-form', { state: 'visible', timeout: 10000 });
        await mainPage.login(TEST_USERS.admin.username, TEST_USERS.admin.password);
        await mainPage.assertLoginSuccess();
      } else {
        // Sidebar виден - всё ок, ждём загрузки
        await mainPage.waitForAppLoad();
      }
    }

    // Ждём рендеринга блоков
    await mainPage.waitForShowedBlocks();

    await use(mainPage);
  },
});

/**
 * Создать состояние сессии для переиспользования
 */
export async function createAuthState(page: any, storageStatePath: string) {
  const mainPage = new MainPage(page);
  await mainPage.gotoAndLogin(TEST_USERS.admin.username, TEST_USERS.admin.password);
  await page.context().storageState({ path: storageStatePath });
}

/**
 * Хелпер для получения тестовых учётных данных
 */
export function getTestCredentials(userType: 'admin' | 'editor' | 'viewer' = 'admin') {
  return TEST_USERS[userType];
}

export { expect };

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
   * Стратегия: всегда логинимся через UI для надёжности.
   * storageState сохраняет только cookies, но не IndexedDB (localforage).
   * Поэтому проще всегда делать полный логин - это занимает ~2-3 сек.
   */
  authenticatedPage: async ({ page, context }, use) => {
    const mainPage = new MainPage(page);

    // Переходим на главную
    await mainPage.goto();

    // Ждём либо форму логина, либо блоки (если уже залогинен)
    const loginFormVisible = await page
      .waitForSelector('#login-form', { state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (loginFormVisible) {
      // Нужен логин
      await mainPage.login(TEST_USERS.admin.username, TEST_USERS.admin.password);
      await mainPage.assertLoginSuccess();
    } else {
      // Проверяем что блоки загрузились
      await mainPage.waitForAppLoad();
    }

    // Ждём рендеринга блоков
    await mainPage.waitForShowedBlocks();

    // Экспортируем localforage на window для тестов storage
    await page.evaluate(() => {
      // Пытаемся найти localforage в webpack modules
      // @ts-ignore
      if (typeof window.__webpack_require__ !== 'undefined') {
        try {
          // Ищем localforage в модулях webpack
          // @ts-ignore
          const moduleCache = window.__webpack_require__.c;
          for (const key in moduleCache) {
            const mod = moduleCache[key];
            if (mod?.exports?.getItem && mod?.exports?.setItem && mod?.exports?.keys) {
              // @ts-ignore
              window.localforage = mod.exports;
              console.log('[E2E] localforage exported to window');
              break;
            }
          }
        } catch (e) {
          console.log('[E2E] Failed to export localforage:', e);
        }
      }
    });

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

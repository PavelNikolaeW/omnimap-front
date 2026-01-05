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
   * Использует storageState если есть, иначе логинится через UI
   *
   * ВАЖНО: storageState не сохраняет IndexedDB (localforage), поэтому даже если
   * cookies есть, localforage может быть пустым. В этом случае AuthStateManager
   * считает пользователя неавторизованным и скрывает sidebar.
   *
   * Решение: если cookies есть, но sidebar скрыт - перелогиниваемся через UI.
   */
  authenticatedPage: async ({ page, context }, use) => {
    const mainPage = new MainPage(page);

    // Проверяем, есть ли уже авторизация через storageState
    const hasStorageState = fs.existsSync(AUTH_FILE);
    const cookies = await context.cookies();
    const hasAuthCookie = cookies.some((c) => c.name === 'access' || c.name === 'refresh');

    if (hasStorageState && hasAuthCookie) {
      // StorageState уже загружен - переходим и ждём блоки
      await mainPage.goto();
      await mainPage.waitForAppLoad();
      await mainPage.waitForShowedBlocks();

      // Проверяем, виден ли sidebar (индикатор того, что localforage содержит currentUser)
      const sidebar = page.locator('#sidebar');
      const sidebarHidden = await sidebar.evaluate((el) => el.classList.contains('hidden'));

      if (sidebarHidden) {
        // Sidebar скрыт - значит localforage пустой, нужно перелогиниться
        console.log('[E2E] Sidebar hidden - localforage empty, re-authenticating...');

        // Очищаем cookies
        await context.clearCookies();

        // Очищаем IndexedDB (localforage)
        await page.evaluate(async () => {
          // Удаляем все базы данных IndexedDB
          const dbs = await indexedDB.databases();
          for (const db of dbs) {
            if (db.name) {
              indexedDB.deleteDatabase(db.name);
            }
          }
          // Очищаем localStorage и sessionStorage
          localStorage.clear();
          sessionStorage.clear();
        });

        // Перезагружаем страницу с новым контекстом (без cookies и данных)
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Ждём появления формы логина
        const hasLoginForm = await page
          .waitForSelector('#login-form', { state: 'visible', timeout: 10000 })
          .then(() => true)
          .catch(() => false);

        console.log('[E2E] Login form appeared:', hasLoginForm);

        if (hasLoginForm) {
          // Логинимся через UI
          await mainPage.login(TEST_USERS.admin.username, TEST_USERS.admin.password);
          await mainPage.assertLoginSuccess();
          await mainPage.waitForShowedBlocks();

          // Ждём пока sidebar станет видимым (после Login события)
          await sidebar.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
            console.log('[E2E] Warning: sidebar still not visible after re-auth');
          });
        } else {
          console.log('[E2E] Warning: login form did not appear after clearing cookies');
        }
      }
    } else {
      // Логинимся через UI
      await mainPage.gotoAndLogin(TEST_USERS.admin.username, TEST_USERS.admin.password);
    }

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

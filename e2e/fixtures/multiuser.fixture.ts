import { test as base, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { MainPage } from '../pages/main.page';

/**
 * Конфигурация тестовых пользователей
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

/**
 * Сессия пользователя с page и mainPage
 */
export interface UserSession {
  context: BrowserContext;
  page: Page;
  mainPage: MainPage;
  username: string;
}

/**
 * Ожидает события ShowedBlocks
 */
async function waitForShowedBlocks(page: Page, timeout = 15000): Promise<void> {
  await page.waitForFunction(
    () => {
      return new Promise<boolean>((resolve) => {
        const blocks = document.querySelectorAll('[block]');
        if (blocks.length > 0) {
          resolve(true);
          return;
        }

        const root = document.getElementById('rootContainer');
        if (root && root.children.length > 0) {
          resolve(true);
          return;
        }

        const handler = () => {
          window.removeEventListener('ShowedBlocks', handler);
          resolve(true);
        };
        window.addEventListener('ShowedBlocks', handler);

        setTimeout(() => {
          window.removeEventListener('ShowedBlocks', handler);
          resolve(true);
        }, 10000);
      });
    },
    { timeout }
  );
}

/**
 * Создаёт авторизованную сессию для пользователя
 */
async function createUserSession(
  browser: Browser,
  user: { username: string; password: string }
): Promise<UserSession> {
  const context = await browser.newContext();
  const page = await context.newPage();

  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(user.username, user.password);
  await loginPage.assertLoginSuccess();

  // Ждём загрузки приложения и рендера блоков
  await waitForShowedBlocks(page);

  const mainPage = new MainPage(page);

  return {
    context,
    page,
    mainPage,
    username: user.username,
  };
}

/**
 * Закрывает сессию пользователя
 */
async function closeUserSession(session: UserSession): Promise<void> {
  await session.context.close();
}

/**
 * Fixtures для мультипользовательских тестов
 */
export const test = base.extend<{
  adminSession: UserSession;
  editorSession: UserSession;
  viewerSession: UserSession;
  createSession: (user: { username: string; password: string }) => Promise<UserSession>;
}>({
  /**
   * Сессия админа (владельца)
   */
  adminSession: async ({ browser }, use) => {
    const session = await createUserSession(browser, TEST_USERS.admin);
    await use(session);
    await closeUserSession(session);
  },

  /**
   * Сессия редактора
   */
  editorSession: async ({ browser }, use) => {
    const session = await createUserSession(browser, TEST_USERS.editor);
    await use(session);
    await closeUserSession(session);
  },

  /**
   * Сессия viewer (только просмотр)
   */
  viewerSession: async ({ browser }, use) => {
    const session = await createUserSession(browser, TEST_USERS.viewer);
    await use(session);
    await closeUserSession(session);
  },

  /**
   * Фабрика для создания произвольной сессии
   */
  createSession: async ({ browser }, use) => {
    const sessions: UserSession[] = [];

    const factory = async (user: { username: string; password: string }) => {
      const session = await createUserSession(browser, user);
      sessions.push(session);
      return session;
    };

    await use(factory);

    // Закрываем все созданные сессии
    for (const session of sessions) {
      await closeUserSession(session);
    }
  },
});

export { expect, waitForShowedBlocks };

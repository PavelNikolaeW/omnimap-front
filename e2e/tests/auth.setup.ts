import { test as setup, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page';

/**
 * Setup project - выполняется один раз перед всеми тестами.
 * Создаёт storageState с авторизованной сессией для переиспользования.
 *
 * Это экономит ~2-5 секунд на каждом тесте, так как не нужно
 * каждый раз проходить через UI логина.
 */

const authFile = 'e2e/.auth/user.json';

const TEST_USER = {
  username: process.env.E2E_TEST_USERNAME || 'admin',
  password: process.env.E2E_TEST_PASSWORD || 'e2e_admin_password',
};

setup('authenticate and save state', async ({ page }) => {
  const loginPage = new LoginPage(page);

  console.log(`[Auth Setup] Authenticating as ${TEST_USER.username}...`);

  // Переходим на страницу и ждём форму логина
  await loginPage.goto();

  // Выполняем вход
  await loginPage.login(TEST_USER.username, TEST_USER.password);

  // Ждём успешного входа
  await loginPage.assertLoginSuccess();

  console.log('[Auth Setup] Login successful, saving storage state...');

  // Сохраняем storage state (cookies + localStorage + sessionStorage)
  await page.context().storageState({ path: authFile });

  console.log(`[Auth Setup] Storage state saved to ${authFile}`);
});

import { test as setup } from '@playwright/test';
import { MainPage } from '../pages/main.page';

/**
 * Setup project - выполняется один раз перед всеми тестами.
 * Создаёт storageState с авторизованной сессией для переиспользования.
 */

const authFile = 'e2e/.auth/user.json';

const TEST_USER = {
  username: process.env.E2E_TEST_USERNAME || 'e2e_admin',
  password: process.env.E2E_TEST_PASSWORD || 'e2e_admin_password',
};

setup('authenticate and save state', async ({ page }) => {
  const mainPage = new MainPage(page);

  console.log(`[Auth Setup] Authenticating as ${TEST_USER.username}...`);

  await mainPage.gotoAndLogin(TEST_USER.username, TEST_USER.password);

  console.log('[Auth Setup] Login successful, saving storage state...');

  await page.context().storageState({ path: authFile });

  console.log(`[Auth Setup] Storage state saved to ${authFile}`);
});

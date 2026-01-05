import { test as setup, expect } from '@playwright/test';
import { LoginPage } from './pages/login.page';

// NOTE: This file is NOT used by playwright.config.ts
// The actual auth setup is in e2e/tests/auth.setup.ts

/**
 * Глобальный setup для E2E тестов
 *
 * Выполняет авторизацию один раз и сохраняет состояние сессии
 * в файл, который переиспользуется всеми последующими тестами.
 *
 * Это значительно ускоряет выполнение тестов, т.к. логин
 * выполняется только один раз на весь тестовый прогон.
 */

const authFile = 'e2e/.auth/user.json';

setup('authenticate', async ({ page }) => {
  const username = process.env.E2E_TEST_USERNAME || 'admin';
  const password = process.env.E2E_TEST_PASSWORD || 'e2e_admin_password';

  console.log(`[Setup] Authenticating as ${username}...`);

  const loginPage = new LoginPage(page);
  await loginPage.goto();

  // Ждём загрузки страницы
  await page.waitForLoadState('domcontentloaded');

  // Выполняем логин
  await loginPage.login(username, password);

  // Проверяем успешность логина
  await loginPage.assertLoginSuccess();

  console.log('[Setup] Authentication successful, saving storage state...');

  // Сохраняем состояние сессии (cookies, localStorage)
  await page.context().storageState({ path: authFile });

  console.log(`[Setup] Storage state saved to ${authFile}`);
});

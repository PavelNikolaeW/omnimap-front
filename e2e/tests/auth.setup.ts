import { test as setup, expect } from '@playwright/test';
import { MainPage } from '../pages/main.page';

/**
 * Setup project - выполняется один раз перед всеми тестами.
 * Создаёт storageState с авторизованной сессией для переиспользования.
 *
 * Логика:
 * 1. Попытка логина
 * 2. Если логин не удался — попытка регистрации + повторный логин
 * 3. Сохранение storageState
 */

const authFile = 'e2e/.auth/user.json';

const TEST_USER = {
  username: process.env.E2E_TEST_USERNAME || 'e2e_admin',
  password: process.env.E2E_TEST_PASSWORD || 'e2e_admin_password',
};

// Учётные данные для автоматической регистрации на cloud.ru
const CLOUD_REGISTER_USER = {
  username: process.env.E2E_VERIFY_USERNAME || 'e2e_verify_test',
  password: process.env.E2E_VERIFY_PASSWORD || 'e2e_verify_pass_2026',
};

/**
 * Попытка зарегистрировать пользователя через API
 */
async function tryRegister(
  baseURL: string,
  username: string,
  password: string
): Promise<boolean> {
  try {
    const response = await fetch(`${baseURL}/api/v1/register/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    console.log(`[Auth Setup] Registration attempt: ${response.status}`);
    return response.ok || response.status === 409; // 409 = already exists
  } catch (err) {
    console.log(`[Auth Setup] Registration failed: ${err}`);
    return false;
  }
}

setup('authenticate and save state', async ({ page }) => {
  const mainPage = new MainPage(page);
  const user = TEST_USER;

  console.log(`[Auth Setup] Authenticating as ${user.username}...`);

  // Попытка 1: стандартный логин
  try {
    await mainPage.gotoAndLogin(user.username, user.password);
    console.log('[Auth Setup] Login successful, saving storage state...');
    await page.context().storageState({ path: authFile });
    console.log(`[Auth Setup] Storage state saved to ${authFile}`);
    return;
  } catch (loginError) {
    console.log(`[Auth Setup] Login failed for ${user.username}, trying registration...`);
  }

  // Попытка 2: регистрация + повторный логин
  // Для verify config (webpack.verify.js) API может быть на cloud.ru
  const pageURL = page.url().replace(/\/$/, '') || 'http://localhost:3000';
  const apiURL = await page.evaluate(() => {
    const config = (window as any).__OMNIMAP_CONFIG__;
    return config?.APP_BACKEND_URL || null;
  }) || pageURL;
  const registered = await tryRegister(apiURL, user.username, user.password);

  if (!registered) {
    // Попробуем cloud-учётные данные для регистрации
    console.log(`[Auth Setup] Trying cloud registration credentials...`);
    await tryRegister(apiURL, CLOUD_REGISTER_USER.username, CLOUD_REGISTER_USER.password);
  }

  // Повторный логин после регистрации
  console.log(`[Auth Setup] Retrying login after registration...`);
  await mainPage.gotoAndLogin(user.username, user.password);

  console.log('[Auth Setup] Login successful after registration, saving storage state...');
  await page.context().storageState({ path: authFile });
  console.log(`[Auth Setup] Storage state saved to ${authFile}`);
});

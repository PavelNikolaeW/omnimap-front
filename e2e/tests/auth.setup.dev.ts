import { test as setup, expect } from '@playwright/test';
import path from 'path';

/**
 * Auth setup для dev среды (omnimap.cloud.ru)
 *
 * Этот файл выполняется один раз перед запуском smoke тестов на dev среде.
 * Авторизует тестового пользователя и сохраняет storageState.
 *
 * ВАЖНО: Перед запуском создайте тестового пользователя на omnimap.cloud.ru:
 * - username: e2e_test_dev (или задайте через E2E_DEV_USERNAME)
 * - password: TestPassword123! (или задайте через E2E_DEV_PASSWORD)
 */

const authFile = path.join(__dirname, '../.auth/user.dev.json');

const TEST_USER = {
  username: process.env.E2E_DEV_USERNAME || 'e2e_test_dev',
  password: process.env.E2E_DEV_PASSWORD || 'TestPassword123!',
};

setup('authenticate on dev and save state', async ({ page }) => {
  console.log(`Authenticating user ${TEST_USER.username} on dev environment...`);

  await page.goto('/');

  // Проверяем, нужна ли авторизация
  const hasLoginForm = await page
    .waitForSelector('#login-form', { state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (!hasLoginForm) {
    console.log('Already authenticated, checking for main app...');
    const rootContainer = page.locator('#rootContainer');
    await expect(rootContainer).toBeVisible({ timeout: 10000 });
    await page.context().storageState({ path: authFile });
    return;
  }

  console.log('Login form found, attempting to login...');

  // Находим форму логина
  const loginForm = page.locator('#login-form');
  await expect(loginForm).toBeVisible({ timeout: 5000 });

  // Проверяем что это форма логина, а не регистрации
  const loginHeading = loginForm.getByRole('heading', { name: 'Вход' });
  const hasLoginHeading = await loginHeading.isVisible().catch(() => false);

  if (!hasLoginHeading) {
    // Возможно показывается форма регистрации - переключаемся на вход
    const switchToLoginButton = page.locator('button:has-text("Уже есть аккаунт")');
    const hasSwitchButton = await switchToLoginButton.isVisible().catch(() => false);
    if (hasSwitchButton) {
      await switchToLoginButton.click();
      await page.waitForTimeout(500);
    }
  }

  // Заполняем форму логина с использованием accessible selectors
  const loginSection = page.getByRole('heading', { name: 'Вход' }).locator('..');

  // Имя пользователя
  const usernameInput = loginSection.getByRole('textbox', { name: 'Имя пользователя' });
  await expect(usernameInput).toBeVisible({ timeout: 5000 });
  await usernameInput.fill(TEST_USER.username);
  await page.waitForTimeout(100);

  // Пароль - ищем input с label "Пароль" или используем селектор по типу
  // На dev форме пароль не имеет ID, поэтому используем комбинацию селекторов
  const passwordLabel = loginSection.locator('text=Пароль').first();
  await expect(passwordLabel).toBeVisible({ timeout: 5000 });

  // Находим input[type="password"] в секции логина
  const passwordInput = loginSection.locator('input[type="password"]').first();
  await expect(passwordInput).toBeVisible({ timeout: 5000 });
  await passwordInput.fill(TEST_USER.password);
  await page.waitForTimeout(100);

  // Нажимаем кнопку входа
  const loginButton = page.locator('button:has-text("Войти")');
  await loginButton.click();

  console.log('Login submitted, waiting for main app...');

  // Ждём загрузки приложения после логина
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // Проверяем успешный вход
  const rootContainer = page.locator('#rootContainer');
  await expect(rootContainer).toBeVisible({ timeout: 10000 });

  console.log('Successfully authenticated, checking cookies...');

  // Ждём дольше чтобы cookies успели установиться
  await page.waitForTimeout(3000);

  // Проверяем cookies для всех доменов
  const allCookies = await page.context().cookies();
  console.log(`Found ${allCookies.length} total cookies:`);
  allCookies.forEach(c => {
    console.log(`  - ${c.name}: ${c.value.substring(0, 30)}... (domain: ${c.domain}, path: ${c.path}, httpOnly: ${c.httpOnly}, secure: ${c.secure})`);
  });

  // Проверяем cookies конкретно для omnimap.cloud.ru
  const omnimapCookies = await page.context().cookies('http://omnimap.cloud.ru');
  console.log(`\nCookies for omnimap.cloud.ru: ${omnimapCookies.length}`);
  omnimapCookies.forEach(c => {
    console.log(`  - ${c.name} = ${c.value.substring(0, 30)}...`);
  });

  // Проверяем localStorage тоже
  const localStorageData = await page.evaluate(() => {
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key) || '';
        data[key] = value.substring(0, 50);
      }
    }
    return data;
  });
  console.log(`\nLocalStorage keys: ${Object.keys(localStorageData).join(', ')}`);

  if (allCookies.length === 0) {
    console.warn('WARNING: No cookies found after authentication!');
  }

  // Сохраняем состояние авторизации (cookies)
  await page.context().storageState({ path: authFile });

  console.log(`Storage state saved to ${authFile}`);
});

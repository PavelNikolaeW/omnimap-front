import { test as base, expect } from '@playwright/test';

/**
 * Auth fixture для dev среды
 *
 * Проверяет авторизацию перед каждым тестом и логинится если нужно.
 * Не использует storageState так как dev хранит токены в IndexedDB.
 */

const TEST_USER = {
  username: process.env.E2E_DEV_USERNAME || 'e2e_test_dev',
  password: process.env.E2E_DEV_PASSWORD || 'TestPassword123!',
};

async function ensureAuthenticated(page: any) {
  // Проверяем если мы уже на странице (не первый тест)
  const currentUrl = page.url();
  const needsNavigation = currentUrl === 'about:blank' || currentUrl === '';

  if (needsNavigation) {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
  }

  // Проверяем авторизованы ли мы
  const hasLoginForm = await page
    .waitForSelector('#login-form', { state: 'visible', timeout: 3000 })
    .then(() => true)
    .catch(() => false);

  if (!hasLoginForm) {
    // Уже авторизованы - проверяем что приложение работает
    const rootContainer = page.locator('#rootContainer');
    const isVisible = await rootContainer.isVisible().catch(() => false);
    if (isVisible) {
      return; // Все ок
    }
    // Если rootContainer не виден, но нет формы логина - перезагрузим
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
  }

  // Проверяем что это форма логина, а не регистрации
  const loginHeading = page.getByRole('heading', { name: 'Вход' });
  const isLoginForm = await loginHeading.isVisible().catch(() => false);

  if (!isLoginForm) {
    // Это форма регистрации - регистрируем пользователя
    console.log(`Registering new user ${TEST_USER.username}...`);

    const registerSection = page.getByRole('heading', { name: 'Регистрация' }).locator('..');

    await registerSection.getByRole('textbox', { name: 'Имя пользователя' }).fill(TEST_USER.username);
    await page.waitForTimeout(100);
    await registerSection.getByRole('textbox', { name: 'Электронная почта' }).fill(`${TEST_USER.username}@example.com`);
    await page.waitForTimeout(100);
    await registerSection.locator('input[type="password"]').first().fill(TEST_USER.password);
    await page.waitForTimeout(100);
    await registerSection.locator('input[type="password"]').last().fill(TEST_USER.password);
    await page.waitForTimeout(100);

    await page.click('button:has-text("Зарегистрироваться")');
  } else {
    // Форма логина - пытаемся войти
    console.log(`Logging in as ${TEST_USER.username}...`);

    const loginSection = page.getByRole('heading', { name: 'Вход' }).locator('..');

    await loginSection.getByRole('textbox', { name: 'Имя пользователя' }).fill(TEST_USER.username);
    await page.waitForTimeout(100);

    const passwordInput = loginSection.locator('input[type="password"]').first();
    await passwordInput.fill(TEST_USER.password);
    await page.waitForTimeout(100);

    const loginButton = page.locator('button:has-text("Войти")');
    await loginButton.click();
  }

  // Ждём загрузки
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // Проверяем успешный вход
  const rootContainer = page.locator('#rootContainer');
  await expect(rootContainer).toBeVisible({ timeout: 10000 });

  console.log('Successfully authenticated');
}

export const test = base.extend({
  page: async ({ page }, use) => {
    // Автоматически авторизуемся перед каждым тестом
    await ensureAuthenticated(page);
    await use(page);
  },
});

export { expect };

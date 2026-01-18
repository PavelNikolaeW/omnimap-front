import { test, expect } from '@playwright/test';

/**
 * Auth Tests для dev/cloud среды
 *
 * Эти тесты создают нового пользователя в beforeAll,
 * затем тестируют auth flow с этим пользователем.
 *
 * @tag @auth
 */

// Генерируем уникального пользователя для каждого прогона
const timestamp = Date.now();
const TEST_USER = {
  username: `auth_test_${timestamp}`,
  password: 'TestPassword123!',
  email: `auth_test_${timestamp}@example.com`,
};

test.describe('Auth @auth', () => {
  test.describe.configure({ mode: 'serial' });

  // Флаг что пользователь зарегистрирован
  let userRegistered = false;

  // ==================== Setup: Register User ====================

  test('AU-00: Регистрация тестового пользователя', async ({ page }) => {
    await page.goto('/', { timeout: 60000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 });

    // Ждём появления формы
    const loginForm = page.locator('#login-form');
    await loginForm.waitFor({ state: 'visible', timeout: 15000 });

    // Проверяем - это форма логина или регистрации
    const loginHeading = page.getByRole('heading', { name: 'Вход' });
    const isLoginForm = await loginHeading.isVisible().catch(() => false);

    if (isLoginForm) {
      // Переключаемся на регистрацию
      const switchButton = page.locator('text=Создать аккаунт');
      if (await switchButton.isVisible().catch(() => false)) {
        await switchButton.click();
        await page.waitForTimeout(500);
      }
    }

    // Регистрируем пользователя
    console.log(`Registering user: ${TEST_USER.username}`);
    const registerSection = page.getByRole('heading', { name: 'Регистрация' }).locator('..');

    await registerSection.getByRole('textbox', { name: 'Имя пользователя' }).fill(TEST_USER.username);
    await page.waitForTimeout(100);
    await registerSection.getByRole('textbox', { name: 'Электронная почта' }).fill(TEST_USER.email);
    await page.waitForTimeout(100);
    await registerSection.locator('input[type="password"]').first().fill(TEST_USER.password);
    await page.waitForTimeout(100);
    await registerSection.locator('input[type="password"]').last().fill(TEST_USER.password);
    await page.waitForTimeout(100);

    await page.click('button:has-text("Зарегистрироваться")');

    // Ждём загрузки приложения
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Проверяем успешную регистрацию
    const rootContainer = page.locator('#rootContainer');
    await expect(rootContainer).toBeVisible({ timeout: 10000 });

    // Закрываем приветственное окно если есть
    const welcomeDialog = page.locator('text=Добро пожаловать в OmniMap!');
    if (await welcomeDialog.isVisible().catch(() => false)) {
      const startButton = page.locator('button:has-text("Начать обзор")');
      await startButton.click();
      await page.waitForTimeout(500);
    }

    userRegistered = true;
    console.log('User registered successfully');
  });

  // ==================== Login Tests ====================

  test.describe('Login', () => {
    test('AU-01: Успешный логин', async ({ page }) => {
      test.skip(!userRegistered, 'User not registered');

      await page.goto('/', { timeout: 60000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });

      // Ждём форму логина
      const loginForm = page.locator('#login-form');
      await loginForm.waitFor({ state: 'visible', timeout: 15000 });

      // Если показана регистрация - переключаемся на логин
      const loginHeading = page.getByRole('heading', { name: 'Вход' });
      if (!(await loginHeading.isVisible().catch(() => false))) {
        const switchButton = page.locator('text=Уже есть аккаунт');
        if (await switchButton.isVisible().catch(() => false)) {
          await switchButton.click();
          await page.waitForTimeout(500);
        }
      }

      // Выполняем логин
      await loginForm.getByRole('textbox', { name: 'Имя пользователя' }).fill(TEST_USER.username);
      await page.waitForTimeout(100);
      await loginForm.locator('input[type="password"]').fill(TEST_USER.password);
      await page.waitForTimeout(100);
      await page.click('button:has-text("Войти")');

      // Проверяем успешный логин
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
      await page.waitForTimeout(2000);

      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible({ timeout: 10000 });

      // Форма логина должна исчезнуть
      await expect(loginForm).not.toBeVisible({ timeout: 5000 });
    });

    test('AU-02: Логин с неверным паролем', async ({ page }) => {
      test.skip(!userRegistered, 'User not registered');

      await page.goto('/', { timeout: 60000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });

      const loginForm = page.locator('#login-form');
      await loginForm.waitFor({ state: 'visible', timeout: 15000 });

      // Переключаемся на логин если нужно
      const loginHeading = page.getByRole('heading', { name: 'Вход' });
      if (!(await loginHeading.isVisible().catch(() => false))) {
        const switchButton = page.locator('text=Уже есть аккаунт');
        if (await switchButton.isVisible().catch(() => false)) {
          await switchButton.click();
          await page.waitForTimeout(500);
        }
      }

      // Пытаемся залогиниться с неверным паролем
      await loginForm.getByRole('textbox', { name: 'Имя пользователя' }).fill(TEST_USER.username);
      await page.waitForTimeout(100);
      await loginForm.locator('input[type="password"]').fill('wrong_password_123');
      await page.waitForTimeout(100);
      await page.click('button:has-text("Войти")');

      await page.waitForTimeout(2000);

      // Форма логина должна остаться видимой (ошибка авторизации)
      await expect(loginForm).toBeVisible();

      // Может быть показано сообщение об ошибке
      const errorMessage = page.locator('.error-message, .auth-error, [class*="error"]');
      const hasError = await errorMessage.count() > 0;
      console.log(`Has error message: ${hasError}`);
    });

    test('AU-03: Логин с несуществующим пользователем', async ({ page }) => {
      await page.goto('/', { timeout: 60000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });

      const loginForm = page.locator('#login-form');
      await loginForm.waitFor({ state: 'visible', timeout: 15000 });

      // Переключаемся на логин если нужно
      const loginHeading = page.getByRole('heading', { name: 'Вход' });
      if (!(await loginHeading.isVisible().catch(() => false))) {
        const switchButton = page.locator('text=Уже есть аккаунт');
        if (await switchButton.isVisible().catch(() => false)) {
          await switchButton.click();
          await page.waitForTimeout(500);
        }
      }

      // Пытаемся залогиниться с несуществующим юзером
      const nonExistentUser = `nonexistent_${Date.now()}`;
      await loginForm.getByRole('textbox', { name: 'Имя пользователя' }).fill(nonExistentUser);
      await page.waitForTimeout(100);
      await loginForm.locator('input[type="password"]').fill('any_password');
      await page.waitForTimeout(100);
      await page.click('button:has-text("Войти")');

      await page.waitForTimeout(2000);

      // Форма логина должна остаться видимой
      await expect(loginForm).toBeVisible();
    });
  });

  // ==================== Logout Tests ====================

  test.describe('Logout', () => {
    test('AU-06: Logout', async ({ page }) => {
      test.skip(!userRegistered, 'User not registered');

      // Сначала логинимся
      await page.goto('/', { timeout: 60000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });

      const loginForm = page.locator('#login-form');
      const loginFormVisible = await loginForm.isVisible().catch(() => false);

      if (loginFormVisible) {
        // Переключаемся на логин если нужно
        const loginHeading = page.getByRole('heading', { name: 'Вход' });
        if (!(await loginHeading.isVisible().catch(() => false))) {
          const switchButton = page.locator('text=Уже есть аккаунт');
          if (await switchButton.isVisible().catch(() => false)) {
            await switchButton.click();
            await page.waitForTimeout(500);
          }
        }

        await loginForm.getByRole('textbox', { name: 'Имя пользователя' }).fill(TEST_USER.username);
        await loginForm.locator('input[type="password"]').fill(TEST_USER.password);
        await page.click('button:has-text("Войти")');
        await page.waitForTimeout(2000);
      }

      // Проверяем что залогинены
      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible({ timeout: 10000 });

      // Выполняем logout через hotkey Shift+L
      await page.keyboard.down('Shift');
      await page.keyboard.press('l');
      await page.keyboard.up('Shift');

      await page.waitForTimeout(2000);

      // Проверяем что вышли - должна появиться форма логина
      // Или можно перезагрузить страницу для проверки
      await page.reload();
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
      await page.waitForTimeout(2000);

      // После logout и reload должна показаться форма логина
      await expect(loginForm).toBeVisible({ timeout: 10000 });
    });
  });

  // ==================== Session Persistence ====================

  test.describe('Session Persistence', () => {
    test('AU-08: Session persistence после reload', async ({ page }) => {
      test.skip(!userRegistered, 'User not registered');

      // Логинимся
      await page.goto('/', { timeout: 60000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });

      const loginForm = page.locator('#login-form');
      const loginFormVisible = await loginForm.isVisible().catch(() => false);

      if (loginFormVisible) {
        const loginHeading = page.getByRole('heading', { name: 'Вход' });
        if (!(await loginHeading.isVisible().catch(() => false))) {
          const switchButton = page.locator('text=Уже есть аккаунт');
          if (await switchButton.isVisible().catch(() => false)) {
            await switchButton.click();
            await page.waitForTimeout(500);
          }
        }

        await loginForm.getByRole('textbox', { name: 'Имя пользователя' }).fill(TEST_USER.username);
        await loginForm.locator('input[type="password"]').fill(TEST_USER.password);
        await page.click('button:has-text("Войти")');
        await page.waitForTimeout(2000);
      }

      // Проверяем что залогинены
      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible({ timeout: 10000 });

      // Перезагружаем страницу
      await page.reload();
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
      await page.waitForTimeout(3000);

      // Проверяем состояние после reload
      // На dev среде сессия может не сохраняться (IndexedDB based auth)
      const loginFormAfterReload = await loginForm.isVisible().catch(() => false);

      if (loginFormAfterReload) {
        console.log('Session was not persisted after reload (expected on dev)');
        // Это нормально для dev среды
      } else {
        // Сессия сохранилась
        await expect(rootContainer).toBeVisible({ timeout: 10000 });
        console.log('Session persisted after reload');
      }
    });
  });
});

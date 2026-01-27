import { test, expect } from '../fixtures/base.fixture';

/**
 * Group B: Негативные сценарии и валидация
 *
 * s4:  Ошибка логина с невалидным паролем
 * s5:  Ошибка логина с несуществующим username
 * s6:  Пустые поля логина — клиентская валидация
 * s7:  Регистрация — пароли не совпадают
 * s13: Регистрация — короткий пароль (<6 символов)
 * s14: Регистрация — невалидный email
 */
test.describe('Group B: Negative scenarios and validation @auth @validation', () => {

  // ======================== LOGIN SCENARIOS ========================

  test('s4: login with invalid password shows error', async ({ mainPage, page }) => {
    await mainPage.goto();
    await mainPage.waitForLoginForm();

    // Intercept login API to return 401 (invalid credentials)
    await page.route('**/api/v1/login/', (route) => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Invalid credentials' }),
      });
    });

    // Fill valid username with wrong password
    await mainPage.usernameInput.fill('e2e_admin');
    await mainPage.passwordInput.fill('wrong_password_123');
    await mainPage.loginSubmitButton.click();

    // Error auto-hides after 5s — check quickly
    await mainPage.loginErrorMessage.waitFor({ state: 'visible', timeout: 5000 });
    await expect(mainPage.loginErrorMessage).toHaveText('Неверное имя пользователя или пароль');
  });

  test('s5: login with nonexistent username shows error', async ({ mainPage, page }) => {
    await mainPage.goto();
    await mainPage.waitForLoginForm();

    // Intercept login API to return 401 (user not found)
    await page.route('**/api/v1/login/', (route) => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Invalid credentials' }),
      });
    });

    // Fill nonexistent username
    await mainPage.usernameInput.fill('nonexistent_user_xyz_999');
    await mainPage.passwordInput.fill('some_password');
    await mainPage.loginSubmitButton.click();

    // Error auto-hides after 5s — check quickly
    await mainPage.loginErrorMessage.waitFor({ state: 'visible', timeout: 5000 });
    await expect(mainPage.loginErrorMessage).toHaveText('Неверное имя пользователя или пароль');
  });

  test('s6: login with empty fields shows validation error', async ({ mainPage }) => {
    await mainPage.goto();
    await mainPage.waitForLoginForm();

    // Leave fields empty, just click submit
    await mainPage.loginSubmitButton.click();

    // Client-side validation: "Заполните все поля"
    await mainPage.loginErrorMessage.waitFor({ state: 'visible', timeout: 5000 });
    await expect(mainPage.loginErrorMessage).toHaveText('Заполните все поля');
  });

  // ======================== REGISTRATION SCENARIOS ========================

  test('s7: registration with mismatched passwords shows error', async ({ mainPage, page }) => {
    await mainPage.goto();
    await mainPage.waitForLoginForm();

    // Registration form locators (not in MainPage)
    const regUsername = page.locator('#register-form #reg-username');
    const regEmail = page.locator('#register-form #email');
    const regPassword = page.locator('#register-form #reg-password');
    const regConfirm = page.locator('#register-form #confirm-password');
    const regSubmit = page.locator('#register-form button[type="submit"]');
    const regError = page.locator('#register-form .auth-error');

    // Wait for registration form to be present
    await regUsername.waitFor({ state: 'visible', timeout: 10000 });

    // Fill all fields with mismatched passwords
    await regUsername.fill('testuser_s7');
    await regEmail.fill('test_s7@example.com');
    await regPassword.fill('password123');
    await regConfirm.fill('different_password');
    await regSubmit.click();

    // Error auto-hides after 5s — check quickly
    await regError.waitFor({ state: 'visible', timeout: 5000 });
    await expect(regError).toHaveText('Пароли не совпадают');
  });

  test('s13: registration with short password shows error', async ({ mainPage, page }) => {
    await mainPage.goto();
    await mainPage.waitForLoginForm();

    // Registration form locators
    const regUsername = page.locator('#register-form #reg-username');
    const regEmail = page.locator('#register-form #email');
    const regPassword = page.locator('#register-form #reg-password');
    const regConfirm = page.locator('#register-form #confirm-password');
    const regSubmit = page.locator('#register-form button[type="submit"]');
    const regError = page.locator('#register-form .auth-error');

    // Wait for registration form
    await regUsername.waitFor({ state: 'visible', timeout: 10000 });

    // Fill all fields — password is less than 6 characters, but passwords match
    // (password mismatch check runs before length check, so passwords must match)
    await regUsername.fill('testuser_s13');
    await regEmail.fill('test_s13@example.com');
    await regPassword.fill('12345');
    await regConfirm.fill('12345');
    await regSubmit.click();

    // Error auto-hides after 5s — check quickly
    await regError.waitFor({ state: 'visible', timeout: 5000 });
    await expect(regError).toHaveText('Пароль должен быть не менее 6 символов');
  });

  test('s14: registration with invalid email shows error', async ({ mainPage, page }) => {
    await mainPage.goto();
    await mainPage.waitForLoginForm();

    // Registration form locators
    const regUsername = page.locator('#register-form #reg-username');
    const regEmail = page.locator('#register-form #email');
    const regPassword = page.locator('#register-form #reg-password');
    const regConfirm = page.locator('#register-form #confirm-password');
    const regSubmit = page.locator('#register-form button[type="submit"]');
    const regError = page.locator('#register-form .auth-error');

    // Wait for registration form
    await regUsername.waitFor({ state: 'visible', timeout: 10000 });

    // Fill all fields — invalid email, valid password (>= 6 chars, matching)
    // Validation order: empty check -> mismatch -> length -> email
    // So we need valid password (matching, >= 6) to reach the email check
    await regUsername.fill('testuser_s14');
    await regEmail.fill('not-an-email');
    await regPassword.fill('validpass123');
    await regConfirm.fill('validpass123');
    await regSubmit.click();

    // Error auto-hides after 5s — check quickly
    await regError.waitFor({ state: 'visible', timeout: 5000 });
    await expect(regError).toHaveText('Введите корректный email');
  });
});

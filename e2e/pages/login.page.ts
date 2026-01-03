import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object для страницы авторизации
 */
export class LoginPage extends BasePage {
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly registerLink: Locator;

  constructor(page: Page) {
    super(page);

    // Поля формы логина (ищем внутри #login-form чтобы не путать с формой регистрации)
    const loginForm = page.locator('#login-form');
    this.usernameInput = loginForm.locator('#username');
    this.passwordInput = loginForm.locator('#password');
    this.submitButton = loginForm.locator('button[type="submit"]');
    this.errorMessage = loginForm.locator('.auth-error');
    this.registerLink = page.locator('a[href*="register"], .register-link');
  }

  /**
   * Выполнить логин
   */
  async login(username: string, password: string) {
    // Ждём пока форма логина появится (SPA рендерит её динамически)
    await this.usernameInput.waitFor({ state: 'visible', timeout: 10000 });
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  /**
   * Проверить, что мы на странице логина
   */
  async assertOnLoginPage() {
    await expect(this.usernameInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
  }

  /**
   * Проверить, что логин успешен (редирект на главную)
   */
  async assertLoginSuccess() {
    await this.waitForAppLoad();
    await expect(this.rootContainer).toBeVisible();
  }

  /**
   * Проверить сообщение об ошибке
   */
  async assertLoginError() {
    await expect(this.errorMessage).toBeVisible();
  }

  /**
   * Получить текст ошибки
   */
  async getLoginErrorText(): Promise<string> {
    return await this.errorMessage.textContent() || '';
  }
}

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

    // Поля формы логина
    this.usernameInput = page.locator('input[name="username"], input[type="text"]').first();
    this.passwordInput = page.locator('input[name="password"], input[type="password"]');
    this.submitButton = page.locator('button[type="submit"], input[type="submit"]');
    this.errorMessage = page.locator('.error-message, .login-error, #login-error');
    this.registerLink = page.locator('a[href*="register"], .register-link');
  }

  /**
   * Выполнить логин
   */
  async login(username: string, password: string) {
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

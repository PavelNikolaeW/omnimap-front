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
    // Используем более специфичные селекторы
    this.usernameInput = page.locator('#login-form input#username');
    this.passwordInput = page.locator('#login-form input#password');
    this.submitButton = page.locator('#login-form button[type="submit"]');
    this.errorMessage = page.locator('#login-form .auth-error');
    this.registerLink = page.locator('a[href*="register"], .register-link');
  }

  /**
   * Выполнить логин
   */
  async login(username: string, password: string) {
    // Ждём пока форма логина появится (SPA рендерит её динамически)
    await this.usernameInput.waitFor({ state: 'visible', timeout: 10000 });

    // Очищаем и заполняем поля последовательно
    await this.usernameInput.clear();
    await this.usernameInput.fill(username);

    await this.passwordInput.waitFor({ state: 'visible', timeout: 5000 });
    await this.passwordInput.clear();
    await this.passwordInput.fill(password);

    // Кликаем кнопку входа
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
    // После успешного логина должен появиться rootContainer
    // controlPanel может быть изначально hidden
    await this.rootContainer.waitFor({ state: 'visible', timeout: 30000 });

    // Ждём пока исчезнет форма логина (признак успешной авторизации)
    const loginForm = this.page.locator('#login-form');
    await loginForm.waitFor({ state: 'hidden', timeout: 30000 });

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

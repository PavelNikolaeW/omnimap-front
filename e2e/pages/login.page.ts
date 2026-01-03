import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object для страницы авторизации
 */
export class LoginPage extends BasePage {
  readonly loginForm: Locator;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly registerLink: Locator;

  constructor(page: Page) {
    super(page);

    // Форма логина (рендерится динамически после загрузки данных)
    this.loginForm = page.locator('#login-form');

    // Поля формы логина (ищем внутри #login-form чтобы не путать с формой регистрации)
    this.usernameInput = this.loginForm.locator('#username');
    this.passwordInput = this.loginForm.locator('#password');
    this.submitButton = this.loginForm.locator('button[type="submit"]');
    this.errorMessage = this.loginForm.locator('.auth-error');
    this.registerLink = page.locator('a[href*="register"], .register-link');
  }

  /**
   * Перейти на страницу и дождаться появления формы логина
   */
  async goto() {
    await this.page.goto('/');
    // Ждём события ShowedBlocks (блоки отрендерены)
    await this.waitForLoginFormRendered();
  }

  /**
   * Дождаться появления формы логина
   * Ждём события ShowedBlocks, затем проверяем что форма видима
   */
  async waitForLoginFormRendered(timeout = 15000) {
    await this.page.waitForFunction(
      () => {
        return new Promise<boolean>((resolve) => {
          // Если форма логина уже есть - готово
          if (document.getElementById('login-form')) {
            resolve(true);
            return;
          }

          // Иначе ждём события ShowedBlocks
          const handler = () => {
            window.removeEventListener('ShowedBlocks', handler);
            // Даём немного времени на финальный рендер
            setTimeout(() => resolve(true), 100);
          };
          window.addEventListener('ShowedBlocks', handler);

          // Fallback timeout (если событие не приходит)
          setTimeout(() => {
            window.removeEventListener('ShowedBlocks', handler);
            resolve(true);
          }, 10000);
        });
      },
      {},
      { timeout }
    );

    // После события форма должна быть в DOM
    await this.loginForm.waitFor({ state: 'attached', timeout: 5000 });
    await this.usernameInput.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Выполнить логин
   */
  async login(username: string, password: string) {
    // Убеждаемся что форма видима (после waitForBlocksRendered должна быть быстро)
    await this.usernameInput.waitFor({ state: 'visible', timeout: 5000 });

    // Очищаем поля перед вводом (на случай если там что-то было)
    await this.usernameInput.clear();
    await this.usernameInput.fill(username);

    await this.passwordInput.clear();
    await this.passwordInput.fill(password);

    // Кликаем по кнопке входа
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
    // Ждём пока форма логина исчезнет (значит авторизация прошла)
    await this.loginForm.waitFor({ state: 'detached', timeout: 15000 });

    // Ждём появления основного интерфейса
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

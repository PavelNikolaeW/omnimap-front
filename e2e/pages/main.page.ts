import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object для главной страницы OmniMap
 *
 * Это SPA - одна страница на /.
 * Если пользователь не авторизован - видна форма логина.
 * Если авторизован - видны его блоки.
 */
export class MainPage extends BasePage {
  // Форма логина (отображается для неавторизованных)
  readonly loginForm: Locator;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginSubmitButton: Locator;
  readonly loginErrorMessage: Locator;

  // Текстовый редактор (noteEditor)
  readonly noteEditorTextarea: Locator;
  readonly noteEditorToolbar: Locator;
  readonly noteEditorPreview: Locator;

  // Поиск (SearchPopup)
  readonly searchInput: Locator;
  readonly searchEverywhereCheckbox: Locator;
  readonly searchResults: Locator;

  // Загрузка изображений (ImageUploadPopup)
  readonly imageUploadDropzone: Locator;
  readonly imageUploadInput: Locator;
  readonly imageUploadPreview: Locator;

  constructor(page: Page) {
    super(page);

    // Форма логина - используем CSS селектор с родительским элементом
    // Важно: на странице есть и форма регистрации с такими же id полей
    this.loginForm = page.locator('#login-form');
    this.usernameInput = page.locator('#login-form #username');
    this.passwordInput = page.locator('#login-form #password');
    this.loginSubmitButton = page.locator('#login-form button[type="submit"]');
    this.loginErrorMessage = page.locator('#login-form .auth-error');

    // Текстовый редактор с data-testid
    this.noteEditorTextarea = page.locator('[data-testid="note-editor-textarea"]');
    this.noteEditorToolbar = page.locator('[data-testid="note-editor-toolbar"]');
    this.noteEditorPreview = page.locator('[data-testid="note-editor-preview"]');

    // Поиск с data-testid
    this.searchInput = page.locator('[data-testid="search-input"]');
    this.searchEverywhereCheckbox = page.locator('[data-testid="search-everywhere-checkbox"]');
    this.searchResults = page.locator('[data-testid="search-results"]');

    // Загрузка изображений с data-testid
    this.imageUploadDropzone = page.locator('[data-testid="image-upload-dropzone"]');
    this.imageUploadInput = page.locator('[data-testid="image-upload-input"]');
    this.imageUploadPreview = page.locator('[data-testid="image-upload-preview"]');
  }

  // ==================== Работа с блоками ====================

  /**
   * Получить первый блок в контейнере
   */
  getFirstBlock(): Locator {
    return this.rootContainer.locator('[block]').first();
  }

  /**
   * Получить количество блоков
   */
  async getBlocksCount(): Promise<number> {
    return await this.getBlocks().count();
  }

  /**
   * Кликнуть по блоку
   * Кликаем по заголовку блока, чтобы избежать проблем с iframe блоками,
   * которые перехватывают клики
   */
  async clickBlock(block: Locator) {
    // Пытаемся кликнуть по заголовку блока (titleBlock)
    const title = block.locator('titleBlock').first();
    const hasTitleBlock = await title.count() > 0;

    if (hasTitleBlock) {
      await title.click({ force: true });
    } else {
      // Если заголовка нет, кликаем по самому блоку с force
      await block.click({ force: true });
    }
  }

  /**
   * Дважды кликнуть по блоку (открыть)
   */
  async doubleClickBlock(block: Locator) {
    await block.dblclick();
  }

  /**
   * Получить заголовок блока
   */
  async getBlockTitle(block: Locator): Promise<string> {
    const titleEl = block.locator('titleBlock');
    return await titleEl.textContent() || '';
  }

  /**
   * Получить текст блока
   */
  async getBlockContent(block: Locator): Promise<string> {
    const contentEl = block.locator('contentBlock');
    return await contentEl.textContent() || '';
  }

  // ==================== Создание блоков ====================

  /**
   * Создать новый блок через хоткей
   * @param title - название нового блока
   */
  async createBlock(title: string) {
    // Нажимаем 'n' для создания нового блока
    await this.pressHotkey('n');

    // Ждём появления диалога (используем data-testid)
    await this.customDialogInput.waitFor({ state: 'visible', timeout: 5000 });

    // Вводим название
    await this.customDialogInput.fill(title);

    // Подтверждаем
    await this.customDialogOkBtn.click();
  }

  /**
   * Создать блок через кнопку в панели
   */
  async createBlockViaButton(title: string) {
    await this.clickControlButton('newBlock');
    await this.customDialogInput.waitFor({ state: 'visible', timeout: 5000 });
    await this.customDialogInput.fill(title);
    await this.customDialogOkBtn.click();
  }

  // ==================== Редактирование блоков ====================

  /**
   * Редактировать название блока
   */
  async editBlockTitle(newTitle: string) {
    await this.pressHotkey('t');
    await this.customDialogInput.waitFor({ state: 'visible', timeout: 5000 });
    await this.customDialogInput.clear();
    await this.customDialogInput.fill(newTitle);
    await this.customDialogOkBtn.click();
  }

  /**
   * Редактировать текст блока (используя noteEditor с data-testid)
   */
  async editBlockText(text: string) {
    await this.pressHotkey('w');
    await this.noteEditorTextarea.waitFor({ state: 'visible', timeout: 5000 });

    // Вводим текст в редактор
    await this.noteEditorTextarea.fill(text);

    // Закрываем редактор (Enter)
    await this.pressHotkey('Enter');
  }

  // ==================== Удаление блоков ====================

  /**
   * Удалить выделенный блок
   */
  async deleteSelectedBlock() {
    await this.pressHotkeyCombo('Shift', 'd');
  }

  // ==================== Навигация ====================

  /**
   * Открыть блок (войти внутрь)
   */
  async openBlock() {
    await this.pressHotkey('Enter');
  }

  /**
   * Вернуться назад
   */
  async goBack() {
    await this.pressHotkey('Backspace');
  }

  /**
   * Переключиться на дерево по индексу (1-9)
   */
  async switchToTree(index: number) {
    await this.page.keyboard.down(' '); // space
    await this.page.keyboard.press(`${index}`);
    await this.page.keyboard.up(' ');
  }

  // ==================== Копирование/Вставка ====================

  /**
   * Копировать ID блока
   */
  async copyBlockId() {
    await this.pressHotkeyCombo('Shift', 'c');
  }

  /**
   * Вырезать блок
   */
  async cutBlock() {
    await this.pressHotkeyCombo('Shift', 'x');
  }

  /**
   * Вставить блок
   */
  async pasteBlock() {
    await this.pressHotkeyCombo('Shift', 'v');
  }

  // ==================== Undo/Redo ====================

  /**
   * Отменить последнее действие
   */
  async undo() {
    await this.pressHotkeyCombo('Shift', 'z');
  }

  /**
   * Повторить отменённое действие
   */
  async redo() {
    await this.page.keyboard.down('Shift');
    await this.page.keyboard.down('Control');
    await this.page.keyboard.press('z');
    await this.page.keyboard.up('Control');
    await this.page.keyboard.up('Shift');
  }

  // ==================== Проверки ====================

  /**
   * Проверить, что блок с заголовком существует
   */
  async assertBlockWithTitleExists(title: string) {
    const block = this.rootContainer.locator(`[block] titleBlock:has-text("${title}")`);
    await expect(block).toBeVisible();
  }

  /**
   * Проверить, что блок выделен
   */
  async assertBlockSelected(block: Locator) {
    await expect(block).toHaveClass(/block-selected/);
  }

  /**
   * Проверить количество блоков
   */
  async assertBlocksCount(count: number) {
    await expect(this.getBlocks()).toHaveCount(count);
  }

  /**
   * Закрыть любой открытый попап через Escape
   */
  async closePopup() {
    await this.pressHotkey('Escape');
  }

  /**
   * Получить результат поиска по ID блока
   */
  getSearchResult(blockId: string): Locator {
    return this.page.locator(`[data-testid="search-result-${blockId}"]`);
  }

  /**
   * Выполнить поиск
   */
  async performSearch(query: string, everywhere: boolean = false) {
    await this.searchInput.fill(query);
    if (everywhere) {
      await this.searchEverywhereCheckbox.check();
    }
  }

  // ==================== Авторизация ====================

  /**
   * Дождаться рендера формы логина (для неавторизованных пользователей)
   */
  async waitForLoginForm(timeout = 15000) {
    await this.page.waitForFunction(
      () => {
        return new Promise<boolean>((resolve) => {
          if (document.getElementById('login-form')) {
            resolve(true);
            return;
          }

          const handler = () => {
            window.removeEventListener('ShowedBlocks', handler);
            setTimeout(() => resolve(true), 100);
          };
          window.addEventListener('ShowedBlocks', handler);

          setTimeout(() => {
            window.removeEventListener('ShowedBlocks', handler);
            resolve(true);
          }, 10000);
        });
      },
      {},
      { timeout }
    );

    await this.loginForm.waitFor({ state: 'attached', timeout: 5000 });
    await this.usernameInput.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Выполнить логин
   */
  async login(username: string, password: string) {
    await this.usernameInput.waitFor({ state: 'visible', timeout: 5000 });
    await this.usernameInput.clear();
    await this.usernameInput.fill(username);
    await this.passwordInput.clear();
    await this.passwordInput.fill(password);
    await this.loginSubmitButton.click();
  }

  /**
   * Проверить успешный логин (форма логина исчезла, блоки появились)
   */
  async assertLoginSuccess() {
    await this.loginForm.waitFor({ state: 'detached', timeout: 15000 });
    await this.waitForAppLoad();
    await expect(this.rootContainer).toBeVisible();
  }

  /**
   * Проверить, что видна форма логина
   */
  async assertOnLoginForm() {
    await expect(this.usernameInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
  }

  /**
   * Проверить наличие ошибки логина
   */
  async assertLoginError() {
    await expect(this.loginErrorMessage).toBeVisible();
  }

  /**
   * Полный флоу авторизации: перейти на страницу и залогиниться
   * Если пользователь уже залогинен (есть блоки) - просто ждём загрузки
   */
  async gotoAndLogin(username: string, password: string) {
    await this.goto();

    // Ждём либо форму логина, либо блоки (если уже залогинен)
    const hasLoginForm = await this.page
      .waitForSelector('#login-form', { state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (hasLoginForm) {
      await this.login(username, password);
      await this.assertLoginSuccess();
    }

    await this.waitForShowedBlocks();
  }

  /**
   * Ожидает события ShowedBlocks (блоки отрендерены)
   */
  async waitForShowedBlocks(timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      () => {
        return new Promise<boolean>((resolve) => {
          const blocks = document.querySelectorAll('[block]');
          if (blocks.length > 0) {
            resolve(true);
            return;
          }

          const root = document.getElementById('rootContainer');
          if (root && root.children.length > 0) {
            resolve(true);
            return;
          }

          const handler = () => {
            window.removeEventListener('ShowedBlocks', handler);
            resolve(true);
          };
          window.addEventListener('ShowedBlocks', handler);

          setTimeout(() => {
            window.removeEventListener('ShowedBlocks', handler);
            resolve(true);
          }, 10000);
        });
      },
      { timeout }
    );
  }
}

import { Page, Locator } from '@playwright/test';

/**
 * Базовый класс для Page Objects
 * Содержит общие методы и селекторы
 */
export class BasePage {
  readonly page: Page;

  // Основные контейнеры
  readonly rootContainer: Locator;
  readonly controlPanel: Locator;
  readonly sidebar: Locator;
  readonly breadcrumb: Locator;
  readonly treeNavigation: Locator;
  readonly topBtnContainer: Locator;

  // Попапы и модалки
  readonly errorPopup: Locator;
  readonly editorContainer: Locator;

  constructor(page: Page) {
    this.page = page;

    // Основные контейнеры
    this.rootContainer = page.locator('#rootContainer');
    this.controlPanel = page.locator('#control-panel');
    this.sidebar = page.locator('#sidebar');
    this.breadcrumb = page.locator('#breadcrumb');
    this.treeNavigation = page.locator('#tree-navigation');
    this.topBtnContainer = page.locator('#top-btn-container');

    // Попапы
    this.errorPopup = page.locator('#error-popup');
    this.editorContainer = page.locator('#editor-container');
  }

  /**
   * Перейти на главную страницу
   */
  async goto() {
    await this.page.goto('/');
  }

  /**
   * Дождаться загрузки приложения
   */
  async waitForAppLoad() {
    await this.rootContainer.waitFor({ state: 'visible' });
    await this.controlPanel.waitFor({ state: 'visible' });
  }

  /**
   * Нажать горячую клавишу
   */
  async pressHotkey(key: string) {
    await this.page.keyboard.press(key);
  }

  /**
   * Нажать комбинацию клавиш (например Shift+D)
   */
  async pressHotkeyCombo(modifier: string, key: string) {
    await this.page.keyboard.down(modifier);
    await this.page.keyboard.press(key);
    await this.page.keyboard.up(modifier);
  }

  /**
   * Получить все видимые блоки
   */
  getBlocks(): Locator {
    return this.rootContainer.locator('[block]');
  }

  /**
   * Получить блок по ID
   */
  getBlockById(blockId: string): Locator {
    return this.page.locator(`#${blockId}`);
  }

  /**
   * Получить выделенный блок
   */
  getSelectedBlock(): Locator {
    return this.page.locator('.block-selected');
  }

  /**
   * Проверить, что попап ошибки скрыт
   */
  async assertNoError() {
    await this.errorPopup.waitFor({ state: 'hidden' });
  }

  /**
   * Получить текст из попапа ошибки
   */
  async getErrorText(): Promise<string> {
    return await this.errorPopup.textContent() || '';
  }

  /**
   * Кликнуть по кнопке в панели управления
   */
  async clickControlButton(buttonId: string) {
    await this.controlPanel.locator(`#${buttonId}`).click();
  }

  /**
   * Ожидание исчезновения спиннера/лоадера (если есть)
   */
  async waitForLoading() {
    // Можно добавить ожидание специфичного индикатора загрузки
    await this.page.waitForLoadState('networkidle');
  }
}

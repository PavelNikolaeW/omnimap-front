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

  // Кастомный диалог (custom-dialog.js)
  readonly customDialogOverlay: Locator;
  readonly customDialog: Locator;
  readonly customDialogInput: Locator;
  readonly customDialogOkBtn: Locator;
  readonly customDialogCancelBtn: Locator;

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

    // Кастомный диалог с data-testid
    this.customDialogOverlay = page.locator('[data-testid="custom-dialog-overlay"]');
    this.customDialog = page.locator('[data-testid="custom-dialog"]');
    this.customDialogInput = page.locator('[data-testid="custom-dialog-input"]');
    this.customDialogOkBtn = page.locator('[data-testid="custom-dialog-ok-btn"]');
    this.customDialogCancelBtn = page.locator('[data-testid="custom-dialog-cancel-btn"]');
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
   * Дождаться события ShowedBlocks - означает что все блоки отрендерены
   * Это кастомное событие диспатчится после painter.render()
   */
  async waitForBlocksRendered(timeout = 15000) {
    await this.page.waitForFunction(
      () => {
        return new Promise<boolean>((resolve) => {
          // Если rootContainer уже есть - блоки уже отрендерены
          if (document.getElementById('rootContainer')?.children.length > 0) {
            resolve(true);
            return;
          }

          // Иначе ждём события ShowedBlocks
          const handler = () => {
            window.removeEventListener('ShowedBlocks', handler);
            resolve(true);
          };
          window.addEventListener('ShowedBlocks', handler);

          // Fallback timeout
          setTimeout(() => {
            window.removeEventListener('ShowedBlocks', handler);
            resolve(true);
          }, 10000);
        });
      },
      {},
      { timeout }
    );
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
   * Получить блок по ID (используя data-testid)
   */
  getBlockById(blockId: string): Locator {
    return this.page.locator(`[data-testid="block-${blockId}"]`);
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
   * Кликнуть по кнопке в панели управления (используя data-testid)
   */
  async clickControlButton(buttonId: string) {
    await this.controlPanel.locator(`[data-testid="command-btn-${buttonId}"]`).click();
  }

  /**
   * Получить кнопку команды в панели управления
   */
  getCommandButton(buttonId: string): Locator {
    return this.controlPanel.locator(`[data-testid="command-btn-${buttonId}"]`);
  }

  /**
   * Получить кнопку подменю
   */
  getSubmenuButton(submenuId: string): Locator {
    return this.controlPanel.locator(`[data-testid="submenu-btn-${submenuId}"]`);
  }

  /**
   * Получить кнопку дерева по ID
   */
  getTreeButton(treeId: string): Locator {
    return this.treeNavigation.locator(`[data-testid="tree-button-${treeId}"]`);
  }

  /**
   * Получить кнопку добавления дерева
   */
  getTreeAddButton(): Locator {
    return this.treeNavigation.locator('[data-testid="tree-add-button"]');
  }

  /**
   * Получить хлебную крошку по ID блока
   */
  getBreadcrumbItem(blockId: string): Locator {
    return this.breadcrumb.locator(`[data-testid="breadcrumb-item-${blockId}"]`);
  }

  /**
   * Ожидание исчезновения спиннера/лоадера (если есть)
   */
  async waitForLoading() {
    // Можно добавить ожидание специфичного индикатора загрузки
    await this.page.waitForLoadState('networkidle');
  }
}

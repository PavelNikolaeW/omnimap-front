import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object для главной страницы с блоками
 */
export class MainPage extends BasePage {
  readonly promptDialog: Locator;
  readonly promptInput: Locator;
  readonly promptOkButton: Locator;
  readonly promptCancelButton: Locator;

  constructor(page: Page) {
    super(page);

    // Кастомный диалог ввода (customPrompt)
    this.promptDialog = page.locator('.custom-prompt, .prompt-dialog, [role="dialog"]');
    this.promptInput = page.locator('.custom-prompt input, .prompt-dialog input');
    this.promptOkButton = page.locator('.custom-prompt .ok-btn, .prompt-dialog button:has-text("OK")');
    this.promptCancelButton = page.locator('.custom-prompt .cancel-btn, .prompt-dialog button:has-text("Cancel")');
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
   */
  async clickBlock(block: Locator) {
    await block.click();
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

    // Ждём появления диалога
    await this.promptInput.waitFor({ state: 'visible', timeout: 5000 });

    // Вводим название
    await this.promptInput.fill(title);

    // Подтверждаем
    await this.promptOkButton.click();
  }

  /**
   * Создать блок через кнопку в панели
   */
  async createBlockViaButton(title: string) {
    await this.clickControlButton('newBlock');
    await this.promptInput.waitFor({ state: 'visible', timeout: 5000 });
    await this.promptInput.fill(title);
    await this.promptOkButton.click();
  }

  // ==================== Редактирование блоков ====================

  /**
   * Редактировать название блока
   */
  async editBlockTitle(newTitle: string) {
    await this.pressHotkey('t');
    await this.promptInput.waitFor({ state: 'visible', timeout: 5000 });
    await this.promptInput.clear();
    await this.promptInput.fill(newTitle);
    await this.promptOkButton.click();
  }

  /**
   * Редактировать текст блока
   */
  async editBlockText(text: string) {
    await this.pressHotkey('w');
    await this.editorContainer.waitFor({ state: 'visible', timeout: 5000 });

    // Ожидаем редактор
    const editor = this.editorContainer.locator('.EasyMDEContainer textarea, .CodeMirror');
    await editor.fill(text);

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
}

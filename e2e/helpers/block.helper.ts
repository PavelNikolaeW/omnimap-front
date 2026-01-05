import { Page, Locator, expect } from '@playwright/test';

/**
 * Вспомогательные функции для работы с блоками в тестах
 */
export class BlockHelper {
  constructor(private page: Page) {}

  /**
   * Создаёт блок через UI
   */
  async createBlock(title: string): Promise<void> {
    await this.page.keyboard.press('n');
    const input = this.page.locator('[data-testid="custom-dialog-input"]');
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill(title);
    await this.page.locator('[data-testid="custom-dialog-ok-btn"]').click();
    await this.page.waitForTimeout(500);
  }

  /**
   * Получает первый видимый блок
   */
  getFirstBlock(): Locator {
    return this.page.locator('[block]').first();
  }

  /**
   * Получает все блоки
   */
  getBlocks(): Locator {
    return this.page.locator('[block]');
  }

  /**
   * Получает блок по ID
   */
  getBlockById(id: string): Locator {
    return this.page.locator(`[data-testid="block-${id}"]`);
  }

  /**
   * Получает блок по названию
   */
  getBlockByTitle(title: string): Locator {
    return this.page.locator(`[block] titleBlock:has-text("${title}")`);
  }

  /**
   * Выделяет блок кликом
   */
  async selectBlock(block: Locator): Promise<void> {
    await block.click();
  }

  /**
   * Открывает блок (входит внутрь)
   */
  async openBlock(block: Locator): Promise<void> {
    await block.dblclick();
  }

  /**
   * Редактирует название блока
   */
  async editTitle(newTitle: string): Promise<void> {
    await this.page.keyboard.press('t');
    const input = this.page.locator('[data-testid="custom-dialog-input"]');
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.clear();
    await input.fill(newTitle);
    await this.page.locator('[data-testid="custom-dialog-ok-btn"]').click();
  }

  /**
   * Удаляет выделенный блок
   */
  async deleteBlock(): Promise<void> {
    await this.page.keyboard.down('Shift');
    await this.page.keyboard.press('d');
    await this.page.keyboard.up('Shift');
  }

  /**
   * Проверяет, что блок с названием существует
   */
  async assertBlockExists(title: string): Promise<void> {
    const block = this.getBlockByTitle(title);
    await expect(block).toBeVisible({ timeout: 5000 });
  }

  /**
   * Проверяет, что блок выделен
   */
  async assertBlockSelected(block: Locator): Promise<void> {
    await expect(block).toHaveClass(/block-selected/);
  }

  /**
   * Undo последнего действия
   */
  async undo(): Promise<void> {
    await this.page.keyboard.down('Shift');
    await this.page.keyboard.press('z');
    await this.page.keyboard.up('Shift');
  }

  /**
   * Redo последнего действия
   */
  async redo(): Promise<void> {
    await this.page.keyboard.down('Shift');
    await this.page.keyboard.down('Control');
    await this.page.keyboard.press('z');
    await this.page.keyboard.up('Control');
    await this.page.keyboard.up('Shift');
  }

  /**
   * Возвращает назад
   */
  async goBack(): Promise<void> {
    await this.page.keyboard.press('Backspace');
  }

  /**
   * Генерирует уникальное название блока
   */
  uniqueTitle(prefix = 'Test'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }
}

/**
 * Фабрика для создания BlockHelper
 */
export function createBlockHelper(page: Page): BlockHelper {
  return new BlockHelper(page);
}

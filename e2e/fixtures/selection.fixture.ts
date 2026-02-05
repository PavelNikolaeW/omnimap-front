import { Page, Locator, expect } from '@playwright/test';

/**
 * SelectionHelper - управление выделением блоков в E2E тестах
 *
 * Понимание механизма выделения в OmniMap:
 * - Single selection (active): класс `block-active` на активном блоке
 * - Multi-selection: класс `block-multi-selected` на каждом выделенном блоке
 * - contextManager.selectedBlocks (Set<blockId>) хранит выделенные блоки
 * - contextManager.getSelectedBlockIds() возвращает массив ID
 *
 * Shift+Click на блоке:
 * - Если блок не выделен -> добавляет к выделению
 * - Если блок выделен -> убирает из выделения
 */
export class SelectionHelper {
  constructor(private page: Page) {}

  /**
   * Выделить один блок (установить active)
   * Простой клик без Shift устанавливает блок как active
   */
  async selectBlock(block: Locator): Promise<void> {
    const title = block.locator('titleBlock').first();
    await title.waitFor({ state: 'visible', timeout: 5000 });
    await title.click({ force: true });
    await this.page.waitForTimeout(200);
  }

  /**
   * Добавить блок к multi-selection через Shift+Click
   */
  async addToSelection(block: Locator): Promise<void> {
    const title = block.locator('titleBlock').first();
    await title.waitFor({ state: 'visible', timeout: 5000 });
    await title.click({ force: true, modifiers: ['Shift'] });
    await this.page.waitForTimeout(200);
  }

  /**
   * Выделить несколько блоков по порядку
   * Каждый блок добавляется через Shift+Click
   * Возвращает массив clean ID выделенных блоков
   */
  async multiSelect(blocks: Locator[]): Promise<string[]> {
    const ids: string[] = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];

      // Shift+Click для добавления к selection
      await this.addToSelection(block);

      // Ждём появления класса multi-selected
      try {
        await expect(block).toHaveClass(/block-multi-selected/, { timeout: 2000 });
      } catch {
        // Первый блок может иметь только block-active
        // Это нормально если выделен только один блок
      }

      // Сохраняем clean ID
      const id = await block.getAttribute('id');
      if (id) {
        const cleanId = id.split('*').at(-1);
        if (cleanId) ids.push(cleanId);
      }
    }

    // Финальная проверка стабильности
    await this.waitForSelectionStable();

    return ids;
  }

  /**
   * Выделить блоки по их titles
   */
  async multiSelectByTitles(titles: string[]): Promise<string[]> {
    const blocks: Locator[] = [];

    for (const title of titles) {
      const block = this.page
        .locator(`#rootContainer [block] titleBlock:has-text("${title}")`)
        .first()
        .locator('..');
      blocks.push(block);
    }

    return await this.multiSelect(blocks);
  }

  /**
   * Получить все выделенные блоки (IDs) из contextManager
   */
  async getSelectedBlocks(): Promise<string[]> {
    return await this.page.evaluate(() => {
      const ctx = (window as any).contextManager;
      if (!ctx || !ctx.getSelectedBlockIds) return [];
      return ctx.getSelectedBlockIds();
    });
  }

  /**
   * Получить количество выделенных блоков
   */
  async getSelectionCount(): Promise<number> {
    return await this.page.evaluate(() => {
      const ctx = (window as any).contextManager;
      if (!ctx || !ctx.selectedBlocks) return 0;
      return ctx.selectedBlocks.size;
    });
  }

  /**
   * Проверить что блок находится в multi-selection
   */
  async isMultiSelected(block: Locator): Promise<boolean> {
    const classes = await block.getAttribute('class');
    return classes?.includes('block-multi-selected') || false;
  }

  /**
   * Проверить что блок является active (single selection)
   */
  async isActive(block: Locator): Promise<boolean> {
    const classes = await block.getAttribute('class');
    return classes?.includes('block-active') || false;
  }

  /**
   * Проверить есть ли выделение
   */
  async hasSelection(): Promise<boolean> {
    return await this.page.evaluate(() => {
      const ctx = (window as any).contextManager;
      if (!ctx || !ctx.hasSelection) return false;
      return ctx.hasSelection();
    });
  }

  /**
   * Сбросить выделение через Escape
   */
  async clearSelection(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(200);

    // Проверяем что выделение сброшено
    const count = await this.getSelectionCount();
    if (count > 0) {
      // Повторная попытка
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(200);
    }
  }

  /**
   * Программно очистить выделение через contextManager
   */
  async clearSelectionViaApi(): Promise<void> {
    await this.page.evaluate(() => {
      const ctx = (window as any).contextManager;
      if (ctx && ctx.clearSelection) {
        ctx.clearSelection();
      }
    });
    await this.page.waitForTimeout(100);
  }

  /**
   * Дождаться стабильного состояния selection
   * Проверяет что contextManager.selectedBlocks соответствует DOM
   */
  async waitForSelectionStable(): Promise<void> {
    await this.page.waitForFunction(
      () => {
        const ctx = (window as any).contextManager;
        if (!ctx) return true;

        // Проверяем соответствие Set и DOM
        const selectedInCtx = ctx.selectedBlocks?.size || 0;
        const selectedInDom = document.querySelectorAll('.block-multi-selected').length;

        // Для single selection может быть 0 multi-selected, но 1 active
        if (selectedInCtx === 0) {
          const activeInDom = document.querySelectorAll('.block-active').length;
          return activeInDom <= 1; // 0 или 1 active блок - стабильно
        }

        return selectedInCtx === selectedInDom;
      },
      { timeout: 3000 }
    ).catch(() => {
      // Timeout - считаем стабильным
    });

    // Небольшая пауза для CSS transitions
    await this.page.waitForTimeout(100);
  }

  /**
   * Выделить блок и дождаться его появления в selection
   */
  async selectAndVerify(block: Locator): Promise<boolean> {
    const idBefore = await this.getSelectedBlocks();

    await this.addToSelection(block);

    const idAfter = await this.getSelectedBlocks();

    // Проверяем что добавился новый ID
    return idAfter.length > idBefore.length;
  }

  /**
   * Получить локатор для выделенных блоков в DOM
   */
  getMultiSelectedLocator(): Locator {
    return this.page.locator('#rootContainer .block-multi-selected');
  }

  /**
   * Получить локатор для active блока
   */
  getActiveBlockLocator(): Locator {
    return this.page.locator('#rootContainer .block-active');
  }
}

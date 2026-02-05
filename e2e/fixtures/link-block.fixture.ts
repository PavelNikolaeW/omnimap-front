import { Page, Locator, expect } from '@playwright/test';

/**
 * LinkBlockHelper - работа с блоками-ссылками в E2E тестах
 *
 * Блоки-ссылки в OmniMap:
 * - Атрибут `[blocklink]` содержит ID оригинального блока
 * - Визуально выглядят как обычные блоки но имеют иконку ссылки
 * - При клике открывают оригинальный блок (навигация к источнику)
 * - Создаются через shift+g (paste link) или API
 * - Нельзя создать ссылку на самого себя
 *
 * Формат ID в DOM: parentId*blockId
 */
export class LinkBlockHelper {
  constructor(private page: Page) {}

  /**
   * Найти все блоки-ссылки в контейнере
   */
  getLinkBlocks(): Locator {
    return this.page.locator('#rootContainer [blocklink]');
  }

  /**
   * Найти блок-ссылку по ID источника
   */
  getLinkBlockBySource(sourceId: string): Locator {
    return this.page.locator(`#rootContainer [blocklink="${sourceId}"]`);
  }

  /**
   * Проверить является ли элемент блоком-ссылкой
   */
  async isLinkBlock(element: Locator): Promise<boolean> {
    const hasAttribute = await element.getAttribute('blocklink');
    return hasAttribute !== null;
  }

  /**
   * Получить ID источника для блока-ссылки
   */
  async getLinkSourceId(linkBlock: Locator): Promise<string | null> {
    return await linkBlock.getAttribute('blocklink');
  }

  /**
   * Получить количество блоков-ссылок
   */
  async getLinkBlockCount(): Promise<number> {
    return await this.getLinkBlocks().count();
  }

  /**
   * Создать блок-ссылку через API
   * @param destId - ID родительского блока куда добавить ссылку
   * @param sourceIds - ID блоков на которые создать ссылки
   */
  async createLinkViaApi(destId: string, sourceIds: string[]): Promise<{ success: boolean; blocks?: any[] }> {
    return await this.page.evaluate(
      async ({ destId, sourceIds }) => {
        try {
          const api = (window as any).api;
          if (!api) return { success: false, error: 'API not available' };

          const response = await api.pasteLinkBlock({ dest: destId, src: sourceIds });
          if (response.status === 201) {
            return { success: true, blocks: response.data };
          }
          return { success: false, error: `Unexpected status: ${response.status}` };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
      { destId, sourceIds }
    );
  }

  /**
   * Создать блок-ссылку через hotkey (shift+g)
   * Предполагает что ID источника уже в буфере обмена
   * и текущий блок является целевым родителем
   */
  async createLinkViaHotkey(): Promise<void> {
    await this.page.keyboard.press('Shift+g');
    await this.page.waitForTimeout(500);
  }

  /**
   * Кликнуть на блок-ссылку (должен открыть оригинал)
   */
  async clickLinkBlock(linkBlock: Locator): Promise<void> {
    const title = linkBlock.locator('titleBlock').first();
    await title.waitFor({ state: 'visible', timeout: 5000 });
    await title.click({ force: true });
    await this.page.waitForTimeout(300);
  }

  /**
   * Дождаться появления блока-ссылки с указанным источником
   */
  async waitForLinkBlock(sourceId: string, timeout: number = 5000): Promise<Locator> {
    const linkBlock = this.getLinkBlockBySource(sourceId);
    await linkBlock.waitFor({ state: 'visible', timeout });
    return linkBlock;
  }

  /**
   * Проверить что блок-ссылка существует для данного источника
   */
  async expectLinkBlockExists(sourceId: string): Promise<void> {
    const linkBlock = this.getLinkBlockBySource(sourceId);
    await expect(linkBlock).toBeVisible({ timeout: 5000 });
  }

  /**
   * Проверить что блок-ссылка НЕ существует
   */
  async expectLinkBlockNotExists(sourceId: string): Promise<void> {
    const linkBlock = this.getLinkBlockBySource(sourceId);
    await expect(linkBlock).not.toBeVisible({ timeout: 3000 });
  }

  /**
   * Получить информацию о блоке-ссылке
   */
  async getLinkBlockInfo(linkBlock: Locator): Promise<{
    sourceId: string | null;
    blockId: string | null;
    title: string | null;
    parentId: string | null;
  }> {
    const sourceId = await linkBlock.getAttribute('blocklink');
    const fullId = await linkBlock.getAttribute('id');
    const titleText = await linkBlock.locator('titleBlock').first().textContent();

    // Формат ID: parentId*blockId
    let blockId: string | null = null;
    let parentId: string | null = null;
    if (fullId) {
      const parts = fullId.split('*');
      if (parts.length === 2) {
        parentId = parts[0];
        blockId = parts[1];
      } else {
        blockId = fullId;
      }
    }

    return {
      sourceId,
      blockId,
      title: titleText?.trim() || null,
      parentId
    };
  }

  /**
   * Навигация к источнику блока-ссылки
   * Кликает по ссылке и ожидает изменения breadcrumb
   */
  async navigateToSource(linkBlock: Locator): Promise<string | null> {
    const sourceId = await this.getLinkSourceId(linkBlock);

    // Запоминаем текущий URL
    const currentUrl = this.page.url();

    // Кликаем по ссылке
    await this.clickLinkBlock(linkBlock);

    // Ждём изменения URL или появления блока-источника
    await this.page.waitForTimeout(500);

    // Проверяем что мы перешли к источнику
    // URL должен содержать sourceId или breadcrumb должен измениться
    const newUrl = this.page.url();
    if (newUrl !== currentUrl || newUrl.includes(sourceId || '')) {
      return sourceId;
    }

    return null;
  }

  /**
   * Удалить блок-ссылку через API
   */
  async deleteLinkBlockViaApi(linkBlockId: string): Promise<boolean> {
    return await this.page.evaluate(async (blockId) => {
      try {
        const api = (window as any).api;
        if (!api) return false;

        const response = await api.deleteTree(blockId);
        return response.status === 204;
      } catch {
        return false;
      }
    }, linkBlockId);
  }

  /**
   * Получить все ID источников для блоков-ссылок в текущем контейнере
   */
  async getAllLinkSourceIds(): Promise<string[]> {
    const linkBlocks = this.getLinkBlocks();
    const count = await linkBlocks.count();
    const sourceIds: string[] = [];

    for (let i = 0; i < count; i++) {
      const sourceId = await linkBlocks.nth(i).getAttribute('blocklink');
      if (sourceId) {
        sourceIds.push(sourceId);
      }
    }

    return sourceIds;
  }

  /**
   * Проверить что нельзя создать self-link
   * Пытается создать ссылку блока на самого себя и проверяет ошибку
   */
  async verifySelfLinkPrevention(blockId: string): Promise<boolean> {
    const result = await this.page.evaluate(async (id) => {
      const api = (window as any).api;
      if (!api) return { prevented: false, error: 'API not available' };

      try {
        const response = await api.pasteLinkBlock({ dest: id, src: [id] });
        // Если запрос успешен - self-link не предотвращён
        return { prevented: false, status: response.status };
      } catch (error: any) {
        // Ошибка ожидаема - self-link предотвращён
        return { prevented: true, error: error.message };
      }
    }, blockId);

    return result.prevented;
  }

  /**
   * Дождаться стабильного состояния после создания ссылки
   */
  async waitForLinkCreationComplete(): Promise<void> {
    // Ждём завершения возможных WebSocket синхронизаций
    await this.page.waitForTimeout(500);

    // Ждём отсутствия активных fetch-запросов
    await this.page.waitForFunction(() => {
      const state = (window as any).localStateManager;
      return !state?.isSyncing;
    }, { timeout: 5000 }).catch(() => {
      // Если не получилось - просто пауза
    });
  }
}

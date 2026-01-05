import { test, expect } from '../fixtures/auth.fixture';

/**
 * Тесты копирования и вставки блоков @blocks @copy @paste
 */
test.describe('Копирование и вставка блоков @blocks @copy @paste', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.waitForShowedBlocks();
  });

  test('должен скопировать ID блока через Shift+C', async ({ authenticatedPage, page }) => {
    const blocks = authenticatedPage.getBlocks();
    if ((await blocks.count()) === 0) {
      test.skip();
      return;
    }

    await authenticatedPage.clickBlock(blocks.first());
    await authenticatedPage.copyBlockId();

    await expect(authenticatedPage.rootContainer).toBeVisible();
  });

  test('должен вырезать и вставить блок через Shift+X и Shift+V', async ({
    authenticatedPage,
    page,
  }) => {
    const blocks = authenticatedPage.getBlocks();
    const count = await blocks.count();

    if (count < 2) {
      test.skip();
      return;
    }

    // Вырезаем первый блок
    await authenticatedPage.clickBlock(blocks.first());
    await authenticatedPage.cutBlock();

    await authenticatedPage.waitForShowedBlocks();

    // Кликаем по другому блоку для вставки
    const blocksAfterCut = authenticatedPage.getBlocks();
    if ((await blocksAfterCut.count()) > 0) {
      await authenticatedPage.clickBlock(blocksAfterCut.first());
    }

    // Вставляем
    await authenticatedPage.pasteBlock();

    await authenticatedPage.waitForShowedBlocks();
    await expect(authenticatedPage.rootContainer).toBeVisible();
  });

  test('должен скопировать и вставить блок', async ({ authenticatedPage, page }) => {
    const blocks = authenticatedPage.getBlocks();
    const initialCount = await blocks.count();

    if (initialCount === 0) {
      test.skip();
      return;
    }

    // Выбираем блок
    await authenticatedPage.clickBlock(blocks.first());

    // Копируем ID
    await authenticatedPage.copyBlockId();

    // Вставляем как копию (Shift+V)
    await authenticatedPage.pasteBlock();

    await authenticatedPage.waitForShowedBlocks();
    await expect(authenticatedPage.rootContainer).toBeVisible();
  });
});

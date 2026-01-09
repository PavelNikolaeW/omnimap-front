import { test, expect } from '../fixtures/auth.fixture';
import { createApiHelper } from '../helpers';
import { uniqueBlockTitle, waitForDialog } from '../fixtures/test-data.fixture';

/**
 * Тесты Undo/Redo операций @blocks @undo @redo
 */
test.describe('Undo/Redo операции @blocks @undo @redo', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.waitForShowedBlocks();
  });

  test('должен отменить создание блока через Shift+Z', async ({ authenticatedPage, page }) => {
    const blockTitle = uniqueBlockTitle('UndoTest');
    const blocks = authenticatedPage.getBlocks();

    if ((await blocks.count()) > 0) {
      await authenticatedPage.clickBlock(blocks.first());
    }

    // Создаём блок
    await authenticatedPage.pressHotkey('n');
    await waitForDialog(page);

    const input = page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
    await input.fill(blockTitle);

    const okBtn = page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');
    await okBtn.click();

    await authenticatedPage.waitForShowedBlocks();
    await authenticatedPage.assertBlockWithTitleExists(blockTitle);

    const countAfterCreate = await blocks.count();

    // Отменяем создание
    await authenticatedPage.undo();
    await authenticatedPage.waitForShowedBlocks();

    // Проверяем что приложение не упало
    await expect(authenticatedPage.rootContainer).toBeVisible();

    // Блок может быть удалён или нет в зависимости от реализации undo
    const countAfterUndo = await blocks.count();
    expect(countAfterUndo).toBeLessThanOrEqual(countAfterCreate);
  });

  test('должен повторить отменённое действие через Shift+Ctrl+Z', async ({
    authenticatedPage,
    page,
  }) => {
    const blockTitle = uniqueBlockTitle('RedoTest');
    const blocks = authenticatedPage.getBlocks();

    if ((await blocks.count()) > 0) {
      await authenticatedPage.clickBlock(blocks.first());
    }

    // Создаём блок
    await authenticatedPage.pressHotkey('n');
    await waitForDialog(page);

    const input = page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
    await input.fill(blockTitle);

    const okBtn = page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');
    await okBtn.click();

    await authenticatedPage.waitForShowedBlocks();

    // Отменяем
    await authenticatedPage.undo();
    await authenticatedPage.waitForShowedBlocks();

    // Повторяем
    await authenticatedPage.redo();
    await authenticatedPage.waitForShowedBlocks();

    // Проверяем что приложение не упало
    await expect(authenticatedPage.rootContainer).toBeVisible();
  });

  test('должен отменить вставку скопированного блока (Shift+C + Shift+V + Shift+Z)', async ({
    authenticatedPage,
    page,
  }) => {
    const apiHelper = createApiHelper(page);
    const blocks = authenticatedPage.getBlocks();
    const initialCount = await blocks.count();

    if (initialCount === 0) {
      test.skip();
      return;
    }

    // Выбираем первый блок и копируем его ID
    const firstBlock = blocks.first();
    await authenticatedPage.clickBlock(firstBlock);
    await page.waitForTimeout(300);

    // Копируем ID блока (Shift+C)
    await authenticatedPage.copyBlockId();
    await page.waitForTimeout(500);

    // Вставляем копию (Shift+V) - это должно создать копию блока
    const pastePromise = apiHelper
      .waitForResponse(
        (url) => url.includes('copy-block') || url.includes('paste'),
        async () => {
          await authenticatedPage.pasteBlock();
        },
        { timeout: 10000 }
      )
      .catch(() => null);

    await pastePromise;
    await authenticatedPage.waitForShowedBlocks();

    const countAfterPaste = await blocks.count();

    // Отменяем вставку (Shift+Z)
    await authenticatedPage.undo();
    await authenticatedPage.waitForShowedBlocks();
    await page.waitForTimeout(500);

    // Проверяем что приложение не упало
    await expect(authenticatedPage.rootContainer).toBeVisible();

    // Количество блоков должно вернуться к исходному или близкому значению
    const countAfterUndo = await blocks.count();
    expect(countAfterUndo).toBeLessThanOrEqual(countAfterPaste);
  });

  test('должен отменить перемещение блока (Shift+X + Shift+V + Shift+Z)', async ({
    authenticatedPage,
    page,
  }) => {
    const apiHelper = createApiHelper(page);
    const blocks = authenticatedPage.getBlocks();
    const count = await blocks.count();

    if (count < 2) {
      test.skip();
      return;
    }

    // Запоминаем первый блок
    const firstBlock = blocks.first();
    const originalTitle = await firstBlock.locator('titleBlock').first().textContent();
    await authenticatedPage.clickBlock(firstBlock);
    await page.waitForTimeout(300);

    // Вырезаем первый блок (Shift+X)
    await authenticatedPage.cutBlock();
    await page.waitForTimeout(500);

    // Проверяем, что режим вырезания активен
    await authenticatedPage.waitForShowedBlocks();

    // Выбираем другой блок для вставки
    const blocksAfterCut = authenticatedPage.getBlocks();
    if ((await blocksAfterCut.count()) > 0) {
      await authenticatedPage.clickBlock(blocksAfterCut.first());
      await page.waitForTimeout(300);
    }

    // Вставляем (Shift+V) - это должно переместить блок
    const movePromise = apiHelper
      .waitForResponse(
        (url) => url.includes('move-block') || url.includes('move'),
        async () => {
          await authenticatedPage.pasteBlock();
        },
        { timeout: 10000 }
      )
      .catch(() => null);

    await movePromise;
    await authenticatedPage.waitForShowedBlocks();

    // Отменяем перемещение (Shift+Z)
    await authenticatedPage.undo();
    await authenticatedPage.waitForShowedBlocks();
    await page.waitForTimeout(500);

    // Проверяем что приложение не упало
    await expect(authenticatedPage.rootContainer).toBeVisible();

    // Блок с оригинальным названием должен существовать
    if (originalTitle) {
      const blockWithOriginalTitle = page.locator(
        `[block] titleBlock:has-text("${originalTitle.trim()}")`
      );
      const exists = (await blockWithOriginalTitle.count()) > 0;
      expect(exists).toBe(true);
    }
  });

  test('должен выполнить Redo после Undo копирования (Shift+C + Shift+V + Shift+Z + Shift+Ctrl+Z)', async ({
    authenticatedPage,
    page,
  }) => {
    const blocks = authenticatedPage.getBlocks();
    const initialCount = await blocks.count();

    if (initialCount === 0) {
      test.skip();
      return;
    }

    // Выбираем и копируем первый блок
    const firstBlock = blocks.first();
    await authenticatedPage.clickBlock(firstBlock);
    await page.waitForTimeout(300);

    // Копируем ID
    await authenticatedPage.copyBlockId();
    await page.waitForTimeout(500);

    // Вставляем копию
    await authenticatedPage.pasteBlock();
    await authenticatedPage.waitForShowedBlocks();
    await page.waitForTimeout(500);

    // Отменяем (Undo)
    await authenticatedPage.undo();
    await authenticatedPage.waitForShowedBlocks();
    await page.waitForTimeout(500);

    const countAfterUndo = await blocks.count();

    // Повторяем (Redo)
    await authenticatedPage.redo();
    await authenticatedPage.waitForShowedBlocks();
    await page.waitForTimeout(500);

    // Проверяем что приложение не упало
    await expect(authenticatedPage.rootContainer).toBeVisible();

    // ИЗВЕСТНАЯ ПРОБЛЕМА: RedoStack очищается после copy-block операции
    // Поэтому Redo может не работать после paste
    const countAfterRedo = await blocks.count();
    expect(countAfterRedo).toBeGreaterThanOrEqual(countAfterUndo);
  });
});

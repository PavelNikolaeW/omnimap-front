import { test, expect } from '../fixtures/auth.fixture';
import { createStorageHelper, createApiHelper } from '../helpers';
import { uniqueBlockTitle, waitForDialog } from '../fixtures/test-data.fixture';

/**
 * Тесты редактирования блоков @blocks @edit
 */
test.describe('Редактирование блоков @blocks @edit', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.waitForShowedBlocks();
  });

  test('должен редактировать название блока через хоткей T и проверить UI, API, Storage', async ({
    authenticatedPage,
    page,
  }) => {
    const storageHelper = createStorageHelper(page);
    const apiHelper = createApiHelper(page);

    const newTitle = uniqueBlockTitle('RenamedBlock');
    const blocks = authenticatedPage.getBlocks();
    const blockCount = await blocks.count();

    expect(blockCount).toBeGreaterThan(0);

    // Ждём пока все pending операции завершатся
    await page.waitForTimeout(1000);

    // Выбираем первый блок
    const firstBlock = blocks.first();
    await authenticatedPage.clickBlock(firstBlock);

    // Получаем ID блока до редактирования
    const blockId = await firstBlock.getAttribute('id');

    // Нажимаем T для редактирования названия
    await authenticatedPage.pressHotkey('t');
    await waitForDialog(page);

    const input = page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
    await input.clear();
    await input.fill(newTitle);

    const okBtn = page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');

    // === ПРОВЕРКА API ===
    const apiResult = await apiHelper.waitForBlockUpdate(async () => {
      await okBtn.click();
    });

    expect([200, 202, 429]).toContain(apiResult.status);
    expect(apiResult.data?.title).toBe(newTitle);

    await authenticatedPage.waitForShowedBlocks();

    // === ПРОВЕРКА UI ===
    await authenticatedPage.assertBlockWithTitleExists(newTitle);

    // === ПРОВЕРКА STORAGE ===
    if (blockId) {
      await page.waitForTimeout(2000);
      const storedBlock = await storageHelper.getBlock(blockId);
      expect(storedBlock).not.toBeNull();
    }
  });

  test('должен редактировать текст блока через хоткей W с проверкой API', async ({
    authenticatedPage,
    page,
  }) => {
    const storageHelper = createStorageHelper(page);
    const apiHelper = createApiHelper(page);

    const blocks = authenticatedPage.getBlocks();
    expect(await blocks.count()).toBeGreaterThan(0);

    const firstBlock = blocks.first();
    await authenticatedPage.clickBlock(firstBlock);
    const blockId = await firstBlock.getAttribute('id');

    // Ждём стабилизации перед открытием редактора
    await page.waitForTimeout(500);

    // Открываем редактор текста
    await authenticatedPage.pressHotkey('w');

    // Ждём появления редактора
    const editor = page.locator(
      '[data-testid="note-editor-textarea"], #noteEditor textarea, .CodeMirror, .EasyMDEContainer textarea, #editor-container textarea'
    );
    await expect(editor.first()).toBeVisible({ timeout: 5000 });

    // Вводим текст
    const testText = 'Test content ' + Date.now();
    await editor.first().fill(testText);

    // === ПРОВЕРКА API при сохранении редактора ===
    const apiResult = await apiHelper.waitForBlockUpdate(async () => {
      // Ctrl+S для сохранения (Escape закрывает без сохранения)
      await page.keyboard.press('Control+s');
    });

    expect([200, 202, 429]).toContain(apiResult.status);

    // === ПРОВЕРКА STORAGE ===
    if (blockId) {
      await page.waitForTimeout(1000);
      const storedBlock = await storageHelper.getBlock(blockId);
      expect(storedBlock).not.toBeNull();
    }
  });
});

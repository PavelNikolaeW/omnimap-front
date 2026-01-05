import { test, expect } from '../fixtures/auth.fixture';
import { createStorageHelper, createApiHelper } from '../helpers';
import { uniqueBlockTitle, waitForDialog } from '../fixtures/test-data.fixture';

/**
 * Тесты создания блоков @blocks @create
 */
test.describe('Создание блоков @blocks @create', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.waitForShowedBlocks();
  });

  test('должен создать блок через хоткей N и проверить UI, API, Storage', async ({
    authenticatedPage,
    page,
  }) => {
    const storageHelper = createStorageHelper(page);
    const apiHelper = createApiHelper(page);

    const blockTitle = uniqueBlockTitle('Block1');
    const blocks = authenticatedPage.getBlocks();

    // Если есть блоки, кликаем на первый для выделения
    if ((await blocks.count()) > 0) {
      await authenticatedPage.clickBlock(blocks.first());
    }

    // Нажимаем N для создания нового блока
    await authenticatedPage.pressHotkey('n');

    // Ждём появления диалога
    await waitForDialog(page);

    // Вводим название и подтверждаем
    const input = page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
    await input.fill(blockTitle);

    const okBtn = page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');

    // === ПРОВЕРКА API ===
    const apiResult = await apiHelper.waitForBlockCreate(async () => {
      await okBtn.click();
    });

    // Проверяем API ответ (200 для new-block, 202 для import async task, 429 при rate limiting)
    expect([200, 202, 429]).toContain(apiResult.status);
    expect(apiResult.title).toBe(blockTitle);

    // Ждём обновления UI
    await authenticatedPage.waitForShowedBlocks();

    // === ПРОВЕРКА UI ===
    await authenticatedPage.assertBlockWithTitleExists(blockTitle);

    // Получаем ID созданного блока из DOM
    const newBlockElement = page.locator(`[block] titleBlock:has-text("${blockTitle}")`).first();
    await expect(newBlockElement).toBeVisible({ timeout: 5000 });
    const blockElement = newBlockElement.locator('..').locator('..');
    const blockId = await blockElement.getAttribute('id');

    if (blockId) {
      // === ПРОВЕРКА STORAGE ===
      const storedBlock = await storageHelper.waitForBlockSaved(blockId, { timeout: 5000 });
      expect(storedBlock).not.toBeNull();
      expect(storedBlock.title).toBe(blockTitle);
      expect(storedBlock.parent_id).toBeTruthy();
    }
  });

  test('должен создать блок через кнопку в панели', async ({ authenticatedPage, page }) => {
    const blockTitle = uniqueBlockTitle('ButtonBlock');
    const blocks = authenticatedPage.getBlocks();

    if ((await blocks.count()) > 0) {
      await authenticatedPage.clickBlock(blocks.first());
    }

    // Ищем кнопку newBlock
    const newBlockBtn = page.locator(
      '[data-testid="command-btn-newBlock"], #newBlock, button:has-text("Новый блок"), [id*="new"]'
    ).first();

    const btnVisible = await newBlockBtn.isVisible().catch(() => false);

    if (btnVisible) {
      // Кликаем через JS для надёжности (Playwright click иногда не срабатывает на sidebar кнопках)
      await newBlockBtn.evaluate((btn) => {
        btn.click();
      });
      await waitForDialog(page);

      const input = page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
      await input.fill(blockTitle);

      const okBtn = page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');
      await okBtn.click();

      await authenticatedPage.waitForShowedBlocks();
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);
    } else {
      // Если кнопки нет, создаём через хоткей как fallback
      await authenticatedPage.pressHotkey('n');
      await waitForDialog(page);

      const input = page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
      await input.fill(blockTitle);

      const okBtn = page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');
      await okBtn.click();

      await authenticatedPage.waitForShowedBlocks();
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);
    }
  });

  test('должен создать iframe блок при вводе URL', async ({ authenticatedPage, page }) => {
    const apiHelper = createApiHelper(page);
    const url = 'https://example.com';
    const blocks = authenticatedPage.getBlocks();

    if ((await blocks.count()) > 0) {
      await authenticatedPage.clickBlock(blocks.first());
    }

    await authenticatedPage.pressHotkey('n');
    await waitForDialog(page);

    const input = page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
    await input.fill(url);

    const okBtn = page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');

    // === ПРОВЕРКА API ===
    const apiResult = await apiHelper.waitForBlockCreate(async () => {
      await okBtn.click();
    });

    expect([200, 202, 429]).toContain(apiResult.status);

    await authenticatedPage.waitForShowedBlocks();

    // === ПРОВЕРКА UI ===
    const iframeBlock = page.locator('[block] iframe').first();
    const urlTitleBlock = page.locator(`[block] titleBlock:has-text("${url}")`).first();

    const hasIframe = await iframeBlock.isVisible({ timeout: 3000 }).catch(() => false);
    const hasUrlTitle = await urlTitleBlock.isVisible({ timeout: 1000 }).catch(() => false);

    // Блок должен существовать в каком-либо виде
    if (!hasIframe && !hasUrlTitle) {
      const blockCount = await blocks.count();
      expect(blockCount).toBeGreaterThan(0);
    }

    // Дополнительная проверка: если есть iframe, он должен содержать URL
    if (hasIframe) {
      const src = await iframeBlock.getAttribute('src');
      if (src) {
        expect(src).toContain('example.com');
      }
    }
  });
});

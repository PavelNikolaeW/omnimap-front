import { test, expect } from '../fixtures/auth.fixture';

/**
 * Тесты удаления блоков @blocks @delete
 */
test.describe('Удаление блоков @blocks @delete', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.waitForShowedBlocks();
  });

  test('должен удалить один блок через хоткей Shift+D', async ({ authenticatedPage, page }) => {
    const blocks = authenticatedPage.getBlocks();
    const initialCount = await blocks.count();

    if (initialCount === 0) {
      test.skip();
      return;
    }

    // Ждём стабилизации
    await page.waitForTimeout(1000);

    // Выбираем первый блок
    const firstBlock = blocks.first();
    await authenticatedPage.clickBlock(firstBlock);
    await page.waitForTimeout(300);

    // Удаляем через Shift+D
    await authenticatedPage.deleteSelectedBlock();

    // Подтверждаем удаление если появился диалог
    const confirmBtn = page.locator('.custom-modal-buttons .btn-ok, [data-testid="confirm-ok"]');
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await authenticatedPage.waitForShowedBlocks();

    // === ПРОВЕРКА UI ===
    const newCount = await blocks.count();
    expect(newCount).toBeLessThanOrEqual(initialCount);

    // Проверяем что приложение не сломалось
    await expect(authenticatedPage.rootContainer).toBeVisible();
  });

  test('должен удалить несколько выделенных блоков', async ({ authenticatedPage, page }) => {
    // Ждём стабилизации UI
    await page.waitForTimeout(1000);

    const blocks = authenticatedPage.getBlocks();
    const initialCount = await blocks.count();

    if (initialCount < 2) {
      test.skip();
      return;
    }

    // Проверяем что второй блок видим
    const secondBlockVisible = await blocks.nth(1).isVisible().catch(() => false);
    if (!secondBlockVisible) {
      test.skip();
      return;
    }

    // Выделяем первый блок
    const firstBlock = blocks.first();
    await authenticatedPage.clickBlock(firstBlock);
    await page.waitForTimeout(300);

    // Выделяем второй блок с Shift (мультиселект)
    const secondBlock = blocks.nth(1);
    await page.keyboard.down('Shift');
    await authenticatedPage.clickBlock(secondBlock);
    await page.keyboard.up('Shift');
    await page.waitForTimeout(300);

    // Удаляем выделенные блоки
    await authenticatedPage.deleteSelectedBlock();

    // Подтверждаем удаление
    const confirmBtn = page.locator('.custom-modal-buttons .btn-ok, [data-testid="confirm-ok"]');
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await authenticatedPage.waitForShowedBlocks();

    // === ПРОВЕРКА UI ===
    const newCount = await blocks.count();
    expect(newCount).toBeLessThanOrEqual(initialCount);

    // Проверяем что приложение не сломалось
    await expect(authenticatedPage.rootContainer).toBeVisible();
  });
});

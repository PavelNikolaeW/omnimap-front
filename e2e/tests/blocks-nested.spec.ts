import { test, expect } from '../fixtures/auth.fixture';
import { createStorageHelper, createApiHelper } from '../helpers';
import { uniqueBlockTitle, waitForDialog } from '../fixtures/test-data.fixture';

/**
 * Тесты вложенных блоков @blocks @nested
 */
test.describe('Вложенные блоки @blocks @nested', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.waitForShowedBlocks();
  });

  test('должен создать блок внутри существующего блока с проверкой API', async ({
    authenticatedPage,
    page,
  }) => {
    const apiHelper = createApiHelper(page);

    const blocks = authenticatedPage.getBlocks();
    expect(await blocks.count()).toBeGreaterThan(0);

    // Ждём стабилизации перед навигацией
    await page.waitForTimeout(1000);

    // Открываем первый блок (входим внутрь)
    const firstBlock = blocks.first();
    await firstBlock.dblclick();

    await authenticatedPage.waitForShowedBlocks();

    // Ждём завершения навигации
    await page.waitForTimeout(500);

    // Создаём дочерний блок внутри
    const childTitle = uniqueBlockTitle('ChildBlock');
    await authenticatedPage.pressHotkey('n');
    await waitForDialog(page);

    const input = page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
    await input.fill(childTitle);

    const okBtn = page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');

    // === ПРОВЕРКА API ===
    const apiResult = await apiHelper.waitForBlockCreate(async () => {
      await okBtn.click();
    });

    expect([200, 202, 429]).toContain(apiResult.status);
    expect(apiResult.title).toBe(childTitle);

    await authenticatedPage.waitForShowedBlocks();
    await authenticatedPage.assertBlockWithTitleExists(childTitle);

    // Возвращаемся назад
    await authenticatedPage.pressHotkey('Backspace');
    await authenticatedPage.waitForShowedBlocks();
  });

  test('должен создать несколько уровней вложенности', async ({ authenticatedPage, page }) => {
    const blocks = authenticatedPage.getBlocks();

    if ((await blocks.count()) === 0) {
      test.skip();
      return;
    }

    // Уровень 1: входим в блок
    await blocks.first().dblclick();
    await authenticatedPage.waitForShowedBlocks();

    // Создаём блок уровня 2
    const level2Title = uniqueBlockTitle('Level2');
    await authenticatedPage.pressHotkey('n');
    await waitForDialog(page);
    await page.locator('[data-testid="custom-dialog-input"], .custom-modal-input').fill(level2Title);
    await page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok').click();
    await authenticatedPage.waitForShowedBlocks();

    // Входим в созданный блок
    const level2Block = page
      .locator(`[block] titleBlock:has-text("${level2Title}")`)
      .first()
      .locator('..')
      .locator('..');
    await level2Block.dblclick();
    await authenticatedPage.waitForShowedBlocks();

    // Создаём блок уровня 3
    const level3Title = uniqueBlockTitle('Level3');
    await authenticatedPage.pressHotkey('n');
    await waitForDialog(page);
    await page.locator('[data-testid="custom-dialog-input"], .custom-modal-input').fill(level3Title);
    await page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok').click();
    await authenticatedPage.waitForShowedBlocks();
    await authenticatedPage.assertBlockWithTitleExists(level3Title);

    // Возвращаемся на 2 уровня назад
    await authenticatedPage.pressHotkey('Backspace');
    await authenticatedPage.waitForShowedBlocks();
    await authenticatedPage.pressHotkey('Backspace');
    await authenticatedPage.waitForShowedBlocks();
  });
});

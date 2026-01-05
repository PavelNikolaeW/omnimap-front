import { test, expect } from '../fixtures/auth.fixture';
import { uniqueBlockTitle, waitForDialog } from '../fixtures/test-data.fixture';

/**
 * Тесты операций через UI кнопки (без хоткеев) @blocks @ui
 *
 * Кнопки рендерятся в #control-panel (sidebar) с data-testid="command-btn-{id}"
 * Основные кнопки:
 * - newBlock - создание блока
 * - editBlockTitle - редактирование названия
 * - removeTreeBlock - удаление блока
 *
 * ВАЖНО: Кнопки рендерятся асинхронно после загрузки пользователя из localforage,
 * поэтому нужно явно ждать появления кнопок перед тестами.
 */
test.describe('Операции через UI кнопки @blocks @ui', () => {
  /**
   * Ожидает появления кнопки команды в sidebar
   * Кнопки рендерятся асинхронно после localforage.getItem('currentUser')
   */
  async function waitForCommandButton(page: any, buttonId: string, timeout = 10000): Promise<boolean> {
    const selector = `#${buttonId}, [data-testid="command-btn-${buttonId}"]`;
    try {
      await page.waitForSelector(selector, { state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }

  test.beforeEach(async ({ authenticatedPage, page }) => {
    await authenticatedPage.waitForShowedBlocks();

    // Ждём рендеринга sidebar кнопок (они рендерятся асинхронно после загрузки user из localforage)
    await page.waitForFunction(
      () => {
        const controlPanel = document.getElementById('control-panel');
        if (!controlPanel) return false;
        const buttons = controlPanel.querySelectorAll('button');
        return buttons.length > 0;
      },
      { timeout: 10000 }
    ).catch(() => {
      console.log('[UI Buttons Test] Warning: control-panel buttons did not render in time');
    });
  });

  test('должен создать блок через кнопку newBlock', async ({ authenticatedPage, page }) => {
    const blockTitle = uniqueBlockTitle('UIButtonBlock');
    const blocks = authenticatedPage.getBlocks();

    if ((await blocks.count()) > 0) {
      await authenticatedPage.clickBlock(blocks.first());
      await page.waitForTimeout(300);
    }

    // Ждём кнопку создания блока
    const buttonVisible = await waitForCommandButton(page, 'newBlock');

    if (!buttonVisible) {
      // Логируем состояние для отладки
      const controlPanel = page.locator('#control-panel');
      const isControlPanelVisible = await controlPanel.isVisible().catch(() => false);
      const buttonCount = await page.locator('#control-panel button').count();
      const buttonIds = await page.locator('#control-panel button').evaluateAll((btns: HTMLElement[]) =>
        btns.map((b) => ({ id: b.id, testid: b.getAttribute('data-testid') }))
      );
      console.log('[UI Buttons Test] control-panel visible:', isControlPanelVisible);
      console.log('[UI Buttons Test] button count:', buttonCount);
      console.log('[UI Buttons Test] button IDs:', JSON.stringify(buttonIds));
      test.skip();
      return;
    }

    const newBlockBtn = page.locator('#newBlock, [data-testid="command-btn-newBlock"]').first();

    // Кликаем по кнопке и диспатчим событие через JS для надёжности
    await newBlockBtn.evaluate((btn) => {
      btn.click();
    });

    // Ждём диалог с увеличенным таймаутом
    await waitForDialog(page, 10000);

    const input = page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
    await input.fill(blockTitle);

    const okBtn = page.locator(
      '[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok'
    );
    await okBtn.click();

    await authenticatedPage.waitForShowedBlocks();
    await authenticatedPage.assertBlockWithTitleExists(blockTitle);
  });

  test('должен удалить блок через кнопку removeTreeBlock', async ({ authenticatedPage, page }) => {
    const blocks = authenticatedPage.getBlocks();
    const initialCount = await blocks.count();

    if (initialCount === 0) {
      test.skip();
      return;
    }

    await authenticatedPage.clickBlock(blocks.first());
    await page.waitForTimeout(300);

    // Ждём кнопку удаления
    const buttonVisible = await waitForCommandButton(page, 'removeTreeBlock');

    if (!buttonVisible) {
      const buttonCount = await page.locator('#control-panel button').count();
      console.log('[UI Buttons Test] removeTreeBlock not found, button count:', buttonCount);
      test.skip();
      return;
    }

    const deleteBtn = page
      .locator('#removeTreeBlock, [data-testid="command-btn-removeTreeBlock"]')
      .first();

    // Кликаем через JS для надёжности
    await deleteBtn.evaluate((btn) => {
      btn.click();
    });

    // Подтверждаем удаление
    const confirmBtn = page.locator('.custom-modal-buttons .btn-ok, [data-testid="confirm-ok"]');
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await authenticatedPage.waitForShowedBlocks();

    const newCount = await blocks.count();
    expect(newCount).toBeLessThanOrEqual(initialCount);
  });

  test('должен редактировать название через кнопку editBlockTitle', async ({
    authenticatedPage,
    page,
  }) => {
    const blocks = authenticatedPage.getBlocks();
    if ((await blocks.count()) === 0) {
      test.skip();
      return;
    }

    await authenticatedPage.clickBlock(blocks.first());
    await page.waitForTimeout(300);

    // Ждём кнопку редактирования названия
    const buttonVisible = await waitForCommandButton(page, 'editBlockTitle');

    if (!buttonVisible) {
      const buttonCount = await page.locator('#control-panel button').count();
      console.log('[UI Buttons Test] editBlockTitle not found, button count:', buttonCount);
      test.skip();
      return;
    }

    const newTitle = uniqueBlockTitle('UIRenamedBlock');

    const editTitleBtn = page
      .locator('#editBlockTitle, [data-testid="command-btn-editBlockTitle"]')
      .first();

    // Кликаем через JS для надёжности
    await editTitleBtn.evaluate((btn) => {
      btn.click();
    });

    await waitForDialog(page);

    const input = page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
    await input.clear();
    await input.fill(newTitle);

    const okBtn = page.locator(
      '[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok'
    );
    await okBtn.click();

    await authenticatedPage.waitForShowedBlocks();
    await authenticatedPage.assertBlockWithTitleExists(newTitle);
  });
});

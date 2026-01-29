import { test, expect } from '../fixtures/base.fixture';

/**
 * Verify: Группа B — Негативные и защитные сценарии Text Editor
 *
 * s4: Выход через Escape без сохранения НЕ изменяет контент
 * s5: Режим TEXT_EDIT блокирует глобальные hotkeys
 * s9: Конфликт при одновременном редактировании (skipped - требует multiuser)
 */
test.describe('Verify: Text Editor - Group B (Negative & protective)', () => {

  test.afterEach(async ({ page }) => {
    // Ensure editor is closed after each test
    const editorContainer = page.locator('#editor-container');
    if (await editorContainer.evaluate(el => el.classList.contains('active')).catch(() => false)) {
      await page.keyboard.press('Escape');
    }
  });

  test('s4: Escape закрывает редактор без сохранения изменений', async ({ authenticatedPage, page }) => {
    // Найдём первый блок
    const blocks = page.locator('#rootContainer [block]');
    await blocks.first().waitFor({ state: 'visible', timeout: 10000 });

    const firstBlock = blocks.first();

    // Выбираем блок
    await firstBlock.locator('titleBlock').first().click({ force: true, modifiers: ['Shift'] });
    await page.waitForTimeout(500);

    // Открываем редактор и запоминаем оригинальный текст
    await page.keyboard.press('w');
    const textarea = page.locator('[data-testid="note-editor-textarea"]');
    await expect(textarea).toBeVisible({ timeout: 5000 });

    const originalText = await textarea.inputValue();

    // Вводим текст (который НЕ должен сохраниться)
    await textarea.fill('This text should NOT be saved ' + Date.now());

    // Нажимаем Escape (выход без сохранения)
    await page.keyboard.press('Escape');

    // Проверяем что редактор закрылся
    const editorContainer = page.locator('#editor-container');
    await expect(editorContainer).not.toHaveClass(/active/, { timeout: 5000 });

    // Открываем редактор снова и проверяем что текст не изменился
    await firstBlock.locator('titleBlock').first().click({ force: true, modifiers: ['Shift'] });
    await page.waitForTimeout(500);
    await page.keyboard.press('w');
    await expect(textarea).toBeVisible({ timeout: 5000 });

    const textAfterEscape = await textarea.inputValue();
    expect(textAfterEscape).toBe(originalText);
  });

  test('s5: TEXT_EDIT режим блокирует глобальные hotkeys', async ({ authenticatedPage, page }) => {
    // Найдём первый блок
    const blocks = page.locator('#rootContainer [block]');
    await blocks.first().waitFor({ state: 'visible', timeout: 10000 });

    const firstBlock = blocks.first();

    // Выбираем блок
    await firstBlock.locator('titleBlock').first().click({ force: true, modifiers: ['Shift'] });
    await page.waitForTimeout(500);

    // Получаем количество блоков до теста
    const blockCountBefore = await blocks.count();

    // Открываем редактор
    await page.keyboard.press('w');
    const textarea = page.locator('[data-testid="note-editor-textarea"]');
    await expect(textarea).toBeVisible({ timeout: 5000 });

    // Очищаем textarea
    await textarea.fill('');

    // Нажимаем 'n' (hotkey для создания блока в normal mode)
    // В TEXT_EDIT режиме должен просто напечататься символ
    await page.keyboard.type('n');

    // Нажимаем 'd' (hotkey для удаления)
    await page.keyboard.type('d');

    // Нажимаем 't' (hotkey для редактирования title)
    await page.keyboard.type('t');

    // Проверяем что символы напечатались в textarea
    const textareaValue = await textarea.inputValue();
    expect(textareaValue).toBe('ndt');

    // Проверяем что диалог создания блока НЕ появился
    const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
    await expect(dialogInput).not.toBeVisible();

    // Проверяем что количество блоков не изменилось
    const blockCountAfter = await blocks.count();
    expect(blockCountAfter).toBe(blockCountBefore);
  });

  test.skip('s9: Конфликт при одновременном редактировании показывает баннер', async () => {
    // TODO: Требуется multiuser fixture (два браузерных контекста)
    // См. Playwright docs: https://playwright.dev/docs/browser-contexts
  });
});

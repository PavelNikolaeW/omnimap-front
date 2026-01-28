import { test, expect } from '../fixtures/base.fixture';
import { uniqueBlockTitle } from '../fixtures/test-data.fixture';
import { apiCleanupByPrefix } from '../fixtures/verify-helpers.fixture';

/**
 * Verify: Группа A — Основные позитивные сценарии Text Editor
 *
 * s1: Открытие текстового редактора через hotkey 'w'
 * s2: Ввод текста и сохранение при выходе через Ctrl+S
 * s3: Markdown форматирование корректно рендерится в Preview
 * s8: Сохранение через Ctrl+S работает корректно
 */
test.describe('Verify: Text Editor - Group A (Basic positive)', () => {

  let cleanupDone = false;

  test.beforeEach(async ({ authenticatedPage, page }) => {
    // Cleanup stale blocks from previous runs (only once)
    if (!cleanupDone) {
      await apiCleanupByPrefix(page, 'Verify_');
      cleanupDone = true;
    }
  });

  test('s1: Открытие текстового редактора через hotkey w', async ({ authenticatedPage, page }) => {
    // Найдём первый существующий блок
    const blocks = page.locator('#rootContainer [block]');
    await blocks.first().waitFor({ state: 'visible', timeout: 10000 });

    // Выбираем блок через Shift+Click
    const firstBlock = blocks.first();
    await firstBlock.locator('titleBlock').first().click({ force: true, modifiers: ['Shift'] });
    await page.waitForTimeout(500);

    // Нажимаем 'w' для открытия редактора
    await page.keyboard.press('w');
    await page.waitForTimeout(500);

    // Проверяем что редактор открылся
    const editorContainer = page.locator('#editor-container');
    await expect(editorContainer).toHaveClass(/active/, { timeout: 5000 });

    // Проверяем что textarea видима
    const textarea = page.locator('[data-testid="note-editor-textarea"]');
    await expect(textarea).toBeVisible({ timeout: 5000 });

    // Проверяем что toolbar присутствует с кнопками
    const toolbar = page.locator('.note-editor-toolbar');
    await expect(toolbar).toBeVisible();
    const toolbarButtons = page.locator('.note-editor-toolbar button');
    const buttonCount = await toolbarButtons.count();
    expect(buttonCount).toBeGreaterThanOrEqual(10);

    // Закрываем редактор
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });

  test('s2: Ввод текста и сохранение через Ctrl+S', async ({ authenticatedPage, page }) => {
    // Найдём первый блок
    const blocks = page.locator('#rootContainer [block]');
    await blocks.first().waitFor({ state: 'visible', timeout: 10000 });

    const firstBlock = blocks.first();
    const blockId = await firstBlock.getAttribute('id');

    // Выбираем блок
    await firstBlock.locator('titleBlock').first().click({ force: true, modifiers: ['Shift'] });
    await page.waitForTimeout(500);

    // Открываем редактор
    await page.keyboard.press('w');
    const textarea = page.locator('[data-testid="note-editor-textarea"]');
    await expect(textarea).toBeVisible({ timeout: 5000 });

    // Вводим текст
    const uniqueText = 'VerifyS2_' + Date.now();
    await textarea.fill(uniqueText);
    await page.waitForTimeout(200);

    // Сохраняем через Ctrl+S (Cmd+S на Mac)
    await page.keyboard.press('Meta+s');
    await page.waitForTimeout(1000);

    // Проверяем что редактор закрылся
    const editorContainer = page.locator('#editor-container');
    await expect(editorContainer).not.toHaveClass(/active/, { timeout: 5000 });

    // Проверяем что текст сохранён (ищем в любом видимом месте)
    const savedContent = page.locator('#rootContainer').getByText(uniqueText);
    await expect(savedContent).toBeVisible({ timeout: 5000 });
  });

  test('s3: Markdown форматирование рендерится в Preview', async ({ authenticatedPage, page }) => {
    // Найдём первый блок
    const blocks = page.locator('#rootContainer [block]');
    await blocks.first().waitFor({ state: 'visible', timeout: 10000 });

    const firstBlock = blocks.first();

    // Выбираем блок
    await firstBlock.locator('titleBlock').first().click({ force: true, modifiers: ['Shift'] });
    await page.waitForTimeout(500);

    // Открываем редактор
    await page.keyboard.press('w');
    const textarea = page.locator('[data-testid="note-editor-textarea"]');
    await expect(textarea).toBeVisible({ timeout: 5000 });

    // Вводим Markdown текст
    const mdText = '# Heading\n**bold text** and *italic* and ~~strikethrough~~';
    await textarea.fill(mdText);
    await page.waitForTimeout(200);

    // Нажимаем кнопку Preview
    const previewButton = page.locator("button[title='Превью']");
    await previewButton.click();
    await page.waitForTimeout(300);

    // Проверяем что preview отображается
    const preview = page.locator('.note-editor-preview');
    await expect(preview).toBeVisible({ timeout: 5000 });

    // Проверяем рендеринг форматирования
    const heading = preview.locator('h1');
    await expect(heading).toContainText('Heading');

    const bold = preview.locator('strong');
    await expect(bold).toContainText('bold text');

    const italic = preview.locator('em');
    await expect(italic).toContainText('italic');

    // Закрываем редактор без сохранения
    await page.keyboard.press('Escape');
  });

  test('s8: Сохранение через Ctrl+S закрывает редактор', async ({ authenticatedPage, page }) => {
    // Найдём первый блок
    const blocks = page.locator('#rootContainer [block]');
    await blocks.first().waitFor({ state: 'visible', timeout: 10000 });

    const firstBlock = blocks.first();
    const blockId = await firstBlock.getAttribute('id');

    // Выбираем блок
    await firstBlock.locator('titleBlock').first().click({ force: true, modifiers: ['Shift'] });
    await page.waitForTimeout(500);

    // Открываем редактор
    await page.keyboard.press('w');
    const textarea = page.locator('[data-testid="note-editor-textarea"]');
    await expect(textarea).toBeVisible({ timeout: 5000 });

    // Вводим текст
    const uniqueText = 'VerifyS8_' + Date.now();
    await textarea.fill(uniqueText);

    // Проверяем что редактор активен
    const editorContainer = page.locator('#editor-container');
    await expect(editorContainer).toHaveClass(/active/);

    // Сохраняем через Cmd+S (Mac) / Ctrl+S (Windows)
    await page.keyboard.press('Meta+s');
    await page.waitForTimeout(1000);

    // Проверяем что редактор закрылся
    await expect(editorContainer).not.toHaveClass(/active/, { timeout: 5000 });

    // Проверяем что текст сохранён
    const savedContent = page.locator('#rootContainer').getByText(uniqueText);
    await expect(savedContent).toBeVisible({ timeout: 5000 });
  });
});

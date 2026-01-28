import { test, expect } from '../fixtures/base.fixture';
import { apiCleanupByPrefix } from '../fixtures/verify-helpers.fixture';

/**
 * Verify: Группа C — Edge cases Text Editor
 *
 * s6: Длинный текст (2000+ символов) корректно сохраняется
 * s7: Пустой текст очищает контент блока
 * s10: Toolbar buttons корректно форматируют текст
 * s11: Эмодзи (Unicode) корректно сохраняются и отображаются
 * s12: MD→HTML→MD round-trip сохраняет семантику контента
 */
test.describe('Verify: Text Editor - Group C (Edge cases)', () => {

  let cleanupDone = false;

  test.beforeEach(async ({ authenticatedPage, page }) => {
    if (!cleanupDone) {
      await apiCleanupByPrefix(page, 'Verify_');
      cleanupDone = true;
    }
  });

  test('s6: Длинный текст 2000+ символов корректно сохраняется', async ({ authenticatedPage, page }) => {
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

    // Генерируем длинный текст (2500+ символов)
    const paragraph = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ';
    let longText = '';
    while (longText.length < 2500) {
      longText += paragraph;
    }
    const uniqueMarker = `MARKER${Date.now()}END`;
    longText = uniqueMarker + ' ' + longText;

    // Вводим длинный текст
    await textarea.fill(longText);
    await page.waitForTimeout(200);

    // Проверяем что textarea может содержать длинный текст
    const textLength = await textarea.evaluate((el) => (el as HTMLTextAreaElement).value.length);
    expect(textLength).toBeGreaterThanOrEqual(2500);

    // Сохраняем
    await page.keyboard.press('Meta+s');
    await page.waitForTimeout(1000);

    // Открываем редактор снова и проверяем что текст сохранён полностью
    await firstBlock.locator('titleBlock').first().click({ force: true, modifiers: ['Shift'] });
    await page.waitForTimeout(500);
    await page.keyboard.press('w');
    await expect(textarea).toBeVisible({ timeout: 5000 });

    const savedText = await textarea.inputValue();
    expect(savedText.length).toBeGreaterThanOrEqual(2500);
    expect(savedText).toContain(uniqueMarker);

    // Закрываем редактор
    await page.keyboard.press('Escape');
  });

  test('s7: Пустой текст очищает контент блока', async ({ authenticatedPage, page }) => {
    // Найдём первый блок
    const blocks = page.locator('#rootContainer [block]');
    await blocks.first().waitFor({ state: 'visible', timeout: 10000 });

    const firstBlock = blocks.first();
    const blockId = await firstBlock.getAttribute('id');

    // Выбираем блок
    await firstBlock.locator('titleBlock').first().click({ force: true, modifiers: ['Shift'] });
    await page.waitForTimeout(500);

    // Открываем редактор и добавляем текст
    await page.keyboard.press('w');
    const textarea = page.locator('[data-testid="note-editor-textarea"]');
    await expect(textarea).toBeVisible({ timeout: 5000 });

    const initialText = 'Some initial content for s7 ' + Date.now();
    await textarea.fill(initialText);
    await page.keyboard.press('Meta+s');
    await page.waitForTimeout(1000);

    // Проверяем что текст сохранён
    const savedContent = page.locator('#rootContainer').getByText('Some initial content for s7');
    await expect(savedContent).toBeVisible({ timeout: 5000 });

    // Открываем редактор снова
    await firstBlock.locator('titleBlock').first().click({ force: true, modifiers: ['Shift'] });
    await page.waitForTimeout(500);
    await page.keyboard.press('w');
    await expect(textarea).toBeVisible({ timeout: 5000 });

    // Очищаем текст
    await textarea.fill('');
    await page.waitForTimeout(200);

    // Сохраняем пустой текст
    await page.keyboard.press('Meta+s');
    await page.waitForTimeout(1000);

    // Проверяем что контент очищен (Some initial content больше не видно)
    const clearedCheck = page.locator('#rootContainer').getByText('Some initial content for s7');
    await expect(clearedCheck).not.toBeVisible({ timeout: 5000 });
  });

  test('s10: Toolbar кнопка Bold корректно форматирует текст', async ({ authenticatedPage, page }) => {
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

    // Вводим текст
    await textarea.fill('make this bold');
    await page.waitForTimeout(200);

    // Выделяем слово "bold" (последние 4 символа)
    await textarea.evaluate((el) => {
      (el as HTMLTextAreaElement).setSelectionRange(10, 14);
    });
    await page.waitForTimeout(100);

    // Нажимаем кнопку Bold
    const boldButton = page.locator("button[title='Полужирный']");
    await boldButton.click();
    await page.waitForTimeout(200);

    // Проверяем что текст обёрнут в **
    const textareaValue = await textarea.inputValue();
    expect(textareaValue).toContain('**bold**');

    // Закрываем редактор без сохранения
    await page.keyboard.press('Escape');
  });

  test('s11: Эмодзи (Unicode) корректно сохраняются и отображаются', async ({ authenticatedPage, page }) => {
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

    // Вводим текст с эмодзи
    const emojiText = 'Hello 🎉 World 👋 Test ✅ Rocket 🚀 Idea 💡 Fire 🔥 Note 📝 Star 🌟';
    await textarea.fill(emojiText);
    await page.waitForTimeout(200);

    // Сохраняем
    await page.keyboard.press('Meta+s');
    await page.waitForTimeout(1000);

    // Проверяем что эмодзи отображаются
    const emojiContent = page.locator('#rootContainer').getByText('🎉');
    await expect(emojiContent).toBeVisible({ timeout: 5000 });

    // Открываем редактор снова и проверяем что эмодзи сохранились
    await firstBlock.locator('titleBlock').first().click({ force: true, modifiers: ['Shift'] });
    await page.waitForTimeout(500);
    await page.keyboard.press('w');
    await expect(textarea).toBeVisible({ timeout: 5000 });

    const savedText = await textarea.inputValue();
    expect(savedText).toContain('🎉');
    expect(savedText).toContain('👋');
    expect(savedText).toContain('✅');
    expect(savedText).toContain('🚀');
    expect(savedText).toContain('💡');
    expect(savedText).toContain('🔥');
    expect(savedText).toContain('📝');
    expect(savedText).toContain('🌟');

    // Закрываем редактор без сохранения
    await page.keyboard.press('Escape');
  });

  test('s12: MD→HTML→MD round-trip сохраняет семантику контента', async ({ authenticatedPage, page }) => {
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

    // Вводим Markdown с разными элементами
    const originalMd = `# Heading 1
## Heading 2

**Bold text** and *italic text*

- List item 1
- List item 2

\`inline code\`

> Quote block`;

    await textarea.fill(originalMd);
    await page.waitForTimeout(200);

    // Сохраняем (MD → HTML конвертация происходит при сохранении)
    await page.keyboard.press('Meta+s');
    await page.waitForTimeout(1000);

    // Открываем редактор снова (HTML → MD конвертация через TurndownService)
    await firstBlock.locator('titleBlock').first().click({ force: true, modifiers: ['Shift'] });
    await page.waitForTimeout(500);
    await page.keyboard.press('w');
    await expect(textarea).toBeVisible({ timeout: 5000 });

    // Получаем round-tripped текст
    const roundTrippedText = await textarea.inputValue();

    // Проверяем сохранение семантики (формат маркеров может измениться)
    // Заголовки
    expect(roundTrippedText).toMatch(/# Heading 1/);
    expect(roundTrippedText).toMatch(/## Heading 2/);

    // Bold (может быть ** или __)
    expect(roundTrippedText).toMatch(/\*\*Bold text\*\*|__Bold text__/);

    // Italic (может быть * или _)
    expect(roundTrippedText).toMatch(/\*italic text\*|_italic text_/);

    // Списки (маркер может быть - или *, с возможными пробелами)
    expect(roundTrippedText).toMatch(/[-*]\s+List item 1/);
    expect(roundTrippedText).toMatch(/[-*]\s+List item 2/);

    // Inline code
    expect(roundTrippedText).toContain('`inline code`');

    // Quote
    expect(roundTrippedText).toContain('> Quote block');

    // Закрываем редактор без сохранения
    await page.keyboard.press('Escape');
  });
});

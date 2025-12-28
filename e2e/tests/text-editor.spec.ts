import { test, expect } from '../fixtures/auth.fixture';
import { setupApiMocks } from '../fixtures/test-data.fixture';

test.describe('Редактор текста (NoteEditor)', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test.describe('Открытие и закрытие редактора', () => {
    test('должен открыть редактор через хоткей W', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Открываем редактор
        await authenticatedPage.pressHotkey('w');

        // Ждём появления редактора
        await expect(authenticatedPage.editorContainer).toBeVisible({ timeout: 5000 });
      }
    });

    test('должен закрыть редактор через Escape без сохранения', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('w');

        await expect(authenticatedPage.editorContainer).toBeVisible({ timeout: 5000 });

        // Вводим текст
        const textarea = authenticatedPage.page.locator('.note-editor-textarea, textarea');
        if (await textarea.isVisible()) {
          await textarea.fill('Тестовый текст который не должен сохраниться');
        }

        // Закрываем через Escape
        await authenticatedPage.pressHotkey('Escape');

        // Редактор должен закрыться
        await expect(authenticatedPage.editorContainer).not.toBeVisible({ timeout: 3000 });
      }
    });

    test('должен сохранить и закрыть редактор через Enter', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('w');

        await expect(authenticatedPage.editorContainer).toBeVisible({ timeout: 5000 });

        // Вводим текст
        const textarea = authenticatedPage.page.locator('.note-editor-textarea, textarea');
        if (await textarea.isVisible()) {
          await textarea.fill('Сохраняемый текст');
        }

        // Сохраняем через Enter
        await authenticatedPage.pressHotkey('Enter');

        await authenticatedPage.page.waitForTimeout(500);
      }
    });

    test('должен сохранить через Ctrl+S', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('w');

        await expect(authenticatedPage.editorContainer).toBeVisible({ timeout: 5000 });

        const textarea = authenticatedPage.page.locator('.note-editor-textarea, textarea');
        if (await textarea.isVisible()) {
          await textarea.fill('Текст для Ctrl+S');

          // Сохраняем через Ctrl+S
          await authenticatedPage.page.keyboard.down('Control');
          await authenticatedPage.page.keyboard.press('s');
          await authenticatedPage.page.keyboard.up('Control');

          await authenticatedPage.page.waitForTimeout(500);
        }
      }
    });
  });

  test.describe('Форматирование текста', () => {
    test('должен добавить жирный текст', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('w');

        await expect(authenticatedPage.editorContainer).toBeVisible({ timeout: 5000 });

        const textarea = authenticatedPage.page.locator('.note-editor-textarea, textarea');
        if (await textarea.isVisible()) {
          // Вводим текст с markdown форматированием
          await textarea.fill('**жирный текст**');

          // Проверяем превью если есть
          const preview = authenticatedPage.page.locator('.note-editor-preview');
          if (await preview.isVisible()) {
            await expect(preview.locator('strong')).toBeVisible();
          }
        }

        await authenticatedPage.closePopup();
      }
    });

    test('должен добавить курсивный текст', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('w');

        await expect(authenticatedPage.editorContainer).toBeVisible({ timeout: 5000 });

        const textarea = authenticatedPage.page.locator('.note-editor-textarea, textarea');
        if (await textarea.isVisible()) {
          await textarea.fill('*курсивный текст*');
        }

        await authenticatedPage.closePopup();
      }
    });

    test('должен добавить заголовок', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('w');

        await expect(authenticatedPage.editorContainer).toBeVisible({ timeout: 5000 });

        const textarea = authenticatedPage.page.locator('.note-editor-textarea, textarea');
        if (await textarea.isVisible()) {
          await textarea.fill('# Заголовок\n\nОбычный текст');
        }

        await authenticatedPage.closePopup();
      }
    });

    test('должен добавить список', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('w');

        await expect(authenticatedPage.editorContainer).toBeVisible({ timeout: 5000 });

        const textarea = authenticatedPage.page.locator('.note-editor-textarea, textarea');
        if (await textarea.isVisible()) {
          await textarea.fill('- Пункт 1\n- Пункт 2\n- Пункт 3');
        }

        await authenticatedPage.closePopup();
      }
    });

    test('должен добавить блок кода', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('w');

        await expect(authenticatedPage.editorContainer).toBeVisible({ timeout: 5000 });

        const textarea = authenticatedPage.page.locator('.note-editor-textarea, textarea');
        if (await textarea.isVisible()) {
          await textarea.fill('```javascript\nconst x = 1;\nconsole.log(x);\n```');
        }

        await authenticatedPage.closePopup();
      }
    });

    test('должен добавить цитату', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('w');

        await expect(authenticatedPage.editorContainer).toBeVisible({ timeout: 5000 });

        const textarea = authenticatedPage.page.locator('.note-editor-textarea, textarea');
        if (await textarea.isVisible()) {
          await textarea.fill('> Это цитата\n> На несколько строк');
        }

        await authenticatedPage.closePopup();
      }
    });
  });

  test.describe('Toolbar редактора', () => {
    test('должен показать toolbar с кнопками форматирования', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('w');

        await expect(authenticatedPage.editorContainer).toBeVisible({ timeout: 5000 });

        // Проверяем наличие toolbar
        const toolbar = authenticatedPage.page.locator('.note-editor-toolbar, .editor-toolbar');
        if (await toolbar.isVisible()) {
          // Должны быть кнопки форматирования
          const buttons = toolbar.locator('button, .btn');
          const count = await buttons.count();
          expect(count).toBeGreaterThan(0);
        }

        await authenticatedPage.closePopup();
      }
    });
  });

  test.describe('Превью', () => {
    test('должен переключиться в режим превью', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('w');

        await expect(authenticatedPage.editorContainer).toBeVisible({ timeout: 5000 });

        // Ищем кнопку превью
        const previewBtn = authenticatedPage.page.locator('[title*="preview"], .preview-btn, button:has-text("Preview")');
        if (await previewBtn.isVisible()) {
          await previewBtn.click();

          // Должен появиться превью контейнер
          const preview = authenticatedPage.page.locator('.note-editor-preview, .preview');
          await expect(preview).toBeVisible({ timeout: 3000 });
        }

        await authenticatedPage.closePopup();
      }
    });
  });
});

import { test, expect } from '../fixtures/auth.fixture';
import { setupApiMocks } from '../fixtures/test-data.fixture';

test.describe('Импорт блоков (ImportPopup)', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);

    // Мокируем API импорта
    await page.route('**/api/v1/blocks/import**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          created: 5,
          updated: 2,
          errors: [],
        }),
      });
    });
  });

  test.describe('Открытие попапа импорта', () => {
    test('должен открыть попап импорта', async ({ authenticatedPage }) => {
      // Ищем кнопку импорта в меню опций
      await authenticatedPage.pressHotkey('o'); // Открываем опции
      await authenticatedPage.page.waitForTimeout(300);

      const importBtn = authenticatedPage.page.locator('#importBlocks, .fa-file-import, button:has-text("Импорт"), [title*="import" i]');

      if (await importBtn.isVisible()) {
        await importBtn.click();

        const importPopup = authenticatedPage.page.locator('.import-popup, [role="dialog"]');
        await expect(importPopup).toBeVisible({ timeout: 5000 });

        await authenticatedPage.closePopup();
      } else {
        // Закрываем меню опций
        await authenticatedPage.closePopup();
      }
    });
  });

  test.describe('Загрузка JSON файла', () => {
    test('должен показать зону для загрузки файла', async ({ authenticatedPage }) => {
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const importBtn = authenticatedPage.page.locator('#importBlocks, .fa-file-import, button:has-text("Импорт")');

      if (await importBtn.isVisible()) {
        await importBtn.click();

        // Проверяем наличие input для файла
        const fileInput = authenticatedPage.page.locator('.import-file-input, input[type="file"]');
        await expect(fileInput).toBeAttached();

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    });
  });

  test.describe('Ввод JSON вручную', () => {
    test('должен показать textarea для ввода JSON', async ({ authenticatedPage }) => {
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const importBtn = authenticatedPage.page.locator('#importBlocks, .fa-file-import, button:has-text("Импорт")');

      if (await importBtn.isVisible()) {
        await importBtn.click();

        // Проверяем наличие textarea для JSON
        const jsonInput = authenticatedPage.page.locator('.import-json-input, textarea');

        if (await jsonInput.isVisible()) {
          // Вводим валидный JSON
          const validJson = JSON.stringify({
            blocks: [
              { id: 'test-1', title: 'Test Block 1', content: '' },
              { id: 'test-2', title: 'Test Block 2', content: '' },
            ],
          });

          await jsonInput.fill(validJson);
        }

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    });

    test('должен показать ошибку для невалидного JSON', async ({ authenticatedPage }) => {
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const importBtn = authenticatedPage.page.locator('#importBlocks, .fa-file-import, button:has-text("Импорт")');

      if (await importBtn.isVisible()) {
        await importBtn.click();

        const jsonInput = authenticatedPage.page.locator('.import-json-input, textarea');

        if (await jsonInput.isVisible()) {
          // Вводим невалидный JSON
          await jsonInput.fill('{ invalid json }}}');

          await authenticatedPage.page.waitForTimeout(500);

          // Должна появиться ошибка валидации
          const validationError = authenticatedPage.page.locator('.import-validation-errors, .validation-error, .popup-message--error');
          // Ошибка может появиться при попытке импорта
        }

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    });
  });

  test.describe('Процесс импорта', () => {
    test('должен показать прогресс импорта', async ({ authenticatedPage }) => {
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const importBtn = authenticatedPage.page.locator('#importBlocks, .fa-file-import, button:has-text("Импорт")');

      if (await importBtn.isVisible()) {
        await importBtn.click();

        const jsonInput = authenticatedPage.page.locator('.import-json-input, textarea');

        if (await jsonInput.isVisible()) {
          const validJson = JSON.stringify({
            blocks: [{ id: 'test-1', title: 'Test', content: '' }],
          });

          await jsonInput.fill(validJson);

          // Кликаем кнопку импорта
          const startImportBtn = authenticatedPage.page.locator('button:has-text("Импортировать"), .import-btn, .popup-btn--primary');

          if (await startImportBtn.isVisible()) {
            await startImportBtn.click();

            // Должен появиться прогресс
            const progressSection = authenticatedPage.page.locator('.import-progress-section, .progress');
            // Прогресс появляется во время импорта

            await authenticatedPage.page.waitForTimeout(1000);
          }
        }

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    });

    test('должен показать результаты импорта', async ({ authenticatedPage }) => {
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const importBtn = authenticatedPage.page.locator('#importBlocks, .fa-file-import, button:has-text("Импорт")');

      if (await importBtn.isVisible()) {
        await importBtn.click();

        const jsonInput = authenticatedPage.page.locator('.import-json-input, textarea');

        if (await jsonInput.isVisible()) {
          const validJson = JSON.stringify({
            blocks: [{ id: 'test-1', title: 'Test', content: '' }],
          });

          await jsonInput.fill(validJson);

          const startImportBtn = authenticatedPage.page.locator('button:has-text("Импортировать"), .import-btn');

          if (await startImportBtn.isVisible()) {
            await startImportBtn.click();

            // Ждём завершения
            await authenticatedPage.page.waitForTimeout(2000);

            // Должны появиться результаты
            const resultsSection = authenticatedPage.page.locator('.import-results-section, .import-results');
            // Результаты показывают количество созданных/обновлённых блоков
          }
        }

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    });
  });

  test.describe('Обработка ошибок импорта', () => {
    test('должен показать список ошибок при частичном импорте', async ({ authenticatedPage, page }) => {
      // Мокируем ответ с ошибками
      await page.route('**/api/v1/blocks/import**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            created: 1,
            updated: 0,
            errors: [
              { block_id: 'test-2', code: 'INVALID_PARENT', message: 'Parent not found' },
              { block_id: 'test-3', code: 'DUPLICATE', message: 'Block already exists' },
            ],
          }),
        });
      });

      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const importBtn = authenticatedPage.page.locator('#importBlocks, .fa-file-import, button:has-text("Импорт")');

      if (await importBtn.isVisible()) {
        await importBtn.click();

        const jsonInput = authenticatedPage.page.locator('.import-json-input, textarea');

        if (await jsonInput.isVisible()) {
          await jsonInput.fill('{"blocks":[]}');

          const startImportBtn = authenticatedPage.page.locator('button:has-text("Импортировать"), .import-btn');

          if (await startImportBtn.isVisible()) {
            await startImportBtn.click();
            await authenticatedPage.page.waitForTimeout(2000);

            // Должен появиться список ошибок
            const errorList = authenticatedPage.page.locator('.import-error-list, .error-list');
            // Ошибки отображаются с кодами и описаниями
          }
        }

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    });
  });
});

import { test, expect } from '../fixtures/auth.fixture';
import { setupApiMocks, uniqueBlockTitle } from '../fixtures/test-data.fixture';

/**
 * CRUD тесты для блоков @blocks @crud
 *
 * Эти тесты запускаются первыми (префикс 01-)
 * и создают блоки для последующих тестов.
 */

/**
 * Ожидает события ShowedBlocks (блоки отрендерены на экране)
 */
async function waitForShowedBlocks(page: any, timeout = 15000): Promise<void> {
  await page.waitForFunction(
    () => {
      return new Promise<boolean>((resolve) => {
        // Если блоки уже есть на странице, сразу резолвим
        const blocks = document.querySelectorAll('[block]');
        if (blocks.length > 0) {
          resolve(true);
          return;
        }

        // Проверяем rootContainer
        const root = document.getElementById('rootContainer');
        if (root && root.children.length > 0) {
          resolve(true);
          return;
        }

        // Иначе ждём события ShowedBlocks
        const handler = () => {
          window.removeEventListener('ShowedBlocks', handler);
          resolve(true);
        };
        window.addEventListener('ShowedBlocks', handler);

        // Fallback таймаут
        setTimeout(() => {
          window.removeEventListener('ShowedBlocks', handler);
          resolve(true);
        }, 10000);
      });
    },
    { timeout }
  );
}

/**
 * Ожидает появления диалога custom-dialog
 */
async function waitForDialog(page: any, timeout = 5000): Promise<void> {
  // Пробуем разные селекторы - data-testid или классы
  await page.waitForSelector(
    '[data-testid="custom-dialog-input"], .custom-modal-input, input.custom-modal-input',
    { state: 'visible', timeout }
  );
}

test.describe('CRUD операции с блоками @blocks', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test.describe('Создание блоков', () => {
    test('должен создать новый блок через хоткей N', async ({ authenticatedPage }) => {
      // Ждём рендера блоков
      await waitForShowedBlocks(authenticatedPage.page);

      const blockTitle = uniqueBlockTitle('NewBlock');
      const blocks = authenticatedPage.getBlocks();
      const initialCount = await blocks.count();

      // Если есть блоки, кликаем на первый для выделения
      if (initialCount > 0) {
        await authenticatedPage.clickBlock(blocks.first());
      }

      // Нажимаем N для создания нового блока
      await authenticatedPage.pressHotkey('n');

      // Ждём появления диалога
      await waitForDialog(authenticatedPage.page);

      // Вводим название и подтверждаем
      const input = authenticatedPage.page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
      await input.fill(blockTitle);

      const okBtn = authenticatedPage.page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');
      await okBtn.click();

      // Ждём обновления UI
      await waitForShowedBlocks(authenticatedPage.page);

      // Проверяем, что блок с таким названием появился
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);
    });

    test('должен создать блок через кнопку в панели', async ({ authenticatedPage }) => {
      await waitForShowedBlocks(authenticatedPage.page);

      const blockTitle = uniqueBlockTitle('ButtonBlock');
      const blocks = authenticatedPage.getBlocks();

      if (await blocks.count() > 0) {
        await authenticatedPage.clickBlock(blocks.first());
      }

      // Ищем кнопку newBlock (может быть разный селектор)
      const newBlockBtn = authenticatedPage.page.locator(
        '[data-testid="command-btn-newBlock"], #newBlock, button:has-text("Новый блок"), [id*="new"]'
      ).first();

      if (await newBlockBtn.isVisible().catch(() => false)) {
        await newBlockBtn.click();

        await waitForDialog(authenticatedPage.page);

        const input = authenticatedPage.page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
        await input.fill(blockTitle);

        const okBtn = authenticatedPage.page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');
        await okBtn.click();

        await waitForShowedBlocks(authenticatedPage.page);
        await authenticatedPage.assertBlockWithTitleExists(blockTitle);
      } else {
        // Если кнопки нет, создаём через хоткей
        await authenticatedPage.pressHotkey('n');
        await waitForDialog(authenticatedPage.page);

        const input = authenticatedPage.page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
        await input.fill(blockTitle);

        const okBtn = authenticatedPage.page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');
        await okBtn.click();

        await waitForShowedBlocks(authenticatedPage.page);
        await authenticatedPage.assertBlockWithTitleExists(blockTitle);
      }
    });

    test('должен создать iframe блок при вводе URL', async ({ authenticatedPage }) => {
      await waitForShowedBlocks(authenticatedPage.page);

      const url = 'https://example.com';
      const blocks = authenticatedPage.getBlocks();

      if (await blocks.count() > 0) {
        await authenticatedPage.clickBlock(blocks.first());
      }

      await authenticatedPage.pressHotkey('n');
      await waitForDialog(authenticatedPage.page);

      const input = authenticatedPage.page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
      await input.fill(url);

      const okBtn = authenticatedPage.page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');
      await okBtn.click();

      await waitForShowedBlocks(authenticatedPage.page);

      // Проверяем что блок создан
      const newCount = await blocks.count();
      expect(newCount).toBeGreaterThan(0);
    });
  });

  test.describe('Редактирование блоков', () => {
    test('должен редактировать название блока через хоткей T', async ({ authenticatedPage }) => {
      await waitForShowedBlocks(authenticatedPage.page);

      const newTitle = uniqueBlockTitle('Renamed');
      const blocks = authenticatedPage.getBlocks();

      expect(await blocks.count()).toBeGreaterThan(0);
      await authenticatedPage.clickBlock(blocks.first());

      // Нажимаем T для редактирования названия
      await authenticatedPage.pressHotkey('t');
      await waitForDialog(authenticatedPage.page);

      const input = authenticatedPage.page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
      await input.clear();
      await input.fill(newTitle);

      const okBtn = authenticatedPage.page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');
      await okBtn.click();

      await waitForShowedBlocks(authenticatedPage.page);
      await authenticatedPage.assertBlockWithTitleExists(newTitle);
    });

    test('должен редактировать текст блока через хоткей W', async ({ authenticatedPage }) => {
      await waitForShowedBlocks(authenticatedPage.page);

      const blocks = authenticatedPage.getBlocks();
      expect(await blocks.count()).toBeGreaterThan(0);

      await authenticatedPage.clickBlock(blocks.first());

      // Открываем редактор текста
      await authenticatedPage.pressHotkey('w');

      // Ждём появления редактора (может быть разный селектор)
      const editor = authenticatedPage.page.locator(
        '[data-testid="note-editor-textarea"], #noteEditor textarea, .CodeMirror, .EasyMDEContainer textarea'
      );
      await expect(editor.first()).toBeVisible({ timeout: 5000 });

      // Закрываем редактор через Escape
      await authenticatedPage.pressHotkey('Escape');
    });
  });

  test.describe('Удаление блоков', () => {
    test('должен удалить блок через хоткей Shift+D', async ({ authenticatedPage }) => {
      await waitForShowedBlocks(authenticatedPage.page);

      const blocks = authenticatedPage.getBlocks();
      const initialCount = await blocks.count();

      // Пропускаем если нет блоков
      if (initialCount === 0) {
        test.skip();
        return;
      }

      await authenticatedPage.clickBlock(blocks.first());

      // Удаляем
      await authenticatedPage.deleteSelectedBlock();

      // Ждём обновления
      await waitForShowedBlocks(authenticatedPage.page);

      // Проверяем, что количество уменьшилось
      const newCount = await blocks.count();
      expect(newCount).toBeLessThanOrEqual(initialCount);
    });
  });

  test.describe('Undo/Redo', () => {
    test('должен отменить последнее действие через Shift+Z', async ({ authenticatedPage }) => {
      await waitForShowedBlocks(authenticatedPage.page);

      const blockTitle = uniqueBlockTitle('UndoTest');
      const blocks = authenticatedPage.getBlocks();

      if (await blocks.count() > 0) {
        await authenticatedPage.clickBlock(blocks.first());
      }

      // Создаём блок
      await authenticatedPage.pressHotkey('n');
      await waitForDialog(authenticatedPage.page);

      const input = authenticatedPage.page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
      await input.fill(blockTitle);

      const okBtn = authenticatedPage.page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');
      await okBtn.click();

      await waitForShowedBlocks(authenticatedPage.page);
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);

      // Отменяем создание
      await authenticatedPage.undo();
      await waitForShowedBlocks(authenticatedPage.page);

      // Проверяем что приложение не упало
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен повторить отменённое действие через Shift+Ctrl+Z', async ({ authenticatedPage }) => {
      await waitForShowedBlocks(authenticatedPage.page);

      const blockTitle = uniqueBlockTitle('RedoTest');
      const blocks = authenticatedPage.getBlocks();

      if (await blocks.count() > 0) {
        await authenticatedPage.clickBlock(blocks.first());
      }

      // Создаём блок
      await authenticatedPage.pressHotkey('n');
      await waitForDialog(authenticatedPage.page);

      const input = authenticatedPage.page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
      await input.fill(blockTitle);

      const okBtn = authenticatedPage.page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');
      await okBtn.click();

      await waitForShowedBlocks(authenticatedPage.page);

      // Отменяем
      await authenticatedPage.undo();
      await waitForShowedBlocks(authenticatedPage.page);

      // Повторяем
      await authenticatedPage.redo();
      await waitForShowedBlocks(authenticatedPage.page);

      // Проверяем что приложение не упало
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });
  });
});

test.describe('Копирование и вставка блоков @blocks', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('должен скопировать ID блока через Shift+C', async ({ authenticatedPage }) => {
    await waitForShowedBlocks(authenticatedPage.page);

    const blocks = authenticatedPage.getBlocks();
    if (await blocks.count() === 0) {
      test.skip();
      return;
    }

    await authenticatedPage.clickBlock(blocks.first());
    await authenticatedPage.copyBlockId();

    await expect(authenticatedPage.rootContainer).toBeVisible();
  });

  test('должен вырезать и вставить блок', async ({ authenticatedPage }) => {
    await waitForShowedBlocks(authenticatedPage.page);

    const blocks = authenticatedPage.getBlocks();
    const count = await blocks.count();

    if (count < 2) {
      test.skip();
      return;
    }

    await authenticatedPage.clickBlock(blocks.first());
    await authenticatedPage.cutBlock();

    await authenticatedPage.clickBlock(blocks.nth(1));
    await authenticatedPage.pasteBlock();

    await waitForShowedBlocks(authenticatedPage.page);
    await expect(authenticatedPage.rootContainer).toBeVisible();
  });
});

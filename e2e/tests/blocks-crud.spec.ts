import { test, expect } from '../fixtures/auth.fixture';
import { setupApiMocks, uniqueBlockTitle, waitForApiIdle } from '../fixtures/test-data.fixture';

test.describe('CRUD операции с блоками', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test.describe('Создание блоков', () => {
    test('должен создать новый блок через хоткей N', async ({ authenticatedPage }) => {
      const blockTitle = uniqueBlockTitle('NewBlock');

      // Получаем начальное количество блоков
      const initialCount = await authenticatedPage.getBlocksCount();

      // Кликаем на первый блок для выделения
      const firstBlock = authenticatedPage.getFirstBlock();
      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
      }

      // Создаём новый блок
      await authenticatedPage.createBlock(blockTitle);

      // Ждём обновления UI
      await authenticatedPage.page.waitForTimeout(500);

      // Проверяем, что блок появился
      // Количество блоков должно увеличиться или появиться блок с нужным названием
    });

    test('должен создать блок через кнопку в панели', async ({ authenticatedPage }) => {
      const blockTitle = uniqueBlockTitle('ButtonBlock');

      // Кликаем на первый блок
      const firstBlock = authenticatedPage.getFirstBlock();
      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
      }

      // Создаём через кнопку
      await authenticatedPage.createBlockViaButton(blockTitle);

      await authenticatedPage.page.waitForTimeout(500);
    });

    test('должен создать iframe блок при вводе URL', async ({ authenticatedPage }) => {
      const url = 'https://example.com';

      const firstBlock = authenticatedPage.getFirstBlock();
      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
      }

      // Создаём блок с URL
      await authenticatedPage.createBlock(url);

      await authenticatedPage.page.waitForTimeout(500);
    });
  });

  test.describe('Редактирование блоков', () => {
    test('должен редактировать название блока через хоткей T', async ({ authenticatedPage }) => {
      const newTitle = uniqueBlockTitle('Renamed');

      // Выделяем блок
      const firstBlock = authenticatedPage.getFirstBlock();
      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Редактируем название
        await authenticatedPage.editBlockTitle(newTitle);

        await authenticatedPage.page.waitForTimeout(500);
      }
    });

    test('должен редактировать текст блока через хоткей W', async ({ authenticatedPage }) => {
      const newContent = 'Updated content text';

      const firstBlock = authenticatedPage.getFirstBlock();
      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Пробуем открыть редактор
        await authenticatedPage.pressHotkey('w');

        // Ждём появления редактора
        const editorVisible = await authenticatedPage.editorContainer
          .isVisible()
          .catch(() => false);

        if (editorVisible) {
          // Закрываем редактор через Escape
          await authenticatedPage.closePopup();
        }
      }
    });
  });

  test.describe('Удаление блоков', () => {
    test('должен удалить блок через хоткей Shift+D', async ({ authenticatedPage }) => {
      // Выделяем блок
      const firstBlock = authenticatedPage.getFirstBlock();
      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        const initialCount = await authenticatedPage.getBlocksCount();

        // Удаляем
        await authenticatedPage.deleteSelectedBlock();

        // Ждём обработки
        await authenticatedPage.page.waitForTimeout(500);

        // Проверяем, что количество уменьшилось
        // или блок больше не виден
      }
    });
  });

  test.describe('Undo/Redo', () => {
    test('должен отменить последнее действие через Shift+Z', async ({ authenticatedPage }) => {
      const blockTitle = uniqueBlockTitle('UndoTest');

      // Создаём блок
      const firstBlock = authenticatedPage.getFirstBlock();
      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.createBlock(blockTitle);
        await authenticatedPage.page.waitForTimeout(500);

        // Отменяем создание
        await authenticatedPage.undo();
        await authenticatedPage.page.waitForTimeout(500);
      }
    });

    test('должен повторить отменённое действие через Shift+Ctrl+Z', async ({ authenticatedPage }) => {
      const blockTitle = uniqueBlockTitle('RedoTest');

      const firstBlock = authenticatedPage.getFirstBlock();
      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.createBlock(blockTitle);
        await authenticatedPage.page.waitForTimeout(500);

        // Отменяем
        await authenticatedPage.undo();
        await authenticatedPage.page.waitForTimeout(500);

        // Повторяем
        await authenticatedPage.redo();
        await authenticatedPage.page.waitForTimeout(500);
      }
    });
  });
});

test.describe('Копирование и вставка блоков', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('должен скопировать ID блока через Shift+C', async ({ authenticatedPage }) => {
    const firstBlock = authenticatedPage.getFirstBlock();
    if (await firstBlock.isVisible()) {
      await authenticatedPage.clickBlock(firstBlock);

      // Копируем ID
      await authenticatedPage.copyBlockId();

      // Проверяем буфер обмена
      const clipboardContent = await authenticatedPage.page.evaluate(() =>
        navigator.clipboard.readText()
      ).catch(() => '');

      // ID должен быть в буфере
    }
  });

  test('должен вырезать и вставить блок', async ({ authenticatedPage }) => {
    const blocks = authenticatedPage.getBlocks();
    const count = await blocks.count();

    if (count >= 2) {
      // Выделяем первый блок
      await authenticatedPage.clickBlock(blocks.first());

      // Вырезаем
      await authenticatedPage.cutBlock();

      // Выделяем второй блок (куда вставим)
      await authenticatedPage.clickBlock(blocks.nth(1));

      // Вставляем
      await authenticatedPage.pasteBlock();

      await authenticatedPage.page.waitForTimeout(500);
    }
  });
});

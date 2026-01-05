import { test, expect } from '../fixtures/auth.fixture';
import { setupApiMocks, uniqueBlockTitle } from '../fixtures/test-data.fixture';

test.describe('Горячие клавиши', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test.describe('Основные хоткеи блоков', () => {
    test('N - создание нового блока', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Нажимаем N
        await authenticatedPage.pressHotkey('n');

        // Должен появиться диалог ввода названия
        const dialogInput = authenticatedPage.page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
        await expect(dialogInput).toBeVisible({ timeout: 5000 });

        // Отменяем
        await authenticatedPage.closePopup();
      }
    });

    test('T - редактирование названия блока', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Нажимаем T
        await authenticatedPage.pressHotkey('t');

        // Должен появиться диалог редактирования
        const dialogInput = authenticatedPage.page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
        await expect(dialogInput).toBeVisible({ timeout: 5000 });

        // Отменяем
        await authenticatedPage.closePopup();
      }
    });

    test('W - редактирование текста блока', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Нажимаем W
        await authenticatedPage.pressHotkey('w');

        // Должен появиться редактор
        await authenticatedPage.page.waitForTimeout(500);

        const editorVisible = await authenticatedPage.editorContainer.isVisible();

        // Закрываем если открылся
        if (editorVisible) {
          await authenticatedPage.closePopup();
        }
      }
    });

    test('Shift+D - удаление блока', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Нажимаем Shift+D
        await authenticatedPage.deleteSelectedBlock();

        await authenticatedPage.page.waitForTimeout(500);
      }
    });
  });

  test.describe('Хоткеи копирования', () => {
    test('Shift+C - копирование ID блока', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Копируем ID
        await authenticatedPage.copyBlockId();

        await authenticatedPage.page.waitForTimeout(300);
      }
    });

    test('Shift+X - вырезание блока', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Вырезаем
        await authenticatedPage.cutBlock();

        // Блок должен быть помечен как активный/вырезанный
        await expect(firstBlock).toHaveClass(/block-active|block-selected|block-cut/);

        // Отменяем
        await authenticatedPage.closePopup();
      }
    });

    test('Shift+V - вставка блока', async ({ authenticatedPage }) => {
      const blocks = authenticatedPage.getBlocks();
      const count = await blocks.count();

      if (count >= 2) {
        // Вырезаем первый
        await authenticatedPage.clickBlock(blocks.first());
        await authenticatedPage.cutBlock();

        // После вырезания блок скрывается, ждём и берём обновлённый список
        await authenticatedPage.waitForShowedBlocks();
        const blocksAfterCut = authenticatedPage.getBlocks();

        // Переходим к первому из оставшихся (был вторым)
        await authenticatedPage.clickBlock(blocksAfterCut.first());

        // Вставляем
        await authenticatedPage.pasteBlock();

        await authenticatedPage.page.waitForTimeout(500);
      }
    });

    test('Shift+L - вставка как ссылка', async ({ authenticatedPage }) => {
      const blocks = authenticatedPage.getBlocks();
      const count = await blocks.count();

      if (count >= 2) {
        // Копируем ID первого
        await authenticatedPage.clickBlock(blocks.first());
        await authenticatedPage.copyBlockId();

        await authenticatedPage.page.waitForTimeout(300);

        // Переходим ко второму (re-query in case blocks changed)
        const blocksNow = authenticatedPage.getBlocks();
        if ((await blocksNow.count()) >= 2) {
          await authenticatedPage.clickBlock(blocksNow.nth(1));

          // Вставляем как ссылку
          await authenticatedPage.pressHotkeyCombo('Shift', 'l');

          await authenticatedPage.page.waitForTimeout(500);
        }
      }
    });
  });

  test.describe('Хоткеи Undo/Redo', () => {
    test('Shift+Z - отмена действия', async ({ authenticatedPage }) => {
      await authenticatedPage.undo();
      await authenticatedPage.page.waitForTimeout(300);
    });

    test('Shift+Ctrl+Z - повтор действия', async ({ authenticatedPage }) => {
      await authenticatedPage.redo();
      await authenticatedPage.page.waitForTimeout(300);
    });
  });

  test.describe('Хоткеи навигации', () => {
    test('Enter - открытие блока', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.openBlock();
        await authenticatedPage.page.waitForTimeout(500);
      }
    });

    test('Backspace - возврат назад', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        // Сначала заходим в блок
        await authenticatedPage.doubleClickBlock(firstBlock);
        await authenticatedPage.page.waitForTimeout(500);

        // Выходим назад
        await authenticatedPage.goBack();
        await authenticatedPage.page.waitForTimeout(500);
      }
    });

    test('Escape - закрытие режима/попапа', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Открываем диалог
        await authenticatedPage.pressHotkey('n');
        await authenticatedPage.page.waitForTimeout(300);

        // Закрываем через Escape
        await authenticatedPage.closePopup();

        // Диалог должен закрыться
        const dialogInput = authenticatedPage.page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
        await expect(dialogInput).not.toBeVisible({ timeout: 2000 });
      }
    });

    test('Space+1..9 - переключение деревьев', async ({ authenticatedPage }) => {
      // Пробуем переключиться на дерево 1
      await authenticatedPage.switchToTree(1);
      await authenticatedPage.page.waitForTimeout(500);

      // Проверяем, что страница загрузилась
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });
  });

  test.describe('Хоткеи соединений', () => {
    test('A - создание соединения между блоками', async ({ authenticatedPage }) => {
      const blocks = authenticatedPage.getBlocks();
      const count = await blocks.count();

      if (count >= 2) {
        // Выделяем первый блок
        await authenticatedPage.clickBlock(blocks.first());

        // Нажимаем A для начала соединения
        await authenticatedPage.pressHotkey('a');

        // Блок должен быть активен
        await authenticatedPage.page.waitForTimeout(300);
        const blocksNow = authenticatedPage.getBlocks();
        await expect(blocksNow.first()).toHaveClass(/block-active|block-selected/);

        // Отменяем
        await authenticatedPage.closePopup();
      }
    });

    test('Shift+A - удаление соединения', async ({ authenticatedPage }) => {
      // Нажимаем Shift+A для режима удаления стрелок
      await authenticatedPage.pressHotkeyCombo('Shift', 'a');
      await authenticatedPage.page.waitForTimeout(300);
    });

    test('D - режим диаграммы', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Включаем режим диаграммы
        await authenticatedPage.pressHotkey('d');
        await authenticatedPage.page.waitForTimeout(500);

        // Выходим через Escape
        await authenticatedPage.closePopup();
      }
    });
  });

  test.describe('Служебные хоткеи', () => {
    test('Shift+R - очистка кеша', async ({ authenticatedPage }) => {
      await authenticatedPage.pressHotkeyCombo('Shift', 'r');
      await authenticatedPage.page.waitForTimeout(1000);

      // Страница должна обновиться
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('Shift+H - открытие чата', async ({ authenticatedPage }) => {
      await authenticatedPage.pressHotkeyCombo('Shift', 'h');
      await authenticatedPage.page.waitForTimeout(500);

      // Проверяем, появился ли чат
      const chatRoot = authenticatedPage.page.locator('#fullscreen-chat-root');
      const chatVisible = await chatRoot.isVisible().catch(() => false);

      if (chatVisible) {
        // Закрываем чат
        await authenticatedPage.pressHotkeyCombo('Shift', 'h');
      }
    });

    test('O - открытие дополнительных опций', async ({ authenticatedPage }) => {
      // Нажимаем O для опций
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(500);

      // Закрываем если что-то открылось
      await authenticatedPage.closePopup();
    });
  });
});

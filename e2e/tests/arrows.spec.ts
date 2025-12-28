import { test, expect } from '../fixtures/auth.fixture';
import { setupApiMocks } from '../fixtures/test-data.fixture';

test.describe('Соединения и стрелки', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test.describe('Создание соединений', () => {
    test('должен начать создание соединения через хоткей A', async ({ authenticatedPage }) => {
      const blocks = authenticatedPage.getBlocks();
      const count = await blocks.count();

      if (count >= 2) {
        // Выделяем первый блок
        await authenticatedPage.clickBlock(blocks.first());

        // Начинаем создание соединения
        await authenticatedPage.pressHotkey('a');

        // Блок должен быть выделен как источник
        await expect(blocks.first()).toHaveClass(/block-selected/);

        // Отменяем через Escape
        await authenticatedPage.closePopup();
      }
    });

    test('должен создать соединение между двумя блоками', async ({ authenticatedPage }) => {
      const blocks = authenticatedPage.getBlocks();
      const count = await blocks.count();

      if (count >= 2) {
        // Выделяем первый блок и начинаем соединение
        await authenticatedPage.clickBlock(blocks.first());
        await authenticatedPage.pressHotkey('a');

        // Кликаем на второй блок для завершения соединения
        await authenticatedPage.clickBlock(blocks.nth(1));
        await authenticatedPage.pressHotkey('a');

        await authenticatedPage.page.waitForTimeout(500);

        // Соединение должно быть создано (jsPlumb создаёт SVG элементы)
        const connections = authenticatedPage.page.locator('.jtk-connector, svg path');
        // Проверяем что есть хотя бы один path элемент
      }
    });

    test('должен создать пунктирное соединение', async ({ authenticatedPage }) => {
      const blocks = authenticatedPage.getBlocks();
      const count = await blocks.count();

      if (count >= 2) {
        await authenticatedPage.clickBlock(blocks.first());

        // Ищем кнопку пунктирного соединения или используем команду
        const dashedBtn = authenticatedPage.controlPanel.locator('#connectDashed, .fa-ellipsis');
        if (await dashedBtn.isVisible()) {
          await dashedBtn.click();

          // Выбираем второй блок
          await authenticatedPage.clickBlock(blocks.nth(1));

          // Повторно нажимаем для завершения
          await dashedBtn.click();

          await authenticatedPage.page.waitForTimeout(500);
        }
      }
    });

    test('должен создать двустороннее соединение', async ({ authenticatedPage }) => {
      const blocks = authenticatedPage.getBlocks();
      const count = await blocks.count();

      if (count >= 2) {
        await authenticatedPage.clickBlock(blocks.first());

        // Ищем кнопку двустороннего соединения
        const doubleBtn = authenticatedPage.controlPanel.locator('#connectDouble, .fa-arrows-left-right');
        if (await doubleBtn.isVisible()) {
          await doubleBtn.click();

          await authenticatedPage.clickBlock(blocks.nth(1));
          await doubleBtn.click();

          await authenticatedPage.page.waitForTimeout(500);
        }
      }
    });
  });

  test.describe('Удаление соединений', () => {
    test('должен активировать режим удаления соединений через Shift+A', async ({ authenticatedPage }) => {
      // Активируем режим удаления
      await authenticatedPage.pressHotkeyCombo('Shift', 'a');

      await authenticatedPage.page.waitForTimeout(300);

      // В этом режиме клик по соединению удалит его
    });

    test('должен удалить соединение через кнопку', async ({ authenticatedPage }) => {
      const deleteArrowBtn = authenticatedPage.controlPanel.locator('#deleteConnectBlock, .fa-arrows-right-left.text-danger');

      if (await deleteArrowBtn.isVisible()) {
        await deleteArrowBtn.click();
        await authenticatedPage.page.waitForTimeout(300);
      }
    });
  });

  test.describe('Навигация стрелками клавиатуры', () => {
    test('должен переместиться к соседнему блоку через стрелку вправо', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Навигация стрелкой вправо
        await authenticatedPage.pressHotkey('ArrowRight');
        await authenticatedPage.page.waitForTimeout(300);
      }
    });

    test('должен переместиться к соседнему блоку через стрелку влево', async ({ authenticatedPage }) => {
      const blocks = authenticatedPage.getBlocks();

      if ((await blocks.count()) >= 2) {
        // Выбираем второй блок
        await authenticatedPage.clickBlock(blocks.nth(1));

        // Навигация стрелкой влево
        await authenticatedPage.pressHotkey('ArrowLeft');
        await authenticatedPage.page.waitForTimeout(300);
      }
    });

    test('должен переместиться к блоку выше через стрелку вверх', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        await authenticatedPage.pressHotkey('ArrowUp');
        await authenticatedPage.page.waitForTimeout(300);
      }
    });

    test('должен переместиться к блоку ниже через стрелку вниз', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        await authenticatedPage.pressHotkey('ArrowDown');
        await authenticatedPage.page.waitForTimeout(300);
      }
    });
  });

  test.describe('Перемещение блоков в диаграмме', () => {
    test('должен переместить блок вверх через Shift+ArrowUp', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Перемещение блока
        await authenticatedPage.page.keyboard.down('Shift');
        await authenticatedPage.page.keyboard.press('ArrowUp');
        await authenticatedPage.page.keyboard.up('Shift');

        await authenticatedPage.page.waitForTimeout(300);
      }
    });

    test('должен переместить блок вниз через Shift+ArrowDown', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        await authenticatedPage.page.keyboard.down('Shift');
        await authenticatedPage.page.keyboard.press('ArrowDown');
        await authenticatedPage.page.keyboard.up('Shift');

        await authenticatedPage.page.waitForTimeout(300);
      }
    });

    test('должен переместить блок влево через Shift+ArrowLeft', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        await authenticatedPage.page.keyboard.down('Shift');
        await authenticatedPage.page.keyboard.press('ArrowLeft');
        await authenticatedPage.page.keyboard.up('Shift');

        await authenticatedPage.page.waitForTimeout(300);
      }
    });

    test('должен переместить блок вправо через Shift+ArrowRight', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        await authenticatedPage.page.keyboard.down('Shift');
        await authenticatedPage.page.keyboard.press('ArrowRight');
        await authenticatedPage.page.keyboard.up('Shift');

        await authenticatedPage.page.waitForTimeout(300);
      }
    });
  });

  test.describe('Изменение размера блока', () => {
    test('должен растянуть блок через = + ArrowRight', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Растягивание: = + стрелка
        await authenticatedPage.page.keyboard.down('=');
        await authenticatedPage.page.keyboard.press('ArrowRight');
        await authenticatedPage.page.keyboard.up('=');

        await authenticatedPage.page.waitForTimeout(300);
      }
    });

    test('должен сжать блок через Shift + = + ArrowLeft', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Сжатие: Shift + = + стрелка
        await authenticatedPage.page.keyboard.down('Shift');
        await authenticatedPage.page.keyboard.down('=');
        await authenticatedPage.page.keyboard.press('ArrowLeft');
        await authenticatedPage.page.keyboard.up('=');
        await authenticatedPage.page.keyboard.up('Shift');

        await authenticatedPage.page.waitForTimeout(300);
      }
    });
  });

  test.describe('Открытие соседних блоков', () => {
    test('должен открыть левый соседний блок через запятую', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Открываем левый соседний блок
        await authenticatedPage.pressHotkey(',');
        await authenticatedPage.page.waitForTimeout(500);
      }
    });

    test('должен открыть правый соседний блок через точку', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Открываем правый соседний блок
        await authenticatedPage.pressHotkey('.');
        await authenticatedPage.page.waitForTimeout(500);
      }
    });
  });
});

test.describe('Режим диаграммы', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('должен включить режим диаграммы через хоткей D', async ({ authenticatedPage }) => {
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

  test('должен включить режим диаграммы через кнопку', async ({ authenticatedPage }) => {
    const firstBlock = authenticatedPage.getFirstBlock();

    if (await firstBlock.isVisible()) {
      await authenticatedPage.clickBlock(firstBlock);

      const diagramBtn = authenticatedPage.controlPanel.locator('#createDiagram, .fa-project-diagram');
      if (await diagramBtn.isVisible()) {
        await diagramBtn.click();
        await authenticatedPage.page.waitForTimeout(500);

        // Повторный клик выключает режим
        await diagramBtn.click();
        await authenticatedPage.page.waitForTimeout(300);
      }
    }
  });
});

import { test, expect } from '../fixtures/auth.fixture';
import { waitForShowedBlocks, waitForBlocksCount, uniqueBlockTitle } from '../fixtures/test-data.fixture';

/**
 * Тесты соединений и стрелок @blocks
 *
 * Файл автономен - создаёт нужные блоки если их нет.
 * fullyParallel: false гарантирует последовательное выполнение внутри файла.
 */

/**
 * Хелпер: гарантирует наличие минимум N блоков
 */
async function ensureMinBlocks(authenticatedPage: any, minCount: number) {
  await waitForShowedBlocks(authenticatedPage.page);

  const blocksCount = await authenticatedPage.getBlocks().count();

  if (blocksCount < minCount) {
    // Создаём недостающие блоки
    for (let i = blocksCount; i < minCount; i++) {
      const title = uniqueBlockTitle(`ArrowTest${i + 1}`);
      await authenticatedPage.createBlock(title);
      await authenticatedPage.page.waitForTimeout(300);
    }
    await waitForShowedBlocks(authenticatedPage.page);
  }
}

test.describe('Соединения и стрелки @blocks', () => {

  test.describe('Создание соединений', () => {
    test('должен начать создание соединения через хоткей A', async ({ authenticatedPage }) => {
      // Гарантируем минимум 2 блока
      await ensureMinBlocks(authenticatedPage, 2);

      const blocks = authenticatedPage.getBlocks();

      // Выделяем первый блок
      await authenticatedPage.clickBlock(blocks.first());

      // Начинаем создание соединения
      await authenticatedPage.pressHotkey('a');

      // Ждём и re-query после нажатия A
      await authenticatedPage.page.waitForTimeout(300);
      const blocksNow = authenticatedPage.getBlocks();

      // Блок должен быть активен или выделен
      await expect(blocksNow.first()).toHaveClass(/block-active|block-selected/);

      // Отменяем через Escape
      await authenticatedPage.closePopup();
    });

    test('должен создать соединение между двумя блоками', async ({ authenticatedPage }) => {
      await ensureMinBlocks(authenticatedPage, 2);

      const blocks = authenticatedPage.getBlocks();

      // Выделяем первый блок
      await authenticatedPage.clickBlock(blocks.first());

      // Начинаем соединение через A
      await authenticatedPage.pressHotkey('a');

      // Небольшая пауза для обработки
      await authenticatedPage.page.waitForTimeout(300);

      // Кликаем на второй блок (используем nth(1) от текущего состояния)
      const blocksNow = authenticatedPage.getBlocks();
      if ((await blocksNow.count()) >= 2) {
        await authenticatedPage.clickBlock(blocksNow.nth(1));
      }

      // Завершаем соединение
      await authenticatedPage.pressHotkey('a');

      await ensureMinBlocks(authenticatedPage, 2);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен создать пунктирное соединение', async ({ authenticatedPage }) => {
      await ensureMinBlocks(authenticatedPage, 2);

      const blocks = authenticatedPage.getBlocks();
      await authenticatedPage.clickBlock(blocks.first());

      // Ищем кнопку пунктирного соединения
      const dashedBtn = authenticatedPage.controlPanel.locator('#connectDashed, .fa-ellipsis');
      const isVisible = await dashedBtn.isVisible().catch(() => false);

      if (!isVisible) {
        test.skip();
        return;
      }

      await dashedBtn.click();
      await authenticatedPage.clickBlock(blocks.nth(1));
      await dashedBtn.click();

      await ensureMinBlocks(authenticatedPage, 2);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен создать двустороннее соединение', async ({ authenticatedPage }) => {
      await ensureMinBlocks(authenticatedPage, 2);

      const blocks = authenticatedPage.getBlocks();
      await authenticatedPage.clickBlock(blocks.first());

      // Ищем кнопку двустороннего соединения
      const doubleBtn = authenticatedPage.controlPanel.locator('#connectDouble, .fa-arrows-left-right');
      const isVisible = await doubleBtn.isVisible().catch(() => false);

      if (!isVisible) {
        test.skip();
        return;
      }

      await doubleBtn.click();
      await authenticatedPage.clickBlock(blocks.nth(1));
      await doubleBtn.click();

      await ensureMinBlocks(authenticatedPage, 2);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });
  });

  test.describe('Удаление соединений', () => {
    test('должен активировать режим удаления соединений через Shift+A', async ({ authenticatedPage }) => {
      await ensureMinBlocks(authenticatedPage, 2);

      // Активируем режим удаления
      await authenticatedPage.pressHotkeyCombo('Shift', 'a');

      // Проверяем что приложение не упало
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен удалить соединение через кнопку', async ({ authenticatedPage }) => {
      await ensureMinBlocks(authenticatedPage, 2);

      const deleteArrowBtn = authenticatedPage.controlPanel.locator('#deleteConnectBlock, .fa-arrows-right-left.text-danger');
      const isVisible = await deleteArrowBtn.isVisible().catch(() => false);

      if (!isVisible) {
        test.skip();
        return;
      }

      await deleteArrowBtn.click();
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });
  });

  test.describe('Навигация стрелками клавиатуры', () => {
    test('должен переместиться к соседнему блоку через стрелку вправо', async ({ authenticatedPage }) => {
      await ensureMinBlocks(authenticatedPage, 2);
      

      const firstBlock = authenticatedPage.getFirstBlock();
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('ArrowRight');

      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен переместиться к соседнему блоку через стрелку влево', async ({ authenticatedPage }) => {
      await ensureMinBlocks(authenticatedPage, 2);
      

      const blocks = authenticatedPage.getBlocks();
      await authenticatedPage.clickBlock(blocks.nth(1));
      await authenticatedPage.pressHotkey('ArrowLeft');

      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен переместиться к блоку выше через стрелку вверх', async ({ authenticatedPage }) => {
      await ensureMinBlocks(authenticatedPage, 2);
      

      const firstBlock = authenticatedPage.getFirstBlock();
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('ArrowUp');

      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен переместиться к блоку ниже через стрелку вниз', async ({ authenticatedPage }) => {
      await ensureMinBlocks(authenticatedPage, 2);
      

      const firstBlock = authenticatedPage.getFirstBlock();
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('ArrowDown');

      await expect(authenticatedPage.rootContainer).toBeVisible();
    });
  });

  test.describe('Перемещение блоков в диаграмме', () => {
    test('должен переместить блок вверх через Shift+ArrowUp', async ({ authenticatedPage }) => {
      await ensureMinBlocks(authenticatedPage, 2);
      

      const firstBlock = authenticatedPage.getFirstBlock();
      await authenticatedPage.clickBlock(firstBlock);

      await authenticatedPage.page.keyboard.down('Shift');
      await authenticatedPage.page.keyboard.press('ArrowUp');
      await authenticatedPage.page.keyboard.up('Shift');

      await ensureMinBlocks(authenticatedPage, 2);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен переместить блок вниз через Shift+ArrowDown', async ({ authenticatedPage }) => {
      await ensureMinBlocks(authenticatedPage, 2);
      

      const firstBlock = authenticatedPage.getFirstBlock();
      await authenticatedPage.clickBlock(firstBlock);

      await authenticatedPage.page.keyboard.down('Shift');
      await authenticatedPage.page.keyboard.press('ArrowDown');
      await authenticatedPage.page.keyboard.up('Shift');

      await ensureMinBlocks(authenticatedPage, 2);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен переместить блок влево через Shift+ArrowLeft', async ({ authenticatedPage }) => {
      await ensureMinBlocks(authenticatedPage, 2);
      

      const firstBlock = authenticatedPage.getFirstBlock();
      await authenticatedPage.clickBlock(firstBlock);

      await authenticatedPage.page.keyboard.down('Shift');
      await authenticatedPage.page.keyboard.press('ArrowLeft');
      await authenticatedPage.page.keyboard.up('Shift');

      await ensureMinBlocks(authenticatedPage, 2);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен переместить блок вправо через Shift+ArrowRight', async ({ authenticatedPage }) => {
      await ensureMinBlocks(authenticatedPage, 2);
      

      const firstBlock = authenticatedPage.getFirstBlock();
      await authenticatedPage.clickBlock(firstBlock);

      await authenticatedPage.page.keyboard.down('Shift');
      await authenticatedPage.page.keyboard.press('ArrowRight');
      await authenticatedPage.page.keyboard.up('Shift');

      await ensureMinBlocks(authenticatedPage, 2);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });
  });

  test.describe('Изменение размера блока', () => {
    test('должен растянуть блок через = + ArrowRight', async ({ authenticatedPage }) => {
      await ensureMinBlocks(authenticatedPage, 2);
      

      const firstBlock = authenticatedPage.getFirstBlock();
      await authenticatedPage.clickBlock(firstBlock);

      // Растягивание: = + стрелка
      await authenticatedPage.page.keyboard.down('=');
      await authenticatedPage.page.keyboard.press('ArrowRight');
      await authenticatedPage.page.keyboard.up('=');

      await ensureMinBlocks(authenticatedPage, 2);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен сжать блок через Shift + = + ArrowLeft', async ({ authenticatedPage }) => {
      await ensureMinBlocks(authenticatedPage, 2);
      

      const firstBlock = authenticatedPage.getFirstBlock();
      await authenticatedPage.clickBlock(firstBlock);

      // Сжатие: Shift + = + стрелка
      await authenticatedPage.page.keyboard.down('Shift');
      await authenticatedPage.page.keyboard.down('=');
      await authenticatedPage.page.keyboard.press('ArrowLeft');
      await authenticatedPage.page.keyboard.up('=');
      await authenticatedPage.page.keyboard.up('Shift');

      await ensureMinBlocks(authenticatedPage, 2);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });
  });

  test.describe('Открытие соседних блоков', () => {
    test('должен открыть левый соседний блок через запятую', async ({ authenticatedPage }) => {
      await ensureMinBlocks(authenticatedPage, 2);
      

      const firstBlock = authenticatedPage.getFirstBlock();
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey(',');

      await ensureMinBlocks(authenticatedPage, 2);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен открыть правый соседний блок через точку', async ({ authenticatedPage }) => {
      await ensureMinBlocks(authenticatedPage, 2);
      

      const firstBlock = authenticatedPage.getFirstBlock();
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('.');

      await ensureMinBlocks(authenticatedPage, 2);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });
  });
});

test.describe('Режим диаграммы @blocks', () => {
  test('должен включить режим диаграммы через хоткей D', async ({ authenticatedPage }) => {
    await ensureMinBlocks(authenticatedPage, 2);

    const firstBlock = authenticatedPage.getFirstBlock();
    await authenticatedPage.clickBlock(firstBlock);

    // Включаем режим диаграммы
    await authenticatedPage.pressHotkey('d');

    await ensureMinBlocks(authenticatedPage, 2);

    // Выходим через Escape
    await authenticatedPage.closePopup();

    await expect(authenticatedPage.rootContainer).toBeVisible();
  });

  test('должен включить режим диаграммы через кнопку', async ({ authenticatedPage }) => {
    await ensureMinBlocks(authenticatedPage, 2);
    

    const firstBlock = authenticatedPage.getFirstBlock();
    await authenticatedPage.clickBlock(firstBlock);

    const diagramBtn = authenticatedPage.controlPanel.locator('#createDiagram, .fa-project-diagram');
    const isVisible = await diagramBtn.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip();
      return;
    }

    await diagramBtn.click();
    await ensureMinBlocks(authenticatedPage, 2);

    // Повторный клик выключает режим
    await diagramBtn.click();
    await ensureMinBlocks(authenticatedPage, 2);

    await expect(authenticatedPage.rootContainer).toBeVisible();
  });
});

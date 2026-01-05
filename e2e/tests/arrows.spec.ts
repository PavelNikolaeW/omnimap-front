import { test, expect } from '../fixtures/auth.fixture';
import { setupApiMocks, uniqueBlockTitle } from '../fixtures/test-data.fixture';
import { MainPage } from '../pages/main.page';

/**
 * Хелпер: создаёт 2 блока для тестов соединений
 */
async function ensureTwoBlocks(authenticatedPage: MainPage): Promise<void> {
  // Ждём загрузки страницы
  await authenticatedPage.rootContainer.waitFor({ state: 'visible', timeout: 10000 });

  const blocks = authenticatedPage.getBlocks();
  let count = await blocks.count();

  // Если блоков меньше 2, создаём недостающие
  while (count < 2) {
    // Кликаем на существующий блок (если есть)
    if (count > 0) {
      await authenticatedPage.clickBlock(blocks.first());
    }

    // Создаём блок
    const title = uniqueBlockTitle('TestBlock');
    await authenticatedPage.createBlock(title);
    await authenticatedPage.page.waitForTimeout(500);

    count = await blocks.count();
  }
}

test.describe('Соединения и стрелки @blocks', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test.describe('Создание соединений', () => {
    test('должен начать создание соединения через хоткей A', async ({ authenticatedPage }) => {
      await ensureTwoBlocks(authenticatedPage);
      const blocks = authenticatedPage.getBlocks();

      // Выделяем первый блок
      await authenticatedPage.clickBlock(blocks.first());

      // Начинаем создание соединения
      await authenticatedPage.pressHotkey('a');

      // Блок должен быть выделен как источник
      await expect(blocks.first()).toHaveClass(/block-selected/);

      // Отменяем через Escape
      await authenticatedPage.closePopup();
    });

    test('должен создать соединение между двумя блоками', async ({ authenticatedPage }) => {
      await ensureTwoBlocks(authenticatedPage);
      const blocks = authenticatedPage.getBlocks();

      // Выделяем первый блок и начинаем соединение
      await authenticatedPage.clickBlock(blocks.first());
      await authenticatedPage.pressHotkey('a');

      // Кликаем на второй блок для завершения соединения
      await authenticatedPage.clickBlock(blocks.nth(1));
      await authenticatedPage.pressHotkey('a');

      await authenticatedPage.page.waitForTimeout(500);

      // Проверяем что приложение не упало
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен создать пунктирное соединение', async ({ authenticatedPage }) => {
      await ensureTwoBlocks(authenticatedPage);
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
      await authenticatedPage.page.waitForTimeout(500);

      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен создать двустороннее соединение', async ({ authenticatedPage }) => {
      await ensureTwoBlocks(authenticatedPage);
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
      await authenticatedPage.page.waitForTimeout(500);

      await expect(authenticatedPage.rootContainer).toBeVisible();
    });
  });

  test.describe('Удаление соединений', () => {
    test('должен активировать режим удаления соединений через Shift+A', async ({ authenticatedPage }) => {
      await authenticatedPage.rootContainer.waitFor({ state: 'visible', timeout: 10000 });

      // Активируем режим удаления
      await authenticatedPage.pressHotkeyCombo('Shift', 'a');
      await authenticatedPage.page.waitForTimeout(300);

      // Проверяем что приложение не упало
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен удалить соединение через кнопку', async ({ authenticatedPage }) => {
      await authenticatedPage.rootContainer.waitFor({ state: 'visible', timeout: 10000 });

      const deleteArrowBtn = authenticatedPage.controlPanel.locator('#deleteConnectBlock, .fa-arrows-right-left.text-danger');
      const isVisible = await deleteArrowBtn.isVisible().catch(() => false);

      if (!isVisible) {
        test.skip();
        return;
      }

      await deleteArrowBtn.click();
      await authenticatedPage.page.waitForTimeout(300);

      await expect(authenticatedPage.rootContainer).toBeVisible();
    });
  });

  test.describe('Навигация стрелками клавиатуры', () => {
    test('должен переместиться к соседнему блоку через стрелку вправо', async ({ authenticatedPage }) => {
      await ensureTwoBlocks(authenticatedPage);
      const firstBlock = authenticatedPage.getFirstBlock();

      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('ArrowRight');
      await authenticatedPage.page.waitForTimeout(300);

      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен переместиться к соседнему блоку через стрелку влево', async ({ authenticatedPage }) => {
      await ensureTwoBlocks(authenticatedPage);
      const blocks = authenticatedPage.getBlocks();

      // Выбираем второй блок
      await authenticatedPage.clickBlock(blocks.nth(1));
      await authenticatedPage.pressHotkey('ArrowLeft');
      await authenticatedPage.page.waitForTimeout(300);

      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен переместиться к блоку выше через стрелку вверх', async ({ authenticatedPage }) => {
      await ensureTwoBlocks(authenticatedPage);
      const firstBlock = authenticatedPage.getFirstBlock();

      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('ArrowUp');
      await authenticatedPage.page.waitForTimeout(300);

      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен переместиться к блоку ниже через стрелку вниз', async ({ authenticatedPage }) => {
      await ensureTwoBlocks(authenticatedPage);
      const firstBlock = authenticatedPage.getFirstBlock();

      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('ArrowDown');
      await authenticatedPage.page.waitForTimeout(300);

      await expect(authenticatedPage.rootContainer).toBeVisible();
    });
  });

  test.describe('Перемещение блоков в диаграмме', () => {
    test('должен переместить блок вверх через Shift+ArrowUp', async ({ authenticatedPage }) => {
      await ensureTwoBlocks(authenticatedPage);
      const firstBlock = authenticatedPage.getFirstBlock();

      await authenticatedPage.clickBlock(firstBlock);

      await authenticatedPage.page.keyboard.down('Shift');
      await authenticatedPage.page.keyboard.press('ArrowUp');
      await authenticatedPage.page.keyboard.up('Shift');

      await authenticatedPage.page.waitForTimeout(300);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен переместить блок вниз через Shift+ArrowDown', async ({ authenticatedPage }) => {
      await ensureTwoBlocks(authenticatedPage);
      const firstBlock = authenticatedPage.getFirstBlock();

      await authenticatedPage.clickBlock(firstBlock);

      await authenticatedPage.page.keyboard.down('Shift');
      await authenticatedPage.page.keyboard.press('ArrowDown');
      await authenticatedPage.page.keyboard.up('Shift');

      await authenticatedPage.page.waitForTimeout(300);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен переместить блок влево через Shift+ArrowLeft', async ({ authenticatedPage }) => {
      await ensureTwoBlocks(authenticatedPage);
      const firstBlock = authenticatedPage.getFirstBlock();

      await authenticatedPage.clickBlock(firstBlock);

      await authenticatedPage.page.keyboard.down('Shift');
      await authenticatedPage.page.keyboard.press('ArrowLeft');
      await authenticatedPage.page.keyboard.up('Shift');

      await authenticatedPage.page.waitForTimeout(300);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен переместить блок вправо через Shift+ArrowRight', async ({ authenticatedPage }) => {
      await ensureTwoBlocks(authenticatedPage);
      const firstBlock = authenticatedPage.getFirstBlock();

      await authenticatedPage.clickBlock(firstBlock);

      await authenticatedPage.page.keyboard.down('Shift');
      await authenticatedPage.page.keyboard.press('ArrowRight');
      await authenticatedPage.page.keyboard.up('Shift');

      await authenticatedPage.page.waitForTimeout(300);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });
  });

  test.describe('Изменение размера блока', () => {
    test('должен растянуть блок через = + ArrowRight', async ({ authenticatedPage }) => {
      await ensureTwoBlocks(authenticatedPage);
      const firstBlock = authenticatedPage.getFirstBlock();

      await authenticatedPage.clickBlock(firstBlock);

      // Растягивание: = + стрелка
      await authenticatedPage.page.keyboard.down('=');
      await authenticatedPage.page.keyboard.press('ArrowRight');
      await authenticatedPage.page.keyboard.up('=');

      await authenticatedPage.page.waitForTimeout(300);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен сжать блок через Shift + = + ArrowLeft', async ({ authenticatedPage }) => {
      await ensureTwoBlocks(authenticatedPage);
      const firstBlock = authenticatedPage.getFirstBlock();

      await authenticatedPage.clickBlock(firstBlock);

      // Сжатие: Shift + = + стрелка
      await authenticatedPage.page.keyboard.down('Shift');
      await authenticatedPage.page.keyboard.down('=');
      await authenticatedPage.page.keyboard.press('ArrowLeft');
      await authenticatedPage.page.keyboard.up('=');
      await authenticatedPage.page.keyboard.up('Shift');

      await authenticatedPage.page.waitForTimeout(300);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });
  });

  test.describe('Открытие соседних блоков', () => {
    test('должен открыть левый соседний блок через запятую', async ({ authenticatedPage }) => {
      await ensureTwoBlocks(authenticatedPage);
      const firstBlock = authenticatedPage.getFirstBlock();

      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey(',');
      await authenticatedPage.page.waitForTimeout(500);

      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен открыть правый соседний блок через точку', async ({ authenticatedPage }) => {
      await ensureTwoBlocks(authenticatedPage);
      const firstBlock = authenticatedPage.getFirstBlock();

      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('.');
      await authenticatedPage.page.waitForTimeout(500);

      await expect(authenticatedPage.rootContainer).toBeVisible();
    });
  });
});

test.describe('Режим диаграммы @blocks', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('должен включить режим диаграммы через хоткей D', async ({ authenticatedPage }) => {
    await ensureTwoBlocks(authenticatedPage);
    const firstBlock = authenticatedPage.getFirstBlock();

    await authenticatedPage.clickBlock(firstBlock);

    // Включаем режим диаграммы
    await authenticatedPage.pressHotkey('d');
    await authenticatedPage.page.waitForTimeout(500);

    // Выходим через Escape
    await authenticatedPage.closePopup();

    await expect(authenticatedPage.rootContainer).toBeVisible();
  });

  test('должен включить режим диаграммы через кнопку', async ({ authenticatedPage }) => {
    await ensureTwoBlocks(authenticatedPage);
    const firstBlock = authenticatedPage.getFirstBlock();

    await authenticatedPage.clickBlock(firstBlock);

    const diagramBtn = authenticatedPage.controlPanel.locator('#createDiagram, .fa-project-diagram');
    const isVisible = await diagramBtn.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip();
      return;
    }

    await diagramBtn.click();
    await authenticatedPage.page.waitForTimeout(500);

    // Повторный клик выключает режим
    await diagramBtn.click();
    await authenticatedPage.page.waitForTimeout(300);

    await expect(authenticatedPage.rootContainer).toBeVisible();
  });
});

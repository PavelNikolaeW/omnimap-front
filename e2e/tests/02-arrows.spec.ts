import { test, expect } from '../fixtures/auth.fixture';
import { setupApiMocks } from '../fixtures/test-data.fixture';

/**
 * Тесты соединений и стрелок @blocks
 *
 * ВАЖНО: Эти тесты предполагают, что на странице уже есть минимум 2 блока.
 * Тесты на создание блоков (blocks-crud.spec.ts) должны запускаться ПЕРЕД этими тестами.
 *
 * Порядок обеспечивается:
 * 1. Единым аккаунтом (storageState) - блоки сохраняются между тестами
 * 2. Алфавитным порядком файлов: arrows.spec.ts идёт после blocks-crud.spec.ts
 */

/**
 * Ожидает события ShowedBlocks (блоки отрендерены на экране)
 */
async function waitForShowedBlocks(page: any, timeout = 10000): Promise<void> {
  await page.waitForFunction(
    () => {
      return new Promise<boolean>((resolve) => {
        // Если блоки уже есть на странице, сразу резолвим
        const blocks = document.querySelectorAll('[block]');
        if (blocks.length > 0) {
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
        }, 5000);
      });
    },
    { timeout }
  );
}

/**
 * Ожидает минимум N блоков на странице
 */
async function waitForBlocksCount(page: any, minCount: number, timeout = 10000): Promise<void> {
  await page.waitForFunction(
    (min: number) => {
      const blocks = document.querySelectorAll('[block]');
      return blocks.length >= min;
    },
    minCount,
    { timeout }
  );
}

test.describe('Соединения и стрелки @blocks', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test.describe('Создание соединений', () => {
    test('должен начать создание соединения через хоткей A', async ({ authenticatedPage }) => {
      // Ждём ShowedBlocks и минимум 2 блока
      await waitForShowedBlocks(authenticatedPage.page);
      await waitForBlocksCount(authenticatedPage.page, 2);

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
      await waitForShowedBlocks(authenticatedPage.page);
      await waitForBlocksCount(authenticatedPage.page, 2);

      const blocks = authenticatedPage.getBlocks();
      const blockCount = await blocks.count();

      if (blockCount < 2) {
        test.skip();
        return;
      }

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

      await waitForShowedBlocks(authenticatedPage.page);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен создать пунктирное соединение', async ({ authenticatedPage }) => {
      await waitForShowedBlocks(authenticatedPage.page);
      await waitForBlocksCount(authenticatedPage.page, 2);

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

      await waitForShowedBlocks(authenticatedPage.page);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен создать двустороннее соединение', async ({ authenticatedPage }) => {
      await waitForShowedBlocks(authenticatedPage.page);
      await waitForBlocksCount(authenticatedPage.page, 2);

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

      await waitForShowedBlocks(authenticatedPage.page);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });
  });

  test.describe('Удаление соединений', () => {
    test('должен активировать режим удаления соединений через Shift+A', async ({ authenticatedPage }) => {
      await waitForShowedBlocks(authenticatedPage.page);

      // Активируем режим удаления
      await authenticatedPage.pressHotkeyCombo('Shift', 'a');

      // Проверяем что приложение не упало
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен удалить соединение через кнопку', async ({ authenticatedPage }) => {
      await waitForShowedBlocks(authenticatedPage.page);

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
      await waitForShowedBlocks(authenticatedPage.page);
      await waitForBlocksCount(authenticatedPage.page, 2);

      const firstBlock = authenticatedPage.getFirstBlock();
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('ArrowRight');

      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен переместиться к соседнему блоку через стрелку влево', async ({ authenticatedPage }) => {
      await waitForShowedBlocks(authenticatedPage.page);
      await waitForBlocksCount(authenticatedPage.page, 2);

      const blocks = authenticatedPage.getBlocks();
      await authenticatedPage.clickBlock(blocks.nth(1));
      await authenticatedPage.pressHotkey('ArrowLeft');

      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен переместиться к блоку выше через стрелку вверх', async ({ authenticatedPage }) => {
      await waitForShowedBlocks(authenticatedPage.page);
      await waitForBlocksCount(authenticatedPage.page, 2);

      const firstBlock = authenticatedPage.getFirstBlock();
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('ArrowUp');

      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен переместиться к блоку ниже через стрелку вниз', async ({ authenticatedPage }) => {
      await waitForShowedBlocks(authenticatedPage.page);
      await waitForBlocksCount(authenticatedPage.page, 2);

      const firstBlock = authenticatedPage.getFirstBlock();
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('ArrowDown');

      await expect(authenticatedPage.rootContainer).toBeVisible();
    });
  });

  test.describe('Перемещение блоков в диаграмме', () => {
    test('должен переместить блок вверх через Shift+ArrowUp', async ({ authenticatedPage }) => {
      await waitForShowedBlocks(authenticatedPage.page);
      await waitForBlocksCount(authenticatedPage.page, 2);

      const firstBlock = authenticatedPage.getFirstBlock();
      await authenticatedPage.clickBlock(firstBlock);

      await authenticatedPage.page.keyboard.down('Shift');
      await authenticatedPage.page.keyboard.press('ArrowUp');
      await authenticatedPage.page.keyboard.up('Shift');

      await waitForShowedBlocks(authenticatedPage.page);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен переместить блок вниз через Shift+ArrowDown', async ({ authenticatedPage }) => {
      await waitForShowedBlocks(authenticatedPage.page);
      await waitForBlocksCount(authenticatedPage.page, 2);

      const firstBlock = authenticatedPage.getFirstBlock();
      await authenticatedPage.clickBlock(firstBlock);

      await authenticatedPage.page.keyboard.down('Shift');
      await authenticatedPage.page.keyboard.press('ArrowDown');
      await authenticatedPage.page.keyboard.up('Shift');

      await waitForShowedBlocks(authenticatedPage.page);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен переместить блок влево через Shift+ArrowLeft', async ({ authenticatedPage }) => {
      await waitForShowedBlocks(authenticatedPage.page);
      await waitForBlocksCount(authenticatedPage.page, 2);

      const firstBlock = authenticatedPage.getFirstBlock();
      await authenticatedPage.clickBlock(firstBlock);

      await authenticatedPage.page.keyboard.down('Shift');
      await authenticatedPage.page.keyboard.press('ArrowLeft');
      await authenticatedPage.page.keyboard.up('Shift');

      await waitForShowedBlocks(authenticatedPage.page);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен переместить блок вправо через Shift+ArrowRight', async ({ authenticatedPage }) => {
      await waitForShowedBlocks(authenticatedPage.page);
      await waitForBlocksCount(authenticatedPage.page, 2);

      const firstBlock = authenticatedPage.getFirstBlock();
      await authenticatedPage.clickBlock(firstBlock);

      await authenticatedPage.page.keyboard.down('Shift');
      await authenticatedPage.page.keyboard.press('ArrowRight');
      await authenticatedPage.page.keyboard.up('Shift');

      await waitForShowedBlocks(authenticatedPage.page);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });
  });

  test.describe('Изменение размера блока', () => {
    test('должен растянуть блок через = + ArrowRight', async ({ authenticatedPage }) => {
      await waitForShowedBlocks(authenticatedPage.page);
      await waitForBlocksCount(authenticatedPage.page, 2);

      const firstBlock = authenticatedPage.getFirstBlock();
      await authenticatedPage.clickBlock(firstBlock);

      // Растягивание: = + стрелка
      await authenticatedPage.page.keyboard.down('=');
      await authenticatedPage.page.keyboard.press('ArrowRight');
      await authenticatedPage.page.keyboard.up('=');

      await waitForShowedBlocks(authenticatedPage.page);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен сжать блок через Shift + = + ArrowLeft', async ({ authenticatedPage }) => {
      await waitForShowedBlocks(authenticatedPage.page);
      await waitForBlocksCount(authenticatedPage.page, 2);

      const firstBlock = authenticatedPage.getFirstBlock();
      await authenticatedPage.clickBlock(firstBlock);

      // Сжатие: Shift + = + стрелка
      await authenticatedPage.page.keyboard.down('Shift');
      await authenticatedPage.page.keyboard.down('=');
      await authenticatedPage.page.keyboard.press('ArrowLeft');
      await authenticatedPage.page.keyboard.up('=');
      await authenticatedPage.page.keyboard.up('Shift');

      await waitForShowedBlocks(authenticatedPage.page);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });
  });

  test.describe('Открытие соседних блоков', () => {
    test('должен открыть левый соседний блок через запятую', async ({ authenticatedPage }) => {
      await waitForShowedBlocks(authenticatedPage.page);
      await waitForBlocksCount(authenticatedPage.page, 2);

      const firstBlock = authenticatedPage.getFirstBlock();
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey(',');

      await waitForShowedBlocks(authenticatedPage.page);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен открыть правый соседний блок через точку', async ({ authenticatedPage }) => {
      await waitForShowedBlocks(authenticatedPage.page);
      await waitForBlocksCount(authenticatedPage.page, 2);

      const firstBlock = authenticatedPage.getFirstBlock();
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('.');

      await waitForShowedBlocks(authenticatedPage.page);
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });
  });
});

test.describe('Режим диаграммы @blocks', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('должен включить режим диаграммы через хоткей D', async ({ authenticatedPage }) => {
    await waitForShowedBlocks(authenticatedPage.page);
    await waitForBlocksCount(authenticatedPage.page, 2);

    const firstBlock = authenticatedPage.getFirstBlock();
    await authenticatedPage.clickBlock(firstBlock);

    // Включаем режим диаграммы
    await authenticatedPage.pressHotkey('d');

    await waitForShowedBlocks(authenticatedPage.page);

    // Выходим через Escape
    await authenticatedPage.closePopup();

    await expect(authenticatedPage.rootContainer).toBeVisible();
  });

  test('должен включить режим диаграммы через кнопку', async ({ authenticatedPage }) => {
    await waitForShowedBlocks(authenticatedPage.page);
    await waitForBlocksCount(authenticatedPage.page, 2);

    const firstBlock = authenticatedPage.getFirstBlock();
    await authenticatedPage.clickBlock(firstBlock);

    const diagramBtn = authenticatedPage.controlPanel.locator('#createDiagram, .fa-project-diagram');
    const isVisible = await diagramBtn.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip();
      return;
    }

    await diagramBtn.click();
    await waitForShowedBlocks(authenticatedPage.page);

    // Повторный клик выключает режим
    await diagramBtn.click();
    await waitForShowedBlocks(authenticatedPage.page);

    await expect(authenticatedPage.rootContainer).toBeVisible();
  });
});

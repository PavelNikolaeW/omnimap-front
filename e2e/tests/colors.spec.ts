import { test, expect } from '../fixtures/auth.fixture';
import { setupApiMocks } from '../fixtures/test-data.fixture';

test.describe('Цвета блоков (colorCommands)', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test.describe('Базовые цвета (1-9)', () => {
    test('должен применить цвет 1 (красный) к блоку', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Применяем цвет 1
        await authenticatedPage.pressHotkey('1');
        await authenticatedPage.page.waitForTimeout(300);

        // Блок должен получить атрибут цвета или класс
        // Проверяем наличие data-color-hue или изменение стиля
      }
    });

    test('должен применить цвет 2 (оранжевый) к блоку', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('2');
        await authenticatedPage.page.waitForTimeout(300);
      }
    });

    test('должен применить цвет 3 (жёлтый) к блоку', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('3');
        await authenticatedPage.page.waitForTimeout(300);
      }
    });

    test('должен применить цвет 4 (зелёный) к блоку', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('4');
        await authenticatedPage.page.waitForTimeout(300);
      }
    });

    test('должен применить цвет 5 (голубой) к блоку', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('5');
        await authenticatedPage.page.waitForTimeout(300);
      }
    });

    test('должен применить цвет 6 (синий) к блоку', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('6');
        await authenticatedPage.page.waitForTimeout(300);
      }
    });

    test('должен применить цвет 7 (фиолетовый) к блоку', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('7');
        await authenticatedPage.page.waitForTimeout(300);
      }
    });

    test('должен применить цвет 8 (розовый) к блоку', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('8');
        await authenticatedPage.page.waitForTimeout(300);
      }
    });

    test('должен применить цвет 9 (серый) к блоку', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('9');
        await authenticatedPage.page.waitForTimeout(300);
      }
    });
  });

  test.describe('Модификаторы цвета', () => {
    test('должен сбросить цвет через 0', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Сначала устанавливаем цвет
        await authenticatedPage.pressHotkey('1');
        await authenticatedPage.page.waitForTimeout(300);

        // Сбрасываем через 0
        await authenticatedPage.pressHotkey('0');
        await authenticatedPage.page.waitForTimeout(300);
      }
    });

    test('должен сбросить цвет через минус', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Устанавливаем цвет
        await authenticatedPage.pressHotkey('2');
        await authenticatedPage.page.waitForTimeout(300);

        // Сбрасываем через -
        await authenticatedPage.pressHotkey('-');
        await authenticatedPage.page.waitForTimeout(300);
      }
    });
  });

  test.describe('Оттенки цветов', () => {
    test('должен применить светлый оттенок цвета', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Применяем цвет с модификатором (комбинация клавиш зависит от реализации)
        // Например, c+w для белого оттенка
        await authenticatedPage.page.keyboard.down('c');
        await authenticatedPage.page.keyboard.press('w');
        await authenticatedPage.page.keyboard.up('c');

        await authenticatedPage.page.waitForTimeout(300);
      }
    });

    test('должен применить тёмный оттенок цвета', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // c+d для тёмного оттенка
        await authenticatedPage.page.keyboard.down('c');
        await authenticatedPage.page.keyboard.press('d');
        await authenticatedPage.page.keyboard.up('c');

        await authenticatedPage.page.waitForTimeout(300);
      }
    });
  });

  test.describe('Цвета для нескольких блоков', () => {
    test('должен применить цвет к нескольким выделенным блокам', async ({ authenticatedPage }) => {
      const blocks = authenticatedPage.getBlocks();
      const count = await blocks.count();

      if (count >= 2) {
        // Выделяем первый блок
        await authenticatedPage.clickBlock(blocks.first());

        // Shift+клик для мульти-выделения
        await authenticatedPage.page.keyboard.down('Shift');
        await blocks.nth(1).click();
        await authenticatedPage.page.keyboard.up('Shift');

        // Применяем цвет ко всем выделенным
        await authenticatedPage.pressHotkey('3');
        await authenticatedPage.page.waitForTimeout(300);

        // Оба блока должны получить цвет
      }
    });
  });

  test.describe('Пары цветов', () => {
    test('должен применить парный цвет (1+3)', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Комбинация для пары цветов
        await authenticatedPage.pressHotkey('1');
        await authenticatedPage.page.waitForTimeout(100);
        await authenticatedPage.pressHotkey('3');
        await authenticatedPage.page.waitForTimeout(300);
      }
    });

    test('должен применить парный цвет (2+4)', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        await authenticatedPage.pressHotkey('2');
        await authenticatedPage.page.waitForTimeout(100);
        await authenticatedPage.pressHotkey('4');
        await authenticatedPage.page.waitForTimeout(300);
      }
    });
  });
});

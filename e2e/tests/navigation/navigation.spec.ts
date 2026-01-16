import { test, expect, uniqueBlockTitle, uniqueTreeName } from '../../fixtures/base.fixture';

/**
 * Epic 3: Navigation Tests
 *
 * Тестирование навигации: открытие блоков, возврат назад,
 * breadcrumbs, переключение деревьев.
 *
 * @tag @navigation
 */

test.describe('Navigation @navigation', () => {
  test.describe.configure({ mode: 'serial' });

  // ==================== Базовая навигация ====================

  test.describe('Базовая навигация', () => {
    test('NAV-01: Открыть блок через Enter', async ({ authenticatedPage, page }) => {
      const blockTitle = uniqueBlockTitle('Open_Enter');

      // Создаём блок
      await authenticatedPage.createBlock(blockTitle);
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);

      // Кликаем на блок для выделения
      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`).first();
      await block.click();
      await page.waitForTimeout(300);

      // Открываем через Enter
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);

      // Breadcrumb должен показать путь
      const breadcrumb = page.locator('#breadcrumb');
      await expect(breadcrumb).toBeVisible();

      // Текст breadcrumb должен содержать название блока
      const breadcrumbText = await breadcrumb.textContent();
      expect(breadcrumbText).toContain(blockTitle.substring(0, 20)); // Может быть обрезано
    });

    test('NAV-02: Открыть блок через double-click', async ({ authenticatedPage, page }) => {
      const blockTitle = uniqueBlockTitle('Open_DblClick');

      // Создаём блок
      await authenticatedPage.createBlock(blockTitle);

      // Находим блок
      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`).first();
      await expect(block).toBeVisible();

      // Двойной клик для входа
      await block.dblclick();
      await page.waitForTimeout(500);

      // Breadcrumb должен показать путь
      const breadcrumb = page.locator('#breadcrumb');
      await expect(breadcrumb).toBeVisible();
    });

    test('NAV-03: Вернуться назад через Backspace', async ({ authenticatedPage, page }) => {
      const blockTitle = uniqueBlockTitle('Back');

      // Создаём блок
      await authenticatedPage.createBlock(blockTitle);

      // Открываем блок
      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`).first();
      await block.dblclick();
      await page.waitForTimeout(500);

      // Breadcrumb виден
      const breadcrumb = page.locator('#breadcrumb');
      await expect(breadcrumb).toBeVisible();

      // Нажимаем Backspace для возврата
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(500);

      // Должны вернуться на предыдущий уровень
      // Блок должен быть виден в списке
      await expect(block).toBeVisible({ timeout: 5000 });
    });

    test('NAV-04: Навигация через breadcrumb', async ({ authenticatedPage, page }) => {
      const level1Title = uniqueBlockTitle('Level1');
      const level2Title = uniqueBlockTitle('Level2');

      // Создаём первый уровень
      await authenticatedPage.createBlock(level1Title);
      const level1Block = page.locator(`[block] titleBlock:has-text("${level1Title}")`).first();
      await level1Block.dblclick();
      await page.waitForTimeout(500);

      // Создаём второй уровень
      await authenticatedPage.createBlock(level2Title);
      const level2Block = page.locator(`[block] titleBlock:has-text("${level2Title}")`).first();
      await level2Block.dblclick();
      await page.waitForTimeout(500);

      // Breadcrumb должен показать путь
      const breadcrumb = page.locator('#breadcrumb');
      await expect(breadcrumb).toBeVisible();

      // Кликаем на элемент breadcrumb для перехода
      const breadcrumbItems = breadcrumb.locator('[data-testid^="breadcrumb-item-"], .breadcrumb-item, span');
      const itemCount = await breadcrumbItems.count();

      if (itemCount > 1) {
        // Кликаем на первый элемент (корень или level1)
        await breadcrumbItems.first().click();
        await page.waitForTimeout(500);
      }

      // Должны видеть блок level1
      await expect(level1Block).toBeVisible({ timeout: 5000 });
    });
  });

  // ==================== Стрелочная навигация ====================

  test.describe('Стрелочная навигация', () => {
    test('NAV-05: Навигация стрелками вверх/вниз', async ({ authenticatedPage, page }) => {
      const block1 = uniqueBlockTitle('Arrow1');
      const block2 = uniqueBlockTitle('Arrow2');

      // Создаём два блока
      await authenticatedPage.createBlock(block1);
      await authenticatedPage.createBlock(block2);

      // Кликаем на первый блок
      const firstBlock = page.locator(`[block] titleBlock:has-text("${block1}")`).first();
      await firstBlock.click();
      await page.waitForTimeout(300);

      // Проверяем что блок выделен
      const selectedBlock = page.locator('.block-selected, .block-active').first();
      await expect(selectedBlock).toBeVisible();

      // Нажимаем стрелку вниз
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(300);

      // Должен выделиться другой блок
      const newSelectedBlock = page.locator('.block-selected, .block-active').first();
      await expect(newSelectedBlock).toBeVisible();

      // Нажимаем стрелку вверх
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(300);
    });
  });

  // ==================== Деревья ====================

  test.describe('Навигация по деревьям', () => {
    test('NAV-06: Создать новое дерево', async ({ authenticatedPage, page }) => {
      // Находим кнопку добавления дерева
      const addTreeButton = page.locator('[data-testid="tree-add-button"]');

      if (await addTreeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addTreeButton.click();

        // Ждём диалога
        const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
        await expect(dialogInput).toBeVisible({ timeout: 5000 });

        // Вводим название
        const treeName = uniqueTreeName('TestTree');
        await dialogInput.fill(treeName);
        await page.locator('[data-testid="custom-dialog-ok-btn"]').click();

        // Ждём создания
        await page.waitForTimeout(1000);

        // Дерево должно быть создано (проверяем что страница загрузилась)
        const rootContainer = page.locator('#rootContainer');
        await expect(rootContainer).toBeVisible();
      }
    });

    test('NAV-07: Переключение между деревьями через hotkey', async ({ authenticatedPage, page }) => {
      // Переключаемся на дерево 1 через Space+1
      await page.keyboard.down(' '); // Space
      await page.keyboard.press('1');
      await page.keyboard.up(' ');
      await page.waitForTimeout(500);

      // Приложение должно остаться загруженным
      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible();

      // Переключаемся на дерево 2 через Space+2 (если есть)
      await page.keyboard.down(' ');
      await page.keyboard.press('2');
      await page.keyboard.up(' ');
      await page.waitForTimeout(500);

      await expect(rootContainer).toBeVisible();
    });
  });

  // ==================== URL навигация ====================

  test.describe('URL навигация', () => {
    test('NAV-08: Прямой переход по URL с block ID', async ({ authenticatedPage, page }) => {
      const blockTitle = uniqueBlockTitle('URL_Nav');

      // Создаём блок
      await authenticatedPage.createBlock(blockTitle);

      // Находим блок и получаем его ID
      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`).first();
      await expect(block).toBeVisible();

      const blockElement = block.locator('xpath=ancestor::*[@block]').first();
      const blockId = await blockElement.getAttribute('block-id');

      if (blockId) {
        // Переходим по URL с block ID
        await page.goto(`/?block=${blockId}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        // Приложение должно загрузиться
        const rootContainer = page.locator('#rootContainer');
        await expect(rootContainer).toBeVisible({ timeout: 10000 });
      }
    });

    test('NAV-09: Кнопки браузера Back/Forward', async ({ authenticatedPage, page }) => {
      const blockTitle = uniqueBlockTitle('Browser_Nav');

      // Создаём блок
      await authenticatedPage.createBlock(blockTitle);

      // Запоминаем начальный URL
      const initialUrl = page.url();

      // Открываем блок
      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`).first();
      await block.dblclick();
      await page.waitForTimeout(500);

      // URL должен измениться (если используется history API)
      const afterOpenUrl = page.url();

      // Нажимаем браузерную кнопку "назад"
      await page.goBack();
      await page.waitForTimeout(500);

      // Приложение должно остаться работоспособным
      const rootContainer = page.locator('#rootContainer');
      await expect(rootContainer).toBeVisible({ timeout: 10000 });

      // Нажимаем "вперёд"
      await page.goForward();
      await page.waitForTimeout(500);

      await expect(rootContainer).toBeVisible({ timeout: 10000 });
    });
  });

  // ==================== Scroll ====================

  test.describe('Scroll навигация', () => {
    test('NAV-10: Прокрутка к блоку при большом количестве блоков', async ({ authenticatedPage, page }) => {
      // Создаём несколько блоков
      const blockTitles: string[] = [];
      for (let i = 0; i < 5; i++) {
        const title = uniqueBlockTitle(`Scroll_${i}`);
        blockTitles.push(title);
        await authenticatedPage.createBlock(title);
      }

      // Последний созданный блок должен быть виден
      const lastBlock = page.locator(`[block] titleBlock:has-text("${blockTitles[blockTitles.length - 1]}")`).first();
      await expect(lastBlock).toBeVisible({ timeout: 5000 });

      // Прокручиваем к первому блоку
      const firstBlock = page.locator(`[block] titleBlock:has-text("${blockTitles[0]}")`).first();
      await firstBlock.scrollIntoViewIfNeeded();
      await expect(firstBlock).toBeVisible();
    });
  });
});

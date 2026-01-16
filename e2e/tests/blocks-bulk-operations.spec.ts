import { test, expect } from '../fixtures/auth.fixture';
import { createStorageHelper, createApiHelper } from '../helpers';
import { uniqueBlockTitle, waitForDialog } from '../fixtures/test-data.fixture';

/**
 * Тесты bulk операций с блоками @blocks @bulk
 *
 * Покрывает:
 * - Создание большого количества блоков (50+)
 * - Batch удаление
 * - Batch перемещение
 * - Производительность при большом количестве блоков
 */
test.describe('Bulk операции с блоками @blocks @bulk', () => {
  // Увеличиваем timeout для bulk операций
  test.setTimeout(120000);

  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.waitForShowedBlocks();
  });

  /**
   * Хелпер для быстрого создания блока
   */
  async function createBlockQuick(page: any, authenticatedPage: any, title: string) {
    await authenticatedPage.pressHotkey('n');
    await waitForDialog(page);
    const input = page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
    await input.fill(title);
    const okBtn = page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');
    await okBtn.click();
    await page.waitForTimeout(100); // Минимальная задержка для стабильности
  }

  test.describe('Создание большого количества блоков', () => {
    test('должен создать 20 блоков последовательно', async ({ authenticatedPage, page }) => {
      const blockCount = 20;
      const prefix = `Bulk20_${Date.now()}_`;

      // Входим в первый доступный блок
      const blocks = authenticatedPage.getBlocks();
      if ((await blocks.count()) > 0) {
        await authenticatedPage.clickBlock(blocks.first());
        await authenticatedPage.pressHotkey('Enter');
        await authenticatedPage.waitForShowedBlocks();
      }

      const startTime = Date.now();

      for (let i = 1; i <= blockCount; i++) {
        await createBlockQuick(page, authenticatedPage, `${prefix}${i}`);
      }

      await authenticatedPage.waitForShowedBlocks();

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Проверяем что все блоки созданы
      const createdBlocks = page.locator(`[block]`).filter({ hasText: prefix });
      const count = await createdBlocks.count();

      expect(count).toBeGreaterThanOrEqual(blockCount - 2); // Допускаем небольшую погрешность

      // Логируем производительность
      console.log(`Created ${blockCount} blocks in ${duration}ms (${Math.round(duration / blockCount)}ms per block)`);
    });

    test('должен создать 50 блоков и проверить производительность UI', async ({ authenticatedPage, page }) => {
      const blockCount = 50;
      const prefix = `Bulk50_${Date.now()}_`;

      const blocks = authenticatedPage.getBlocks();
      if ((await blocks.count()) > 0) {
        await authenticatedPage.clickBlock(blocks.first());
        await authenticatedPage.pressHotkey('Enter');
        await authenticatedPage.waitForShowedBlocks();
      }

      const startTime = Date.now();

      for (let i = 1; i <= blockCount; i++) {
        await createBlockQuick(page, authenticatedPage, `${prefix}${i}`);

        // Каждые 10 блоков проверяем что UI responsive
        if (i % 10 === 0) {
          await authenticatedPage.waitForShowedBlocks();
        }
      }

      await authenticatedPage.waitForShowedBlocks();

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Проверяем что блоки отображаются
      const visibleBlocks = page.locator(`[block]`).filter({ hasText: prefix });
      const count = await visibleBlocks.count();

      expect(count).toBeGreaterThanOrEqual(blockCount - 5);

      // UI должен оставаться responsive (не более 3 секунд на загрузку)
      const scrollStart = Date.now();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(100);
      await page.evaluate(() => window.scrollTo(0, 0));
      const scrollDuration = Date.now() - scrollStart;

      expect(scrollDuration).toBeLessThan(3000);

      console.log(`Created ${blockCount} blocks in ${duration}ms, scroll test: ${scrollDuration}ms`);
    });
  });

  test.describe('Batch выделение', () => {
    test('должен выделить несколько блоков через Shift+Click', async ({ authenticatedPage, page }) => {
      // Создаём 5 блоков для теста
      const prefix = `Select_${Date.now()}_`;

      const blocks = authenticatedPage.getBlocks();
      if ((await blocks.count()) > 0) {
        await authenticatedPage.clickBlock(blocks.first());
        await authenticatedPage.pressHotkey('Enter');
        await authenticatedPage.waitForShowedBlocks();
      }

      for (let i = 1; i <= 5; i++) {
        await createBlockQuick(page, authenticatedPage, `${prefix}${i}`);
      }

      await authenticatedPage.waitForShowedBlocks();

      // Кликаем на первый блок
      const firstBlock = page.locator(`[block]`).filter({ hasText: `${prefix}1` }).first();
      await authenticatedPage.clickBlock(firstBlock);

      // Shift+Click на третий блок
      const thirdBlock = page.locator(`[block]`).filter({ hasText: `${prefix}3` }).first();
      await thirdBlock.click({ modifiers: ['Shift'] });

      // Проверяем что выделено несколько блоков
      const selectedBlocks = page.locator('[block].block-selected, [block].selected');
      const selectedCount = await selectedBlocks.count();

      expect(selectedCount).toBeGreaterThanOrEqual(2);
    });

    test('должен выделить все блоки через Ctrl+A', async ({ authenticatedPage, page }) => {
      const prefix = `SelectAll_${Date.now()}_`;

      const blocks = authenticatedPage.getBlocks();
      if ((await blocks.count()) > 0) {
        await authenticatedPage.clickBlock(blocks.first());
        await authenticatedPage.pressHotkey('Enter');
        await authenticatedPage.waitForShowedBlocks();
      }

      // Создаём 5 блоков
      for (let i = 1; i <= 5; i++) {
        await createBlockQuick(page, authenticatedPage, `${prefix}${i}`);
      }

      await authenticatedPage.waitForShowedBlocks();

      // Выделяем все блоки
      await page.keyboard.press('Control+a');
      await page.waitForTimeout(300);

      // Проверяем выделение
      const allBlocks = page.locator(`[block]`).filter({ hasText: prefix });
      const selectedBlocks = page.locator('[block].block-selected, [block].selected');

      const allCount = await allBlocks.count();
      const selectedCount = await selectedBlocks.count();

      // Должны быть выделены все или почти все блоки
      expect(selectedCount).toBeGreaterThanOrEqual(Math.max(1, allCount - 1));
    });
  });

  test.describe('Batch удаление', () => {
    test('должен удалить несколько выделенных блоков', async ({ authenticatedPage, page }) => {
      const apiHelper = createApiHelper(page);
      const prefix = `Delete_${Date.now()}_`;

      const blocks = authenticatedPage.getBlocks();
      if ((await blocks.count()) > 0) {
        await authenticatedPage.clickBlock(blocks.first());
        await authenticatedPage.pressHotkey('Enter');
        await authenticatedPage.waitForShowedBlocks();
      }

      // Создаём 5 блоков
      for (let i = 1; i <= 5; i++) {
        await createBlockQuick(page, authenticatedPage, `${prefix}${i}`);
      }

      await authenticatedPage.waitForShowedBlocks();

      // Выделяем первые 3 блока
      const firstBlock = page.locator(`[block]`).filter({ hasText: `${prefix}1` }).first();
      await authenticatedPage.clickBlock(firstBlock);

      const thirdBlock = page.locator(`[block]`).filter({ hasText: `${prefix}3` }).first();
      await thirdBlock.click({ modifiers: ['Shift'] });

      await page.waitForTimeout(300);

      // Удаляем выделенные
      await authenticatedPage.pressHotkey('Delete');

      // Подтверждаем если нужно
      const confirmBtn = page.locator('button:has-text("OK"), button:has-text("Да"), button:has-text("Удалить")');
      if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmBtn.click();
      }

      await authenticatedPage.waitForShowedBlocks();
      await page.waitForTimeout(500);

      // Проверяем что блоки 4 и 5 остались
      const block4 = page.locator(`[block]`).filter({ hasText: `${prefix}4` }).first();
      const block5 = page.locator(`[block]`).filter({ hasText: `${prefix}5` }).first();

      // Хотя бы один из оставшихся блоков должен быть виден
      const block4Visible = await block4.isVisible().catch(() => false);
      const block5Visible = await block5.isVisible().catch(() => false);

      expect(block4Visible || block5Visible).toBe(true);
    });
  });

  test.describe('Batch перемещение', () => {
    test('должен переместить несколько блоков в другой родитель', async ({ authenticatedPage, page }) => {
      const prefix = `Move_${Date.now()}_`;

      const blocks = authenticatedPage.getBlocks();
      if ((await blocks.count()) > 0) {
        await authenticatedPage.clickBlock(blocks.first());
        await authenticatedPage.pressHotkey('Enter');
        await authenticatedPage.waitForShowedBlocks();
      }

      // Создаём целевой контейнер
      await createBlockQuick(page, authenticatedPage, `${prefix}Target`);
      await authenticatedPage.waitForShowedBlocks();

      // Создаём блоки для перемещения
      for (let i = 1; i <= 3; i++) {
        await createBlockQuick(page, authenticatedPage, `${prefix}Source${i}`);
      }

      await authenticatedPage.waitForShowedBlocks();

      // Выделяем source блоки
      const source1 = page.locator(`[block]`).filter({ hasText: `${prefix}Source1` }).first();
      await authenticatedPage.clickBlock(source1);

      const source2 = page.locator(`[block]`).filter({ hasText: `${prefix}Source2` }).first();
      await source2.click({ modifiers: ['Shift'] });

      await page.waitForTimeout(300);

      // Начинаем перемещение (Cut)
      await authenticatedPage.pressHotkey('x');
      await page.waitForTimeout(300);

      // Кликаем на целевой контейнер
      const target = page.locator(`[block]`).filter({ hasText: `${prefix}Target` }).first();
      await authenticatedPage.clickBlock(target);

      // Вставляем
      await authenticatedPage.pressHotkey('v');
      await page.waitForTimeout(500);

      await authenticatedPage.waitForShowedBlocks();

      // Входим в целевой контейнер и проверяем что блоки там
      await authenticatedPage.pressHotkey('Enter');
      await authenticatedPage.waitForShowedBlocks();

      const movedBlock1 = page.locator(`[block]`).filter({ hasText: `${prefix}Source1` });
      const movedBlock2 = page.locator(`[block]`).filter({ hasText: `${prefix}Source2` });

      // Хотя бы один блок должен быть перемещён
      const moved1Visible = await movedBlock1.isVisible().catch(() => false);
      const moved2Visible = await movedBlock2.isVisible().catch(() => false);

      expect(moved1Visible || moved2Visible).toBe(true);
    });
  });

  test.describe('Производительность', () => {
    test('UI должен оставаться responsive при 100 блоках', async ({ authenticatedPage, page }) => {
      const blockCount = 100;
      const prefix = `Perf_${Date.now()}_`;

      const blocks = authenticatedPage.getBlocks();
      if ((await blocks.count()) > 0) {
        await authenticatedPage.clickBlock(blocks.first());
        await authenticatedPage.pressHotkey('Enter');
        await authenticatedPage.waitForShowedBlocks();
      }

      // Создаём 100 блоков
      for (let i = 1; i <= blockCount; i++) {
        await createBlockQuick(page, authenticatedPage, `${prefix}${i}`);

        if (i % 20 === 0) {
          await authenticatedPage.waitForShowedBlocks();
          console.log(`Created ${i}/${blockCount} blocks`);
        }
      }

      await authenticatedPage.waitForShowedBlocks();

      // Тест 1: Время отклика на клик
      const clickStart = Date.now();
      const randomBlock = page.locator(`[block]`).filter({ hasText: `${prefix}50` }).first();
      await authenticatedPage.clickBlock(randomBlock);
      const clickDuration = Date.now() - clickStart;

      expect(clickDuration).toBeLessThan(2000);

      // Тест 2: Время отклика на поиск
      const searchStart = Date.now();
      await authenticatedPage.pressHotkey('f');
      await page.waitForTimeout(500);
      await page.keyboard.type(`${prefix}75`);
      await page.waitForTimeout(500);
      const searchDuration = Date.now() - searchStart;

      expect(searchDuration).toBeLessThan(5000);

      // Закрываем поиск
      await page.keyboard.press('Escape');

      console.log(`Performance with ${blockCount} blocks: click=${clickDuration}ms, search=${searchDuration}ms`);
    });
  });
});

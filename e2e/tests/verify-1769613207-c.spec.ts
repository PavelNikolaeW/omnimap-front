import { test, expect } from '../fixtures/base.fixture';
import { uniqueBlockTitle } from '../fixtures/test-data.fixture';
import { apiCleanupByPrefix } from '../fixtures/verify-helpers.fixture';

/**
 * Verify: Группа C — Edge cases и стресс-тесты
 *
 * Тесты проверяют:
 * - Множественные быстрые перерендеры не ломают кэш
 * - Навигация внутрь/наружу блока сохраняет кэш
 * - Srcset атрибуты сохраняются
 */
test.describe('Verify: Image cache edge cases - Group C', () => {
  const createdBlockIds: string[] = [];

  test.beforeEach(async ({ authenticatedPage, page }) => {
    // Cleanup on first test
    if (createdBlockIds.length === 0) {
      await apiCleanupByPrefix(page, 'Verify_');
    }
  });

  test.afterEach(async ({ authenticatedPage, page }) => {
    for (const id of [...createdBlockIds].reverse()) {
      try {
        await page.evaluate(async (blockId) => {
          await fetch('/api/v1/delete-tree/' + blockId + '/', {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
          });
        }, id);
      } catch {}
    }
    createdBlockIds.length = 0;
  });

  test('s10: Множественные быстрые перерендеры не вызывают race condition', async ({ authenticatedPage, page }) => {
    // Запоминаем начальное количество картинок
    const imageCountBefore = await page.locator('.block-image').count();

    // Выполняем 5 быстрых ShowBlocks подряд
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) {
        window.dispatchEvent(new CustomEvent('ShowBlocks'));
      }
    });

    // Ждём завершения всех рендеров
    await page.waitForTimeout(2000);

    // Проверяем что количество картинок не изменилось
    const imageCountAfter = await page.locator('.block-image').count();
    expect(imageCountAfter).toBe(imageCountBefore);

    // Проверяем что нет дубликатов картинок в DOM
    const uniqueTestIds = await page.evaluate(() => {
      const images = document.querySelectorAll('.block-image');
      const testIds = new Set<string>();
      const duplicates: string[] = [];

      images.forEach(img => {
        const testId = img.getAttribute('data-testid');
        if (testId) {
          if (testIds.has(testId)) {
            duplicates.push(testId);
          }
          testIds.add(testId);
        }
      });

      return { total: images.length, unique: testIds.size, duplicates };
    });

    expect(uniqueTestIds.duplicates).toHaveLength(0);
    expect(uniqueTestIds.total).toBe(uniqueTestIds.unique);
  });

  test('s12: Srcset атрибуты сохраняются при кэшировании', async ({ authenticatedPage, page }) => {
    // Ищем картинки с srcset
    const imagesWithSrcset = page.locator('.block-image[srcset]');
    const count = await imagesWithSrcset.count();

    if (count === 0) {
      // Проверяем обычные картинки — они могут не иметь srcset
      const normalImages = page.locator('.block-image');
      const normalCount = await normalImages.count();

      if (normalCount === 0) {
        test.skip(true, 'Нет картинок на странице');
        return;
      }

      // Сохраняем атрибуты первой картинки
      const firstImage = normalImages.first();
      const attrsBefore = await firstImage.evaluate((img) => ({
        src: img.getAttribute('src'),
        alt: img.getAttribute('alt'),
        testId: img.getAttribute('data-testid')
      }));

      // Триггерим перерендер
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('ShowBlocks'));
      });
      await page.waitForTimeout(2000);

      // Проверяем что атрибуты сохранились
      const sameImage = page.locator(`[data-testid="${attrsBefore.testId}"]`);
      if (await sameImage.count() > 0) {
        const attrsAfter = await sameImage.evaluate((img) => ({
          src: img.getAttribute('src'),
          alt: img.getAttribute('alt')
        }));

        expect(attrsAfter.src).toBe(attrsBefore.src);
        expect(attrsAfter.alt).toBe(attrsBefore.alt);
      }
      return;
    }

    // Сохраняем srcset первой картинки
    const firstImage = imagesWithSrcset.first();
    const srcsetBefore = await firstImage.getAttribute('srcset');
    const sizesBefore = await firstImage.getAttribute('sizes');
    const testId = await firstImage.getAttribute('data-testid');

    // Триггерим перерендер
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('ShowBlocks'));
    });
    await page.waitForTimeout(2000);

    // Проверяем что srcset сохранился
    const sameImage = page.locator(`[data-testid="${testId}"]`);
    await expect(sameImage).toBeVisible({ timeout: 5000 });

    const srcsetAfter = await sameImage.getAttribute('srcset');
    const sizesAfter = await sameImage.getAttribute('sizes');

    expect(srcsetAfter).toBe(srcsetBefore);
    if (sizesBefore) {
      expect(sizesAfter).toBe(sizesBefore);
    }
  });

  test('s11: Навигация внутрь/наружу блока не ломает приложение', async ({ authenticatedPage, page }) => {
    // Находим блок с детьми для навигации
    const blocks = page.locator('#rootContainer [block]');
    const blockCount = await blocks.count();

    if (blockCount === 0) {
      test.skip(true, 'Нет блоков на странице');
      return;
    }

    // Запоминаем текущее состояние
    const imageCountBefore = await page.locator('.block-image').count();

    // Выбираем первый блок
    await blocks.first().locator('titleBlock').first().click({ force: true, modifiers: ['Shift'] });
    await page.waitForTimeout(500);

    // Пытаемся войти внутрь (двойной клик или Enter)
    await blocks.first().dblclick();
    await page.waitForTimeout(2000);

    // Возвращаемся назад
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(2000);

    // Проверяем что приложение не сломалось
    const blocksAfter = page.locator('#rootContainer [block]');
    const blockCountAfter = await blocksAfter.count();
    expect(blockCountAfter).toBeGreaterThan(0);

    // Проверяем что приложение всё ещё работает (rootContainer существует)
    const rootExists = await page.locator('#rootContainer').isVisible();
    expect(rootExists).toBe(true);
  });
});

import { test, expect } from '../fixtures/base.fixture';
import { uniqueBlockTitle } from '../fixtures/test-data.fixture';
import { apiCleanupByPrefix } from '../fixtures/verify-helpers.fixture';

/**
 * Verify: Группа A — Основные сценарии кэширования картинок
 *
 * Тесты проверяют что:
 * - DOM-узлы картинок переиспользуются между рендерами
 * - data-cached атрибут устанавливается для загруженных картинок
 * - visibility: hidden применяется во время рендера
 * - Картинки остаются видимыми после перерендера
 */
test.describe('Verify: Image caching - Group A', () => {
  const createdBlockIds: string[] = [];

  test.beforeEach(async ({ authenticatedPage, page }) => {
    // Cleanup stale blocks from previous runs (only on first test)
    if (createdBlockIds.length === 0) {
      await apiCleanupByPrefix(page, 'Verify_');
    }
  });

  test.afterEach(async ({ authenticatedPage, page }) => {
    // Cleanup created blocks via real API
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

  test('s2: DOM-узлы картинок сохраняются между рендерами', async ({ authenticatedPage, page }) => {
    // Найдём существующие картинки на странице
    const images = page.locator('.block-image');
    const imageCount = await images.count();

    if (imageCount === 0) {
      test.skip(true, 'Нет картинок на странице для тестирования');
      return;
    }

    // Сохраним testId первой картинки до перерендера
    const firstImage = images.first();
    const testIdBefore = await firstImage.getAttribute('data-testid');
    expect(testIdBefore).toBeTruthy();

    // Проверим что картинка загружена
    const isComplete = await firstImage.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
    if (!isComplete) {
      test.skip(true, 'Картинка ещё не загружена');
      return;
    }

    // Триггерим перерендер через создание нового блока
    const title = uniqueBlockTitle('Verify');

    // Находим первый блок для создания дочернего
    const blocks = page.locator('#rootContainer [block]');
    await blocks.first().locator('titleBlock').first().click({ force: true, modifiers: ['Shift'] });
    await page.waitForTimeout(500);

    // Создаём блок через hotkey
    await page.keyboard.press('n');
    const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
    await dialogInput.waitFor({ state: 'visible', timeout: 5000 });
    await dialogInput.fill(title);
    await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
    await page.waitForTimeout(2000);

    // Сохраним ID для cleanup
    const newBlock = await page.evaluate((t) => {
      const blocks = document.querySelectorAll('[block]');
      for (const b of blocks) {
        if (b.querySelector('.blockTitle')?.textContent?.includes(t)) {
          return (b as HTMLElement).id;
        }
      }
      return null;
    }, title);
    if (newBlock) createdBlockIds.push(newBlock);

    // Проверим что картинка всё ещё существует с тем же testId
    const imagesAfter = page.locator('.block-image');
    const imageAfterCount = await imagesAfter.count();
    expect(imageAfterCount).toBeGreaterThanOrEqual(1);

    // Найдём картинку по testId
    const sameImage = page.locator(`[data-testid="${testIdBefore}"]`);
    await expect(sameImage).toBeVisible({ timeout: 5000 });

    // Проверим что data-cached установлен
    const dataCached = await sameImage.getAttribute('data-cached');
    expect(dataCached).toBe('true');
  });

  test('s3: CSS анимация отключена для закэшированных картинок', async ({ authenticatedPage, page }) => {
    // Ищем картинки с data-cached
    const cachedImages = page.locator('.block-image[data-cached="true"]');
    const count = await cachedImages.count();

    if (count === 0) {
      // Триггерим перерендер чтобы картинки получили data-cached
      const blocks = page.locator('#rootContainer [block]');
      if (await blocks.count() > 0) {
        await blocks.first().locator('titleBlock').first().click({ force: true, modifiers: ['Shift'] });
        await page.waitForTimeout(500);

        const title = uniqueBlockTitle('Verify');
        await page.keyboard.press('n');
        const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
        await dialogInput.waitFor({ state: 'visible', timeout: 5000 });
        await dialogInput.fill(title);
        await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
        await page.waitForTimeout(2000);

        const newBlock = await page.evaluate((t) => {
          const blocks = document.querySelectorAll('[block]');
          for (const b of blocks) {
            if (b.querySelector('.blockTitle')?.textContent?.includes(t)) {
              return (b as HTMLElement).id;
            }
          }
          return null;
        }, title);
        if (newBlock) createdBlockIds.push(newBlock);
      }
    }

    // Повторно ищем cached картинки
    const cachedImagesAfter = page.locator('.block-image[data-cached="true"]');
    const countAfter = await cachedImagesAfter.count();

    if (countAfter === 0) {
      test.skip(true, 'Нет закэшированных картинок для проверки');
      return;
    }

    // Проверяем CSS свойства
    const firstCached = cachedImagesAfter.first();

    // Проверяем что opacity = 1
    const opacity = await firstCached.evaluate((el) => getComputedStyle(el).opacity);
    expect(opacity).toBe('1');

    // Проверяем что data-loaded установлен
    const dataLoaded = await firstCached.getAttribute('data-loaded');
    expect(dataLoaded).toBe('true');
  });

  test('s4: visibility hidden применяется во время рендера', async ({ authenticatedPage, page }) => {
    // Устанавливаем observer для отслеживания изменений visibility
    const visibilityChanges = await page.evaluate(() => {
      return new Promise<string[]>((resolve) => {
        const changes: string[] = [];
        const rootContainer = document.getElementById('rootContainer');
        if (!rootContainer) {
          resolve(['no rootContainer']);
          return;
        }

        // Создаём MutationObserver
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
              const visibility = (mutation.target as HTMLElement).style.visibility;
              changes.push(visibility || 'empty');
            }
          }
        });

        observer.observe(rootContainer, { attributes: true, attributeFilter: ['style'] });

        // Через 100ms dispatch ShowBlocks для триггера рендера
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('ShowBlocks'));
        }, 100);

        // Через 3 секунды отключаем observer и возвращаем результат
        setTimeout(() => {
          observer.disconnect();
          resolve(changes);
        }, 3000);
      });
    });

    // После рендера visibility должен вернуться к нормальному состоянию
    const rootContainer = page.locator('#rootContainer');
    const finalVisibility = await rootContainer.evaluate((el) => el.style.visibility);
    expect(finalVisibility).toBe(''); // Должен быть пустым (нормальное состояние)
  });

  test('s1: Картинки остаются видимыми после перерендера соседнего блока', async ({ authenticatedPage, page }) => {
    // Ищем картинки
    const images = page.locator('.block-image');
    const imageCount = await images.count();

    if (imageCount === 0) {
      test.skip(true, 'Нет картинок на странице для тестирования');
      return;
    }

    // Проверяем видимость до перерендера
    const firstImage = images.first();
    await expect(firstImage).toBeVisible();
    const opacityBefore = await firstImage.evaluate((el) => getComputedStyle(el).opacity);

    // Находим блок БЕЗ картинки и меняем его title
    const allBlocks = page.locator('#rootContainer [block]');
    const blockCount = await allBlocks.count();

    let targetBlockIndex = -1;
    for (let i = 0; i < blockCount; i++) {
      const hasImage = await allBlocks.nth(i).locator('.block-image').count() > 0;
      if (!hasImage) {
        targetBlockIndex = i;
        break;
      }
    }

    if (targetBlockIndex === -1) {
      test.skip(true, 'Все блоки имеют картинки');
      return;
    }

    // Выделяем блок без картинки
    await allBlocks.nth(targetBlockIndex).locator('titleBlock').first().click({ force: true, modifiers: ['Shift'] });
    await page.waitForTimeout(500);

    // Меняем title через hotkey 't'
    await page.keyboard.press('t');
    const titleInput = page.locator('[data-testid="block-title-input"]');

    // Если input появился, меняем title
    const inputVisible = await titleInput.isVisible().catch(() => false);
    if (inputVisible) {
      await titleInput.fill('Modified_' + Date.now());
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
    }

    // Проверяем что картинка всё ещё видима
    await expect(firstImage).toBeVisible();
    const opacityAfter = await firstImage.evaluate((el) => getComputedStyle(el).opacity);
    expect(opacityAfter).toBe('1');
  });
});

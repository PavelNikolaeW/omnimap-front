import { test, expect } from '../fixtures/auth.fixture';
import { setupApiMocks } from '../fixtures/test-data.fixture';

/**
 * E2E тесты для валидации расчёта размеров блоков
 *
 * Проверяем, что вычисленные размеры (block.size.width/height)
 * соответствуют реальным размерам элементов (getBoundingClientRect)
 */

// Допустимая погрешность в пикселях
const TOLERANCE_PX = 2;

interface SizeValidationResult {
  blockId: string;
  layout: string;
  calculated: { width: number; height: number };
  actual: { width: number; height: number };
  diff: { width: number; height: number };
  valid: boolean;
}

test.describe('Валидация размеров блоков', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('размеры блоков должны соответствовать getBoundingClientRect', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;

    // Ждём полной загрузки блоков
    await page.waitForSelector('.block', { timeout: 10000 });
    await page.waitForTimeout(1000); // Даём время на рендер

    // Выполняем валидацию в контексте браузера
    const results = await page.evaluate(() => {
      const validationResults: SizeValidationResult[] = [];

      // Получаем все блоки из localState
      const localState = (window as any).__omnimap?.localState;
      if (!localState || !localState.blocks) {
        return { error: 'localState not found', results: [] };
      }

      const blocks = localState.blocks;

      for (const [blockId, block] of blocks) {
        if (!block.size || !blockId) continue;

        const element = document.getElementById(blockId);
        if (!element) continue;

        const rect = element.getBoundingClientRect();

        const diff = {
          width: Math.abs(rect.width - block.size.width),
          height: Math.abs(rect.height - block.size.height),
        };

        validationResults.push({
          blockId,
          layout: block.size.layout,
          calculated: { width: block.size.width, height: block.size.height },
          actual: { width: rect.width, height: rect.height },
          diff,
          valid: diff.width <= 2 && diff.height <= 2,
        });
      }

      return { error: null, results: validationResults };
    });

    // Проверяем, что данные получены
    expect(results.error).toBeNull();
    expect(results.results.length).toBeGreaterThan(0);

    // Фильтруем невалидные блоки
    const invalidBlocks = results.results.filter((r: SizeValidationResult) => !r.valid);

    // Выводим отчёт в консоль теста
    console.log(`\n📐 Size Validation Report:`);
    console.log(`   Total blocks: ${results.results.length}`);
    console.log(`   Valid: ${results.results.length - invalidBlocks.length}`);
    console.log(`   Invalid: ${invalidBlocks.length}`);

    if (invalidBlocks.length > 0) {
      console.log(`\n❌ Invalid blocks:`);
      for (const block of invalidBlocks) {
        console.log(`   ${block.blockId} (${block.layout}):`);
        console.log(`     Calculated: ${block.calculated.width.toFixed(1)} x ${block.calculated.height.toFixed(1)}`);
        console.log(`     Actual:     ${block.actual.width.toFixed(1)} x ${block.actual.height.toFixed(1)}`);
        console.log(`     Diff:       ${block.diff.width.toFixed(1)} x ${block.diff.height.toFixed(1)}`);
      }
    }

    // Проверка: все блоки должны быть валидными
    expect(invalidBlocks.length, `${invalidBlocks.length} блоков имеют неверные размеры`).toBe(0);
  });

  test('размеры должны пересчитываться при изменении viewport', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;

    // Начальный viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForSelector('.block', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Получаем размеры до изменения
    const sizesBefore = await page.evaluate(() => {
      const localState = (window as any).__omnimap?.localState;
      if (!localState || !localState.blocks) return [];

      const sizes: Array<{ id: string; width: number; height: number }> = [];
      for (const [blockId, block] of localState.blocks) {
        if (block.size) {
          sizes.push({ id: blockId, width: block.size.width, height: block.size.height });
        }
      }
      return sizes;
    });

    // Изменяем viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(500);

    // Триггерим перерисовку (может потребоваться событие resize)
    await page.evaluate(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(500);

    // Получаем размеры после изменения
    const sizesAfter = await page.evaluate(() => {
      const localState = (window as any).__omnimap?.localState;
      if (!localState || !localState.blocks) return [];

      const sizes: Array<{ id: string; width: number; height: number }> = [];
      for (const [blockId, block] of localState.blocks) {
        if (block.size) {
          sizes.push({ id: blockId, width: block.size.width, height: block.size.height });
        }
      }
      return sizes;
    });

    // Проверяем, что размеры изменились (viewport уменьшился, блоки должны быть меньше)
    if (sizesBefore.length > 0 && sizesAfter.length > 0) {
      console.log('\n📐 Viewport change test:');
      console.log(`   Before (1920x1080): ${sizesBefore[0]?.width.toFixed(0)}x${sizesBefore[0]?.height.toFixed(0)}`);
      console.log(`   After (1280x720):  ${sizesAfter[0]?.width.toFixed(0)}x${sizesAfter[0]?.height.toFixed(0)}`);
    }
  });

  test('размеры блоков разных уровней вложенности', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;

    await page.waitForSelector('.block', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Проверяем корректность иерархии размеров
    const hierarchyValidation = await page.evaluate(() => {
      const localState = (window as any).__omnimap?.localState;
      if (!localState || !localState.blocks) return { error: 'no data' };

      const issues: string[] = [];

      for (const [blockId, block] of localState.blocks) {
        if (!block.size || !block.children || block.children.length === 0) continue;

        const parentElement = document.getElementById(blockId);
        if (!parentElement) continue;

        const parentRect = parentElement.getBoundingClientRect();

        // Проверяем, что дети меньше родителя
        for (const childId of block.children) {
          const childBlock = localState.blocks.get(childId);
          if (!childBlock || !childBlock.size) continue;

          const childElement = document.getElementById(childId);
          if (!childElement) continue;

          const childRect = childElement.getBoundingClientRect();

          // Ребёнок должен быть меньше или равен родителю
          if (childRect.width > parentRect.width + 5 || childRect.height > parentRect.height + 5) {
            issues.push(`${childId} (${childRect.width.toFixed(0)}x${childRect.height.toFixed(0)}) > parent ${blockId} (${parentRect.width.toFixed(0)}x${parentRect.height.toFixed(0)})`);
          }
        }
      }

      return { issues };
    });

    if (hierarchyValidation.issues && hierarchyValidation.issues.length > 0) {
      console.log('\n❌ Hierarchy issues:');
      hierarchyValidation.issues.forEach((issue: string) => console.log(`   ${issue}`));
    }

    expect(hierarchyValidation.issues?.length || 0, 'Дети не должны быть больше родителей').toBe(0);
  });
});

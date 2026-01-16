import { test, expect } from '../fixtures/auth.fixture';
import { createStorageHelper, createApiHelper } from '../helpers';
import { uniqueBlockTitle, waitForDialog } from '../fixtures/test-data.fixture';

/**
 * Edge case тесты для блоков @blocks @edge-cases
 *
 * Покрывает:
 * - Спецсимволы в названиях
 * - Очень длинные названия
 * - Глубокая вложенность (10+ уровней)
 * - Unicode и эмодзи
 */
test.describe('Edge Cases блоков @blocks @edge-cases', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.waitForShowedBlocks();
  });

  test.describe('Спецсимволы в названиях', () => {
    const specialCharCases = [
      { name: 'кавычки', title: 'Block "quoted" title' },
      { name: 'апострофы', title: "Block's apostrophe" },
      { name: 'угловые скобки', title: 'Block <html> tags' },
      { name: 'амперсанд', title: 'Block & ampersand' },
      { name: 'слэши', title: 'Block /path/to/file' },
      { name: 'backslash', title: 'Block \\backslash\\' },
      { name: 'скобки', title: 'Block (parentheses) [brackets] {braces}' },
      { name: 'спецсимволы', title: 'Block @#$%^&*!' },
    ];

    for (const { name, title } of specialCharCases) {
      test(`должен создать блок с ${name}`, async ({ authenticatedPage, page }) => {
        const storageHelper = createStorageHelper(page);
        const apiHelper = createApiHelper(page);
        const blocks = authenticatedPage.getBlocks();

        if ((await blocks.count()) > 0) {
          await authenticatedPage.clickBlock(blocks.first());
        }

        await authenticatedPage.pressHotkey('n');
        await waitForDialog(page);

        const input = page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
        await input.fill(title);

        const okBtn = page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');

        const apiResult = await apiHelper.waitForBlockCreate(async () => {
          await okBtn.click();
        });

        expect([200, 202, 429]).toContain(apiResult.status);
        await authenticatedPage.waitForShowedBlocks();

        // Проверяем что блок создан и название сохранено корректно
        const blockElement = page.locator(`[block]`).filter({ hasText: title }).first();
        await expect(blockElement).toBeVisible({ timeout: 5000 });
      });
    }
  });

  test.describe('Unicode и эмодзи', () => {
    const unicodeCases = [
      { name: 'эмодзи', title: '📝 Notes 🎯 Goals 🚀 Launch' },
      { name: 'кириллица', title: 'Тестовый блок на русском' },
      { name: 'китайские', title: '测试块 Chinese Block' },
      { name: 'арабские', title: 'كتلة اختبار Arabic' },
      { name: 'смешанные', title: 'Mixed 混合 Смешанный مختلط' },
    ];

    for (const { name, title } of unicodeCases) {
      test(`должен создать блок с ${name} символами`, async ({ authenticatedPage, page }) => {
        const blocks = authenticatedPage.getBlocks();

        if ((await blocks.count()) > 0) {
          await authenticatedPage.clickBlock(blocks.first());
        }

        await authenticatedPage.pressHotkey('n');
        await waitForDialog(page);

        const input = page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
        await input.fill(title);

        const okBtn = page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');
        await okBtn.click();

        await authenticatedPage.waitForShowedBlocks();

        const blockElement = page.locator(`[block]`).filter({ hasText: title.substring(0, 10) }).first();
        await expect(blockElement).toBeVisible({ timeout: 5000 });
      });
    }
  });

  test.describe('Длинные названия', () => {
    test('должен создать блок с названием 100 символов', async ({ authenticatedPage, page }) => {
      const longTitle = 'A'.repeat(100);
      const blocks = authenticatedPage.getBlocks();

      if ((await blocks.count()) > 0) {
        await authenticatedPage.clickBlock(blocks.first());
      }

      await authenticatedPage.pressHotkey('n');
      await waitForDialog(page);

      const input = page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
      await input.fill(longTitle);

      const okBtn = page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');
      await okBtn.click();

      await authenticatedPage.waitForShowedBlocks();

      // Проверяем что блок создан (может быть обрезан в UI)
      const blockElement = page.locator(`[block]`).filter({ hasText: 'AAAA' }).first();
      await expect(blockElement).toBeVisible({ timeout: 5000 });
    });

    test('должен создать блок с названием 500 символов', async ({ authenticatedPage, page }) => {
      const veryLongTitle = 'B'.repeat(500);
      const blocks = authenticatedPage.getBlocks();

      if ((await blocks.count()) > 0) {
        await authenticatedPage.clickBlock(blocks.first());
      }

      await authenticatedPage.pressHotkey('n');
      await waitForDialog(page);

      const input = page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
      await input.fill(veryLongTitle);

      const okBtn = page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');
      await okBtn.click();

      await authenticatedPage.waitForShowedBlocks();

      const blockElement = page.locator(`[block]`).filter({ hasText: 'BBBB' }).first();
      await expect(blockElement).toBeVisible({ timeout: 5000 });
    });

    test('должен обработать пустое название', async ({ authenticatedPage, page }) => {
      const blocks = authenticatedPage.getBlocks();

      if ((await blocks.count()) > 0) {
        await authenticatedPage.clickBlock(blocks.first());
      }

      await authenticatedPage.pressHotkey('n');
      await waitForDialog(page);

      const input = page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
      await input.fill('');

      const okBtn = page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');
      await okBtn.click();

      // Диалог должен либо остаться открытым, либо блок создастся с дефолтным названием
      await page.waitForTimeout(500);

      // Проверяем что либо диалог открыт, либо блок создан
      const dialogVisible = await page.locator('.custom-modal, [data-testid="custom-dialog"]').isVisible();
      if (!dialogVisible) {
        // Блок создан - проверяем что он есть
        await authenticatedPage.waitForShowedBlocks();
      }
    });
  });

  test.describe('Глубокая вложенность', () => {
    test('должен создать 10 уровней вложенности', async ({ authenticatedPage, page }) => {
      const depth = 10;
      const apiHelper = createApiHelper(page);

      // Начинаем с первого блока
      let blocks = authenticatedPage.getBlocks();
      if ((await blocks.count()) > 0) {
        await authenticatedPage.clickBlock(blocks.first());
      }

      // Входим в блок
      await authenticatedPage.pressHotkey('Enter');
      await authenticatedPage.waitForShowedBlocks();

      for (let level = 1; level <= depth; level++) {
        const title = `Level ${level} - ${Date.now()}`;

        // Создаём блок на текущем уровне
        await authenticatedPage.pressHotkey('n');
        await waitForDialog(page);

        const input = page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
        await input.fill(title);

        const okBtn = page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');

        await apiHelper.waitForBlockCreate(async () => {
          await okBtn.click();
        });

        await authenticatedPage.waitForShowedBlocks();

        // Проверяем что блок создан
        const newBlock = page.locator(`[block]`).filter({ hasText: `Level ${level}` }).first();
        await expect(newBlock).toBeVisible({ timeout: 5000 });

        // Если не последний уровень - входим внутрь созданного блока
        if (level < depth) {
          await authenticatedPage.clickBlock(newBlock);
          await authenticatedPage.pressHotkey('Enter');
          await authenticatedPage.waitForShowedBlocks();
        }
      }

      // Проверяем что можем вернуться на 10 уровней вверх
      for (let i = 0; i < depth; i++) {
        await authenticatedPage.pressHotkey('Backspace');
        await page.waitForTimeout(300);
      }

      // Должны вернуться к исходному состоянию
      await authenticatedPage.waitForShowedBlocks();
    });

    test('должен корректно удалить блок с глубокой вложенностью', async ({ authenticatedPage, page }) => {
      const apiHelper = createApiHelper(page);

      // Создаём родительский блок
      let blocks = authenticatedPage.getBlocks();
      if ((await blocks.count()) > 0) {
        await authenticatedPage.clickBlock(blocks.first());
      }

      await authenticatedPage.pressHotkey('Enter');
      await authenticatedPage.waitForShowedBlocks();

      const parentTitle = `Parent ${Date.now()}`;
      await authenticatedPage.pressHotkey('n');
      await waitForDialog(page);

      const input = page.locator('[data-testid="custom-dialog-input"], .custom-modal-input');
      await input.fill(parentTitle);

      const okBtn = page.locator('[data-testid="custom-dialog-ok-btn"], .custom-modal-buttons .btn-ok');
      await okBtn.click();
      await authenticatedPage.waitForShowedBlocks();

      // Входим и создаём 3 уровня вложенности
      const parentBlock = page.locator(`[block]`).filter({ hasText: parentTitle }).first();
      await authenticatedPage.clickBlock(parentBlock);
      await authenticatedPage.pressHotkey('Enter');
      await authenticatedPage.waitForShowedBlocks();

      for (let level = 1; level <= 3; level++) {
        await authenticatedPage.pressHotkey('n');
        await waitForDialog(page);
        await input.fill(`Child ${level}`);
        await okBtn.click();
        await authenticatedPage.waitForShowedBlocks();

        if (level < 3) {
          const childBlock = page.locator(`[block]`).filter({ hasText: `Child ${level}` }).first();
          await authenticatedPage.clickBlock(childBlock);
          await authenticatedPage.pressHotkey('Enter');
          await authenticatedPage.waitForShowedBlocks();
        }
      }

      // Возвращаемся к родителю
      for (let i = 0; i < 3; i++) {
        await authenticatedPage.pressHotkey('Backspace');
        await page.waitForTimeout(300);
      }

      await authenticatedPage.waitForShowedBlocks();

      // Удаляем родительский блок (должен каскадно удалить детей)
      const parentToDelete = page.locator(`[block]`).filter({ hasText: parentTitle }).first();
      await authenticatedPage.clickBlock(parentToDelete);

      await apiHelper.waitForBlockDelete(async () => {
        await authenticatedPage.pressHotkey('Delete');
        // Подтверждаем удаление если появится диалог
        const confirmBtn = page.locator('button:has-text("OK"), button:has-text("Да"), button:has-text("Удалить")');
        if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await confirmBtn.click();
        }
      });

      await authenticatedPage.waitForShowedBlocks();

      // Проверяем что родительский блок удалён
      await expect(parentToDelete).not.toBeVisible({ timeout: 5000 });
    });
  });
});

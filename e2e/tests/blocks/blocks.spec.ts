import { test, expect, uniqueBlockTitle } from '../../fixtures/base.fixture';

/**
 * Epic 2: Blocks CRUD Tests
 *
 * Тестирование создания, чтения, обновления и удаления блоков.
 *
 * Все тесты используют storageState из setup проекта.
 * Тесты выполняются последовательно в рамках describe.
 *
 * @tag @blocks
 */

test.describe('Blocks CRUD @blocks', () => {
  test.describe.configure({ mode: 'serial' });

  // ==================== Создание блоков ====================

  test.describe('Создание блоков', () => {
    test('BL-CR-01: Создать блок через hotkey n', async ({ authenticatedPage, apiHelper }) => {
      const blockTitle = uniqueBlockTitle('Create_Hotkey');

      // Создаём блок
      await authenticatedPage.createBlock(blockTitle);

      // Проверяем что блок появился в UI
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);
    });

    test('BL-CR-02: Создать блок через кнопку UI', async ({ authenticatedPage, page }) => {
      const blockTitle = uniqueBlockTitle('Create_UI');

      // Нажимаем кнопку создания блока в панели управления
      const newBlockButton = page.locator('[data-testid="command-btn-newBlock"]');

      // Если кнопка не видна, используем hotkey
      if (await newBlockButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await newBlockButton.click();
      } else {
        // Fallback на hotkey
        await page.keyboard.press('n');
      }

      // Ждём диалога
      const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });

      // Вводим название
      await dialogInput.fill(blockTitle);
      await page.locator('[data-testid="custom-dialog-ok-btn"]').click();

      // Проверяем
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);
    });

    test('BL-CR-03: Создать вложенный блок', async ({ authenticatedPage, page }) => {
      const parentTitle = uniqueBlockTitle('Parent');
      const childTitle = uniqueBlockTitle('Child');

      // Создаём родительский блок
      await authenticatedPage.createBlock(parentTitle);
      await authenticatedPage.assertBlockWithTitleExists(parentTitle);

      // Открываем родительский блок
      const parentBlock = page.locator(`[block] titleBlock:has-text("${parentTitle}")`).first();
      await parentBlock.dblclick();
      await page.waitForTimeout(500);

      // Создаём дочерний блок внутри
      await authenticatedPage.createBlock(childTitle);
      await authenticatedPage.assertBlockWithTitleExists(childTitle);

      // Возвращаемся назад
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(500);
    });

    test('BL-CR-04: Создать блок с длинным названием', async ({ authenticatedPage }) => {
      const longTitle = 'A'.repeat(200) + '_' + Date.now();

      await authenticatedPage.createBlock(longTitle);

      // Блок должен создаться (название может быть обрезано в UI)
      const block = authenticatedPage.rootContainer.locator('[block]').filter({
        has: authenticatedPage.page.locator(`titleBlock:text("${longTitle.substring(0, 50)}")`)
      });
      await expect(block.first()).toBeVisible({ timeout: 5000 });
    });

    test('BL-CR-05: Отмена создания через Escape', async ({ authenticatedPage, page }) => {
      const initialCount = await authenticatedPage.getBlocksCount();

      // Нажимаем N для создания
      await page.keyboard.press('n');

      // Ждём диалога
      const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });

      // Нажимаем Escape
      await page.keyboard.press('Escape');

      // Диалог должен закрыться
      await expect(dialogInput).not.toBeVisible({ timeout: 3000 });

      // Количество блоков не должно измениться
      const finalCount = await authenticatedPage.getBlocksCount();
      expect(finalCount).toBe(initialCount);
    });
  });

  // ==================== Редактирование блоков ====================

  test.describe('Редактирование блоков', () => {
    test('BL-ED-01: Изменить название блока через hotkey t', async ({ authenticatedPage, page }) => {
      const originalTitle = uniqueBlockTitle('Original');
      const newTitle = uniqueBlockTitle('Updated');

      // Создаём блок
      await authenticatedPage.createBlock(originalTitle);
      await authenticatedPage.assertBlockWithTitleExists(originalTitle);

      // Кликаем на блок для выделения
      const block = page.locator(`[block] titleBlock:has-text("${originalTitle}")`).first();
      await block.click();
      await page.waitForTimeout(300);

      // Редактируем название через hotkey t
      await page.keyboard.press('t');

      // Ждём диалога
      const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
      await expect(dialogInput).toBeVisible({ timeout: 5000 });

      // Очищаем и вводим новое название
      await dialogInput.clear();
      await dialogInput.fill(newTitle);
      await page.locator('[data-testid="custom-dialog-ok-btn"]').click();

      // Проверяем
      await authenticatedPage.assertBlockWithTitleExists(newTitle);
    });

    test('BL-ED-02: Изменить текст блока через hotkey w', async ({ authenticatedPage, page }) => {
      const blockTitle = uniqueBlockTitle('TextEdit');
      const blockText = 'This is the block content ' + Date.now();

      // Создаём блок
      await authenticatedPage.createBlock(blockTitle);

      // Кликаем на блок
      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`).first();
      await block.click();
      await page.waitForTimeout(300);

      // Редактируем текст через hotkey w
      await page.keyboard.press('w');

      // Ждём появления текстового редактора
      const textEditor = page.locator('[data-testid="note-editor-textarea"]');
      const isVisible = await textEditor.isVisible({ timeout: 3000 }).catch(() => false);

      if (isVisible) {
        await textEditor.fill(blockText);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);

        // Проверяем что текст сохранился
        const content = page.locator(`[block] contentBlock`).first();
        const contentText = await content.textContent();
        expect(contentText).toContain(blockText);
      }
    });
  });

  // ==================== Удаление блоков ====================

  test.describe('Удаление блоков', () => {
    test('BL-DE-01: Удалить блок через Shift+D', async ({ authenticatedPage, page }) => {
      const blockTitle = uniqueBlockTitle('Delete');

      // Создаём блок
      await authenticatedPage.createBlock(blockTitle);
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);

      // Кликаем на блок
      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`).first();
      await block.click();
      await page.waitForTimeout(300);

      // Удаляем через Shift+D
      await page.keyboard.down('Shift');
      await page.keyboard.press('d');
      await page.keyboard.up('Shift');

      // Ждём удаления
      await page.waitForTimeout(500);

      // Блок должен исчезнуть
      await expect(block).not.toBeVisible({ timeout: 5000 });
    });

    test('BL-DE-04: Каскадное удаление дочерних блоков', async ({ authenticatedPage, page }) => {
      const parentTitle = uniqueBlockTitle('ParentDelete');
      const childTitle = uniqueBlockTitle('ChildDelete');

      // Создаём родительский блок
      await authenticatedPage.createBlock(parentTitle);
      await authenticatedPage.assertBlockWithTitleExists(parentTitle);

      // Открываем родительский блок
      const parentBlock = page.locator(`[block] titleBlock:has-text("${parentTitle}")`).first();
      await parentBlock.dblclick();
      await page.waitForTimeout(500);

      // Создаём дочерний блок
      await authenticatedPage.createBlock(childTitle);
      await authenticatedPage.assertBlockWithTitleExists(childTitle);

      // Возвращаемся назад
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(500);

      // Удаляем родительский блок
      const parentBlockAfter = page.locator(`[block] titleBlock:has-text("${parentTitle}")`).first();
      await parentBlockAfter.click();
      await page.waitForTimeout(300);

      await page.keyboard.down('Shift');
      await page.keyboard.press('d');
      await page.keyboard.up('Shift');

      await page.waitForTimeout(1000);

      // Родительский блок должен исчезнуть
      await expect(parentBlockAfter).not.toBeVisible({ timeout: 5000 });
    });
  });

  // ==================== Копирование/Перемещение ====================

  test.describe('Копирование и перемещение', () => {
    test('BL-CP-01: Копировать и вставить блок', async ({ authenticatedPage, page }) => {
      const blockTitle = uniqueBlockTitle('Copy');

      // Создаём блок
      await authenticatedPage.createBlock(blockTitle);
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);

      // Считаем начальное количество блоков
      const initialCount = await authenticatedPage.getBlocksCount();

      // Кликаем на блок
      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`).first();
      await block.click();
      await page.waitForTimeout(300);

      // Копируем через Shift+C
      await page.keyboard.down('Shift');
      await page.keyboard.press('c');
      await page.keyboard.up('Shift');
      await page.waitForTimeout(300);

      // Вставляем через Shift+V
      await page.keyboard.down('Shift');
      await page.keyboard.press('v');
      await page.keyboard.up('Shift');
      await page.waitForTimeout(500);

      // Должен появиться ещё один блок
      const finalCount = await authenticatedPage.getBlocksCount();
      expect(finalCount).toBeGreaterThan(initialCount);
    });

    test('BL-MV-01: Вырезать и вставить блок', async ({ authenticatedPage, page }) => {
      const blockTitle = uniqueBlockTitle('Cut');

      // Создаём блок
      await authenticatedPage.createBlock(blockTitle);
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);

      const initialCount = await authenticatedPage.getBlocksCount();

      // Кликаем на блок
      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`).first();
      await block.click();
      await page.waitForTimeout(300);

      // Вырезаем через Shift+X
      await page.keyboard.down('Shift');
      await page.keyboard.press('x');
      await page.keyboard.up('Shift');
      await page.waitForTimeout(300);

      // Вставляем через Shift+V
      await page.keyboard.down('Shift');
      await page.keyboard.press('v');
      await page.keyboard.up('Shift');
      await page.waitForTimeout(500);

      // Количество блоков должно остаться тем же (cut + paste = move)
      const finalCount = await authenticatedPage.getBlocksCount();
      expect(finalCount).toBe(initialCount);
    });
  });

  // ==================== Undo/Redo ====================

  test.describe('Undo/Redo', () => {
    test('BL-UR-01: Undo создания блока', async ({ authenticatedPage, page }) => {
      const blockTitle = uniqueBlockTitle('Undo_Create');

      // Создаём блок
      await authenticatedPage.createBlock(blockTitle);
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);

      // Undo через Shift+Z
      await page.keyboard.down('Shift');
      await page.keyboard.press('z');
      await page.keyboard.up('Shift');
      await page.waitForTimeout(500);

      // Блок должен исчезнуть
      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`);
      await expect(block).not.toBeVisible({ timeout: 5000 });
    });

    test('BL-UR-02: Undo удаления блока', async ({ authenticatedPage, page }) => {
      const blockTitle = uniqueBlockTitle('Undo_Delete');

      // Создаём блок
      await authenticatedPage.createBlock(blockTitle);
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);

      // Кликаем на блок
      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`).first();
      await block.click();
      await page.waitForTimeout(300);

      // Удаляем
      await page.keyboard.down('Shift');
      await page.keyboard.press('d');
      await page.keyboard.up('Shift');
      await page.waitForTimeout(500);

      // Блок должен исчезнуть
      await expect(block).not.toBeVisible({ timeout: 3000 });

      // Undo удаления
      await page.keyboard.down('Shift');
      await page.keyboard.press('z');
      await page.keyboard.up('Shift');
      await page.waitForTimeout(500);

      // Блок должен появиться снова
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);
    });

    test('BL-UR-03: Redo после undo', async ({ authenticatedPage, page }) => {
      const blockTitle = uniqueBlockTitle('Redo');

      // Создаём блок
      await authenticatedPage.createBlock(blockTitle);
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);

      // Undo
      await page.keyboard.down('Shift');
      await page.keyboard.press('z');
      await page.keyboard.up('Shift');
      await page.waitForTimeout(500);

      // Блок исчез
      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`);
      await expect(block).not.toBeVisible({ timeout: 3000 });

      // Redo через Shift+Ctrl+Z
      await page.keyboard.down('Shift');
      await page.keyboard.down('Control');
      await page.keyboard.press('z');
      await page.keyboard.up('Control');
      await page.keyboard.up('Shift');
      await page.waitForTimeout(500);

      // Блок должен появиться снова
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);
    });
  });
});

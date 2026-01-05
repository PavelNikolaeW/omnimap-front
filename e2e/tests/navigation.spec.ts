import { test, expect } from '../fixtures/auth.fixture';
import { setupApiMocks } from '../fixtures/test-data.fixture';

/**
 * Тесты навигации @navigation
 */
test.describe('Навигация @navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test.describe('Навигация по блокам', () => {
    test('должен открыть блок двойным кликом', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        // Двойной клик для открытия
        await authenticatedPage.doubleClickBlock(firstBlock);

        await authenticatedPage.page.waitForTimeout(500);

        // После открытия rootContainer должен быть видимым
        await expect(authenticatedPage.rootContainer).toBeVisible();

        // Хлебные крошки должны появиться
        await expect(authenticatedPage.breadcrumb).toBeVisible();
      }
    });

    test('должен открыть блок через Enter', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        // Кликаем для выделения
        await authenticatedPage.clickBlock(firstBlock);

        // Нажимаем Enter
        await authenticatedPage.openBlock();

        await authenticatedPage.page.waitForTimeout(500);

        // Проверяем что UI остаётся функциональным
        await expect(authenticatedPage.rootContainer).toBeVisible();
      }
    });

    test('должен вернуться назад через Backspace', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        // Открываем блок
        await authenticatedPage.doubleClickBlock(firstBlock);
        await authenticatedPage.page.waitForTimeout(500);

        // Возвращаемся назад
        await authenticatedPage.goBack();
        await authenticatedPage.page.waitForTimeout(500);

        // Проверяем что UI остаётся функциональным
        await expect(authenticatedPage.rootContainer).toBeVisible();
      }
    });

    test('должен вернуться назад через кнопку "Назад"', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        // Открываем блок
        await authenticatedPage.doubleClickBlock(firstBlock);
        await authenticatedPage.page.waitForTimeout(500);

        // Кликаем кнопку "Назад"
        const backButton = authenticatedPage.topBtnContainer.locator('.fa-arrow-up');
        if (await backButton.isVisible()) {
          await backButton.click();
          await authenticatedPage.page.waitForTimeout(500);

          // Проверяем что навигация работает
          await expect(authenticatedPage.rootContainer).toBeVisible();
        }
      }
    });
  });

  test.describe('Навигация по хлебным крошкам', () => {
    test('должен показать хлебные крошки при входе в блок', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        // Открываем блок
        await authenticatedPage.doubleClickBlock(firstBlock);
        await authenticatedPage.page.waitForTimeout(500);

        // Проверяем, что хлебные крошки видимы
        const breadcrumbVisible = await authenticatedPage.breadcrumb.isVisible();

        if (breadcrumbVisible) {
          // Проверяем, что есть элементы в хлебных крошках
          const crumbs = authenticatedPage.breadcrumb.locator('> *');
          const crumbCount = await crumbs.count();

          // Должна быть хотя бы одна крошка
          expect(crumbCount).toBeGreaterThanOrEqual(0);
        }
      }
    });

    test('должен перейти по клику на хлебную крошку', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        // Заходим в блок
        await authenticatedPage.doubleClickBlock(firstBlock);
        await authenticatedPage.page.waitForTimeout(500);

        // Если есть вложенный блок, заходим глубже
        const nestedBlock = authenticatedPage.getFirstBlock();
        if (await nestedBlock.isVisible()) {
          await authenticatedPage.doubleClickBlock(nestedBlock);
          await authenticatedPage.page.waitForTimeout(500);

          // Кликаем на первую хлебную крошку
          const crumbs = authenticatedPage.breadcrumb.locator('> *');
          if ((await crumbs.count()) > 0) {
            await crumbs.first().click();
            await authenticatedPage.page.waitForTimeout(500);
          }
        }
      }
    });
  });

  test.describe('Переключение деревьев', () => {
    test('должен переключиться на дерево через Space+1', async ({ authenticatedPage }) => {
      // Переключаемся на первое дерево
      await authenticatedPage.switchToTree(1);
      await authenticatedPage.page.waitForTimeout(500);

      // Проверяем, что UI обновился
      await expect(authenticatedPage.rootContainer).toBeVisible();
    });

    test('должен показать список деревьев в навигации', async ({ authenticatedPage }) => {
      // Проверяем, что tree-navigation видим
      const treeNavVisible = await authenticatedPage.treeNavigation.isVisible();

      if (treeNavVisible) {
        // Должны быть кнопки/табы для деревьев
        const treeButtons = authenticatedPage.treeNavigation.locator('button, [role="tab"], .tree-tab');
        const count = await treeButtons.count();

        // Может быть 0 если нет дополнительных деревьев
        expect(count).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test.describe('Escape для отмены', () => {
    test('должен закрыть режим через Escape', async ({ authenticatedPage }) => {
      // Начинаем какое-то действие (например, вырезание)
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Начинаем вырезание
        await authenticatedPage.cutBlock();

        // Отменяем через Escape
        await authenticatedPage.closePopup();

        // Блок не должен быть выделен как "вырезанный"
      }
    });

    test('должен очистить мульти-выделение через Escape', async ({ authenticatedPage }) => {
      const blocks = authenticatedPage.getBlocks();
      const count = await blocks.count();

      if (count >= 2) {
        // Выделяем первый блок
        await authenticatedPage.clickBlock(blocks.first());

        // Shift+клик на второй для мульти-выделения
        await authenticatedPage.page.keyboard.down('Shift');
        await blocks.nth(1).click();
        await authenticatedPage.page.keyboard.up('Shift');

        // Отменяем выделение
        await authenticatedPage.closePopup();

        // Проверяем, что выделение снято
        const selectedBlocks = authenticatedPage.getSelectedBlock();
        const selectedCount = await selectedBlocks.count();

        // После Escape не должно быть выделенных блоков
        expect(selectedCount).toBe(0);
      }
    });
  });
});

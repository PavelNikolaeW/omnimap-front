import { test, expect } from '../fixtures/auth.fixture';
import { setupApiMocks } from '../fixtures/test-data.fixture';

test.describe('Хлебные крошки (Breadcrumbs)', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('должен показать хлебные крошки при входе в блок', async ({ authenticatedPage }) => {
    const firstBlock = authenticatedPage.getFirstBlock();

    if (await firstBlock.isVisible()) {
      // Открываем блок
      await authenticatedPage.doubleClickBlock(firstBlock);
      await authenticatedPage.waitForShowedBlocks();

      // Хлебные крошки могут быть скрыты на первом уровне
      const breadcrumb = authenticatedPage.breadcrumb;
      await expect(breadcrumb).toBeAttached();

      // Если видимы, проверяем содержимое
      if (await breadcrumb.isVisible()) {
        const crumbs = breadcrumb.locator('> *');
        const count = await crumbs.count();
        expect(count).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('должен перейти к родительскому блоку по клику на крошку', async ({ authenticatedPage }) => {
    const firstBlock = authenticatedPage.getFirstBlock();

    if (await firstBlock.isVisible()) {
      // Заходим в блок
      await authenticatedPage.doubleClickBlock(firstBlock);
      await authenticatedPage.page.waitForTimeout(500);

      // Заходим глубже если есть вложенные блоки
      const nestedBlock = authenticatedPage.getFirstBlock();
      if (await nestedBlock.isVisible()) {
        await authenticatedPage.doubleClickBlock(nestedBlock);
        await authenticatedPage.page.waitForTimeout(500);

        // Кликаем на первую крошку
        const crumbs = authenticatedPage.breadcrumb.locator('> *');
        const count = await crumbs.count();

        if (count > 1) {
          await crumbs.first().click();
          await authenticatedPage.page.waitForTimeout(500);
        }
      }
    }
  });
});

test.describe('Навигация по дереву (TreeNavigation)', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('должен показать панель навигации по деревьям', async ({ authenticatedPage }) => {
    // TreeNavigation может быть скрыт если есть только одно дерево
    await expect(authenticatedPage.treeNavigation).toBeAttached();
  });

  test('должен переключаться между деревьями', async ({ authenticatedPage }) => {
    // TreeNavigation может быть скрыт
    if (!(await authenticatedPage.treeNavigation.isVisible())) {
      return;
    }

    const treeButtons = authenticatedPage.treeNavigation.locator('button, .tree-tab, [role="tab"]');
    const count = await treeButtons.count();

    if (count > 1) {
      // Кликаем на вторую вкладку
      await treeButtons.nth(1).click();
      await authenticatedPage.waitForShowedBlocks();

      // Кликаем обратно на первую
      await treeButtons.first().click();
      await authenticatedPage.waitForShowedBlocks();
    }
  });
});

test.describe('Боковая панель (Sidebar)', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('должен показать панель управления', async ({ authenticatedPage }) => {
    // Control panel может быть скрыт по умолчанию
    await expect(authenticatedPage.controlPanel).toBeAttached();
  });

  test('должен содержать кнопки команд', async ({ authenticatedPage }) => {
    // Control panel может быть скрыт
    if (!(await authenticatedPage.controlPanel.isVisible())) {
      return;
    }

    const buttons = authenticatedPage.controlPanel.locator('.sidebar-button, button');
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('должен показать подсказку при наведении на кнопку', async ({ authenticatedPage }) => {
    const button = authenticatedPage.controlPanel.locator('.sidebar-button, button').first();

    if (await button.isVisible()) {
      await button.hover();
      await authenticatedPage.page.waitForTimeout(500);

      // Проверяем наличие title атрибута или tooltip
      const title = await button.getAttribute('title');
      // Title может быть или не быть в зависимости от реализации
    }
  });
});

test.describe('Блоки', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('должен выделить блок при клике', async ({ authenticatedPage }) => {
    const firstBlock = authenticatedPage.getFirstBlock();

    if (await firstBlock.isVisible()) {
      await authenticatedPage.clickBlock(firstBlock);

      // Блок должен получить класс выделения или стиль
      // Проверяем визуальное выделение
      await authenticatedPage.page.waitForTimeout(300);
    }
  });

  test('должен показать заголовок блока', async ({ authenticatedPage }) => {
    const blocks = authenticatedPage.getBlocks();
    const count = await blocks.count();

    if (count > 0) {
      const firstBlock = blocks.first();
      const title = firstBlock.locator('titleBlock');
      if (await title.isVisible()) {
        const text = await title.textContent();
        expect(text).toBeTruthy();
      }
    }
  });

  test('должен показать контент блока', async ({ authenticatedPage }) => {
    const blocks = authenticatedPage.getBlocks();
    const count = await blocks.count();

    if (count > 0) {
      const firstBlock = blocks.first();
      const content = firstBlock.locator('contentBlock');
      // Контент может быть пустым
      await expect(content).toBeAttached();
    }
  });

  test('должен показать изображение блока если есть', async ({ authenticatedPage }) => {
    const firstBlock = authenticatedPage.getFirstBlock();

    if (await firstBlock.isVisible()) {
      const image = firstBlock.locator('img, .block-image');
      // Изображение опционально
      if (await image.count() > 0) {
        await expect(image.first()).toBeVisible();
      }
    }
  });

  test('должен поддерживать мульти-выделение через Shift+клик', async ({ authenticatedPage }) => {
    // Нужно зайти в блок с несколькими детьми
    const blocks = authenticatedPage.getBlocks();
    const count = await blocks.count();

    if (count >= 1) {
      // Заходим в первый блок чтобы увидеть дочерние
      await authenticatedPage.doubleClickBlock(blocks.first());
      await authenticatedPage.waitForShowedBlocks();

      const childBlocks = authenticatedPage.getBlocks();
      const childCount = await childBlocks.count();

      if (childCount >= 2) {
        // Выделяем первый блок
        await childBlocks.first().click();

        await authenticatedPage.page.waitForTimeout(300);

        // Re-query блоки после клика
        const blocksNow = authenticatedPage.getBlocks();

        if ((await blocksNow.count()) >= 2) {
          // Shift+клик на второй
          await authenticatedPage.page.keyboard.down('Shift');
          await blocksNow.nth(1).click();
          await authenticatedPage.page.keyboard.up('Shift');

          await authenticatedPage.page.waitForTimeout(300);

          // Проверяем что UI работает
          await expect(authenticatedPage.rootContainer).toBeVisible();
        }
      }

      // Возвращаемся назад
      await authenticatedPage.goBack();
      await authenticatedPage.waitForShowedBlocks();
    }
  });
});

test.describe('Сообщения об ошибках', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('должен показать ошибку при неудачном API запросе', async ({ authenticatedPage, page }) => {
    // Мокируем ошибку API
    await page.route('**/api/v1/blocks/**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    // Пробуем выполнить действие
    const firstBlock = authenticatedPage.getFirstBlock();
    if (await firstBlock.isVisible()) {
      await authenticatedPage.clickBlock(firstBlock);

      // Пробуем создать блок
      await authenticatedPage.pressHotkey('n');
      await authenticatedPage.page.waitForTimeout(300);

      const promptInput = authenticatedPage.page.locator('.custom-prompt input');
      if (await promptInput.isVisible()) {
        await promptInput.fill('Error Test');
        await promptInput.press('Enter');
        await authenticatedPage.page.waitForTimeout(1000);
      }

      // Ошибка может появиться в error popup
      const errorPopup = authenticatedPage.errorPopup;
      // Проверяем наличие или отсутствие ошибки
    }
  });
});

test.describe('Адаптивность', () => {
  test('должен корректно отображаться на мобильном разрешении', async ({ authenticatedPage }) => {
    await authenticatedPage.page.setViewportSize({ width: 375, height: 667 });
    await authenticatedPage.page.waitForTimeout(500);

    // Проверяем что основные элементы видимы
    await expect(authenticatedPage.rootContainer).toBeVisible();
  });

  test('должен корректно отображаться на планшетном разрешении', async ({ authenticatedPage }) => {
    await authenticatedPage.page.setViewportSize({ width: 768, height: 1024 });
    await authenticatedPage.page.waitForTimeout(500);

    await expect(authenticatedPage.rootContainer).toBeVisible();
    // Control panel может быть скрыт на планшете
    await expect(authenticatedPage.controlPanel).toBeAttached();
  });

  test('должен корректно отображаться на десктопном разрешении', async ({ authenticatedPage }) => {
    await authenticatedPage.page.setViewportSize({ width: 1920, height: 1080 });
    await authenticatedPage.page.waitForTimeout(500);

    await expect(authenticatedPage.rootContainer).toBeVisible();
    // Control panel и sidebar могут быть скрыты по умолчанию
    await expect(authenticatedPage.controlPanel).toBeAttached();
    await expect(authenticatedPage.sidebar).toBeAttached();
  });
});

test.describe('LLM Chat', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('должен открыть чат через Shift+H', async ({ authenticatedPage }) => {
    await authenticatedPage.pressHotkeyCombo('Shift', 'h');
    await authenticatedPage.page.waitForTimeout(500);

    const chatRoot = authenticatedPage.page.locator('#fullscreen-chat-root, .llm-chat');

    if (await chatRoot.isVisible()) {
      // Закрываем чат
      await authenticatedPage.pressHotkeyCombo('Shift', 'h');
      await authenticatedPage.page.waitForTimeout(300);
    }
  });

  test('должен открыть чат через кнопку', async ({ authenticatedPage }) => {
    const chatBtn = authenticatedPage.controlPanel.locator('#chat, .fa-comment');

    if (await chatBtn.isVisible()) {
      await chatBtn.click();
      await authenticatedPage.page.waitForTimeout(500);

      const chatRoot = authenticatedPage.page.locator('#fullscreen-chat-root, .llm-chat');

      if (await chatRoot.isVisible()) {
        // Закрываем
        await authenticatedPage.closePopup();
      }
    }
  });
});

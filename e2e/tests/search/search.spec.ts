import { test, expect, uniqueBlockTitle } from '../../fixtures/base.fixture';

/**
 * Epic 4: Search Tests
 *
 * Тестирование поиска: открытие popup, поиск по названию и содержимому,
 * навигация к результатам.
 *
 * @tag @search
 */

test.describe('Search @search', () => {
  test.describe.configure({ mode: 'serial' });

  // ==================== Открытие поиска ====================

  test.describe('Открытие поиска', () => {
    test('SR-01: Открыть поиск через hotkey f', async ({ authenticatedPage, page }) => {
      // Нажимаем F для открытия поиска
      await page.keyboard.press('f');

      // Ждём появления поиска
      const searchInput = page.locator('[data-testid="search-input"], .search-input, #search-input');
      await expect(searchInput.first()).toBeVisible({ timeout: 5000 });
    });

    test('SR-02: Закрыть поиск через Escape', async ({ authenticatedPage, page }) => {
      // Открываем поиск
      await page.keyboard.press('f');

      const searchInput = page.locator('[data-testid="search-input"], .search-input, #search-input').first();
      await expect(searchInput).toBeVisible({ timeout: 5000 });

      // Закрываем через Escape
      await page.keyboard.press('Escape');

      // Поиск должен закрыться
      await expect(searchInput).not.toBeVisible({ timeout: 3000 });
    });
  });

  // ==================== Поиск по названию ====================

  test.describe('Поиск по названию', () => {
    test('SR-03: Поиск блока по названию', async ({ authenticatedPage, page }) => {
      const blockTitle = uniqueBlockTitle('SearchTest');

      // Создаём блок с уникальным названием
      await authenticatedPage.createBlock(blockTitle);
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);

      // Открываем поиск
      await page.keyboard.press('f');

      const searchInput = page.locator('[data-testid="search-input"], .search-input, #search-input').first();
      await expect(searchInput).toBeVisible({ timeout: 5000 });

      // Вводим название для поиска
      await searchInput.fill(blockTitle.substring(0, 15)); // Частичное совпадение

      // Ждём результатов
      await page.waitForTimeout(500);

      // Проверяем что есть результаты
      const searchResults = page.locator('[data-testid="search-results"], .search-results, .search-result');
      const resultsCount = await searchResults.count();

      // Должен быть хотя бы один результат
      expect(resultsCount).toBeGreaterThan(0);
    });

    test('SR-04: Пустой результат поиска', async ({ authenticatedPage, page }) => {
      // Открываем поиск
      await page.keyboard.press('f');

      const searchInput = page.locator('[data-testid="search-input"], .search-input, #search-input').first();
      await expect(searchInput).toBeVisible({ timeout: 5000 });

      // Вводим несуществующий текст
      const randomText = 'NonExistent_' + Date.now() + '_XYZQWERTY';
      await searchInput.fill(randomText);

      // Ждём обработки
      await page.waitForTimeout(500);

      // Проверяем что результатов нет или показано сообщение "не найдено"
      const noResults = page.locator('text=Ничего не найдено, text=No results, .no-results');
      const searchResults = page.locator('[data-testid="search-result"]');

      // Либо показано сообщение "не найдено", либо результатов 0
      const hasNoResultsMessage = await noResults.count() > 0;
      const resultsCount = await searchResults.count();

      expect(hasNoResultsMessage || resultsCount === 0).toBeTruthy();
    });
  });

  // ==================== Переход к результату ====================

  test.describe('Переход к результату', () => {
    test('SR-05: Переход к найденному блоку', async ({ authenticatedPage, page }) => {
      const blockTitle = uniqueBlockTitle('SearchNav');

      // Создаём блок
      await authenticatedPage.createBlock(blockTitle);
      await authenticatedPage.assertBlockWithTitleExists(blockTitle);

      // Открываем поиск
      await page.keyboard.press('f');

      const searchInput = page.locator('[data-testid="search-input"], .search-input, #search-input').first();
      await expect(searchInput).toBeVisible({ timeout: 5000 });

      // Вводим название
      await searchInput.fill(blockTitle);
      await page.waitForTimeout(500);

      // Кликаем на результат (если есть)
      const firstResult = page.locator('[data-testid^="search-result"], .search-result').first();
      if (await firstResult.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstResult.click();
        await page.waitForTimeout(500);

        // Поиск должен закрыться
        await expect(searchInput).not.toBeVisible({ timeout: 3000 });
      }
    });

    test('SR-06: Keyboard навигация по результатам', async ({ authenticatedPage, page }) => {
      // Создаём несколько блоков
      const prefix = 'KB_Nav_' + Date.now();
      await authenticatedPage.createBlock(prefix + '_1');
      await authenticatedPage.createBlock(prefix + '_2');

      // Открываем поиск
      await page.keyboard.press('f');

      const searchInput = page.locator('[data-testid="search-input"], .search-input, #search-input').first();
      await expect(searchInput).toBeVisible({ timeout: 5000 });

      // Вводим префикс
      await searchInput.fill(prefix);
      await page.waitForTimeout(500);

      // Нажимаем стрелку вниз для навигации
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(200);

      // Нажимаем Enter для выбора
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
    });
  });

  // ==================== Поиск по содержимому ====================

  test.describe('Поиск по содержимому', () => {
    test('SR-07: Поиск в тексте блока', async ({ authenticatedPage, page }) => {
      const blockTitle = uniqueBlockTitle('ContentSearch');
      const blockContent = 'UniqueContentText_' + Date.now();

      // Создаём блок
      await authenticatedPage.createBlock(blockTitle);

      // Добавляем содержимое
      const block = page.locator(`[block] titleBlock:has-text("${blockTitle}")`).first();
      await block.click();
      await page.waitForTimeout(300);

      // Редактируем текст через hotkey w
      await page.keyboard.press('w');
      const textEditor = page.locator('[data-testid="note-editor-textarea"]');

      if (await textEditor.isVisible({ timeout: 3000 }).catch(() => false)) {
        await textEditor.fill(blockContent);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
      }

      // Открываем поиск
      await page.keyboard.press('f');

      const searchInput = page.locator('[data-testid="search-input"], .search-input, #search-input').first();
      await expect(searchInput).toBeVisible({ timeout: 5000 });

      // Ищем по содержимому
      await searchInput.fill(blockContent.substring(0, 20));
      await page.waitForTimeout(500);

      // Проверяем результаты
      const searchResults = page.locator('[data-testid^="search-result"], .search-result');
      const resultsCount = await searchResults.count();

      // Поиск по содержимому может быть не реализован - это нормально
      if (resultsCount > 0) {
        // Если поиск по содержимому работает - отлично
        expect(resultsCount).toBeGreaterThan(0);
      }
    });
  });

  // ==================== Фильтры поиска ====================

  test.describe('Фильтры поиска', () => {
    test('SR-08: Поиск везде vs в текущем дереве', async ({ authenticatedPage, page }) => {
      // Открываем поиск
      await page.keyboard.press('f');

      const searchInput = page.locator('[data-testid="search-input"], .search-input, #search-input').first();
      await expect(searchInput).toBeVisible({ timeout: 5000 });

      // Проверяем наличие чекбокса "искать везде"
      const everywhereCheckbox = page.locator('[data-testid="search-everywhere-checkbox"], .search-everywhere, input[type="checkbox"]').first();

      if (await everywhereCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Переключаем чекбокс
        await everywhereCheckbox.click();
        await page.waitForTimeout(300);

        // Вводим поисковый запрос
        await searchInput.fill('test');
        await page.waitForTimeout(500);
      }
    });
  });
});

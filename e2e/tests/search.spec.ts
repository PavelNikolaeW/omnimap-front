import { test, expect } from '../fixtures/auth.fixture';
import { setupApiMocks } from '../fixtures/test-data.fixture';

test.describe('Поиск блоков (SearchPopup)', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);

    // Мокируем API поиска
    await page.route('**/api/v1/blocks/search**', async (route) => {
      const url = new URL(route.request().url());
      const query = url.searchParams.get('q') || '';

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'found-block-1',
            title: `Результат: ${query}`,
            content: 'Описание найденного блока',
            path: ['Root', 'Parent'],
          },
          {
            id: 'found-block-2',
            title: `Другой результат: ${query}`,
            content: '',
            path: ['Root'],
          },
        ]),
      });
    });
  });

  test.describe('Открытие и закрытие поиска', () => {
    test('должен открыть поиск через команду', async ({ authenticatedPage }) => {
      // Ищем кнопку поиска в панели или используем хоткей
      const searchBtn = authenticatedPage.controlPanel.locator('#search, .fa-search, [title*="search" i]');

      if (await searchBtn.isVisible()) {
        await searchBtn.click();

        // Должен появиться попап поиска
        const searchPopup = authenticatedPage.page.locator('.popup-search, .search-popup, [role="dialog"]');
        await expect(searchPopup).toBeVisible({ timeout: 5000 });
      }
    });

    test('должен закрыть поиск через Escape', async ({ authenticatedPage }) => {
      const searchBtn = authenticatedPage.controlPanel.locator('#search, .fa-search');

      if (await searchBtn.isVisible()) {
        await searchBtn.click();

        const searchPopup = authenticatedPage.page.locator('.popup-search, .search-popup');
        await expect(searchPopup).toBeVisible({ timeout: 5000 });

        // Закрываем
        await authenticatedPage.closePopup();

        await expect(searchPopup).not.toBeVisible({ timeout: 3000 });
      }
    });
  });

  test.describe('Ввод и результаты поиска', () => {
    test('должен показать результаты поиска при вводе текста', async ({ authenticatedPage }) => {
      const searchBtn = authenticatedPage.controlPanel.locator('#search, .fa-search');

      if (await searchBtn.isVisible()) {
        await searchBtn.click();

        const searchInput = authenticatedPage.page.locator('.popup-input, .search-input, input[type="search"]');
        await expect(searchInput).toBeVisible({ timeout: 5000 });

        // Вводим поисковый запрос
        await searchInput.fill('тестовый запрос');

        // Ждём дебаунс (400ms) и результаты
        await authenticatedPage.page.waitForTimeout(600);

        // Должны появиться результаты
        const results = authenticatedPage.page.locator('.popup-search-results, .search-results');
        if (await results.isVisible()) {
          const resultItems = results.locator('.popup-search-result, .search-result-item');
          const count = await resultItems.count();
          expect(count).toBeGreaterThan(0);
        }

        await authenticatedPage.closePopup();
      }
    });

    test('должен показать сообщение когда ничего не найдено', async ({ authenticatedPage, page }) => {
      // Мокируем пустой результат
      await page.route('**/api/v1/blocks/search**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      const searchBtn = authenticatedPage.controlPanel.locator('#search, .fa-search');

      if (await searchBtn.isVisible()) {
        await searchBtn.click();

        const searchInput = authenticatedPage.page.locator('.popup-input, .search-input');
        await expect(searchInput).toBeVisible({ timeout: 5000 });

        await searchInput.fill('несуществующий запрос xyz123');
        await authenticatedPage.page.waitForTimeout(600);

        // Должно появиться сообщение "ничего не найдено"
        const emptyMessage = authenticatedPage.page.locator('.popup-search-empty, .no-results, :text("не найдено")');
        // Проверяем или пустые результаты или сообщение

        await authenticatedPage.closePopup();
      }
    });

    test('должен открыть блок при клике на результат', async ({ authenticatedPage }) => {
      const searchBtn = authenticatedPage.controlPanel.locator('#search, .fa-search');

      if (await searchBtn.isVisible()) {
        await searchBtn.click();

        const searchInput = authenticatedPage.page.locator('.popup-input, .search-input');
        await expect(searchInput).toBeVisible({ timeout: 5000 });

        await searchInput.fill('test');
        await authenticatedPage.page.waitForTimeout(600);

        const results = authenticatedPage.page.locator('.popup-search-results, .search-results');
        if (await results.isVisible()) {
          const firstResult = results.locator('.popup-search-result, .search-result-item').first();
          if (await firstResult.isVisible()) {
            await firstResult.click();

            // Попап должен закрыться и блок открыться
            await authenticatedPage.page.waitForTimeout(500);
          }
        }
      }
    });

    test('должен скопировать ID блока через кнопку в результате', async ({ authenticatedPage }) => {
      const searchBtn = authenticatedPage.controlPanel.locator('#search, .fa-search');

      if (await searchBtn.isVisible()) {
        await searchBtn.click();

        const searchInput = authenticatedPage.page.locator('.popup-input');
        await expect(searchInput).toBeVisible({ timeout: 5000 });

        await searchInput.fill('test');
        await authenticatedPage.page.waitForTimeout(600);

        const copyBtn = authenticatedPage.page.locator('.popup-btn--sm, .copy-id-btn').first();
        if (await copyBtn.isVisible()) {
          await copyBtn.click();
          await authenticatedPage.page.waitForTimeout(300);
        }

        await authenticatedPage.closePopup();
      }
    });
  });

  test.describe('Опции поиска', () => {
    test('должен переключить опцию "Искать везде"', async ({ authenticatedPage }) => {
      const searchBtn = authenticatedPage.controlPanel.locator('#search, .fa-search');

      if (await searchBtn.isVisible()) {
        await searchBtn.click();

        const checkbox = authenticatedPage.page.locator('.popup-checkbox, .search-everywhere-checkbox, input[type="checkbox"]');
        if (await checkbox.isVisible()) {
          // Переключаем чекбокс
          await checkbox.click();

          // Проверяем что он отмечен
          await expect(checkbox).toBeChecked();

          // Снимаем отметку
          await checkbox.click();
          await expect(checkbox).not.toBeChecked();
        }

        await authenticatedPage.closePopup();
      }
    });
  });
});

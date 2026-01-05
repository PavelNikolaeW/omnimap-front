import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object для попапа поиска (SearchPopup)
 *
 * Инкапсулирует логику работы с поиском:
 * - Открытие/закрытие
 * - Ввод запроса
 * - Работа с результатами
 * - Опции поиска
 */
export class SearchPopup {
  readonly page: Page;
  readonly popup: Locator;
  readonly input: Locator;
  readonly results: Locator;
  readonly everywhereCheckbox: Locator;
  readonly emptyMessage: Locator;
  readonly closeButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Контейнер попапа
    this.popup = page.locator('.popup-search, [data-testid="search-popup"]');

    // Поле ввода
    this.input = page.locator('[data-testid="search-input"], .popup-input');

    // Контейнер результатов
    this.results = page.locator('[data-testid="search-results"], .popup-search-results');

    // Чекбокс "Искать везде"
    this.everywhereCheckbox = page.locator(
      '[data-testid="search-everywhere-checkbox"], .popup-checkbox'
    );

    // Сообщение о пустых результатах
    this.emptyMessage = page.locator('.popup-search-empty, .no-results');

    // Кнопка закрытия
    this.closeButton = page.locator('.popup-close, [data-testid="search-close"]');
  }

  /**
   * Открывает попап поиска через кнопку в панели управления
   */
  async open(): Promise<void> {
    const searchBtn = this.page.locator('#search, .fa-search, [data-testid="command-btn-search"]');
    await searchBtn.click();
    await expect(this.popup).toBeVisible({ timeout: 5000 });
  }

  /**
   * Закрывает попап через Escape
   */
  async close(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.popup).not.toBeVisible({ timeout: 3000 });
  }

  /**
   * Закрывает попап через кнопку закрытия
   */
  async closeByButton(): Promise<void> {
    if (await this.closeButton.isVisible()) {
      await this.closeButton.click();
      await expect(this.popup).not.toBeVisible({ timeout: 3000 });
    } else {
      await this.close();
    }
  }

  /**
   * Выполняет поиск
   * @param query - поисковый запрос
   * @param everywhere - искать везде (не только в текущем дереве)
   */
  async search(query: string, everywhere = false): Promise<void> {
    await expect(this.input).toBeVisible();
    await this.input.fill(query);

    if (everywhere) {
      await this.everywhereCheckbox.check();
    }

    // Ждём debounce (400ms) и результаты
    await this.page.waitForTimeout(600);
  }

  /**
   * Получает количество результатов поиска
   */
  async getResultsCount(): Promise<number> {
    if (!(await this.results.isVisible())) {
      return 0;
    }
    const items = this.results.locator('.popup-search-result, .search-result-item');
    return await items.count();
  }

  /**
   * Получает результат поиска по индексу
   */
  getResult(index: number): Locator {
    return this.results.locator('.popup-search-result, .search-result-item').nth(index);
  }

  /**
   * Кликает на результат поиска по индексу
   */
  async clickResult(index: number): Promise<void> {
    const result = this.getResult(index);
    await expect(result).toBeVisible();
    await result.click();
  }

  /**
   * Копирует ID блока из результата поиска
   */
  async copyIdFromResult(index: number): Promise<void> {
    const result = this.getResult(index);
    const copyBtn = result.locator('.popup-btn--sm, .copy-id-btn');
    if (await copyBtn.isVisible()) {
      await copyBtn.click();
    }
  }

  /**
   * Проверяет, что результаты содержат текст
   */
  async assertResultContains(text: string): Promise<void> {
    const result = this.results.locator(`:has-text("${text}")`);
    await expect(result).toBeVisible();
  }

  /**
   * Проверяет, что показывается сообщение "ничего не найдено"
   */
  async assertNoResults(): Promise<void> {
    const count = await this.getResultsCount();
    expect(count).toBe(0);
  }

  /**
   * Проверяет, что попап открыт
   */
  async assertOpen(): Promise<void> {
    await expect(this.popup).toBeVisible();
  }

  /**
   * Проверяет, что попап закрыт
   */
  async assertClosed(): Promise<void> {
    await expect(this.popup).not.toBeVisible();
  }

  /**
   * Включает/выключает опцию "Искать везде"
   */
  async toggleEverywhere(): Promise<void> {
    await this.everywhereCheckbox.click();
  }

  /**
   * Проверяет, что опция "Искать везде" включена
   */
  async assertEverywhereEnabled(): Promise<void> {
    await expect(this.everywhereCheckbox).toBeChecked();
  }

  /**
   * Очищает поле поиска
   */
  async clearInput(): Promise<void> {
    await this.input.clear();
  }
}

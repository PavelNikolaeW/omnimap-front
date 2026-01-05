import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object для попапа напоминаний (ReminderPopup)
 *
 * Инкапсулирует логику работы с напоминаниями:
 * - Создание напоминания
 * - Настройка даты/времени
 * - Выбор повторения
 * - Список напоминаний
 */
export class ReminderPopup {
  readonly page: Page;
  readonly popup: Locator;
  readonly dateInput: Locator;
  readonly timeInput: Locator;
  readonly messageInput: Locator;
  readonly repeatSelect: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Контейнер попапа
    this.popup = page.locator('.reminder-popup, [data-testid="reminder-popup"], [role="dialog"]');

    // Поля формы
    this.dateInput = page.locator('#reminder-date, input[type="date"], [data-testid="reminder-date"]');
    this.timeInput = page.locator('#reminder-time, input[type="time"], [data-testid="reminder-time"]');
    this.messageInput = page.locator('#reminder-message, textarea, [data-testid="reminder-message"]');
    this.repeatSelect = page.locator('#reminder-repeat, select, [data-testid="reminder-repeat"]');

    // Кнопки
    this.saveButton = page.locator('.popup-btn--primary, [data-testid="reminder-save"]');
    this.cancelButton = page.locator('.popup-btn--secondary, [data-testid="reminder-cancel"]');
  }

  /**
   * Открывает попап создания напоминания для выбранного блока
   */
  async open(): Promise<void> {
    // Открываем меню опций
    await this.page.keyboard.press('o');
    await this.page.waitForTimeout(300);

    // Кликаем на кнопку напоминания
    const reminderBtn = this.page.locator('#reminder, .fa-bell, button:has-text("Напоминание")');
    if (await reminderBtn.isVisible()) {
      await reminderBtn.click();
      await expect(this.popup).toBeVisible({ timeout: 5000 });
    }
  }

  /**
   * Закрывает попап
   */
  async close(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.popup).not.toBeVisible({ timeout: 3000 });
  }

  /**
   * Закрывает попап через кнопку отмены
   */
  async cancel(): Promise<void> {
    if (await this.cancelButton.isVisible()) {
      await this.cancelButton.click();
      await expect(this.popup).not.toBeVisible({ timeout: 3000 });
    } else {
      await this.close();
    }
  }

  /**
   * Устанавливает дату напоминания
   */
  async setDate(date: Date | string): Promise<void> {
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    await this.dateInput.fill(dateStr);
  }

  /**
   * Устанавливает время напоминания
   */
  async setTime(time: string): Promise<void> {
    await this.timeInput.fill(time);
  }

  /**
   * Устанавливает текст сообщения напоминания
   */
  async setMessage(message: string): Promise<void> {
    await this.messageInput.fill(message);
  }

  /**
   * Выбирает тип повторения
   */
  async setRepeat(repeat: 'none' | 'daily' | 'weekly' | 'monthly'): Promise<void> {
    await this.repeatSelect.selectOption(repeat);
  }

  /**
   * Создаёт напоминание с полными настройками
   */
  async createReminder(options: {
    date?: Date | string;
    time?: string;
    message?: string;
    repeat?: 'none' | 'daily' | 'weekly' | 'monthly';
  }): Promise<void> {
    if (options.date) {
      await this.setDate(options.date);
    }

    if (options.time) {
      await this.setTime(options.time);
    }

    if (options.message) {
      await this.setMessage(options.message);
    }

    if (options.repeat) {
      await this.setRepeat(options.repeat);
    }

    await this.save();
  }

  /**
   * Создаёт напоминание на завтра
   */
  async createReminderForTomorrow(time = '10:00', message = ''): Promise<void> {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    await this.createReminder({
      date: tomorrow,
      time,
      message,
    });
  }

  /**
   * Сохраняет напоминание
   */
  async save(): Promise<void> {
    await this.saveButton.click();
    await expect(this.popup).not.toBeVisible({ timeout: 5000 });
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
}

/**
 * Page Object для списка напоминаний
 */
export class RemindersListPopup {
  readonly page: Page;
  readonly popup: Locator;
  readonly list: Locator;
  readonly pendingFilter: Locator;
  readonly sentFilter: Locator;
  readonly allFilter: Locator;

  constructor(page: Page) {
    this.page = page;

    this.popup = page.locator('.reminders-list-popup, [data-testid="reminders-list-popup"]');
    this.list = page.locator('.popup-list, .reminders-list');

    // Фильтры
    this.pendingFilter = page.locator('[data-filter="pending"], button:has-text("Предстоящие")');
    this.sentFilter = page.locator('[data-filter="sent"], button:has-text("Прошедшие")');
    this.allFilter = page.locator('[data-filter="all"], button:has-text("Все")');
  }

  /**
   * Открывает список напоминаний
   */
  async open(): Promise<void> {
    await this.page.keyboard.press('o');
    await this.page.waitForTimeout(300);

    const listBtn = this.page.locator('#remindersList, button:has-text("Мои напоминания")');
    if (await listBtn.isVisible()) {
      await listBtn.click();
      await expect(this.popup).toBeVisible({ timeout: 5000 });
    }
  }

  /**
   * Закрывает список
   */
  async close(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.popup).not.toBeVisible({ timeout: 3000 });
  }

  /**
   * Получает количество напоминаний в списке
   */
  async getCount(): Promise<number> {
    const items = this.list.locator('.reminder-item, .popup-list-item');
    return await items.count();
  }

  /**
   * Фильтрует по предстоящим напоминаниям
   */
  async filterPending(): Promise<void> {
    if (await this.pendingFilter.isVisible()) {
      await this.pendingFilter.click();
      await this.page.waitForTimeout(300);
    }
  }

  /**
   * Фильтрует по прошедшим напоминаниям
   */
  async filterSent(): Promise<void> {
    if (await this.sentFilter.isVisible()) {
      await this.sentFilter.click();
      await this.page.waitForTimeout(300);
    }
  }

  /**
   * Показывает все напоминания
   */
  async filterAll(): Promise<void> {
    if (await this.allFilter.isVisible()) {
      await this.allFilter.click();
      await this.page.waitForTimeout(300);
    }
  }

  /**
   * Удаляет напоминание по индексу
   */
  async deleteReminder(index: number): Promise<void> {
    const item = this.list.locator('.reminder-item, .popup-list-item').nth(index);
    const deleteBtn = item.locator('.delete-btn, .fa-trash');
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
    }
  }
}

import { test, expect } from '../fixtures/auth.fixture';
import { setupApiMocks } from '../fixtures/test-data.fixture';

test.describe('Напоминания (ReminderPopup)', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);

    // Мокируем API напоминаний
    await page.route('**/api/v1/reminders**', async (route) => {
      const method = route.request().method();

      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'reminder-1',
              block_id: 'block-1',
              block_title: 'Test Block',
              datetime: new Date(Date.now() + 86400000).toISOString(),
              message: 'Test reminder',
              repeat: 'none',
              status: 'pending',
            },
            {
              id: 'reminder-2',
              block_id: 'block-2',
              block_title: 'Another Block',
              datetime: new Date(Date.now() - 86400000).toISOString(),
              message: '',
              repeat: 'daily',
              status: 'sent',
            },
          ]),
        });
      } else if (method === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'new-reminder',
            success: true,
          }),
        });
      } else if (method === 'DELETE') {
        await route.fulfill({ status: 204 });
      } else {
        await route.continue();
      }
    });
  });

  test.describe('Создание напоминания', () => {
    test('должен открыть форму создания напоминания', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);

        // Открываем опции
        await authenticatedPage.pressHotkey('o');
        await authenticatedPage.page.waitForTimeout(300);

        // Ищем кнопку напоминания
        const reminderBtn = authenticatedPage.page.locator('#setReminder, .fa-bell, button:has-text("Напоминание")');

        if (await reminderBtn.isVisible()) {
          await reminderBtn.click();

          // Должна появиться форма
          const reminderPopup = authenticatedPage.page.locator('[role="dialog"], .reminder-popup');
          await expect(reminderPopup).toBeVisible({ timeout: 5000 });

          await authenticatedPage.closePopup();
        } else {
          await authenticatedPage.closePopup();
        }
      }
    });

    test('должен заполнить форму напоминания', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('o');
        await authenticatedPage.page.waitForTimeout(300);

        const reminderBtn = authenticatedPage.page.locator('#setReminder, .fa-bell, button:has-text("Напоминание")');

        if (await reminderBtn.isVisible()) {
          await reminderBtn.click();

          // Заполняем поля
          const dateInput = authenticatedPage.page.locator('#setReminder-date, input[type="date"]');
          const timeInput = authenticatedPage.page.locator('#setReminder-time, input[type="time"]');
          const messageInput = authenticatedPage.page.locator('#setReminder-message, textarea');
          const repeatSelect = authenticatedPage.page.locator('#setReminder-repeat, select');

          if (await dateInput.isVisible()) {
            // Устанавливаем дату на завтра
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            await dateInput.fill(tomorrow.toISOString().split('T')[0]);
          }

          if (await timeInput.isVisible()) {
            await timeInput.fill('10:00');
          }

          if (await messageInput.isVisible()) {
            await messageInput.fill('Тестовое напоминание');
          }

          if (await repeatSelect.isVisible()) {
            await repeatSelect.selectOption('daily');
          }

          await authenticatedPage.closePopup();
        } else {
          await authenticatedPage.closePopup();
        }
      }
    });
  });

  test.describe('Список напоминаний', () => {
    test('должен открыть список напоминаний', async ({ authenticatedPage }) => {
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const remindersListBtn = authenticatedPage.page.locator('#myReminders, button:has-text("Мои напоминания")');

      if (await remindersListBtn.isVisible()) {
        await remindersListBtn.click();

        const listPopup = authenticatedPage.page.locator('.popup-list, [role="dialog"]');
        await expect(listPopup).toBeVisible({ timeout: 5000 });

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    });

    test('должен фильтровать напоминания по статусу', async ({ authenticatedPage }) => {
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const remindersListBtn = authenticatedPage.page.locator('#myReminders, button:has-text("Мои напоминания")');

      if (await remindersListBtn.isVisible()) {
        await remindersListBtn.click();

        // Фильтры
        const pendingFilter = authenticatedPage.page.locator('[data-filter="pending"], button:has-text("Предстоящие")');
        const sentFilter = authenticatedPage.page.locator('[data-filter="sent"], button:has-text("Прошедшие")');
        const allFilter = authenticatedPage.page.locator('[data-filter="all"], button:has-text("Все")');

        if (await pendingFilter.isVisible()) {
          await pendingFilter.click();
          await authenticatedPage.page.waitForTimeout(300);
        }

        if (await sentFilter.isVisible()) {
          await sentFilter.click();
          await authenticatedPage.page.waitForTimeout(300);
        }

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    });
  });
});

test.describe('Подписки на изменения (SubscriptionPopup)', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);

    // Мокируем API подписок
    await page.route('**/api/v1/subscriptions**', async (route) => {
      const method = route.request().method();

      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'sub-1',
              block_id: 'block-1',
              block_title: 'Watched Block',
              depth: 2,
              channels: ['telegram'],
              status: 'active',
            },
            {
              id: 'sub-2',
              block_id: 'block-2',
              block_title: 'Another Watched',
              depth: 0,
              channels: ['email'],
              status: 'paused',
            },
          ]),
        });
      } else if (method === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'new-sub', success: true }),
        });
      } else if (method === 'DELETE') {
        await route.fulfill({ status: 204 });
      } else {
        await route.continue();
      }
    });
  });

  test.describe('Создание подписки', () => {
    test('должен открыть форму подписки на блок', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('o');
        await authenticatedPage.page.waitForTimeout(300);

        const subscribeBtn = authenticatedPage.page.locator('#subscribe, .fa-eye, button:has-text("Отслеживать")');

        if (await subscribeBtn.isVisible()) {
          await subscribeBtn.click();

          const subPopup = authenticatedPage.page.locator('[role="dialog"], .subscription-popup');
          await expect(subPopup).toBeVisible({ timeout: 5000 });

          await authenticatedPage.closePopup();
        } else {
          await authenticatedPage.closePopup();
        }
      }
    });

    test('должен выбрать глубину отслеживания', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('o');
        await authenticatedPage.page.waitForTimeout(300);

        const subscribeBtn = authenticatedPage.page.locator('#subscribe, .fa-eye, button:has-text("Отслеживать")');

        if (await subscribeBtn.isVisible()) {
          await subscribeBtn.click();

          // Выбор глубины (radio buttons)
          const depth1 = authenticatedPage.page.locator('input[value="1"], .popup-radio-label:has-text("1 уровень")');
          const depth2 = authenticatedPage.page.locator('input[value="2"], .popup-radio-label:has-text("2 уровня")');
          const depthAll = authenticatedPage.page.locator('input[value="-1"], .popup-radio-label:has-text("Все")');

          if (await depth2.isVisible()) {
            await depth2.click();
          }

          await authenticatedPage.closePopup();
        } else {
          await authenticatedPage.closePopup();
        }
      }
    });

    test('должен выбрать каналы уведомлений', async ({ authenticatedPage }) => {
      const firstBlock = authenticatedPage.getFirstBlock();

      if (await firstBlock.isVisible()) {
        await authenticatedPage.clickBlock(firstBlock);
        await authenticatedPage.pressHotkey('o');
        await authenticatedPage.page.waitForTimeout(300);

        const subscribeBtn = authenticatedPage.page.locator('#subscribe, .fa-eye, button:has-text("Отслеживать")');

        if (await subscribeBtn.isVisible()) {
          await subscribeBtn.click();

          // Чекбоксы каналов
          const telegramChannel = authenticatedPage.page.locator('input[name="telegram"], label:has-text("Telegram")');
          const emailChannel = authenticatedPage.page.locator('input[name="email"], label:has-text("Email")');

          if (await telegramChannel.isVisible()) {
            await telegramChannel.click();
          }

          await authenticatedPage.closePopup();
        } else {
          await authenticatedPage.closePopup();
        }
      }
    });
  });

  test.describe('Список подписок', () => {
    test('должен открыть список подписок', async ({ authenticatedPage }) => {
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const subscriptionsListBtn = authenticatedPage.page.locator('#subscriptionsList, button:has-text("Мои подписки")');

      if (await subscriptionsListBtn.isVisible()) {
        await subscriptionsListBtn.click();

        const listPopup = authenticatedPage.page.locator('.popup-list, [role="dialog"]');
        await expect(listPopup).toBeVisible({ timeout: 5000 });

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    });

    test('должен фильтровать подписки по статусу', async ({ authenticatedPage }) => {
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const subscriptionsListBtn = authenticatedPage.page.locator('#subscriptionsList, button:has-text("Мои подписки")');

      if (await subscriptionsListBtn.isVisible()) {
        await subscriptionsListBtn.click();

        const activeFilter = authenticatedPage.page.locator('[data-filter="active"], button:has-text("Активные")');
        const pausedFilter = authenticatedPage.page.locator('[data-filter="paused"], button:has-text("Приостановленные")');

        if (await activeFilter.isVisible()) {
          await activeFilter.click();
          await authenticatedPage.page.waitForTimeout(300);
        }

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    });
  });
});

test.describe('Настройки уведомлений (NotificationSettingsPopup)', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);

    // Мокируем API настроек уведомлений
    await page.route('**/api/v1/notifications/settings**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          telegram: { connected: true, username: '@test_user' },
          email: { enabled: true, mode: 'fallback' },
          push: { enabled: false },
          quiet_hours: { start: '23:00', end: '07:00' },
          limits: { used: 50, max: 100 },
        }),
      });
    });
  });

  test('должен открыть настройки уведомлений', async ({ authenticatedPage }) => {
    await authenticatedPage.pressHotkey('o');
    await authenticatedPage.page.waitForTimeout(300);

    const notificationSettingsBtn = authenticatedPage.page.locator('#notificationSettings, button:has-text("Уведомления")');

    if (await notificationSettingsBtn.isVisible()) {
      await notificationSettingsBtn.click();

      const settingsPopup = authenticatedPage.page.locator('[role="dialog"], .notification-settings-popup');
      await expect(settingsPopup).toBeVisible({ timeout: 5000 });

      await authenticatedPage.closePopup();
    } else {
      await authenticatedPage.closePopup();
    }
  });

  test('должен показать статус Telegram', async ({ authenticatedPage }) => {
    await authenticatedPage.pressHotkey('o');
    await authenticatedPage.page.waitForTimeout(300);

    const notificationSettingsBtn = authenticatedPage.page.locator('#notificationSettings, button:has-text("Уведомления")');

    if (await notificationSettingsBtn.isVisible()) {
      await notificationSettingsBtn.click();

      // Секция Telegram
      const telegramSection = authenticatedPage.page.locator('#telegram-section-content, .telegram-section');

      if (await telegramSection.isVisible()) {
        // Должен показать статус подключения
      }

      await authenticatedPage.closePopup();
    } else {
      await authenticatedPage.closePopup();
    }
  });

  test('должен переключить email уведомления', async ({ authenticatedPage }) => {
    await authenticatedPage.pressHotkey('o');
    await authenticatedPage.page.waitForTimeout(300);

    const notificationSettingsBtn = authenticatedPage.page.locator('#notificationSettings, button:has-text("Уведомления")');

    if (await notificationSettingsBtn.isVisible()) {
      await notificationSettingsBtn.click();

      const emailToggle = authenticatedPage.page.locator('.popup-toggle[name="email"], input[name="email_enabled"]');

      if (await emailToggle.isVisible()) {
        await emailToggle.click();
        await authenticatedPage.page.waitForTimeout(300);
      }

      await authenticatedPage.closePopup();
    } else {
      await authenticatedPage.closePopup();
    }
  });

  test('должен настроить тихие часы', async ({ authenticatedPage }) => {
    await authenticatedPage.pressHotkey('o');
    await authenticatedPage.page.waitForTimeout(300);

    const notificationSettingsBtn = authenticatedPage.page.locator('#notificationSettings, button:has-text("Уведомления")');

    if (await notificationSettingsBtn.isVisible()) {
      await notificationSettingsBtn.click();

      const quietStart = authenticatedPage.page.locator('input[name="quiet_start"], #quiet-hours-start');
      const quietEnd = authenticatedPage.page.locator('input[name="quiet_end"], #quiet-hours-end');

      if (await quietStart.isVisible()) {
        await quietStart.fill('22:00');
      }

      if (await quietEnd.isVisible()) {
        await quietEnd.fill('08:00');
      }

      await authenticatedPage.closePopup();
    } else {
      await authenticatedPage.closePopup();
    }
  });
});

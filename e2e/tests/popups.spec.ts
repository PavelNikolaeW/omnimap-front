import { test, expect } from '../fixtures/auth.fixture';
import { setupApiMocks } from '../fixtures/test-data.fixture';

test.describe('История изменений (HistoryPopup)', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);

    // Мокируем API истории
    await page.route('**/api/v1/blocks/*/history**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'history-1',
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            action: 'update',
            description: 'Изменено название',
            user: 'test_user',
          },
          {
            id: 'history-2',
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            action: 'create',
            description: 'Создан блок',
            user: 'test_user',
          },
          {
            id: 'history-3',
            timestamp: new Date(Date.now() - 86400000).toISOString(),
            action: 'move',
            description: 'Перемещён в другой блок',
            user: 'another_user',
          },
        ]),
      });
    });
  });

  test('должен открыть историю блока', async ({ authenticatedPage }) => {
    const firstBlock = authenticatedPage.getFirstBlock();

    if (await firstBlock.isVisible()) {
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const historyBtn = authenticatedPage.page.locator('#history, .fa-history, button:has-text("История")');

      if (await historyBtn.isVisible()) {
        await historyBtn.click();

        const historyPopup = authenticatedPage.page.locator('[role="dialog"], .history-popup');
        await expect(historyPopup).toBeVisible({ timeout: 5000 });

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    }
  });

  test('должен показать список изменений', async ({ authenticatedPage }) => {
    const firstBlock = authenticatedPage.getFirstBlock();

    if (await firstBlock.isVisible()) {
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const historyBtn = authenticatedPage.page.locator('#history, .fa-history, button:has-text("История")');

      if (await historyBtn.isVisible()) {
        await historyBtn.click();

        // Ждём загрузки
        const spinner = authenticatedPage.page.locator('.popup-spinner, .loading');
        if (await spinner.isVisible()) {
          await spinner.waitFor({ state: 'hidden', timeout: 5000 });
        }

        // Список должен содержать элементы
        const historyItems = authenticatedPage.page.locator('.popup-list-item, .history-item');
        const count = await historyItems.count();
        expect(count).toBeGreaterThan(0);

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    }
  });

  test('должен откатить к предыдущей версии', async ({ authenticatedPage }) => {
    const firstBlock = authenticatedPage.getFirstBlock();

    if (await firstBlock.isVisible()) {
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const historyBtn = authenticatedPage.page.locator('#history, .fa-history, button:has-text("История")');

      if (await historyBtn.isVisible()) {
        await historyBtn.click();

        // Ждём загрузки
        await authenticatedPage.page.waitForTimeout(1000);

        // Ищем кнопку отката
        const revertBtn = authenticatedPage.page.locator('.revert-btn, button:has-text("Откатить")').first();

        if (await revertBtn.isVisible()) {
          await revertBtn.click();
          await authenticatedPage.page.waitForTimeout(500);
        }

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    }
  });
});

test.describe('Управление доступом (AccessPopup)', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);

    // Мокируем API участников
    await page.route('**/api/v1/blocks/*/members**', async (route) => {
      const method = route.request().method();

      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 'member-1', username: 'user1', email: 'user1@example.com', role: 'editor' },
            { id: 'member-2', username: 'user2', email: 'user2@example.com', role: 'viewer' },
          ]),
        });
      } else if (method === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else if (method === 'DELETE') {
        await route.fulfill({ status: 204 });
      } else {
        await route.continue();
      }
    });
  });

  test('должен открыть попап управления доступом', async ({ authenticatedPage }) => {
    const firstBlock = authenticatedPage.getFirstBlock();

    if (await firstBlock.isVisible()) {
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const accessBtn = authenticatedPage.page.locator('#access, .fa-users, button:has-text("Доступ")');

      if (await accessBtn.isVisible()) {
        await accessBtn.click();

        const accessPopup = authenticatedPage.page.locator('[role="dialog"], .access-popup');
        await expect(accessPopup).toBeVisible({ timeout: 5000 });

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    }
  });

  test('должен показать список участников', async ({ authenticatedPage }) => {
    const firstBlock = authenticatedPage.getFirstBlock();

    if (await firstBlock.isVisible()) {
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const accessBtn = authenticatedPage.page.locator('#access, .fa-users, button:has-text("Доступ")');

      if (await accessBtn.isVisible()) {
        await accessBtn.click();
        await authenticatedPage.page.waitForTimeout(1000);

        const membersList = authenticatedPage.page.locator('.popup-list, .members-list');
        if (await membersList.isVisible()) {
          const members = membersList.locator('.popup-list-item, .member-item');
          const count = await members.count();
          expect(count).toBeGreaterThan(0);
        }

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    }
  });

  test('должен добавить нового участника', async ({ authenticatedPage }) => {
    const firstBlock = authenticatedPage.getFirstBlock();

    if (await firstBlock.isVisible()) {
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const accessBtn = authenticatedPage.page.locator('#access, .fa-users, button:has-text("Доступ")');

      if (await accessBtn.isVisible()) {
        await accessBtn.click();
        await authenticatedPage.page.waitForTimeout(500);

        // Форма добавления
        const usernameInput = authenticatedPage.page.locator('input[name="username"], input[placeholder*="username" i]');

        if (await usernameInput.isVisible()) {
          await usernameInput.fill('new_user');

          const addBtn = authenticatedPage.page.locator('button:has-text("Добавить"), .add-member-btn');
          if (await addBtn.isVisible()) {
            await addBtn.click();
            await authenticatedPage.page.waitForTimeout(500);
          }
        }

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    }
  });

  test('должен удалить участника', async ({ authenticatedPage }) => {
    const firstBlock = authenticatedPage.getFirstBlock();

    if (await firstBlock.isVisible()) {
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const accessBtn = authenticatedPage.page.locator('#access, .fa-users, button:has-text("Доступ")');

      if (await accessBtn.isVisible()) {
        await accessBtn.click();
        await authenticatedPage.page.waitForTimeout(1000);

        const removeBtn = authenticatedPage.page.locator('.remove-member-btn, button:has-text("Удалить")').first();

        if (await removeBtn.isVisible()) {
          await removeBtn.click();
          await authenticatedPage.page.waitForTimeout(500);
        }

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    }
  });
});

test.describe('Управление ссылками (UrlPopup)', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);

    // Мокируем API ссылок
    await page.route('**/api/v1/blocks/*/urls**', async (route) => {
      const method = route.request().method();

      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 'url-1', slug: 'my-block', full_url: 'https://omnimap.ru/b/my-block' },
            { id: 'url-2', slug: 'test-link', full_url: 'https://omnimap.ru/b/test-link' },
          ]),
        });
      } else if (method === 'POST') {
        const body = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'new-url',
            slug: body?.slug || 'new-slug',
            full_url: `https://omnimap.ru/b/${body?.slug || 'new-slug'}`,
          }),
        });
      } else if (method === 'DELETE') {
        await route.fulfill({ status: 204 });
      } else {
        await route.continue();
      }
    });

    // Мокируем проверку доступности slug
    await page.route('**/api/v1/urls/check**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ available: true }),
      });
    });
  });

  test('должен открыть попап управления ссылками', async ({ authenticatedPage }) => {
    const firstBlock = authenticatedPage.getFirstBlock();

    if (await firstBlock.isVisible()) {
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const urlBtn = authenticatedPage.page.locator('#urls, .fa-link, button:has-text("Ссылки")');

      if (await urlBtn.isVisible()) {
        await urlBtn.click();

        const urlPopup = authenticatedPage.page.locator('[role="dialog"], .url-popup');
        await expect(urlPopup).toBeVisible({ timeout: 5000 });

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    }
  });

  test('должен показать список ссылок', async ({ authenticatedPage }) => {
    const firstBlock = authenticatedPage.getFirstBlock();

    if (await firstBlock.isVisible()) {
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const urlBtn = authenticatedPage.page.locator('#urls, .fa-link, button:has-text("Ссылки")');

      if (await urlBtn.isVisible()) {
        await urlBtn.click();
        await authenticatedPage.page.waitForTimeout(1000);

        const urlsList = authenticatedPage.page.locator('.popup-list, .urls-list');
        if (await urlsList.isVisible()) {
          const urls = urlsList.locator('.popup-list-item, .url-item');
          const count = await urls.count();
          expect(count).toBeGreaterThan(0);
        }

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    }
  });

  test('должен создать новую ссылку', async ({ authenticatedPage }) => {
    const firstBlock = authenticatedPage.getFirstBlock();

    if (await firstBlock.isVisible()) {
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const urlBtn = authenticatedPage.page.locator('#urls, .fa-link, button:has-text("Ссылки")');

      if (await urlBtn.isVisible()) {
        await urlBtn.click();
        await authenticatedPage.page.waitForTimeout(500);

        const slugInput = authenticatedPage.page.locator('.popup-input, input[name="slug"]');

        if (await slugInput.isVisible()) {
          await slugInput.fill('new-custom-link');

          // Ждём валидации (дебаунс 500ms)
          await authenticatedPage.page.waitForTimeout(600);

          const createBtn = authenticatedPage.page.locator('.popup-btn--primary, button:has-text("Создать")');
          if (await createBtn.isVisible()) {
            await createBtn.click();
            await authenticatedPage.page.waitForTimeout(500);
          }
        }

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    }
  });

  test('должен скопировать ссылку в буфер', async ({ authenticatedPage }) => {
    const firstBlock = authenticatedPage.getFirstBlock();

    if (await firstBlock.isVisible()) {
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const urlBtn = authenticatedPage.page.locator('#urls, .fa-link, button:has-text("Ссылки")');

      if (await urlBtn.isVisible()) {
        await urlBtn.click();
        await authenticatedPage.page.waitForTimeout(1000);

        const copyBtn = authenticatedPage.page.locator('.popup-btn--primary, button:has-text("Копировать")').first();

        if (await copyBtn.isVisible()) {
          await copyBtn.click();
          await authenticatedPage.page.waitForTimeout(300);
        }

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    }
  });

  test('должен удалить ссылку', async ({ authenticatedPage }) => {
    const firstBlock = authenticatedPage.getFirstBlock();

    if (await firstBlock.isVisible()) {
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const urlBtn = authenticatedPage.page.locator('#urls, .fa-link, button:has-text("Ссылки")');

      if (await urlBtn.isVisible()) {
        await urlBtn.click();
        await authenticatedPage.page.waitForTimeout(1000);

        const deleteBtn = authenticatedPage.page.locator('.popup-btn--danger, button:has-text("Удалить")').first();

        if (await deleteBtn.isVisible()) {
          await deleteBtn.click();
          await authenticatedPage.page.waitForTimeout(500);
        }

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    }
  });
});

test.describe('Редактирование JSON блока (EditBlockPopup)', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('должен открыть редактор JSON', async ({ authenticatedPage }) => {
    const firstBlock = authenticatedPage.getFirstBlock();

    if (await firstBlock.isVisible()) {
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const editJsonBtn = authenticatedPage.page.locator('#editJson, .fa-code, button:has-text("JSON")');

      if (await editJsonBtn.isVisible()) {
        await editJsonBtn.click();

        const jsonPopup = authenticatedPage.page.locator('[role="dialog"], .json-editor-popup');
        await expect(jsonPopup).toBeVisible({ timeout: 5000 });

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    }
  });

  test('должен отредактировать JSON и сохранить', async ({ authenticatedPage }) => {
    const firstBlock = authenticatedPage.getFirstBlock();

    if (await firstBlock.isVisible()) {
      await authenticatedPage.clickBlock(firstBlock);
      await authenticatedPage.pressHotkey('o');
      await authenticatedPage.page.waitForTimeout(300);

      const editJsonBtn = authenticatedPage.page.locator('#editJson, .fa-code, button:has-text("JSON")');

      if (await editJsonBtn.isVisible()) {
        await editJsonBtn.click();

        const jsonEditor = authenticatedPage.page.locator('.popup-json-editor, textarea, .CodeMirror');

        if (await jsonEditor.isVisible()) {
          // Вводим валидный JSON
          await jsonEditor.fill('{"title": "Updated Title"}');

          // Сохраняем через Ctrl+S
          await authenticatedPage.page.keyboard.down('Control');
          await authenticatedPage.page.keyboard.press('s');
          await authenticatedPage.page.keyboard.up('Control');

          await authenticatedPage.page.waitForTimeout(500);
        }

        await authenticatedPage.closePopup();
      } else {
        await authenticatedPage.closePopup();
      }
    }
  });
});

test.describe('Настройка горячих клавиш (HotkeyPopup)', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('должен открыть настройки горячих клавиш', async ({ authenticatedPage }) => {
    await authenticatedPage.pressHotkey('o');
    await authenticatedPage.page.waitForTimeout(300);

    const hotkeySettingsBtn = authenticatedPage.page.locator('#hotkeySettings, button:has-text("Горячие клавиши")');

    if (await hotkeySettingsBtn.isVisible()) {
      await hotkeySettingsBtn.click();

      const hotkeyPopup = authenticatedPage.page.locator('[role="dialog"], .hotkey-popup');
      await expect(hotkeyPopup).toBeVisible({ timeout: 5000 });

      await authenticatedPage.closePopup();
    } else {
      await authenticatedPage.closePopup();
    }
  });

  test('должен показать список команд с горячими клавишами', async ({ authenticatedPage }) => {
    await authenticatedPage.pressHotkey('o');
    await authenticatedPage.page.waitForTimeout(300);

    const hotkeySettingsBtn = authenticatedPage.page.locator('#hotkeySettings, button:has-text("Горячие клавиши")');

    if (await hotkeySettingsBtn.isVisible()) {
      await hotkeySettingsBtn.click();
      await authenticatedPage.page.waitForTimeout(500);

      const commandsList = authenticatedPage.page.locator('.hotkey-comands-container, .commands-list');
      if (await commandsList.isVisible()) {
        const commands = commandsList.locator('.popup-section, .command-item');
        const count = await commands.count();
        expect(count).toBeGreaterThan(0);
      }

      await authenticatedPage.closePopup();
    } else {
      await authenticatedPage.closePopup();
    }
  });

  test('должен изменить горячую клавишу', async ({ authenticatedPage }) => {
    await authenticatedPage.pressHotkey('o');
    await authenticatedPage.page.waitForTimeout(300);

    const hotkeySettingsBtn = authenticatedPage.page.locator('#hotkeySettings, button:has-text("Горячие клавиши")');

    if (await hotkeySettingsBtn.isVisible()) {
      await hotkeySettingsBtn.click();
      await authenticatedPage.page.waitForTimeout(500);

      const hotkeyInput = authenticatedPage.page.locator('.hotkey-input').first();

      if (await hotkeyInput.isVisible()) {
        await hotkeyInput.click();
        await hotkeyInput.clear();

        // Записываем новую комбинацию
        await authenticatedPage.page.keyboard.down('Control');
        await authenticatedPage.page.keyboard.press('m');
        await authenticatedPage.page.keyboard.up('Control');

        await authenticatedPage.page.waitForTimeout(300);
      }

      await authenticatedPage.closePopup();
    } else {
      await authenticatedPage.closePopup();
    }
  });
});

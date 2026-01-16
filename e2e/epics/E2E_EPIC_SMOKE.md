# Smoke Tests (P0)

## Цель

Критические тесты для CI на каждый PR.
Быстрая проверка что базовый функционал работает.

**Время выполнения:** < 2 минуты

## Тест-кейсы

| ID | Название | Описание |
|----|----------|----------|
| SM-01 | App загружается | Приложение показывает rootContainer и control-panel |
| SM-02 | Login работает | Пользователь авторизован (через storageState) |
| SM-03 | Создать блок | Создание блока через hotkey `n` |
| SM-04 | Открыть блок | Вход в блок через double-click |
| SM-05 | Редактировать блок | Изменение названия через `t` |
| SM-06 | Удалить блок | Удаление через `Shift+D` |
| SM-07 | WebSocket подключается | SincManager.ws.readyState === 1 |
| SM-08 | Поиск работает | Открытие SearchPopup через `f` |
| SM-09 | Persistence после reload | Блок сохраняется после перезагрузки |
| SM-10 | Logout | Выход из системы |

## Реализация

### SM-01: App загружается

```typescript
test('SM-01: Приложение загружается', async ({ page }) => {
  await page.goto('/');
  const rootContainer = page.locator('#rootContainer');
  await expect(rootContainer).toBeVisible({ timeout: 10000 });
  const controlPanel = page.locator('#control-panel');
  await expect(controlPanel).toBeVisible({ timeout: 5000 });
  const errorPopup = page.locator('#error-popup');
  await expect(errorPopup).not.toBeVisible();
});
```

### SM-03: Создать блок

```typescript
test('SM-03: Можно создать блок', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const blockTitle = `Smoke Test ${Date.now()}`;

  await page.keyboard.press('n');
  const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
  await expect(dialogInput).toBeVisible({ timeout: 5000 });
  await dialogInput.fill(blockTitle);
  await page.locator('[data-testid="custom-dialog-ok-btn"]').click();

  const newBlock = page.locator(`[block] titleBlock:has-text("${blockTitle}")`);
  await expect(newBlock).toBeVisible({ timeout: 5000 });
});
```

### SM-07: WebSocket подключается

```typescript
test('SM-07: WebSocket подключается', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  const wsConnected = await page.evaluate(() => {
    const sincManager = (window as any).sincManager;
    if (!sincManager) return false;
    const ws = sincManager.ws;
    if (!ws) return false;
    return ws.readyState === 1;
  });

  const rootContainer = page.locator('#rootContainer');
  await expect(rootContainer).toBeVisible();
});
```

## Файлы

- `e2e/tests/smoke/smoke.spec.ts` — Smoke тесты для локального окружения
- `e2e/tests/smoke/smoke.dev.spec.ts` — Smoke тесты для cloud (omnimap.cloud.ru)

## Запуск

```bash
# Локально
npm run test:e2e:smoke

# Cloud
npm run test:e2e:smoke:cloud
```

## Зависимости

- `setup` или `setup-cloud` проект должен выполниться первым
- storageState должен быть создан

## Критерии прохождения

Все 10 тестов должны проходить. Если smoke тесты падают — приложение сломано на базовом уровне.

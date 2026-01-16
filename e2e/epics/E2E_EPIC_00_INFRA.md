# Epic 0: Infrastructure & Fixtures (P0)

## Цель

Базовая инфраструктура для всех E2E тестов.
Обеспечивает изоляцию тестов, переиспользование авторизации, и правильную очистку данных.

## Среда тестирования

**Основная среда:** `http://omnimap.cloud.ru` (dev)

```bash
# Dev Cloud (основной способ)
npm run test:e2e:cloud

# Local (для отладки)
npm run test:e2e

# Specific project
npm run test:e2e:cloud:all
```

## Реализованные файлы

### Конфигурация

- `playwright.config.ts` — Multi-environment configuration
  - Проекты: setup, setup-cloud, smoke, smoke-cloud, chromium, cloud, firefox, webkit
  - BaseURL определяется через E2E_ENV и PLAYWRIGHT_BASE_URL

### Fixtures

- `e2e/fixtures/base.fixture.ts` — Base fixture with:
  - `mainPage` — MainPage без авторизации
  - `authenticatedPage` — MainPage с авторизацией
  - `apiHelper` — API request capturing
  - `indexedDB` — IndexedDB helper
  - `offlineHelper` — Network simulation
  - `cleanup` — Test data cleanup

- `e2e/fixtures/test-data.fixture.ts` — Test data factories:
  - `BlockFactory` — Create blocks via UI
  - `TreeFactory` — Create trees
  - Generators: `uniqueBlockTitle()`, `uniqueTreeName()`, etc.
  - Constants: TEST_BLOCKS, TEST_COLORS, CONNECTION_TYPES, SHAPE_PRESETS

- `e2e/fixtures/offline.fixture.ts` — Offline testing
- `e2e/fixtures/multiuser.fixture.ts` — Multi-browser sessions

### Helpers

- `e2e/helpers/api.helper.ts` — API request capturing and validation
- `e2e/helpers/block.helper.ts` — Block operations
- `e2e/helpers/storage.helper.ts` — IndexedDB operations
- `e2e/helpers/wait.helper.ts` — Wait conditions

### Page Objects

- `e2e/pages/base.page.ts` — Base page with common locators
- `e2e/pages/main.page.ts` — Main app page with auth and block operations

## Принципы тестов

1. **Self-contained fixtures** — тесты сами создают нужные данные в `beforeAll`
2. **Cleanup после тестов** — `afterAll` удаляет созданные данные
3. **Изоляция** — каждый тест независим от других
4. **Переиспользуемая авторизация** — `storageState` для ускорения

## Стратегия изоляции тестов

1. В `beforeAll`:
   - Создаём новое тестовое дерево через UI
   - Запоминаем его ID в `testData.testTreeId`

2. Проводим тесты в этом дереве

3. В `afterAll`:
   - Удаляем тестовое дерево через UI или API

## Тестовые пользователи

```typescript
TEST_USERS = {
  admin: {
    username: process.env.E2E_TEST_USERNAME || 'e2e_admin',
    password: process.env.E2E_TEST_PASSWORD || 'e2e_admin_password',
  },
  editor: { ... },
  viewer: { ... },
}
```

## Задачи

- [x] Обновить `playwright.config.ts` с поддержкой cloud
- [x] Создать `base.fixture.ts` с auth и cleanup
- [x] Создать `test-data.fixture.ts` с генераторами
- [x] Расширить helpers
- [ ] Настроить CI pipeline для cloud тестов

## Использование

```typescript
import { test, expect, uniqueBlockTitle } from '../fixtures/base.fixture';
import { BlockFactory } from '../fixtures/test-data.fixture';

test.describe('My Test Suite', () => {
  let testTreeId: string;

  test.beforeAll(async ({ cleanup }) => {
    testTreeId = await cleanup.createTestTree('MyTestTree');
  });

  test.afterAll(async ({ cleanup }) => {
    if (testTreeId) {
      await cleanup.deleteTree(testTreeId);
    }
  });

  test('should do something', async ({ authenticatedPage }) => {
    const title = uniqueBlockTitle('Test');
    await authenticatedPage.createBlock(title);
    await authenticatedPage.assertBlockWithTitleExists(title);
  });
});
```

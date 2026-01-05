# E2E тесты OmniMap

## Структура

```
e2e/
├── fixtures/           # Playwright fixtures
│   ├── auth.fixture.ts      # Авторизация (authenticatedPage)
│   ├── test-data.fixture.ts # Моки API
│   ├── websocket.fixture.ts # WebSocket хелпер
│   └── offline.fixture.ts   # Offline хелпер
├── pages/              # Page Objects
│   ├── base.page.ts
│   ├── main.page.ts
│   ├── login.page.ts
│   ├── chat.page.ts
│   └── popups/         # Page Objects для попапов
│       ├── search.popup.ts
│       ├── reminder.popup.ts
│       └── image-upload.popup.ts
├── helpers/            # Вспомогательные функции
│   ├── block.helper.ts
│   └── wait.helper.ts
├── tests/              # Тесты
│   ├── smoke/          # Smoke тесты (критичные)
│   ├── sync/           # Синхронизация
│   └── *.spec.ts       # Остальные тесты
├── .auth/              # Сохранённые сессии (gitignored)
└── global.setup.ts     # Глобальная авторизация
```

## Запуск тестов

### Локально

```bash
# Запуск dev сервера в одном терминале
npm run start_local

# В другом терминале - запуск тестов
npm run test:e2e

# Только smoke тесты
npm run test:e2e:smoke

# С UI режимом
npm run test:e2e:ui

# В headed режиме (с браузером)
npm run test:e2e:headed

# Debug режим
npm run test:e2e:debug
```

### Фильтрация по тегам

Тесты размечены тегами:
- `@smoke` - критичные тесты
- `@blocks` - операции с блоками
- `@offline` - offline режим
- `@sync` - синхронизация
- `@auth` - авторизация
- `@navigation` - навигация

```bash
# Запуск только offline тестов
npx playwright test --grep @offline

# Запуск тестов без тега @slow
npx playwright test --grep-invert @slow
```

## Архитектура

### Проекты Playwright

1. **setup** - выполняет авторизацию и сохраняет storageState
2. **smoke** - быстрые критичные тесты (зависят от setup)
3. **chromium/firefox/webkit** - основные тесты (зависят от setup)

### Shared storageState

Авторизация выполняется один раз в `global.setup.ts` и сохраняется в `e2e/.auth/user.json`.
Все последующие тесты переиспользуют эту сессию, что значительно ускоряет выполнение.

### Переменные окружения

- `E2E_TEST_USERNAME` - логин тестового пользователя
- `E2E_TEST_PASSWORD` - пароль тестового пользователя
- `PLAYWRIGHT_BASE_URL` - URL приложения для тестирования
- `CI` - включает CI режим (retries, reporters)

## Написание тестов

### Использование Page Objects

```typescript
import { test, expect } from '../fixtures/auth.fixture';

test('создание блока', async ({ authenticatedPage }) => {
  await authenticatedPage.createBlock('Новый блок');
  await authenticatedPage.assertBlockWithTitleExists('Новый блок');
});
```

### Использование хелперов

```typescript
import { createBlockHelper } from '../helpers';

test('создание блока', async ({ page }) => {
  const blocks = createBlockHelper(page);
  const title = blocks.uniqueTitle('Test');
  await blocks.createBlock(title);
  await blocks.assertBlockExists(title);
});
```

### WebSocket тесты

```typescript
import { test } from '../fixtures/websocket.fixture';

test('синхронизация', async ({ page, wsHelper }) => {
  await wsHelper.waitForConnection();
  await wsHelper.simulateBlockUpdate('block-1', { title: 'Updated' });
});
```

### Offline тесты

```typescript
import { test } from '../fixtures/offline.fixture';

test('offline режим', async ({ page, offlineHelper }) => {
  await offlineHelper.goOffline();
  await offlineHelper.waitForOfflineIndicator();
  // ... действия в offline
  await offlineHelper.goOnline();
});
```

## CI/CD

### Docker образ

```bash
docker build -f Dockerfile.e2e -t omnimap-e2e .
docker run --rm \
  -e PLAYWRIGHT_BASE_URL=http://app:80 \
  -e E2E_TEST_USERNAME=admin \
  -e E2E_TEST_PASSWORD=secret \
  omnimap-e2e
```

### Sharding

В CI тесты запускаются параллельно с помощью sharding:

```bash
npx playwright test --shard=1/4
npx playwright test --shard=2/4
npx playwright test --shard=3/4
npx playwright test --shard=4/4
```

## Troubleshooting

### Тесты не проходят авторизацию

1. Убедитесь, что бэкенд доступен
2. Проверьте переменные `E2E_TEST_USERNAME` и `E2E_TEST_PASSWORD`
3. Проверьте скриншоты в `e2e/test-results/`

### Flaky тесты

1. Увеличьте таймауты в проблемных местах
2. Используйте `test.describe.configure({ retries: 3 })`
3. Проверьте, что тест не зависит от порядка выполнения

### WebSocket тесты падают

WebSocket тесты требуют работающий sync-сервис. В мок-режиме они будут пропущены.

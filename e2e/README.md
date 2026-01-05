# E2E тесты OmniMap

## Важно: Реальный бэкенд

Все тесты работают с **реальным бэкендом** в тестовом кластере K8s.
Моки API не используются.

## Тестовые пользователи

Создаются скриптом `create_initial_data.py` на бэкенде:

| Пользователь | Роль | Описание |
|--------------|------|----------|
| `e2e_admin` | owner | Владелец корневого дерева |
| `e2e_editor` | editor | Редактор shared блоков |
| `e2e_viewer` | viewer | Только просмотр |

### Переменные окружения

```bash
# Основной пользователь (admin)
E2E_TEST_USERNAME=e2e_admin
E2E_TEST_PASSWORD=e2e_admin_password

# Редактор
E2E_EDITOR_USERNAME=e2e_editor
E2E_EDITOR_PASSWORD=e2e_editor_password

# Viewer
E2E_VIEWER_USERNAME=e2e_viewer
E2E_VIEWER_PASSWORD=e2e_viewer_password

# URL приложения
PLAYWRIGHT_BASE_URL=http://localhost:3000
```

## Структура

```
e2e/
├── fixtures/
│   ├── auth.fixture.ts        # Авторизация (authenticatedPage)
│   ├── multiuser.fixture.ts   # Мультипользовательские тесты
│   ├── test-data.fixture.ts   # Хелперы (без моков!)
│   ├── websocket.fixture.ts   # WebSocket хелпер
│   └── offline.fixture.ts     # Offline хелпер
├── pages/
│   ├── base.page.ts
│   ├── main.page.ts
│   ├── login.page.ts
│   └── chat.page.ts
├── helpers/
│   ├── block.helper.ts
│   └── wait.helper.ts
├── tests/
│   ├── 01-blocks-crud.spec.ts    # CRUD блоков (первый)
│   ├── 02-arrows.spec.ts         # Соединения (второй)
│   ├── 03-multiuser-sync.spec.ts # Синхронизация между пользователями
│   ├── smoke/                    # Smoke тесты
│   └── *.spec.ts                 # Остальные тесты
└── .auth/                        # Сохранённые сессии (gitignored)
```

## Запуск тестов

### Локально

```bash
# Запуск dev сервера
npm run start_local

# Все тесты
npm run test:e2e

# Только chromium
npm run test:e2e:chromium

# С UI
npm run test:e2e:ui

# Debug режим
npm run test:e2e:debug
```

### Фильтрация по тегам

```bash
# Только тесты синхронизации
npx playwright test --grep @sync

# Только мультипользовательские
npx playwright test --grep @multiuser

# Только права доступа
npx playwright test --grep @access
```

Доступные теги:
- `@smoke` - критичные тесты
- `@blocks` - операции с блоками
- `@sync` - синхронизация
- `@multiuser` - несколько пользователей
- `@access` - права доступа
- `@offline` - offline режим
- `@conflict` - конфликты редактирования

## Мультипользовательские тесты

### Использование fixtures

```typescript
import { test, expect } from '../fixtures/multiuser.fixture';

test('синхронизация между пользователями', async ({ adminSession, editorSession }) => {
  // Admin создаёт блок
  await adminSession.mainPage.createBlock('New Block');

  // Editor должен увидеть блок (через WebSocket)
  await editorSession.page.reload();
  await expect(editorSession.page.locator('text=New Block')).toBeVisible();
});
```

### Доступные сессии

- `adminSession` - сессия владельца (e2e_admin)
- `editorSession` - сессия редактора (e2e_editor)
- `viewerSession` - сессия viewer (e2e_viewer)
- `createSession(user)` - создать произвольную сессию

## Ожидание событий UI

Вместо `waitForTimeout` используем события приложения:

```typescript
import { waitForShowedBlocks } from '../fixtures/test-data.fixture';

// Ждём рендера блоков
await waitForShowedBlocks(page);

// Ждём диалога
await waitForDialog(page);

// Ждём N блоков
await waitForBlocksCount(page, 2);
```

## Порядок выполнения тестов

Тесты выполняются в алфавитном порядке файлов:

1. `01-blocks-crud.spec.ts` - создаёт блоки
2. `02-arrows.spec.ts` - использует созданные блоки
3. `03-multiuser-sync.spec.ts` - тесты синхронизации

## CI/CD

### Docker

```bash
docker build -f Dockerfile.e2e -t omnimap-e2e .
docker run --rm \
  -e PLAYWRIGHT_BASE_URL=http://frontend:80 \
  -e E2E_TEST_USERNAME=e2e_admin \
  -e E2E_TEST_PASSWORD=e2e_admin_password \
  -e E2E_EDITOR_USERNAME=e2e_editor \
  -e E2E_EDITOR_PASSWORD=e2e_editor_password \
  -e E2E_VIEWER_USERNAME=e2e_viewer \
  -e E2E_VIEWER_PASSWORD=e2e_viewer_password \
  omnimap-e2e
```

### Sharding

```bash
npx playwright test --shard=1/4
npx playwright test --shard=2/4
npx playwright test --shard=3/4
npx playwright test --shard=4/4
```

## Troubleshooting

### Тесты падают с таймаутом

1. Проверьте что бэкенд доступен
2. Проверьте что тестовые пользователи созданы
3. Проверьте логи в `e2e/test-results/`

### Мультипользовательские тесты не работают

1. Убедитесь что все 3 пользователя созданы на бэкенде
2. Проверьте что shared блоки имеют правильные права
3. Проверьте что WebSocket sync-сервис работает

### Блоки не появляются

Используйте `waitForShowedBlocks()` вместо `waitForTimeout()`:

```typescript
// Плохо
await page.waitForTimeout(500);

// Хорошо
await waitForShowedBlocks(page);
```

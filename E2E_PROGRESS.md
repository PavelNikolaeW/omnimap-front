# E2E Tests Progress

## Ветка: `feature/e2e-tests-rewrite`

## Статус выполнения эпиков

### ✅ Выполненные эпики

| Эпик | Тесты | Файл |
|------|-------|------|
| **Smoke Tests** | 8/8 passing | `e2e/tests/smoke/smoke.dev.spec.ts` |
| **Epic 1: Auth** | 7/7 passing | `e2e/tests/auth/auth.dev.spec.ts` |

### 🔶 Частично выполненные

| Эпик | Файл | Что сделано |
|------|------|-------------|
| **Epic 0: Infrastructure** | `playwright.config.ts`, `base.fixture.ts` | Cloud support, fixtures |
| **Epic 2: Blocks CRUD** | `e2e/tests/blocks/blocks.spec.ts` | Базовые тесты, нужна доработка для cloud |
| **Epic 3: Navigation** | `e2e/tests/navigation/navigation.spec.ts` | Базовые тесты |
| **Epic 4: Search** | `e2e/tests/search/search.spec.ts` | Базовые тесты |
| **Epic 5: Sync & Offline** | `e2e/tests/sync/offline.spec.ts` | Базовые тесты |

### ❌ Не начаты

- Epic 6: Diagram Mode (P0)
- Epic 7: Layout Editor (P1)
- Epic 8: Access & Permissions (P1)
- Epic 9: Chat System (P1)
- Epic 10: Colors (P2)
- Epic 11: Import/Export (P2)
- Epic 12: Reminders (P2)
- Epic 13: Other Features (P3)
- Epic 14: Sandbox & History (P3)

## Команды для запуска

```bash
# Smoke тесты на cloud
npm run test:e2e:smoke:cloud

# Auth тесты на cloud
E2E_ENV=cloud npx playwright test e2e/tests/auth/auth.dev.spec.ts --project=cloud

# Все cloud тесты
npm run test:e2e:cloud
```

## Ключевые файлы

### Конфигурация
- `playwright.config.ts` - multi-env config (local, cloud, smoke-cloud)
- `package.json` - npm scripts для cloud testing

### Fixtures
- `e2e/fixtures/base.fixture.ts` - auth, cleanup, IndexedDB helpers
- `e2e/fixtures/test-data.fixture.ts` - factories, generators

### Эпик документация
- `e2e/epics/E2E_EPIC_*.md` - описание тестов для каждого эпика
- `plans/floating-meandering-thacker.md` - полный план E2E тестирования

## Особенности cloud тестирования

1. **Сессия не сохраняется между тестами** - каждый тест re-логинится
2. **Используется регистрация нового юзера** - `smoke_<timestamp>`, `auth_test_<timestamp>`
3. **Таймауты увеличены** - `page.goto('/', { timeout: 60000 })`
4. **Проверка auth через `[block]`** - не через `#rootContainer`

## Следующие шаги

1. Доработать частично готовые эпики (2-5) для cloud
2. Начать Epic 6: Diagram Mode (P0)
3. Добавить multiuser тесты в Epic 5

## Последние изменения

- Исправлена проблема с таймаутами на cloud
- Добавлена логика re-authentication при потере сессии
- Исправлено определение authenticated state (через `[block]` вместо `#rootContainer`)

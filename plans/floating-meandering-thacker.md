# План E2E тестирования OmniMap Front

## Цель

**Полное переписывание** E2E тестов с нуля + покрытие новых фич.
Текущие 27 тестов устарели и не используются.

---

## Требования к инфраструктуре

### Среда тестирования

**Основная среда:** `http://omnimap.cloud.ru` (dev)

На данном этапе все тесты пишем и запускаем на dev среде.
CI pipeline с автоматизацией деплоя на тестовую среду — в следующей итерации.

**Конфигурация:**
```bash
# Dev Cloud (основной способ)
PLAYWRIGHT_BASE_URL=http://omnimap.cloud.ru npm run test:e2e

# Или через npm script
npm run test:e2e:cloud

# Local (для отладки)
npm run test:e2e
```

**Тестовый пользователь на dev:**
- регистируем в начале тестов нового юзера или несколько, если тестируем групповое взаимодействие. дале испоьзуем этих юзеров 

### Принципы тестов

1. **Self-contained fixtures** — тесты сами создают нужные данные в `beforeAll`
2. **Cleanup после тестов** — `afterAll` удаляет созданные данные (удаляем все блоки кроме корневого)
3. **Изоляция** — каждый тест независим от других
4. **Переиспользуемая авторизация** — `storageState` для ускорения

### IndexedDB Persistence (ВАЖНО!)

Приложение сохраняет данные в IndexedDB между сессиями:
- Блоки: `Block_{uuid}`
- Текущий пользователь: `currentUser`
- Деревья: `treeIds{username}`
- Offline очередь: `offlineOperationsQueue`

**Стратегия изоляции тестов:**

1. создаем новое дерево

2. проводим тесты в нем

3. после завершения тестов, удаляем это дерево через интерфейс 


---

## Структура результата

```
e2e/
├── epics/                      # Эпики для агента-тестировщика
│   ├── E2E_EPIC_00_INFRA.md   # Инфраструктура и fixtures
│   ├── E2E_EPIC_01_AUTH.md
│   ├── E2E_EPIC_02_BLOCKS.md
│   ├── ...
│   └── E2E_EPIC_14_SANDBOX.md
├── fixtures/                   # Переписанные fixtures
├── pages/                      # Переписанные Page Objects
├── helpers/                    # Переписанные helpers
└── tests/                      # Переписанные тесты
```

---

## Эпики (14 штук)

### Epic 0: Infrastructure & Fixtures (P0)
**Файл:** `E2E_EPIC_00_INFRA.md`
**Цель:** Базовая инфраструктура для всех тестов

**Задачи:**

1. **Обновить `playwright.config.ts`:**
   - Добавить `test:e2e:cloud` script для omnimap.cloud.ru
   - Настроить baseURL через env variable
   - Добавить project `cloud` для dev среды

2. **Создать `base.fixture.ts`:**
   - Auth с storageState для переиспользования сессии
   - **IndexedDB cleanup в beforeAll/afterAll**
   - Трекинг созданных блоков для cleanup
   - API helpers для прямых вызовов

3. **Расширить `OfflineHelper`:**
   - Добавить `cleanupAllBlocksExceptRoot()`
   - Добавить `deleteBlock(blockId)` через API
   - Добавить `clearIndexedDBExceptAuth()`

4. **Создать `test-data.fixture.ts`:**
   - Генераторы уникальных названий: `uniqueTitle(prefix)`
   - Фабрики тестовых блоков
   - Cleanup utilities

5. **Создать `base.page.ts` Page Object:**
   - Общие локаторы и методы
   - Wait helpers для загрузки приложения
   - IndexedDB assertions

6. **Настроить тестового пользователя на omnimap.cloud.ru:**
   - Создать `e2e_test_user`
   - Настроить права
   - Сохранить credentials в `.env.test`

**Критические файлы:**
- `playwright.config.ts`
- `e2e/fixtures/base.fixture.ts`
- `e2e/fixtures/offline.fixture.ts` (расширить)
- `e2e/pages/base.page.ts`

**Результат:** Инфраструктура готова, тесты изолированы, IndexedDB не влияет на результаты

---

### Epic 1: Auth (P0) — ПЕРЕПИСАТЬ
**Файл:** `E2E_EPIC_01_AUTH.md`
**Тестов:** 8
**Заменяет:** `auth.spec.ts`, `auth.setup.ts`

**Тест-кейсы:**
1. AU-01: Успешный логин
2. AU-02: Логин с неверным паролем
3. AU-03: Логин с несуществующим пользователем
4. AU-04: Успешная регистрация
5. AU-05: Регистрация с существующим email
6. AU-06: Logout
7. AU-07: Refresh token (auto)
8. AU-08: Session persistence после reload

---

### Epic 2: Blocks CRUD (P0) — ПЕРЕПИСАТЬ
**Файл:** `E2E_EPIC_02_BLOCKS.md`
**Тестов:** 25
**Заменяет:** `blocks-*.spec.ts` (8 файлов)

**Тест-кейсы:**

**Создание:**
- BL-CR-01: Создать блок через hotkey `n`
- BL-CR-02: Создать блок через кнопку UI
- BL-CR-03: Создать вложенный блок
- BL-CR-04: Создать блок с длинным названием
- BL-CR-05: Отмена создания (Escape)

**Редактирование:**
- BL-ED-01: Изменить название блока (hotkey `t`)
- BL-ED-02: Изменить текст блока (hotkey `w`)
- BL-ED-03: Markdown в тексте блока
- BL-ED-04: Inline edit по двойному клику

**Удаление:**
- BL-DE-01: Удалить блок через hotkey `Shift+D`
- BL-DE-02: Удалить блок через контекстное меню
- BL-DE-03: Подтверждение удаления
- BL-DE-04: Каскадное удаление дочерних

**Копирование:**
- BL-CP-01: Копировать блок `Shift+C` + `Shift+V`
- BL-CP-02: Вставить блок как ссылку `Shift+L`
- BL-CP-03: Копировать несколько блоков

**Перемещение:**
- BL-MV-01: Вырезать и вставить `Shift+X` + `Shift+V`
- BL-MV-02: Drag-and-drop (Shift+drag)
- BL-MV-03: Вставить перед блоком `Shift+Ctrl+V`

**Множественное выделение:**
- BL-MS-01: Выделить несколько блоков (Shift+click)
- BL-MS-02: Операции с выделенными блоками

**Undo/Redo:**
- BL-UR-01: Undo создания `Shift+Z`
- BL-UR-02: Undo удаления
- BL-UR-03: Redo `Shift+Ctrl+Z`
- BL-UR-04: Цепочка undo/redo

---

### Epic 3: Navigation (P0) — ПЕРЕПИСАТЬ
**Файл:** `E2E_EPIC_03_NAVIGATION.md`
**Тестов:** 15
**Заменяет:** `navigation.spec.ts`, `hotkeys.spec.ts`

**Тест-кейсы:**
- NAV-01: Открыть блок (Enter/dblclick)
- NAV-02: Назад к родителю (Backspace)
- NAV-03: Стрелки Up/Down/Left
- NAV-04: Breadcrumb навигация
- NAV-05: Tree navigation `space+1..9`
- NAV-06: Создать новое дерево
- NAV-07: Переключение между деревьями
- NAV-08: URL deep linking
- NAV-09: Browser back/forward
- NAV-10: Scroll to block
- NAV-11-15: Edge cases

---

### Epic 4: Search (P1) — ПЕРЕПИСАТЬ
**Файл:** `E2E_EPIC_04_SEARCH.md`
**Тестов:** 10
**Заменяет:** `search.spec.ts`

**Тест-кейсы:**
- SR-01: Открыть поиск (hotkey `f`)
- SR-02: Поиск по названию
- SR-03: Поиск по содержимому
- SR-04: Поиск везде vs в текущем дереве
- SR-05: Переход к найденному блоку
- SR-06: Подсветка результатов
- SR-07: Пустой результат
- SR-08: Поиск по специальным символам
- SR-09: Поиск с фильтрами
- SR-10: Keyboard navigation в результатах

---

### Epic 5: Sync & Offline (P0) — ПЕРЕПИСАТЬ
**Файл:** `E2E_EPIC_05_SYNC.md`
**Тестов:** 20
**Заменяет:** `sync-*.spec.ts`, `offline.spec.ts`

**Тест-кейсы:**

**WebSocket sync:**
- SY-WS-01: Подключение WebSocket при загрузке
- SY-WS-02: Reconnect после disconnect
- SY-WS-03: Получение обновления от другого пользователя
- SY-WS-04: Debounce обновлений (50ms)
- SY-WS-05: Sync indicator состояния

**Multiuser:**
- SY-MU-01: Два пользователя редактируют разные блоки
- SY-MU-02: Два пользователя редактируют один блок
- SY-MU-03: Конфликт редактирования
- SY-MU-04: Права доступа в real-time

**Offline:**
- SY-OF-01: Создание блока offline
- SY-OF-02: Редактирование offline
- SY-OF-03: Offline queue persistence
- SY-OF-04: Sync при восстановлении сети
- SY-OF-05: Pull-before-push
- SY-OF-06: Conflict resolution
- SY-OF-07: Retry с backoff
- SY-OF-08: Error handling (4xx/5xx)
- SY-OF-09: IndexedDB persistence
- SY-OF-10: Background sync (SW)

---

### Epic 6: Diagram Mode (P0) — НОВЫЙ
**Файл:** `E2E_EPIC_06_DIAGRAM.md`
**Тестов:** 35
**Заменяет:** `02-arrows.spec.ts` (расширяет)

**Тест-кейсы:**

**Grid:**
- DG-GR-01..06: Col/Row add/remove, sizes

**Connections:**
- DG-CN-01: Создать соединение (hotkey `a`)
- DG-CN-02..10: Типы: dashed, double, curved, straight, orthogonal, self-loop
- DG-CN-11: Удалить соединение `Shift+A`
- DG-CN-12: Anchor selection
- DG-CN-13: Connection labels

**Block Styles:**
- DG-ST-01..08: Shape presets (process, decision, data, database, document, terminal, manual, subprocess)
- DG-ST-09..15: Background, border, shadow, font-size, text-align
- DG-ST-16: Reset styles

**Operations:**
- DG-OP-01..05: Add/delete/drag blocks in diagram

---

### Epic 7: Layout Editor (P1) — НОВЫЙ
**Файл:** `E2E_EPIC_07_LAYOUT.md`
**Тестов:** 20

**Тест-кейсы:**
- LY-01: Открыть редактор `l+e`
- LY-02..11: Пресеты (2x2, 3x3, 4x4, sidebar, dashboard, kanban, holy-grail, gallery, calendar)
- LY-12: Drag-drop между ячейками
- LY-13: Save/Cancel
- LY-14: Persistence
- LY-15..20: Edge cases

---

### Epic 8: Access & Permissions (P1) — ПЕРЕПИСАТЬ + НОВЫЙ
**Файл:** `E2E_EPIC_08_ACCESS.md`
**Тестов:** 20

**Тест-кейсы:**

**Permissions popup:**
- AC-PM-01: Открыть `Shift+P`
- AC-PM-02..05: Добавить/удалить пользователя, изменить права

**Access Requests (НОВЫЙ):**
- AC-RQ-01: Открыть AccessRequestsPopup `Shift+R`
- AC-RQ-02: Запросить доступ
- AC-RQ-03: Одобрить/отклонить
- AC-RQ-04: WebSocket notification
- AC-RQ-05..10: Edge cases

**URL Sharing:**
- AC-UR-01..05: Создать/проверить/удалить публичную ссылку

---

### Epic 9: Chat System (P1) — НОВЫЙ
**Файл:** `E2E_EPIC_09_CHAT.md`
**Тестов:** 25

**Тест-кейсы:**
- CH-01: Открыть чат `Shift+M`
- CH-02..06: Личные чаты CRUD
- CH-07..12: Групповые чаты CRUD
- CH-13..18: AI чат (mock LLM)
- CH-19..25: Messages, notifications, deep links

---

### Epic 10: Colors (P2) — ПЕРЕПИСАТЬ
**Файл:** `E2E_EPIC_10_COLORS.md`
**Тестов:** 15
**Заменяет:** `colors.spec.ts`

**Тест-кейсы:**
- CO-01..09: Hotkeys 1+2, 1+4, 2+3, etc.
- CO-10: Reset (0, -)
- CO-11: White/Dark (c+w, c+d)
- CO-12: Persistence
- CO-13..15: Edge cases

---

### Epic 11: Import/Export (P2) — ПЕРЕПИСАТЬ
**Файл:** `E2E_EPIC_11_IMPORT.md`
**Тестов:** 12
**Заменяет:** `import.spec.ts`

**Тест-кейсы:**
- IM-01..12: ImportPopup, valid/invalid JSON, nested, progress

---

### Epic 12: Reminders & Subscriptions (P2) — ПЕРЕПИСАТЬ
**Файл:** `E2E_EPIC_12_REMINDERS.md`
**Тестов:** 12
**Заменяет:** `reminders-subscriptions.spec.ts`

**Тест-кейсы:**
- RM-01..06: Reminders CRUD
- SB-01..06: Subscriptions CRUD

---

### Epic 13: Other Features (P3)
**Файл:** `E2E_EPIC_13_OTHER.md`
**Тестов:** 15
**Заменяет:** `popups.spec.ts`, `text-editor.spec.ts`, `image-upload.spec.ts`, `ui-components.spec.ts`, `onboarding.spec.ts`

**Тест-кейсы:**
- OT-TX-01..05: Text editor
- OT-IM-01..03: Image upload
- OT-ON-01..03: Onboarding
- OT-UI-01..04: UI components

---

### Epic 14: Sandbox & History (P3) — НОВЫЙ
**Файл:** `E2E_EPIC_14_SANDBOX.md`
**Тестов:** 15

**Тест-кейсы:**
- SB-01..08: Sandbox mode
- HI-01..07: History popup (если включено)

---

## Smoke Tests (P0)

**Файл:** `E2E_EPIC_SMOKE.md`
**Тестов:** 10
**Заменяет:** `smoke/smoke.spec.ts`

Критические тесты для CI на каждый PR:

1. SM-01: App загружается
2. SM-02: Login работает
3. SM-03: Создать блок
4. SM-04: Открыть блок
5. SM-05: Редактировать блок
6. SM-06: Удалить блок
7. SM-07: WebSocket подключается
8. SM-08: Поиск работает
9. SM-09: Persistence после reload
10. SM-10: Logout

---

## Приоритеты реализации

### Фаза 1: Инфраструктура + Core (P0)
1. Epic 0: Infrastructure
2. Epic 1: Auth
3. Smoke Tests
4. Epic 2: Blocks CRUD
5. Epic 3: Navigation
6. Epic 5: Sync & Offline

### Фаза 2: Advanced Features (P0-P1)
7. Epic 6: Diagram Mode
8. Epic 4: Search
9. Epic 8: Access & Permissions
10. Epic 7: Layout Editor

### Фаза 3: Extended (P1-P2)
11. Epic 9: Chat System
12. Epic 10: Colors
13. Epic 11: Import/Export
14. Epic 12: Reminders

### Фаза 4: Low Priority (P3)
15. Epic 13: Other Features
16. Epic 14: Sandbox & History

---

## Новая структура файлов

```
e2e/
├── fixtures/
│   ├── base.fixture.ts          # Base fixture with auth
│   ├── test-data.fixture.ts     # Data generators
│   ├── multiuser.fixture.ts     # Multi-browser sessions
│   ├── offline.fixture.ts       # Network simulation
│   ├── websocket.fixture.ts     # WebSocket mocking
│   ├── diagram.fixture.ts       # Diagram test data
│   ├── chat.fixture.ts          # Chat mocking
│   └── llm.fixture.ts           # LLM Gateway mocking
├── pages/
│   ├── base.page.ts             # Base page object
│   ├── main.page.ts             # Main app page
│   ├── auth.page.ts             # Auth forms
│   ├── diagram.page.ts          # Diagram mode
│   └── popups/
│       ├── search.popup.ts
│       ├── access.popup.ts
│       ├── accessRequests.popup.ts
│       ├── import.popup.ts
│       ├── layoutEditor.popup.ts
│       ├── blockStyle.popup.ts
│       ├── reminder.popup.ts
│       └── chat.panel.ts
├── helpers/
│   ├── block.helper.ts
│   ├── api.helper.ts
│   ├── storage.helper.ts
│   ├── sync.helper.ts
│   ├── wait.helper.ts
│   └── websocket.helper.ts
└── tests/
    ├── smoke/
    │   └── smoke.spec.ts
    ├── auth/
    │   └── auth.spec.ts
    ├── blocks/
    │   └── blocks.spec.ts
    ├── navigation/
    │   └── navigation.spec.ts
    ├── search/
    │   └── search.spec.ts
    ├── sync/
    │   ├── websocket.spec.ts
    │   ├── multiuser.spec.ts
    │   └── offline.spec.ts
    ├── diagram/
    │   ├── grid.spec.ts
    │   ├── connections.spec.ts
    │   └── styles.spec.ts
    ├── layout/
    │   └── layout-editor.spec.ts
    ├── access/
    │   ├── permissions.spec.ts
    │   ├── requests.spec.ts
    │   └── urls.spec.ts
    ├── chat/
    │   ├── personal.spec.ts
    │   ├── groups.spec.ts
    │   └── ai.spec.ts
    ├── colors/
    │   └── colors.spec.ts
    ├── import/
    │   └── import.spec.ts
    ├── reminders/
    │   └── reminders.spec.ts
    └── other/
        ├── text-editor.spec.ts
        ├── image-upload.spec.ts
        └── onboarding.spec.ts
```

---

## Обновление playwright.config.ts

```typescript
// Добавить поддержку omnimap.cloud.ru
const baseURL = process.env.PLAYWRIGHT_BASE_URL
  || (process.env.CI ? 'http://localhost:9003' : 'http://localhost:3000');

// Добавить проект для cloud тестирования
{
  name: 'cloud',
  testMatch: /.*\.spec\.ts$/,
  use: {
    baseURL: 'http://omnimap.cloud.ru',
    storageState: authFile,
  },
  dependencies: ['setup-cloud'],
}
```

---

## Команды запуска

```bash
# Local development
npm run test:e2e

# CI Pipeline
CI=true npm run test:e2e

# Cloud (omnimap.cloud.ru)
npm run test:e2e:cloud
# или
PLAYWRIGHT_BASE_URL=http://omnimap.cloud.ru npm run test:e2e

# Только smoke
npm run test:e2e:smoke

# Конкретный эпик
npm run test:e2e -- --grep "@blocks"
```

---

## Теги для фильтрации

| Тег | Назначение |
|-----|------------|
| `@smoke` | Smoke тесты (каждый PR) |
| `@auth` | Авторизация |
| `@blocks` | Операции с блоками |
| `@navigation` | Навигация |
| `@sync` | Синхронизация |
| `@offline` | Offline режим |
| `@multiuser` | Мультипользователь |
| `@diagram` | Диаграммы |
| `@layout` | Layout editor |
| `@access` | Доступ и права |
| `@chat` | Чат система |
| `@slow` | Долгие тесты |

---

## Критические файлы для изменения

1. `playwright.config.ts` — multi-env config
2. `e2e/fixtures/` — все fixtures переписать
3. `e2e/pages/` — все page objects переписать
4. `e2e/tests/` — все тесты переписать
5. `package.json` — добавить npm scripts

---

## Итого

| Метрика | Значение |
|---------|----------|
| Эпиков | 14 + Smoke |
| Тестов | ~220 |
| Новых fixtures | 8 |
| Новых page objects | 12 |
| Переписанных файлов | 27 |

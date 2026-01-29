# OmniMap E2E Verification Plan

Полный план E2E покрытия всех фич проекта. Каждая задача — отдельный `/verify` запуск.

---

## Статус

| # | Фича | Файл теста | Статус |
|---|-------|-----------|--------|
| 1 | Auth | `auth.spec.ts` | [x] |
| 2 | Blocks: CRUD | `verify-1769595071-{a,b,c}.spec.ts` | [x] PASS 16/16 |
| 3 | Blocks: Text Editor | `blocks-text-editor.spec.ts` | [x] |
| 4 | Blocks: Copy/Paste/Link | `verify-1769690304-{a,b,c}.spec.ts` | [x] PASS 9/12 (2026-01-29) |
| 5 | Blocks: Cut/Move | `blocks-cut-move.spec.ts` | [ ] |
| 6 | Blocks: Multi-select | `blocks-multiselect.spec.ts` | [ ] |
| 7 | Blocks: Undo/Redo | `blocks-undo-redo.spec.ts` | [ ] |
| 8 | Blocks: Colors | `blocks-colors.spec.ts` | [ ] |
| 9 | Navigation | `navigation.spec.ts` | [ ] |
| 10 | Search | `search.spec.ts` | [ ] |
| 11 | Connections/Arrows | `connections.spec.ts` | [ ] |
| 12 | Diagram Mode | `diagram-mode.spec.ts` | [ ] |
| 13 | Block Styles (shapes, borders, shadows) | `block-styles.spec.ts` | [ ] |
| 14 | Layout Editor | `layout-editor.spec.ts` | [ ] |
| 15 | Permissions & Access | `permissions.spec.ts` | [ ] |
| 16 | Image Upload | `image-upload.spec.ts` | [ ] |
| 17 | Import | `import.spec.ts` | [ ] |
| 18 | Chat (DM, Group, Block comments) | `chat.spec.ts` | [ ] |
| 19 | Reminders & Subscriptions | `reminders.spec.ts` | [ ] |
| 20 | Hotkeys & Commands | `hotkeys.spec.ts` | [ ] |
| 21 | Onboarding | `onboarding.spec.ts` | [ ] |
| 22 | Offline: UI индикаторы и статус сети | `offline-ui.spec.ts` | [ ] |
| 23 | Offline: Очередь операций (CRUD оффлайн) | `offline-queue.spec.ts` | [ ] |
| 24 | Offline: Sync pull-push цикл | `offline-sync-cycle.spec.ts` | [ ] |
| 25 | Offline: Перебои сети и восстановление | `network-interruptions.spec.ts` | [ ] |
| 26 | Offline: WebSocket reconnect и heartbeat | `ws-reconnect.spec.ts` | [ ] |
| 27 | Offline: Edge cases (sleep, конфликты, сессия) | `offline-edge-cases.spec.ts` | [ ] |
| 28 | Multi-user Sync | `multiuser-sync.spec.ts` | [ ] |
| 29 | Tree Management | `tree-management.spec.ts` | [ ] |
| 30 | Iframe Blocks | `iframe-blocks.spec.ts` | [ ] |
| 31 | Options/Settings | `options.spec.ts` | [ ] |

---

## Задача 1: Auth

**Скоуп:** Логин, регистрация, logout, JWT refresh, anonymous mode

**Сценарии:**
1. Успешный логин с валидными credentials → блоки загружаются
2. Ошибка логина с невалидным паролем → сообщение об ошибке
3. Ошибка логина с несуществующим username → сообщение об ошибке
4. Пустые поля → валидация формы
5. Logout → редирект на форму логина, cookies очищены
6. Refresh страницы после логина → сессия сохранена (JWT в cookies)
7. Anonymous mode → read-only, ограниченный UI

**Ключевые файлы:** `src/js/auth/auth.js`, `src/js/painter/views/auth.js`, `src/js/painter/views/registration.js`
**Fixtures:** `authenticatedPage`, `TEST_USERS`

---

## Задача 2: Blocks — CRUD

**Скоуп:** Создание, чтение, редактирование заголовка, удаление блоков

**Сценарии:**
1. Создание блока через hotkey `n` → попап ввода title → блок появляется
2. Создание блока через кнопку в control panel → тот же флоу
3. Создание блока с URL → создаётся iframe-блок
4. Создание блока с пустым title → не создаётся (или создаётся без title?)
5. Создание блока со спецсимволами в title (кавычки, скобки, unicode)
6. Редактирование title через `t` → popup → изменение сохраняется
7. Удаление блока через `shift+d` → блок исчезает
8. Удаление блока с children → дети удаляются каскадно
9. Удаление при multi-select → все выбранные удаляются
10. Проверка через API: блок реально создан/обновлён/удалён на сервере

**Ключевые файлы:** `src/js/actions/blockActions.js`, `src/js/controller/comands/commands.js`
**Fixtures:** `authenticatedPage`, `apiHelper`, `blockFactory`

---

## Задача 3: Blocks — Text Editor

**Скоуп:** Редактирование текстового контента блока (NoteEditor)

**Сценарии:**
1. Открытие текстового редактора через `w` → режим TEXT_EDIT
2. Ввод текста → сохранение при выходе (Escape)
3. Ввод HTML/rich text → корректный рендеринг
4. Выход без сохранения (Escape без изменений)
5. Длинный текст → корректное отображение
6. Пустой текст → очистка контента
7. Режим TEXT_EDIT блокирует другие hotkeys

**Ключевые файлы:** `src/js/controller/noteEditor.js`
**Fixtures:** `authenticatedPage`

---

## Задача 4: Blocks — Copy/Paste/Link

**Скоуп:** Копирование, вставка, создание ссылок на блоки

**Сценарии:**
1. `shift+c` на блоке → ID в clipboard
2. `shift+c` на multi-select → array IDs в clipboard
3. `shift+v` (paste) → блок копируется в текущий parent
4. `shift+g` (paste link) → ссылка на блок (не копия)
5. Вставка из другого дерева → копия создаётся
6. Link block отображается с атрибутом blocklink
7. Клик на link block → навигация к оригиналу
8. все функции на ссылке работают так же как и на обычнос блоке.

**Ключевые файлы:** `src/js/actions/selectionActions.js`, `src/js/actions/blockActions.js`
**Fixtures:** `authenticatedPage`, `apiHelper`

---

## Задача 5: Blocks — Cut/Move

**Скоуп:** Перемещение блоков между родителями

**Сценарии:**
1. `shift+x` → режим CUT_BLOCK, блок выделен визуально
2. Shift+Click на другие блоки → multi-cut
3. `shift+v` в cut mode → блок перемещён в новый parent
4. `shift+ctrl+v` → вставка перед выбранным блоком
5. Escape в cut mode → отмена операции
6. Перемещение блока в себя → запрещено (circular reference)
7. Порядок children обновляется корректно
8. перенос блоков- ссылок работает правльно
9. перенос блоков внутри диаграммы работает правильно

**Ключевые файлы:** `src/js/actions/selectionActions.js`
**Fixtures:** `authenticatedPage`, `apiHelper`

---

## Задача 6: Blocks — Multi-select

**Скоуп:** Выделение нескольких блоков, массовые операции

**Сценарии:**
1. Shift+Click → добавление/удаление блока из selection
2. Visual indicator: выбранные блоки выделены стилем
3. Массовое удаление (`shift+d`) → все выбранные удалены
4. Массовый cut (`shift+x`) → все выбранные в буфере
5. Массовый copy (`shift+c`) → все IDs в clipboard
6. Escape → сброс selection
7. Клик без Shift → сброс selection, выбран один блок
8. быстрое выделение многоих блоков
**Ключевые файлы:** `src/js/controller/comands/contextManager.js`
**Fixtures:** `authenticatedPage`

---

## Задача 7: Blocks — Undo/Redo

**Скоуп:** Отмена и повтор операций

**Сценарии:**
1. Создание блока → undo (`shift+z`) → блок удалён
2. Удаление блока → undo → блок восстановлен
3. Redo (`shift+ctrl+z`) после undo → операция повторена
4. Множественные undo → корректная последовательность
5. Новая операция после undo → redo stack очищен
6. Кнопки undo/redo в control panel работают
7. мнодественные операции переноса блока, копирования, вставки, редактирования, удаления, udno работает правильно 
8. мнодественные операции переноса блока, копирования, вставки, редактирования, удаления, udno, redo рабоатет правильно
9. undo/redo для соединений блоков 
**Ключевые файлы:** `src/js/controller/undoManager.js`
**Fixtures:** `authenticatedPage`

---

## Задача 8: Blocks — Colors

**Скоуп:** Цвет блоков, HSL

**Сценарии:**
1. Изменение цвета блока через colorCommands → визуальное изменение
2. Цвет сохраняется при перезагрузке
3. Дочерние блоки наследуют оттенок parent
4. HSL формат [H, S, L] корректно рендерится
5. Предустановленные цвета (9 градиентов) работают

**Ключевые файлы:** `src/js/controller/comands/colorCommands.js`, `src/js/painter/calcBlockColor.js`
**Fixtures:** `authenticatedPage`

---

## Задача 9: Navigation

**Скоуп:** Навигация по дереву блоков, breadcrumbs, history

**Сценарии:**
1. Enter на блоке → вход внутрь, children отображаются
2. Backspace → возврат на уровень вверх
3. Breadcrumbs обновляются при навигации
4. Клик на breadcrumb → переход на этот уровень
5. Глубокая навигация (5+ уровней) → path корректен
6. `space+1-9` → переключение между деревьями
7. `space+0` → последнее активное дерево
8. Кнопка "назад" в UI работает

**Ключевые файлы:** `src/js/actions/navigationActions.js`, `src/js/controller/breadcrumbs.js`
**Fixtures:** `authenticatedPage`

---

## Задача 10: Search

**Скоуп:** Поиск блоков

**Сценарии:**
1. Открытие поиска через `/` → popup с полем ввода
2. Ввод запроса → результаты появляются (debounce 400ms)
3. Клик на результат → блок копируется (dispatch CopyBlock)
4. "Искать везде" toggle → поиск по всем деревьям
5. Пустой запрос → нет результатов
6. Запрос без совпадений → "ничего не найдено"
7. Закрытие popup через Escape
8. Поиск по title и text content

**Ключевые файлы:** `src/js/controller/searchWindow.js`, popup SearchBlocksPopup
**Fixtures:** `authenticatedPage`, `SearchPopup` page object

---

## Задача 11: Connections/Arrows

**Скоуп:** Создание, настройка и удаление связей между блоками

**Сценарии:**
1. `a` → режим CONNECT_TO_BLOCK → клик на target → стрелка создана
2. `a` → режим CONNECT_SELECT_SOURCE → клик на source → клик на target → стрелка
3. Разные типы: dashed (`a+d`), double (`a+b`), curved (`a+c`), straight (`a+s`), orthogonal (`a+o`)
4. Self-loop (`a+l`) → стрелка на себя
5. `shift+a` → удаление connection
6. Connection визуально отображается (jsPlumb)
7. Connection сохраняется в block.data.connections
8. Anchor points (top/right/bottom/left) работают
9. Escape → отмена создания connection
10. клик на соединение открывает попап редактирования соединения
11. при открытом попапе клик вне его закрывает попап и не открывает блок если клик был по блоку 
**Ключевые файлы:** `src/js/controller/connectionTypes.js`, commands: connectBlock, connectDashed, etc.
**Fixtures:** `authenticatedPage`, `apiHelper`

---

## Задача 12: Diagram Mode

**Скоуп:** Режим диаграмм с grid, кнопками управления

**Сценарии:**
1. Активация diagram mode → UI кнопок (+C/-C, +R/-R, Size presets)
2. `+C` / `-C` → изменение количества колонок
3. `+R` / `-R` → изменение количества строк
4. Size presets: XS(3x3), S(4x4), M(5x5), L(6x6)
5. `diagramAddBlock` → создаёт ровно 1 блок
6. `diagramReset` → сброс grid к дефолту
7. `diagramBlockStyle` → панель стилей (shape, shadow, border)
8. `diagramConnectionSettings` → панель настройки connections
9. `diagramResetBlockStyle` → сброс кастомных стилей
10. Drag & Drop блоков в grid ячейки
11. перетаскивание внешних блоков в диаграмму. блоки имеет такой же размер как и минимальный блок в диаграмме
12. перетаскиваем большой блок в диаграмме, он не меняет размер (не уменьшается до самого маленького)

**Ключевые файлы:** `src/js/controller/diagramUtils.js`, diagram commands
**Fixtures:** `authenticatedPage`

---

## Задача 13: Block Styles (shapes, borders, shadows)

**Скоуп:** Визуальные стили блоков в diagram mode

**Сценарии:**
1. Применение каждой shape: process, decision, data, database, document, terminal, manual, subprocess
2. Borders: thin, medium, dashed
3. Shadows: none, sm, md, lg
4. Shape сохраняется в block.data.customStyles
5. Стили видны после reload
6. Reset styles → стили сброшены

**Ключевые файлы:** `src/js/controller/blockStyleManager.js`
**Fixtures:** `authenticatedPage`

---

## Задача 14: Layout Editor

**Скоуп:** Visual grid editor для кастомных layout

**Сценарии:**
1. Открытие Layout Editor
2. Drag блоков в ячейки grid
3. Cell spanning: rowSpan/colSpan
4. Применение шаблонов (2x2, 3x3, sidebar, dashboard, kanban, gallery, calendar)
5. Сохранение layout в block.data.layoutCells
6. Layout отображается корректно при re-open

**Ключевые файлы:** `src/js/controller/layoutEditor/`
**Fixtures:** `authenticatedPage`

---

## Задача 15: Permissions & Access

**Скоуп:** Система прав доступа

**Сценарии:**
1. Владелец видит все операции
2. Editor может редактировать, но не удалять
3. Viewer может только смотреть (read-only UI)
4. AccessPopup: назначение прав пользователю
5. AccessRequestsPopup: одобрение/отклонение запросов
6. Public link → доступ по ссылке
7. Блоки без прав → скрыты или read-only

**Ключевые файлы:** `src/js/utils/functions.js` (permission checks), AccessPopup
**Fixtures:** `multiuserFixture` (admin, editor, viewer sessions)

---

## Задача 16: Image Upload

**Скоуп:** Загрузка изображений в блоки

**Сценарии:**
1. Открытие ImageUploadPopup
2. Upload через file input → preview появляется
3. Drag & Drop → highlight dropzone → upload
4. Progress indicator во время загрузки
5. Удаление изображения
6. Открытие fullsize
7. Некорректный файл → error message
8. Проверка что изображения рендерятся на любом размере блока правльно
9. проврка рендара на любом рамещер блока для изображения которое установлено в фон блока
10. изменить настройки для загруженного изобрадения
11. сделать фоновое изображение блока обчным
12. сделать обычное изобраджение в блоке фоновым.
13. добавить дочерние блоки в блоки с изображением и проверить что ничего не ломается 
**Ключевые файлы:** ImageUploadPopup
**Fixtures:** `authenticatedPage`, `ImageUploadPopup` page object

---

## Задача 17: Import

**Скоуп:** Импорт данных (блоков, деревьев)

**Сценарии:**
1. Открытие ImportPopup
2. Upload JSON файла → блоки создаются
3. Некорректный формат → ошибка
4. Импорт с вложенной структурой → иерархия сохранена

**Ключевые файлы:** `src/js/api/importService.js`, ImportPopup
**Fixtures:** `authenticatedPage`, `apiHelper`

---

## Задача 18: Chat (DM, Group, Block Comments)

**Скоуп:** Чат-система: личные сообщения, групповые чаты, комментарии к блокам

**Сценарии:**
1. Открытие чата через `m` → UnifiedChatPanel
2. Отправка DM → сообщение появляется у получателя
3. Создание группового чата → участники видят чат
4. Отправка в группу → все участники видят
5. Block comment → комментарий привязан к блоку
6. Unread count → badge обновляется
7. Переключение между personal / group / AI tabs

**Ключевые файлы:** `src/js/api/chatApi.js`, Chat popups
**Fixtures:** `multiuserFixture`, `authenticatedPage`

---

## Задача 19: Reminders & Subscriptions

**Скоуп:** Напоминания и подписки на изменения блоков

**Сценарии:**
1. Создание reminder через ReminderPopup → дата, время, сообщение
2. Repeat options: none, daily, weekly, monthly
3. Список reminders → RemindersListPopup
4. Удаление reminder
5. Фильтры: pending, sent, all
6. Subscription на блок → уведомление при изменении
7. Список подписок → SubscriptionsListPopup

**Ключевые файлы:** ReminderPopup, SubscriptionPopup
**Fixtures:** `authenticatedPage`, `ReminderPopup` page object

---

## Задача 20: Hotkeys & Commands

**Скоуп:** Горячие клавиши, popup справка, remapping

**Сценарии:**
1. `?` → HotkeyPopup с полным списком команд
2. Каждый hotkey из таблицы работает в своём mode
3. Hotkeys не работают в TEXT_EDIT mode (кроме Escape)
4. Hotkey remapping → изменение сохраняется
5. Кнопки control panel дублируют hotkeys
6. Контекстная доступность: команды зависят от текущего mode

**Ключевые файлы:** `src/js/controller/comands/commands.js`, `contextManager.js`
**Fixtures:** `authenticatedPage`

---

## Задача 21: Onboarding

**Скоуп:** Туториал для новых пользователей

**Сценарии:**
1. Новый пользователь → welcome banner
2. Tutorial blocks → предсозданный граф
3. Contextual hints → подсказки при действиях
4. Dismiss tutorial → больше не показывается
5. Completion tracking → onboarding завершён

**Ключевые файлы:** `src/js/onboarding/OnboardingManager.js`, `tutorialGraph.js`, `welcomeBanner.js`
**Fixtures:** нужен чистый пользователь без истории

---

## Задача 22: Offline — UI индикаторы и статус сети

**Скоуп:** Визуальная обратная связь при изменении состояния сети. Пользователь должен всегда понимать: онлайн он, оффлайн, или идёт синхронизация.

**Ключевые файлы:** `src/js/sincManager/networkStatusUI.js` (278 строк), `src/js/core/statusIndicators.js` (352 строки), `src/js/core/healthCheck.js` (342 строки)

**Сценарии:**
1. **Offline bar появляется при потере сети** → красная полоса сверху с текстом "Нет подключения"
2. **Pending count отображается** → "X изменений ждут синхронизации" показывает количество неотправленных операций
3. **Online → уведомление исчезает через 3 секунды** → brief notification "Подключение восстановлено"
4. **LED индикаторы:**
   - WebSocket LED → зелёный (подключен), жёлтый (переподключение), красный (отключен)
   - API LED → зелёный (ок), мигает при синхронизации (CSS `.syncing`)
   - IndexedDB LED → зелёный/красный
5. **Health check при старте** → проверка IndexedDB, Backend, WebSocket, LLM Gateway, Browser APIs
6. **Кнопка Reconnect** → появляется когда WebSocket исчерпал попытки (10 максимум), по клику — новая попытка
7. **Block sync indicators** → CSS `.block-sync-indicator.pending` на несинхронизированных блоках, `.synced` с fade-out 500ms после синхронизации
8. **SyncProgress events** → UI показывает прогресс: `{ completed, total, percent, stage }` при массовой синхронизации

**Fixtures:** `offlineHelper` (goOffline/goOnline), `authenticatedPage`

**Как тестировать:**
- `offlineHelper.goOffline()` → проверить появление offline bar
- `offlineHelper.goOnline()` → проверить исчезновение
- `page.locator('.status-led.ws')` → проверить цвет LED
- `page.locator('.network-status')` → проверить текст статуса
- `page.locator('.block-sync-indicator')` → проверить индикатор на блоке

---

## Задача 23: Offline — Очередь операций (CRUD оффлайн)

**Скоуп:** Все CRUD операции с блоками должны работать оффлайн: создание, редактирование, удаление, перемещение. Операции попадают в offlineQueue и выполняются при восстановлении сети.

**Ключевые файлы:** `src/js/sincManager/offlineQueue.js` (1340 строк), `src/js/stateLocal/localStateManager.js`

**Сценарии:**
1. **Создание блока оффлайн** → блок появляется локально с реальным UUID (offlineQueue.generateBlockId()), операция в очереди
2. **Редактирование title оффлайн** → изменение видно сразу (optimistic update), `updateBlock` в очереди
3. **Редактирование text оффлайн** → NoteEditor работает, текст сохраняется в IndexedDB
4. **Удаление блока оффлайн** → блок исчезает из UI, `deleteBlock` в очереди, children тоже удалены
5. **Перемещение блока оффлайн (cut+paste)** → `moveBlock` в очереди с debounce 0ms (мгновенно)
6. **Множественные операции оффлайн** → все накапливаются в очереди в правильном порядке
7. **Проверка очереди через IndexedDB** → `offlineHelper.getOfflineQueue()` возвращает все pending операции
8. **Создание дерева оффлайн** → `createTree` в очереди
9. **Adaptive debounce** → createBlock: 500ms, updateBlock: 1500ms, moveBlock: 0ms, deleteBlock: 0ms
10. **Pending blocks system** → `registerPendingBlock(blockId)` создаёт Promise, разрешается после синхронизации (timeout 60s)

**Fixtures:** `offlineHelper` (goOffline/goOnline, getOfflineQueue, blockExistsInIndexedDB), `authenticatedPage`, `apiHelper`

**Как тестировать:**
```
1. authenticatedPage.waitForShowedBlocks()
2. offlineHelper.goOffline()
3. authenticatedPage.createBlock('Offline Block')
4. expect(offlineHelper.getOfflineQueue()).toHaveLength(1)
5. expect(authenticatedPage.getBlockByTitle('Offline Block')).toBeVisible()
6. offlineHelper.goOnline()
7. offlineHelper.waitForQueueSync()
8. expect(offlineHelper.getOfflineQueue()).toHaveLength(0)
9. apiHelper.assertBlockCreated()  // подтверждение на сервере
```

---

## Задача 24: Offline — Sync pull-push цикл

**Скоуп:** Полный цикл синхронизации: pull (загрузка серверного состояния) → merge (слияние с локальными изменениями) → push (отправка на сервер). Это ядро offline-системы.

**Ключевые файлы:** `src/js/sincManager/offlineQueue.js` (pull: строки 497-573, push: строки 892-1039, merge: строки 716-788)

**Сценарии:**
1. **Простой sync после offline** → goOffline → создать блок → goOnline → pull/push успешен → блок на сервере
2. **Pull фаза** → загружает все блоки дерева через `api.getTreeBlocks()` с timeout 15 секунд
3. **Merge фаза** → серверные блоки сливаются с локальными; если сервер новее — warning, но локальные изменения сохраняются
4. **Push фаза** → `importBlocks()` batch API → polling статуса с прогрессом
5. **30-секундный cooldown между pull** → повторный sync в течение 30 сек не триггерит новый pull
6. **Pull успешен, push провален** → состояние несогласовано, следующий sync должен подхватить
7. **Partial 403 при push** → блоки с отозванными правами помечаются `forbidden: true`, остальные синхронизируются
8. **Stale operations cleanup** → операции старше 7 дней удаляются из очереди с warning
9. **Events во время sync:**
   - `SyncStarted { pendingCount, phase: 'pull'|'push', message }`
   - `SyncProgress { completed, total, percent, stage }`
   - `SyncCompleted { successCount, failedCount, remainingCount }`
10. **Множественные правки оффлайн → один batch sync** → 5 createBlock + 3 updateBlock = 1 import запрос

**Fixtures:** `offlineHelper` (goOffline/goOnline, waitForQueueSync, getOfflineQueue), `apiHelper` (waitForRequest), `authenticatedPage`

**Как тестировать:**
- Перехват API запросов: `apiHelper.waitForRequest('/api/v1/import')`
- Проверка событий: `page.evaluate(() => new Promise(r => window.addEventListener('SyncCompleted', r, {once:true})))`
- IndexedDB verification: `offlineHelper.getBlocksFromIndexedDB()`

---

## Задача 25: Offline — Перебои сети и восстановление

**Скоуп:** Приложение должно корректно обрабатывать нестабильную сеть: быстрые переключения online/offline, потеря сети посреди операции, медленная сеть.

**Ключевые файлы:** `src/js/sincManager/offlineQueue.js` (retry: строки 631-686, network check: строки 692-707), `src/js/sincManager/webSocket.js`

**Сценарии:**
1. **Rapid network toggle (flap)** → online→offline→online→offline→online за 5 секунд → приложение не падает, state консистентен
2. **Сеть пропала во время API запроса** → запрос в процессе → network error → операция в очереди → retry при reconnect
3. **Сеть пропала во время sync push** → import на 50% → network drops → isSyncing сбрасывается → retry при reconnect
4. **Медленная сеть (timeout)** → API timeout 5 секунд → offlineQueue определяет как network error (не server error)
5. **Retry mechanism** → max 5 попыток, exponential backoff: 5s → 10s → 20s → 40s → 60s
6. **Real network check** → `navigator.onLine` может врать → HEAD запрос к backend для проверки (строки 692-707)
7. **Network error detection** → различает network error (`!error.response`) vs server error (5xx, 408, 429)
8. **Server error handling** → 503 → очередь ждёт, 429 (rate limit) → backoff
9. **Множественные offline операции + flaky reconnect** → создать 10 блоков оффлайн → goOnline → сеть снова падает на push → retry → все блоки синхронизированы
10. **CORS error** → connection refused → offline indicator → не ломает state

**Fixtures:** `offlineHelper` (goOffline/goOnline/rapidNetworkToggle), `authenticatedPage`, `apiHelper`

**Как тестировать:**
```
// Rapid toggle
offlineHelper.rapidNetworkToggle(5, 500)  // 5 toggles, 500ms each
await page.waitForTimeout(5000)
// Проверяем что UI не сломан
expect(authenticatedPage.rootContainer).toBeVisible()

// Сеть во время операции
authenticatedPage.createBlock('Mid-request block')
await page.waitForTimeout(100)  // запрос в процессе
offlineHelper.goOffline()
await page.waitForTimeout(2000)
offlineHelper.goOnline()
offlineHelper.waitForQueueSync()
```

---

## Задача 26: Offline — WebSocket reconnect и heartbeat

**Скоуп:** WebSocket — основной канал real-time обновлений. Тестируем reconnect стратегию, heartbeat, обнаружение потери соединения.

**Ключевые файлы:** `src/js/sincManager/webSocket.js` (552 строки)

**Сценарии:**
1. **Initial connection** → WebSocket подключается при старте → LED зелёный → dispatch `WebSocketConnected`
2. **Heartbeat ping/pong** → каждые 30 секунд отправляется ping → ответ pong сбрасывает missedPongs counter
3. **Missed pongs → reconnect** → 2 пропущенных pong (60+ секунд) → WebSocket закрывается → reconnect
4. **Exponential backoff** → reconnect интервалы: 2s → 4s → 8s → 16s → 32s → 64s → 120s (cap)
5. **Max reconnect attempts (10)** → после 10 неудачных попыток → dispatch `WebSocketDisconnected { canRetry: true }` → кнопка Reconnect
6. **Manual reconnect** → клик кнопки Reconnect → сброс счётчика → новая попытка подключения
7. **Online event resets counter** → browser dispatches `online` → reconnect counter сбрасывается → немедленная попытка
8. **Token refresh on code 1008** → WebSocket закрыт с code 1008 (Policy Violation) → refresh JWT → reconnect с новым token
9. **Message debounce** → входящие block_updates буферизуются 50ms перед dispatch → batch обработка
10. **Visibility change health check** → tab был скрыт → tab стал видимым → ping для проверки → если pong не пришёл → reconnect
11. **WebSocket LED states** → green (connected), yellow (reconnecting), red (disconnected), gray (checking)

**Fixtures:** `offlineHelper`, `authenticatedPage`

**Как тестировать:**
```
// WebSocket status через JavaScript
page.evaluate(() => document.querySelector('.status-led.ws')?.classList)

// Проверка reconnect
offlineHelper.goOffline()
await page.waitForTimeout(3000)
// WS LED должен быть жёлтый или красный
expect(page.locator('.status-led.ws.error, .status-led.ws.warning')).toBeVisible()

offlineHelper.goOnline()
await page.waitForTimeout(5000)
// WS LED зелёный
expect(page.locator('.status-led.ws.ok')).toBeVisible()

// Visibility check
await page.evaluate(() => {
  document.dispatchEvent(new Event('visibilitychange'))
})
```

---

## Задача 27: Offline — Edge cases (sleep, конфликты, сессия)

**Скоуп:** Крайние случаи, которые сложно воспроизвести, но критичны: сон устройства, конкурентные правки, истечение сессии во время sync, исчерпание квоты.

**Ключевые файлы:** `src/js/sincManager/offlineQueue.js`, `src/js/sincManager/webSocket.js`, `src/js/api/api.js`

**Сценарии:**
1. **Tab sleep/wake** → скрыть таб на 30+ секунд → показать → visibilitychange handler проверяет здоровье WebSocket → reconnect если нужно
2. **Операция началась онлайн, ответ потерян** → createBlock отправлен → сеть упала до ответа → клиент считает failed → при sync: import использует тот же blockId → дубликат невозможен (idempotent по ID)
3. **Блок удалён до sync** → создать блок оффлайн → удалить его оффлайн → goOnline → оба в очереди → create+delete = no-op (или import обрабатывает)
4. **Concurrent edit (два пользователя)** → User A оффлайн правит блок X → User B онлайн правит блок X → User A goOnline → pull получает версию B → merge: локальная версия A новее (timestamp) → push A → B перезаписан (last-write-wins)
5. **JWT expires во время sync** → sync в процессе → token истёк → API 401 → token refresh → retry запроса
6. **Permission revoked во время sync** → push возвращает 403 для некоторых блоков → forbidden: true → UI показывает ошибку → остальные блоки синхронизированы
7. **Long-running sync stuck detection** → sync длится > 5 минут → visibilitychange handler сбрасывает состояние (строка 362-367)
8. **Очередь с операциями > 7 дней** → stale cleanup удаляет старые операции с warning → pending blocks отменяются
9. **Chat messages offline** → сообщения чата НЕ попадают в offlineQueue → теряются при offline → проверить что UI не врёт (нет "отправлено" статуса)
10. **Множество вкладок** → две вкладки с одним аккаунтом → обе offline → обе делают правки → goOnline → sync конфликт между вкладками

**Fixtures:** `offlineHelper`, `authenticatedPage`, `multiuserFixture` (для concurrent edit), `apiHelper`

**Как тестировать:**
```
// Tab sleep simulation
await page.evaluate(() => {
  Object.defineProperty(document, 'hidden', { value: true, writable: true });
  document.dispatchEvent(new Event('visibilitychange'));
});
await page.waitForTimeout(35000);  // > 30s heartbeat
await page.evaluate(() => {
  Object.defineProperty(document, 'hidden', { value: false, writable: true });
  document.dispatchEvent(new Event('visibilitychange'));
});
// Проверяем reconnect

// Concurrent edit
// Session A: offline, edit block X
// Session B: online, edit block X
// Session A: goOnline → check which version wins

// Stale ops
// Подменить timestamp в IndexedDB на 8 дней назад → goOnline → проверить cleanup
```

---

## Задача 28: Multi-user Sync

**Скоуп:** Синхронизация между пользователями в реальном времени

**Сценарии:**
1. User A создаёт блок → User B видит его (WebSocket)
2. User A редактирует title → User B видит обновление
3. User A удаляет блок → User B видит исчезновение
4. Concurrent edit → server reconciliation, не теряются данные
5. User A перемещает блок → User B видит новую позицию

**Ключевые файлы:** `src/js/sincManager/webSocket.js`
**Fixtures:** `multiuserFixture` (admin + editor sessions)

---

## Задача 29: Tree Management

**Скоуп:** Управление деревьями/workspaces

**Сценарии:**
1. Создание нового дерева → переключение на него
2. Переключение между деревьями (`space+1-9`)
3. Удаление дерева (если не последнее)
4. Попытка удалить последнее дерево → запрещено
5. Список деревьев обновляется
6. Tree path сохраняется при переключении

**Ключевые файлы:** `src/js/actions/navigationActions.js`
**Fixtures:** `authenticatedPage`, `treeFactory`

---

## Задача 30: Iframe Blocks

**Скоуп:** Блоки с встроенным контентом (iframe)

**Сценарии:**
1. Создание блока с URL → iframe отображается
2. URLPopup → ввод URL вручную
3. setBlockIframe → изменение src
4. Sandbox attributes применяются
5. Iframe рендерится внутри block

**Ключевые файлы:** `src/js/actions/blockActions.js` (createIframeBlock)
**Fixtures:** `authenticatedPage`

---

## Задача 31: Options/Settings

**Скоуп:** Меню настроек

**Сценарии:**
1. `o` → открытие sidebar
2. Доступные опции отображаются
3. Validate tree, Repair tree, Clear cache — из меню
4. Notification settings

**Ключевые файлы:** commands: options, sidebar-button
**Fixtures:** `authenticatedPage`

---

## Приоритеты

### P0 — Critical Path (запускать первыми)
1. Auth
2. Blocks: CRUD
9. Navigation
22. Offline: UI индикаторы
23. Offline: Очередь операций

### P1 — Core Features
3. Blocks: Text Editor
4. Blocks: Copy/Paste/Link
5. Blocks: Cut/Move
10. Search
11. Connections/Arrows
24. Offline: Sync pull-push цикл
28. Multi-user Sync

### P2 — Important Features (Offline/Network)
25. Offline: Перебои сети и восстановление
26. Offline: WebSocket reconnect и heartbeat
27. Offline: Edge cases (sleep, конфликты, сессия)
6. Blocks: Multi-select
7. Blocks: Undo/Redo
8. Blocks: Colors

### P3 — Feature Coverage
12. Diagram Mode
13. Block Styles
14. Layout Editor
15. Permissions & Access
29. Tree Management

### P4 — Secondary Features
16. Image Upload
17. Import
18. Chat
19. Reminders & Subscriptions
20. Hotkeys & Commands
30. Iframe Blocks

### P5 — Nice to Have
21. Onboarding
31. Options/Settings

---

## Как запускать

Для каждой задачи:
```
/verify <номер задачи и описание>
```

Пример:
```
/verify Задача 2: Blocks CRUD — создание, редактирование title, удаление блоков
```

Каждый `/verify` автоматически:
1. Проанализирует скоуп
2. Поднимет dev-сервер
3. Пройдёт сценарий в Chrome
4. Сгенерирует Playwright тесты
5. Запустит и починит если нужно

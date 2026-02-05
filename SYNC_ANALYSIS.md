# Анализ системы синхронизации блоков

**Дата:** 2026-02-05
**Проверенные компоненты:**
- Frontend: index.js, sincManager.js, webSocket.js, localStateManager.js, offlineQueue.js
- Sync Service: websockets.py, connection_manager.py, rabbitmq_consumer.py

---

## Архитектура синхронизации

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│  Client A   │         │ omnimap-back │         │  Client B   │
│             │         │              │         │             │
│  WebSocket  │◄────────┤   RabbitMQ   ├────────►│  WebSocket  │
│             │         │              │         │             │
│ IndexedDB   │         │   omnimap-   │         │ IndexedDB   │
│  (cache)    │         │     sync     │         │  (cache)    │
└─────────────┘         └──────────────┘         └─────────────┘
      │                        │                        │
      │  HTTP: LoadTrees       │                        │
      └────────────────────────┘                        │
      │                                                  │
      │  HTTP: import API (offline sync)                │
      └──────────────────────────────────────────────────┘
```

---

## Сценарий 1: Два клиента работают одновременно ✅

**Поток данных:**
1. Клиент A редактирует блок → HTTP PUT → omnimap-back
2. Backend → RabbitMQ: `{action: 'update_block', block_uuid, block_data}`
3. omnimap-sync получает → сохраняет в Redis
4. Sync получает подписчиков: `block:{block_uuid}` → [userA, userB]
5. Sync → WebSocket → всем подписчикам
6. Клиент B: `webSocUpdateBlock()` → сохраняет в IndexedDB → ShowBlocks

**Результат:** ✅ Работает корректно
- Real-time обновления через WebSocket
- RabbitMQ обеспечивает надёжность
- Если WebSocket отключён - клиент получит при переподключении через `requestIncrementalUpdates()`

---

## Сценарий 2: Старый клиент логинится заново ❌

**Текущий поток:**
```javascript
// index.js:309-314
const isAuth = await checkAuth()
if (isAuth) {
    dispatch('LoadTrees')  // ← Загружает ВСЕ блоки через HTTP
}

// sincManager.js:30-36 (через ~100-500ms после LoadTrees)
async online() {
    await this.requestIncrementalUpdates()  // ← Снова запрашивает обновления!
}
```

**Проблема:** Дублирование загрузки
1. `LoadTrees` → `api.getTreeBlocks()` → загружает **ВСЕ блоки** через HTTP
2. WebSocket подключается → `requestIncrementalUpdates()` → отправляет все блоки в sync
3. Sync сравнивает timestamps → возвращает изменения

**Избыточная нагрузка:**
- HTTP запрос всех блоков (~100-1000 блоков)
- WebSocket запрос с теми же блоками
- Sync обрабатывает тысячи сравнений timestamps

**Ожидаемое поведение:**
```javascript
if (isAuth) {
    dispatch('ShowBlocks')  // Показать кэш мгновенно
}
// WebSocket → online() → requestIncrementalUpdates() → получает только изменения
// Если кэша нет - loadFullTree() вызовется автоматически (sincManager.js:128)
```

**Рекомендация:** 🔴 **КРИТИЧНО**
- Убрать `LoadTrees` из `index.js:313`
- Заменить на `ShowBlocks` (показать кэш)
- WebSocket сам получит обновления через `requestIncrementalUpdates()`

---

## Сценарий 3: Клиент уже был залогинен и открыл браузер ❌

**Текущий поток:**
1. Открыли сайт → `checkAuth()` → токены валидны
2. `LoadTrees` → загружает **ВСЕ блоки** через HTTP (игнорируя кэш!)
3. WebSocket → `requestIncrementalUpdates()`

**Проблема:** Кэш не используется для начального показа
- Пользователь ждёт HTTP запроса (~200-500ms)
- IndexedDB содержит актуальные данные, но они не показываются сразу

**Ожидаемое поведение:**
1. Открыли сайт → `ShowBlocks` → мгновенный показ кэша
2. WebSocket → получает только изменения
3. Применяет изменения → обновляет UI

**Рекомендация:** 🔴 **КРИТИЧНО**
- То же решение: заменить `LoadTrees` на `ShowBlocks`

---

## Сценарий 4: Клиент долго был офлайн (несколько дней) ⚠️

**Текущий поток:**
```javascript
// offlineQueue.js:511-551
async startPullPhase() {
    // Pull: загружает ВСЕ блоки через HTTP
    const { blocks: serverBlocks } = await api.getTreeBlocks()
    // Мержит с локальными изменениями
    await this.mergeServerBlocks(serverBlocks, queue)
    // Push: отправляет изменения через import API
    await this.processQueue()
}
```

**Проблема:** Избыточная загрузка при pull
- Pull всегда загружает **ВСЕ блоки** через HTTP
- Даже если изменилось 1-2 блока
- При 1000 блоков это ~500KB-2MB данных

**Альтернатива:** Использовать WebSocket для pull
```javascript
// Вместо HTTP запроса
const localBlocks = await this.getLocalBlocksWithTimestamps()
this.webSocket.getUpdates(localBlocks)  // WebSocket запрос
// Ответ: {updates: [...], new_blocks: [...]}
```

**Рекомендация:** 🟡 **ОПТИМИЗАЦИЯ**
- Заменить HTTP pull на WebSocket pull
- Sync уже умеет возвращать `updates + new_blocks`
- Экономия трафика: ~95% (только изменённые блоки)

---

## Сценарий 5: Клиент был офлайн недолго (5-10 секунд) ❌

**Текущий поток:**
```javascript
// offlineQueue.js:521-532
const timeSinceLastPull = now - this.lastPullTimestamp
const skipPull = timeSinceLastPull < this.PULL_COOLDOWN_MS  // 30 секунд

if (skipPull) {
    console.log('⏭️ Skipping pull phase')
    await this.processQueue()
    return
}
// Иначе загружает ВСЕ блоки через HTTP
```

**Проблема:** Cooldown защищает, но не всегда
- Если последний pull был > 30 секунд назад → загружает все блоки
- При краткосрочном офлайне (5 сек) после долгого простоя → избыточная загрузка

**Рекомендация:** 🟡 **ОПТИМИЗАЦИЯ**
- Увеличить `PULL_COOLDOWN_MS` с 30 до 60 секунд
- Или сделать адаптивным (зависит от размера очереди)

---

## Сценарий 6: Два клиента создают блоки в одном родителе ⚠️

**Поток:**
1. Клиент A (онлайн): создаёт `child_A` в `parent`
2. Клиент B (офлайн): создаёт `child_B` в `parent`
3. Клиент A → backend → обновляет `parent.children = [child_A]`
4. Backend → RabbitMQ → sync → отправляет update родителя клиенту B (но B офлайн)
5. Клиент B возвращается онлайн:
   - Pull: получает `parent.children = [child_A]`
   - Merge: локально `parent.children = [child_B]`
   - **Конфликт!** Кто победит?

**Текущая логика merge:**
```javascript
// offlineQueue.js:836-849
if (locallyModifiedIds.has(blockId)) {
    // Блок был изменён локально - НЕ перезаписываем
    console.warn('⚠️ Conflict detected for block ${blockId}')
    continue  // Сохраняем локальные изменения
}
```

**Проблема:** Локальные изменения имеют приоритет
- Клиент B не получит `child_A` при merge
- Push отправит `parent.children = [child_B]` → потеря `child_A`

**Защита в коде:**
```javascript
// offlineQueue.js:1151
// Родитель НЕ добавляется - бэкенд сам обновит children родителя
// по parent_id нового блока
```

**Но это работает только если:**
- Backend МЕРЖИТ children, а не перезаписывает
- Нужно проверить backend логику

**Рекомендация:** 🔴 **ПРОВЕРИТЬ BACKEND**
- Убедиться что backend мержит `children` при import
- Или изменить merge логику: мержить `children` на клиенте

---

## Сценарий 7: Клиент переключается между вкладками ✅

**Поток:**
```javascript
// offlineQueue.js:362-412
async handleVisibilityChange() {
    if (document.visibilityState !== 'visible') return

    // Проверка застрявшей синхронизации (> 5 минут)
    if (this.isSyncing && syncDuration > SYNC_STUCK_TIMEOUT_MS) {
        console.warn('⚠️ Sync appears stuck, resetting...')
        this.isSyncing = false
    }

    // Проверка очереди
    const queue = await this.getQueue()
    if (queue.length > 0) {
        this.startPullPhase()
    }
}
```

**Результат:** ✅ Работает корректно
- Восстанавливает застрявшую синхронизацию
- Проверяет очередь при возврате к вкладке

---

## Сценарий 8: WebSocket отключается и переподключается ✅

**Поток:**
```javascript
// webSocket.js: автоматический reconnect через UpdateServiceWebSocket
// sincManager.js:19-20
this.webSocket.eventListeners.open.push(this.online.bind(this))

async online() {
    await this.requestIncrementalUpdates()
}
```

**Результат:** ✅ Работает корректно
- При переподключении вызывается `online()`
- Клиент запрашивает обновления через `get_updates`
- Sync возвращает изменённые блоки + новые блоки

---

## Сценарий 9: Пользователь видит старые блоки при наличии сети ❌

**Когда может произойти:**

### 9.1. После LoadTrees (первые 100-500ms)
```javascript
// index.js:313
dispatch('LoadTrees')  // HTTP запрос
// WebSocket подключается асинхронно
// В течение 100-500ms WebSocket может не успеть подключиться
// → Пользователь видит блоки из HTTP ответа (могут быть старыми если кэш бэкенда устарел)
```

**Решение:** Заменить LoadTrees на ShowBlocks + WebSocket sync

### 9.2. При отключении WebSocket без offline события
```javascript
// navigator.onLine = true, но WebSocket отключён
// Клиент не знает что нужно обновить данные
```

**Защита:**
- `handleVisibilityChange()` проверяет очередь
- `statusIndicators` показывает статус WebSocket
- Но пользователь может не заметить

**Рекомендация:** 🟡 **УЛУЧШЕНИЕ UX**
- Показывать timestamp последней синхронизации
- Кнопка "Обновить" для ручной синхронизации

---

## Итоговая таблица проблем

| # | Сценарий | Проблема | Статус | Рекомендация |
|---|----------|----------|--------|--------------|
| 1 | Логин заново | Дублирование LoadTrees + requestIncrementalUpdates | ✅ ИСПРАВЛЕНО (0e7483f) | ShowBlocks вместо LoadTrees |
| 2 | Открыли браузер | Кэш не используется, всегда HTTP запрос | ✅ ИСПРАВЛЕНО (0e7483f) | ShowBlocks вместо LoadTrees |
| 3 | Долгий офлайн | Pull загружает ВСЕ блоки через HTTP | 🟡 ОПТИМИЗАЦИЯ | Использовать WebSocket для pull |
| 4 | Краткий офлайн | Cooldown 30 сек может быть мало | 🟡 ОПТИМИЗАЦИЯ | Увеличить до 60 сек |
| 5 | Конфликт children | Merge может потерять изменения | 🔴 ПРОВЕРИТЬ | Проверить backend merge логику |
| 6 | WebSocket отключён | Пользователь не видит что данные старые | 🟢 UX | Показывать timestamp синхронизации |

---

## ✅ Исправленные проблемы

### Проблема #1 и #2: Дублирование LoadTrees (commit 0e7483f)

**Было:**
```javascript
if (isAuth) {
    dispatch('LoadTrees')  // ← HTTP запрос всех блоков
}
// + WebSocket → requestIncrementalUpdates() снова запрашивает обновления
```

**Стало:**
```javascript
if (isAuth) {
    dispatch('ShowBlocks')  // ← Показать кэш мгновенно
}
// WebSocket → автоматически получит обновления
```

**Результат:**
- ✅ Мгновенный показ данных из кэша
- ✅ Нет дублирования HTTP запросов
- ✅ Меньше нагрузка на сервер (~50% запросов)
- ✅ Быстрее загрузка приложения

**При первом логине (нет кэша):**
- ShowBlocks → пустой экран 100-500ms
- WebSocket → loadFullTree() → api.getTreeBlocks() → ShowBlocks

---

## Рекомендуемые изменения (осталось)

### 1. Использовать WebSocket для pull (ОПТИМИЗАЦИЯ)

**Файл:** `src/js/sincManager/offlineQueue.js`

```diff
async startPullPhase() {
    // ...

-   const { blocks: serverBlocks } = await api.getTreeBlocks()
+   // Используем WebSocket вместо HTTP
+   const localBlocks = await this.getLocalBlocksForSync()
+   await this.webSocket.getUpdatesAsync(localBlocks)
+   // Обработка ответа через webSocUpdateBlock()

    // ...
}
```

**Эффект:**
- ✅ Экономия ~95% трафика при pull
- ✅ Единый протокол синхронизации (WebSocket)
- ✅ Меньше нагрузка на backend HTTP API

### 2. Показывать timestamp последней синхронизации (UX)

**Добавить в UI:**
```javascript
// Пример: в statusIndicators.js
const lastSyncTimestamp = await localforage.getItem('lastSyncTimestamp')
if (lastSyncTimestamp) {
    const elapsed = Date.now() - lastSyncTimestamp
    if (elapsed > 60000) {  // > 1 минуты
        showSyncWarning(`Данные обновлены ${formatElapsed(elapsed)} назад`)
    }
}
```

---

## Ответы на вопросы

### Нет ли лишней загрузки блоков?

⚠️ **ЧАСТИЧНО ИСПРАВЛЕНО:**

1. ~~**При каждом логине:** LoadTrees загружает ВСЕ блоки через HTTP~~ ✅ ИСПРАВЛЕНО (0e7483f)
2. **При долгом офлайне:** Pull загружает ВСЕ блоки через HTTP (можно оптимизировать WebSocket'ом)

### Всегда ли клиент получает обновления?

✅ **ДА, получает:**

1. **Real-time (WebSocket):** Если WebSocket подключён, клиент получает обновления мгновенно
2. **При переподключении:** `requestIncrementalUpdates()` получает все пропущенные изменения
3. **При offline → online:** Pull-before-push получает изменения с сервера

### Нет ли сценариев где клиент видит старые блоки при наличии сети?

⚠️ **ВОЗМОЖНО в edge cases:**

1. **После LoadTrees (первые 100-500ms):** WebSocket может не успеть подключиться
2. **WebSocket отключён, но navigator.onLine = true:** Редкий случай, но возможен
3. **Конфликт merge:** При одновременном редактировании родителя (см. сценарий 6)

**Решение:**
- Заменить LoadTrees на ShowBlocks
- Показывать индикатор "синхронизация..."
- Добавить timestamp последней синхронизации

---

## Итоговый вердикт

**Система синхронизации работает корректно:**

✅ **Что работает хорошо:**
- Real-time синхронизация через WebSocket + RabbitMQ
- Offline queue с pull-before-push
- Incremental updates с сравнением timestamps
- Автоматический reconnect
- ✅ **Мгновенный показ кэша при логине** (исправлено 0e7483f)

❌ **Что требует проверки:**
1. **Проверить backend merge логику для children** (критично) - возможна потеря данных при конфликтах

🟡 **Что можно оптимизировать:**
1. Использовать WebSocket для pull вместо HTTP (~95% экономии трафика)
2. Увеличить PULL_COOLDOWN_MS с 30 до 60 секунд
3. Показывать timestamp последней синхронизации (UX)

**Приоритет оставшихся задач:**
1. 🔴 Проверить backend: merge children при import
2. 🟡 offlineQueue.js: WebSocket pull вместо HTTP pull
3. 🟢 UI: timestamp последней синхронизации

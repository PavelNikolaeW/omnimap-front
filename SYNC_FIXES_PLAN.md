# План исправлений системы синхронизации

> Создан: 2026-01-18
> Приоритет: от критичных к менее важным

---

## Фаза 1: Критические исправления (2-3 часа)

### 1.1 Восстановление WebSocket после max attempts

**Проблема:** После 10 неудачных попыток переподключения пользователь остаётся отключённым навсегда.

**Файл:** `src/js/sincManager/webSocket.js`

**Изменения:**

```javascript
// Строка 73 — добавить новый обработчик
window.addEventListener('online', this._handleOnline);

// Строка 155-170 — изменить _handleOnline()
_handleOnline() {
    // НОВОЕ: Сбрасываем счётчик при возврате online
    this.reconnectAttempts = 0;
    this.shouldReconnect = true;

    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this.connect();
        return;
    }

    // НОВОЕ: Обработка CONNECTING состояния
    if (this.ws.readyState === WebSocket.CONNECTING) {
        // Ждём завершения текущего подключения
        console.log('WebSocket: connection in progress, waiting...');
        return;
    }

    if (this.ws.readyState === WebSocket.OPEN && this.isConnected) {
        this._checkConnectionHealth();
    }
}

// Строка 415-418 — добавить возможность ручного переподключения
if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('WebSocket: max reconnect attempts reached');
    dispatch('WebSocketDisconnected', {
        reason: 'max_attempts',
        canRetry: true  // НОВОЕ: флаг для UI
    });
    return;
}
```

**Тест:** Отключить сеть на 30 сек, включить обратно — WebSocket должен переподключиться.

---

### 1.2 Уменьшить таймаут проверки соединения

**Проблема:** 5 секунд ожидания pong — слишком долго, пользователь видит устаревшие данные.

**Файл:** `src/js/sincManager/webSocket.js`

**Изменения:**

```javascript
// Строка 34 — уменьшить таймаут
const CONNECTION_CHECK_TIMEOUT = 2000; // было 5000
```

---

### 1.3 Инвалидация childrenPositions при WebSocket update

**Проблема:** При изменении childOrder через WebSocket позиции детей не пересчитываются → визуальные коллизии.

**Файл:** `src/js/stateLocal/localStateManager.js`

**Изменения:**

```javascript
// Строка 1318-1328 — добавить проверку изменения childOrder
const localData = localBlock?.data || {};
const localChildOrder = localData.childOrder || [];

// Мёржим data: сервер имеет приоритет
const mergedData = {
    ...localData,
    ...serverData,
    childOrder: Array.isArray(serverData.childOrder)
        ? serverData.childOrder
        : (localData.childOrder || [])
};

// НОВОЕ: Проверяем, изменился ли childOrder
const childOrderChanged = JSON.stringify(localChildOrder) !==
                          JSON.stringify(mergedData.childOrder);

// ... существующий код мержа ...

// Строка ~1400 — перед saveBlock добавить инвалидацию
if (childOrderChanged) {
    // Инвалидируем кэш позиций для пересчёта grid
    const cachedBlock = this.blocks.get(block.id);
    if (cachedBlock) {
        delete cachedBlock.childrenPositions;
        delete cachedBlock.grid;
    }
}

await this.saveBlock({
    // ... existing code ...
});
```

**Тест:** Два пользователя создают блоки в одном родителе → блоки не накладываются друг на друга.

---

## Фаза 2: Улучшение debounce (3-4 часа)

### 2.1 Адаптивный debounce по типу операции

**Проблема:** Единый debounce 3 сек для всех операций — плохой UX.

**Файл:** `src/js/sincManager/offlineQueue.js`

**Изменения:**

```javascript
// Строка 32 — заменить на объект конфигурации
// this.SYNC_DEBOUNCE_MS = 3000;  // УДАЛИТЬ

// НОВОЕ: Адаптивные debounce интервалы
this.DEBOUNCE_CONFIG = {
    createBlock: 500,      // Создание — быстро показать коллаборатору
    updateBlock: 1500,     // Редактирование текста — дать допечатать
    moveBlock: 0,          // Перемещение — сразу (immediate)
    deleteBlock: 0,        // Удаление — сразу
    createTree: 500,       // Создание дерева
    default: 1000          // Fallback
};

// НОВОЕ: Debounce для расшаренных блоков
this.SHARED_DEBOUNCE_MS = 300;  // Минимальная задержка для батчинга
```

```javascript
// Строка 741-770 — изменить enqueue()
async enqueue(operation, options = {}) {
    const queue = await this.getQueue();
    operation.timestamp = Date.now();
    queue.push(operation);
    await this.saveQueue(queue);

    console.log('Operation queued:', operation.type, operation.data?.blockId);
    dispatch('OperationQueued', { count: queue.length });

    if (this.isOnline && !this.isSyncing && !this.isPulling) {
        // НОВОЕ: Определяем debounce на основе типа операции и shared статуса
        const debounceMs = this._getDebounceForOperation(operation, options);

        if (debounceMs === 0 || options.immediate) {
            // Немедленная синхронизация
            if (this.syncDebounceTimer) {
                clearTimeout(this.syncDebounceTimer);
                this.syncDebounceTimer = null;
            }
            this.startPullPhase();
        } else {
            this.scheduleSyncWithDebounce(debounceMs);
        }
    } else if (!this.isOnline) {
        await this.registerBackgroundSync();
    }
}

// НОВОЕ: Метод для определения debounce
_getDebounceForOperation(operation, options) {
    // Если явно указан immediate — 0
    if (options.immediate) return 0;

    // Проверяем, расшарен ли блок
    const blockId = operation.data?.blockId;
    const parentId = operation.data?.parentId;

    // Импортируем localStateManager динамически чтобы избежать circular dependency
    const { localStateManager } = require('../stateLocal/localStateManager');

    const block = blockId ? localStateManager.blocks.get(blockId) : null;
    const parentBlock = parentId ? localStateManager.blocks.get(parentId) : null;

    // Блок считается расшаренным если у него или родителя есть permission
    const isShared = (block?.permission !== null && block?.permission !== undefined) ||
                     (parentBlock?.permission !== null && parentBlock?.permission !== undefined);

    if (isShared) {
        return this.SHARED_DEBOUNCE_MS;
    }

    // Иначе используем debounce по типу операции
    return this.DEBOUNCE_CONFIG[operation.type] || this.DEBOUNCE_CONFIG.default;
}
```

```javascript
// Строка 777-790 — модифицировать scheduleSyncWithDebounce()
scheduleSyncWithDebounce(debounceMs = null) {
    // НОВОЕ: Используем переданный debounce или default
    const delay = debounceMs ?? this.DEBOUNCE_CONFIG.default;

    if (this.syncDebounceTimer) {
        clearTimeout(this.syncDebounceTimer);
    }

    this.syncDebounceTimer = setTimeout(() => {
        this.syncDebounceTimer = null;
        if (this.isOnline && !this.isSyncing && !this.isPulling) {
            this.startPullPhase();
        }
    }, delay);
}
```

**Тест:**
1. Создать блок в своём дереве → синхронизация через ~500мс
2. Создать блок в расшаренном дереве → синхронизация через ~300мс
3. Переместить блок → синхронизация мгновенная

---

### 2.2 Исправить circular dependency

**Проблема:** `offlineQueue.js` не может напрямую импортировать `localStateManager` из-за circular dependency.

**Файл:** `src/js/sincManager/offlineQueue.js`

**Изменения:**

```javascript
// Строка ~5 — добавить lazy import
let _localStateManager = null;

function getLocalStateManager() {
    if (!_localStateManager) {
        // Dynamic import для избежания circular dependency
        const { localStateManager } = require('../stateLocal/localStateManager');
        _localStateManager = localStateManager;
    }
    return _localStateManager;
}

// В _getDebounceForOperation использовать:
const localStateManager = getLocalStateManager();
```

---

## Фаза 3: Grid layout синхронизация (2-3 часа)

### 3.1 Полная инвалидация при изменении childOrder

**Проблема:** При добавлении/удалении блока другим пользователем grid не перестраивается.

**Файл:** `src/js/painter/painter.js`

**Изменения:**

Найти метод который вызывает `gridClassManager.manager()` и добавить проверку:

```javascript
// Перед вызовом gridClassManager.manager(block, parentBlock)
// Проверить, что childrenPositions актуальны

const expectedChildCount = block.data?.childOrder?.length || 0;
const cachedPositionsCount = Object.keys(block.childrenPositions || {}).length;

if (cachedPositionsCount !== expectedChildCount) {
    // Кэш устарел — пересчитываем
    delete block.childrenPositions;
    delete block.grid;
}
```

---

### 3.2 Добавить версионирование childOrder

**Файл:** `src/js/stateLocal/localStateManager.js`

**Изменения:**

```javascript
// При сохранении блока добавлять версию childOrder
await this.saveBlock({
    // ... existing fields ...
    _childOrderVersion: Date.now()  // НОВОЕ: для отслеживания изменений
});

// При рендеринге проверять версию
if (block._childOrderVersion !== block._lastRenderedVersion) {
    delete block.childrenPositions;
    block._lastRenderedVersion = block._childOrderVersion;
}
```

---

## Фаза 4: UI индикация состояния (1-2 часа)

### 4.1 Показать статус синхронизации

**Файл:** `src/js/core/statusIndicators.js` (или создать новый)

**Изменения:**

```javascript
// Слушать события синхронизации
window.addEventListener('WebSocketDisconnected', (e) => {
    if (e.detail.canRetry) {
        showReconnectButton();
    }
});

window.addEventListener('SyncStarted', (e) => {
    showSyncIndicator(e.detail.phase);
});

window.addEventListener('SyncCompleted', () => {
    hideSyncIndicator();
});

function showReconnectButton() {
    // Показать кнопку "Переподключиться" в UI
    const button = document.createElement('button');
    button.textContent = 'Переподключиться';
    button.onclick = () => {
        dispatch('ForceReconnect');
    };
    // ... добавить в DOM
}
```

**Файл:** `src/js/sincManager/webSocket.js`

```javascript
// Добавить обработчик ForceReconnect
window.addEventListener('ForceReconnect', () => {
    this.reconnectAttempts = 0;
    this.shouldReconnect = true;
    this.connect();
});
```

---

## Фаза 5: Тестирование (2-3 часа)

### 5.1 Unit тесты

**Файл:** `src/js/__tests__/sincManager/offlineQueue.test.js`

```javascript
describe('Adaptive debounce', () => {
    test('shared blocks use shorter debounce', async () => {
        // Setup shared block
        localStateManager.blocks.set('shared-1', {
            id: 'shared-1',
            permission: 'edit'
        });

        const debounce = offlineQueue._getDebounceForOperation({
            type: 'updateBlock',
            data: { blockId: 'shared-1' }
        }, {});

        expect(debounce).toBe(300); // SHARED_DEBOUNCE_MS
    });

    test('own blocks use operation-specific debounce', async () => {
        localStateManager.blocks.set('own-1', {
            id: 'own-1',
            permission: null
        });

        const debounce = offlineQueue._getDebounceForOperation({
            type: 'createBlock',
            data: { blockId: 'own-1' }
        }, {});

        expect(debounce).toBe(500); // createBlock debounce
    });
});
```

### 5.2 E2E тесты

**Файл:** `e2e/tests/sync/concurrent-edit.spec.ts`

```typescript
test('two users create blocks simultaneously without grid collision', async () => {
    // 1. User A создаёт блок
    // 2. User B создаёт блок в том же родителе
    // 3. Проверить что блоки не накладываются
});

test('websocket reconnects after network loss', async () => {
    // 1. Отключить сеть
    // 2. Подождать 30 сек
    // 3. Включить сеть
    // 4. Проверить что WebSocket переподключился
});
```

---

## Чеклист для следующей сессии

### Быстрые фиксы (сделать первыми)
- [ ] Уменьшить `CONNECTION_CHECK_TIMEOUT` до 2000
- [ ] Сбросить `reconnectAttempts` в `_handleOnline()`
- [ ] Добавить обработку `CONNECTING` состояния
- [ ] Добавить `canRetry: true` в `WebSocketDisconnected` event

### Основные исправления
- [ ] Инвалидировать `childrenPositions` при изменении `childOrder`
- [ ] Реализовать адаптивный debounce `_getDebounceForOperation()`
- [ ] Решить circular dependency через lazy import
- [ ] Добавить `DEBOUNCE_CONFIG` объект

### UI улучшения
- [ ] Кнопка "Переподключиться"
- [ ] Индикатор фазы синхронизации

### Тестирование
- [ ] Unit тесты для debounce логики
- [ ] E2E тест concurrent edit
- [ ] E2E тест network recovery

---

## Ожидаемый результат

После всех исправлений:

1. **Сеть восстанавливается автоматически** — при возврате online WebSocket переподключается даже после 10 неудачных попыток

2. **Расшаренные блоки синхронизируются быстрее** — 300мс вместо 3000мс

3. **Grid не ломается при concurrent edit** — позиции пересчитываются при изменении childOrder

4. **Пользователь видит статус** — индикатор синхронизации и кнопка переподключения

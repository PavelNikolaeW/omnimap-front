# План исправления проблем с позиционированием блоков

## Статус: ВСЕ ФАЗЫ ЗАВЕРШЕНЫ ✅

---

## Обнаруженные проблемы (8 штук)

| # | Проблема | Критичность | Статус |
|---|----------|-------------|--------|
| 1 | `_lastRenderedVersion` не сохранялся в IndexedDB | 🔴 Critical | ✅ Исправлено |
| 2 | Кэш инвалидировался ДО `saveBlock()` | 🔴 Critical | ✅ Исправлено |
| 3 | `saveBlock()` не sync'ает in-memory блок | 🟡 High | ✅ Фаза 2 |
| 4 | Race condition в concurrent `moveBlock` | 🟡 High | ✅ Фаза 3 |
| 5 | Batch WebSocket обновления не atomic | 🟡 High | ✅ Фаза 3 |
| 6 | gridClassManager не знает о версиях | 🟡 Medium | ✅ Фаза 5 |
| 7 | Нет защиты при параллельных операциях | 🟡 Medium | ✅ Фаза 3 |
| **8** | **Дублирование UUID в childOrder** | 🔴 **Critical** | ✅ **Исправлено** |

---

## Фаза 1: Критические исправления ✅ ЗАВЕРШЕНА

### 1.1 Исправление дублирования UUID в childOrder ✅

**Файлы изменены:**
- `src/js/stateLocal/localStateManager.js`

**Изменения:**
1. `createBlock()` (строки 2489-2494) — добавлена проверка `includes()` перед `push()`
2. `copyBlock()` (строки 2566-2575) — аналогичная проверка
3. Добавлен mutex `_acquireParentLock()` (строки 85-114) для предотвращения race conditions
4. `createBlock()` обёрнут в try/finally с mutex (строки 2430-2528)

### 1.2 Сохранение `_lastRenderedVersion` в IndexedDB ✅

**Файлы изменены:**
- `src/js/stateLocal/localStateManager.js`
- `src/js/painter/blockCreator.js`

**Изменения:**
1. `BlockRepository.saveBlock()` — добавлено поле `_lastRenderedVersion` (строка 59)
2. Добавлен метод `updateBlockField()` (строки 64-77)
3. `blockCreator._setBlockGrid()` — dispatch `SaveBlockField` при изменении версии (строки 633-639)
4. Обработчик события `SaveBlockField` в localStateManager (строки 222-234)

### 1.3 Инвалидация кэша ПОСЛЕ saveBlock ✅

**Файлы изменены:**
- `src/js/stateLocal/localStateManager.js`

**Изменения:**
- `webSocUpdateBlock()` — перенесена инвалидация кэша ПОСЛЕ `await saveBlock()` (строки 1474-1482)

---

## Фаза 2: Синхронизация памяти и IndexedDB ✅ ЗАВЕРШЕНА

### 2.1 saveBlock() обновляет in-memory блок атомарно ✅

**Файл:** `src/js/stateLocal/localStateManager.js`

**Изменения (строки 1986-2020):**
- Добавлен merge с существующим блоком для сохранения runtime полей
- Возвращает mergedBlock

```javascript
async saveBlock(block) {
    // Атомарно обновляем in-memory и IndexedDB
    const existingBlock = this.blocks.get(block.id);

    // Мёржим с существующим блоком (сохраняем runtime поля)
    const mergedBlock = existingBlock
        ? { ...existingBlock, ...block }
        : block;

    this.blocks.set(block.id, mergedBlock);
    await this.blockRepository.saveBlock(mergedBlock);

    return mergedBlock;
}
```

---

## Фаза 3: Mutex для concurrent операций ✅ ЗАВЕРШЕНА

### 3.1 Создана OperationLock утилита ✅

**Файл:** `src/js/utils/operationLock.js` (новый)

- Класс `OperationLock` с методами `acquire()`, `isLocked()`, `activeLocksCount`
- Экспорт синглтона `blockOperationLock`

### 3.2 moveBlock использует lock ✅

**Файл:** `src/js/stateLocal/localStateManager.js`

**Изменения (строки 1672-1820):**
- Добавлен импорт `blockOperationLock`
- `moveBlock()` захватывает блокировки для old_parent и new_parent
- Весь код обёрнут в try/finally для гарантированного освобождения блокировок

---

## Фаза 4: Валидация и дедупликация childOrder ✅ ЗАВЕРШЕНА

### 4.1 Создана childOrderUtils утилита ✅

**Файл:** `src/js/utils/childOrderUtils.js` (новый)

Функции:
- `deduplicateChildOrder(childOrder)` — удаляет дубликаты
- `safeAddToChildOrder(childOrder, id)` — безопасное добавление
- `safeInsertToChildOrder(childOrder, id, index)` — безопасная вставка
- `validateChildOrder(childOrder, existingBlockIds)` — полная валидация
- `hasDuplicates(childOrder)` — проверка наличия дубликатов
- `findDuplicates(childOrder)` — поиск дублирующихся ID

---

## Фаза 5: Defensive проверки при рендеринге ✅ ЗАВЕРШЕНА

### 5.1 Валидация в blockCreator перед grid расчётом ✅

**Файл:** `src/js/painter/blockCreator.js`

**Изменения (строки 617-624):**
- Добавлен импорт `deduplicateChildOrder`
- В начало `_setBlockGrid()` добавлена проверка и автоисправление дубликатов в childOrder
- Выводится предупреждение в консоль при обнаружении дубликатов

---

## Тестирование

Необходимо проверить:

1. **Создание блоков** — нет дубликатов в childOrder
2. **Быстрое создание** — при быстром нажатии "n" блоки не дублируются
3. **Перезагрузка страницы** — позиции блоков сохраняются корректно
4. **WebSocket обновления** — позиции не сбрасываются при обновлениях от других пользователей
5. **Concurrent редактирование** — два пользователя могут создавать блоки одновременно
6. **moveBlock** — перемещение блоков между родителями работает без race conditions

---

## Коммиты

### Фаза 1-5 (готово к коммиту)
```
fix(blocks): complete block positioning and race condition fixes

Phase 1-5 fixes:
- Add duplicate check before pushing to children/childOrder arrays
- Add mutex (_acquireParentLock) to prevent race conditions in createBlock
- Save _lastRenderedVersion to IndexedDB to persist across page reloads
- Move cache invalidation AFTER saveBlock to prevent race conditions
- Add SaveBlockField event for async field updates from blockCreator
- saveBlock() now merges with existing block to preserve runtime fields
- Add OperationLock utility for mutex-based concurrency control
- moveBlock() now uses blockOperationLock for both parents
- Add childOrderUtils for safe childOrder manipulation
- Add defensive childOrder validation in blockCreator._setBlockGrid()
```

---

## Созданные файлы

| Файл | Описание |
|------|----------|
| `src/js/utils/operationLock.js` | Mutex утилита для предотвращения race conditions |
| `src/js/utils/childOrderUtils.js` | Утилиты для безопасной работы с childOrder |

---

## Ссылки

- Анализ проблем: conversation с Claude от 2026-01-18
- PR #106: https://github.com/PavelNikolaeW/omnimap-front/pull/106 (merged)

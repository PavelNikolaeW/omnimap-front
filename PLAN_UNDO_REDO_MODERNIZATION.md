# План модернизации Undo/Redo системы

## Текущее состояние

### Архитектура undo/redo на фронте

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ТЕКУЩИЙ FLOW (УСТАРЕВШИЙ)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User Action (editBlock)                                                    │
│       ↓                                                                     │
│  api.updateBlock(id, data)  ←── Единичный API вызов                        │
│       ↓                                                                     │
│  Request Interceptor: сохраняет операцию в operationCache                  │
│       ↓                                                                     │
│  Response Interceptor: dispatch("UndoStackAdd", {operation})               │
│       ↓                                                                     │
│  UndoStack: this.stack.add(operation)                                       │
│       ↓                                                                     │
│  [Shift+Z] → api.undo(operation) → Backend /undo/                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Проблема**: Текущий flow использует единичные API вызовы (`edit-block/{id}/`, `new-block/{parent}/`), но теперь фронтенд использует batch import через `offlineQueue`:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        НОВЫЙ FLOW (OPTIMISTIC UI)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User Action (editBlock)                                                    │
│       ↓                                                                     │
│  localStateManager.updateBlock() ←── Локальное обновление (optimistic)     │
│       ↓                                                                     │
│  offlineQueue.enqueue({type: 'updateBlock', data})                         │
│       ↓                                                                     │
│  [3 сек debounce] ←── Накопление операций                                  │
│       ↓                                                                     │
│  buildChangedBlocksTree() ←── Объединение операций в финальное состояние   │
│       ↓                                                                     │
│  importBlocks(blocks) ←── Batch import (POST /import/)                     │
│       ↓                                                                     │
│  ❌ UndoStackAdd НЕ вызывается!                                             │
│  ❌ Backend /undo/ не может отменить batch import!                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Ключевые проблемы

| Проблема | Описание | Критичность |
|----------|----------|-------------|
| **Операции не отслеживаются** | `offlineQueue.enqueue()` не диспатчит `UndoStackAdd` | 🔴 Критично |
| **Batch import vs единичные вызовы** | Backend `/undo/` ожидает URL вида `edit-block/{id}/`, а получает batch | 🔴 Критично |
| **Debounce объединяет операции** | 3 секунды накопления → невозможно undo по одной операции | 🟡 Важно |
| **Optimistic UI** | Локальное состояние меняется сразу, синхронизация позже | 🟡 Важно |
| **Offline режим** | `offlineDisabled: true` у undo/redo команд | 🟡 Важно |

### Архитектура на бэкенде (`views_history.py`)

Backend поддерживает undo для следующих операций:

| URL Pattern | Метод | Логика отката |
|-------------|-------|---------------|
| `edit-block/{id}/` | `_undo_edit_block` | Откат к предыдущей записи history |
| `new-block/{parent}/` | `_undo_new_block` | Удаление созданного блока |
| `new-tree/` | `_undo_new_tree` | Удаление созданного дерева |
| `create-link-block/{dest}/{src}/` | `_undo_create_link_block` | Удаление link блока |
| `copy-block/` | `_undo_copy_block` | Удаление скопированного поддерева |
| `move-block/{old}/{new}/{child}/` | `_undo_move_block` | Возврат блока в старого родителя |
| `delete-tree/{id}/` | `_undo_delete_block` | Восстановление удалённого поддерева |

**Важно**: Backend использует `simple-history` для хранения истории блоков. Каждое изменение создаёт запись в `block.history`.

---

## Варианты решения

### Вариант A: Полностью локальный Undo/Redo (рекомендуется)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ЛОКАЛЬНЫЙ UNDO/REDO STACK                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  UndoEntry {                                                                │
│    id: uuid,                                                                │
│    timestamp: number,                                                       │
│    type: 'edit' | 'create' | 'delete' | 'move',                            │
│    blockId: string,                                                         │
│    previousState: Block | null,   ←── Снапшот ДО изменения                 │
│    nextState: Block | null,       ←── Снапшот ПОСЛЕ изменения              │
│    parentId?: string,                                                       │
│    metadata?: object                                                        │
│  }                                                                          │
│                                                                             │
│  Undo: previousState → current                                              │
│  Redo: nextState → current                                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Плюсы**:
- Мгновенный undo без сетевых запросов
- Работает offline
- Не зависит от backend
- Гранулярный контроль (каждое действие)

**Минусы**:
- Увеличение памяти (хранение снапшотов)
- Нужно синхронизировать undo с offlineQueue
- Конфликты при мультиюзер редактировании

**Реализация**:

```javascript
// src/js/controller/undoManager.js
class UndoManager {
  constructor() {
    this.undoStack = [];       // Stack<UndoEntry>
    this.redoStack = [];       // Stack<UndoEntry>
    this.maxSize = 100;        // Лимит 100 записей
    this.batchId = null;       // Для группировки операций
    this.batchTimer = null;
  }

  // Создание точки отката ДО изменения
  pushUndo(entry) {
    // Очищаем redo stack при новом действии
    this.redoStack = [];

    // Группируем быстрые последовательные изменения одного блока
    if (this.shouldMergeWithPrevious(entry)) {
      const prev = this.undoStack[this.undoStack.length - 1];
      prev.nextState = entry.nextState;
      prev.timestamp = entry.timestamp;
    } else {
      this.undoStack.push(entry);
    }

    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
  }

  // Объединять ли с предыдущей записью
  shouldMergeWithPrevious(entry) {
    if (this.undoStack.length === 0) return false;
    const prev = this.undoStack[this.undoStack.length - 1];

    // Объединяем если:
    // - Тот же блок
    // - Тот же тип операции (edit)
    // - Менее 2 секунд назад
    return (
      prev.blockId === entry.blockId &&
      prev.type === 'edit' &&
      entry.type === 'edit' &&
      entry.timestamp - prev.timestamp < 2000
    );
  }

  async undo() {
    if (this.undoStack.length === 0) return;

    const entry = this.undoStack.pop();
    this.redoStack.push(entry);

    // Восстанавливаем предыдущее состояние
    await this.applyState(entry, 'undo');
  }

  async redo() {
    if (this.redoStack.length === 0) return;

    const entry = this.redoStack.pop();
    this.undoStack.push(entry);

    // Применяем следующее состояние
    await this.applyState(entry, 'redo');
  }

  async applyState(entry, direction) {
    const { localStateManager } = await import('../stateLocal/localStateManager.js');
    const state = direction === 'undo' ? entry.previousState : entry.nextState;

    switch (entry.type) {
      case 'edit':
        await localStateManager.saveBlock(state);
        // Добавляем в offlineQueue для синхронизации
        offlineQueue.enqueue({
          type: 'updateBlock',
          data: { blockId: entry.blockId, ...state }
        });
        break;

      case 'create':
        if (direction === 'undo') {
          await localStateManager.removeBlock(entry.blockId);
          offlineQueue.enqueue({
            type: 'deleteBlock',
            data: { blockId: entry.blockId, parentId: entry.parentId }
          });
        } else {
          await localStateManager.saveBlock(state);
          offlineQueue.enqueue({
            type: 'createBlock',
            data: { blockId: entry.blockId, ...state }
          });
        }
        break;

      case 'delete':
        if (direction === 'undo') {
          // Восстанавливаем удалённый блок
          await localStateManager.saveBlock(state);
          offlineQueue.enqueue({
            type: 'createBlock',
            data: { blockId: entry.blockId, ...state }
          });
        } else {
          await localStateManager.removeBlock(entry.blockId);
          offlineQueue.enqueue({
            type: 'deleteBlock',
            data: { blockId: entry.blockId, parentId: entry.parentId }
          });
        }
        break;

      case 'move':
        // Специальная логика для перемещения
        break;
    }

    dispatch('ShowBlocks');
  }
}
```

### Вариант B: Гибридный подход (Backend + Local)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ГИБРИДНЫЙ UNDO/REDO                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐     ┌──────────────────┐                             │
│  │  Local Undo      │     │  Server Undo     │                             │
│  │  (unsync ops)    │     │  (synced ops)    │                             │
│  └────────┬─────────┘     └────────┬─────────┘                             │
│           │                        │                                        │
│           ↓                        ↓                                        │
│  offlineQueue.length > 0   offlineQueue.length == 0                        │
│  → Local undo              → Server undo (api.undo)                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Плюсы**:
- Использует существующую backend логику
- Меньше локальной памяти

**Минусы**:
- Сложная логика переключения
- Задержки при серверном undo
- Не работает offline

### Вариант C: Undo на уровне Batch

Undo отменяет весь batch (все изменения за 3 секунды debounce).

**Плюсы**:
- Проще реализовать
- Меньше состояния

**Минусы**:
- Грубая гранулярность
- Пользователь может потерять много работы

---

## Рекомендуемое решение: Вариант A с модификациями

### Архитектура

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     РЕКОМЕНДУЕМАЯ АРХИТЕКТУРА                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         UndoManager                                  │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  undoStack: UndoEntry[]    (max 100, persisted to IndexedDB)       │   │
│  │  redoStack: UndoEntry[]    (cleared on new action)                 │   │
│  │                                                                     │   │
│  │  UndoEntry {                                                        │   │
│  │    id: uuid                                                         │   │
│  │    timestamp: number                                                │   │
│  │    type: 'edit' | 'create' | 'delete' | 'move'                     │   │
│  │    blockId: string                                                  │   │
│  │    changes: {                                                       │   │
│  │      before: Partial<Block>  // Только изменённые поля             │   │
│  │      after: Partial<Block>                                          │   │
│  │    }                                                                │   │
│  │    parentId?: string                                                │   │
│  │    oldParentId?: string      // Для move                           │   │
│  │    syncStatus: 'pending' | 'synced' | 'failed'                     │   │
│  │  }                                                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Flow:                                                                      │
│                                                                             │
│  1. User edits block                                                        │
│       ↓                                                                     │
│  2. UndoManager.recordChange(blockId, before, after)                       │
│       ↓                                                                     │
│  3. LocalStateManager.saveBlock() [optimistic]                             │
│       ↓                                                                     │
│  4. OfflineQueue.enqueue() [sync later]                                    │
│       ↓                                                                     │
│  5. [Shift+Z] UndoManager.undo()                                           │
│       ↓                                                                     │
│  6. Restore before state → LocalStateManager                               │
│       ↓                                                                     │
│  7. OfflineQueue.enqueue() [sync the undo]                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Ключевые компоненты

#### 1. UndoManager (`src/js/controller/undoManager.js`)

```javascript
class UndoManager {
  static STORAGE_KEY = 'undoStack';
  static MAX_STACK_SIZE = 100;  // Лимит 100 записей
  static MERGE_WINDOW_MS = 2000; // Объединять быстрые правки

  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.isApplying = false; // Флаг для предотвращения рекурсии
    this.init();
  }

  async init() {
    // Загружаем стек из IndexedDB (persistence)
    await this.loadFromStorage();

    window.addEventListener('Undo', () => this.undo());
    window.addEventListener('Redo', () => this.redo());
  }

  // Записать изменение блока
  recordEdit(blockId, beforeState, afterState) {
    if (this.isApplying) return; // Не записываем undo при применении undo/redo

    const entry = {
      id: uuidv4(),
      timestamp: Date.now(),
      type: 'edit',
      blockId,
      changes: {
        before: this.extractChangedFields(beforeState, afterState),
        after: this.extractChangedFields(afterState, beforeState)
      },
      syncStatus: 'pending'
    };

    this.pushEntry(entry);
  }

  // Записать создание блока
  recordCreate(blockId, parentId, blockData) {
    if (this.isApplying) return;

    const entry = {
      id: uuidv4(),
      timestamp: Date.now(),
      type: 'create',
      blockId,
      parentId,
      changes: {
        before: null,
        after: blockData
      },
      syncStatus: 'pending'
    };

    this.pushEntry(entry);
  }

  // Записать удаление блока
  recordDelete(blockId, parentId, blockData) {
    if (this.isApplying) return;

    const entry = {
      id: uuidv4(),
      timestamp: Date.now(),
      type: 'delete',
      blockId,
      parentId,
      changes: {
        before: blockData,
        after: null
      },
      syncStatus: 'pending'
    };

    this.pushEntry(entry);
  }

  // Записать перемещение блока
  recordMove(blockId, oldParentId, newParentId, beforeChildOrder, afterChildOrder) {
    if (this.isApplying) return;

    const entry = {
      id: uuidv4(),
      timestamp: Date.now(),
      type: 'move',
      blockId,
      oldParentId,
      newParentId: newParentId,
      changes: {
        before: { parentId: oldParentId, childOrder: beforeChildOrder },
        after: { parentId: newParentId, childOrder: afterChildOrder }
      },
      syncStatus: 'pending'
    };

    this.pushEntry(entry);
  }

  pushEntry(entry) {
    // Очищаем redo при новом действии
    this.redoStack = [];

    // Пробуем объединить с предыдущей записью
    if (this.shouldMerge(entry)) {
      const prev = this.undoStack[this.undoStack.length - 1];
      prev.changes.after = entry.changes.after;
      prev.timestamp = entry.timestamp;
    } else {
      this.undoStack.push(entry);

      // Ограничиваем размер стека
      if (this.undoStack.length > UndoManager.MAX_STACK_SIZE) {
        this.undoStack.shift();
      }
    }

    this.saveToStorage();
    dispatch('UndoStackChanged', {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0
    });
  }

  shouldMerge(entry) {
    if (this.undoStack.length === 0) return false;
    if (entry.type !== 'edit') return false;

    const prev = this.undoStack[this.undoStack.length - 1];
    return (
      prev.type === 'edit' &&
      prev.blockId === entry.blockId &&
      entry.timestamp - prev.timestamp < UndoManager.MERGE_WINDOW_MS
    );
  }

  async undo() {
    if (this.undoStack.length === 0) return;
    if (this.isApplying) return;

    this.isApplying = true;

    try {
      const entry = this.undoStack.pop();
      this.redoStack.push(entry);

      await this.applyEntry(entry, 'undo');

      this.saveToStorage();
      dispatch('UndoStackChanged', {
        canUndo: this.undoStack.length > 0,
        canRedo: this.redoStack.length > 0
      });
    } finally {
      this.isApplying = false;
    }
  }

  async redo() {
    if (this.redoStack.length === 0) return;
    if (this.isApplying) return;

    this.isApplying = true;

    try {
      const entry = this.redoStack.pop();
      this.undoStack.push(entry);

      await this.applyEntry(entry, 'redo');

      this.saveToStorage();
      dispatch('UndoStackChanged', {
        canUndo: this.undoStack.length > 0,
        canRedo: this.redoStack.length > 0
      });
    } finally {
      this.isApplying = false;
    }
  }

  async applyEntry(entry, direction) {
    const { localStateManager } = await import('../stateLocal/localStateManager.js');
    const { offlineQueue } = await import('../sincManager/offlineQueue.js');

    const changes = direction === 'undo' ? entry.changes.before : entry.changes.after;

    switch (entry.type) {
      case 'edit': {
        const block = localStateManager.blocks.get(entry.blockId);
        if (!block) return;

        const updatedBlock = { ...block, ...changes };
        await localStateManager.saveBlock(updatedBlock);

        // Синхронизируем изменение
        await offlineQueue.enqueue({
          type: 'updateBlock',
          data: { blockId: entry.blockId }
        });
        break;
      }

      case 'create': {
        if (direction === 'undo') {
          // Отменяем создание = удаляем блок
          await localStateManager.removeBlock(entry.blockId);
          await offlineQueue.enqueue({
            type: 'deleteBlock',
            data: { blockId: entry.blockId, parentId: entry.parentId }
          });
        } else {
          // Redo создания = восстанавливаем блок
          const blockData = { ...changes, id: entry.blockId, parent_id: entry.parentId };
          await localStateManager.saveBlock(blockData);
          await offlineQueue.enqueue({
            type: 'createBlock',
            data: { blockId: entry.blockId, parentId: entry.parentId }
          });
        }
        break;
      }

      case 'delete': {
        if (direction === 'undo') {
          // Отменяем удаление = восстанавливаем блок
          const blockData = { ...changes, id: entry.blockId, parent_id: entry.parentId };
          await localStateManager.saveBlock(blockData);
          await offlineQueue.enqueue({
            type: 'createBlock',
            data: { blockId: entry.blockId, parentId: entry.parentId }
          });
        } else {
          // Redo удаления = удаляем блок
          await localStateManager.removeBlock(entry.blockId);
          await offlineQueue.enqueue({
            type: 'deleteBlock',
            data: { blockId: entry.blockId, parentId: entry.parentId }
          });
        }
        break;
      }

      case 'move': {
        const targetParentId = direction === 'undo' ? entry.oldParentId : entry.newParentId;
        const childOrder = changes.childOrder;

        // Обновляем parent_id блока
        const block = localStateManager.blocks.get(entry.blockId);
        if (block) {
          block.parent_id = targetParentId;
          await localStateManager.saveBlock(block);
        }

        // Обновляем childOrder родителей
        await offlineQueue.enqueue({
          type: 'moveBlock',
          data: {
            blockId: entry.blockId,
            oldParentId: direction === 'undo' ? entry.newParentId : entry.oldParentId,
            newParentId: targetParentId,
            childOrder
          }
        });
        break;
      }
    }

    dispatch('ShowBlocks');
  }

  // Извлечь только изменённые поля
  extractChangedFields(state, compareState) {
    if (!state) return null;
    if (!compareState) return { ...state };

    const changed = {};
    for (const key of Object.keys(state)) {
      if (JSON.stringify(state[key]) !== JSON.stringify(compareState[key])) {
        changed[key] = state[key];
      }
    }
    return changed;
  }

  async loadFromStorage() {
    try {
      const data = await localforage.getItem(UndoManager.STORAGE_KEY);
      if (data) {
        this.undoStack = data.undoStack || [];
        // Не восстанавливаем redoStack - он валиден только в рамках сессии
      }
    } catch (error) {
      console.error('Failed to load undo stack:', error);
    }
  }

  async saveToStorage() {
    try {
      await localforage.setItem(UndoManager.STORAGE_KEY, {
        undoStack: this.undoStack
        // redoStack не сохраняем
      });
    } catch (error) {
      console.error('Failed to save undo stack:', error);
    }
  }

  // Очистить историю при смене пользователя/logout
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.saveToStorage();
    dispatch('UndoStackChanged', { canUndo: false, canRedo: false });
  }
}

export const undoManager = new UndoManager();
```

#### 2. Интеграция с LocalStateManager

Модифицируем методы `localStateManager`:

```javascript
// В localStateManager.js

import { undoManager } from '../controller/undoManager.js';

async updateBlock({ blockId, ...changes }) {
  const block = this.blocks.get(blockId);
  if (!block) return;

  // Сохраняем состояние ДО изменения
  const beforeState = { ...block, data: { ...block.data } };

  // Применяем изменения
  const updatedBlock = { ...block, ...changes };
  if (changes.data) {
    updatedBlock.data = { ...block.data, ...changes.data };
  }

  await this.saveBlock(updatedBlock);

  // Записываем в undo stack
  undoManager.recordEdit(blockId, beforeState, updatedBlock);

  // Добавляем в очередь синхронизации
  await offlineQueue.enqueue({
    type: 'updateBlock',
    data: { blockId }
  });
}

async createBlock({ parentId, title }) {
  const blockId = offlineQueue.generateBlockId();
  const blockData = {
    id: blockId,
    parent_id: parentId,
    title,
    data: {},
    children: []
  };

  await this.saveBlock(blockData);

  // Записываем в undo stack
  undoManager.recordCreate(blockId, parentId, blockData);

  // Синхронизируем
  await offlineQueue.enqueue({
    type: 'createBlock',
    data: { blockId, parentId }
  });

  return blockData;
}

async deleteBlock({ blockId }) {
  const block = this.blocks.get(blockId);
  if (!block) return;

  const parentId = block.parent_id;

  // Записываем в undo stack ДО удаления
  undoManager.recordDelete(blockId, parentId, { ...block });

  await this.removeBlock(blockId);

  // Синхронизируем
  await offlineQueue.enqueue({
    type: 'deleteBlock',
    data: { blockId, parentId }
  });
}
```

#### 3. Обработка WebSocket обновлений

При получении обновлений от других пользователей нужно корректно обрабатывать undo stack:

```javascript
// В localStateManager.js

webSocUpdateBlock(blockData) {
  const existingBlock = this.blocks.get(blockData.id);

  // Если блок был изменён локально и ещё не синхронизирован - конфликт
  if (existingBlock && offlineQueue.isPendingBlock(blockData.id)) {
    console.warn('Conflict: block modified locally and remotely');
    // Стратегия: локальные изменения имеют приоритет
    return;
  }

  // Обновляем блок без записи в undo (это чужие изменения)
  this.saveBlock(blockData);

  // Инвалидируем undo записи для этого блока если они есть
  undoManager.invalidateEntriesForBlock(blockData.id);
}
```

---

## План миграции

### Фаза 1: Создание UndoManager (2-3 дня)

1. Создать `src/js/controller/undoManager.js`
2. Реализовать базовые методы: `recordEdit`, `recordCreate`, `recordDelete`, `recordMove`
3. Реализовать `undo()` и `redo()`
4. Добавить persistence в IndexedDB
5. Написать unit тесты

### Фаза 2: Интеграция с LocalStateManager (2-3 дня)

1. Модифицировать методы изменения блоков для записи в undo stack
2. Добавить флаг `isApplying` для предотвращения рекурсии
3. Интегрировать с offlineQueue для синхронизации undo/redo операций
4. Тесты интеграции

### Фаза 3: Обработка конфликтов (1-2 дня)

1. Обработка WebSocket обновлений при наличии pending undo записей
2. Инвалидация устаревших undo записей
3. UI индикация конфликтов

### Фаза 4: Удаление старой системы (1 день)

1. Удалить `undoStack.js` (старую реализацию)
2. Удалить `operationCache` из `api.js`
3. Удалить dispatch `UndoStackAdd` из response interceptor
4. Обновить команды `undo` и `redo` в `commands.js`

### Фаза 5: Тестирование и polish (2-3 дня)

1. E2E тесты undo/redo сценариев
2. Тесты offline режима
3. Тесты мультиюзер конфликтов
4. UI улучшения (показ состояния undo stack)

---

## Принятые решения

### 1. Сохранение undo stack между сессиями
**Решение: ДА**

Сохраняем в IndexedDB. При загрузке:
1. Читаем undoStack из storage
2. После синхронизации с сервером инвалидируем устаревшие записи
3. RedoStack НЕ сохраняем (валиден только в рамках сессии)

### 2. Undo для удалённых деревьев
**Решение: Сохраняем с лимитом**

- Сохраняем полное поддерево для восстановления
- **Лимит: 500 блоков** — если удаляется больше, НЕ записываем в undo stack
- Показываем пользователю предупреждение при удалении больших деревьев

```javascript
recordDeleteTree(rootBlockId, parentId, subtree) {
  // Считаем блоки в поддереве
  const blockCount = this.countBlocks(subtree);

  if (blockCount > 500) {
    console.warn(`Skipping undo for large tree deletion (${blockCount} blocks)`);
    dispatch('ShowWarning', {
      message: 'Удаление большого дерева не может быть отменено'
    });
    return;
  }

  // Записываем в undo stack
  this.pushEntry({
    type: 'deleteTree',
    blockId: rootBlockId,
    parentId,
    changes: { before: subtree, after: null }
  });
}
```

### 3. Синхронизация между вкладками
**Решение: НЕТ**

Каждая вкладка имеет свой undo stack. Слишком сложно для текущего этапа.

### 4. Максимальный размер стека
**Решение: 100 записей**

```javascript
static MAX_STACK_SIZE = 100;
```

### 5. Обработка конфликтов (WebSocket обновления)
**Решение: Инвалидация**

Когда приходит WebSocket обновление для блока, который есть в undo stack:
1. Помечаем все записи для этого блока как `invalid`
2. При undo/redo пропускаем invalid записи
3. Пользователь теряет возможность отменить своё изменение, но не перезаписывает чужие

```javascript
// В UndoManager
invalidateEntriesForBlock(blockId) {
  // Помечаем записи в undoStack
  for (const entry of this.undoStack) {
    if (entry.blockId === blockId) {
      entry.invalid = true;
    }
  }

  // Помечаем записи в redoStack
  for (const entry of this.redoStack) {
    if (entry.blockId === blockId) {
      entry.invalid = true;
    }
  }

  this.saveToStorage();
}

async undo() {
  if (this.undoStack.length === 0) return;
  if (this.isApplying) return;

  // Пропускаем invalid записи
  let entry;
  while (this.undoStack.length > 0) {
    entry = this.undoStack.pop();
    if (!entry.invalid) break;
    // Invalid записи просто удаляем, не добавляя в redo
    entry = null;
  }

  if (!entry) return; // Все записи были invalid

  this.isApplying = true;
  try {
    this.redoStack.push(entry);
    await this.applyEntry(entry, 'undo');
    // ...
  } finally {
    this.isApplying = false;
  }
}
```

**Flow конфликта:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ОБРАБОТКА КОНФЛИКТОВ                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Пользователь A редактирует блок X                                      │
│       ↓                                                                     │
│  2. UndoManager.recordEdit(X, before, after)                               │
│       ↓                                                                     │
│  3. Пользователь B редактирует тот же блок X                               │
│       ↓                                                                     │
│  4. WebSocket: block_update для X приходит к A                             │
│       ↓                                                                     │
│  5. UndoManager.invalidateEntriesForBlock(X)                               │
│       ↓                                                                     │
│  6. Записи для X помечены как invalid                                      │
│       ↓                                                                     │
│  7. Пользователь A нажимает Undo                                           │
│       ↓                                                                     │
│  8. Undo пропускает invalid записи для X                                   │
│       ↓                                                                     │
│  9. Отменяется предыдущее валидное действие (или ничего)                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Критерии успеха

- [x] Undo/Redo работает для edit, create, delete, move операций
- [x] Работает в offline режиме
- [x] Быстрые последовательные правки объединяются
- [x] Нет утечек памяти
- [x] Корректно обрабатываются WebSocket обновления
- [x] Все существующие тесты проходят (755 тестов)
- [x] Новые тесты покрывают undo/redo логику (23 теста)

---

## Выполненные изменения

### Созданные файлы
- `src/js/controller/undoManager.js` - новый локальный UndoManager
- `src/js/__tests__/controller/undoManager.test.js` - 23 unit теста

### Удалённые файлы
- `src/js/controller/undoStack.js` - старая backend-зависимая реализация

### Изменённые файлы
- `src/js/stateLocal/localStateManager.js`:
  - Добавлен импорт undoManager
  - createBlock: записывает undoManager.recordCreate()
  - deleteTreeBlock: записывает undoManager.recordDelete/recordDeleteTree()
  - moveBlock: записывает undoManager.recordMove()
  - titleUpdate, textUpdate, updateBlockStyles, hueUpdate: записывают undoManager.recordEdit()
  - webSocUpdateBlock: вызывает undoManager.invalidateEntriesForBlock() при внешних изменениях

- `src/js/api/api.js`:
  - Удалён operationCache и связанные интерцепторы
  - Удалены методы undo() и redo()
  - Удалён метод sendHistoryOperations()

- `src/js/controller/comands/commands.js`:
  - Убран offlineDisabled у команд undo/redo

- `src/js/index.js`:
  - Заменён импорт UndoStack/RedoStack на undoManager
  - Заменена инициализация на undoManager.init()

### Итоговая статистика тестов
- Всего: 778 тестов
- UndoManager: 23 теста
- Все тесты проходят

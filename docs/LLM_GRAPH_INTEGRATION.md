# LLM Graph Integration

Интеграция графов OmniMap с LLM для AI-assisted редактирования.

## Обзор

Система позволяет LLM анализировать структуру графа блоков и предлагать изменения через патчи, которые пользователь может просмотреть и применить.

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Flow                                │
├─────────────────────────────────────────────────────────────────┤
│  1. Пользователь выбирает scope контекста                       │
│  2. Пользователь отправляет сообщение в AI чат                  │
│  3. GraphContextService извлекает и кодирует контекст           │
│  4. LLM анализирует и генерирует ответ + патч                   │
│  5. Пользователь просматривает preview изменений                │
│  6. Пользователь применяет или отклоняет патч                   │
│  7. GraphPatchApplier применяет изменения с поддержкой Undo     │
└─────────────────────────────────────────────────────────────────┘
```

## Компоненты

### Frontend

| Файл | Описание |
|------|----------|
| `src/js/services/graphContextService.js` | Извлечение и кодирование контекста графа |
| `src/js/services/graphPatchApplier.js` | Валидация и применение патчей |
| `src/js/api/llmApi.js` | API клиент с поддержкой graph context |
| `src/js/controller/popups/unifiedChatPanel.js` | UI чата с контекст-селектором |

### Backend (llm-gateway)

| Файл | Описание |
|------|----------|
| `src/shared/schemas.py` | Pydantic схемы с graph полями |
| `src/domain/graph_prompt_builder.py` | System prompt инструкции для LLM |
| `src/domain/message_service.py` | Интеграция контекста в сообщения |

## Форматы данных

### Snapshot v2 (контекст для LLM)

```json
{
  "v": 2,
  "root": 5,
  "n": [
    [1, 0, "group", "Root Block", "Description..."],
    [2, 1, "system", "Backend", "FastAPI service"],
    [3, 2, "component", "API", "REST endpoints"]
  ],
  "o": [
    [1, [2, 4, 5]],
    [2, [3, 6]]
  ],
  "e": [
    [3, 6, "dependency"],
    [2, 4, "default"]
  ]
}
```

**Структура:**
- `v` - версия формата (2)
- `root` - ID корневого блока в контексте
- `n` - nodes: `[id, parent_id, type, title, text]`
- `o` - orders: `[parent_id, [child_ids...]]`
- `e` - edges: `[source_id, target_id, connection_type]`

### Patch v2 (изменения от LLM)

```json
{
  "v": 2,
  "create": [
    {"id": 7, "parent": 2, "pos": 0, "type": "task", "title": "New Task", "text": "Description"}
  ],
  "edit": [
    {"id": 3, "title": "Updated API", "type": "interface"}
  ],
  "move": [
    {"id": 4, "parent": 1, "pos": 2}
  ],
  "link_add": [
    [7, 3, "dependency"]
  ],
  "link_del": [
    [2, 4]
  ]
}
```

**Операции:**
- `create` - создание новых блоков (ID должны быть последовательными)
- `edit` - изменение существующих блоков (title, text, type)
- `move` - перемещение блоков к другому родителю
- `link_add` - добавление связей `[source, target, type]`
- `link_del` - удаление связей `[source, target]`

## Scope контекста

| Scope | Описание | Размер |
|-------|----------|--------|
| `none` | Без контекста | 0 блоков |
| `current` | Текущий блок + прямые дети | 5-20 блоков |
| `branch` | Текущий блок + все потомки | 10-100 блоков |
| `ancestors` | Путь к корню + siblings | 5-30 блоков |
| `full` | Весь граф (с лимитом) | до 200 блоков |

## Типы блоков

```
group, entity, concept, doc,
process, step, decision,
system, component, interface, data,
task, issue, risk, metric, goal
```

## Типы связей

```
default, dashed, dotted, double, thick, thin,
curved, straight, elbow, orthogonal,
dependency, inheritance, composition, aggregation,
statemachine
```

## API

### GraphContextService

```javascript
import { getGraphContextService } from './services/graphContextService';

const service = getGraphContextService(localStateManager.blocks);

// Извлечь контекст
const { snapshot, idMap, reverseMap, warnings } = service.extractContext(
  'branch',      // scope
  blockId,       // focusBlockId
  { maxDepth: 5 } // options
);

// Оценить размер
const hint = service.getContextSizeHint('branch', blockId);
// { nodes: 15, tokens: 450, description: 'Вся ветка' }
```

### GraphPatchApplier

```javascript
import { getGraphPatchApplier } from './services/graphPatchApplier';

const applier = getGraphPatchApplier(localStateManager, undoManager);

// Валидация
const { valid, errors, warnings } = applier.validatePatch(patch, reverseMap);

// Preview
const changes = applier.previewChanges(patch, reverseMap);
// [{ type: 'create', icon: '➕', description: 'Создать "Task" в "Backend"' }, ...]

// Применить с Undo
const result = await applier.applyPatchWithUndo(patch, reverseMap);
// { success: true, createdIds: { '7': 'uuid-xxx' } }
```

### LLM API

```javascript
import llmApi from './api/llmApi';

// Отправить сообщение с контекстом
const result = await llmApi.sendMessageStreamWithContext(
  dialogId,
  content,
  snapshot,           // graph context
  true,               // requestGraphPatch
  onChunk,
  signal
);
// { content: '...', graphPatch: { v: 2, create: [...] } }
```

## Performance

### Лимиты

| Параметр | Предупреждение | Лимит |
|----------|----------------|-------|
| Блоки в контексте | 50 | 200 |
| Токены контекста | 8000 | - |
| Операций в патче | 20 | 100 |

### Оптимизации

- **Кэширование контекста** - TTL 5 секунд, инвалидация при изменении блоков
- **Кэширование HTML→text** - LRU кэш на 100 элементов
- **structuredClone** - быстрое клонирование для Undo

## UI

### Context Selector

```html
<div class="llm-graph-context-selector">
  <label>Контекст графа</label>
  <select id="llm-context-scope">
    <option value="none">Без контекста</option>
    <option value="current">Текущий блок</option>
    <option value="branch" selected>Вся ветка</option>
    <option value="ancestors">Путь к корню</option>
    <option value="full">Весь граф</option>
  </select>
  <span class="context-size">~120 токенов</span>
</div>
```

### Patch Preview

```html
<div class="llm-graph-patch-preview">
  <h4>AI предлагает изменения</h4>
  <ul class="patch-changes-list">
    <li>➕ Создать "New Task" в "Backend"</li>
    <li>✏️ Изменить "API": название</li>
  </ul>
  <div class="patch-actions">
    <button class="apply-btn">Применить</button>
    <button class="discard-btn">Отменить</button>
  </div>
</div>
```

## Тестирование

```bash
# Unit тесты
npm test -- src/js/__tests__/services/graphContextService.test.js
npm test -- src/js/__tests__/services/graphPatchApplier.test.js

# Все тесты сервисов
npm test -- --testPathPattern="services"
```

## Примеры использования

### 1. Реструктуризация ветки

**User:** "Реструктурируй эту ветку, сгруппировав блоки по типу"

**LLM Response:**
```json
{
  "v": 2,
  "create": [
    {"id": 10, "parent": 1, "type": "group", "title": "Components"},
    {"id": 11, "parent": 1, "type": "group", "title": "Tasks"}
  ],
  "move": [
    {"id": 3, "parent": 10, "pos": 0},
    {"id": 4, "parent": 10, "pos": 1},
    {"id": 7, "parent": 11, "pos": 0}
  ]
}
```

### 2. Добавление связей

**User:** "Добавь dependency связи между сервисами"

**LLM Response:**
```json
{
  "v": 2,
  "link_add": [
    [3, 5, "dependency"],
    [4, 6, "dependency"]
  ]
}
```

### 3. Анализ без изменений

**User:** "Опиши структуру этой ветки"

LLM анализирует контекст и отвечает текстом без патча.

## Troubleshooting

### Патч не применяется

1. Проверить валидацию: `applier.validatePatch(patch, reverseMap)`
2. Убедиться что ID в патче соответствуют reverseMap
3. Для create операций - ID должны быть последовательными от max+1

### Контекст слишком большой

1. Уменьшить scope: `full` → `branch` → `current`
2. Уменьшить maxDepth в options
3. Проверить warnings в результате extractContext

### LLM не генерирует патч

1. Убедиться что `request_graph_patch: true` в запросе
2. Проверить что контекст отправляется в `graph_context`
3. Убедиться что LLM понимает формат (см. system prompt)

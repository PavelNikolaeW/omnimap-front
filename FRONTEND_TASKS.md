# Задачи для omnimap-front

Эти изменения в backend требуют обновлений на фронтенде.

## Новые поля в ответах API

### Block responses
Все эндпоинты, возвращающие блоки, теперь включают:

```json
{
  "id": "uuid",
  "title": "...",
  "data": {...},
  "children": [...],
  "permission": "view|sandbox|edit|edit_ac|delete|deny|null",
  "creator_id": 123,           // NEW: ID создателя блока
  "sandbox_mode": "open|private|null"  // NEW: режим sandbox (null если none)
}
```

**Затронутые эндпоинты:**
- `GET /api/v1/load-trees/`
- `GET /api/v1/load-empty/`
- `GET /api/v1/load-tree/`
- `GET /api/v1/load-nodes/`
- `POST /api/v1/new-block/<parent_id>/`
- `POST /api/v1/edit-block/<block_id>/`
- `POST /api/v1/copy-block/`
- `POST /api/v1/move-block/...`
- WebSocket updates

## Новый эндпоинт

### GET/POST `/api/v1/blocks/<block_id>/sandbox/`

**GET** - получить текущий режим:
```json
{
  "id": "uuid",
  "sandbox_mode": "none|open|private"
}
```

**POST** - установить режим (требует `edit_ac` или `delete` права):
```json
// Request
{
  "sandbox_mode": "open|private|none"
}

// Response
{
  "id": "uuid",
  "sandbox_mode": "open",
  "previous_mode": "none"
}
```

## Новое право доступа

Добавлен новый тип permission: `sandbox`

- Пользователи с правом `sandbox` могут **создавать** блоки в контейнере
- НО не могут **редактировать/удалять** чужие блоки
- Нужно обновить UI отображение прав

## Логика sandbox режимов

### Open Sandbox (`sandbox_mode: "open"`)
- Все видят все блоки
- Редактировать/удалять можно только свои блоки (где `creator_id === currentUserId`)
- Owner контейнера (у кого `delete` право на контейнер) может редактировать всё

### Private Sandbox (`sandbox_mode: "private"`)
- Видны только свои блоки (уже фильтруются на backend через deny permission)
- Owner контейнера видит и редактирует всё

## Рекомендации для UI

1. **Показывать индикатор sandbox режима** на контейнере
2. **Блокировать edit/delete** для чужих блоков в sandbox:
   ```javascript
   const canEdit = !parentSandboxMode ||
                   block.creator_id === currentUserId ||
                   isContainerOwner;
   ```
3. **Показывать автора блока** в sandbox режиме (используя `creator_id`)
4. **Добавить UI для управления sandbox режимом** (только для владельцев)

## omnimap-sync

WebSocket сообщения теперь включают `sandbox_mode` и `creator_id`:

```json
{
  "action": "update_block",
  "block_uuid": "...",
  "block_data": {
    "id": "...",
    "sandbox_mode": "open|private|null",
    "creator_id": 123,
    ...
  }
}
```

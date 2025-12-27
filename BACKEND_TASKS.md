# Задачи от Backend

## Реализовать взаимодействие с `/api/v1/import/`

### Описание
Добавить функционал массового импорта блоков через асинхронный API endpoint.

### API Спецификация

#### 1. Отправка импорта
```
POST /api/v1/import/
Authorization: Bearer <token>
Content-Type: application/json
```

**Request:**
```json
{
  "payload": [
    {
      "id": "uuid",              // обязательно, генерировать на клиенте
      "title": "string | null",
      "data": {
        "childOrder": ["uuid", ...],
        "view": "string",
        ...
      },
      "parent_id": "uuid | null", // null = корневой блок
      "permissions": {
        "users": [{"user_id": 1, "permission": "view|edit|edit_ac|delete"}],
        "groups": [{"group_id": 1, "permission": "view|edit|edit_ac|delete"}]
      }
    }
  ]
}
```

**Response (202 Accepted):**
```json
{
  "task_id": "celery-task-uuid"
}
```

#### 2. Polling статуса задачи
```
GET /api/v1/tasks/<task_id>/
Authorization: Bearer <token>
```

**Response варианты:**

```json
// PENDING - задача в очереди
{
  "task_id": "...",
  "status": "PENDING",
  "result": null
}

// PROGRESS - выполняется
{
  "task_id": "...",
  "status": "PROGRESS",
  "progress": {
    "stage": "starting | importing | notifications",
    "percent": 0-100,
    "total_blocks": 50
  },
  "result": null
}

// SUCCESS - завершено
{
  "task_id": "...",
  "status": "SUCCESS",
  "result": {
    "success": true,
    "created": ["uuid1", "uuid2"],
    "updated": ["uuid3"],
    "unchanged": [],
    "deleted": [],
    "errors": [],
    "problem_blocks": []
  }
}

// SUCCESS с проблемами
{
  "task_id": "...",
  "status": "SUCCESS",
  "result": {
    "success": false,
    "created": ["uuid1"],
    "updated": [],
    "errors": ["parent_not_found"],
    "problem_blocks": [
      {"block_id": "uuid2", "code": "parent_not_found"}
    ]
  }
}

// FAILURE - ошибка
{
  "task_id": "...",
  "status": "FAILURE",
  "result": {
    "success": false,
    "error": "Database connection failed",
    "errors": ["exception"]
  }
}
```

### Требования к реализации

1. **Сервис импорта** (`services/importService.js` или аналог):
   ```javascript
   // Генерация UUID на клиенте
   const generateBlockId = () => crypto.randomUUID();

   // Отправка импорта
   async function importBlocks(blocks) {
     const response = await fetch('/api/v1/import/', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${getToken()}`
       },
       body: JSON.stringify({ payload: blocks })
     });
     return response.json(); // { task_id: "..." }
   }

   // Polling статуса
   async function pollTaskStatus(taskId, onProgress) {
     while (true) {
       const response = await fetch(`/api/v1/tasks/${taskId}/`, {
         headers: { 'Authorization': `Bearer ${getToken()}` }
       });
       const data = await response.json();

       if (data.status === 'PROGRESS' && onProgress) {
         onProgress(data.progress);
       }

       if (data.status === 'SUCCESS' || data.status === 'FAILURE') {
         return data;
       }

       await new Promise(r => setTimeout(r, 500)); // poll каждые 500ms
     }
   }
   ```

2. **UI компоненты**:
   - Прогресс-бар во время импорта
   - Отображение stage: "Подготовка..." → "Импорт блоков..." → "Отправка уведомлений..."
   - Отображение ошибок из `problem_blocks`
   - Успешное завершение: показать количество created/updated

3. **Обработка ошибок**:
   - `parent_not_found` — родительский блок не существует
   - `creator_missing` — не указан создатель
   - `cycle_detected` — обнаружен цикл в иерархии
   - `permission_denied` — нет прав на изменение

### Лимиты
- Максимум **1000 блоков** за один запрос (`LIMIT_BLOCKS`)
- ID блоков должны быть валидными UUID v4/v6/v7

### Связанные PR
- Backend PR #3: https://github.com/PavelNikolaeW/omnimap-back/pull/3

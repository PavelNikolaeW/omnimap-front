# Задачи для фронтенда: Access Requests

## Описание фичи

Реализована функциональность запросов на доступ к блокам. Когда пользователь пытается создать ссылку на блок, к которому у него нет доступа:
1. Создаётся pending (ожидающая) ссылка
2. Владельцу блока отправляется уведомление
3. Владелец может одобрить или отклонить запрос
4. При одобрении — выдаётся выбранное право доступа

## API Эндпоинты

### 1. Создание ссылки (изменённый эндпоинт)

`POST /api/v1/create-link-block/<parent_id>/<source_id>/`

**Новое поведение:** Если у пользователя нет прав на `source_id`, возвращает:

```json
{
    "id": "uuid-ссылки",
    "pending": true,
    "request_id": "uuid-запроса",
    "message": "Access request sent to block owner",
    "parent": {...},
    "link": {...}
}
```

### 2. Список входящих запросов (для owner)

`GET /api/v1/access-requests/`

```json
[
    {
        "id": "uuid",
        "requester": {"id": 1, "username": "user1"},
        "block": {"id": "uuid", "title": "Block title"},
        "link_block_id": "uuid",
        "created_at": "2024-01-15T10:00:00Z"
    }
]
```

### 3. Список отправленных запросов (для requester)

`GET /api/v1/access-requests/sent/`

```json
[
    {
        "id": "uuid",
        "owner": {"id": 2, "username": "owner"},
        "block": {"id": "uuid", "title": "Block title"},
        "link_block_id": "uuid",
        "status": "pending|approved|rejected",
        "granted_permission": "view|sandbox|edit|...",
        "created_at": "2024-01-15T10:00:00Z",
        "responded_at": "2024-01-15T11:00:00Z"
    }
]
```

### 4. Счётчик запросов (для badge)

`GET /api/v1/access-requests/count/`

```json
{"count": 5}
```

### 5. Одобрение запроса

`POST /api/v1/access-requests/<request_id>/approve/`

**Body:**
```json
{"permission": "view|sandbox|edit|edit_ac|delete"}
```

**Response:**
```json
{"status": "approved", "permission": "view", "request_id": "uuid"}
```

### 6. Отклонение запроса

`POST /api/v1/access-requests/<request_id>/reject/`

**Response:**
```json
{"status": "rejected", "request_id": "uuid"}
```

## WebSocket события

### Новый запрос на доступ (для owner)

```json
{
    "action": "access_request",
    "type": "new_request",
    "request_id": "uuid",
    "requester": {"id": 1, "username": "user1"},
    "block": {"id": "uuid", "title": "Block title"},
    "owner_id": 2
}
```

### Ответ на запрос (для requester)

```json
{
    "action": "access_request",
    "type": "response",
    "request_id": "uuid",
    "approved": true,
    "permission": "view",
    "block": {"id": "uuid", "title": "Block title"},
    "user_id": 1
}
```

## Задачи для реализации

### 1. Обработка pending ссылок

- [ ] При получении блока-ссылки проверять `data.pending === true`
- [ ] Для pending ссылок показывать заглушку вместо контента source блока
- [ ] Заглушка должна показывать: "Ожидание подтверждения доступа" или "Доступ запрошен"

### 2. Уведомления для владельца

- [ ] Слушать WebSocket событие `action: 'access_request', type: 'new_request'`
- [ ] Показывать notification/toast при получении нового запроса
- [ ] Добавить badge на иконку уведомлений с количеством pending запросов
- [ ] Использовать `/api/v1/access-requests/count/` для получения количества

### 3. UI для просмотра и обработки запросов

- [ ] Создать страницу/модалку со списком входящих запросов
- [ ] Для каждого запроса показывать:
  - Имя пользователя, запросившего доступ
  - Название блока
  - Дату запроса
  - Кнопки "Одобрить" и "Отклонить"
- [ ] При нажатии "Одобрить" показать выбор уровня прав:
  - `view` — только просмотр
  - `sandbox` — создание в sandbox режиме
  - `edit` — редактирование
  - `edit_ac` — управление правами
  - `delete` — полный доступ

### 4. Уведомление для запросившего

- [ ] Слушать WebSocket событие `action: 'access_request', type: 'response'`
- [ ] При `approved: true`:
  - Показать notification об одобрении с указанием выданного права
  - Обновить блок-ссылку (убрать pending)
  - Загрузить контент source блока
- [ ] При `approved: false`:
  - Показать notification об отклонении
  - Можно оставить заглушку или показать "Доступ отклонён"

### 5. Страница отправленных запросов (опционально)

- [ ] Показать список запросов, отправленных пользователем
- [ ] Статус каждого запроса (pending/approved/rejected)
- [ ] Выданное право (если approved)

## Примечания

- Повторные запросы после отклонения запрещены (возвращается 403)
- Повторные запросы при pending возвращают 409 Conflict
- После одобрения `data.pending` удаляется из блока-ссылки

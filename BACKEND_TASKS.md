# Задачи для Backend

Этот файл содержит требования к backend для функционала, реализованного на frontend в PR #66.

---

## ПРИОРИТЕТ 1: Объединение групп доступа и чатов

### Проблема

Сейчас две отдельные сущности:
- **Access Groups** (`/api/v1/groups/`) - управление правами на блоки
- **Chat Groups** (`/api/v1/chat/groups/`) - групповое общение

Это неудобно: пользователь создаёт группу доступа, но для общения нужен отдельный чат.

### Решение

**Одна сущность = Группа доступа + Чат**

### Изменения в API

#### 1. Модель Group (расширить)

```python
class Group(models.Model):
    name = models.CharField(max_length=255)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    # Новые поля для чата
    chat_enabled = models.BooleanField(default=True)
    last_message_at = models.DateTimeField(null=True)
```

#### 2. Новые эндпоинты

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/v1/groups/{id}/messages/` | Сообщения группы (пагинация) |
| POST | `/api/v1/groups/{id}/messages/` | Отправить сообщение |
| POST | `/api/v1/groups/{id}/messages/read/` | Отметить прочитанными |

#### 3. Обновить GET /api/v1/groups/

```json
{
    "id": 1,
    "name": "Команда разработки",
    "members_count": 5,
    "blocks_count": 3,
    "unread_count": 2,
    "last_message": {
        "content": "Привет!",
        "sender_username": "user1",
        "created_at": "2024-01-15T10:30:00Z"
    }
}
```

#### 4. WebSocket событие

```json
{
    "type": "group_message",
    "group_id": 1,
    "sender_id": 123,
    "sender_username": "user1",
    "message": {
        "id": 456,
        "content": "Привет!",
        "created_at": "2024-01-15T10:30:00Z"
    }
}
```

### Frontend готов

Feature flag `UNIFIED_GROUPS` уже реализован:
- `localStorage.setItem('ff_unified_groups', 'true')` - включить
- Все API вызовы переключаются автоматически

### Чеклист

- [ ] Добавить поля `chat_enabled`, `last_message_at` в модель Group
- [ ] Создать модель GroupMessage
- [ ] GET /groups/{id}/messages/ с пагинацией
- [ ] POST /groups/{id}/messages/
- [ ] POST /groups/{id}/messages/read/
- [ ] WebSocket событие `group_message`
- [ ] Миграция данных из chat/groups
- [ ] Удалить старый `/api/v1/chat/groups/` API

---

## ПРИОРИТЕТ 2: Telegram уведомления

### Эндпоинты

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/v1/notifications/telegram/status/` | Статус привязки |
| POST | `/api/v1/notifications/telegram/link/` | Создать ссылку привязки |
| POST | `/api/v1/notifications/telegram/confirm/` | Подтвердить привязку |
| POST | `/api/v1/notifications/telegram/unlink/` | Отвязать аккаунт |
| POST | `/api/v1/notifications/telegram/test/` | Тестовое сообщение |

### Модели

```python
class TelegramLink(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    telegram_id = models.BigIntegerField(unique=True)
    username = models.CharField(max_length=255, null=True)
    linked_at = models.DateTimeField(auto_now_add=True)

class TelegramLinkCode(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    code = models.CharField(max_length=64, unique=True)
    telegram_id = models.BigIntegerField(null=True)
    expires_at = models.DateTimeField()
```

### Telegram Bot

Обработка `/start CODE`:
```python
@dp.message_handler(commands=['start'])
async def start_command(message: types.Message):
    args = message.get_args()
    if args:
        code = TelegramLinkCode.objects.filter(code=args).first()
        if code and code.expires_at > timezone.now():
            code.telegram_id = message.from_user.id
            code.save()
            await message.reply("Вернитесь в OmniMap для подтверждения.")
```

### Типы уведомлений

1. **Напоминания** - Celery task каждую минуту
2. **Изменения блоков** - после `update_block` в RabbitMQ
3. **Сообщения чата** - после `dm` / `group_message`
4. **Подписки на блоки** - при изменении блока

### Чеклист

- [ ] Модель TelegramLink
- [ ] Модель TelegramLinkCode
- [ ] GET /notifications/telegram/status/
- [ ] POST /notifications/telegram/link/
- [ ] POST /notifications/telegram/confirm/
- [ ] POST /notifications/telegram/unlink/
- [ ] POST /notifications/telegram/test/
- [ ] Telegram бот с /start CODE
- [ ] Celery task для напоминаний
- [ ] Отправка уведомлений об изменениях блоков
- [ ] Отправка уведомлений о сообщениях чата

---

## ПРИОРИТЕТ 3: Счётчик непрочитанных

### Эндпоинт

```
GET /api/v1/chat/unread/
```

### Response

```json
{
    "total": 5,
    "dm": 3,
    "groups": 2
}
```

### Использование

Frontend вызывает при инициализации и показывает badge на кнопке "Чаты".

### Чеклист

- [ ] GET /chat/unread/ эндпоинт
- [ ] Подсчёт непрочитанных DM
- [ ] Подсчёт непрочитанных групповых сообщений

---

## Требования безопасности

1. Все endpoints требуют JWT аутентификации
2. Telegram коды: 6-9 цифр, TTL 1 час, rate limiting
3. Telegram ID хранить как BigIntegerField

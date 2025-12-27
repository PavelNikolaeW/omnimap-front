# Задачи для backend-сервисов

## omnimap-back

### Напоминания (Reminders API)

- [ ] Создать модель `Reminder`:
  ```python
  class Reminder(models.Model):
      id = models.UUIDField(primary_key=True, default=uuid.uuid4)
      user = models.ForeignKey(User, on_delete=models.CASCADE)
      block = models.ForeignKey(Block, on_delete=models.CASCADE)
      remind_at = models.DateTimeField()
      timezone = models.CharField(max_length=50, default='Europe/Moscow')
      message = models.TextField(blank=True)
      repeat = models.CharField(max_length=20, choices=[
          ('none', 'Не повторять'),
          ('daily', 'Ежедневно'),
          ('weekly', 'Еженедельно'),
          ('monthly', 'Ежемесячно'),
      ], default='none')
      status = models.CharField(max_length=20, choices=[
          ('pending', 'Ожидает'),
          ('sent', 'Отправлено'),
      ], default='pending')
      created_at = models.DateTimeField(auto_now_add=True)
      sent_at = models.DateTimeField(null=True, blank=True)
  ```

- [ ] Реализовать API endpoints:
  - `POST /api/v1/reminders/` - создать напоминание
  - `GET /api/v1/reminders/` - получить все напоминания (опционально `?status=pending|sent`)
  - `GET /api/v1/blocks/{block_id}/reminder/` - получить напоминание для блока
  - `PATCH /api/v1/reminders/{id}/` - обновить напоминание
  - `DELETE /api/v1/reminders/{id}/` - удалить напоминание

- [ ] Добавить Celery задачу для отправки напоминаний
- [ ] Валидация: remind_at должен быть в будущем, лимит 100 напоминаний на пользователя

### Подписки на изменения (Subscriptions API)

- [ ] Создать модель `BlockSubscription`:
  ```python
  class BlockSubscription(models.Model):
      id = models.UUIDField(primary_key=True, default=uuid.uuid4)
      user = models.ForeignKey(User, on_delete=models.CASCADE)
      block = models.ForeignKey(Block, on_delete=models.CASCADE)
      depth = models.IntegerField(default=1)  # 0=только блок, 1,2,3 или -1=все
      on_text_change = models.BooleanField(default=True)
      on_data_change = models.BooleanField(default=True)
      on_move = models.BooleanField(default=True)
      on_child_add = models.BooleanField(default=True)
      on_child_delete = models.BooleanField(default=True)
      created_at = models.DateTimeField(auto_now_add=True)

      class Meta:
          unique_together = ['user', 'block']
  ```

- [ ] Реализовать API endpoints:
  - `POST /api/v1/subscriptions/` - создать подписку
  - `GET /api/v1/subscriptions/` - получить все подписки пользователя
  - `GET /api/v1/blocks/{block_id}/subscription/` - получить подписку на блок
  - `PATCH /api/v1/subscriptions/{id}/` - обновить подписку
  - `DELETE /api/v1/subscriptions/{id}/` - удалить подписку

- [ ] При изменении блока проверять подписки и отправлять уведомления
- [ ] Лимит 50 подписок на пользователя

### Настройки уведомлений (Notification Settings API)

- [ ] Создать модель `NotificationSettings`:
  ```python
  class NotificationSettings(models.Model):
      user = models.OneToOneField(User, on_delete=models.CASCADE, primary_key=True)
      email_enabled = models.BooleanField(default=False)
      email_mode = models.CharField(max_length=20, choices=[
          ('off', 'Выключено'),
          ('fallback', 'Если Telegram недоступен'),
          ('always', 'Всегда'),
      ], default='off')
      quiet_hours_enabled = models.BooleanField(default=False)
      quiet_hours_start = models.TimeField(default='23:00')
      quiet_hours_end = models.TimeField(default='08:00')
      timezone = models.CharField(max_length=50, default='Europe/Moscow')
      telegram_chat_id = models.CharField(max_length=100, blank=True, null=True)
      telegram_username = models.CharField(max_length=100, blank=True, null=True)
      telegram_linked_at = models.DateTimeField(null=True, blank=True)
  ```

- [ ] Реализовать API endpoints:
  - `GET /api/v1/notifications/settings/` - получить настройки
  - `PATCH /api/v1/notifications/settings/` - обновить настройки

### Telegram интеграция

- [ ] Создать Telegram бота (omnimap-back или отдельный сервис)
- [ ] Реализовать API endpoints:
  - `GET /api/v1/notifications/telegram/status/` - статус привязки
  - `POST /api/v1/notifications/telegram/link/` - получить ссылку для привязки (генерирует одноразовый токен)
  - `POST /api/v1/notifications/telegram/unlink/` - отвязать Telegram
  - `POST /api/v1/notifications/telegram/test/` - отправить тестовое сообщение

- [ ] Telegram бот должен:
  - Обрабатывать команду /start с токеном для привязки
  - Сохранять chat_id пользователя
  - Отправлять напоминания и уведомления об изменениях

### Push уведомления (Web Push API)

- [ ] Реализовать API endpoints:
  - `POST /api/v1/notifications/push/subscribe/` - подписать устройство (принимает PushSubscription объект)
  - `POST /api/v1/notifications/push/unsubscribe/` - отписать устройство
  - `POST /api/v1/notifications/push/test/` - отправить тестовое уведомление

- [ ] Хранить VAPID ключи
- [ ] Поддержка нескольких устройств на пользователя

## llm-gateway

Изменений не требуется.

## omnimap-sync

- [ ] Добавить WebSocket события:
  - `reminder_created` - напоминание создано
  - `reminder_updated` - напоминание обновлено
  - `reminder_deleted` - напоминание удалено
  - `subscription_created` - подписка создана
  - `subscription_updated` - подписка обновлена
  - `subscription_deleted` - подписка удалена

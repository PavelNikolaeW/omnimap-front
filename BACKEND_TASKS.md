# Backend: Регистрация по инвайт-кодам

## Контекст

Фронтенд добавляет обязательное поле `invite_code` в форму регистрации. Бэкенд должен принимать и валидировать этот код при регистрации.

## Модель `InviteCode`

```python
class InviteCode(models.Model):
    code = models.CharField(max_length=50, unique=True, db_index=True)
    is_active = models.BooleanField(default=True)
    max_uses = models.PositiveIntegerField(default=0)  # 0 = безлимитный
    times_used = models.PositiveIntegerField(default=0)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
```

## Изменения в `/api/v1/register/`

- Принимать поле `invite_code` в POST body
- Валидация:
  - Код существует и `is_active=True`
  - Не истёк (`expires_at` is null или > now)
  - Не исчерпан (`max_uses=0` или `times_used < max_uses`)
- При успешной регистрации: `times_used += 1`

## Формат ошибок (стандартный Django REST)

```json
{"invite_code": ["Invalid invite code."]}
{"invite_code": ["Invite code is required."]}
{"invite_code": ["This invite code has expired."]}
{"invite_code": ["This invite code has reached its usage limit."]}
```

## Django Admin

- Регистрация модели `InviteCode` в admin
- Фильтры: `is_active`, `expires_at`
- Поиск по `code`
- Отображение: `code`, `is_active`, `max_uses`, `times_used`, `expires_at`, `created_at`

# Принудительное обновление приложения

Если в мобильном браузере застряла старая версия и автоматическое обновление не срабатывает, используйте один из этих способов:

## Способ 1: URL параметр (Самый простой)

Откройте приложение с параметром `?forceUpdate=1`:

```
https://omnimap.ru/?forceUpdate=1
```

Приложение автоматически:
1. Очистит все кеши
2. Удалит Service Worker
3. Перезагрузится с новой версией

## Способ 2: Команда в приложении

1. Откройте приложение
2. Нажмите `Ctrl+K` (или `Cmd+K` на Mac) чтобы открыть палитру команд
3. Введите `forceUpdate` или найдите "Принудительное обновление"
4. Подтвердите действие

## Способ 3: Консоль браузера (Для разработчиков)

1. Откройте DevTools (F12)
2. Перейдите в Console
3. Выполните команду:

```javascript
versionChecker.forceUpdate()
```

## Что происходит при принудительном обновлении?

1. **Очистка всех кешей** - удаляются все закешированные файлы (HTML, JS, CSS, API ответы)
2. **Удаление Service Worker** - отменяется регистрация старого Service Worker
3. **Hard reload** - страница перезагружается с timestamp в URL, минуя все кеши

## Автоматическое обновление

Приложение автоматически проверяет новую версию:
- Каждые 5 минут
- При восстановлении интернет-соединения
- Когда приложение снова становится активным (после переключения вкладок)

Когда доступна новая версия, появляется уведомление:
```
🎉 Доступна новая версия!
[Обновить сейчас] [Позже]
```

## Для разработчиков

### Изменения в коде

**versionChecker.js** (`src/js/core/versionChecker.js`):
- Добавлен timestamp в fetch запросы для bypass кеша
- Добавлена проверка URL параметра `forceUpdate`
- Улучшен метод `forceUpdate()` - удаление SW перед reload

**commands.js** (`src/js/controller/comands/commands.js`):
- Добавлена команда `forceUpdate` для ручного обновления

### Как работает bypass кеша

```javascript
// Timestamp минует Service Worker и браузерный кеш
const cacheBuster = `_v=${Date.now()}`;
fetch(`/?${cacheBuster}`, {
    cache: 'no-store',
    headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    }
});
```

### Версионирование

Версия приложения задаётся через переменную окружения:
```bash
APP_VERSION=1.2.3 npm run build
```

И инжектируется webpack:
```javascript
webpack.DefinePlugin({
    APP_VERSION: JSON.stringify(process.env.APP_VERSION || 'dev')
})
```

## Troubleshooting

### Проблема: Обновление не помогло

**Решение:** Попробуйте очистить кеш браузера вручную:
- **iOS Safari:** Настройки → Safari → Очистить историю и данные
- **Android Chrome:** Настройки → Конфиденциальность → Очистить данные браузера

### Проблема: Уведомление об обновлении не появляется

**Решение:** Проверьте в консоли:
```javascript
console.log('[VersionChecker] Current version:', APP_VERSION);
versionChecker.checkNow();
```

### Проблема: Service Worker блокирует обновление

**Решение:** Удалите Service Worker через DevTools:
1. DevTools → Application → Service Workers
2. Нажмите "Unregister"
3. Перезагрузите страницу

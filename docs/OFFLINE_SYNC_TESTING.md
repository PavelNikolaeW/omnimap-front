# Чеклист тестирования офлайн-синхронизации

## Тест 1: Базовый офлайн-режим через DevTools

- [ ] Открой приложение в Chrome
- [ ] DevTools → Network tab → **Throttling: Offline**
- [ ] Создай 2-3 блока
- [ ] В консоли проверь очередь:
  ```javascript
  await localforage.getItem('offlineOperationsQueue')
  ```
  Должны быть операции с типом `createBlock`
- [ ] Сними "Offline" режим
- [ ] Смотри консоль — должны появиться логи:
  ```
  🔄 Starting pull phase before push...
  📤 Push phase: processing N operations via batch import
  ```
- [ ] Блоки должны появиться на сервере (проверь в другом браузере/устройстве)

## Тест 2: Retry механизм при нестабильной сети

- [ ] Открой приложение
- [ ] В консоли проверь состояние:
  ```javascript
  const { offlineQueue } = await import('./js/sincManager/offlineQueue.js');
  console.log('isOnline:', offlineQueue.isOnline);
  console.log('retryAttempts:', offlineQueue.retryAttempts);
  ```
- [ ] Отключи сеть (DevTools → Offline)
- [ ] Создай блок
- [ ] Наблюдай в консоли логи retry:
  ```
  🔄 Scheduling retry #1 in 5s
  🔄 Scheduling retry #2 in 10s
  🔄 Scheduling retry #3 in 20s
  ```
- [ ] Включи сеть
- [ ] Должен появиться лог:
  ```
  ✅ Network is back, starting sync...
  ```
- [ ] Блоки должны синхронизироваться

## Тест 3: Очистка устаревших операций

- [ ] В консоли браузера добавь "старую" операцию:
  ```javascript
  const oldQueue = [{
    type: 'createBlock',
    data: { blockId: 'test-old-block' },
    timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 // 8 дней назад
  }];
  await localforage.setItem('offlineOperationsQueue', oldQueue);
  ```
- [ ] Перезагрузи страницу
- [ ] В консоли должен быть лог:
  ```
  ⚠️ Removing 1 stale operations (older than 7 days): ["createBlock:test-old-block"]
  ```
- [ ] Проверь что очередь пуста:
  ```javascript
  await localforage.getItem('offlineOperationsQueue')
  // Должен вернуть [] или null
  ```

## Тест 4: Диалог подтверждения при закрытии

- [ ] Отключи сеть (DevTools → Offline)
- [ ] Создай блок
- [ ] Попробуй закрыть вкладку (Ctrl+W / Cmd+W)
- [ ] Должен появиться диалог "У вас есть несохранённые изменения"
- [ ] Отмени закрытие
- [ ] Включи сеть
- [ ] Дождись синхронизации (смотри консоль)
- [ ] Попробуй закрыть вкладку снова
- [ ] Диалога быть НЕ должно

## Тест 5: WiFi без интернета (реальный сценарий)

- [ ] Подключись к WiFi роутеру, отключённому от интернета
- [ ] Открой приложение (должно загрузиться из кэша)
- [ ] Создай несколько блоков
- [ ] Подключи роутер к интернету
- [ ] Наблюдай автоматическую синхронизацию через retry механизм
- [ ] Блоки должны появиться на сервере

## Тест 6: Проверка через мониторинг в консоли

Для отладки можно добавить слушатели событий:

```javascript
// Добавь в консоль для мониторинга
window.addEventListener('NetworkStatusChange', e =>
  console.log('📶 Network:', e.detail.online ? 'ONLINE' : 'OFFLINE'));

window.addEventListener('SyncStarted', e =>
  console.log('🔄 Sync started:', e.detail));

window.addEventListener('SyncCompleted', e =>
  console.log('✅ Sync completed:', e.detail));

window.addEventListener('SyncProgress', e =>
  console.log('📊 Sync progress:', e.detail));

window.addEventListener('StaleOperationsRemoved', e =>
  console.log('🗑️ Stale operations removed:', e.detail));
```

## Ожидаемое поведение

| Сценарий | Ожидаемый результат |
|----------|---------------------|
| Создание блоков офлайн | Блоки сохраняются локально, добавляются в очередь |
| Восстановление сети | Автоматическая синхронизация через 5 сек (или раньше через retry) |
| Сетевая ошибка при синхронизации | Retry с exponential backoff (5→10→20→40→60 сек) |
| Закрытие страницы с несинхронизированными данными | Диалог подтверждения |
| Операции старше 24 часов | Автоматическая очистка при загрузке страницы |
| navigator.onLine = true, но сети нет | Retry механизм определит реальное состояние через fetch |

## Полезные команды для отладки

```javascript
// Импорт offlineQueue
const { offlineQueue } = await import('./js/sincManager/offlineQueue.js');

// Проверить состояние
offlineQueue.isOnline
offlineQueue.isSyncing
offlineQueue.isPulling
offlineQueue.retryAttempts
offlineQueue.cachedQueueLength

// Получить очередь
await offlineQueue.getQueue()

// Принудительная синхронизация
await offlineQueue.startPullPhase()

// Очистить очередь (осторожно!)
await offlineQueue.clearQueue()
```

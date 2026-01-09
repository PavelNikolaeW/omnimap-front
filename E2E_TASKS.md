# Задачи по E2E тестам

## Анализ от 2026-01-06

Проанализировано 149 упавших тестов из 644. Выявлены следующие категории проблем:

---

## Исправлено (в ветке `fix/option-manager-undefined`)

### 1. Runtime Error: ctx.optionManager undefined
- **Файл:** `src/js/controller/comands/commands.js:575`
- **Проблема:** Команда `options` вызывает `ctx.optionManager.openOptions()`, но `optionManager` не инициализирован
- **Решение:** Добавлена защитная проверка с `console.warn`

### 2. Неправильные ID команд в тестах
| Было | Стало | Файлы |
|------|-------|-------|
| `#uploadImage` | `#uploadBlockImage` | `image-upload.spec.ts`, `image-upload.popup.ts` |
| `#search` | `#findBlock` | `search.spec.ts`, `search.popup.ts` |
| `#import` | `#importBlocks` | `import.spec.ts` |
| `#reminder` | `#setReminder` | `reminders-subscriptions.spec.ts`, `reminder.popup.ts` |
| `#remindersList` | `#myReminders` | `reminders-subscriptions.spec.ts`, `reminder.popup.ts` |

---

## Требует реализации (большие задачи)

### 1. Реализовать OptionManager
**Приоритет:** Высокий
**Влияние:** ~40+ тестов

**Описание:**
Меню "Дополнительные функции" (хоткей `o`) не открывает никакого UI.
Класс `OptionManager` существует в `src/js/controller/comands/optionManager.js`, но:
- Методы пустые
- Экземпляр нигде не создаётся
- Не передаётся в контекст команд

**Затронутые тесты:**
- `popups.spec.ts` — все тесты используют `pressHotkey('o')` для доступа к подменю
- `import.spec.ts` — импорт через меню опций
- `reminders-subscriptions.spec.ts` — напоминания через меню опций

**Варианты решения:**
1. Реализовать полноценный OptionManager с UI меню
2. Убрать промежуточное меню, сделать прямой доступ к функциям через хоткеи
3. Временно пропустить (skip) тесты, зависящие от OptionManager

---

### 2. Реализовать HistoryView (История изменений)
**Приоритет:** Средний
**Влияние:** ~10 тестов

**Описание:**
Команда `historyView` закомментирована в `src/js/controller/comands/popupsCmd.js:293-337`.
Требуется:
- Раскомментировать и доработать команду
- Реализовать `HistoryPopup`
- Добавить API endpoints `getBlockHistory`, `revertBlockToHistory`

**Затронутые тесты:**
- `popups.spec.ts` — секция "История изменений (HistoryPopup)"

---

### 3. Проверить multiuser sync тесты
**Приоритет:** Средний
**Влияние:** ~15 тестов

**Описание:**
На скриншотах viewer видит пустую страницу. Возможные причины:
- Тестовые пользователи не созданы на бэкенде
- Неправильные права доступа к shared блокам
- Проблема с авторизацией viewer

**Затронутые тесты:**
- `03-multiuser-sync.spec.ts`
- `sync-multiuser.spec.ts`

**Требуется проверить:**
1. Созданы ли пользователи `e2e_admin`, `e2e_editor`, `e2e_viewer` на бэкенде
2. Есть ли shared блоки с правильными правами
3. Работает ли авторизация для всех ролей

---

## Рекомендации

1. **Сначала** смержить текущие фиксы — они устранят runtime errors
2. **Затем** решить вопрос с OptionManager — это разблокирует большинство тестов
3. **Потом** разобраться с multiuser тестами — возможно проблема в инфраструктуре, а не в коде
4. **В последнюю очередь** реализовать HistoryView — это новый функционал

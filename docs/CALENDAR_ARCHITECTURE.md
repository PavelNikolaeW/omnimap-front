# Calendar Architecture

Документация по иерархическому календарю в OmniMap.

## Обзор

Календарь генерируется через `CalendarGenerator.js` и импортируется **одним запросом** через `LayoutEditorPanel.js`.

**Иерархия:** Год → Кварталы → Месяцы (WeeksContainer) → Недели (DaysContainer) → Дни

**Каждый уровень имеет:** План + Итоги для планирования и ретроспективы.

**Ключевая особенность:** Link-блоки для граничных недель включены прямо в payload импорта — без дополнительных API вызовов.

## Ключевые файлы

| Файл | Назначение |
|------|------------|
| `src/js/controller/layoutEditor/CalendarGenerator.js` | Генерация ~650 блоков |
| `src/js/controller/layoutEditor/LayoutEditorPanel.js` | UI + метод `createYearCalendar()` |
| `src/js/__tests__/controller/layoutEditor/CalendarGenerator.test.js` | 39 тестов |

## Структура блоков

### Год (gridSize: 2×3)

```
+------------+--------+--------+
| План 2026  |   Q1   |   Q2   |
| (1,1)      | (1,2)  | (1,3)  |
+------------+--------+--------+
| Итоги 2026 |   Q3   |   Q4   |
| (2,1)      | (2,2)  | (2,3)  |
+------------+--------+--------+
```

```javascript
data: {
    calendarType: 'year',
    layout: 'cells',
    layoutCells: { gridSize: { rows: 2, cols: 3 }, cells: {...} }
}
// Дети: yearPlan, yearRetro, 4 quarters
```

### Квартал (gridSize: 2×4)

```
+----------+--------+--------+--------+
| План Q1  | Месяц1 | Месяц2 | Месяц3 |
| (1,1)    | (1-2,2)| (1-2,3)| (1-2,4)|
+----------+        |        |        |
| Итоги Q1 |        |        |        |
| (2,1)    |        |        |        |
+----------+--------+--------+--------+
```

```javascript
data: {
    calendarType: 'quarter',
    calendarQuarter: 1, // 1-4
    layout: 'cells',
    layoutCells: { gridSize: { rows: 2, cols: 4 } }
}
// Месяцы: rowSpan=2, colSpan=1
```

### Месяц (gridSize: 2×2)

```
+------------------+------------------+
| План (1,1)       | Недели (1-2, 2)  |
|                  | WeeksContainer   |
+------------------+ rowSpan=2        |
| Итоги (2,1)      |                  |
+------------------+------------------+
```

```javascript
data: {
    calendarType: 'month',
    calendarMonth: 1, // 1-12
    layout: 'cells',
    layoutCells: { gridSize: { rows: 2, cols: 2 } }
}
// План и Итоги по 50% высоты в col 1
// WeeksContainer занимает 100% высоты в col 2
```

### Контейнер Недель (gridSize: N×1)

```
+--------+
| Нед.1  | row 1
| Нед.2  | row 2
| Нед.3  | row 3
| ...    |
| Link   | row N (может быть ссылкой)
+--------+
```

```javascript
data: {
    calendarType: 'weeksContainer',
    calendarMonth: 1,
    calendarYear: 2026,
    layout: 'cells',
    layoutCells: { gridSize: { rows: N, cols: 1 }, cells: {...} },
    childOrder: [weekId1, weekId2, ..., linkBlockId]
}
```

**Преимущества:**
- WeeksContainer можно шарить отдельно от планов месяца
- Граничные недели представлены как link-блоки

### Неделя (gridSize: 2×2)

```
+------------------+------------------+
| План (1,1)       | Дни (1-2, 2)     |
|                  | DaysContainer    |
+------------------+ rowSpan=2        |
| Итоги (2,1)      |                  |
+------------------+------------------+
```

**Преимущества:**
- План и Итоги занимают 50% ширины (левая колонка)
- DaysContainer занимает 50% ширины (правая колонка)
- Можно шарить блок "Дни" как ссылку без раскрытия планов

### Контейнер Дней (gridSize: 7×1)

```
+------+
| Пн   | row 1
| Вт   | row 2
| Ср   | row 3
| Чт   | row 4
| Пт   | row 5
| Сб   | row 6
| Вс   | row 7
+------+
```

```javascript
data: {
    calendarType: 'daysContainer',
    calendarWeekNumber: 1,
    calendarMonth: 1,
    calendarYear: 2026,
    layout: 'cells',
    layoutCells: { gridSize: { rows: 7, cols: 1 }, cells: {...} },
    childOrder: [dayId1, dayId2, ...]
}
```

### День

```javascript
data: {
    calendarType: 'day',
    calendarDay: 15,
    calendarMonth: 1,
    calendarYear: 2026,
    calendarWeekday: 4, // 1=Пн, 7=Вс
    isWeekend: false,
    isoDate: '2026-01-15',
    weekdayName: 'Чт'
}
title: '15' // только число
```

### Link-блок (для граничных недель)

```javascript
{
    id: 'uuid-link-блока',
    parent_id: 'uuid-weeksContainer',
    title: 'Неделя (ссылка)',
    data: {
        view: 'link',
        source: 'uuid-реальной-недели',
        calendarType: 'weekLink',
        isoWeekKey: '2026-W14',
        calendarYear: 2026,
        calendarMonth: 3  // Март показывает ссылку на неделю Апреля
    }
}
```

## ISO 8601 - Правило недель

**Неделя принадлежит месяцу, где находится четверг.**

Пример: 29 дек - 4 янв
- Пн 29, Вт 30, Ср 31 (декабрь) + Чт 1, Пт 2, Сб 3, Вс 4 (январь)
- Четверг = 1 января → неделя принадлежит **январю**
- Декабрь получает **link-блок** на эту неделю

```javascript
function isOwner(weekStart, monthNum, year) {
    const thursday = new Date(weekStart);
    thursday.setDate(thursday.getDate() + 3);
    return thursday.getMonth() + 1 === monthNum && thursday.getFullYear() === year;
}
```

## Двухпроходный алгоритм

### Проход 1: Создание блоков и регистрация недель

```javascript
for (каждый месяц) {
    // Создаём weeksContainer
    for (week of weeksOfMonth) {
        if (week.isOwner) {
            // Создаём реальный блок недели
            weekRegistry.set(week.isoWeekKey, { blockId, ownerMonth });
            allBlocks.push(weekBlock);
        } else {
            // Сохраняем для второго прохода
            pendingLinks.push({ isoWeekKey, row });
        }
    }
}
```

### Проход 2: Создание link-блоков

```javascript
for (каждый weeksContainer) {
    for (link of pendingLinks) {
        const weekInfo = weekRegistry.get(link.isoWeekKey);
        // Создаём link-блок прямо в массив blocks
        const linkBlock = {
            id: generateBlockId(),
            parent_id: weeksContainer.id,
            title: 'Неделя (ссылка)',
            data: {
                view: 'link',
                source: weekInfo.blockId,
                calendarType: 'weekLink',
                isoWeekKey: link.isoWeekKey
            }
        };
        blocks.push(linkBlock);
        weeksContainer.data.childOrder.push(linkBlock.id);
        weeksContainer.data.layoutCells.cells[linkBlock.id] = { row, col: 1 };
    }
}
```

## calendarType значения

| Тип | Описание |
|-----|----------|
| `year` | Блок года |
| `yearPlan` | План года |
| `yearRetro` | Итоги года |
| `quarter` | Блок квартала |
| `quarterPlan` | План квартала |
| `quarterRetro` | Итоги квартала |
| `month` | Блок месяца |
| `monthPlan` | План месяца |
| `monthRetro` | Итоги месяца |
| `weeksContainer` | Контейнер недель месяца (можно шарить отдельно) |
| `week` | Блок недели |
| `weekPlan` | План недели |
| `weekRetro` | Итоги недели |
| `weekLink` | Ссылка на неделю (для граничных недель) |
| `daysContainer` | Контейнер дней недели (можно шарить отдельно) |
| `day` | Блок дня |

## Шаблоны Итогов

```javascript
const RETRO_TEMPLATES = {
    year: '• Главные достижения года:\n• Что не удалось:\n• Уроки и выводы:\n• Благодарности:',
    quarter: '• Ключевые результаты:\n• Что не получилось:\n• Что улучшить в следующем квартале:',
    month: '• Выполненные задачи:\n• Незавершённое:\n• Выводы:',
    week: '• Что получилось:\n• Что не получилось:\n• Что улучшить:'
};
```

## История изменений

### v3.0 (2026-01-14)
- ✅ **Link-блоки включены в payload импорта** — никаких дополнительных API вызовов
- ✅ Добавлен `weeksContainer` - контейнер недель месяца
- ✅ Новый лейаут месяца 2×2: План + Итоги (50%) | Недели (50%)
- ✅ Возможность шарить недели отдельно от планов

### v2.0 (2026-01-14)
- ✅ Исправлена логика граничных недель (ссылки создаются корректно)
- ✅ Добавлен `daysContainer` - контейнер для 7 дней недели
- ✅ Новый лейаут недели 2×2: План + Итоги (50%) | Дни (50%)
- ✅ Возможность шарить дни отдельно от планов

## Статистика блоков (2026)

| Тип | Количество |
|-----|------------|
| Год | 1 |
| Кварталы | 4 |
| Месяцы | 12 |
| weeksContainers | 12 |
| Недели | ~53 |
| Link-блоки | ~12 |
| daysContainers | ~53 |
| Дни | 365 |
| yearPlanRetro | 2 |
| quarterPlanRetro | 8 |
| monthPlanRetro | 24 |
| weekPlanRetro | ~106 |
| **Всего** | **~652** |

## API endpoints

```javascript
// Bulk import блоков (включая link-блоки)
importBlocks(blocks) → { task_id }
pollImportStatus(task_id, callback) → Promise

// Link-блоки теперь импортируются вместе с остальными блоками!
// Формат link-блока в payload:
{
    id: 'uuid',
    parent_id: 'parent-uuid',
    data: {
        view: 'link',
        source: 'source-block-uuid'
    }
}
```

## Запуск тестов

```bash
npx jest src/js/__tests__/controller/layoutEditor/CalendarGenerator.test.js --no-coverage
```

39 тестов покрывают все уровни иерархии, link-блоки и граничные случаи.

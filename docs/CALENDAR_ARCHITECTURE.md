# Calendar Architecture

Документация по иерархическому календарю в OmniMap.

## Обзор

Календарь генерируется через `CalendarGenerator.js` и импортируется через `LayoutEditorPanel.js`.

**Иерархия:** Год → Кварталы → Месяцы → Недели → Дни

**Каждый уровень имеет:** План + Итоги для планирования и ретроспективы.

## Ключевые файлы

| Файл | Назначение |
|------|------------|
| `src/js/controller/layoutEditor/CalendarGenerator.js` | Генерация ~540 блоков |
| `src/js/controller/layoutEditor/LayoutEditorPanel.js` | UI + метод `createYearCalendar()` |
| `src/js/__tests__/controller/layoutEditor/CalendarGenerator.test.js` | 32 теста |

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

### Месяц (gridSize: N×2)

```
+----------+--------+
| План Янв | Нед.1  |
| (1-3,1)  | (1,2)  |
|          | Нед.2  |
|          | (2,2)  |
+----------+ Нед.3  |
| Итоги Янв| (3,2)  |
| (4-N,1)  | Нед.4  |
|          | (4,2)  |
+----------+--------+
```

```javascript
data: {
    calendarType: 'month',
    calendarMonth: 1, // 1-12
    layout: 'cells',
    layoutCells: { gridSize: { rows: N, cols: 2 } }
}
// План: ~60% высоты, Итоги: ~40%
// Недели в col 2
```

### Неделя (gridSize: 7×3) - ТЕКУЩАЯ ВЕРСИЯ

```
+------------------+------+
| План (1-5, 1-2)  | Пн   |
| rowSpan=5        | Вт   |
| colSpan=2        | Ср   |
|                  | Чт   |
|                  | Пт   |
+------------------+------+
| Итоги (6-7, 1-2) | Сб   |
| rowSpan=2        | Вс   |
+------------------+------+
```

### Неделя (gridSize: 2×2) - ПЛАНИРУЕМАЯ ВЕРСИЯ

```
+------------------+------------------+
| План (1,1)       | Дни (1-2, 2)     |
|                  | rowSpan=2        |
+------------------+ (контейнер с 7   |
| Итоги (2,1)      |  дочерними днями)|
+------------------+------------------+
```

**Преимущество:** Можно шарить блок "Дни" как ссылку без раскрытия планов.

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

## ISO 8601 - Правило недель

**Неделя принадлежит месяцу, где находится четверг.**

Пример: 29 дек - 4 янв
- Пн 29, Вт 30, Ср 31 (декабрь) + Чт 1, Пт 2, Сб 3, Вс 4 (январь)
- Четверг = 1 января → неделя принадлежит **январю**
- Декабрь получает **ссылку** на эту неделю

```javascript
function isOwner(weekStart, monthNum, year) {
    const thursday = new Date(weekStart);
    thursday.setDate(thursday.getDate() + 3);
    return thursday.getMonth() + 1 === monthNum && thursday.getFullYear() === year;
}
```

## Двухпроходный алгоритм

### Проход 1: Создание блоков

```javascript
for (каждый месяц) {
    const weeks = getWeeksOfMonth(year, monthNum);
    for (week of weeks) {
        if (week.isOwner) {
            // Создаём реальный блок недели
            weekRegistry.set(week.isoWeekKey, { blockId, ownerMonth });
        } else {
            // Помечаем для создания ссылки
            weekIds.push({ type: 'link', isoWeekKey, row });
        }
    }
}
```

### Проход 2: Создание ссылок

```javascript
for (каждый месяц) {
    for (weekRef of месяц._weekIds) {
        if (weekRef.type === 'link') {
            const weekInfo = weekRegistry.get(weekRef.isoWeekKey);
            linkRequests.push({
                destBlockId: месяц.id,
                srcBlockId: weekInfo.blockId,
                row: weekRef.row,
                col: 2
            });
        }
    }
}
```

## Link Requests

Формат запроса на создание ссылки:

```javascript
{
    destBlockId: 'uuid-месяца',
    srcBlockId: 'uuid-недели-владельца',
    isoWeekKey: '2026-W01',
    row: 1,  // позиция в сетке месяца
    col: 2   // недели всегда в col 2
}
```

### Создание ссылок (LayoutEditorPanel.js)

```javascript
// После импорта блоков
for (const link of linkRequests) {
    const response = await api.pasteLinkBlock({
        dest: link.destBlockId,
        src: [link.srcBlockId]
    });
    // response.data.id - ID созданного link-блока
    // Обновляем layoutCells месяца с позицией ссылки
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
| `week` | Блок недели |
| `weekPlan` | План недели |
| `weekRetro` | Итоги недели |
| `day` | Блок дня |
| `daysContainer` | Контейнер дней (планируется) |

## Шаблоны Итогов

```javascript
const RETRO_TEMPLATES = {
    year: '• Главные достижения года:\n• Что не удалось:\n• Уроки и выводы:\n• Благодарности:',
    quarter: '• Ключевые результаты:\n• Что не получилось:\n• Что улучшить в следующем квартале:',
    month: '• Выполненные задачи:\n• Незавершённое:\n• Выводы:',
    week: '• Что получилось:\n• Что не получилось:\n• Что улучшить:'
};
```

## Известные баги (TODO)

1. **Март не получает ссылку на последнюю неделю** - проверить логику граничных недель
2. **Дни не в отдельном контейнере** - нужно обернуть 7 дней в блок `daysContainer`

## Статистика блоков (2026)

| Тип | Количество |
|-----|------------|
| Год | 1 |
| Кварталы | 4 |
| Месяцы | 12 |
| Недели | ~52 |
| Дни | 365+ |
| yearPlanRetro | 2 |
| quarterPlanRetro | 8 |
| monthPlanRetro | 24 |
| weekPlanRetro | ~104 |
| **Всего** | **~540** |

## API endpoints

```javascript
// Bulk import блоков
importBlocks(blocks) → { task_id }
pollImportStatus(task_id, callback) → Promise

// Создание ссылки
api.pasteLinkBlock({ dest, src: [srcId] }) → { data: { id: newLinkBlockId } }

// Обновление layoutCells после создания ссылок
api.updateBlock(blockId, { data: JSON.stringify(newData) })
```

## Запуск тестов

```bash
npx jest src/js/__tests__/controller/layoutEditor/CalendarGenerator.test.js --no-coverage
```

32 теста покрывают все уровни иерархии и граничные случаи.

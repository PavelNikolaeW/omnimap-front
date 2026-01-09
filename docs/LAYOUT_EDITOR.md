# Visual Layout Editor

Визуальный редактор раскладки блоков позволяет настраивать положение дочерних блоков через drag-and-drop интерфейс.

## Обзор

**Hotkey:** `l+e` (команда `openLayoutEditor`)

**Файлы:**
```
src/js/controller/layoutEditor/
├── LayoutEditorPanel.js      # Главная панель (extends Popup)
├── LayoutCellManager.js      # Управление ячейками и валидация span
├── LayoutDragManager.js      # Drag-and-drop логика
├── LayoutPreview.js          # Превью-рендеринг сетки
└── LayoutDataConverter.js    # Конвертация между форматами

src/style/
└── layout-editor.css         # Стили редактора
```

## Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                    LayoutEditorPanel                            │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐  │
│  │      LayoutPreview      │  │     Settings Panel          │  │
│  │   (drag-and-drop grid)  │  │  - Grid size inputs         │  │
│  │   ┌───┬───┬───┐        │  │  - Preset buttons           │  │
│  │   │ A │ B │ C │        │  │  - Selected block controls  │  │
│  │   ├───┴───┼───┤        │  │                             │  │
│  │   │   D   │ E │        │  └─────────────────────────────┘  │
│  │   └───────┴───┘        │                                    │
│  └─────────────────────────┘                                    │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ [Сбросить]  [Отмена]  [Применить]                          ││
│  └────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Формат данных: layoutCells

Блок с кастомной раскладкой хранит данные в `block.data.layoutCells`:

```javascript
block.data = {
    layout: 'cells',           // Тип раскладки
    layoutCells: {
        gridSize: { rows: 3, cols: 12 },
        presetType: 'dashboard',  // Тип пресета для стилизации
        cells: {
            'child-uuid-1': { row: 1, col: 1, rowSpan: 2, colSpan: 6 },
            'child-uuid-2': { row: 1, col: 7, rowSpan: 1, colSpan: 6 },
            'child-uuid-3': { row: 2, col: 7, rowSpan: 1, colSpan: 6 },
        }
    }
}
```

**Визуализация:**
```
Col:  1   2   3   4   5   6   7   8   9  10  11  12
    ┌───────────────────────┬───────────────────────┐
R1  │                       │        Child 2        │
    │       Child 1         ├───────────────────────┤
R2  │     (2 rows)          │        Child 3        │
    └───────────────────────┴───────────────────────┘
```

## Пресеты раскладки

| Пресет | Сетка | Вместимость | Описание |
|--------|-------|-------------|----------|
| `2x2` | 2×2 | 4 блока | Простая сетка 2×2 |
| `3x3` | 3×3 | 9 блоков | Простая сетка 3×3 |
| `4x4` | 4×4 | 16 блоков | Простая сетка 4×4 |
| `sidebar` | 3×12 | ∞ | Сайдбар слева + контент |
| `sidebar-right` | 3×12 | ∞ | Сайдбар справа + контент |
| `dashboard` | 3×12 | ∞ | Главный блок + виджеты + метрики |
| `kanban` | 2×3 | 3 блока | Доска: To Do, In Progress, Done |
| `holy-grail` | 3×12 | ∞ | Header + Footer + 3 колонки |
| `gallery` | 2×12 | ∞ | Большие и маленькие карточки |
| `calendar` | 5×7 | 35 блоков | Календарь на месяц |

**Примечание:** Пресеты с ограниченной вместимостью (2x2, 3x3, 4x4, kanban, calendar) отключаются если блоков больше чем может вместить пресет.

### Конфигурация пресетов

В `LayoutEditorPanel.js` есть `PRESET_CONFIG`:

```javascript
const PRESET_CONFIG = {
    '2x2': { maxBlocks: 4, minBlocks: 0, description: 'Сетка 2×2 для 4 блоков' },
    'kanban': { maxBlocks: 3, minBlocks: 0, description: 'Доска с 3 колонками' },
    'dashboard': { maxBlocks: null, minBlocks: 1, description: 'Главный блок + виджеты' },
    // ...
};
```

## Пресеты с rich-data

Некоторые пресеты создают блоки с дополнительными данными:

### Calendar

```javascript
{
    calendarDay: 15,           // День месяца
    calendarMonth: 1,          // Месяц (1-12)
    calendarYear: 2026,        // Год
    isToday: true,             // Текущий день
    isWeekend: true,           // Выходной (Сб, Вс)
}
```

Цвета выходных и текущего дня вычисляются автоматически через `CalcColor` с учётом родительского цвета.

### Kanban

```javascript
{
    kanbanColumn: 1,           // Номер колонки
    kanbanStatus: 'to_do',     // Статус: to_do, in_progress, done
}
```

### Dashboard

```javascript
{
    dashboardRole: 'main',     // Роль: main, widget, metric
}
```

## CSS Data-атрибуты для пресетов

**Файл:** `src/style/layout-editor.css`

Блоки в layoutCells получают data-атрибуты на основе `presetType`:

```css
/* Calendar */
[data-calendar-today="true"] { outline: 3px solid #3b82f6; }
/* Выходные окрашиваются через CalcColor с тёплым сдвигом hue */

/* Kanban */
[data-kanban-status="to_do"] { border-left: 4px solid #f59e0b; }
[data-kanban-status="in_progress"] { border-left: 4px solid #3b82f6; }
[data-kanban-status="done"] { border-left: 4px solid #22c55e; }

/* Dashboard */
[data-dashboard-role="metric"] { font-size: 0.9em; }
```

## Ключевые компоненты

### LayoutEditorPanel

Главная панель редактора. Singleton для предотвращения множественных окон.

```javascript
import { LayoutEditorPanel } from './controller/layoutEditor/LayoutEditorPanel.js';

// Открыть редактор
LayoutEditorPanel.show(ctx);

// Методы экземпляра
panel.applyPreset('dashboard');  // Применить пресет
panel.applyLayout();             // Сохранить и закрыть
panel.resetLayout();             // Сбросить к авто-раскладке
panel.refreshPreview();          // Обновить превью
panel.isPresetAvailable('2x2');  // Проверить доступность пресета
```

### LayoutCellManager

Управляет occupancy grid и валидацией позиций:

```javascript
cellManager.canPlace(childId, row, col, rowSpan, colSpan);  // Проверка
cellManager.place(childId, row, col, rowSpan, colSpan);     // Размещение
cellManager.remove(childId);                                  // Удаление
cellManager.rebuildOccupancyGrid();                          // Перестроить
```

**Автоочистка orphan cells:**
При вызове `rebuildOccupancyGrid()` автоматически удаляются записи для блоков, которых больше нет в `childBlocks`. Это важно когда блоки удаляются вне редактора — их позиции освобождаются автоматически.

### LayoutDragManager

Обрабатывает drag-and-drop и resize блоков в превью.

## Интеграция с рендерингом

### GridClassManager (`src/js/painter/gridClassManager.js`)
- Метод `layoutCells()` обрабатывает `layout: 'cells'`
- Добавляет класс `layout-preset-{presetType}` к блоку
- Устанавливает `block.layoutPresetType` для использования в BlockCreator

### BlockCreator (`src/js/painter/blockCreator.js`)
- Метод `_applyLayoutCellsData()` добавляет data-атрибуты
- Применяет inline-стили из `block.data.style`

### CalcColor (`src/js/painter/calcBlockColor.js`)
- При `block.data.isWeekend === true` сдвигает hue в тёплую сторону (к оранжевому/жёлтому)
- Сохраняет наследование цвета от родителя

### LocalStateManager (`src/js/stateLocal/localStateManager.js`)
- При создании блока в layoutCells проверяется свободное место
- Новый блок автоматически получает позицию в первой свободной ячейке
- Если места нет — показывается ошибка

## Data Flow

```
User Action → LayoutEditorPanel
      ↓
LayoutDragManager / LayoutCellManager (validation)
      ↓
applyLayout() → dispatch('UpdateDataBlock', {layoutCells})
      ↓
LocalStateManager → Backend sync
      ↓
GridClassManager.layoutCells() → CSS Grid classes
      ↓
BlockCreator._applyLayoutCellsData() → data-attributes
      ↓
CalcColor.calculateColor() → hsl colors (with weekend shift)
      ↓
DOM render with preset styles
```

## Добавление нового пресета

1. Добавь конфигурацию в `PRESET_CONFIG`:
   ```javascript
   const PRESET_CONFIG = {
       'my-preset': {
           maxBlocks: 6,      // null для расширяемых
           minBlocks: 2,
           description: 'Описание пресета'
       }
   };
   ```

2. Добавь генератор в `LayoutEditorPanel`:
   ```javascript
   generateMyPresetCellsWithPlaceholders(childOrder) {
       const cells = {};
       const placeholders = [];
       // ... логика генерации
       return { cells, placeholders };
   }
   ```

3. Добавь case в `applyPreset()`:
   ```javascript
   case 'my-preset':
       this.gridSize = { rows: 2, cols: 6 };
       result = this.generateMyPresetCellsWithPlaceholders(childOrder);
       break;
   ```

4. Добавь CSS для пресета (если нужны особые стили):
   ```css
   .layout-preset-my-preset [block] {
       /* стили для блоков внутри пресета */
   }
   ```

## Известные ограничения

1. **Один редактор** — нельзя открыть несколько редакторов одновременно (singleton)
2. **Не работает с customGrid** — блоки с `data.customGrid` не поддерживаются
3. **Placeholder блоки** — создаются через bulk import, требуется backend
4. **Calendar preset** — даты вычисляются при применении пресета, не обновляются автоматически

## Обработка удалённых блоков

Когда блоки удаляются вне редактора, их записи в `layoutCells.cells` становятся "сиротами" (orphan cells). Система автоматически их очищает:

1. **При загрузке:** `initFromExistingLayout()` фильтрует cells против текущего `childOrder`
2. **При пересчёте:** `rebuildOccupancyGrid()` удаляет orphan cells из `panel.cells`

Это гарантирует что удалённые блоки не занимают место в сетке и новые блоки могут занять освободившиеся позиции.

## TODO / Roadmap

- [ ] Undo/Redo в редакторе
- [ ] Keyboard shortcuts (стрелки для навигации)
- [ ] Копирование блоков в редакторе
- [ ] Миграция из groupSizes → cells
- [ ] Автообновление дат в календаре

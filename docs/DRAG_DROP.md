# Drag-and-Drop для перемещения блоков

Функционал перетаскивания блоков между родителями в дереве и диаграммах с использованием HTML5 Drag and Drop API.

## Использование

**Hotkey:** `Shift + Drag`

1. Зажмите клавишу **Shift**
2. Курсор изменится на "руку" (grab)
3. Перетащите блок в нужное место
4. Отпустите для завершения перемещения

## Поддерживаемые сценарии

| Откуда | Куда | Поведение |
|--------|------|-----------|
| Дерево | Дерево | Стандартное перемещение с изменением parent_id |
| Дерево | Диаграмма | Перемещение + автоматическое вычисление позиции в customGrid |
| Диаграмма | Дерево | Перемещение + удаление позиции из customGrid |
| Диаграмма | Диаграмма | Перемещение + обновление customGrid обоих родителей |

## Визуальная обратная связь

### Перетаскиваемый блок
- Прозрачность 30%
- Синяя пунктирная рамка

### Индикаторы drop-зоны
- **Вставка ДО блока** (верхние 25%): горизонтальная линия сверху с градиентом и свечением
- **Вставка ПОСЛЕ блока** (нижние 25%): горизонтальная линия снизу
- **Вставка ВНУТРЬ блока** (центральные 50%): подсветка всего блока с пунктирной рамкой

## Ограничения

Drag-and-drop **отключён** для:
- Блоков внутри layoutCells (календарь, kanban и т.д.)
- Перетаскивания блока в самого себя или своих потомков (circular reference)

## Перемещение в диаграмму

При перетаскивании блока в диаграмму:
1. Позиция вычисляется по координатам курсора в момент drop
2. Блок получает размер по умолчанию 2x2 ячейки
3. Если указанная позиция занята, система ищет свободное место автоматически
4. Позиция добавляется в `customGrid.childrenPositions` родительского блока

```javascript
// Пример позиции блока в customGrid
customGrid.childrenPositions['block-uuid'] = [
    'grid-column_2__4',  // колонки 2-4
    'grid-row_3__5'      // строки 3-5
];
```

## Перемещение из диаграммы

При перетаскивании блока из диаграммы:
1. Позиция удаляется из `customGrid.childrenPositions` старого родителя
2. Блок добавляется в `childOrder` нового родителя

## Отмена перетаскивания

- **Escape** - отменить drag
- **Отпустить Shift** - отменить drag
- **Отпустить мышь вне допустимой зоны** - отменить drag

## Синхронизация

Перемещение синхронизируется через batch import с немедленной отправкой (`immediate: true`):
- Отправляются 3 блока: перемещаемый, старый родитель, новый родитель
- Используется offlineQueue для надёжности

## Архитектура

### Ключевые файлы

| Файл | Описание |
|------|----------|
| `src/js/controller/dragDropManager.js` | Основная логика drag-and-drop |
| `src/js/controller/comands/comandManager.js` | Event listeners для drag событий |
| `src/js/painter/blockCreator.js` | Добавление `draggable="true"` атрибута |
| `src/js/stateLocal/localStateManager.js` | `moveBlock()` с batch import и обработкой customGrid |
| `src/style/index.css` | CSS стили для drag-and-drop |

### DragDropManager

```javascript
class DragDropManager {
    // Состояние
    isDragging: boolean
    draggedBlockId: string
    draggedElement: HTMLElement
    dragSourceParentId: string
    dropIndicator: HTMLElement
    lastDropTarget: object
    dragFromDiagram: boolean        // Drag из диаграммы?
    dragSourceCustomGrid: object    // customGrid источника

    // Методы
    canDrag(element)           // Проверка можно ли перетаскивать
    canDropInto(element)       // Проверка можно ли сделать drop
    startDrag(e, element)      // Начало перетаскивания
    handleDragOver(e, element) // Обработка dragover
    handleDrop(e, element)     // Обработка drop
    endDrag()                  // Завершение drag
    cleanup()                  // Очистка состояния

    // Приватные методы для диаграмм
    _isDiagramParent(parentId)            // Проверка является ли родитель диаграммой
    _calculateDiagramPosition(e, el, id)  // Вычисление позиции в grid по координатам мыши
}
```

### События

При успешном drop диспатчится событие `MoveBlock`:
```javascript
dispatch('MoveBlock', {
    block_id: string,
    old_parent_id: string,
    new_parent_id: string,
    before: string | null,      // ID блока перед которым вставить
    fromDiagram: boolean,       // Drag из диаграммы?
    toDiagram: boolean,         // Drop в диаграмму?
    diagramPosition: {          // Позиция в grid (если toDiagram)
        col: number,
        row: number,
        cols: number,
        rows: number
    } | null
});
```

### LocalStateManager.moveBlock

При перемещении с участием диаграмм:

1. **fromDiagram=true**: удаляет позицию из `oldParent.data.customGrid.childrenPositions`
2. **toDiagram=true**: добавляет позицию в `newParent.data.customGrid.childrenPositions`

Вспомогательные методы:
- `_calculateBlockPositionInDiagram(customGrid, blockId, dropPosition)` - вычисляет позицию по координатам или автоматически
- `_findFreePositionInCustomGrid(customGrid, cols, rows, width, height)` - ищет свободную позицию в grid

### CSS классы

| Класс | Описание |
|-------|----------|
| `.block-dragging` | Применяется к перетаскиваемому блоку |
| `[data-shift-drag]` | Атрибут на контейнере при зажатом Shift |

### CSS правила

```css
/* Курсор grab при зажатом Shift */
[data-shift-drag] [block][draggable="true"] {
    cursor: grab;
}

/* Дочерние элементы не мешают drag */
[data-shift-drag] [block][draggable="true"] * {
    pointer-events: none;
}

/* Но вложенные блоки доступны */
[data-shift-drag] [block][draggable="true"] [block] {
    pointer-events: auto;
}

/* Стиль перетаскиваемого блока */
[block].block-dragging {
    opacity: 0.3;
    outline: 2px dashed #3b82f6;
}
```

## Тестирование

```bash
# Unit тесты
npx jest src/js/__tests__/controller/dragDropManager.test.js

# Ручное тестирование
1. Shift + drag блока между обычными родителями
2. Shift + drag для reorder внутри родителя
3. Shift + drag блока из дерева в диаграмму
4. Shift + drag блока из диаграммы в дерево
5. Shift + drag блока между двумя диаграммами
6. Попытка drag блока в layoutCells (должно игнорироваться)
7. Drag на втором клиенте - проверить синхронизацию
```

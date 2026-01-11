# Drag-and-Drop для перемещения блоков

Функционал перетаскивания блоков между родителями в дереве с использованием HTML5 Drag and Drop API.

## Использование

**Hotkey:** `Shift + Drag`

1. Зажмите клавишу **Shift**
2. Курсор изменится на "руку" (grab)
3. Перетащите блок в нужное место
4. Отпустите для завершения перемещения

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
- Блоков внутри диаграмм (`customGrid.grid`)
- Блоков внутри layoutCells (календарь, kanban и т.д.)
- Перетаскивания блока в самого себя или своих потомков (circular reference)

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
| `src/js/stateLocal/localStateManager.js` | `moveBlock()` с batch import |
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

    // Методы
    canDrag(element)           // Проверка можно ли перетаскивать
    canDropInto(element)       // Проверка можно ли сделать drop
    startDrag(e, element)      // Начало перетаскивания
    handleDragOver(e, element) // Обработка dragover
    handleDrop(e, element)     // Обработка drop
    endDrag()                  // Завершение drag
    cleanup()                  // Очистка состояния
}
```

### События

При успешном drop диспатчится событие `MoveBlock`:
```javascript
dispatch('MoveBlock', {
    block_id: string,
    old_parent_id: string,
    new_parent_id: string,
    before: string | null  // ID блока перед которым вставить
});
```

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
1. Shift + drag блока между родителями
2. Shift + drag для reorder внутри родителя
3. Попытка drag блока в диаграмме (должно игнорироваться)
4. Drag на втором клиенте - проверить синхронизацию
```

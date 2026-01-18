# Epic 2: Blocks CRUD (P0)

## Цель

Тестирование создания, чтения, обновления и удаления блоков.

## Тест-кейсы

### Создание (BL-CR)

| ID | Название | Описание | Приоритет |
|----|----------|----------|-----------|
| BL-CR-01 | Создать блок через hotkey `n` | Базовое создание | P0 |
| BL-CR-02 | Создать блок через кнопку UI | Кнопка в control-panel | P1 |
| BL-CR-03 | Создать вложенный блок | Создание внутри открытого блока | P0 |
| BL-CR-04 | Создать блок с длинным названием | Обработка длинных текстов | P2 |
| BL-CR-05 | Отмена создания (Escape) | Закрытие диалога без создания | P1 |

### Редактирование (BL-ED)

| ID | Название | Описание | Приоритет |
|----|----------|----------|-----------|
| BL-ED-01 | Изменить название блока (hotkey `t`) | Базовое редактирование | P0 |
| BL-ED-02 | Изменить текст блока (hotkey `w`) | noteEditor | P0 |
| BL-ED-03 | Markdown в тексте блока | Рендеринг markdown | P1 |
| BL-ED-04 | Inline edit по двойному клику | Редактирование на месте | P1 |

### Удаление (BL-DE)

| ID | Название | Описание | Приоритет |
|----|----------|----------|-----------|
| BL-DE-01 | Удалить блок через hotkey `Shift+D` | Базовое удаление | P0 |
| BL-DE-02 | Удалить блок через контекстное меню | Правый клик | P1 |
| BL-DE-03 | Подтверждение удаления | Диалог подтверждения (если есть) | P2 |
| BL-DE-04 | Каскадное удаление дочерних | Удаление родителя удаляет детей | P0 |

### Копирование (BL-CP)

| ID | Название | Описание | Приоритет |
|----|----------|----------|-----------|
| BL-CP-01 | Копировать блок `Shift+C` + `Shift+V` | Базовое копирование | P0 |
| BL-CP-02 | Вставить блок как ссылку `Shift+L` | Ссылка на блок | P1 |
| BL-CP-03 | Копировать несколько блоков | Множественное выделение | P2 |

### Перемещение (BL-MV)

| ID | Название | Описание | Приоритет |
|----|----------|----------|-----------|
| BL-MV-01 | Вырезать и вставить `Shift+X` + `Shift+V` | Cut & Paste | P0 |
| BL-MV-02 | Drag-and-drop (Shift+drag) | Перетаскивание | P1 |
| BL-MV-03 | Вставить перед блоком `Shift+Ctrl+V` | Позиционирование | P2 |

### Множественное выделение (BL-MS)

| ID | Название | Описание | Приоритет |
|----|----------|----------|-----------|
| BL-MS-01 | Выделить несколько блоков (Shift+click) | Multi-select | P1 |
| BL-MS-02 | Операции с выделенными блоками | Групповое удаление/перемещение | P1 |

### Undo/Redo (BL-UR)

| ID | Название | Описание | Приоритет |
|----|----------|----------|-----------|
| BL-UR-01 | Undo создания `Shift+Z` | Отмена создания | P0 |
| BL-UR-02 | Undo удаления | Восстановление блока | P0 |
| BL-UR-03 | Redo `Shift+Ctrl+Z` | Повтор отменённого | P1 |
| BL-UR-04 | Цепочка undo/redo | Несколько отмен подряд | P2 |

## Реализация

### BL-CR-01: Создать блок через hotkey

```typescript
test('BL-CR-01: Создать блок через hotkey n', async ({ authenticatedPage, apiHelper }) => {
  const blockTitle = uniqueBlockTitle('Create');

  // Создаём блок и ждём API ответ
  const { status, blockId } = await apiHelper.waitForBlockCreate(async () => {
    await authenticatedPage.createBlock(blockTitle);
  });

  expect(status).toBe(200);
  expect(blockId).toBeTruthy();

  // Проверяем что блок появился в UI
  await authenticatedPage.assertBlockWithTitleExists(blockTitle);
});
```

### BL-ED-01: Изменить название блока

```typescript
test('BL-ED-01: Изменить название блока', async ({ authenticatedPage }) => {
  const originalTitle = uniqueBlockTitle('Original');
  const newTitle = uniqueBlockTitle('Updated');

  // Создаём блок
  await authenticatedPage.createBlock(originalTitle);

  // Выбираем первый блок
  const block = authenticatedPage.getFirstBlock();
  await authenticatedPage.clickBlock(block);

  // Редактируем название
  await authenticatedPage.editBlockTitle(newTitle);

  // Проверяем
  await authenticatedPage.assertBlockWithTitleExists(newTitle);
});
```

### BL-DE-01: Удалить блок

```typescript
test('BL-DE-01: Удалить блок через Shift+D', async ({ authenticatedPage }) => {
  const blockTitle = uniqueBlockTitle('Delete');

  // Создаём блок
  await authenticatedPage.createBlock(blockTitle);
  await authenticatedPage.assertBlockWithTitleExists(blockTitle);

  // Выбираем блок
  const block = authenticatedPage.rootContainer.locator(
    `[block] titleBlock:has-text("${blockTitle}")`
  ).first();
  await authenticatedPage.clickBlock(block);

  // Удаляем
  await authenticatedPage.deleteSelectedBlock();

  // Проверяем что блок исчез
  await expect(block).not.toBeVisible({ timeout: 5000 });
});
```

### BL-UR-01: Undo создания

```typescript
test('BL-UR-01: Undo создания', async ({ authenticatedPage }) => {
  const blockTitle = uniqueBlockTitle('Undo');

  // Создаём блок
  await authenticatedPage.createBlock(blockTitle);
  await authenticatedPage.assertBlockWithTitleExists(blockTitle);

  // Undo
  await authenticatedPage.undo();
  await page.waitForTimeout(500);

  // Блок должен исчезнуть
  const block = authenticatedPage.rootContainer.locator(
    `[block] titleBlock:has-text("${blockTitle}")`
  );
  await expect(block).not.toBeVisible({ timeout: 5000 });
});
```

## Файлы

- `e2e/tests/blocks/blocks.spec.ts` — Основные тесты блоков
- Старые файлы (будут заменены):
  - `blocks-create.spec.ts`
  - `blocks-edit.spec.ts`
  - `blocks-delete.spec.ts`
  - `blocks-copy-paste.spec.ts`
  - `blocks-undo-redo.spec.ts`
  - `blocks-multiselect.spec.ts`
  - `blocks-nested.spec.ts`
  - `blocks-ui-buttons.spec.ts`

## Hotkeys

| Hotkey | Действие |
|--------|----------|
| `n` | Создать новый блок |
| `t` | Редактировать название |
| `w` | Редактировать текст (noteEditor) |
| `Shift+D` | Удалить блок |
| `Shift+C` | Копировать ID блока |
| `Shift+X` | Вырезать блок |
| `Shift+V` | Вставить блок |
| `Shift+L` | Вставить как ссылку |
| `Shift+Z` | Undo |
| `Shift+Ctrl+Z` | Redo |
| `Enter` | Открыть блок |
| `Backspace` | Назад |

## Селекторы

- Блоки: `[block]`
- Заголовок блока: `titleBlock`
- Содержимое: `contentBlock`
- Выделенный блок: `.block-selected`
- Диалог: `[data-testid="custom-dialog-input"]`

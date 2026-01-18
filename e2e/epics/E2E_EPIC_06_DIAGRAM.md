# Epic 6: Diagram Mode

## Описание

Режим диаграммы позволяет визуализировать связи между блоками, настраивать их визуальное представление и создавать flowchart-подобные диаграммы.

## Приоритет

**P0** — критический функционал

## Тест-кейсы

### Grid операции (DG-GR-*)

| ID | Название | Описание |
|----|----------|----------|
| DG-GR-01 | Добавить колонку | Добавить колонку в grid через меню |
| DG-GR-02 | Удалить колонку | Удалить колонку из grid |
| DG-GR-03 | Добавить строку | Добавить строку в grid |
| DG-GR-04 | Удалить строку | Удалить строку из grid |
| DG-GR-05 | Изменить ширину колонки | Через = + Arrow |
| DG-GR-06 | Изменить высоту строки | Через = + Arrow |

### Соединения (DG-CN-*)

| ID | Название | Описание |
|----|----------|----------|
| DG-CN-01 | Создать соединение | Через hotkey `a` |
| DG-CN-02 | Dashed соединение | Пунктирная линия |
| DG-CN-03 | Double соединение | Двусторонняя стрелка |
| DG-CN-04 | Curved соединение | Bezier кривая |
| DG-CN-05 | Straight соединение | Прямая линия |
| DG-CN-06 | Orthogonal соединение | Ортогональные линии |
| DG-CN-07 | Self-loop | Соединение блока с самим собой |
| DG-CN-08 | Удалить соединение | Через `Shift+A` |
| DG-CN-09 | Anchor selection | Выбор точки привязки |
| DG-CN-10 | Connection labels | Метки на соединениях |

### Стили блоков (DG-ST-*)

| ID | Название | Описание |
|----|----------|----------|
| DG-ST-01 | Shape: process | Прямоугольник |
| DG-ST-02 | Shape: decision | Ромб |
| DG-ST-03 | Shape: data | Параллелограмм |
| DG-ST-04 | Shape: database | Цилиндр |
| DG-ST-05 | Shape: document | Документ |
| DG-ST-06 | Shape: terminal | Эллипс |
| DG-ST-07 | Shape: manual | Трапеция |
| DG-ST-08 | Shape: subprocess | Rounded |
| DG-ST-09 | Background color | Цвет фона блока |
| DG-ST-10 | Border style | Стиль границы |
| DG-ST-11 | Shadow | Тень блока |
| DG-ST-12 | Font size | Размер шрифта |
| DG-ST-13 | Text align | Выравнивание текста |
| DG-ST-14 | Reset styles | Сброс стилей |

### Операции с блоками (DG-OP-*)

| ID | Название | Описание |
|----|----------|----------|
| DG-OP-01 | Добавить блок в диаграмму | Создание блока внутри диаграммы |
| DG-OP-02 | Удалить блок из диаграммы | Удаление блока |
| DG-OP-03 | Переместить блок | Через Shift+Arrow |
| DG-OP-04 | Drag-and-drop блока | Перетаскивание мышью |
| DG-OP-05 | Изменить размер блока | Через = + Arrow |

## Ключевые файлы

- `src/js/controller/blockStyleManager.js` — BlockStyleManager, ConnectionStyleManager
- `src/js/controller/connectionTypes.js` — CONNECTION_TYPES, CONNECTION_CONFIGS
- `src/js/controller/comands/commands.js` — команды соединений
- `src/style/diagram-editor.css` — стили диаграмм

## Hotkeys

| Hotkey | Действие |
|--------|----------|
| `a` | Создать соединение (default) |
| `Shift+A` | Удалить соединение |
| `d` | Включить режим диаграммы |
| `Shift+Arrow` | Переместить блок в grid |
| `=+Arrow` | Увеличить размер блока |
| `Shift+=+Arrow` | Уменьшить размер блока |

## Примечания

1. Соединения используют jsPlumb библиотеку
2. Типы соединений в нижнем регистре: `'dashed'`, не `'DASHED'`
3. Формы блоков применяются через data-атрибуты: `data-block-shape="diamond"`
4. Для форм с `clip-path` тени используют `filter: drop-shadow`

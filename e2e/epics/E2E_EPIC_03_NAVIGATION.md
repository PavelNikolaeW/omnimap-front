# Epic 3: Navigation (P0)

## Цель

Тестирование навигации: открытие блоков, возврат назад, breadcrumbs, переключение деревьев, URL routing.

## Тест-кейсы

| ID | Название | Описание | Приоритет |
|----|----------|----------|-----------|
| NAV-01 | Открыть блок через Enter | Выделить блок → Enter | P0 |
| NAV-02 | Открыть блок через double-click | Двойной клик на блок | P0 |
| NAV-03 | Вернуться назад через Backspace | Возврат на родительский уровень | P0 |
| NAV-04 | Breadcrumb навигация | Клик по breadcrumb элементам | P0 |
| NAV-05 | Стрелочная навигация | Up/Down/Left между блоками | P1 |
| NAV-06 | Создать новое дерево | Кнопка "+" в tree navigation | P0 |
| NAV-07 | Переключение между деревьями | Hotkey Space+1..9 | P0 |
| NAV-08 | URL deep linking | Прямой переход по URL с block ID | P1 |
| NAV-09 | Browser back/forward | Кнопки браузера | P1 |
| NAV-10 | Scroll to block | Прокрутка при большом количестве блоков | P2 |

## Hotkeys

| Hotkey | Действие |
|--------|----------|
| `Enter` | Открыть выделенный блок |
| `Backspace` | Вернуться назад |
| `Space+1..9` | Переключиться на дерево по индексу |
| `↑` / `↓` | Навигация между блоками |
| `←` / `→` | Навигация между колонками |

## Файлы

- `e2e/tests/navigation/navigation.spec.ts`
- Старые файлы (заменены): `navigation.spec.ts`, `hotkeys.spec.ts`

## Селекторы

- Breadcrumb: `#breadcrumb`
- Tree navigation: `#tree-navigation`
- Tree button: `[data-testid="tree-button-{id}"]`
- Add tree button: `[data-testid="tree-add-button"]`
- Breadcrumb item: `[data-testid="breadcrumb-item-{id}"]`

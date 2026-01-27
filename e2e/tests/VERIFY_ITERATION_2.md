# Verify Iteration 2 — Diagram Mode (continued)

## Status from Iteration 1

### Fixed
- Bug #1: `generateGrid()` / `setGridSize()` NaN при пустом childOrder
- Infra: DNS proxy для headless Chromium

### Open bugs to fix FIRST
- **Bug #2**: `diagramReset` не сбрасывает визуальную сетку (`customGrid = {}` is truthy)
  - File: `src/js/controller/diagramEditor.js:306` — `if (block?.data?.customGrid)` должно проверять `Object.keys().length`
  - File: `src/js/controller/diagramUtils.js` — `resetHandler()` should set `customGrid = null` or delete the key
- **Bug #3**: `-C` удаляет >1 колонки. `diagramUtils.js` — логика декремента пересчитывает сетку вместо простого `-1`

### Tested (PASS)
- [x] diagramAddBlock — создаёт ровно 1 блок
- [x] +C — первый клик инициализирует grid, второй +1 колонка
- [x] Size S preset — генерирует сетку
- [x] diagramBlockStyle — pending selection mode + панель открывается
- [x] diagramReset — dispatch работает (но визуально не сбрасывает — bug #2)

### NOT YET TESTED

#### Grid buttons
- [ ] +R / -R (строки) — добавление/удаление строк
- [ ] -C при минимальном количестве колонок (edge case: 1 колонка → -C)
- [ ] -R при минимальном количестве строк
- [ ] Size XS preset (3x3)
- [ ] Size M preset (5x5)
- [ ] Size L preset (6x6)
- [ ] Size preset с existing children (пересчёт сетки)

#### Style panels
- [ ] diagramConnectionSettings — toggle панели соединений (#connectionPanel.visible)
- [ ] diagramResetBlockStyle — сброс стилей выбранного блока
- [ ] Block style panel — применение стилей (shape, shadow, color)
- [ ] Block style panel — preset shapes (process, decision, data, database, etc.)
- [ ] Connection style panel — создание соединения с кастомными стилями

#### Diagram mode workflow
- [ ] Вход в diagram mode: sidebar submenu-diagram → подсказка → клик блок
- [ ] Выход из diagram mode: Escape → возврат в main submenu
- [ ] Навигация: submenu-back кнопка
- [ ] Diagram mode persistence: выход и повторный вход сохраняет grid
- [ ] Grid overlay: отображается поверх блока, обновляется при +C/+R

#### Connections (arrows)
- [ ] Создание соединения между двумя child-блоками
- [ ] Типы соединений: Flowchart, Bezier, Straight, StateMachine
- [ ] Пресеты: default, dashed, curved, double, inheritance, composition
- [ ] Удаление соединения
- [ ] Редактирование стиля существующего соединения (connectionEditPanel)
- [ ] Self-loop соединение

#### Edge cases
- [ ] Diagram mode с пустым блоком (0 children)
- [ ] Diagram mode с 1 child
- [ ] Diagram mode с 20+ children
- [ ] +C после Size preset (custom поверх preset)
- [ ] Два последовательных Size preset (второй перезаписывает первый)
- [ ] Reset после custom grid + connections (соединения должны пересчитать anchors)

## Test file
```
e2e/tests/verify-TIMESTAMP.spec.ts
```

## Environment
```bash
# Start dev server
npx webpack serve --config webpack.verify.js --no-open

# Run tests
E2E_TEST_USERNAME=e2e_verify_test \
E2E_TEST_PASSWORD=e2e_verify_pass_2026 \
npx playwright test e2e/tests/verify-TIMESTAMP.spec.ts --project=chromium
```

## Pre-conditions
1. Fix bugs #2 and #3 before running iteration 2
2. Cleanup leftover test blocks (DiagramVerify_*, DiagramTest_*)
3. Dev server running with `webpack.verify.js` (proxy enabled)

# План доработки E2E тестовой инфраструктуры

## Текущее состояние

### Существующие fixtures
| Файл | Назначение |
|------|------------|
| `base.fixture.ts` | Базовые fixtures: `authenticatedPage`, `apiHelper`, `indexedDB`, `offlineHelper` |
| `verify-helpers.fixture.ts` | Хелперы: `createTestBlock`, `apiCleanupByPrefix`, `cleanupTestBlocks` |
| `test-data.fixture.ts` | Генераторы данных: `uniqueBlockTitle`, `uniqueTreeName` |
| `offline.fixture.ts` | Offline testing: `goOffline`, `goOnline` |
| `websocket.fixture.ts` | WebSocket testing |
| `multiuser.fixture.ts` | Multi-user scenarios |

### Проблемы (из анализа skipped тестов)

1. **Multi-selection** — нет надёжного хелпера для выделения нескольких блоков
2. **App Mode State** — нет способа проверить/сбросить текущий mode приложения
3. **Link Blocks** — нет специализированных хелперов для работы с ссылками
4. **Clipboard** — нет абстракции над clipboard API
5. **Block State Verification** — сложно проверить состояние блока (selected, active, modified)

---

## План улучшений

### Фаза 1: Selection Helpers (Приоритет: HIGH)

**Файл:** `e2e/fixtures/selection.fixture.ts`

```typescript
/**
 * SelectionHelper - управление выделением блоков
 */
export class SelectionHelper {
  constructor(private page: Page) {}

  /**
   * Выделить один блок (установить active)
   */
  async selectBlock(block: Locator): Promise<void>

  /**
   * Добавить блок к multi-selection (Shift+Click)
   */
  async addToSelection(block: Locator): Promise<void>

  /**
   * Выделить несколько блоков по порядку
   * Возвращает массив ID выделенных блоков
   */
  async multiSelect(blocks: Locator[]): Promise<string[]>

  /**
   * Выделить блоки по titles
   */
  async multiSelectByTitles(titles: string[]): Promise<string[]>

  /**
   * Получить все выделенные блоки
   */
  async getSelectedBlocks(): Promise<string[]>

  /**
   * Проверить что блок в multi-selection
   */
  async isMultiSelected(block: Locator): Promise<boolean>

  /**
   * Проверить что блок active (single selection)
   */
  async isActive(block: Locator): Promise<boolean>

  /**
   * Сбросить выделение (Escape)
   */
  async clearSelection(): Promise<void>

  /**
   * Дождаться стабильного состояния selection
   * (все классы применены, анимации завершены)
   */
  async waitForSelectionStable(): Promise<void>
}
```

**Реализация ключевых методов:**

```typescript
async multiSelect(blocks: Locator[]): Promise<string[]> {
  const ids: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const title = block.locator('titleBlock').first();

    // Первый блок — просто Shift+Click
    // Последующие — тоже Shift+Click (добавление к selection)
    await title.click({ force: true, modifiers: ['Shift'] });

    // Ждём появления класса multi-selected
    await expect(block).toHaveClass(/block-multi-selected/, { timeout: 2000 });

    // Сохраняем ID
    const id = await block.getAttribute('id');
    if (id) ids.push(id.split('*').at(-1)!);
  }

  // Финальная проверка — все блоки выделены
  await this.waitForSelectionStable();

  return ids;
}

async waitForSelectionStable(): Promise<void> {
  // Проверяем через JS что contextManager.multiSelected стабилен
  await this.page.waitForFunction(() => {
    const ctx = (window as any).contextManager;
    if (!ctx) return true;
    return ctx.multiSelected && ctx.multiSelected.length > 0;
  }, { timeout: 3000 });

  // Небольшая пауза для завершения CSS transitions
  await this.page.waitForTimeout(100);
}
```

---

### Фаза 2: App Mode Helper (Приоритет: HIGH)

**Файл:** `e2e/fixtures/app-mode.fixture.ts`

```typescript
/**
 * AppModeHelper - управление режимами приложения
 *
 * Режимы: NORMAL, TEXT_EDIT, CONNECT_TO_BLOCK, CUT_BLOCK, DIAGRAM, CHAT
 */
export class AppModeHelper {
  constructor(private page: Page) {}

  /**
   * Получить текущий режим приложения
   */
  async getCurrentMode(): Promise<string>

  /**
   * Проверить что приложение в NORMAL режиме
   */
  async isNormalMode(): Promise<boolean>

  /**
   * Сбросить режим в NORMAL (серия Escape)
   */
  async resetToNormalMode(): Promise<void>

  /**
   * Дождаться конкретного режима
   */
  async waitForMode(mode: string, timeout?: number): Promise<void>

  /**
   * Выполнить действие и вернуться в NORMAL
   */
  async executeAndReset(action: () => Promise<void>): Promise<void>
}
```

**Реализация:**

```typescript
async getCurrentMode(): Promise<string> {
  return await this.page.evaluate(() => {
    const ctx = (window as any).contextManager;
    return ctx?.mode || 'unknown';
  });
}

async resetToNormalMode(): Promise<void> {
  // До 5 попыток Escape для выхода из любого режима
  for (let i = 0; i < 5; i++) {
    const mode = await this.getCurrentMode();
    if (mode === 'normal') break;

    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(200);
  }

  // Финальная проверка
  await this.waitForMode('normal', 2000);
}

async executeAndReset(action: () => Promise<void>): Promise<void> {
  await action();
  await this.resetToNormalMode();
}
```

---

### Фаза 3: Link Block Helper (Приоритет: MEDIUM)

**Файл:** `e2e/fixtures/link-block.fixture.ts`

```typescript
/**
 * LinkBlockHelper - работа с блоками-ссылками
 */
export class LinkBlockHelper {
  constructor(private page: Page) {}

  /**
   * Создать ссылку на блок
   * @param sourceBlockId - ID блока-источника
   * @param destBlock - блок-назначение (куда вставляем ссылку)
   */
  async createLink(sourceBlockId: string, destBlock: Locator): Promise<string | null>

  /**
   * Создать ссылку через clipboard workflow
   * 1. Copy source ID
   * 2. Select dest
   * 3. Shift+G
   */
  async createLinkViaClipboard(
    sourceBlock: Locator,
    destBlock: Locator
  ): Promise<string | null>

  /**
   * Найти link block по source ID
   */
  async findLinkBySourceId(sourceId: string): Promise<Locator | null>

  /**
   * Получить source ID из link block
   */
  async getSourceId(linkBlock: Locator): Promise<string | null>

  /**
   * Проверить что блок является ссылкой
   */
  async isLinkBlock(block: Locator): Promise<boolean>

  /**
   * Проверить что link block в pending состоянии
   */
  async isPendingLink(block: Locator): Promise<boolean>

  /**
   * Навигация к оригиналу через double-click
   */
  async navigateToOriginal(linkBlock: Locator): Promise<void>

  /**
   * Дождаться создания link block
   */
  async waitForLinkCreated(sourceId: string, timeout?: number): Promise<Locator>
}
```

**Реализация:**

```typescript
async createLinkViaClipboard(
  sourceBlock: Locator,
  destBlock: Locator
): Promise<string | null> {
  // 1. Копируем ID source блока
  const sourceTitle = sourceBlock.locator('titleBlock').first();
  await sourceTitle.click({ force: true, modifiers: ['Shift'] });
  await this.page.waitForTimeout(300);

  await this.page.keyboard.down('Shift');
  await this.page.keyboard.press('c');
  await this.page.keyboard.up('Shift');
  await this.page.waitForTimeout(300);

  // 2. Сбрасываем mode
  await this.page.keyboard.press('Escape');
  await this.page.waitForTimeout(200);

  // 3. Выделяем dest блок
  const destTitle = destBlock.locator('titleBlock').first();
  await destTitle.click({ force: true, modifiers: ['Shift'] });
  await this.page.waitForTimeout(300);

  // 4. Shift+G для создания ссылки
  await this.page.keyboard.down('Shift');
  await this.page.keyboard.press('g');
  await this.page.keyboard.up('Shift');

  // 5. Ждём появления link block
  const sourceId = await sourceBlock.getAttribute('id');
  const cleanSourceId = sourceId?.split('*').at(-1);

  if (!cleanSourceId) return null;

  try {
    const linkBlock = await this.waitForLinkCreated(cleanSourceId, 10000);
    return await linkBlock.getAttribute('id');
  } catch {
    return null;
  }
}

async waitForLinkCreated(sourceId: string, timeout = 10000): Promise<Locator> {
  const linkBlock = this.page.locator(`[blockLink="${sourceId}"]`);
  await linkBlock.waitFor({ state: 'visible', timeout });
  return linkBlock;
}
```

---

### Фаза 4: Clipboard Helper (Приоритет: MEDIUM)

**Файл:** `e2e/fixtures/clipboard.fixture.ts`

```typescript
/**
 * ClipboardHelper - работа с буфером обмена
 */
export class ClipboardHelper {
  constructor(private page: Page) {}

  /**
   * Записать текст в clipboard
   */
  async write(text: string): Promise<void>

  /**
   * Прочитать текст из clipboard
   */
  async read(): Promise<string | null>

  /**
   * Записать JSON в clipboard
   */
  async writeJson(data: any): Promise<void>

  /**
   * Прочитать JSON из clipboard
   */
  async readJson<T>(): Promise<T | null>

  /**
   * Очистить clipboard
   */
  async clear(): Promise<void>

  /**
   * Проверить что clipboard содержит валидный UUID
   */
  async containsValidUuid(): Promise<boolean>

  /**
   * Проверить что clipboard содержит массив UUID
   */
  async containsUuidArray(): Promise<boolean>

  /**
   * Скопировать ID блока через Shift+C
   */
  async copyBlockId(block: Locator): Promise<string | null>

  /**
   * Скопировать IDs нескольких блоков
   */
  async copyMultipleBlockIds(blocks: Locator[]): Promise<string[]>
}
```

---

### Фаза 5: Block State Helper (Приоритет: LOW)

**Файл:** `e2e/fixtures/block-state.fixture.ts`

```typescript
/**
 * BlockStateHelper - проверка состояния блоков
 */
export class BlockStateHelper {
  constructor(private page: Page) {}

  /**
   * Получить полное состояние блока из DOM + IndexedDB
   */
  async getBlockState(blockId: string): Promise<BlockState>

  /**
   * Сравнить состояние блока до и после операции
   */
  async compareStates(before: BlockState, after: BlockState): Promise<StateDiff>

  /**
   * Проверить что блок был изменён
   */
  async wasModified(blockId: string, since: number): Promise<boolean>

  /**
   * Дождаться синхронизации блока с сервером
   */
  async waitForSync(blockId: string): Promise<void>
}

interface BlockState {
  id: string;
  title: string;
  text: string;
  parentId: string | null;
  childrenCount: number;
  isLink: boolean;
  linkSourceId?: string;
  updatedAt: number;
  classes: string[];
}

interface StateDiff {
  changed: boolean;
  fields: {
    field: string;
    before: any;
    after: any;
  }[];
}
```

---

## Интеграция в base.fixture.ts

```typescript
import { SelectionHelper } from './selection.fixture';
import { AppModeHelper } from './app-mode.fixture';
import { LinkBlockHelper } from './link-block.fixture';
import { ClipboardHelper } from './clipboard.fixture';

type ExtendedFixtures = BaseFixtures & {
  selectionHelper: SelectionHelper;
  appModeHelper: AppModeHelper;
  linkBlockHelper: LinkBlockHelper;
  clipboardHelper: ClipboardHelper;
};

export const test = base.extend<ExtendedFixtures>({
  selectionHelper: async ({ page }, use) => {
    await use(new SelectionHelper(page));
  },
  appModeHelper: async ({ page }, use) => {
    await use(new AppModeHelper(page));
  },
  linkBlockHelper: async ({ page }, use) => {
    await use(new LinkBlockHelper(page));
  },
  clipboardHelper: async ({ page }, use) => {
    await use(new ClipboardHelper(page));
  },
});
```

---

## Рефакторинг skipped тестов

### s2: Multi-select copy (после Фазы 1 + 4)

```typescript
test('s2: shift+c on multi-select copies array of IDs', async ({
  authenticatedPage,
  page,
  selectionHelper,
  clipboardHelper,
}) => {
  // Создаём тестовые блоки
  const title1 = await createTestBlock(page, 'Verify_s2_A');
  const title2 = await createTestBlock(page, 'Verify_s2_B');

  // Находим блоки
  const block1 = page.locator(`[block] titleBlock:has-text("${title1}")`).first().locator('..');
  const block2 = page.locator(`[block] titleBlock:has-text("${title2}")`).first().locator('..');

  // Multi-select через хелпер
  const selectedIds = await selectionHelper.multiSelect([block1, block2]);
  expect(selectedIds).toHaveLength(2);

  // Copy через хелпер
  const copiedIds = await clipboardHelper.copyMultipleBlockIds([block1, block2]);

  // Проверка
  expect(copiedIds).toEqual(selectedIds);
});
```

### s6: Create link block (после Фазы 2 + 3)

```typescript
test('s6: shift+g creates link block', async ({
  authenticatedPage,
  page,
  appModeHelper,
  linkBlockHelper,
}) => {
  // Создаём source блок
  const sourceTitle = await createTestBlock(page, 'Verify_s6_Source');
  const sourceBlock = page.locator(`[block] titleBlock:has-text("${sourceTitle}")`).first().locator('..');
  const sourceId = await sourceBlock.getAttribute('id');

  // Создаём dest блок
  const destTitle = await createTestBlock(page, 'Verify_s6_Dest');
  const destBlock = page.locator(`[block] titleBlock:has-text("${destTitle}")`).first().locator('..');

  // Создаём ссылку через хелпер (с автосбросом mode)
  await appModeHelper.executeAndReset(async () => {
    const linkId = await linkBlockHelper.createLinkViaClipboard(sourceBlock, destBlock);
    expect(linkId).toBeTruthy();
  });

  // Проверяем что link создан
  const linkBlock = await linkBlockHelper.findLinkBySourceId(sourceId!.split('*').at(-1)!);
  expect(linkBlock).not.toBeNull();
  await expect(linkBlock!).toHaveAttribute('blockLink', sourceId!.split('*').at(-1)!);
});
```

### s8: Operations on link block (после Фазы 3 + 5)

```typescript
test('s8: operations on link block work as on regular block', async ({
  authenticatedPage,
  page,
  linkBlockHelper,
  blockStateHelper,
}) => {
  // Setup: создаём source и link
  const sourceTitle = await createTestBlock(page, 'Verify_s8_Source');
  const sourceBlock = page.locator(`[block] titleBlock:has-text("${sourceTitle}")`).first().locator('..');
  const sourceId = (await sourceBlock.getAttribute('id'))!.split('*').at(-1)!;

  const destTitle = await createTestBlock(page, 'Verify_s8_Dest');
  const destBlock = page.locator(`[block] titleBlock:has-text("${destTitle}")`).first().locator('..');

  await linkBlockHelper.createLinkViaClipboard(sourceBlock, destBlock);
  const linkBlock = await linkBlockHelper.findLinkBySourceId(sourceId);

  // Test 1: Edit title изменяет оригинал
  const beforeState = await blockStateHelper.getBlockState(sourceId);

  // ... edit title on link block ...

  const afterState = await blockStateHelper.getBlockState(sourceId);
  const diff = await blockStateHelper.compareStates(beforeState, afterState);

  expect(diff.changed).toBe(true);
  expect(diff.fields.find(f => f.field === 'title')).toBeTruthy();
});
```

---

## Roadmap

| Фаза | Приоритет | Оценка | Блокирует |
|------|-----------|--------|-----------|
| 1. Selection Helpers | HIGH | 2-3 часа | s2 |
| 2. App Mode Helper | HIGH | 1-2 часа | s6, s8 |
| 3. Link Block Helper | MEDIUM | 2-3 часа | s6, s8 |
| 4. Clipboard Helper | MEDIUM | 1-2 часа | s2 |
| 5. Block State Helper | LOW | 2-3 часа | s8 |

**Итого:** ~10-13 часов работы для полного покрытия всех skipped тестов.

---

## Quick Wins (можно сделать сразу)

1. **AppModeHelper.resetToNormalMode()** — добавить в существующий `verify-helpers.fixture.ts`
2. **Улучшить createTestBlock()** — добавить Escape после создания
3. **Добавить clipboard permissions** — в `playwright.config.ts` глобально

```typescript
// playwright.config.ts
use: {
  permissions: ['clipboard-read', 'clipboard-write'],
}
```

---

## Метрики успеха

После реализации плана:
- [ ] Все 12 тестов Copy/Paste/Link проходят стабильно
- [ ] Flakiness rate < 5%
- [ ] Время выполнения тестов < 60 секунд
- [ ] Новые тесты используют хелперы вместо raw Playwright API

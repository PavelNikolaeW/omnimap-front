import { Page } from '@playwright/test';
import { test as base, expect } from './base.fixture';
import { MainPage } from '../pages/main.page';

/**
 * Тестовые данные и фабрики для E2E тестов
 *
 * ВАЖНО: Все тесты работают с реальным бэкендом.
 * Тестовые данные создаются динамически через UI или API.
 */

// ==================== Константы ====================

/**
 * Стандартные тестовые блоки
 */
export const TEST_BLOCKS = {
  simple: {
    title: 'Test Block',
    content: 'This is test content',
  },
  withMarkdown: {
    title: 'Markdown Block',
    content: '# Header\n\n**Bold text** and *italic*\n\n- List item 1\n- List item 2',
  },
  withUrl: {
    title: 'https://example.com',
    content: 'Block with URL title',
  },
  withLongTitle: {
    title: 'This is a very long title that should test how the application handles long text in block titles and whether it truncates or wraps properly',
    content: 'Long title block',
  },
  withSpecialChars: {
    title: 'Block <with> "special" & \'chars\'',
    content: 'Testing XSS prevention',
  },
  withEmoji: {
    title: '🎉 Emoji Block 🚀',
    content: 'Block with emoji 😀',
  },
  nested: {
    parent: {
      title: 'Parent Block',
      content: 'This is parent',
    },
    child: {
      title: 'Child Block',
      content: 'This is child',
    },
    grandchild: {
      title: 'Grandchild Block',
      content: 'This is grandchild',
    },
  },
};

/**
 * Тестовые пользователи (создаются на бэкенде)
 */
export const TEST_USERS = {
  admin: {
    username: process.env.E2E_TEST_USERNAME || 'e2e_admin',
    password: process.env.E2E_TEST_PASSWORD || 'e2e_admin_password',
  },
  editor: {
    username: process.env.E2E_EDITOR_USERNAME || 'e2e_editor',
    password: process.env.E2E_EDITOR_PASSWORD || 'e2e_editor_password',
  },
  viewer: {
    username: process.env.E2E_VIEWER_USERNAME || 'e2e_viewer',
    password: process.env.E2E_VIEWER_PASSWORD || 'e2e_viewer_password',
  },
};

/**
 * Тестовые цвета (градиент + рамка)
 */
export const TEST_COLORS = {
  redPurple: { gradient: '1+4', description: 'Red-Purple' },
  blueGreen: { gradient: '2+3', description: 'Blue-Green' },
  yellowOrange: { gradient: '1+2', description: 'Yellow-Orange' },
  greenBlue: { gradient: '3+4', description: 'Green-Blue' },
  white: { hotkey: 'c+w', description: 'White' },
  dark: { hotkey: 'c+d', description: 'Dark' },
  reset: { hotkey: '0', description: 'Reset' },
};

/**
 * Типы соединений для диаграмм
 */
export const CONNECTION_TYPES = {
  default: 'default',
  dashed: 'dashed',
  dotted: 'dotted',
  double: 'double',
  curved: 'curved',
  straight: 'straight',
} as const;

/**
 * Пресеты форм блоков для диаграмм
 */
export const SHAPE_PRESETS = {
  process: 'process',       // Rectangle
  decision: 'decision',     // Diamond
  data: 'data',             // Parallelogram
  database: 'database',     // Cylinder
  document: 'document',     // Document shape
  terminal: 'terminal',     // Ellipse
  manual: 'manual',         // Trapezoid
  subprocess: 'subprocess', // Rounded
} as const;

/**
 * Пресеты раскладки для Layout Editor
 */
export const LAYOUT_PRESETS = {
  grid2x2: '2x2',
  grid3x3: '3x3',
  grid4x4: '4x4',
  sidebar: 'sidebar',
  dashboard: 'dashboard',
  kanban: 'kanban',
  holyGrail: 'holy-grail',
  gallery: 'gallery',
  calendar: 'calendar',
} as const;

// ==================== Генераторы ====================

/**
 * Генератор уникальных названий для тестов
 */
export function uniqueBlockTitle(prefix: string = 'Test'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Генератор уникальных названий деревьев
 */
export function uniqueTreeName(prefix: string = 'TestTree'): string {
  return `${prefix}_${Date.now().toString(36)}`;
}

/**
 * Генератор уникального ID
 */
export function uniqueId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Генератор случайного текста
 */
export function randomText(length: number = 100): string {
  const words = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit'];
  let result = '';
  while (result.length < length) {
    result += words[Math.floor(Math.random() * words.length)] + ' ';
  }
  return result.trim().substring(0, length);
}

/**
 * Генератор markdown контента
 */
export function generateMarkdown(): string {
  return `# Heading 1

## Heading 2

This is **bold** and *italic* text.

### List
- Item 1
- Item 2
- Item 3

### Code
\`\`\`javascript
const x = 42;
console.log(x);
\`\`\`

### Link
[Example](https://example.com)
`;
}

// ==================== Фабрики ====================

/**
 * Интерфейс для создания блока
 */
export interface BlockCreateOptions {
  title: string;
  content?: string;
  color?: string;
  parentId?: string;
}

/**
 * Интерфейс для созданного блока
 */
export interface CreatedBlock {
  id: string;
  title: string;
  content?: string;
}

/**
 * Фабрика для создания блоков через UI
 */
export class BlockFactory {
  constructor(private page: Page, private mainPage: MainPage) {}

  /**
   * Создать один блок
   */
  async createBlock(options: BlockCreateOptions): Promise<CreatedBlock> {
    const title = options.title || uniqueBlockTitle();

    // Нажимаем 'n' для создания нового блока
    await this.page.keyboard.press('n');

    // Ждём появления диалога
    const dialogInput = this.page.locator('[data-testid="custom-dialog-input"]');
    await dialogInput.waitFor({ state: 'visible', timeout: 5000 });

    // Вводим название
    await dialogInput.fill(title);

    // Подтверждаем
    await this.page.locator('[data-testid="custom-dialog-ok-btn"]').click();

    // Ждём создания
    await this.page.waitForTimeout(500);

    // Получаем ID созданного блока (последний выделенный)
    const selectedBlock = this.page.locator('.block-selected, .block-active').first();
    const blockId = await selectedBlock.getAttribute('block-id') || '';

    // Добавляем контент если указан
    if (options.content) {
      await this.page.keyboard.press('w');
      const textarea = this.page.locator('[data-testid="note-editor-textarea"]');
      await textarea.waitFor({ state: 'visible', timeout: 5000 });
      await textarea.fill(options.content);
      await this.page.keyboard.press('Enter');
      await this.page.waitForTimeout(300);
    }

    return { id: blockId, title, content: options.content };
  }

  /**
   * Создать несколько блоков
   */
  async createBlocks(count: number, prefix: string = 'Block'): Promise<CreatedBlock[]> {
    const blocks: CreatedBlock[] = [];

    for (let i = 1; i <= count; i++) {
      const block = await this.createBlock({ title: `${prefix}_${i}_${uniqueId()}` });
      blocks.push(block);
    }

    return blocks;
  }

  /**
   * Создать вложенную структуру блоков
   */
  async createNestedBlocks(depth: number = 3): Promise<CreatedBlock[]> {
    const blocks: CreatedBlock[] = [];

    for (let i = 1; i <= depth; i++) {
      const block = await this.createBlock({ title: `Level_${i}_${uniqueId()}` });
      blocks.push(block);

      // Открываем блок для создания дочернего
      if (i < depth) {
        await this.page.keyboard.press('Enter');
        await this.page.waitForTimeout(500);
      }
    }

    return blocks;
  }
}

/**
 * Фабрика для создания тестовых деревьев
 */
export class TreeFactory {
  constructor(private page: Page) {}

  /**
   * Создать новое дерево
   */
  async createTree(name?: string): Promise<string> {
    const treeName = name || uniqueTreeName();

    // Нажимаем кнопку добавления дерева
    const addButton = this.page.locator('[data-testid="tree-add-button"]');
    await addButton.click();

    // Ждём диалога
    const dialogInput = this.page.locator('[data-testid="custom-dialog-input"]');
    await dialogInput.waitFor({ state: 'visible', timeout: 5000 });
    await dialogInput.fill(treeName);
    await this.page.locator('[data-testid="custom-dialog-ok-btn"]').click();

    // Ждём создания
    await this.page.waitForTimeout(1000);

    return treeName;
  }

  /**
   * Переключиться на дерево по индексу (1-9)
   */
  async switchToTreeByIndex(index: number): Promise<void> {
    await this.page.keyboard.down(' ');
    await this.page.keyboard.press(`${index}`);
    await this.page.keyboard.up(' ');
    await this.page.waitForTimeout(500);
  }
}

// ==================== Wait Helpers ====================

/**
 * Ожидание завершения сетевых запросов
 */
export async function waitForApiIdle(page: Page, timeout: number = 5000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Ожидание события ShowedBlocks
 */
export async function waitForShowedBlocks(page: Page, timeout = 15000): Promise<void> {
  await page.waitForFunction(
    () => {
      return new Promise<boolean>((resolve) => {
        const blocks = document.querySelectorAll('[block]');
        if (blocks.length > 0) {
          resolve(true);
          return;
        }

        const root = document.getElementById('rootContainer');
        if (root && root.children.length > 0) {
          resolve(true);
          return;
        }

        const handler = () => {
          window.removeEventListener('ShowedBlocks', handler);
          resolve(true);
        };
        window.addEventListener('ShowedBlocks', handler);

        setTimeout(() => {
          window.removeEventListener('ShowedBlocks', handler);
          resolve(true);
        }, 10000);
      });
    },
    { timeout }
  );
}

/**
 * Ожидание появления диалога
 */
export async function waitForDialog(page: Page, timeout = 5000): Promise<void> {
  await page.waitForSelector(
    '[data-testid="custom-dialog-input"], .custom-modal-input',
    { state: 'visible', timeout }
  );
}

/**
 * Ожидание минимального количества блоков
 */
export async function waitForBlocksCount(page: Page, minCount: number, timeout = 10000): Promise<void> {
  await page.waitForFunction(
    (min) => {
      const blocks = document.querySelectorAll('[block]');
      return blocks.length >= min;
    },
    minCount,
    { timeout }
  );
}

/**
 * Ожидание исчезновения блока
 */
export async function waitForBlockRemoved(page: Page, blockTitle: string, timeout = 5000): Promise<void> {
  await page.waitForFunction(
    (title) => {
      const blocks = document.querySelectorAll('[block] titleBlock');
      for (const block of blocks) {
        if (block.textContent?.includes(title)) return false;
      }
      return true;
    },
    blockTitle,
    { timeout }
  );
}

// ==================== Fixture Extensions ====================

type TestDataFixtures = {
  blockFactory: BlockFactory;
  treeFactory: TreeFactory;
};

/**
 * Fixture с фабриками тестовых данных
 */
export const testWithFactories = base.extend<TestDataFixtures>({
  blockFactory: async ({ page, authenticatedPage }, use) => {
    const factory = new BlockFactory(page, authenticatedPage);
    await use(factory);
  },

  treeFactory: async ({ page }, use) => {
    const factory = new TreeFactory(page);
    await use(factory);
  },
});

export { expect };

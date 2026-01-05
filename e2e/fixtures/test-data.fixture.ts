import { Page } from '@playwright/test';

/**
 * Тестовые данные для E2E тестов
 *
 * ВАЖНО: Моки отключены! Все тесты работают с реальным бэкендом.
 * Тестовые данные создаются скриптом create_initial_data.py на бэкенде.
 */

export const TEST_BLOCKS = {
  simple: {
    title: 'Test Block',
    content: 'This is test content',
  },
  withMarkdown: {
    title: 'Markdown Block',
    content: '# Header\n\n**Bold text** and *italic*',
  },
  withUrl: {
    title: 'https://example.com',
  },
};

export const TEST_TREE = {
  name: 'Test Tree',
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
 * Заглушка для обратной совместимости.
 * Моки больше не используются - все тесты работают с реальным API.
 *
 * @deprecated Не используется, оставлена для совместимости со старыми тестами
 */
export async function setupApiMocks(_page: Page) {
  // Моки отключены - работаем с реальным бэкендом
  return;
}

/**
 * Заглушка для обратной совместимости
 * @deprecated Не используется
 */
export async function clearApiMocks(_page: Page) {
  // Моки отключены
  return;
}

/**
 * Генератор уникальных названий для тестов
 * Использует timestamp + random для гарантии уникальности
 */
export function uniqueBlockTitle(prefix: string = 'Test'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Ожидание завершения сетевых запросов
 */
export async function waitForApiIdle(page: Page, timeout: number = 5000) {
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Ожидание события ShowedBlocks (блоки отрендерены)
 */
export async function waitForShowedBlocks(page: Page, timeout = 15000): Promise<void> {
  await page.waitForFunction(
    () => {
      return new Promise<boolean>((resolve) => {
        // Если блоки уже есть на странице
        const blocks = document.querySelectorAll('[block]');
        if (blocks.length > 0) {
          resolve(true);
          return;
        }

        // Проверяем rootContainer
        const root = document.getElementById('rootContainer');
        if (root && root.children.length > 0) {
          resolve(true);
          return;
        }

        // Ждём события ShowedBlocks
        const handler = () => {
          window.removeEventListener('ShowedBlocks', handler);
          resolve(true);
        };
        window.addEventListener('ShowedBlocks', handler);

        // Fallback
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

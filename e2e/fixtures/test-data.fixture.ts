import { Page } from '@playwright/test';

/**
 * Тестовые данные для E2E тестов
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
 * Мок API ответов для изолированных тестов
 */
export async function setupApiMocks(page: Page) {
  // Мок для получения деревьев
  await page.route('**/api/v1/trees/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'mock-tree-id',
        title: 'Mock Tree',
        children: [
          {
            id: 'mock-block-1',
            title: 'Mock Block 1',
            content: '',
            children: [],
          },
          {
            id: 'mock-block-2',
            title: 'Mock Block 2',
            content: 'Some content',
            children: [],
          },
        ],
      }),
    });
  });

  // Мок для получения блоков
  await page.route('**/api/v1/blocks/**', async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-block-id',
          title: 'Mock Block',
          content: '',
          children: [],
        }),
      });
    } else if (method === 'POST') {
      // Создание блока
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: `new-block-${Date.now()}`,
          title: body?.title || 'New Block',
          content: body?.content || '',
          children: [],
        }),
      });
    } else if (method === 'PATCH' || method === 'PUT') {
      // Обновление блока
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    } else if (method === 'DELETE') {
      // Удаление блока
      await route.fulfill({
        status: 204,
      });
    } else {
      await route.continue();
    }
  });

  // Мок для авторизации
  await page.route('**/api/v1/auth/**', async (route) => {
    const url = route.request().url();

    if (url.includes('login')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access: 'mock_access_token',
          refresh: 'mock_refresh_token',
        }),
      });
    } else if (url.includes('refresh')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access: 'new_mock_access_token',
        }),
      });
    } else if (url.includes('user') || url.includes('me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-user-id',
          username: 'test_user',
          email: 'test@example.com',
        }),
      });
    } else {
      await route.continue();
    }
  });

  // Мок для WebSocket (заглушка)
  // WebSocket моки настраиваются отдельно при необходимости
}

/**
 * Очистить все моки
 */
export async function clearApiMocks(page: Page) {
  await page.unrouteAll();
}

/**
 * Генератор уникальных названий для тестов
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

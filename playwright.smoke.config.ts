import { defineConfig, devices } from '@playwright/test';

/**
 * Конфигурация для smoke тестов на dev среде (omnimap.cloud.ru)
 *
 * Запуск:
 *   PLAYWRIGHT_BASE_URL=http://omnimap.cloud.ru npx playwright test --config=playwright.smoke.config.ts
 *   PLAYWRIGHT_BASE_URL=http://omnimap.cloud.ru npx playwright test --config=playwright.smoke.config.ts --headed
 *   PLAYWRIGHT_BASE_URL=http://omnimap.cloud.ru npx playwright test --config=playwright.smoke.config.ts --ui
 */

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

// Путь к auth state для dev среды (отдельный от основного)
const authFile = 'e2e/.auth/user.dev.json';

// Тестовый пользователь для dev среды
// ВАЖНО: Создайте этого пользователя на omnimap.cloud.ru перед запуском тестов
const TEST_USER = {
  username: process.env.E2E_DEV_USERNAME || 'e2e_test_dev',
  password: process.env.E2E_DEV_PASSWORD || 'TestPassword123!',
};

export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './e2e/test-results',
  fullyParallel: false,     // Последовательный запуск для стабильности на dev
  retries: 0,               // Без retry для dev тестирования
  workers: 1,               // Один воркер для избежания race conditions

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,     // Увеличено для удалённого сервера
    navigationTimeout: 30000, // Увеличено для удалённого сервера
  },

  timeout: 90000,           // 90 секунд на тест
  expect: {
    timeout: 10000,         // 10 секунд на assertion
  },

  reporter: [
    ['html', {
      outputFolder: './e2e/playwright-report',
      open: 'on-failure'
    }],
    ['list'],
  ],

  projects: [
    // Setup проект для проверки cookies
    {
      name: 'setup-dev',
      testMatch: /auth\.setup\.dev\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },

    // Smoke тесты на dev среде
    // Используют smoke.dev.spec.ts с beforeEach auth (без storageState)
    {
      name: 'smoke-chromium',
      testMatch: /smoke\/smoke\.dev\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});

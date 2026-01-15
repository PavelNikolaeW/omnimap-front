import { defineConfig, devices } from '@playwright/test';

/**
 * Временный конфиг для onboarding тестов
 * Не требует авторизации и setup проекта
 */

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './e2e/test-results',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', {
      outputFolder: './e2e/playwright-report',
      open: 'never'
    }],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  timeout: 90000,
  expect: {
    timeout: 10000,
  },

  projects: [
    {
      name: 'onboarding-chromium',
      testMatch: /onboarding\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        // Без storageState - тесты регистрируют новых пользователей
      },
    },
  ],
});

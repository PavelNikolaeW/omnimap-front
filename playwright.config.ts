import { defineConfig, devices } from '@playwright/test';

/**
 * Конфигурация Playwright для E2E тестирования OmniMap
 *
 * Запуск:
 *   npm run test:e2e          - все тесты
 *   npm run test:e2e:ui       - интерактивный режим
 *   npm run test:e2e:debug    - режим отладки
 *   npm run test:e2e:headed   - с отображением браузера
 */
export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './e2e/test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: './e2e/playwright-report', open: 'never' }],
    ['list']
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Увеличенные таймауты для стабильности
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  // Глобальный таймаут на тест
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run start_local',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});

import { defineConfig, devices } from '@playwright/test';

/**
 * Конфигурация Playwright для E2E тестирования OmniMap
 *
 * Запуск:
 *   npm run test:e2e          - все тесты
 *   npm run test:e2e:ui       - интерактивный режим
 *   npm run test:e2e:debug    - режим отладки
 *   npm run test:e2e:headed   - с отображением браузера
 *   npm run test:e2e:smoke    - только smoke тесты
 *
 * Проекты:
 *   - setup: выполняет авторизацию и сохраняет storageState
 *   - smoke: быстрые критичные тесты (зависят от setup)
 *   - chromium/firefox/webkit: основные тесты (зависят от smoke)
 *
 * В CI режиме:
 *   - Используется PLAYWRIGHT_BASE_URL из окружения
 *   - 4 параллельных shards для ускорения
 *   - Shared storageState между shards
 */

// В CI используем переменную окружения, локально - localhost:3000
const baseURL = process.env.PLAYWRIGHT_BASE_URL
  || (process.env.CI ? 'http://localhost:9003' : 'http://localhost:3000');

// Путь к сохранённой сессии
const authFile = 'e2e/.auth/user.json';

export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './e2e/test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html', { outputFolder: './e2e/playwright-report', open: 'never' }],
    ['list'],
    // В CI добавляем blob reporter для merge между shards
    ...(process.env.CI ? [['blob', { outputDir: './e2e/blob-report' }] as const] : []),
  ],
  use: {
    baseURL,
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
    // =====================================================
    // Setup проект - выполняет авторизацию один раз
    // =====================================================
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
      testDir: './e2e',
    },

    // =====================================================
    // Smoke тесты - быстрая проверка критичного функционала
    // Выполняются первыми, после setup
    // =====================================================
    {
      name: 'smoke',
      testMatch: /smoke\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile,
      },
    },

    // =====================================================
    // Основные тесты - выполняются после smoke
    // =====================================================
    {
      name: 'chromium',
      testMatch: /^(?!.*smoke\/).*\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile,
      },
    },
    {
      name: 'firefox',
      testMatch: /^(?!.*smoke\/).*\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Firefox'],
        storageState: authFile,
      },
    },
    {
      name: 'webkit',
      testMatch: /^(?!.*smoke\/).*\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Safari'],
        storageState: authFile,
      },
    },
  ],

  // В CI режиме webServer не нужен - используем docker-compose или K8s
  ...(process.env.CI ? {} : {
    webServer: {
      command: 'npm run start_local',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120 * 1000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  }),
});

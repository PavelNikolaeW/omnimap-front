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
 *   - chromium/firefox/webkit: основные тесты (зависят от setup)
 *
 * Режимы работы:
 *   - Локально: http://localhost:3000
 *   - CI (port-forward): http://localhost:9003
 *   - K8s Job: PLAYWRIGHT_BASE_URL=http://frontend-service:80
 *
 * Оптимизации:
 *   - storageState: auth выполняется один раз в setup проекте, затем переиспользуется
 *   - workers: количество параллельных воркеров (по умолчанию 2 в CI)
 *   - retries=1 в CI: уменьшено с 2 для экономии времени
 */

// PLAYWRIGHT_BASE_URL для запуска в k8s, иначе localhost
const baseURL = process.env.PLAYWRIGHT_BASE_URL
  || (process.env.CI ? 'http://localhost:9003' : 'http://localhost:3000');

// Путь к сохранённому состоянию авторизации
const authFile = 'e2e/.auth/user.json';

export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './e2e/test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html', {
      outputFolder: './e2e/playwright-report',
      open: process.env.CI ? 'never' : 'on-failure'
    }],
    ['list'],
    // В CI добавляем blob reporter для merge между shards
    ...(process.env.CI ? [['blob', { outputDir: './e2e/blob-report' }] as const] : []),
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  timeout: 60000,
  expect: {
    timeout: 10000,
  },

  projects: [
    // Setup проект - выполняет авторизацию и сохраняет storageState
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },

    // Smoke тесты - быстрая проверка критичного функционала
    {
      name: 'smoke',
      testMatch: /smoke\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile,
      },
    },

    // Основные тесты chromium
    {
      name: 'chromium',
      testMatch: /^(?!.*smoke\/).*\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile,
      },
      dependencies: ['setup'],
    },

    // Firefox и Webkit для локального тестирования
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

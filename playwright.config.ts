import { defineConfig, devices } from '@playwright/test';

/**
 * Конфигурация Playwright для E2E тестирования OmniMap
 *
 * Запуск:
 *   npm run test:e2e              - все тесты (локально)
 *   npm run test:e2e:cloud        - тесты на omnimap.cloud.ru
 *   npm run test:e2e:ui           - интерактивный режим
 *   npm run test:e2e:debug        - режим отладки
 *   npm run test:e2e:headed       - с отображением браузера
 *   npm run test:e2e:smoke        - только smoke тесты
 *
 * Проекты:
 *   - setup: выполняет авторизацию и сохраняет storageState
 *   - setup-cloud: авторизация для cloud окружения
 *   - smoke: быстрые критичные тесты (зависят от setup)
 *   - chromium/firefox/webkit: основные тесты (зависят от setup)
 *   - cloud: тесты на omnimap.cloud.ru (зависят от setup-cloud)
 *
 * Режимы работы:
 *   - Локально: http://localhost:3000
 *   - CI (port-forward): http://localhost:9003
 *   - Cloud Dev: http://omnimap.cloud.ru
 */

// Определяем окружение
const isCloud = process.env.E2E_ENV === 'cloud' || process.env.PLAYWRIGHT_BASE_URL?.includes('omnimap.cloud.ru');

// PLAYWRIGHT_BASE_URL для запуска в k8s или cloud, иначе localhost
const baseURL = process.env.PLAYWRIGHT_BASE_URL
  || (isCloud ? 'http://omnimap.cloud.ru' : (process.env.CI ? 'http://localhost:9003' : 'http://localhost:3000'));

// Путь к сохранённому состоянию авторизации
const authFile = isCloud ? 'e2e/.auth/cloud-user.json' : 'e2e/.auth/user.json';

export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './e2e/test-results',
  // fullyParallel: false - тесты внутри файла идут последовательно (важен порядок)
  // Но разные файлы запускаются параллельно на разных workers
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // В CI используем workers для параллельного запуска разных файлов
  workers: process.env.CI ? 3 : undefined,
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
    // ==================== Setup проекты ====================

    // Setup проект для локальной разработки
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.PLAYWRIGHT_BASE_URL || (process.env.CI ? 'http://localhost:9003' : 'http://localhost:3000'),
      },
    },

    // Setup проект для cloud окружения (omnimap.cloud.ru)
    {
      name: 'setup-cloud',
      testMatch: /auth\.setup\.dev\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://omnimap.cloud.ru',
      },
    },

    // ==================== Smoke тесты ====================

    // Smoke тесты локально
    {
      name: 'smoke',
      testMatch: /smoke\/smoke\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
    },

    // Smoke тесты на cloud
    {
      name: 'smoke-cloud',
      testMatch: /smoke\/smoke\.dev\.spec\.ts$/,
      dependencies: ['setup-cloud'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://omnimap.cloud.ru',
        storageState: 'e2e/.auth/cloud-user.json',
      },
    },

    // ==================== Основные тесты ====================

    // Основные тесты chromium (локально)
    {
      name: 'chromium',
      testMatch: /^(?!.*smoke\/)(?!.*\.setup\.).*\.spec\.ts$/,
      testIgnore: [/\.dev\.spec\.ts$/, /verify-.*\.spec\.ts$/],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // Cloud тесты (omnimap.cloud.ru)
    {
      name: 'cloud',
      testMatch: /\.dev\.spec\.ts$/,
      testIgnore: /smoke\/.*\.spec\.ts$/,
      dependencies: ['setup-cloud'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://omnimap.cloud.ru',
        storageState: 'e2e/.auth/cloud-user.json',
      },
    },

    // Firefox и Webkit для локального тестирования
    {
      name: 'firefox',
      testMatch: /^(?!.*smoke\/)(?!.*\.setup\.)(?!.*\.dev\.).*\.spec\.ts$/,
      testIgnore: /verify-.*\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'e2e/.auth/user.json',
      },
    },
    {
      name: 'webkit',
      testMatch: /^(?!.*smoke\/)(?!.*\.setup\.)(?!.*\.dev\.).*\.spec\.ts$/,
      testIgnore: /verify-.*\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Safari'],
        storageState: 'e2e/.auth/user.json',
      },
    },
  ],

  // В CI режиме webServer не нужен - используем docker-compose или K8s
  ...(process.env.CI || isCloud ? {} : {
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

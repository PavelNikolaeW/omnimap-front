import { defineConfig, devices } from '@playwright/test';

/**
 * Verify tests config — runs only verify-*.spec.ts files
 */
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: /verify-.*\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 120000,
  expect: {
    timeout: 30000,
  },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'verify-setup',
      testMatch: /auth\.setup\.ts$/,
      testDir: './e2e/tests',
    },
    {
      name: 'verify',
      testMatch: /verify-.*\.spec\.ts$/,
      dependencies: ['verify-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
    },
  ],
});

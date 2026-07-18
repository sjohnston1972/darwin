import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const projectFlowDirectory = path.resolve(
  process.env.PROJECTFLOW_E2E_DIR ?? '../projectflow',
);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: [
    {
      command:
        'npx wrangler dev --config workers/api/wrangler.e2e.toml --port 8787 --persist-to .wrangler/e2e',
      url: 'http://localhost:8787/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -w @darwin/web -- --host localhost --port 5173',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command:
        'npm run dev -w @darwin/projectflow-app -- --host localhost --port 5174',
      cwd: projectFlowDirectory,
      url: 'http://localhost:5174/?study=true',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});

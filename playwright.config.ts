import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 8_000,
    toHaveScreenshot: {
      animations: 'disabled',
      // Tolerate sub-pixel font rasterisation across Windows and Linux while
      // still failing on layout, clipping, colour, or component regressions.
      maxDiffPixelRatio: 0.01,
    },
  },
  fullyParallel: false,
  // All browser projects share one hermetic Miniflare/D1 server. Serial project
  // execution keeps reset-based fixtures deterministic.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  snapshotPathTemplate:
    '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    colorScheme: 'dark',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile-390',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 820, height: 1180 },
      },
    },
  ],
  webServer: [
    {
      command: 'tsx e2e/api-server.ts',
      url: 'http://127.0.0.1:8787/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev --workspace @darwin/web -- --host 127.0.0.1',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        VITE_API_BASE_URL: 'http://127.0.0.1:8787',
        VITE_PROJECTFLOW_BASE_URL: 'http://127.0.0.1:5174',
      },
    },
    {
      command: 'npx vite --host 127.0.0.1 --port 5174',
      cwd: '../projectflow/apps/projectflow',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { VITE_API_BASE_URL: 'http://127.0.0.1:8787/api' },
    },
  ],
});

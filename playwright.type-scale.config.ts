import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './apps/web/visual',
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 8_000 },
  snapshotPathTemplate: '{testDir}/screenshots/{arg}-{platform}{ext}',
  outputDir: 'test-results/type-scale',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -w @darwin/web -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

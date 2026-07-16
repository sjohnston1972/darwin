import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './apps/projectflow/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -w @darwin/projectflow-app -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: true,
  },
});

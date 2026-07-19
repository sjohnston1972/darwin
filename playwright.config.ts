import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const projectFlowDirectory = path.resolve(
  process.env.PROJECTFLOW_E2E_DIR ?? '../projectflow',
);
const projectFlowFixtureCommit = '1'.repeat(40);
const darwinFixtureCommit = '0123456789abcdef0123456789abcdef01234567';

process.env.VITE_APP_VERSION ??= projectFlowFixtureCommit.slice(0, 12);
process.env.VITE_COMMIT_SHA ??= projectFlowFixtureCommit;
process.env.VITE_DARWIN_RELEASE = '0.25.0-e2e';
process.env.VITE_DARWIN_COMMIT_SHA = darwinFixtureCommit;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    },
  },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  snapshotPathTemplate:
    '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}-{platform}{ext}',
  use: {
    baseURL: 'http://localhost:5173',
    colorScheme: 'dark',
    locale: 'en-GB',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
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

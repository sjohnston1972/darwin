import { expect, test } from '@playwright/test';

test('compares baseline and evolved automated cohorts honestly', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:8787/api/demo/reset');
  await page.goto('/study?variant=baseline&source=automated');
  await expect(
    page.getByRole('heading', { name: 'Good morning, Alex' }),
  ).toBeVisible();

  await page.getByRole('button', { name: /Projects/ }).click();
  await page.getByRole('button', { name: /Apollo Release/ }).click();
  await page.getByRole('button', { name: /Tasks/ }).click();
  await page.getByRole('button', { name: /Confirm launch checklist/ }).click();
  await expect(page.getByText('task completed')).toBeVisible();
  await expect(page.getByText(/events/)).toBeVisible();
  const completedAttemptCount = async (studyId: string) => {
    const response = await request.get(
      `http://127.0.0.1:8787/api/studies/${studyId}/events?limit=100`,
    );
    const body = (await response.json()) as {
      events: Array<{ eventType: string }>;
    };
    return body.events.filter((event) => event.eventType === 'task_completed')
      .length;
  };
  await expect
    .poll(() => completedAttemptCount('projectflow-baseline-automated-study'), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
  const baselineEvidence = await request.post(
    'http://127.0.0.1:8787/api/studies/projectflow-baseline-automated-study/evidence?source=automated',
  );
  expect(baselineEvidence.ok()).toBeTruthy();

  await page.goto('/study?variant=evolved&source=automated');
  await page.getByRole('button', { name: /My Work/ }).click();
  await page.getByRole('button', { name: /Confirm launch checklist/ }).click();
  await expect(page.getByText('task completed')).toBeVisible();
  await expect
    .poll(() => completedAttemptCount('projectflow-evolved-automated-study'), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
  const evolvedEvidence = await request.post(
    'http://127.0.0.1:8787/api/studies/projectflow-evolved-automated-study/evidence?source=automated',
  );
  expect(evolvedEvidence.ok()).toBeTruthy();

  const comparisonResponse = await request.post(
    'http://127.0.0.1:8787/api/outcomes/automated-comparison',
  );
  expect(comparisonResponse.ok()).toBeTruthy();
  const comparison = (await comparisonResponse.json()) as {
    evidenceClass: string;
    baseline: { appVersion: string };
    evolved: { appVersion: string };
    delta: { interactions: number };
  };
  expect(comparison.evidenceClass).toBe('automated');
  expect(comparison.baseline.appVersion).toBe('1.0.0');
  expect(comparison.evolved.appVersion).toBe('1.1.0');
  expect(comparison.delta.interactions).toBeLessThan(0);
});

test('keeps the workspace and study runner usable on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/study?variant=evolved&source=automated');

  await expect(
    page.getByRole('heading', { name: 'Good morning, Alex' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('button', { name: /Projects/ })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});

test('captures browser Back and increased zoom as semantic evidence', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:8787/api/demo/reset');
  await page.goto('/study?variant=baseline&source=automated');
  await page.getByRole('button', { name: /Projects/ }).click();
  await page.getByRole('button', { name: /Apollo Release/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Apollo Release' }),
  ).toBeVisible();

  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();

  const chrome = await page.context().newCDPSession(page);
  await chrome.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.25 });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));

  const capturedTypes = async () => {
    const response = await request.get(
      'http://127.0.0.1:8787/api/studies/projectflow-baseline-automated-study/events?limit=100',
    );
    const body = (await response.json()) as {
      events: Array<{ eventType: string }>;
    };
    return body.events.map((event) => event.eventType);
  };

  await expect
    .poll(capturedTypes, { timeout: 10_000 })
    .toEqual(
      expect.arrayContaining(['browser_navigation', 'viewport_zoom_changed']),
    );
});

test('uses the full screen for uncapped session evidence', async ({ page }) => {
  await page.goto('/study?variant=baseline&source=automated');
  await page
    .locator('[data-darwin-id="metric-open-tasks"]')
    .evaluate((metric) => {
      for (let click = 0; click < 45; click += 1) {
        metric.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    });

  const eventCount = Number.parseInt(
    (await page.getByLabel('Captured events').textContent()) ?? '0',
    10,
  );
  expect(eventCount).toBeGreaterThan(40);
  await expect(page.locator('.live-event-row')).toHaveCount(eventCount);

  const layout = await page.evaluate(() => {
    const panel = document
      .querySelector('.study-panel')!
      .getBoundingClientRect();
    const monitor = document
      .querySelector('.event-monitor')!
      .getBoundingClientRect();
    return {
      monitorBottom: monitor.bottom,
      monitorHeight: monitor.height,
      panelBottom: panel.bottom,
      panelHeight: panel.height,
      viewportHeight: window.innerHeight,
    };
  });
  expect(layout.panelHeight).toBe(layout.viewportHeight);
  expect(layout.monitorHeight).toBeGreaterThan(layout.viewportHeight / 2);
  expect(layout.panelBottom - layout.monitorBottom).toBeLessThanOrEqual(16);
});

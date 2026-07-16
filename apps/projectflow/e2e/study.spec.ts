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

  const task = page
    .locator('article')
    .filter({ hasText: 'Find your assigned task' });
  await task.getByRole('button', { name: /Start task/ }).click();
  await page.getByRole('button', { name: /Projects/ }).click();
  await page.getByRole('button', { name: /Apollo Release/ }).click();
  await page.getByRole('button', { name: /Tasks/ }).click();
  await page.getByRole('button', { name: /Confirm launch checklist/ }).click();
  await task.getByRole('button', { name: 'Done' }).click();

  await expect(task).toHaveClass(/is-complete/);
  await expect(page.getByText(/events/)).toBeVisible();
  const eventCount = async (studyId: string) => {
    const response = await request.get(
      `http://127.0.0.1:8787/api/studies/${studyId}/events?limit=100`,
    );
    const body = (await response.json()) as { count: number };
    return body.count;
  };
  await expect
    .poll(() => eventCount('projectflow-baseline-automated-study'), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
  const baselineEvidence = await request.post(
    'http://127.0.0.1:8787/api/studies/projectflow-baseline-automated-study/evidence?source=automated',
  );
  expect(baselineEvidence.ok()).toBeTruthy();

  await page.goto('/study?variant=evolved&source=automated');
  const evolvedTask = page
    .locator('article')
    .filter({ hasText: 'Find your assigned task' });
  await evolvedTask.getByRole('button', { name: /Start task/ }).click();
  await page.getByRole('button', { name: /My Work/ }).click();
  await page.getByRole('button', { name: /Confirm launch checklist/ }).click();
  await evolvedTask.getByRole('button', { name: 'Done' }).click();
  await expect(evolvedTask).toHaveClass(/is-complete/);
  await expect
    .poll(() => eventCount('projectflow-evolved-automated-study'), {
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

import { expect, test } from '@playwright/test';

test('completes a verified study task and delivers its telemetry', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:8787/api/demo/reset');
  await page.goto('/study');
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
  await expect
    .poll(
      async () => {
        const response = await request.get(
          'http://127.0.0.1:8787/api/studies/projectflow-baseline-study/events?limit=100',
        );
        const body = (await response.json()) as { count: number };
        return body.count;
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);
});

test('keeps the workspace and study runner usable on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/study');

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

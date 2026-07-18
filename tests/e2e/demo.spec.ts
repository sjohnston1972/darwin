import { expect, test } from '@playwright/test';

import {
  completeMeasuredStudy,
  connectProjectFlow,
  resetDarwin,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ request }) => {
  await resetDarwin(request);
});

test('@smoke connects ProjectFlow and launches the measured study in a new window', async ({
  page,
  request,
}) => {
  await connectProjectFlow(page);
  const projectFlow = await completeMeasuredStudy(page);

  await expect
    .poll(
      async () => {
        const response = await request.get(
          'http://localhost:8787/api/studies/projectflow-baseline-study/events?limit=200',
        );
        const body = (await response.json()) as { count: number };
        return body.count;
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  await projectFlow.close();
});

test('@full completes the controlled evolution, archive, and rollback flow', async ({
  page,
  request,
}) => {
  await connectProjectFlow(page);
  const projectFlow = await completeMeasuredStudy(page);
  await expect
    .poll(
      async () => {
        const response = await request.get(
          'http://localhost:8787/api/studies/projectflow-baseline-study/events?limit=200',
        );
        const body = (await response.json()) as { count: number };
        return body.count;
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  await projectFlow.close();

  await page.goto('/?view=observations');
  const generateEvidence = page.getByRole('button', {
    name: 'Generate evidence',
  });
  await expect(generateEvidence).toBeEnabled();
  await generateEvidence.click();
  await expect(page.getByText(/Evidence pack evidence-/)).toBeVisible();
  await expect(
    page.getByText(/^EV-[a-f0-9]{12}$/).filter({ visible: true }).first(),
  ).toBeVisible();

  await page.goto('/?view=mutations');
  await page.getByRole('button', { name: 'Ask GPT-5.6' }).click();
  await expect(page.getByText('3 suggestions')).toBeVisible();
  await expect(page.getByText('prompt 3.0.0')).toBeVisible();
  await page
    .getByRole('checkbox', { name: 'Implement Direct My Work navigation' })
    .check();
  await page
    .getByRole('checkbox', { name: 'Implement Global task search' })
    .check();
  await page
    .getByRole('button', { name: 'Start controlled evolution' })
    .click();

  await expect(page.getByText(/2 mutations/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Release reviewed mutation' }),
  ).toBeVisible();
  await expect(page.getByText('Preview ready for review')).toBeVisible();
  await expect(page.getByText('4 live checks')).toBeVisible();
  await expect(
    page.getByText('apps/projectflow/src/App.tsx', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Release reviewed mutation' }).click();

  await page.goto('/?view=genome');
  await expect(
    page.getByText('Survived selection', { exact: true }),
  ).toBeVisible();
  await page.locator('.fossil-artifact > summary').click();
  await page
    .getByRole('button', { name: 'Prepare controlled rollback' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Release reviewed rollback' }),
  ).toBeVisible();
  await expect(page.getByText('Rollback preview ready')).toBeVisible();
  await page.getByRole('button', { name: 'Release reviewed rollback' }).click();
  await expect(page.getByText('ProjectFlow returned to')).toBeVisible();
  await expect(page.getByText('REVERTED', { exact: true })).toBeVisible();
});

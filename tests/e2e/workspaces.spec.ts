import { expect, test, type Page } from '@playwright/test';

import { resetDarwin } from './helpers';

const workspaces = [
  { name: 'control-room', route: '/', heading: 'Darwin' },
  {
    name: 'target-application',
    route: '/?view=target',
    heading: 'Connect a target application',
  },
  {
    name: 'observations',
    route: '/?view=observations',
    heading: 'Observations',
  },
  { name: 'darwin-lab', route: '/?view=lab', heading: 'Darwin Labs' },
  { name: 'mutations', route: '/?view=mutations', heading: 'Mutations' },
  { name: 'genome', route: '/?view=genome', heading: 'Genome' },
] as const;

const assertWorkspaceLayout = async (
  page: Page,
  workspace: (typeof workspaces)[number],
  viewportName: string,
) => {
  await page.goto(workspace.route);
  const heading = page.getByRole('heading', {
    level: 1,
    name: workspace.heading,
  });
  await expect(heading).toBeVisible();
  const box = await heading.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  const screenshot = await page.screenshot({ fullPage: true });
  expect(screenshot.byteLength).toBeGreaterThan(10_000);
  await test.info().attach(`${workspace.name}-${viewportName}`, {
    body: screenshot,
    contentType: 'image/png',
  });
};

test.beforeEach(async ({ request }) => {
  await resetDarwin(request);
});

test('asserts every workspace at desktop and 390px', async ({ page }) => {
  for (const workspace of workspaces) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await assertWorkspaceLayout(page, workspace, 'desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await assertWorkspaceLayout(page, workspace, '390px');
  }
});

test('keeps edge tooltips inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/');
  await page.getByRole('button', { name: /Switch to .* theme/ }).focus();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  const box = await tooltip.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(12);
  expect(box!.y).toBeGreaterThanOrEqual(12);
  expect(box!.x + box!.width).toBeLessThanOrEqual(888);
  expect(box!.y + box!.height).toBeLessThanOrEqual(688);
});

test('sends a free-text goal to a Darwin Lab population', async ({ page }) => {
  await page.goto('/?view=lab');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Darwin Labs' }),
  ).toBeVisible();

  const goal = 'Find the task assigned to me and open it';
  await page
    .getByPlaceholder(/Find the task assigned to me/i)
    .fill(goal);
  await page.getByRole('button', { name: /Send agents/ }).click();

  // Create + start happen from one action; the latest-run panel shows the goal.
  await expect(
    page.getByRole('heading', { level: 2, name: goal }),
  ).toBeVisible();
});

test('supports keyboard navigation between workspaces', async ({ page }) => {
  await page.goto('/');
  const controlRoom = page.getByRole('link', {
    name: 'Control room',
    exact: true,
  });
  const targetApplication = page.getByRole('link', {
    name: 'Target application',
  });
  await controlRoom.focus();
  await expect(controlRoom).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(targetApplication).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/view=target/);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Connect a target application',
    }),
  ).toBeVisible();
});

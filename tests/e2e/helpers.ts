import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const resetDarwin = async (request: APIRequestContext) => {
  const response = await request.post('http://localhost:8787/api/demo/reset');
  expect(response.ok()).toBeTruthy();
};

export const connectProjectFlow = async (page: Page) => {
  await page.goto('/?view=target');
  await page
    .getByRole('button', {
      name: /^(Connect ProjectFlow|Re-verify connection)$/,
    })
    .click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.getByText('ProjectFlow repository')).toBeVisible();
};

export const completeMeasuredStudy = async (page: Page) => {
  await page.goto('/');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Open measured study' }).click();
  const projectFlow = await popupPromise;
  await projectFlow.waitForLoadState('domcontentloaded');
  await expect(
    projectFlow.getByRole('heading', { name: 'Session evidence' }),
  ).toBeVisible();
  await projectFlow.getByRole('button', { name: /Projects/ }).click();
  await projectFlow.getByRole('button', { name: /Apollo Release/ }).click();
  await projectFlow.getByRole('button', { name: /Tasks/ }).click();
  await projectFlow
    .getByRole('button', { name: /Confirm launch checklist/ })
    .click();
  await expect(projectFlow.getByText('task completed')).toBeVisible();
  return projectFlow;
};

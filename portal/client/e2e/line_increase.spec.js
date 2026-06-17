import { test, expect } from '@playwright/test';
import { shot } from './_shot.js';

test('line-increase lookup shows eligibility + incremental ROE', async ({ page }) => {
  const r = await page.request.get('http://localhost:8100/api/line-increase/candidates?per_page=1');
  const id = (await r.json()).items[0].business_id;
  await page.goto('/');
  await page.getByTestId('nav-li-lookup').click();
  await page.getByTestId('applicant-input').selectOption({ index: 1 });
  await expect(page.getByTestId('roe-badge').first()).toBeVisible();
  await expect(page.getByTestId('pricing-waterfall')).toBeVisible();
  await shot(page, 'line_increase', '01-lookup-eligibility');
});

test('line-increase candidates renders ranked rows', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-li-candidates').click();
  await expect(page.getByTestId('view-li-candidates')).toBeVisible();
  await expect(page.getByTestId('app-row').first()).toBeVisible();
  await shot(page, 'line_increase', '02-candidates-rows');
});

test('line-increase segments renders a chart', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-li-segments').click();
  await expect(page.getByTestId('li-segments-chart').first()).toBeVisible();
  await shot(page, 'line_increase', '03-segments-chart');
});

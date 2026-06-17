import { test, expect } from '@playwright/test';
import { shot } from './_shot.js';

test('ews lookup shows risk tier + trajectory', async ({ page }) => {
  const r = await page.request.get('http://localhost:8100/api/ews/watchlist?limit=1');
  const id = (await r.json())[0].business_id;
  await page.goto('/');
  await page.getByTestId('nav-ews-lookup').click();
  await page.getByTestId('applicant-input').fill(id);
  await page.getByTestId('applicant-lookup').click();
  await expect(page.getByTestId('risk-tier-badge')).toBeVisible();
  await expect(page.getByTestId('ews-trajectory')).toBeVisible();
  await shot(page, 'ews', '01-lookup-risk-tier');
});

test('ews watchlist renders ranked rows', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-ews-watchlist').click();
  await expect(page.getByTestId('view-ews-watchlist')).toBeVisible();
  await expect(page.getByTestId('app-row').first()).toBeVisible();
  await shot(page, 'ews', '02-watchlist-rows');
});

test('ews segments renders a chart', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-ews-segments').click();
  await expect(page.getByTestId('ews-segments-chart').first()).toBeVisible();
  await shot(page, 'ews', '03-segments-chart');
});

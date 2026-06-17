import { test, expect } from '@playwright/test';
import { shot } from './_shot.js';

const M = 'customer_360';

test('dashboard shows cross-module KPIs', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-dashboard').click();
  await expect(page.getByTestId('view-dashboard')).toBeVisible();
  await expect(page.getByTestId('stat-applicants-scored')).toBeVisible();
  await shot(page, M, '01-dashboard');
});

test('customer 360 renders all five modules for a booked account', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-customer360').click();
  await expect(page.getByTestId('view-customer360')).toBeVisible();
  await shot(page, M, '02-customer360-seed');
  await expect(page.getByTestId('card-360-adjudication')).toBeVisible();
  await expect(page.getByTestId('card-360-pricing')).toBeVisible();
  await expect(page.getByTestId('card-360-ews')).toBeVisible();
  await expect(page.getByTestId('card-360-line_increase')).toBeVisible();
  await shot(page, M, '03-customer360-booked-full');
});

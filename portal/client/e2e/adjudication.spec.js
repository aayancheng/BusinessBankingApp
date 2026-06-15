import { test, expect } from '@playwright/test';

async function firstId(page) {
  const r = await page.request.get('http://localhost:8100/api/adjudication/applications?per_page=1');
  const body = await r.json();
  return body.items[0].business_id;
}

test('lookup shows a decision badge', async ({ page }) => {
  const id = await firstId(page);
  await page.goto('/');
  await page.getByTestId('nav-lookup').click();
  await page.getByTestId('applicant-input').fill(id);
  await page.getByTestId('applicant-lookup').click();
  await expect(page.getByTestId('decision-badge')).toBeVisible();
  await expect(page.getByTestId('decision-badge')).toHaveText(/Approve|Refer|Decline/);
});

test('what-if updates a decision when a slider changes', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-whatif').click();
  await expect(page.getByTestId('decision-badge')).toBeVisible();
  const slider = page.getByTestId('slider-dscr');
  await slider.fill('0.4');           // force unaffordable → Decline
  await expect(page.getByTestId('decision-badge')).toHaveText(/Decline/, { timeout: 5000 });
});

test('segments renders a chart', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-segments').click();
  await expect(page.getByTestId('segments-chart').first()).toBeVisible();
});

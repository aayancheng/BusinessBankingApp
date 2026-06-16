import { test, expect } from '@playwright/test';

async function aBookedId(page) {
  // pricing population is booked-only; find an id that returns 200 from pricing
  const r = await page.request.get('http://localhost:8100/api/adjudication/applications?per_page=50');
  const items = (await r.json()).items;
  for (const it of items) {
    const pr = await page.request.get(`http://localhost:8100/api/pricing/${it.business_id}`);
    if (pr.ok()) return it.business_id;
  }
  throw new Error('no booked id');
}

test('pricing lookup shows ROE pass/fail badge', async ({ page }) => {
  const id = await aBookedId(page);
  await page.goto('/');
  await page.getByTestId('nav-pricing-lookup').click();
  await page.getByTestId('applicant-input').fill(id);
  await page.getByTestId('applicant-lookup').click();
  await expect(page.getByTestId('roe-badge')).toBeVisible();
});

test('pricing what-if: low rate fails the hurdle', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-pricing-whatif').click();
  await expect(page.getByTestId('roe-badge')).toBeVisible();
  await page.getByTestId('slider-rate').fill('0.03');
  await expect(page.getByTestId('roe-badge')).toHaveText(/BELOW HURDLE/, { timeout: 5000 });
});

test('pricing portfolio renders a chart', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-pricing-portfolio').click();
  await expect(page.getByTestId('pricing-portfolio-chart').first()).toBeVisible();
});

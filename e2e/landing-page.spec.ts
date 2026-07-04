import { expect, test } from '@playwright/test';

test.describe('GarageOS PWA smoke', () => {
  test('loads the public landing page on a mobile viewport', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/GarageOS \| Motorcycle Shop Management SaaS/i);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('link', { name: 'GarageOS home' })).toBeVisible();

    await expect(page.getByRole('link', { name: 'Create shop', exact: true })).toBeVisible();
  });
});

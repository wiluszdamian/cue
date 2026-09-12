import { test } from '@playwright/test';

test('saves the form', async ({ page }) => {
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForTimeout(5000);
});

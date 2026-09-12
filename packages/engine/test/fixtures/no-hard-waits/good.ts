import { expect, test } from '@playwright/test';

test('saves the form', async ({ page }) => {
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
});

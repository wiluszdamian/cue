import { test } from '@playwright/test';

test('logs in', { tag: ['@smoke'] }, async ({ page }) => {
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.locator('#password').fill('x');
});

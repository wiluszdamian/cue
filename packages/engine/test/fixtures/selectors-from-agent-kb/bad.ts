import { test } from '@playwright/test';

test('logs in', { tag: ['@smoke'] }, async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('submit-order-btn').click();
  await page.getByRole('button', { name: 'Sign in now' }).click();
});

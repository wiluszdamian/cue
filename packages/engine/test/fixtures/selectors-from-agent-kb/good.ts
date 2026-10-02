import { test, expect } from '@playwright/test';

test('logs in', { tag: ['@smoke'] }, async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill('user@demo.test');
  await page.getByLabel('Password').fill('secret');
  await page.getByTestId('login-submit').click();
  // Not judged: the knowledge base does not store text.
  await expect(page.getByText('Welcome')).toBeVisible();
});

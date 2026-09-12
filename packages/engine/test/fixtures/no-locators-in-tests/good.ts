import { test } from '@playwright/test';

test('logs in', { tag: ['@smoke'] }, async ({ loginPage }) => {
  await loginPage.passwordField.fill('x');
  await loginPage.logInButton.click();
});

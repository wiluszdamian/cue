import { expect, test } from '../fixtures/pom/test-options.js';

test.describe('login', () => {
  test(
    'a valid user reaches the dashboard',
    { tag: ['@smoke'] },
    async ({ loginPage, dashboardPage }) => {
      await loginPage.open();
      await loginPage.logIn('user@demo.test', 'user-pass');

      // The welcome heading arrives after a short delay; the assertion waits for it.
      await expect(dashboardPage.welcomeHeading).toHaveText('Welcome back, Sam');
    },
  );

  test(
    'a wrong password shows an error and stays on the page',
    { tag: ['@smoke'] },
    async ({ loginPage, page }) => {
      await loginPage.open();
      await loginPage.logIn('user@demo.test', 'not-the-password');

      await expect(loginPage.errorMessage).toHaveText('Invalid email or password');
      await expect(page).toHaveURL(/\/login$/);
    },
  );

  test(
    'the forgot-password link leads to the reset page',
    { tag: ['@regression'] },
    async ({ loginPage, page }) => {
      await loginPage.open();
      await loginPage.forgotPasswordLink.click();

      await expect(page).toHaveURL(/\/forgot$/);
    },
  );
});

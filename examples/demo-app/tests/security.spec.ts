import { expect, test } from '../fixtures/pom/test-options.js';

test.describe('security settings', () => {
  test(
    'an admin can change the password',
    { tag: ['@smoke'] },
    async ({ loginPage, securityPage }) => {
      await loginPage.open();
      await loginPage.logIn('admin@demo.test', 'admin-pass');
      await securityPage.open();

      await expect(securityPage.heading).toBeVisible();
      await securityPage.changePassword('admin-pass', 'a-new-password');

      await expect(securityPage.confirmation).toHaveText('Password changed');
    },
  );

  test(
    'a wrong current password is refused',
    { tag: ['@regression'] },
    async ({ loginPage, securityPage }) => {
      await loginPage.open();
      await loginPage.logIn('admin@demo.test', 'admin-pass');
      await securityPage.open();
      await securityPage.changePassword('guess', 'a-new-password');

      await expect(securityPage.confirmation).toBeHidden();
    },
  );

  test(
    'a regular user is forbidden',
    { tag: ['@regression'] },
    async ({ loginPage, securityPage }) => {
      await loginPage.open();
      await loginPage.logIn('user@demo.test', 'user-pass');
      await securityPage.open();

      await expect(securityPage.forbiddenHeading).toBeVisible();
    },
  );
});

import { expect, test } from '../fixtures/pom/test-options.js';

const INVALID_EMAILS = ['plainaddress', 'missing-at.example.com', 'two@@example.com', 'no-domain@'];

test.describe('sign-up validation', () => {
  for (const email of INVALID_EMAILS) {
    test(`rejects "${email}"`, { tag: ['@regression'] }, async ({ signupPage }) => {
      await signupPage.open();
      await signupPage.signUp(email, 'a-long-password');

      await expect(signupPage.emailError).toHaveText('Enter a valid email address');
      await expect(signupPage.confirmation).toBeHidden();
    });
  }

  test('accepts a valid email', { tag: ['@smoke'] }, async ({ signupPage }) => {
    await signupPage.open();
    await signupPage.signUp('new.person@example.com', 'a-long-password');

    await expect(signupPage.confirmation).toHaveText('Account created');
    await expect(signupPage.emailError).toBeHidden();
  });
});

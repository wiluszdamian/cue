export function locate(page: Page) {
  return {
    card: page.getByRole('button', { name: 'Continue' }),
    // An explicit engine prefix is a deliberate, reviewable choice.
    legacy: page.locator('data-testid=checkout-submit'),
    computed: page.locator(selectorFromKb),
  };
}

export async function onLocators(page: Page) {
  // The first argument is a value or a key, not a selector, so the same method
  // names on a locator are untouched.
  await page.getByLabel('Email').fill('ada@example.com');
  await page.getByRole('textbox', { name: 'Email' }).press('Enter');
  await page.getByRole('button', { name: 'Continue' }).click();
}

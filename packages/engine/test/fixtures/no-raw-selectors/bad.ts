export function locate(page: Page) {
  return {
    card: page.locator('div.card > button.primary'),
    legacy: page.locator('//div[@id="root"]//button'),
    waiting: page.waitForSelector('#submit'),
  };
}

export async function legacyApi(page: Page) {
  // The pre-locator API: the selector is the first argument.
  await page.click('#submit');
  await page.fill('#email', 'ada@example.com');
  await page.check('.terms');
  await page.textContent('.flash-message');
  await page.$$eval('.row', (rows) => rows.length);
}

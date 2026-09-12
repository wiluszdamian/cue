export async function open(page: Page) {
  await page.goto('https://staging.internal.acme.com/login');
  await page.request.get('http://api.acme.dev:8080/v1/users');
}

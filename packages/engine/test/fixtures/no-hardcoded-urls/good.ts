export async function open(page: Page) {
  // Spec: https://example.com/docs/auth — reference links are not environments.
  await page.goto('/login');
  await page.request.get('/v1/users');
}
